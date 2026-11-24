-- HAMSAT 0084: limit recharge history for agents to their own operations.
drop policy if exists "Agency members read recharge records" on public.agency_recharges;

create policy "Agency members read permitted recharge records"
on public.agency_recharges
for select
to authenticated
using (
  coalesce(public.is_admin(), false)
  or target_user_id = (select auth.uid())
  or private.is_agency_member(agency_id, array['owner','manager']::text[])
  or (
    agent_id = (select auth.uid())
    and private.is_agency_member(agency_id, array['agent']::text[])
  )
);
