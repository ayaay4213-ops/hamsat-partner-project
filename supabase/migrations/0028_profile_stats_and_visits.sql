-- HAMSAT profile visit tracking and public aggregate counters.
create table if not exists public.profile_visits (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  visitor_id uuid not null references auth.users(id) on delete cascade,
  visited_on date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now(),
  primary key (profile_id, visitor_id, visited_on),
  constraint profile_visits_not_self check (profile_id <> visitor_id)
);
alter table public.profile_visits enable row level security;
revoke all on public.profile_visits from anon, authenticated;
grant insert on public.profile_visits to authenticated;
drop policy if exists "Users record their own profile visits" on public.profile_visits;
create policy "Users record their own profile visits"
on public.profile_visits for insert to authenticated
with check (visitor_id = (select auth.uid()) and profile_id <> (select auth.uid()));

create or replace function public.record_profile_visit(p_profile_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_profile_id is null or p_profile_id = auth.uid() then return; end if;
  insert into public.profile_visits(profile_id, visitor_id)
  values (p_profile_id, auth.uid())
  on conflict (profile_id, visitor_id, visited_on) do nothing;
end;
$$;

create or replace function public.get_profile_stats(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_friends bigint; v_followers bigint; v_following bigint; v_visitors bigint; v_gifts bigint;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_profile_id is null or not exists(select 1 from public.profiles where id = p_profile_id) then
    raise exception 'الحساب غير موجود';
  end if;
  select count(*) into v_friends from public.friend_requests
    where status = 'accepted' and (sender_id = p_profile_id or receiver_id = p_profile_id);
  select count(*) into v_followers from public.user_follows where followed_id = p_profile_id;
  select count(*) into v_following from public.user_follows where follower_id = p_profile_id;
  select count(distinct visitor_id) into v_visitors from public.profile_visits where profile_id = p_profile_id;
  select coalesce(sum(quantity),0) into v_gifts from public.gift_transactions where recipient_id = p_profile_id;
  return jsonb_build_object('friends',v_friends,'followers',v_followers,'following',v_following,
    'visitors',v_visitors,'giftsReceived',v_gifts);
end;
$$;
revoke all on function public.record_profile_visit(uuid) from public, anon;
revoke all on function public.get_profile_stats(uuid) from public, anon;
grant execute on function public.record_profile_visit(uuid) to authenticated;
grant execute on function public.get_profile_stats(uuid) to authenticated;
