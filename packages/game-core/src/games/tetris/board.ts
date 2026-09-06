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
