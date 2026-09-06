import { useCallback, useMemo, useRef, useState } from "react";
import {
  GameSession,
  TetrisGame,
  type GameLifecycleState,
  type GameResult,
  type TetrisInput,
  type TetrisResultMetadata,
  type TetrisState,
} from "@mini-game-hub/game-core";
import { createGameSession, submitGameResult, type GameResultDto } from "../../api/client";
import { PerformanceClock } from "../reaction-test/performanceClock";

const GAME_ID = "tetris";

export type SubmissionStatus = "idle" | "saving" | "saved" | "error";

export interface TetrisView {
  lifecycleState: GameLifecycleState;
  /** null only while lifecycleState is "idle", before the first game starts. */
  gameState: TetrisState | null;
  result: GameResult<TetrisResultMetadata> | null;
  submissionStatus: SubmissionStatus;
  persistedResult: GameResultDto | null;
  starting: boolean;
}

/**
 * The application-boundary adapter for Tetris, mirroring
 * useSwipeBrickBreakerSession's shape: owns the browser Clock, the
 * GameSession lifecycle, and the HTTP calls to create a session and submit
 * its result. Contains no Tetris rules (those all live in TetrisGame) —
 * this hook only wires the engine to the platform.
 *
 * Like Swipe Brick Breaker, Tetris needs a continuous per-frame `tick` for
 * gravity — the view owns the requestAnimationFrame loop and calls
 * `tick(dtMs)` from inside it; this hook stays free of timers itself.
 */
export function useTetrisSession(playerId: string | null) {
  const session = useMemo(() => new GameSession(new TetrisGame(new PerformanceClock())), []);
  const sessionIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  // Guards against submitting the final result more than once — a "tick"
  // that lands exactly on Game Over and a subsequent input both observe
  // lifecycleState flipping to "finished", but only the first one may act
  // on it.
  const submittedRef = useRef(false);
  const [starting, setStarting] = useState(false);

  const readView = useCallback(
    (submissionStatus: SubmissionStatus, persistedResult: GameResultDto | null): Omit<TetrisView, "starting"> => ({
      lifecycleState: session.lifecycleState,
      gameState: session.lifecycleState === "idle" ? null : session.getGameState(),
      result: session.lifecycleState === "result" ? session.getResult() : null,
      submissionStatus,
      persistedResult,
    }),
    [session],
  );

  const [view, setView] = useState<Omit<TetrisView, "starting">>(() => readView("idle", null));
  const sync = useCallback(
    (submissionStatus: SubmissionStatus = view.submissionStatus, persistedResult = view.persistedResult) =>
      setView(readView(submissionStatus, persistedResult)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readView],
  );

  const submitResult = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const localResult = session.computeResult();
    sync("saving", null);
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      sync("error", null);
      return;
    }
    try {
      const persisted = await submitGameResult(GAME_ID, {
        sessionId,
        score: localResult.score,
        completion: localResult.completion,
        metadata: localResult.metadata,
      });
      sync("saved", persisted);
    } catch {
      // A failed submission must never crash or block the Game Over
      // screen — the player still sees their local score, just not saved.
      sync("error", null);
    }
  }, [session, sync]);

  const start = useCallback(async () => {
    if (!playerId || startingRef.current) {
      return;
    }
    startingRef.current = true;
    setStarting(true);
    try {
      if (session.lifecycleState !== "idle") {
        session.reset();
      }
      sessionIdRef.current = null;
      submittedRef.current = false;
      setView(readView("idle", null));

      const apiSession = await createGameSession(GAME_ID, playerId);
      sessionIdRef.current = apiSession.id;

      session.ready();
      session.start();
      sync();
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [session, sync, playerId, readView]);

  /** Submits one input, syncing the view and submitting the result exactly once if it just finished the game. */
  const submit = useCallback(
    (input: TetrisInput) => {
      if (session.lifecycleState !== "playing") {
        return;
      }
      session.submitInput(input);
      const lifecycleStateAfterInput = session.lifecycleState as GameLifecycleState;
      sync();
      if (lifecycleStateAfterInput === "finished") {
        void submitResult();
      }
    },
    [session, sync, submitResult],
  );

  const moveLeft = useCallback(() => submit({ type: "moveLeft" }), [submit]);
  const moveRight = useCallback(() => submit({ type: "moveRight" }), [submit]);
  const softDrop = useCallback(() => submit({ type: "softDrop" }), [submit]);
  const hardDrop = useCallback(() => submit({ type: "hardDrop" }), [submit]);
  const rotateCw = useCallback(() => submit({ type: "rotateCw" }), [submit]);
  const rotateCcw = useCallback(() => submit({ type: "rotateCcw" }), [submit]);
  /** Called once per animation frame by the view while a game is in progress. */
  const tick = useCallback((dtMs: number) => submit({ type: "tick", dtMs }), [submit]);

  /**
   * Reads the live game state directly from the GameSession, bypassing
   * React state — used by the view's per-frame render so drawing never
   * waits on a React re-render to see the latest gravity tick.
   */
  const getSnapshot = useCallback((): TetrisState | null => {
    return session.lifecycleState === "idle" ? null : session.getGameState();
  }, [session]);

  const reset = useCallback(() => {
    if (session.lifecycleState !== "idle") {
      session.reset();
    }
    sessionIdRef.current = null;
    submittedRef.current = false;
    setView(readView("idle", null));
  }, [session, readView]);

  return {
    ...view,
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
    reset,
  };
}
