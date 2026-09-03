import type { Database, DbClient } from "@mini-game-hub/database";
import { validateGameResult, type GameCompletionReason, type GameRegistry } from "@mini-game-hub/game-core";
import {
  DrizzleGameResultRepository,
  isUniqueConstraintViolation,
  type GameResultRecord,
  type GameResultRepository,
} from "../repositories/gameResultRepository";
import {
  DrizzleGameSessionRepository,
  type GameSessionRepository,
  type GameSessionStatus,
} from "../repositories/gameSessionRepository";
import { GameDisabledError, SessionNotFoundError } from "./gameSessionService";
import { kstDateString } from "../utils/kstDate";

export class SessionGameMismatchError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly requestedGameId: string,
    public readonly actualGameId: string,
  ) {
    super(`Session "${sessionId}" belongs to game "${actualGameId}", not "${requestedGameId}"`);
    this.name = "SessionGameMismatchError";
  }
}

export class SessionNotEligibleError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly status: GameSessionStatus,
  ) {
    super(`Session "${sessionId}" is not eligible for a result submission (status "${status}")`);
    this.name = "SessionNotEligibleError";
  }
}

export class DuplicateResultError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Session "${sessionId}" already has a submitted result`);
    this.name = "DuplicateResultError";
  }
}

export interface SubmitResultInput {
  sessionId: string;
  score: number | null;
  completion: { reason: GameCompletionReason; completedAt: number };
  metadata: unknown;
}

/**
 * A game's completion reason maps 1:1 onto the terminal session status it
 * produces. Generic — adding a future game requires no change here as long
 * as it reports one of the three GameCompletionReason values.
 */
const TERMINAL_STATUS_BY_COMPLETION_REASON: Record<
  GameCompletionReason,
  Exclude<GameSessionStatus, "started">
> = {
  completed: "completed",
  invalid: "invalid",
  aborted: "abandoned",
};

/**
 * Persists a GameResult for a GameSession and transitions that session to
 * its terminal state, as one atomic operation. Resolves scoreType from the
 * GameRegistry and derives playerId/gameId from the session itself — the
 * client never supplies them. Contains no Reaction-Test-specific logic;
 * everything here works for any game registered in the GameRegistry.
 */
export class GameResultService {
  constructor(
    private readonly db: Database,
    private readonly gameRegistry: GameRegistry,
    private readonly makeSessionRepository: (
      executor: DbClient,
    ) => GameSessionRepository = (executor) => new DrizzleGameSessionRepository(executor),
    private readonly makeResultRepository: (
      executor: DbClient,
    ) => GameResultRepository = (executor) => new DrizzleGameResultRepository(executor),
    /** Injectable for tests; defaults to real wall-clock time. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submitResult(gameId: string, input: SubmitResultInput): Promise<GameResultRecord> {
    // GameRegistry.get() throws GameNotFoundError for an unregistered id.
    const game = this.gameRegistry.get(gameId);
    if (!game.metadata.enabled) {
      throw new GameDisabledError(gameId);
    }

    // Validate the GameResult contract itself before touching the database.
    validateGameResult(
      {
        gameId,
        scoreType: game.metadata.scoreType,
        score: input.score,
        completion: input.completion,
        metadata: input.metadata,
      },
      { gameId, scoreType: game.metadata.scoreType },
    );

    try {
      return await this.db.transaction(async (tx) => {
        const sessionRepository = this.makeSessionRepository(tx);
        const resultRepository = this.makeResultRepository(tx);

        const session = await sessionRepository.findById(input.sessionId);
        if (!session) {
          throw new SessionNotFoundError(input.sessionId);
        }
        if (session.gameId !== gameId) {
          throw new SessionGameMismatchError(input.sessionId, gameId, session.gameId);
        }
        if (session.status !== "started") {
          throw new SessionNotEligibleError(input.sessionId, session.status);
        }

        // Only a "daily" rankingPeriod game (e.g. Swipe Brick Breaker) gets
        // a rankingDate at all — every "allTime" game keeps storing null
        // here, exactly as before, so their rankings are untouched. The
        // date itself is always computed in Asia/Seoul (KST), independent
        // of server-local timezone — see kstDateString.
        const rankingDate =
          (game.metadata.rankingPeriod ?? "allTime") === "daily" ? kstDateString(this.now()) : null;

        // playerId and gameId come from the session, never from the request body.
        const created = await resultRepository.create({
          sessionId: input.sessionId,
          playerId: session.playerId,
          gameId: session.gameId,
          score: input.score,
          metadata: input.metadata,
          rankingDate,
        });

        const terminalStatus = TERMINAL_STATUS_BY_COMPLETION_REASON[input.completion.reason];
        // The session's completedAt is server wall-clock time, not the
        // client's completion.completedAt — that value is measured on
        // whichever Clock the game engine used (e.g. performance.now() in
        // the browser) and is not a wall-clock timestamp.
        await sessionRepository.updateStatus(input.sessionId, terminalStatus, new Date());

        return created;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateResultError(input.sessionId);
      }
      throw error;
    }
  }
}
