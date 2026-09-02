import { useEffect, useState } from "react";
import { getRanking, type RankingDto } from "../../api/client";

export const DEFAULT_LEADERBOARD_LIMIT = 10;

/**
 * Compact, read-only leaderboard panel — no per-game logic here, just
 * rendering whatever RankingDto the generic ranking API returns. `refreshKey`
 * changing (e.g. after a new result is saved) re-fetches. `limit` defaults
 * to the product's Top 10, overridable mainly for tests.
 */
export function Leaderboard({
  gameId,
  playerId,
  refreshKey,
  limit = DEFAULT_LEADERBOARD_LIMIT,
}: {
  gameId: string;
  playerId: string | null;
  refreshKey: string | number;
  limit?: number;
}) {
  const [ranking, setRanking] = useState<RankingDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRanking(gameId, { limit, playerId: playerId ?? undefined })
      .then((result) => {
        if (!cancelled) {
          setRanking(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRanking(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, playerId, refreshKey, limit]);

  if (loading) {
    return <p className="text-xs text-neutral-400">Loading leaderboard…</p>;
  }
  if (!ranking || ranking.entries.length === 0) {
    return (
      <div className="w-full max-w-xs text-left">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Top {limit}
        </p>
        <p className="text-sm text-neutral-500">No ranked results yet — be the first!</p>
      </div>
    );
  }

  const unit = ranking.game.scoreType === "lower_is_better" ? " ms" : "";
  const playerInTop = ranking.playerRank && ranking.playerRank.rank <= limit;

  return (
    <div className="w-full max-w-xs text-left">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Top {ranking.entries.length}
      </p>
      <ol className="space-y-0.5">
        {ranking.entries.map((entry) => {
          const isCurrentPlayer = entry.playerId === playerId;
          return (
            <li
              key={entry.playerId}
              aria-current={isCurrentPlayer ? "true" : undefined}
              className={`flex justify-between rounded px-1 text-sm ${
                isCurrentPlayer ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-600"
              }`}
            >
              <span>
                {entry.rank}. {entry.nickname}
                {isCurrentPlayer && <span className="ml-1 text-xs font-normal text-neutral-500">(you)</span>}
              </span>
              <span>
                {entry.score}
                {unit}
              </span>
            </li>
          );
        })}
      </ol>
      {ranking.playerRank && !playerInTop && (
        <p className="mt-1 flex justify-between rounded bg-neutral-100 px-1 pt-1 text-sm font-semibold text-neutral-900">
          <span>
            {ranking.playerRank.rank}. {ranking.playerRank.nickname}
            <span className="ml-1 text-xs font-normal text-neutral-500">(you)</span>
          </span>
          <span>
            {ranking.playerRank.score}
            {unit}
          </span>
        </p>
      )}
    </div>
  );
}
