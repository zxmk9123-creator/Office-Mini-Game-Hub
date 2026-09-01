import { SCORE_TYPES } from "@mini-game-hub/shared";
import type { Game, GameMetadata } from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class InvalidGameMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGameMetadataError";
  }
}

export class DuplicateGameError extends Error {
  constructor(public readonly gameId: string) {
    super(`Game "${gameId}" is already registered`);
    this.name = "DuplicateGameError";
  }
}

export class GameNotFoundError extends Error {
  constructor(public readonly gameId: string) {
    super(`Game "${gameId}" is not registered`);
    this.name = "GameNotFoundError";
  }
}

export function validateGameMetadata(metadata: GameMetadata): void {
  if (!SLUG_PATTERN.test(metadata.id)) {
    throw new InvalidGameMetadataError(
      `Game id "${metadata.id}" must be a lowercase kebab-case slug`,
    );
  }
  if (!metadata.name.trim()) {
    throw new InvalidGameMetadataError(`Game "${metadata.id}" is missing a name`);
  }
  if (!metadata.version.trim()) {
    throw new InvalidGameMetadataError(`Game "${metadata.id}" is missing a version`);
  }
  if (!SCORE_TYPES.includes(metadata.scoreType)) {
    throw new InvalidGameMetadataError(
      `Game "${metadata.id}" has an unknown scoreType "${metadata.scoreType}"`,
    );
  }
}

/**
 * Central catalog of games the platform can serve. Registration is the only
 * integration point between a game implementation and the rest of the
 * platform — the registry never inspects a game's TState/TInput/result
 * metadata shapes, only its GameMetadata.
 */
export class GameRegistry {
  private readonly games = new Map<string, Game<any, any, any>>();

  register(game: Game<any, any, any>): void {
    validateGameMetadata(game.metadata);
    if (this.games.has(game.metadata.id)) {
      throw new DuplicateGameError(game.metadata.id);
    }
    this.games.set(game.metadata.id, game);
  }

  get(gameId: string): Game<any, any, any> {
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameNotFoundError(gameId);
    }
    return game;
  }

  has(gameId: string): boolean {
    return this.games.has(gameId);
  }

  /** All registered games, including disabled ones — callers filter as needed. */
  list(): GameMetadata[] {
    return Array.from(this.games.values()).map((game) => game.metadata);
  }

  listEnabled(): GameMetadata[] {
    return this.list().filter((metadata) => metadata.enabled);
  }
}
