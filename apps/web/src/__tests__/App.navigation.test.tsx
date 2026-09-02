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
  it("shows the notebook (메모) as the default view", async () => {
    render(<App />);
    expect(await screen.findByText(/아직 메모가 없습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "메모" }).getAttribute("aria-current")).toBe("true");
  });

  it("navigates to 스티커 메모", async () => {
    render(<App />);
    await screen.findByText(/아직 메모가 없습니다/);
    fireEvent.click(screen.getByRole("button", { name: "스티커 메모" }));

    expect(await screen.findByText(/아직 스티커 메모가 없습니다/)).toBeTruthy();
  });

  it("navigates to 도구 and shows Reaction Test as an available tool", async () => {
    render(<App />);
    await screen.findByText(/아직 메모가 없습니다/);
    fireEvent.click(screen.getByRole("button", { name: "도구" }));

    expect(await screen.findByText("Reaction Test")).toBeTruthy();
  });

  it("prompts for a nickname only when entering Reaction Test, not for Notes/Sticky Notes", async () => {
    render(<App />);
    await screen.findByText(/아직 메모가 없습니다/);
    expect(screen.queryByPlaceholderText("Your nickname")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    fireEvent.click(await screen.findByText("Reaction Test"));

    expect(await screen.findByPlaceholderText("Your nickname")).toBeTruthy();
  });

  it("the existing Reaction Test flow still works once a nickname is set", async () => {
    localStorage.setItem("mini-game-hub:playerId", "p1");
    localStorage.setItem("mini-game-hub:nickname", "Sanghyun");

    render(<App />);
    await screen.findByText(/아직 메모가 없습니다/);
    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    fireEvent.click(await screen.findByText("Reaction Test"));

    expect(await screen.findByText("Click the target the moment it appears.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });
});
