import { useRef, useState } from "react";
import type { PlayerSession } from "./usePlayerSession";

/**
 * The one screen a Player must pass through before anything else. Owns no
 * identity logic itself — `usePlayerSession` decides what counts as valid
 * and talks to the API; this component is just the form around it.
 */
export function NicknameEntry({ session }: { session: PlayerSession }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    session.setNickname(value);
  };

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
      <div>
        <p className="text-sm font-medium text-neutral-800">Welcome</p>
        <p className="mt-1 text-xs text-neutral-500">Enter a nickname to start playing.</p>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full max-w-[220px] flex-col gap-2">
        <label htmlFor="nickname" className="sr-only">
          Nickname
        </label>
        <input
          ref={inputRef}
          id="nickname"
          name="nickname"
          type="text"
          autoFocus
          maxLength={20}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={session.submitting}
          placeholder="Your nickname"
          aria-invalid={session.error ? true : undefined}
          aria-describedby={session.error ? "nickname-error" : undefined}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:bg-neutral-50"
        />
        {session.error && (
          <p id="nickname-error" role="alert" className="text-xs text-amber-600">
            ⚠ {session.error}
          </p>
        )}
        <button
          type="submit"
          disabled={session.submitting || !value.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {session.submitting ? "Starting…" : "Start"}
        </button>
      </form>
    </div>
  );
}
