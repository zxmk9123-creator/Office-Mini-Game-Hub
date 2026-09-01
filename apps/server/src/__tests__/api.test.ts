import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { ensureGamesSynced, resetTestData } from "./testDb";

beforeAll(ensureGamesSynced);
beforeEach(resetTestData);

const app = createApp();

async function createPlayer(nickname = "Sanghyun") {
  const res = await request(app).post("/api/players").send({ nickname });
  return res.body as { id: string; nickname: string };
}

describe("POST /api/players", () => {
  it("creates a player and returns 201", async () => {
    const res = await request(app).post("/api/players").send({ nickname: "Sanghyun" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nickname: "Sanghyun" });
    expect(res.body.id).toBeTruthy();
  });

  it("returns 400 for a malformed request (missing nickname)", async () => {
    const res = await request(app).post("/api/players").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("returns 400 for an empty nickname after trimming", async () => {
    const res = await request(app).post("/api/players").send({ nickname: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_nickname");
  });
});

describe("GET /api/players/:id", () => {
  it("returns 200 and the player for a valid id", async () => {
    const player = await createPlayer();
    const res = await request(app).get(`/api/players/${player.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: player.id, nickname: "Sanghyun" });
  });

  it("returns 404 for a nonexistent player", async () => {
    const res = await request(app).get("/api/players/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("player_not_found");
  });

  it("returns 400 for a malformed id (not a uuid)", async () => {
    const res = await request(app).get("/api/players/not-a-uuid");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

describe("POST /api/games/:gameId/sessions", () => {
  it("creates a session and returns 201", async () => {
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/games/reaction-test/sessions")
      .send({ playerId: player.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      playerId: player.id,
      gameId: "reaction-test",
      status: "started",
    });
  });

  it("returns 404 for a nonexistent player", async () => {
    const res = await request(app)
      .post("/api/games/reaction-test/sessions")
      .send({ playerId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("player_not_found");
  });

  it("returns 404 for a nonexistent game", async () => {
    const player = await createPlayer();
    const res = await request(app)
      .post("/api/games/does-not-exist/sessions")
      .send({ playerId: player.id });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("game_not_found");
  });

  it("returns 400 for a malformed request (playerId not a uuid)", async () => {
    const res = await request(app)
      .post("/api/games/reaction-test/sessions")
      .send({ playerId: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns 200 and the session for a valid id", async () => {
    const player = await createPlayer();
    const created = await request(app)
      .post("/api/games/reaction-test/sessions")
      .send({ playerId: player.id });

    const res = await request(app).get(`/api/sessions/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: created.body.id, playerId: player.id });
  });

  it("returns 404 for a nonexistent session", async () => {
    const res = await request(app).get("/api/sessions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("session_not_found");
  });

  it("returns 400 for a malformed session id", async () => {
    const res = await request(app).get("/api/sessions/not-a-uuid");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

describe("GET /api/health", () => {
  it("still responds ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
