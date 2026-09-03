import { MINESWEEPER_DIFFICULTIES, type MinesweeperDifficulty } from "@mini-game-hub/game-core";
import { Leaderboard } from "../reaction-test/Leaderboard";
import { useMinesweeperSession } from "./useMinesweeperSession";

const DIFFICULTY_OPTIONS: { id: MinesweeperDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

const NUMBER_COLORS: Record<number, string> = {
  1: "text-blue-600",
  2: "text-emerald-700",
  3: "text-rose-600",
  4: "text-violet-700",
  5: "text-amber-700",
  6: "text-cyan-700",
  7: "text-neutral-900",
  8: "text-neutral-500",
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

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
 * A compact, DOM-grid-rendered Minesweeper. Follows the same
 * platform-boundary split as the other games: this component owns only
 * rendering/DOM events; every rule (mine placement, cascade, flags, Clear/
 * Game Over, the clear-time score) lives in MinesweeperGame (game-core)
 * via useMinesweeperSession.
 */
export function MinesweeperView({
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
    difficulty,
    elapsedMs,
    setDifficulty,
    start,
    reveal,
    toggleFlag,
  } = useMinesweeperSession(playerId);

  const gameId = `minesweeper-${difficulty}`;

  if (lifecycleState === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
        <div className="flex w-full justify-start">
          <HomeLink onHome={onHome} />
        </div>
        <p className="text-sm text-neutral-500">Clear the board as fast as you can. First click is always safe.</p>
        <div className="flex gap-1.5 rounded-md border border-neutral-200 p-1">
          {DIFFICULTY_OPTIONS.map((opt) => {
            const cfg = MINESWEEPER_DIFFICULTIES[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDifficulty(opt.id)}
                aria-current={difficulty === opt.id ? "true" : undefined}
                title={`${cfg.width}x${cfg.height}, ${cfg.mines} mines`}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  difficulty === opt.id
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
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
    const cleared = result.completion.reason === "completed";
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <p className="text-xs text-neutral-400">{nickname}</p>
        <p className="text-sm font-semibold text-neutral-800">{cleared ? "CLEAR!" : "GAME OVER"}</p>
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          {DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.label}
          {cleared ? " · Time" : ""}
        </p>
        <p className="text-2xl font-semibold text-neutral-900">
          {cleared ? formatElapsed(result.metadata.elapsedMs ?? 0) : "💣"}
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
            <p className="mb-1 text-xs text-neutral-400">Today&apos;s Best ({DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.label})</p>
            <Leaderboard gameId={gameId} playerId={playerId} refreshKey={persistedResult.id} limit={1} />
          </div>
        )}
      </div>
    );
  }

  // "playing" — the active board.
  if (!gameState) {
    return null;
  }
  const remainingMines = gameState.mineCount - gameState.flagCount;

  return (
    <div className="flex h-full flex-col gap-1.5 px-2 py-2">
      <div className="flex items-center justify-between px-1">
        <HomeLink onHome={onHome} />
        <div className="flex gap-3 text-xs text-neutral-600">
          <span>
            {DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.label}
          </span>
          <span className="font-mono font-semibold text-neutral-900">{formatElapsed(elapsedMs)}</span>
          <span>
            💣 <span className="font-semibold text-neutral-900">{remainingMines}</span>
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          className="grid w-full gap-[2px] rounded-sm border border-neutral-200 bg-neutral-200 p-[2px]"
          style={{
            aspectRatio: `${gameState.width} / ${gameState.height}`,
            gridTemplateColumns: `repeat(${gameState.width}, 1fr)`,
            gridTemplateRows: `repeat(${gameState.height}, 1fr)`,
          }}
        >
          {gameState.cells.map((cell, i) => {
            const row = Math.floor(i / gameState.width);
            const col = i % gameState.width;
            const isRevealedMine = cell.state === "revealed" && cell.mine;
            const isRevealedNumber = cell.state === "revealed" && !cell.mine && cell.adjacent > 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => reveal(row, col)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleFlag(row, col);
                }}
                className={`flex items-center justify-center rounded-[2px] text-[10px] font-semibold leading-none sm:text-xs ${
                  cell.state === "revealed"
                    ? isRevealedMine
                      ? "bg-rose-100"
                      : "bg-white"
                    : "bg-neutral-50 hover:bg-neutral-100 active:bg-neutral-200"
                } ${isRevealedNumber ? NUMBER_COLORS[cell.adjacent] ?? "text-neutral-700" : ""}`}
              >
                {cell.state === "flagged" ? "🚩" : isRevealedMine ? "💣" : isRevealedNumber ? cell.adjacent : ""}
              </button>
            );
          })}
        </div>
      </div>
      <p className="px-1 text-center text-[11px] text-neutral-400">Left click to reveal · Right click to flag</p>
    </div>
  );
}
