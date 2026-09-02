import { GameRegistry, ReactionTestGame, SwipeBrickBreakerGame, type Clock } from "@mini-game-hub/game-core";

/**
 * The server only ever reads a registered game's metadata (id, scoreType,
 * enabled) to validate and create sessions — it never runs a round. This
 * Clock exists purely so a ReactionTestGame instance can be constructed for
 * registration; `Date.now()` is fine here precisely because it's never
 * actually used to time a reaction.
 */
class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

let registry: GameRegistry | undefined;

/**
 * The single source of truth for which games the platform knows about.
 * Adding a future game means registering it here — nothing else in the
 * server (routes, services, repositories) needs to change.
 */
export function getGameRegistry(): GameRegistry {
  if (!registry) {
    registry = new GameRegistry();
    registry.register(new ReactionTestGame(new SystemClock()));
    registry.register(new SwipeBrickBreakerGame(new SystemClock()));
  }
  return registry;
}
