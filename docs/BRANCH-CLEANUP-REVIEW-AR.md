# مراجعة تنظيف فروع HAMSAT — 2026-11-25

## حدود هذه المراجعة
- تمت مقارنة جميع الفروع الأربعين الظاهرة في المستودع مع `hamsat-approved-baseline-2026-11-25`.
- لم يتم حذف أو دمج أو إعادة توجيه أي فرع.
- لم يتم تعديل ملفات التطبيق أو قاعدة Supabase أو إعدادات Vercel.
- هذه القائمة توصية تنظيف وليست أمراً بحذف كل فرع مصنف كمرشح.

## الفروع التي يجب الاحتفاظ بها الآن
1. `main` — الفرع الرئيسي، لا يُحذف.
2. `hamsat-approved-baseline-2026-11-25` — نقطة الرجوع المعتمدة على commit `197c6490b998ec0a138d068075c6db97b0ed682f`.
3. `review/hamsat-safe-transfer-plan-2026-11-25` — فرع المراجعة والتوثيق الحالي.
4. `backup/last-known-good-2026-11-20` — نسخة احتياطية متباعدة، ولا تُحذف قبل حفظ ومراجعة اختلافاتها.
5. `build/hamsat-complete-app` — قاعدة PR #13 المفتوح.
6. `build/hamsat-migration-order-fix` و`work/hamsat-migration-order-fix` — يحتفظ بهما مؤقتاً حتى حسم PR #13 ومصدر إصلاح ترتيب الترحيلات.
7. `feature/live-audio-mvp` — مرتبط بـ PR #12 المفتوح.
8. `work/hamsat-room-background-staff-pwa-2026-11-20` — مرتبط بـ PR #15 المفتوح، ويحتوي ملف الترحيل `0062_shared_room_backgrounds_and_staff_roles.sql`.
9. `fix/hamsat-host-mic-seat-2026-11-20` — يحتفظ به مؤقتاً حتى مقارنة ملف الترحيل البديل `0062_room_shared_background_url.sql) مع مخطط الإنتاج.
10. `recovery/consolidated-0019-0026-reference` — المرجع المجمع لملفات الاستعادة؛ الملفات موصوفة بوضوح بأنها Reconstruction وليست migrations أصلية قابلة للتشغيل.
11. `repair/unify-zip-github` — يحتوي ملفات شريك وأصول PWA وعاملاً برمجياً فريداً لم يثبت بعد أنه نُقل إلى النسخة المعتمدة.
12. الفروع التالية ذات تغييرات فريدة وتحتاج قراراً بعد مراجعة الملفات، فلا تحذف الآن: `design/full-mobile-app-redesign`, `feat/real-rooms-without-audio`, `feature/connect-supabase-auth-and-data`, `feature/real-rooms-text-chat`, `feature/supabase-social-wallet-foundation`, `fix/auth-password-validation`, `fix/direct-signup-feedback`.

## مرشحة للحذف بعد التأكيد النهائي
هذه الفروع إما مطابقة تماماً لنقطة الأساس، أو لا تتقدم عليها بأي commit، أو أصبحت نسخ استعادة مفردة مكررة داخل الفرع المجمع. لا تحذف قبل التأكد من عدم ارتباطها بعملية نشر أو مرجع خارجي:
- `backup/hamsat-before-fixes-2026-11-23` — متأخر 218 commit ولا يحتوي commits فريدة مقارنة بالأساس.
- `backup/pre-unification-2026-11-12` — متأخر 1369 commit ولا يحتوي commits فريدة.
- `build/production-foundation` — متأخر 1274 commit ولا يحتوي commits فريدة.
- `feature/hamsat-security-core-2026-11-23` — مطابق تماماً لنقطة الأساس.
- `feature/supabase-auth-foundation` — متأخر 1363 commit ولا يحتوي commits فريدة.
- `fix/hamsat-security-and-core-2026-11-23` — متأخر 215 commit ولا يحتوي commits فريدة.
- `work/hamsat-all-saved-requirements-2026-11-17` — متأخر 891 commit ولا يحتوي commits فريدة.
- `work/hamsat-complete-update` — متأخر 948 commit ولا يحتوي commits فريدة.
- `work/hamsat-complete-update-2026-11-18` — متأخر 600 commit ولا يحتوي commits فريدة.
- `work/hamsat-design-updates-2026-11-21` — متأخر 468 commit ولا يحتوي commits فريدة.
- `work/hamsat-main-update-review-2026-11-20` — متأخر 556 commit ولا يحتوي commits فريدة.
- `work/hamsat-reference-redo-2026-11-21` — متأخر 218 commit ولا يحتوي commits فريدة.
- `work/hamsat-room-ui-redesign-2026-11-22` — متأخر 348 commit ولا يحتوي commits فريدة.
- `fix/profiles-table-grants` — ملف الترحيل الوحيد فيه مطابق حرفياً لنسخة محفوظة داخل `supabase/deferred-migrations/legacy-baseline` في الأساس.
- `recovery/0017-0018-original-source` — ملفا 0017 و0018 فيه مطابقان حرفياً للملفين الموجودين في الأساس.
- فروع الاستعادة المفردة التالية: `recovery/0019-friends-and-follows`, `recovery/0020-resend-friend-requests`, `recovery/0021-public-user-ids`, `recovery/0022-room-ids-seat-controls`, `recovery/0023-room-seat-limit-guard`, `recovery/0024-room-participant-mute`, `recovery/0026-super-admin-owner-only` — محتواها ممثل في الفرع المجمع أعلاه؛ يجب إبقاء الفرع المجمع وعدم نقل ملفات Reconstruction إلى مجلد migrations النشط.

## تنبيه مهم بخصوص مصدر قاعدة البيانات
- سجل Supabase الحي يحتوي ترحيلاً باسم `0062_shared_room_backgrounds_and_staff_roles`، لكن الملف المصدر غير موجود في النسخة المعتمدة عند فحص المسار.
- الملف المصدر موجود في فرع `work/hamsat-room-background-staff-pwa-2026-11-20`، لذلك لا تحذف هذا الفرع حتى يُحفظ المصدر في مكان معتمد وتتم مطابقته مع المخطط الحي.
- فرع `fix/hamsat-host-mic-seat-2026-11-20` يحتوي ترحيلاً مختلفاً باسم `0062_room_shared_background_url.sql`؛ لا تخلط بين الترحيلين ولا تشغّل أياً منهما مرة ثانية.
- PRs المفتوحة وقت الفحص: #12 و#13 و#15. لا تحذف فروعها أو فروع الأساس التي تعتمد عليها قبل إغلاقها أو حسمها.
- لا تعِد تشغيل ملفات `0001`–`0003` القديمة أو ملفات Reconstruction على قاعدة الإنتاج.

## نتيجة فحص الأمان المرتبطة بقرار التنظيف
- Security Advisor سجل 53 دالة SECURITY DEFINER قابلة للتنفيذ من authenticated؛ هذا تحذير مراجعة وليس إثباتاً بوجود 53 ثغرة. صلاحية anon كانت غير متاحة للدوال التي فُحصت، وكل دوال public التي عُرضت كان لها search_path مضبوطاً.
- بقي تحذير حماية كلمات المرور المسربة معطلاً، وجدولان في schema private عليهما RLS دون سياسات؛ يلزم حسم ما إذا كان ذلك مقصوداً قبل إغلاق التدقيق.
- لا توجد اختبارات قبول فعلية على هاتفين أو تحقق ميداني من الصوت ضمن هذه المراجعة.

## الخطوة الآمنة التالية
احتفظ بالقائمة أعلاه، ثم احذف المرشحات فقط بعد اعتماد القائمة النهائية والتحقق من عدم وجود نشر أو PR أو اعتماد خارجي. لا تُحذف النسخة المعتمدة أو الفرع الرئيسي أو الفرع المجمع للاستعادة.
