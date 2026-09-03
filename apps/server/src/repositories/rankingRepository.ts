import { sql } from "drizzle-orm";
import type { DbClient } from "@mini-game-hub/database";
import type { ScoreType } from "@mini-game-hub/game-core";

export interface RankingEntryRecord {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  metadata: unknown;
  completedAt: Date;
}

export interface RankingRepository {
  getLeaderboard(
    gameId: string,
    scoreType: ScoreType,
    limit: number,
    offset: number,
    /** Non-null for a "daily" rankingPeriod game: only that KST date's results are ranked. Omit/null for "allTime". */
    rankingDate?: string | null,
  ): Promise<{ entries: RankingEntryRecord[]; total: number }>;

  getPlayerRank(
    gameId: string,
    scoreType: ScoreType,
    playerId: string,
    rankingDate?: string | null,
  ): Promise<RankingEntryRecord | null>;
}

/**
 * The shared CTEs every ranking query builds on:
 *
 * - `eligible`: this game's results from sessions that actually completed,
 *   with a non-null score — defense in depth (GameResultService already
 *   guarantees that pairing, but this query doesn't trust that from the
 *   outside; it re-derives eligibility from the persisted relational data).
 *   When `rankingDate` is given (a "daily" rankingPeriod game), this also
 *   requires an exact match on the stored ranking_date column — so only
 *   today's (Asia/Seoul) results are ever eligible; yesterday's rows are
 *   simply excluded here, no deletion or scheduled job involved. `null`
 *   (the default, every "allTime" game) applies no such filter at all —
 *   other games' rankings are completely unaffected by this feature.
 * - `best_per_player`: DISTINCT ON collapses each player down to their
 *   single best attempt. The direction-aware ORDER BY is what makes "best"
 *   mean MIN for lower_is_better and MAX for higher_is_better; completedAt
 *   then id break a tie deterministically (earlier attempt wins). For a
 *   daily game this means "best within today" — a new KST day filters in
 *   a disjoint set of rows, so a player's best-ever attempt from a prior
 *   day never carries over.
 * - `ranked`: standard competition ranking (1, 2, 2, 4) via RANK(), using
 *   that same direction/tie-break ordering.
 *
 * `direction` is never client input — the caller only ever passes one of
 * the two literal strings below, chosen from `scoreType` — so splicing it
 * into the SQL text via sql.raw (where a bind parameter can't go, since
 * ORDER BY direction isn't parameterizable) carries no injection risk.
 */
function rankingCtes(gameId: string, direction: "ASC" | "DESC", rankingDate: string | null | undefined) {
  const rankingDateFilter = rankingDate != null ? sql`AND r.ranking_date = ${rankingDate}` : sql``;
  return sql`
    WITH eligible AS (
      SELECT r.id, r.player_id, r.score, r.metadata, s.completed_at
      FROM game_results r
      JOIN game_sessions s ON s.id = r.session_id
      WHERE r.game_id = ${gameId} AND s.status = 'completed' AND r.score IS NOT NULL ${rankingDateFilter}
    ),
    best_per_player AS (
      SELECT DISTINCT ON (player_id) id, player_id, score, metadata, completed_at
      FROM eligible
      ORDER BY player_id, score ${sql.raw(direction)}, completed_at ASC, id ASC
    ),
    ranked AS (
      SELECT
        id, player_id, score, metadata, completed_at,
        -- Rank is a function of score ALONE (standard competition ranking:
        -- 1, 2, 2, 4) — completed_at/id below are the deterministic
        -- *display* order for tied rows, not part of the rank number.
        RANK() OVER (ORDER BY score ${sql.raw(direction)}) AS rank
      FROM best_per_player
    )
  `;
}

function toRecord(row: Record<string, unknown>): RankingEntryRecord {
  return {
    rank: Number(row.rank),
    playerId: row.player_id as string,
    nickname: row.nickname as string,
    score: row.score as number,
    metadata: row.metadata,
    completedAt: row.completed_at as Date,
  };
}

export class DrizzleRankingRepository implements RankingRepository {
  constructor(private readonly db: DbClient) {}

  async getLeaderboard(
    gameId: string,
    scoreType: ScoreType,
    limit: number,
    offset: number,
    rankingDate?: string | null,
  ): Promise<{ entries: RankingEntryRecord[]; total: number }> {
    const direction = scoreType === "lower_is_better" ? "ASC" : "DESC";
    const ctes = rankingCtes(gameId, direction, rankingDate);

    const entryRows = (await this.db.execute(sql`
      ${ctes}
      SELECT ranked.rank, ranked.player_id, ranked.score, ranked.metadata, ranked.completed_at, p.nickname
      FROM ranked
      JOIN players p ON p.id = ranked.player_id
      ORDER BY ranked.rank ASC, ranked.completed_at ASC, ranked.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `)) as unknown as Record<string, unknown>[];

    const countRows = (await this.db.execute(sql`
      ${ctes}
      SELECT COUNT(*)::int AS total FROM ranked
    `)) as unknown as Record<string, unknown>[];

    return {
      entries: entryRows.map(toRecord),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async getPlayerRank(
    gameId: string,
    scoreType: ScoreType,
    playerId: string,
    rankingDate?: string | null,
  ): Promise<RankingEntryRecord | null> {
    const direction = scoreType === "lower_is_better" ? "ASC" : "DESC";
    const ctes = rankingCtes(gameId, direction, rankingDate);

    const rows = (await this.db.execute(sql`
      ${ctes}
      SELECT ranked.rank, ranked.player_id, ranked.score, ranked.metadata, ranked.completed_at, p.nickname
      FROM ranked
      JOIN players p ON p.id = ranked.player_id
      WHERE ranked.player_id = ${playerId}
    `)) as unknown as Record<string, unknown>[];

    const row = rows[0];
    return row ? toRecord(row) : null;
  }
}
