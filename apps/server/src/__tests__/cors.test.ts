import { describe, expect, it } from "vitest";
import { resolveCorsOrigins } from "../cors";

describe("resolveCorsOrigins", () => {
  it("defaults to the local Vite dev origin when unset", () => {
    expect(resolveCorsOrigins(undefined)).toEqual(["http://localhost:5173"]);
  });

  it("defaults when the env var is present but blank", () => {
    expect(resolveCorsOrigins("   ")).toEqual(["http://localhost:5173"]);
  });

  it("parses a single configured origin", () => {
    expect(resolveCorsOrigins("https://app.example.com")).toEqual(["https://app.example.com"]);
  });

  it("parses multiple comma-separated origins and trims whitespace", () => {
    expect(resolveCorsOrigins("https://a.example.com, https://b.example.com ,https://c.example.com")).toEqual([
      "https://a.example.com",
      "https://b.example.com",
      "https://c.example.com",
    ]);
  });

  it("drops empty entries from a trailing comma", () => {
    expect(resolveCorsOrigins("https://a.example.com,")).toEqual(["https://a.example.com"]);
  });
});
