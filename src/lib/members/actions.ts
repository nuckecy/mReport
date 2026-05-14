"use server";

// Members admin server actions.
//
// Every action calls `requireAdmin()` first, then validates input with Zod,
// then performs the write inside a Drizzle transaction. Each successful
// write logs a `mreport_audit_log` row.
//
// Actions:
//   inviteMemberAction       — invite a new user (Auth + core_users + tenant_user_role)
//   updateRoleAction         — change an existing member's mReport role
//   updateScopeAction        — change region/parish scope
//   deactivateMemberAction   — soft-delete tenant membership

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod"; // used in z.infer<typeof ...> below
import { db } from "@/lib/db";
import { coreApps, coreTenantUserRoles, coreTenantUsers, coreUsers } from "@/lib/db/schema/core";
import { mreportAuditLog, mreportUserScopes } from "@/lib/db/schema/mreport";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DeactivateMemberSchema,
  InviteMemberSchema,
  UpdateRoleSchema,
  UpdateScopeSchema,
  type InviteMemberInput,
  type MemberActionResult,
} from "./schemas";

// ── inviteMemberAction ───────────────────────────────────────────────

export async function inviteMemberAction(input: InviteMemberInput): Promise<MemberActionResult> {
  const session = await requireAdmin();
  const parsed = InviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      reason: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid invite payload.",
    };
  }
  const { email, name, role, regionId, parishId } = parsed.data;

  // 1. Create or find the auth.users row.
  const admin = createSupabaseAdminClient();
  let authUserId: string;
  try {
    // listUsers paginates; for Day 6 our tenants are small enough to scan
    // the first page. Day 7's optimization is to use Admin API search.
    const list = await admin.auth.admin.listUsers({ perPage: 200 });
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      authUserId = existing.id;
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true, // they'll set their password via the magic link
      });
      if (created.error || !created.data.user) {
        return {
          status: "error",
          reason: "auth_failed",
          message: created.error?.message ?? "Couldn't create the auth user.",
        };
      }
      authUserId = created.data.user.id;
    }
  } catch (err) {
    return {
      status: "error",
      reason: "auth_failed",
      message: err instanceof Error ? err.message : "Auth error.",
    };
  }

  // 2. Resolve the mreport app_id (FK target for tenant_user_roles).
  const apps = await db
    .select({ id: coreApps.id })
    .from(coreApps)
    .where(eq(coreApps.slug, "mreport"))
    .limit(1);
  const appId = apps[0]?.id;
  if (!appId) {
    return {
      status: "error",
      reason: "not_found",
      message: "mReport app isn't registered. Run 0003_mreport_seed_app.sql.",
    };
  }

  // 3. Guard against re-inviting an existing tenant member.
  const existingMembership = await db
    .select({ status: coreTenantUsers.status })
    .from(coreTenantUsers)
    .where(
      and(eq(coreTenantUsers.tenant_id, session.tenantId), eq(coreTenantUsers.user_id, authUserId)),
    )
    .limit(1);
  if (existingMembership[0]?.status === "active") {
    return {
      status: "error",
      reason: "already_member",
      message: `${email} is already an active member of this workspace.`,
    };
  }

  // 4. Transactional inserts.
  try {
    await db.transaction(async (tx) => {
      // core_users (upsert — they may already exist as a platform user
      // from another tenant).
      await tx
        .insert(coreUsers)
        .values({
          id: authUserId,
          email,
          name,
          email_verified: true,
          is_platform_admin: false,
        })
        .onConflictDoUpdate({
          target: coreUsers.id,
          set: { name, email, updated_at: new Date() },
        });

      // core_tenant_users (upsert — may have been deactivated previously)
      await tx
        .insert(coreTenantUsers)
        .values({
          tenant_id: session.tenantId,
          user_id: authUserId,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [coreTenantUsers.tenant_id, coreTenantUsers.user_id],
          set: { status: "active" },
        });

      // core_tenant_user_roles (upsert by tenant+user+app).
      await tx
        .insert(coreTenantUserRoles)
        .values({
          tenant_id: session.tenantId,
          user_id: authUserId,
          app_id: appId,
          role,
        })
        .onConflictDoUpdate({
          target: [
            coreTenantUserRoles.tenant_id,
            coreTenantUserRoles.user_id,
            coreTenantUserRoles.app_id,
          ],
          set: { role, assigned_at: new Date() },
        });

      // mreport_user_scopes — only for non-super_admin roles.
      if (role !== "super_admin") {
        await tx
          .insert(mreportUserScopes)
          .values({
            tenant_id: session.tenantId,
            user_id: authUserId,
            region_id: regionId ?? null,
            parish_id: parishId ?? null,
          })
          .onConflictDoUpdate({
            target: [mreportUserScopes.tenant_id, mreportUserScopes.user_id],
            set: {
              region_id: regionId ?? null,
              parish_id: parishId ?? null,
              updated_at: new Date(),
            },
          });
      } else {
        // super_admin gets no scope — clear any stale row.
        await tx
          .delete(mreportUserScopes)
          .where(
            and(
              eq(mreportUserScopes.tenant_id, session.tenantId),
              eq(mreportUserScopes.user_id, authUserId),
            ),
          );
      }

      await writeAudit(tx, {
        tenantId: session.tenantId,
        actorId: session.userId,
        actorEmail: session.email,
        action: "member.invited",
        targetId: authUserId,
        metadata: { email, role, region_id: regionId, parish_id: parishId },
      });
    });
  } catch (err) {
    return {
      status: "error",
      reason: "db_failed",
      message: err instanceof Error ? err.message : "Database error.",
    };
  }

  revalidatePath("/admin/members");
  return { status: "success", userId: authUserId };
}

// ── updateRoleAction ─────────────────────────────────────────────────

export async function updateRoleAction(
  input: z.infer<typeof UpdateRoleSchema>,
): Promise<MemberActionResult> {
  const session = await requireAdmin();
  const parsed = UpdateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      reason: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid role payload.",
    };
  }
  if (parsed.data.userId === session.userId) {
    return {
      status: "error",
      reason: "self_modify",
      message: "You can't change your own role. Ask another admin.",
    };
  }
  const apps = await db
    .select({ id: coreApps.id })
    .from(coreApps)
    .where(eq(coreApps.slug, "mreport"))
    .limit(1);
  const appId = apps[0]?.id;
  if (!appId) {
    return { status: "error", reason: "not_found", message: "mReport app isn't registered." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(coreTenantUserRoles)
        .values({
          tenant_id: session.tenantId,
          user_id: parsed.data.userId,
          app_id: appId,
          role: parsed.data.role,
        })
        .onConflictDoUpdate({
          target: [
            coreTenantUserRoles.tenant_id,
            coreTenantUserRoles.user_id,
            coreTenantUserRoles.app_id,
          ],
          set: { role: parsed.data.role, assigned_at: new Date() },
        });

      // Drop scope if promoted to super_admin.
      if (parsed.data.role === "super_admin") {
        await tx
          .delete(mreportUserScopes)
          .where(
            and(
              eq(mreportUserScopes.tenant_id, session.tenantId),
              eq(mreportUserScopes.user_id, parsed.data.userId),
            ),
          );
      }

      await writeAudit(tx, {
        tenantId: session.tenantId,
        actorId: session.userId,
        actorEmail: session.email,
        action: "member.role_updated",
        targetId: parsed.data.userId,
        metadata: { role: parsed.data.role },
      });
    });
  } catch (err) {
    return {
      status: "error",
      reason: "db_failed",
      message: err instanceof Error ? err.message : "Database error.",
    };
  }

  revalidatePath("/admin/members");
  return { status: "success", userId: parsed.data.userId };
}

// ── updateScopeAction ────────────────────────────────────────────────

export async function updateScopeAction(
  input: z.infer<typeof UpdateScopeSchema>,
): Promise<MemberActionResult> {
  const session = await requireAdmin();
  const parsed = UpdateScopeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      reason: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid scope payload.",
    };
  }
  const { userId, regionId, parishId } = parsed.data;
  // Enforce the CHECK constraint on the client side too for friendlier errors.
  const both = !!regionId && !!parishId;
  const neither = !regionId && !parishId;
  if (both || neither) {
    return {
      status: "error",
      reason: "invalid_input",
      message: "Pick exactly one of region or parish.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(mreportUserScopes)
        .values({
          tenant_id: session.tenantId,
          user_id: userId,
          region_id: regionId,
          parish_id: parishId,
        })
        .onConflictDoUpdate({
          target: [mreportUserScopes.tenant_id, mreportUserScopes.user_id],
          set: { region_id: regionId, parish_id: parishId, updated_at: new Date() },
        });

      await writeAudit(tx, {
        tenantId: session.tenantId,
        actorId: session.userId,
        actorEmail: session.email,
        action: "member.scope_updated",
        targetId: userId,
        metadata: { region_id: regionId, parish_id: parishId },
      });
    });
  } catch (err) {
    return {
      status: "error",
      reason: "db_failed",
      message: err instanceof Error ? err.message : "Database error.",
    };
  }

  revalidatePath("/admin/members");
  return { status: "success", userId };
}

// ── deactivateMemberAction ───────────────────────────────────────────

export async function deactivateMemberAction(
  input: z.infer<typeof DeactivateMemberSchema>,
): Promise<MemberActionResult> {
  const session = await requireAdmin();
  const parsed = DeactivateMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      reason: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  if (parsed.data.userId === session.userId) {
    return {
      status: "error",
      reason: "self_modify",
      message: "You can't deactivate yourself. Ask another admin.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(coreTenantUsers)
        .set({ status: "deactivated" })
        .where(
          and(
            eq(coreTenantUsers.tenant_id, session.tenantId),
            eq(coreTenantUsers.user_id, parsed.data.userId),
          ),
        );

      await writeAudit(tx, {
        tenantId: session.tenantId,
        actorId: session.userId,
        actorEmail: session.email,
        action: "member.deactivated",
        targetId: parsed.data.userId,
        metadata: {},
      });
    });
  } catch (err) {
    return {
      status: "error",
      reason: "db_failed",
      message: err instanceof Error ? err.message : "Database error.",
    };
  }

  revalidatePath("/admin/members");
  return { status: "success", userId: parsed.data.userId };
}

// ── Audit helpers ────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeAudit(
  tx: Tx,
  args: {
    tenantId: string;
    actorId: string;
    actorEmail: string | null;
    action: string;
    targetId: string;
    metadata: Record<string, unknown>;
  },
) {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 200) ?? null;

  await tx.insert(mreportAuditLog).values({
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    actor_email_masked: maskEmail(args.actorEmail),
    action: args.action,
    target_type: "core_users",
    target_id: args.targetId,
    ip,
    user_agent_summary: userAgent,
    metadata: args.metadata,
  });
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return email.slice(0, 2) + "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
