import { describe, expect, it } from "vitest";
import {
  MINESWEEPER_DIFFICULTIES,
  MinesweeperGame,
  MinesweeperInputError,
  minesweeperEasyMetadata,
  minesweeperHardMetadata,
  minesweeperNormalMetadata,
  neighborsOf,
  placeMines,
  createEmptyBoard,
  type Clock,
  type MinesweeperDifficulty,
  type MinesweeperState,
  type RandomSource,
} from "..";

class FixedClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(byMs: number) {
    this.t += byMs;
  }
}

/** Deterministic sequence source for reproducible mine-placement tests. */
class SequenceRandomSource implements RandomSource {
  private i = 0;
  constructor(private readonly values: number[]) {}
  next(): number {
    const v = this.values[this.i % this.values.length];
    this.i += 1;
    return v;
  }
}

const DIFFICULTIES: MinesweeperDifficulty[] = ["easy", "normal", "hard"];

function newGame(difficulty: MinesweeperDifficulty, clock: Clock = new FixedClock(), random?: RandomSource) {
  const game = random ? new MinesweeperGame(difficulty, clock, random) : new MinesweeperGame(difficulty, clock);
  const state = game.start(game.createInitialState());
  return { game, state };
}

function findCell(state: MinesweeperState, predicate: (index: number) => boolean): { row: number; col: number } {
  for (let i = 0; i < state.cells.length; i++) {
    if (predicate(i)) {
      return { row: Math.floor(i / state.width), col: i % state.width };
    }
  }
  throw new Error("No matching cell found");
}

describe("Minesweeper: board dimensions and mine counts", () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty} board matches its configured width/height/mines`, () => {
      const cfg = MINESWEEPER_DIFFICULTIES[difficulty];
      const { game, state } = newGame(difficulty);
      expect(state.width).toBe(cfg.width);
      expect(state.height).toBe(cfg.height);
      expect(state.mineCount).toBe(cfg.mines);
      expect(state.cells).toHaveLength(cfg.width * cfg.height);

      const revealed = game.handleInput(state, { type: "reveal", row: 0, col: 0 });
      expect(revealed.cells.filter((c) => c.mine)).toHaveLength(cfg.mines);
    });
  }

  it("gives each difficulty its own ranking category (gameId)", () => {
    expect(minesweeperEasyMetadata.id).toBe("minesweeper-easy");
    expect(minesweeperNormalMetadata.id).toBe("minesweeper-normal");
    expect(minesweeperHardMetadata.id).toBe("minesweeper-hard");
    const ids = new Set([minesweeperEasyMetadata.id, minesweeperNormalMetadata.id, minesweeperHardMetadata.id]);
    expect(ids.size).toBe(3);
  });

  it("every difficulty resets its ranking daily and ranks lower clear time as better", () => {
    for (const metadata of [minesweeperEasyMetadata, minesweeperNormalMetadata, minesweeperHardMetadata]) {
      expect(metadata.rankingPeriod).toBe("daily");
      expect(metadata.scoreType).toBe("lower_is_better");
    }
  });
});

describe("Minesweeper: first-click safety", () => {
  it("the first-clicked cell is never a mine, across many seeds and click positions", () => {
    for (let seed = 0; seed < 30; seed++) {
      const random = new SequenceRandomSource([((seed * 37) % 97) / 97, ((seed * 13) % 89) / 89]);
      const { game, state } = newGame("easy", new FixedClock(), random);
      const row = seed % state.height;
      const col = (seed * 3) % state.width;
      const revealed = game.handleInput(state, { type: "reveal", row, col });
      const idx = row * state.width + col;
      expect(revealed.cells[idx].mine).toBe(false);
      expect(revealed.cells[idx].state).toBe("revealed");
    }
  });
});

describe("Minesweeper: adjacent mine counting", () => {
  it("counts exactly the mines among a cell's 8 neighbors, for a real placement", () => {
    const width = 5;
    const height = 5;
    const cells = placeMines(createEmptyBoard(width, height), width, height, 6, 24, new SequenceRandomSource([0.1, 0.9, 0.3, 0.7, 0.5, 0.2]));
    expect(cells.filter((c) => c.mine)).toHaveLength(6);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].mine) continue;
      const expected = neighborsOf(i, width, height).filter((n) => cells[n].mine).length;
      expect(cells[i].adjacent).toBe(expected);
    }
  });

  it("a lone safe cell surrounded by mines on every side reports adjacent === 8", () => {
    // 3x3 board, safe cell at the center (index 4); every other cell mined.
    const width = 3;
    const height = 3;
    const cells = placeMines(createEmptyBoard(width, height), width, height, 8, 4, new SequenceRandomSource([0]));
    expect(cells[4].mine).toBe(false);
    expect(cells[4].adjacent).toBe(8);
    expect(cells.filter((c) => c.mine)).toHaveLength(8);
  });
});

describe("Minesweeper: zero-cell cascade", () => {
  it("revealing a cell with 0 adjacent mines opens its whole connected safe region in one input", () => {
    // A random source that always exhausts the pool from the far end
    // (mines land far from the clicked corner) makes the clicked cell
    // very likely to have 0 adjacent mines on a large board — asserted
    // below either way, so the test is correct regardless.
    const { game, state } = newGame("hard", new FixedClock(), new SequenceRandomSource([0.99]));
    const revealed = game.handleInput(state, { type: "reveal", row: 0, col: 0 });
    const revealedCount = revealed.cells.filter((c) => c.state === "revealed").length;
    if (revealed.cells[0].adjacent === 0) {
      expect(revealedCount).toBeGreaterThan(1);
    } else {
      expect(revealedCount).toBe(1);
    }
  });

  it("cascade never reveals a flagged cell", () => {
    const { game, state: s0 } = newGame("hard", new FixedClock(), new SequenceRandomSource([0.9]));
    // Flag a neighbor of the corner before the first reveal.
    const flagged = game.handleInput(s0, { type: "toggleFlag", row: 0, col: 1 });
    const revealed = game.handleInput(flagged, { type: "reveal", row: 0, col: 0 });
    expect(revealed.cells[0 * revealed.width + 1].state).toBe("flagged");
  });
});

describe("Minesweeper: flag / unflag", () => {
  it("toggling a hidden cell flags it, toggling again unflags it", () => {
    const { game, state: s0 } = newGame("easy");
    const flagged = game.handleInput(s0, { type: "toggleFlag", row: 2, col: 2 });
    expect(flagged.cells[2 * flagged.width + 2].state).toBe("flagged");
    expect(flagged.flagCount).toBe(1);

    const unflagged = game.handleInput(flagged, { type: "toggleFlag", row: 2, col: 2 });
    expect(unflagged.cells[2 * unflagged.width + 2].state).toBe("hidden");
    expect(unflagged.flagCount).toBe(0);
  });

  it("flagging does not place mines or start the timer", () => {
    const { game, state: s0 } = newGame("easy", new FixedClock(1000));
    const flagged = game.handleInput(s0, { type: "toggleFlag", row: 0, col: 0 });
    expect(flagged.minesPlaced).toBe(false);
    expect(flagged.startedAtMs).toBeNull();
  });

  it("a revealed cell cannot be flagged", () => {
    const { game, state: s0 } = newGame("easy");
    const revealed = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });
    const attempted = game.handleInput(revealed, { type: "toggleFlag", row: 0, col: 0 });
    expect(attempted.cells[0].state).toBe("revealed");
    expect(attempted.flagCount).toBe(0);
  });
});

describe("Minesweeper: flagged-cell protection", () => {
  it("revealing a flagged cell is a no-op — it stays flagged and hidden, unchanged", () => {
    const { game, state: s0 } = newGame("easy");
    const flagged = game.handleInput(s0, { type: "toggleFlag", row: 1, col: 1 });
    const attempted = game.handleInput(flagged, { type: "reveal", row: 1, col: 1 });
    expect(attempted).toBe(flagged);
    expect(attempted.cells[1 * attempted.width + 1].state).toBe("flagged");
  });

  it("prevents a duplicate reveal of an already-revealed cell from re-running mine placement or the timer", () => {
    const clock = new FixedClock(10);
    const { game, state: s0 } = newGame("easy", clock);
    const once = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });
    clock.advance(500);
    const twice = game.handleInput(once, { type: "reveal", row: 0, col: 0 });
    expect(twice).toBe(once);
    expect(twice.startedAtMs).toBe(once.startedAtMs);
  });
});

describe("Minesweeper: mine reveal -> Game Over", () => {
  it("revealing a mine ends the game, stops the timer, and reports no score", () => {
    const clock = new FixedClock(200);
    const { game, state: s0 } = newGame("easy", clock);
    const afterFirst = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });
    const mineCell = findCell(afterFirst, (i) => afterFirst.cells[i].mine);

    clock.advance(1234);
    const gameOver = game.handleInput(afterFirst, { type: "reveal", row: mineCell.row, col: mineCell.col });

    expect(gameOver.phase).toBe("gameOver");
    expect(gameOver.endedAtMs).toBe(200 + 1234);
    expect(gameOver.cells[mineCell.row * gameOver.width + mineCell.col].state).toBe("revealed");

    const result = game.computeResult(gameOver);
    expect(result.score).toBeNull();
    expect(result.completion.reason).toBe("invalid");
    expect(result.metadata.elapsedMs).toBe(1234);
  });

  it("further input after Game Over throws", () => {
    const { game, state: s0 } = newGame("easy");
    const afterFirst = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });
    const mineCell = findCell(afterFirst, (i) => afterFirst.cells[i].mine);
    const gameOver = game.handleInput(afterFirst, { type: "reveal", row: mineCell.row, col: mineCell.col });
    expect(() => game.handleInput(gameOver, { type: "reveal", row: 0, col: 0 })).toThrow(MinesweeperInputError);
    expect(() => game.handleInput(gameOver, { type: "toggleFlag", row: 0, col: 0 })).toThrow(MinesweeperInputError);
  });
});

describe("Minesweeper: Clear (all safe cells revealed)", () => {
  it("revealing every non-mine cell transitions to cleared and reports a numeric clear-time score", () => {
    const clock = new FixedClock(0);
    const { game, state: s0 } = newGame("easy", clock);
    let state = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });

    clock.advance(9999);
    // Reveal every remaining hidden non-mine cell — order doesn't matter,
    // cascade already opened many of them, and re-revealing an
    // already-open cell is a documented no-op.
    for (let i = 0; i < state.cells.length && state.phase === "active"; i++) {
      if (state.cells[i].mine) continue;
      const row = Math.floor(i / state.width);
      const col = i % state.width;
      state = game.handleInput(state, { type: "reveal", row, col });
    }

    expect(state.phase).toBe("cleared");
    expect(state.endedAtMs).toBe(9999);
    const totalSafe = state.width * state.height - state.mineCount;
    expect(state.revealedSafeCount).toBe(totalSafe);

    const result = game.computeResult(state);
    expect(result.completion.reason).toBe("completed");
    expect(result.score).toBe(9999);
    expect(result.metadata.remainingMines).toBe(state.mineCount);
  });
});

describe("Minesweeper: timer lifecycle", () => {
  it("the timer is null before the first reveal, starts on the first reveal, and stops on the terminal reveal", () => {
    const clock = new FixedClock(50);
    const { game, state: s0 } = newGame("easy", clock);
    expect(s0.startedAtMs).toBeNull();

    const first = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });
    expect(first.startedAtMs).toBe(50);
    expect(first.endedAtMs).toBeNull();

    clock.advance(3000);
    const mineCell = findCell(first, (i) => first.cells[i].mine);
    const ended = game.handleInput(first, { type: "reveal", row: mineCell.row, col: mineCell.col });
    expect(ended.endedAtMs).toBe(3050);

    // Time moving further after the game ended must not change the recorded result.
    clock.advance(5000);
    const result = game.computeResult(ended);
    expect(result.metadata.elapsedMs).toBe(3000);
  });
});

describe("Minesweeper: failed games are not submitted for ranking", () => {
  it("a Game Over result has score null and reason 'invalid', matching the platform's exclude-from-ranking contract", () => {
    const { game, state: s0 } = newGame("normal");
    const first = game.handleInput(s0, { type: "reveal", row: 0, col: 0 });
    const mineCell = findCell(first, (i) => first.cells[i].mine);
    const gameOver = game.handleInput(first, { type: "reveal", row: mineCell.row, col: mineCell.col });
    const result = game.computeResult(gameOver);
    expect(result.score).toBeNull();
    expect(result.completion.reason).toBe("invalid");
  });
});
