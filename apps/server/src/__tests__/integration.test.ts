import { GameSession, ReactionTestGame, type Clock } from "@mini-game-hub/game-core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { DrizzleGameResultRepository } from "../repositories/gameResultRepository";
import { DrizzleGameSessionRepository } from "../repositories/gameSessionRepository";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import { PlayerService } from "../services/playerService";
import { GameSessionService } from "../services/gameSessionService";
import { GameResultService, SessionNotEligibleError } from "../services/gameResultService";
import { ensureGamesSynced, resetTestData } from "./testDb";

beforeAll(ensureGamesSynced);
beforeEach(resetTestData);

/**
 * Proves the Phase 4 architectural goal end to end: the platform can
 * identify WHO is playing (Player) and WHICH GAME ATTEMPT is being played
 * (GameSession), resolving the game only through GameRegistry — without
 * this test, or the services it drives, ever touching Reaction Test's
 * internals.
 */
describe("Player -> GameSession integration flow", () => {
  const playerRepository = new DrizzlePlayerRepository(getDb());
  const sessionRepository = new DrizzleGameSessionRepository(getDb());
  const playerService = new PlayerService(playerRepository);
  const sessionService = new GameSessionService(
    sessionRepository,
    playerRepository,
    getGameRegistry(),
  );

  it("creates a player, resolves reaction-test, creates and completes a session", async () => {
    // 1. Create Player "Sanghyun"
    const player = await playerService.createPlayer("Sanghyun");
    expect(player.nickname).toBe("Sanghyun");

    // 2. Resolve reaction-test (via the same registry the session service uses)
    const game = getGameRegistry().get("reaction-test");
    expect(game.metadata.id).toBe("reaction-test");
    expect(game.metadata.enabled).toBe(true);

    // 3. Create a GameSession
    const session = await sessionService.createSession(player.id, game.metadata.id);
    expect(session.status).toBe("started");

    // 4. Retrieve the session
    const fetched = await sessionService.getSession(session.id);
    expect(fetched).toEqual(session);

    // 5. Verify player/game/session relationships
    expect(fetched.playerId).toBe(player.id);
    expect(fetched.gameId).toBe(game.metadata.id);

    const storedPlayer = await playerService.getPlayer(fetched.playerId);
    expect(storedPlayer.id).toBe(player.id);

    // 6. Complete the session through the session service
    const completed = await sessionService.completeSession(session.id);

    // 7. Verify the final persisted state
    const final = await sessionService.getSession(session.id);
    expect(final.status).toBe("completed");
    expect(final.completedAt).toBeInstanceOf(Date);
    expect(final).toEqual(completed);
  });

  it("creates a player, resolves reaction-test, creates and invalidates a session (false start)", async () => {
    const player = await playerService.createPlayer("Alex");
    const game = getGameRegistry().get("reaction-test");
    const session = await sessionService.createSession(player.id, game.metadata.id);

    const invalidated = await sessionService.invalidateSession(session.id);

    const final = await sessionService.getSession(session.id);
    expect(final.status).toBe("invalid");
    expect(final.completedAt).toBeInstanceOf(Date);
    expect(final).toEqual(invalidated);
  });
});

class FakeClock implements Clock {
  private current = 0;
  now(): number {
    return this.current;
  }
  advanceBy(ms: number): void {
    this.current += ms;
  }
}

/**
 * Proves the full Phase 5 pipeline against real Postgres:
 * Player -> GameSession -> (real ReactionTestGame engine) GameResult ->
 * GameResultService -> PostgreSQL, including the duplicate-submission guard.
 */
describe("Player -> Session -> Result end-to-end flow", () => {
  const db = getDb();
  const gameRegistry = getGameRegistry();
  const playerRepository = new DrizzlePlayerRepository(db);
  const sessionRepository = new DrizzleGameSessionRepository(db);
  const resultRepository = new DrizzleGameResultRepository(db);
  const playerService = new PlayerService(playerRepository);
  const sessionService = new GameSessionService(sessionRepository, playerRepository, gameRegistry);
  const resultService = new GameResultService(db, gameRegistry);

  it("runs the complete flow and rejects a second submission for the same session", async () => {
    // 1. Create Player
    const player = await playerService.createPlayer("Sanghyun");

    // 2. Create Reaction Test Session
    const session = await sessionService.createSession(player.id, "reaction-test");
    expect(session.status).toBe("started");

    // 3. Run/construct a valid GameResult using the real Reaction Test engine.
    const clock = new FakeClock();
    const gameSession = new GameSession(new ReactionTestGame(clock));
    gameSession.ready();
    gameSession.start();
    clock.advanceBy(gameSession.getGameState().delayMs);
    gameSession.submitInput({ type: "reveal" });
    clock.advanceBy(184);
    gameSession.submitInput({ type: "click" });
    const gameResult = gameSession.computeResult();
    expect(gameResult.score).toBe(184);

    // 4. Submit it through the API layer (GameResultService, as the route does).
    const persisted = await resultService.submitResult("reaction-test", {
      sessionId: session.id,
      score: gameResult.score,
      completion: gameResult.completion,
      metadata: gameResult.metadata,
    });

    // 5. Verify the result exists in PostgreSQL.
    const storedResult = await resultRepository.findBySessionId(session.id);
    expect(storedResult).toEqual(persisted);
    expect(storedResult?.score).toBe(184);
    expect(storedResult?.playerId).toBe(player.id);
    expect(storedResult?.gameId).toBe("reaction-test");

    // 6. Verify the session became completed.
    const completedSession = await sessionService.getSession(session.id);
    expect(completedSession.status).toBe("completed");
    expect(completedSession.completedAt).toBeInstanceOf(Date);

    // 7. Submit again.
    const secondAttempt = resultService.submitResult("reaction-test", {
      sessionId: session.id,
      score: 999,
      completion: { reason: "completed", completedAt: 1 },
      metadata: {},
    });

    // 8. Verify the duplicate submission is rejected (the session is no
    // longer "started" — the DB's own unique constraint on session_id is
    // the second line of defense, exercised directly in
    // gameResultService.test.ts's transaction-integrity suite), and that
    // nothing about the original result changed.
    await expect(secondAttempt).rejects.toThrow(SessionNotEligibleError);
    const stillOnlyResult = await resultRepository.findBySessionId(session.id);
    expect(stillOnlyResult?.score).toBe(184);
  });
});
