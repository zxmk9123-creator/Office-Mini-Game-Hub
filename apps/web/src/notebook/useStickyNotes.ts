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
  togglePinned: (id: string, pinned: boolean) => Promise<void>;
  setColor: (id: string, color: StickyNoteColor) => Promise<void>;
  updatePosition: (id: string, x: number, y: number) => Promise<void>;
  updateSize: (id: string, width: number, height: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Owns Sticky Notes persistence via the API client — components only ever
 * call these methods, never fetch()/api client functions directly.
 */
export function useStickyNotes(): StickyNotesState {
  const [stickyNotes, setStickyNotes] = useState<StickyNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStickyNotes();
      setStickyNotes(result);
    } catch {
      setError("스티커 메모를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (viewportWidth: number, viewportHeight: number) => {
      setError(null);
      try {
        const { x, y } = cascadePosition(stickyNotes.length, viewportWidth, viewportHeight);
        const stickyNote = await createStickyNote({ content: "", x, y });
        setStickyNotes((prev) => [stickyNote, ...prev]);
      } catch {
        setError("스티커 메모를 만들지 못했습니다.");
      }
    },
    [stickyNotes.length],
  );

  const applyUpdate = useCallback(async (id: string, patch: Parameters<typeof updateStickyNote>[1]) => {
    setError(null);
    try {
      const updated = await updateStickyNote(id, patch);
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
  }, []);

  const saveContent = useCallback((id: string, content: string) => applyUpdate(id, { content }), [applyUpdate]);
  const togglePinned = useCallback((id: string, pinned: boolean) => applyUpdate(id, { pinned }), [applyUpdate]);
  const setColor = useCallback((id: string, color: StickyNoteColor) => applyUpdate(id, { color }), [applyUpdate]);
  const updatePosition = useCallback((id: string, x: number, y: number) => applyUpdate(id, { x, y }), [applyUpdate]);
  const updateSize = useCallback(
    (id: string, width: number, height: number) => applyUpdate(id, { width, height }),
    [applyUpdate],
  );

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteStickyNote(id);
      setStickyNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setError("스티커 메모를 삭제하지 못했습니다.");
    }
  }, []);

  return {
    stickyNotes,
    loading,
    error,
    create,
    saveContent,
    togglePinned,
    setColor,
    updatePosition,
    updateSize,
    remove,
  };
}
