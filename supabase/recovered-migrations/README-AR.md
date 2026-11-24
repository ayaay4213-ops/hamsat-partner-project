# سجل استعادة ملفات HAMSAT — 24 نوفمبر 2026

هذا الملف يوضح حالة الترحيلات التي كانت ملفاتها مفقودة من فرع التطوير. لا تعتبر ملفات `RECONSTRUCTION` ترحيلات أصلية أو قابلة للتشغيل على قاعدة الإنتاج.

## الحالة النهائية

| الإصدار | الحالة | الموقع |
|---|---|---|
| 0017 social data API grants | أصل تاريخي مستعاد، مطابق 100% للنسخة الموجودة في فرع البناء القديم | `supabase/migrations/20261116115128_0017_social_data_api_grants.sql` |
| 0018 private DM conversation RPC | أصل تاريخي مستعاد، مطابق 100% للنسخة الموجودة في فرع البناء القديم | `supabase/migrations/20261116115248_0018_private_dm_conversation_rpc.sql` |
| 0019 friends and follows | إعادة بناء مرجعية من الإنتاج، ليست الأصل | فرع `recovery/0019-friends-and-follows` |
| 0020 resend friend requests | إعادة بناء مرجعية لفهرس الطلبات النشطة، ليست الأصل | فرع `recovery/0020-resend-friend-requests` |
| 0021 public user IDs | إعادة بناء مرجعية لعمود public_id، ليست الأصل | فرع `recovery/0021-public-user-ids` |
| 0022 room IDs and seat controls | إعادة بناء مرجعية من الجداول والقيود الحالية، ليست الأصل | فرع `recovery/0022-room-ids-seat-controls` |
| 0023 room seat limit guard | إعادة بناء مرجعية من الدالة والمشغل الحاليين، ليست الأصل | فرع `recovery/0023-room-seat-limit-guard` |
| 0024 room participant mute state | إعادة بناء مرجعية من الجدول وسياسات RLS الحالية، ليست الأصل | فرع `recovery/0024-room-participant-mute` |
| 0025 admin console catalog | الملف موجود مسبقاً في فرع التطوير وتم التحقق منه | `supabase/migrations/20261116143251_0025_admin_console_catalog.sql` |
| 0026 lock super admin owner only | إعادة بناء مرجعية لحماية دور الملف الشخصي، ليست الأصل | فرع `recovery/0026-super-admin-owner-only` |

## ضوابط مهمة

1. الملفان 0017 و0018 فقط هما نسختان تاريخيتان أصليتان، وقد أُضيفا إلى مجلد `supabase/migrations` في فرع التطوير لأن رقميهما وتوقيتهما يطابقان سجل الإنتاج.
2. ملفات 0019–0024 و0026 موجودة تحت `supabase/recovered-migrations/` في فروع استعادة مستقلة. لا تنقلها إلى مجلد الترحيلات النشط ولا تشغّلها على الإنتاج؛ قاعدة الإنتاج تحتوي آثار هذه التغييرات بالفعل، والملفات المعاد بناؤها ليست نسخ المصدر التاريخي.
3. الإصدار 0025 لم يكن ضمن قائمة الملفات المفقودة؛ الملف موجود بالفعل في فرع التطوير.
4. لا تدمج أي فرع استعادة إلى `main` دون مراجعة وموافقة منفصلة.
5. ترحيل 0080 الخاص بشراء عناصر المتجر ومكافآت القنبلة ما زال مؤجلاً، ولا يدخل ضمن هذه الاستعادة.
6. ترحيل `20261124152213_hamsat_private_room_game_answer_keys_rls` يفعّل RLS دفاعياً على `private.room_game_answer_keys`. الجدول في schema خاص، ولا يملك `anon` أو `authenticated` صلاحيات مباشرة عليه؛ دوال ألعاب الغرف المميزة بصلاحية SECURITY DEFINER والمملوكة لـ postgres تحتفظ بمسار الوصول الحالي. لا توجد سياسة صفوف عمداً، بحيث يكون الوصول المباشر محظوراً افتراضياً.

## الملفات المرجعية

## الملفات الموجودة في فرع التطوير

- [0017 الأصلي](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/feature/hamsat-security-core-2026-11-23/supabase/migrations/20261116115128_0017_social_data_api_grants.sql)
- [0018 الأصلي](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/feature/hamsat-security-core-2026-11-23/supabase/migrations/20261116115248_0018_private_dm_conversation_rpc.sql)
- [0025 الموجود مسبقاً](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/feature/hamsat-security-core-2026-11-23/supabase/migrations/20261116143251_0025_admin_console_catalog.sql)
- [إصلاح RLS لمفاتيح إجابات ألعاب الغرف](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/feature/hamsat-security-core-2026-11-23/supabase/migrations/20261124152213_hamsat_private_room_game_answer_keys_rls.sql)

- [0019 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0019-friends-and-follows/supabase/recovered-migrations/0019_friends_and_follows.RECONSTRUCTION.sql)
- [0020 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0020-resend-friend-requests/supabase/recovered-migrations/0020_allow_resending_rejected_friend_requests.RECONSTRUCTION.sql)
- [0021 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0021-public-user-ids/supabase/recovered-migrations/0021_add_public_user_ids.RECONSTRUCTION.sql)
- [0022 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0022-room-ids-seat-controls/supabase/recovered-migrations/0022_room_ids_seat_controls.RECONSTRUCTION.sql)
- [0023 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0023-room-seat-limit-guard/supabase/recovered-migrations/0023_guard_room_seat_limit.RECONSTRUCTION.sql)
- [0024 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0024-room-participant-mute/supabase/recovered-migrations/0024_room_participant_mute_state.RECONSTRUCTION.sql)
- [0026 reconstruction](https://github.com/ayaay4213-ops/hamsat-partner-project/blob/recovery/0026-super-admin-owner-only/supabase/recovered-migrations/0026_lock_super_admin_owner_only.RECONSTRUCTION.sql)
