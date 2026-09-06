import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MinesweeperView } from "../games/minesweeper/MinesweeperView";
import * as sessionModule from "../games/minesweeper/useMinesweeperSession";

vi.mock("../games/minesweeper/useMinesweeperSession");
vi.mock("../api/client", () => ({
  getRanking: vi.fn().mockResolvedValue({
    game: { id: "minesweeper-easy", name: "Minesweeper (Easy)", scoreType: "lower_is_better" },
    entries: [{ rank: 1, playerId: "p1", nickname: "Alice", score: 65000, metadata: {}, completedAt: "" }],
    pagination: { limit: 10, offset: 0, total: 1 },
  }),
}));

const useMinesweeperSession = vi.mocked(sessionModule.useMinesweeperSession);

function baseView(overrides: Partial<ReturnType<typeof sessionModule.useMinesweeperSession>> = {}) {
  return {
    lifecycleState: "idle" as const,
    gameState: null,
    result: null,
    submissionStatus: "idle" as const,
    persistedResult: null,
    starting: false,
    difficulty: "easy" as const,
    elapsedMs: 0,
    setDifficulty: vi.fn(),
    start: vi.fn(),
    reveal: vi.fn(),
    toggleFlag: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("MinesweeperView: ranking is visible after Game Over, not just after Clear", () => {
  it("shows the Top 10 leaderboard on the GAME OVER screen, alongside Restart/Home — not just a dead end", async () => {
    useMinesweeperSession.mockReturnValue(
      baseView({
        lifecycleState: "result",
        result: {
          gameId: "minesweeper-easy",
          scoreType: "lower_is_better",
          score: null,
          completion: { reason: "invalid", completedAt: 0 },
          metadata: {
            difficulty: "easy",
            width: 10,
            height: 6,
            mineCount: 12,
            elapsedMs: 4000,
            revealedSafeCount: 3,
            flagCount: 0,
            remainingMines: 12,
          },
        },
        submissionStatus: "saved",
        persistedResult: {
          id: "result-1",
          sessionId: "session-1",
          playerId: "player-1",
          gameId: "minesweeper-easy",
          score: null,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      }),
    );

    render(<MinesweeperView playerId="player-1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(screen.getByText("GAME OVER")).toBeTruthy();
    expect(screen.getByRole("button", { name: "RESTART" })).toBeTruthy();
    expect(await screen.findByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/Today's Top 10/)).toBeTruthy();
  });
});
