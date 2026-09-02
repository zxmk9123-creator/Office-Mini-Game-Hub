import { useEffect, useState } from "react";
import { getRanking, type RankingDto } from "../../api/client";

const TOP_N = 5;

/**
 * Compact, read-only leaderboard panel — no per-game logic here, just
 * rendering whatever RankingDto the generic ranking API returns. `refreshKey`
 * changing (e.g. after a new result is saved) re-fetches.
 */
export function Leaderboard({
  gameId,
  playerId,
  refreshKey,
}: {
  gameId: string;
  playerId: string | null;
  refreshKey: string | number;
}) {
  const [ranking, setRanking] = useState<RankingDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRanking(gameId, { limit: TOP_N, playerId: playerId ?? undefined })
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
  }, [gameId, playerId, refreshKey]);

  if (loading) {
    return <p className="text-xs text-neutral-400">Loading leaderboard…</p>;
  }
  if (!ranking || ranking.entries.length === 0) {
    return null;
  }

  const unit = ranking.game.scoreType === "lower_is_better" ? " ms" : "";
  const playerInTop = ranking.playerRank && ranking.playerRank.rank <= TOP_N;

  return (
    <div className="w-full max-w-xs text-left">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Top {ranking.entries.length}
      </p>
      <ol className="space-y-0.5">
        {ranking.entries.map((entry) => (
          <li
            key={entry.playerId}
            className={`flex justify-between text-sm ${
              entry.playerId === playerId ? "font-semibold text-neutral-900" : "text-neutral-600"
            }`}
          >
            <span>
              {entry.rank}. {entry.nickname}
            </span>
            <span>
              {entry.score}
              {unit}
            </span>
          </li>
        ))}
      </ol>
      {ranking.playerRank && !playerInTop && (
        <p className="mt-1 border-t border-neutral-100 pt-1 text-sm font-semibold text-neutral-900">
          {ranking.playerRank.rank}. {ranking.playerRank.nickname} — {ranking.playerRank.score}
          {unit}
        </p>
      )}
    </div>
  );
}
