import {
  BOARD_COLS,
  FORMATION_TOP_ROW,
  MAX_NEW_BRICKS_PER_TURN,
  type Brick,
  type RandomSource,
  type RedBonusBall,
} from "./types";

/**
 * How tough a freshly-spawned NORMAL brick at this round is. Exactly +1 HP
 * per round, independent of ball count or red-ball collection: round 1 ->
 * HP 1, round 2 -> HP 2, round 3 -> HP 3, and so on with no cap. Unchanged
 * by difficulty tier — a reinforced brick (see reinforcedProportionForTier)
 * uses `level + 2` instead, but every non-reinforced brick at every tier
 * still uses exactly this.
 */
export function brickHpForLevel(level: number): number {
  return Math.max(1, level);
}

/**
 * Progressive difficulty tiers, stepping up every 30 rounds:
 *   1-30 normal, 31-60 dense, 61-90 hard, 91-120 expert, 121+ extreme.
 * Difficulty scales through brick density, reinforced-brick proportion,
 * and column-placement bias only — ball physics, the 7x7 board, the Row 0
 * rule, red-ball generation, and per-round HP progression are all
 * untouched by tier.
 */
export const DIFFICULTY_TIERS = ["normal", "dense", "hard", "expert", "extreme"] as const;
export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number];

export function difficultyTierForLevel(level: number): DifficultyTier {
  if (level <= 30) return "normal";
  if (level <= 60) return "dense";
  if (level <= 90) return "hard";
  if (level <= 120) return "expert";
  return "extreme";
}

/**
 * NORMAL tier's (rounds 1-30) brick count — the original, untouched
 * formula: never more than MAX_NEW_BRICKS_PER_TURN, growing slowly so
 * early boards stay sparse.
 */
export function newBrickCountForLevel(level: number, random: RandomSource): number {
  const cap = Math.min(MAX_NEW_BRICKS_PER_TURN, 2 + Math.floor(Math.max(0, level - 1) / 5));
  return 1 + Math.floor(random.next() * cap);
}

/**
 * How many new bricks spawn this turn, per the tier's spec range. Each
 * branch consumes at most one `random.next()` call (NORMAL delegates that
 * one call to newBrickCountForLevel; EXPERT/EXTREME are fixed and consume
 * none), so tier boundaries never shift how many random values later
 * picks (column selection, reinforcement) end up consuming relative to
 * before this feature existed.
 */
function brickCountForTier(tier: DifficultyTier, level: number, random: RandomSource): number {
  switch (tier) {
    case "normal":
      return newBrickCountForLevel(level, random); // unchanged: 1-5
    case "dense":
      return 3 + Math.floor(random.next() * 3); // 3-5
    case "hard":
      return 4 + Math.floor(random.next() * 2); // 4-5
    case "expert":
    case "extreme":
      return MAX_NEW_BRICKS_PER_TURN; // exactly 5
  }
}

/**
 * Proportion of this turn's newly spawned bricks that are reinforced
 * (HP = current round + 2) instead of the normal round-based HP. NORMAL
 * and DENSE never reinforce bricks at all.
 */
function reinforcedProportionForTier(tier: DifficultyTier): number {
  switch (tier) {
    case "normal":
    case "dense":
      return 0;
    case "hard":
      return 0.2;
    case "expert":
      return 0.3;
    case "extreme":
      return 0.4;
  }
}

/**
 * Picks `count` distinct columns out of BOARD_COLS without replacement,
 * weighted by `weightOf(col)` (re-evaluated against whatever's still
 * available before every pick). A uniform `() => 1` weight reproduces
 * plain unweighted random sampling — the exact algorithm NORMAL used
 * before difficulty tiers existed (same number/order of `random.next()`
 * calls, same resulting distribution).
 */
function pickWeightedColumns(count: number, weightOf: (col: number) => number, random: RandomSource): number[] {
  const available = Array.from({ length: BOARD_COLS }, (_, i) => i);
  const chosen: number[] = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const weights = available.map(weightOf);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = random.next() * total;
    let pickIndex = available.length - 1;
    for (let j = 0; j < available.length; j++) {
      r -= weights[j];
      if (r < 0) {
        pickIndex = j;
        break;
      }
    }
    chosen.push(available.splice(pickIndex, 1)[0]);
  }
  return chosen;
}

/** BOARD_COLS is 7, so this is column 3 — the middle column. */
const CENTER_COL = (BOARD_COLS - 1) / 2;

/**
 * Column-selection weighting per tier. Placement always stays randomized
 * (every column keeps a nonzero chance, and which columns actually get
 * picked varies round to round) — only the *bias* changes, never a fixed
 * repeating pattern:
 *
 * - normal: uniform — fully random, exactly the original behavior.
 * - dense: biased toward the center column (the "clustered near the
 *   center" requirement — bricks only ever spawn on one row per turn, so
 *   there is no separate "upper area" axis to bias within a single row).
 * - hard: biased toward the edges instead — "strategically inconvenient"
 *   for a player who instinctively aims center.
 * - expert / extreme: biased into a randomized contiguous window of
 *   columns (narrower for extreme than expert), producing a tight
 *   corridor/narrow-passage layout whose *position* is still randomized
 *   every round.
 */
function columnsForTier(tier: DifficultyTier, count: number, random: RandomSource): number[] {
  switch (tier) {
    case "normal":
      return pickWeightedColumns(count, () => 1, random);
    case "dense":
      return pickWeightedColumns(count, (col) => 1 + (CENTER_COL - Math.abs(col - CENTER_COL)), random);
    case "hard":
      return pickWeightedColumns(count, (col) => 1 + Math.abs(col - CENTER_COL), random);
    case "expert":
    case "extreme": {
      const windowSize = Math.min(BOARD_COLS, count + (tier === "expert" ? 1 : 0));
      const maxStart = BOARD_COLS - windowSize;
      const windowStart = maxStart > 0 ? Math.floor(random.next() * (maxStart + 1)) : 0;
      return pickWeightedColumns(
        count,
        (col) => (col >= windowStart && col < windowStart + windowSize ? 10 : 1),
        random,
      );
    }
  }
}

/**
 * Generates a sparse batch of new bricks for row FORMATION_TOP_ROW (the
 * top of the *active* formation area — row 0 is a permanent empty buffer
 * and never receives anything). Existing bricks are only ever shifted
 * downward by the caller before this runs, so this row is always empty of
 * old bricks; this only needs to avoid placing two new bricks on the same
 * column.
 *
 * Difficulty scales by round tier (see difficultyTierForLevel) via brick
 * count, column-placement bias, and reinforced-brick proportion — never
 * by exceeding MAX_NEW_BRICKS_PER_TURN. That cap is enforced for every
 * tier, not just NORMAL, which is what keeps a route through the board
 * always possible: at least BOARD_COLS - MAX_NEW_BRICKS_PER_TURN (2)
 * columns stay open in every single generated row, at every difficulty.
 */
export function generateBricks(level: number, random: RandomSource): Brick[] {
  const tier = difficultyTierForLevel(level);
  const count = Math.min(MAX_NEW_BRICKS_PER_TURN, brickCountForTier(tier, level, random));
  const cols = columnsForTier(tier, count, random);

  const reinforcedProportion = reinforcedProportionForTier(tier);
  const normalHp = brickHpForLevel(level);
  const reinforcedHp = level + 2;

  return cols.map((col) => {
    // Short-circuits before calling random.next() at all when the
    // proportion is 0 (NORMAL/DENSE) — preserving the exact random-call
    // sequence, and therefore the exact output, of the pre-tier behavior
    // for rounds 1-30.
    const reinforced = reinforcedProportion > 0 && random.next() < reinforcedProportion;
    const hp = reinforced ? reinforcedHp : normalHp;
    return { row: FORMATION_TOP_ROW, col, hp, maxHp: hp };
  });
}

/**
 * Generates this turn's full new formation — bricks and exactly one red
 * bonus ball — as one call, so the two never collide: the bonus ball only
 * ever picks from columns the bricks didn't already take. Bricks are
 * capped at MAX_NEW_BRICKS_PER_TURN (5 of the board's 7 columns at most,
 * at every difficulty tier), which always leaves at least one column free
 * for the bonus ball; it is entirely separate from that cap and never
 * counted against it. Every round guarantees at least 1 red bonus ball —
 * never 0. Both always spawn at FORMATION_TOP_ROW — row 0 stays empty.
 * Unaffected by difficulty tier.
 */
export function generateFormation(
  level: number,
  random: RandomSource,
): { bricks: Brick[]; redBonusBalls: RedBonusBall[] } {
  const bricks = generateBricks(level, random);
  const takenCols = new Set(bricks.map((b) => b.col));
  const remainingCols = Array.from({ length: BOARD_COLS }, (_, i) => i).filter((c) => !takenCols.has(c));

  const redBonusBalls: RedBonusBall[] = [];
  if (remainingCols.length > 0) {
    const col = remainingCols[Math.floor(random.next() * remainingCols.length)];
    redBonusBalls.push({ row: FORMATION_TOP_ROW, col });
  }

  return { bricks, redBonusBalls };
}
