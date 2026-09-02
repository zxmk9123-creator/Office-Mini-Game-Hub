import { useCallback, useEffect, useState } from "react";
import { createNote, deleteNote, listNotes, updateNote, type NoteDto } from "../api/client";

export interface NotesState {
  notes: NoteDto[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  select: (id: string | null) => void;
  create: () => Promise<void>;
  save: (id: string, input: { title: string; content: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Owns Notes persistence via the API client — components only ever call
 * these methods, never fetch()/api client functions directly.
 */
export function useNotes(): NotesState {
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listNotes();
      setNotes(result);
    } catch {
      setError("메모를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    setError(null);
    try {
      const note = await createNote({ title: "", content: "" });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
    } catch {
      setError("메모를 만들지 못했습니다.");
    }
  }, []);

  const save = useCallback(async (id: string, input: { title: string; content: string }) => {
    setError(null);
    try {
      const updated = await updateNote(id, input);
      setNotes((prev) => [updated, ...prev.filter((n) => n.id !== id)]);
    } catch {
      setError("메모를 저장하지 못했습니다.");
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        setSelectedId((current) => (current === id ? null : current));
      } catch {
        setError("메모를 삭제하지 못했습니다.");
      }
    },
    [],
  );

  return { notes, loading, error, selectedId, select: setSelectedId, create, save, remove };
}
