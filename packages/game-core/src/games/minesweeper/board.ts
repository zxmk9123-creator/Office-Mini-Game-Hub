import type { Cell, RandomSource } from "./types";

export function createEmptyBoard(width: number, height: number): Cell[] {
  return Array.from({ length: width * height }, () => ({ mine: false, adjacent: 0, state: "hidden" as const }));
}

/** Flat indices of the up-to-8 in-bounds cells surrounding `index`. */
export function neighborsOf(index: number, width: number, height: number): number[] {
  const row = Math.floor(index / width);
  const col = index % width;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < height && c >= 0 && c < width) {
        result.push(r * width + c);
      }
    }
  }
  return result;
}

/**
 * `index` itself plus its (up to 8) neighbors — the 3x3 first-click safety
 * zone, clamped to the board so a corner/edge click still only excludes
 * the in-bounds cells that actually exist (4 cells for a corner, 6 for an
 * edge, 9 for anywhere interior).
 */
export function safetyZoneOf(index: number, width: number, height: number): number[] {
  return [index, ...neighborsOf(index, width, height)];
}

/**
 * Places `mineCount` mines among every cell outside the 3x3 safety zone
 * centered on `excludeIndex` (the first-clicked cell) — that whole zone,
 * not just the clicked cell itself, must always be mine-free — then
 * computes each non-mine cell's adjacent-mine count. Deterministic given a
 * deterministic `random` — a partial Fisher-Yates over the eligible pool,
 * consuming exactly `mineCount` values from `random.next()` (fewer only if
 * the pool itself is smaller than `mineCount`, which no configured
 * difficulty hits).
 */
export function placeMines(
  cells: Cell[],
  width: number,
  height: number,
  mineCount: number,
  excludeIndex: number,
  random: RandomSource,
): Cell[] {
  const safeZone = new Set(safetyZoneOf(excludeIndex, width, height));
  const pool: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!safeZone.has(i)) pool.push(i);
  }

  const mineIndices = new Set<number>();
  let remaining = pool.length;
  const placeCount = Math.min(mineCount, pool.length);
  for (let placed = 0; placed < placeCount; placed++) {
    const pick = Math.floor(random.next() * remaining);
    mineIndices.add(pool[pick]);
    pool[pick] = pool[remaining - 1];
    remaining--;
  }

  const withMines = cells.map((cell, i) => ({ ...cell, mine: mineIndices.has(i) }));
  return withMines.map((cell, i) => {
    if (cell.mine) return cell;
    const adjacent = neighborsOf(i, width, height).filter((n) => withMines[n].mine).length;
    return { ...cell, adjacent };
  });
}

/**
 * Reveals `startIndex` and, if it has zero adjacent mines, recursively
 * (via an explicit stack) reveals every connected zero-adjacent cell and
 * the single ring of numbered cells bordering that region — the standard
 * Minesweeper flood-fill. Flagged cells are never auto-revealed by the
 * cascade; already-revealed cells are left as-is.
 */
export function revealCascade(cells: Cell[], width: number, height: number, startIndex: number): Cell[] {
  const next = cells.slice();
  const stack = [startIndex];
  const visited = new Set<number>();

  while (stack.length > 0) {
    const idx = stack.pop() as number;
    if (visited.has(idx)) continue;
    visited.add(idx);

    const cell = next[idx];
    if (cell.state === "flagged") continue;
    if (cell.state !== "revealed") {
      next[idx] = { ...cell, state: "revealed" };
    }

    if (next[idx].adjacent === 0 && !next[idx].mine) {
      for (const n of neighborsOf(idx, width, height)) {
        if (!visited.has(n) && next[n].state === "hidden") {
          stack.push(n);
        }
      }
    }
  }

  return next;
}
