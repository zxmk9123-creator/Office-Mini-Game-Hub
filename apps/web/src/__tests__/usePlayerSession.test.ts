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

  describe("returning-player identity (local registry)", () => {
    it("Test 1 — restores the same playerId for a returning player without creating a second one", async () => {
      mockedCreatePlayer.mockResolvedValue({
        id: "player-A",
        nickname: "Alice",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      const { result, unmount } = renderHook(() => usePlayerSession());

      await act(async () => {
        await result.current.setNickname("Alice");
      });
      expect(result.current.playerId).toBe("player-A");

      // Switch away, as the "플레이어 전환" control does.
      act(() => result.current.clearPlayer());
      expect(result.current.playerId).toBeNull();
      unmount();

      // Return, in a brand-new hook instance (e.g. after a reload).
      const { result: second } = renderHook(() => usePlayerSession());
      await act(async () => {
        await second.current.setNickname("Alice");
      });

      expect(second.current.playerId).toBe("player-A");
      expect(mockedCreatePlayer).toHaveBeenCalledTimes(1); // never called a second time
    });

    it("Test 2 — multiple players keep stable, independent identities across repeated switches", async () => {
      mockedCreatePlayer.mockImplementation(async (nickname: string) => ({
        id: nickname === "Alice" ? "player-A" : "player-B",
        nickname,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }));
      const { result } = renderHook(() => usePlayerSession());

      await act(async () => {
        await result.current.setNickname("Alice");
      });
      expect(result.current.playerId).toBe("player-A");

      act(() => result.current.clearPlayer());
      await act(async () => {
        await result.current.setNickname("Bob");
      });
      expect(result.current.playerId).toBe("player-B");

      act(() => result.current.clearPlayer());
      await act(async () => {
        await result.current.setNickname("Alice");
      });
      expect(result.current.playerId).toBe("player-A");

      act(() => result.current.clearPlayer());
      await act(async () => {
        await result.current.setNickname("Bob");
      });
      expect(result.current.playerId).toBe("player-B");

      expect(mockedCreatePlayer).toHaveBeenCalledTimes(2); // one Player row each, ever
    });

    it("Test 4 — migrates a pre-registry browser's single legacy identity instead of losing it", async () => {
      localStorage.setItem("mini-game-hub:playerId", "legacy-player");
      localStorage.setItem("mini-game-hub:nickname", "Legacy");

      const { result } = renderHook(() => usePlayerSession());
      // The legacy identity is still the active one on mount, unchanged.
      expect(result.current.playerId).toBe("legacy-player");

      // Switch away and back — this only works if migration actually
      // registered the legacy identity, since a fresh registry lookup is
      // the only thing that can restore it now.
      act(() => result.current.clearPlayer());
      await act(async () => {
        await result.current.setNickname("Legacy");
      });

      expect(result.current.playerId).toBe("legacy-player");
      expect(mockedCreatePlayer).not.toHaveBeenCalled();
    });

    it("Test 5 — an unknown nickname still creates exactly one new player", async () => {
      mockedCreatePlayer.mockResolvedValue({
        id: "player-new",
        nickname: "Newcomer",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      const { result } = renderHook(() => usePlayerSession());

      await act(async () => {
        await result.current.setNickname("Newcomer");
      });

      expect(mockedCreatePlayer).toHaveBeenCalledTimes(1);
      expect(mockedCreatePlayer).toHaveBeenCalledWith("Newcomer");
      expect(result.current.playerId).toBe("player-new");
    });

    it("Test 6 — the current player identity survives a reload (a fresh hook instance)", async () => {
      mockedCreatePlayer.mockResolvedValue({
        id: "player-A",
        nickname: "Alice",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      const { result, unmount } = renderHook(() => usePlayerSession());
      await act(async () => {
        await result.current.setNickname("Alice");
      });
      unmount();

      // A reload re-mounts the hook from scratch — without switching
      // away first, the active single-player keys alone must restore it.
      const { result: reloaded } = renderHook(() => usePlayerSession());
      expect(reloaded.current.playerId).toBe("player-A");
      expect(reloaded.current.nickname).toBe("Alice");
    });
  });
});
