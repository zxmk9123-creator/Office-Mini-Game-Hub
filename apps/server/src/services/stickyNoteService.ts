import type { PlayerRepository } from "../repositories/playerRepository";
import type { StickyNoteRecord, StickyNoteRepository } from "../repositories/stickyNoteRepository";
import { PlayerNotFoundError } from "./playerService";

/** A deliberately restrained palette — not a free-form color picker. */
export const STICKY_NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple"] as const;
export type StickyNoteColor = (typeof STICKY_NOTE_COLORS)[number];

export const STICKY_NOTE_CONTENT_MAX_LENGTH = 2000;

/** Default canvas position for a newly created sticky note when the caller doesn't supply one. */
export const DEFAULT_STICKY_NOTE_POSITION = { x: 24, y: 24 };

/** Default canvas size for a newly created sticky note when the caller doesn't supply one. */
export const DEFAULT_STICKY_NOTE_SIZE = { width: 200, height: 160 };

/** A note may never be resized smaller than this — keeps it usable/readable. */
export const MIN_STICKY_NOTE_WIDTH = 180;
export const MIN_STICKY_NOTE_HEIGHT = 120;

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

/** width/height are canvas pixel dimensions — finite, positive, and never below the readable minimum. */
function normalizeDimension(value: number, axis: "width" | "height", min: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidStickyNoteError(`${axis} must be a positive, finite number`);
  }
  if (value < min) {
    throw new InvalidStickyNoteError(`${axis} must be at least ${min}`);
  }
  return value;
}

/**
 * `playerId` here is the same anonymous, browser-local Player identity
 * used elsewhere (Reaction Test) — not an authenticated account. It gives
 * browser/player-level separation between Sticky Note collections, not
 * account-level security: a client that already knows another player's id
 * could still claim it (see the Route/Service docs on this — there is no
 * login system in this app to verify identity against).
 */
export class StickyNoteService {
  constructor(
    private readonly repository: StickyNoteRepository,
    private readonly playerRepository: PlayerRepository,
  ) {}

  async createStickyNote(input: {
    playerId: string;
    content: string;
    color?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): Promise<StickyNoteRecord> {
    const player = await this.playerRepository.findById(input.playerId);
    if (!player) {
      throw new PlayerNotFoundError(input.playerId);
    }
    return this.repository.create({
      playerId: input.playerId,
      content: normalizeContent(input.content),
      color: normalizeColor(input.color),
      x: input.x !== undefined ? normalizeCoordinate(input.x, "x") : DEFAULT_STICKY_NOTE_POSITION.x,
      y: input.y !== undefined ? normalizeCoordinate(input.y, "y") : DEFAULT_STICKY_NOTE_POSITION.y,
      width:
        input.width !== undefined
          ? normalizeDimension(input.width, "width", MIN_STICKY_NOTE_WIDTH)
          : DEFAULT_STICKY_NOTE_SIZE.width,
      height:
        input.height !== undefined
          ? normalizeDimension(input.height, "height", MIN_STICKY_NOTE_HEIGHT)
          : DEFAULT_STICKY_NOTE_SIZE.height,
    });
  }

  /** Only this player's own notes — the DB query itself is scoped, not filtered after the fact. */
  async listStickyNotes(playerId: string): Promise<StickyNoteRecord[]> {
    return this.repository.findAllForPlayer(playerId);
  }

  async updateStickyNote(
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
  ): Promise<StickyNoteRecord> {
    const patch: {
      content?: string;
      color?: string;
      pinned?: boolean;
      locked?: boolean;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    } = {};
    if (input.content !== undefined) {
      patch.content = normalizeContent(input.content);
    }
    if (input.color !== undefined) {
      patch.color = normalizeColor(input.color);
    }
    if (input.pinned !== undefined) {
      patch.pinned = input.pinned;
    }
    if (input.locked !== undefined) {
      patch.locked = input.locked;
    }
    if (input.x !== undefined) {
      patch.x = normalizeCoordinate(input.x, "x");
    }
    if (input.y !== undefined) {
      patch.y = normalizeCoordinate(input.y, "y");
    }
    if (input.width !== undefined) {
      patch.width = normalizeDimension(input.width, "width", MIN_STICKY_NOTE_WIDTH);
    }
    if (input.height !== undefined) {
      patch.height = normalizeDimension(input.height, "height", MIN_STICKY_NOTE_HEIGHT);
    }
    // A mismatched playerId returns null exactly like a missing id — the
    // caller can't tell "not yours" from "doesn't exist", which is the
    // best this anonymous-id scheme can offer without real auth.
    const stickyNote = await this.repository.update(id, playerId, patch);
    if (!stickyNote) {
      throw new StickyNoteNotFoundError(id);
    }
    return stickyNote;
  }

  async deleteStickyNote(id: string, playerId: string): Promise<void> {
    const deleted = await this.repository.delete(id, playerId);
    if (!deleted) {
      throw new StickyNoteNotFoundError(id);
    }
  }
}
