import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReactionTestView } from "../games/reaction-test/ReactionTestView";
import * as sessionModule from "../games/reaction-test/useReactionTestSession";

vi.mock("../games/reaction-test/useReactionTestSession");
vi.mock("../api/client", () => ({
  getRanking: vi.fn().mockResolvedValue({
    game: { id: "reaction-test", name: "Reaction Test", scoreType: "lower_is_better" },
    entries: [],
    pagination: { limit: 10, offset: 0, total: 0 },
  }),
}));

const useReactionTestSession = vi.mocked(sessionModule.useReactionTestSession);

function baseView(overrides: Partial<ReturnType<typeof sessionModule.useReactionTestSession>> = {}) {
  return {
    lifecycleState: "idle" as const,
    phase: null,
    result: null,
    submissionStatus: "idle" as const,
    persistedResult: null,
    starting: false,
    start: vi.fn(),
    click: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("ReactionTestView", () => {
  it("does not render a leaderboard before the result has been persisted (status: saving)", () => {
    useReactionTestSession.mockReturnValue(
      baseView({
        lifecycleState: "result",
        result: {
          gameId: "reaction-test",
          scoreType: "lower_is_better",
          score: 237,
          completion: { reason: "completed", completedAt: 1 },
          metadata: { reactionTimeMs: 237, falseStart: false },
        },
        submissionStatus: "saving",
        persistedResult: null,
      }),
    );

    render(<ReactionTestView playerId="p1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(screen.getByText("237 ms")).toBeTruthy();
    expect(screen.queryByText(/Top \d/)).toBeNull();
  });

  it("renders the leaderboard once the result is saved", async () => {
    useReactionTestSession.mockReturnValue(
      baseView({
        lifecycleState: "result",
        result: {
          gameId: "reaction-test",
          scoreType: "lower_is_better",
          score: 237,
          completion: { reason: "completed", completedAt: 1 },
          metadata: { reactionTimeMs: 237, falseStart: false },
        },
        submissionStatus: "saved",
        persistedResult: {
          id: "result-1",
          sessionId: "s1",
          playerId: "p1",
          gameId: "reaction-test",
          score: 237,
          metadata: {},
          createdAt: "",
        },
      }),
    );

    render(<ReactionTestView playerId="p1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(await screen.findByText(/Top \d/)).toBeTruthy();
  });

  it("calls start() (a fresh session/result) when Try again is clicked", async () => {
    const start = vi.fn();
    useReactionTestSession.mockReturnValue(
      baseView({
        lifecycleState: "result",
        result: {
          gameId: "reaction-test",
          scoreType: "lower_is_better",
          score: 237,
          completion: { reason: "completed", completedAt: 1 },
          metadata: { reactionTimeMs: 237, falseStart: false },
        },
        submissionStatus: "saved",
        persistedResult: {
          id: "result-1",
          sessionId: "s1",
          playerId: "p1",
          gameId: "reaction-test",
          score: 237,
          metadata: {},
          createdAt: "",
        },
        start,
      }),
    );

    render(<ReactionTestView playerId="p1" nickname="Sanghyun" onHome={vi.fn()} />);
    await screen.findByText(/Top \d/); // let the leaderboard fetch settle first
    screen.getByRole("button", { name: "Try again" }).click();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("calls onHome when Home is clicked", () => {
    const onHome = vi.fn();
    useReactionTestSession.mockReturnValue(baseView());

    render(<ReactionTestView playerId="p1" nickname="Sanghyun" onHome={onHome} />);
    screen.getByRole("button", { name: "← Home" }).click();

    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("does not render a leaderboard for a false-start (invalid) result", () => {
    useReactionTestSession.mockReturnValue(
      baseView({
        lifecycleState: "result",
        result: {
          gameId: "reaction-test",
          scoreType: "lower_is_better",
          score: null,
          completion: { reason: "invalid", completedAt: 1 },
          metadata: { reactionTimeMs: null, falseStart: true },
        },
        submissionStatus: "saved",
        persistedResult: {
          id: "result-2",
          sessionId: "s2",
          playerId: "p1",
          gameId: "reaction-test",
          score: null,
          metadata: {},
          createdAt: "",
        },
      }),
    );

    render(<ReactionTestView playerId="p1" nickname="Sanghyun" onHome={vi.fn()} />);

    expect(screen.getByText(/too early/i)).toBeTruthy();
    expect(screen.queryByText(/Top \d/)).toBeNull();
  });
});
