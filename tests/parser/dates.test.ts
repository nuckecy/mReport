import { describe, expect, it } from "vitest";
import { detectMonthYear, excelDateToJS, parseStringDate, ymd } from "@/lib/parser/dates";
import { buildSheet } from "./sheet-builder";

describe("excelDateToJS — local-midnight construction (§11.4)", () => {
  it("returns the same Date instance when given one", () => {
    const d = new Date(2025, 9, 5);
    expect(excelDateToJS(d)).toBe(d);
  });

  it("converts an Excel serial to a local-midnight Date", () => {
    // 45935 = 2025-10-05 in Excel's 1900 epoch.
    const d = excelDateToJS(45935);
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(9); // October
    expect(d!.getDate()).toBe(5);
  });

  it("delegates to parseStringDate for string inputs", () => {
    const d = excelDateToJS("2025-11-02");
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(10);
    expect(d!.getDate()).toBe(2);
  });

  it("returns null for unknown types", () => {
    expect(excelDateToJS(null)).toBeNull();
    expect(excelDateToJS({})).toBeNull();
  });
});

describe("parseStringDate (§11.8 string-date support)", () => {
  it("parses ISO YYYY-MM-DD", () => {
    const d = parseStringDate("2025-04-11");
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getDate()).toBe(11);
  });

  it("parses German DD.MM.YYYY (the October-2025 old template)", () => {
    const d = parseStringDate("05.10.2025");
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(9); // October
    expect(d!.getDate()).toBe(5);
  });

  it("parses European DD/MM/YYYY", () => {
    const d = parseStringDate("05/10/2025");
    expect(d!.getMonth()).toBe(9);
    expect(d!.getDate()).toBe(5);
  });

  it("bumps two-digit years to 2000+", () => {
    const d = parseStringDate("05.10.25");
    expect(d!.getFullYear()).toBe(2025);
  });

  it("returns null for unparseable input", () => {
    expect(parseStringDate("")).toBeNull();
    expect(parseStringDate("not a date")).toBeNull();
  });
});

describe("ymd — local components, never UTC (§11.4)", () => {
  it("formats with zero-padded month and day", () => {
    expect(ymd(new Date(2025, 0, 1))).toBe("2025-01-01");
    expect(ymd(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("returns null for invalid dates", () => {
    expect(ymd(new Date("invalid"))).toBeNull();
    expect(ymd(null)).toBeNull();
  });
});

describe("detectMonthYear — defensive guards", () => {
  it("rejects pre-2000 dates (§11.2 — Excel 1900 epoch leak)", () => {
    // Synthetic: a numeric cell that, if naively coerced, would land near 1899-12-31.
    // We provide ONLY dates that are typed correctly; the bug was that the
    // old parser coerced every numeric cell. With the fix, raw numbers don't
    // get treated as dates at all, so this resolves cleanly.
    const sheet = buildSheet([
      [{ t: "n", v: 1 }], // raw number — not a date in the new flow
      [{ t: "d", v: new Date(Date.UTC(2025, 9, 5)) }], // Sunday in Oct 2025
      [{ t: "d", v: new Date(Date.UTC(2025, 9, 12)) }],
    ]);
    const detected = detectMonthYear(sheet);
    expect(detected.year).toBe(2025);
    expect(detected.month).toBe(9);
    expect(detected.label).toBe("October 2025");
  });

  it("re-anchors UTC-midnight Dates to local components (§11.5)", () => {
    // Simulate SheetJS's UTC-midnight return for a serial.
    const utcMidnight = new Date(Date.UTC(2025, 10, 2)); // Nov 2 UTC
    const sheet = buildSheet([[{ t: "d", v: utcMidnight }]]);
    const detected = detectMonthYear(sheet);
    // After re-anchoring, the local-time month should still be November.
    expect(detected.month).toBe(10);
    expect(detected.year).toBe(2025);
  });

  it("supports string-date cells (§11.8)", () => {
    const sheet = buildSheet([
      [{ t: "s", v: "05.10.2025" }],
      [{ t: "s", v: "12.10.2025" }],
      [{ t: "s", v: "19.10.2025" }],
      [{ t: "s", v: "26.10.2025" }],
    ]);
    const detected = detectMonthYear(sheet);
    expect(detected.year).toBe(2025);
    expect(detected.month).toBe(9);
  });

  it("returns Unknown when no date cells exist", () => {
    const sheet = buildSheet([["just text"]]);
    expect(detectMonthYear(sheet)).toEqual({ month: null, year: null, label: "Unknown" });
  });

  it("prefers Sundays when both Sundays and non-Sundays exist", () => {
    // Use UTC midnight to match what SheetJS produces — the parser re-anchors
    // via getUTC* so local-time Date constructors would shift in non-UTC zones.
    const sheet = buildSheet([
      [{ t: "d", v: new Date(Date.UTC(2025, 9, 5)) }], // Sun
      [{ t: "d", v: new Date(Date.UTC(2025, 9, 12)) }], // Sun
      [{ t: "d", v: new Date(Date.UTC(2025, 11, 1)) }], // Mon — different month
    ]);
    const detected = detectMonthYear(sheet);
    expect(detected.month).toBe(9);
  });
});
