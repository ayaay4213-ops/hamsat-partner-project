-- HAMSAT room activity stream and server-validated room interactions.
-- Clients can read events only after joining the same room; writes go through RPCs.

create table if not exists public.room_activity_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('gift','emoji','game','bomb','system')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_activity_events_room_created_idx
  on public.room_activity_events(room_id, created_at desc);

alter table public.room_activity_events enable row level security;
drop policy if exists "Room members read activity events" on public.room_activity_events;
create policy "Room members read activity events"
  on public.room_activity_events
  for select to authenticated
  using (private.is_room_member(room_activity_events.room_id));

grant select on public.room_activity_events to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.room_activity_events from anon, authenticated;

create or replace function public.send_room_emoji(p_room_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event_id bigint;
  v_value text := btrim(coalesce(p_emoji, ''));
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if p_room_id is null or char_length(v_value) < 1 or char_length(v_value) > 12 then
    raise exception 'الرمز التعبيري غير صالح';
  end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'انضمي إلى الغرفة أولاً';
  end if;
  if not exists (
    select 1 from public.room_seats s
     where s.room_id = p_room_id and s.user_id = v_user
  ) then
    raise exception 'يجب الجلوس على أحد مقاعد المايك لإرسال التفاعل';
  end if;

  insert into public.room_activity_events(room_id, actor_id, event_type, payload)
  values (p_room_id, v_user, 'emoji', jsonb_build_object('emoji', v_value))
  returning id into v_event_id;

  return jsonb_build_object('success', true, 'event_id', v_event_id);
end;
$$;

revoke all on function public.send_room_emoji(uuid, text) from public, anon;
grant execute on function public.send_room_emoji(uuid, text) to authenticated;

create or replace function public.send_room_gift(
  p_room_id uuid,
  p_recipient uuid,
  p_gift_id text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_gift_result jsonb;
  v_event_id bigint;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if p_room_id is null or p_recipient is null then
    raise exception 'بيانات الهدية غير مكتملة';
  end if;
  if p_quantity is null or p_quantity not in (1, 10, 99) then
    raise exception 'الكمية المتاحة هي 1 أو 10 أو 99';
  end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'انضمي إلى الغرفة أولاً';
  end if;
  if not exists (
    select 1 from public.room_seats s
     where s.room_id = p_room_id and s.user_id = p_recipient
  ) then
    raise exception 'يمكن إرسال هدايا الغرفة إلى الجالسين على مقاعد المايك فقط';
  end if;

  -- Existing send_gift RPC performs the atomic wallet debit/credit and ledger writes.
  v_gift_result := public.send_gift(p_recipient, p_gift_id, p_quantity);

  insert into public.room_activity_events(room_id, actor_id, target_user_id, event_type, payload)
  values (
    p_room_id,
    v_user,
    p_recipient,
    'gift',
    jsonb_build_object(
      'gift_id', p_gift_id,
      'gift_name', v_gift_result->>'gift_name',
      'quantity', p_quantity,
      'total_price', (v_gift_result->>'total_price')::bigint
    )
  )
  returning id into v_event_id;

  return v_gift_result || jsonb_build_object('event_id', v_event_id);
end;
$$;

revoke all on function public.send_room_gift(uuid, uuid, text, integer) from public, anon;
grant execute on function public.send_room_gift(uuid, uuid, text, integer) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'room_activity_events'
  ) then
    alter publication supabase_realtime add table public.room_activity_events;
  end if;
end
$$;

create or replace function public.send_room_gift_to_all(
  p_room_id uuid,
  p_gift_id text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_recipient uuid;
  v_result jsonb;
  v_event_id bigint;
  v_count integer := 0;
  v_total bigint := 0;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if p_room_id is null or p_quantity is null or p_quantity not in (1, 10, 99) then
    raise exception 'بيانات الهدية أو الكمية غير صالحة';
  end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'انضمي إلى الغرفة أولاً';
  end if;

  for v_recipient in
    select distinct s.user_id
      from public.room_seats s
     where s.room_id = p_room_id
       and s.user_id <> v_user
     order by s.user_id
  loop
    v_result := public.send_gift(v_recipient, p_gift_id, p_quantity);
    v_total := v_total + (v_result->>'total_price')::bigint;

    insert into public.room_activity_events(room_id, actor_id, target_user_id, event_type, payload)
    values (
      p_room_id,
      v_user,
      v_recipient,
      'gift',
      jsonb_build_object(
        'gift_id', p_gift_id,
        'gift_name', v_result->>'gift_name',
        'quantity', p_quantity,
        'total_price', (v_result->>'total_price')::bigint,
        'all_recipients', true
      )
    )
    returning id into v_event_id;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'لا يوجد أعضاء آخرون على مقاعد المايك';
  end if;

  return jsonb_build_object(
    'success', true,
    'recipients_count', v_count,
    'total_price', v_total,
    'quantity', p_quantity
  );
end;
$$;

revoke all on function public.send_room_gift_to_all(uuid, text, integer) from public, anon;
grant execute on function public.send_room_gift_to_all(uuid, text, integer) to authenticated;
