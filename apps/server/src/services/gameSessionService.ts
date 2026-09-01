import type { GameRegistry } from "@mini-game-hub/game-core";
import type { PlayerRepository } from "../repositories/playerRepository";
import { PlayerNotFoundError } from "./playerService";
import type {
  GameSessionRecord,
  GameSessionRepository,
  GameSessionStatus,
} from "../repositories/gameSessionRepository";

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session "${sessionId}" was not found`);
    this.name = "SessionNotFoundError";
  }
}

export class GameDisabledError extends Error {
  constructor(public readonly gameId: string) {
    super(`Game "${gameId}" is registered but not currently enabled`);
    this.name = "GameDisabledError";
  }
}

export class InvalidSessionTransitionError extends Error {
  constructor(
    public readonly from: GameSessionStatus,
    public readonly to: GameSessionStatus,
  ) {
    super(`Cannot transition session from "${from}" to "${to}"`);
    this.name = "InvalidSessionTransitionError";
  }
}

type TerminalStatus = Exclude<GameSessionStatus, "started">;

/**
 * A session may only leave "started" once, into exactly one terminal
 * status. Every terminal status is final — this is what makes a completed
 * session's result immutable and rejects double-completion.
 */
const ALLOWED_TRANSITIONS: Record<GameSessionStatus, readonly TerminalStatus[]> = {
  started: ["completed", "invalid", "abandoned"],
  completed: [],
  invalid: [],
  abandoned: [],
};

/**
 * Creates and manages GameSessions — one concrete attempt by one Player at
 * one Game. Resolves the requested game through the GameRegistry rather
 * than hard-coding any specific game, so a future game only needs to be
 * registered (see gameRegistry.ts) to be playable through this same
 * service, unchanged.
 */
export class GameSessionService {
  constructor(
    private readonly sessionRepository: GameSessionRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly gameRegistry: GameRegistry,
  ) {}

  async createSession(playerId: string, gameId: string): Promise<GameSessionRecord> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new PlayerNotFoundError(playerId);
    }

    // GameRegistry.get() throws GameNotFoundError for an unregistered id.
    const game = this.gameRegistry.get(gameId);
    if (!game.metadata.enabled) {
      throw new GameDisabledError(gameId);
    }

    return this.sessionRepository.create({ playerId, gameId: game.metadata.id });
  }

  async getSession(sessionId: string): Promise<GameSessionRecord> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  private async transition(sessionId: string, to: TerminalStatus): Promise<GameSessionRecord> {
    const session = await this.getSession(sessionId);
    if (!ALLOWED_TRANSITIONS[session.status].includes(to)) {
      throw new InvalidSessionTransitionError(session.status, to);
    }
    return this.sessionRepository.updateStatus(sessionId, to, new Date());
  }

  completeSession(sessionId: string): Promise<GameSessionRecord> {
    return this.transition(sessionId, "completed");
  }

  invalidateSession(sessionId: string): Promise<GameSessionRecord> {
    return this.transition(sessionId, "invalid");
  }

  abandonSession(sessionId: string): Promise<GameSessionRecord> {
    return this.transition(sessionId, "abandoned");
  }
}
