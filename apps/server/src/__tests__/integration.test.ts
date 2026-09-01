import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { DrizzleGameSessionRepository } from "../repositories/gameSessionRepository";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import { PlayerService } from "../services/playerService";
import { GameSessionService } from "../services/gameSessionService";
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
