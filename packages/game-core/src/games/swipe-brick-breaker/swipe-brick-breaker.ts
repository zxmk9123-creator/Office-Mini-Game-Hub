import type { Game, GameMetadata, GameResult } from "../../types";
import type { Clock } from "../reaction-test/types";
import { generateBricks } from "./bricks";
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
    // Ball 0 fires exactly on the aimed line; every subsequent ball gets a
    // small, deterministic, alternating offset around it so a multi-ball
    // volley fans out slightly instead of every ball perfectly overlapping
    // forever — without being wide enough to defeat deliberate aiming.
    const step = Math.ceil(i / 2);
    const sign = i % 2 === 0 ? -1 : 1;
    const angle = clampAim(aimAngleRad + (i === 0 ? 0 : sign * step * BALL_SPREAD_RADIANS));
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
      balls: [],
      aimAngleRad: 0,
    };
  }

  /** ready -> playing: build the level 1 board. */
  start(state: SwipeBrickBreakerState): SwipeBrickBreakerState {
    this.bricksDestroyed = 0;
    return {
      ...state,
      phase: "ready",
      level: 1,
      ballCount: 1,
      score: 0,
      bricks: generateBricks(1, this.random),
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

    const { balls, bricks, hits } = stepBalls(state.balls, state.bricks, dtMs / 1000);

    let scoreDelta = 0;
    for (const hit of hits) {
      scoreDelta += 10 + state.level;
      if (hit.destroyed) {
        scoreDelta += 20 + hit.brick.maxHp * 10;
        this.bricksDestroyed += 1;
      }
    }

    const volleyOver = balls.every((b) => !b.active);
    if (!volleyOver) {
      return { ...state, balls, bricks, score: state.score + scoreDelta };
    }

    return this.resolveTurn({ ...state, balls: [], bricks, score: state.score + scoreDelta });
  }

  /** Shifts surviving bricks down a row, checks for game over, and — if the game continues — spawns the next level's board. */
  private resolveTurn(state: SwipeBrickBreakerState): SwipeBrickBreakerState {
    const shiftedBricks = state.bricks.map((b) => ({ ...b, row: b.row + 1 }));
    const gameOver = shiftedBricks.some((b) => b.row >= BOARD_ROWS);
    if (gameOver) {
      return { ...state, phase: "gameOver", bricks: shiftedBricks, aimAngleRad: 0 };
    }

    const nextLevel = state.level + 1;
    const newBricks = generateBricks(nextLevel, this.random);
    return {
      ...state,
      phase: "ready",
      level: nextLevel,
      ballCount: nextLevel,
      bricks: [...shiftedBricks, ...newBricks],
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
      },
    };
  }
}
