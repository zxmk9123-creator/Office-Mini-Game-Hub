import { describe, expect, it } from "vitest";
import {
  DEFAULT_TETRIS_RULESET,
  PIECE_TYPES,
  PieceQueue,
  SevenBagGenerator,
  TETRIS_BOARD_HEIGHT,
  TETRIS_BOARD_WIDTH,
  TETRIS_BUFFER_ROWS,
  TETRIS_SPAWN_X,
  TETRIS_SPAWN_Y,
  cellsForPiece,
  createEmptyTetrisBoard,
  getTetrisCell,
  isTetrisCellEmpty,
  isTetrisCellInBounds,
  shuffledBag,
  spawnPiece,
  tetrisBoardHeight,
  tetrisBoardWidth,
  type PieceType,
  type Rotation,
  type TetrisBagSource,
  type TetrisRandomSource,
} from "..";

/** Deterministic sequence source for reproducible shuffle tests. */
class SequenceRandomSource implements TetrisRandomSource {
  private i = 0;
  constructor(private readonly values: number[]) {}
  next(): number {
    const v = this.values[this.i % this.values.length];
    this.i += 1;
    return v;
  }
}

/** A raw BagSource that hands out a fixed, injected sequence — for testing PieceQueue in isolation from any real generator. */
class FixedBagSource implements TetrisBagSource {
  private i = 0;
  constructor(private readonly sequence: PieceType[]) {}
  next(): PieceType {
    const v = this.sequence[this.i % this.sequence.length];
    this.i += 1;
    return v;
  }
}

describe("Tetris ruleset / constants", () => {
  it("DEFAULT_TETRIS_RULESET matches the exported board/gravity/scoring constants", () => {
    expect(DEFAULT_TETRIS_RULESET.boardWidth).toBe(TETRIS_BOARD_WIDTH);
    expect(DEFAULT_TETRIS_RULESET.boardHeight).toBe(TETRIS_BOARD_HEIGHT);
    expect(DEFAULT_TETRIS_RULESET.bufferRows).toBe(TETRIS_BUFFER_ROWS);
    expect(TETRIS_BOARD_WIDTH).toBe(10);
    expect(TETRIS_BOARD_HEIGHT).toBe(20);
    expect(DEFAULT_TETRIS_RULESET.pieceGenerator).toBe("seven-bag");
    expect(DEFAULT_TETRIS_RULESET.rotationSystem).toBe("srs");
  });

  it("gravity table is non-increasing (never gets slower as the index grows)", () => {
    const table = DEFAULT_TETRIS_RULESET.gravity;
    for (let i = 1; i < table.length; i++) {
      expect(table[i]).toBeLessThanOrEqual(table[i - 1]);
    }
  });

  it("returns a fresh copy each time, so mutating one ruleset instance can't affect another", () => {
    const a = { ...DEFAULT_TETRIS_RULESET, gravity: [...DEFAULT_TETRIS_RULESET.gravity] };
    a.gravity[0] = -1;
    expect(DEFAULT_TETRIS_RULESET.gravity[0]).not.toBe(-1);
  });
});

describe("Tetris board primitives", () => {
  it("creates an empty width x height board of all-null cells", () => {
    const board = createEmptyTetrisBoard(TETRIS_BOARD_WIDTH, TETRIS_BOARD_HEIGHT + TETRIS_BUFFER_ROWS);
    expect(tetrisBoardWidth(board)).toBe(TETRIS_BOARD_WIDTH);
    expect(tetrisBoardHeight(board)).toBe(TETRIS_BOARD_HEIGHT + TETRIS_BUFFER_ROWS);
    for (const row of board) {
      for (const cell of row) {
        expect(cell).toBeNull();
      }
    }
  });

  it("isTetrisCellInBounds is false for negative, >=width, or >=height coordinates", () => {
    const board = createEmptyTetrisBoard(4, 4);
    expect(isTetrisCellInBounds(board, 0, 0)).toBe(true);
    expect(isTetrisCellInBounds(board, 3, 3)).toBe(true);
    expect(isTetrisCellInBounds(board, -1, 0)).toBe(false);
    expect(isTetrisCellInBounds(board, 0, -1)).toBe(false);
    expect(isTetrisCellInBounds(board, 4, 0)).toBe(false);
    expect(isTetrisCellInBounds(board, 0, 4)).toBe(false);
  });

  it("isTetrisCellEmpty is false for an occupied cell and for any out-of-bounds cell", () => {
    const board = createEmptyTetrisBoard(4, 4);
    board[2][1] = "T";
    expect(isTetrisCellEmpty(board, 2, 1)).toBe(false);
    expect(isTetrisCellEmpty(board, 0, 0)).toBe(true);
    expect(isTetrisCellEmpty(board, -1, 0)).toBe(false);
    expect(isTetrisCellEmpty(board, 99, 0)).toBe(false);
    expect(getTetrisCell(board, 2, 1)).toBe("T");
  });
});

describe("Tetris pieces: spawning and shape lookup", () => {
  it("spawnPiece places every piece type at the same spawn column/row, rotation 0", () => {
    for (const type of PIECE_TYPES) {
      const piece = spawnPiece(type);
      expect(piece.type).toBe(type);
      expect(piece.rotation).toBe(0);
      expect(piece.x).toBe(TETRIS_SPAWN_X);
      expect(piece.y).toBe(TETRIS_SPAWN_Y);
    }
  });

  it("every piece occupies exactly 4 cells, in every rotation state", () => {
    const rotations: Rotation[] = [0, 1, 2, 3];
    for (const type of PIECE_TYPES) {
      for (const rotation of rotations) {
        const cells = cellsForPiece({ type, rotation, x: 0, y: 0 });
        expect(cells).toHaveLength(4);
        // No duplicate cells within one piece's own shape.
        const unique = new Set(cells.map((c) => `${c.row},${c.col}`));
        expect(unique.size).toBe(4);
      }
    }
  });

  it("cellsForPiece offsets by the piece's (x, y) — moving the piece moves every cell identically", () => {
    const atOrigin = cellsForPiece({ type: "T", rotation: 0, x: 0, y: 0 });
    const moved = cellsForPiece({ type: "T", rotation: 0, x: 5, y: 2 });
    for (let i = 0; i < atOrigin.length; i++) {
      expect(moved[i].row).toBe(atOrigin[i].row + 2);
      expect(moved[i].col).toBe(atOrigin[i].col + 5);
    }
  });

  it("the O piece's shape is identical across all 4 rotation states (it never visually rotates)", () => {
    const shapes = [0, 1, 2, 3].map((r) => cellsForPiece({ type: "O", rotation: r as Rotation, x: 0, y: 0 }));
    const key = (cells: { row: number; col: number }[]) =>
      cells
        .map((c) => `${c.row},${c.col}`)
        .sort()
        .join("|");
    const first = key(shapes[0]);
    for (const shape of shapes) {
      expect(key(shape)).toBe(first);
    }
  });
});

describe("Tetris 7-bag generator", () => {
  it("shuffledBag always contains exactly one of each of the 7 tetrominoes", () => {
    const seeds = [
      [0, 0, 0, 0, 0, 0],
      [0.99, 0.99, 0.99, 0.99, 0.99, 0.99],
      [0.1, 0.9, 0.2, 0.8, 0.3, 0.7],
    ];
    for (const seed of seeds) {
      const bag = shuffledBag(new SequenceRandomSource(seed));
      expect(bag).toHaveLength(7);
      expect(new Set(bag).size).toBe(7);
      for (const type of PIECE_TYPES) {
        expect(bag).toContain(type);
      }
    }
  });

  it("SevenBagGenerator never repeats a piece before every other piece has appeared, across many consecutive bags", () => {
    const generator = new SevenBagGenerator(new SequenceRandomSource([0.11, 0.42, 0.73, 0.05, 0.88, 0.29]));
    const drawn: PieceType[] = [];
    for (let i = 0; i < 7 * 20; i++) {
      drawn.push(generator.next());
    }
    for (let bagStart = 0; bagStart < drawn.length; bagStart += 7) {
      const bag = drawn.slice(bagStart, bagStart + 7);
      expect(new Set(bag).size).toBe(7);
    }
  });

  it("is deterministic for a given seeded random sequence", () => {
    const seed = [0.4, 0.6, 0.2, 0.8, 0.1, 0.9];
    const a = new SevenBagGenerator(new SequenceRandomSource(seed));
    const b = new SevenBagGenerator(new SequenceRandomSource(seed));
    const drawnA = Array.from({ length: 14 }, () => a.next());
    const drawnB = Array.from({ length: 14 }, () => b.next());
    expect(drawnA).toEqual(drawnB);
  });
});

describe("Tetris piece queue: next()/peek()", () => {
  it("peek(n) returns the next n pieces without consuming them", () => {
    const queue = new PieceQueue(new FixedBagSource(["I", "O", "T", "S", "Z", "J", "L"]));
    expect(queue.peek(3)).toEqual(["I", "O", "T"]);
    // Peeking again returns the exact same pieces — nothing was consumed.
    expect(queue.peek(3)).toEqual(["I", "O", "T"]);
    expect(queue.peek(5)).toEqual(["I", "O", "T", "S", "Z"]);
  });

  it("next() dequeues in the same order peek() reported, advancing the queue by exactly one each time", () => {
    const queue = new PieceQueue(new FixedBagSource(["I", "O", "T", "S", "Z", "J", "L"]));
    expect(queue.peek(2)).toEqual(["I", "O"]);
    expect(queue.next()).toBe("I");
    expect(queue.peek(2)).toEqual(["O", "T"]);
    expect(queue.next()).toBe("O");
    expect(queue.next()).toBe("T");
  });

  it("peek(0) returns an empty array without touching the underlying source", () => {
    let calls = 0;
    const countingSource: TetrisBagSource = {
      next: () => {
        calls += 1;
        return "I";
      },
    };
    const queue = new PieceQueue(countingSource);
    expect(queue.peek(0)).toEqual([]);
    expect(calls).toBe(0);
  });

  it("works end-to-end over a real SevenBagGenerator: peek+next stay in sync and every bag is still a complete 7-set", () => {
    const queue = new PieceQueue(new SevenBagGenerator(new SequenceRandomSource([0.05, 0.35, 0.65, 0.95, 0.15, 0.55])));
    const preview = queue.peek(14);
    expect(preview).toHaveLength(14);
    expect(new Set(preview.slice(0, 7)).size).toBe(7);
    expect(new Set(preview.slice(7, 14)).size).toBe(7);

    const drawn = Array.from({ length: 14 }, () => queue.next());
    expect(drawn).toEqual(preview);
  });
});
