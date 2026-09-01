import { describe, expect, it } from "vitest";
import { GameSession, InvalidGameOperationError } from "../session";
import { InvalidLifecycleTransitionError } from "../lifecycle";
import { MockGame } from "../games/mock-game";

describe("GameSession + MockGame", () => {
  it("drives a full round through the platform lifecycle", () => {
    const session = new GameSession(new MockGame(2));

    expect(session.lifecycleState).toBe("idle");

    session.ready();
    expect(session.lifecycleState).toBe("ready");
    expect(session.getGameState()).toEqual({ clicksRequired: 2, clicksReceived: 0 });

    session.start();
    expect(session.lifecycleState).toBe("playing");

    session.submitInput({ type: "click" });
    expect(session.lifecycleState).toBe("playing");
    expect(session.getGameState()).toMatchObject({ clicksReceived: 1 });

    session.submitInput({ type: "click" });
    expect(session.lifecycleState).toBe("finished");
    expect(session.getGameState()).toMatchObject({ clicksReceived: 2 });

    const result = session.computeResult();
    expect(session.lifecycleState).toBe("result");
    expect(result).toMatchObject({
      gameId: "mock-game",
      scoreType: "higher_is_better",
      score: 2,
      completion: { reason: "completed" },
    });
  });

  it("auto-transitions to finished only once the game reports itself done", () => {
    const session = new GameSession(new MockGame(3));
    session.ready();
    session.start();

    session.submitInput({ type: "click" });
    expect(session.lifecycleState).toBe("playing");
    session.submitInput({ type: "click" });
    expect(session.lifecycleState).toBe("playing");
    session.submitInput({ type: "click" });
    expect(session.lifecycleState).toBe("finished");
  });

  it("rejects input outside of the playing state", () => {
    const session = new GameSession(new MockGame(2));
    expect(() => session.submitInput({ type: "click" })).toThrow(InvalidGameOperationError);

    session.ready();
    expect(() => session.submitInput({ type: "click" })).toThrow(InvalidGameOperationError);
  });

  it("rejects skipping a lifecycle stage", () => {
    const session = new GameSession(new MockGame(2));
    expect(() => session.start()).toThrow(InvalidLifecycleTransitionError);
  });

  it("rejects computing a result before the game is finished", () => {
    const session = new GameSession(new MockGame(2));
    session.ready();
    session.start();
    expect(() => session.computeResult()).toThrow(InvalidLifecycleTransitionError);
  });

  it("resets back to idle and clears state/result", () => {
    const session = new GameSession(new MockGame(1));
    session.ready();
    session.start();
    session.submitInput({ type: "click" });
    session.computeResult();

    session.reset();
    expect(session.lifecycleState).toBe("idle");
    expect(() => session.getGameState()).toThrow(InvalidGameOperationError);
    expect(() => session.getResult()).toThrow(InvalidGameOperationError);
  });
});
