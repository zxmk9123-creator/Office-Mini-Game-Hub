import { useState } from "react";
import { Home } from "./Home";
import { NicknameEntry } from "./player/NicknameEntry";
import { usePlayerSession } from "./player/usePlayerSession";
import { ReactionTestView } from "./games/reaction-test/ReactionTestView";

type Screen = "home" | "reaction-test";

export default function App() {
  const session = usePlayerSession();
  const [screen, setScreen] = useState<Screen>("home");

  const goHome = () => setScreen("home");

  let body: React.ReactNode;
  if (!session.playerId || !session.nickname) {
    body = <NicknameEntry session={session} />;
  } else if (screen === "reaction-test") {
    body = <ReactionTestView playerId={session.playerId} nickname={session.nickname} onHome={goHome} />;
  } else {
    body = (
      <Home
        nickname={session.nickname}
        onSelectGame={(gameId) => setScreen(gameId as Screen)}
        onSwitchPlayer={() => {
          session.clearPlayer();
          setScreen("home");
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="w-[380px] rounded-lg border border-neutral-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h1 className="text-sm font-medium text-neutral-800">Mini Games</h1>
        </header>
        <main>{body}</main>
      </div>
    </div>
  );
}
