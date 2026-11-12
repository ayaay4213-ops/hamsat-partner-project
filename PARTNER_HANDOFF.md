# Hamsat partner handoff — social rooms, gifts and cosmetics

## Current product foundation
- Arabic RTL PWA with Supabase Auth, profiles, wallets, public rooms, room membership, room text chat and realtime chat updates.
- Media upload uses the public `hamsat-media` bucket (images only, 5 MB max).
- Gifts are transferred through the server-side `send_gift` RPC; clients must never update wallet balances directly.
- Daily reward is handled by `claim_daily_reward`.
- Room members and chat are database-backed. Room membership is currently a durable membership record, not a live presence heartbeat.

## New migration to apply
Apply `supabase/migrations/0007_cosmetics_inventory.sql` in Supabase SQL Editor after migrations 0001–0006.
It creates:
- `shop_items`: frame and emoji-pack catalog.
- `user_inventory`: items owned by each member.
- `profiles.equipped_frame_id` and `profiles.equipped_emoji_pack_id`.
- `purchase_shop_item(item_id)`: atomic wallet debit + inventory insert + ledger transaction.
- `equip_shop_item(item_id)`: verifies ownership before equipping.
- `room_seats`: eight reservable room seats, one per member per room.
- `request_room_seat(room_id, seat_no)` and `leave_room_seat(room_id)`.
- Realtime publication for seat changes.

## Audio integration required from partner
The UI's seats are real reservations, but no audio is currently transmitted. Partner must select and integrate a production audio provider (e.g. LiveKit or Agora) and provide:
1. Secure server endpoint that issues short-lived room tokens after verifying the authenticated Supabase user and room membership.
2. Room-to-audio-channel mapping using the Supabase room UUID.
3. Join/leave audio lifecycle, mute/unmute, active-speaker indicators, speaker/listener roles.
4. Permission handling for microphone, network reconnect, backgrounding and Android lifecycle.
5. Server-side moderation controls: host/moderator mute, remove, lock room, block abusive users.
6. Never place provider secret keys or service-role keys in browser code.

## Important integration notes
- Seat reservation is not proof of an active audio publisher. Partner should synchronize reservation and audio join/leave and clear stale reservations safely.
- Existing `room_members` is not ephemeral presence. Implement heartbeat/presence or Supabase Presence for accurate online counts.
- Gift sending currently credits the recipient wallet and records a gift transaction. For a live-room visual animation, subscribe to new `gift_transactions` through a safe event feed or add a dedicated room gift event table that includes room_id. Do not trust client-supplied sender identity or prices.
- Current cosmetics use CSS-drawn frames and emoji packs. Replace/augment with approved transparent PNG/WebP/SVG assets and animation files after design approval.
- Current in-room quick emojis are inserted into chat text. Rich emoji stickers need a structured message type and a vetted asset catalog.
- Direct messages, notifications, agency/host roles, moderation dashboard, payment/top-up provider, Android packaging and production monitoring remain future work.

## Security checklist before public launch
- Review RLS policies and grants for every new table and RPC.
- Test two separate accounts: ownership, purchases, insufficient balance, double-purchase, frame equip, seat collision, seat release and cross-user access.
- Add rate limits and abuse controls to room creation, chat, gifts and seat requests.
- Set up backups, error monitoring, privacy policy, terms, account deletion and support process.
