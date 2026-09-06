import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TetrisView } from "../games/tetris/TetrisView";
import * as sessionModule from "../games/tetris/useTetrisSession";

vi.mock("../games/tetris/useTetrisSession");
vi.mock("../api/client", () => ({
  getRanking: vi.fn().mockResolvedValue({
    game: { id: "tetris", name: "Tetris", scoreType: "higher_is_better" },
    entries: [{ rank: 1, playerId: "p1", nickname: "Alice", score: 1200, metadata: {}, completedAt: "" }],
    pagination: { limit: 10, offset: 0, total: 1 },
  }),
}));

const useTetrisSession = vi.mocked(sessionModule.useTetrisSession);

function baseView(
  overrides: Partial<ReturnType<typeof sessionModule.useTetrisSession>> = {},
): ReturnType<typeof sessionModule.useTetrisSession> {
  return {
    lifecycleState: "idle" as const,
    gameState: null,
    result: null,
    submissionStatus: "idle" as const,
    persistedResult: null,
    starting: false,
    start: vi.fn(),
    moveLeft: vi.fn(),
    moveRight: vi.fn(),
    softDrop: vi.fn(),
    hardDrop: vi.fn(),
    rotateCw: vi.fn(),
    rotateCcw: vi.fn(),
    tick: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue(null),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("TetrisView: Start screen shows today's ranking", () => {
  it("renders the Top 10 leaderboard on the idle (Start) screen, before any game is played", async () => {
    useTetrisSession.mockReturnValue(baseView());

    render(<TetrisView playerId="player-1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(await screen.findByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/Today's Top 10/)).toBeTruthy();
  });
});

describe("TetrisView: Game Over screen", () => {
  it("shows the final score, level, and lines, and the Restart/Home actions", () => {
    useTetrisSession.mockReturnValue(
      baseView({
        lifecycleState: "result",
        result: {
          gameId: "tetris",
          scoreType: "higher_is_better",
          score: 1500,
          completion: { reason: "completed", completedAt: Date.parse("2026-01-01T00:00:00Z") },
          metadata: { lines: 12, level: 2 },
        },
      }),
    );

    render(<TetrisView playerId="player-1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(screen.getByText("GAME OVER")).toBeTruthy();
    expect(screen.getByText("1500")).toBeTruthy();
    expect(screen.getByText(/Level 2/)).toBeTruthy();
    expect(screen.getByText(/12 lines/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "RESTART" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
  });
});
