import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, listNotes } from "../api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function htmlResponse(status: number, html: string): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html" } });
}

describe("api client request()", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the parsed body on a normal 200 JSON response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []));
    await expect(listNotes()).resolves.toEqual([]);
  });

  it("throws instead of silently resolving to undefined when a 200 response body isn't valid JSON", async () => {
    // Reproduces "/api/notes" being caught by a SPA rewrite and served
    // index.html with a 200 status instead of reaching the real API.
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse(200, "<!doctype html><html><head><title>메모장</title></head><body></body></html>"),
    );
    await expect(listNotes()).rejects.toBeInstanceOf(ApiError);
  });

  it("still throws ApiError as before for a non-2xx JSON error response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { message: "boom" }));
    await expect(listNotes()).rejects.toMatchObject({ status: 500, body: { message: "boom" } });
  });
});
