import { useState } from "react";
import { NotesView } from "./notebook/NotesView";
import { StickyNotesView } from "./notebook/StickyNotesView";
import { ToolsList } from "./tools/ToolsList";
import { NicknameEntry } from "./player/NicknameEntry";
import { usePlayerSession } from "./player/usePlayerSession";
import { ReactionTestView } from "./games/reaction-test/ReactionTestView";

type Section = "notes" | "sticky-notes" | "tools";
type ToolScreen = "list" | "reaction-test";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "notes", label: "메모" },
  { id: "sticky-notes", label: "스티커 메모" },
  { id: "tools", label: "도구" },
];

export default function App() {
  const session = usePlayerSession();
  const [section, setSection] = useState<Section>("notes");
  const [toolScreen, setToolScreen] = useState<ToolScreen>("list");

  const selectSection = (next: Section) => {
    setSection(next);
    if (next !== "tools") {
      setToolScreen("list");
    }
  };

  let body: React.ReactNode;
  if (section === "notes") {
    body = <NotesView />;
  } else if (section === "sticky-notes") {
    body = <StickyNotesView />;
  } else if (toolScreen === "reaction-test") {
    if (!session.playerId || !session.nickname) {
      body = <NicknameEntry session={session} />;
    } else {
      body = (
        <ReactionTestView
          playerId={session.playerId}
          nickname={session.nickname}
          onHome={() => setToolScreen("list")}
        />
      );
    }
  } else {
    body = (
      <ToolsList
        nickname={session.nickname}
        onSelectGame={() => setToolScreen("reaction-test")}
        onSwitchPlayer={() => session.clearPlayer()}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-2">
      <div className="relative z-10 flex h-[560px] max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <header className="flex items-center border-b border-neutral-200 px-3 py-2">
          <h1 className="text-sm font-semibold text-neutral-800">메모장</h1>
        </header>
        <nav className="flex border-b border-neutral-200 text-sm" aria-label="주요 메뉴">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSection(s.id)}
              aria-current={section === s.id ? "true" : undefined}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                section === s.id
                  ? "border-b-2 border-neutral-900 text-neutral-900"
                  : "border-b-2 border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto">{body}</main>
      </div>
    </div>
  );
}
