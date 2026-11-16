-- HAMSAT agency foundation: recharge agencies, agents, commission ledgers and pending external orders.
create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agency_type text not null check (agency_type in ('recharge','hosts','both')),
  owner_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  agent_commission_percent numeric(5,2) not null default 0 check (agent_commission_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_members (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check (member_role in ('owner','manager','agent','host','support')),
  status text not null default 'active' check (status in ('active','paused','removed')),
  joined_at timestamptz not null default now(),
  unique (agency_id,user_id)
);

create table if not exists public.topup_packages (
  id text primary key,
  name text not null,
  coins bigint not null check (coins > 0),
  price_dzd bigint not null check (price_dzd > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_wallets (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  balance_dzd bigint not null default 0 check (balance_dzd >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_commission_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_dzd bigint not null default 0 check (balance_dzd >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_recharges (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id),
  agent_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  package_id text not null references public.topup_packages(id),
  coins bigint not null,
  price_dzd bigint not null,
  total_commission_dzd bigint not null default 0,
  agent_commission_dzd bigint not null default 0,
  agency_commission_dzd bigint not null default 0,
  payment_method text not null,
  payment_reference text,
  created_at timestamptz not null default now()
);
create unique index if not exists agency_recharges_reference_unique
  on public.agency_recharges(agency_id,payment_reference)
  where payment_reference is not null;

create table if not exists public.agency_commission_ledger (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  recharge_id bigint not null references public.agency_recharges(id) on delete cascade,
  amount_dzd bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_commission_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  recharge_id bigint not null references public.agency_recharges(id) on delete cascade,
  amount_dzd bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_audit_logs (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.external_topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null references public.topup_packages(id),
  payment_provider text not null,
  coins bigint not null default 0,
  price_dzd bigint not null default 0,
  provider_reference text,
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create unique index if not exists external_topup_provider_reference_unique
  on public.external_topup_orders(payment_provider,provider_reference)
  where provider_reference is not null;

create index if not exists agency_members_user_idx on public.agency_members(user_id,status);
create index if not exists agency_recharges_agency_created_idx on public.agency_recharges(agency_id,created_at desc);
create index if not exists agency_recharges_target_created_idx on public.agency_recharges(target_user_id,created_at desc);

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.topup_packages enable row level security;
alter table public.agency_wallets enable row level security;
alter table public.agent_commission_wallets enable row level security;
alter table public.agency_recharges enable row level security;
alter table public.agency_commission_ledger enable row level security;
alter table public.agent_commission_ledger enable row level security;
alter table public.agency_audit_logs enable row level security;
alter table public.external_topup_orders enable row level security;

create policy "Agency members read their agencies" on public.agencies
for select to authenticated using (
  public.is_admin() or exists(select 1 from public.agency_members m where m.agency_id=agencies.id and m.user_id=auth.uid() and m.status='active')
);
create policy "Users read their agency memberships" on public.agency_members
for select to authenticated using (
  public.is_admin() or user_id=auth.uid() or exists(select 1 from public.agency_members own where own.agency_id=agency_members.agency_id and own.user_id=auth.uid() and own.member_role in ('owner','manager') and own.status='active')
);
create policy "Authenticated read active topup packages" on public.topup_packages
for select to authenticated using (active or public.is_admin());
create policy "Admins manage topup packages" on public.topup_packages
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Agency owners read agency wallets" on public.agency_wallets
for select to authenticated using (public.is_admin() or exists(select 1 from public.agency_members m where m.agency_id=agency_wallets.agency_id and m.user_id=auth.uid() and m.member_role in ('owner','manager') and m.status='active'));
create policy "Agents read own commission wallet" on public.agent_commission_wallets
for select to authenticated using (public.is_admin() or user_id=auth.uid());
create policy "Agency members read recharge records" on public.agency_recharges
for select to authenticated using (
  public.is_admin() or target_user_id=auth.uid() or exists(select 1 from public.agency_members m where m.agency_id=agency_recharges.agency_id and m.user_id=auth.uid() and m.status='active' and m.member_role in ('owner','manager','agent'))
);
create policy "Agency owners read agency commission ledger" on public.agency_commission_ledger
for select to authenticated using (public.is_admin() or exists(select 1 from public.agency_members m where m.agency_id=agency_commission_ledger.agency_id and m.user_id=auth.uid() and m.member_role in ('owner','manager') and m.status='active'));
create policy "Agents read own commission ledger" on public.agent_commission_ledger
for select to authenticated using (public.is_admin() or user_id=auth.uid());
create policy "Agency owners read audit logs" on public.agency_audit_logs
for select to authenticated using (public.is_admin() or exists(select 1 from public.agency_members m where m.agency_id=agency_audit_logs.agency_id and m.user_id=auth.uid() and m.member_role in ('owner','manager') and m.status='active'));
create policy "Users read own external topup orders" on public.external_topup_orders
for select to authenticated using (public.is_admin() or user_id=auth.uid());

grant select on public.agencies,public.agency_members,public.topup_packages,public.agency_wallets,public.agent_commission_wallets,
  public.agency_recharges,public.agency_commission_ledger,public.agent_commission_ledger,public.agency_audit_logs,public.external_topup_orders to authenticated;
grant insert,update,delete on public.topup_packages to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.agencies,public.agency_members,public.agency_wallets,
  public.agent_commission_wallets,public.agency_recharges,public.agency_commission_ledger,public.agent_commission_ledger,
  public.agency_audit_logs,public.external_topup_orders from anon,authenticated;

create or replace function public.admin_create_agency(
  p_name text,p_type text,p_owner_public_id bigint,p_commission_percent numeric default 0,p_agent_commission_percent numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_agency uuid;
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(p_name,'')))<2 or p_type not in ('recharge','hosts','both') then raise exception 'بيانات الوكالة غير صالحة'; end if;
  if p_commission_percent not between 0 and 100 or p_agent_commission_percent not between 0 and 100 then raise exception 'نسبة العمولة غير صالحة'; end if;
  select id into v_owner from public.profiles where public_id=p_owner_public_id;
  if v_owner is null then raise exception 'لم يتم العثور على صاحب الوكالة بهذا المعرّف'; end if;
  insert into public.agencies(name,agency_type,owner_id,status,commission_percent,agent_commission_percent)
  values(btrim(p_name),p_type,v_owner,'active',p_commission_percent,p_agent_commission_percent)
  returning id into v_agency;
  insert into public.agency_members(agency_id,user_id,member_role,status) values(v_agency,v_owner,'owner','active');
  insert into public.agency_wallets(agency_id,balance_dzd) values(v_agency,0);
  insert into public.agency_audit_logs(agency_id,actor_id,action,details) values(v_agency,auth.uid(),'agency_created',jsonb_build_object('name',p_name,'owner_public_id',p_owner_public_id));
  return v_agency;
end;
$$;

create or replace function public.agency_add_member(p_agency_id uuid,p_member_public_id bigint,p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_target uuid; v_actor_role text;
begin
  if public.is_admin() then v_actor_role:='owner'; else select member_role into v_actor_role from public.agency_members where agency_id=p_agency_id and user_id=v_actor and status='active'; end if;
  if coalesce(v_actor_role,'') not in ('owner','manager') then raise exception 'لا تملكين صلاحية إدارة أعضاء الوكالة'; end if;
  if p_role not in ('manager','agent','host','support') or (v_actor_role='manager' and p_role='manager') then raise exception 'الدور المطلوب غير مسموح'; end if;
  select id into v_target from public.profiles where public_id=p_member_public_id;
  if v_target is null then raise exception 'لم يتم العثور على المستخدم'; end if;
  insert into public.agency_members(agency_id,user_id,member_role,status)
  values(p_agency_id,v_target,p_role,'active')
  on conflict (agency_id,user_id) do update set member_role=excluded.member_role,status='active';
  insert into public.agency_audit_logs(agency_id,actor_id,action,details)
  values(p_agency_id,v_actor,'member_added',jsonb_build_object('target_public_id',p_member_public_id,'role',p_role));
  return true;
end;
$$;

create or replace function public.agency_remove_member(p_agency_id uuid,p_member_public_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_target uuid; v_actor_role text; v_target_role text;
begin
  if public.is_admin() then v_actor_role:='owner'; else select member_role into v_actor_role from public.agency_members where agency_id=p_agency_id and user_id=v_actor and status='active'; end if;
  if coalesce(v_actor_role,'') not in ('owner','manager') then raise exception 'لا تملكين صلاحية إدارة أعضاء الوكالة'; end if;
  select p.id,m.member_role into v_target,v_target_role from public.profiles p join public.agency_members m on m.user_id=p.id
   where p.public_id=p_member_public_id and m.agency_id=p_agency_id and m.status='active';
  if v_target is null then raise exception 'العضو غير موجود'; end if;
  if v_target_role='owner' or (v_actor_role='manager' and v_target_role='manager') then raise exception 'لا يمكن إزالة هذا العضو'; end if;
  update public.agency_members set status='removed' where agency_id=p_agency_id and user_id=v_target;
  insert into public.agency_audit_logs(agency_id,actor_id,action,details)
  values(p_agency_id,v_actor,'member_removed',jsonb_build_object('target_public_id',p_member_public_id));
  return true;
end;
$$;

create or replace function public.agent_recharge_user(
  p_agency_id uuid,p_target_public_id bigint,p_package_id text,p_payment_method text,p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text; v_commission_percent numeric; v_agent_percent numeric;
  v_target uuid; v_package public.topup_packages%rowtype;
  v_total_commission bigint; v_agent_commission bigint; v_agency_commission bigint;
  v_balance bigint; v_recharge_id bigint;
begin
  select m.member_role,a.commission_percent,a.agent_commission_percent
    into v_role,v_commission_percent,v_agent_percent
    from public.agency_members m join public.agencies a on a.id=m.agency_id
   where m.agency_id=p_agency_id and m.user_id=v_actor and m.status='active'
     and a.status='active' and a.agency_type in ('recharge','both');

  if coalesce(v_role,'') not in ('owner','manager','agent') then raise exception 'هذا الحساب ليس وكيلاً نشطاً للشحن'; end if;
  if length(btrim(coalesce(p_payment_method,'')))<2 then raise exception 'حددي طريقة استلام الدفع'; end if;
  if length(btrim(coalesce(p_payment_reference,'')))<4 then raise exception 'رقم مرجع العملية مطلوب لمنع تكرار الشحن'; end if;

  select id into v_target from public.profiles where public_id=p_target_public_id;
  if v_target is null then raise exception 'لم يتم العثور على اللاعب بهذا المعرّف'; end if;
  select * into v_package from public.topup_packages where id=p_package_id and active=true;
  if not found then raise exception 'باقة الشحن غير متاحة'; end if;

  v_total_commission := floor(v_package.price_dzd*v_commission_percent/100)::bigint;
  v_agent_commission := floor(v_total_commission*v_agent_percent/100)::bigint;
  v_agency_commission := v_total_commission-v_agent_commission;

  insert into public.wallets(user_id,balance) values(v_target,0) on conflict(user_id) do nothing;
  update public.wallets set balance=balance+v_package.coins,updated_at=now()
   where user_id=v_target returning balance into v_balance;
  insert into public.wallet_transactions(user_id,amount,transaction_type,label)
  values(v_target,v_package.coins,'agency_topup','شحن عبر وكالة همسات');

  insert into public.agency_recharges(agency_id,agent_id,target_user_id,package_id,coins,price_dzd,total_commission_dzd,agent_commission_dzd,agency_commission_dzd,payment_method,payment_reference)
  values(p_agency_id,v_actor,v_target,p_package_id,v_package.coins,v_package.price_dzd,v_total_commission,v_agent_commission,v_agency_commission,btrim(p_payment_method),btrim(p_payment_reference))
  returning id into v_recharge_id;

  update public.agency_wallets set balance_dzd=balance_dzd+v_agency_commission,updated_at=now() where agency_id=p_agency_id;
  insert into public.agency_commission_ledger(agency_id,recharge_id,amount_dzd) values(p_agency_id,v_recharge_id,v_agency_commission);
  insert into public.agent_commission_wallets(user_id,balance_dzd) values(v_actor,v_agent_commission)
    on conflict(user_id) do update set balance_dzd=public.agent_commission_wallets.balance_dzd+excluded.balance_dzd,updated_at=now();
  insert into public.agent_commission_ledger(user_id,agency_id,recharge_id,amount_dzd) values(v_actor,p_agency_id,v_recharge_id,v_agent_commission);
  insert into public.agency_audit_logs(agency_id,actor_id,action,details)
  values(p_agency_id,v_actor,'agent_recharge',jsonb_build_object('recharge_id',v_recharge_id,'target_public_id',p_target_public_id,'coins',v_package.coins,'price_dzd',v_package.price_dzd));

  return jsonb_build_object('success',true,'recharge_id',v_recharge_id,'coins',v_package.coins,'balance',v_balance,'commission_dzd',v_agent_commission);
end;
$$;

create or replace function public.create_external_topup_order(p_package_id text,p_payment_provider text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_order uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  if length(btrim(coalesce(p_payment_provider,'')))<2 then raise exception 'مزود الدفع غير محدد'; end if;
  if not exists(select 1 from public.topup_packages where id=p_package_id and active=true) then raise exception 'باقة الشحن غير متاحة'; end if;
  insert into public.external_topup_orders(user_id,package_id,payment_provider)
  values(v_user,p_package_id,btrim(p_payment_provider)) returning id into v_order;
  return v_order;
end;
$$;

revoke all on function public.admin_create_agency(text,text,bigint,numeric,numeric) from public,anon;
grant execute on function public.admin_create_agency(text,text,bigint,numeric,numeric) to authenticated;
revoke all on function public.agency_add_member(uuid,bigint,text) from public,anon;
grant execute on function public.agency_add_member(uuid,bigint,text) to authenticated;
revoke all on function public.agency_remove_member(uuid,bigint) from public,anon;
grant execute on function public.agency_remove_member(uuid,bigint) to authenticated;
revoke all on function public.agent_recharge_user(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.agent_recharge_user(uuid,bigint,text,text,text) to authenticated;
revoke all on function public.create_external_topup_order(text,text) from public,anon;
grant execute on function public.create_external_topup_order(text,text) to authenticated;


-- SECURITY DEFINER membership helper avoids recursive RLS policies on agency_members.
create or replace function private.is_agency_member(p_agency_id uuid,p_roles text[] default null)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.agency_members m
     where m.agency_id=p_agency_id
       and m.user_id=auth.uid()
       and m.status='active'
       and (p_roles is null or m.member_role=any(p_roles))
  );
$$;
revoke all on function private.is_agency_member(uuid,text[]) from public,anon;
grant execute on function private.is_agency_member(uuid,text[]) to authenticated;

drop policy if exists "Agency members read their agencies" on public.agencies;
create policy "Agency members read their agencies" on public.agencies
for select to authenticated using (public.is_admin() or private.is_agency_member(id,null));

drop policy if exists "Users read their agency memberships" on public.agency_members;
create policy "Users read their agency memberships" on public.agency_members
for select to authenticated using (public.is_admin() or user_id=auth.uid() or private.is_agency_member(agency_id,array['owner','manager']));

drop policy if exists "Agency owners read agency wallets" on public.agency_wallets;
create policy "Agency owners read agency wallets" on public.agency_wallets
for select to authenticated using (public.is_admin() or private.is_agency_member(agency_id,array['owner','manager']));

drop policy if exists "Agency members read recharge records" on public.agency_recharges;
create policy "Agency members read recharge records" on public.agency_recharges
for select to authenticated using (public.is_admin() or target_user_id=auth.uid() or private.is_agency_member(agency_id,array['owner','manager','agent']));

drop policy if exists "Agency owners read agency commission ledger" on public.agency_commission_ledger;
create policy "Agency owners read agency commission ledger" on public.agency_commission_ledger
for select to authenticated using (public.is_admin() or private.is_agency_member(agency_id,array['owner','manager']));

drop policy if exists "Agency owners read audit logs" on public.agency_audit_logs;
create policy "Agency owners read audit logs" on public.agency_audit_logs
for select to authenticated using (public.is_admin() or private.is_agency_member(agency_id,array['owner','manager']));

create or replace function public.create_external_topup_order(p_package_id text,p_payment_provider text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_order uuid; v_package public.topup_packages%rowtype;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول'; end if;
  if length(btrim(coalesce(p_payment_provider,'')))<2 then raise exception 'مزود الدفع غير محدد'; end if;
  select * into v_package from public.topup_packages where id=p_package_id and active=true;
  if not found then raise exception 'باقة الشحن غير متاحة'; end if;
  insert into public.external_topup_orders(user_id,package_id,payment_provider,coins,price_dzd)
  values(v_user,p_package_id,btrim(p_payment_provider),v_package.coins,v_package.price_dzd)
  returning id into v_order;
  return v_order;
end;
$$;


create or replace function public.admin_update_agency(
  p_agency_id uuid,p_status text,p_commission_percent numeric,p_agent_commission_percent numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  if p_status not in ('pending','active','suspended') then raise exception 'حالة الوكالة غير صالحة'; end if;
  if p_commission_percent not between 0 and 100 or p_agent_commission_percent not between 0 and 100 then raise exception 'نسبة العمولة غير صالحة'; end if;
  update public.agencies set status=p_status,commission_percent=p_commission_percent,
    agent_commission_percent=p_agent_commission_percent,updated_at=now()
   where id=p_agency_id;
  if not found then raise exception 'الوكالة غير موجودة'; end if;
  insert into public.agency_audit_logs(agency_id,actor_id,action,details)
  values(p_agency_id,auth.uid(),'agency_updated',jsonb_build_object('status',p_status,'commission_percent',p_commission_percent,'agent_commission_percent',p_agent_commission_percent));
  return true;
end;
$$;
revoke all on function public.admin_update_agency(uuid,text,numeric,numeric) from public,anon;
grant execute on function public.admin_update_agency(uuid,text,numeric,numeric) to authenticated;

drop policy if exists "Agents read own commission ledger" on public.agent_commission_ledger;
create policy "Agents and agency owners read commission ledger" on public.agent_commission_ledger
for select to authenticated using (
  public.is_admin() or user_id=auth.uid() or private.is_agency_member(agency_id,array['owner','manager'])
);
