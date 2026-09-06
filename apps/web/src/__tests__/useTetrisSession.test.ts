import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCK_DELAY_MS, DEFAULT_TETRIS_RULESET } from "@mini-game-hub/game-core";
import { useTetrisSession } from "../games/tetris/useTetrisSession";
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

/** Drives the piece all the way down and past lock delay via repeated ticks, forcing a lock. */
async function lockCurrentPiece(result: { current: ReturnType<typeof useTetrisSession> }) {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      result.current.tick(DEFAULT_TETRIS_RULESET.gravity[0]);
    });
  }
  await act(async () => {
    result.current.tick(DEFAULT_LOCK_DELAY_MS + 50);
  });
}

describe("useTetrisSession: Game Over submits the result exactly once", () => {
  it("stops filling the board and calling submitGameResult once the board tops out", async () => {
    const { result } = renderHook(() => useTetrisSession("player-1"));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.lifecycleState).toBe("playing");

    // Repeatedly drive gravity far past what it takes to top out an empty
    // board (piece after piece locking near the spawn area).
    for (let i = 0; i < 60 && result.current.lifecycleState === "playing"; i++) {
      await lockCurrentPiece(result);
    }

    expect(result.current.lifecycleState).toBe("result");
    expect(mockedSubmitGameResult).toHaveBeenCalledTimes(1);

    // Further ticks after Game Over must not submit again.
    await act(async () => {
      result.current.tick(DEFAULT_LOCK_DELAY_MS + 50);
    });
    expect(mockedSubmitGameResult).toHaveBeenCalledTimes(1);
  });
});

describe("useTetrisSession: restart resets score/level/lines", () => {
  it("a fresh start() after Game Over begins again at score 0, level 1, 0 lines", async () => {
    const { result } = renderHook(() => useTetrisSession("player-1"));

    await act(async () => {
      await result.current.start();
    });
    for (let i = 0; i < 60 && result.current.lifecycleState === "playing"; i++) {
      await lockCurrentPiece(result);
    }
    expect(result.current.lifecycleState).toBe("result");

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.lifecycleState).toBe("playing");
    expect(result.current.gameState?.score).toBe(0);
    expect(result.current.gameState?.level).toBe(1);
    expect(result.current.gameState?.lines).toBe(0);
    expect(mockedCreateGameSession).toHaveBeenCalledTimes(2);
  });
});
