import { cellsForPiece, createEmptyBoard } from "./pieces";
import type { ActivePiece, Board, Cell } from "./types";

export { createEmptyBoard };

export function boardWidth(board: Board): number {
  return board[0]?.length ?? 0;
}

export function boardHeight(board: Board): number {
  return board.length;
}

/** True when (row, col) is a real cell on this board — neither off the top/bottom nor off either side. */
export function isInBounds(board: Board, row: number, col: number): boolean {
  return row >= 0 && row < boardHeight(board) && col >= 0 && col < boardWidth(board);
}

/** Reads a cell. Callers must check isInBounds first — this never guesses at out-of-range coordinates. */
export function getCell(board: Board, row: number, col: number): Cell {
  return board[row][col];
}

/** True only for an in-bounds, unoccupied cell — out-of-bounds is never "empty". */
export function isCellEmpty(board: Board, row: number, col: number): boolean {
  return isInBounds(board, row, col) && board[row][col] === null;
}

/**
 * Locks `piece` permanently into the board, stamping each of its cells
 * with the piece's type (preserving type/color information for rendering)
 * — a new Board, never mutating `board` in place. Callers must have
 * already confirmed `canPlace(board, piece)`; this does not re-check, the
 * same way getCell trusts a prior isInBounds check.
 */
export function mergePieceIntoBoard(board: Board, piece: ActivePiece): Board {
  const next = board.map((row) => row.slice());
  for (const { row, col } of cellsForPiece(piece)) {
    next[row][col] = piece.type;
  }
  return next;
}

/** Row indices (top to bottom) where every cell is occupied — a completed row, ready to clear. */
export function getCompletedRows(board: Board): number[] {
  const completed: number[] = [];
  for (let row = 0; row < board.length; row++) {
    if (board[row].every((cell) => cell !== null)) {
      completed.push(row);
    }
  }
  return completed;
}

/**
 * Removes every completed row in one atomic step (single, double, triple,
 * Tetris, or any non-consecutive combination alike — filtering out
 * exactly the completed indices handles all of them identically, with no
 * per-row special-casing), preserving every surviving cell's exact
 * horizontal position and piece-type information, and prepending that
 * same number of fresh empty rows at the top so the board stays exactly
 * width x height. A no-op (returns `board` unchanged) when nothing is
 * complete, so locking a piece that doesn't clear any line never
 * allocates a new board here.
 */
export function clearCompletedRows(board: Board): Board {
  const completed = getCompletedRows(board);
  if (completed.length === 0) {
    return board;
  }
  const completedSet = new Set(completed);
  const survivingRows = board.filter((_, row) => !completedSet.has(row));
  const width = boardWidth(board);
  const emptyRows: Board = Array.from({ length: completed.length }, () =>
    Array.from({ length: width }, (): Cell => null),
  );
  return [...emptyRows, ...survivingRows];
}
