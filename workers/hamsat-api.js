const kv = () => me.puter.kv;

const GIFTS = [
  { id: 'rose', name: 'وردة', price: 10, icon: 'flower-2' },
  { id: 'heart', name: 'قلب', price: 25, icon: 'heart' },
  { id: 'coffee', name: 'قهوة عربية', price: 40, icon: 'coffee' },
  { id: 'star', name: 'نجمة', price: 75, icon: 'star' },
  { id: 'moon', name: 'هلال', price: 120, icon: 'moon' },
  { id: 'gem', name: 'جوهرة', price: 250, icon: 'gem' },
  { id: 'crown', name: 'تاج', price: 500, icon: 'crown' },
  { id: 'rocket', name: 'صاروخ', price: 1000, icon: 'rocket' }
];
const WELCOME_BONUS = 100;
const DAILY_REWARD = 20;
const DAY = 24 * 60 * 60 * 1000;

function err(status, message) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}
async function who(user) {
  if (!user || !user.puter) return null;
  const u = await user.puter.getUser();
  return u && u.uuid ? { uuid: u.uuid, username: u.username } : null;
}
function clean(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max); }
function publicProfile(p) {
  if (!p) return null;
  return { uuid: p.uuid, handle: p.handle, displayName: p.displayName, bio: p.bio, country: p.country, color: p.color, createdAt: p.createdAt };
}
async function getWallet(uuid) {
  const balance = Number(await kv().get('balance:' + uuid)) || 0;
  const tx = (await kv().get('tx:' + uuid)) || [];
  const lastDaily = Number(await kv().get('daily:' + uuid)) || 0;
  return { balance, transactions: tx, lastDaily, nextDailyAt: lastDaily ? lastDaily + DAY : 0, dailyReward: DAILY_REWARD };
}
async function addTx(uuid, entry) {
  const tx = (await kv().get('tx:' + uuid)) || [];
  tx.unshift({ ...entry, at: Date.now() });
  await kv().set('tx:' + uuid, tx.slice(0, 50));
}

router.get('/me', async ({ user }) => {
  const me_ = await who(user);
  if (!me_) return err(401, 'يجب تسجيل الدخول');
  const profile = await kv().get('profile:' + me_.uuid);
  const wallet = profile ? await getWallet(me_.uuid) : null;
  return { account: me_, profile: profile || null, wallet };
});

router.post('/profile', async ({ request, user }) => {
  const me_ = await who(user);
  if (!me_) return err(401, 'يجب تسجيل الدخول');
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const displayName = clean(body.displayName, 40);
  const handle = clean(body.handle, 20).toLowerCase();
  const bio = clean(body.bio, 160);
  const country = clean(body.country, 30);
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#7c3aed';
  if (displayName.length < 2) return err(400, 'الاسم يجب أن يكون حرفين على الأقل');
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return err(400, 'اسم المستخدم: 3-20 حرفًا إنجليزيًا أو أرقام أو _');

  const existing = await kv().get('profile:' + me_.uuid);
  const owner = await kv().get('handle:' + handle);
  if (owner && owner !== me_.uuid) return err(409, 'اسم المستخدم محجوز، اختر اسمًا آخر');

  if (existing && existing.handle !== handle) await kv().del('handle:' + existing.handle);
  await kv().set('handle:' + handle, me_.uuid);

  const profile = {
    uuid: me_.uuid, puterUsername: me_.username, handle, displayName, bio, country, color,
    createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now()
  };
  await kv().set('profile:' + me_.uuid, profile);

  if (!existing) {
    await kv().incr('balance:' + me_.uuid, WELCOME_BONUS);
    await addTx(me_.uuid, { type: 'credit', amount: WELCOME_BONUS, label: 'مكافأة الترحيب' });
  }
  return { profile, wallet: await getWallet(me_.uuid), created: !existing };
});

router.get('/users', async () => {
  const items = (await kv().list('profile:*', true)) || [];
  const users = items.map(i => publicProfile(i.value)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  return { users, total: items.length };
});

router.get('/users/:handle', async ({ params }) => {
  const uuid = await kv().get('handle:' + String(params.handle).toLowerCase());
  if (!uuid) return err(404, 'المستخدم غير موجود');
  const p = await kv().get('profile:' + uuid);
  if (!p) return err(404, 'المستخدم غير موجود');
  return { profile: publicProfile(p) };
});

router.get('/wallet', async ({ user }) => {
  const me_ = await who(user);
  if (!me_) return err(401, 'يجب تسجيل الدخول');
  if (!(await kv().get('profile:' + me_.uuid))) return err(403, 'أكمل ملفك الشخصي أولًا');
  return { wallet: await getWallet(me_.uuid) };
});

router.post('/wallet/daily', async ({ user }) => {
  const me_ = await who(user);
  if (!me_) return err(401, 'يجب تسجيل الدخول');
  if (!(await kv().get('profile:' + me_.uuid))) return err(403, 'أكمل ملفك الشخصي أولًا');
  const last = Number(await kv().get('daily:' + me_.uuid)) || 0;
  const now = Date.now();
  if (last && now - last < DAY) return err(429, 'لقد استلمت مكافأة اليوم بالفعل');
  await kv().set('daily:' + me_.uuid, now);
  await kv().incr('balance:' + me_.uuid, DAILY_REWARD);
  await addTx(me_.uuid, { type: 'credit', amount: DAILY_REWARD, label: 'المكافأة اليومية' });
  return { wallet: await getWallet(me_.uuid) };
});

router.get('/rooms', async () => {
  const items = (await kv().list('room:*', true)) || [];
  const rooms = items.map(i => i.value).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  return { rooms };
});

router.post('/rooms', async ({ request, user }) => {
  const me_ = await who(user);
  if (!me_) return err(401, 'يجب تسجيل الدخول');
  const profile = await kv().get('profile:' + me_.uuid);
  if (!profile) return err(403, 'أكمل ملفك الشخصي أولًا');
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const title = clean(body.title, 50);
  const topic = clean(body.topic, 20);
  const description = clean(body.description, 160);
  if (title.length < 3) return err(400, 'عنوان الغرفة قصير جدًا');
  const items = (await kv().list('room:*', true)) || [];
  if (items.filter(i => i.value && i.value.ownerUuid === me_.uuid).length >= 3) return err(400, 'الحد الأقصى 3 غرف لكل مستخدم');
  const id = crypto.randomUUID();
  const room = { id, title, topic: topic || 'عام', description, ownerUuid: me_.uuid, ownerName: profile.displayName, ownerHandle: profile.handle, ownerColor: profile.color, createdAt: Date.now() };
  await kv().set('room:' + id, room);
  return { room };
});

router.delete('/rooms/:id', async ({ params, user }) => {
  const me_ = await who(user);
  if (!me_) return err(401, 'يجب تسجيل الدخول');
  const room = await kv().get('room:' + params.id);
  if (!room) return err(404, 'الغرفة غير موجودة');
  if (room.ownerUuid !== me_.uuid) return err(403, 'لا يمكنك حذف غرفة لا تملكها');
  await kv().del('room:' + params.id);
  return { ok: true };
});

router.get('/gifts', async () => ({ gifts: GIFTS }));
