/** Sticky note footprint on the canvas, in pixels — kept compact and consistent with the note's rendered size. */
export const STICKY_NOTE_WIDTH = 176;
export const STICKY_NOTE_HEIGHT = 152;

/** How much of a note must always stay on-screen, so it can never become completely unreachable. */
export const MIN_VISIBLE_WIDTH = 64;
export const MIN_VISIBLE_HEIGHT = 48;

/** Cascade offset applied to each successive newly-created note so they don't stack exactly on top of each other. */
export const CREATE_CASCADE_STEP = 24;
export const CREATE_CASCADE_MAX_STEPS = 8;
export const DEFAULT_STICKY_NOTE_POSITION = { x: 24, y: 24 };

/** A note may never be resized smaller than this — keeps it usable/readable. Mirrors the server's own minimum. */
export const MIN_NOTE_WIDTH = 180;
export const MIN_NOTE_HEIGHT = 120;
export const DEFAULT_STICKY_NOTE_SIZE = { width: 200, height: 160 };

/**
 * Clamps a note's top-left position so it never leaves the reachable area:
 * never before the viewport edge, and never so far past the opposite edge
 * that less than the minimum-visible slice remains on screen.
 */
export function clampPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const maxX = Math.max(0, viewportWidth - MIN_VISIBLE_WIDTH);
  const maxY = Math.max(0, viewportHeight - MIN_VISIBLE_HEIGHT);
  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  };
}

/**
 * Clamps a note's size to the readable minimum, and — where a viewport
 * bound is supplied — keeps a resize from running far past the visible
 * canvas. There's no hard maximum otherwise; the user can make a note as
 * large as fits on screen.
 */
export function clampSize(
  width: number,
  height: number,
  maxWidth?: number,
  maxHeight?: number,
): { width: number; height: number } {
  let clampedWidth = Math.max(width, MIN_NOTE_WIDTH);
  let clampedHeight = Math.max(height, MIN_NOTE_HEIGHT);
  if (maxWidth !== undefined) {
    clampedWidth = Math.min(clampedWidth, Math.max(maxWidth, MIN_NOTE_WIDTH));
  }
  if (maxHeight !== undefined) {
    clampedHeight = Math.min(clampedHeight, Math.max(maxHeight, MIN_NOTE_HEIGHT));
  }
  return { width: clampedWidth, height: clampedHeight };
}

/**
 * Fixed vertical chrome around the content textarea — padding, the gaps
 * between rows, and the header (lock/pin/delete) and footer (color/resize)
 * rows — that isn't part of the content itself. Calibrated to
 * StickyNoteCard's current markup (p-2 + gap-1.5 x2 + header/footer row
 * heights); update this if that markup's spacing changes. This is the
 * note's "required padding" around the actual text area.
 */
export const STICKY_NOTE_CHROME_HEIGHT = 64;

/**
 * How much vertical room is actually available for content within a note
 * of the given base height — the base height minus the fixed chrome
 * around it.
 */
export function availableContentHeight(baseHeight: number): number {
  return Math.max(0, baseHeight - STICKY_NOTE_CHROME_HEIGHT);
}

/**
 * The note's rendered height. Stays exactly at the persisted/base height
 * — the "poster" boundary — for as long as the content fits inside the
 * area that height actually makes available; only once the content
 * genuinely needs more room than that does the note expand, and then by
 * exactly enough to show it, never less. This is a step function, not a
 * continuous one: sub-threshold content changes never move the rendered
 * height at all, so normal typing that still fits produces zero visual
 * change. `contentRequiredHeight` is rounded up to a whole pixel first so
 * a sub-pixel measurement reading can never nudge the result on its own.
 */
export function contentAwareHeight(baseHeight: number, contentRequiredHeight: number): number {
  const requiredHeight = Math.ceil(contentRequiredHeight);
  if (requiredHeight <= availableContentHeight(baseHeight)) {
    return baseHeight;
  }
  return requiredHeight + STICKY_NOTE_CHROME_HEIGHT;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * True if two axis-aligned rectangles overlap at all (merely touching
 * edges — zero-area overlap — does not count). Used to keep a dragged
 * sticky note out of the Main Board's real, currently-rendered
 * bounding rect — never a hardcoded region.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * A simple deterministic cascade: note #0 at the default position, each
 * next one nudged diagonally, wrapping. Kept as the last-resort default
 * spawn behavior described in the spec, but no longer used to place new
 * notes directly — see findStickyNoteSpawnPosition, which never places a
 * note somewhere it would overlap another note or the Main Board.
 */
export function cascadePosition(
  index: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const step = index % CREATE_CASCADE_MAX_STEPS;
  const x = DEFAULT_STICKY_NOTE_POSITION.x + step * CREATE_CASCADE_STEP;
  const y = DEFAULT_STICKY_NOTE_POSITION.y + step * CREATE_CASCADE_STEP;
  return clampPosition(x, y, viewportWidth, viewportHeight);
}

/**
 * Finds a spawn position for a new note of the given size such that the
 * entire note rectangle fits within [0, viewportWidth] x [0, viewportHeight]
 * and does not overlap any of `obstacles` (existing notes — locked ones
 * included, since a locked note is still occupying real space — and the
 * Main Board's real rect, all supplied by the caller from actual DOM/state
 * geometry, never hardcoded here).
 *
 * Strategy: a bounded number of random candidates first, so repeated
 * creates land in varied spots (requirement: "varied positions") rather
 * than a fixed pattern; if none of those land clear (crowded canvas), a
 * deterministic top-left-to-bottom-right grid scan finds the first free
 * spot instead of giving up — this is the "nearest/first valid position"
 * fallback, and it's exhaustive enough that a real gap is never missed
 * for a typical canvas/note size. Returns null only when no position
 * anywhere in bounds is free of every obstacle (including when the note
 * itself is larger than the viewport) — the caller must not fall back to
 * an overlapping position in that case.
 */
export function findStickyNoteSpawnPosition(
  size: { width: number; height: number },
  obstacles: Rect[],
  viewportWidth: number,
  viewportHeight: number,
  options: { randomAttempts?: number; gridStep?: number; random?: () => number } = {},
): { x: number; y: number } | null {
  const maxX = viewportWidth - size.width;
  const maxY = viewportHeight - size.height;
  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const fits = (x: number, y: number): boolean => {
    const candidate: Rect = { x, y, width: size.width, height: size.height };
    return !obstacles.some((obstacle) => rectsIntersect(candidate, obstacle));
  };

  const randomAttempts = options.randomAttempts ?? 30;
  const random = options.random ?? Math.random;
  for (let attempt = 0; attempt < randomAttempts; attempt++) {
    const x = Math.round(random() * maxX);
    const y = Math.round(random() * maxY);
    if (fits(x, y)) {
      return { x, y };
    }
  }

  // Deterministic fallback: scan a grid from the top-left for the first
  // free spot, rather than ever place an overlapping note.
  const gridStep = options.gridStep ?? 20;
  for (let y = 0; y <= maxY; y += gridStep) {
    for (let x = 0; x <= maxX; x += gridStep) {
      if (fits(x, y)) {
        return { x, y };
      }
    }
  }
  // The step grid can skip the exact bottom/right edge when it doesn't
  // divide evenly into maxX/maxY — check that corner explicitly too.
  if (fits(maxX, maxY)) {
    return { x: maxX, y: maxY };
  }

  return null;
}
