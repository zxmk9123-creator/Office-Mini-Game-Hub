import { describe, expect, it } from "vitest";
import { InvalidGameResultError, validateGameResult } from "../result";
import { MockGame, mockGameMetadata } from "../games/mock-game";
import { GameSession } from "../session";

function playMockGameToResult() {
  const session = new GameSession(new MockGame(1));
  session.ready();
  session.start();
  session.submitInput({ type: "click" });
  return session.computeResult();
}

describe("validateGameResult", () => {
  it("accepts a well-formed result from a real game run", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(result, { gameId: mockGameMetadata.id, scoreType: mockGameMetadata.scoreType }),
    ).not.toThrow();
  });

  it("rejects a result whose gameId does not match", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(result, { gameId: "other-game", scoreType: result.scoreType }),
    ).toThrow(InvalidGameResultError);
  });

  it("rejects a result whose scoreType does not match", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(result, { gameId: result.gameId, scoreType: "lower_is_better" }),
    ).toThrow(InvalidGameResultError);
  });

  it("rejects a non-finite score", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(
        { ...result, score: Number.NaN },
        { gameId: result.gameId, scoreType: result.scoreType },
      ),
    ).toThrow(InvalidGameResultError);
  });

  it("rejects a null score on a completed result", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(
        { ...result, score: null },
        { gameId: result.gameId, scoreType: result.scoreType },
      ),
    ).toThrow(InvalidGameResultError);
  });

  it("accepts a null score on an invalid result", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(
        { ...result, score: null, completion: { ...result.completion, reason: "invalid" } },
        { gameId: result.gameId, scoreType: result.scoreType },
      ),
    ).not.toThrow();
  });

  it("rejects a non-null score on an invalid result", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(
        { ...result, completion: { ...result.completion, reason: "invalid" } },
        { gameId: result.gameId, scoreType: result.scoreType },
      ),
    ).toThrow(InvalidGameResultError);
  });

  it("rejects a non-finite completedAt timestamp", () => {
    const result = playMockGameToResult();
    expect(() =>
      validateGameResult(
        { ...result, completion: { ...result.completion, completedAt: Number.NaN } },
        { gameId: result.gameId, scoreType: result.scoreType },
      ),
    ).toThrow(InvalidGameResultError);
  });
});
