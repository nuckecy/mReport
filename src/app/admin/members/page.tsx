import { getSession } from "@/lib/auth/session";
import { listMembers, listScopeOptions } from "@/lib/members/queries";
import { MembersTable } from "./MembersTable";

/**
 * /admin/members — list every tenant member with their mReport role and
 * scope. Admin actions (invite, edit, deactivate) live in the client
 * `MembersTable` and call server actions in `lib/members/actions.ts`.
 *
 * Session is non-null here because the parent `/admin/layout.tsx`
 * already ran `requireAdmin()`.
 */
export default async function MembersPage() {
  const session = await getSession();
  if (!session) {
    // Defensive — should never happen because the layout enforced auth.
    return null;
  }

  const [members, scopeOptions] = await Promise.all([
    listMembers(session.tenantId),
    listScopeOptions(session.tenantId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-text text-lg font-semibold tracking-tight">Members</h2>
          <p className="text-text-muted text-sm">
            {members.length} member{members.length === 1 ? "" : "s"} · invite teammates and manage
            roles + parish scope.
          </p>
        </div>
      </div>

      <MembersTable currentUserId={session.userId} members={members} scopeOptions={scopeOptions} />
    </div>
  );
}
