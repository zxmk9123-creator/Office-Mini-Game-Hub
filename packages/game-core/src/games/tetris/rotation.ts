import type { ActivePiece, PieceType, Rotation } from "./types";

export type RotationDirection = "cw" | "ccw";

/** 0 -> 1 -> 2 -> 3 -> 0 clockwise; 0 -> 3 -> 2 -> 1 -> 0 counter-clockwise. */
export function nextRotation(rotation: Rotation, direction: RotationDirection): Rotation {
  return ((rotation + (direction === "cw" ? 1 : 3)) % 4) as Rotation;
}

interface KickOffset {
  dx: number;
  dy: number;
}

const NO_KICK: KickOffset[] = [{ dx: 0, dy: 0 }];

function transitionKey(from: Rotation, to: Rotation): string {
  return `${from}${to}`;
}

/**
 * Standard SRS ("Super Rotation System") wall-kick offsets for the five
 * JLSTZ pieces (they all share one table), keyed by "<fromRotation><toRotation>".
 * These are the published Tetris Guideline values — not invented — with
 * one deliberate conversion: the Guideline table is documented in a
 * y-up (row 0 at the bottom) coordinate system, while this engine's Board
 * has row 0 at the top and row increasing downward (see types.ts). Every
 * dy below is the Guideline value negated to account for that, so the
 * *behavior* (which way a kick actually nudges the piece on screen)
 * matches the published table exactly.
 */
const JLSTZ_KICKS: Record<string, KickOffset[]> = {
  "01": [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: 2 }, { dx: -1, dy: 2 }],
  "10": [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 }],
  "12": [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 }],
  "21": [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: 2 }, { dx: -1, dy: 2 }],
  "23": [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: -1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 }],
  "32": [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: -2 }, { dx: -1, dy: -2 }],
  "30": [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: -2 }, { dx: -1, dy: -2 }],
  "03": [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: -1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 }],
};

/**
 * The I piece's separate, wider SRS kick table (same Guideline-to-row-
 * down dy conversion as JLSTZ_KICKS above).
 */
const I_KICKS: Record<string, KickOffset[]> = {
  "01": [{ dx: 0, dy: 0 }, { dx: -2, dy: 0 }, { dx: 1, dy: 0 }, { dx: -2, dy: 1 }, { dx: 1, dy: -2 }],
  "10": [{ dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 2, dy: -1 }, { dx: -1, dy: 2 }],
  "12": [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: 2, dy: 0 }, { dx: -1, dy: -2 }, { dx: 2, dy: 1 }],
  "21": [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -2, dy: 0 }, { dx: 1, dy: 2 }, { dx: -2, dy: -1 }],
  "23": [{ dx: 0, dy: 0 }, { dx: 2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 2, dy: -1 }, { dx: -1, dy: 2 }],
  "32": [{ dx: 0, dy: 0 }, { dx: -2, dy: 0 }, { dx: 1, dy: 0 }, { dx: -2, dy: 1 }, { dx: 1, dy: -2 }],
  "30": [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -2, dy: 0 }, { dx: 1, dy: 2 }, { dx: -2, dy: -1 }],
  "03": [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: 2, dy: 0 }, { dx: -1, dy: -2 }, { dx: 2, dy: 1 }],
};

function kicksFor(type: PieceType, from: Rotation, to: Rotation): KickOffset[] {
  // O never translates on rotation — its shape is already identical in
  // every rotation state (see pieces.ts), so the only "candidate" is the
  // unmodified position; per standard SRS, O has no wall-kick table.
  if (type === "O") return NO_KICK;
  const table = type === "I" ? I_KICKS : JLSTZ_KICKS;
  return table[transitionKey(from, to)] ?? NO_KICK;
}

/**
 * Every candidate position to try, in order, for rotating `piece` in
 * `direction` — the new rotation state applied first with no offset
 * (kick #1 is always (0,0), i.e. "the normal rotated position"), then
 * each SRS wall-kick offset in the table's documented priority order.
 * Callers (tetris.ts) test each candidate with the existing canPlace()
 * and accept the first that succeeds — this function does no collision
 * checking itself, keeping exactly one authoritative collision system.
 */
export function getRotationCandidates(piece: ActivePiece, direction: RotationDirection): ActivePiece[] {
  const rotation = nextRotation(piece.rotation, direction);
  const kicks = kicksFor(piece.type, piece.rotation, rotation);
  return kicks.map(({ dx, dy }) => ({
    type: piece.type,
    rotation,
    x: piece.x + dx,
    y: piece.y + dy,
  }));
}
