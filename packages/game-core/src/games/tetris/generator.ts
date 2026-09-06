import { PIECE_TYPES, type PieceType } from "./types";

/**
 * Source of randomness for bag shuffling. Injectable so tests can force a
 * specific, deterministic shuffle sequence instead of depending on real
 * randomness — same RandomSource pattern used by Swipe Brick Breaker and
 * Minesweeper (game-core never calls `Math.random()` directly).
 */
export interface RandomSource {
  /** A float in [0, 1), same contract as Math.random(). */
  next(): number;
}

/** `Math.random` is a plain JS builtin (not a browser API), so a default lives in game-core. */
export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

/**
 * One shuffled bag containing exactly one of each of the 7 tetrominoes —
 * a Fisher-Yates shuffle of PIECE_TYPES, consuming exactly 6 values from
 * `random.next()` (the last element needs no swap decision). Deterministic
 * given a deterministic `random`.
 */
export function shuffledBag(random: RandomSource): PieceType[] {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** The minimal raw piece source a PieceQueue (see queue.ts) buffers ahead of. */
export interface BagSource {
  next(): PieceType;
}

/**
 * The 7-Bag generator: draws one full shuffledBag() at a time and hands
 * pieces out one by one, drawing (and reshuffling) a fresh bag only once
 * the current one is fully exhausted — so within any 7 consecutive draws,
 * and across any bag boundary, every piece type appears exactly once
 * before any piece repeats.
 */
export class SevenBagGenerator implements BagSource {
  private bag: PieceType[] = [];

  constructor(private readonly random: RandomSource = new MathRandomSource()) {}

  next(): PieceType {
    if (this.bag.length === 0) {
      this.bag = shuffledBag(this.random);
    }
    // Bags are drawn front-to-back (shift, not pop) purely so a bag's
    // pieces come out in the same order they were shuffled into —
    // cosmetic, since every ordering is equally valid, but keeps
    // shuffledBag()'s output directly observable through next().
    return this.bag.shift() as PieceType;
  }
}
