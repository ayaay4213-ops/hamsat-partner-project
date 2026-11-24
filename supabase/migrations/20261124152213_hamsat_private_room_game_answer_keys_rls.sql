-- Defense in depth for the private room-game answer-key table.
-- The table remains inaccessible to client roles; SECURITY DEFINER game RPCs
-- owned by postgres retain their existing access and behavior.
alter table private.room_game_answer_keys enable row level security;
