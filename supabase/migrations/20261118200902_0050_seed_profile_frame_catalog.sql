-- HAMSAT profile-frame catalog. Items stay inactive until their PNG assets are uploaded and reviewed by Super Admin.
insert into public.shop_items
  (id,name,item_type,price,rarity,visual_key,active,description,image_url,animation_url,duration_days)
values
  ('profile_orig_01_royal_crown','الإطار الملكي بالتاج','profile_frame',0,'قيد التصنيف','profile_orig_01_royal_crown',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_02_rose_pearl','إطار الورود واللؤلؤ','profile_frame',0,'قيد التصنيف','profile_orig_02_rose_pearl',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_03_purple_crystal','إطار الكريستال البنفسجي','profile_frame',0,'قيد التصنيف','profile_orig_03_purple_crystal',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_04_neon_gamer','إطار الألعاب والنيون','profile_frame',0,'قيد التصنيف','profile_orig_04_neon_gamer',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_05_hearts_butterflies','إطار القلوب والفراشات','profile_frame',0,'قيد التصنيف','profile_orig_05_hearts_butterflies',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_06_celestial_moon','إطار القمر والنجوم','profile_frame',0,'قيد التصنيف','profile_orig_06_celestial_moon',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_07_ice_snowflake','إطار الثلج الكريستالي','profile_frame',0,'قيد التصنيف','profile_orig_07_ice_snowflake',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_08_black_gold_royal','إطار الأسود والذهبي','profile_frame',0,'قيد التصنيف','profile_orig_08_black_gold_royal',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_orig_09_kawaii_cat','إطار القطة اللطيفة','profile_frame',0,'قيد التصنيف','profile_orig_09_kawaii_cat',false,'إطار صورة شخصي شفاف — يحتاج تصنيفاً وسعراً من الإدارة قبل النشر.',null,null,0),
  ('profile_ref_01_royal_gold_crown','إطار التاج الذهبي الملكي','profile_frame',0,'قيد التصنيف','profile_ref_01_royal_gold_crown',false,'إطار شخصي مستوحى من الطابع الملكي — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_02_pink_roses_pearls','إطار الورود الوردية واللآلئ','profile_frame',0,'قيد التصنيف','profile_ref_02_pink_roses_pearls',false,'إطار شخصي ناعم بالورود واللآلئ — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_03_purple_crystal_queen','إطار الملكة الكريستالية البنفسجية','profile_frame',0,'قيد التصنيف','profile_ref_03_purple_crystal_queen',false,'إطار شخصي كريستالي — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_04_neon_gamer_headset','إطار سماعة الألعاب النيون','profile_frame',0,'قيد التصنيف','profile_ref_04_neon_gamer_headset',false,'إطار شخصي بطابع الألعاب — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_05_pink_hearts_butterflies','إطار القلوب والفراشات الوردية','profile_frame',0,'قيد التصنيف','profile_ref_05_pink_hearts_butterflies',false,'إطار شخصي رومانسي — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_06_emerald_celestial_moon','إطار القمر الزمردي','profile_frame',0,'قيد التصنيف','profile_ref_06_emerald_celestial_moon',false,'إطار شخصي سماوي — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_07_ice_blue_snowflakes','إطار رقاقات الثلج الزرقاء','profile_frame',0,'قيد التصنيف','profile_ref_07_ice_blue_snowflakes',false,'إطار شخصي ثلجي — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_08_black_gold_rose','إطار الوردة السوداء والذهبية','profile_frame',0,'قيد التصنيف','profile_ref_08_black_gold_rose',false,'إطار شخصي فاخر — يحتاج مراجعة الإدارة.',null,null,0),
  ('profile_ref_09_purple_cat_bows','إطار القطة البنفسجية والفيونكات','profile_frame',0,'قيد التصنيف','profile_ref_09_purple_cat_bows',false,'إطار شخصي لطيف — يحتاج مراجعة الإدارة.',null,null,0)
on conflict (id) do nothing;
