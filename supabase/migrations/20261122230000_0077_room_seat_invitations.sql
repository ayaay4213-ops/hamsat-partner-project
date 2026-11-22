create table if not exists public.room_seat_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  seat_no smallint not null check (seat_no between 2 and 10),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  responded_at timestamptz,
  constraint room_seat_invites_not_self check (inviter_id <> invitee_id)
);

create index if not exists room_seat_invites_recipient_pending_idx
  on public.room_seat_invitations (invitee_id, created_at desc)
  where status = 'pending';
create index if not exists room_seat_invites_room_created_idx
  on public.room_seat_invitations (room_id, created_at desc);
create unique index if not exists room_seat_invites_one_pending_per_recipient_uidx
  on public.room_seat_invitations (room_id, invitee_id)
  where status = 'pending';

alter table public.room_seat_invitations enable row level security;
drop policy if exists "Room seat invite participants can view" on public.room_seat_invitations;
create policy "Room seat invite participants can view"
  on public.room_seat_invitations for select to authenticated
  using (auth.uid() = invitee_id or auth.uid() = inviter_id);
revoke all on public.room_seat_invitations from public, anon, authenticated;
grant select on public.room_seat_invitations to authenticated;

create or replace function public.invite_room_member_to_seat(p_room_id uuid, p_target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_owner uuid;
  v_seat smallint;
  v_invite public.room_seat_invitations%rowtype;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_target_user is null or p_target_user = v_user then raise exception 'اختاري عضواً آخر لدعوته'; end if;

  select owner_id into v_owner
    from public.rooms where id = p_room_id for update;
  if not found then raise exception 'الغرفة غير موجودة'; end if;
  if v_owner <> v_user then raise exception 'دعوة المايك متاحة لمضيفة الغرفة فقط'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_target_user) then
    raise exception 'هذا العضو لم يعد موجوداً في الغرفة';
  end if;
  if exists (select 1 from public.room_seats where room_id = p_room_id and user_id = p_target_user) then
    raise exception 'هذا العضو موجود بالفعل على المايك';
  end if;

  update public.room_seat_invitations
     set status = 'expired', responded_at = now()
   where room_id = p_room_id and invitee_id = p_target_user
     and status = 'pending' and expires_at <= now();

  if exists (select 1 from public.room_seat_invitations
              where room_id = p_room_id and invitee_id = p_target_user and status = 'pending') then
    raise exception 'لدى هذا العضو دعوة مايك قيد الانتظار بالفعل';
  end if;

  select gs::smallint into v_seat
    from generate_series(2,10) gs
   where not exists (
     select 1 from public.room_seats s where s.room_id = p_room_id and s.seat_no = gs
   )
   order by gs limit 1;
  if v_seat is null then raise exception 'جميع مقاعد المايك ممتلئة'; end if;

  insert into public.room_seat_invitations(room_id, inviter_id, invitee_id, seat_no)
  values (p_room_id, v_user, p_target_user, v_seat)
  returning * into v_invite;

  insert into public.notifications(recipient_id, actor_id, type, title, body, target_url)
  values (
    p_target_user, v_user, 'system', 'دعوة للصعود إلى المايك',
    'المضيفة تدعوك للصعود إلى المايك. افتحي الغرفة لقبول الدعوة أو رفضها.',
    '#/rooms?invite=' || p_room_id::text
  );

  return jsonb_build_object('success', true, 'invitation_id', v_invite.id, 'seat_no', v_seat, 'expires_at', v_invite.expires_at);
end;
$$;

create or replace function public.respond_room_seat_invitation(p_invitation_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.room_seat_invitations%rowtype;
  v_room_id uuid;
  v_owner uuid;
  v_seat smallint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_accept is null then raise exception 'اختاري قبول الدعوة أو رفضها'; end if;

  select room_id into v_room_id
    from public.room_seat_invitations where id = p_invitation_id;
  if not found then raise exception 'الدعوة غير موجودة'; end if;

  -- Always lock the room before the invitation to avoid lock-order deadlocks.
  select owner_id into v_owner
    from public.rooms where id = v_room_id for update;

  select * into v_invite
    from public.room_seat_invitations
   where id = p_invitation_id
   for update;
  if not found then raise exception 'الدعوة غير موجودة'; end if;
  if v_invite.invitee_id <> v_user then raise exception 'هذه الدعوة ليست موجهة إلى حسابك'; end if;
  if v_invite.status <> 'pending' then
    return jsonb_build_object('success', false, 'status', v_invite.status);
  end if;

  if v_owner is null or v_owner <> v_invite.inviter_id then
    update public.room_seat_invitations set status='expired',responded_at=now() where id=p_invitation_id;
    return jsonb_build_object('success', false, 'status', 'expired', 'message', 'انتهت الدعوة لأن الغرفة لم تعد متاحة');
  end if;

  if v_invite.expires_at <= now() then
    update public.room_seat_invitations set status='expired',responded_at=now() where id=p_invitation_id;
    return jsonb_build_object('success', false, 'status', 'expired', 'message', 'انتهى وقت الدعوة');
  end if;

  if not p_accept then
    update public.room_seat_invitations set status='declined',responded_at=now() where id=p_invitation_id;
    return jsonb_build_object('success', true, 'status', 'declined');
  end if;

  if not exists (select 1 from public.room_members where room_id=v_invite.room_id and user_id=v_user) then
    update public.room_seat_invitations set status='expired',responded_at=now() where id=p_invitation_id;
    return jsonb_build_object('success', false, 'status', 'expired', 'message', 'يجب أن تكوني داخل الغرفة لقبول الدعوة');
  end if;
  if exists (select 1 from public.room_seats where room_id=v_invite.room_id and user_id=v_user) then
    update public.room_seat_invitations set status='declined',responded_at=now() where id=p_invitation_id;
    return jsonb_build_object('success', false, 'status', 'declined', 'message', 'أنتِ على المايك بالفعل');
  end if;

  select gs::smallint into v_seat
    from generate_series(2,10) gs
   where not exists (
     select 1 from public.room_seats s where s.room_id=v_invite.room_id and s.seat_no=gs
   )
   order by (gs <> v_invite.seat_no), gs limit 1;
  if v_seat is null then
    update public.room_seat_invitations set status='expired',responded_at=now() where id=p_invitation_id;
    return jsonb_build_object('success', false, 'status', 'expired', 'message', 'امتلأت مقاعد المايك قبل قبول الدعوة');
  end if;

  insert into public.room_seats(room_id,seat_no,user_id)
  values (v_invite.room_id,v_seat,v_user);

  update public.room_seat_invitations
     set status='accepted',seat_no=v_seat,responded_at=now()
   where id=p_invitation_id;

  insert into public.notifications(recipient_id,actor_id,type,title,body,target_url)
  values (
    v_invite.inviter_id,v_user,'system','تم قبول دعوة المايك',
    'قبل العضو دعوتك وصعد تلقائياً إلى المايك.','#/rooms?invite=' || v_invite.room_id::text
  );

  return jsonb_build_object('success', true, 'status', 'accepted', 'room_id', v_invite.room_id, 'seat_no', v_seat);
end;
$$;

revoke all on function public.invite_room_member_to_seat(uuid,uuid) from public, anon;
revoke all on function public.respond_room_seat_invitation(uuid,boolean) from public, anon;
grant execute on function public.invite_room_member_to_seat(uuid,uuid) to authenticated;
grant execute on function public.respond_room_seat_invitation(uuid,boolean) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.room_seat_invitations;
exception when duplicate_object then null;
end;
$$;
