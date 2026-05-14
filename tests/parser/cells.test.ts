import { describe, expect, it } from "vitest";
import {
  findAllCells,
  findCell,
  findEmailInSheet,
  findMobileInSheet,
  valueForHeaderLabel,
  valueRightOf,
} from "@/lib/parser/cells";
import { buildSheet } from "./sheet-builder";

describe("findCell / findAllCells (§11.3 substring vs equality)", () => {
  it("findCell uses case-insensitive substring match for strings", () => {
    const sheet = buildSheet([["95% of Offering", "5% of Offering"]]);
    // "offering" as substring matches both — first wins.
    const hit = findCell(sheet, "offering");
    expect(hit).not.toBeNull();
    expect(hit!.raw).toBe("95% of Offering");
  });

  it("findAllCells uses EQUALITY for strings — substring would over-match", () => {
    const sheet = buildSheet([["Offering", "95% of Offering", "5% of Offering"]]);
    const hits = findAllCells(sheet, "offering");
    // Only the bare "Offering" header matches under equality.
    expect(hits).toHaveLength(1);
    expect(hits[0]!.c).toBe(0);
  });

  it("negative lookbehind on percentage patterns avoids 5% matching inside 55% (§11.3)", () => {
    const sheet = buildSheet([
      [null, null, null],
      [null, "55% of Tithe", "1408.55"],
      [null, "5% of Tithe", "128.05"],
    ]);
    // The bug: /5%\s*of\s*tithe/i matched "55% of Tithe" before the fix.
    const hit = findCell(sheet, /(?<!\d)5%\s*of\s*tithe$/i);
    expect(hit).not.toBeNull();
    expect(hit!.raw).toBe("5% of Tithe");
    expect(hit!.r).toBe(2);
  });
});

describe("valueRightOf — known-limitation case (§11.1)", () => {
  it("returns the NEXT LABEL when same-row labels separated by blanks", () => {
    const sheet = buildSheet([["Name Of Parish", null, null, null, "Pastor In Charge"]]);
    // This is the documented bug behavior. valueRightOf walks right, finds
    // "Pastor In Charge" as the next non-empty cell, returns it as the parish
    // "value". valueForHeaderLabel is the fix.
    expect(valueRightOf(sheet, "Name Of Parish")).toBe("Pastor In Charge");
  });
});

describe("valueForHeaderLabel (§11.1, §11.14 fix)", () => {
  it("prefers the cell directly below over right-walking", () => {
    const sheet = buildSheet([
      ["Name Of Parish", null, null, null, "Pastor In Charge"],
      ["Mount Zion Berlin", null, null, null, "Pastor John Doe"],
    ]);
    expect(valueForHeaderLabel(sheet, "Name Of Parish")).toBe("Mount Zion Berlin");
    expect(valueForHeaderLabel(sheet, "Pastor In Charge")).toBe("Pastor John Doe");
  });

  it("falls back to right-walking when cell below is empty", () => {
    const sheet = buildSheet([
      ["Mobile", "+49 30 1234 5678"],
      // No value below the label — fallback path.
    ]);
    expect(valueForHeaderLabel(sheet, "Mobile")).toBe("+49 30 1234 5678");
  });
});

describe("findMobileInSheet — phone-shape heuristic", () => {
  it("matches phone-shaped strings", () => {
    const sheet = buildSheet([["+49 30 1234 5678"]]);
    expect(findMobileInSheet(sheet)).toBe("+49 30 1234 5678");
  });

  it("ignores short numeric cells (≤6 digits, no formatting)", () => {
    const sheet = buildSheet([["123456"]]);
    expect(findMobileInSheet(sheet)).toBeNull();
  });

  it("requires >=9 digits OR a formatting char to avoid attendance-count false positives", () => {
    const sheet = buildSheet([["1234567"]]); // 7 digits, no formatting — should be rejected
    expect(findMobileInSheet(sheet)).toBeNull();
  });

  it("accepts 7+ digits when the value contains a formatting character", () => {
    const sheet = buildSheet([["123-4567"]]);
    expect(findMobileInSheet(sheet)).toBe("123-4567");
  });

  it("accepts long all-digit strings (9+) without formatting", () => {
    const sheet = buildSheet([["491234567890"]]);
    expect(findMobileInSheet(sheet)).toBe("491234567890");
  });
});

describe("findEmailInSheet", () => {
  it("matches standard email shapes", () => {
    const sheet = buildSheet([["John Smith", "john@parish.org"]]);
    expect(findEmailInSheet(sheet)).toBe("john@parish.org");
  });

  it("returns null when no email-shaped cell exists", () => {
    const sheet = buildSheet([["just text", "no email here"]]);
    expect(findEmailInSheet(sheet)).toBeNull();
  });
});
