import type { GameLifecycleState } from "./types";

export class InvalidLifecycleTransitionError extends Error {
  constructor(
    public readonly from: GameLifecycleState,
    public readonly to: GameLifecycleState,
  ) {
    super(`Invalid game lifecycle transition: ${from} -> ${to}`);
    this.name = "InvalidLifecycleTransitionError";
  }
}

/**
 * The platform-level lifecycle: IDLE -> READY -> PLAYING -> FINISHED -> RESULT.
 * A session may return to IDLE from any state (retry / abandon). This table
 * is the single source of truth for which transitions are legal; a game's
 * own internal state machine is free to be richer, but it never bypasses
 * this outer shell.
 */
const ALLOWED_TRANSITIONS: Record<GameLifecycleState, readonly GameLifecycleState[]> = {
  idle: ["ready"],
  ready: ["playing", "idle"],
  playing: ["finished", "idle"],
  finished: ["result", "idle"],
  result: ["idle"],
};

export function isValidLifecycleTransition(
  from: GameLifecycleState,
  to: GameLifecycleState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidLifecycleTransition(
  from: GameLifecycleState,
  to: GameLifecycleState,
): void {
  if (!isValidLifecycleTransition(from, to)) {
    throw new InvalidLifecycleTransitionError(from, to);
  }
}
