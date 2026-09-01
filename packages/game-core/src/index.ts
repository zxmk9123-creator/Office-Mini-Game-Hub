export type {
  Game,
  GameMetadata,
  GameLifecycleState,
  GameCompletion,
  GameCompletionReason,
  GameResult,
  ScoreType,
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
