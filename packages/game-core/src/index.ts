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
