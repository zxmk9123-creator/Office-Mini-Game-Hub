import { eq } from "drizzle-orm";
import { gameSessions, type Database } from "@mini-game-hub/database";

export type GameSessionStatus = "started" | "completed" | "invalid" | "abandoned";

export interface GameSessionRecord {
  id: string;
  playerId: string;
  gameId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: GameSessionStatus;
}

export interface GameSessionRepository {
  create(input: { playerId: string; gameId: string }): Promise<GameSessionRecord>;
  findById(id: string): Promise<GameSessionRecord | null>;
  updateStatus(
    id: string,
    status: Exclude<GameSessionStatus, "started">,
    completedAt: Date,
  ): Promise<GameSessionRecord>;
}

export class DrizzleGameSessionRepository implements GameSessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: { playerId: string; gameId: string }): Promise<GameSessionRecord> {
    const [row] = await this.db
      .insert(gameSessions)
      .values({ playerId: input.playerId, gameId: input.gameId })
      .returning();
    return row as GameSessionRecord;
  }

  async findById(id: string): Promise<GameSessionRecord | null> {
    const [row] = await this.db.select().from(gameSessions).where(eq(gameSessions.id, id)).limit(1);
    return (row as GameSessionRecord) ?? null;
  }

  async updateStatus(
    id: string,
    status: Exclude<GameSessionStatus, "started">,
    completedAt: Date,
  ): Promise<GameSessionRecord> {
    const [row] = await this.db
      .update(gameSessions)
      .set({ status, completedAt })
      .where(eq(gameSessions.id, id))
      .returning();
    return row as GameSessionRecord;
  }
}
