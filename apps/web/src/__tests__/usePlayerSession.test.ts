import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerSession } from "../player/usePlayerSession";
import { createPlayer } from "../api/client";

vi.mock("../api/client", () => ({
  createPlayer: vi.fn(),
}));

const mockedCreatePlayer = vi.mocked(createPlayer);

beforeEach(() => {
  localStorage.clear();
  mockedCreatePlayer.mockReset();
});

describe("usePlayerSession", () => {
  it("starts with no player when localStorage is empty", () => {
    const { result } = renderHook(() => usePlayerSession());
    expect(result.current.playerId).toBeNull();
    expect(result.current.nickname).toBeNull();
  });

  it("rejects an empty nickname without calling the API", async () => {
    const { result } = renderHook(() => usePlayerSession());

    await act(async () => {
      await result.current.setNickname("   ");
    });

    expect(mockedCreatePlayer).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/nickname/i);
    expect(result.current.playerId).toBeNull();
  });

  it("rejects a nickname over 20 characters without calling the API", async () => {
    const { result } = renderHook(() => usePlayerSession());

    await act(async () => {
      await result.current.setNickname("a".repeat(21));
    });

    expect(mockedCreatePlayer).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/20/);
  });

  it("creates a player for a valid, trimmed nickname and persists it", async () => {
    mockedCreatePlayer.mockResolvedValue({
      id: "player-1",
      nickname: "Sanghyun",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const { result } = renderHook(() => usePlayerSession());

    await act(async () => {
      await result.current.setNickname("  Sanghyun  ");
    });

    expect(mockedCreatePlayer).toHaveBeenCalledWith("Sanghyun");
    expect(result.current.playerId).toBe("player-1");
    expect(result.current.nickname).toBe("Sanghyun");
    expect(result.current.error).toBeNull();
    expect(localStorage.getItem("mini-game-hub:playerId")).toBe("player-1");
  });

  it("surfaces a graceful error when the API call fails", async () => {
    mockedCreatePlayer.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => usePlayerSession());

    await act(async () => {
      await result.current.setNickname("Sanghyun");
    });

    expect(result.current.playerId).toBeNull();
    expect(result.current.error).toMatch(/try again/i);
  });

  it("does not create a duplicate player on a rapid double-submit", async () => {
    let resolveCreate!: (player: { id: string; nickname: string; createdAt: string; updatedAt: string }) => void;
    mockedCreatePlayer.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { result } = renderHook(() => usePlayerSession());

    let firstCall!: Promise<void>;
    act(() => {
      firstCall = result.current.setNickname("Sanghyun");
    });
    // A second submit while the first is still in flight must be a no-op.
    await act(async () => {
      await result.current.setNickname("Sanghyun");
    });

    expect(mockedCreatePlayer).toHaveBeenCalledTimes(1);

    resolveCreate({ id: "player-1", nickname: "Sanghyun", createdAt: "", updatedAt: "" });
    await act(async () => {
      await firstCall;
    });
    await waitFor(() => expect(result.current.playerId).toBe("player-1"));
  });
});
