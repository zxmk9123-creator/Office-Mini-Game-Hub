import { describe, expect, it } from "vitest";
import { GameSession } from "../session";
import { InvalidGameOperationError } from "../session";
import { InvalidLifecycleTransitionError } from "../lifecycle";
import { validateGameResult } from "../result";
import {
  ReactionTestGame,
  ReactionTestInputError,
  reactionTestMetadata,
  type Clock,
  type RandomDelaySource,
} from "../games/reaction-test";

/** Deterministic clock the test advances manually — never wall-clock time. */
class FakeClock implements Clock {
  private current = 0;

  now(): number {
    return this.current;
  }

  advanceBy(ms: number): void {
    this.current += ms;
  }
}

/** Always returns the same delay, so tests don't depend on Math.random. */
class FixedDelaySource implements RandomDelaySource {
  constructor(private readonly delayMs: number) {}

  nextDelayMs(): number {
    return this.delayMs;
  }
}

function setup(delayMs = 1500) {
  const clock = new FakeClock();
  const game = new ReactionTestGame(clock, new FixedDelaySource(delayMs));
  return { clock, game };
}

describe("ReactionTestGame: state machine", () => {
  it("starts in the ready phase with no result yet", () => {
    const { game } = setup();
    const state = game.createInitialState();
    expect(state).toEqual({
      phase: "ready",
      delayMs: 0,
      targetAppearedAt: null,
      falseStart: false,
      reactionTimeMs: null,
    });
  });

  it("start() moves ready -> waiting and picks the round's delay", () => {
    const { game } = setup(1500);
    const state = game.start(game.createInitialState());
    expect(state.phase).toBe("waiting");
    expect(state.delayMs).toBe(1500);
  });

  it("does not reveal the target until a reveal input arrives, regardless of elapsed time", () => {
    const { game, clock } = setup();
    const state = game.start(game.createInitialState());
    clock.advanceBy(10_000);
    expect(state.phase).toBe("waiting");
  });

  it("reveal transitions waiting -> target and timestamps the reveal", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(1500);
    state = game.handleInput(state, { type: "reveal" });
    expect(state.phase).toBe("target");
    expect(state.targetAppearedAt).toBe(1500);
  });
});

describe("ReactionTestGame: valid reaction", () => {
  it("computes reaction time as the delta between reveal and click, on the injected clock", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(1500);
    state = game.handleInput(state, { type: "reveal" });

    clock.advanceBy(237);
    state = game.handleInput(state, { type: "click" });

    expect(state.phase).toBe("done");
    expect(state.falseStart).toBe(false);
    expect(state.reactionTimeMs).toBe(237);
    expect(game.isFinished(state)).toBe(true);
  });

  it("produces a GameResult matching the contract for a valid reaction", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(1500);
    state = game.handleInput(state, { type: "reveal" });
    clock.advanceBy(200);
    state = game.handleInput(state, { type: "click" });

    const result = game.computeResult(state);
    expect(result).toEqual({
      gameId: "reaction-test",
      scoreType: "lower_is_better",
      score: 200,
      completion: { reason: "completed", completedAt: 1700 },
      metadata: { reactionTimeMs: 200, falseStart: false },
    });
    expect(() =>
      validateGameResult(result, { gameId: "reaction-test", scoreType: "lower_is_better" }),
    ).not.toThrow();
  });
});

describe("ReactionTestGame: false start", () => {
  it("marks a click during waiting as a false start with no reaction time", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(400); // still within the wait
    state = game.handleInput(state, { type: "click" });

    expect(state.phase).toBe("done");
    expect(state.falseStart).toBe(true);
    expect(state.reactionTimeMs).toBeNull();
    expect(game.isFinished(state)).toBe(true);
  });

  it("produces an invalid GameResult with a non-finite score for a false start", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(400);
    state = game.handleInput(state, { type: "click" });

    const result = game.computeResult(state);
    expect(result.completion.reason).toBe("invalid");
    expect(Number.isNaN(result.score)).toBe(true);
    expect(result.metadata).toEqual({ reactionTimeMs: null, falseStart: true });
  });

  it("does not let a later click convert a false start into a valid result", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(400);
    state = game.handleInput(state, { type: "click" }); // false start
    const afterFalseStart = state;

    clock.advanceBy(5000);
    state = game.handleInput(state, { type: "click" }); // late click, must be a no-op

    expect(state).toEqual(afterFalseStart);
    expect(state.falseStart).toBe(true);
    expect(state.reactionTimeMs).toBeNull();
  });
});

describe("ReactionTestGame: first-click-wins", () => {
  it("ignores clicks after the first valid one and keeps the original reaction time", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(1500);
    state = game.handleInput(state, { type: "reveal" });

    clock.advanceBy(150);
    state = game.handleInput(state, { type: "click" });
    const afterFirstClick = state;

    clock.advanceBy(2000); // a second click much later must not change anything
    state = game.handleInput(state, { type: "click" });

    expect(state).toEqual(afterFirstClick);
    expect(state.reactionTimeMs).toBe(150);
  });
});

describe("ReactionTestGame: invalid input handling", () => {
  it("rejects a click before the round has started", () => {
    const { game } = setup();
    const state = game.createInitialState();
    expect(() => game.handleInput(state, { type: "click" })).toThrow(ReactionTestInputError);
  });

  it("rejects a reveal outside of the waiting phase", () => {
    const { game } = setup();
    const state = game.createInitialState(); // phase: "ready"
    expect(() => game.handleInput(state, { type: "reveal" })).toThrow(ReactionTestInputError);
  });

  it("rejects a second reveal once the target is already showing", () => {
    const { game, clock } = setup(1500);
    let state = game.start(game.createInitialState());
    clock.advanceBy(1500);
    state = game.handleInput(state, { type: "reveal" });
    expect(() => game.handleInput(state, { type: "reveal" })).toThrow(ReactionTestInputError);
  });
});

describe("ReactionTestGame via GameSession", () => {
  it("drives a full valid round through the platform lifecycle", () => {
    const { game, clock } = setup(1500);
    const session = new GameSession(game);

    session.ready();
    session.start();
    expect(session.lifecycleState).toBe("playing");
    expect(session.getGameState().phase).toBe("waiting");

    clock.advanceBy(1500);
    session.submitInput({ type: "reveal" });
    expect(session.getGameState().phase).toBe("target");
    expect(session.lifecycleState).toBe("playing");

    clock.advanceBy(184);
    session.submitInput({ type: "click" });
    expect(session.lifecycleState).toBe("finished");

    const result = session.computeResult();
    expect(session.lifecycleState).toBe("result");
    expect(result.score).toBe(184);
    expect(result.metadata).toEqual({ reactionTimeMs: 184, falseStart: false });
  });

  it("auto-finishes on a false start and rejects further input at the session level", () => {
    const { game, clock } = setup(1500);
    const session = new GameSession(game);
    session.ready();
    session.start();

    clock.advanceBy(50);
    session.submitInput({ type: "click" }); // false start
    expect(session.lifecycleState).toBe("finished");

    expect(() => session.submitInput({ type: "reveal" })).toThrow(InvalidGameOperationError);
  });

  it("resets cleanly back to a fresh idle round", () => {
    const { game, clock } = setup(1500);
    const session = new GameSession(game);
    session.ready();
    session.start();
    clock.advanceBy(1500);
    session.submitInput({ type: "reveal" });
    clock.advanceBy(100);
    session.submitInput({ type: "click" });
    session.computeResult();

    session.reset();
    expect(session.lifecycleState).toBe("idle");
    expect(() => session.getGameState()).toThrow(InvalidGameOperationError);
    expect(() => session.getResult()).toThrow(InvalidGameOperationError);

    // and it plays cleanly again
    session.ready();
    expect(session.getGameState()).toEqual({
      phase: "ready",
      delayMs: 0,
      targetAppearedAt: null,
      falseStart: false,
      reactionTimeMs: null,
    });
  });

  it("rejects trying to compute a result before the round is finished", () => {
    const { game } = setup();
    const session = new GameSession(game);
    session.ready();
    session.start();
    expect(() => session.computeResult()).toThrow(InvalidLifecycleTransitionError);
  });
});

describe("reactionTestMetadata", () => {
  it("declares a lower_is_better score type and is enabled", () => {
    expect(reactionTestMetadata.id).toBe("reaction-test");
    expect(reactionTestMetadata.scoreType).toBe("lower_is_better");
    expect(reactionTestMetadata.enabled).toBe(true);
  });
});
