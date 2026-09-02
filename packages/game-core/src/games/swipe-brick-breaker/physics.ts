import { BOARD_HEIGHT, BOARD_WIDTH, colToX, rowToY, type Ball, type Brick } from "./types";

export interface BrickHitEvent {
  brick: Brick;
  destroyed: boolean;
}

export interface StepResult {
  balls: Ball[];
  bricks: Brick[];
  hits: BrickHitEvent[];
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

/** Resolves one active ball against one brick's axis-aligned cell rect (circle-vs-rect). Mutates nothing — returns the updated ball, or null if there was no collision. */
function resolveBrickCollision(ball: Ball, brick: Brick): Ball | null {
  const left = colToX(brick.col);
  const right = left + 1;
  const top = rowToY(brick.row);
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
  const penetration = ball.radius - dist;

  const [vx, vy] = reflect(ball.vx, ball.vy, nx, ny);
  return {
    ...ball,
    x: ball.x + nx * penetration,
    y: ball.y + ny * penetration,
    vx,
    vy,
  };
}

/**
 * Advances all active balls by `dtSeconds`, resolving wall and brick
 * collisions. A ball damages at most one brick per call (no double
 * damage within a single frame), and is deactivated ("returned") once it
 * fully passes below the board — the arcade equivalent of falling back
 * into the player's hand. Pure and deterministic: same inputs always
 * produce the same outputs.
 */
export function stepBalls(balls: Ball[], bricks: Brick[], dtSeconds: number): StepResult {
  const hits: BrickHitEvent[] = [];
  let remainingBricks = bricks;

  const nextBalls = balls.map((original) => {
    if (!original.active) {
      return original;
    }

    let ball: Ball = {
      ...original,
      x: original.x + original.vx * dtSeconds,
      y: original.y + original.vy * dtSeconds,
    };

    // Left/right walls.
    if (ball.x - ball.radius < 0) {
      ball = { ...ball, x: ball.radius, vx: Math.abs(ball.vx) };
    } else if (ball.x + ball.radius > BOARD_WIDTH) {
      ball = { ...ball, x: BOARD_WIDTH - ball.radius, vx: -Math.abs(ball.vx) };
    }
    // Top wall.
    if (ball.y - ball.radius < 0) {
      ball = { ...ball, y: ball.radius, vy: Math.abs(ball.vy) };
    }

    // Past the bottom of the board: this ball has returned — no more
    // collisions matter for it this turn.
    if (ball.y - ball.radius > BOARD_HEIGHT) {
      return { ...ball, active: false };
    }

    // At most one brick collision per ball per tick.
    for (const brick of remainingBricks) {
      if (brick.hp <= 0) {
        continue;
      }
      const resolved = resolveBrickCollision(ball, brick);
      if (!resolved) {
        continue;
      }
      ball = resolved;
      const hp = brick.hp - 1;
      const updatedBrick: Brick = { ...brick, hp };
      remainingBricks = remainingBricks.map((b) => (b === brick ? updatedBrick : b));
      hits.push({ brick: updatedBrick, destroyed: hp <= 0 });
      break;
    }

    const [vx, vy] = enforceMinimumVerticalVelocity(ball.vx, ball.vy);
    return { ...ball, vx, vy };
  });

  return {
    balls: nextBalls,
    bricks: remainingBricks.filter((b) => b.hp > 0),
    hits,
  };
}
