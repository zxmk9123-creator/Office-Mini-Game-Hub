import { useEffect, useState } from "react";
import { createPlayer } from "../api/client";

const STORAGE_KEY = "mini-game-hub:playerId";

/**
 * Silently creates (once) or reuses a Player id for this browser via
 * localStorage — there is no login/nickname UI yet, only the identity
 * plumbing Phase 5's Session -> Result flow needs to exist end to end.
 */
export function usePlayerId(): string | null {
  const [playerId, setPlayerId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (playerId) {
      return;
    }
    let cancelled = false;
    createPlayer("Guest").then((player) => {
      if (cancelled) {
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, player.id);
      } catch {
        // localStorage unavailable (private mode, etc.) — still usable for this session.
      }
      setPlayerId(player.id);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return playerId;
}
