-- Prevent a payment receipt/reference from being credited more than once
-- within the same recharge agency. The unique index also closes concurrent
-- duplicate submissions: a conflicting transaction rolls back atomically.
create unique index if not exists agency_recharges_agency_payment_reference_uidx
on public.agency_recharges (agency_id, lower(btrim(payment_reference)))
where payment_reference is not null and length(btrim(payment_reference)) > 0;
