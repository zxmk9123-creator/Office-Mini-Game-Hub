/**
 * Time source the engine reads from instead of calling a browser/runtime
 * clock directly. The Game Core never imports `performance.now`,
 * `Date.now`, or any timer API — an application boundary (e.g. the web
 * app) supplies a concrete Clock, and tests supply a fake one.
 */
export interface Clock {
  /** A monotonically increasing timestamp in milliseconds. Origin is irrelevant — only deltas are used. */
  now(): number;
}

/**
 * Source of the randomized wait before the target appears. Injectable so
 * tests can force a specific delay instead of depending on real
 * randomness.
 */
export interface RandomDelaySource {
  nextDelayMs(minMs: number, maxMs: number): number;
}

/** `Math.random` is a plain JS builtin (not a browser API), so a default lives in game-core. */
export class MathRandomDelaySource implements RandomDelaySource {
  nextDelayMs(minMs: number, maxMs: number): number {
    return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  }
}

/**
 * Internal phases of one Reaction Test round, nested inside the platform's
 * "playing" lifecycle state: ready -> waiting -> target -> done.
 */
export const REACTION_PHASES = ["ready", "waiting", "target", "done"] as const;
export type ReactionPhase = (typeof REACTION_PHASES)[number];

export interface ReactionTestState {
  phase: ReactionPhase;
  /**
   * The randomized wait chosen for this round, in ms. Read by the
   * application boundary to schedule its own timer for the "reveal"
   * input — never rendered to the player.
   */
  delayMs: number;
  targetAppearedAt: number | null;
  falseStart: boolean;
  reactionTimeMs: number | null;
}

/**
 * "reveal" is delivered by the application boundary once its timer for
 * `delayMs` has elapsed — the engine itself never schedules anything.
 * "click" is delivered whenever the player clicks/taps, at any phase; the
 * engine decides what that means (false start, valid reaction, or a
 * no-op after the round is already done).
 */
export type ReactionTestInput = { type: "reveal" } | { type: "click" };

export interface ReactionTestResultMetadata {
  reactionTimeMs: number | null;
  falseStart: boolean;
}
