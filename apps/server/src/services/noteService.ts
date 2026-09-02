import type { NoteRecord, NoteRepository } from "../repositories/noteRepository";

export const NOTE_TITLE_MAX_LENGTH = 200;

export class NoteNotFoundError extends Error {
  constructor(public readonly noteId: string) {
    super(`Note "${noteId}" was not found`);
    this.name = "NoteNotFoundError";
  }
}

export class InvalidNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNoteError";
  }
}

function normalizeTitle(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  if (trimmed.length > NOTE_TITLE_MAX_LENGTH) {
    throw new InvalidNoteError(`Title must be at most ${NOTE_TITLE_MAX_LENGTH} characters`);
  }
  return trimmed;
}

export class NoteService {
  constructor(private readonly repository: NoteRepository) {}

  async createNote(input: { title: string; content: string }): Promise<NoteRecord> {
    return this.repository.create({ title: normalizeTitle(input.title), content: input.content });
  }

  async listNotes(): Promise<NoteRecord[]> {
    return this.repository.findAll();
  }

  async getNote(id: string): Promise<NoteRecord> {
    const note = await this.repository.findById(id);
    if (!note) {
      throw new NoteNotFoundError(id);
    }
    return note;
  }

  async updateNote(id: string, input: { title?: string; content?: string }): Promise<NoteRecord> {
    const patch: { title?: string; content?: string } = {};
    if (input.title !== undefined) {
      patch.title = normalizeTitle(input.title);
    }
    if (input.content !== undefined) {
      patch.content = input.content;
    }
    const note = await this.repository.update(id, patch);
    if (!note) {
      throw new NoteNotFoundError(id);
    }
    return note;
  }

  async deleteNote(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new NoteNotFoundError(id);
    }
  }
}
