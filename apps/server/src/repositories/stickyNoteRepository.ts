import { desc, eq } from "drizzle-orm";
import { stickyNotes, type Database } from "@mini-game-hub/database";

export interface StickyNoteRecord {
  id: string;
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
    content: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<StickyNoteRecord>;
  findAll(): Promise<StickyNoteRecord[]>;
  findById(id: string): Promise<StickyNoteRecord | null>;
  update(
    id: string,
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
  delete(id: string): Promise<boolean>;
}

export class DrizzleStickyNoteRepository implements StickyNoteRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
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

  async findAll(): Promise<StickyNoteRecord[]> {
    // Pinned notes surface first; within each group, most recently updated first.
    return this.db.select().from(stickyNotes).orderBy(desc(stickyNotes.pinned), desc(stickyNotes.updatedAt));
  }

  async findById(id: string): Promise<StickyNoteRecord | null> {
    const [row] = await this.db.select().from(stickyNotes).where(eq(stickyNotes.id, id)).limit(1);
    return row ?? null;
  }

  async update(
    id: string,
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
      .where(eq(stickyNotes.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(stickyNotes).where(eq(stickyNotes.id, id)).returning({ id: stickyNotes.id });
    return result.length > 0;
  }
}
