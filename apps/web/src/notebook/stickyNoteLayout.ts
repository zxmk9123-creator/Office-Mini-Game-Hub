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

/** A simple deterministic cascade: note #0 at the default position, each next one nudged diagonally, wrapping. */
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
