import { BOARD_HEIGHT, BOARD_WIDTH, colToX, rowToY, type Ball, type Brick, type RedBonusBall } from "./types";

export interface BrickHitEvent {
  brick: Brick;
  destroyed: boolean;
}

export interface StepResult {
  balls: Ball[];
  bricks: Brick[];
  redBonusBalls: RedBonusBall[];
  hits: BrickHitEvent[];
  /** Red bonus balls collected (touched by a projectile ball) this step. */
  collected: RedBonusBall[];
}

function reflect(vx: number, vy: number, nx: number, ny: number): [number, number] {
  const dot = vx * nx + vy * ny;
  return [vx - 2 * dot * nx, vy - 2 * dot * ny];
}

/**
 * A single collision reflects a ball cleanly, but a long enough sequence
 * of wall/brick bounces can still rotate its velocity toward horizontal
 * over time (each reflection is locally correct, but nothing stops many
 * of them in a row from compounding toward a near-horizontal heading).
 * Left unchecked, that produces exactly the "permanently trapped in a
 * perfectly horizontal trajectory" failure mode the physics must avoid —
 * a ball that bounces between walls seemingly forever while barely
 * drifting downward. This re-asserts a minimum vertical share of the
 * ball's speed after every step, preserving total speed (and therefore
 * total energy) exactly, so it never becomes a boost.
 */
const MIN_VERTICAL_SPEED_RATIO = 0.25;

function enforceMinimumVerticalVelocity(vx: number, vy: number): [number, number] {
  const speed = Math.hypot(vx, vy);
  if (speed === 0) {
    return [vx, vy];
  }
  if (Math.abs(vy) / speed >= MIN_VERTICAL_SPEED_RATIO) {
    return [vx, vy];
  }
  const vySign = vy === 0 ? 1 : Math.sign(vy);
  const newVy = vySign * MIN_VERTICAL_SPEED_RATIO * speed;
  const remainingSpeed = Math.sqrt(Math.max(0, speed * speed - newVy * newVy));
  const vxSign = vx === 0 ? 0 : Math.sign(vx);
  return [vxSign * remainingSpeed, newVy];
}

interface CellCollision {
  nx: number;
  ny: number;
  penetration: number;
}

/** Circle-vs-axis-aligned-cell-rect test/resolution, shared by bricks and red bonus balls (both occupy exactly one grid cell). Returns null if there's no overlap. */
function circleVsCell(ball: Ball, row: number, col: number): CellCollision | null {
  const left = colToX(col);
  const right = left + 1;
  const top = rowToY(row);
  const bottom = top + 1;

  const closestX = Math.min(Math.max(ball.x, left), right);
  const closestY = Math.min(Math.max(ball.y, top), bottom);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= ball.radius * ball.radius) {
    return null;
  }

  const dist = Math.sqrt(distSq);
  // dist === 0 means the ball's center is inside the rect (rare, but
  // possible with a fast ball / large dt) — fall back to bouncing it
  // straight back the way it came so it can never get stuck.
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : -1;
  return { nx, ny, penetration: ball.radius - dist };
}

function applyCollision(ball: Ball, collision: CellCollision): Ball {
  const [vx, vy] = reflect(ball.vx, ball.vy, collision.nx, collision.ny);
  return {
    ...ball,
    x: ball.x + collision.nx * collision.penetration,
    y: ball.y + collision.ny * collision.penetration,
    vx,
    vy,
  };
}

/**
 * Advances all active balls by `dtSeconds`, resolving wall, brick, and
 * red-bonus-ball collisions. A ball resolves at most one collision (brick
 * OR red bonus ball) per call — no double damage/collection within a
 * single frame — and is deactivated ("returned") once it fully passes
 * below the board — the arcade equivalent of falling back into the
 * player's hand. Pure and deterministic: same inputs always produce the
 * same outputs.
 */
export function stepBalls(
  balls: Ball[],
  bricks: Brick[],
  redBonusBalls: RedBonusBall[],
  dtSeconds: number,
): StepResult {
  const hits: BrickHitEvent[] = [];
  const collected: RedBonusBall[] = [];
  let remainingBricks = bricks;
  let remainingRedBalls = redBonusBalls;

  const nextBalls = balls.map((original) => {
    if (!original.active) {
      return original;
    }

    // Straight-line motion: `velocity` (vx, vy) is untouched by this
    // integration step — only position moves, along the exact line
    // implied by the ball's current, already-launched velocity vector.
    // Nothing below this point ever recomputes velocity from anything
    // other than an actual collision.
    let ball: Ball = {
      ...original,
      x: original.x + original.vx * dtSeconds,
      y: original.y + original.vy * dtSeconds,
    };
    // Tracks whether *any* collision (wall, brick, or red bonus ball)
    // happened to this ball this tick — the minimum-vertical-velocity
    // safety net below only ever runs immediately alongside a real
    // collision, never on an ordinary straight-line frame.
    let collidedThisTick = false;

    // Left/right walls: vx flips sign, vy is untouched.
    if (ball.x - ball.radius < 0) {
      ball = { ...ball, x: ball.radius, vx: Math.abs(ball.vx) };
      collidedThisTick = true;
    } else if (ball.x + ball.radius > BOARD_WIDTH) {
      ball = { ...ball, x: BOARD_WIDTH - ball.radius, vx: -Math.abs(ball.vx) };
      collidedThisTick = true;
    }
    // Top wall: vy flips sign, vx is untouched.
    if (ball.y - ball.radius < 0) {
      ball = { ...ball, y: ball.radius, vy: Math.abs(ball.vy) };
      collidedThisTick = true;
    }

    // Past the bottom of the board: this ball has returned — no more
    // collisions matter for it this turn.
    if (ball.y - ball.radius > BOARD_HEIGHT) {
      return { ...ball, active: false };
    }

    // At most one cell collision (brick OR red bonus ball, never both)
    // per ball per tick.
    let collidedWithCell = false;
    for (const brick of remainingBricks) {
      if (brick.hp <= 0) {
        continue;
      }
      const collision = circleVsCell(ball, brick.row, brick.col);
      if (!collision) {
        continue;
      }
      ball = applyCollision(ball, collision);
      const hp = brick.hp - 1;
      const updatedBrick: Brick = { ...brick, hp };
      remainingBricks = remainingBricks.map((b) => (b === brick ? updatedBrick : b));
      hits.push({ brick: updatedBrick, destroyed: hp <= 0 });
      collidedWithCell = true;
      break;
    }

    if (!collidedWithCell) {
      for (const redBall of remainingRedBalls) {
        const collision = circleVsCell(ball, redBall.row, redBall.col);
        if (!collision) {
          continue;
        }
        ball = applyCollision(ball, collision);
        remainingRedBalls = remainingRedBalls.filter((r) => r !== redBall);
        collected.push(redBall);
        collidedWithCell = true;
        break;
      }
    }

    collidedThisTick = collidedThisTick || collidedWithCell;

    const [vx, vy] = collidedThisTick ? enforceMinimumVerticalVelocity(ball.vx, ball.vy) : [ball.vx, ball.vy];
    return { ...ball, vx, vy };
  });

  return {
    balls: nextBalls,
    bricks: remainingBricks.filter((b) => b.hp > 0),
    redBonusBalls: remainingRedBalls,
    hits,
    collected,
  };
}
