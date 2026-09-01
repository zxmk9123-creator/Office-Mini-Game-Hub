import type { Game, GameMetadata, GameResult } from "../types";

export interface MockGameState {
  clicksRequired: number;
  clicksReceived: number;
}

export interface MockGameInput {
  type: "click";
}

export interface MockGameResultMetadata {
  clicksReceived: number;
}

export const mockGameMetadata: GameMetadata = {
  id: "mock-game",
  name: "Mock Game",
  description: "Minimal game used to exercise the Game Core in isolation from any real game.",
  icon: "mock",
  scoreType: "higher_is_better",
  version: "1.0.0",
  enabled: false,
};

/**
 * The simplest possible Game implementation: finishes after a fixed number
 * of "click" inputs, scoring the number of clicks received. It exists to
 * prove the Game Core (contract, lifecycle, registry) works end-to-end
 * without depending on any real game's rules — see mock-game.test.ts.
 */
export class MockGame implements Game<MockGameState, MockGameInput, MockGameResultMetadata> {
  readonly metadata = mockGameMetadata;

  constructor(private readonly clicksRequired = 3) {}

  createInitialState(): MockGameState {
    return { clicksRequired: this.clicksRequired, clicksReceived: 0 };
  }

  start(state: MockGameState): MockGameState {
    return state;
  }

  handleInput(state: MockGameState, input: MockGameInput): MockGameState {
    if (input.type !== "click") {
      return state;
    }
    return { ...state, clicksReceived: state.clicksReceived + 1 };
  }

  isFinished(state: MockGameState): boolean {
    return state.clicksReceived >= state.clicksRequired;
  }

  computeResult(state: MockGameState): GameResult<MockGameResultMetadata> {
    return {
      gameId: this.metadata.id,
      scoreType: this.metadata.scoreType,
      score: state.clicksReceived,
      completion: { reason: "completed", completedAt: Date.now() },
      metadata: { clicksReceived: state.clicksReceived },
    };
  }
}
