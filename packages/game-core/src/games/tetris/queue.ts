import type { BagSource } from "./generator";
import type { PieceType } from "./types";

/**
 * The public shape `tetris.ts` (a later phase) and tests interact with —
 * matches the PieceGenerator shape from the architecture spec (`next` +
 * `peek`). A raw BagSource (SevenBagGenerator, or a deterministic test
 * double) only ever needs to produce one piece at a time; PieceQueue is
 * the buffering layer on top that makes an arbitrary-length `peek(count)`
 * possible without consuming from — or re-requesting — the underlying
 * source.
 */
export interface PieceGenerator {
  next(): PieceType;
  peek(count: number): PieceType[];
}

/**
 * Wraps any BagSource (typically a SevenBagGenerator) with a buffer deep
 * enough to satisfy `peek(count)` for whatever `count` has been asked for
 * so far, topping the buffer back up from the source as needed. Never
 * discards buffered-but-unconsumed pieces — `peek` never advances the
 * queue, only `next()` does.
 */
export class PieceQueue implements PieceGenerator {
  private buffer: PieceType[] = [];

  constructor(private readonly source: BagSource) {}

  private ensureBuffered(count: number): void {
    while (this.buffer.length < count) {
      this.buffer.push(this.source.next());
    }
  }

  next(): PieceType {
    this.ensureBuffered(1);
    return this.buffer.shift() as PieceType;
  }

  peek(count: number): PieceType[] {
    if (count <= 0) return [];
    this.ensureBuffered(count);
    return this.buffer.slice(0, count);
  }
}
