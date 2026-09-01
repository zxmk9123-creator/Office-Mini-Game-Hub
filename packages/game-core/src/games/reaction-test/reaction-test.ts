import type { Game, GameMetadata, GameResult } from "../../types";
import {
  MathRandomDelaySource,
  type Clock,
  type RandomDelaySource,
  type ReactionTestInput,
  type ReactionTestResultMetadata,
  type ReactionTestState,
} from "./types";

export class ReactionTestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReactionTestInputError";
  }
}

export const REACTION_TEST_MIN_DELAY_MS = 1000;
export const REACTION_TEST_MAX_DELAY_MS = 3000;

export const reactionTestMetadata: GameMetadata = {
  id: "reaction-test",
  name: "Reaction Test",
  description: "How fast are you? Click the moment the target appears.",
  icon: "reaction-test",
  scoreType: "lower_is_better",
  version: "1.0.0",
  enabled: true,
};

/**
 * Reaction Test's game engine. Pure state transitions only — no timers, no
 * DOM. The application boundary owns scheduling: it reads `state.delayMs`
 * and, once that much time has passed on its own clock, sends a "reveal"
 * input; the engine never calls setTimeout itself.
 */
export class ReactionTestGame
  implements Game<ReactionTestState, ReactionTestInput, ReactionTestResultMetadata>
{
  readonly metadata = reactionTestMetadata;

  constructor(
    private readonly clock: Clock,
    private readonly randomDelaySource: RandomDelaySource = new MathRandomDelaySource(),
    private readonly minDelayMs = REACTION_TEST_MIN_DELAY_MS,
    private readonly maxDelayMs = REACTION_TEST_MAX_DELAY_MS,
  ) {}

  createInitialState(): ReactionTestState {
    return {
      phase: "ready",
      delayMs: 0,
      targetAppearedAt: null,
      falseStart: false,
      reactionTimeMs: null,
    };
  }

  /** ready -> waiting: pick this round's random delay and start the wait. */
  start(state: ReactionTestState): ReactionTestState {
    return {
      ...state,
      phase: "waiting",
      delayMs: this.randomDelaySource.nextDelayMs(this.minDelayMs, this.maxDelayMs),
    };
  }

  handleInput(state: ReactionTestState, input: ReactionTestInput): ReactionTestState {
    if (input.type === "reveal") {
      return this.handleReveal(state);
    }
    return this.handleClick(state);
  }

  private handleReveal(state: ReactionTestState): ReactionTestState {
    if (state.phase !== "waiting") {
      throw new ReactionTestInputError(
        `"reveal" is only valid during "waiting", got "${state.phase}"`,
      );
    }
    return { ...state, phase: "target", targetAppearedAt: this.clock.now() };
  }

  private handleClick(state: ReactionTestState): ReactionTestState {
    switch (state.phase) {
      case "waiting":
        // Clicked before the target appeared: false start.
        return { ...state, phase: "done", falseStart: true, reactionTimeMs: null };

      case "target": {
        // First valid click: the only one that gets to set reactionTimeMs.
        const reactionTimeMs = this.clock.now() - (state.targetAppearedAt ?? this.clock.now());
        return { ...state, phase: "done", falseStart: false, reactionTimeMs };
      }

      case "done":
        // Requirement: subsequent clicks must not alter the recorded result.
        return state;

      case "ready":
      default:
        throw new ReactionTestInputError(
          `"click" is not valid before the round has started (phase "${state.phase}")`,
        );
    }
  }

  isFinished(state: ReactionTestState): boolean {
    return state.phase === "done";
  }

  computeResult(state: ReactionTestState): GameResult<ReactionTestResultMetadata> {
    return {
      gameId: this.metadata.id,
      scoreType: this.metadata.scoreType,
      // A false start has no meaningful reaction time — NaN keeps it out of
      // any score comparison/persistence path that checks Number.isFinite.
      score: state.falseStart || state.reactionTimeMs === null ? Number.NaN : state.reactionTimeMs,
      completion: {
        reason: state.falseStart ? "invalid" : "completed",
        completedAt: this.clock.now(),
      },
      metadata: {
        reactionTimeMs: state.reactionTimeMs,
        falseStart: state.falseStart,
      },
    };
  }
}
