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
  /** Only meaningful for a "daily" rankingPeriod game (e.g. swipe-brick-breaker); omit for an "allTime" game. */
  rankingDate?: string | null;
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
      rankingDate: options.rankingDate ?? null,
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

/**
 * Daily ranking reset (GameMetadata.rankingPeriod === "daily"), exercised
 * against the real registered swipe-brick-breaker game rather than a test
 * double, since this is a property of its actual metadata. A RankingService
 * pinned to a fixed "now" makes "today" deterministic in these tests
 * without depending on the real wall clock or the test runner's timezone.
 */
describe("RankingService.getRanking: daily ranking reset (KST)", () => {
  // 2026-06-15T06:00:00Z is 2026-06-15 15:00:00 KST — safely mid-day KST,
  // not near the 00:00 KST boundary, so this doubles as "now" for the
  // service under test.
  const TODAY_KST_NOON_UTC = new Date("2026-06-15T06:00:00.000Z");
  const dailyRankingService = new RankingService(rankingRepository, gameRegistry, () => TODAY_KST_NOON_UTC);

  it("same KST day -> same ranking period: two results submitted at different times on the same KST date rank together", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    // Both fall on 2026-06-15 KST (00:00:30 KST and 23:59:30 KST respectively).
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 5,
      completedAt: new Date("2026-06-14T15:00:30.000Z"),
      rankingDate: "2026-06-15",
    });
    await seedResult({
      playerId: b.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 8,
      completedAt: new Date("2026-06-15T14:59:30.000Z"),
      rankingDate: "2026-06-15",
    });

    const result = await dailyRankingService.getRanking({ gameId: "swipe-brick-breaker", limit: 20, offset: 0 });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.nickname)).toEqual(["Bob", "Alice"]);
  });

  it("yesterday's records are excluded from today's Top 10", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 999,
      completedAt: new Date("2026-06-14T10:00:00.000Z"),
      rankingDate: "2026-06-14",
    });

    const result = await dailyRankingService.getRanking({ gameId: "swipe-brick-breaker", limit: 20, offset: 0 });

    expect(result.entries).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  it("only today's (2026-06-15) rows are ranked when yesterday's and today's both exist", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 999,
      completedAt: new Date("2026-06-14T10:00:00.000Z"),
      rankingDate: "2026-06-14",
    });
    await seedResult({
      playerId: b.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 3,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });

    const result = await dailyRankingService.getRanking({ gameId: "swipe-brick-breaker", limit: 20, offset: 0 });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ nickname: "Bob", score: 3 });
  });

  it("a player's best score is evaluated within the current KST day only — a huge score from yesterday never wins over a smaller one today", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 1000,
      completedAt: new Date("2026-06-14T10:00:00.000Z"),
      rankingDate: "2026-06-14",
    });
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 4,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });

    const result = await dailyRankingService.getRanking({
      gameId: "swipe-brick-breaker",
      limit: 20,
      offset: 0,
      playerId: a.id,
    });

    // Alice's only eligible-today result is 4 — the 1000 from yesterday is
    // excluded entirely, not merely out-ranked.
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].score).toBe(4);
    expect(result.playerRank).toMatchObject({ score: 4 });
  });

  it("the same player can start a fresh daily record on the next KST day: yesterday's result does not block or get overwritten by today's", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 7,
      completedAt: new Date("2026-06-14T10:00:00.000Z"),
      rankingDate: "2026-06-14",
    });

    // "Today" (2026-06-15) ranking has no result for Alice yet — first
    // score after midnight starts a fresh daily record.
    const beforeFirstScoreToday = await dailyRankingService.getRanking({
      gameId: "swipe-brick-breaker",
      limit: 20,
      offset: 0,
      playerId: a.id,
    });
    expect(beforeFirstScoreToday.playerRank).toBeNull();

    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 2,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });

    const afterFirstScoreToday = await dailyRankingService.getRanking({
      gameId: "swipe-brick-breaker",
      limit: 20,
      offset: 0,
      playerId: a.id,
    });
    expect(afterFirstScoreToday.playerRank).toMatchObject({ score: 2 });
  });

  it("00:00 KST -> new date: a result stored under tomorrow's KST date is invisible to today's ranking", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "swipe-brick-breaker",
      status: "completed",
      score: 6,
      // Stored as tomorrow's KST date (as if it had been submitted just
      // after the 00:00 KST rollover on 2026-06-16).
      completedAt: new Date("2026-06-15T15:00:01.000Z"),
      rankingDate: "2026-06-16",
    });

    const result = await dailyRankingService.getRanking({ gameId: "swipe-brick-breaker", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });

  it("does not affect an all-time (non-daily) game's ranking: reaction-test still ranks across dates unfiltered", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({
      playerId: a.id,
      gameId: "reaction-test",
      status: "completed",
      score: 300,
      completedAt: new Date("2026-06-14T10:00:00.000Z"),
    });
    await seedResult({
      playerId: b.id,
      gameId: "reaction-test",
      status: "completed",
      score: 200,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
    });

    // Same fixed-"now" service, but reaction-test is "allTime" — both
    // results (from two different KST dates) must still appear.
    const result = await dailyRankingService.getRanking({ gameId: "reaction-test", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.nickname)).toEqual(["Bob", "Alice"]);
  });
});

describe("RankingService.getRanking: Minesweeper — per-difficulty ranking + KST daily isolation", () => {
  const TODAY_KST_NOON_UTC = new Date("2026-06-15T06:00:00.000Z");
  const dailyRankingService = new RankingService(rankingRepository, gameRegistry, () => TODAY_KST_NOON_UTC);

  it("minesweeper-easy and minesweeper-normal rank completely separately, even for the same player/day", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "minesweeper-easy",
      status: "completed",
      score: 45000,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });
    await seedResult({
      playerId: a.id,
      gameId: "minesweeper-normal",
      status: "completed",
      score: 120000,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });

    const easy = await dailyRankingService.getRanking({ gameId: "minesweeper-easy", limit: 20, offset: 0 });
    const normal = await dailyRankingService.getRanking({ gameId: "minesweeper-normal", limit: 20, offset: 0 });

    expect(easy.entries).toHaveLength(1);
    expect(easy.entries[0].score).toBe(45000);
    expect(normal.entries).toHaveLength(1);
    expect(normal.entries[0].score).toBe(120000);
  });

  it("yesterday's minesweeper-hard clear is excluded from today's Top 10 (KST)", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "minesweeper-hard",
      status: "completed",
      score: 60000,
      completedAt: new Date("2026-06-14T10:00:00.000Z"),
      rankingDate: "2026-06-14",
    });

    const result = await dailyRankingService.getRanking({ gameId: "minesweeper-hard", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });

  it("a lower clear time ranks higher (rank 1) than a higher one on the same KST day", async () => {
    const a = await player("Alice");
    const b = await player("Bob");
    await seedResult({
      playerId: a.id,
      gameId: "minesweeper-easy",
      status: "completed",
      score: 30000,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });
    await seedResult({
      playerId: b.id,
      gameId: "minesweeper-easy",
      status: "completed",
      score: 15000,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: "2026-06-15",
    });

    const result = await dailyRankingService.getRanking({ gameId: "minesweeper-easy", limit: 20, offset: 0 });
    expect(result.entries.map((e) => e.nickname)).toEqual(["Bob", "Alice"]);
    expect(result.entries.map((e) => e.score)).toEqual([15000, 30000]);
  });

  it("a failed (Game Over) attempt — null score, invalid session status — never appears in the ranking", async () => {
    const a = await player("Alice");
    await seedResult({
      playerId: a.id,
      gameId: "minesweeper-easy",
      status: "invalid",
      score: null,
      completedAt: new Date("2026-06-15T06:00:00.000Z"),
      rankingDate: null,
    });

    const result = await dailyRankingService.getRanking({ gameId: "minesweeper-easy", limit: 20, offset: 0 });
    expect(result.entries).toHaveLength(0);
  });
});
