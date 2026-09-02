import { useRef, useState } from "react";
import { NotesView } from "./notebook/NotesView";
import { MemoGate } from "./notebook/MemoGate";
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
  // A lightweight access gate in front of Memo only — independent of
  // Player identity (never reset by switching players) and independent
  // of which other tab is visited (App itself never unmounts, so this
  // survives Memo <-> Sticky Notes <-> Tools navigation); it resets only
  // on an actual page reload/new session, since it's plain component
  // state with no storage backing it.
  const [memoUnlocked, setMemoUnlocked] = useState(false);
  // The Main Board panel's real DOM node — measured live via
  // getBoundingClientRect() wherever a Sticky Note needs to avoid it,
  // never hardcoded, so it stays correct if the panel ever moves/resizes.
  const boardRef = useRef<HTMLDivElement>(null);

  const selectSection = (next: Section) => {
    setSection(next);
    if (next !== "tools") {
      setToolScreen("list");
    }
  };

  // Sticky Notes has no entry here: <StickyNotesView> below is always
  // mounted (its `active` prop only toggles its control panel's
  // visibility) precisely so switching sections never unmounts it —
  // that unmount/remount was the root cause of notes appearing to reset
  // when leaving and returning to the 스티커 메모 tab.
  let body: React.ReactNode = null;
  if (section === "notes") {
    body = memoUnlocked ? <NotesView /> : <MemoGate onUnlock={() => setMemoUnlocked(true)} />;
  } else if (section === "tools") {
    if (toolScreen === "reaction-test") {
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
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-2">
      <div
        ref={boardRef}
        className="relative z-10 flex h-[560px] max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
      >
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
        <main className="min-h-0 flex-1 overflow-y-auto">
          {body}
          <StickyNotesView active={section === "sticky-notes"} boardRef={boardRef} session={session} />
        </main>
      </div>
    </div>
  );
}
