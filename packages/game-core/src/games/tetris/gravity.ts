import type { TetrisRuleset } from "./types";

/**
 * Milliseconds per row of automatic fall at `level`, per the ruleset's
 * gravity table (index level - 1; the table's last entry repeats for any
 * level beyond its length, so it never needs one entry per achievable
 * level). Level progression itself is a later phase — Phase E only ever
 * calls this with level 1 — but keeping the lookup here, rather than
 * inlining `ruleset.gravity[0]` in the engine, is what lets that later
 * phase change the level without touching any gravity/lock-delay logic.
 */
export function gravityIntervalMs(ruleset: TetrisRuleset, level: number): number {
  const index = Math.min(ruleset.gravity.length - 1, Math.max(0, level - 1));
  return ruleset.gravity[index];
}
