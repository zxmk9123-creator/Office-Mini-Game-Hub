import { useCallback, useState } from "react";
import { createPlayer } from "../api/client";

const PLAYER_ID_KEY = "mini-game-hub:playerId";
const NICKNAME_KEY = "mini-game-hub:nickname";

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

export interface PlayerSession {
  playerId: string | null;
  nickname: string | null;
  /** True while a createPlayer() request from setNickname() is in flight. */
  submitting: boolean;
  error: string | null;
  /**
   * Creates (once) the Player for a freshly-entered nickname and persists
   * playerId/nickname for future visits. Does nothing if a request is
   * already in flight — the caller (NicknameEntry) also disables its
   * submit control on `submitting`, but this guard is what actually
   * prevents a duplicate Player being created on a double-submit.
   */
  setNickname: (rawNickname: string) => Promise<void>;
  /** Forgets the stored identity — returns to the nickname screen. */
  clearPlayer: () => void;
}

/**
 * Owns this browser's Player identity. Unlike the identity plumbing from
 * earlier phases, this never silently creates a "Guest" player on mount —
 * a Player is only ever created in response to the user submitting the
 * nickname form. `playerId` is what the rest of the app treats as the
 * identity; `nickname` is display-only, exactly mirroring the server's own
 * "nickname is not identity" stance.
 */
export function usePlayerSession(): PlayerSession {
  const [playerId, setPlayerId] = useState<string | null>(() => readStorage(PLAYER_ID_KEY));
  const [nickname, setNicknameState] = useState<string | null>(() => readStorage(NICKNAME_KEY));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setNickname = useCallback(async (rawNickname: string) => {
    if (submitting) {
      return;
    }
    const trimmed = rawNickname.trim();
    if (!trimmed) {
      setError("Enter a nickname to continue.");
      return;
    }
    if (trimmed.length > 20) {
      setError("Nicknames are limited to 20 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const player = await createPlayer(trimmed);
      writeStorage(PLAYER_ID_KEY, player.id);
      writeStorage(NICKNAME_KEY, player.nickname);
      setPlayerId(player.id);
      setNicknameState(player.nickname);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  const clearPlayer = useCallback(() => {
    try {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(NICKNAME_KEY);
    } catch {
      // localStorage unavailable — nothing to clear.
    }
    setPlayerId(null);
    setNicknameState(null);
  }, []);

  return { playerId, nickname, submitting, error, setNickname, clearPlayer };
}
