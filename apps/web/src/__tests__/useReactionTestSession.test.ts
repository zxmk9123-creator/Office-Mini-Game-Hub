import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReactionTestSession } from "../games/reaction-test/useReactionTestSession";
import { createGameSession, submitGameResult } from "../api/client";

vi.mock("../api/client", () => ({
  createGameSession: vi.fn(),
  submitGameResult: vi.fn(),
}));

const mockedCreateGameSession = vi.mocked(createGameSession);
const mockedSubmitGameResult = vi.mocked(submitGameResult);

beforeEach(() => {
  mockedCreateGameSession.mockReset();
  mockedSubmitGameResult.mockReset();
  let n = 0;
  mockedCreateGameSession.mockImplementation(async (gameId, playerId) => ({
    id: `session-${++n}`,
    playerId,
    gameId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "started",
  }));
});

describe("useReactionTestSession: retry creates a fresh session", () => {
  it("calls createGameSession again, with a different session id, on a second start()", async () => {
    const { result } = renderHook(() => useReactionTestSession("player-1"));

    await act(async () => {
      await result.current.start();
    });
    expect(mockedCreateGameSession).toHaveBeenCalledTimes(1);
    expect(mockedCreateGameSession).toHaveBeenLastCalledWith("reaction-test", "player-1");
    const firstSessionResult = mockedCreateGameSession.mock.results[0].value;
    const firstSession = await firstSessionResult;

    // "Try again" from mid-round (no full completion needed to prove a
    // fresh session gets created).
    await act(async () => {
      await result.current.start();
    });

    expect(mockedCreateGameSession).toHaveBeenCalledTimes(2);
    const secondSession = await mockedCreateGameSession.mock.results[1].value;
    expect(secondSession.id).not.toBe(firstSession.id);
  });

  it("does not attempt to create a session before a playerId exists", async () => {
    const { result } = renderHook(() => useReactionTestSession(null));

    await act(async () => {
      await result.current.start();
    });

    expect(mockedCreateGameSession).not.toHaveBeenCalled();
    expect(mockedSubmitGameResult).not.toHaveBeenCalled();
  });
});
