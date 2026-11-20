-- HAMSAT: allow self-gifting and gifts to any member of the active room.
-- Existing RPC signatures and room-wide "All" behavior remain compatible.
do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.send_gift(uuid,text,integer,uuid)'::regprocedure);
  v_old := 'if p_recipient is null or p_recipient=v_sender then raise exception ''لا يمكن إرسال هدية إلى نفسك''; end if;';
  v_new := 'if p_recipient is null then raise exception ''المستلم غير صالح''; end if;';
  if position(v_old in v_def)=0 then
    raise exception 'Could not locate the expected self-gift restriction in send_gift';
  end if;
  execute replace(v_def,v_old,v_new);

  v_def := pg_get_functiondef('public.send_room_gift(uuid,uuid,text,integer,uuid)'::regprocedure);
  v_old := 'if not exists(select 1 from public.room_seats s where s.room_id=p_room_id and s.user_id=p_recipient) then';
  v_new := 'if not exists(select 1 from public.room_members m where m.room_id=p_room_id and m.user_id=p_recipient) then';
  if position(v_old in v_def)=0 then
    raise exception 'Could not locate the expected room-seat recipient restriction';
  end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'raise exception ''يمكن إرسال هدايا الغرفة إلى الجالسين على مقاعد المايك فقط'';';
  v_new := 'raise exception ''يمكن إرسال هدايا الغرفة إلى الأعضاء الموجودين داخل الغرفة فقط'';';
  if position(v_old in v_def)=0 then
    raise exception 'Could not locate the expected room gift validation message';
  end if;
  execute replace(v_def,v_old,v_new);
end;
$$;
