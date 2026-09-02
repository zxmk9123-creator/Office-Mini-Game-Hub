import { and, desc, eq } from "drizzle-orm";
import { stickyNotes, type Database } from "@mini-game-hub/database";

export interface StickyNoteRecord {
  id: string;
  playerId: string | null;
  content: string;
  color: string;
  pinned: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StickyNoteRepository {
  create(input: {
    playerId: string;
    content: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<StickyNoteRecord>;
  /** Only this player's own notes — never the full table. */
  findAllForPlayer(playerId: string): Promise<StickyNoteRecord[]>;
  findById(id: string): Promise<StickyNoteRecord | null>;
  /** Applies the patch only when `id` AND `playerId` both match a row; otherwise a no-op (returns null). */
  update(
    id: string,
    playerId: string,
    input: {
      content?: string;
      color?: string;
      pinned?: boolean;
      locked?: boolean;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    },
  ): Promise<StickyNoteRecord | null>;
  /** Deletes only when `id` AND `playerId` both match a row. */
  delete(id: string, playerId: string): Promise<boolean>;
}

export class DrizzleStickyNoteRepository implements StickyNoteRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    playerId: string;
    content: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<StickyNoteRecord> {
    const [row] = await this.db.insert(stickyNotes).values(input).returning();
    return row;
  }

  async findAllForPlayer(playerId: string): Promise<StickyNoteRecord[]> {
    // Pinned notes surface first; within each group, most recently updated first.
    return this.db
      .select()
      .from(stickyNotes)
      .where(eq(stickyNotes.playerId, playerId))
      .orderBy(desc(stickyNotes.pinned), desc(stickyNotes.updatedAt));
  }

  async findById(id: string): Promise<StickyNoteRecord | null> {
    const [row] = await this.db.select().from(stickyNotes).where(eq(stickyNotes.id, id)).limit(1);
    return row ?? null;
  }

  async update(
    id: string,
    playerId: string,
    input: {
      content?: string;
      color?: string;
      pinned?: boolean;
      locked?: boolean;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    },
  ): Promise<StickyNoteRecord | null> {
    const [row] = await this.db
      .update(stickyNotes)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(stickyNotes.id, id), eq(stickyNotes.playerId, playerId)))
      .returning();
    return row ?? null;
  }

  async delete(id: string, playerId: string): Promise<boolean> {
    const result = await this.db
      .delete(stickyNotes)
      .where(and(eq(stickyNotes.id, id), eq(stickyNotes.playerId, playerId)))
      .returning({ id: stickyNotes.id });
    return result.length > 0;
  }
}
