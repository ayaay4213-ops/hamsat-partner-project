-- HAMSAT safety: user blocks, user/room reports and DM enforcement.
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.user_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  subject_user_id uuid references auth.users(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (subject_user_id is not null or room_id is not null)
);
create index if not exists user_reports_status_created_idx on public.user_reports(status,created_at desc);

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;
create policy "Users read their own blocks" on public.user_blocks
for select to authenticated using (blocker_id=auth.uid());
create policy "Users read own reports and admins review all" on public.user_reports
for select to authenticated using (reporter_id=auth.uid() or public.is_admin());
grant select on public.user_blocks,public.user_reports to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.user_blocks,public.user_reports from anon,authenticated;

create or replace function private.is_user_blocked(p_user_a uuid,p_user_b uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.user_blocks b
     where (b.blocker_id=p_user_a and b.blocked_id=p_user_b)
        or (b.blocker_id=p_user_b and b.blocked_id=p_user_a)
  );
$$;
revoke all on function private.is_user_blocked(uuid,uuid) from public,anon;
grant execute on function private.is_user_blocked(uuid,uuid) to authenticated;

create or replace function public.block_user(p_target_public_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_target uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select id into v_target from public.profiles where public_id=p_target_public_id;
  if v_target is null then raise exception 'المستخدم غير موجود'; end if;
  if v_target=v_user then raise exception 'لا يمكنك حظر حسابك'; end if;
  insert into public.user_blocks(blocker_id,blocked_id) values(v_user,v_target) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.unblock_user(p_target_public_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_target uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select id into v_target from public.profiles where public_id=p_target_public_id;
  if v_target is null then return false; end if;
  delete from public.user_blocks where blocker_id=v_user and blocked_id=v_target;
  return true;
end;
$$;

create or replace function public.report_user(p_target_public_id bigint,p_reason text,p_details text default '')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_target uuid; v_report bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  select id into v_target from public.profiles where public_id=p_target_public_id;
  if v_target is null or v_target=v_user then raise exception 'المستخدم غير صالح للإبلاغ'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'اختاري سبب البلاغ'; end if;
  insert into public.user_reports(reporter_id,subject_user_id,reason,details)
  values(v_user,v_target,left(btrim(p_reason),120),left(btrim(coalesce(p_details,'')),2000))
  returning id into v_report;
  return v_report;
end;
$$;

create or replace function public.report_room(p_room_id uuid,p_reason text,p_details text default '')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_report bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not exists(select 1 from public.rooms where id=p_room_id) then raise exception 'الغرفة غير موجودة'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'اختاري سبب البلاغ'; end if;
  insert into public.user_reports(reporter_id,room_id,reason,details)
  values(v_user,p_room_id,left(btrim(p_reason),120),left(btrim(coalesce(p_details,'')),2000))
  returning id into v_report;
  return v_report;
end;
$$;

create or replace function public.admin_update_user_report(p_report_id bigint,p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if p_status not in ('reviewing','resolved','dismissed','open') then raise exception 'حالة البلاغ غير صالحة'; end if;
  update public.user_reports set status=p_status,handled_by=auth.uid(),handled_at=now() where id=p_report_id;
  return found;
end;
$$;

revoke all on function public.block_user(bigint) from public,anon;
grant execute on function public.block_user(bigint) to authenticated;
revoke all on function public.unblock_user(bigint) from public,anon;
grant execute on function public.unblock_user(bigint) to authenticated;
revoke all on function public.report_user(bigint,text,text) from public,anon;
grant execute on function public.report_user(bigint,text,text) to authenticated;
revoke all on function public.report_room(uuid,text,text) from public,anon;
grant execute on function public.report_room(uuid,text,text) to authenticated;
revoke all on function public.admin_update_user_report(bigint,text) from public,anon;
grant execute on function public.admin_update_user_report(bigint,text) to authenticated;

drop policy if exists "Participants read their conversations" on public.dm_conversations;
create policy "Participants read their conversations" on public.dm_conversations
for select to authenticated using (
  (auth.uid()=user_a or auth.uid()=user_b)
  and not private.is_user_blocked(user_a,user_b)
);

drop policy if exists "Participants read direct messages" on public.dm_messages;
create policy "Participants read direct messages" on public.dm_messages
for select to authenticated using (
  exists(select 1 from public.dm_conversations c where c.id=dm_messages.conversation_id
    and (c.user_a=auth.uid() or c.user_b=auth.uid())
    and not private.is_user_blocked(c.user_a,c.user_b))
);
drop policy if exists "Participants send direct messages" on public.dm_messages;
create policy "Participants send direct messages" on public.dm_messages
for insert to authenticated with check (
  sender_id=auth.uid()
  and exists(select 1 from public.dm_conversations c where c.id=dm_messages.conversation_id
    and (c.user_a=auth.uid() or c.user_b=auth.uid())
    and not private.is_user_blocked(c.user_a,c.user_b))
);
drop policy if exists "Recipients mark direct messages read" on public.dm_messages;
create policy "Recipients mark direct messages read" on public.dm_messages
for update to authenticated using (
  sender_id<>auth.uid()
  and exists(select 1 from public.dm_conversations c where c.id=dm_messages.conversation_id
    and (c.user_a=auth.uid() or c.user_b=auth.uid())
    and not private.is_user_blocked(c.user_a,c.user_b))
) with check (sender_id<>auth.uid());

create or replace function private.get_or_create_conversation(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_other_user is null or p_other_user=v_me then raise exception 'اختاري عضواً آخر للمراسلة'; end if;
  if not exists(select 1 from public.profiles where id=p_other_user) then raise exception 'المستخدم غير موجود'; end if;
  if private.is_user_blocked(v_me,p_other_user) then raise exception 'لا يمكن بدء محادثة بسبب إعدادات الحظر'; end if;
  if v_me<p_other_user then v_a:=v_me;v_b:=p_other_user;else v_a:=p_other_user;v_b:=v_me;end if;
  insert into public.dm_conversations(user_a,user_b) values(v_a,v_b)
  on conflict(user_a,user_b) do update set updated_at=public.dm_conversations.updated_at
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.get_or_create_conversation(uuid) from public,anon,authenticated;
grant execute on function private.get_or_create_conversation(uuid) to authenticated;
