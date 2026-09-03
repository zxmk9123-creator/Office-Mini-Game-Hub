import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GameSession,
  MinesweeperGame,
  type GameLifecycleState,
  type GameResult,
  type MinesweeperDifficulty,
  type MinesweeperResultMetadata,
  type MinesweeperState,
} from "@mini-game-hub/game-core";
import { createGameSession, submitGameResult, type GameResultDto } from "../../api/client";
import { PerformanceClock } from "../reaction-test/performanceClock";

export type SubmissionStatus = "idle" | "saving" | "saved" | "error";

export interface MinesweeperView {
  lifecycleState: GameLifecycleState;
  gameState: MinesweeperState | null;
  result: GameResult<MinesweeperResultMetadata> | null;
  submissionStatus: SubmissionStatus;
  persistedResult: GameResultDto | null;
  starting: boolean;
  difficulty: MinesweeperDifficulty;
  /** Live-updating elapsed time (ms) while the timer is running; frozen once the game ends. */
  elapsedMs: number;
}

const gameIdFor = (difficulty: MinesweeperDifficulty) => `minesweeper-${difficulty}`;

/**
 * The application-boundary adapter for Minesweeper — owns the browser
 * Clock, the GameSession lifecycle, the HTTP calls to create a session and
 * submit its result, and a lightweight live-timer tick for display only
 * (never fed back into the engine). Contains no Minesweeper rules; those
 * all live in MinesweeperGame. Same shape as useReactionTestSession /
 * useSwipeBrickBreakerSession.
 */
export function useMinesweeperSession(playerId: string | null) {
  const [difficulty, setDifficultyState] = useState<MinesweeperDifficulty>("easy");
  const session = useMemo(() => new GameSession(new MinesweeperGame(difficulty, new PerformanceClock())), [difficulty]);

  const sessionIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  const readView = useCallback(
    (submissionStatus: SubmissionStatus, persistedResult: GameResultDto | null): Omit<MinesweeperView, "starting" | "elapsedMs"> => ({
      lifecycleState: session.lifecycleState,
      gameState: session.lifecycleState === "idle" ? null : session.getGameState(),
      result: session.lifecycleState === "result" ? session.getResult() : null,
      submissionStatus,
      persistedResult,
      difficulty,
    }),
    [session, difficulty],
  );

  const [view, setView] = useState<Omit<MinesweeperView, "starting" | "elapsedMs">>(() => readView("idle", null));
  const sync = useCallback(
    (submissionStatus: SubmissionStatus = view.submissionStatus, persistedResult = view.persistedResult) =>
      setView(readView(submissionStatus, persistedResult)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readView],
  );

  // Live-updating display timer: ticks while a round is in progress with
  // its clock already started, stops (and freezes elapsedMs) the instant
  // the round ends — matches the engine's own startedAtMs/endedAtMs rules
  // without duplicating any of them here.
  useEffect(() => {
    const gs = view.gameState;
    if (!gs || gs.phase !== "active" || gs.startedAtMs === null) {
      return;
    }
    const id = window.setInterval(() => setNowMs(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [view.gameState]);

  const elapsedMs = (() => {
    const gs = view.gameState;
    if (!gs || gs.startedAtMs === null) return 0;
    const end = gs.endedAtMs ?? nowMs;
    return Math.max(0, end - gs.startedAtMs);
  })();

  const setDifficulty = useCallback(
    (next: MinesweeperDifficulty) => {
      if (session.lifecycleState !== "idle") return;
      setDifficultyState(next);
    },
    [session],
  );

  const submitFinished = useCallback(async () => {
    const localResult = session.computeResult();
    sync("saving", null);

    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      sync("error", null);
      return;
    }
    try {
      const persisted = await submitGameResult(gameIdFor(difficulty), {
        sessionId,
        score: localResult.score,
        completion: localResult.completion,
        metadata: localResult.metadata,
      });
      sync("saved", persisted);
    } catch {
      sync("error", null);
    }
  }, [session, sync, difficulty]);

  const start = useCallback(async () => {
    if (!playerId || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      if (session.lifecycleState !== "idle") {
        session.reset();
      }
      sessionIdRef.current = null;
      setView(readView("idle", null));

      const apiSession = await createGameSession(gameIdFor(difficulty), playerId);
      sessionIdRef.current = apiSession.id;

      session.ready();
      session.start();
      sync("idle", null);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [session, sync, playerId, readView, difficulty]);

  const reveal = useCallback(
    (row: number, col: number) => {
      if (session.lifecycleState !== "playing") return;
      session.submitInput({ type: "reveal", row, col });
      // TS treats the getter as immutable across the call above and would
      // otherwise narrow this read to the pre-submitInput() literal type.
      const lifecycleStateAfterInput = session.lifecycleState as GameLifecycleState;
      if (lifecycleStateAfterInput === "finished") {
        void submitFinished();
        return;
      }
      sync();
    },
    [session, sync, submitFinished],
  );

  const toggleFlag = useCallback(
    (row: number, col: number) => {
      if (session.lifecycleState !== "playing") return;
      session.submitInput({ type: "toggleFlag", row, col });
      sync();
    },
    [session, sync],
  );

  const reset = useCallback(() => {
    if (session.lifecycleState !== "idle") {
      session.reset();
    }
    sessionIdRef.current = null;
    setView(readView("idle", null));
  }, [session, readView]);

  // `difficulty` is returned from the top-level state directly, not from
  // `view` — `view` only updates when sync() runs (after a session
  // lifecycle change), but setDifficulty() must be reflected immediately
  // on click, before any session event fires, so the selector highlight
  // never lags behind the actual active difficulty.
  return { ...view, starting, elapsedMs, difficulty, setDifficulty, start, reveal, toggleFlag, reset };
}
