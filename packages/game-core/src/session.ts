import { assertValidLifecycleTransition } from "./lifecycle";
import type {
  Game,
  GameCompletionReason,
  GameLifecycleState,
  GameResult,
} from "./types";

export class InvalidGameOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGameOperationError";
  }
}

/**
 * Drives one play-through of a Game through the platform lifecycle
 * (idle -> ready -> playing -> finished -> result). Owns nothing about any
 * specific game's rules — it only enforces *when* a game may be asked to
 * initialize, accept input, or produce a result, and delegates the *how*
 * entirely to the Game contract.
 *
 * Not framework-bound: no DOM, HTTP, or SQL. A UI layer renders off
 * `lifecycleState`/`gameState`; an application service persists off the
 * GameResult from `computeResult()`.
 */
export class GameSession<TState = unknown, TInput = unknown, TResultMetadata = unknown> {
  private state: GameLifecycleState = "idle";
  private gameState: TState | undefined;
  private result: GameResult<TResultMetadata> | undefined;

  constructor(private readonly game: Game<TState, TInput, TResultMetadata>) {}

  get lifecycleState(): GameLifecycleState {
    return this.state;
  }

  getGameState(): TState {
    if (this.gameState === undefined) {
      throw new InvalidGameOperationError("Game state is not initialized yet");
    }
    return this.gameState;
  }

  getResult(): GameResult<TResultMetadata> {
    if (!this.result) {
      throw new InvalidGameOperationError("Result has not been computed yet");
    }
    return this.result;
  }

  /** idle -> ready: ask the game for its starting internal state. */
  ready(): void {
    this.transition("ready");
    this.gameState = this.game.createInitialState();
  }

  /** ready -> playing: hand control to the game. */
  start(): void {
    this.transition("playing");
    this.gameState = this.game.start(this.getGameState());
  }

  /**
   * Apply one input while playing. If the game reports itself finished
   * afterward, the session auto-advances to `finished` — a game never
   * drives the platform lifecycle directly, it only reports its own state.
   */
  submitInput(input: TInput): void {
    if (this.state !== "playing") {
      throw new InvalidGameOperationError(
        `Cannot submit input while lifecycle state is "${this.state}"`,
      );
    }
    this.gameState = this.game.handleInput(this.getGameState(), input);
    if (this.game.isFinished(this.gameState)) {
      this.transition("finished");
    }
  }

  /** Force-finish (e.g. an abandoned or invalidated round) outside of input handling. */
  finish(_reason: GameCompletionReason = "completed"): void {
    this.transition("finished");
  }

  /** finished -> result: derive the final GameResult from the game. */
  computeResult(): GameResult<TResultMetadata> {
    this.transition("result");
    this.result = this.game.computeResult(this.getGameState());
    return this.result;
  }

  /** Return to idle from any state (retry / abandon). */
  reset(): void {
    this.transition("idle");
    this.gameState = undefined;
    this.result = undefined;
  }

  private transition(to: GameLifecycleState): void {
    assertValidLifecycleTransition(this.state, to);
    this.state = to;
  }
}
