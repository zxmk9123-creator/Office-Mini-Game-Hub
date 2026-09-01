import { describe, expect, it } from "vitest";
import {
  DuplicateGameError,
  GameNotFoundError,
  GameRegistry,
  InvalidGameMetadataError,
  validateGameMetadata,
} from "../registry";
import { MockGame, mockGameMetadata } from "../games/mock-game";
import type { GameMetadata } from "../types";

describe("GameRegistry", () => {
  it("registers a game and retrieves it by id", () => {
    const registry = new GameRegistry();
    const game = new MockGame();
    registry.register(game);

    expect(registry.get("mock-game")).toBe(game);
    expect(registry.has("mock-game")).toBe(true);
  });

  it("lists all registered games' metadata", () => {
    const registry = new GameRegistry();
    registry.register(new MockGame());

    expect(registry.list()).toEqual([mockGameMetadata]);
  });

  it("filters listEnabled() down to enabled games only", () => {
    const registry = new GameRegistry();
    registry.register(new MockGame()); // mockGameMetadata.enabled === false

    expect(registry.list()).toHaveLength(1);
    expect(registry.listEnabled()).toHaveLength(0);
  });

  it("throws GameNotFoundError for an unregistered id", () => {
    const registry = new GameRegistry();
    expect(() => registry.get("does-not-exist")).toThrow(GameNotFoundError);
  });

  it("rejects duplicate registration of the same game id", () => {
    const registry = new GameRegistry();
    registry.register(new MockGame());
    expect(() => registry.register(new MockGame())).toThrow(DuplicateGameError);
  });

  it("validates metadata on registration", () => {
    const registry = new GameRegistry();
    const invalidGame = new MockGame();
    // @ts-expect-error deliberately corrupting metadata to prove validation runs
    invalidGame.metadata = { ...mockGameMetadata, id: "Not A Slug" } as GameMetadata;

    expect(() => registry.register(invalidGame)).toThrow(InvalidGameMetadataError);
  });

  it("a second, independent game can be registered without touching the registry", () => {
    const registry = new GameRegistry();
    registry.register(new MockGame());

    const secondGameMetadata: GameMetadata = {
      id: "second-mock-game",
      name: "Second Mock Game",
      description: "A hypothetical unrelated game proving extensibility.",
      icon: "mock-2",
      scoreType: "lower_is_better",
      version: "1.0.0",
      enabled: true,
    };
    const secondGame = {
      metadata: secondGameMetadata,
      createInitialState: () => ({}),
      start: (s: unknown) => s,
      handleInput: (s: unknown) => s,
      isFinished: () => true,
      computeResult: () => ({
        gameId: secondGameMetadata.id,
        scoreType: secondGameMetadata.scoreType,
        score: 0,
        completion: { reason: "completed" as const, completedAt: Date.now() },
        metadata: {},
      }),
    };

    registry.register(secondGame);

    expect(registry.list().map((m) => m.id).sort()).toEqual(["mock-game", "second-mock-game"]);
    expect(registry.get("second-mock-game")).toBe(secondGame);
  });
});

describe("validateGameMetadata", () => {
  it("accepts well-formed metadata", () => {
    expect(() => validateGameMetadata(mockGameMetadata)).not.toThrow();
  });

  it("rejects a non-kebab-case id", () => {
    expect(() =>
      validateGameMetadata({ ...mockGameMetadata, id: "MockGame" }),
    ).toThrow(InvalidGameMetadataError);
  });

  it("rejects a blank name", () => {
    expect(() => validateGameMetadata({ ...mockGameMetadata, name: "  " })).toThrow(
      InvalidGameMetadataError,
    );
  });

  it("rejects an unknown scoreType", () => {
    expect(() =>
      // @ts-expect-error deliberately invalid scoreType
      validateGameMetadata({ ...mockGameMetadata, scoreType: "sideways" }),
    ).toThrow(InvalidGameMetadataError);
  });
});
