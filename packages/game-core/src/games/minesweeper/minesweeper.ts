import type { Game, GameMetadata, GameResult } from "../../types";
import type { Clock } from "../reaction-test/types";
import { createEmptyBoard, placeMines, revealCascade } from "./board";
import {
  MINESWEEPER_DIFFICULTIES,
  MathRandomSource,
  type MinesweeperDifficulty,
  type MinesweeperInput,
  type MinesweeperResultMetadata,
  type MinesweeperState,
  type RandomSource,
} from "./types";

export class MinesweeperInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MinesweeperInputError";
  }
}

const DIFFICULTY_LABEL: Record<MinesweeperDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

/**
 * One GameMetadata per difficulty, each its own `id` — the platform's
 * ranking is keyed strictly by gameId, so this is how "separate ranking
 * per difficulty" is achieved entirely by reuse: no ranking/schema change,
 * just three registered games sharing one engine. All three are
 * `rankingPeriod: "daily"`, matching Swipe Brick Breaker's KST reset.
 */
export function minesweeperMetadataFor(difficulty: MinesweeperDifficulty): GameMetadata {
  const { width, height, mines } = MINESWEEPER_DIFFICULTIES[difficulty];
  return {
    id: `minesweeper-${difficulty}`,
    name: `Minesweeper (${DIFFICULTY_LABEL[difficulty]})`,
    description: `${width}x${height} board, ${mines} mines. Clear it as fast as you can.`,
    icon: "minesweeper",
    scoreType: "lower_is_better",
    version: "1.0.0",
    enabled: true,
    rankingPeriod: "daily",
  };
}

export const minesweeperEasyMetadata = minesweeperMetadataFor("easy");
export const minesweeperNormalMetadata = minesweeperMetadataFor("normal");
export const minesweeperHardMetadata = minesweeperMetadataFor("hard");

/**
 * Minesweeper's game engine. Pure state transitions only — no DOM, no
 * timers of its own. `clock` is read only twice per play-through (the
 * first reveal, and Clear/Game Over), matching the read-only-at-the-edges
 * Clock pattern used by ReactionTestGame/SwipeBrickBreakerGame.
 */
export class MinesweeperGame implements Game<MinesweeperState, MinesweeperInput, MinesweeperResultMetadata> {
  readonly metadata: GameMetadata;
  private readonly difficulty: MinesweeperDifficulty;

  constructor(difficulty: MinesweeperDifficulty, private readonly clock: Clock, private readonly random: RandomSource = new MathRandomSource()) {
    this.difficulty = difficulty;
    this.metadata = minesweeperMetadataFor(difficulty);
  }

  createInitialState(): MinesweeperState {
    const { width, height, mines } = MINESWEEPER_DIFFICULTIES[this.difficulty];
    return {
      phase: "active",
      difficulty: this.difficulty,
      width,
      height,
      mineCount: mines,
      cells: createEmptyBoard(width, height),
      minesPlaced: false,
      startedAtMs: null,
      endedAtMs: null,
      revealedSafeCount: 0,
      flagCount: 0,
    };
  }

  /** ready -> playing: nothing to precompute — mines are placed lazily on the first reveal so it can be guaranteed safe. */
  start(state: MinesweeperState): MinesweeperState {
    return state;
  }

  handleInput(state: MinesweeperState, input: MinesweeperInput): MinesweeperState {
    if (state.phase !== "active") {
      throw new MinesweeperInputError(`Cannot act — game already "${state.phase}"`);
    }
    if (input.type === "reveal") {
      return this.handleReveal(state, input.row, input.col);
    }
    return this.handleToggleFlag(state, input.row, input.col);
  }

  private indexOf(state: MinesweeperState, row: number, col: number): number {
    if (row < 0 || row >= state.height || col < 0 || col >= state.width) {
      throw new MinesweeperInputError(`Cell (${row}, ${col}) is out of bounds`);
    }
    return row * state.width + col;
  }

  private handleReveal(state: MinesweeperState, row: number, col: number): MinesweeperState {
    const idx = this.indexOf(state, row, col);
    const current = state.cells[idx];
    // Flagged and already-revealed cells are both protected no-ops, not
    // errors — a stray duplicate reveal (double click, or the flood-fill
    // cascade re-targeting an already-open neighbor) must never re-trigger
    // mine placement, the timer, or a mine check.
    if (current.state === "flagged" || current.state === "revealed") {
      return state;
    }

    let cells = state.cells;
    let minesPlaced = state.minesPlaced;
    let startedAtMs = state.startedAtMs;
    if (!minesPlaced) {
      // First reveal of the game: place mines now, guaranteed to exclude
      // this cell, and start the clear-time timer.
      cells = placeMines(cells, state.width, state.height, state.mineCount, idx, this.random);
      minesPlaced = true;
      startedAtMs = this.clock.now();
    }

    if (cells[idx].mine) {
      const revealed = cells.map((c, i) => (i === idx ? { ...c, state: "revealed" as const } : c));
      return {
        ...state,
        cells: revealed,
        minesPlaced,
        startedAtMs,
        phase: "gameOver",
        endedAtMs: this.clock.now(),
      };
    }

    const revealed = revealCascade(cells, state.width, state.height, idx);
    const revealedSafeCount = revealed.filter((c) => c.state === "revealed" && !c.mine).length;
    const totalSafeCells = state.width * state.height - state.mineCount;

    if (revealedSafeCount === totalSafeCells) {
      return {
        ...state,
        cells: revealed,
        minesPlaced,
        startedAtMs,
        revealedSafeCount,
        phase: "cleared",
        endedAtMs: this.clock.now(),
      };
    }

    return { ...state, cells: revealed, minesPlaced, startedAtMs, revealedSafeCount };
  }

  private handleToggleFlag(state: MinesweeperState, row: number, col: number): MinesweeperState {
    const idx = this.indexOf(state, row, col);
    const current = state.cells[idx];
    // A revealed cell can never be flagged — nothing to annotate.
    if (current.state === "revealed") {
      return state;
    }
    const wasFlagged = current.state === "flagged";
    const cells = state.cells.map((c, i) => (i === idx ? { ...c, state: wasFlagged ? ("hidden" as const) : ("flagged" as const) } : c));
    return { ...state, cells, flagCount: state.flagCount + (wasFlagged ? -1 : 1) };
  }

  isFinished(state: MinesweeperState): boolean {
    return state.phase === "cleared" || state.phase === "gameOver";
  }

  computeResult(state: MinesweeperState): GameResult<MinesweeperResultMetadata> {
    const cleared = state.phase === "cleared";
    const elapsedMs =
      state.startedAtMs !== null && state.endedAtMs !== null ? state.endedAtMs - state.startedAtMs : null;
    return {
      gameId: this.metadata.id,
      scoreType: this.metadata.scoreType,
      // Only a successful Clear submits a ranking score — a mine hit (or
      // any other non-cleared terminal state) reports null, exactly like
      // ReactionTest's false start, so the ranking layer excludes it
      // (score IS NULL) without any Minesweeper-specific ranking code.
      score: cleared ? elapsedMs : null,
      completion: {
        reason: cleared ? "completed" : "invalid",
        completedAt: state.endedAtMs ?? this.clock.now(),
      },
      metadata: {
        difficulty: state.difficulty,
        width: state.width,
        height: state.height,
        mineCount: state.mineCount,
        elapsedMs,
        revealedSafeCount: state.revealedSafeCount,
        flagCount: state.flagCount,
        remainingMines: state.mineCount - state.flagCount,
      },
    };
  }
}
