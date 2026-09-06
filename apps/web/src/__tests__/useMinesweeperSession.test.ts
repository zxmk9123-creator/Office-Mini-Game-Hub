import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMinesweeperSession } from "../games/minesweeper/useMinesweeperSession";
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
  mockedSubmitGameResult.mockImplementation(async (gameId, payload) => ({
    id: "result-1",
    sessionId: payload.sessionId,
    playerId: "player-1",
    gameId,
    score: payload.score,
    metadata: payload.metadata,
    createdAt: new Date().toISOString(),
  }));
});

describe("useMinesweeperSession: flag-triggered Clear submits a result (regression)", () => {
  it("computes and submits a result — and reaches lifecycleState 'result' — when flagging every mine finishes the game", async () => {
    const { result } = renderHook(() => useMinesweeperSession("player-1"));

    await act(async () => {
      await result.current.start();
    });

    // First reveal places mines and is guaranteed safe.
    act(() => {
      result.current.reveal(0, 0);
    });
    const mineIndices = result.current.gameState!.cells
      .map((c, i) => (c.mine ? i : -1))
      .filter((i) => i >= 0);
    const width = result.current.gameState!.width;

    // Flag every mine — the last flag should finish the game via the new
    // flag-all-mines Clear path, exactly like reveal() finishing the game
    // already did before this fix.
    for (const idx of mineIndices) {
      await act(async () => {
        result.current.toggleFlag(Math.floor(idx / width), idx % width);
      });
    }

    expect(result.current.lifecycleState).toBe("result");
    expect(result.current.result?.completion.reason).toBe("completed");
    expect(mockedSubmitGameResult).toHaveBeenCalledTimes(1);
    expect(mockedSubmitGameResult).toHaveBeenCalledWith(
      "minesweeper-easy",
      expect.objectContaining({ score: expect.any(Number), completion: expect.objectContaining({ reason: "completed" }) }),
    );
  });
});
