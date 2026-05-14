-- mReport Storage bucket + RLS policies.
--
-- Path convention: <tenant_id>/<parish_id>/<YYYY-MM>.xlsx
--
-- The first path segment is the tenant UUID. Policies enforce that the
-- authenticated user must be a member of that tenant (via the platform's
-- core_tenant_users) to read or write objects in their tenant's namespace.
-- Platform admins (is_platform_admin=true on core_users) bypass.
--
-- File size + MIME constraints are bucket-level so we don't have to
-- duplicate them in app code. 10 MB ceiling matches what the prototype
-- handled comfortably.
--
-- IMPLEMENTATION NOTE: `public.user_tenant_ids()` is a set-returning
-- function and Postgres forbids SRFs in policy expressions. We wrap it in
-- a scalar `mreport_user_is_tenant_member(uuid)` so the policy stays
-- expression-only.

-- 1. Create the bucket (idempotent).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mreport-reports',
  'mreport-reports',
  false,
  10 * 1024 * 1024, -- 10 MB
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    -- Fallback MIME some browsers/curl use for binary uploads
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- 2. Extract the leading tenant_id from a storage object name.
-- Pure text manipulation; bad keys evaluate to NULL (and therefore deny
-- under the policies below).
create or replace function public.mreport_object_tenant_id(name text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
  result uuid;
begin
  if name is null then return null; end if;
  first_segment := split_part(name, '/', 1);
  if first_segment = '' then return null; end if;
  begin
    result := first_segment::uuid;
  exception when others then
    result := null;
  end;
  return result;
end;
$$;

-- 3. Scalar wrapper around the platform SRF user_tenant_ids().
-- SECURITY DEFINER so it can read core_tenant_users with the function
-- owner's privileges (matches how the platform uses it elsewhere).
create or replace function public.mreport_user_is_tenant_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.user_tenant_ids() ut where ut = tid
  );
$$;

-- 4. Policies. RLS is already enabled on storage.objects by Supabase.
-- All four CRUD ops are gated by tenant membership; platform admins bypass.

drop policy if exists "mreport: tenant members read own files" on storage.objects;
create policy "mreport: tenant members read own files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'mreport-reports'
  and (
    public.is_platform_admin()
    or public.mreport_user_is_tenant_member(public.mreport_object_tenant_id(name))
  )
);

drop policy if exists "mreport: tenant members write own files" on storage.objects;
create policy "mreport: tenant members write own files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'mreport-reports'
  and (
    public.is_platform_admin()
    or public.mreport_user_is_tenant_member(public.mreport_object_tenant_id(name))
  )
);

drop policy if exists "mreport: tenant members update own files" on storage.objects;
create policy "mreport: tenant members update own files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'mreport-reports'
  and (
    public.is_platform_admin()
    or public.mreport_user_is_tenant_member(public.mreport_object_tenant_id(name))
  )
);

drop policy if exists "mreport: tenant members delete own files" on storage.objects;
create policy "mreport: tenant members delete own files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'mreport-reports'
  and (
    public.is_platform_admin()
    or public.mreport_user_is_tenant_member(public.mreport_object_tenant_id(name))
  )
);
