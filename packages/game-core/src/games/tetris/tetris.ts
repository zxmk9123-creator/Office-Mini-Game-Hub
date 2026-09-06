import type { Game, GameMetadata, GameResult } from "../../types";
import type { Clock } from "../reaction-test/types";
import { canPlace, getDropDistance } from "./collision";
import { createEmptyBoard, mergePieceIntoBoard } from "./board";
import { MathRandomSource, SevenBagGenerator, type BagSource } from "./generator";
import { spawnPiece } from "./pieces";
import { PieceQueue } from "./queue";
import { DEFAULT_TETRIS_RULESET } from "./constants";
import type { ActivePiece, TetrisInput, TetrisResultMetadata, TetrisState } from "./types";

/**
 * Number of upcoming pieces exposed via `state.next` — a display/UI
 * concern only; the queue itself (see queue.ts) can peek arbitrarily far
 * ahead regardless of this constant.
 */
const PREVIEW_COUNT = 3;

/**
 * Phase B only: spawn, left/right/soft-drop/hard-drop movement,
 * collision, locking, and game-over detection. Rotation, scoring, line
 * clearing, level progression, and gravity timing are later phases —
 * `rotateCw`/`rotateCcw`/`pause`/`restart`/`tick` are all accepted (the
 * Game contract must handle every declared TetrisInput) but are no-ops
 * for now, exactly like an unimplemented-yet branch in any other engine's
 * handleInput.
 */
export const tetrisMetadata: GameMetadata = {
  id: "tetris",
  name: "Tetris",
  description: "Classic-style Tetris — clear lines, climb the levels.",
  icon: "tetris",
  scoreType: "higher_is_better",
  version: "0.1.0",
  // Not yet registered in gameRegistry.ts — flip once session/result/
  // ranking integration (a later phase) actually lands.
  enabled: false,
};

/**
 * Tetris's game engine. Pure state transitions only — no DOM, no timers.
 * `queue` (built fresh from `pieceSource` on every start()) is
 * intentionally NOT part of TetrisState: it's a stateful helper object,
 * not serializable data, the same way SwipeBrickBreakerGame keeps its
 * `bricksDestroyed` counter on the instance rather than in TState. Given
 * the same `pieceSource` sequence and the same input sequence, the
 * resulting TetrisState is always identical.
 */
export class TetrisGame implements Game<TetrisState, TetrisInput, TetrisResultMetadata> {
  readonly metadata = tetrisMetadata;
  private queue: PieceQueue | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly pieceSource: BagSource = new SevenBagGenerator(new MathRandomSource()),
  ) {}

  createInitialState(): TetrisState {
    return {
      status: "ready",
      board: createEmptyBoard(
        DEFAULT_TETRIS_RULESET.boardWidth,
        DEFAULT_TETRIS_RULESET.bufferRows + DEFAULT_TETRIS_RULESET.boardHeight,
      ),
      current: null,
      next: [],
      score: 0,
      lines: 0,
      level: 1,
      gravityAccumulator: 0,
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
      // Rotation (Phase C), scoring/level/gravity (Phases D-E), and
      // pause/restart semantics are all later work — every other input
      // is a deliberate no-op for now, not a missing case.
      case "rotateCw":
      case "rotateCcw":
      case "pause":
      case "restart":
      case "tick":
      default:
        return state;
    }
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
    return { ...state, current: candidate };
  }

  private softDrop(state: TetrisState): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }
    const candidate: ActivePiece = { ...state.current, y: state.current.y + 1 };
    if (canPlace(state.board, candidate)) {
      return { ...state, current: candidate };
    }
    // Downward movement blocked -> lock exactly where the piece already is.
    return this.lockAndSpawnNext(state, state.current);
  }

  private hardDrop(state: TetrisState): TetrisState {
    if (state.status !== "playing" || !state.current) {
      return state;
    }
    const distance = getDropDistance(state.board, state.current);
    const dropped: ActivePiece = { ...state.current, y: state.current.y + distance };
    return this.lockAndSpawnNext(state, dropped);
  }

  /**
   * Piece Lock -> Merge Piece -> Spawn Next Piece -> Check Game Over. Line
   * clearing, scoring, and level updates are deliberately absent — full
   * rows stay on the board exactly as they land until the line-clear
   * phase exists.
   */
  private lockAndSpawnNext(state: TetrisState, piece: ActivePiece): TetrisState {
    const board = mergePieceIntoBoard(state.board, piece);
    return this.trySpawn({ ...state, board, current: null }, this.requireQueue());
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
