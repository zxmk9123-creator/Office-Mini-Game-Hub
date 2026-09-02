import type { Game, GameMetadata, GameResult } from "../../types";
import type { Clock } from "../reaction-test/types";
import { generateFormation } from "./bricks";
import { stepBalls } from "./physics";
import {
  BALL_RADIUS,
  BALL_SPREAD_RADIANS,
  BASE_BALL_SPEED,
  BOARD_HEIGHT,
  BOARD_ROWS,
  BOARD_WIDTH,
  MAX_AIM_RADIANS,
  MAX_BALL_SPEED,
  MathRandomSource,
  type Ball,
  type RandomSource,
  type SwipeBrickBreakerInput,
  type SwipeBrickBreakerResultMetadata,
  type SwipeBrickBreakerState,
} from "./types";

export class SwipeBrickBreakerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwipeBrickBreakerInputError";
  }
}

export const swipeBrickBreakerMetadata: GameMetadata = {
  id: "swipe-brick-breaker",
  name: "Swipe Brick Breaker",
  description: "Drag to aim, release to fire every ball you've got.",
  icon: "swipe-brick-breaker",
  scoreType: "higher_is_better",
  version: "1.0.0",
  enabled: true,
};

const LAUNCH_X = BOARD_WIDTH / 2;
const LAUNCH_Y = BOARD_HEIGHT - 0.3;

function clampAim(angleRad: number): number {
  return Math.min(MAX_AIM_RADIANS, Math.max(-MAX_AIM_RADIANS, angleRad));
}

function speedForLevel(level: number): number {
  return Math.min(MAX_BALL_SPEED, BASE_BALL_SPEED + level * 0.03);
}

function launchBalls(ballCount: number, aimAngleRad: number, level: number): Ball[] {
  const speed = speedForLevel(level);
  const balls: Ball[] = [];
  for (let i = 0; i < ballCount; i++) {
    // Ball 0 fires exactly on the aimed line — the same direction the aim
    // guide showed. Every subsequent ball gets a tiny fixed, deterministic
    // offset (alternating -/+ BALL_SPREAD_RADIANS) purely so multiple
    // balls don't perfectly overlap forever; it is NEVER scaled by ball
    // index/count, so the whole volley — 2 balls or 50 — stays a tight,
    // essentially parallel group rather than fanning out wider as more
    // balls join. This is deliberately not a shotgun-spread mechanic.
    const sign = i % 2 === 0 ? -1 : 1;
    const angle = clampAim(aimAngleRad + (i === 0 ? 0 : sign * BALL_SPREAD_RADIANS));
    balls.push({
      x: LAUNCH_X,
      y: LAUNCH_Y,
      vx: speed * Math.sin(angle),
      vy: -speed * Math.cos(angle),
      radius: BALL_RADIUS,
      active: true,
    });
  }
  return balls;
}

/**
 * Swipe Brick Breaker's game engine. Pure state transitions only — no rAF,
 * no canvas, no DOM. The application boundary drives the physics forward
 * by sending a "tick" input once per animation frame with the elapsed
 * time; everything else (aim, fire, collisions, turn/level progression,
 * game over) is decided here.
 */
export class SwipeBrickBreakerGame
  implements Game<SwipeBrickBreakerState, SwipeBrickBreakerInput, SwipeBrickBreakerResultMetadata>
{
  readonly metadata = swipeBrickBreakerMetadata;
  private bricksDestroyed = 0;
  private redBonusBallsCollected = 0;

  constructor(
    private readonly clock: Clock,
    private readonly random: RandomSource = new MathRandomSource(),
  ) {}

  createInitialState(): SwipeBrickBreakerState {
    return {
      phase: "ready",
      level: 0,
      ballCount: 0,
      score: 0,
      bricks: [],
      redBonusBalls: [],
      balls: [],
      aimAngleRad: 0,
    };
  }

  /** ready -> playing: build the level 1 board. */
  start(state: SwipeBrickBreakerState): SwipeBrickBreakerState {
    this.bricksDestroyed = 0;
    this.redBonusBallsCollected = 0;
    const formation = generateFormation(1, this.random);
    return {
      ...state,
      phase: "ready",
      level: 1,
      ballCount: 1,
      score: 0,
      bricks: formation.bricks,
      redBonusBalls: formation.redBonusBalls,
      balls: [],
      aimAngleRad: 0,
    };
  }

  handleInput(state: SwipeBrickBreakerState, input: SwipeBrickBreakerInput): SwipeBrickBreakerState {
    switch (input.type) {
      case "aim":
        return this.handleAim(state, input.angleRad);
      case "cancelAim":
        return this.handleCancelAim(state);
      case "fire":
        return this.handleFire(state);
      case "tick":
        return this.handleTick(state, input.dtMs);
      default:
        return state;
    }
  }

  private handleAim(state: SwipeBrickBreakerState, angleRad: number): SwipeBrickBreakerState {
    if (state.phase !== "ready" && state.phase !== "aiming") {
      // Aiming only matters between volleys — a stray drag update that
      // arrives while a volley is already in flight is simply ignored
      // rather than treated as an error, since the view's pointer
      // handlers and the tick loop run independently of each other.
      return state;
    }
    return { ...state, phase: "aiming", aimAngleRad: clampAim(angleRad) };
  }

  private handleCancelAim(state: SwipeBrickBreakerState): SwipeBrickBreakerState {
    if (state.phase !== "aiming") {
      return state;
    }
    return { ...state, phase: "ready", aimAngleRad: 0 };
  }

  private handleFire(state: SwipeBrickBreakerState): SwipeBrickBreakerState {
    if (state.phase !== "aiming") {
      throw new SwipeBrickBreakerInputError(
        `"fire" is only valid while aiming, got phase "${state.phase}"`,
      );
    }
    return {
      ...state,
      phase: "volley",
      balls: launchBalls(state.ballCount, state.aimAngleRad, state.level),
    };
  }

  private handleTick(state: SwipeBrickBreakerState, dtMs: number): SwipeBrickBreakerState {
    if (state.phase !== "volley") {
      // A no-op rather than an error: the view drives ticks off a
      // continuous rAF loop that doesn't know/care what phase the game
      // is in at any given frame.
      return state;
    }

    const { balls, bricks, redBonusBalls, hits, collected } = stepBalls(
      state.balls,
      state.bricks,
      state.redBonusBalls,
      dtMs / 1000,
    );

    let scoreDelta = 0;
    for (const hit of hits) {
      scoreDelta += 10 + state.level;
      if (hit.destroyed) {
        scoreDelta += 20 + hit.brick.maxHp * 10;
        this.bricksDestroyed += 1;
      }
    }
    for (const _collectedBall of collected) {
      scoreDelta += 30 + state.level * 2;
      this.redBonusBallsCollected += 1;
    }

    const volleyOver = balls.every((b) => !b.active);
    if (!volleyOver) {
      return { ...state, balls, bricks, redBonusBalls, score: state.score + scoreDelta };
    }

    return this.resolveTurn({ ...state, balls: [], bricks, redBonusBalls, score: state.score + scoreDelta });
  }

  /**
   * One-row descent, per the final formation-movement rule: every
   * surviving brick and red bonus ball moves down EXACTLY one logical
   * row — never two, never skipped. Row 0 is a permanent empty buffer:
   * the new formation (bricks and, rarely, a red bonus ball) always
   * spawns starting at row 1, never row 0. Game Over is triggered only
   * by a BRICK crossing the bottom boundary (row >= BOARD_ROWS); a red
   * bonus ball reaching the same boundary is simply lost (filtered out)
   * and never ends the game.
   */
  private resolveTurn(state: SwipeBrickBreakerState): SwipeBrickBreakerState {
    const shiftedBricks = state.bricks.map((b) => ({ ...b, row: b.row + 1 }));
    const shiftedRedBonusBalls = state.redBonusBalls
      .map((r) => ({ ...r, row: r.row + 1 }))
      .filter((r) => r.row < BOARD_ROWS);

    const gameOver = shiftedBricks.some((b) => b.row >= BOARD_ROWS);
    if (gameOver) {
      return {
        ...state,
        phase: "gameOver",
        bricks: shiftedBricks,
        redBonusBalls: shiftedRedBonusBalls,
        aimAngleRad: 0,
      };
    }

    const nextLevel = state.level + 1;
    const formation = generateFormation(nextLevel, this.random);
    return {
      ...state,
      phase: "ready",
      level: nextLevel,
      ballCount: nextLevel,
      bricks: [...shiftedBricks, ...formation.bricks],
      redBonusBalls: [...shiftedRedBonusBalls, ...formation.redBonusBalls],
      aimAngleRad: 0,
    };
  }

  isFinished(state: SwipeBrickBreakerState): boolean {
    return state.phase === "gameOver";
  }

  computeResult(state: SwipeBrickBreakerState): GameResult<SwipeBrickBreakerResultMetadata> {
    return {
      gameId: this.metadata.id,
      scoreType: this.metadata.scoreType,
      score: state.score,
      completion: {
        reason: "completed",
        completedAt: this.clock.now(),
      },
      metadata: {
        level: state.level,
        bricksDestroyed: this.bricksDestroyed,
        redBonusBallsCollected: this.redBonusBallsCollected,
      },
    };
  }
}
