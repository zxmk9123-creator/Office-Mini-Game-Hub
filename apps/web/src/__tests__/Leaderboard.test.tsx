import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Leaderboard, DEFAULT_LEADERBOARD_LIMIT } from "../games/reaction-test/Leaderboard";
import { getRanking } from "../api/client";

vi.mock("../api/client", () => ({
  getRanking: vi.fn(),
}));

const mockedGetRanking = vi.mocked(getRanking);

beforeEach(() => {
  mockedGetRanking.mockReset();
});

describe("Leaderboard", () => {
  it("defaults to requesting the Top 10", async () => {
    mockedGetRanking.mockResolvedValue({
      game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
      entries: [],
      pagination: { limit: 10, offset: 0, total: 0 },
    });

    render(<Leaderboard gameId="reaction-test" playerId={null} refreshKey={1} />);

    await waitFor(() => expect(mockedGetRanking).toHaveBeenCalled());
    expect(DEFAULT_LEADERBOARD_LIMIT).toBe(10);
    expect(mockedGetRanking).toHaveBeenCalledWith("reaction-test", { limit: 10, playerId: undefined });
  });

  it("shows a clean empty state when there is no ranking data", async () => {
    mockedGetRanking.mockResolvedValue({
      game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
      entries: [],
      pagination: { limit: 10, offset: 0, total: 0 },
    });

    render(<Leaderboard gameId="reaction-test" playerId={null} refreshKey={1} />);

    expect(await screen.findByText(/no ranked results yet/i)).toBeTruthy();
  });

  it("highlights the current player's row", async () => {
    mockedGetRanking.mockResolvedValue({
      game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
      entries: [
        { rank: 1, playerId: "p1", nickname: "Alice", score: 200, metadata: {}, completedAt: "" },
        { rank: 2, playerId: "p2", nickname: "Bob", score: 250, metadata: {}, completedAt: "" },
      ],
      pagination: { limit: 10, offset: 0, total: 2 },
      playerRank: { rank: 2, playerId: "p2", nickname: "Bob", score: 250, metadata: {}, completedAt: "" },
    });

    render(<Leaderboard gameId="reaction-test" playerId="p2" refreshKey={1} />);

    const bobRow = await screen.findByText(/Bob/);
    expect(bobRow.closest("li")?.getAttribute("aria-current")).toBe("true");
    expect(bobRow.closest("li")?.textContent).toMatch(/\(you\)/);

    const aliceRow = screen.getByText(/Alice/);
    expect(aliceRow.closest("li")?.getAttribute("aria-current")).toBeNull();
  });

  it("shows the current player's own result separately when outside the Top N", async () => {
    mockedGetRanking.mockResolvedValue({
      game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
      entries: [{ rank: 1, playerId: "p1", nickname: "Alice", score: 200, metadata: {}, completedAt: "" }],
      pagination: { limit: 10, offset: 0, total: 15 },
      playerRank: { rank: 27, playerId: "me", nickname: "Sanghyun", score: 900, metadata: {}, completedAt: "" },
    });

    render(<Leaderboard gameId="reaction-test" playerId="me" refreshKey={1} />);

    const ownRow = await screen.findByText(/27\. Sanghyun/);
    expect(ownRow.textContent).toMatch(/\(you\)/);
    // Not duplicated into the visible Top N list (only Alice is in `entries`).
    expect(screen.queryAllByText(/Sanghyun/)).toHaveLength(1);
  });

  it("does not show a separate own-result line when the player is already in the Top N", async () => {
    mockedGetRanking.mockResolvedValue({
      game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
      entries: [{ rank: 1, playerId: "p1", nickname: "Alice", score: 200, metadata: {}, completedAt: "" }],
      pagination: { limit: 10, offset: 0, total: 1 },
      playerRank: { rank: 1, playerId: "p1", nickname: "Alice", score: 200, metadata: {}, completedAt: "" },
    });

    render(<Leaderboard gameId="reaction-test" playerId="p1" refreshKey={1} />);

    await screen.findByText(/Alice/);
    expect(screen.getAllByText(/Alice/)).toHaveLength(1);
  });
});
