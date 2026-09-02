import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { resetTestData } from "./testDb";

beforeEach(resetTestData);

const app = createApp();

describe("Sticky Notes API", () => {
  it("creates a sticky note with a default color and unpinned", async () => {
    const res = await request(app).post("/api/sticky-notes").send({ content: "Pick up dry cleaning" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content: "Pick up dry cleaning", color: "yellow", pinned: false });
  });

  it("creates a sticky note with an explicit color", async () => {
    const res = await request(app).post("/api/sticky-notes").send({ content: "Call back", color: "blue" });
    expect(res.status).toBe(201);
    expect(res.body.color).toBe("blue");
  });

  it("rejects a color outside the restrained palette", async () => {
    const res = await request(app).post("/api/sticky-notes").send({ content: "x", color: "chartreuse" });
    expect(res.status).toBe(400);
  });

  it("lists sticky notes with pinned notes first", async () => {
    const a = await request(app).post("/api/sticky-notes").send({ content: "A" });
    const b = await request(app).post("/api/sticky-notes").send({ content: "B" });
    await request(app).patch(`/api/sticky-notes/${b.body.id}`).send({ pinned: true });

    const list = await request(app).get("/api/sticky-notes");
    expect(list.status).toBe(200);
    expect(list.body[0].id).toBe(b.body.id);
    expect(list.body.map((n: { id: string }) => n.id)).toContain(a.body.id);
  });

  it("edits content", async () => {
    const created = await request(app).post("/api/sticky-notes").send({ content: "old" });
    const res = await request(app).patch(`/api/sticky-notes/${created.body.id}`).send({ content: "new" });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe("new");
  });

  it("toggles pinned on and off", async () => {
    const created = await request(app).post("/api/sticky-notes").send({ content: "pin me" });
    const pinned = await request(app).patch(`/api/sticky-notes/${created.body.id}`).send({ pinned: true });
    expect(pinned.body.pinned).toBe(true);

    const unpinned = await request(app).patch(`/api/sticky-notes/${created.body.id}`).send({ pinned: false });
    expect(unpinned.body.pinned).toBe(false);
  });

  it("changes color", async () => {
    const created = await request(app).post("/api/sticky-notes").send({ content: "x", color: "yellow" });
    const res = await request(app).patch(`/api/sticky-notes/${created.body.id}`).send({ color: "green" });
    expect(res.status).toBe(200);
    expect(res.body.color).toBe("green");
  });

  it("deletes a sticky note", async () => {
    const created = await request(app).post("/api/sticky-notes").send({ content: "delete me" });
    const del = await request(app).delete(`/api/sticky-notes/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/sticky-notes");
    expect(list.body.map((n: { id: string }) => n.id)).not.toContain(created.body.id);
  });

  it("returns 404 when editing or deleting a missing sticky note", async () => {
    const missingId = "00000000-0000-0000-0000-000000000000";
    const patch = await request(app).patch(`/api/sticky-notes/${missingId}`).send({ pinned: true });
    expect(patch.status).toBe(404);
    const del = await request(app).delete(`/api/sticky-notes/${missingId}`);
    expect(del.status).toBe(404);
  });

  it("persists a sticky note across separate requests (survives a fresh app instance / reload)", async () => {
    const created = await request(app).post("/api/sticky-notes").send({ content: "Survives reload", color: "pink" });

    const reloadedApp = createApp();
    const list = await request(reloadedApp).get("/api/sticky-notes");
    expect(list.body.find((n: { id: string }) => n.id === created.body.id)).toMatchObject({
      content: "Survives reload",
      color: "pink",
    });
  });
});
