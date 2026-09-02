import { describe, expect, it } from "vitest";
import { findStickyNoteSpawnPosition, rectsIntersect, type Rect } from "../notebook/stickyNoteLayout";

const SIZE = { width: 200, height: 160 };

function overlaps(candidate: Rect, obstacles: Rect[]): boolean {
  return obstacles.some((o) => rectsIntersect(candidate, o));
}

describe("findStickyNoteSpawnPosition", () => {
  it("returns a position whose full rect fits within the viewport bounds", () => {
    const pos = findStickyNoteSpawnPosition(SIZE, [], 1024, 768);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeGreaterThanOrEqual(0);
    expect(pos!.y).toBeGreaterThanOrEqual(0);
    expect(pos!.x + SIZE.width).toBeLessThanOrEqual(1024);
    expect(pos!.y + SIZE.height).toBeLessThanOrEqual(768);
  });

  it("never overlaps an existing note obstacle", () => {
    const existing: Rect = { x: 100, y: 100, width: 200, height: 160 };
    for (let i = 0; i < 50; i++) {
      const pos = findStickyNoteSpawnPosition(SIZE, [existing], 1024, 768);
      expect(pos).not.toBeNull();
      expect(overlaps({ x: pos!.x, y: pos!.y, width: SIZE.width, height: SIZE.height }, [existing])).toBe(false);
    }
  });

  it("never overlaps the Main Board rect", () => {
    const board: Rect = { x: 300, y: 100, width: 400, height: 500 };
    for (let i = 0; i < 50; i++) {
      const pos = findStickyNoteSpawnPosition(SIZE, [board], 1024, 768);
      expect(pos).not.toBeNull();
      expect(overlaps({ x: pos!.x, y: pos!.y, width: SIZE.width, height: SIZE.height }, [board])).toBe(false);
    }
  });

  it("never overlaps a locked note (locked notes are still obstacles)", () => {
    // Locked-ness has no bearing on the geometry function itself — the
    // caller passes every existing note's rect regardless of lock state.
    const lockedNote: Rect = { x: 24, y: 24, width: 200, height: 160 };
    const pos = findStickyNoteSpawnPosition(SIZE, [lockedNote], 1024, 768);
    expect(pos).not.toBeNull();
    expect(overlaps({ x: pos!.x, y: pos!.y, width: SIZE.width, height: SIZE.height }, [lockedNote])).toBe(false);
  });

  it("handles a larger note size correctly", () => {
    const bigSize = { width: 500, height: 400 };
    const obstacle: Rect = { x: 0, y: 0, width: 400, height: 300 };
    const pos = findStickyNoteSpawnPosition(bigSize, [obstacle], 1024, 768);
    expect(pos).not.toBeNull();
    expect(pos!.x + bigSize.width).toBeLessThanOrEqual(1024);
    expect(pos!.y + bigSize.height).toBeLessThanOrEqual(768);
    expect(overlaps({ x: pos!.x, y: pos!.y, width: bigSize.width, height: bigSize.height }, [obstacle])).toBe(false);
  });

  it("returns null when the note itself is larger than the viewport", () => {
    const pos = findStickyNoteSpawnPosition({ width: 2000, height: 200 }, [], 1024, 768);
    expect(pos).toBeNull();
  });

  it("falls back to a deterministic grid scan when random attempts miss, and still finds a valid spot", () => {
    // A "random" generator that always returns 0 -> always lands on
    // (0, 0), which is occupied — every random attempt must miss, forcing
    // the grid-scan fallback to do the actual work.
    const obstacleAtOrigin: Rect = { x: 0, y: 0, width: 200, height: 160 };
    const pos = findStickyNoteSpawnPosition(SIZE, [obstacleAtOrigin], 1024, 768, {
      random: () => 0,
      randomAttempts: 5,
    });
    expect(pos).not.toBeNull();
    expect(overlaps({ x: pos!.x, y: pos!.y, width: SIZE.width, height: SIZE.height }, [obstacleAtOrigin])).toBe(
      false,
    );
  });

  it("produces varied positions across repeated calls (not a fixed diagonal cascade)", () => {
    const positions = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pos = findStickyNoteSpawnPosition(SIZE, [], 1024, 768);
      positions.add(`${pos!.x},${pos!.y}`);
    }
    // With a wide-open canvas and true randomness, 20 draws should not all
    // collapse onto the exact same point.
    expect(positions.size).toBeGreaterThan(1);
  });

  it("returns null when obstacles cover essentially the entire available area", () => {
    // Tile the whole viewport with non-overlapping obstacles so there is
    // no room left anywhere for a 200x160 note.
    const obstacles: Rect[] = [];
    for (let y = 0; y < 768; y += 160) {
      for (let x = 0; x < 1024; x += 200) {
        obstacles.push({ x, y, width: 200, height: 160 });
      }
    }
    const pos = findStickyNoteSpawnPosition(SIZE, obstacles, 1024, 768, { gridStep: 20 });
    expect(pos).toBeNull();
  });

  it("does not move/consider clamping of existing obstacles — only the candidate is bounded", () => {
    // Sanity check that a candidate right at the max edge is still valid
    // when nothing occupies that corner.
    const pos = findStickyNoteSpawnPosition(SIZE, [], 300, 300, { random: () => 1, randomAttempts: 1 });
    expect(pos).toEqual({ x: 100, y: 140 }); // maxX = 300-200=100, maxY = 300-160=140
  });
});
