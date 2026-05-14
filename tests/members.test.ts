import { describe, expect, it } from "vitest";
import {
  DeactivateMemberSchema,
  InviteMemberSchema,
  UpdateRoleSchema,
  UpdateScopeSchema,
} from "@/lib/members/schemas";

// These tests focus on the Zod schemas — pure functions that don't touch
// the DB or Supabase. They cover the cross-field validation branches
// (super_admin rejects scope, every other role requires exactly one
// scope) that the action relies on for friendly error messages.

// Valid UUID v4 strings — Zod 4 enforces v1-v8 conformance, so the
// repeating-digit values used in earlier scaffolding don't pass.
const REGION = "9d4a8c2e-3f5b-4a1c-9d7f-1a2b3c4d5e6f";
const PARISH = "7c5e8b1d-4a3f-4b2e-8c6d-2a3b4c5d6e7f";
const USER = "6b8d3f2a-5c7e-4f1d-9a3b-3c4d5e6f7a8b";

describe("InviteMemberSchema", () => {
  it("accepts a valid super_admin invite without scope", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "Alice",
      role: "super_admin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects super_admin with a region", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "Alice",
      role: "super_admin",
      regionId: REGION,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/super_admin members/i);
    }
  });

  it("rejects preparer without scope", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "Alice",
      role: "preparer",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/pick a region or parish/i);
    }
  });

  it("rejects preparer with both region AND parish", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "Alice",
      role: "preparer",
      regionId: REGION,
      parishId: PARISH,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/either a region or a parish/i);
    }
  });

  it("accepts parish_admin with only parish", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "Alice",
      role: "parish_admin",
      parishId: PARISH,
    });
    expect(result.success).toBe(true);
  });

  it("accepts regional_admin with only region", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "Alice",
      role: "regional_admin",
      regionId: REGION,
    });
    expect(result.success).toBe(true);
  });

  it("normalizes the email (trim + lowercase)", () => {
    const result = InviteMemberSchema.safeParse({
      email: "  ALICE@parish.org  ",
      name: "Alice",
      role: "super_admin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@parish.org");
    }
  });

  it("rejects invalid email", () => {
    const result = InviteMemberSchema.safeParse({
      email: "not-an-email",
      name: "Alice",
      role: "super_admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = InviteMemberSchema.safeParse({
      email: "alice@parish.org",
      name: "   ",
      role: "super_admin",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateRoleSchema", () => {
  it("accepts a valid role transition", () => {
    expect(UpdateRoleSchema.safeParse({ userId: USER, role: "parish_admin" }).success).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(UpdateRoleSchema.safeParse({ userId: USER, role: "owner" }).success).toBe(false);
  });

  it("rejects non-UUID userIds", () => {
    expect(UpdateRoleSchema.safeParse({ userId: "not-a-uuid", role: "preparer" }).success).toBe(
      false,
    );
  });
});

describe("UpdateScopeSchema", () => {
  it("accepts region-only", () => {
    expect(
      UpdateScopeSchema.safeParse({ userId: USER, regionId: REGION, parishId: null }).success,
    ).toBe(true);
  });

  it("accepts parish-only", () => {
    expect(
      UpdateScopeSchema.safeParse({ userId: USER, regionId: null, parishId: PARISH }).success,
    ).toBe(true);
  });

  it("Zod-accepts both — the action runtime rejects, not the schema", () => {
    // The CHECK is at action level (not on the schema) because it needs
    // a nuanced message. Schema only enforces UUID shape + nullable.
    const result = UpdateScopeSchema.safeParse({
      userId: USER,
      regionId: REGION,
      parishId: PARISH,
    });
    expect(result.success).toBe(true);
  });
});

describe("DeactivateMemberSchema", () => {
  it("requires a UUID userId", () => {
    expect(DeactivateMemberSchema.safeParse({ userId: USER }).success).toBe(true);
    expect(DeactivateMemberSchema.safeParse({ userId: "x" }).success).toBe(false);
  });
});
