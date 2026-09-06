/**
 * The seven standard tetrominoes.
 */
export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export const PIECE_TYPES: readonly PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

/**
 * SRS rotation states, in clockwise order starting from spawn: 0 -> R -> 2 -> L -> 0.
 * Represented numerically (0/1/2/3) rather than as string literals so
 * `(rotation + 1) % 4` / `(rotation + 3) % 4` can express clockwise/
 * counter-clockwise transitions directly — the rotation SYSTEM (kick
 * tables) that interprets these transitions is a later phase, not part of
 * this state shape.
 */
export type Rotation = 0 | 1 | 2 | 3;
export const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

/** One (row, col) offset, relative to a piece's bounding-box origin. */
export interface PieceCellOffset {
  row: number;
  col: number;
}

export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  /** Column of the piece's bounding-box top-left corner. */
  x: number;
  /** Row of the piece's bounding-box top-left corner — 0 is the top of the buffer area, increasing downward. */
  y: number;
}

/** A board cell: the PieceType locked there, or empty. */
export type Cell = PieceType | null;

/** Row-major grid: `board[row][col]`. Includes the ruleset's hidden buffer rows on top of the visible playfield. */
export type Board = Cell[][];

export type TetrisStatus = "ready" | "playing" | "paused" | "gameOver";

/**
 * Fully serializable/deterministic — no Date/timer/DOM references anywhere
 * in this shape. `next` is the upcoming-piece queue shown to the player
 * (see queue.ts); `gravityAccumulator` is milliseconds of unconsumed fall
 * time, advanced by advanceTime() (a later phase) rather than any timer
 * living inside this state.
 */
export interface TetrisState {
  status: TetrisStatus;
  board: Board;
  current: ActivePiece | null;
  next: PieceType[];
  score: number;
  lines: number;
  level: number;
  gravityAccumulator: number;
}

/**
 * Generic input contract the platform boundary translates keyboard (or,
 * later, mouse/touch) events into — game-core never reads a KeyboardEvent
 * directly. `tick` is the time-based gravity/lock-delay advance
 * (advanceTime(deltaMs) from the spec), modeled as an input like every
 * other game-core engine's "tick"/"reveal"-style inputs rather than a
 * separate method, to keep TetrisGame a plain Game<TState, TInput, _>.
 */
export type TetrisInput =
  | { type: "moveLeft" }
  | { type: "moveRight" }
  | { type: "softDrop" }
  | { type: "hardDrop" }
  | { type: "rotateCw" }
  | { type: "rotateCcw" }
  | { type: "pause" }
  | { type: "restart" }
  | { type: "tick"; dtMs: number };

/** Reported alongside the final score — the ranking's own metric is `score` (higher_is_better); this is display/analytics only. */
export interface TetrisResultMetadata {
  lines: number;
  level: number;
}

/**
 * Every configurable rule Tetris needs, isolated from the engine so a
 * future variant (different gravity curve, scoring table, board size)
 * never means touching engine code — only constructing a different
 * TetrisRuleset. See constants.ts for the V1 default.
 */
export interface TetrisRuleset {
  boardWidth: number;
  boardHeight: number;
  /** Hidden rows above the visible playfield, for spawn/rotation headroom. */
  bufferRows: number;
  linesPerLevel: number;
  /**
   * Gravity interval in ms, indexed by level - 1 (level 1 -> gravity[0]).
   * The last entry repeats for every level beyond the table's length, so
   * the table never needs an entry per achievable level.
   */
  gravity: number[];
  scoring: {
    single: number;
    double: number;
    triple: number;
    tetris: number;
  };
  /** Named rather than a function reference, so a ruleset stays a plain serializable value — the engine resolves the name to a concrete generator/rotation implementation. */
  pieceGenerator: "seven-bag";
  rotationSystem: "srs";
}
