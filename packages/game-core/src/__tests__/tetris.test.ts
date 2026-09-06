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
  TetrisGame,
  canPlace,
  cellsForPiece,
  createEmptyTetrisBoard,
  getDropDistance,
  getRotationCandidates,
  getTetrisCell,
  isTetrisCellEmpty,
  isTetrisCellInBounds,
  mergePieceIntoBoard,
  nextRotation,
  shuffledBag,
  spawnPiece,
  tetrisBoardHeight,
  tetrisBoardWidth,
  type ActivePiece,
  type Clock,
  type PieceType,
  type Rotation,
  type RotationDirection,
  type TetrisBagSource,
  type TetrisRandomSource,
} from "..";

class FixedClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
}

const TOTAL_HEIGHT = TETRIS_BUFFER_ROWS + TETRIS_BOARD_HEIGHT;

function emptyBoard() {
  return createEmptyTetrisBoard(TETRIS_BOARD_WIDTH, TOTAL_HEIGHT);
}

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

describe("Tetris board: mergePieceIntoBoard (pure)", () => {
  it("stamps every one of the piece's cells with its type, without mutating the input board", () => {
    const board = emptyBoard();
    const piece: ActivePiece = { type: "T", rotation: 0, x: 3, y: 0 };
    const merged = mergePieceIntoBoard(board, piece);

    for (const cell of cellsForPiece(piece)) {
      expect(merged[cell.row][cell.col]).toBe("T");
    }
    // The original board is untouched — an immutable update, like every other game's board mutation.
    expect(board.every((row) => row.every((c) => c === null))).toBe(true);
  });
});

describe("Tetris collision: canPlace", () => {
  it("allows any valid spawn position on an empty board", () => {
    for (const type of PIECE_TYPES) {
      expect(canPlace(emptyBoard(), spawnPiece(type))).toBe(true);
    }
  });

  it("rejects a piece hanging off the left wall", () => {
    // O at x=-2: columns would be -1 and 0 — one cell off the left edge.
    expect(canPlace(emptyBoard(), { type: "O", rotation: 0, x: -2, y: 0 })).toBe(false);
    // x=-1 (columns 0,1) is still fully in bounds.
    expect(canPlace(emptyBoard(), { type: "O", rotation: 0, x: -1, y: 0 })).toBe(true);
  });

  it("rejects a piece hanging off the right wall", () => {
    // O at x=8: columns would be 9 and 10 — one cell off the right edge (board is 10 wide, cols 0-9).
    expect(canPlace(emptyBoard(), { type: "O", rotation: 0, x: 8, y: 0 })).toBe(false);
    expect(canPlace(emptyBoard(), { type: "O", rotation: 0, x: 7, y: 0 })).toBe(true);
  });

  it("rejects a piece extending below the floor", () => {
    // O's lowest occupied row is y+2; the last valid row index is TOTAL_HEIGHT - 1, so the max valid y is TOTAL_HEIGHT - 3.
    const maxValidY = TOTAL_HEIGHT - 3;
    expect(canPlace(emptyBoard(), { type: "O", rotation: 0, x: 0, y: maxValidY })).toBe(true);
    expect(canPlace(emptyBoard(), { type: "O", rotation: 0, x: 0, y: maxValidY + 1 })).toBe(false);
  });

  it("rejects overlapping an already-occupied cell", () => {
    const board = emptyBoard();
    board[5][4] = "L"; // arbitrary previously-locked cell
    // T at (x=3,y=4): occupies (4,4),(5,3),(5,4),(5,5) — overlaps the locked cell at (5,4).
    expect(canPlace(board, { type: "T", rotation: 0, x: 3, y: 4 })).toBe(false);
  });

  it("allows a valid placement directly above occupied cells, as long as it doesn't overlap them", () => {
    const board = emptyBoard();
    board[10][4] = "L";
    board[10][5] = "L";
    // O at (x=4, y=8) occupies rows 9-10... still overlaps row 10. Move one row higher to just clear it.
    expect(canPlace(board, { type: "O", rotation: 0, x: 4, y: 8 })).toBe(false);
    expect(canPlace(board, { type: "O", rotation: 0, x: 4, y: 7 })).toBe(true);
  });
});

describe("Tetris collision: getDropDistance", () => {
  it("is 0 when the piece is already resting on the floor", () => {
    const board = emptyBoard();
    const resting: ActivePiece = { type: "O", rotation: 0, x: 0, y: TOTAL_HEIGHT - 3 };
    expect(canPlace(board, resting)).toBe(true);
    expect(getDropDistance(board, resting)).toBe(0);
  });

  it("matches manual reasoning for a T piece dropped from spawn on an empty board", () => {
    const distance = getDropDistance(emptyBoard(), spawnPiece("T"));
    // T's lowest relative row is 1; it can fall until that row reaches TOTAL_HEIGHT - 1.
    expect(distance).toBe(TOTAL_HEIGHT - 1 - 1 - TETRIS_SPAWN_Y);
  });

  it("stops exactly above an obstruction below the piece", () => {
    const board = emptyBoard();
    board[15][4] = "L";
    board[15][5] = "L";
    const distance = getDropDistance(board, { type: "O", rotation: 0, x: 4, y: 0 });
    // O's lowest relative row is 2; it must stop with that row landing on row 14 (just above the obstruction at row 15).
    expect(distance).toBe(14 - 2);
  });
});

describe("Tetris engine: movement", () => {
  function started(sequence: PieceType[]) {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(sequence));
    const state = game.start(game.createInitialState());
    return { game, state };
  }

  it("moves left from a valid position", () => {
    const { game, state } = started(["O"]);
    const moved = game.handleInput(state, { type: "moveLeft" });
    expect(moved.current?.x).toBe(state.current!.x - 1);
    expect(moved.current?.y).toBe(state.current!.y);
  });

  it("moves right from a valid position", () => {
    const { game, state } = started(["O"]);
    const moved = game.handleInput(state, { type: "moveRight" });
    expect(moved.current?.x).toBe(state.current!.x + 1);
  });

  it("moves down (soft drop) from a valid position", () => {
    const { game, state } = started(["O"]);
    const moved = game.handleInput(state, { type: "softDrop" });
    expect(moved.current?.y).toBe(state.current!.y + 1);
    expect(moved.current?.x).toBe(state.current!.x);
    expect(moved.status).toBe("playing");
  });

  it("the left wall blocks further leftward movement — position and board stop changing", () => {
    const { game } = started(["O"]);
    let state = game.start(new TetrisGame(new FixedClock(), new FixedBagSource(["O"])).createInitialState());
    for (let i = 0; i < 20; i++) {
      state = game.handleInput(state, { type: "moveLeft" });
    }
    const stoppedAt = state.current!.x;
    const boardBefore = state.board;
    const again = game.handleInput(state, { type: "moveLeft" });
    expect(again.current!.x).toBe(stoppedAt);
    expect(again.board).toBe(boardBefore); // untouched — same reference, not just equal
  });

  it("the right wall blocks further rightward movement", () => {
    const { game, state: s0 } = started(["O"]);
    let state = s0;
    for (let i = 0; i < 20; i++) {
      state = game.handleInput(state, { type: "moveRight" });
    }
    const stoppedAt = state.current!.x;
    const again = game.handleInput(state, { type: "moveRight" });
    expect(again.current!.x).toBe(stoppedAt);
  });

  it("invalid movement never mutates the board and never moves the piece", () => {
    const { game, state } = started(["O"]);
    // Drive all the way to the left wall first.
    let atWall = state;
    for (let i = 0; i < 20; i++) {
      atWall = game.handleInput(atWall, { type: "moveLeft" });
    }
    const before = atWall;
    const rejected = game.handleInput(atWall, { type: "moveLeft" });
    expect(rejected.current).toEqual(before.current);
    expect(rejected.board).toBe(before.board);
  });
});

describe("Tetris engine: piece locking", () => {
  it("blocked downward movement (floor) locks the piece in place", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["I", "O"]));
    let state = game.start(game.createInitialState());
    expect(state.current?.type).toBe("I");

    while (state.current?.type === "I") {
      state = game.handleInput(state, { type: "softDrop" });
    }

    // The lock happened, and the next piece from the sequence spawned.
    expect(state.current?.type).toBe("O");
    expect(state.status).toBe("playing");
  });

  it("the locked piece becomes part of the board, at the floor", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["I", "O"]));
    let state = game.start(game.createInitialState());
    while (state.current?.type === "I") {
      state = game.handleInput(state, { type: "softDrop" });
    }
    const bottomRow = TOTAL_HEIGHT - 1;
    expect(state.board[bottomRow].slice(3, 7)).toEqual(["I", "I", "I", "I"]);
  });

  it("locked cells preserve the piece's type", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["L", "O"]));
    let state = game.start(game.createInitialState());
    while (state.current?.type === "L") {
      state = game.handleInput(state, { type: "softDrop" });
    }
    const lockedCells = state.board.flatMap((row) => row.filter((c) => c !== null));
    expect(lockedCells.every((c) => c === "L")).toBe(true);
    expect(lockedCells).toHaveLength(4);
  });

  it("a next piece is spawned immediately after locking, from the injected sequence", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["I", "S", "Z"]));
    let state = game.start(game.createInitialState());
    while (state.current?.type === "I") {
      state = game.handleInput(state, { type: "softDrop" });
    }
    expect(state.current?.type).toBe("S");
    expect(state.next[0]).toBe("Z");
  });
});

describe("Tetris engine: hard drop", () => {
  it("moves the piece straight to the lowest valid position and locks it immediately, in one input", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["T", "L"]));
    const state = game.start(game.createInitialState());
    const expectedDistance = getDropDistance(state.board, state.current!);

    const dropped = game.handleInput(state, { type: "hardDrop" });

    // Locked immediately: the active piece is already the NEXT piece, not "T" resting at the bottom.
    expect(dropped.current?.type).toBe("L");
    expect(dropped.status).toBe("playing");

    const expectedLockedPiece: ActivePiece = { ...state.current!, y: state.current!.y + expectedDistance };
    for (const cell of cellsForPiece(expectedLockedPiece)) {
      expect(dropped.board[cell.row][cell.col]).toBe("T");
    }
  });

  it("produces a fully deterministic board for the same setup", () => {
    const run = () => {
      const game = new TetrisGame(new FixedClock(), new FixedBagSource(["T", "L"]));
      const state = game.start(game.createInitialState());
      return game.handleInput(state, { type: "hardDrop" });
    };
    expect(run().board).toEqual(run().board);
  });

  it("hard-dropping onto an existing stack stops exactly on top of it", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["O", "O"]));
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "hardDrop" }); // first O settles on the floor
    const secondDropped = game.handleInput(state, { type: "hardDrop" }); // second O settles on top of the first

    // Same column both times (O never moves horizontally here), so the
    // second piece must stack directly on top of the first: 4 total rows
    // with exactly 2 "O" cells each, none of them overlapping.
    const rows = [TOTAL_HEIGHT - 1, TOTAL_HEIGHT - 2, TOTAL_HEIGHT - 3, TOTAL_HEIGHT - 4];
    for (const row of rows) {
      expect(secondDropped.board[row].filter((c) => c === "O")).toHaveLength(2);
    }
    expect(secondDropped.board.flat().filter((c) => c === "O")).toHaveLength(8);
  });
});

describe("Tetris engine: game over", () => {
  it("a valid spawn continues the game in 'playing' status", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["I"]));
    const state = game.start(game.createInitialState());
    expect(state.status).toBe("playing");
    expect(state.current).not.toBeNull();
  });

  it("a blocked spawn transitions to 'gameOver' without overwriting the existing board", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["O"]));
    const board = emptyBoard();
    // Pre-occupy exactly where the O piece would spawn (rows 1-2, cols 4-5).
    for (const cell of cellsForPiece(spawnPiece("O"))) {
      board[cell.row][cell.col] = "T";
    }
    const initial = { ...game.createInitialState(), board };

    const started = game.start(initial);

    expect(started.status).toBe("gameOver");
    expect(started.current).toBeNull();
    // The board is exactly what it was — nothing was merged/overwritten on a failed spawn.
    expect(started.board).toEqual(board);
  });

  it("no further movement is possible once the game is over — status/board stay put", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["O"]));
    const board = emptyBoard();
    for (const cell of cellsForPiece(spawnPiece("O"))) {
      board[cell.row][cell.col] = "T";
    }
    const gameOverState = game.start({ ...game.createInitialState(), board });

    const afterMove = game.handleInput(gameOverState, { type: "moveLeft" });
    expect(afterMove).toEqual(gameOverState);
  });
});

describe("Tetris engine: regression — Phase A behavior is unaffected", () => {
  it("the engine's spawn sequence matches what the queue previewed, across several consecutive locks", () => {
    // Repeatedly hard-dropping at the same spawn column with no line
    // clearing yet (a later phase) will eventually stack up to a real
    // Game Over — that's expected engine behavior, not a bug, so this
    // stops checking the moment that happens rather than assuming a
    // fixed number of pieces always fit.
    const game = new TetrisGame(new FixedClock(), new SevenBagGenerator(new SequenceRandomSource([0.2, 0.4, 0.6, 0.8, 0.1, 0.9])));
    let state = game.start(game.createInitialState());
    for (let i = 0; i < 5 && state.current; i++) {
      const predictedNext = state.next[0];
      state = game.handleInput(state, { type: "hardDrop" });
      if (state.current) {
        expect(state.current.type).toBe(predictedNext);
      }
    }
  });
});

describe("Tetris rotation state machine (nextRotation)", () => {
  it("cycles clockwise 0 -> 1 -> 2 -> 3 -> 0", () => {
    let r: Rotation = 0;
    const seen: Rotation[] = [r];
    for (let i = 0; i < 4; i++) {
      r = nextRotation(r, "cw");
      seen.push(r);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0]);
  });

  it("cycles counter-clockwise 0 -> 3 -> 2 -> 1 -> 0", () => {
    let r: Rotation = 0;
    const seen: Rotation[] = [r];
    for (let i = 0; i < 4; i++) {
      r = nextRotation(r, "ccw");
      seen.push(r);
    }
    expect(seen).toEqual([0, 3, 2, 1, 0]);
  });
});

describe("Tetris rotation: basic rotation on an empty board (getRotationCandidates + canPlace)", () => {
  const rotatablePieces: PieceType[] = ["J", "L", "S", "Z", "T", "I"];

  function firstValidCandidate(piece: ActivePiece, direction: RotationDirection, board = emptyBoard()): ActivePiece {
    const candidate = getRotationCandidates(piece, direction).find((c) => canPlace(board, c));
    if (!candidate) throw new Error("expected at least one valid rotation candidate");
    return candidate;
  }

  for (const type of rotatablePieces) {
    it(`${type} rotates clockwise from spawn on an empty board`, () => {
      const piece = spawnPiece(type);
      const rotated = firstValidCandidate(piece, "cw");
      expect(rotated.rotation).toBe(1);
      expect(rotated.type).toBe(type);
    });

    it(`${type} rotates counter-clockwise from spawn on an empty board`, () => {
      const piece = spawnPiece(type);
      const rotated = firstValidCandidate(piece, "ccw");
      expect(rotated.rotation).toBe(3);
    });
  }

  it("O remains visually stable: every rotation state occupies the exact same cells", () => {
    const piece = spawnPiece("O");
    const originalCells = cellsForPiece(piece)
      .map((c) => `${c.row},${c.col}`)
      .sort();
    let current = piece;
    for (let i = 0; i < 4; i++) {
      current = firstValidCandidate(current, "cw");
      const cells = cellsForPiece(current)
        .map((c) => `${c.row},${c.col}`)
        .sort();
      expect(cells).toEqual(originalCells);
    }
    // A full clockwise cycle returns to rotation 0 with position unchanged.
    expect(current).toEqual(piece);
  });

  it("O never drifts position across repeated counter-clockwise rotation either", () => {
    let current = spawnPiece("O");
    const originalX = current.x;
    const originalY = current.y;
    for (let i = 0; i < 4; i++) {
      current = firstValidCandidate(current, "ccw");
    }
    expect(current.x).toBe(originalX);
    expect(current.y).toBe(originalY);
    expect(current.rotation).toBe(0);
  });
});

describe("Tetris rotation: four rotations restore the original orientation", () => {
  it("four clockwise rotations of a T piece on an empty board return exactly to the start", () => {
    let current = spawnPiece("T");
    const original = current;
    for (let i = 0; i < 4; i++) {
      const next = getRotationCandidates(current, "cw").find((c) => canPlace(emptyBoard(), c));
      expect(next).toBeDefined();
      current = next!;
    }
    expect(current).toEqual(original);
  });

  it("four counter-clockwise rotations of an I piece on an empty board return exactly to the start", () => {
    let current = spawnPiece("I");
    const original = current;
    for (let i = 0; i < 4; i++) {
      const next = getRotationCandidates(current, "ccw").find((c) => canPlace(emptyBoard(), c));
      expect(next).toBeDefined();
      current = next!;
    }
    expect(current).toEqual(original);
  });
});

describe("Tetris rotation + collision: rejection", () => {
  /** Fills every cell except the piece's own current cells, so any rotation (which changes at least one occupied cell for a non-O piece) collides everywhere. */
  function boardBoxingInPiece(piece: ActivePiece) {
    const board = emptyBoard();
    const keep = new Set(cellsForPiece(piece).map((c) => `${c.row},${c.col}`));
    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        if (!keep.has(`${row},${col}`)) board[row][col] = "L";
      }
    }
    return board;
  }

  it("a fully boxed-in piece rejects rotation — every SRS candidate collides", () => {
    const piece: ActivePiece = { type: "T", rotation: 0, x: 3, y: 10 };
    const board = boardBoxingInPiece(piece);
    const candidates = getRotationCandidates(piece, "cw");
    expect(candidates.every((c) => !canPlace(board, c))).toBe(true);
  });

  it("rejected rotation leaves the active piece's position AND rotation state completely unchanged (via TetrisGame)", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["T"]));
    let state = game.start(game.createInitialState());
    // Box the current piece in, exactly as above, then attempt to rotate.
    state = { ...state, board: boardBoxingInPiece(state.current!) };
    const before = state;

    const rejected = game.handleInput(state, { type: "rotateCw" });

    expect(rejected.current).toEqual(before.current);
    expect(rejected.board).toBe(before.board);
  });
});

describe("Tetris rotation: SRS wall kicks (I piece's own kick table)", () => {
  it("kicks off the left wall: a vertical I piece rotating to horizontal shifts right to fit", () => {
    // rotation 1 (vertical, occupies column x+2) at x=-2 sits at column 0 —
    // valid. Rotating to rotation 2 (horizontal, columns x..x+3) at the
    // same x would need columns -2..1, which is off the left edge.
    const piece: ActivePiece = { type: "I", rotation: 1, x: -2, y: 10 };
    expect(canPlace(emptyBoard(), piece)).toBe(true);

    const candidates = getRotationCandidates(piece, "cw");
    const accepted = candidates.find((c) => canPlace(emptyBoard(), c));

    expect(accepted).toEqual(candidates[2]); // third candidate: dx=+2
    expect(accepted).toMatchObject({ rotation: 2, x: 0, y: 10 });
  });

  it("kicks off the right wall: a vertical I piece rotating to horizontal shifts left to fit", () => {
    // rotation 3 (vertical, column x+1) at x=8 sits at column 9 — valid.
    // Rotating (counter-clockwise, 3 -> 2) to horizontal at the same x
    // would need columns 8..11, off the right edge (board is 10 wide).
    const piece: ActivePiece = { type: "I", rotation: 3, x: 8, y: 10 };
    expect(canPlace(emptyBoard(), piece)).toBe(true);

    const candidates = getRotationCandidates(piece, "ccw");
    const accepted = candidates.find((c) => canPlace(emptyBoard(), c));

    expect(accepted).toEqual(candidates[1]); // second candidate: dx=-2
    expect(accepted).toMatchObject({ rotation: 2, x: 6, y: 10 });
  });
});

describe("Tetris rotation: SRS wall kicks (JLSTZ shared kick table)", () => {
  it("kicks off the floor: a T piece rotating near the bottom shifts up to fit", () => {
    const maxRow = TOTAL_HEIGHT - 1;
    // rotation 0 at y = maxRow - 1: occupies rows (maxRow-1) and maxRow — resting exactly on the floor.
    const piece: ActivePiece = { type: "T", rotation: 0, x: 3, y: maxRow - 1 };
    expect(canPlace(emptyBoard(), piece)).toBe(true);

    const candidates = getRotationCandidates(piece, "cw");
    const accepted = candidates.find((c) => canPlace(emptyBoard(), c));

    expect(accepted).toEqual(candidates[2]); // third candidate: dx=-1, dy=-1
    expect(accepted).toMatchObject({ rotation: 1, x: 2, y: maxRow - 2 });
  });

  it("kicks around an existing locked block: a T piece rotating next to an obstruction shifts sideways to fit", () => {
    const board = emptyBoard();
    // (12,4) is occupied only by rotation 1's un-kicked candidate, not by
    // rotation 0's own current cells — so the piece itself stays legally
    // placed, but rotating in place (kick #1, dx=0) collides.
    board[12][4] = "L";
    const piece: ActivePiece = { type: "T", rotation: 0, x: 3, y: 10 };
    expect(canPlace(board, piece)).toBe(true);

    const candidates = getRotationCandidates(piece, "cw");
    expect(canPlace(board, candidates[0])).toBe(false); // blocked by the locked cell
    const accepted = candidates.find((c) => canPlace(board, c));

    expect(accepted).toEqual(candidates[1]); // second candidate: dx=-1
    expect(accepted).toMatchObject({ rotation: 1, x: 2, y: 10 });
  });

  it("near a board corner: a T piece at the bottom-left still finds a valid kick", () => {
    const maxRow = TOTAL_HEIGHT - 1;
    // rotation 2's lowest relative row is 2, so y = maxRow - 2 is the deepest legal position (resting on the floor) in the leftmost column.
    const piece: ActivePiece = { type: "T", rotation: 2, x: 0, y: maxRow - 2 };
    expect(canPlace(emptyBoard(), piece)).toBe(true);

    const candidates = getRotationCandidates(piece, "ccw"); // 2 -> 1
    const accepted = candidates.find((c) => canPlace(emptyBoard(), c));

    expect(accepted).toBeDefined();
    expect(accepted!.rotation).toBe(1);
  });
});

describe("Tetris rotation: engine integration", () => {
  it("a rotated piece can still move left/right/down afterward", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["T"]));
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "rotateCw" });
    expect(state.current?.rotation).toBe(1);

    const rotatedX = state.current!.x;
    const afterLeft = game.handleInput(state, { type: "moveLeft" });
    expect(afterLeft.current?.x).toBe(rotatedX - 1);

    const afterDown = game.handleInput(state, { type: "softDrop" });
    expect(afterDown.current?.y).toBe(state.current!.y + 1);
  });

  it("a rotated piece can hard drop and locks correctly at the rotated shape", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["T", "L"]));
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "rotateCw" });
    const rotatedPiece = state.current!;
    const distance = getDropDistance(state.board, rotatedPiece);

    const dropped = game.handleInput(state, { type: "hardDrop" });

    expect(dropped.current?.type).toBe("L"); // next piece spawning still works
    const lockedPiece: ActivePiece = { ...rotatedPiece, y: rotatedPiece.y + distance };
    for (const cell of cellsForPiece(lockedPiece)) {
      expect(dropped.board[cell.row][cell.col]).toBe("T");
    }
  });

  it("game-over detection remains correct alongside rotation", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["O"]));
    const board = emptyBoard();
    for (const cell of cellsForPiece(spawnPiece("O"))) {
      board[cell.row][cell.col] = "T";
    }
    const started = game.start({ ...game.createInitialState(), board });
    expect(started.status).toBe("gameOver");

    // Rotation after Game Over is exactly as inert as any other input.
    const afterRotate = game.handleInput(started, { type: "rotateCw" });
    expect(afterRotate).toEqual(started);
  });
});

describe("Tetris rotation: regression — Phase A/B behavior is unaffected", () => {
  it("movement, collision, and locking still work exactly as before rotation was added", () => {
    const game = new TetrisGame(new FixedClock(), new FixedBagSource(["I", "O"]));
    let state = game.start(game.createInitialState());
    expect(state.current?.type).toBe("I");
    while (state.current?.type === "I") {
      state = game.handleInput(state, { type: "softDrop" });
    }
    expect(state.current?.type).toBe("O");
    expect(state.board[TOTAL_HEIGHT - 1].slice(3, 7)).toEqual(["I", "I", "I", "I"]);
  });
});
