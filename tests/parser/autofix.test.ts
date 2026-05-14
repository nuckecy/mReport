import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyPatch } from "@/lib/parser/autofix";
import type { Failure } from "@/lib/validation";
import { buildSheet } from "./sheet-builder";

function fakeFailure(overrides: Partial<Failure>): Failure {
  const base: Failure = {
    check: {
      section: "Statistics",
      label: "Converts (per-date sum vs Total row)",
      calc: 5,
      actual: 0,
    },
    subType: "forgot-to-total",
    severity: "warn",
    cellAddress: "P48",
    autoFixable: true,
    title: "",
    explanation: "",
    fixText: "",
  };
  return { ...base, ...overrides };
}

describe("applyPatch", () => {
  it("writes the calculated value into the target cell and returns the fix record", () => {
    const sheet = buildSheet([
      // We only care about cell P48 (col 15, row 47).
    ]);
    // Manually seed P48 with the original value.
    sheet["P48"] = { t: "n", v: 0, w: "0" };
    sheet["!ref"] = "A1:P48";
    const wb: XLSX.WorkBook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: sheet } };

    const outcome = applyPatch(wb, fakeFailure({}));
    expect(outcome.ok).toBe(true);
    expect(outcome.fix).toBeDefined();
    expect(outcome.fix!.cellAddress).toBe("P48");
    expect(outcome.fix!.newValue).toBe(5);
    expect(outcome.fix!.oldValue).toBe(0);

    const patched = sheet["P48"]!;
    expect(patched.v).toBe(5);
    expect(patched.t).toBe("n");
    expect(patched.w).toBeUndefined();
    expect(patched.f).toBeUndefined();
  });

  it("refuses when cellAddress is null", () => {
    const wb: XLSX.WorkBook = {
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: { "!ref": "A1:A1" } },
    };
    const outcome = applyPatch(wb, fakeFailure({ cellAddress: null }));
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/no cell address/i);
  });

  it("refuses when the workbook has no sheets", () => {
    const wb: XLSX.WorkBook = { SheetNames: [], Sheets: {} };
    const outcome = applyPatch(wb, fakeFailure({}));
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/empty/i);
  });

  it("refuses when calc is not a finite number", () => {
    const sheet = buildSheet([]);
    sheet["P48"] = { t: "n", v: 0 };
    sheet["!ref"] = "A1:P48";
    const wb: XLSX.WorkBook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: sheet } };
    const outcome = applyPatch(
      wb,
      fakeFailure({
        check: {
          section: "Statistics",
          label: "X",
          calc: Number.POSITIVE_INFINITY,
          actual: 0,
        },
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/not a finite/i);
  });

  it("preserves existing cell metadata while overwriting v/t/w/f", () => {
    const sheet = buildSheet([]);
    sheet["P48"] = {
      t: "n",
      v: 99,
      w: "99",
      f: "=SUM(P40:P47)",
      s: { fill: { bgColor: { rgb: "FFFFFF" } } } as unknown as never,
    };
    sheet["!ref"] = "A1:P48";
    const wb: XLSX.WorkBook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: sheet } };

    const outcome = applyPatch(
      wb,
      fakeFailure({ check: { section: "Statistics", label: "X", calc: 5, actual: 99 } }),
    );
    expect(outcome.ok).toBe(true);
    const patched = sheet["P48"] as Record<string, unknown>;
    expect(patched.v).toBe(5);
    expect(patched.f).toBeUndefined();
    expect(patched.w).toBeUndefined();
    // The non-v/t/w/f keys survive (e.g., style metadata).
    expect(patched.s).toBeDefined();
  });
});
