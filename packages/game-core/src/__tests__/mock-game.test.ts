import { describe, expect, it } from "vitest";
import { MockGame, mockGameMetadata } from "../games/mock-game";

describe("MockGame (direct Game contract usage)", () => {
  it("exposes metadata matching the Game contract's requirements", () => {
    const game = new MockGame();
    expect(game.metadata).toBe(mockGameMetadata);
    expect(game.metadata.id).toBe("mock-game");
    expect(game.metadata.scoreType).toBe("higher_is_better");
  });

  it("initializes state without requiring the platform lifecycle", () => {
    const game = new MockGame(5);
    const state = game.createInitialState();
    expect(state).toEqual({ clicksRequired: 5, clicksReceived: 0 });
    expect(game.isFinished(state)).toBe(false);
  });

  it("start() is a no-op passthrough for this game", () => {
    const game = new MockGame();
    const state = game.createInitialState();
    expect(game.start(state)).toBe(state);
  });

  it("handleInput ignores unrecognized input types", () => {
    const game = new MockGame(2);
    const state = game.createInitialState();
    // @ts-expect-error deliberately invalid input type
    const next = game.handleInput(state, { type: "not-a-click" });
    expect(next).toEqual(state);
  });

  it("becomes finished exactly at the configured click count", () => {
    const game = new MockGame(2);
    let state = game.createInitialState();
    state = game.handleInput(state, { type: "click" });
    expect(game.isFinished(state)).toBe(false);
    state = game.handleInput(state, { type: "click" });
    expect(game.isFinished(state)).toBe(true);
  });

  it("computes a result carrying the final click count as score", () => {
    const game = new MockGame(1);
    let state = game.createInitialState();
    state = game.handleInput(state, { type: "click" });
    const result = game.computeResult(state);

    expect(result.gameId).toBe("mock-game");
    expect(result.scoreType).toBe("higher_is_better");
    expect(result.score).toBe(1);
    expect(result.metadata).toEqual({ clicksReceived: 1 });
    expect(result.completion.reason).toBe("completed");
    expect(Number.isFinite(result.completion.completedAt)).toBe(true);
  });
});
