import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { DrizzlePlayerRepository } from "../repositories/playerRepository";
import {
  InvalidNicknameError,
  NICKNAME_MAX_LENGTH,
  PlayerNotFoundError,
  PlayerService,
  normalizeNickname,
} from "../services/playerService";
import { resetTestData } from "./testDb";

beforeEach(resetTestData);

describe("normalizeNickname", () => {
  it("accepts a valid nickname unchanged", () => {
    expect(normalizeNickname("Sanghyun")).toBe("Sanghyun");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeNickname("  Sanghyun  ")).toBe("Sanghyun");
  });

  it("preserves the player's intended casing", () => {
    expect(normalizeNickname("sAnGhYuN")).toBe("sAnGhYuN");
  });

  it("rejects an empty nickname", () => {
    expect(() => normalizeNickname("")).toThrow(InvalidNicknameError);
  });

  it("rejects a nickname that is only whitespace", () => {
    expect(() => normalizeNickname("   ")).toThrow(InvalidNicknameError);
  });

  it(`accepts a nickname exactly ${NICKNAME_MAX_LENGTH} characters long`, () => {
    const nickname = "a".repeat(NICKNAME_MAX_LENGTH);
    expect(normalizeNickname(nickname)).toBe(nickname);
  });

  it(`rejects a nickname longer than ${NICKNAME_MAX_LENGTH} characters`, () => {
    const nickname = "a".repeat(NICKNAME_MAX_LENGTH + 1);
    expect(() => normalizeNickname(nickname)).toThrow(InvalidNicknameError);
  });
});

describe("PlayerService", () => {
  const service = new PlayerService(new DrizzlePlayerRepository(getDb()));

  it("creates a player with a trimmed nickname", async () => {
    const player = await service.createPlayer("  Sanghyun  ");
    expect(player.nickname).toBe("Sanghyun");
    expect(player.id).toBeTruthy();
    expect(player.createdAt).toBeInstanceOf(Date);
  });

  it("looks up a player by id after creation", async () => {
    const created = await service.createPlayer("Alex");
    const found = await service.getPlayer(created.id);
    expect(found).toEqual(created);
  });

  it("throws PlayerNotFoundError for an unknown id", async () => {
    await expect(service.getPlayer("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      PlayerNotFoundError,
    );
  });

  it("allows two players to share the same nickname", async () => {
    const first = await service.createPlayer("Alex");
    const second = await service.createPlayer("Alex");
    expect(first.id).not.toBe(second.id);
    expect(first.nickname).toBe(second.nickname);
  });

  it("rejects creating a player with an empty nickname", async () => {
    await expect(service.createPlayer("   ")).rejects.toThrow(InvalidNicknameError);
  });
});
