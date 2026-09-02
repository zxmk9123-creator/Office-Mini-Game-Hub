import type { GameRegistry } from "@mini-game-hub/game-core";
import type { RankingEntryRecord, RankingRepository } from "../repositories/rankingRepository";
import { GameDisabledError } from "./gameSessionService";

export interface RankingQuery {
  gameId: string;
  limit: number;
  offset: number;
  /** Optional lookup, not an auth mechanism — see RankingService docstring. */
  playerId?: string;
}

export interface RankingResult {
  game: { id: string; name: string; scoreType: string };
  entries: RankingEntryRecord[];
  pagination: { limit: number; offset: number; total: number };
  /** Present only when `playerId` was supplied; null if that player has no eligible result yet. */
  playerRank?: RankingEntryRecord | null;
}

/**
 * Generic leaderboard read model. Resolves scoreType from the GameRegistry
 * and reduces to one best result per player — entirely by delegating to
 * RankingRepository's SQL, never in Node. Contains no per-game branching:
 * the same code ranks any registered game correctly as long as it reports
 * a scoreType.
 *
 * `playerId` here is a read convenience (which row to highlight/return),
 * never an authorization check — there is no login, so nothing here trusts
 * it as "the current user."
 */
export class RankingService {
  constructor(
    private readonly rankingRepository: RankingRepository,
    private readonly gameRegistry: GameRegistry,
  ) {}

  async getRanking(query: RankingQuery): Promise<RankingResult> {
    // GameRegistry.get() throws GameNotFoundError for an unregistered id.
    const game = this.gameRegistry.get(query.gameId);
    if (!game.metadata.enabled) {
      throw new GameDisabledError(query.gameId);
    }

    const { entries, total } = await this.rankingRepository.getLeaderboard(
      query.gameId,
      game.metadata.scoreType,
      query.limit,
      query.offset,
    );

    const result: RankingResult = {
      game: { id: game.metadata.id, name: game.metadata.name, scoreType: game.metadata.scoreType },
      entries,
      pagination: { limit: query.limit, offset: query.offset, total },
    };

    if (query.playerId) {
      result.playerRank = await this.rankingRepository.getPlayerRank(
        query.gameId,
        game.metadata.scoreType,
        query.playerId,
      );
    }

    return result;
  }
}
