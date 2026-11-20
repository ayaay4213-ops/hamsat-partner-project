-- HAMSAT 0012: shared room backgrounds and least-privilege staff roles.
-- Source-only migration. Review and apply manually to the intended Supabase project.
-- No live database was changed by creating this file.

create table if not exists public.room_backgrounds (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  image_url text,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint room_backgrounds_image_url_https
    check (image_url is null or (length(image_url) <= 2048 and image_url like 'https://%'))
);

alter table public.room_backgrounds enable row level security;
grant select, insert, update, delete on public.room_backgrounds to authenticated;

drop policy if exists "Room members view shared background" on public.room_backgrounds;
create policy "Room members view shared background"
  on public.room_backgrounds for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Room members set shared background" on public.room_backgrounds;
create policy "Room members set shared background"
  on public.room_backgrounds for insert to authenticated
  with check (
    auth.uid() = updated_by
    and public.is_room_member(room_id)
  );

drop policy if exists "Room members update shared background" on public.room_backgrounds;
create policy "Room members update shared background"
  on public.room_backgrounds for update to authenticated
  using (public.is_room_member(room_id))
  with check (
    auth.uid() = updated_by
    and public.is_room_member(room_id)
  );

drop policy if exists "Room members remove shared background" on public.room_backgrounds;
create policy "Room members remove shared background"
  on public.room_backgrounds for delete to authenticated
  using (public.is_room_member(room_id));

-- A background change is broadcast to everyone currently inside that room.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_backgrounds'
  ) then
    alter publication supabase_realtime add table public.room_backgrounds;
  end if;
end
$$;

-- Staff are separate from the Super Admin role. A staff member can only receive
-- explicitly selected capabilities; financial, wallet, payout, agency, role-
-- assignment and global configuration permissions are intentionally excluded.
create table if not exists public.staff_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  permissions text[] not null default '{}',
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_roles_allowed_permissions check (
    permissions <@ array[
      'room_moderation',
      'report_review',
      'member_support',
      'event_management'
    ]::text[]
  )
);

create table if not exists public.staff_audit_log (
  id bigint generated always as identity primary key,
  staff_user_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.staff_roles enable row level security;
alter table public.staff_audit_log enable row level security;
grant select on public.staff_roles to authenticated;
grant select on public.staff_audit_log to authenticated;

drop policy if exists "Staff can view own role" on public.staff_roles;
create policy "Staff can view own role"
  on public.staff_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Only Super Admin manages staff roles" on public.staff_roles;
create policy "Only Super Admin manages staff roles"
  on public.staff_roles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only Super Admin views staff audit" on public.staff_audit_log;
create policy "Only Super Admin views staff audit"
  on public.staff_audit_log for select to authenticated
  using (public.is_admin());

create or replace function public.has_staff_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1
      from public.staff_roles s
      where s.user_id = auth.uid()
        and s.active = true
        and p_permission = any(s.permissions)
    );
$$;

revoke all on function public.has_staff_permission(text) from public;
grant execute on function public.has_staff_permission(text) to authenticated;

create or replace function public.assign_staff_permissions(
  p_user_id uuid,
  p_permissions text[],
  p_active boolean default true
)
returns public.staff_roles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.staff_roles;
  v_allowed constant text[] := array[
    'room_moderation',
    'report_review',
    'member_support',
    'event_management'
  ]::text[];
begin
  if not public.is_admin() then
    raise exception 'صلاحية السوبر أدمن مطلوبة لتعيين المسؤولين';
  end if;
  if p_user_id is null then
    raise exception 'يجب تحديد حساب المسؤول';
  end if;
  if not (coalesce(p_permissions, '{}'::text[]) <@ v_allowed) then
    raise exception 'تتضمن الصلاحيات اختياراً غير مسموح';
  end if;

  insert into public.staff_roles(user_id, permissions, active, assigned_by, updated_at)
  values (p_user_id, coalesce(p_permissions, '{}'::text[]), coalesce(p_active, true), auth.uid(), now())
  on conflict (user_id) do update
    set permissions = excluded.permissions,
        active = excluded.active,
        assigned_by = excluded.assigned_by,
        updated_at = now()
  returning * into v_result;

  insert into public.staff_audit_log(staff_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'assign_staff_permissions', 'user', p_user_id::text,
    jsonb_build_object('permissions', coalesce(p_permissions, '{}'::text[]), 'active', coalesce(p_active, true)));

  return v_result;
end;
$$;

revoke all on function public.assign_staff_permissions(uuid, text[], boolean) from public;
grant execute on function public.assign_staff_permissions(uuid, text[], boolean) to authenticated;
