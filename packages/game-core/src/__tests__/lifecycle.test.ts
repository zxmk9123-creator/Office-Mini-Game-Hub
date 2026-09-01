import { describe, expect, it } from "vitest";
import {
  assertValidLifecycleTransition,
  InvalidLifecycleTransitionError,
  isValidLifecycleTransition,
} from "../lifecycle";

describe("lifecycle transitions", () => {
  it("allows the happy path idle -> ready -> playing -> finished -> result", () => {
    expect(isValidLifecycleTransition("idle", "ready")).toBe(true);
    expect(isValidLifecycleTransition("ready", "playing")).toBe(true);
    expect(isValidLifecycleTransition("playing", "finished")).toBe(true);
    expect(isValidLifecycleTransition("finished", "result")).toBe(true);
  });

  it("allows returning to idle from any non-idle state", () => {
    expect(isValidLifecycleTransition("ready", "idle")).toBe(true);
    expect(isValidLifecycleTransition("playing", "idle")).toBe(true);
    expect(isValidLifecycleTransition("finished", "idle")).toBe(true);
    expect(isValidLifecycleTransition("result", "idle")).toBe(true);
  });

  it("rejects skipping a stage", () => {
    expect(isValidLifecycleTransition("idle", "playing")).toBe(false);
    expect(isValidLifecycleTransition("ready", "finished")).toBe(false);
    expect(isValidLifecycleTransition("playing", "result")).toBe(false);
  });

  it("rejects moving backward through non-idle states", () => {
    expect(isValidLifecycleTransition("result", "finished")).toBe(false);
    expect(isValidLifecycleTransition("finished", "playing")).toBe(false);
    expect(isValidLifecycleTransition("playing", "ready")).toBe(false);
  });

  it("throws InvalidLifecycleTransitionError for an invalid transition", () => {
    expect(() => assertValidLifecycleTransition("idle", "playing")).toThrow(
      InvalidLifecycleTransitionError,
    );
  });

  it("does not throw for a valid transition", () => {
    expect(() => assertValidLifecycleTransition("idle", "ready")).not.toThrow();
  });
});
