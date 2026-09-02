/**
 * The game-selection screen. Reaction Test is the only entry today, but
 * this is a list a future game slots into — nothing here assumes there's
 * exactly one game.
 */
const GAMES = [{ id: "reaction-test", name: "Reaction Test", description: "How fast are you?" }] as const;

export function Home({
  nickname,
  onSelectGame,
  onSwitchPlayer,
}: {
  nickname: string | null;
  onSelectGame: (gameId: string) => void;
  onSwitchPlayer: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Playing as <span className="font-medium text-neutral-800">{nickname}</span>
        </p>
        <button
          type="button"
          onClick={onSwitchPlayer}
          className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline"
        >
          Switch player
        </button>
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
