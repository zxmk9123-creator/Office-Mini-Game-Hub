import type { StickyNoteRecord, StickyNoteRepository } from "../repositories/stickyNoteRepository";

/** A deliberately restrained palette — not a free-form color picker. */
export const STICKY_NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple"] as const;
export type StickyNoteColor = (typeof STICKY_NOTE_COLORS)[number];

export const STICKY_NOTE_CONTENT_MAX_LENGTH = 2000;

/** Default canvas position for a newly created sticky note when the caller doesn't supply one. */
export const DEFAULT_STICKY_NOTE_POSITION = { x: 24, y: 24 };

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

/** x/y are canvas pixel coordinates — must be finite (rejects NaN/Infinity from a malformed client). */
function normalizeCoordinate(value: number, axis: "x" | "y"): number {
  if (!Number.isFinite(value)) {
    throw new InvalidStickyNoteError(`${axis} must be a finite number`);
  }
  return value;
}

export class StickyNoteService {
  constructor(private readonly repository: StickyNoteRepository) {}

  async createStickyNote(input: {
    content: string;
    color?: string;
    x?: number;
    y?: number;
  }): Promise<StickyNoteRecord> {
    return this.repository.create({
      content: normalizeContent(input.content),
      color: normalizeColor(input.color),
      x: input.x !== undefined ? normalizeCoordinate(input.x, "x") : DEFAULT_STICKY_NOTE_POSITION.x,
      y: input.y !== undefined ? normalizeCoordinate(input.y, "y") : DEFAULT_STICKY_NOTE_POSITION.y,
    });
  }

  async listStickyNotes(): Promise<StickyNoteRecord[]> {
    return this.repository.findAll();
  }

  async updateStickyNote(
    id: string,
    input: { content?: string; color?: string; pinned?: boolean; x?: number; y?: number },
  ): Promise<StickyNoteRecord> {
    const patch: { content?: string; color?: string; pinned?: boolean; x?: number; y?: number } = {};
    if (input.content !== undefined) {
      patch.content = normalizeContent(input.content);
    }
    if (input.color !== undefined) {
      patch.color = normalizeColor(input.color);
    }
    if (input.pinned !== undefined) {
      patch.pinned = input.pinned;
    }
    if (input.x !== undefined) {
      patch.x = normalizeCoordinate(input.x, "x");
    }
    if (input.y !== undefined) {
      patch.y = normalizeCoordinate(input.y, "y");
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
