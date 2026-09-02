import { useState } from "react";
import { useStickyNotes } from "./useStickyNotes";
import type { StickyNoteColor, StickyNoteDto } from "../api/client";

const COLORS: StickyNoteColor[] = ["yellow", "pink", "blue", "green", "purple"];

const COLOR_CLASSES: Record<StickyNoteColor, string> = {
  yellow: "bg-amber-50 border-amber-200",
  pink: "bg-rose-50 border-rose-200",
  blue: "bg-sky-50 border-sky-200",
  green: "bg-emerald-50 border-emerald-200",
  purple: "bg-violet-50 border-violet-200",
};

const COLOR_SWATCH_CLASSES: Record<StickyNoteColor, string> = {
  yellow: "bg-amber-300",
  pink: "bg-rose-300",
  blue: "bg-sky-300",
  green: "bg-emerald-300",
  purple: "bg-violet-300",
};

const COLOR_LABELS: Record<StickyNoteColor, string> = {
  yellow: "노랑",
  pink: "분홍",
  blue: "파랑",
  green: "초록",
  purple: "보라",
};

function StickyNoteCard({
  note,
  onSaveContent,
  onTogglePinned,
  onSetColor,
  onDelete,
}: {
  note: StickyNoteDto;
  onSaveContent: (content: string) => void;
  onTogglePinned: () => void;
  onSetColor: (color: StickyNoteColor) => void;
  onDelete: () => void;
}) {
  const [content, setContent] = useState(note.content);

  return (
    <div className={`flex flex-col gap-2 rounded-md border p-2 ${COLOR_CLASSES[note.color]}`}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onTogglePinned}
          aria-pressed={note.pinned}
          title={note.pinned ? "고정 해제" : "고정"}
          className={`text-xs ${note.pinned ? "text-neutral-800" : "text-neutral-400"} hover:text-neutral-700`}
        >
          {note.pinned ? "📌 고정됨" : "📌 고정"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-neutral-400 hover:text-neutral-700"
          aria-label="스티커 메모 삭제"
        >
          삭제
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => {
          if (content !== note.content) onSaveContent(content);
        }}
        placeholder="내용을 입력하세요…"
        aria-label="스티커 메모 내용"
        className="min-h-[80px] resize-none bg-transparent text-sm text-neutral-800 outline-none"
      />
      <div className="flex gap-1">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSetColor(color)}
            aria-label={`${COLOR_LABELS[color]}으로 변경`}
            aria-pressed={note.color === color}
            className={`h-4 w-4 rounded-full ${COLOR_SWATCH_CLASSES[color]} ${
              note.color === color ? "ring-2 ring-offset-1 ring-neutral-500" : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function StickyNotesView() {
  const { stickyNotes, loading, error, create, saveContent, togglePinned, setColor, remove } = useStickyNotes();

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">스티커 메모</span>
        <button
          type="button"
          onClick={create}
          className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          + 새 스티커
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-amber-600">
          ⚠ {error}
        </p>
      )}
      {loading ? (
        <p className="text-xs text-neutral-400">불러오는 중…</p>
      ) : stickyNotes.length === 0 ? (
        <p className="text-xs text-neutral-400">아직 스티커 메모가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {stickyNotes.map((note) => (
            <StickyNoteCard
              key={note.id}
              note={note}
              onSaveContent={(content) => saveContent(note.id, content)}
              onTogglePinned={() => togglePinned(note.id, !note.pinned)}
              onSetColor={(color) => setColor(note.id, color)}
              onDelete={() => remove(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
