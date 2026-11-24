-- HAMSAT 0081: expose safe game catalogue metadata without granting table reads.
create or replace function public.list_room_games()
returns table(
  id text,
  name text,
  description text,
  game_type text,
  icon text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  return query
    select g.id,g.name,g.description,g.game_type,g.icon
      from public.games g
     where g.active = true
       and g.game_type in ('quiz','trivia')
     order by g.sort_order,g.created_at desc;
end;
$function$;

revoke all on function public.list_room_games() from public, anon, authenticated;
grant execute on function public.list_room_games() to authenticated;
