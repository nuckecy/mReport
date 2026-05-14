"use client";

// Members table + invite / edit / deactivate UI.
//
// We use plain `<dialog>` elements (popover-style) because we haven't
// pulled in shadcn's Dialog primitive yet. Day 7 may refactor to a
// proper modal primitive when the admin surfaces grow.
//
// Each action returns a result object — `MemberActionResult` — which we
// surface inline (success toast or error message) without a full
// navigation. `revalidatePath('/admin/members')` in the action makes
// Next 16 re-fetch and re-render the server component.

import { useState, useTransition } from "react";
import { Pencil, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  deactivateMemberAction,
  inviteMemberAction,
  updateRoleAction,
  updateScopeAction,
} from "@/lib/members/actions";
import type { MemberActionResult } from "@/lib/members/schemas";
import type { Member } from "@/lib/members/queries";
import type { ScopeOption } from "@/lib/members/queries";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super admin" },
  { value: "regional_admin", label: "Regional admin" },
  { value: "parish_admin", label: "Parish admin" },
  { value: "preparer", label: "Preparer" },
] as const;

type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

const ROLE_BADGE: Record<RoleValue | "none", string> = {
  super_admin: "bg-info-bg text-info",
  regional_admin: "bg-good-bg text-good",
  parish_admin: "bg-warn-bg text-warn",
  preparer: "bg-panel-2 text-text-muted",
  none: "bg-panel-2 text-text-subtle",
};

const ROLE_LABEL: Record<RoleValue, string> = {
  super_admin: "Super admin",
  regional_admin: "Regional admin",
  parish_admin: "Parish admin",
  preparer: "Preparer",
};

export interface MembersTableProps {
  currentUserId: string;
  members: Member[];
  scopeOptions: ScopeOption[];
}

type DialogState =
  | { kind: "none" }
  | { kind: "invite" }
  | { kind: "edit"; member: Member }
  | { kind: "deactivate"; member: Member };

export function MembersTable({ currentUserId, members, scopeOptions }: MembersTableProps) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const close = () => {
    setDialog({ kind: "none" });
  };

  const handleResult = (result: MemberActionResult, successMessage: string) => {
    if (result.status === "success") {
      setFeedback({ kind: "success", message: successMessage });
      close();
    } else {
      setFeedback({ kind: "error", message: result.message });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={() => setDialog({ kind: "invite" })}>
          <UserPlus className="size-4" aria-hidden />
          Invite member
        </Button>
      </div>

      {feedback ? (
        <Card
          className={cn(
            feedback.kind === "success" ? "border-good/40 bg-good-bg" : "border-bad/40 bg-bad-bg",
          )}
        >
          <CardContent className="p-3">
            <p className={cn("text-sm", feedback.kind === "success" ? "text-good" : "text-bad")}>
              {feedback.message}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-panel-2 text-text-muted">
              <tr className="text-left text-xs tracking-wide uppercase">
                <th className="px-4 py-2 font-medium">Member</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-border border-t">
                  <td className="px-4 py-3">
                    <p className="text-text font-medium">{m.name ?? m.email}</p>
                    <p className="text-text-muted text-xs">{m.email}</p>
                    {m.isPlatformAdmin ? (
                      <p className="text-info mt-0.5 inline-flex items-center gap-1 text-xs">
                        <ShieldCheck className="size-3" aria-hidden /> Platform admin
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium",
                        ROLE_BADGE[m.role ?? "none"],
                      )}
                    >
                      {m.role ? ROLE_LABEL[m.role] : "No role"}
                    </span>
                  </td>
                  <td className="text-text-muted px-4 py-3 text-xs">
                    {m.parishName
                      ? `Parish · ${m.parishName}`
                      : m.regionName
                        ? `Region · ${m.regionName}`
                        : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium",
                        m.membershipStatus === "active"
                          ? "bg-good-bg text-good"
                          : "bg-panel-2 text-text-subtle",
                      )}
                    >
                      {m.membershipStatus === "active" ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: "edit", member: m })}
                        disabled={m.membershipStatus === "deactivated"}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ kind: "deactivate", member: m })}
                        disabled={
                          m.userId === currentUserId || m.membershipStatus === "deactivated"
                        }
                      >
                        <ShieldOff className="size-3.5" aria-hidden />
                        Deactivate
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-text-muted px-4 py-8 text-center text-sm">
                    No members yet. Invite someone to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {dialog.kind === "invite" ? (
        <InviteDialog
          scopeOptions={scopeOptions}
          onClose={close}
          onResult={(result, email) =>
            handleResult(result, `Invited ${email}. They'll receive a sign-in link.`)
          }
        />
      ) : null}

      {dialog.kind === "edit" ? (
        <EditDialog
          member={dialog.member}
          scopeOptions={scopeOptions}
          onClose={close}
          onResult={(result) => handleResult(result, "Member updated.")}
        />
      ) : null}

      {dialog.kind === "deactivate" ? (
        <DeactivateDialog
          member={dialog.member}
          onClose={close}
          onResult={(result) => handleResult(result, `${dialog.member.email} deactivated.`)}
        />
      ) : null}
    </div>
  );
}

// ── Invite dialog ────────────────────────────────────────────────────

function InviteDialog({
  scopeOptions,
  onClose,
  onResult,
}: {
  scopeOptions: ScopeOption[];
  onClose: () => void;
  onResult: (result: MemberActionResult, email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleValue>("preparer");
  const [scopeKey, setScopeKey] = useState<string>(""); // "region:uuid" or "parish:uuid"
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  const requiresScope = role !== "super_admin";
  const parsedScope = parseScopeKey(scopeKey);

  return (
    <DialogShell title="Invite member" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setLocalError(null);
          if (requiresScope && !parsedScope) {
            setLocalError("Pick a region or parish for this role.");
            return;
          }
          startTransition(async () => {
            const result = await inviteMemberAction({
              email,
              name,
              role,
              regionId: parsedScope?.type === "region" ? parsedScope.id : undefined,
              parishId: parsedScope?.type === "parish" ? parsedScope.id : undefined,
            });
            onResult(result, email);
          });
        }}
      >
        <FormField label="Email">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@parish.org"
          />
        </FormField>
        <FormField label="Display name">
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice Sample"
          />
        </FormField>
        <FormField label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </FormField>
        {requiresScope ? (
          <FormField label="Scope">
            <ScopeSelect options={scopeOptions} value={scopeKey} onChange={setScopeKey} />
          </FormField>
        ) : null}
        {localError ? (
          <p role="alert" className="text-bad text-xs">
            {localError}
          </p>
        ) : null}
        <DialogActions>
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Inviting…" : "Send invite"}
          </Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
}

// ── Edit dialog ──────────────────────────────────────────────────────

function EditDialog({
  member,
  scopeOptions,
  onClose,
  onResult,
}: {
  member: Member;
  scopeOptions: ScopeOption[];
  onClose: () => void;
  onResult: (result: MemberActionResult) => void;
}) {
  const initialScopeKey = member.regionId
    ? `region:${member.regionId}`
    : member.parishId
      ? `parish:${member.parishId}`
      : "";
  const [role, setRole] = useState<RoleValue>(member.role ?? "preparer");
  const [scopeKey, setScopeKey] = useState<string>(initialScopeKey);
  const [pending, startTransition] = useTransition();
  const requiresScope = role !== "super_admin";
  const parsedScope = parseScopeKey(scopeKey);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    setLocalError(null);
    if (requiresScope && !parsedScope) {
      setLocalError("Pick a region or parish for this role.");
      return;
    }
    startTransition(async () => {
      // Role first — if it changed, push that. Scope second.
      const roleChanged = role !== (member.role ?? "preparer");
      let lastResult: MemberActionResult = {
        status: "success",
        userId: member.userId,
      };
      if (roleChanged) {
        lastResult = await updateRoleAction({ userId: member.userId, role });
        if (lastResult.status === "error") {
          onResult(lastResult);
          return;
        }
      }
      if (requiresScope) {
        const scopeResult = await updateScopeAction({
          userId: member.userId,
          regionId: parsedScope?.type === "region" ? parsedScope.id : null,
          parishId: parsedScope?.type === "parish" ? parsedScope.id : null,
        });
        lastResult = scopeResult;
      }
      onResult(lastResult);
    });
  };

  return (
    <DialogShell title={`Edit · ${member.name ?? member.email}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <FormField label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </FormField>
        {requiresScope ? (
          <FormField label="Scope">
            <ScopeSelect options={scopeOptions} value={scopeKey} onChange={setScopeKey} />
          </FormField>
        ) : null}
        {localError ? (
          <p role="alert" className="text-bad text-xs">
            {localError}
          </p>
        ) : null}
        <DialogActions>
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="md" disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </div>
    </DialogShell>
  );
}

// ── Deactivate dialog ────────────────────────────────────────────────

function DeactivateDialog({
  member,
  onClose,
  onResult,
}: {
  member: Member;
  onClose: () => void;
  onResult: (result: MemberActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <DialogShell title="Deactivate member" onClose={onClose}>
      <p className="text-text-muted mb-4 text-sm">
        Deactivating <span className="text-text font-medium">{member.email}</span> revokes their
        access immediately. They&rsquo;ll need to be re-invited later to regain access. The action
        is logged.
      </p>
      <DialogActions>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          size="md"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deactivateMemberAction({ userId: member.userId });
              onResult(result);
            })
          }
        >
          {pending ? "Deactivating…" : "Deactivate"}
        </Button>
      </DialogActions>
    </DialogShell>
  );
}

// ── Shared dialog scaffolding ─────────────────────────────────────────

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel border-border w-full max-w-md rounded-[var(--radius-lg)] border p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-text mb-4 text-base font-semibold tracking-tight">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex justify-end gap-2">{children}</div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: RoleValue; onChange: (v: RoleValue) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RoleValue)}
      className="border-border bg-panel text-text focus-visible:border-accent h-10 w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm outline-none"
    >
      {ROLE_OPTIONS.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function ScopeSelect({
  options,
  value,
  onChange,
}: {
  options: ScopeOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const regions = options.filter((o) => o.type === "region");
  const parishes = options.filter((o) => o.type === "parish");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-border bg-panel text-text focus-visible:border-accent h-10 w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm outline-none"
    >
      <option value="">— Choose —</option>
      {regions.length > 0 ? (
        <optgroup label="Regions">
          {regions.map((r) => (
            <option key={r.id} value={`region:${r.id}`}>
              {r.label}
            </option>
          ))}
        </optgroup>
      ) : null}
      {parishes.length > 0 ? (
        <optgroup label="Parishes">
          {parishes.map((p) => (
            <option key={p.id} value={`parish:${p.id}`}>
              {p.label}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

function parseScopeKey(key: string): { type: "region" | "parish"; id: string } | null {
  const [type, id] = key.split(":");
  if (type !== "region" && type !== "parish") return null;
  if (!id) return null;
  return { type, id };
}
