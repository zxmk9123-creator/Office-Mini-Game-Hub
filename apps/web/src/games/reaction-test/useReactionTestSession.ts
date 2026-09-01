import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GameSession,
  ReactionTestGame,
  type GameLifecycleState,
  type GameResult,
  type ReactionPhase,
  type ReactionTestResultMetadata,
} from "@mini-game-hub/game-core";
import { createGameSession, submitGameResult, type GameResultDto } from "../../api/client";
import { PerformanceClock } from "./performanceClock";

const GAME_ID = "reaction-test";

export type SubmissionStatus = "idle" | "saving" | "saved" | "error";

export interface ReactionTestView {
  lifecycleState: GameLifecycleState;
  /** null only while lifecycleState is "idle", before the first round starts. */
  phase: ReactionPhase | null;
  result: GameResult<ReactionTestResultMetadata> | null;
  submissionStatus: SubmissionStatus;
  persistedResult: GameResultDto | null;
}

/**
 * The application-boundary adapter: owns the browser Clock, the
 * `window.setTimeout` used to schedule the "reveal" input, and the HTTP
 * calls that create a GameSession before play and submit the resulting
 * GameResult afterward. Re-renders React whenever the underlying
 * GameSession or the submission changes. Contains no reaction game rules
 * (those live in ReactionTestGame) and no persistence rules (those live in
 * the server's GameResultService) — this hook only wires the two together.
 */
export function useReactionTestSession(playerId: string | null) {
  const session = useMemo(
    () => new GameSession(new ReactionTestGame(new PerformanceClock())),
    [],
  );
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const readView = useCallback(
    (submissionStatus: SubmissionStatus, persistedResult: GameResultDto | null): ReactionTestView => ({
      lifecycleState: session.lifecycleState,
      phase: session.lifecycleState === "idle" ? null : session.getGameState().phase,
      result: session.lifecycleState === "result" ? session.getResult() : null,
      submissionStatus,
      persistedResult,
    }),
    [session],
  );

  const [view, setView] = useState<ReactionTestView>(() => readView("idle", null));
  const sync = useCallback(
    (submissionStatus: SubmissionStatus = view.submissionStatus, persistedResult = view.persistedResult) =>
      setView(readView(submissionStatus, persistedResult)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readView],
  );

  const clearPendingReveal = useCallback(() => {
    if (revealTimeoutRef.current !== null) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearPendingReveal, [clearPendingReveal]);

  const start = useCallback(async () => {
    if (!playerId) {
      return;
    }
    clearPendingReveal();
    if (session.lifecycleState !== "idle") {
      session.reset(); // allow "start" to double as "try again" from result/false-start
    }
    sessionIdRef.current = null;
    setView(readView("idle", null));

    // 1. Create GameSession — before any local play begins.
    const apiSession = await createGameSession(GAME_ID, playerId);
    sessionIdRef.current = apiSession.id;

    // 2. Play Reaction Test.
    session.ready();
    session.start();
    sync();

    const { delayMs } = session.getGameState();
    revealTimeoutRef.current = setTimeout(() => {
      revealTimeoutRef.current = null;
      session.submitInput({ type: "reveal" });
      sync();
    }, delayMs);
  }, [session, sync, clearPendingReveal, playerId, readView]);

  const click = useCallback(async () => {
    if (session.lifecycleState !== "playing") {
      return;
    }
    clearPendingReveal();
    session.submitInput({ type: "click" });
    // TS treats the getter as immutable across the call above and would
    // otherwise narrow this read to the pre-submitInput() literal type.
    const lifecycleStateAfterInput = session.lifecycleState as GameLifecycleState;
    if (lifecycleStateAfterInput !== "finished") {
      sync();
      return;
    }

    // 3. Generate GameResult.
    const localResult = session.computeResult();
    sync("saving", null);

    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      sync("error", null);
      return;
    }

    try {
      // 4. Submit result -> 5. server validates -> 6. persist.
      const persisted = await submitGameResult(GAME_ID, {
        sessionId,
        score: localResult.score,
        completion: localResult.completion,
        metadata: localResult.metadata,
      });
      // 7. Return persisted result -> displayed by ReactionTestView.
      sync("saved", persisted);
    } catch {
      sync("error", null);
    }
  }, [session, sync, clearPendingReveal]);

  const reset = useCallback(() => {
    clearPendingReveal();
    if (session.lifecycleState !== "idle") {
      session.reset();
    }
    sessionIdRef.current = null;
    setView(readView("idle", null));
  }, [session, clearPendingReveal, readView]);

  return { ...view, start, click, reset };
}
