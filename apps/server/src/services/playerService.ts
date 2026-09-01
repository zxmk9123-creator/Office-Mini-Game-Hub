import type { PlayerRecord, PlayerRepository } from "../repositories/playerRepository";

export const NICKNAME_MAX_LENGTH = 20;

export class InvalidNicknameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNicknameError";
  }
}

export class PlayerNotFoundError extends Error {
  constructor(public readonly playerId: string) {
    super(`Player "${playerId}" was not found`);
    this.name = "PlayerNotFoundError";
  }
}

/**
 * Trims whitespace, rejects an empty result, and enforces a max length.
 * Casing is preserved exactly as the player typed it. Nicknames are not
 * required to be unique — the Player ID is the identity.
 */
export function normalizeNickname(rawNickname: string): string {
  const trimmed = rawNickname.trim();
  if (trimmed.length === 0) {
    throw new InvalidNicknameError("Nickname must not be empty");
  }
  if (trimmed.length > NICKNAME_MAX_LENGTH) {
    throw new InvalidNicknameError(`Nickname must be at most ${NICKNAME_MAX_LENGTH} characters`);
  }
  return trimmed;
}

export class PlayerService {
  constructor(private readonly repository: PlayerRepository) {}

  async createPlayer(rawNickname: string): Promise<PlayerRecord> {
    const nickname = normalizeNickname(rawNickname);
    return this.repository.create(nickname);
  }

  async getPlayer(playerId: string): Promise<PlayerRecord> {
    const player = await this.repository.findById(playerId);
    if (!player) {
      throw new PlayerNotFoundError(playerId);
    }
    return player;
  }
}
