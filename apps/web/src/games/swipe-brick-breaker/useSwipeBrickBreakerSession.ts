import { useCallback, useMemo, useRef, useState } from "react";
import {
  GameSession,
  SwipeBrickBreakerGame,
  type GameLifecycleState,
  type GameResult,
  type SwipeBrickBreakerResultMetadata,
  type SwipeBrickBreakerState,
} from "@mini-game-hub/game-core";
import { createGameSession, submitGameResult, type GameResultDto } from "../../api/client";
import { PerformanceClock } from "../reaction-test/performanceClock";

const GAME_ID = "swipe-brick-breaker";

export type SubmissionStatus = "idle" | "saving" | "saved" | "error";

export interface SwipeBrickBreakerView {
  lifecycleState: GameLifecycleState;
  /** null only while lifecycleState is "idle", before the first game starts. */
  gameState: SwipeBrickBreakerState | null;
  result: GameResult<SwipeBrickBreakerResultMetadata> | null;
  submissionStatus: SubmissionStatus;
  persistedResult: GameResultDto | null;
  starting: boolean;
}

/**
 * The application-boundary adapter, mirroring useReactionTestSession's
 * shape: owns the browser Clock and the HTTP calls that create a
 * GameSession before play and submit the resulting GameResult once the
 * game ends. Contains no brick-breaker rules (those live in
 * SwipeBrickBreakerGame) and no persistence rules (those live in the
 * server's GameResultService) — this hook only wires the two together.
 *
 * Unlike Reaction Test, this game needs a continuous per-frame `tick`
 * during a volley — the view owns the single requestAnimationFrame loop
 * (it already needs one to redraw the canvas every frame) and calls
 * `tick(dtMs)` from inside it; this hook stays free of timers itself.
 */
export function useSwipeBrickBreakerSession(playerId: string | null) {
  const session = useMemo(() => new GameSession(new SwipeBrickBreakerGame(new PerformanceClock())), []);
  const sessionIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);

  const readView = useCallback(
    (submissionStatus: SubmissionStatus, persistedResult: GameResultDto | null): Omit<SwipeBrickBreakerView, "starting"> => ({
      lifecycleState: session.lifecycleState,
      gameState: session.lifecycleState === "idle" ? null : session.getGameState(),
      result: session.lifecycleState === "result" ? session.getResult() : null,
      submissionStatus,
      persistedResult,
    }),
    [session],
  );

  const [view, setView] = useState<Omit<SwipeBrickBreakerView, "starting">>(() => readView("idle", null));
  const sync = useCallback(
    (submissionStatus: SubmissionStatus = view.submissionStatus, persistedResult = view.persistedResult) =>
      setView(readView(submissionStatus, persistedResult)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readView],
  );

  const submitResult = useCallback(async () => {
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

  const aim = useCallback(
    (angleRad: number) => {
      if (session.lifecycleState !== "playing") {
        return;
      }
      session.submitInput({ type: "aim", angleRad });
      sync();
    },
    [session, sync],
  );

  const cancelAim = useCallback(() => {
    if (session.lifecycleState !== "playing") {
      return;
    }
    session.submitInput({ type: "cancelAim" });
    sync();
  }, [session, sync]);

  const fire = useCallback(() => {
    if (session.lifecycleState !== "playing") {
      return;
    }
    session.submitInput({ type: "fire" });
    sync();
  }, [session, sync]);

  /** Called once per animation frame by the view while a volley is in flight. */
  const tick = useCallback(
    (dtMs: number) => {
      if (session.lifecycleState !== "playing") {
        return;
      }
      session.submitInput({ type: "tick", dtMs });
      const lifecycleStateAfterInput = session.lifecycleState as GameLifecycleState;
      sync();
      if (lifecycleStateAfterInput === "finished") {
        void submitResult();
      }
    },
    [session, sync, submitResult],
  );

  /**
   * Reads the live game state directly from the GameSession, bypassing
   * React state entirely — used by the view's per-frame canvas draw so
   * drawing never depends on (or waits for) a React re-render.
   */
  const getSnapshot = useCallback((): SwipeBrickBreakerState | null => {
    return session.lifecycleState === "idle" ? null : session.getGameState();
  }, [session]);

  const reset = useCallback(() => {
    if (session.lifecycleState !== "idle") {
      session.reset();
    }
    sessionIdRef.current = null;
    setView(readView("idle", null));
  }, [session, readView]);

  return { ...view, starting, start, aim, cancelAim, fire, tick, getSnapshot, reset };
}
