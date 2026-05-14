// Zod schemas for the members admin actions.
//
// Lives in its own module (separate from `actions.ts`) so unit tests can
// import the schemas without pulling in the Drizzle client + Supabase
// admin client at module-load time. Both the action file and the tests
// import from here.

import { z } from "zod";

const ROLE_VALUES = ["super_admin", "regional_admin", "parish_admin", "preparer"] as const;

export type MemberRoleValue = (typeof ROLE_VALUES)[number];

export const InviteMemberSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    name: z.string().trim().min(1, "Name is required.").max(120),
    role: z.enum(ROLE_VALUES),
    regionId: z.string().uuid().optional(),
    parishId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "super_admin") {
      if (data.regionId || data.parishId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "super_admin members don't take a region or parish scope.",
          path: ["role"],
        });
      }
      return;
    }
    const hasRegion = !!data.regionId;
    const hasParish = !!data.parishId;
    if (!hasRegion && !hasParish) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a region or parish for this role.",
        path: ["regionId"],
      });
    }
    if (hasRegion && hasParish) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick either a region or a parish, not both.",
        path: ["regionId"],
      });
    }
  });

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
});

export const UpdateScopeSchema = z.object({
  userId: z.string().uuid(),
  regionId: z.string().uuid().nullable(),
  parishId: z.string().uuid().nullable(),
});

export const DeactivateMemberSchema = z.object({
  userId: z.string().uuid(),
});

// ── Result types ─────────────────────────────────────────────────────

export type MemberActionResult =
  | { status: "success"; userId: string }
  | { status: "error"; reason: MemberErrorReason; message: string };

export type MemberErrorReason =
  | "invalid_input"
  | "auth_failed"
  | "already_member"
  | "not_found"
  | "self_modify"
  | "db_failed";
