import {
  BOARD_COLS,
  FORMATION_TOP_ROW,
  MAX_NEW_BRICKS_PER_TURN,
  RED_BONUS_BALL_SPAWN_CHANCE,
  type Brick,
  type RandomSource,
  type RedBonusBall,
} from "./types";

/**
 * How tough a freshly-spawned brick at this level is. Deliberately simple
 * and monotonic — level 1-2 bricks are always 1 HP (so the very first
 * volley teaches the mechanic instantly), then gradually toughens up.
 * `brickHP ≈ 1 + floor(level / 3)`, per the design brief.
 */
export function brickHpForLevel(level: number): number {
  return 1 + Math.floor(Math.max(0, level - 1) / 3);
}

/**
 * How many new bricks spawn this turn. Never more than
 * MAX_NEW_BRICKS_PER_TURN, and grows slowly so early boards stay sparse —
 * empty cells are the common case, not dense walls.
 */
export function newBrickCountForLevel(level: number, random: RandomSource): number {
  const cap = Math.min(MAX_NEW_BRICKS_PER_TURN, 2 + Math.floor(Math.max(0, level - 1) / 5));
  return 1 + Math.floor(random.next() * cap);
}

/**
 * Generates a sparse batch of new bricks for row FORMATION_TOP_ROW (the
 * top of the *active* formation area — row 0 is a permanent empty buffer
 * and never receives anything). Existing bricks are only ever shifted
 * downward by the caller before this runs, so this row is always empty of
 * old bricks; this only needs to avoid placing two new bricks on the same
 * column. Never more than MAX_NEW_BRICKS_PER_TURN.
 */
export function generateBricks(level: number, random: RandomSource): Brick[] {
  const count = Math.min(BOARD_COLS, newBrickCountForLevel(level, random));
  const hp = brickHpForLevel(level);

  const availableCols = Array.from({ length: BOARD_COLS }, (_, i) => i);
  const chosenCols: number[] = [];
  for (let i = 0; i < count && availableCols.length > 0; i++) {
    const pickIndex = Math.floor(random.next() * availableCols.length);
    chosenCols.push(availableCols.splice(pickIndex, 1)[0]);
  }

  return chosenCols.map((col) => ({ row: FORMATION_TOP_ROW, col, hp, maxHp: hp }));
}

/**
 * Generates this turn's full new formation — bricks and (rarely) a red
 * bonus ball — as one call, so the two never collide: the bonus ball, if
 * any, only ever picks from columns the bricks didn't already take.
 * Bricks are capped at MAX_NEW_BRICKS_PER_TURN; the red bonus ball is
 * entirely separate from that cap (0 or 1 per turn, never counted against
 * it). Both always spawn at FORMATION_TOP_ROW — row 0 stays empty.
 */
export function generateFormation(
  level: number,
  random: RandomSource,
): { bricks: Brick[]; redBonusBalls: RedBonusBall[] } {
  const bricks = generateBricks(level, random);
  const takenCols = new Set(bricks.map((b) => b.col));
  const remainingCols = Array.from({ length: BOARD_COLS }, (_, i) => i).filter((c) => !takenCols.has(c));

  const redBonusBalls: RedBonusBall[] = [];
  if (remainingCols.length > 0 && random.next() < RED_BONUS_BALL_SPAWN_CHANCE) {
    const col = remainingCols[Math.floor(random.next() * remainingCols.length)];
    redBonusBalls.push({ row: FORMATION_TOP_ROW, col });
  }

  return { bricks, redBonusBalls };
}
