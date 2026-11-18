-- HAMSAT room background catalog seed.
-- Prepared on the development branch only; do not apply until migration 0047 is approved.
-- Images intentionally remain NULL and all items inactive until uploaded and owner-approved.

insert into public.shop_items
  (id, name, item_type, price, rarity, visual_key, active, description, image_url, duration_days)
values
  ('free_01_queen_girl', 'خلفية الملكة الهادئة', 'room_background', 0, 'مجاني', 'free_01_queen_girl', false, 'خلفية مجانية هادئة لغرف همسات الصوتية.', null, 0),
  ('free_02_moonlit_terrace', 'شرفة ضوء القمر', 'room_background', 0, 'مجاني', 'free_02_moonlit_terrace', false, 'خلفية ليلية هادئة مستوحاة من ضوء القمر.', null, 0),
  ('free_03_gamer_girl', 'فتاة الألعاب', 'room_background', 0, 'مجاني', 'free_03_gamer_girl', false, 'خلفية مجانية بطابع الألعاب.', null, 0),
  ('free_04_neon_controller', 'نيون الألعاب', 'room_background', 0, 'مجاني', 'free_04_neon_controller', false, 'خلفية نيون مجانية لمحبي الألعاب.', null, 0),
  ('free_05_royal_teddy', 'الدبدوب الملكي', 'room_background', 0, 'مجاني', 'free_05_royal_teddy', false, 'خلفية لطيفة بطابع ملكي.', null, 0),
  ('free_06_ribbon_girl', 'شرائط وردية', 'room_background', 0, 'مجاني', 'free_06_ribbon_girl', false, 'خلفية أنثوية ناعمة بالشرائط الوردية.', null, 0),
  ('premium_07_gaming_throne', 'عرش الألعاب الملكي', 'room_background', 12000, 'مميز', 'premium_07_gaming_throne', false, 'خلفية مميزة بطابع العرش الملكي والألعاب. السعر المبدئي قابل للتعديل.', null, 0),
  ('premium_08_magic_stars', 'نجوم سحرية', 'room_background', 8000, 'مميز', 'premium_08_magic_stars', false, 'خلفية مميزة بطابع النجوم السحرية. السعر المبدئي قابل للتعديل.', null, 0),
  ('premium_09_royal_kitten', 'القطة الملكية', 'room_background', 7000, 'مميز', 'premium_09_royal_kitten', false, 'خلفية مميزة بطابع القطة الملكية. السعر المبدئي قابل للتعديل.', null, 0),
  ('premium_10_flower_girl', 'فتاة الزهور', 'room_background', 7000, 'مميز', 'premium_10_flower_girl', false, 'خلفية مميزة بطابع الزهور. السعر المبدئي قابل للتعديل.', null, 0),
  ('premium_11_fantasy_castle', 'قلعة الخيال', 'room_background', 10000, 'مميز', 'premium_11_fantasy_castle', false, 'خلفية مميزة بطابع القلعة الخيالية. السعر المبدئي قابل للتعديل.', null, 0),
  ('premium_12_cat_headphones', 'قطة بسماعات', 'room_background', 9000, 'مميز', 'premium_12_cat_headphones', false, 'خلفية مميزة بطابع القطة وسماعات الألعاب. السعر المبدئي قابل للتعديل.', null, 0)
on conflict (id) do nothing;
