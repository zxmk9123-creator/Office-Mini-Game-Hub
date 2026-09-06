import type { ActivePiece, Board, Cell, PieceCellOffset, PieceType, Rotation } from "./types";

/**
 * Standard (Tetris Guideline / SRS) per-rotation cell offsets, relative to
 * each piece's bounding-box top-left corner — I and O use a 4x4 box, every
 * other piece a 3x3 box. Pure data: the rotation SYSTEM (how a piece
 * transitions between these states, including wall kicks) is a later
 * phase; this table only says what a piece looks like once in a given
 * state, which board.ts needs today for spawning and cell lookups.
 */
const PIECE_SHAPES: Record<PieceType, Record<Rotation, PieceCellOffset[]>> = {
  I: {
    0: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }],
    1: [{ row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }, { row: 3, col: 2 }],
    2: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }],
    3: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 3, col: 1 }],
  },
  O: {
    0: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
    1: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
    2: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
    3: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
  },
  T: {
    0: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    1: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }],
    2: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }],
    3: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
  },
  S: {
    0: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    1: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }],
    2: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 1 }],
    3: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
  },
  Z: {
    0: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    1: [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }],
    2: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
    3: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 0 }],
  },
  J: {
    0: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    1: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
    2: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }],
    3: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }],
  },
  L: {
    0: [{ row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    1: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
    2: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 0 }],
    3: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
  },
};

/** Every piece spawns at the same bounding-box column (centered on a 10-wide board) and the top of the buffer area. */
export const SPAWN_X = 3;
export const SPAWN_Y = 0;

export function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: SPAWN_X, y: SPAWN_Y };
}

/** The piece's occupied cells, in absolute board (row, col) coordinates. Pure data lookup — no bounds/collision checking (that's collision.ts, a later phase). */
export function cellsForPiece(piece: ActivePiece): PieceCellOffset[] {
  return PIECE_SHAPES[piece.type][piece.rotation].map(({ row, col }) => ({
    row: row + piece.y,
    col: col + piece.x,
  }));
}

export function createEmptyBoard(width: number, height: number): Board {
  return Array.from({ length: height }, () => Array.from({ length: width }, (): Cell => null));
}
