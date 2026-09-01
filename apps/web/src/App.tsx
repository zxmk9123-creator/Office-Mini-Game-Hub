import { ReactionTestView } from "./games/reaction-test/ReactionTestView";

export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="w-[380px] rounded-lg border border-neutral-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h1 className="text-sm font-medium text-neutral-800">Reaction Test</h1>
        </header>
        <main>
          <ReactionTestView />
        </main>
      </div>
    </div>
  );
}
