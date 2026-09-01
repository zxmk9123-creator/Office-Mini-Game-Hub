import { GameNotFoundError } from "@mini-game-hub/game-core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { getGameRegistry } from "../gameRegistry";
import { DrizzleGameSessionRepository } from "../repositories/gameSessionRepository";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import { PlayerNotFoundError, PlayerService } from "../services/playerService";
import {
  GameSessionService,
  InvalidSessionTransitionError,
  SessionNotFoundError,
} from "../services/gameSessionService";
import { ensureGamesSynced, resetTestData } from "./testDb";

beforeAll(ensureGamesSynced);
beforeEach(resetTestData);

const playerRepository = new DrizzlePlayerRepository(getDb());
const sessionRepository = new DrizzleGameSessionRepository(getDb());
const playerService = new PlayerService(playerRepository);
const sessionService = new GameSessionService(sessionRepository, playerRepository, getGameRegistry());

async function createPlayer() {
  return playerService.createPlayer("Sanghyun");
}

describe("GameSessionService.createSession", () => {
  it("creates a started session for a valid player and a registered game", async () => {
    const player = await createPlayer();
    const session = await sessionService.createSession(player.id, "reaction-test");

    expect(session.playerId).toBe(player.id);
    expect(session.gameId).toBe("reaction-test");
    expect(session.status).toBe("started");
    expect(session.startedAt).toBeInstanceOf(Date);
    expect(session.completedAt).toBeNull();
  });

  it("rejects a session for an unknown player id", async () => {
    await expect(
      sessionService.createSession("00000000-0000-0000-0000-000000000000", "reaction-test"),
    ).rejects.toThrow(PlayerNotFoundError);
  });

  it("rejects a session for an unregistered game", async () => {
    const player = await createPlayer();
    await expect(sessionService.createSession(player.id, "does-not-exist")).rejects.toThrow(
      GameNotFoundError,
    );
  });
});

describe("GameSessionService.getSession", () => {
  it("retrieves a session by id", async () => {
    const player = await createPlayer();
    const created = await sessionService.createSession(player.id, "reaction-test");
    const found = await sessionService.getSession(created.id);
    expect(found).toEqual(created);
  });

  it("throws SessionNotFoundError for an unknown id", async () => {
    await expect(sessionService.getSession("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      SessionNotFoundError,
    );
  });
});

describe("GameSessionService status transitions", () => {
  it("completes a started session and stamps completedAt", async () => {
    const player = await createPlayer();
    const session = await sessionService.createSession(player.id, "reaction-test");

    const completed = await sessionService.completeSession(session.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("invalidates a started session (e.g. a false start)", async () => {
    const player = await createPlayer();
    const session = await sessionService.createSession(player.id, "reaction-test");

    const invalidated = await sessionService.invalidateSession(session.id);
    expect(invalidated.status).toBe("invalid");
    expect(invalidated.completedAt).toBeInstanceOf(Date);
  });

  it("abandons a started session", async () => {
    const player = await createPlayer();
    const session = await sessionService.createSession(player.id, "reaction-test");

    const abandoned = await sessionService.abandonSession(session.id);
    expect(abandoned.status).toBe("abandoned");
  });

  it("rejects completing an already-completed session (no duplicate completion)", async () => {
    const player = await createPlayer();
    const session = await sessionService.createSession(player.id, "reaction-test");
    await sessionService.completeSession(session.id);

    await expect(sessionService.completeSession(session.id)).rejects.toThrow(
      InvalidSessionTransitionError,
    );
  });

  it("rejects invalidating a session that is already abandoned", async () => {
    const player = await createPlayer();
    const session = await sessionService.createSession(player.id, "reaction-test");
    await sessionService.abandonSession(session.id);

    await expect(sessionService.invalidateSession(session.id)).rejects.toThrow(
      InvalidSessionTransitionError,
    );
  });

  it("rejects transitioning a session that does not exist", async () => {
    await expect(
      sessionService.completeSession("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(SessionNotFoundError);
  });
});
