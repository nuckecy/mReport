import { describe, expect, it } from "vitest";
import {
  decodeBase64ToBytes,
  reportMonthDate,
  reportMonthSlug,
  storageKey,
} from "@/lib/submit/path";
import type { Report } from "@/lib/parser";

// Minimal Report shim — these helpers only touch `source.monthIndex` and
// `source.year`. We don't need the full Report shape.
function fakeReport(monthIndex: number | null, year: number | null): Report {
  return { source: { monthIndex, year } } as unknown as Report;
}

describe("reportMonthDate", () => {
  it("returns the first of the month for valid input", () => {
    expect(reportMonthDate(fakeReport(9, 2025))).toBe("2025-10-01");
    expect(reportMonthDate(fakeReport(0, 2026))).toBe("2026-01-01");
    expect(reportMonthDate(fakeReport(11, 2025))).toBe("2025-12-01");
  });

  it("zero-pads single-digit months", () => {
    expect(reportMonthDate(fakeReport(2, 2025))).toBe("2025-03-01");
  });

  it("returns null when month or year is missing", () => {
    expect(reportMonthDate(fakeReport(null, 2025))).toBeNull();
    expect(reportMonthDate(fakeReport(9, null))).toBeNull();
    expect(reportMonthDate(fakeReport(null, null))).toBeNull();
  });
});

describe("reportMonthSlug", () => {
  it("formats YYYY-MM", () => {
    expect(reportMonthSlug(fakeReport(9, 2025))).toBe("2025-10");
    expect(reportMonthSlug(fakeReport(0, 2026))).toBe("2026-01");
  });
});

describe("storageKey", () => {
  const tenant = "00000000-0000-0000-0000-000000000001";
  const parish = "00000000-0000-0000-0000-000000000002";

  it("builds tenant/parish/month.xlsx", () => {
    expect(storageKey(tenant, parish, fakeReport(9, 2025))).toBe(
      `${tenant}/${parish}/2025-10.xlsx`,
    );
  });

  it("returns null when month is unknown", () => {
    expect(storageKey(tenant, parish, fakeReport(null, null))).toBeNull();
  });
});

describe("decodeBase64ToBytes", () => {
  it("round-trips through Node Buffer / browser atob", () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    const b64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(data).toString("base64")
        : btoa(String.fromCharCode(...data));
    const decoded = decodeBase64ToBytes(b64);
    expect(Array.from(decoded)).toEqual(Array.from(data));
  });

  it("handles empty input", () => {
    expect(decodeBase64ToBytes("").length).toBe(0);
  });
});
