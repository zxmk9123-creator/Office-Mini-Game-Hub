import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStickyNotes } from "./useStickyNotes";
import type { StickyNoteColor, StickyNoteDto } from "../api/client";
import { clampPosition, clampSize, contentAwareHeight } from "./stickyNoteLayout";

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

interface ResizeState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
}

function StickyNoteCard({
  note,
  zIndex,
  viewportWidth,
  viewportHeight,
  onFocus,
  onSaveContent,
  onToggleLocked,
  onSetColor,
  onDelete,
  onPositionCommit,
  onSizeCommit,
}: {
  note: StickyNoteDto;
  zIndex: number;
  viewportWidth: number;
  viewportHeight: number;
  onFocus: () => void;
  onSaveContent: (content: string) => void;
  onToggleLocked: () => void;
  onSetColor: (color: StickyNoteColor) => void;
  onDelete: () => void;
  onPositionCommit: (x: number, y: number) => void;
  onSizeCommit: (width: number, height: number) => void;
}) {
  const [content, setContent] = useState(note.content);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [resizeSize, setResizeSize] = useState<{ width: number; height: number } | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaContentHeight, setTextareaContentHeight] = useState(0);

  const persistedPosition = clampPosition(note.x, note.y, viewportWidth, viewportHeight);
  const position = dragPosition ?? persistedPosition;
  const size = resizeSize ?? { width: note.width, height: note.height };
  // Step function, not a continuous one: stays exactly at the persisted/
  // dragged base height while the content still fits inside it, and only
  // expands once the content genuinely needs more room — never overwrites
  // that base height. A purely visual overlay recomputed from the
  // textarea's own natural content size (never from an API response,
  // never sent to the server, unaffected by the note's locked state).
  const renderHeight = contentAwareHeight(size.height, textareaContentHeight);

  // Measures how tall the textarea's content actually needs to be, using
  // the standard auto-grow-textarea trick (shrink to `auto` to get a true
  // scrollHeight reading, then restore) — re-run only when content or
  // width changes, never from a ResizeObserver, so there's no feedback
  // loop and no risk of it firing on every render.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    const previousHeight = el.style.height;
    el.style.height = "auto";
    setTextareaContentHeight(el.scrollHeight);
    el.style.height = previousHeight;
  }, [content, size.width]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Interactive controls (buttons), the editable textarea, and the resize
    // handle each drive their own behavior — starting a drag from any of
    // them would fight typing/clicking/resizing.
    const target = e.target as HTMLElement;
    if (target.closest("textarea, button, [data-resize-handle]")) {
      return;
    }
    // Locked notes stay put — position/size lock, not a content-editing lock.
    if (note.locked) {
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

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Isolated from drag: this never reaches the card's own onPointerDown.
    e.stopPropagation();
    e.preventDefault();
    // Locked notes stay put — position/size lock, not a content-editing lock.
    if (note.locked) {
      return;
    }
    onFocus();
    resizeStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWidth: note.width,
      startHeight: note.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizeSize({ width: note.width, height: note.height });
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - resize.startClientX;
    const dy = e.clientY - resize.startClientY;
    setResizeSize(
      clampSize(
        resize.startWidth + dx,
        resize.startHeight + dy,
        viewportWidth - position.x,
        viewportHeight - position.y,
      ),
    );
  };

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const resize = resizeStateRef.current;
    if (!resize || resize.pointerId !== e.pointerId) {
      return;
    }
    resizeStateRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const finalSize = resizeSize;
    setResizeSize(null);
    if (finalSize && (finalSize.width !== note.width || finalSize.height !== note.height)) {
      onSizeCommit(finalSize.width, finalSize.height);
    }
  };

  return (
    <div
      data-testid={`sticky-note-${note.id}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: size.width,
        height: renderHeight,
        zIndex,
      }}
      className={`pointer-events-auto flex touch-none select-none flex-col gap-1.5 rounded-sm border p-2 shadow-sm ${
        note.locked ? "cursor-default" : dragPosition ? "cursor-grabbing shadow-md" : "cursor-grab"
      } ${COLOR_CLASSES[note.color]}`}
    >
      <div className="flex items-center justify-between">
        {/*
          The single position/size lock control. Backed by the `locked`
          field (drag/resize on/off) — deliberately not the separate,
          pre-existing `pinned` field (which only ever affected list
          ordering and has no dedicated control anymore).
        */}
        <button
          type="button"
          onClick={onToggleLocked}
          aria-pressed={note.locked}
          title={note.locked ? "고정 해제 (이동/크기 조절 가능)" : "고정 (이동/크기 조절 방지)"}
          className={`rounded px-1 py-0.5 text-xs ${
            note.locked
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          }`}
        >
          📌 고정
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
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => {
          if (content !== note.content) onSaveContent(content);
        }}
        placeholder="내용을 입력하세요…"
        aria-label="스티커 메모 내용"
        className="min-h-0 flex-1 cursor-text resize-none bg-transparent text-sm text-neutral-800 outline-none"
      />
      <div className="flex items-center justify-between">
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
        <div
          data-resize-handle
          data-testid={`sticky-note-resize-${note.id}`}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-label="크기 조절"
          title="크기 조절"
          className="h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-sm border-b-2 border-r-2 border-neutral-400/60"
        />
      </div>
    </div>
  );
}

export function StickyNotesView() {
  const {
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
  } = useStickyNotes();
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
                onToggleLocked={() => toggleLocked(note.id, !note.locked)}
                onSetColor={(color) => setColor(note.id, color)}
                onDelete={() => remove(note.id)}
                onPositionCommit={(x, y) => updatePosition(note.id, x, y)}
                onSizeCommit={(width, height) => updateSize(note.id, width, height)}
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
