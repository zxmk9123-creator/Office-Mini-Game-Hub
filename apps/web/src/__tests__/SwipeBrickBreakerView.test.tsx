import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwipeBrickBreakerView } from "../games/swipe-brick-breaker/SwipeBrickBreakerView";
import * as sessionModule from "../games/swipe-brick-breaker/useSwipeBrickBreakerSession";

vi.mock("../games/swipe-brick-breaker/useSwipeBrickBreakerSession");
vi.mock("../api/client", () => ({
  getRanking: vi.fn().mockResolvedValue({
    game: { id: "swipe-brick-breaker", name: "Swipe Brick Breaker", scoreType: "higher_is_better" },
    entries: [{ rank: 1, playerId: "p1", nickname: "Alice", score: 12, metadata: {}, completedAt: "" }],
    pagination: { limit: 10, offset: 0, total: 1 },
  }),
}));

const useSwipeBrickBreakerSession = vi.mocked(sessionModule.useSwipeBrickBreakerSession);

function baseView(
  overrides: Partial<ReturnType<typeof sessionModule.useSwipeBrickBreakerSession>> = {},
): ReturnType<typeof sessionModule.useSwipeBrickBreakerSession> {
  return {
    lifecycleState: "idle" as const,
    gameState: null,
    result: null,
    submissionStatus: "idle" as const,
    persistedResult: null,
    starting: false,
    start: vi.fn(),
    aim: vi.fn(),
    cancelAim: vi.fn(),
    fire: vi.fn(),
    tick: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue(null),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("SwipeBrickBreakerView: Start screen shows today's ranking", () => {
  it("renders the Top 10 leaderboard on the idle (Start) screen, before any game is played", async () => {
    useSwipeBrickBreakerSession.mockReturnValue(baseView());

    render(<SwipeBrickBreakerView playerId="player-1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(await screen.findByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/Today's Top 10/)).toBeTruthy();
  });
});
