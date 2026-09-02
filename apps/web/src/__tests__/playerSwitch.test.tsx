import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { createPlayer, createStickyNote, listStickyNotes, updateStickyNote } from "../api/client";

vi.mock("../api/client", () => ({
  listNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listStickyNotes: vi.fn(),
  createStickyNote: vi.fn(),
  updateStickyNote: vi.fn(),
  deleteStickyNote: vi.fn(),
  createPlayer: vi.fn(),
  getRanking: vi.fn().mockResolvedValue({
    game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
    entries: [],
    pagination: { limit: 10, offset: 0, total: 0 },
  }),
}));

const mockedCreatePlayer = vi.mocked(createPlayer);
const mockedListStickyNotes = vi.mocked(listStickyNotes);
const mockedCreateStickyNote = vi.mocked(createStickyNote);
const mockedUpdateStickyNote = vi.mocked(updateStickyNote);

/** A tiny fake server: real player-scoped storage, keyed exactly like the real backend. */
function installFakeStickyNoteServer() {
  const notesByPlayer = new Map<string, Awaited<ReturnType<typeof createStickyNote>>[]>();
  let noteSeq = 0;
  const nicknameToPlayerId: Record<string, string> = { Alice: "player-A", Bob: "player-B" };

  mockedCreatePlayer.mockImplementation(async (nickname: string) => ({
    id: nicknameToPlayerId[nickname] ?? `player-${nickname}`,
    nickname,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }));

  mockedListStickyNotes.mockImplementation(async (playerId: string) => notesByPlayer.get(playerId) ?? []);

  mockedCreateStickyNote.mockImplementation(async (input) => {
    const note = {
      id: `s${++noteSeq}`,
      playerId: input.playerId,
      content: input.content ?? "",
      color: input.color ?? ("yellow" as const),
      pinned: false,
      locked: false,
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width ?? 200,
      height: input.height ?? 160,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    notesByPlayer.set(input.playerId, [...(notesByPlayer.get(input.playerId) ?? []), note]);
    return note;
  });

  mockedUpdateStickyNote.mockImplementation(async (id, playerId, patch) => {
    const list = notesByPlayer.get(playerId) ?? [];
    const index = list.findIndex((n) => n.id === id);
    const updated = { ...list[index], ...patch, updatedAt: "2026-01-02T00:00:00Z" };
    list[index] = updated;
    notesByPlayer.set(playerId, [...list]);
    return updated;
  });
}

async function loginAs(nickname: string) {
  const nicknameInput = screen.queryByLabelText("Nickname") ?? (await screen.findByLabelText("Nickname"));
  fireEvent.change(nicknameInput, { target: { value: nickname } });
  fireEvent.click(screen.getByRole("button", { name: /^Start$|Starting…/ }));
  await waitFor(() => expect(screen.queryByLabelText("Nickname")).toBeNull());
}

async function createStickyNoteWithContent(content: string) {
  fireEvent.click(await screen.findByRole("button", { name: "+ 새 스티커" }));
  const textarea = (await screen.findAllByLabelText("스티커 메모 내용")).slice(-1)[0];
  fireEvent.change(textarea, { target: { value: content } });
  fireEvent.blur(textarea);
  await waitFor(() => expect(mockedUpdateStickyNote).toHaveBeenCalled());
}

function switchPlayer() {
  fireEvent.click(screen.getByRole("button", { name: "도구" }));
  fireEvent.click(screen.getByRole("button", { name: "플레이어 전환" }));
  fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));
}

beforeEach(() => {
  localStorage.clear();
  mockedCreatePlayer.mockReset();
  mockedListStickyNotes.mockReset();
  mockedCreateStickyNote.mockReset();
  mockedUpdateStickyNote.mockReset();
  installFakeStickyNoteServer();
});

describe("player switching keeps Sticky Notes correctly isolated per returning player (Test 3)", () => {
  it("Alice's notes reappear after switching away and back, and never leak into Bob's view", async () => {
    render(<App />);

    // Alice logs in and creates a note.
    fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));
    await loginAs("Alice");
    await createStickyNoteWithContent("Alice Note");
    expect(screen.getByDisplayValue("Alice Note")).toBeTruthy();

    // Switch to Bob — a brand-new nickname to this browser.
    switchPlayer();
    await loginAs("Bob");
    expect(screen.queryByDisplayValue("Alice Note")).toBeNull();
    await createStickyNoteWithContent("Bob Note");
    expect(screen.getByDisplayValue("Bob Note")).toBeTruthy();
    expect(screen.queryByDisplayValue("Alice Note")).toBeNull();

    // Switch back to Alice — her existing note must reappear, and Bob's must not be visible.
    switchPlayer();
    await loginAs("Alice");
    expect(await screen.findByDisplayValue("Alice Note")).toBeTruthy();
    expect(screen.queryByDisplayValue("Bob Note")).toBeNull();

    // Switch back to Bob — his note is still exactly his own.
    switchPlayer();
    await loginAs("Bob");
    expect(await screen.findByDisplayValue("Bob Note")).toBeTruthy();
    expect(screen.queryByDisplayValue("Alice Note")).toBeNull();

    // Exactly one Player row was ever created per nickname — no duplicate
    // identities were minted by switching back and forth.
    expect(mockedCreatePlayer).toHaveBeenCalledTimes(2);
  });
});
