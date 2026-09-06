import type { Game, GameMetadata, GameResult } from "../../types";
import type { Clock } from "../reaction-test/types";
import { canPlace, getDropDistance } from "./collision";
import { clearCompletedRows, createEmptyBoard, getCompletedRows, mergePieceIntoBoard } from "./board";
import { MathRandomSource, SevenBagGenerator, type BagSource } from "./generator";
import { gravityIntervalMs } from "./gravity";
import { spawnPiece } from "./pieces";
import { PieceQueue } from "./queue";
import { getRotationCandidates, type RotationDirection } from "./rotation";
import { DEFAULT_TETRIS_RULESET } from "./constants";
import type { ActivePiece, TetrisInput, TetrisResultMetadata, TetrisRuleset, TetrisState } from "./types";

/**
 * Number of upcoming pieces exposed via `state.next` — a display/UI
 * concern only; the queue itself (see queue.ts) can peek arbitrarily far
 * ahead regardless of this constant.
 */
const PREVIEW_COUNT = 3;

/**
 * Phase A-F (MVP): spawn, left/right/soft-drop/hard-drop movement,
 * collision, locking, game-over detection, SRS rotation with wall kicks
 * (rotation.ts), line clearing (board.ts), time-driven gravity +
 * Classic-style lock delay (gravity.ts + the "tick" input), and
 * Classic-style score/level progression (scoreForClear + lockAndSpawnNext).
 * `pause`/`restart` are accepted (the Game contract must handle every
 * declared TetrisInput) but remain no-ops — restart is handled at the
 * platform boundary via GameSession.reset()/start(), same as every other
 * game.
 */
export const tetrisMetadata: GameMetadata = {
  id: "tetris",
  name: "Tetris",
  description: "Classic-style Tetris — clear lines, climb the levels.",
  icon: "tetris",
  scoreType: "higher_is_better",
  version: "0.1.0",
  enabled: true,
};

/**
 * Tetris's game engine. Pure state transitions only — no DOM, no timers;
 * time only ever enters via the "tick" input's `dtMs`, supplied by the
 * caller (see types.ts's TetrisInput doc comment). `queue` (built fresh
 * from `pieceSource` on every start()) is intentionally NOT part of
 * TetrisState: it's a stateful helper object, not serializable data, the
 * same way SwipeBrickBreakerGame keeps its `bricksDestroyed` counter on
 * the instance rather than in TState. Given the same `pieceSource`
 * sequence and the same input (including "tick") sequence, the resulting
 * TetrisState is always identical.
 */
export class TetrisGame implements Game<TetrisState, TetrisInput, TetrisResultMetadata> {
  readonly metadata = tetrisMetadata;
  private queue: PieceQueue | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly pieceSource: BagSource = new SevenBagGenerator(new MathRandomSource()),
    private readonly ruleset: TetrisRuleset = DEFAULT_TETRIS_RULESET,
  ) {}

  createInitialState(): TetrisState {
    return {
      status: "ready",
      board: createEmptyBoard(this.ruleset.boardWidth, this.ruleset.bufferRows + this.ruleset.boardHeight),
      current: null,
      next: [],
      score: 0,
      lines: 0,
      level: 1,
      gravityAccumulator: 0,
      lockElapsedMs: 0,
      lockResetCount: 0,
    };
  }

  /**
   * ready -> playing: draws a fresh PieceQueue over `pieceSource` (the
   * source's own sequence continues rather than resetting — the same
   * "start() re-derives from the still-running RandomSource" convention
   * SwipeBrickBreakerGame.start() already uses) and spawns the first
   * piece, checking it against the (empty) board exactly like any other
   * spawn.
   */
  start(state: TetrisState): TetrisState {
    this.queue = new PieceQueue(this.pieceSource);
    return this.trySpawn(state, this.queue);
  }

  handleInput(state: TetrisState, input: TetrisInput): TetrisState {
    switch (input.type) {
      case "moveLeft":
        return this.tryMove(state, -1, 0);
      case "moveRight":
        return this.tryMove(state, 1, 0);
      case "softDrop":
        return this.softDrop(state);
      case "hardDrop":
        return this.hardDrop(state);
      case "rotateCw":
        return this.rotate(state, "cw");
      case "rotateCcw":
        return this.rotate(state, "ccw");
      case "tick":
        return this.tick(state, input.dtMs);
      // Level/score progression and pause/restart semantics are all
      // later work — every other input is a deliberate no-op for now.
      case "pause":
      case "restart":
      default:
        return state;
    }
  }

  /** True once the piece can no longer move down one cell — the lock-delay condition. */
  private isGrounded(board: TetrisState["board"], piece: ActivePiece): boolean {
    return !canPlace(board, { ...piece, y: piece.y + 1 });
  }

  /**
   * Lock-delay bookkeeping for a successful LEFT/RIGHT/ROTATE move (never
   * for a downward move — see resetLockDelayForLanding for that): if the
   * piece isn't grounded at its new position, lock delay is fully
   * inactive (0/0). If it is grounded, the delay resets to 0 UNLESS the
   * reset budget (lockDelayMaxResets) is already spent, in which case the
   * elapsed timer keeps running untouched — this is what prevents a piece
   * from being stalled in place forever by spamming moves/rotations.
   */
  private lockDelayAfterSidewaysOrRotate(
    state: TetrisState,
    candidate: ActivePiece,
  ): Pick<TetrisState, "lockElapsedMs" | "lockResetCount"> {
    if (!this.isGrounded(state.board, candidate)) {
      return { lockElapsedMs: 0, lockResetCount: 0 };
    }
    if (state.lockResetCount >= this.ruleset.lockDelayMaxResets) {
      return { lockElapsedMs: state.lockElapsedMs, lockResetCount: state.lockResetCount };
    }
    return { lockElapsedMs: 0, lockResetCount: state.lockResetCount + 1 };
  }

  private tryMove(state: TetrisState, dx: number, dy: number): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }
    const candidate: ActivePiece = { ...state.current, x: state.current.x + dx, y: state.current.y + dy };
    if (!canPlace(state.board, candidate)) {
      // Invalid movement: the board is untouched (never even read for
      // writing) and the active piece keeps its exact previous position.
      return state;
    }
    return { ...state, current: candidate, ...this.lockDelayAfterSidewaysOrRotate(state, candidate) };
  }

  /**
   * SRS rotation: try the plain rotated position first, then each wall-
   * kick candidate in the table's priority order, accepting the first one
   * canPlace() allows — unaffected by lock delay: rotation remains
   * allowed at any point while grounded, exactly like Phase C, and a
   * successful rotation while grounded resets lock delay the same way a
   * successful sideways move does. If every candidate collides, the
   * piece's position AND rotation state are both left completely
   * unchanged. Never touches the board; only ever reads it via canPlace().
   */
  private rotate(state: TetrisState, direction: RotationDirection): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }
    for (const candidate of getRotationCandidates(state.current, direction)) {
      if (canPlace(state.board, candidate)) {
        return { ...state, current: candidate, ...this.lockDelayAfterSidewaysOrRotate(state, candidate) };
      }
    }
    return state;
  }

  /**
   * Soft drop moves the piece down one cell, exactly like a manual gravity
   * step (see tick()'s own downward-move handling) — a fresh landing, so
   * lock delay is always fully cleared (0/0), never counted against the
   * reset budget. If downward movement is blocked, soft drop is now a
   * no-op: it no longer force-locks the piece the instant it touches the
   * floor (that was Phase B/C/D's behavior, before lock delay existed) —
   * the piece simply stays grounded, and only lock delay expiring (via
   * "tick") or an explicit "hardDrop" actually locks it.
   */
  private softDrop(state: TetrisState): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }
    const candidate: ActivePiece = { ...state.current, y: state.current.y + 1 };
    if (!canPlace(state.board, candidate)) {
      return state;
    }
    return { ...state, current: candidate, gravityAccumulator: 0, lockElapsedMs: 0, lockResetCount: 0 };
  }

  /** Hard drop bypasses lock delay entirely — it computes the full drop distance and locks in the same input, exactly as in Phase B-D. */
  private hardDrop(state: TetrisState): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }
    const distance = getDropDistance(state.board, state.current);
    const dropped: ActivePiece = { ...state.current, y: state.current.y + distance };
    return this.lockAndSpawnNext(state, dropped);
  }

  /**
   * Time-driven gravity + lock delay — the only input that ever reads
   * `dtMs` from the caller; game-core itself never calls a timer. Consumes
   * as many whole gravity intervals as `dtMs` (plus any carried-over
   * accumulator) covers, moving the piece down one cell per interval,
   * deterministically, in a loop rather than only ever handling one step
   * — so a large `dtMs` (e.g. a dropped frame) still behaves correctly
   * instead of silently losing elapsed time. Once a downward move is
   * blocked, remaining accumulated time for this tick is dropped (grounded
   * pieces don't need to "remember" gravity time — only lock delay matters
   * once grounded) rather than let the accumulator grow without bound.
   */
  private tick(state: TetrisState, dtMs: number): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }

    const interval = gravityIntervalMs(this.ruleset, state.level);
    let current = state.current;
    let gravityAccumulator = state.gravityAccumulator + dtMs;
    let lockElapsedMs = state.lockElapsedMs;
    let lockResetCount = state.lockResetCount;
    let movedThisTick = false;

    while (gravityAccumulator >= interval) {
      const candidate: ActivePiece = { ...current, y: current.y + 1 };
      if (!canPlace(state.board, candidate)) {
        gravityAccumulator = 0;
        break;
      }
      current = candidate;
      gravityAccumulator -= interval;
      lockElapsedMs = 0;
      lockResetCount = 0;
      movedThisTick = true;
    }

    if (this.isGrounded(state.board, current)) {
      if (!movedThisTick) {
        // Already grounded before this tick's gravity ran (or never moved) — lock delay keeps counting this tick's full elapsed time.
        lockElapsedMs += dtMs;
      }
      if (lockElapsedMs >= this.ruleset.lockDelayMs) {
        return this.lockAndSpawnNext({ ...state, current }, current);
      }
      return { ...state, current, gravityAccumulator, lockElapsedMs, lockResetCount };
    }

    // Not grounded: no lock delay in progress.
    return { ...state, current, gravityAccumulator, lockElapsedMs: 0, lockResetCount: 0 };
  }

  /**
   * Classic-style line-clear score, multiplied by the level in effect at
   * the moment of the clear (before any level-up this same clear causes) —
   * 1/2/3/4 lines map to single/double/triple/tetris in the ruleset's
   * scoring table; clearing 0 lines scores nothing.
   */
  private scoreForClear(clearedCount: number, level: number): number {
    const { single, double, triple, tetris } = this.ruleset.scoring;
    const perLine = [0, single, double, triple, tetris][clearedCount] ?? tetris;
    return perLine * level;
  }

  /**
   * Piece Lock -> Merge Piece -> Find/Clear Full Rows -> Score/Level ->
   * Spawn Next Piece -> Check Game Over. clearCompletedRows() removes every
   * completed row (single/double/triple/Tetris, or any non-consecutive
   * combination of them) as one atomic step and is a no-op when nothing is
   * complete. Score uses the Classic-style table (see scoreForClear); level
   * is derived directly from the total lines cleared (1 + lines /
   * linesPerLevel) rather than tracked separately, so it can never drift
   * out of sync. A level-up takes effect on the very next "tick" via
   * gravityIntervalMs(ruleset, level) — no separate wiring needed. Gravity/
   * lock-delay timing is always reset to a clean slate here — the newly
   * spawned piece (or Game Over) never inherits the just-locked piece's
   * leftover timing state.
   */
  private lockAndSpawnNext(state: TetrisState, piece: ActivePiece): TetrisState {
    const merged = mergePieceIntoBoard(state.board, piece);
    const clearedCount = getCompletedRows(merged).length;
    const board = clearCompletedRows(merged);
    const score = state.score + this.scoreForClear(clearedCount, state.level);
    const lines = state.lines + clearedCount;
    const level = 1 + Math.floor(lines / this.ruleset.linesPerLevel);
    const reset: TetrisState = {
      ...state,
      board,
      current: null,
      score,
      lines,
      level,
      gravityAccumulator: 0,
      lockElapsedMs: 0,
      lockResetCount: 0,
    };
    return this.trySpawn(reset, this.requireQueue());
  }

  /** Draws the next piece and either continues PLAYING or, if it can't legally spawn, ends the game — the board is carried through untouched either way. */
  private trySpawn(state: TetrisState, queue: PieceQueue): TetrisState {
    const type = queue.next();
    const spawned = spawnPiece(type);
    const next = queue.peek(PREVIEW_COUNT);
    if (canPlace(state.board, spawned)) {
      return { ...state, status: "playing", current: spawned, next };
    }
    return { ...state, status: "gameOver", current: null, next };
  }

  private requireQueue(): PieceQueue {
    if (!this.queue) {
      throw new Error("TetrisGame: start() must be called before locking a piece");
    }
    return this.queue;
  }

  isFinished(state: TetrisState): boolean {
    return state.status === "gameOver";
  }

  computeResult(state: TetrisState): GameResult<TetrisResultMetadata> {
    return {
      gameId: this.metadata.id,
      scoreType: this.metadata.scoreType,
      score: state.score,
      completion: { reason: "completed", completedAt: this.clock.now() },
      metadata: { lines: state.lines, level: state.level },
    };
  }
}
