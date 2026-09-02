/**
 * The tool/game-selection screen. Reaction Test is the only entry today, but
 * this is a list a future tool slots into — nothing here assumes there's
 * exactly one game.
 */
const GAMES = [
  { id: "reaction-test", name: "Reaction Test", description: "How fast are you?" },
  { id: "swipe-brick-breaker", name: "Swipe Brick Breaker", description: "Drag to aim, release to fire." },
] as const;

export function ToolsList({
  nickname,
  onSelectGame,
  onSwitchPlayer,
}: {
  nickname: string | null;
  onSelectGame: (gameId: string) => void;
  onSwitchPlayer: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {nickname ? (
            <>
              현재 플레이어: <span className="font-medium text-neutral-800">{nickname}</span>
            </>
          ) : (
            "게임을 시작하려면 닉네임이 필요합니다."
          )}
        </p>
        {nickname && (
          <button
            type="button"
            onClick={onSwitchPlayer}
            className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline"
          >
            플레이어 전환
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => onSelectGame(game.id)}
            className="flex flex-col items-start rounded-md border border-neutral-200 px-3 py-3 text-left hover:border-neutral-300 hover:bg-neutral-50"
          >
            <span className="text-sm font-medium text-neutral-900">{game.name}</span>
            <span className="text-xs text-neutral-500">{game.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
