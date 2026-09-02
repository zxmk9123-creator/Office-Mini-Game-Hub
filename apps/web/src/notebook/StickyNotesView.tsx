import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStickyNotes } from "./useStickyNotes";
import { NicknameEntry } from "../player/NicknameEntry";
import type { PlayerSession } from "../player/usePlayerSession";
import type { StickyNoteColor, StickyNoteDto } from "../api/client";
import { clampPosition, clampSize, contentAwareHeight, rectsIntersect } from "./stickyNoteLayout";
import {
  renderStickyNoteFormattedHtml,
  toggleStickyNoteFormat,
  type StickyNoteFormat,
} from "./stickyNoteFormatting";

const FORMAT_BUTTONS: { format: StickyNoteFormat; label: string; glyph: string; shortcutKey: string }[] = [
  { format: "bold", label: "굵게", glyph: "B", shortcutKey: "b" },
  { format: "italic", label: "기울임", glyph: "I", shortcutKey: "i" },
  { format: "strike", label: "취소선", glyph: "S", shortcutKey: "x" },
];

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
  boardRef,
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
  boardRef: React.RefObject<HTMLDivElement>;
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
  // True for the duration a drag gesture is trying to move the note into
  // the Main Board's real DOM area — the note simply stops advancing (no
  // state update, so no snap-back) and this drives the invalid indicator.
  const [blockedByBoard, setBlockedByBoard] = useState(false);
  const [resizeSize, setResizeSize] = useState<{ width: number; height: number } | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaContentHeight, setTextareaContentHeight] = useState(0);
  // While not actively being edited, a formatted read-only preview is
  // shown instead of the raw textarea (which can only ever show plain
  // characters, markers included) — this is how formatting becomes
  // visible without replacing the textarea itself.
  const [isEditingContent, setIsEditingContent] = useState(false);
  // Set by a format toggle so the next paint can restore the textarea's
  // selection around the (now shifted) marker characters — a plain
  // assignment during the event handler wouldn't survive React's
  // re-render with the new controlled `value`.
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

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

  // Restores the textarea's selection around the shifted marker
  // characters after a format toggle re-renders the controlled `value`.
  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const el = textareaRef.current;
    if (!pending || !el) {
      return;
    }
    pendingSelectionRef.current = null;
    el.setSelectionRange(pending.start, pending.end);
  }, [content]);

  const applyFormat = (format: StickyNoteFormat) => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    const result = toggleStickyNoteFormat(content, el.selectionStart, el.selectionEnd, format);
    pendingSelectionRef.current = { start: result.start, end: result.end };
    setContent(result.text);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const withModifier = e.ctrlKey || e.metaKey;
    if (!withModifier) {
      return;
    }
    const key = e.key.toLowerCase();
    const button = FORMAT_BUTTONS.find((b) => b.shortcutKey === key);
    if (!button) {
      // Not one of our shortcuts — leave every other Ctrl/Cmd combination
      // (copy, paste, undo, select-all, and a plain Ctrl+X used for an
      // actual cut when nothing else matches) completely alone.
      return;
    }
    // Only ever preempts the browser default (Ctrl+X's cut included) when
    // the key combination is genuinely being interpreted as one of our
    // three format shortcuts.
    e.preventDefault();
    applyFormat(button.format);
  };

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
    setBlockedByBoard(false);
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
    const candidate = clampPosition(drag.startNoteX + dx, drag.startNoteY + dy, viewportWidth, viewportHeight);

    // Collision uses the Main Board's real, currently-rendered bounding
    // rect and this note's actual current footprint — never hardcoded
    // coordinates, so it stays correct as the board or the note resizes.
    const boardRect = boardRef.current?.getBoundingClientRect();
    if (
      boardRect &&
      rectsIntersect(
        { x: candidate.x, y: candidate.y, width: size.width, height: renderHeight },
        { x: boardRect.left, y: boardRect.top, width: boardRect.width, height: boardRect.height },
      )
    ) {
      // Block immediately: never adopt the colliding candidate, so the
      // note simply stops at the boundary — nothing to snap back from.
      setBlockedByBoard(true);
      return;
    }
    setBlockedByBoard(false);
    setDragPosition(candidate);
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
    setBlockedByBoard(false);
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
      className={`pointer-events-auto relative flex touch-none select-none flex-col gap-1.5 rounded-sm border p-2 shadow-sm ${
        blockedByBoard ? "border-red-500 ring-2 ring-red-500" : ""
      } ${note.locked ? "cursor-default" : dragPosition ? "cursor-grabbing shadow-md" : "cursor-grab"} ${
        COLOR_CLASSES[note.color]
      }`}
    >
      {blockedByBoard && (
        <span
          data-testid={`sticky-note-blocked-${note.id}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-red-500"
        >
          ✕
        </span>
      )}
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
      {/*
        onMouseDown preventDefault keeps focus (and the current text
        selection) on the textarea instead of shifting to the button —
        without it, clicking a format button would blur the textarea
        first and the selection needed to apply the format would already
        be gone by the time onClick ran.
      */}
      <div className="flex gap-0.5">
        {FORMAT_BUTTONS.map(({ format, label, glyph }) => (
          <button
            key={format}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat(format)}
            aria-label={label}
            title={`${label} (Ctrl+${FORMAT_BUTTONS.find((b) => b.format === format)!.shortcutKey.toUpperCase()})`}
            className={`h-4 w-4 rounded text-[10px] font-semibold leading-4 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 ${
              format === "italic" ? "italic" : format === "strike" ? "line-through" : ""
            }`}
          >
            {glyph}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {/*
          The textarea always stays in normal flow (visibility:hidden
          only, never repositioned) so its own box/size is completely
          unaffected by isEditingContent — the auto-height measurement
          effect above depends on this element's layout being exactly as
          it was before formatting existed. The preview is the one that's
          absolutely positioned, layered on top of it.
        */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleContentKeyDown}
          onFocus={() => setIsEditingContent(true)}
          onBlur={() => {
            setIsEditingContent(false);
            if (content !== note.content) onSaveContent(content);
          }}
          placeholder="내용을 입력하세요… (**굵게**, _기울임_, ~~취소선~~)"
          aria-label="스티커 메모 내용"
          className={`h-full min-h-0 w-full cursor-text resize-none bg-transparent text-sm text-neutral-800 outline-none ${
            isEditingContent ? "" : "opacity-0"
          }`}
        />
        {!isEditingContent && (
          <div
            data-testid={`sticky-note-preview-${note.id}`}
            onClick={() => textareaRef.current?.focus()}
            className="absolute inset-0 cursor-text overflow-hidden whitespace-pre-wrap break-words text-sm text-neutral-800"
          >
            {content ? (
              // Safe: renderStickyNoteFormattedHtml HTML-escapes the raw
              // content first and only reintroduces our own <strong>/<em>/
              // <s> tags for the marker patterns it recognizes — no
              // arbitrary user input ever becomes live markup.
              <span dangerouslySetInnerHTML={{ __html: renderStickyNoteFormattedHtml(content) }} />
            ) : (
              <span className="text-neutral-400">내용을 입력하세요… (**굵게**, _기울임_, ~~취소선~~)</span>
            )}
          </div>
        )}
      </div>
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

/**
 * `active` controls only whether the small control panel (header, "+ 새
 * 스티커" button, empty/loading state) is visible — it does NOT gate the
 * hook or the floating canvas. This component is meant to stay mounted
 * for the app's whole lifetime (see App.tsx), so switching to another
 * tab/tool never unmounts it: the notes stay in memory, on screen, and
 * a page reload is the only thing that ever re-fetches them from the
 * server. `boardRef` is the Main Board panel's real DOM node, measured
 * live (never hardcoded) to keep dragged notes out of it.
 *
 * `session` is the app's single existing `usePlayerSession()` instance
 * (passed down, not re-created here) — its `playerId` is the anonymous,
 * browser-local identity Sticky Notes are now scoped to, the same one
 * Reaction Test already uses. Sticky Notes reuses the same one-time
 * nickname gate (`NicknameEntry`) Reaction Test uses, shown only while
 * the panel is active and no playerId exists yet — this is
 * browser/player-level note separation, not authenticated-account
 * security.
 */
export function StickyNotesView({
  active,
  boardRef,
  session,
}: {
  active: boolean;
  boardRef: React.RefObject<HTMLDivElement>;
  session: PlayerSession;
}) {
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
  } = useStickyNotes(session.playerId);
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
                boardRef={boardRef}
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
      {active &&
        (!session.playerId ? (
          <NicknameEntry session={session} />
        ) : (
          <div className="flex h-full flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">스티커 메모</span>
              <button
                type="button"
                onClick={() => {
                  const rect = boardRef.current?.getBoundingClientRect();
                  create(
                    viewportWidth,
                    viewportHeight,
                    rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null,
                  );
                }}
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
        ))}
      {canvas}
    </>
  );
}
