import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GameSession,
  ReactionTestGame,
  type GameLifecycleState,
  type GameResult,
  type ReactionPhase,
  type ReactionTestResultMetadata,
} from "@mini-game-hub/game-core";
import { PerformanceClock } from "./performanceClock";

export interface ReactionTestView {
  lifecycleState: GameLifecycleState;
  /** null only while lifecycleState is "idle", before the first round starts. */
  phase: ReactionPhase | null;
  result: GameResult<ReactionTestResultMetadata> | null;
}

/**
 * The application-boundary adapter: owns the browser Clock and the
 * `window.setTimeout` used to schedule the "reveal" input, and re-renders
 * React whenever the underlying GameSession changes. Contains no reaction
 * game rules — those all live in ReactionTestGame.
 */
export function useReactionTestSession() {
  const session = useMemo(
    () => new GameSession(new ReactionTestGame(new PerformanceClock())),
    [],
  );
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readView = useCallback((): ReactionTestView => ({
    lifecycleState: session.lifecycleState,
    phase: session.lifecycleState === "idle" ? null : session.getGameState().phase,
    result: session.lifecycleState === "result" ? session.getResult() : null,
  }), [session]);

  const [view, setView] = useState<ReactionTestView>(readView);
  const sync = useCallback(() => setView(readView()), [readView]);

  const clearPendingReveal = useCallback(() => {
    if (revealTimeoutRef.current !== null) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearPendingReveal, [clearPendingReveal]);

  const start = useCallback(() => {
    clearPendingReveal();
    if (session.lifecycleState !== "idle") {
      session.reset(); // allow "start" to double as "try again" from result/false-start
    }
    session.ready();
    session.start();
    sync();

    const { delayMs } = session.getGameState();
    revealTimeoutRef.current = setTimeout(() => {
      revealTimeoutRef.current = null;
      session.submitInput({ type: "reveal" });
      sync();
    }, delayMs);
  }, [session, sync, clearPendingReveal]);

  const click = useCallback(() => {
    if (session.lifecycleState !== "playing") {
      return;
    }
    clearPendingReveal();
    session.submitInput({ type: "click" });
    // TS treats the getter as immutable across the call above and would
    // otherwise narrow this read to the pre-submitInput() literal type.
    const lifecycleStateAfterInput = session.lifecycleState as GameLifecycleState;
    if (lifecycleStateAfterInput === "finished") {
      session.computeResult();
    }
    sync();
  }, [session, sync, clearPendingReveal]);

  const reset = useCallback(() => {
    clearPendingReveal();
    if (session.lifecycleState !== "idle") {
      session.reset();
    }
    sync();
  }, [session, sync, clearPendingReveal]);

  return { ...view, start, click, reset };
}
