import { useCallback, useEffect, useState } from "react";
import {
  createStickyNote,
  deleteStickyNote,
  listStickyNotes,
  updateStickyNote,
  type StickyNoteColor,
  type StickyNoteDto,
} from "../api/client";
import { cascadePosition } from "./stickyNoteLayout";

export interface StickyNotesState {
  stickyNotes: StickyNoteDto[];
  loading: boolean;
  error: string | null;
  create: (viewportWidth: number, viewportHeight: number) => Promise<void>;
  saveContent: (id: string, content: string) => Promise<void>;
  toggleLocked: (id: string, locked: boolean) => Promise<void>;
  setColor: (id: string, color: StickyNoteColor) => Promise<void>;
  updatePosition: (id: string, x: number, y: number) => Promise<void>;
  updateSize: (id: string, width: number, height: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Owns Sticky Notes persistence via the API client — components only ever
 * call these methods, never fetch()/api client functions directly.
 *
 * `playerId` is the same anonymous, browser-local Player identity used
 * elsewhere (Reaction Test): every request this hook makes is scoped to
 * it, so each browser/player only ever sees and can change its own
 * notes. With no playerId yet (nickname not set), this hook does not
 * fetch or mutate anything — it just reports an empty, not-loading list.
 */
export function useStickyNotes(playerId: string | null): StickyNotesState {
  const [stickyNotes, setStickyNotes] = useState<StickyNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!playerId) {
      setStickyNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listStickyNotes(playerId);
      setStickyNotes(result);
    } catch {
      setError("스티커 메모를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
    // Re-fetches whenever the current player changes (e.g. "Switch player"),
    // so this always shows the current playerId's own notes.
  }, [playerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (viewportWidth: number, viewportHeight: number) => {
      if (!playerId) {
        return;
      }
      setError(null);
      try {
        const { x, y } = cascadePosition(stickyNotes.length, viewportWidth, viewportHeight);
        const stickyNote = await createStickyNote({ playerId, content: "", x, y });
        setStickyNotes((prev) => [stickyNote, ...prev]);
      } catch {
        setError("스티커 메모를 만들지 못했습니다.");
      }
    },
    [playerId, stickyNotes.length],
  );

  const applyUpdate = useCallback(
    async (id: string, patch: Parameters<typeof updateStickyNote>[2]) => {
      if (!playerId) {
        return;
      }
      setError(null);
      try {
        const updated = await updateStickyNote(id, playerId, patch);
        setStickyNotes((prev) => {
          const next = prev.map((n) => (n.id === id ? updated : n));
          // Keep pinned-first ordering consistent with the server's own list order.
          return [...next].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
        });
      } catch {
        setError("스티커 메모를 저장하지 못했습니다.");
      }
    },
    [playerId],
  );

  const saveContent = useCallback((id: string, content: string) => applyUpdate(id, { content }), [applyUpdate]);
  const toggleLocked = useCallback((id: string, locked: boolean) => applyUpdate(id, { locked }), [applyUpdate]);
  const setColor = useCallback((id: string, color: StickyNoteColor) => applyUpdate(id, { color }), [applyUpdate]);
  const updatePosition = useCallback((id: string, x: number, y: number) => applyUpdate(id, { x, y }), [applyUpdate]);
  const updateSize = useCallback(
    (id: string, width: number, height: number) => applyUpdate(id, { width, height }),
    [applyUpdate],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!playerId) {
        return;
      }
      setError(null);
      try {
        await deleteStickyNote(id, playerId);
        setStickyNotes((prev) => prev.filter((n) => n.id !== id));
      } catch {
        setError("스티커 메모를 삭제하지 못했습니다.");
      }
    },
    [playerId],
  );

  return {
    stickyNotes,
    loading,
    error,
    create,
    saveContent,
    toggleLocked,
    setColor,
    updatePosition,
    updateSize,
    remove,
  };
}
