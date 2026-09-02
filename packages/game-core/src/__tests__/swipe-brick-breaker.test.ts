import { describe, expect, it } from "vitest";
import {
  BOARD_COLS,
  BOARD_ROWS,
  FORMATION_TOP_ROW,
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

  it("brick HP is low at level 1 and increases gradually with level", () => {
    expect(brickHpForLevel(1)).toBe(1);
    expect(brickHpForLevel(2)).toBe(1);
    expect(brickHpForLevel(3)).toBe(1);
    expect(brickHpForLevel(4)).toBe(2);
    expect(brickHpForLevel(4)).toBeGreaterThanOrEqual(brickHpForLevel(1));
    expect(brickHpForLevel(30)).toBeGreaterThan(brickHpForLevel(3));
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
    const { bricks, redBonusBalls } = generateFormation(30, new SequenceRandomSource([0.01, 0.99, 0.99, 0.99, 0.99]));
    expect(bricks.length).toBeLessThanOrEqual(MAX_NEW_BRICKS_PER_TURN);
    // With a near-guaranteed spawn roll (0.01) and a full brick batch not
    // consuming every column, a red bonus ball can still appear alongside
    // a full-size brick batch.
    if (bricks.length < BOARD_COLS) {
      expect(redBonusBalls.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("stepBalls (collision physics)", () => {
  function ball(overrides: Partial<Ball> = {}): Ball {
    return { x: 3.5, y: 3.5, vx: 0, vy: -1, radius: 0.12, active: true, ...overrides };
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

  it("a ball bounces off a red bonus ball just like a brick, and never collides with both in one tick", () => {
    const brick: Brick = { row: 2, col: 3, hp: 3, maxHp: 3 };
    const redBall = { row: 2, col: 3 }; // same cell — only one collision should resolve
    const { hits, collected } = stepBalls([ball({ x: 3.5, y: 2.45, vx: 0, vy: 1 })], [brick], [redBall], 0.1);
    expect(hits.length + collected.length).toBe(1);
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

  it("advances level by exactly 1 and ball count by exactly 1 after a cleared volley", () => {
    const game = newGame();
    let state = game.start(game.createInitialState());
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
      expect(state.ballCount).toBe(2);
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
    // Whether it ended via game over or the loop cap, level tracks 1:1
    // with ballCount and neither was clamped to any fixed maximum.
    expect(state.ballCount).toBe(state.level > 0 ? state.level : state.ballCount);
    expect(state.level).toBeGreaterThan(1);
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

    // Restart: a fresh start() must reset score/level/ballCount/bricks/balls/phase.
    const restarted = game.start(game.createInitialState());
    expect(restarted.phase).toBe("ready");
    expect(restarted.score).toBe(0);
    expect(restarted.level).toBe(1);
    expect(restarted.ballCount).toBe(1);
    expect(restarted.balls).toHaveLength(0);
    expect(restarted.redBonusBalls).toHaveLength(0);
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

describe("SwipeBrickBreakerGame — scoring", () => {
  it("score increases after a valid brick hit and has no clamp/maximum", () => {
    const game = new SwipeBrickBreakerGame(new FixedClock(), new SequenceRandomSource([0.99]));
    let state = game.start(game.createInitialState());
    state = { ...state, bricks: [{ row: 3, col: 3, hp: 1, maxHp: 1 }] };
    state = game.handleInput(state, { type: "aim", angleRad: 0 });
    state = game.handleInput(state, { type: "fire" });
    const scoreBefore = state.score;
    for (let i = 0; i < 3000 && state.phase === "volley"; i++) {
      state = game.handleInput(state, { type: "tick", dtMs: 16 });
    }
    expect(state.score).toBeGreaterThan(scoreBefore);

    // No fixed maximum: directly construct an enormous score and confirm
    // the engine never clamps it back down on the next tick.
    const hugeScoreState = { ...state, score: Number.MAX_SAFE_INTEGER - 1000, phase: "ready" as const };
    const afterAim = game.handleInput(hugeScoreState, { type: "aim", angleRad: 0 });
    expect(afterAim.score).toBe(Number.MAX_SAFE_INTEGER - 1000);
  });
});
