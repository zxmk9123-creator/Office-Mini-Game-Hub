import { useEffect, useRef } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@mini-game-hub/game-core";
import { Leaderboard } from "../reaction-test/Leaderboard";
import { useSwipeBrickBreakerSession } from "./useSwipeBrickBreakerSession";
import { drawBoard } from "./board";

const GAME_ID = "swipe-brick-breaker";
const MIN_DRAG_PX = 6;

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

/**
 * A compact, canvas-rendered Swipe Brick Breaker. Follows the same
 * platform-boundary split as Reaction Test: this component owns only
 * rendering and DOM/pointer/rAF plumbing; every rule (aiming, physics,
 * scoring, level/turn progression, game over) lives in
 * SwipeBrickBreakerGame (game-core) via useSwipeBrickBreakerSession.
 *
 * The canvas is sized purely from its container's actual CSS width (no
 * hardcoded desktop pixel dimensions), preserving the board's logical
 * aspect ratio — it stays fully visible and legible in a small embedded
 * game card, not just fullscreen.
 */
export function SwipeBrickBreakerView({
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
    aim,
    cancelAim,
    fire,
    tick,
    getSnapshot,
  } = useSwipeBrickBreakerSession(playerId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(0);
  const dragRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // Sizes the canvas's drawing buffer to fit *inside* the container on
  // both axes (never a fixed desktop size) — letterboxing on whichever
  // axis has room to spare — so the board's logical aspect ratio is kept
  // without ever pushing part of the board (including the launch point)
  // outside the actually-visible/clickable area. Sizing from width alone
  // previously let the canvas grow taller than the app's fixed-height
  // card on a short viewport, silently cropping the bottom of the board.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;
      const scale = Math.min(availableWidth / BOARD_WIDTH, availableHeight / BOARD_HEIGHT);
      const cssWidth = BOARD_WIDTH * scale;
      const cssHeight = BOARD_HEIGHT * scale;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      scaleRef.current = scale;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
    // Re-runs once the canvas/container actually mount — they don't exist
    // yet on the initial "idle" (Start button) render, only once
    // lifecycleState reaches "playing" and the canvas branch below renders.
  }, [lifecycleState]);

  // The single animation loop: while a volley is in flight, advances the
  // physics one tick per frame; every frame (volley or not) redraws the
  // board from the freshest state, straight off the GameSession — never
  // waiting on a React re-render to see the next ball position.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const loop = (ts: number) => {
      const dt = lastTsRef.current === null ? 16 : Math.min(48, ts - lastTsRef.current);
      lastTsRef.current = ts;

      if (lifecycleState === "playing") {
        tick(dt);
      }

      const snapshot = getSnapshot();
      if (snapshot && scaleRef.current > 0) {
        drawBoard(ctx, snapshot, scaleRef.current, snapshot.phase === "aiming" ? snapshot.aimAngleRad : null);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      lastTsRef.current = null;
    };
  }, [lifecycleState, tick, getSnapshot]);

  const angleFromPointer = (clientX: number, clientY: number): number | null => {
    const canvas = canvasRef.current;
    const scale = scaleRef.current;
    if (!canvas || !scale) return null;
    const rect = canvas.getBoundingClientRect();
    const launchX = (BOARD_WIDTH / 2) * scale;
    const launchY = (BOARD_HEIGHT - 0.3) * scale;
    const dx = clientX - rect.left - launchX;
    const dy = clientY - rect.top - launchY;
    return Math.atan2(dx, -dy);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState?.phase !== "ready") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.active && dist < MIN_DRAG_PX) return;
    drag.active = true;
    const angle = angleFromPointer(e.clientX, e.clientY);
    if (angle !== null) aim(angle);
    e.preventDefault();
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag?.active) {
      fire();
    } else {
      cancelAim();
    }
  };

  if (lifecycleState === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
        <div className="flex w-full justify-start">
          <HomeLink onHome={onHome} />
        </div>
        <p className="text-sm text-neutral-500">Drag to aim, release to fire every ball you&apos;ve got.</p>
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start
        </button>
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
        <p className="text-xs text-neutral-500">Round {result.metadata.level}</p>
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
            <p className="mb-1 text-xs text-neutral-400">Best Score</p>
            <Leaderboard gameId={GAME_ID} playerId={playerId} refreshKey={persistedResult.id} limit={1} />
          </div>
        )}
      </div>
    );
  }

  // "playing" (and the brief "finished" gap right before the result screen).
  return (
    <div className="flex h-full flex-col gap-1.5 px-2 py-2">
      <div className="flex items-center justify-between px-1">
        <HomeLink onHome={onHome} />
        <div className="flex gap-3 text-xs text-neutral-600">
          <span>
            Score <span className="font-semibold text-neutral-900">{gameState?.score ?? 0}</span>
          </span>
          <span>
            Round <span className="font-semibold text-neutral-900">{gameState?.level ?? 1}</span>
          </span>
          <span>
            Balls <span className="font-semibold text-neutral-900">{gameState?.ballCount ?? 1}</span>
          </span>
        </div>
      </div>
      {/*
        min-h-0 is required for a flex child to actually shrink to the
        space its flex-1 sibling (the HUD row above) leaves behind,
        instead of overflowing it — without it the canvas's own intrinsic
        size wins and pushes the launch point outside the visible card on
        a short viewport, per the resize effect's own letterboxing.
      */}
      <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="touch-none select-none rounded-sm border border-neutral-200"
        />
      </div>
      <p className="px-1 text-center text-[11px] text-neutral-400">Drag up from the board to aim, release to fire</p>
    </div>
  );
}
