import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { api } from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const screen = $('#screen');
const tabbar = $('#tabbar');

const state = { account: null, profile: null, wallet: null, gifts: null };

const COLORS = ['#7c3aed', '#9d174d', '#0f766e', '#b45309', '#1d4ed8', '#6d28d9', '#be123c', '#047857'];
const TOPICS = ['عام', 'دردشة', 'شعر وأدب', 'موسيقى', 'تقنية', 'رياضة', 'تعارف', 'ألعاب'];

/* ---------- helpers ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function icons_() { createIcons({ icons }); }
function initial(name) { return esc((name || '؟').trim().charAt(0)); }
function avatar(p, size = 44) {
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${esc(p?.color || '#5b3a85')};font-size:${Math.round(size * 0.42)}px">${initial(p?.displayName)}</div>`;
}
function num(n) { return Number(n || 0).toLocaleString('ar-EG'); }
function dateAr(ts) { return new Date(ts).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }); }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60); if (m < 60) return `منذ ${num(m)} د`;
  const h = Math.floor(m / 60); if (h < 24) return `منذ ${num(h)} س`;
  return `منذ ${num(Math.floor(h / 24))} يوم`;
}
let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 2800);
}
function loading() {
  return `<div class="flex-1 flex items-center justify-center py-24"><div class="spinner"></div></div>`;
}
function header(title, right = '') {
  return `<header class="sticky top-0 z-20 bg-ink-900/95 backdrop-blur border-b border-ink-700 px-5 h-14 flex items-center justify-between">
    <h1 class="text-lg font-bold">${title}</h1>${right}</header>`;
}
function coin(size = 18) {
  return `<span class="inline-flex items-center justify-center rounded-full bg-gold-500 text-ink-800" style="width:${size}px;height:${size}px"><i data-lucide="sparkle" style="width:${size * 0.6}px;height:${size * 0.6}px"></i></span>`;
}

function openSheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet"><div class="w-10 h-1 rounded-full bg-ink-500 mx-auto mb-4"></div>${html}</div>`;
  root.querySelector('.sheet-backdrop').onclick = closeSheet;
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
  icons_();
  onMount && onMount(root.querySelector('.sheet'));
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }

/* ---------- auth ---------- */
async function signIn() {
  try {
    await puter.auth.signIn();
    await boot();
  } catch (e) {
    toast('لم يكتمل تسجيل الدخول', 'error');
  }
}
async function signOut() {
  closeSheet();
  try { puter.auth.signOut(); } catch (e) {}
  state.account = state.profile = state.wallet = null;
  location.hash = '#/home';
  render();
}

async function loadMe() {
  const data = await api.me();
  state.account = data.account;
  state.profile = data.profile;
  state.wallet = data.wallet;
}

/* ---------- screens ---------- */
function welcomeScreen() {
  tabbar.classList.add('hidden');
  screen.className = 'flex-1 flex flex-col';
  screen.innerHTML = `
  <div class="auth-page flex-1 flex flex-col fade-in">
    <div class="auth-brand text-center px-7 pt-8">
      <img src="assets/hamsat-hero.svg" alt="امرأة أنيقة وقط أبيض بزخارف ذهبية" class="auth-art">
      <p class="text-gold-400 text-xs tracking-[.35em] mb-1">WELCOME TO</p>
      <h1 class="text-4xl font-extrabold text-gold-300 mb-1">همسات</h1>
      <p class="text-xs tracking-[.3em] text-gold-600">H A M S A T</p>
      <p class="text-sm text-[#cbb9a6] leading-7 mt-3">مساحتك الخاصة للحديث، والتعارف، وصناعة لحظات جميلة.</p>
    </div>
    <div class="auth-panel mx-5 mt-5 mb-8 p-5 rounded-3xl">
      <h2 class="text-xl font-bold mb-1">أهلًا بكِ من جديد</h2>
      <p class="text-sm text-[#b7b2a5] mb-5">سجّلي الدخول للانتقال إلى الصفحة الرئيسية</p>
      <div class="grid grid-cols-2 gap-2 mb-4" id="auth-methods">
        <button type="button" data-method="email" class="auth-method active">البريد الإلكتروني</button>
        <button type="button" data-method="phone" class="auth-method">رقم الهاتف</button>
      </div>
      <form id="auth-preview-form" class="space-y-3">
        <label class="label" id="auth-id-label">البريد الإلكتروني</label>
        <input id="auth-identity" class="field" type="email" autocomplete="email" dir="ltr" placeholder="name@example.com" required>
        <label class="label">كلمة المرور</label>
        <input id="auth-password" class="field" type="password" autocomplete="current-password" placeholder="أدخلي كلمة المرور" required>
        <button type="submit" class="btn-gold w-full mt-2"><i data-lucide="log-in" class="w-5 h-5"></i>تسجيل الدخول</button>
      </form>
      <button id="auth-create" class="btn-ghost w-full mt-3">إنشاء حساب جديد</button>
      <div class="auth-divider"><span>أو للتجربة الحالية</span></div>
      <button id="btn-signin" class="btn-ghost w-full"><i data-lucide="user-round" class="w-5 h-5"></i>الدخول التجريبي عبر Puter</button>
      <p class="text-[11px] text-center text-[#9c9686] leading-5 mt-4">تسجيل الدخول بالبريد أو الهاتف ظاهر كواجهة أولية؛ يحتاج ربط خدمة حسابات فعلية. الدخول التجريبي يستخدم Puter.</p>
    </div>
  </div>`;
  let method = 'email';
  const identity = $('#auth-identity');
  const label = $('#auth-id-label');
  screen.querySelectorAll('[data-method]').forEach(b => b.onclick = () => {
    method = b.dataset.method;
    screen.querySelectorAll('[data-method]').forEach(x => x.classList.toggle('active', x === b));
    label.textContent = method === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف';
    identity.type = method === 'email' ? 'email' : 'tel';
    identity.autocomplete = method === 'email' ? 'email' : 'tel';
    identity.dir = method === 'email' ? 'ltr' : 'auto';
    identity.placeholder = method === 'email' ? 'name@example.com' : '+213 5XX XX XX XX';
    identity.value = '';
  });
  $('#auth-preview-form').onsubmit = e => {
    e.preventDefault();
    toast('هذه الواجهة جاهزة شكليًا؛ يلزم ربط خدمة تسجيل دخول بالبريد أو الهاتف قبل أن تعمل الحسابات.', 'error');
  };
  $('#auth-create').onclick = () => toast('إنشاء الحساب بالبريد أو الهاتف يحتاج ربط خدمة حسابات فعلية.', 'error');
  $('#btn-signin').onclick = signIn;
  icons_();
}

function profileForm(p = {}, isNew = true) {
  const color = p.color || COLORS[0];
  return `
  <form id="profile-form" class="space-y-4">
    <div class="flex flex-col items-center gap-3 pb-2">
      <div id="pf-avatar">${avatar({ displayName: p.displayName || 'ه', color }, 76)}</div>
      <div class="flex gap-2" id="pf-colors">
        ${COLORS.map(c => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${c === color ? 'border-gold-400' : 'border-transparent'}" style="background:${c}" aria-label="لون"></button>`).join('')}
      </div>
      <input type="hidden" name="color" value="${esc(color)}">
    </div>
    <div><label class="label">الاسم الظاهر</label><input name="displayName" class="field" maxlength="40" required placeholder="مثال: نور الهدى" value="${esc(p.displayName || '')}"></div>
    <div><label class="label">اسم المستخدم</label>
      <div class="relative"><input name="handle" class="field ltr text-left pl-8" dir="ltr" maxlength="20" required placeholder="username" value="${esc(p.handle || state.account?.username?.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || '')}"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#6e5a8c]">@</span></div>
      <p class="text-[11px] text-[#8a76a8] mt-1">أحرف إنجليزية صغيرة وأرقام و _ فقط</p></div>
    <div><label class="label">نبذة عنك</label><textarea name="bio" class="field resize-none" rows="3" maxlength="160" placeholder="اكتب شيئًا عن نفسك...">${esc(p.bio || '')}</textarea></div>
    <div><label class="label">الدولة</label><input name="country" class="field" maxlength="30" placeholder="اختياري" value="${esc(p.country || '')}"></div>
    <button type="submit" class="btn-gold w-full">${isNew ? '<i data-lucide="check" class="w-5 h-5"></i>إنشاء الملف الشخصي' : '<i data-lucide="save" class="w-5 h-5"></i>حفظ التغييرات'}</button>
  </form>`;
}

function bindProfileForm(root, onSaved) {
  const form = root.querySelector('#profile-form');
  const colorInput = form.querySelector('[name=color]');
  const nameInput = form.querySelector('[name=displayName]');
  const refreshAvatar = () => {
    form.querySelector('#pf-avatar').innerHTML = avatar({ displayName: nameInput.value || 'ه', color: colorInput.value }, 76);
  };
  form.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    colorInput.value = b.dataset.color;
    form.querySelectorAll('[data-color]').forEach(x => x.classList.replace('border-gold-400', 'border-transparent'));
    b.classList.replace('border-transparent', 'border-gold-400');
    refreshAvatar();
  });
  nameInput.oninput = refreshAvatar;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const fd = Object.fromEntries(new FormData(form));
    btn.disabled = true;
    try {
      const res = await api.saveProfile(fd);
      state.profile = res.profile;
      state.wallet = res.wallet;
      onSaved(res);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

function onboardingScreen() {
  tabbar.classList.add('hidden');
  screen.className = 'flex-1 flex flex-col';
  screen.innerHTML = `
    <div class="px-6 pt-10 pb-8 fade-in">
      <p class="text-gold-400 text-sm font-medium mb-1">خطوة أخيرة</p>
      <h1 class="text-2xl font-extrabold mb-2">أنشئ ملفك الشخصي</h1>
      <p class="text-sm text-[#bba9d6] mb-6">هكذا سيراك الآخرون في همسات. ستحصل على ١٠٠ عملة ترحيبية.</p>
      ${profileForm({}, true)}
      <button id="ob-out" class="w-full text-sm text-[#8a76a8] mt-5 py-2">تسجيل الخروج</button>
    </div>`;
  icons_();
  bindProfileForm(screen, () => { toast('أهلًا بك في همسات! أُضيفت ١٠٠ عملة لمحفظتك'); location.hash = '#/home'; render(); });
  $('#ob-out').onclick = signOut;
}

async function homeScreen() {
  const p = state.profile;
  screen.innerHTML = `
  <header class="px-5 pt-6 pb-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="#/me">${avatar(p, 44)}</a>
      <div><p class="text-xs text-[#a993c8]">مرحبًا بعودتك</p><p class="font-bold text-[17px]">${esc(p.displayName)}</p></div>
    </div>
    <a href="#/wallet" class="flex items-center gap-1.5 bg-ink-800 border border-ink-600 rounded-full ps-2 pe-3 py-1.5">${coin(20)}<span class="font-bold text-gold-300 text-sm">${num(state.wallet?.balance)}</span></a>
  </header>
  <div class="px-5 space-y-6 pb-6 fade-in">
    <div class="card ornament p-5 border-gold-600/30 home-hero-card">
      <img src="assets/hamsat-hero.svg" alt="زخارف همسات الذهبية مع قطة بيضاء" class="home-hero-art">
      <p class="text-gold-400 text-sm font-medium mb-1">همسات</p>
      <h2 class="text-xl font-bold mb-2 leading-8">أنشئ غرفتك وابدأ الحديث</h2>
      <p class="text-[13px] text-[#bba9d6] leading-6 mb-4">اختر موضوعًا وادعُ أصدقاءك. ميزة البث الصوتي المباشر قيد التطوير حاليًا.</p>
      <a href="#/rooms?new=1" class="btn-gold text-sm py-2.5"><i data-lucide="plus" class="w-4 h-4"></i>غرفة جديدة</a>
    </div>
    <div class="grid grid-cols-4 gap-3">
      ${[['mic', 'الغرف', '#/rooms'], ['gift', 'الهدايا', '#/gifts'], ['calendar-check', 'المكافأة', '#/wallet'], ['pen-line', 'ملفي', '#/me']].map(([i, t, h]) => `
        <a href="${h}" class="flex flex-col items-center gap-2"><span class="w-14 h-14 rounded-2xl bg-ink-800 border border-ink-700 flex items-center justify-center"><i data-lucide="${i}" class="w-6 h-6 text-gold-400"></i></span><span class="text-xs text-[#cbb9e6]">${t}</span></a>`).join('')}
    </div>
    <section>
      <div class="flex items-center justify-between mb-3"><h3 class="font-bold">أحدث الغرف</h3><a href="#/rooms" class="text-xs text-gold-400">عرض الكل</a></div>
      <div id="home-rooms" class="space-y-3"><div class="skeleton h-20"></div><div class="skeleton h-20"></div></div>
    </section>
    <section>
      <div class="flex items-center justify-between mb-3"><h3 class="font-bold">أعضاء جدد</h3><span id="members-count" class="text-xs text-[#8a76a8]"></span></div>
      <div id="home-users" class="flex gap-4 overflow-x-auto no-scrollbar pb-1"><div class="skeleton w-16 h-20 shrink-0"></div><div class="skeleton w-16 h-20 shrink-0"></div></div>
    </section>
  </div>`;
  icons_();
  const [rooms, users] = await Promise.allSettled([api.rooms(), api.users()]);
  const hr = $('#home-rooms'); if (!hr) return;
  if (rooms.status === 'fulfilled') {
    const list = rooms.value.rooms.slice(0, 3);
    hr.innerHTML = list.length ? list.map(roomCard).join('') : emptyBox('mic-off', 'لا توجد غرف بعد', 'كن أول من ينشئ غرفة في همسات');
    bindRoomCards(hr, rooms.value.rooms);
  } else hr.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الغرف', rooms.reason.message);
  const hu = $('#home-users');
  if (users.status === 'fulfilled') {
    $('#members-count').textContent = `${num(users.value.total)} عضو`;
    hu.innerHTML = users.value.users.map(u => `
      <a href="#/u/${esc(u.handle)}" class="flex flex-col items-center gap-1.5 w-16 shrink-0">${avatar(u, 56)}<span class="text-[11px] text-[#cbb9e6] truncate w-full text-center">${esc(u.displayName)}</span></a>`).join('');
  } else hu.innerHTML = `<p class="text-sm text-[#8a76a8]">تعذّر تحميل الأعضاء</p>`;
  icons_();
}

function emptyBox(icon, title, sub = '') {
  return `<div class="card p-6 text-center"><i data-lucide="${icon}" class="w-8 h-8 mx-auto text-ink-500 mb-3"></i><p class="font-bold text-sm">${esc(title)}</p>${sub ? `<p class="text-xs text-[#8a76a8] mt-1">${esc(sub)}</p>` : ''}</div>`;
}

function roomCard(r) {
  return `<button data-room="${esc(r.id)}" class="card w-full p-4 flex items-center gap-3 text-right hover:border-ink-500 transition">
    <div class="w-12 h-12 rounded-2xl bg-ink-700 flex items-center justify-center shrink-0"><i data-lucide="audio-lines" class="w-6 h-6 text-gold-400"></i></div>
    <div class="flex-1 min-w-0">
      <p class="font-bold truncate">${esc(r.title)}</p>
      <p class="text-xs text-[#a993c8] mt-0.5 truncate">${esc(r.ownerName)} · ${timeAgo(r.createdAt)}</p>
    </div>
    <span class="chip">${esc(r.topic)}</span>
  </button>`;
}
function bindRoomCards(root, rooms) {
  root.querySelectorAll('[data-room]').forEach(b => b.onclick = () => openRoom(rooms.find(r => r.id === b.dataset.room)));
}

function openRoom(r) {
  if (!r) return;
  const mine = r.ownerUuid === state.profile?.uuid;
  openSheet(`
    <div class="flex items-start gap-3 mb-4">
      <div class="w-14 h-14 rounded-2xl bg-ink-700 flex items-center justify-center shrink-0"><i data-lucide="audio-lines" class="w-7 h-7 text-gold-400"></i></div>
      <div class="flex-1 min-w-0"><h2 class="text-lg font-bold leading-7">${esc(r.title)}</h2><span class="chip inline-block mt-1">${esc(r.topic)}</span></div>
    </div>
    ${r.description ? `<p class="text-sm text-[#cbb9e6] leading-7 mb-4">${esc(r.description)}</p>` : ''}
    <a href="#/u/${esc(r.ownerHandle)}" data-close class="card p-3 flex items-center gap-3 mb-4">${avatar({ displayName: r.ownerName, color: r.ownerColor }, 40)}<div><p class="text-xs text-[#a993c8]">المضيف</p><p class="font-bold text-sm">${esc(r.ownerName)}</p></div></a>
    <div class="rounded-2xl border border-dashed border-ink-500 p-4 flex gap-3 mb-5">
      <i data-lucide="info" class="w-5 h-5 text-gold-400 shrink-0 mt-0.5"></i>
      <p class="text-[13px] text-[#cbb9e6] leading-6">البث الصوتي المباشر غير متاح بعد في هذه النسخة. الغرفة محفوظة وستعمل فور إطلاق الميزة.</p>
    </div>
    <button class="btn-gold w-full mb-3" disabled><i data-lucide="mic" class="w-5 h-5"></i>الانضمام صوتيًا — قريبًا</button>
    ${mine ? `<button id="del-room" class="btn-danger w-full"><i data-lucide="trash-2" class="w-5 h-5"></i>حذف الغرفة</button>` : ''}
  `, (sheet) => {
    const del = sheet.querySelector('#del-room');
    if (del) del.onclick = async () => {
      if (!confirm('هل تريد حذف هذه الغرفة؟')) return;
      del.disabled = true;
      try { await api.deleteRoom(r.id); closeSheet(); toast('تم حذف الغرفة'); render(); }
      catch (e) { toast(e.message, 'error'); del.disabled = false; }
    };
  });
}

let roomFilter = 'الكل';
async function roomsScreen(params) {
  screen.innerHTML = header('الغرف الصوتية', `<button id="new-room" class="btn-gold text-sm py-2 px-3"><i data-lucide="plus" class="w-4 h-4"></i>إنشاء</button>`) + `
    <div class="px-5 pt-4 fade-in">
      <div id="filters" class="flex gap-2 overflow-x-auto no-scrollbar pb-3">
        ${['الكل', ...TOPICS].map(t => `<button data-t="${t}" class="chip ${t === roomFilter ? 'active' : ''}">${t}</button>`).join('')}
      </div>
      <div id="rooms-list" class="space-y-3 pt-1 pb-6">${loading()}</div>
    </div>`;
  icons_();
  $('#new-room').onclick = newRoomSheet;
  if (params.get('new')) { history.replaceState(null, '', '#/rooms'); newRoomSheet(); }
  let rooms = [];
  const draw = () => {
    const list = roomFilter === 'الكل' ? rooms : rooms.filter(r => r.topic === roomFilter);
    const el = $('#rooms-list'); if (!el) return;
    el.innerHTML = list.length ? list.map(roomCard).join('') : emptyBox('mic-off', 'لا توجد غرف هنا', 'أنشئ غرفة جديدة لتبدأ');
    bindRoomCards(el, rooms); icons_();
  };
  $('#filters').querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    roomFilter = b.dataset.t;
    $('#filters').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    draw();
  });
  try { rooms = (await api.rooms()).rooms; draw(); }
  catch (e) { const el = $('#rooms-list'); if (el) { el.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الغرف', e.message); icons_(); } }
}

function newRoomSheet() {
  openSheet(`
    <h2 class="text-lg font-bold mb-4">غرفة جديدة</h2>
    <form id="room-form" class="space-y-4">
      <div><label class="label">عنوان الغرفة</label><input name="title" class="field" maxlength="50" required placeholder="مثال: سهرة شعرية"></div>
      <div><label class="label">الموضوع</label><div id="topic-pick" class="flex flex-wrap gap-2">${TOPICS.map((t, i) => `<button type="button" data-t="${t}" class="chip ${i === 0 ? 'active' : ''}">${t}</button>`).join('')}</div><input type="hidden" name="topic" value="${TOPICS[0]}"></div>
      <div><label class="label">وصف قصير</label><textarea name="description" class="field resize-none" rows="3" maxlength="160" placeholder="اختياري"></textarea></div>
      <button class="btn-gold w-full" type="submit"><i data-lucide="check" class="w-5 h-5"></i>إنشاء الغرفة</button>
    </form>`, (sheet) => {
    const f = sheet.querySelector('#room-form');
    sheet.querySelectorAll('#topic-pick [data-t]').forEach(b => b.onclick = () => {
      f.topic.value = b.dataset.t;
      sheet.querySelectorAll('#topic-pick .chip').forEach(c => c.classList.toggle('active', c === b));
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await api.createRoom(Object.fromEntries(new FormData(f)));
        closeSheet(); toast('تم إنشاء الغرفة');
        if (location.hash.startsWith('#/rooms')) render(); else location.hash = '#/rooms';
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    };
  });
}

async function giftsScreen() {
  screen.innerHTML = header('الهدايا', `<a href="#/wallet" class="flex items-center gap-1.5 text-sm">${coin(18)}<span class="font-bold text-gold-300">${num(state.wallet?.balance)}</span></a>`) + `
    <div class="px-5 pt-4 pb-6 fade-in">
      <div class="rounded-2xl border border-dashed border-ink-500 p-4 flex gap-3 mb-5">
        <i data-lucide="info" class="w-5 h-5 text-gold-400 shrink-0 mt-0.5"></i>
        <p class="text-[13px] text-[#cbb9e6] leading-6">هذا كتالوج الهدايا المتاحة. إرسال الهدايا للأعضاء سيتوفر في تحديث قادم، ولن تُخصم أي عملات حاليًا.</p>
      </div>
      <div id="gifts-grid" class="grid grid-cols-2 gap-3">${loading()}</div>
    </div>`;
  icons_();
  try {
    if (!state.gifts) state.gifts = (await api.gifts()).gifts;
    const el = $('#gifts-grid'); if (!el) return;
    el.innerHTML = state.gifts.map(g => `
      <div class="card p-4 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-ink-700 border border-gold-600/30 flex items-center justify-center mb-3"><i data-lucide="${esc(g.icon)}" class="w-8 h-8 text-gold-400"></i></div>
        <p class="font-bold">${esc(g.name)}</p>
        <p class="flex items-center gap-1 text-sm text-gold-300 mt-1 mb-3">${coin(16)}${num(g.price)}</p>
        <span class="badge-soon">الإرسال قريبًا</span>
      </div>`).join('');
    icons_();
  } catch (e) { const el = $('#gifts-grid'); if (el) { el.className = ''; el.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الهدايا', e.message); icons_(); } }
}

async function walletScreen() {
  screen.innerHTML = header('المحفظة') + `<div id="wallet-body" class="px-5 pt-4 pb-6 fade-in">${loading()}</div>`;
  try { state.wallet = (await api.wallet()).wallet; } catch (e) { toast(e.message, 'error'); }
  drawWallet();
}
function drawWallet() {
  const el = $('#wallet-body'); if (!el) return;
  const w = state.wallet || { balance: 0, transactions: [] };
  const canClaim = !w.nextDailyAt || Date.now() >= w.nextDailyAt;
  const hoursLeft = canClaim ? 0 : Math.ceil((w.nextDailyAt - Date.now()) / 3600000);
  el.innerHTML = `
    <div class="card ornament p-6 border-gold-600/30 mb-4">
      <p class="text-sm text-[#bba9d6] mb-2">رصيدك الحالي</p>
      <div class="flex items-center gap-3">${coin(36)}<span class="text-4xl font-extrabold text-gold-300">${num(w.balance)}</span><span class="text-sm text-[#a993c8] mt-2">عملة</span></div>
      <p class="text-[12px] text-[#8a76a8] mt-4">عملات افتراضية للاستخدام داخل همسات فقط، ولا قيمة نقدية لها.</p>
    </div>
    <div class="card p-4 flex items-center gap-3 mb-6">
      <div class="w-12 h-12 rounded-2xl bg-ink-700 flex items-center justify-center"><i data-lucide="calendar-check" class="w-6 h-6 text-gold-400"></i></div>
      <div class="flex-1"><p class="font-bold text-sm">المكافأة اليومية</p><p class="text-xs text-[#a993c8] mt-0.5">${canClaim ? `احصل على ${num(w.dailyReward || 20)} عملة مجانًا` : `متاحة بعد ${num(hoursLeft)} ساعة`}</p></div>
      <button id="claim" class="btn-gold text-sm py-2 px-4" ${canClaim ? '' : 'disabled'}>${canClaim ? 'استلام' : 'تم'}</button>
    </div>
    <h3 class="font-bold mb-3">سجل المعاملات</h3>
    <div class="card divide-y divide-ink-700">
      ${w.transactions?.length ? w.transactions.map(t => `
        <div class="flex items-center gap-3 p-4">
          <div class="w-10 h-10 rounded-full ${t.type === 'credit' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'} flex items-center justify-center"><i data-lucide="${t.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i></div>
          <div class="flex-1"><p class="text-sm font-medium">${esc(t.label)}</p><p class="text-[11px] text-[#8a76a8]">${dateAr(t.at)}</p></div>
          <span class="font-bold ${t.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'}" dir="ltr">${t.type === 'credit' ? '+' : '-'}${num(t.amount)}</span>
        </div>`).join('') : `<p class="p-6 text-center text-sm text-[#8a76a8]">لا توجد معاملات بعد</p>`}
    </div>`;
  icons_();
  const btn = $('#claim');
  if (btn && canClaim) btn.onclick = async () => {
    btn.disabled = true;
    try { state.wallet = (await api.claimDaily()).wallet; toast(`أُضيفت ${num(state.wallet.dailyReward)} عملة إلى محفظتك`); drawWallet(); }
    catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };
}

function profileView(p, own) {
  return `
    <div class="ornament border-b border-ink-700 px-5 pt-8 pb-6 flex flex-col items-center text-center">
      ${avatar(p, 92)}
      <h2 class="text-xl font-extrabold mt-4">${esc(p.displayName)}</h2>
      <p class="text-sm text-gold-400 mt-0.5" dir="ltr">@${esc(p.handle)}</p>
      ${p.bio ? `<p class="text-sm text-[#cbb9e6] leading-7 mt-3 max-w-xs">${esc(p.bio)}</p>` : own ? `<p class="text-sm text-[#8a76a8] mt-3">لم تضف نبذة بعد</p>` : ''}
      <div class="flex items-center gap-4 mt-4 text-xs text-[#a993c8]">
        ${p.country ? `<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i>${esc(p.country)}</span>` : ''}
        <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i>انضم ${dateAr(p.createdAt)}</span>
      </div>
    </div>`;
}

function meScreen() {
  const p = state.profile;
  screen.innerHTML = header('حسابي') + `<div class="fade-in">${profileView(p, true)}
    <div class="px-5 py-5 space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <a href="#/wallet" class="card p-4"><p class="text-xs text-[#a993c8] mb-1">الرصيد</p><p class="flex items-center gap-1.5 font-bold text-gold-300 text-lg">${coin(18)}${num(state.wallet?.balance)}</p></a>
        <div class="card p-4"><p class="text-xs text-[#a993c8] mb-1">حساب Puter</p><p class="font-bold text-sm truncate" dir="ltr">${esc(state.account?.username)}</p></div>
      </div>
      <button id="edit-profile" class="card w-full p-4 flex items-center gap-3 text-right"><i data-lucide="pen-line" class="w-5 h-5 text-gold-400"></i><span class="flex-1 font-medium">تعديل الملف الشخصي</span><i data-lucide="chevron-left" class="w-5 h-5 text-[#6e5a8c]"></i></button>
      <button id="share-profile" class="card w-full p-4 flex items-center gap-3 text-right"><i data-lucide="share-2" class="w-5 h-5 text-gold-400"></i><span class="flex-1 font-medium">نسخ اسم المستخدم</span><i data-lucide="chevron-left" class="w-5 h-5 text-[#6e5a8c]"></i></button>
      <button id="logout" class="btn-danger w-full mt-4"><i data-lucide="log-out" class="w-5 h-5"></i>تسجيل الخروج</button>
    </div></div>`;
  icons_();
  $('#logout').onclick = () => openSheet(`
    <h2 class="text-lg font-bold mb-2">تسجيل الخروج</h2>
    <p class="text-sm text-[#bba9d6] mb-5">هل أنت متأكد أنك تريد تسجيل الخروج من همسات؟ بياناتك محفوظة.</p>
    <div class="grid grid-cols-2 gap-3"><button data-close class="btn-ghost">إلغاء</button><button id="confirm-out" class="btn-danger">تسجيل الخروج</button></div>`,
    (s) => s.querySelector('#confirm-out').onclick = signOut);
  $('#edit-profile').onclick = () => openSheet(`<h2 class="text-lg font-bold mb-2">تعديل الملف الشخصي</h2>${profileForm(p, false)}`, (s) => {
    bindProfileForm(s, () => { closeSheet(); toast('تم حفظ التغييرات'); render(); });
  });
  $('#share-profile').onclick = async () => {
    try { await navigator.clipboard.writeText('@' + p.handle); toast('تم النسخ'); } catch (e) { toast('@' + p.handle); }
  };
}

async function userScreen(handle) {
  if (handle === state.profile?.handle) { location.hash = '#/me'; return; }
  screen.innerHTML = header('الملف الشخصي', `<button onclick="history.back()" class="p-2 -ml-2"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>`) + `<div id="user-body">${loading()}</div>`;
  icons_();
  try {
    const { profile } = await api.user(handle);
    $('#user-body').innerHTML = `<div class="fade-in">${profileView(profile, false)}
      <div class="px-5 py-5 space-y-3">
        <button class="btn-gold w-full" disabled><i data-lucide="gift" class="w-5 h-5"></i>إرسال هدية — قريبًا</button>
      </div></div>`;
  } catch (e) { $('#user-body').innerHTML = `<div class="p-5">${emptyBox('user-x', 'المستخدم غير موجود', e.message)}</div>`; }
  icons_();
}

/* ---------- router ---------- */
async function render() {
  closeSheet();
  if (!puter.auth.isSignedIn() || !state.account) return welcomeScreen();
  if (!state.profile) return onboardingScreen();

  const [path, query] = (location.hash.slice(1) || '/home').split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  const route = parts[0] || 'home';

  tabbar.classList.remove('hidden');
  screen.className = 'flex-1 flex flex-col has-tabbar';
  tabbar.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === route));
  window.scrollTo(0, 0);

  try {
    if (route === 'rooms') await roomsScreen(params);
    else if (route === 'gifts') await giftsScreen();
    else if (route === 'wallet') await walletScreen();
    else if (route === 'me') meScreen();
    else if (route === 'u' && parts[1]) await userScreen(decodeURIComponent(parts[1]));
    else await homeScreen();
  } catch (e) {
    screen.innerHTML = `<div class="p-5">${emptyBox('triangle-alert', 'حدث خطأ', e.message)}</div>`;
    icons_();
  }
}

async function boot() {
  icons_();
  screen.innerHTML = loading();
  if (!puter.auth.isSignedIn()) { state.account = null; return render(); }
  try {
    await loadMe();
  } catch (e) {
    if (e.status === 401) { state.account = null; }
    else {
      screen.innerHTML = `<div class="flex-1 flex flex-col items-center justify-center p-8 text-center">${emptyBox('wifi-off', 'تعذّر الاتصال بالخادم', e.message)}<button id="retry" class="btn-gold mt-4">إعادة المحاولة</button></div>`;
      icons_(); $('#retry').onclick = boot; return;
    }
  }
  render();
}

window.addEventListener('hashchange', () => { if (state.profile) render(); });
boot();
