import type { Clock } from "@mini-game-hub/game-core";

/**
 * The Clock adapter for the browser. This is the boundary where
 * `performance.now()` is allowed to exist — the game-core engine only ever
 * sees the `Clock` interface, never this implementation.
 */
export class PerformanceClock implements Clock {
  now(): number {
    return performance.now();
  }
}
