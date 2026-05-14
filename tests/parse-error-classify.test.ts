import { describe, expect, it } from "vitest";
import { classifyParseError } from "@/app/upload/ParseErrorCard";

// The classifier maps raw error messages (parser throws + dropzone
// guards) to one of four diagnosis categories. These tests anchor the
// matching rules so future copy edits don't accidentally break the UX.

describe("classifyParseError", () => {
  it("not-xlsx — bad extension guard", () => {
    expect(
      classifyParseError(
        "That file isn't an .xlsx. Export the parish report as Excel and try again.",
      ),
    ).toBe("not-xlsx");
  });

  it("corrupt — magic-byte mismatch", () => {
    expect(
      classifyParseError(
        "The file doesn't look like a real .xlsx. It may be corrupted or renamed from a different format.",
      ),
    ).toBe("corrupt");
  });

  it("corrupt — empty workbook", () => {
    expect(classifyParseError("The workbook contains no sheets.")).toBe("corrupt");
  });

  it("corrupt — missing sheet reference", () => {
    expect(classifyParseError(`Sheet "Sheet1" is missing from the workbook.`)).toBe("corrupt");
  });

  it("corrupt — typical SheetJS read failures", () => {
    expect(classifyParseError("Unsupported file format")).toBe("corrupt");
    expect(classifyParseError("Can't find end of central directory")).toBe("corrupt");
  });

  it("wrong-template — parsed but no grand-total", () => {
    expect(classifyParseError("Could not locate the grand-total row in the report.")).toBe(
      "wrong-template",
    );
  });

  it("unknown — anything else", () => {
    expect(classifyParseError("Network request failed")).toBe("unknown");
    expect(classifyParseError("")).toBe("unknown");
  });

  it("is case-insensitive on the diagnostic substrings", () => {
    expect(classifyParseError("THE FILE DOESN'T LOOK LIKE A REAL .xlsx")).toBe("corrupt");
    expect(classifyParseError("Could Not Locate The Grand-Total Row")).toBe("wrong-template");
  });
});
