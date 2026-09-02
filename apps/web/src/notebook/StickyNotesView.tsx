import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStickyNotes } from "./useStickyNotes";
import type { StickyNoteColor, StickyNoteDto } from "../api/client";
import { clampPosition, STICKY_NOTE_WIDTH } from "./stickyNoteLayout";

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

/** Re-renders on window resize so the canvas can re-clamp note positions into the shrunk viewport. */
function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startNoteX: number;
  startNoteY: number;
}

function StickyNoteCard({
  note,
  zIndex,
  viewportWidth,
  viewportHeight,
  onFocus,
  onSaveContent,
  onTogglePinned,
  onSetColor,
  onDelete,
  onPositionCommit,
}: {
  note: StickyNoteDto;
  zIndex: number;
  viewportWidth: number;
  viewportHeight: number;
  onFocus: () => void;
  onSaveContent: (content: string) => void;
  onTogglePinned: () => void;
  onSetColor: (color: StickyNoteColor) => void;
  onDelete: () => void;
  onPositionCommit: (x: number, y: number) => void;
}) {
  const [content, setContent] = useState(note.content);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const persistedPosition = clampPosition(note.x, note.y, viewportWidth, viewportHeight);
  const position = dragPosition ?? persistedPosition;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Interactive controls (buttons) and the editable textarea drive their
    // own behavior — starting a drag from them would fight typing/clicking.
    const target = e.target as HTMLElement;
    if (target.closest("textarea, button")) {
      return;
    }
    onFocus();
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNoteX: note.x,
      startNoteY: note.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragPosition(persistedPosition);
    // Keeps a fast drag gesture from selecting the note's own text.
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    setDragPosition(clampPosition(drag.startNoteX + dx, drag.startNoteY + dy, viewportWidth, viewportHeight));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    dragStateRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const finalPosition = dragPosition;
    setDragPosition(null);
    if (finalPosition && (finalPosition.x !== note.x || finalPosition.y !== note.y)) {
      onPositionCommit(finalPosition.x, finalPosition.y);
    }
  };

  return (
    <div
      data-testid={`sticky-note-${note.id}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ position: "absolute", left: position.x, top: position.y, width: STICKY_NOTE_WIDTH, zIndex }}
      className={`pointer-events-auto flex touch-none select-none flex-col gap-1.5 rounded-sm border p-2 shadow-sm ${
        dragPosition ? "cursor-grabbing shadow-md" : "cursor-grab"
      } ${COLOR_CLASSES[note.color]}`}
    >
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
        className="min-h-[80px] cursor-text resize-none bg-transparent text-sm text-neutral-800 outline-none"
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
  const { stickyNotes, loading, error, create, saveContent, togglePinned, setColor, updatePosition, remove } =
    useStickyNotes();
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();

  // A lightweight client-side stacking order: the most recently
  // focused/dragged note gets the highest z-index. Not persisted — there's
  // no requirement for z-order to survive a reload, only for the note the
  // user is actively working with to visually sit on top right now.
  const zCounter = useRef(1);
  const [zIndexById, setZIndexById] = useState<Record<string, number>>({});
  const bringToFront = useCallback((id: string) => {
    zCounter.current += 1;
    setZIndexById((prev) => ({ ...prev, [id]: zCounter.current }));
  }, []);

  const canvas =
    typeof document === "undefined"
      ? null
      : createPortal(
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            {stickyNotes.map((note) => (
              <StickyNoteCard
                key={note.id}
                note={note}
                zIndex={zIndexById[note.id] ?? 1}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                onFocus={() => bringToFront(note.id)}
                onSaveContent={(content) => saveContent(note.id, content)}
                onTogglePinned={() => togglePinned(note.id, !note.pinned)}
                onSetColor={(color) => setColor(note.id, color)}
                onDelete={() => remove(note.id)}
                onPositionCommit={(x, y) => updatePosition(note.id, x, y)}
              />
            ))}
          </div>,
          document.body,
        );

  return (
    <>
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500">스티커 메모</span>
          <button
            type="button"
            onClick={() => create(viewportWidth, viewportHeight)}
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
          <p className="text-xs text-neutral-400">스티커 메모는 화면 주위에 자유롭게 배치할 수 있습니다.</p>
        )}
      </div>
      {canvas}
    </>
  );
}
