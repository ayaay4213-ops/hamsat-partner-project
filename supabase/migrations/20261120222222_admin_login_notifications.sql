create table if not exists public.admin_login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  signed_in_at timestamptz not null default now()
);
create index if not exists admin_login_events_signed_in_at_idx
  on public.admin_login_events (signed_in_at desc);
alter table public.admin_login_events enable row level security;
drop policy if exists "Super admins can read login events" on public.admin_login_events;
create policy "Super admins can read login events"
  on public.admin_login_events for select to authenticated
  using (public.is_admin());

create or replace function public.capture_auth_login_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_sign_in_at is not null
     and new.last_sign_in_at is distinct from old.last_sign_in_at then
    insert into public.admin_login_events(user_id, signed_in_at)
    values (new.id, new.last_sign_in_at);
  end if;
  return new;
end;
$$;
drop trigger if exists capture_auth_login_event on auth.users;
create trigger capture_auth_login_event
  after update of last_sign_in_at on auth.users
  for each row execute function public.capture_auth_login_event();

create or replace function public.admin_recent_logins(p_limit integer default 100)
returns table (
  event_id bigint,
  user_id uuid,
  public_id bigint,
  display_name text,
  handle text,
  signed_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    select e.id, e.user_id, p.public_id, p.display_name, p.handle, e.signed_in_at
    from public.admin_login_events e
    left join public.profiles p on p.id = e.user_id
    order by e.signed_in_at desc, e.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;
revoke all on function public.admin_recent_logins(integer) from public;
grant execute on function public.admin_recent_logins(integer) to authenticated;
grant select on public.admin_login_events to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_login_events'
  ) then
    alter publication supabase_realtime add table public.admin_login_events;
  end if;
end;
$$;
