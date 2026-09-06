import { cellsForPiece } from "./pieces";
import { isCellEmpty } from "./board";
import type { ActivePiece, Board } from "./types";

/**
 * The single authoritative collision check: a piece may occupy a position
 * only if every one of its cells is both in-bounds (horizontal walls,
 * floor, and — since isCellEmpty rejects any out-of-bounds coordinate —
 * implicitly the ceiling too) and unoccupied by a previously locked
 * piece. Movement, soft/hard drop, locking, and spawn validity all call
 * this one function rather than re-deriving their own bounds/occupancy
 * checks.
 */
export function canPlace(board: Board, piece: ActivePiece): boolean {
  return cellsForPiece(piece).every((cell) => isCellEmpty(board, cell.row, cell.col));
}

/**
 * How many rows `piece` can fall, one row at a time, before the next row
 * down would collide — i.e. the hard-drop distance. Computed directly via
 * repeated canPlace() checks rather than cloning/mutating any state; O(board
 * height) in the worst case, never more.
 */
export function getDropDistance(board: Board, piece: ActivePiece): number {
  let distance = 0;
  while (canPlace(board, { ...piece, y: piece.y + distance + 1 })) {
    distance += 1;
  }
  return distance;
}
