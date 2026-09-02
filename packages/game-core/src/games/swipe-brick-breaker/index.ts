export { SwipeBrickBreakerGame, SwipeBrickBreakerInputError, swipeBrickBreakerMetadata } from "./swipe-brick-breaker";
export { generateBricks, brickHpForLevel, newBrickCountForLevel } from "./bricks";
export { stepBalls, type BrickHitEvent, type StepResult } from "./physics";
export {
  MathRandomSource,
  BOARD_COLS,
  BOARD_ROWS,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  LAUNCH_MARGIN_ROWS,
  BRICK_TOP_MARGIN_ROWS,
  colToX,
  rowToY,
  BALL_RADIUS,
  BASE_BALL_SPEED,
  MAX_BALL_SPEED,
  MAX_NEW_BRICKS_PER_TURN,
  MAX_AIM_RADIANS,
  BALL_SPREAD_RADIANS,
  type RandomSource,
  type Brick,
  type Ball,
  type SwipeBrickBreakerPhase,
  type SwipeBrickBreakerState,
  type SwipeBrickBreakerInput,
  type SwipeBrickBreakerResultMetadata,
} from "./types";
