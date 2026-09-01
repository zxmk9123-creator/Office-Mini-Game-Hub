import { usePlayerId } from "../../player/usePlayerId";
import { useReactionTestSession } from "./useReactionTestSession";

function SubmissionStatusLine({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") {
    return <p className="text-xs text-neutral-400">Saving…</p>;
  }
  if (status === "saved") {
    return <p className="text-xs text-neutral-400">Saved</p>;
  }
  if (status === "error") {
    return <p className="text-xs text-amber-600">Couldn&apos;t save this result.</p>;
  }
  return null;
}

/**
 * Pure presentation: renders the current view state from
 * useReactionTestSession and forwards clicks/start/reset. It contains no
 * reaction-time rules, no false-start logic, no scoring, and no
 * persistence — all of that lives in ReactionTestGame (rules) and the
 * server's GameResultService (persistence) respectively.
 */
export function ReactionTestView() {
  const playerId = usePlayerId();
  const { lifecycleState, phase, result, submissionStatus, starting, start, click, reset } =
    useReactionTestSession(playerId);

  if (!playerId || lifecycleState === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
        <p className="text-sm text-neutral-500">
          Click the target the moment it appears.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={!playerId || starting}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start
        </button>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div
        onClick={click}
        className="flex h-48 cursor-pointer select-none flex-col items-center justify-center gap-2 bg-neutral-50 text-center"
      >
        <p className="text-xs uppercase tracking-wide text-neutral-400">Wait for it</p>
        <p className="text-sm text-neutral-500">Don&apos;t click yet</p>
      </div>
    );
  }

  if (phase === "target") {
    return (
      <div
        onClick={click}
        className="flex h-48 cursor-pointer select-none flex-col items-center justify-center gap-2 bg-emerald-50 text-center"
      >
        <div className="h-16 w-16 rounded-full bg-emerald-500" />
        <p className="text-sm font-medium text-emerald-700">Click!</p>
      </div>
    );
  }

  if (lifecycleState === "result" && result) {
    if (result.completion.reason === "invalid") {
      return (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <p className="text-sm font-medium text-amber-600">Too early!</p>
          <p className="text-xs text-neutral-500">Wait for the target next time.</p>
          <SubmissionStatusLine status={submissionStatus} />
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="text-2xl font-semibold text-neutral-900">
          {result.metadata.reactionTimeMs} ms
        </p>
        <SubmissionStatusLine status={submissionStatus} />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  return null;
}
