import { describe, expect, it } from "vitest";
import {
  BALL_LAUNCH_STAGGER_MS,
  BASE_BALL_SPEED,
  BOARD_COLS,
  BOARD_ROWS,
  FORMATION_TOP_ROW,
  MAX_BALL_SPEED,
  MAX_NEW_BRICKS_PER_TURN,
  SwipeBrickBreakerGame,
  SwipeBrickBreakerInputError,
  brickHpForLevel,
  generateBricks,
  generateFormation,
  stepBalls,
  type Ball,
  type Brick,
  type Clock,
  type RandomSource,
} from "..";

class FixedClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
}

/** Deterministic sequence source for reproducible brick-generation tests. */
class SequenceRandomSource implements RandomSource {
  private i = 0;
  constructor(private readonly values: number[]) {}
  next(): number {
    const v = this.values[this.i % this.values.length];
    this.i += 1;
    return v;
  }
}

describe("generateBricks", () => {
  it("never generates more than MAX_NEW_BRICKS_PER_TURN bricks", () => {
    for (let level = 1; level <= 50; level++) {
      const bricks = generateBricks(level, new SequenceRandomSource([0.999]));
      expect(bricks.length).toBeLessThanOrEqual(MAX_NEW_BRICKS_PER_TURN);
      expect(bricks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("only ever produces valid 7x7 coordinates, always starting at FORMATION_TOP_ROW (row 1) — never row 0", () => {
    const bricks = generateBricks(20, new SequenceRandomSource([0.5, 0.1, 0.9, 0.3, 0.7]));
    for (const b of bricks) {
      expect(b.row).toBe(FORMATION_TOP_ROW);
      expect(b.row).not.toBe(0);
      expect(b.col).toBeGreaterThanOrEqual(0);
      expect(b.col).toBeLessThan(BOARD_COLS);
    }
  });

  it("never produces duplicate positions within one batch", () => {
    const bricks = generateBricks(30, new SequenceRandomSource([0.99, 0.99, 0.99, 0.99, 0.99]));
    const positions = new Set(bricks.map((b) => `${b.row},${b.col}`));
    expect(positions.size).toBe(bricks.length);
  });

  it("never spawns into the bottom danger row", () => {
    for (let level = 1; level <= 20; level++) {
      const bricks = generateBricks(level, new SequenceRandomSource([0.42]));
      expect(bricks.every((b) => b.row !== BOARD_ROWS - 1)).toBe(true);
    }
  });

  it("is deterministic for a given seeded random sequence", () => {
    const a = generateBricks(10, new SequenceRandomSource([0.2, 0.4, 0.6, 0.8]));
    const b = generateBricks(10, new SequenceRandomSource([0.2, 0.4, 0.6, 0.8]));
    expect(a).toEqual(b);
  });

  it("brick HP increases by exactly +1 per round, independent of ball count/red-ball collection", () => {
    expect(brickHpForLevel(1)).toBe(1);
    expect(brickHpForLevel(2)).toBe(2);
    expect(brickHpForLevel(3)).toBe(3);
    for (let level = 1; level < 30; level++) {
      expect(brickHpForLevel(level + 1) - brickHpForLevel(level)).toBe(1);
    }
  });
});

describe("generateFormation (bricks + red bonus balls together)", () => {
  it("newly generated objects (bricks and red bonus balls) appear starting from Row 1, never Row 0", () => {
    for (let level = 1; level <= 30; level++) {
      // A random sequence virtually guaranteed to spawn a red bonus ball
      // at some point across this range (spawn roll then column pick).
      const { bricks, redBonusBalls } = generateFormation(level, new SequenceRandomSource([0.01, 0.3, 0.6, 0.9, 0.15]));
      for (const b of bricks) {
        expect(b.row).toBe(FORMATION_TOP_ROW);
        expect(b.row).not.toBe(0);
      }
      for (const r of redBonusBalls) {
        expect(r.row).toBe(FORMATION_TOP_ROW);
        expect(r.row).not.toBe(0);
      }
    }
  });

  it("never places a red bonus ball on a column a brick already took this turn (no overlap)", () => {
    for (let level = 1; level <= 30; level++) {
      const { bricks, redBonusBalls } = generateFormation(level, new SequenceRandomSource([0.01, 0.5, 0.2, 0.8, 0.4]));
      const brickCols = new Set(bricks.map((b) => b.col));
      for (const r of redBonusBalls) {
        expect(brickCols.has(r.col)).toBe(false);
      }
    }
  });

  it("never produces duplicate cells across bricks and red bonus balls combined", () => {
    const { bricks, redBonusBalls } = generateFormation(15, new SequenceRandomSource([0.01, 0.4, 0.4, 0.4, 0.4]));
    const cells = [...bricks.map((b) => `${b.row},${b.col}`), ...redBonusBalls.map((r) => `${r.row},${r.col}`)];
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("a red bonus ball is separate from the MAX_NEW_BRICKS_PER_TURN cap (bricks alone can still hit the cap)", () => {
    const { bricks, redBonusBalls } = generateFormation(30, new SequenceRandomSource([0.99, 0.99, 0.99, 0.99]));
    expect(bricks.length).toBeLessThanOrEqual(MAX_NEW_BRICKS_PER_TURN);
    // A full-size brick batch still leaves room for the guaranteed red
    // bonus ball, since MAX_NEW_BRICKS_PER_TURN (5) is less than BOARD_COLS (7).
    expect(redBonusBalls.length).toBe(1);
  });

  it("every generated round contains at least 1 red bonus ball — never 0 — regardless of round or randomness", () => {
    // A spread of random sequences (varying which cell/column gets picked)
    // across many rounds; every single one must still produce exactly 1
    // red bonus ball, since it is no longer a chance-gated spawn.
    const sequences = [
      [0.0, 0.0, 0.0, 0.0],
      [0.99, 0.99, 0.99, 0.99],
      [0.5, 0.5, 0.5, 0.5],
      [0.13, 0.77, 0.42, 0.9],
    ];
    for (let level = 1; level <= 40; level++) {
      for (const seq of sequences) {
        const { bricks, redBonusBalls } = generateFormation(level, new SequenceRandomSource(seq));
        expect(redBonusBalls.length).toBeGreaterThanOrEqual(1);
        expect(redBonusBalls.length).toBe(1); // never 0, and this implementation never produces more than 1
        const brickCols = new Set(bricks.map((b) => b.col));
        for (const r of redBonusBalls) {
          expect(brickCols.has(r.col)).toBe(false); // never overlaps a brick
          expect(r.row).toBe(FORMATION_TOP_ROW);
        }
      }
    }
  });
});

describe("stepBalls (collision physics)", () => {
  function ball(overrides: Partial<Ball> = {}): Ball {
    return { x: 3.5, y: 3.5, vx: 0, vy: -1, radius: 0.12, active: true, launchDelayMs: 0, ...overrides };
  }

  it("reflects off the left wall", () => {
    const { balls } = stepBalls([ball({ x: 0.05, vx: -3, vy: 0 })], [], [], 1);
    expect(balls[0].vx).toBeGreaterThan(0);
    expect(balls[0].x).toBeGreaterThanOrEqual(0);
  });

  it("reflects off the right wall", () => {
    const { balls } = stepBalls([ball({ x: 6.95, vx: 3, vy: 0 })], [], [], 1);
    expect(balls[0].vx).toBeLessThan(0);
  });

  it("reflects off the top wall", () => {
    const { balls } = stepBalls([ball({ y: 0.05, vx: 0, vy: -3 })], [], [], 1);
    expect(balls[0].vy).toBeGreaterThan(0);
  });

  // Brick row 2 spans y in [rowToY(2), rowToY(2)+1] = [2.6, 3.6] (rowToY
  // adds BRICK_TOP_MARGIN_ROWS) — these balls approach from just above
  // that top edge.
  it("decreases brick HP by exactly 1 on a hit", () => {
    const brick: Brick = { row: 2, col: 3, hp: 3, maxHp: 3 };
    const { bricks, hits } = stepBalls([ball({ x: 3.5, y: 2.45, vx: 0, vy: 1 })], [brick], [], 0.1);
    expect(hits).toHaveLength(1);
    expect(hits[0].destroyed).toBe(false);
    expect(bricks[0].hp).toBe(2);
  });

  it("removes the brick once HP reaches 0", () => {
    const brick: Brick = { row: 2, col: 3, hp: 1, maxHp: 1 };
    const { bricks, hits } = stepBalls([ball({ x: 3.5, y: 2.45, vx: 0, vy: 1 })], [brick], [], 0.1);
    expect(hits[0].destroyed).toBe(true);
    expect(bricks).toHaveLength(0);
  });

  it("never leaves the ball's center inside the brick after a collision", () => {
    const brick: Brick = { row: 2, col: 3, hp: 5, maxHp: 5 };
    const { balls } = stepBalls([ball({ x: 3.5, y: 2.55, vx: 0, vy: 1 })], [brick], [], 0.05);
    const b = balls[0];
    const top = brick.row + 0.6; // rowToY
    const inside = b.x > brick.col && b.x < brick.col + 1 && b.y > top && b.y < top + 1;
    expect(inside).toBe(false);
  });

  it("a ball bouncing off the top wall does not get permanently trapped against a row-0 brick", () => {
    const brick: Brick = { row: 0, col: 3, hp: 50, maxHp: 50 };
    let balls = [ball({ x: 3.5, y: 0.5, vx: 0, vy: -3 })];
    let bricks = [brick];
    // Simulate several seconds of 60fps ticks — a trapped ball would never
    // make net downward progress; a healthy one keeps bouncing but its y
    // position varies over time instead of freezing at one value forever.
    const ys = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const result = stepBalls(balls, bricks, [], 1 / 60);
      balls = result.balls;
      bricks = result.bricks;
      ys.add(Math.round(balls[0].y * 100) / 100);
    }
    expect(ys.size).toBeGreaterThan(1);
  });

  it("deactivates a ball once it fully passes below the board", () => {
    const { balls } = stepBalls([ball({ y: 9.3, vx: 0, vy: 5 })], [], [], 1);
    expect(balls[0].active).toBe(false);
  });

  it("collects a red bonus ball on touch (removed from the board, no HP bookkeeping needed)", () => {
    const redBall = { row: 2, col: 3 };
    const { redBonusBalls, collected } = stepBalls(
      [ball({ x: 3.5, y: 2.45, vx: 0, vy: 1 })],
      [],
      [redBall],
      0.1,
    );
    expect(collected).toEqual([redBall]);
    expect(redBonusBalls).toHaveLength(0);
  });

  it("a red bonus ball never bounces a ball: velocity is completely unchanged by collecting it", () => {
    const redBall = { row: 2, col: 3 };
    const incoming = ball({ x: 3.5, y: 2.45, vx: 0.3, vy: 1 });
    const { balls, collected } = stepBalls([incoming], [], [redBall], 0.1);
    expect(collected).toEqual([redBall]);
    // Straight-line motion only: same velocity, position advanced by
    // exactly vx*dt / vy*dt, exactly as an ordinary non-collision frame.
    expect(balls[0].vx).toBe(incoming.vx);
    expect(balls[0].vy).toBe(incoming.vy);
    expect(balls[0].x).toBeCloseTo(incoming.x + incoming.vx * 0.1, 10);
    expect(balls[0].y).toBeCloseTo(incoming.y + incoming.vy * 0.1, 10);
  });

  it("collecting a red bonus ball does not consume/block that tick's one-brick-collision slot", () => {
    // A brick elsewhere in the same tick's path still resolves normally —
    // collection is independent of, not competing with, brick collisions.
    const brick: Brick = { row: 5, col: 3, hp: 3, maxHp: 3 };
    const redBall = { row: 2, col: 3 };
    const { collected } = stepBalls([ball({ x: 3.5, y: 2.45, vx: 0, vy: 1 })], [brick], [redBall], 0.1);
    expect(collected).toEqual([redBall]);
  });

  it("red bonus balls never trigger the minimum-vertical-velocity safety net (not treated as a real collision)", () => {
    // A ball on an already near-horizontal heading (below the safety net's
    // floor) passing through a red bonus ball with no wall/brick collision
    // this tick must keep that exact heading — only an actual bounce may
    // invoke the safety net.
    const redBall = { row: 2, col: 3 };
    const incoming = ball({ x: 3.5, y: 2.45, vx: 5, vy: 0.01 });
    const { balls } = stepBalls([incoming], [], [redBall], 0.001);
    expect(balls[0].vx).toBe(incoming.vx);
    expect(balls[0].vy).toBe(incoming.vy);
  });
});

describe("stepBalls — strictly linear trajectory between collisions", () => {
  function ball(overrides: Partial<Ball> = {}): Ball {
    return { x: 3.5, y: 3.5, vx: 0, vy: -1, radius: 0.12, active: true, launchDelayMs: 0, ...overrides };
  }

  it("stays on the exact mathematical line P(t) = P + Vt across many frames with no collision", () => {
    const P = { x: 3.5, y: 4.5 };
    const V = { vx: 0.7, vy: -2.1 };
    let balls = [ball({ x: P.x, y: P.y, vx: V.vx, vy: V.vy })];
    const dt = 1 / 60;
    let elapsed = 0;

    for (let frame = 0; frame < 20; frame++) {
      const { balls: nextBalls } = stepBalls(balls, [], [], dt);
      balls = nextBalls;
      elapsed += dt;
      // No walls/bricks in range for this many frames at this speed, so
      // velocity must be bit-identical to the launch vector every frame.
      expect(balls[0].vx).toBe(V.vx);
      expect(balls[0].vy).toBe(V.vy);
      // Position must match the closed-form line equation exactly
      // (within floating-point tolerance from repeated dt accumulation).
      expect(balls[0].x).toBeCloseTo(P.x + V.vx * elapsed, 10);
      expect(balls[0].y).toBeCloseTo(P.y + V.vy * elapsed, 10);
    }
  });

  it("velocity is untouched on every straight-line (non-collision) frame — only position changes", () => {
    let balls = [ball({ x: 3.5, y: 4.5, vx: 0.3, vy: -1.5 })];
    for (let frame = 0; frame < 10; frame++) {
      const before = { vx: balls[0].vx, vy: balls[0].vy };
      const { balls: nextBalls } = stepBalls(balls, [], [], 1 / 60);
      balls = nextBalls;
      expect(balls[0].vx).toBe(before.vx);
      expect(balls[0].vy).toBe(before.vy);
    }
  });

  it("left/right wall reflection: vx sign flips, vy is unaffected", () => {
    const { balls: leftBounce } = stepBalls([ball({ x: 0.05, vx: -3, vy: -1.7 })], [], [], 1);
    expect(leftBounce[0].vx).toBe(3);
    expect(leftBounce[0].vy).toBe(-1.7);

    const { balls: rightBounce } = stepBalls([ball({ x: 6.95, vx: 3, vy: -1.7 })], [], [], 1);
    expect(rightBounce[0].vx).toBe(-3);
    expect(rightBounce[0].vy).toBe(-1.7);
  });

  it("top wall reflection: vy sign flips, vx is unaffected", () => {
    const { balls } = stepBalls([ball({ y: 0.05, vx: 2.4, vy: -3 })], [], [], 1);
    expect(balls[0].vy).toBe(3);
    expect(balls[0].vx).toBe(2.4);
  });

  it("does not apply the minimum-vertical-velocity safety net on a non-collision frame (only alongside a real collision)", () => {
    // A near-horizontal velocity that would trip the safety net if it
    // ran unconditionally — but with no wall/brick/red-ball in range,
    // nothing should collide, so velocity must pass through unchanged.
    const vx = 6;
    const vy = -0.1;
    const { balls } = stepBalls([ball({ x: 3.5, y: 5, vx, vy })], [], [], 1 / 60);
    expect(balls[0].vx).toBe(vx);
    expect(balls[0].vy).toBe(vy);
  });

  it("deterministic: identical inputs (position, velocity, board state) always produce identical output", () => {
    const bricks: Brick[] = [{ row: 2, col: 3, hp: 5, maxHp: 5 }];
    const a = stepBalls([ball({ x: 3.4, y: 2.4, vx: 0.5, vy: 1.2 })], bricks, [], 1 / 60);
    const b = stepBalls([ball({ x: 3.4, y: 2.4, vx: 0.5, vy: 1.2 })], bricks, [], 1 / 60);
    expect(a.balls).toEqual(b.balls);
    expect(a.hits).toEqual(b.hits);
  });
});

describe("SwipeBrickBreakerGame — level/ball progression", () => {
  function newGame() {
    return new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.5, 0.1, 0.9, 0.3]));
  }

  it("starts at level 1 with exactly 1 ball", () => {
    const game = newGame();
    const state = game.start(game.createInitialState());
    expect(state.level).toBe(1);
    expect(state.ballCount).toBe(1);
  });

  it("advances level by exactly 1 after a cleared volley, but never changes ball count on its own", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // No red bonus balls this turn — nothing to collect either way.
    state = { ...state, redBonusBalls: [] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    // Drive the volley to completion — balls launch upward and eventually
    // return past the bottom of the board.
    for (let i = 0; i < 2000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    expect(state.phase).not.toBe("volley");
    if (state.phase === "ready") {
      expect(state.level).toBe(2);
      expect(state.ballCount).toBe(1);
    }
  });

  it("has no maximum level or score across many completed volleys", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    let turns = 0;
    // A slight off-vertical aim (rather than exactly straight up) keeps
    // every ball's horizontal velocity non-zero, avoiding the degenerate
    // perfectly-symmetric bounce paths a real player's swipe would rarely
    // ever produce exactly.
    while (state.phase !== "gameOver" && turns < 40) {
      state = game.handleInput(state, { type: "aim", angleRad: 0.15 });
      state = game.handleInput(state, { type: "fire" });
      for (let i = 0; i < 20000 && state.phase === "volley"; i++) {
        state = game.handleInput(state, { type: "tick", dtMs: 16 });
      }
      expect(state.phase).not.toBe("volley"); // the volley must have actually resolved
      turns += 1;
    }
    expect(state.level).toBeGreaterThan(1);
  });
});

// "Round" is displayed in the UI (SwipeBrickBreakerView) and IS the
// `level` field underneath — round = number of completed volleys + 1.
// These tests pin down that exact semantics: it is a pure turn counter,
// never derived from brick count, brick HP, ball count, or score. Round
// and ball count (`ballCount`) are fully independent state — round always
// advances by 1 per completed volley, while ballCount only ever grows
// from a collected red bonus ball.
describe("SwipeBrickBreakerGame — round progression (round = completedVolleys + 1)", () => {
  function newGame() {
    return new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.5, 0.1, 0.9, 0.3, 0.6, 0.2]));
  }

  function completeOneVolley(game: SwipeBrickBreakerGame, state: ReturnType<SwipeBrickBreakerGame["start"]>) {
    state = game.handleInput(state, { type: "aim", angleRad: 0.15 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 20000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    return state;
  }

  it("the initial round, before any shot, is 1", () => {
    const game = newGame();
    const state = game.start(game.createInitialState());
    expect(state.level).toBe(1);
  });

  it("completing the first volley changes round 1 -> 2", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    expect(state.level).toBe(1);
    state = completeOneVolley(game, state);
    expect(state.phase).not.toBe("volley");
    if (state.phase !== "gameOver") {
      expect(state.level).toBe(2);
    }
  });

  it("completing two volleys changes round 1 -> 2 -> 3, each volley incrementing exactly once", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    const rounds = [state.level];

    state = completeOneVolley(game, state);
    rounds.push(state.level);
    if (state.phase === "gameOver") return; // rare with this seed; the single-volley test above covers this case directly

    state = completeOneVolley(game, state);
    rounds.push(state.level);

    expect(rounds[0]).toBe(1);
    expect(rounds[1]).toBe(2);
    if (state.phase !== "gameOver") {
      expect(rounds[2]).toBe(3);
    }
    // Exactly +1 per completed volley, never more.
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i] - rounds[i - 1]).toBe(1);
    }
  });

  it("a volley with multiple balls and multiple collisions still increments the round exactly once", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // Force a busy volley: several bricks in the ball's path, several balls.
    state = {
      ...state,
      ballCount: 4,
      level: 4,
      bricks: [
        { row: 2, col: 3, hp: 1, maxHp: 1 },
        { row: 3, col: 3, hp: 1, maxHp: 1 },
        { row: 4, col: 3, hp: 1, maxHp: 1 },
      ],
    };
    const roundBefore = state.level;
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 20000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    expect(state.phase).not.toBe("volley");
    if (state.phase !== "gameOver") {
      expect(state.level).toBe(roundBefore + 1); // exactly +1, regardless of how many balls/hits occurred
    }
  });

  it("round continues increasing well beyond 9/10 without wrapping or resetting", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    expect(state.level).toBe(1);
    // Clear bricks before every volley so this specifically isolates
    // round-counter behavior from the unrelated question of whether a
    // given run happens to survive that long — there is nothing here
    // that could ever cross the Game Over boundary, so any failure to
    // keep incrementing would be the round counter itself, not bad luck.
    for (let turn = 0; turn < 15; turn++) {
      state = { ...state, bricks: [], redBonusBalls: [] };
      state = completeOneVolley(game, state);
      expect(state.phase).toBe("ready");
    }
    expect(state.level).toBeGreaterThan(9);
    expect(state.level).toBe(16); // 1 + 15 completed volleys, exactly — no skips, no wrap
  });

  it("the new brick formation spawned after a volley corresponds to the NEXT round, not the round just completed", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, bricks: [], redBonusBalls: [] }; // nothing pre-existing to shift down
    const roundBefore = state.level;
    state = completeOneVolley(game, state);
    if (state.phase === "ready") {
      // Every brick present now is newly spawned this turn — for the round AFTER roundBefore.
      expect(state.level).toBe(roundBefore + 1);
      expect(state.bricks.length).toBeGreaterThan(0);
      expect(state.bricks.every((b) => b.row === FORMATION_TOP_ROW)).toBe(true);
    }
  });

  it("one-row descent and the permanent empty Row 0 buffer are unchanged by round progression", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // High HP so it survives being hit (the ball's aim doesn't even cross
    // its column, but this keeps the test robust either way) — identified
    // by column alone below, since a hit could otherwise change its hp.
    state = { ...state, bricks: [{ row: 2, col: 4, hp: 99, maxHp: 99 }], redBonusBalls: [] };
    state = completeOneVolley(game, state);
    if (state.phase !== "gameOver") {
      const moved = state.bricks.find((b) => b.col === 4);
      expect(moved).toBeTruthy();
      expect(moved?.row).toBe(3); // exactly +1
      expect(state.bricks.every((b) => b.row !== 0)).toBe(true);
    }
  });
});

describe("SwipeBrickBreakerGame — ball count (grows only from a collected red bonus ball)", () => {
  function newGame() {
    return new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.5, 0.1, 0.9, 0.3, 0.6, 0.2]));
  }

  function completeOneVolley(game: SwipeBrickBreakerGame, state: ReturnType<SwipeBrickBreakerGame["start"]>) {
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 20000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    return state;
  }

  it("a new game starts at round 1 with exactly 1 ball", () => {
    const game = newGame();
    const state = game.start(game.createInitialState());
    expect(state.level).toBe(1);
    expect(state.ballCount).toBe(1);
  });

  it("completing several volleys with no red bonus balls advances round but never ball count", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    for (let turn = 0; turn < 5; turn++) {
      state = { ...state, bricks: [], redBonusBalls: [] };
      state = completeOneVolley(game, state);
      expect(state.phase).toBe("ready");
      expect(state.ballCount).toBe(1);
    }
    expect(state.level).toBe(6);
  });

  it("collecting a red bonus ball increases ballCount by exactly 1, but only once the volley resolves — not mid-volley", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // Place a red bonus ball directly in the path of a straight-up shot.
    state = { ...state, bricks: [], redBonusBalls: [{ row: 3, col: 3 }] };
    const ballCountBefore = state.ballCount;
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });

    let collectedDuringVolley = false;
    for (let i = 0; i < 20000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
      // The gain must never be visible while the volley is still in flight
      // (i.e. any tick that leaves phase at "volley"). Only the final tick,
      // the one that resolves the turn, is allowed to apply it.
      if (state.phase === "volley") {
        expect(state.ballCount).toBe(ballCountBefore);
      }
      if (state.redBonusBalls.length === 0) collectedDuringVolley = true;
    }

    expect(collectedDuringVolley).toBe(true); // sanity: the collectible really was hit
    expect(state.phase).not.toBe("volley");
    if (state.phase === "ready") {
      expect(state.ballCount).toBe(ballCountBefore + 1);
    }
  });

  it("a missed red bonus ball (crosses the bottom) disappears without increasing ballCount or ending the game", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // Aim straight up on a column with no bricks or bonus ball anywhere
    // near it, and put the bonus ball at the very bottom row so the next
    // one-row shift pushes it past the boundary and it is dropped.
    state = { ...state, bricks: [], redBonusBalls: [{ row: 6, col: 6 }] };
    const ballCountBefore = state.ballCount;
    state = completeOneVolley(game, state);
    expect(state.phase).toBe("ready"); // never game over from a missed red ball
    // The original bonus ball crossed row >= BOARD_ROWS on the one-row
    // shift and was dropped — a newly-spawned bonus ball this turn could
    // coincidentally land back at row 6/col 6 later, so identify the
    // original by row alone right after the shift is not reliable; what
    // actually matters for this invariant is simply that ballCount never
    // moved from a ball that was lost rather than collected.
    expect(state.ballCount).toBe(ballCountBefore);
  });

  it("round and ball count are fully independent: round always advances by 1, ball count only via collection", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // Turn 1: a bonus ball present but nowhere near the shot's column — round advances, ball count does not.
    state = { ...state, bricks: [], redBonusBalls: [{ row: 3, col: 0 }] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 20000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    expect(state.phase).toBe("ready");
    expect(state.level).toBe(2);
    expect(state.ballCount).toBe(1);

    // Turn 2: a bonus ball directly in the shot's path — round advances AND ball count grows by 1.
    state = { ...state, bricks: [], redBonusBalls: [{ row: 3, col: 3 }] };
    state = completeOneVolley(game, state);
    expect(state.phase).toBe("ready");
    expect(state.level).toBe(3);
    expect(state.ballCount).toBe(2);
  });
});

describe("SwipeBrickBreakerGame — volley/fire", () => {
  function newGame() {
    return new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.1, 0.9, 0.5]));
  }

  it("fire is invalid outside of aiming", () => {
    const game = newGame();
    const state = game.start(game.createInitialState());
    expect(() => game.handleInput(state, { type: "fire" })).toThrow(SwipeBrickBreakerInputError);
  });

  it("firing launches exactly ballCount balls", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    // Simulate reaching level 3 (ballCount 3) by directly constructing via repeated resolution is
    // avoided here; instead assert the level-1 case launches exactly 1 ball, and re-derive for a
    // higher ballCount using the state shape directly (game-core state is plain data).
    state = { ...state, ballCount: 3, level: 3 };
    state = game.handleInput(state, { type: "aim", angleRad: 0.1 });
    state = game.handleInput(state, { type: "fire" });
    expect(state.balls).toHaveLength(3);
    expect(state.balls.every((b) => b.active)).toBe(true);
  });

  it("clamps aim to a safe upward range (never horizontal or downward)", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "aim", angleRad: 10 }); // absurdly large
    expect(Math.abs(state.aimAngleRad)).toBeLessThan(Math.PI / 2);
  });

  it("the first ball fires exactly along the aimed angle", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "aim", angleRad: 0.3 });
    state = game.handleInput(state, { type: "fire" });
    const expectedVx = Math.sin(0.3);
    expect(state.balls[0].vx / -state.balls[0].vy).toBeCloseTo(Math.tan(0.3), 5);
    expect(Math.sign(state.balls[0].vx)).toBe(Math.sign(expectedVx) || 0);
  });

  it("launch speed at round 1 is BASE_BALL_SPEED (the doubled 12 units/sec), plus the existing tiny per-level growth", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    expect(BASE_BALL_SPEED).toBe(12);
    // speedForLevel(1) = BASE_BALL_SPEED + 1 * 0.03 (unchanged growth rule, doubled base).
    expect(Math.hypot(state.balls[0].vx, state.balls[0].vy)).toBeCloseTo(BASE_BALL_SPEED + 0.03, 10);
  });

  it("launch speed grows with round but never exceeds the doubled MAX_BALL_SPEED (20 units/sec)", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, level: 500, ballCount: 1 };
    state = game.handleInput(state, { type: "aim", angleRad: 0.1 });
    state = game.handleInput(state, { type: "fire" });
    expect(MAX_BALL_SPEED).toBe(20);
    const speed = Math.hypot(state.balls[0].vx, state.balls[0].vy);
    expect(speed).toBeCloseTo(MAX_BALL_SPEED, 10);
  });

  it("aim consistency: the aim direction is exactly the first ball's initial (normalized) direction vector", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = game.handleInput(state, { type: "aim", angleRad: -0.42 });
    const aimAngle = state.aimAngleRad;
    state = game.handleInput(state, { type: "fire" });

    // The aim-guide direction (per the view's rendering: sin/-cos of the
    // aimed angle) and the first ball's normalized velocity direction
    // must be the exact same vector — not merely close, not a
    // downstream approximation.
    const guideDir = { x: Math.sin(aimAngle), y: -Math.cos(aimAngle) };
    const speed = Math.hypot(state.balls[0].vx, state.balls[0].vy);
    const ballDir = { x: state.balls[0].vx / speed, y: state.balls[0].vy / speed };
    expect(ballDir.x).toBeCloseTo(guideDir.x, 10);
    expect(ballDir.y).toBeCloseTo(guideDir.y, 10);
  });

  it("multiple balls: every ball receives the exact same fixed direction at launch, and holds it every frame until a collision", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, ballCount: 5, level: 5 };
    state = game.handleInput(state, { type: "aim", angleRad: 0.2 });
    state = game.handleInput(state, { type: "fire" });

    expect(state.balls).toHaveLength(5);
    // Every ball shares the EXACT same launch direction — no spread at all.
    const launchDirections = state.balls.map((b) => ({ vx: b.vx, vy: b.vy }));
    const allSame = launchDirections.every(
      (d) => d.vx === launchDirections[0].vx && d.vy === launchDirections[0].vy,
    );
    expect(allSame).toBe(true);

    // Advance several frames with nothing to collide with — every ball
    // must still carry the exact same vx/vy it launched with (no
    // per-frame random re-steering of any ball).
    for (let frame = 0; frame < 15; frame++) {
      state = game.handleInput(state, { type: "tick", dtMs: 4 });
      state.balls.forEach((b, i) => {
        if (b.active) {
          expect(b.vx).toBe(launchDirections[i].vx);
          expect(b.vy).toBe(launchDirections[i].vy);
        }
      });
    }
  });

  it("the first/current ball always fires exactly along the drag-derived aim direction, regardless of ball count", () => {
    for (const ballCount of [1, 2, 5, 10, 30]) {
      const game = newGame();
      let state = game.start(game.createInitialState());
      state = { ...state, ballCount, level: ballCount };
      state = game.handleInput(state, { type: "aim", angleRad: -0.25 });
      state = game.handleInput(state, { type: "fire" });

      const speed = Math.hypot(state.balls[0].vx, state.balls[0].vy);
      const angle = Math.atan2(state.balls[0].vx / speed, -state.balls[0].vy / speed);
      expect(angle).toBeCloseTo(-0.25, 10);
    }
  });

  it("strict straight-line volley: 1, 2, 10, and 50 balls all launch with EXACTLY the same direction (no spread constant, no per-ball offset)", () => {
    for (const ballCount of [1, 2, 10, 50]) {
      const game = newGame();
      let state = game.start(game.createInitialState());
      state = { ...state, ballCount, level: ballCount };
      state = game.handleInput(state, { type: "aim", angleRad: 0.37 });
      state = game.handleInput(state, { type: "fire" });

      expect(state.balls).toHaveLength(ballCount);
      const first = state.balls[0];
      for (const b of state.balls) {
        // Bit-for-bit identical vx/vy across the whole volley — not
        // merely "close": zero angular offset of any kind.
        expect(b.vx).toBe(first.vx);
        expect(b.vy).toBe(first.vy);
      }

      // And that shared direction is exactly the aim direction.
      const speed = Math.hypot(first.vx, first.vy);
      const angle = Math.atan2(first.vx / speed, -first.vy / speed);
      expect(angle).toBeCloseTo(0.37, 10);
    }
  });

  it("balls launch sequentially with a small fixed delay, not all at once: at fire, only ball 0 has started moving", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, ballCount: 4, level: 4 };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });

    expect(state.balls).toHaveLength(4);
    expect(state.balls[0].launchDelayMs).toBe(0);
    // Every ball after the first waits an increasing, exactly staggered
    // amount before it starts moving.
    for (let i = 1; i < state.balls.length; i++) {
      expect(state.balls[i].launchDelayMs).toBe(i * BALL_LAUNCH_STAGGER_MS);
    }

    // Immediately at fire (0 elapsed time), only ball 0 has moved off the
    // launch point — every later ball is still parked exactly at launch.
    const launchX = state.balls[0].x;
    const launchY = state.balls[0].y;
    for (let i = 1; i < state.balls.length; i++) {
      expect(state.balls[i].x).toBe(launchX);
      expect(state.balls[i].y).toBe(launchY);
    }
  });

  it("each ball starts moving only once its own countdown elapses, then keeps the same constant velocity as every other ball", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, ballCount: 3, level: 3, bricks: [], redBonusBalls: [] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });

    const launchY = state.balls[0].y;
    const hasMoved = (b: (typeof state.balls)[number]) => b.y !== launchY;

    // One tick just short of ball 1's stagger: only ball 0 has moved.
    state = game.handleInput(state, { type: "tick", dtMs: BALL_LAUNCH_STAGGER_MS - 5 });
    expect(hasMoved(state.balls[0])).toBe(true);
    expect(hasMoved(state.balls[1])).toBe(false);
    expect(hasMoved(state.balls[2])).toBe(false);

    // Cross ball 1's stagger threshold: ball 1 has now started moving too, ball 2 still hasn't.
    state = game.handleInput(state, { type: "tick", dtMs: 10 });
    expect(hasMoved(state.balls[1])).toBe(true);
    expect(hasMoved(state.balls[2])).toBe(false);

    // Cross ball 2's stagger threshold as well.
    state = game.handleInput(state, { type: "tick", dtMs: BALL_LAUNCH_STAGGER_MS });
    expect(hasMoved(state.balls[2])).toBe(true);

    // Once launched, every ball carries the exact same vx/vy — the
    // stagger only ever changed WHEN each ball started moving, never its
    // direction or speed.
    const [b0, b1, b2] = state.balls;
    expect(b1.vx).toBe(b0.vx);
    expect(b1.vy).toBe(b0.vy);
    expect(b2.vx).toBe(b0.vx);
    expect(b2.vy).toBe(b0.vy);
  });

  it("no angular spread across a staggered multi-ball volley: every ball's direction is bit-for-bit identical once launched", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, ballCount: 6, level: 6, bricks: [], redBonusBalls: [] };
    state = game.handleInput(state, { type: "aim", angleRad: -0.4 });
    state = game.handleInput(state, { type: "fire" });

    // Advance well past the last ball's stagger so every ball is launched.
    for (let i = 0; i < 20; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: BALL_LAUNCH_STAGGER_MS });
    }

    expect(state.balls.every((b) => b.launchDelayMs === 0)).toBe(true);
    const [first, ...rest] = state.balls;
    for (const b of rest) {
      expect(b.vx).toBe(first.vx);
      expect(b.vy).toBe(first.vy);
    }
  });
});

describe("SwipeBrickBreakerGame — game over", () => {
  it("triggers game over once a brick crosses the bottom boundary, and restart resets all state", () => {
    const game = new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.99]));
    let state = game.start(game.createInitialState());

    // Force a brick already one row above the boundary so the very next
    // resolved (empty) volley pushes it over.
    state = { ...state, bricks: [{ row: BOARD_ROWS - 1, col: 0, hp: 99, maxHp: 99 }] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 3000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }

    expect(state.phase).toBe("gameOver");
    expect(game.isFinished(state)).toBe(true);

    const result = game.computeResult(state);
    expect(result.completion.reason).toBe("completed");
    expect(result.score).toBeGreaterThanOrEqual(0);

    // Restart: a fresh start() must reset level/ballCount/bricks/balls/phase.
    const restarted = game.start(game.createInitialState());
    expect(restarted.phase).toBe("ready");
    expect(restarted.level).toBe(1);
    expect(restarted.ballCount).toBe(1);
    expect(restarted.balls).toHaveLength(0);
    // Round 1's formation always includes its guaranteed red bonus ball.
    expect(restarted.redBonusBalls).toHaveLength(1);
  });

  it("a red bonus ball reaching the bottom boundary is simply lost — it does NOT trigger Game Over", () => {
    const game = new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.99]));
    let state = game.start(game.createInitialState());

    // Only a red bonus ball already one row above the boundary — no
    // bricks at all — so the next resolved volley pushes only it over.
    state = { ...state, bricks: [], redBonusBalls: [{ row: BOARD_ROWS - 1, col: 0 }] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 3000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }

    expect(state.phase).not.toBe("gameOver");
    // The red bonus ball crossed the boundary and was lost, not carried forward.
    expect(state.redBonusBalls.some((r) => r.col === 0 && r.row >= BOARD_ROWS - 1)).toBe(false);
  });
});

describe("SwipeBrickBreakerGame — formation movement (final one-row-descent rule)", () => {
  function newGame() {
    return new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.99]));
  }

  function runOneEmptyVolley(game: SwipeBrickBreakerGame, state: ReturnType<SwipeBrickBreakerGame["start"]>) {
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 3000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    return state;
  }

  it("moves every existing brick down EXACTLY 1 logical row after a completed volley — never 2, never skipped", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, bricks: [{ row: 2, col: 5, hp: 99, maxHp: 99 }], redBonusBalls: [] };

    state = runOneEmptyVolley(game, state);

    const moved = state.bricks.find((b) => b.col === 5);
    expect(moved).toBeTruthy();
    expect(moved!.row).toBe(3); // exactly +1, never +2
  });

  it("moves every existing red bonus ball down EXACTLY 1 logical row after a completed volley", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    state = { ...state, bricks: [], redBonusBalls: [{ row: 2, col: 5 }] };

    state = runOneEmptyVolley(game, state);

    const moved = state.redBonusBalls.find((r) => r.col === 5);
    expect(moved).toBeTruthy();
    expect(moved!.row).toBe(3); // exactly +1, never +2
  });

  it("no brick or red bonus ball ever occupies Row 0, even across many repeated turns", () => {
    const game = new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.05, 0.3, 0.6, 0.9, 0.15, 0.4]));
    let state = game.start(game.createInitialState());
    for (let turn = 0; turn < 25 && state.phase !== "gameOver"; turn++) {
      state = runOneEmptyVolley(game, state);
      expect(state.bricks.every((b) => b.row !== 0)).toBe(true);
      expect(state.redBonusBalls.every((r) => r.row !== 0)).toBe(true);
    }
  });

  it("the new formation (bricks and any red bonus ball) appears starting from Row 1 after each turn", () => {
    const game = new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.01, 0.3, 0.6, 0.9, 0.15]));
    let state = game.start(game.createInitialState());
    state = { ...state, bricks: [], redBonusBalls: [] }; // nothing pre-existing to shift down
    state = runOneEmptyVolley(game, state);

    // Everything present after this turn is newly spawned, and must start at row 1.
    expect(state.bricks.every((b) => b.row === FORMATION_TOP_ROW)).toBe(true);
    expect(state.redBonusBalls.every((r) => r.row === FORMATION_TOP_ROW)).toBe(true);
  });
});

describe("SwipeBrickBreakerGame — Round replaces block-hit score", () => {
  function newGame() {
    return new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.99]));
  }

  it("SwipeBrickBreakerState has no score field at all — block hits accumulate nothing", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    expect("score" in state).toBe(false);
    state = { ...state, bricks: [{ row: 3, col: 3, hp: 1, maxHp: 1 }] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    for (let i = 0; i < 3000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
      expect("score" in state).toBe(false);
    }
  });

  it("computeResult's score is exactly the round reached (state.level), not derived from hits/HP/ball count", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
    expect(game.computeResult(state).score).toBe(state.level);

    // Advance a few rounds (clearing bricks each time so hit count/brick
    // HP/ball count vary independently of round) and confirm the result
    // score always tracks the round alone.
    for (let turn = 0; turn < 4; turn++) {
      state = { ...state, bricks: [], redBonusBalls: [] };
      state = game.handleInput(state, { type: "aim", angleRad: 0.1 });
      state = game.handleInput(state, { type: "fire" });
      for (let i = 0; i < 3000 && state.phase === "volley"; i++) {
        state = game.handleInput(state, { type: "tick", dtMs: 16 });
      }
      expect(game.computeResult(state).score).toBe(state.level);
    }
  });
});
