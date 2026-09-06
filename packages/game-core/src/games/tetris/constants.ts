import type { TetrisRuleset } from "./types";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
/** Hidden rows above the visible playfield — headroom for spawning/rotating tall pieces (I, and SRS kicks) near the top. */
export const BUFFER_ROWS = 4;

/**
 * ms of gravity per row-drop, indexed by level - 1 (level 1 -> index 0).
 * Deliberately NOT final balance numbers — see TetrisRuleset.gravity's
 * doc comment; the last entry repeats for every level beyond the table.
 * Values only need to trend downward; the exact curve is easy to retune
 * later without touching any engine code.
 */
export const DEFAULT_GRAVITY_TABLE: readonly number[] = [
  1000, 800, 650, 500, 400, 320, 260, 210, 170, 140, 120, 100, 90, 80, 70, 60, 50, 40, 30, 20,
];

/** V1 Classic-style scoring — see TetrisRuleset.scoring; multiplied by the current level when awarded. */
export const DEFAULT_SCORING = {
  single: 100,
  double: 300,
  triple: 500,
  tetris: 800,
} as const;

export const DEFAULT_LINES_PER_LEVEL = 10;

/** Classic-style lock delay: how long a grounded piece may sit before it locks. Not a final balance value — easy to retune later. */
export const DEFAULT_LOCK_DELAY_MS = 500;

/** How many times a grounded piece's lock delay may be reset before it locks on schedule regardless of further input — prevents indefinite stalling. */
export const DEFAULT_LOCK_DELAY_MAX_RESETS = 15;

/** The V1 ruleset. Every rule Tetris needs lives here — the engine (a later phase) only ever reads a TetrisRuleset, never a bare constant. */
export const DEFAULT_TETRIS_RULESET: TetrisRuleset = {
  boardWidth: BOARD_WIDTH,
  boardHeight: BOARD_HEIGHT,
  bufferRows: BUFFER_ROWS,
  linesPerLevel: DEFAULT_LINES_PER_LEVEL,
  gravity: [...DEFAULT_GRAVITY_TABLE],
  scoring: { ...DEFAULT_SCORING },
  pieceGenerator: "seven-bag",
  rotationSystem: "srs",
  lockDelayMs: DEFAULT_LOCK_DELAY_MS,
  lockDelayMaxResets: DEFAULT_LOCK_DELAY_MAX_RESETS,
};
