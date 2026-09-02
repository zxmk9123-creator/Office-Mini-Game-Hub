/**
 * Source of randomness for brick placement/HP and the multi-ball angular
 * spread. Injectable so tests can force deterministic sequences instead of
 * depending on real randomness — same pattern as ReactionTest's
 * RandomDelaySource.
 */
export interface RandomSource {
  /** A float in [0, 1), same contract as Math.random(). */
  next(): number;
}

/** `Math.random` is a plain JS builtin (not a browser API), so a default lives in game-core. */
export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

/** Logical (not pixel) board geometry. The view maps this onto its actual canvas size. */
export const BOARD_COLS = 7;
export const BOARD_ROWS = 7;
/** Extra logical rows below the brick grid where balls travel and the launch point sits. */
export const LAUNCH_MARGIN_ROWS = 2.5;
/**
 * Vertical gap, in logical rows, between the top wall and row 0's brick
 * edge. Without this, a ball bouncing off the top wall lands exactly on
 * row 0's top edge (they'd be the same y coordinate) — brick and wall
 * collisions would then resolve against each other every single frame,
 * permanently trapping the ball in a zero-progress bounce loop. `rowToY`/
 * `colToX` below are the only place row/col indices become physics
 * (and rendering) y/x coordinates — game *rules* (shifting rows,
 * game-over at row >= BOARD_ROWS) stay in plain row-index space.
 */
export const BRICK_TOP_MARGIN_ROWS = 0.6;
export const BOARD_WIDTH = BOARD_COLS;
export const BOARD_HEIGHT = BOARD_ROWS + BRICK_TOP_MARGIN_ROWS + LAUNCH_MARGIN_ROWS;

/** Logical x of a column's left edge. */
export function colToX(col: number): number {
  return col;
}

/** Logical y of a brick row's top edge. */
export function rowToY(row: number): number {
  return row + BRICK_TOP_MARGIN_ROWS;
}

export const BALL_RADIUS = 0.12;
export const BASE_BALL_SPEED = 12; // logical units / second (2x the original 6)
export const MAX_BALL_SPEED = 20; // 2x the original 10

/** Never spawn more than this many new bricks in a single turn. Red bonus balls are separate from this cap. */
export const MAX_NEW_BRICKS_PER_TURN = 5;

/** Row 0 is a permanent empty buffer — nothing may ever spawn or persist there. The active formation area is rows 1..BOARD_ROWS-1. */
export const FORMATION_TOP_ROW = 1;

/** Aim is clamped to this many radians either side of straight up — never horizontal or downward. */
export const MAX_AIM_RADIANS = (70 * Math.PI) / 180;

export interface Brick {
  row: number;
  col: number;
  hp: number;
  /** HP this brick spawned with — used only to scale its destruction bonus. */
  maxHp: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
}

/**
 * A static, grid-positioned collectible that descends with the formation
 * exactly like a Brick, but carries no HP: a single touch from a
 * projectile Ball collects it (bonus score, no bounce-damage bookkeeping)
 * and it never triggers Game Over — reaching the bottom just loses it.
 */
export interface RedBonusBall {
  row: number;
  col: number;
}

export type SwipeBrickBreakerPhase = "ready" | "aiming" | "volley" | "gameOver";

export interface SwipeBrickBreakerState {
  phase: SwipeBrickBreakerPhase;
  level: number;
  ballCount: number;
  score: number;
  bricks: Brick[];
  redBonusBalls: RedBonusBall[];
  balls: Ball[];
  /** Radians from straight up, clamped to +/-MAX_AIM_RADIANS. Only meaningful while phase === "aiming". */
  aimAngleRad: number;
  /**
   * Red bonus balls collected so far during the volley currently in
   * flight. Ball count only ever grows from a collection, but the new
   * ball must not become available mid-volley — this accumulates across
   * ticks and is applied to ballCount (then reset to 0) once the volley
   * fully resolves, so the gain always lands on the NEXT volley.
   */
  pendingBallGain: number;
}

export type SwipeBrickBreakerInput =
  | { type: "aim"; angleRad: number }
  | { type: "cancelAim" }
  | { type: "fire" }
  | { type: "tick"; dtMs: number };

export interface SwipeBrickBreakerResultMetadata {
  level: number;
  bricksDestroyed: number;
  redBonusBallsCollected: number;
}
