import { desc, eq } from "drizzle-orm";
import { notes, type Database } from "@mini-game-hub/database";

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteRepository {
  create(input: { title: string; content: string }): Promise<NoteRecord>;
  findAll(): Promise<NoteRecord[]>;
  findById(id: string): Promise<NoteRecord | null>;
  update(id: string, input: { title?: string; content?: string }): Promise<NoteRecord | null>;
  delete(id: string): Promise<boolean>;
}

export class DrizzleNoteRepository implements NoteRepository {
  constructor(private readonly db: Database) {}

  async create(input: { title: string; content: string }): Promise<NoteRecord> {
    const [row] = await this.db.insert(notes).values(input).returning();
    return row;
  }

  async findAll(): Promise<NoteRecord[]> {
    return this.db.select().from(notes).orderBy(desc(notes.updatedAt));
  }

  async findById(id: string): Promise<NoteRecord | null> {
    const [row] = await this.db.select().from(notes).where(eq(notes.id, id)).limit(1);
    return row ?? null;
  }

  async update(id: string, input: { title?: string; content?: string }): Promise<NoteRecord | null> {
    const [row] = await this.db
      .update(notes)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
    return result.length > 0;
  }
}
