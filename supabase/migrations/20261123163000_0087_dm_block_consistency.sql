-- Keep the public RPC used by the client consistent with the block rules.
-- Migration 0044 introduced the private helper, but the app still calls this
-- public function name through PostgREST.
create or replace function public.get_or_create_conversation(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_other_user is null or p_other_user = v_me then
    raise exception 'اختاري عضواً آخر للمراسلة';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'المستخدم غير موجود';
  end if;
  if private.is_user_blocked(v_me, p_other_user) then
    raise exception 'لا يمكن بدء محادثة بسبب إعدادات الحظر';
  end if;

  if v_me < p_other_user then
    v_a := v_me;
    v_b := p_other_user;
  else
    v_a := p_other_user;
    v_b := v_me;
  end if;

  insert into public.dm_conversations(user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b)
  do update set updated_at = public.dm_conversations.updated_at
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
