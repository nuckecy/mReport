import { describe, expect, it } from "vitest";
import { fmt, fmtCount, fmtInt, fmtSmart, formatLongDate } from "@/lib/format";

describe("format helpers", () => {
  it("fmt: always 2 decimals, locale grouping", () => {
    expect(fmt(1070)).toBe("1,070.00");
    expect(fmt(0)).toBe("0.00");
    expect(fmt(null)).toBe("—");
  });

  it("fmtInt: integer with grouping, '—' for null", () => {
    expect(fmtInt(1234567)).toBe("1,234,567");
    expect(fmtInt(null)).toBe("—");
  });

  it("fmtCount: rounds before display (5.4 → 5, 5.5 → 6)", () => {
    expect(fmtCount(5)).toBe("5");
    expect(fmtCount(5.4)).toBe("5");
    expect(fmtCount(5.5)).toBe("6");
    expect(fmtCount(0)).toBe("0");
  });

  it("fmtSmart: integers display without trailing zeros, decimals retained", () => {
    expect(fmtSmart(5)).toBe("5");
    expect(fmtSmart(17.4)).toBe("17.4");
    expect(fmtSmart(63.75)).toBe("63.75");
  });

  it("formatLongDate: YYYY-MM-DD → 'Month D'", () => {
    expect(formatLongDate("2025-04-11")).toBe("April 11");
    expect(formatLongDate("2025-11-02")).toBe("November 2");
    expect(formatLongDate(null)).toBe(null);
  });
});
