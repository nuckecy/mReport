import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect-safety";

/**
 * Open-redirect defense. Each case below was a real-world attack pattern at
 * some point — we keep them as regression tests.
 */
describe("safeNextPath", () => {
  it("returns / for empty/missing values", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("accepts simple absolute paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/upload")).toBe("/upload");
    expect(safeNextPath("/admin/reports")).toBe("/admin/reports");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("//evil.com/path")).toBe("/");
  });

  it("rejects backslash-prefixed scape-doors", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });

  it("rejects non-leading-slash paths", () => {
    expect(safeNextPath("upload")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects URL-encoded escapes that decode into unsafe forms", () => {
    expect(safeNextPath("%2F%2Fevil.com")).toBe("/");
    expect(safeNextPath("%2Fadmin")).toBe("/admin");
  });

  it("returns / for malformed encoding without throwing", () => {
    expect(safeNextPath("%E0")).toBe("/");
  });
});
