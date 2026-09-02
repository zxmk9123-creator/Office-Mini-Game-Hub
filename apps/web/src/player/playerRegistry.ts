/**
 * A small client-side registry of every Player identity this browser has
 * ever used, keyed by nothing but localStorage — no server involvement.
 * It exists so "switch player" can be a cheap, local, reversible action:
 * leaving a player never deletes anything (server-side or locally), so
 * returning to a previously-used nickname can restore that player's
 * existing `playerId` instead of minting a new one via `POST /players`
 * (which is what silently orphaned that player's Sticky Notes before).
 *
 * This is still an anonymous, browser-local identity system, not
 * authentication: the registry only ever restores identities *this
 * browser* already knows about (never queries the server by nickname),
 * and the same nickname on a different browser/device remains a
 * completely separate, unrelated player.
 */
export interface RegisteredPlayer {
  playerId: string;
  nickname: string;
}

const REGISTRY_KEY = "mini-game-hub:players";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (private mode, etc.) — still usable for this session.
  }
}

export function readRegistry(): RegisteredPlayer[] {
  const raw = readStorage(REGISTRY_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is RegisteredPlayer =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RegisteredPlayer).playerId === "string" &&
        typeof (entry as RegisteredPlayer).nickname === "string",
    );
  } catch {
    return [];
  }
}

function writeRegistry(entries: RegisteredPlayer[]): void {
  writeStorage(REGISTRY_KEY, JSON.stringify(entries));
}

/**
 * Adds `entry` to the registry unless a player with that `playerId` is
 * already recorded (never a duplicate entry for the same player). Does
 * NOT deduplicate by nickname — two different `playerId`s can validly
 * share a nickname (nicknames were never required to be unique), and
 * that ambiguity is resolved deterministically by `findByNickname`
 * below, not by silently merging them here.
 */
export function rememberPlayer(entry: RegisteredPlayer): void {
  const registry = readRegistry();
  if (registry.some((p) => p.playerId === entry.playerId)) {
    return;
  }
  writeRegistry([...registry, entry]);
}

/**
 * Looks up a previously-used player by its exact nickname text (same
 * trimming/casing rules as player creation — no fuzzy matching). If more
 * than one registered player shares that nickname, this deterministically
 * returns the earliest-registered one (first match in registry order) —
 * never merges them, never picks at random.
 */
export function findRegisteredPlayerByNickname(nickname: string): RegisteredPlayer | undefined {
  return readRegistry().find((p) => p.nickname === nickname);
}

/**
 * One-time migration for a browser that already has the older
 * single-player `mini-game-hub:playerId`/`mini-game-hub:nickname` keys
 * from before this registry existed: folds that identity into the
 * registry (if it isn't already there) so it stays reachable after the
 * player switches away and later returns. Idempotent — safe to call on
 * every mount.
 */
export function migrateLegacyIdentity(legacyPlayerId: string | null, legacyNickname: string | null): void {
  if (!legacyPlayerId || !legacyNickname) {
    return;
  }
  rememberPlayer({ playerId: legacyPlayerId, nickname: legacyNickname });
}
