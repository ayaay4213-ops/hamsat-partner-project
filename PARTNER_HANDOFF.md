# Hamsat partner handoff

**Current authoritative status:** see [Arabic technical handoff](docs/PARTNER_HANDOFF_AR.md) and [acceptance checklist](acceptance-tests.md).

HAMSAT is an Arabic RTL PWA using Supabase for authentication, database, realtime and storage, with a LiveKit integration for room audio. The development branch includes room membership and up to 12 microphone seats, room chat/events/gifts, synchronized room games, room bomb, direct messages, notifications, social safety tools, cosmetics catalog/inventory, agency workflows and a Super Admin console.

These are code-level capabilities, not a claim that every workflow has passed real-device acceptance testing. The current branch is not approved for production release.

## Critical handoff notes
- The latest documented live database migration applied with user approval is `0059_require_room_membership_for_game_host.sql`. Do not apply further migrations without separate explicit approval.
- Do not change LiveKit or audio behavior without a demonstrated need; preserve the existing integration.
- Background and profile-frame catalog records exist, but the prepared image assets still need authorized Storage upload, review and activation.
- The financial model is incomplete: paid and promotional balances are not fully separated; host USD entitlements, settlement and international withdrawals are not complete.
- External top-up order creation does not prove payment. Do not credit balances until a verified payment-provider webhook and reconciliation process exist.
- Test using dedicated accounts and non-cash test data. Never test by sending real gifts or moving real funds.
- No production deployment or merge to `main` is authorized by this handoff.

## Required acceptance
Use `acceptance-tests.md` and record each test as passed, failed or not tested. At minimum, test two real devices and separate accounts for audio, room minimization/resume, seats, gifts, games, DMs, moderation, agency permissions and admin access. Complete security, privacy, backup and monitoring review before public release.
