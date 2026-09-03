import { GameNotFoundError, InvalidGameResultError, MockGame, type Game } from "@mini-game-hub/game-core";
import { eq } from "drizzle-orm";
import { gameSessions } from "@mini-game-hub/database";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { DrizzleGameSessionRepository } from "../repositories/gameSessionRepository";
import { DrizzleGameResultRepository } from "../repositories/gameResultRepository";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import { PlayerService } from "../services/playerService";
import { GameDisabledError, GameSessionService } from "../services/gameSessionService";
import {
  DuplicateResultError,
  GameResultService,
  SessionGameMismatchError,
  SessionNotEligibleError,
} from "../services/gameResultService";
import { SessionNotFoundError } from "../services/gameSessionService";
import { ensureGamesSynced, resetTestData } from "./testDb";
import { kstDateString } from "../utils/kstDate";

/**
 * A second, real, *enabled* game — distinct from both reaction-test and
 * the (disabled) MockGame — so the "wrong game" tests have a game they can
 * actually submit against without tripping the enabled-game check first.
 * It is never used to create an actual session in these tests.
 */
const secondEnabledGame: Game = {
  metadata: {
    id: "second-enabled-game",
    name: "Second Enabled Game",
    description: "Test double used only to prove GameResultService is game-agnostic.",
    icon: "second",
    scoreType: "higher_is_better",
    version: "1.0.0",
    enabled: true,
  },
  createInitialState: () => ({}),
  start: (state) => state,
  handleInput: (state) => state,
  isFinished: () => true,
  computeResult: () => ({
    gameId: "second-enabled-game",
    scoreType: "higher_is_better",
    score: 0,
    completion: { reason: "completed", completedAt: 0 },
    metadata: {},
  }),
};

const gameRegistry = getGameRegistry();

beforeAll(async () => {
  if (!gameRegistry.has("mock-game")) {
    gameRegistry.register(new MockGame()); // used by the "disabled game" test
  }
  if (!gameRegistry.has("second-enabled-game")) {
    gameRegistry.register(secondEnabledGame);
  }
  await ensureGamesSynced();
});
beforeEach(resetTestData);

const db = getDb();
const playerRepository = new DrizzlePlayerRepository(db);
const sessionRepository = new DrizzleGameSessionRepository(db);
const playerService = new PlayerService(playerRepository);
const sessionService = new GameSessionService(sessionRepository, playerRepository, gameRegistry);
const resultService = new GameResultService(db, gameRegistry);

async function createStartedSession() {
  const player = await playerService.createPlayer("Sanghyun");
  const session = await sessionService.createSession(player.id, "reaction-test");
  return { player, session };
}

function validCompletedInput(sessionId: string, score = 237) {
  return {
    sessionId,
    score,
    completion: { reason: "completed" as const, completedAt: 1000 },
    metadata: { reactionTimeMs: score, falseStart: false },
  };
}

function validInvalidInput(sessionId: string) {
  return {
    sessionId,
    score: null,
    completion: { reason: "invalid" as const, completedAt: 1000 },
    metadata: { reactionTimeMs: null, falseStart: true },
  };
}

describe("GameResultService.submitResult: validation", () => {
  it("accepts a valid completed result", async () => {
    const { session } = await createStartedSession();
    const result = await resultService.submitResult("reaction-test", validCompletedInput(session.id));
    expect(result.score).toBe(237);
  });

  it("accepts a valid invalid (false start) result with a null score", async () => {
    const { session } = await createStartedSession();
    const result = await resultService.submitResult("reaction-test", validInvalidInput(session.id));
    expect(result.score).toBeNull();
  });

  it("rejects a NaN score", async () => {
    const { session } = await createStartedSession();
    await expect(
      resultService.submitResult("reaction-test", validCompletedInput(session.id, Number.NaN)),
    ).rejects.toThrow(InvalidGameResultError);
  });

  it("rejects an Infinity score", async () => {
    const { session } = await createStartedSession();
    await expect(
      resultService.submitResult(
        "reaction-test",
        validCompletedInput(session.id, Number.POSITIVE_INFINITY),
      ),
    ).rejects.toThrow(InvalidGameResultError);
  });

  it("rejects a negative score", async () => {
    const { session } = await createStartedSession();
    await expect(
      resultService.submitResult("reaction-test", validCompletedInput(session.id, -5)),
    ).rejects.toThrow(InvalidGameResultError);
  });

  it("rejects a completed result with a null score", async () => {
    const { session } = await createStartedSession();
    await expect(
      resultService.submitResult("reaction-test", {
        sessionId: session.id,
        score: null,
        completion: { reason: "completed", completedAt: 1000 },
        metadata: {},
      }),
    ).rejects.toThrow(InvalidGameResultError);
  });

  it("rejects an invalid-reason result carrying a non-null score", async () => {
    const { session } = await createStartedSession();
    await expect(
      resultService.submitResult("reaction-test", {
        sessionId: session.id,
        score: 100,
        completion: { reason: "invalid", completedAt: 1000 },
        metadata: {},
      }),
    ).rejects.toThrow(InvalidGameResultError);
  });

  it("rejects an unregistered game id", async () => {
    const { session } = await createStartedSession();
    await expect(
      resultService.submitResult("does-not-exist", validCompletedInput(session.id)),
    ).rejects.toThrow(GameNotFoundError);
  });

  it("rejects a submission for a disabled game", async () => {
    // mock-game is registered but disabled (mockGameMetadata.enabled === false).
    // A session couldn't be created for it today via GameSessionService (it
    // also checks enabled), but an existing session created before a game
    // was disabled must still be rejected at submission time — insert one
    // directly, bypassing that check, to simulate exactly that case.
    const player = await playerService.createPlayer("Alex");
    const session = await sessionRepository.create({ playerId: player.id, gameId: "mock-game" });

    await expect(
      resultService.submitResult("mock-game", {
        sessionId: session.id,
        score: 1,
        completion: { reason: "completed", completedAt: 1 },
        metadata: {},
      }),
    ).rejects.toThrow(GameDisabledError);
  });
});

describe("GameResultService.submitResult: persistence", () => {
  it("saves the result with playerId/gameId derived from the session, and persists metadata/timestamps", async () => {
    const { player, session } = await createStartedSession();
    const before = new Date();

    const result = await resultService.submitResult("reaction-test", validCompletedInput(session.id, 184));

    expect(result.sessionId).toBe(session.id);
    expect(result.playerId).toBe(player.id); // derived from session, not request body
    expect(result.gameId).toBe("reaction-test"); // derived from session, not request body
    expect(result.score).toBe(184);
    expect(result.metadata).toEqual({ reactionTimeMs: 184, falseStart: false });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());

    const resultRepository = new DrizzleGameResultRepository(db);
    const stored = await resultRepository.findBySessionId(session.id);
    expect(stored).toEqual(result);
  });

  it("persists a non-integer score exactly (performance.now() deltas are sub-millisecond floats)", async () => {
    const { session } = await createStartedSession();
    const result = await resultService.submitResult(
      "reaction-test",
      validCompletedInput(session.id, 376.09999999403954),
    );
    expect(result.score).toBe(376.09999999403954);

    const resultRepository = new DrizzleGameResultRepository(db);
    const stored = await resultRepository.findBySessionId(session.id);
    expect(stored?.score).toBe(376.09999999403954);
  });
});

describe("GameResultService.submitResult: session integrity", () => {
  it("completes the session on a successful completed submission", async () => {
    const { session } = await createStartedSession();
    await resultService.submitResult("reaction-test", validCompletedInput(session.id));

    const updated = await sessionService.getSession(session.id);
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it("invalidates the session on a false-start submission", async () => {
    const { session } = await createStartedSession();
    await resultService.submitResult("reaction-test", validInvalidInput(session.id));

    const updated = await sessionService.getSession(session.id);
    expect(updated.status).toBe("invalid");
  });

  it("rejects a duplicate submission for the same session", async () => {
    const { session } = await createStartedSession();
    await resultService.submitResult("reaction-test", validCompletedInput(session.id));

    await expect(
      resultService.submitResult("reaction-test", validCompletedInput(session.id)),
    ).rejects.toThrow(SessionNotEligibleError);
  });

  it("rejects a submission for a session that is already terminal (abandoned)", async () => {
    const { session } = await createStartedSession();
    await sessionService.abandonSession(session.id);

    await expect(
      resultService.submitResult("reaction-test", validCompletedInput(session.id)),
    ).rejects.toThrow(SessionNotEligibleError);
  });

  it("rejects a submission for a nonexistent session", async () => {
    await expect(
      resultService.submitResult("reaction-test", validCompletedInput("00000000-0000-0000-0000-000000000000")),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it("rejects a submission where the session belongs to a different game", async () => {
    const { session } = await createStartedSession(); // session.gameId === "reaction-test"
    await expect(
      resultService.submitResult("second-enabled-game", { ...validCompletedInput(session.id), score: 1 }),
    ).rejects.toThrow(SessionGameMismatchError);
  });
});

describe("GameResultService.submitResult: transaction integrity", () => {
  it("rolls back the session transition when the result insert fails (duplicate)", async () => {
    const { session } = await createStartedSession();

    // Pre-insert a competing result row directly, bypassing the service,
    // so the service's own insert hits the real unique constraint.
    const resultRepository = new DrizzleGameResultRepository(db);
    await resultRepository.create({
      sessionId: session.id,
      playerId: session.playerId,
      gameId: session.gameId,
      score: 1,
      metadata: {},
    });

    // The session is still "started" at this point (we bypassed the service).
    await expect(
      resultService.submitResult("reaction-test", validCompletedInput(session.id, 999)),
    ).rejects.toThrow(DuplicateResultError);

    // The session must remain untouched — the transition never committed.
    const [row] = await db.select().from(gameSessions).where(eq(gameSessions.id, session.id));
    expect(row.status).toBe("started");
    expect(row.completedAt).toBeNull();

    // Only the pre-inserted row exists — the service's own insert did not land.
    const stored = await resultRepository.findBySessionId(session.id);
    expect(stored?.score).toBe(1);
  });

  it("rolls back the result insert when the session transition fails", async () => {
    const { session } = await createStartedSession();

    class FailingSessionRepository extends DrizzleGameSessionRepository {
      async updateStatus(): Promise<never> {
        throw new Error("simulated transition failure");
      }
    }

    const failingResultService = new GameResultService(
      db,
      gameRegistry,
      (executor) => new FailingSessionRepository(executor),
    );

    await expect(
      failingResultService.submitResult("reaction-test", validCompletedInput(session.id)),
    ).rejects.toThrow("simulated transition failure");

    // No result row should have been committed — the whole transaction rolled back.
    const resultRepository = new DrizzleGameResultRepository(db);
    const stored = await resultRepository.findBySessionId(session.id);
    expect(stored).toBeNull();

    // The session must still be "started".
    const reloaded = await sessionService.getSession(session.id);
    expect(reloaded.status).toBe("started");
  });
});

describe("GameResultService.submitResult: rankingDate (daily ranking reset, KST)", () => {
  it("stores null rankingDate for an all-time game (reaction-test)", async () => {
    const { session } = await createStartedSession();
    const result = await resultService.submitResult("reaction-test", validCompletedInput(session.id));
    expect(result.rankingDate).toBeNull();
  });

  it("stores today's Asia/Seoul (KST) date for a daily rankingPeriod game (swipe-brick-breaker)", async () => {
    // 2026-06-15T06:00:00Z == 2026-06-15 15:00:00 KST.
    const fixedNow = new Date("2026-06-15T06:00:00.000Z");
    const dailyResultService = new GameResultService(
      db,
      gameRegistry,
      undefined,
      undefined,
      () => fixedNow,
    );

    const player = await playerService.createPlayer("KstPlayer");
    const session = await sessionService.createSession(player.id, "swipe-brick-breaker");
    const result = await dailyResultService.submitResult("swipe-brick-breaker", {
      sessionId: session.id,
      score: 5,
      completion: { reason: "completed", completedAt: 1000 },
      metadata: { level: 5, bricksDestroyed: 3, redBonusBallsCollected: 0 },
    });

    expect(result.rankingDate).toBe(kstDateString(fixedNow));
    expect(result.rankingDate).toBe("2026-06-15");
  });

  it("00:00 KST -> new date: a submission just after vs just before the KST boundary gets a different rankingDate", async () => {
    // 2026-06-15T14:59:59Z == 2026-06-15 23:59:59 KST (still the 15th).
    const justBeforeMidnightKst = new Date("2026-06-15T14:59:59.000Z");
    // 2026-06-15T15:00:00Z == 2026-06-16 00:00:00 KST (the 16th begins).
    const justAfterMidnightKst = new Date("2026-06-15T15:00:00.000Z");

    const beforeService = new GameResultService(db, gameRegistry, undefined, undefined, () => justBeforeMidnightKst);
    const afterService = new GameResultService(db, gameRegistry, undefined, undefined, () => justAfterMidnightKst);

    const player = await playerService.createPlayer("BoundaryPlayer");
    const sessionBefore = await sessionService.createSession(player.id, "swipe-brick-breaker");
    const sessionAfter = await sessionService.createSession(player.id, "swipe-brick-breaker");

    const resultBefore = await beforeService.submitResult("swipe-brick-breaker", {
      sessionId: sessionBefore.id,
      score: 1,
      completion: { reason: "completed", completedAt: 1000 },
      metadata: { level: 1, bricksDestroyed: 0, redBonusBallsCollected: 0 },
    });
    const resultAfter = await afterService.submitResult("swipe-brick-breaker", {
      sessionId: sessionAfter.id,
      score: 2,
      completion: { reason: "completed", completedAt: 2000 },
      metadata: { level: 2, bricksDestroyed: 0, redBonusBallsCollected: 0 },
    });

    expect(resultBefore.rankingDate).toBe("2026-06-15");
    expect(resultAfter.rankingDate).toBe("2026-06-16");
  });
});
