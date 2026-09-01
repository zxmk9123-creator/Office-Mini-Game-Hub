import { GameNotFoundError, InvalidGameResultError, MockGame } from "@mini-game-hub/game-core";
import { eq } from "drizzle-orm";
import { gameSessions } from "@mini-game-hub/database";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { DrizzleGameSessionRepository } from "../repositories/gameSessionRepository";
import { DrizzleGameResultRepository } from "../repositories/gameResultRepository";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import { PlayerService } from "../services/playerService";
import { GameSessionService } from "../services/gameSessionService";
import {
  DuplicateResultError,
  GameResultService,
  SessionGameMismatchError,
  SessionNotEligibleError,
} from "../services/gameResultService";
import { SessionNotFoundError } from "../services/gameSessionService";
import { ensureGamesSynced, resetTestData } from "./testDb";

const gameRegistry = getGameRegistry();

beforeAll(async () => {
  // A second, distinct game — only registered so the "wrong game" test has
  // a real registered game other than reaction-test to submit against. It
  // is never used to create an actual session in these tests.
  if (!gameRegistry.has("mock-game")) {
    gameRegistry.register(new MockGame());
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
      resultService.submitResult("mock-game", { ...validCompletedInput(session.id), score: 1 }),
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
