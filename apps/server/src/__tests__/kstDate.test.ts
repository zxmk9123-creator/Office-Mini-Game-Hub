import { describe, expect, it } from "vitest";
import { kstDateString } from "../utils/kstDate";

describe("kstDateString", () => {
  it("same KST day -> same ranking period, even for two different UTC instants within it", () => {
    // 2026-06-15 00:00:00 KST == 2026-06-14 15:00:00 UTC
    // 2026-06-15 23:59:59 KST == 2026-06-15 14:59:59 UTC
    const early = new Date("2026-06-14T15:00:00.000Z");
    const late = new Date("2026-06-15T14:59:59.000Z");
    expect(kstDateString(early)).toBe("2026-06-15");
    expect(kstDateString(late)).toBe("2026-06-15");
    expect(kstDateString(early)).toBe(kstDateString(late));
  });

  it("23:59 KST falls on the previous date, not the next one", () => {
    // 2026-06-15 23:59:00 KST == 2026-06-15 14:59:00 UTC
    const almostMidnight = new Date("2026-06-15T14:59:00.000Z");
    expect(kstDateString(almostMidnight)).toBe("2026-06-15");
  });

  it("crossing 00:00 KST rolls over to a new date, exactly at the boundary", () => {
    // One second before midnight KST: 2026-06-15T14:59:59Z (still the 15th).
    const beforeMidnight = new Date("2026-06-15T14:59:59.000Z");
    // Exactly midnight KST: 2026-06-15T15:00:00Z (the 16th begins).
    const atMidnight = new Date("2026-06-15T15:00:00.000Z");
    expect(kstDateString(beforeMidnight)).toBe("2026-06-15");
    expect(kstDateString(atMidnight)).toBe("2026-06-16");
  });

  it("is independent of any particular server-local timezone interpretation (uses UTC getters on a shifted instant only)", () => {
    // A UTC midnight instant is afternoon in KST the same day — this only
    // holds if the function shifts by a fixed +9h offset and never
    // consults the host's local timezone setting.
    const utcMidnight = new Date("2026-03-10T00:00:00.000Z");
    expect(kstDateString(utcMidnight)).toBe("2026-03-10");
  });

  it("handles a month/year rollover at the KST boundary", () => {
    // 2026-01-01 00:00:00 KST == 2025-12-31 15:00:00 UTC
    const justBeforeNewYearKst = new Date("2025-12-31T14:59:59.000Z");
    const newYearKst = new Date("2025-12-31T15:00:00.000Z");
    expect(kstDateString(justBeforeNewYearKst)).toBe("2025-12-31");
    expect(kstDateString(newYearKst)).toBe("2026-01-01");
  });
});
