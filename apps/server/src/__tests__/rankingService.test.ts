import type { Game } from "@mini-game-hub/game-core";
import { GameNotFoundError } from "@mini-game-hub/game-core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { DrizzleGameSessionRepository } from "../repositories/gameSessionRepository";
import { DrizzleGameResultRepository } from "../repositories/gameResultRepository";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import { DrizzleRankingRepository } from "../repositories/rankingRepository";
import { PlayerService } from "../services/playerService";
import { GameDisabledError } from "../services/gameSessionService";
import { RankingService } from "../services/rankingService";
import { ensureGamesSynced, resetTestData } from "./testDb";

/** A second, real, *enabled* higher_is_better game — proves RankingService
 * needs no per-game changes to rank a future game correctly. */
const higherIsBetterGame: Game = {
  metadata: {
    id: "extension-test-game",
    name: "Extension Test Game",
    description: "Test double proving RankingService is game-agnostic.",
    icon: "ext",
    scoreType: "higher_is_better",
    version: "1.0.0",
    enabled: true,
  },
  createInitialState: () => ({}),
  start: (state) => state,
  handleInput: (state) => state,
  isFinished: () => true,
  computeResult: () => ({
    gameId: "extension-test-game",
    scoreType: "higher_is_better",
    score: 0,
    completion: { reason: "completed", completedAt: 0 },
    metadata: {},
  }),
};

const disabledGame: Game = {
  metadata: {
    id: "disabled-ranking-game",
    name: "Disabled Ranking Game",
    description: "Test double for the disabled-game ranking check.",
    icon: "disabled",
    scoreType: "lower_is_better",
    version: "1.0.0",
    enabled: false,
  },
  createInitialState: () => ({}),
  start: (state) => state,
  handleInput: (state) => state,
  isFinished: () => true,
  computeResult: () => ({
    gameId: "disabled-ranking-game",
    scoreType: "lower_is_better",
    score: 0,
    completion: { reason: "completed", completedAt: 0 },
    metadata: {},
  }),
};

const gameRegistry = getGameRegistry();

beforeAll(async () => {
  if (!gameRegistry.has("extension-test-game")) {
    gameRegistry.register(higherIsBetterGame);
  }
  if (!gameRegistry.has("disabled-ranking-game")) {
    gameRegistry.register(disabledGame);
  }
  await ensureGamesSynced();
});
beforeEach(resetTestData);

const db = getDb();
const playerRepository = new DrizzlePlayerRepository(db);
const sessionRepository = new DrizzleGameSessionRepository(db);
const resultRepository = new DrizzleGameResultRepository(db);
const rankingRepository = new DrizzleRankingRepository(db);
const playerService = new PlayerService(playerRepository);
const rankingService = new RankingService(rankingRepository, gameRegistry);

/**
 * Inserts a session + (optionally) a result directly via repositories,
 * bypassing GameSessionService/GameResultService, so tests can control
 * exact status/score/completedAt combinations — including ones the real
 * services would never produce (e.g. a "completed" session with no result
 * row) — to prove the ranking query derives eligibility from persisted
 * relational state rather than trusting any single flag.
 */
async function seedResult(options: {
  playerId: string;
  gameId: string;
  status: "started" | "completed" | "invalid" | "abandoned";
  score: number | null;
  completedAt: Date;
  createResultRow?: boolean;
}) {
  const session = await sessionRepository.create({ playerId: options.playerId, gameId: options.gameId });
  await sessionRepository.updateStatus(session.id, options.status as Exclude<typeof options.status, "started">, options.completedAt);
  if (options.createResultRow !== false) {
    await resultRepository.create({
      sessionId: session.id,
      playerId: options.playerId,
      gameId: options.gameId,
      score: options.score,
      metadata: {},
    });
  }
  return session;
}

async function player(nickname: string) {
  return playerService.createPlayer(nickname);
}

describe("RankingService.getRanking: score ordering", () => {
  it("orders lower_is_better ascending", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 300, completedAt: new Date() });
    await seedResult({ playerId: b.id, gameId: "reaction-test", status: "completed", score: 200, completedAt: new Date() });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });

    expect(result.entries.map((e) => e.nickname)).toEqual(["Bob", "Alice"]);
    expect(result.entries.map((e) => e.score)).toEqual([200, 300]);
  });

  it("orders higher_is_better descending", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({ playerId: a.id, gameId: "extension-test-game", status: "completed", score: 50, completedAt: new Date() });
    await seedResult({ playerId: b.id, gameId: "extension-test-game", status: "completed", score: 90, completedAt: new Date() });

    const result = await rankingService.getRanking({ gameId: "extension-test-game", limit: 20, offset: 0 });

    expect(result.entries.map((e) => e.nickname)).toEqual(["Bob", "Alice"]);
    expect(result.entries.map((e) => e.score)).toEqual([90, 50]);
  });
});

describe("RankingService.getRanking: best-score-per-player", () => {
  it("keeps only a player's best attempt, appearing at most once", async () => {
    const a = await player("Alice");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 300, completedAt: new Date("2026-01-01T00:00:01Z") });
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 250, completedAt: new Date("2026-01-01T00:00:02Z") });
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 280, completedAt: new Date("2026-01-01T00:00:03Z") });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].score).toBe(250);
  });

  it("matches the spec's worked example: A(300,250) B(270) -> [A 250, B 270], A once", async () => {
    const a = await player("Player A");
    const b = await player("Player B");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 300, completedAt: new Date("2026-01-01T00:00:01Z") });
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 250, completedAt: new Date("2026-01-01T00:00:02Z") });
    await seedResult({ playerId: b.id, gameId: "reaction-test", status: "completed", score: 270, completedAt: new Date("2026-01-01T00:00:03Z") });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ rank: 1, nickname: "Player A", score: 250 });
    expect(result.entries[1]).toMatchObject({ rank: 2, nickname: "Player B", score: 270 });
  });
});

describe("RankingService.getRanking: eligibility exclusion", () => {
  it("excludes invalid (false-start) results", async () => {
    const a = await player("Alice");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "invalid", score: null, completedAt: new Date() });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });

  it("excludes abandoned sessions", async () => {
    const a = await player("Alice");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "abandoned", score: null, completedAt: new Date() });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });

  it("excludes a result with a null score even if a session were (incorrectly) marked completed", async () => {
    const a = await player("Alice");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: null, completedAt: new Date() });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });

  it("excludes a completed session that has no result row at all", async () => {
    const a = await player("Alice");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 200, completedAt: new Date(), createResultRow: false });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });

  it("a player with only an invalid attempt does not block their later valid one", async () => {
    const a = await player("Alice");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "invalid", score: null, completedAt: new Date("2026-01-01T00:00:01Z") });
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 200, completedAt: new Date("2026-01-01T00:00:02Z") });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].score).toBe(200);
  });
});

describe("RankingService.getRanking: tie handling", () => {
  it("uses standard competition ranking (1, 2, 2, 4) for equal scores", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    const c = await player("Carol");
    const d = await player("Dave");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 200, completedAt: new Date("2026-01-01T00:00:01Z") });
    await seedResult({ playerId: b.id, gameId: "reaction-test", status: "completed", score: 250, completedAt: new Date("2026-01-01T00:00:02Z") });
    await seedResult({ playerId: c.id, gameId: "reaction-test", status: "completed", score: 250, completedAt: new Date("2026-01-01T00:00:03Z") });
    await seedResult({ playerId: d.id, gameId: "reaction-test", status: "completed", score: 300, completedAt: new Date("2026-01-01T00:00:04Z") });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });

    expect(result.entries.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
    expect(result.entries.map((e) => e.nickname)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
  });

  it("breaks a tie deterministically by completedAt (earlier first)", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 250, completedAt: new Date("2026-01-01T00:00:05Z") });
    await seedResult({ playerId: b.id, gameId: "reaction-test", status: "completed", score: 250, completedAt: new Date("2026-01-01T00:00:01Z") });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });

    expect(result.entries.map((e) => e.nickname)).toEqual(["Bob", "Alice"]);
    expect(result.entries.map((e) => e.rank)).toEqual([1, 1]);
  });
});

describe("RankingService.getRanking: pagination", () => {
  it("returns an empty leaderboard with total 0 when no results exist", async () => {
    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("paginates with limit/offset and reports the correct total", async () => {
    for (let i = 0; i < 5; i++) {
      const p = await player(`Player${i}`);
      await seedResult({
        playerId: p.id,
        gameId: "reaction-test",
        status: "completed",
        score: 200 + i,
        completedAt: new Date(2026, 0, 1, 0, 0, i),
      });
    }

    const page1 = await rankingService.getRanking({ gameId: "reaction-test", limit: 2, offset: 0 });
    expect(page1.entries.map((e) => e.score)).toEqual([200, 201]);
    expect(page1.pagination.total).toBe(5);

    const page2 = await rankingService.getRanking({ gameId: "reaction-test", limit: 2, offset: 2 });
    expect(page2.entries.map((e) => e.score)).toEqual([202, 203]);

    const page3 = await rankingService.getRanking({ gameId: "reaction-test", limit: 2, offset: 4 });
    expect(page3.entries.map((e) => e.score)).toEqual([204]);
  });
});

describe("RankingService.getRanking: personal rank lookup", () => {
  it("returns the requesting player's rank alongside the page", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({ playerId: a.id, gameId: "reaction-test", status: "completed", score: 300, completedAt: new Date("2026-01-01T00:00:01Z") });
    await seedResult({ playerId: b.id, gameId: "reaction-test", status: "completed", score: 200, completedAt: new Date("2026-01-01T00:00:02Z") });

    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0, playerId: a.id });

    expect(result.playerRank).toMatchObject({ rank: 2, nickname: "Alice", score: 300 });
  });

  it("returns null playerRank for a player with no eligible result", async () => {
    const a = await player("Alice");
    const result = await rankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0, playerId: a.id });
    expect(result.playerRank).toBeNull();
  });
});

describe("RankingService.getRanking: game validation", () => {
  it("throws GameNotFoundError for an unregistered game", async () => {
    await expect(
      rankingService.getRanking({ gameId: "does-not-exist", limit: 20, offset: 0 }),
    ).rejects.toThrow(GameNotFoundError);
  });

  it("throws GameDisabledError for a disabled game", async () => {
    await expect(
      rankingService.getRanking({ gameId: "disabled-ranking-game", limit: 20, offset: 0 }),
    ).rejects.toThrow(GameDisabledError);
  });
});

describe("RankingService.getRanking: future-game extension", () => {
  it("ranks a brand-new higher_is_better game correctly with zero RankingService changes", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({ playerId: a.id, gameId: "extension-test-game", status: "completed", score: 40, completedAt: new Date("2026-01-01T00:00:01Z") });
    await seedResult({ playerId: a.id, gameId: "extension-test-game", status: "completed", score: 95, completedAt: new Date("2026-01-01T00:00:02Z") });
    await seedResult({ playerId: b.id, gameId: "extension-test-game", status: "completed", score: 60, completedAt: new Date("2026-01-01T00:00:03Z") });

    const result = await rankingService.getRanking({ gameId: "extension-test-game", limit: 20, offset: 0 });

    expect(result.game.scoreType).toBe("higher_is_better");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ rank: 1, nickname: "Alice", score: 95 });
    expect(result.entries[1]).toMatchObject({ rank: 2, nickname: "Bob", score: 60 });
  });
});
