-- HAMSAT 0090: enforce private-message limits server-side.
-- Keep this independent from client validation so direct API calls cannot spam.
create or replace function public.enforce_dm_message_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_recent_count integer;
begin
  if v_user is null or new.sender_id is distinct from v_user then
    raise exception 'هوية مرسل الرسالة غير صالحة';
  end if;

  new.body := btrim(coalesce(new.body, ''));
  if length(new.body) < 1 or length(new.body) > 2000 then
    raise exception 'الرسالة يجب أن تكون من 1 إلى 2000 حرف';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select count(*) into v_recent_count
    from public.dm_messages
   where sender_id = v_user
     and created_at >= now() - interval '1 minute';

  if v_recent_count >= 20 then
    raise exception 'أرسلتِ رسائل كثيرة خلال دقيقة واحدة، انتظري قليلاً ثم حاولي مجدداً';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_dm_message_limits() from public, anon, authenticated;

drop trigger if exists dm_message_rate_limit on public.dm_messages;
create trigger dm_message_rate_limit
before insert on public.dm_messages
for each row execute function public.enforce_dm_message_limits();
