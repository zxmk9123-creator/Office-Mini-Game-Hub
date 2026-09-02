import { useEffect, useState } from "react";
import { useNotes } from "./useNotes";
import type { NoteDto } from "../api/client";

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteEditor({
  note,
  onSave,
  onDelete,
}: {
  note: NoteDto;
  onSave: (input: { title: string; content: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  // Selecting a different note swaps the editor's local draft to match it.
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id, note.title, note.content]);

  const dirty = title !== note.title || content !== note.content;

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 없음"
        aria-label="메모 제목"
        className="rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-300"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="내용을 입력하세요…"
        aria-label="메모 내용"
        className="min-h-[160px] flex-1 resize-none rounded border border-neutral-200 px-2 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-400"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">마지막 수정: {formatUpdatedAt(note.updatedAt)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={() => onSave({ title, content })}
            disabled={!dirty}
            className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotesView() {
  const { notes, loading, error, selectedId, select, create, save, remove } = useNotes();
  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <div className="flex w-full flex-col border-neutral-200 sm:w-40 sm:border-r">
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
          <span className="text-xs font-medium text-neutral-500">메모</span>
          <button
            type="button"
            onClick={create}
            className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50"
          >
            + 새 메모
          </button>
        </div>
        {error && (
          <p role="alert" className="px-3 py-1 text-xs text-amber-600">
            ⚠ {error}
          </p>
        )}
        {loading ? (
          <p className="px-3 py-2 text-xs text-neutral-400">불러오는 중…</p>
        ) : notes.length === 0 ? (
          <p className="px-3 py-2 text-xs text-neutral-400">아직 메모가 없습니다.</p>
        ) : (
          <ul className="max-h-40 overflow-y-auto sm:max-h-none sm:flex-1">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  aria-current={note.id === selectedId ? "true" : undefined}
                  onClick={() => select(note.id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-neutral-100 px-3 py-2 text-left hover:bg-neutral-50 ${
                    note.id === selectedId ? "bg-neutral-100 font-medium" : ""
                  }`}
                >
                  <span className="w-full truncate text-sm text-neutral-900">{note.title || "제목 없음"}</span>
                  <span className="text-[11px] text-neutral-400">{formatUpdatedAt(note.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex-1">
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            onSave={(input) => save(selectedNote.id, input)}
            onDelete={() => remove(selectedNote.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 py-8 text-center text-xs text-neutral-400">
            메모를 선택하거나 새로 만들어 보세요.
          </div>
        )}
      </div>
    </div>
  );
}
