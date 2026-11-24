drop policy if exists "Members view active couple spaces publicly" on public.couple_spaces;
create policy "Members view active couple spaces publicly" on public.couple_spaces for select to authenticated using (status = 'active');
