# Legacy baseline migrations (archived)

These SQL files predate the production timestamped migration history. They are preserved for audit and fresh-environment reconstruction only; they are not active migrations.

Before archiving, the production database was inspected and the core objects represented by these files were found present, including profiles, rooms, wallets, gifts, room membership/messages/seats, shop inventory, games, profile visits, relevant RPCs, Auth/profile/room triggers, room appearance columns, and the `hamsat-media` storage bucket.

Do not move these files back into `supabase/migrations` or execute them against Production. Some include wallet, gift, and shop purchase functions and could affect financial behavior if replayed. A complete reproducible baseline still needs to be reconstructed and reviewed separately.

The original SQL content is preserved unchanged. Production migration history does not contain matching versions for these legacy filenames.
