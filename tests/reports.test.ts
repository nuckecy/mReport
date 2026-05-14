import { describe, expect, it } from "vitest";
import { parseReportFilters } from "@/lib/reports/filters";

const VALID_UUID = "9d4a8c2e-3f5b-4a1c-9d7f-1a2b3c4d5e6f";

describe("parseReportFilters", () => {
  it("returns nulls for empty input", () => {
    expect(parseReportFilters({})).toEqual({
      parishId: null,
      month: null,
      status: null,
    });
  });

  it("accepts a valid parish UUID", () => {
    expect(parseReportFilters({ parish: VALID_UUID })).toEqual({
      parishId: VALID_UUID,
      month: null,
      status: null,
    });
  });

  it("rejects a malformed parish UUID", () => {
    expect(parseReportFilters({ parish: "not-a-uuid" }).parishId).toBeNull();
  });

  it("rejects a non-string parish param", () => {
    expect(parseReportFilters({ parish: 42 as unknown as string }).parishId).toBeNull();
  });

  it("accepts month formatted YYYY-MM", () => {
    expect(parseReportFilters({ month: "2025-10" }).month).toBe("2025-10");
    expect(parseReportFilters({ month: "2026-01" }).month).toBe("2026-01");
    expect(parseReportFilters({ month: "2026-12" }).month).toBe("2026-12");
  });

  it("rejects malformed month strings", () => {
    expect(parseReportFilters({ month: "October 2025" }).month).toBeNull();
    expect(parseReportFilters({ month: "2025-13" }).month).toBeNull();
    expect(parseReportFilters({ month: "2025-00" }).month).toBeNull();
    expect(parseReportFilters({ month: "25-10" }).month).toBeNull();
    expect(parseReportFilters({ month: "2025-10-01" }).month).toBeNull();
  });

  it("only accepts the three known status values", () => {
    expect(parseReportFilters({ status: "submitted" }).status).toBe("submitted");
    expect(parseReportFilters({ status: "amended" }).status).toBe("amended");
    expect(parseReportFilters({ status: "superseded" }).status).toBe("superseded");
    expect(parseReportFilters({ status: "draft" }).status).toBeNull();
    expect(parseReportFilters({ status: "" }).status).toBeNull();
  });

  it("composes all three filters", () => {
    expect(
      parseReportFilters({
        parish: VALID_UUID,
        month: "2025-10",
        status: "submitted",
      }),
    ).toEqual({
      parishId: VALID_UUID,
      month: "2025-10",
      status: "submitted",
    });
  });
});
