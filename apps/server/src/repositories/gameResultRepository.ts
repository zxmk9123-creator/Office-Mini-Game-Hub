import { eq } from "drizzle-orm";
import { gameResults, type DbClient } from "@mini-game-hub/database";

export interface GameResultRecord {
  id: string;
  sessionId: string;
  playerId: string;
  gameId: string;
  score: number | null;
  metadata: unknown;
  /** "YYYY-MM-DD" in Asia/Seoul (KST) for a "daily" rankingPeriod game; null for every "allTime" game. */
  rankingDate: string | null;
  createdAt: Date;
}

export interface CreateGameResultInput {
  sessionId: string;
  playerId: string;
  gameId: string;
  score: number | null;
  metadata: unknown;
  /** Omit (or pass null) for an "allTime" game — see GameResultRecord.rankingDate. */
  rankingDate?: string | null;
}

export interface GameResultRepository {
  create(input: CreateGameResultInput): Promise<GameResultRecord>;
  findBySessionId(sessionId: string): Promise<GameResultRecord | null>;
}

export class DrizzleGameResultRepository implements GameResultRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: CreateGameResultInput): Promise<GameResultRecord> {
    const [row] = await this.db
      .insert(gameResults)
      .values({
        sessionId: input.sessionId,
        playerId: input.playerId,
        gameId: input.gameId,
        score: input.score,
        metadata: input.metadata as object,
        rankingDate: input.rankingDate ?? null,
      })
      .returning();
    return row as GameResultRecord;
  }

  async findBySessionId(sessionId: string): Promise<GameResultRecord | null> {
    const [row] = await this.db
      .select()
      .from(gameResults)
      .where(eq(gameResults.sessionId, sessionId))
      .limit(1);
    return (row as GameResultRecord) ?? null;
  }
}

function sqlStateOf(error: unknown): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("code" in error && (error as { code: unknown }).code !== undefined) {
    return (error as { code: unknown }).code;
  }
  // drizzle-orm wraps the driver's error in a DrizzleQueryError; the
  // original postgres error (with .code) lives on .cause.
  if ("cause" in error) {
    return sqlStateOf((error as { cause: unknown }).cause);
  }
  return undefined;
}

/** True for a Postgres unique_violation (SQLSTATE 23505) — used to detect a duplicate result submission. */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return sqlStateOf(error) === "23505";
}
