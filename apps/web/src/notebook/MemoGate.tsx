import { useRef, useState } from "react";

/**
 * The fixed correct answer for the Memo access gate. This is a lightweight
 * UX access gate ("you must know the phrase to enter"), NOT
 * authentication or a security boundary — Memo's actual authorization
 * (who may edit/delete a given post) is still the existing `playerId`
 * ownership model, completely untouched by this gate. Since this isn't
 * protecting anything sensitive, keeping the answer as a plain client-side
 * constant is an intentional, documented trade-off (per product spec)
 * rather than an oversight: anyone can already read it out of the shipped
 * bundle, and that's fine for what this gate is for.
 */
const MEMO_GATE_ANSWER = "강박여";

/**
 * A one-time-per-browser-session gate in front of the Memo area. Owns no
 * Memo/Player logic itself — `unlocked` state lives in the parent (App),
 * so it naturally persists across switching to Sticky Notes/Tools and
 * back (App never unmounts), and just as naturally resets on a page
 * reload, matching the "current browser session only" requirement without
 * needing sessionStorage or any new state mechanism.
 */
export function MemoGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value === MEMO_GATE_ANSWER) {
      onUnlock();
      return;
    }
    setError("입력한 내용이 올바르지 않습니다.");
  };

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
      <div>
        <p className="text-sm font-medium text-neutral-800">사명을 입력하시오.</p>
      </div>
      <form onSubmit={handleSubmit} autoComplete="off" className="flex w-full max-w-[220px] flex-col gap-2">
        <label htmlFor="memo-gate-phrase" className="sr-only">
          사명을 입력하시오.
        </label>
        <input
          ref={inputRef}
          id="memo-gate-phrase"
          // Deliberately not `name="memo-gate-answer"` (the name used
          // before this fix): Chrome's plain-text-field autofill history
          // is keyed by name, so keeping the old name could still surface
          // previously-typed answers from before autoComplete="off" was
          // added, even though it's on the field now. A fresh name has no
          // history to draw from.
          name="memo-gate-phrase"
          type="text"
          // Prevents Chrome (and other browsers) from offering previously
          // typed values for this field via its autofill-suggestions
          // dropdown. Not a semantic autocomplete token (e.g. "username")
          // since this is an access phrase, not a profile field — "off"
          // is the correct, least-surprising value here.
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "memo-gate-error" : undefined}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        {error && (
          <p id="memo-gate-error" role="alert" className="text-xs text-amber-600">
            ⚠ {error}
          </p>
        )}
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          확인
        </button>
      </form>
    </div>
  );
}
