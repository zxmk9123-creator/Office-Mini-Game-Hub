import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { resetTestData } from "./testDb";

beforeEach(resetTestData);

const app = createApp();

describe("Notes API", () => {
  it("creates a note and returns 201", async () => {
    const res = await request(app).post("/api/notes").send({ title: "Groceries", content: "milk, eggs" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "Groceries", content: "milk, eggs" });
    expect(res.body.id).toBeTypeOf("string");
    expect(res.body.createdAt).toBeTruthy();
    expect(res.body.updatedAt).toBeTruthy();
  });

  it("defaults title/content to empty strings when omitted", async () => {
    const res = await request(app).post("/api/notes").send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "", content: "" });
  });

  it("trims the title", async () => {
    const res = await request(app).post("/api/notes").send({ title: "  Trip plan  ", content: "" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Trip plan");
  });

  it("lists notes ordered by most recently updated first", async () => {
    const first = await request(app).post("/api/notes").send({ title: "First", content: "" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await request(app).post("/api/notes").send({ title: "Second", content: "" });

    const list = await request(app).get("/api/notes");
    expect(list.status).toBe(200);
    expect(list.body.map((n: { id: string }) => n.id)).toEqual([second.body.id, first.body.id]);
  });

  it("gets a single note by id", async () => {
    const created = await request(app).post("/api/notes").send({ title: "Note", content: "body" });
    const res = await request(app).get(`/api/notes/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Note", content: "body" });
  });

  it("returns 404 for a missing note", async () => {
    const res = await request(app).get("/api/notes/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("edits a note's title and content and updates updatedAt", async () => {
    const created = await request(app).post("/api/notes").send({ title: "Old", content: "old body" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const res = await request(app)
      .patch(`/api/notes/${created.body.id}`)
      .send({ title: "New", content: "new body" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "New", content: "new body" });
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(new Date(created.body.updatedAt).getTime());
  });

  it("allows a partial edit (content only)", async () => {
    const created = await request(app).post("/api/notes").send({ title: "Keep me", content: "old" });
    const res = await request(app).patch(`/api/notes/${created.body.id}`).send({ content: "updated" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Keep me", content: "updated" });
  });

  it("returns 404 when editing a missing note", async () => {
    const res = await request(app)
      .patch("/api/notes/00000000-0000-0000-0000-000000000000")
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });

  it("deletes a note", async () => {
    const created = await request(app).post("/api/notes").send({ title: "Delete me", content: "" });
    const del = await request(app).delete(`/api/notes/${created.body.id}`);
    expect(del.status).toBe(204);

    const get = await request(app).get(`/api/notes/${created.body.id}`);
    expect(get.status).toBe(404);
  });

  it("returns 404 when deleting a missing note", async () => {
    const res = await request(app).delete("/api/notes/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("persists a note across separate requests (survives a fresh app instance / reload)", async () => {
    const created = await request(app).post("/api/notes").send({ title: "Survives reload", content: "yes" });

    // A brand-new Express app instance, same DB — simulates a page refresh
    // reading from the persistent store rather than in-memory state.
    const reloadedApp = createApp();
    const res = await request(reloadedApp).get(`/api/notes/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Survives reload", content: "yes" });
  });
});
