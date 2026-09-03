/**
 * Source of randomness for mine placement. Injectable so tests can force a
 * specific, deterministic placement sequence instead of depending on real
 * randomness — same pattern as Swipe Brick Breaker's RandomSource.
 */
export interface RandomSource {
  /** A float in [0, 1), same contract as Math.random(). */
  next(): number;
}

/** `Math.random` is a plain JS builtin (not a browser API), so a default lives in game-core. */
export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

export interface MinesweeperDifficultyConfig {
  width: number;
  height: number;
  mines: number;
}

/** Width x height x mine count per difficulty — also drives each difficulty's separate ranking category (see minesweeper.ts's per-difficulty GameMetadata). */
export const MINESWEEPER_DIFFICULTIES = {
  easy: { width: 10, height: 8, mines: 12 },
  normal: { width: 14, height: 9, mines: 25 },
  hard: { width: 18, height: 10, mines: 45 },
} as const satisfies Record<string, MinesweeperDifficultyConfig>;

export type MinesweeperDifficulty = keyof typeof MINESWEEPER_DIFFICULTIES;

export type CellState = "hidden" | "revealed" | "flagged";

export interface Cell {
  mine: boolean;
  /** Count of mines in the 8 surrounding cells. Meaningless (0) for a mine cell itself. */
  adjacent: number;
  state: CellState;
}

/**
 * "active" spans the platform's whole "playing" lifecycle state, both
 * before and after the first reveal (mines aren't placed, and the timer
 * hasn't started, until then) — see MinesweeperGame.handleReveal.
 */
export type MinesweeperPhase = "active" | "cleared" | "gameOver";

export interface MinesweeperState {
  phase: MinesweeperPhase;
  difficulty: MinesweeperDifficulty;
  width: number;
  height: number;
  mineCount: number;
  /** Flat, row-major: index = row * width + col. */
  cells: Cell[];
  /** False until the first reveal places mines (first click is always safe). */
  minesPlaced: boolean;
  /** Set on the first reveal; null before then. The ranked score is endedAtMs - startedAtMs. */
  startedAtMs: number | null;
  /** Set the moment the game ends (Clear or Game Over); null while still playing. */
  endedAtMs: number | null;
  revealedSafeCount: number;
  flagCount: number;
}

export type MinesweeperInput =
  | { type: "reveal"; row: number; col: number }
  | { type: "toggleFlag"; row: number; col: number };

export interface MinesweeperResultMetadata {
  difficulty: MinesweeperDifficulty;
  width: number;
  height: number;
  mineCount: number;
  /** ms between first reveal and Clear/Game Over; null if the timer never started (never happens once isFinished()) or the game wasn't cleared. */
  elapsedMs: number | null;
  revealedSafeCount: number;
  flagCount: number;
  remainingMines: number;
}
