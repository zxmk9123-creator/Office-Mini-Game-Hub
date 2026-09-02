import {
  BOARD_COLS,
  MAX_NEW_BRICKS_PER_TURN,
  type Brick,
  type RandomSource,
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
 * Generates a sparse batch of new bricks for row 0 (the top of the brick
 * grid) — always safe with respect to the bottom "danger" row since row 0
 * can never be the bottom row. Existing bricks are only ever shifted
 * downward by the caller before this runs, so row 0 is always empty of
 * old bricks; this only needs to avoid placing two new bricks on the same
 * column.
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

  return chosenCols.map((col) => ({ row: 0, col, hp, maxHp: hp }));
}
