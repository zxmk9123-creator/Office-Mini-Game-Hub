import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { listNotes, listStickyNotes } from "../api/client";

vi.mock("../api/client", () => ({
  listNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listStickyNotes: vi.fn().mockResolvedValue([]),
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

beforeEach(() => {
  localStorage.clear();
  vi.mocked(listNotes).mockClear();
  vi.mocked(listStickyNotes).mockClear();
});

describe("App navigation", () => {
  it("shows 메모 as the default active tab, gated until the access phrase is entered", async () => {
    render(<App />);
    expect((await screen.findAllByText("사명을 입력하시오.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "메모" }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByText(/아직 메모가 없습니다/)).toBeNull();

    fireEvent.change(screen.getByLabelText("사명을 입력하시오."), { target: { value: "강박여" } });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(await screen.findByText(/아직 메모가 없습니다/)).toBeTruthy();
  });

  it("navigates to 스티커 메모 and prompts for a nickname when no player exists yet", async () => {
    render(<App />);
    await screen.findAllByText("사명을 입력하시오.");
    fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));

    // Sticky Notes are now scoped to a playerId, so it reuses the same
    // nickname gate Reaction Test already uses.
    expect(await screen.findByPlaceholderText("Your nickname")).toBeTruthy();
  });

  it("navigates to 스티커 메모 and shows the empty state once a player exists", async () => {
    localStorage.setItem("mini-game-hub:playerId", "p1");
    localStorage.setItem("mini-game-hub:nickname", "Sanghyun");

    render(<App />);
    await screen.findAllByText("사명을 입력하시오.");
    fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));

    expect(await screen.findByText(/아직 스티커 메모가 없습니다/)).toBeTruthy();
  });

  it("navigates to 도구 and shows Reaction Test as an available tool", async () => {
    render(<App />);
    await screen.findAllByText("사명을 입력하시오.");
    fireEvent.click(screen.getByRole("button", { name: "도구" }));

    expect(await screen.findByText("Reaction Test")).toBeTruthy();
  });

  it("does not prompt for a nickname on the default 메모 view, only once Reaction Test or Sticky Notes is entered", async () => {
    render(<App />);
    await screen.findAllByText("사명을 입력하시오.");
    expect(screen.queryByPlaceholderText("Your nickname")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    fireEvent.click(await screen.findByText("Reaction Test"));

    expect(await screen.findByPlaceholderText("Your nickname")).toBeTruthy();
  });

  it("the existing Reaction Test flow still works once a nickname is set", async () => {
    localStorage.setItem("mini-game-hub:playerId", "p1");
    localStorage.setItem("mini-game-hub:nickname", "Sanghyun");

    render(<App />);
    await screen.findAllByText("사명을 입력하시오.");
    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    fireEvent.click(await screen.findByText("Reaction Test"));

    expect(await screen.findByText("Click the target the moment it appears.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("a sticky note survives switching to Notes/Tools and back to Sticky Notes (no reset, no refetch)", async () => {
    localStorage.setItem("mini-game-hub:playerId", "p1");
    localStorage.setItem("mini-game-hub:nickname", "Sanghyun");
    vi.mocked(listStickyNotes).mockResolvedValue([
      {
        id: "s1",
        playerId: "p1",
        content: "keep me",
        color: "yellow",
        pinned: false,
        locked: false,
        x: 100,
        y: 60,
        width: 200,
        height: 160,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    render(<App />);
    await screen.findAllByText("사명을 입력하시오.");

    fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));
    expect(await screen.findByTestId("sticky-note-s1")).toBeTruthy();
    expect(vi.mocked(listStickyNotes)).toHaveBeenCalledTimes(1);

    // Switch away to Notes, then Tools, then back — the sticky note must
    // still be present the whole time, never removed or refetched.
    fireEvent.click(screen.getByRole("button", { name: "메모" }));
    expect(screen.getByTestId("sticky-note-s1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    expect(screen.getByTestId("sticky-note-s1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));
    expect(screen.getByTestId("sticky-note-s1")).toBeTruthy();
    expect((screen.getByLabelText("스티커 메모 내용") as HTMLTextAreaElement).value).toBe("keep me");
    expect(vi.mocked(listStickyNotes)).toHaveBeenCalledTimes(1);
  });

  describe("Memo access gate", () => {
    async function unlockMemo() {
      await screen.findAllByText("사명을 입력하시오.");
      fireEvent.change(screen.getByLabelText("사명을 입력하시오."), { target: { value: "강박여" } });
      fireEvent.click(screen.getByRole("button", { name: "확인" }));
      await screen.findByText(/아직 메모가 없습니다/);
    }

    it("Test 5 — stays unlocked across Memo <-> Sticky Notes <-> Tools navigation in the same session", async () => {
      render(<App />);
      await unlockMemo();

      fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));
      fireEvent.click(screen.getByRole("button", { name: "도구" }));
      fireEvent.click(screen.getByRole("button", { name: "메모" }));

      // No gate this time — straight back to the notebook.
      expect(await screen.findByText(/아직 메모가 없습니다/)).toBeTruthy();
      expect(screen.queryByText("사명을 입력하시오.")).toBeNull();
    });

    it("Test 6 — stays unlocked across the 플레이어 전환 (switch player) action itself", async () => {
      localStorage.setItem("mini-game-hub:playerId", "p1");
      localStorage.setItem("mini-game-hub:nickname", "Sanghyun");
      render(<App />);
      await unlockMemo();

      // 플레이어 전환 clears the current Player identity (session.clearPlayer())
      // without touching anything Memo-related — Memo's unlocked state must
      // not be coupled to playerId at all.
      fireEvent.click(screen.getByRole("button", { name: "도구" }));
      fireEvent.click(screen.getByRole("button", { name: "플레이어 전환" }));
      fireEvent.click(screen.getByRole("button", { name: "메모" }));

      expect(await screen.findByText(/아직 메모가 없습니다/)).toBeTruthy();
      expect(screen.queryByText("사명을 입력하시오.")).toBeNull();
    });

    it("Test 7 — the gate reappears on a fresh App instance (a reload/new session)", async () => {
      const { unmount } = render(<App />);
      await unlockMemo();
      unmount();

      render(<App />);
      expect(await screen.findAllByText("사명을 입력하시오.")).toBeTruthy();
    });
  });
});
