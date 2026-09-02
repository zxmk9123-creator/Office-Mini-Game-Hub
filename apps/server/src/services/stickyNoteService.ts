import type { StickyNoteRecord, StickyNoteRepository } from "../repositories/stickyNoteRepository";

/** A deliberately restrained palette — not a free-form color picker. */
export const STICKY_NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple"] as const;
export type StickyNoteColor = (typeof STICKY_NOTE_COLORS)[number];

export const STICKY_NOTE_CONTENT_MAX_LENGTH = 2000;

export class StickyNoteNotFoundError extends Error {
  constructor(public readonly stickyNoteId: string) {
    super(`Sticky note "${stickyNoteId}" was not found`);
    this.name = "StickyNoteNotFoundError";
  }
}

export class InvalidStickyNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStickyNoteError";
  }
}

function normalizeColor(rawColor: string | undefined): StickyNoteColor {
  const color = rawColor ?? "yellow";
  if (!STICKY_NOTE_COLORS.includes(color as StickyNoteColor)) {
    throw new InvalidStickyNoteError(`color must be one of: ${STICKY_NOTE_COLORS.join(", ")}`);
  }
  return color as StickyNoteColor;
}

function normalizeContent(content: string): string {
  if (content.length > STICKY_NOTE_CONTENT_MAX_LENGTH) {
    throw new InvalidStickyNoteError(`content must be at most ${STICKY_NOTE_CONTENT_MAX_LENGTH} characters`);
  }
  return content;
}

export class StickyNoteService {
  constructor(private readonly repository: StickyNoteRepository) {}

  async createStickyNote(input: { content: string; color?: string }): Promise<StickyNoteRecord> {
    return this.repository.create({
      content: normalizeContent(input.content),
      color: normalizeColor(input.color),
    });
  }

  async listStickyNotes(): Promise<StickyNoteRecord[]> {
    return this.repository.findAll();
  }

  async updateStickyNote(
    id: string,
    input: { content?: string; color?: string; pinned?: boolean },
  ): Promise<StickyNoteRecord> {
    const patch: { content?: string; color?: string; pinned?: boolean } = {};
    if (input.content !== undefined) {
      patch.content = normalizeContent(input.content);
    }
    if (input.color !== undefined) {
      patch.color = normalizeColor(input.color);
    }
    if (input.pinned !== undefined) {
      patch.pinned = input.pinned;
    }
    const stickyNote = await this.repository.update(id, patch);
    if (!stickyNote) {
      throw new StickyNoteNotFoundError(id);
    }
    return stickyNote;
  }

  async deleteStickyNote(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new StickyNoteNotFoundError(id);
    }
  }
}
