import type { GameResult, ScoreType } from "./types";

export class InvalidGameResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGameResultError";
  }
}

/**
 * Structural validation a platform service can run before persisting a
 * GameResult. Deliberately does not look inside `metadata` — that shape is
 * per-game and none of the platform's business.
 */
export function validateGameResult(
  result: GameResult<unknown>,
  expected: { gameId: string; scoreType: ScoreType },
): void {
  if (result.gameId !== expected.gameId) {
    throw new InvalidGameResultError(
      `Result gameId "${result.gameId}" does not match expected "${expected.gameId}"`,
    );
  }
  if (result.scoreType !== expected.scoreType) {
    throw new InvalidGameResultError(
      `Result scoreType "${result.scoreType}" does not match expected "${expected.scoreType}"`,
    );
  }
  if (result.completion.reason === "completed") {
    if (result.score === null || !Number.isFinite(result.score)) {
      throw new InvalidGameResultError(
        `A "completed" result must have a finite score, got ${result.score}`,
      );
    }
  } else if (result.score !== null) {
    throw new InvalidGameResultError(
      `A "${result.completion.reason}" result must have a null score, got ${result.score}`,
    );
  }
  if (!Number.isFinite(result.completion.completedAt)) {
    throw new InvalidGameResultError("Result completion.completedAt must be a finite timestamp");
  }
}
