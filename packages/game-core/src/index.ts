export type {
  Game,
  GameMetadata,
  GameLifecycleState,
  GameCompletion,
  GameCompletionReason,
  GameResult,
  ScoreType,
  RankingPeriod,
} from "./types";
export { GAME_LIFECYCLE_STATES } from "./types";

export {
  isValidLifecycleTransition,
  assertValidLifecycleTransition,
  InvalidLifecycleTransitionError,
} from "./lifecycle";

export { GameSession, InvalidGameOperationError } from "./session";

export { validateGameResult, InvalidGameResultError } from "./result";

export {
  GameRegistry,
  validateGameMetadata,
  InvalidGameMetadataError,
  DuplicateGameError,
  GameNotFoundError,
} from "./registry";

export {
  MockGame,
  mockGameMetadata,
  type MockGameState,
  type MockGameInput,
  type MockGameResultMetadata,
} from "./games/mock-game";

export {
  ReactionTestGame,
  ReactionTestInputError,
  reactionTestMetadata,
  REACTION_TEST_MIN_DELAY_MS,
  REACTION_TEST_MAX_DELAY_MS,
  MathRandomDelaySource,
  REACTION_PHASES,
  type Clock,
  type RandomDelaySource,
  type ReactionPhase,
  type ReactionTestState,
  type ReactionTestInput,
  type ReactionTestResultMetadata,
} from "./games/reaction-test";

export {
  SwipeBrickBreakerGame,
  SwipeBrickBreakerInputError,
  swipeBrickBreakerMetadata,
  generateBricks,
  generateFormation,
  brickHpForLevel,
  newBrickCountForLevel,
  stepBalls,
  MathRandomSource,
  BOARD_COLS,
  BOARD_ROWS,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  LAUNCH_MARGIN_ROWS,
  BRICK_TOP_MARGIN_ROWS,
  FORMATION_TOP_ROW,
  colToX,
  rowToY,
  BALL_RADIUS,
  BASE_BALL_SPEED,
  MAX_BALL_SPEED,
  MAX_NEW_BRICKS_PER_TURN,
  MAX_AIM_RADIANS,
  BALL_LAUNCH_STAGGER_MS,
  type RandomSource,
  type BrickHitEvent,
  type StepResult,
  type Brick,
  type Ball,
  type RedBonusBall,
  type SwipeBrickBreakerPhase,
  type SwipeBrickBreakerState,
  type SwipeBrickBreakerInput,
  type SwipeBrickBreakerResultMetadata,
} from "./games/swipe-brick-breaker";

export {
  MinesweeperGame,
  MinesweeperInputError,
  minesweeperMetadataFor,
  minesweeperEasyMetadata,
  minesweeperNormalMetadata,
  minesweeperHardMetadata,
  createEmptyBoard,
  neighborsOf,
  placeMines,
  revealCascade,
  safetyZoneOf,
  MINESWEEPER_DIFFICULTIES,
  MathRandomSource as MinesweeperMathRandomSource,
  type RandomSource as MinesweeperRandomSource,
  type MinesweeperDifficulty,
  type MinesweeperDifficultyConfig,
  type CellState as MinesweeperCellState,
  type Cell as MinesweeperCell,
  type MinesweeperPhase,
  type MinesweeperState,
  type MinesweeperInput,
  type MinesweeperResultMetadata,
} from "./games/minesweeper";
