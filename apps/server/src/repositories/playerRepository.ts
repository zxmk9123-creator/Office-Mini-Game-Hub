import { eq } from "drizzle-orm";
import { players, type Database } from "@mini-game-hub/database";

export interface PlayerRecord {
  id: string;
  nickname: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerRepository {
  create(nickname: string): Promise<PlayerRecord>;
  findById(id: string): Promise<PlayerRecord | null>;
}

export class DrizzlePlayerRepository implements PlayerRepository {
  constructor(private readonly db: Database) {}

  async create(nickname: string): Promise<PlayerRecord> {
    const [row] = await this.db.insert(players).values({ nickname }).returning();
    return row;
  }

  async findById(id: string): Promise<PlayerRecord | null> {
    const [row] = await this.db.select().from(players).where(eq(players.id, id)).limit(1);
    return row ?? null;
  }
}
