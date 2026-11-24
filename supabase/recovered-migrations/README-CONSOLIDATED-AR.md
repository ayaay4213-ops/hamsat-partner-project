# HAMSAT — consolidated recovered migration references

This branch collects the seven reconstructed reference snapshots in one place for review.

**Important:** These are NOT the original historical migration sources. They must not be moved into `supabase/migrations`, applied to Production, or used to fill the official migration history. They are snapshots reconstructed from the current Production schema and should be compared with the live objects before any future use.

| Version | Reference snapshot |
|---|---|
| 0019 | `0019_friends_and_follows.RECONSTRUCTION.sql` |
| 0020 | `0020_allow_resending_rejected_friend_requests.RECONSTRUCTION.sql` |
| 0021 | `0021_add_public_user_ids.RECONSTRUCTION.sql` |
| 0022 | `0022_room_ids_seat_controls.RECONSTRUCTION.sql` |
| 0023 | `0023_guard_room_seat_limit.RECONSTRUCTION.sql` |
| 0024 | `0024_room_participant_mute_state.RECONSTRUCTION.sql` |
| 0026 | `0026_lock_super_admin_owner_only.RECONSTRUCTION.sql` |

The original 0017 and 0018 files remain on the development branch and are not duplicated here. Version 0025 already exists on the development branch. Production migration history contains 0019–0026, but the original SQL for the seven versions above was not found in the available Git branches or commit history.

No Production database changes, app deployments, merges to `main`, or financial-policy changes are part of this branch.
