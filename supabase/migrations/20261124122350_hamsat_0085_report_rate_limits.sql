-- HAMSAT 0085: apply a bounded, per-reporter abuse guard to user/room reports.
create index if not exists idx_user_reports_reporter_created_at
  on public.user_reports (reporter_id, created_at desc);

create or replace function public.report_user(
  p_target_public_id bigint,
  p_reason text,
  p_details text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_target uuid;
  v_report bigint;
  v_recent_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select id into v_target
    from public.profiles
   where public_id = p_target_public_id;

  if v_target is null or v_target = v_user then
    raise exception 'المستخدم غير صالح للإبلاغ';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'اختاري سبب البلاغ';
  end if;

  if exists (
    select 1 from public.user_reports
     where reporter_id = v_user
       and subject_user_id = v_target
       and created_at >= now() - interval '24 hours'
  ) then
    raise exception 'سبق أن أرسلتِ بلاغاً عن هذا العضو خلال آخر 24 ساعة';
  end if;

  select count(*) into v_recent_count
    from public.user_reports
   where reporter_id = v_user
     and created_at >= now() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'وصلتِ إلى الحد المسموح للبلاغات، حاولي بعد ساعة';
  end if;

  insert into public.user_reports(reporter_id,subject_user_id,reason,details)
  values(v_user,v_target,left(btrim(p_reason),120),left(btrim(coalesce(p_details,'')),2000))
  returning id into v_report;

  return v_report;
end;
$function$;

create or replace function public.report_room(
  p_room_id uuid,
  p_reason text,
  p_details text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_report bigint;
  v_recent_count integer;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists(select 1 from public.rooms where id = p_room_id) then
    raise exception 'الغرفة غير موجودة';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'اختاري سبب البلاغ';
  end if;

  if exists (
    select 1 from public.user_reports
     where reporter_id = v_user
       and room_id = p_room_id
       and created_at >= now() - interval '24 hours'
  ) then
    raise exception 'سبق أن أرسلتِ بلاغاً عن هذه الغرفة خلال آخر 24 ساعة';
  end if;

  select count(*) into v_recent_count
    from public.user_reports
   where reporter_id = v_user
     and created_at >= now() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'وصلتِ إلى الحد المسموح للبلاغات، حاولي بعد ساعة';
  end if;

  insert into public.user_reports(reporter_id,room_id,reason,details)
  values(v_user,p_room_id,left(btrim(p_reason),120),left(btrim(coalesce(p_details,'')),2000))
  returning id into v_report;

  return v_report;
end;
$function$;

-- Keep SECURITY DEFINER report entry points unavailable to anonymous/public callers.
-- The functions still authenticate internally, and only signed-in users may invoke them.
revoke all on function public.report_user(bigint,text,text) from public, anon, authenticated;
revoke all on function public.report_room(uuid,text,text) from public, anon, authenticated;
grant execute on function public.report_user(bigint,text,text) to authenticated;
grant execute on function public.report_room(uuid,text,text) to authenticated;
