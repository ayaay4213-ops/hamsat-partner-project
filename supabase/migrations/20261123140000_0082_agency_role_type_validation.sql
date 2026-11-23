-- HAMSAT 0082: enforce agency-type compatibility for host and recharge roles.
create or replace function public.agency_add_member(
  p_agency_id uuid,
  p_member_public_id bigint,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_actor_role text;
  v_agency_type text;
begin
  if v_actor is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if public.is_admin() then
    v_actor_role := 'owner';
  else
    select member_role into v_actor_role
      from public.agency_members
     where agency_id = p_agency_id
       and user_id = v_actor
       and status = 'active';
  end if;

  if coalesce(v_actor_role,'') not in ('owner','manager') then
    raise exception 'لا تملكين صلاحية إدارة أعضاء الوكالة';
  end if;

  select agency_type into v_agency_type
    from public.agencies
   where id = p_agency_id
   for update;

  if v_agency_type is null then
    raise exception 'الوكالة غير موجودة';
  end if;

  if p_role is null or p_role not in ('manager','agent','host','support')
     or (v_actor_role = 'manager' and p_role = 'manager') then
    raise exception 'الدور المطلوب غير مسموح';
  end if;

  if p_role = 'agent' and v_agency_type not in ('recharge','both') then
    raise exception 'وكالة المضيفين لا تقبل وكلاء الشحن';
  end if;

  if p_role = 'host' and v_agency_type not in ('hosts','both') then
    raise exception 'وكالة الشحن لا تقبل المضيفين';
  end if;

  select id into v_target
    from public.profiles
   where public_id = p_member_public_id;

  if v_target is null then
    raise exception 'لم يتم العثور على المستخدم';
  end if;

  insert into public.agency_members(agency_id,user_id,member_role,status)
  values(p_agency_id,v_target,p_role,'active')
  on conflict (agency_id,user_id) do update
    set member_role=excluded.member_role,status='active';

  insert into public.agency_audit_logs(agency_id,actor_id,action,details)
  values(p_agency_id,v_actor,'member_added',
    jsonb_build_object('target_public_id',p_member_public_id,'role',p_role));

  return true;
end;
$function$;

revoke all on function public.agency_add_member(uuid,bigint,text) from public, anon;
grant execute on function public.agency_add_member(uuid,bigint,text) to authenticated;
