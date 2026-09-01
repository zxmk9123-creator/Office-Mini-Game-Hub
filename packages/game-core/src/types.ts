import type { ScoreType } from "@mini-game-hub/shared";

export type { ScoreType };

/**
 * Static, platform-visible description of a game. Adding a game must only
 * ever mean adding one of these plus a Game implementation — never editing
 * platform code.
 */
export interface GameMetadata {
  /** Stable identifier, also used as the URL slug. Immutable once shipped. */
  id: string;
  name: string;
  description: string;
  /** Opaque identifier the UI resolves to an icon; game-core does not render it. */
  icon: string;
  scoreType: ScoreType;
  /** Semver-ish string; bump when a game's result shape changes. */
  version: string;
  enabled: boolean;
}

/** The platform-level lifecycle every game session moves through. */
export const GAME_LIFECYCLE_STATES = [
  "idle",
  "ready",
  "playing",
  "finished",
  "result",
] as const;
export type GameLifecycleState = (typeof GAME_LIFECYCLE_STATES)[number];

/** Why a game session left the PLAYING state. */
export type GameCompletionReason = "completed" | "aborted" | "invalid";

export interface GameCompletion {
  reason: GameCompletionReason;
  /** Epoch ms when the game reported completion. */
  completedAt: number;
}

/**
 * Generic result contract. The platform only ever reads score/scoreType/
 * completion — `metadata` is per-game and opaque to game-core, the registry,
 * ranking, and persistence.
 *
 * `score` is `null` whenever `completion.reason !== "completed"` (a false
 * start, an aborted or otherwise invalid attempt) — there is no reaction
 * time, WPM, or any other score to report. `null` is explicit and survives
 * JSON/HTTP/SQL serialization intact, unlike `NaN` (which `JSON.stringify`
 * silently turns into `null` anyway, and which most SQL numeric columns
 * reject outright) — see `validateGameResult`, which enforces this pairing.
 */
export interface GameResult<TResultMetadata = unknown> {
  gameId: string;
  scoreType: ScoreType;
  score: number | null;
  completion: GameCompletion;
  metadata: TResultMetadata;
}

/**
 * The framework-agnostic contract every game implements. TState is the
 * game's own internal state shape (opaque to the platform); TInput is
 * whatever input events the game accepts; TResultMetadata is the shape of
 * its GameResult["metadata"].
 *
 * A Game is a pure state-transition engine: no DOM, no HTTP, no SQL. It
 * receives state and input, returns new state. Anything side-effecting
 * (persistence, ranking, rendering) is a platform/application concern that
 * consumes GameResult after the fact.
 */
export interface Game<TState = unknown, TInput = unknown, TResultMetadata = unknown> {
  readonly metadata: GameMetadata;

  /** Produce the game's own starting internal state (pre-PLAYING). */
  createInitialState(): TState;

  /** Transition state in response to the platform entering PLAYING. */
  start(state: TState): TState;

  /** Apply one user input event, returning the resulting state. */
  handleInput(state: TState, input: TInput): TState;

  /** Whether the game considers itself done, given its current state. */
  isFinished(state: TState): boolean;

  /** Derive the final GameResult from a finished state. */
  computeResult(state: TState): GameResult<TResultMetadata>;
}
