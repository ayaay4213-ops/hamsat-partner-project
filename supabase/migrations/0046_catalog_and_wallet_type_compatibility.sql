-- HAMSAT catalog and wallet compatibility fixes.
-- The Room Bomb trigger writes room_bomb_reward ledger entries, and the
-- cosmetic equip RPC already supports these catalog types. The original
-- CHECK constraints did not yet allow either set of values.

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_transaction_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_transaction_type_check
  check (transaction_type in (
    'welcome',
    'daily_reward',
    'gift_sent',
    'gift_received',
    'admin_adjustment',
    'shop_purchase',
    'room_bomb_reward'
  ));

alter table public.shop_items
  drop constraint if exists shop_items_item_type_check;

alter table public.shop_items
  add constraint shop_items_item_type_check
  check (item_type in (
    'frame',
    'emoji_pack',
    'entrance',
    'sound_frame',
    'voice_wave',
    'profile_frame',
    'chat_bubble',
    'special_id'
  ));
