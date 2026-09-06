import { useEffect, useRef } from "react";
import {
  TETRIS_BOARD_HEIGHT,
  TETRIS_BOARD_WIDTH,
  TETRIS_BUFFER_ROWS,
  TETRIS_SPAWN_X,
  TETRIS_SPAWN_Y,
  cellsForPiece,
  spawnPiece,
  type PieceType,
} from "@mini-game-hub/game-core";
import { Leaderboard } from "../reaction-test/Leaderboard";
import { useTetrisSession } from "./useTetrisSession";

const GAME_ID = "tetris";

const PIECE_COLORS: Record<PieceType, string> = {
  I: "bg-cyan-400",
  O: "bg-yellow-400",
  T: "bg-purple-500",
  S: "bg-green-500",
  Z: "bg-red-500",
  J: "bg-blue-500",
  L: "bg-orange-500",
};

function HomeLink({ onHome }: { onHome: () => void }) {
  return (
    <button
      type="button"
      onClick={onHome}
      className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline"
    >
      ← Home
    </button>
  );
}

function SubmissionStatusLine({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") return <p className="text-xs text-neutral-400">Saving…</p>;
  if (status === "saved") return <p className="text-xs text-neutral-400">Saved</p>;
  if (status === "error") return <p className="text-xs text-amber-600">⚠ Couldn&apos;t save this result.</p>;
  return null;
}

/** 0-relative (row, col) cells for `type` at spawn rotation — used to draw the small "Next" preview. */
function previewCells(type: PieceType) {
  return cellsForPiece(spawnPiece(type)).map(({ row, col }) => ({
    row: row - TETRIS_SPAWN_Y,
    col: col - TETRIS_SPAWN_X,
  }));
}

function NextPiecePreview({ type }: { type: PieceType | undefined }) {
  const cells = type ? previewCells(type) : [];
  return (
    <div
      className="grid gap-[2px] rounded-sm border border-neutral-200 bg-neutral-100 p-1"
      style={{ gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(4, 1fr)", width: 44, height: 44 }}
    >
      {Array.from({ length: 16 }, (_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const filled = type && cells.some((c) => c.row === row && c.col === col);
        return (
          <div key={i} className={`rounded-[1px] ${filled ? PIECE_COLORS[type!] : "bg-transparent"}`} />
        );
      })}
    </div>
  );
}

/**
 * A compact, DOM-grid-rendered Tetris. Follows the same platform-boundary
 * split as the other games: this component owns only rendering, keyboard
 * input, and the requestAnimationFrame gravity loop; every rule (movement,
 * collision, rotation/SRS, locking, line clearing, gravity, lock delay,
 * scoring/leveling, game over) lives in TetrisGame (game-core) via
 * useTetrisSession.
 */
export function TetrisView({
  playerId,
  nickname,
  onHome,
}: {
  playerId: string;
  nickname: string;
  onHome: () => void;
}) {
  const {
    lifecycleState,
    gameState,
    result,
    submissionStatus,
    persistedResult,
    starting,
    start,
    moveLeft,
    moveRight,
    softDrop,
    hardDrop,
    rotateCw,
    rotateCcw,
    tick,
    getSnapshot,
  } = useTetrisSession(playerId);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // The single animation loop: while playing, advances gravity/lock delay
  // one tick per frame. Nothing here computes game rules — it only feeds
  // elapsed wall-clock time into the engine via tick(dtMs), exactly like
  // Swipe Brick Breaker's own rAF loop.
  useEffect(() => {
    if (lifecycleState !== "playing") {
      lastTsRef.current = null;
      return;
    }
    const loop = (ts: number) => {
      const dt = lastTsRef.current === null ? 16 : Math.min(48, ts - lastTsRef.current);
      lastTsRef.current = ts;
      tick(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      lastTsRef.current = null;
    };
  }, [lifecycleState, tick]);

  // Keyboard controls — a frontend-only concern; game-core never sees a
  // KeyboardEvent. preventDefault() on every handled gameplay key stops
  // the page from scrolling (Space/Arrow keys) while a game is active.
  useEffect(() => {
    if (lifecycleState !== "playing") {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          moveLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          moveRight();
          break;
        case "ArrowDown":
          e.preventDefault();
          softDrop();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!e.repeat) rotateCw();
          break;
        case "z":
        case "Z":
          e.preventDefault();
          if (!e.repeat) rotateCcw();
          break;
        case " ":
        case "Spacebar":
          e.preventDefault();
          if (!e.repeat) hardDrop();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lifecycleState, moveLeft, moveRight, softDrop, rotateCw, rotateCcw, hardDrop]);

  if (lifecycleState === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
        <div className="flex w-full justify-start">
          <HomeLink onHome={onHome} />
        </div>
        <p className="text-sm text-neutral-500">
          ← → move · ↓ soft drop · ↑ rotate CW · Z rotate CCW · Space hard drop.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start
        </button>
        <div className="mt-2 w-full max-w-xs border-t border-neutral-100 pt-3">
          <p className="mb-1 text-xs text-neutral-400">Today&apos;s Top 10</p>
          <Leaderboard gameId={GAME_ID} playerId={playerId} refreshKey="idle" />
        </div>
      </div>
    );
  }

  if (lifecycleState === "result" && result) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <p className="text-xs text-neutral-400">{nickname}</p>
        <p className="text-sm font-semibold text-neutral-800">GAME OVER</p>
        <p className="text-xs uppercase tracking-wide text-neutral-400">Score</p>
        <p className="text-2xl font-semibold text-neutral-900">{result.score}</p>
        <p className="text-xs text-neutral-500">
          Level {result.metadata.level} · {result.metadata.lines} lines
        </p>
        <SubmissionStatusLine status={submissionStatus} />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            RESTART
          </button>
          <button
            type="button"
            onClick={onHome}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Home
          </button>
        </div>
        {submissionStatus === "saved" && persistedResult && (
          <div className="mt-3 w-full border-t border-neutral-100 pt-3">
            <p className="mb-1 text-xs text-neutral-400">Today&apos;s Top 10</p>
            <Leaderboard gameId={GAME_ID} playerId={playerId} refreshKey={persistedResult.id} />
          </div>
        )}
      </div>
    );
  }

  // "playing" (and the brief "finished" gap right before the result screen)
  // — always read the freshest snapshot rather than `gameState`, so the
  // very last gravity tick before Game Over is never one frame stale.
  const state = getSnapshot() ?? gameState;
  if (!state) {
    return null;
  }

  const visibleBoard = state.board.slice(TETRIS_BUFFER_ROWS);
  const activeCells = state.current ? cellsForPiece(state.current) : [];

  return (
    <div className="flex h-full flex-col gap-1.5 px-2 py-2">
      <div className="flex items-center justify-between px-1">
        <HomeLink onHome={onHome} />
        <div className="flex gap-3 text-xs text-neutral-600">
          <span>
            Score <span className="font-mono font-semibold text-neutral-900">{state.score}</span>
          </span>
          <span>
            Lv <span className="font-semibold text-neutral-900">{state.level}</span>
          </span>
          <span>
            Lines <span className="font-semibold text-neutral-900">{state.lines}</span>
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 overflow-hidden">
        <div
          className="grid h-full gap-[1px] rounded-sm border border-neutral-200 bg-neutral-200 p-[1px]"
          style={{
            aspectRatio: `${TETRIS_BOARD_WIDTH} / ${TETRIS_BOARD_HEIGHT}`,
            gridTemplateColumns: `repeat(${TETRIS_BOARD_WIDTH}, 1fr)`,
            gridTemplateRows: `repeat(${TETRIS_BOARD_HEIGHT}, 1fr)`,
          }}
        >
          {visibleBoard.map((rowCells, row) =>
            rowCells.map((cell, col) => {
              const boardRow = row + TETRIS_BUFFER_ROWS;
              const active = activeCells.find((c) => c.row === boardRow && c.col === col);
              const type = active ? state.current!.type : cell;
              return (
                <div
                  key={`${row}-${col}`}
                  className={`rounded-[1px] ${type ? PIECE_COLORS[type] : "bg-white"}`}
                />
              );
            }),
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">Next</p>
          <NextPiecePreview type={state.next[0]} />
        </div>
      </div>
      <p className="px-1 text-center text-[11px] text-neutral-400">
        ← → move · ↓ soft drop · ↑ rotate CW · Z rotate CCW · Space hard drop
      </p>
    </div>
  );
}
