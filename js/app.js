import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { api } from './api.js?v=20261116-hamsat-update-v6';
import { createVoiceRoom } from './voice-room.js?v=20261116-room-controls-v3';

const $ = (s, r = document) => r.querySelector(s);
const screen = $('#screen');
const tabbar = $('#tabbar');

const state = { account: null, profile: null, wallet: null, gifts: null, roomChannel: null, roomEventChannel: null, roomBombTimer: null, activeRoomId: null, voiceRoom: null };

// A recovery callback must own the screen until the new password is saved.
let passwordRecoveryActive = new URLSearchParams(location.hash.replace(/^#/, '')).get('type') === 'recovery'
  || new URLSearchParams(location.search).get('type') === 'recovery';

const COLORS = ['#7c3aed', '#9d174d', '#0f766e', '#b45309', '#1d4ed8', '#6d28d9', '#be123c', '#047857'];
const TOPICS = ['عام', 'دردشة', 'شعر وأدب', 'موسيقى', 'تقنية', 'رياضة', 'تعارف', 'ألعاب'];

/* ---------- helpers ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function icons_() { createIcons({ icons }); }

function wirePasswordTools(root = document) {
  root.querySelectorAll('[data-password-tools]').forEach(group => {
    const input = group.querySelector('input');
    const toggle = group.querySelector('[data-password-toggle]');
    const copy = group.querySelector('[data-password-copy]');
    if (!input || group.dataset.passwordToolsReady) return;
    group.dataset.passwordToolsReady = '1';
    toggle?.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      toggle.innerHTML = reveal ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
      toggle.setAttribute('aria-label', reveal ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
      toggle.setAttribute('title', reveal ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
      icons_();
    });
    copy?.addEventListener('click', async () => {
      if (!input.value) { toast('اكتبي كلمة المرور أولًا لنسخها.', 'error'); input.focus(); return; }
      try {
        await navigator.clipboard.writeText(input.value);
        toast('تم نسخ كلمة المرور.');
      } catch {
        input.focus(); input.select();
        const copied = document.execCommand('copy');
        toast(copied ? 'تم نسخ كلمة المرور.' : 'تعذّر النسخ؛ حددي كلمة المرور وانسخيها يدويًا.', copied ? '' : 'error');
      }
    });
  });
}

function initial(name) { return esc((name || '؟').trim().charAt(0)); }
function avatar(p, size = 44) {
  const style = `width:${size}px;height:${size}px;background:${esc(p?.color || '#5b3a85')};font-size:${Math.round(size * 0.42)}px`;
  const frameClass = p?.equippedFrameId ? ' frame-' + esc(p.equippedFrameId.replace('frame_','')) : '';
  return p?.avatarUrl
    ? `<div class="avatar avatar-photo${frameClass}" style="${style}"><img src="${esc(p.avatarUrl)}" alt="${esc(p.displayName || 'الصورة الشخصية')}" loading="lazy"></div>`
    : `<div class="avatar${frameClass}" style="${style}">${initial(p?.displayName)}</div>`;
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
function openSideMenu() {
  const root = $('#side-drawer-root'); if (!root) return;
  root.innerHTML = `<button class="side-drawer-backdrop" aria-label="إغلاق القائمة"></button><aside class="side-drawer" dir="rtl">
    <div class="side-drawer-brand"><span>H A M S A T</span><strong>HAMSAT ✦</strong><small>مساحتك للتواصل واللقاء</small></div>
    <nav class="side-drawer-links"><a href="#/home"><i data-lucide="house"></i>الرئيسية</a><a href="#/rooms"><i data-lucide="mic-2"></i>الغرف</a><a href="#/inbox"><i data-lucide="message-circle"></i>الرسائل الخاصة</a><a href="#/friends"><i data-lucide="users"></i>الأصدقاء والمتابعة</a><a href="#/notifications"><i data-lucide="bell"></i>الإشعارات</a><a href="#/gifts"><i data-lucide="gift"></i>الهدايا</a><a href="#/games"><i data-lucide="gamepad-2"></i>الألعاب</a><a href="#/shop"><i data-lucide="gem"></i>المتجر والمقتنيات</a><a href="#/wallet"><i data-lucide="wallet"></i>المحفظة</a><a href="#/me"><i data-lucide="user-round"></i>حسابي</a><a href="admin.html"><i data-lucide="shield"></i>لوحة الإدارة</a></nav>
    <p class="side-drawer-note">همسات · تواصل بأمان واحترام</p></aside>`;
  root.querySelector('.side-drawer-backdrop').onclick = closeSideMenu;
  root.querySelectorAll('a').forEach(a => a.onclick = closeSideMenu); icons_();
}
function closeSideMenu() { const root=$('#side-drawer-root'); if(root) root.innerHTML=''; }
function menuButton() { return `<button type="button" class="menu-button" aria-label="القائمة" onclick="window.hamsatOpenMenu()"><i data-lucide="menu"></i></button>`; }
window.hamsatOpenMenu = openSideMenu;
function header(title, right = '') {
  return `<header class="sticky top-0 z-20 bg-ink-900/95 backdrop-blur border-b border-ink-700 px-5 h-14 flex items-center justify-between">
    <div class="flex items-center gap-3">${menuButton()}<h1 class="text-lg font-bold">${title}</h1></div><div class="flex items-center gap-2">${right}</div></header>`;
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
function closeSheet() { if (state.voiceRoom) { const voice=state.voiceRoom; state.voiceRoom=null; voice.leave().catch(e=>console.warn('Could not stop room audio',e)); } if (state.roomChannel) { api.unsubscribeRoomChannel(state.roomChannel); state.roomChannel = null; } if (state.roomEventChannel) { api.unsubscribeRoomChannel(state.roomEventChannel); state.roomEventChannel = null; } if (state.roomBombTimer) { clearInterval(state.roomBombTimer); state.roomBombTimer = null; } if (state.activeRoomId) { const id=state.activeRoomId; state.activeRoomId=null; api.leaveRoom(id).catch(e=>console.warn('Could not leave room',e)); } $('#sheet-root').innerHTML = ''; }

/* ---------- auth ---------- */
async function signOut() {
  closeSheet();
  try { await api.signOut(); } catch (e) { toast(e.message, 'error'); return; }
  state.account = state.profile = state.wallet = null;
  location.hash = '#/home';
  await render();
}

async function loadMe() {
  const data = await api.me();
  state.account = data.account;
  state.profile = data.profile;
  state.wallet = data.wallet;
}

/* ---------- screens ---------- */
function resetPasswordScreen() {
  tabbar.classList.add('hidden');
  screen.className = 'flex-1 flex flex-col';
  screen.innerHTML = `
    <div class="auth-page flex-1 flex flex-col justify-center px-5 py-10 fade-in">
      <div class="auth-panel p-5 rounded-3xl max-w-md w-full mx-auto">
        <div class="text-center mb-5"><p class="text-gold-400 text-xs tracking-[.3em]">H A M S A T</p><h1 class="text-2xl font-extrabold text-gold-300 mt-2">إعادة تعيين كلمة المرور</h1><p class="text-sm text-[#b7b2a5] mt-2">اختاري كلمة مرور جديدة لحسابك</p></div>
        <form id="password-reset-form" class="space-y-3">
          <label class="label" for="reset-new-password">كلمة المرور الجديدة</label>
          <div class="password-tools" data-password-tools><input id="reset-new-password" class="field" type="password" minlength="8" autocomplete="new-password" required placeholder="8 أحرف على الأقل"><button type="button" data-password-toggle aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور"><i data-lucide="eye"></i></button><button type="button" data-password-copy aria-label="نسخ كلمة المرور" title="نسخ كلمة المرور"><i data-lucide="copy"></i></button></div>
          <label class="label" for="reset-confirm-password">تأكيد كلمة المرور</label>
          <div class="password-tools" data-password-tools><input id="reset-confirm-password" class="field" type="password" minlength="8" autocomplete="new-password" required placeholder="أعيدي كتابة كلمة المرور"><button type="button" data-password-toggle aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور"><i data-lucide="eye"></i></button><button type="button" data-password-copy aria-label="نسخ كلمة المرور" title="نسخ كلمة المرور"><i data-lucide="copy"></i></button></div>
          <p id="reset-feedback" class="hidden text-xs leading-6 rounded-xl p-3" role="status" aria-live="polite"></p>
          <button type="submit" class="btn-gold w-full">حفظ كلمة المرور الجديدة</button>
        </form>
      </div>
    </div>`;
  const form = $('#password-reset-form');
  const feedback = $('#reset-feedback');
  wirePasswordTools(screen);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const password = $('#reset-new-password').value;
    const confirm = $('#reset-confirm-password').value;
    if (password.length < 8) {
      feedback.textContent = 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.';
      feedback.className = 'text-xs leading-6 rounded-xl p-3 border border-red-500/30 bg-red-950/30 text-red-200';
      return;
    }
    if (password !== confirm) {
      feedback.textContent = 'كلمتا المرور غير متطابقتين.';
      feedback.className = 'text-xs leading-6 rounded-xl p-3 border border-red-500/30 bg-red-950/30 text-red-200';
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api.updatePassword(password);
      passwordRecoveryActive = false;
      history.replaceState(null, '', location.pathname + location.search);
      toast('تم تغيير كلمة المرور بنجاح. سجّلي الدخول بكلمتك الجديدة.');
      await api.signOut();
      state.account = state.profile = state.wallet = null;
      welcomeScreen();
    } catch (err) {
      feedback.textContent = err.message || 'تعذّر تغيير كلمة المرور. افتحي رابط الاستعادة الأحدث من بريدك.';
      feedback.className = 'text-xs leading-6 rounded-xl p-3 border border-red-500/30 bg-red-950/30 text-red-200';
    } finally { button.disabled = false; }
  };
}

function welcomeScreen() {
  tabbar.classList.add('hidden');
  screen.className = 'flex-1 flex flex-col';
  screen.innerHTML = `
  <div class="hs-welcome fade-in">
    <div class="hs-welcome-glow"></div>
    <header class="hs-welcome-head"><span class="hs-welcome-mark">✦</span><span>H A M S A T</span><span class="hs-welcome-mark">✦</span></header>
    <section class="hs-welcome-visual">
      <img src="https://cdn.pika.art/v2/creation/uploads/977d3915-12e7-4356-bf67-68b351020f52/27e2ac02b32f42f4ba7ff67c344d31ff.webp" alt="همسات">
      <div class="hs-welcome-title"><span>مساحة من الألفة والجمال</span><h1>HAMSAT</h1><small>حيث تلتقي الأرواح بالصوت</small></div>
    </section>
    <div class="hs-welcome-intro"><span class="hs-welcome-line"></span><p>أصدقاء جدد، غرف صوتية، ولحظات تبقى في القلب</p><span class="hs-welcome-line"></span></div>
    <div class="auth-panel hs-welcome-panel">
      <div class="hs-welcome-panel-head"><span>✧</span><div><h2>مرحبًا بعودتكِ</h2><p>سجّلي الدخول وعودي إلى مجتمع همسات</p></div><span>✧</span></div>
      <div class="grid grid-cols-2 gap-2 mb-4" id="auth-methods">
        <button type="button" data-method="email" class="auth-method active">البريد الإلكتروني</button>
        <button type="button" data-method="phone" class="auth-method" disabled title="تفعيل SMS مطلوب">الهاتف قريبًا</button>
      </div>
      <form id="auth-preview-form" class="space-y-3">
        <label class="label" id="auth-id-label">البريد الإلكتروني</label>
        <input id="auth-identity" class="field" type="email" autocomplete="email" dir="ltr" placeholder="name@example.com" required>
        <label class="label">كلمة المرور</label>
        <div class="password-tools" data-password-tools><input id="auth-password" class="field" type="password" autocomplete="current-password" placeholder="أدخلي كلمة المرور" required><button type="button" data-password-toggle aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور"><i data-lucide="eye"></i></button><button type="button" data-password-copy aria-label="نسخ كلمة المرور" title="نسخ كلمة المرور"><i data-lucide="copy"></i></button></div>
        <div id="auth-password-rules" class="hidden rounded-xl border border-gold-600/30 bg-ink-800/70 p-3 text-xs leading-6 text-[#cbb9a6]">لإنشاء حساب، يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل، وحرف إنجليزي صغير وحرف كبير ورقم ورمز خاص مثل @ أو # أو !</div>
        <button type="submit" class="btn-gold w-full mt-2"><i data-lucide="log-in" class="w-5 h-5"></i>دخول إلى HAMSAT</button>
      </form>
      <button id="auth-forgot" type="button" class="text-sm text-gold-300 underline underline-offset-4 mt-3 w-full text-center">نسيت كلمة المرور؟</button>
      <p id="auth-feedback" class="hidden text-xs leading-6 mt-3 rounded-xl p-3" role="status" aria-live="polite"></p>
      <button id="auth-create" class="btn-ghost w-full mt-3">إنشاء حساب جديد</button>
      <p class="text-[11px] text-center text-[#9c9686] leading-5 mt-4">بيانات حسابك محمية، ويمكنك العودة إلى همسات في أي وقت.</p>
    </div>
    <footer class="hs-welcome-footer">صُنعت بحبّ لتجمعنا <span>✦</span></footer>
  </div>`;
  let authMode = 'signin';
  const form = $('#auth-preview-form');
  const submit = form.querySelector('[type="submit"]');
  const create = $('#auth-create');
  const identity = $('#auth-identity');
  const passwordInput = $('#auth-password');
  const rules = $('#auth-password-rules');
  const feedback = $('#auth-feedback');
  wirePasswordTools(screen);
  const forgot = $('#auth-forgot');
  screen.querySelector('[data-method="phone"]').disabled = true;
  const showFeedback = (message, isError = false) => {
    feedback.textContent = message;
    feedback.className = 'text-xs leading-6 mt-3 rounded-xl p-3 ' + (isError
      ? 'border border-red-500/30 bg-red-950/30 text-red-200'
      : 'border border-gold-600/30 bg-ink-800/70 text-[#e7d8a8]');
    feedback.classList.remove('hidden');
  };
  const clearFeedback = () => { feedback.textContent = ''; feedback.classList.add('hidden'); };
  const syncAuthMode = () => {
    const signingUp = authMode === 'signup';
    submit.innerHTML = signingUp ? '<i data-lucide="user-plus" class="w-5 h-5"></i>إنشاء الحساب' : '<i data-lucide="log-in" class="w-5 h-5"></i>تسجيل الدخول';
    create.textContent = signingUp ? 'لديك حساب؟ تسجيل الدخول' : 'إنشاء حساب جديد';
    passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
    passwordInput.setAttribute('aria-describedby', signingUp ? 'auth-password-rules' : '');
    rules.classList.toggle('hidden', !signingUp);
    forgot.classList.toggle('hidden', signingUp);
    clearFeedback();
    icons_();
  };
  create.onclick = () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    syncAuthMode();
  };
  forgot.onclick = async () => {
    const email = identity.value.trim();
    if (!email) {
      showFeedback('اكتبي بريدك الإلكتروني أولًا، ثم اضغطي «نسيت كلمة المرور؟».', true);
      identity.focus();
      return;
    }
    forgot.disabled = true;
    try {
      await api.sendPasswordReset(email);
      showFeedback('إذا كان البريد مسجلًا، فسيصلك رابط استعادة كلمة المرور. افحصي الوارد والرسائل غير المرغوب فيها.');
    } catch (err) {
      showFeedback(err.message || 'تعذّر إرسال رابط الاستعادة. حاولي لاحقًا.', true);
    } finally { forgot.disabled = false; }
  };
  passwordInput.addEventListener('input', clearFeedback);
  identity.addEventListener('input', clearFeedback);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = identity.value.trim();
    const password = passwordInput.value;
    if (authMode === 'signup') {
      const checks = [
        password.length >= 8,
        /[a-z]/.test(password),
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        Array.from("!@#$%^&*()_+-=[]{};':\"\\\\|<>?,./`~").some((ch) => password.includes(ch))
      ];
      if (!checks.every(Boolean)) {
        showFeedback('كلمة المرور غير مطابقة للشروط: 8 أحرف على الأقل، حرف صغير، حرف كبير، رقم، ورمز خاص مثل @ أو # أو !.', true);
        passwordInput.focus();
        return;
      }
    }
    submit.disabled = true;
    clearFeedback();
    try {
      if (authMode === 'signin') {
        await api.signInWithEmail(email, password);
        await boot();
      } else {
        const result = await api.signUpWithEmail(email, password);
        if (result.session) {
          toast('تم إنشاء الحساب بنجاح');
          await boot();
        } else {
          authMode = 'signin';
          syncAuthMode();
          showFeedback('لم يسمح خادم التسجيل بالدخول المباشر. يجب إيقاف Confirm email في Supabase ثم حفظ التغيير. لا تحتاجين إلى فتح Gmail أو إدخال أي كود.', true);
        }
      }
    } catch (err) {
      const message = String(err?.message || '');
      if (/password.*(weak|contain|character)|weak password/i.test(message)) {
        showFeedback('كلمة المرور لا تحقق شروط الأمان. استخدمي 8 أحرف على الأقل مع حرف صغير وكبير ورقم ورمز خاص.', true);
      } else if (/email not confirmed/i.test(message)) {
        showFeedback('إعداد تأكيد البريد ما زال مفعّلًا على الخادم. أوقفي Confirm email في Supabase واحفظي التغيير، ثم أعيدي المحاولة ببريد جديد.', true);
      } else if (/invalid login credentials/i.test(message)) {
        showFeedback('البريد أو كلمة المرور غير صحيحة. تأكدي من كتابتهما كما عند إنشاء الحساب.', true);
      } else {
        showFeedback(message || 'تعذّر إكمال العملية. حاولي مرة أخرى.', true);
      }
    } finally { submit.disabled = false; }
  };
  icons_();
}

function profileForm(p = {}, isNew = true) {
  const color = p.color || COLORS[0];
  return `
  <form id="profile-form" class="space-y-4">
    <div class="flex flex-col items-center gap-3 pb-2">
      <div id="pf-avatar">${avatar({ displayName: p.displayName || 'ه', color, avatarUrl: p.avatarUrl }, 76)}</div>
      <label class="photo-picker"><i data-lucide="camera"></i><span>اختيار صورة من الهاتف</span><input type="file" name="avatarFile" accept="image/png,image/jpeg,image/webp" hidden></label>
      <input type="hidden" name="avatarUrl" value="${esc(p.avatarUrl || '')}">
      <div class="profile-media-fields card p-3 space-y-3">
        <div><label class="label">غلاف الملف الشخصي</label><label class="photo-picker"><i data-lucide="image"></i><span>اختيار صورة غلاف</span><input type="file" name="coverFile" accept="image/png,image/jpeg,image/webp" hidden></label><input type="hidden" name="coverUrl" value="${esc(p.coverUrl || '')}"></div>
        <div><label class="label">خلفية ملفي الشخصي</label><label class="photo-picker"><i data-lucide="palette"></i><span>اختيار خلفية من الهاتف</span><input type="file" name="backgroundFile" accept="image/png,image/jpeg,image/webp" hidden></label><input type="hidden" name="backgroundUrl" value="${esc(p.backgroundUrl || '')}"></div>
      </div>
      <div class="flex gap-2" id="pf-colors">
        ${COLORS.map(c => `<button type="button" data-color="${c}" class="w-7 h-7 rounded-full border-2 ${c === color ? 'border-gold-400' : 'border-transparent'}" style="background:${c}" aria-label="لون"></button>`).join('')}
      </div>
      <input type="hidden" name="color" value="${esc(color)}">
    </div>
    <div><label class="label">الاسم الظاهر</label><input name="displayName" class="field" maxlength="40" required placeholder="مثال: نور الهدى" value="${esc(p.displayName || '')}"></div>
    <div><label class="label">اسم المستخدم</label>
      <div class="relative"><input name="handle" class="field ltr text-left pl-8" dir="ltr" maxlength="20" required placeholder="username" value="${esc(p.handle || state.account?.username?.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || '')}"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#6e5a8c]">@</span></div>
      <p class="text-[11px] text-[#8a76a8] mt-1">أحرف إنجليزية صغيرة وأرقام و _ فقط</p></div>
    <div><label class="label">العمر</label><input name="age" class="field" type="number" min="13" max="120" placeholder="اختياري" value="${esc(p.age || '')}"></div>
    <div><label class="label">الجنس</label><select name="gender" class="field"><option value="">غير محدد</option><option value="female" ${p.gender==='female'?'selected':''}>أنثى</option><option value="male" ${p.gender==='male'?'selected':''}>ذكر</option><option value="other" ${p.gender==='other'?'selected':''}>آخر</option></select></div>
    <div><label class="label">نبذة عنك</label><textarea name="bio" class="field resize-none" rows="3" maxlength="160" placeholder="اكتب شيئًا عن نفسك...">${esc(p.bio || '')}</textarea></div>
    <div><label class="label">الدولة</label><input name="country" class="field" maxlength="30" placeholder="اختياري" value="${esc(p.country || '')}"></div>
    <button type="submit" class="btn-gold w-full">${isNew ? '<i data-lucide="check" class="w-5 h-5"></i>إنشاء الملف الشخصي' : '<i data-lucide="save" class="w-5 h-5"></i>حفظ التغييرات'}</button>
  </form>`;
}

function bindProfileForm(root, onSaved) {
  const form = root.querySelector('#profile-form');
  const colorInput = form.querySelector('[name=color]');
  const nameInput = form.querySelector('[name=displayName]');
  const saveButton = form.querySelector('button[type=submit]');
  const pendingUploads = new Set();
  const field = name => form.querySelector('[name="' + name + '"]');
  const refreshAvatar = () => {
    form.querySelector('#pf-avatar').innerHTML = avatar({ displayName: nameInput.value || 'ه', color: colorInput.value, avatarUrl: field('avatarUrl').value }, 76);
  };
  form.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    colorInput.value = b.dataset.color;
    form.querySelectorAll('[data-color]').forEach(x => x.classList.replace('border-gold-400', 'border-transparent'));
    b.classList.replace('border-transparent', 'border-gold-400');
    refreshAvatar();
  });
  nameInput.oninput = refreshAvatar;
  const bindMediaUpload = (fileName, folder, labelText) => {
    const input = field(fileName);
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const label = input.closest('label').querySelector('span');
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        toast('اختاري صورة JPG أو PNG أو WEBP بحجم أقل من 5 ميغابايت', 'error');
        input.value = '';
        return;
      }
      label.textContent = 'جارٍ رفع الصورة...';
      saveButton.disabled = true;
      const task = (async () => {
        const uploaded = await api.uploadMedia(file, folder);
        const urlField = field(fileName.replace('File', 'Url'));
        if (!uploaded?.url) throw new Error('تم رفع الملف لكن لم يصل رابط الصورة من التخزين');
        urlField.value = uploaded.url;
        label.textContent = 'تم رفع الصورة ✓';
        if (fileName === 'avatarFile') refreshAvatar();
        return uploaded.url;
      })().catch(err => {
        label.textContent = labelText;
        toast('لم تُحفظ الصورة: ' + err.message, 'error');
        throw err;
      }).finally(() => {
        pendingUploads.delete(task);
        saveButton.disabled = pendingUploads.size > 0;
      });
      pendingUploads.add(task);
    };
  };
  bindMediaUpload('avatarFile','avatars','اختيار صورة من الهاتف');
  bindMediaUpload('coverFile','profile-covers','اختيار صورة غلاف');
  bindMediaUpload('backgroundFile','profile-backgrounds','اختيار خلفية من الهاتف');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (pendingUploads.size) {
      try { await Promise.all([...pendingUploads]); }
      catch (_) { return; }
    }
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      handle: values.handle, displayName: values.displayName, bio: values.bio, age: values.age, gender: values.gender,
      country: values.country, color: values.color,
      avatarUrl: values.avatarUrl, coverUrl: values.coverUrl, backgroundUrl: values.backgroundUrl
    };
    saveButton.disabled = true;
    saveButton.textContent = 'جارٍ حفظ الملف...';
    try {
      const res = await api.saveProfile(payload);
      if (!res.profile) throw new Error('لم يرجع الخادم بيانات الملف بعد الحفظ');
      state.profile = res.profile;
      state.wallet = res.wallet;
      onSaved(res);
    } catch (err) {
      toast('تعذّر حفظ الملف: ' + err.message, 'error');
      saveButton.disabled = false;
      saveButton.innerHTML = 'إعادة المحاولة';
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
      <p class="text-sm text-[#bba9d6] mb-6">أكملي بياناتك ليظهر ملفك الشخصي للأعضاء الآخرين.</p>
      ${profileForm({}, true)}
      <button id="ob-out" class="w-full text-sm text-[#8a76a8] mt-5 py-2">تسجيل الخروج</button>
    </div>`;
  icons_();
  bindProfileForm(screen, () => { toast('تم حفظ ملفك الشخصي بنجاح'); location.hash = '#/home'; render(); });
  $('#ob-out').onclick = signOut;
}

async function homeScreen() {
  const p = state.profile;
  screen.innerHTML = '<div class="hs-home fade-in">' +
    '<header class="hs-home-top"><div class="hs-home-brand">' +
    '<button type="button" class="menu-button" aria-label="القائمة" onclick="window.hamsatOpenMenu()"><i data-lucide="menu"></i></button>' +
    '<a href="#/me" class="hs-home-avatar">' + avatar(p,44) + '</a>' +
    '<div><span>أهلًا بكِ في HAMSAT</span><strong>' + esc(p.displayName || 'صديقتنا') + '</strong></div></div>' +
    '<a href="#/wallet" class="hs-home-wallet">' + coin(19) + '<span>' + num(state.wallet?.balance) + '</span><i data-lucide="plus"></i></a></header>' +
    '<section class="hs-home-hero"><div class="hs-home-hero-copy"><span class="hs-home-kicker">H A M S A T · VOICE COMMUNITY</span>' +
    '<h1>هنا تبدأ<br><em>أجمل الحكايات</em></h1><p>اقتربي من الأصدقاء، اكتشفي المجتمعات الصوتية، وشاركي لحظاتك.</p>' +
    '<a href="#/rooms?new=1" class="hs-home-create"><i data-lucide="plus"></i> إنشاء غرفة</a></div>' +
    '<div class="hs-home-hero-art"><img src="https://cdn.pika.art/v2/creation/uploads/977d3915-12e7-4356-bf67-68b351020f52/27e2ac02b32f42f4ba7ff67c344d31ff.webp" alt="همسات"></div><span class="hs-home-orbit orbit-one"></span><span class="hs-home-orbit orbit-two"></span></section>' +
    '<section class="hs-home-shortcuts">' +
    '<a href="#/rooms"><span class="shortcut-icon"><i data-lucide="audio-lines"></i></span><b>الغرف</b><small>استمعي وشاركي</small></a>' +
    '<a href="#/gifts"><span class="shortcut-icon"><i data-lucide="gift"></i></span><b>الهدايا</b><small>أرسلي المحبة</small></a>' +
    '<a href="#/shop"><span class="shortcut-icon"><i data-lucide="gem"></i></span><b>المتجر</b><small>زيني حسابك</small></a>' +
    '<a href="#/wallet"><span class="shortcut-icon"><i data-lucide="wallet"></i></span><b>المحفظة</b><small>رصيدك ومكافآتك</small></a><a href="#/games"><span class="shortcut-icon"><i data-lucide="gamepad-2"></i></span><b>الألعاب</b><small>تحديات ممتعة</small></a></section>' +
    '<section class="hs-home-section"><div class="hs-home-section-head"><div><span>DISCOVER</span><h2>اكتشفي الغرف</h2></div><a href="#/rooms">عرض الكل <i data-lucide="arrow-left"></i></a></div>' +
    '<div id="home-rooms" class="hs-home-room-list"><div class="skeleton h-24"></div><div class="skeleton h-24"></div></div></section>' +
    '<section class="hs-home-members"><div class="hs-home-section-head"><div><span>NEW FRIENDS</span><h2>أعضاء مجتمعنا</h2></div><span id="members-count"></span></div>' +
    '<div id="home-users" class="hs-home-user-list"><div class="skeleton w-16 h-20 shrink-0"></div><div class="skeleton w-16 h-20 shrink-0"></div></div></section>' +
    '<div class="hs-home-footnote"><span>✦</span> همسات، مساحة تجمعنا <span>✦</span></div></div>';
  icons_();
  const [rooms, users] = await Promise.allSettled([api.rooms(), api.users()]);
  const hr = $('#home-rooms'); if (!hr) return;
  if (rooms.status === 'fulfilled') {
    const list = rooms.value.rooms.slice(0, 3);
    hr.innerHTML = list.length ? list.map(roomCard).join('') : emptyBox('mic-off', 'لا توجد غرف بعد', 'أنشئي أول غرفة وابدئي سهرتك مع الأصدقاء');
    bindRoomCards(hr, rooms.value.rooms);
  } else hr.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الغرف', rooms.reason.message);
  const hu = $('#home-users');
  if (users.status === 'fulfilled') {
    $('#members-count').textContent = num(users.value.total) + ' عضو';
    hu.innerHTML = users.value.users.slice(0,12).map(u => '<a href="#/u/' + esc(u.handle) + '" class="hs-home-user">' + avatar(u,56) + '<span>' + esc(u.displayName) + '</span></a>').join('') || '<p class="text-xs text-[#a993c8]">سيظهر الأعضاء هنا بعد إنشاء ملفاتهم الشخصية.</p>';
  } else hu.innerHTML = '<p class="text-sm text-[#a993c8]">تعذّر تحميل الأعضاء</p>';
  icons_();
}
function emptyBox(icon, title, sub = '') {
  return `<div class="card p-6 text-center"><i data-lucide="${icon}" class="w-8 h-8 mx-auto text-ink-500 mb-3"></i><p class="font-bold text-sm">${esc(title)}</p>${sub ? `<p class="text-xs text-[#8a76a8] mt-1">${esc(sub)}</p>` : ''}</div>`;
}

function roomCard(r) {
  return `<button data-room="${esc(r.id)}" class="room-card card w-full text-right overflow-hidden transition">
    <div class="room-cover" ${r.coverUrl ? `style="background-image:linear-gradient(180deg,rgba(4,5,8,.12),rgba(4,5,8,.78)),url('${esc(r.coverUrl)}');background-size:cover;background-position:center"` : ''}>
      <div class="room-cover-glow"></div>
      <span class="room-cover-tag"><i data-lucide="users" class="w-3.5 h-3.5"></i> غرفة عامة</span>
      <span class="room-cover-symbol"><i data-lucide="audio-lines" class="w-10 h-10"></i></span>
      <span class="room-cover-topic">${esc(r.topic)}</span>
    </div>
    <div class="room-card-body">
      <div class="flex items-center gap-2 min-w-0">
        <div class="min-w-0 flex-1"><p class="font-extrabold text-[15px] truncate">${esc(r.title)}</p><p class="text-xs text-[#b7b2a5] mt-1 truncate">بواسطة ${esc(r.ownerName)}</p></div>
        ${avatar({displayName:r.ownerName,color:r.ownerColor},38)}
      </div>
      <p class="room-description">${esc(r.description || 'مساحة مفتوحة للقاء والتعارف ومشاركة الأحاديث')}</p>
      <div class="room-card-footer"><span><i data-lucide="clock-3"></i>${timeAgo(r.createdAt)}</span><span class="room-enter">دخول الغرفة <i data-lucide="arrow-left"></i></span></div>
    </div>
  </button>`;
}
function bindRoomCards(root, rooms) {
  root.querySelectorAll('[data-room]').forEach(b => b.onclick = () => openRoom(rooms.find(r => r.id === b.dataset.room)));
}

async function openRoom(r) {
  if (!r) return;
  openSheet(`
    <div class="hs-room-head">
      <div class="hs-room-cover" style="${r.coverUrl ? `background-image:linear-gradient(180deg,#08090a22,#08090add),url(${JSON.stringify(r.coverUrl)})` : ''}">
        <div class="hs-room-head-row">
          <button type="button" class="hs-room-close" data-close aria-label="إغلاق"><i data-lucide="arrow-right"></i></button>
          <span class="hs-room-state"><i></i> غرفة اجتماعية</span>
          <button type="button" id="refresh-room" class="hs-room-close" aria-label="تحديث"><i data-lucide="refresh-cw"></i></button>
        </div><button type="button" id="room-bomb-floating" class="hs-room-bomb-floating" aria-label="قنبلة الغرفة"><span>💣</span><b id="room-bomb-level">LV.1</b><small id="room-bomb-percent">0%</small><i><em id="room-bomb-bar"></em></i></button>
        <div class="hs-room-title-row">
          <div class="hs-room-owner">${avatar({displayName:r.ownerName,color:r.ownerColor},52)}</div>
          <div class="min-w-0 flex-1"><h2><span class="hs-room-title-emoji">${esc(r.roomEmoji||'🎙️')}</span> ${esc(r.title)}</h2><p>${esc(r.topic)} · بواسطة ${esc(r.ownerName||'عضو')}</p></div>
          <span class="hs-room-owner-tag">${r.ownerUuid === state.profile?.uuid ? "أنتِ المضيفة" : "المضيفة: "+esc(r.ownerName||"عضو")}</span>
        ${'</div>'}
      </div>
      <div class="hs-room-meta"><span><i data-lucide="users"></i><b id="room-member-count">—</b></span><span class="hs-room-id-chip" dir="ltr">ID: <b>${esc(r.publicId || "ROOM")}</b> <button type="button" id="room-copy-id" aria-label="نسخ رقم الغرفة"><i data-lucide="copy"></i></button></span><button type="button" id="room-copy-link"><i data-lucide="link"></i> نسخ الرابط</button>${r.ownerUuid === state.profile?.uuid ? '<button type="button" id="room-settings-toggle" class="hs-room-settings-launch" aria-expanded="false"><i data-lucide="settings-2"></i> إعدادات الغرفة</button>' : ''}<button type="button" id="room-share"><i data-lucide="users"></i> مشاركة الأصدقاء</button><button type="button" id="room-exit" class="hs-room-exit"><i data-lucide="log-out"></i><span>مغادرة الغرفة</span></button></div>
    <div class="hs-room-banner"><span class="hs-banner-star">✦</span><div class="hs-banner-track"><span>مرحباً بك في همسات • شاركوا أجمل اللحظات وأرسلوا المحبة</span><span>🎁 هدية مميزة؟ اجعلوا اللحظة أجمل</span><span>🌙 مجتمع همسات يجمعنا بالصوت والكلمة</span></div></div>
    <div class="hs-room-shortcuts"><a href="#/games"><i data-lucide="disc-3"></i><span>المكافآت والألعاب</span></a><a href="#/shop"><i data-lucide="tags"></i><span>العروض والمتجر</span></a></div>
    ${r.ownerUuid === state.profile?.uuid ? '<section id="room-settings-panel" class="hs-room-settings hidden"><div class="flex items-center justify-between mb-3"><h3>إعدادات غرفتك</h3><button type="button" id="room-settings-close" class="hs-room-close" aria-label="إغلاق"><i data-lucide="x"></i></button></div><label class="label">خلفية الغرفة</label><label class="photo-picker room-background-picker"><i data-lucide="image-plus"></i><span>اختاري خلفية من هاتفك</span><input id="room-background-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" id="room-background-reset" class="btn-ghost w-full mt-2">إزالة الخلفية الحالية</button><div class="mt-4"><label class="label">عدد كراسي المتحدثين</label><select id="room-seat-limit" class="field mt-2"><option value="4" ${(r.seatLimit||8)===4?"selected":""}>4 كراسي</option><option value="6" ${(r.seatLimit||8)===6?"selected":""}>6 كراسي</option><option value="8" ${(r.seatLimit||8)===8?"selected":""}>8 كراسي</option><option value="10" ${(r.seatLimit||8)===10?"selected":""}>10 مقاعد</option><option value="12" ${(r.seatLimit||8)===12?"selected":""}>12 مقعدًا</option></select><p class="text-xs opacity-70 mt-1">لا يمكن تقليل العدد إذا كانت الكراسي المراد حذفها مشغولة.</p></div><div class="mt-4 rounded-xl border border-gold-600/30 p-3"><div class="flex items-center gap-2 mb-2"><i data-lucide="shield-check" class="text-gold-300"></i><b class="text-gold-300">إدارة الأعضاء داخل الغرفة</b></div><p class="text-xs opacity-70 mb-3">من هنا يمكنك كتم مايك المتحدث أو إنزاله من كرسي المايك. تظهر الأزرار بجانب الأعضاء الجالسين.</p><div id="room-admin-members" class="space-y-2"><p class="text-xs opacity-60">جارٍ تحميل قائمة الأعضاء...</p></div></div><div class="mt-4"><label class="label">رمز الغرفة</label><div id="room-emoji-pick" class="hs-room-emoji-pick">${[\'🎙️\',\'👑\',\'🌙\',\'💎\',\'🌹\',\'🦋\',\'✨\',\'🎶\',\'💕\',\'🔥\',\'☕\',\'🎧\',\'🪄\',\'🥂\',\'🩷\',\'💜\',\'⭐\',\'🌸\',\'🦄\',\'🎤\'].map(e=>`<button type="button" data-room-emoji="${e}" class="${(r.roomEmoji||\'🎙️\')===e?\'active\':\'\'}">${e}</button>`).join(\'\')}</div></div><button type="button" id="room-settings-save" class="btn-gold w-full mt-4">حفظ الإعدادات</button></section>' : ''}
    </div>
    <div id="room-invite-panel" class="card p-3 mb-3 hidden"><div class="flex items-center justify-between mb-2"><b class="text-gold-300">اختاري صديقًا لدعوته</b><button type="button" id="room-invite-close" class="text-sm">إغلاق</button></div><div id="room-invite-friends" class="space-y-2"></div></div>
    <button type="button" id="room-gift-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق الهدايا"></button><div id="room-gift-panel" class="hs-gift-picker hidden"><div class="hs-gift-picker-head"><div><span>HAMSAT GIFTS</span><h3>اختاري هديتك</h3></div><button type="button" id="room-gift-close" aria-label="إغلاق">×</button></div><form id="room-gift-form" class="space-y-3"><div class="flex items-center justify-between gap-2"><label class="label">إلى أحد الجالسين على المايك</label><button type="button" id="room-gift-all" class="hs-gift-all">All</button></div><select name="recipient" class="field"></select><input type="hidden" name="gift" value=""><div id="room-gift-categories" class="hs-room-gift-categories"><button type="button" data-gift-category="app" class="active">هدية التطبيق</button><button type="button" data-gift-category="event">هدية الحدث</button><button type="button" data-gift-category="lucky">الهدايا المحظوظة</button><button type="button" data-gift-category="special">هدية خاصة</button></div><div id="room-gift-grid" class="hs-gift-grid"></div><label class="label">الكمية</label><select name="quantity" class="field"><option value="1">×1</option><option value="10">×10</option><option value="99">×99</option></select><p id="room-gift-selection" class="hs-gift-selection">اختاري هدية للمتابعة</p><button type="submit" class="btn-gold w-full" disabled>إرسال الهدية</button></form></div>
    <button type="button" id="room-game-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق مركز الألعاب"></button><div id="room-game-center" class="hs-room-game-center hidden" role="dialog" aria-label="مركز الألعاب"><div class="hs-room-panel-handle"></div><div class="hs-room-game-head"><div><span>H A M S A T</span><h3>🎮 GAME CENTER</h3></div><button type="button" id="room-game-close" aria-label="إغلاق">×</button></div><div class="hs-room-game-balance"><span>رصيدك <b id="room-game-balance">—</b> عملة</span><button type="button" id="room-game-balance-refresh" aria-label="تحديث الرصيد">↻</button></div><div class="hs-room-game-banners"><div class="hs-room-game-banner"><b>🏆 قاعة الشهرة</b><small>أبرز نجوم همسات</small></div><div class="hs-room-game-banner"><b>🤝 شريك الغرفة</b><small>العبوا معاً</small></div></div><div id="room-games-grid" class="hs-room-games-grid"><p class="text-xs opacity-70">جارٍ تحميل الألعاب...</p></div><div id="room-game-stage" class="hs-room-game-stage hidden"></div></div>
    <button type="button" id="room-bomb-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق قنبلة الغرفة"></button><div id="room-bomb-panel" class="hs-room-bomb-panel hidden" role="dialog" aria-label="قنبلة الغرفة"><div class="hs-room-panel-handle"></div><div class="hs-room-bomb-head"><div><span>HAMSAT ROOM EVENT</span><h3>💣 قنبلة الغرفة</h3></div><button type="button" id="room-bomb-close" aria-label="إغلاق">×</button></div><p class="hs-room-bomb-description">كل هدية تُرسل داخل الغرفة تزيد تقدم القنبلة. عند اكتمال المستوى تُوزّع العملات تلقائياً على الموجودين، مع مكافآت إضافية لأعلى المساهمين.</p><div class="hs-room-bomb-status"><div><b id="room-bomb-panel-level">LV.1</b><span id="room-bomb-countdown">بانتظار أول هدية</span></div><strong id="room-bomb-panel-percent">0%</strong></div><div class="hs-room-bomb-track"><i id="room-bomb-panel-bar"></i></div><div id="room-bomb-levels" class="hs-room-bomb-levels"></div><div class="hs-room-bomb-top"><h4>🏆 أعلى المساهمين</h4><div id="room-bomb-top3"><p>لا توجد مساهمات بعد.</p></div></div></div>
    <section class="hs-room-stage">
      <div class="hs-room-section-title"><div><span class="hs-room-eyebrow">VOICE STAGE</span><h3>منصة المتحدثين</h3></div><span class="hs-room-seat-count">${r.seatLimit||8} مقاعد</span></div>
      <div id="room-seats" class="hs-room-seats"></div>
      <div class="hs-room-stage-note"><i data-lucide="info"></i><span>المضيفة تشغل المقعد الأول، ويمكن للأعضاء حجز المقاعد المتاحة للتحدث والاستماع مباشرة.</span></div>
      
    </section>
    <section class="hs-room-people hs-room-people-compact">
      <div class="hs-room-section-title"><div><span class="hs-room-eyebrow">IN THE ROOM</span><h3>الحاضرون</h3></div><span class="hs-room-people-live"><i></i> الآن</span></div>
      <div id="room-members" class="hs-room-members"><span class="text-xs">جارٍ تحميل الأعضاء...</span></div>
    </section>
    <section class="hs-room-chat-area">
      <div class="hs-room-chat-heading"><div><span class="hs-room-eyebrow">LIVE COMMUNITY</span><h3>الدردشة المباشرة</h3></div><span class="hs-room-people-live"><i></i> متصلون الآن</span></div><div id="room-chat-tabs" class="hs-room-chat-tabs"><button type="button" data-chat-filter="all" class="active">الكل</button><button type="button" data-chat-filter="chat">الدردشة</button><button type="button" data-chat-filter="gifts">الهدايا</button><button type="button" data-chat-filter="games">الألعاب</button></div>
      <div class="hs-room-welcome"><span>✦ إعلان الغرفة</span><p>أهلاً وسهلاً بكم في ${esc(r.title)}، نتمنى لكم وقتاً جميلاً في همسات 💛</p></div>
      <div id="room-chat" class="hs-room-chat"><p class="text-xs text-[#8a76a8] text-center">جارٍ تحميل الرسائل...</p></div>
      <div class="hs-room-bottom-bar">
        <div class="hs-room-tools-row">
          <button type="button" id="voice-start" class="hs-tool-mic" aria-label="الاتصال بالصوت"><i data-lucide="mic"></i></button>
          <button type="button" id="voice-mute" class="hs-tool-icon" aria-label="كتم الميكروفون" disabled><i data-lucide="mic-off"></i></button>
          <button type="button" id="voice-audio-enable" class="hs-tool-icon" aria-label="سماع المشاركين" disabled><i data-lucide="volume-2"></i></button>
          <button type="button" id="room-send-gift" class="hs-tool-gift" aria-label="إرسال هدية"><i data-lucide="gift"></i></button>
          <button type="button" id="room-emoji-toggle" class="hs-tool-icon" aria-label="التفاعلات"><i data-lucide="smile"></i></button>
          <button type="button" id="room-game-center-toggle" class="hs-tool-icon" aria-label="مركز الألعاب"><i data-lucide="gamepad-2"></i></button>
          <button type="button" id="room-settings-shortcut" class="hs-tool-icon" aria-label="قائمة الغرفة"><i data-lucide="more-horizontal"></i></button>
        </div>
        <p id="voice-status" class="hs-room-voice-status" role="status">الصوت غير متصل</p>
        <div class="hs-room-compose-wrap">
          <button type="button" id="room-emoji-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق التفاعلات"></button><div id="room-emoji-panel" class="hs-room-emoji-panel hidden" role="dialog" aria-label="اختيار تفاعل"><div class="hs-room-panel-handle"></div><div class="hs-room-emoji-head"><b>التفاعلات</b><button type="button" id="room-emoji-close" aria-label="إغلاق">×</button></div><div class="hs-room-emoji-categories"><button type="button" class="active" data-emoji-category="default">Default</button></div><div id="room-emoji-grid" class="hs-room-emoji-grid"></div><div id="room-emoji-pagination" class="hs-room-emoji-pagination"></div></div>
          <form id="room-chat-form" class="hs-room-compose"><input name="message" maxlength="1000" placeholder="اكتبي رسالة للجميع..." autocomplete="off" required><button type="submit" aria-label="إرسال"><i data-lucide="send"></i></button></form>
        </div>
        <div class="sr-only"><button type="button" id="voice-leave" hidden>إيقاف الصوت</button><div id="voice-audio" aria-hidden="true"></div></div>
      </div>
    </section>
    ${r.ownerUuid === state.profile?.uuid ? `<button id="del-room" class="btn-danger w-full mt-3"><i data-lucide="trash-2" class="w-5 h-5"></i> حذف الغرفة</button>` : ''}
  `, async (sheet) => {
    sheet.classList.add('room-sheet');
    if(r.coverUrl){const roomBg='linear-gradient(180deg,rgba(7,8,12,.82),rgba(7,8,12,.91)),url("'+r.coverUrl+'")';sheet.querySelectorAll('.hs-room-cover,.hs-room-stage,.hs-room-people,.hs-room-chat-area').forEach(el=>{el.style.backgroundImage=roomBg;el.style.backgroundSize='cover';el.style.backgroundPosition='center';});}
    if(r.coverUrl){sheet.style.backgroundImage='linear-gradient(180deg,rgba(7,8,12,.80),rgba(7,8,12,.93)),url("'+String(r.coverUrl).replaceAll('"','')+'")';sheet.style.backgroundSize='cover';sheet.style.backgroundPosition='center';sheet.style.backgroundAttachment='fixed';}
    const copyRoomId=sheet.querySelector('#room-copy-id');
    if(copyRoomId)copyRoomId.onclick=async()=>{try{await navigator.clipboard.writeText(r.publicId||r.id);toast('تم نسخ ID الغرفة');}catch(e){toast(r.publicId||r.id);}};
    const copyRoomLink=sheet.querySelector('#room-copy-link');
    if(copyRoomLink)copyRoomLink.onclick=async()=>{const url=location.origin+location.pathname+'#/rooms?invite='+encodeURIComponent(r.id);try{await navigator.clipboard.writeText(url);toast('تم نسخ رابط الغرفة');}catch(e){toast(url);}};
    const shareRoomButton=sheet.querySelector('#room-share');
    if(shareRoomButton){
      const invitePanel=sheet.querySelector('#room-invite-panel'), inviteList=sheet.querySelector('#room-invite-friends');
      shareRoomButton.onclick=async()=>{
        invitePanel.classList.toggle('hidden');
        if(invitePanel.dataset.loaded)return;
        try{
          const {friends}=await api.friends();
          inviteList.innerHTML=friends.length?friends.map(u=>`<button type="button" data-invite-user="${esc(u.uuid)}" class="card w-full p-3 flex items-center gap-3 text-right">${avatar(u,38)}<span class="flex-1 min-w-0"><b class="block">${esc(u.displayName)}</b><small class="opacity-70">@${esc(u.handle)} · ${esc(u.publicId || "")}</small></span><i data-lucide="send" class="text-gold-300"></i></button>`).join(''):'<p class="text-sm opacity-70">لا توجد أسماء في قائمة أصدقائك بعد. أضيفي أصدقاء من قسم حسابي.</p>';
          invitePanel.dataset.loaded='1';icons_();
          inviteList.querySelectorAll('[data-invite-user]').forEach(b=>b.onclick=async()=>{
            b.disabled=true;
            try{
              const friend=friends.find(x=>x.uuid===b.dataset.inviteUser);
              const result=await api.startConversation(friend.uuid);
              const inviteUrl=location.origin+location.pathname+'#/rooms?invite='+encodeURIComponent(r.id);
              await api.sendDirectMessage(result.conversationId,'🎙️ أدعوك للانضمام إلى غرفتي في همسات: '+inviteUrl);
              toast('تم إرسال دعوة الغرفة إلى '+friend.displayName);
              b.innerHTML='✓ تم إرسال الدعوة';
            }catch(e){toast(e.message,'error');b.disabled=false;}
          });
        }catch(e){inviteList.innerHTML='<p class="text-sm text-red-300">'+esc(e.message)+'</p>';}
      };
      sheet.querySelector('#room-invite-close').onclick=()=>invitePanel.classList.add('hidden');
    }
    const settingsToggle=sheet.querySelector('#room-settings-toggle');
    if(settingsToggle){
      const panel=sheet.querySelector('#room-settings-panel');let chosenEmoji=r.roomEmoji||'🎙️',chosenCover=r.coverUrl||null;
      settingsToggle.setAttribute('aria-expanded','false');
      settingsToggle.onclick=()=>{
        const opening=panel.classList.contains('hidden');
        panel.classList.toggle('hidden',!opening);
        panel.style.display=opening?'block':'none';
        settingsToggle.setAttribute('aria-expanded',String(opening));
        settingsToggle.innerHTML=opening?'<i data-lucide="x"></i> إغلاق الإعدادات':'<i data-lucide="settings-2"></i> إعدادات الغرفة';
        icons_();
        if(!panel.querySelector('#room-edit-title')){
          const editor=document.createElement('div');
          editor.className='hs-room-settings-fields';
          editor.innerHTML='<label class="label" for="room-edit-title">اسم الغرفة</label><input id="room-edit-title" class="field" maxlength="60" value="'+esc(r.title)+'" placeholder="اسم الغرفة"><label class="label mt-3" for="room-edit-topic">التصنيف</label><select id="room-edit-topic" class="field">'+TOPICS.map(t=>'<option value="'+esc(t)+'" '+(r.topic===t?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select><label class="label mt-3" for="room-edit-description">وصف الغرفة</label><textarea id="room-edit-description" class="field" rows="3" maxlength="240" placeholder="اكتبي نبذة عن غرفتك">'+esc(r.description||'')+'</textarea>';
          panel.insertBefore(editor,panel.querySelector('#room-emoji-pick').parentElement);
        }
      };
      sheet.querySelector('#room-settings-close').onclick=()=>panel.classList.add('hidden');
      sheet.querySelectorAll('[data-room-emoji]').forEach(b=>b.onclick=()=>{chosenEmoji=b.dataset.roomEmoji;sheet.querySelectorAll('[data-room-emoji]').forEach(x=>x.classList.toggle('active',x===b));});
      sheet.querySelector('#room-background-reset').onclick=()=>{chosenCover=null;sheet.querySelector('.room-background-picker span').textContent='تم اختيار الخلفية الافتراضية';};
      sheet.querySelector('#room-background-file').onchange=async()=>{const file=sheet.querySelector('#room-background-file').files?.[0];if(!file)return;const label=sheet.querySelector('.room-background-picker span');if(file.size>5*1024*1024){toast('حجم الصورة يجب ألا يتجاوز 5 ميغابايت','error');return;}label.textContent='جارٍ رفع الخلفية...';try{const uploaded=await api.uploadMedia(file,'room-backgrounds');chosenCover=uploaded.url;label.textContent='تم اختيار الخلفية ✓';}catch(e){toast(e.message,'error');label.textContent='اختاري خلفية من هاتفك';}};
      sheet.querySelector('#room-settings-save').onclick=async()=>{const btn=sheet.querySelector('#room-settings-save');btn.disabled=true;try{const saved=await api.updateRoomSettings(r.id,{title:sheet.querySelector('#room-edit-title')?.value||r.title,topic:sheet.querySelector('#room-edit-topic')?.value||r.topic,description:sheet.querySelector('#room-edit-description')?.value??r.description,coverUrl:chosenCover,roomEmoji:chosenEmoji,seatLimit:Number(sheet.querySelector('#room-seat-limit')?.value||r.seatLimit||8)});r.title=saved.title;r.topic=saved.topic;r.description=saved.description;r.coverUrl=saved.coverUrl;r.roomEmoji=saved.roomEmoji;r.seatLimit=saved.seatLimit;const cover=sheet.querySelector('.hs-room-cover');if(cover)cover.style.backgroundImage=chosenCover?'linear-gradient(180deg,#08090a22,#08090add),url("'+chosenCover+'")':'';sheet.querySelector('.hs-room-title-emoji').textContent=chosenEmoji;sheet.querySelector('.hs-room-title-row h2').lastChild.textContent=' '+r.title;sheet.querySelector('.hs-room-title-row p').textContent=r.topic+' · بواسطة '+(r.ownerName||'عضو');const roomBg=chosenCover?'linear-gradient(180deg,rgba(7,8,12,.82),rgba(7,8,12,.91)),url("'+chosenCover+'")':'';sheet.querySelectorAll('.hs-room-cover,.hs-room-stage,.hs-room-people,.hs-room-chat-area').forEach(el=>{el.style.backgroundImage=roomBg;el.style.backgroundSize=chosenCover?'cover':'';el.style.backgroundPosition=chosenCover?'center':'';});sheet.style.backgroundImage=chosenCover?'linear-gradient(180deg,rgba(7,8,12,.80),rgba(7,8,12,.93)),url("'+chosenCover+'")':'';sheet.querySelector('.hs-room-seat-count').textContent=r.seatLimit+' مقاعد';await drawMembers();toast('تم حفظ إعدادات غرفتك');panel.classList.add('hidden');}catch(e){toast(e.message,'error');}finally{btn.disabled=false;}};
    }
    const chat=sheet.querySelector('#room-chat'), membersEl=sheet.querySelector('#room-members'), seatsEl=sheet.querySelector('#room-seats'), countEl=sheet.querySelector('#room-member-count'), form=sheet.querySelector('#room-chat-form');
    const voiceStatus=sheet.querySelector('#voice-status'), voiceStart=sheet.querySelector('#voice-start'), voiceAudioEnable=sheet.querySelector('#voice-audio-enable'), voiceMute=sheet.querySelector('#voice-mute'), voiceLeave=sheet.querySelector('#voice-leave');
    sheet.querySelector('#room-emoji-toggle')?.addEventListener('click',()=>sheet.querySelector('#room-emoji-bar')?.classList.toggle('hidden'));
    sheet.querySelector('#room-settings-shortcut')?.addEventListener('click',()=>{const settings=sheet.querySelector('#room-settings-toggle');if(settings)settings.click();else toast('إعدادات الغرفة متاحة للمضيفة فقط');});
    voiceStart.onclick=async()=>{voiceStart.disabled=true;voiceStatus.textContent='جارٍ الاتصال بالغرفة الصوتية...';try{const controller=createVoiceRoom({roomId:r.id,userId:state.profile.uuid,onState:s=>{if(voiceStatus.isConnected)voiceStatus.textContent=s.message;if(voiceMute.isConnected){voiceMute.disabled=!controller.canPublish;voiceMute.textContent=controller.canPublish?(s.muted?'تشغيل الميكروفون':'كتم الميكروفون'):'الميكروفون غير متاح';}if(voiceStart.isConnected&&s.connected)voiceStart.textContent=controller.canPublish?'الميكروفون متصل':'دخلتِ للاستماع';}});state.voiceRoom=controller;await controller.join();voiceMute.disabled=!controller.canPublish;voiceAudioEnable.disabled=false;voiceLeave.hidden=false;voiceStart.textContent=controller.canPublish?'الميكروفون متصل':'دخلتِ للاستماع';voiceStatus.textContent=controller.canPublish?'أنتِ متصلة ويمكنك التحدث.':'أنتِ متصلة وتسمعين الغرفة. احجزي مقعداً للتحدث.';}catch(e){if(state.voiceRoom){const failed=state.voiceRoom;state.voiceRoom=null;failed.leave().catch(()=>{});}voiceStatus.textContent='تعذّر تشغيل الصوت: '+e.message;voiceStart.disabled=false;}};
    voiceAudioEnable.onclick=async()=>{if(!state.voiceRoom)return;voiceAudioEnable.disabled=true;try{await state.voiceRoom.enableAudio();voiceStatus.textContent='تم تفعيل سماع أصوات المشاركين';voiceAudioEnable.textContent='الصوت مفعّل ✓';}catch(e){voiceStatus.textContent='تعذّر تشغيل صوت الآخرين: '+e.message;voiceAudioEnable.disabled=false;}};
    voiceMute.onclick=()=>{if(!state.voiceRoom)return;const muted=state.voiceRoom.toggleMute();voiceMute.textContent=muted?'تشغيل الميكروفون':'كتم الميكروفون';};
    voiceLeave.onclick=async()=>{const controller=state.voiceRoom;state.voiceRoom=null;if(controller)await controller.leave();voiceMute.disabled=true;voiceAudioEnable.disabled=true;voiceAudioEnable.textContent='سماع الآخرين';voiceLeave.hidden=true;voiceStart.disabled=false;voiceStart.textContent='تشغيل الميكروفون';voiceStatus.textContent='تم إيقاف الصوت';};
    let roomChatFilter='all', roomEventsLoaded=false;
    const seenRoomEventIds=new Set();
    const animateRoomEvent=(event)=>{
      if(event.event_type==='emoji'){
        const seat=[...sheet.querySelectorAll('#room-seats .hs-room-seat[data-user-id]')].find(el=>el.dataset.userId===event.actor_id);
        if(seat){const effect=document.createElement('span');effect.className='hs-seat-emoji-effect';effect.textContent=event.payload?.emoji||'✨';seat.appendChild(effect);window.setTimeout(()=>effect.remove(),3600);}
      } else if(event.event_type==='gift'){showGiftCelebration({name:event.payload?.gift_name||'هدية',icon:'gift'},Number(event.payload?.quantity||1));}else if(event.event_type==='bomb'){toast('💣 اكتمل مستوى قنبلة الغرفة وتم توزيع الجوائز!');}
    };
    const drawMessages=async()=>{
      const [messageData,eventData]=await Promise.all([api.roomMessages(r.id),api.roomEvents(r.id).catch(()=>({events:[]}))]);
      if(!chat.isConnected)return;
      const messages=messageData.messages||[],events=eventData.events||[];
      if(roomEventsLoaded){events.forEach(event=>{if(!seenRoomEventIds.has(event.id)){seenRoomEventIds.add(event.id);animateRoomEvent(event);}});}
      else{events.forEach(event=>seenRoomEventIds.add(event.id));roomEventsLoaded=true;}
      const items=[];
      if(roomChatFilter==='all'||roomChatFilter==='chat'){messages.forEach(m=>items.push({at:m.createdAt,html:'<div class="hs-room-message '+(m.userId===state.profile?.uuid?'mine':'')+'">'+avatar({displayName:m.displayName,color:m.color},30)+'<div><b>'+esc(m.displayName)+'</b><p>'+esc(m.body)+'</p><small>'+timeAgo(m.createdAt)+'</small></div></div>'}));}
      const wanted=roomChatFilter==='gifts'?'gift':roomChatFilter==='games'?'game':null;
      if(roomChatFilter!=='chat'){events.filter(e=>!wanted||e.event_type===wanted).forEach(e=>{
        if(e.event_type==='gift'){items.push({at:new Date(e.created_at).getTime(),html:'<div class="hs-room-activity gift"><span class="hs-room-activity-icon">🎁</span><span><b>'+esc(e.actor?.displayName||'عضو')+'</b> أرسل هدية إلى <b>'+esc(e.target?.displayName||'عضو')+'</b> · '+esc(e.payload?.gift_name||'هدية')+' <small>×'+num(e.payload?.quantity||1)+'</small></span></div>'});}
        else if(e.event_type==='emoji'&&roomChatFilter==='all'){items.push({at:new Date(e.created_at).getTime(),html:'<div class="hs-room-activity"><span class="hs-room-activity-icon">'+esc(e.payload?.emoji||'✨')+'</span><span><b>'+esc(e.actor?.displayName||'عضو')+'</b> أرسل تفاعلاً</span></div>'});}
        else if(e.event_type==='game'){items.push({at:new Date(e.created_at).getTime(),html:'<div class="hs-room-activity"><span class="hs-room-activity-icon">🎮</span><span>'+esc(e.payload?.message||'نشاط لعبة في الغرفة')+'</span></div>'});}else if(e.event_type==='bomb'){items.push({at:new Date(e.created_at).getTime(),html:'<div class="hs-room-activity gift"><span class="hs-room-activity-icon">💣</span><span>انفجرت قنبلة الغرفة · تم توزيع العملات على الأعضاء</span></div>'});}
      });}
      items.sort((a,b)=>a.at-b.at);
      chat.innerHTML=items.length?items.map(x=>x.html).join(''):'<p class="text-xs text-[#8a76a8] text-center py-10">لا توجد عناصر في هذا التصنيف بعد 🌙</p>';
      chat.scrollTop=chat.scrollHeight;
    };
    sheet.querySelectorAll('#room-chat-tabs [data-chat-filter]').forEach(button=>button.onclick=()=>{roomChatFilter=button.dataset.chatFilter;sheet.querySelectorAll('#room-chat-tabs [data-chat-filter]').forEach(x=>x.classList.toggle('active',x===button));drawMessages().catch(e=>toast(e.message,'error'));});
    const mutedRoomUsers=new Set();
    const remotelyMutedUsers=new Set();
    let muteStateLoaded=false;
    const drawMembers=async()=>{
      const [{members},{seats}]=await Promise.all([api.roomMembers(r.id),api.roomSeats(r.id)]);
      if(!membersEl.isConnected)return;
      countEl.textContent=num(members.length);
      const host=r.ownerUuid===state.profile?.uuid;
      if(host&&!muteStateLoaded){const savedMutes=await api.roomMutedUsers(r.id);savedMutes.userIds.forEach(id=>remotelyMutedUsers.add(id));muteStateLoaded=true;}
      const seatedUsers=new Set(seats.map(x=>x.user_id));
      const adminMembersEl=sheet.querySelector('#room-admin-members');
      const renderMemberRows=()=>members.length?members.map(m=>`<div class="hs-room-person">${avatar(m,34)}<span>${esc(m.displayName)}</span>${m.userId!==state.profile?.uuid?`<button type="button" class="hs-room-member-action" data-local-mute="${esc(m.userId)}">${mutedRoomUsers.has(m.userId)?'إلغاء الكتم':'كتم صوته لدي'}</button>${host&&seatedUsers.has(m.userId)?`<button type="button" class="hs-room-member-action" data-host-mute="${esc(m.userId)}">${remotelyMutedUsers.has(m.userId)?'إلغاء كتم المايك':'كتم المايك'}</button><button type="button" class="hs-room-member-action danger" data-remove-seat="${esc(m.userId)}">إنزال من الكرسي</button>`:''}`:''}</div>`).join(''):'<span class="text-xs text-[#8a76a8]">لا يوجد أعضاء بعد</span>';
      membersEl.innerHTML=renderMemberRows();
      if(adminMembersEl)adminMembersEl.innerHTML=renderMemberRows();
      const actionRoots=[membersEl,adminMembersEl].filter(Boolean);
      actionRoots.forEach(root=>root.querySelectorAll('[data-local-mute]').forEach(b=>b.onclick=()=>{
        const uid=b.dataset.localMute,muted=!mutedRoomUsers.has(uid);
        if(muted)mutedRoomUsers.add(uid);else mutedRoomUsers.delete(uid);
        state.voiceRoom?.setParticipantMuted?.(uid,muted);
        b.textContent=muted?'إلغاء الكتم':'كتم صوته لدي';
        toast(muted?'تم كتم صوت العضو على جهازك':'تم إلغاء كتم الصوت');
      }));
      actionRoots.forEach(root=>root.querySelectorAll('[data-host-mute]').forEach(b=>b.onclick=async()=>{
        const uid=b.dataset.hostMute,muted=!remotelyMutedUsers.has(uid);
        b.disabled=true;
        try{await api.moderateRoomParticipant(r.id,uid,muted);await api.setRoomParticipantMuteState(r.id,uid,muted);if(muted)remotelyMutedUsers.add(uid);else remotelyMutedUsers.delete(uid);toast(muted?'تم كتم مايك العضو في الغرفة':'تم إرسال طلب إلغاء الكتم');await drawMembers();}
        catch(e){toast(e.message,'error');}
        finally{b.disabled=false;}
      }));
      actionRoots.forEach(root=>root.querySelectorAll('[data-remove-seat]').forEach(b=>b.onclick=async()=>{
        b.disabled=true;
        try{await api.hostRemoveRoomSeat(r.id,b.dataset.removeSeat);if(state.voiceRoom)await state.voiceRoom.refreshPermissions();await drawMembers();toast('تم إنزال العضو من كرسي المايك');}
        catch(e){toast(e.message,'error');b.disabled=false;}
      }));
      const bySeat=Object.fromEntries(seats.map(x=>[x.seat_no,x]));
      seatsEl.innerHTML=Array.from({length:Math.max(1,Math.min(12,Number(r.seatLimit)||8))},(_,i)=>{
        const n=i+1,seat=bySeat[n],m=seat?.member,own=seat?.user_id===state.profile?.uuid,isHost=r.ownerUuid===state.profile?.uuid&&n===1;
        if(!seat)return `<button type="button" data-seat="${n}" class="hs-room-seat empty" aria-label="طلب المايك ${n}"><span class="hs-seat-ring"><span class="hs-seat-chair"><i data-lucide="armchair"></i></span><i class="hs-seat-center-mic" data-lucide="mic"></i></span><b>${isHost?'مقعد المضيفة':'مقعد '+n}</b><small>${isHost?'مقعد المضيفة':'اضغطي لطلب المايك'}</small><span class="hs-seat-number">${n}</span></button>`;
        return `<button type="button" data-seat="${n}" data-user-id="${esc(seat.user_id)}" data-own="${own}" class="hs-room-seat occupied ${own?'mine':''}" ${own?'':'disabled'}><span class="hs-seat-ring occupied-ring">${m?avatar(m,58):'<span class="hs-seat-mic"><i data-lucide="user-round"></i></span>'}<i class="hs-seat-live-mic" data-lucide="mic"></i></span><b>${esc(m?.displayName||'عضو')}</b><small>${own?'أنتِ على المايك':'متحدث'}</small>${isHost?'<em>المضيفة</em>':''}<span class="hs-seat-number">${n}</span></button>`;
      }).join('');
      seatsEl.querySelectorAll('[data-seat]').forEach(b=>b.onclick=async()=>{
        const leaving=b.dataset.own==='true';
        try{
          b.disabled=true;
          if(leaving) await api.leaveRoomSeat(r.id);
          else await api.requestRoomSeat(r.id,Number(b.dataset.seat));

          // The LiveKit controller refreshes its token from room_seats realtime.
          // Ask it to sync immediately too, so the UI never waits for a network event.
          if(state.voiceRoom) await state.voiceRoom.refreshPermissions();
          else if(!leaving) await voiceStart.onclick();

          await drawMembers();
          toast(leaving?'غادرتِ المايك':'تم حجز المقعد');
        }catch(e){
          toast(e.message,'error');
          await drawMembers().catch(()=>{});
        }
      });
      icons_();
    };
    try{await api.joinRoom(r.id);state.activeRoomId=r.id;await Promise.all([drawMessages(),drawMembers()]);state.roomChannel=api.subscribeRoomMessages(r.id,()=>Promise.all([drawMessages(),drawMembers()]).catch(e=>toast(e.message,'error')));state.roomEventChannel=api.subscribeRoomEvents(r.id,()=>Promise.all([drawMessages(),drawRoomBomb()]).catch(e=>toast(e.message,'error')));}
    catch(e){chat.innerHTML=emptyBox('wifi-off','تعذّر فتح الغرفة',e.message);}
    sheet.querySelector('#refresh-room').onclick=()=>Promise.all([drawMessages(),drawMembers()]).catch(e=>toast(e.message,'error'));
    sheet.querySelector('#room-exit').onclick=async()=>{const button=sheet.querySelector('#room-exit');button.disabled=true;try{if(state.voiceRoom){const voice=state.voiceRoom;state.voiceRoom=null;await voice.leave();}if(state.roomChannel){await api.unsubscribeRoomChannel(state.roomChannel);state.roomChannel=null;}if(state.roomEventChannel){await api.unsubscribeRoomChannel(state.roomEventChannel);state.roomEventChannel=null;}if(state.roomBombTimer){clearInterval(state.roomBombTimer);state.roomBombTimer=null;}if(state.activeRoomId===r.id)state.activeRoomId=null;await api.leaveRoom(r.id);$('#sheet-root').innerHTML='';toast('غادرتِ الغرفة. ستبقى غرفتك محفوظة ويمكن للجميع دخولها.');}catch(e){toast(e.message,'error');button.disabled=false;}};
    form.onsubmit=async e=>{e.preventDefault();const input=form.elements.message,button=form.querySelector('button'),value=input.value.trim();if(!value)return;button.disabled=true;try{await api.sendRoomMessage(r.id,value);input.value='';await drawMessages();}catch(err){toast(err.message,'error');}finally{button.disabled=false;input.focus();}};
    const emojiPanel=sheet.querySelector('#room-emoji-panel');
    const emojiSet=state.profile?.equippedEmojiPackId==='emoji_luxe'?['👑','💎','✨','🥂','🪞','💍','🌟','🎀','🦢','🌹','💫','🪄','🩷','🫶','🌸','🔥','👏','🎉','🎤','🎧']:state.profile?.equippedEmojiPackId==='emoji_moon'?['🌙','⭐','🌟','☄️','🪐','🌌','✨','🌠','🌃','🦋','🌷','💜','🩵','🫶','🎶','🎧','☕','🌸','👏','🎤']:['💖','🌹','😂','😍','👏','✨','🌙','🥰','🫶','🎉','🔥','💎','👑','🦋','🎶','🎤','💜','🩷','🌸','🥂','😎','🤩','💫','🌈','🎊','💐','🩵','🧡','💚','⭐'];
    let emojiPage=0;
    const emojiGrid=sheet.querySelector('#room-emoji-grid'),emojiPagination=sheet.querySelector('#room-emoji-pagination');
    const drawEmojiPage=()=>{
      const pages=Math.ceil(emojiSet.length/15),start=emojiPage*15;
      emojiGrid.innerHTML=emojiSet.slice(start,start+15).map(e=>'<button type="button" data-room-emoji="'+e+'" aria-label="إرسال '+e+'">'+e+'</button>').join('');
      emojiPagination.innerHTML=Array.from({length:pages},(_,i)=>'<button type="button" data-emoji-page="'+i+'" class="'+(i===emojiPage?'active':'')+'" aria-label="صفحة '+(i+1)+'"></button>').join('');
      emojiPagination.querySelectorAll('[data-emoji-page]').forEach(b=>b.onclick=()=>{emojiPage=Number(b.dataset.emojiPage);drawEmojiPage();});
      emojiGrid.querySelectorAll('[data-room-emoji]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api.sendRoomEmoji(r.id,b.dataset.roomEmoji);emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');}catch(e){toast(e.message,'error');}finally{b.disabled=false;}});
    };
    drawEmojiPage();
    let emojiTouchStartX=0;emojiGrid.addEventListener('touchstart',e=>{emojiTouchStartX=e.changedTouches[0].clientX;},{passive:true});emojiGrid.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-emojiTouchStartX;if(Math.abs(delta)>45){emojiPage=Math.max(0,Math.min(Math.ceil(emojiSet.length/15)-1,emojiPage+(delta<0?1:-1)));drawEmojiPage();}},{passive:true});
    sheet.querySelector('#room-emoji-toggle')?.addEventListener('click',()=>{const opening=emojiPanel.classList.contains('hidden');if(opening){sheet.querySelector('#room-gift-panel').classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');sheet.querySelector('#room-game-center').classList.add('hidden');sheet.querySelector('#room-game-backdrop').classList.add('hidden');}emojiPanel.classList.toggle('hidden');sheet.querySelector('#room-emoji-backdrop').classList.toggle('hidden',!opening);});
    const gamePanel=sheet.querySelector('#room-game-center'),gameBackdrop=sheet.querySelector('#room-game-backdrop'),gameGrid=sheet.querySelector('#room-games-grid'),gameStage=sheet.querySelector('#room-game-stage');
    const closeRoomGames=()=>{gamePanel.classList.add('hidden');gameBackdrop.classList.add('hidden');gameGrid.classList.remove('hidden');gameStage.classList.add('hidden');};
    sheet.querySelector('#room-game-close').onclick=closeRoomGames;gameBackdrop.onclick=closeRoomGames;
    sheet.querySelector('#room-game-balance-refresh').onclick=async()=>{try{state.wallet=(await api.wallet()).wallet;sheet.querySelector('#room-game-balance').textContent=num(state.wallet?.balance);}catch(e){toast(e.message,'error');}};
    const playRoomQuiz=(game)=>{
      const questions=(game?.config?.questions||[]).filter(q=>q&&typeof q.question==='string'&&Array.isArray(q.options)&&q.options.length>=2);
      if(!questions.length){toast('هذه اللعبة لا تحتوي أسئلة جاهزة بعد.','error');return;}
      let index=0,score=0,answered=false;
      const showQuestion=()=>{const q=questions[index];answered=false;gameGrid.classList.add('hidden');gameStage.classList.remove('hidden');
        gameStage.innerHTML='<div class="hs-room-game-progress"><b>'+esc(game.name)+'</b><span>'+num(index+1)+' / '+num(questions.length)+'</span></div><div class="hs-room-game-track"><i style="width:'+(((index+1)/questions.length)*100)+'%"></i></div><h4>'+esc(q.question)+'</h4><div class="hs-room-game-options">'+q.options.map((o,i)=>'<button type="button" data-room-answer="'+i+'">'+esc(o)+'</button>').join('')+'</div><p id="room-game-feedback" aria-live="polite"></p><button type="button" id="room-game-next" disabled>'+(index===questions.length-1?'عرض النتيجة':'السؤال التالي')+'</button>';
        gameStage.querySelectorAll('[data-room-answer]').forEach(button=>button.onclick=()=>{if(answered)return;answered=true;const selected=Number(button.dataset.roomAnswer),correct=Number(q.answer),ok=selected===correct||String(q.answer)===String(q.options[selected]);if(ok)score++;gameStage.querySelectorAll('[data-room-answer]').forEach((x,i)=>{x.disabled=true;if(i===correct)x.classList.add('correct');else if(i===selected&&!ok)x.classList.add('wrong');});gameStage.querySelector('#room-game-feedback').textContent=(ok?'إجابة صحيحة! ✨':'ليست الإجابة الصحيحة.')+(q.explanation?' '+q.explanation:'');gameStage.querySelector('#room-game-next').disabled=false;});
        gameStage.querySelector('#room-game-next').onclick=()=>{if(index<questions.length-1){index++;showQuestion();}else{gameStage.innerHTML='<div class="hs-room-game-result"><div>🏆</div><h4>انتهت الجولة!</h4><strong>'+num(score)+' / '+num(questions.length)+'</strong><p>نتيجتك في هذه الجولة</p><button type="button" id="room-game-back">العودة للألعاب</button></div>';gameStage.querySelector('#room-game-back').onclick=()=>{gameStage.classList.add('hidden');gameGrid.classList.remove('hidden');};}};
      };showQuestion();
    };
    const loadRoomGames=async()=>{gameGrid.innerHTML='<p class="text-xs opacity-70">جارٍ تحميل الألعاب...</p>';try{const {games}=await api.games();gameGrid.innerHTML=games.length?games.map(g=>'<article class="hs-room-game-card"><span>'+esc(g.icon||'🎮')+'</span><b>'+esc(g.name)+'</b><small>'+esc(g.description||'لعبة من مجتمع همسات')+'</small><button type="button" data-room-play="'+esc(g.id)+'">'+((g.config?.questions||[]).length?'العب الآن':'قريباً')+'</button></article>').join(''):'<p class="text-xs opacity-70">لا توجد ألعاب منشورة بعد.</p>';gameGrid.querySelectorAll('[data-room-play]').forEach(b=>b.onclick=()=>{const game=games.find(g=>g.id===b.dataset.roomPlay);if(game)playRoomQuiz(game);});}catch(e){gameGrid.innerHTML='<p class="text-xs text-rose-300">'+esc(e.message)+'</p>';}};
    sheet.querySelector('#room-game-center-toggle').onclick=()=>{emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');gamePanel.classList.remove('hidden');gameBackdrop.classList.remove('hidden');sheet.querySelector('#room-game-balance').textContent=num(state.wallet?.balance);loadRoomGames();};
    const bombPanel=sheet.querySelector('#room-bomb-panel'),bombBackdrop=sheet.querySelector('#room-bomb-backdrop');
    let roomBombEndsAt=null,bombExpiryHandled=false;
    const updateRoomBombCountdown=()=>{const el=sheet.querySelector('#room-bomb-countdown');if(!el)return;if(!roomBombEndsAt){el.textContent='بانتظار أول هدية';return;}const left=Math.max(0,roomBombEndsAt-Date.now());if(!left){el.textContent='انتهى الوقت · إعادة ضبط القنبلة';if(!bombExpiryHandled){bombExpiryHandled=true;drawRoomBomb();}return;}const total=Math.floor(left/1000),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;el.textContent='متبقي '+hours+'س '+minutes+'د '+seconds+'ث';};
    const drawRoomBomb=async()=>{
      try{
        const data=await api.roomBombState(r.id),bomb=data.bomb||{level:1,progress:0},level=Number(bomb.level||1),config=(data.levels||[]).find(x=>Number(x.level)===level),threshold=Number(config?.threshold||5000),progress=Number(bomb.progress||0),percent=Math.min(100,Math.floor(progress/threshold*100));
        roomBombEndsAt=bomb.ends_at?new Date(bomb.ends_at).getTime():null;bombExpiryHandled=false;
        sheet.querySelector('#room-bomb-level').textContent='LV.'+level;sheet.querySelector('#room-bomb-percent').textContent=percent+'%';sheet.querySelector('#room-bomb-bar').style.width=percent+'%';
        sheet.querySelector('#room-bomb-panel-level').textContent='LV.'+level;sheet.querySelector('#room-bomb-panel-percent').textContent=percent+'%';sheet.querySelector('#room-bomb-panel-bar').style.width=percent+'%';
        sheet.querySelector('#room-bomb-levels').innerHTML=(data.levels||[]).map(x=>'<span class="'+(Number(x.level)<level?'done':Number(x.level)===level?'current':'')+'">LV.'+num(x.level)+'</span>').join('');
        sheet.querySelector('#room-bomb-top3').innerHTML=(data.contributors||[]).length?data.contributors.map((x,i)=>'<div class="hs-room-bomb-contributor"><b>'+(i+1)+'</b><span>'+(esc(x.profile?.displayName||'عضو'))+'</span><strong>'+num(x.points)+'</strong></div>').join(''):'<p>لا توجد مساهمات بعد.</p>';
        updateRoomBombCountdown();
      }catch(error){console.warn('Room bomb is waiting for its database migration:',error.message);}
    };
    const closeRoomBomb=()=>{bombPanel.classList.add('hidden');bombBackdrop.classList.add('hidden');};
    sheet.querySelector('#room-bomb-floating').onclick=()=>{bombPanel.classList.remove('hidden');bombBackdrop.classList.remove('hidden');drawRoomBomb();};
    sheet.querySelector('#room-bomb-close').onclick=closeRoomBomb;bombBackdrop.onclick=closeRoomBomb;
    state.roomBombTimer=window.setInterval(updateRoomBombCountdown,1000);

    sheet.querySelector('#room-emoji-close')?.addEventListener('click',()=>{emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');});sheet.querySelector('#room-emoji-backdrop')?.addEventListener('click',()=>{emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');});
    const giftPanel=sheet.querySelector('#room-gift-panel'),giftForm=sheet.querySelector('#room-gift-form'),giftGrid=sheet.querySelector('#room-gift-grid'),giftSubmit=giftForm.querySelector('[type="submit"]');
    let selectedGiftCategory='app';
    const drawRoomGiftGrid=()=>{
      const filtered=(state.gifts||[]).filter(g=>(g.category||'app')===selectedGiftCategory);
      giftGrid.innerHTML=filtered.map(g=>'<button type="button" class="hs-gift-choice" data-gift="'+esc(g.id)+'"><span class="hs-gift-choice-art"><i data-lucide="'+esc(g.icon||'gift')+'"></i></span><b>'+esc(g.name)+'</b><small>'+num(g.price)+' عملة</small></button>').join('')||'<p class="text-xs opacity-70">لا توجد هدايا في هذا التصنيف حالياً</p>';
      giftGrid.querySelectorAll('[data-gift]').forEach(b=>b.onclick=()=>{giftForm.elements.gift.value=b.dataset.gift;giftGrid.querySelectorAll('.hs-gift-choice').forEach(x=>x.classList.toggle('selected',x===b));const chosen=state.gifts.find(g=>g.id===b.dataset.gift);sheet.querySelector('#room-gift-selection').textContent='الهدية المختارة: '+chosen.name+' · '+num(chosen.price)+' عملة';giftSubmit.disabled=false;});
      icons_();
    };
    sheet.querySelectorAll('#room-gift-categories [data-gift-category]').forEach(button=>button.onclick=()=>{selectedGiftCategory=button.dataset.giftCategory;sheet.querySelectorAll('#room-gift-categories [data-gift-category]').forEach(x=>x.classList.toggle('active',x===button));drawRoomGiftGrid();});
    sheet.querySelector('#room-send-gift').onclick=async()=>{
      try{
        const [{members},{seats},giftData]=await Promise.all([api.roomMembers(r.id),api.roomSeats(r.id),state.gifts?Promise.resolve({gifts:state.gifts}):api.gifts()]);
        state.gifts=giftData.gifts;
        const seatedIds=new Set(seats.map(x=>x.user_id));
        const recipients=members.filter(m=>m.userId!==state.profile?.uuid&&seatedIds.has(m.userId));
        if(!recipients.length){toast('لا يوجد أعضاء آخرون على مقاعد المايك حالياً');return;}
        const seatNumbers=Object.fromEntries(seats.map(x=>[x.user_id,x.seat_no]));
        giftForm.elements.recipient.innerHTML=recipients.map(m=>'<option value="'+esc(m.userId)+'">'+esc(m.displayName)+' · مقعد '+num(seatNumbers[m.userId])+'</option>').join('')+'<option value="__all__">All · كل الجالسين ('+num(recipients.length)+')</option>';sheet.querySelector('#room-gift-all').onclick=()=>{giftForm.elements.recipient.value='__all__';sheet.querySelector('#room-gift-selection').textContent='سيتم إرسال الهدية إلى جميع الجالسين على المايك';};
        giftForm.elements.gift.value='';giftSubmit.disabled=true;
        sheet.querySelector('#room-gift-selection').textContent='اختاري هدية للمتابعة';
        selectedGiftCategory='app';sheet.querySelectorAll('#room-gift-categories [data-gift-category]').forEach(x=>x.classList.toggle('active',x.dataset.giftCategory==='app'));drawRoomGiftGrid();
        emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');sheet.querySelector('#room-game-center').classList.add('hidden');sheet.querySelector('#room-game-backdrop').classList.add('hidden');giftPanel.classList.remove('hidden');sheet.querySelector('#room-gift-backdrop').classList.remove('hidden');icons_();
      }catch(e){toast(e.message,'error');}
    };
    sheet.querySelector('#room-gift-close').onclick=()=>{giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');};sheet.querySelector('#room-gift-backdrop').onclick=()=>{giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');};
    giftForm.onsubmit=async e=>{e.preventDefault();const b=giftSubmit;if(!giftForm.elements.gift.value){toast('اختاري هدية أولاً');return;}b.disabled=true;try{const v=Object.fromEntries(new FormData(giftForm));const quantity=Number(v.quantity||1);if(v.recipient==='__all__'){const gift=state.gifts.find(g=>g.id===v.gift);const count=(await api.roomSeats(r.id)).seats.filter(x=>x.user_id!==state.profile?.uuid).length;const total=Number(gift?.price||0)*quantity*count;if(!confirm('سيتم إرسال '+(gift?.name||'الهدية')+' ×'+quantity+' إلى '+num(count)+' أعضاء. الإجمالي المتوقع: '+num(total)+' عملة. هل تريدين المتابعة؟'))return;}const result=v.recipient==='__all__'?await api.sendRoomGiftToAll(r.id,v.gift,quantity):await api.sendRoomGift(r.id,v.recipient,v.gift,quantity);state.wallet=(await api.wallet()).wallet;giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');toast(result?.recipients_count?'تم إرسال الهدية إلى '+num(result.recipients_count)+' أعضاء':'تم إرسال الهدية بنجاح');}catch(err){toast(err.message,'error');}finally{b.disabled=false;}};
    drawRoomBomb();
    const del=sheet.querySelector('#del-room');if(del)del.onclick=async()=>{if(!confirm('هل تريد حذف هذه الغرفة؟'))return;del.disabled=true;try{await api.deleteRoom(r.id);closeSheet();toast('تم حذف الغرفة');render();}catch(e){toast(e.message,'error');del.disabled=false;}};
  });
}
let roomFilter = 'الكل';
async function roomsScreen(params) {
  screen.innerHTML = header('الغرف الصوتية', `<button id="new-room" class="btn-gold text-sm py-2 px-3"><i data-lucide="plus" class="w-4 h-4"></i>إنشاء</button>`) + `
    <div class="px-5 pt-4 fade-in">
      <section class="rooms-welcome card ornament p-4 mb-4"><div class="flex items-center justify-between gap-3"><div><span class="text-[10px] tracking-[.2em] text-gold-400">H A M S A T  •  LIVE</span><h2 class="text-lg font-extrabold mt-1">مساحات تجمعنا</h2><p class="text-xs text-[#b7b2a5] mt-1 leading-5">ادخلي غرفة، تعرّفي على الأعضاء وشاركي الحديث</p></div><div class="rooms-welcome-icon"><i data-lucide="audio-lines"></i></div></div><div class="rooms-live-note"><span></span> غرف المجتمع · دردشة ومقاعد تفاعلية</div></section>
      <div class="flex items-center justify-between mb-2"><span class="text-xs text-[#b7b2a5]">الغرف المتاحة</span><span id="rooms-real-count" class="text-xs text-gold-300">—</span></div>
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
    bindRoomCards(el, rooms); const badge=$('#rooms-real-count'); if(badge)badge.textContent=num(list.length)+' غرفة'; icons_();
  };
  $('#filters').querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    roomFilter = b.dataset.t;
    $('#filters').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    draw();
  });
  try {
    rooms = (await api.rooms()).rooms; draw();
    const inviteId=params.get('invite');
    if(inviteId){
      const {room}=await api.roomById(inviteId);
      history.replaceState(null,'',location.pathname+location.search+'#/rooms');
      openRoom(room);
    }
  }
  catch (e) { const el = $('#rooms-list'); if (el) { el.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الغرف', e.message); icons_(); } }
}

function newRoomSheet() {
  openSheet(`
    <h2 class="text-lg font-bold mb-4">غرفة جديدة</h2>
    <form id="room-form" class="space-y-4">
      <div><label class="label">عنوان الغرفة</label><input name="title" class="field" maxlength="50" required placeholder="مثال: سهرة شعرية"></div>
      <div><label class="label">الموضوع</label><div id="topic-pick" class="flex flex-wrap gap-2">${TOPICS.map((t, i) => `<button type="button" data-t="${t}" class="chip ${i === 0 ? 'active' : ''}">${t}</button>`).join('')}</div><input type="hidden" name="topic" value="${TOPICS[0]}"></div>
      <div><label class="label">وصف قصير</label><textarea name="description" class="field resize-none" rows="3" maxlength="160" placeholder="اختياري"></textarea></div>
      <div><label class="label">صورة الغرفة</label><label class="photo-picker room-photo-picker"><i data-lucide="image-plus"></i><span>اختيار غلاف من الهاتف</span><input type="file" name="coverFile" accept="image/png,image/jpeg,image/webp" hidden></label><input type="hidden" name="coverUrl" value=""></div>
      <button class="btn-gold w-full" type="submit"><i data-lucide="check" class="w-5 h-5"></i>إنشاء الغرفة</button>
    </form>`, (sheet) => {
    const f = sheet.querySelector('#room-form');
    f.elements.coverFile.onchange=async()=>{const file=f.elements.coverFile.files?.[0];if(!file)return;if(file.size>5*1024*1024){toast('حجم الصورة يجب ألا يتجاوز 5 ميغابايت','error');return;}const label=sheet.querySelector('.room-photo-picker span');label.textContent='جارٍ رفع الغلاف...';try{const uploaded=await api.uploadMedia(file,'rooms');f.elements.coverUrl.value=uploaded.url;label.textContent='تم اختيار الغلاف ✓';}catch(err){toast(err.message,'error');label.textContent='اختيار غلاف من الهاتف';}};
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

const giftCelebrationQueue=[];
let giftCelebrationActive=false;
function showGiftCelebration(gift, quantity = 1) {
  giftCelebrationQueue.push({gift,quantity});
  if(giftCelebrationActive)return;
  const playNext=()=>{
    const next=giftCelebrationQueue.shift();
    if(!next){giftCelebrationActive=false;return;}
    giftCelebrationActive=true;
    const root=document.createElement('div');
    root.className='gift-celebration';
    root.setAttribute('role','status');
    root.innerHTML='<div class="gift-celebration-card"><span class="gift-celebration-spark">✦</span><div class="gift-celebration-icon"><i data-lucide="'+esc(next.gift?.icon||'gift')+'"></i></div><strong>'+esc(next.gift?.name||'هدية')+'</strong><small>'+(next.quantity>1?'× '+num(next.quantity):'هدية من القلب')+'</small><span class="gift-celebration-spark second">✧</span></div>';
    document.body.appendChild(root);icons_();
    requestAnimationFrame(()=>root.classList.add('show'));
    window.setTimeout(()=>{root.classList.remove('show');window.setTimeout(()=>{root.remove();giftCelebrationActive=false;playNext();},350);},2100);
  };
  playNext();
}
async function gamesScreen() {
  screen.innerHTML = header('الألعاب') + `
    <div class="px-5 pt-4 pb-8 fade-in">
      <div class="card ornament p-4 mb-4"><p class="font-bold text-gold-300">مساحة التحديات</p><p class="text-xs text-[#c7bdab] leading-6 mt-1">اختاري لعبة وابدئي جولة قصيرة. النقاط هنا نتيجة الجولة الحالية وليست رصيد عملات.</p></div>
      <div id="games-grid" class="grid grid-cols-1 gap-3">${loading()}</div>
    </div>`;
  icons_();
  let games=[];
  try { games=(await api.games()).games; }
  catch(e) { $('#games-grid').innerHTML=emptyBox('wifi-off','تعذّر تحميل الألعاب',e.message); return; }
  const root=$('#games-grid');
  const draw=()=>{
    root.innerHTML=games.length?games.map(g=>{
      const count=Array.isArray(g.config?.questions)?g.config.questions.length:0;
      return `<article class="card p-4 flex items-center gap-3"><div class="w-14 h-14 rounded-2xl bg-[#302713] border border-amber-400/30 flex items-center justify-center text-3xl">${esc(g.icon||'🎮')}</div><div class="min-w-0 flex-1"><b class="block">${esc(g.name)}</b><p class="text-xs text-[#bba9d6] mt-1">${esc(g.description||'تحدي ممتع من مجتمع همسات')}</p><small class="text-[10px] text-gold-300">${num(count)} سؤال</small></div><button class="btn-gold text-xs px-3 py-2" data-play="${esc(g.id)}" ${count?'':'disabled'}>${count?'ابدئي':'قريبًا'}</button></article>`;
    }).join(''):emptyBox('gamepad-2','لا توجد ألعاب منشورة','سيتم عرض الألعاب هنا عندما ينشرها المدير من لوحة الإدارة.');
    root.querySelectorAll('[data-play]').forEach(btn=>btn.onclick=()=>playGame(games.find(g=>g.id===btn.dataset.play)));
    icons_();
  };
  const playGame=(game)=>{
    const questions=(game?.config?.questions||[]).filter(q=>q&&typeof q.question==='string'&&Array.isArray(q.options)&&q.options.length>=2);
    if(!questions.length){toast('هذه اللعبة لا تحتوي أسئلة جاهزة بعد.','error');return;}
    let index=0,score=0,answered=false;
    const show=()=>{
      const q=questions[index];answered=false;
      openSheet(`
        <div class="flex items-center justify-between mb-3"><span class="text-xs text-gold-300">${esc(game.name)}</span><span class="text-xs text-[#bba9d6]">${num(index+1)} / ${num(questions.length)}</span></div>
        <div class="h-1.5 rounded-full bg-[#29252b] mb-5 overflow-hidden"><div class="h-full bg-amber-400" style="width:${((index+1)/questions.length)*100}%"></div></div>
        <h2 class="text-lg font-bold leading-8 mb-4">${esc(q.question)}</h2>
        <div class="grid gap-2" id="game-options">${q.options.map((option,i)=>`<button type="button" class="btn-ghost w-full text-right" data-answer="${i}">${esc(option)}</button>`).join('')}</div>
        <p id="game-feedback" class="text-sm mt-4 text-[#c7bdab]" aria-live="polite"></p>
        <button id="game-next" type="button" class="btn-gold w-full mt-4" disabled>${index===questions.length-1?'عرض النتيجة':'السؤال التالي'}</button>
      `,sheet=>{
        sheet.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
          if(answered)return;answered=true;
          const selected=Number(button.dataset.answer),correct=Number(q.answer);
          const ok=selected===correct || String(q.answer)===String(q.options[selected]);
          if(ok)score++;
          sheet.querySelectorAll('[data-answer]').forEach((x,i)=>{x.disabled=true;if(i===correct)x.classList.add('border','border-emerald-400','text-emerald-300');else if(i===selected&&!ok)x.classList.add('border','border-rose-400','text-rose-300');});
          sheet.querySelector('#game-feedback').textContent=(ok?'إجابة صحيحة! ✨':'ليست الإجابة الصحيحة.')+(q.explanation?' '+q.explanation:'');
          sheet.querySelector('#game-next').disabled=false;
        });
        sheet.querySelector('#game-next').onclick=()=>{if(index<questions.length-1){index++;show();}else{openSheet(`<div class="text-center py-5"><div class="text-5xl mb-3">🏆</div><h2 class="text-xl font-extrabold text-gold-300">انتهت الجولة!</h2><p class="text-3xl font-bold mt-3">${num(score)} / ${num(questions.length)}</p><p class="text-sm text-[#bba9d6] mt-2">نتيجتك في هذه الجولة</p><button type="button" id="game-finish" class="btn-gold w-full mt-5">العودة للألعاب</button></div>`,s=>s.querySelector('#game-finish').onclick=()=>{closeSheet();draw();});}};
      });
    };
    show();
  };
  draw();
}

async function giftsScreen() {
  screen.innerHTML = header('الهدايا', `<a href="#/wallet" class="flex items-center gap-1.5 text-sm">${coin(18)}<span class="font-bold text-gold-300">${num(state.wallet?.balance)}</span></a>`) + `
    <div class="px-5 pt-4 pb-6 fade-in">
      <div class="rounded-2xl border border-dashed border-ink-500 p-4 flex gap-3 mb-5">
        <i data-lucide="info" class="w-5 h-5 text-gold-400 shrink-0 mt-0.5"></i>
        <p class="text-[13px] text-[#cbb9e6] leading-6">اختاري عضوًا من قائمة الأعضاء وافتحي ملفه لإرسال هدية. يتم خصم العملات وتحويلها عبر قاعدة البيانات بشكل آمن.</p>
      </div>
      <div id="gifts-grid" class="grid grid-cols-2 gap-3">${loading()}</div>
      <section class="mt-7"><div class="flex items-center justify-between mb-3"><h3 class="font-bold">اختاري عضوًا لإرسال هدية</h3><span id="gift-member-count" class="text-xs text-[#a993c8]"></span></div><div id="gift-members" class="space-y-2">${loading()}</div></section>
    </div>`;
  icons_();
  try {
    const [giftResult,memberResult]=await Promise.all([state.gifts?Promise.resolve({gifts:state.gifts}):api.gifts(),api.users()]);
    state.gifts=giftResult.gifts; const el=$('#gifts-grid');if(!el)return;
    el.innerHTML=state.gifts.map(g=>`<article class="gift-card card p-4 flex flex-col items-center text-center"><div class="gift-art gift-art-luxe"><i data-lucide="${esc(g.icon || 'gift')}"></i><span>✦</span></div><p class="font-bold">${esc(g.name)}</p><p class="flex items-center gap-1 text-sm text-gold-300 mt-1">${coin(16)}${num(g.price)}</p><small class="gift-card-note">هدية همسات</small></article>`).join('');
    icons_();
    const members=$('#gift-members');$('#gift-member-count').textContent=`${num(memberResult.total)} عضو`;
    members.innerHTML=memberResult.users.filter(u=>u.uuid!==state.profile?.uuid).map(u=>`<a href="#/u/${encodeURIComponent(u.publicId || u.handle)}" class="gift-member-row card flex items-center gap-3 p-3">${avatar(u,42)}<span class="flex-1 min-w-0"><strong class="block text-sm truncate">${esc(u.displayName)}</strong><small class="text-xs text-[#a993c8]">@${esc(u.handle)}</small></span><span class="text-xs text-gold-300">إرسال هدية ←</span></a>`).join('')||emptyBox('users','لا يوجد أعضاء آخرون بعد','سيظهر الأعضاء هنا عند إنشاء ملفاتهم الشخصية');
    icons_();
  } catch(e){const el=$('#gifts-grid');if(el){el.className='';el.innerHTML=emptyBox('wifi-off','تعذّر تحميل الهدايا',e.message);}const m=$('#gift-members');if(m)m.innerHTML=emptyBox('wifi-off','تعذّر تحميل الأعضاء',e.message);icons_();}
}


async function shopScreen() {
  screen.innerHTML = header('المتجر والمقتنيات', `<a href="#/wallet" class="text-sm text-gold-300">${coin(18)} ${num(state.wallet?.balance)}</a>`) + `
    <div class="px-5 pt-4 pb-8 fade-in">
      <div class="card ornament p-4 mb-4"><p class="font-bold text-gold-300">متجر همسات الملكي</p><p class="text-xs text-[#c7bdab] leading-6 mt-1">امتلكي إطارات لحسابك وحزم إيموجي للدردشة. العناصر التي تشترينها تبقى محفوظة في مقتنياتك.</p></div>
      <div class="flex gap-2 mb-3"><button class="chip active" data-shop-tab="all">المتجر</button><button class="chip" data-shop-tab="owned">مقتنياتي</button></div><div id="shop-category-tabs" class="hs-shop-category-tabs"><button type="button" class="active" data-shop-category="all">الكل</button><button type="button" data-shop-category="frame">إطارات</button><button type="button" data-shop-category="entrance">دخول</button><button type="button" data-shop-category="chat_bubble">فقاعات الدردشة</button><button type="button" data-shop-category="special_id">معرّف خاص</button><button type="button" data-shop-category="profile_frame">إطار الملف</button></div>
      <div id="shop-grid" class="grid grid-cols-2 gap-3">${loading()}</div>
    </div>`;
  icons_();
  let items=[],owned=[];
  try {
    const [catalog,inventory]=await Promise.all([api.shopItems(),api.inventory()]);
    items=catalog.items;owned=inventory.items;
  } catch(e) { $('#shop-grid').innerHTML=emptyBox('wifi-off','تعذّر تحميل المتجر',e.message);return; }
  let mode='all',category='all';
  const draw=()=>{
    const baseList=mode==='owned'?owned:items;const list=baseList.filter(it=>category==='all'||it.item_type===category);
    $('#shop-grid').innerHTML=list.length?list.map(it=>{
      const has=owned.some(o=>o.id===it.id);
      const visual=it.image_url?'<div class="cosmetic-preview"><img src="'+esc(it.image_url)+'" alt="'+esc(it.name)+'" loading="lazy" style="width:100%;height:100%;object-fit:contain;border-radius:12px"></div>':['frame','profile_frame','sound_frame'].includes(it.item_type)?'<div class="cosmetic-preview"><span class="cosmetic-avatar '+esc(it.visual_key)+'">هـ</span></div>':
        '<div class="cosmetic-preview emoji-preview">'+(it.visual_key==='love'?'💖 💗 💕':it.visual_key==='luxe'?'👑 💎 ✨':'🌙 ⭐ 🌟')+'</div>';
      const equippedId=({frame:state.profile?.equippedFrameId,profile_frame:state.profile?.equippedProfileFrameId,entrance:state.profile?.equippedEntranceId,chat_bubble:state.profile?.equippedBubbleId,special_id:state.profile?.equippedSpecialId,sound_frame:state.profile?.equippedSoundFrameId,voice_wave:state.profile?.equippedVoiceWaveId,emoji_pack:state.profile?.equippedEmojiPackId})[it.item_type];
      const equipped=has&&equippedId===it.id;
      const remaining=it.expiresAt?Math.max(0,Math.ceil((new Date(it.expiresAt).getTime()-Date.now())/86400000)):null;const expiry=it.expiresAt?'متبقي '+num(remaining)+' يوم':'دائم';
      return `<article class="card p-3 flex flex-col items-center text-center cosmetic-card">${visual}<p class="font-bold text-sm mt-2">${esc(it.name)}</p><span class="text-[10px] text-gold-300 mt-1">${esc(it.rarity)}</span><p class="text-xs text-[#c7bdab] mt-2">${has?expiry:num(it.price)+' عملة'}</p>
        <button class="btn-${has?(equipped?'ghost':'gold'):'gold'} w-full text-xs py-2 mt-3" data-item="${esc(it.id)}" data-type="${esc(it.item_type)}" data-owned="${has}" data-equipped="${equipped}">${has?(equipped?'إلغاء الاستخدام':'استخدام'):'شراء'}</button></article>`;
    }).join(''):emptyBox('package-open','لا توجد مقتنيات بعد','تصفحي المتجر لاقتناء أول إطار أو حزمة إيموجي');
    $('#shop-grid').querySelectorAll('[data-item]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{
        if(b.dataset.owned==='true'){if(b.dataset.equipped==='true'){await api.unequipShopItem(b.dataset.type);toast('تم إلغاء استخدام العنصر');}else{await api.equipShopItem(b.dataset.item);toast('تم تجهيز العنصر في حسابك');}state.profile=(await api.me()).profile;}
        else{await api.purchaseShopItem(b.dataset.item);state.wallet=(await api.wallet()).wallet;owned=(await api.inventory()).items;toast('تم الشراء وإضافة العنصر إلى مقتنياتك');}
        draw();
      }catch(e){toast(e.message,'error');b.disabled=false;}
    });
    icons_();
  };
  screen.querySelectorAll('[data-shop-category]').forEach(b=>b.onclick=()=>{category=b.dataset.shopCategory;screen.querySelectorAll('[data-shop-category]').forEach(x=>x.classList.toggle('active',x===b));draw();});
  screen.querySelectorAll('[data-shop-tab]').forEach(b=>b.onclick=()=>{
    mode=b.dataset.shopTab;
    screen.querySelectorAll('[data-shop-tab]').forEach(x=>x.classList.toggle('active',x===b));
    draw();
  });
  draw();
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

function profileStatsMarkup() {
  return `
    <div class="hs-profile-stats" aria-label="إحصائيات الحساب">
      <button type="button" data-profile-stat-go="following"><b data-profile-stat="following">—</b><span>يتابع</span></button>
      <button type="button" data-profile-stat-go="followers"><b data-profile-stat="followers">—</b><span>المتابعون</span></button>
      <button type="button" data-profile-stat-go="friends"><b data-profile-stat="friends">—</b><span>الأصدقاء</span></button>
      <button type="button" data-profile-stat-go="visitors"><b data-profile-stat="visitors">—</b><span>الزوار</span></button>
    </div>`;
}
function profileRewardsMarkup() {
  return `
    <section class="hs-rewards" data-profile-rewards>
      <div class="hs-rewards-loading">جارٍ تحميل المستوى والشارات والمقتنيات…</div>
    </section>`;
}
function xpThreshold(level) {
  return [0,100,250,500,900,1400,2000,2800,3800,5000][Math.max(0,Math.min(9,level-1))] || 0;
}
function renderProfileRewards(host, rewards, profile) {
  if(!host) return;
  const xp=Number(rewards.progress?.xp||0), level=Number(rewards.progress?.level||1);
  const start=xpThreshold(level), next=level>=10?xp:xpThreshold(level+1);
  const percent=level>=10?100:Math.max(0,Math.min(100,((xp-start)/Math.max(1,next-start))*100));
  const badges=rewards.badges||[], items=rewards.items||[];
  const typeNames={frame:'إطار',emoji_pack:'زينة',entrance:'دخولية',sound_frame:'إطار صوتي',voice_wave:'موجة صوت'};
  host.innerHTML=`
    <div class="hs-level-card">
      <div class="hs-level-top"><span class="hs-level-emblem">✦</span><div><small>مستوى العضو</small><b>المستوى ${num(level)}</b></div><strong>${num(xp)} XP</strong></div>
      <div class="hs-level-track"><span style="width:${percent}%"></span></div>
      <div class="hs-level-foot"><span>${level>=10?'وصلتِ إلى أعلى مستوى حالياً':num(xp-start)+' نقطة في هذا المستوى'}</span><span>${level>=10?'MAX':num(next-xp)+' XP للمستوى التالي'}</span></div>
    </div>
    <div class="hs-reward-section">
      <div class="hs-reward-heading"><b>الشارات والإنجازات</b><small>${num(badges.length)} شارة</small></div>
      ${badges.length?'<div class="hs-badge-grid">'+badges.map(b=>`<div class="hs-badge-chip" title="${esc(b.description||'')}"><span>${esc(b.icon||'✦')}</span><b>${esc(b.name)}</b><small>${esc(b.rarity||'')}</small></div>`).join('')+'</div>':'<p class="hs-reward-empty">إنجازاتك الأولى بانتظارك — شاركي في الغرف وكوني صداقات.</p>'}
    </div>
    <div class="hs-reward-section">
      <div class="hs-reward-heading"><b>المقتنيات</b><small>${num(items.length)} عنصر</small></div>
      ${items.length?'<div class="hs-collection-grid">'+items.slice(0,8).map(item=>`<div class="hs-collection-item">${item.image_url?'<img src="'+esc(item.image_url)+'" alt="" loading="lazy">':'<span class="hs-collection-symbol">✧</span>'}<b>${esc(item.name)}</b><small>${esc(typeNames[item.item_type]||'عنصر')} · ${esc(item.rarity||'عادي')}</small>${(profile.equippedFrameId===item.id||profile.equippedEmojiPackId===item.id)?'<em>مجهز</em>':''}</div>`).join('')+'</div>':'<p class="hs-reward-empty">لا توجد مقتنيات بعد. اكتشفي المتجر لإضافة أول زينة إلى حسابك.</p>'}
    </div>`;
}
async function loadProfileRewards(profileId, profile) {
  const host=document.querySelector('[data-profile-rewards]');
  if(!host||!profileId)return;
  try{const rewards=await api.profileRewards(profileId);renderProfileRewards(host,rewards,profile||state.profile||({equippedFrameId:null,equippedEmojiPackId:null}));}
  catch(error){host.innerHTML='<p class="hs-reward-empty">تعذر تحميل المستوى والشارات حالياً.</p>';console.warn('تعذر تحميل إنجازات الملف:',error);}
}
async function loadProfileStats(profileId, recordVisit = false) {
  if (!profileId) return;
  try {
    const stats = await api.profileStats(profileId, recordVisit);
    document.querySelectorAll('[data-profile-stat]').forEach(node => {
      const key = node.getAttribute('data-profile-stat');
      node.textContent = num(stats[key] || 0);
    });
  } catch (error) {
    document.querySelectorAll('[data-profile-stat]').forEach(node => node.textContent = '—');
    console.warn('تعذر تحميل إحصائيات الملف الشخصي:', error);
  }
}


async function bindProfileSocial(profile,own){
 const root=document.querySelector('.hs-profile-page');if(!root)return;
 const buttons=[...root.querySelectorAll('[data-profile-tab]')],panels=[...root.querySelectorAll('[data-profile-panel]')];
 const show=name=>{buttons.forEach(b=>b.classList.toggle('active',b.dataset.profileTab===name));panels.forEach(p=>p.hidden=p.dataset.profilePanel!==name);if(name==='moments')loadProfileMoments(profile.uuid,own);};
 buttons.forEach(b=>b.onclick=()=>show(b.dataset.profileTab));
 const share=root.querySelector('#share-profile-cover');if(share)share.onclick=async()=>{const url=location.origin+location.pathname+'#/u/'+encodeURIComponent(profile.handle||profile.publicId||'');try{if(navigator.share)await navigator.share({title:'HAMSAT',url});else{await navigator.clipboard.writeText(url);toast('تم نسخ رابط الحساب');}}catch(e){if(e.name!=='AbortError')toast(url);}};
 await loadCoupleSpace(profile,own);
 const form=root.querySelector('[data-moment-form]');if(form)form.onsubmit=async e=>{e.preventDefault();const body=form.elements.body.value.trim(),file=form.elements.momentImage.files?.[0],btn=form.querySelector('[type=submit]');btn.disabled=true;try{let imageUrl=null;if(file)imageUrl=(await api.uploadMedia(file,'moments')).url;if(!body&&!imageUrl)throw new Error('اكتبي شيئاً أو أضيفي صورة');await api.createMoment(body,imageUrl);form.reset();toast('تم نشر لحظتك');await loadProfileMoments(profile.uuid,true);}catch(err){toast(err.message,'error');}finally{btn.disabled=false;}};
}
async function loadProfileMoments(id,own){const host=document.querySelector('[data-moments-list]');if(!host)return;host.textContent='جارٍ تحميل اللحظات…';try{const {moments}=await api.moments(id);host.innerHTML=moments.length?moments.map(m=>'<article class="hs-moment-card">'+(m.image_url?'<img src="'+esc(m.image_url)+'" alt="صورة لحظة" loading="lazy">':'')+(m.body?'<p>'+esc(m.body)+'</p>':'')+'<small>'+dateAr(new Date(m.created_at).getTime())+'</small>'+(own?'<button type="button" data-delete-moment="'+esc(m.id)+'">حذف</button>':'')+'</article>').join(''):'<div class="hs-moment-empty">لا توجد لحظات منشورة بعد.</div>';host.querySelectorAll('[data-delete-moment]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف هذه اللحظة؟'))return;try{await api.deleteMoment(b.dataset.deleteMoment);loadProfileMoments(id,own);}catch(e){toast(e.message,'error');}});}catch(e){host.innerHTML='<div class="hs-moment-empty">تعذر تحميل اللحظات: '+esc(e.message)+'</div>';}}
async function loadCoupleSpace(profile,own){const host=document.querySelector('[data-couple-space]');if(!host)return;try{const {space,partner}=await api.coupleSpace(profile.uuid),title='<div class="hs-cp-title"><b>مساحة CP</b><small>مساحتكما المشتركة</small></div>';if(!space){host.innerHTML=title+(own?'<p class="hs-cp-empty">لا توجد مساحة CP مرتبطة بحسابك بعد.</p>':'<p class="hs-cp-empty">لا توجد مساحة CP لهذا العضو حالياً.</p><button type="button" class="btn-gold" data-cp-invite>إرسال دعوة CP</button>');host.querySelector('[data-cp-invite]')?.addEventListener('click',async()=>{try{await api.inviteCouple(profile.uuid);toast('تم إرسال دعوة CP');await loadCoupleSpace(profile,false);}catch(e){toast(e.message,'error');}});return;}host.innerHTML=title+'<div class="hs-cp-pair">'+avatar(profile,54)+'<span>♡</span>'+avatar(partner||{},54)+'</div><b class="hs-cp-names">'+esc(profile.displayName)+' & '+esc(partner?.displayName||'عضو')+'</b><small class="hs-cp-state">'+(space.status==='active'?'مرتبطان في همسات':'دعوة CP بانتظار الرد')+'</small>'+(space.status==='pending'&&space.partner_id===state.profile?.uuid?'<div class="hs-cp-actions"><button data-cp-accept>قبول</button><button data-cp-reject>رفض</button></div>':'')+(space.status==='active'&&own?'<button data-cp-end>إنهاء الارتباط</button>':'');host.querySelector('[data-cp-accept]')?.addEventListener('click',async()=>{await api.respondCoupleSpace(space.id,true);loadCoupleSpace(profile,own);});host.querySelector('[data-cp-reject]')?.addEventListener('click',async()=>{await api.respondCoupleSpace(space.id,false);loadCoupleSpace(profile,own);});host.querySelector('[data-cp-end]')?.addEventListener('click',async()=>{if(confirm('إنهاء مساحة CP؟')){await api.endCoupleSpace(space.id);loadCoupleSpace(profile,own);}});}catch(e){host.innerHTML='<div class="hs-cp-empty">تعذر تحميل مساحة CP: '+esc(e.message)+'</div>';}}

function profileView(p, own) {
  const avatarFrame = `
    <div class="hs-profile-frame">
      <div class="hs-profile-frame-glow"></div>
      <div class="hs-profile-avatar">${avatar(p, 104)}</div>
      <span class="hs-frame-spark hs-frame-spark-a">✦</span><span class="hs-frame-spark hs-frame-spark-b">✧</span>
    </div>`;
  return `
    <section class="hs-profile-page">
      <div class="hs-profile-cover" style="${p.coverUrl || p.backgroundUrl ? `background-image:linear-gradient(180deg,rgba(7,8,12,.02),rgba(7,8,12,.82)),url(${JSON.stringify(p.coverUrl || p.backgroundUrl)})` : ''}">
        <div class="hs-cover-shine"></div><span class="hs-cover-star">✧</span><div class="hs-cover-actions">${own?'<button type="button" id="edit-profile-cover"><i data-lucide="camera"></i></button>':''}<button type="button" id="share-profile-cover"><i data-lucide="share-2"></i></button></div>
      </div>
      <div class="hs-profile-main">
        ${avatarFrame}
        <div class="hs-profile-identity">
          <h2>${esc(p.displayName)} ${p.role==='admin'?'<span class="hs-admin-badge">ADMIN</span>':''}</h2>
          <p class="hs-profile-demographics">${p.age?num(p.age)+' سنة':''}${p.gender==='female'?' · ♀':p.gender==='male'?' · ♂':''}</p>
          <p dir="ltr">@${esc(p.handle)}</p>
          ${p.publicId ? `<button type="button" data-copy-public-id="${esc(p.publicId)}" class="hs-profile-id" dir="ltr"><i data-lucide="copy"></i> ID: ${esc(p.publicId)}</button>` : ''}
          ${p.bio ? `<p class="hs-profile-bio">${esc(p.bio)}</p>` : own ? '<p class="hs-profile-bio hs-muted">أضيفي نبذة جميلة عنكِ</p>' : ''}
          <div class="hs-profile-tags">
            ${p.role==='admin'?'<span>🛡️ إدارة همسات</span>':''}${p.vipLevel>0?'<span>👑 VIP '+num(p.vipLevel)+'</span>':''}
            <span>💎 ثروة ${num(p.wealthLevel)}</span><span>✨ كاريزما ${num(p.charismaLevel)}</span>
            ${p.country ? `<span>${/الجزائر|algeria/i.test(p.country) ? '🇩🇿' : '⌖'} ${esc(p.country)}</span>` : ''}
            <span>✦ عضو في همسات</span>${p.createdAt ? `<span>منذ ${dateAr(p.createdAt)}</span>` : ''}
          </div>
        </div>
        ${!own ? '' : '<button type="button" class="hs-profile-edit-hint hs-bio-edit" id="edit-profile-inline"><i data-lucide="pencil"></i> تعديل النبذة والملف</button>'}
      </div>
      ${own ? `
        <div class="hs-profile-ribbon">
          <span>✧</span><b>H A M S A T</b><span>♡</span>
        </div>` : ''}
      <div class="hs-profile-tabs"><button class="active" type="button" data-profile-tab="profile">الملف الشخصي</button><button type="button" data-profile-tab="moments">لحظة</button></div>
      <div data-profile-panel="profile">${profileStatsMarkup()}${profileRewardsMarkup()}<section class="hs-cp-card" data-couple-space><div class="hs-cp-title"><b>مساحة CP</b><small>مساحتكما المشتركة</small></div><div class="hs-cp-loading">جارٍ تحميل مساحة CP…</div></section></div>
      <section data-profile-panel="moments" class="hs-moments-panel" hidden>${own?'<form data-moment-form class="hs-moment-compose"><textarea name="body" maxlength="500" placeholder="شاركي لحظة جميلة…"></textarea><label class="photo-picker"><i data-lucide="image-plus"></i><span>إضافة صورة</span><input type="file" name="momentImage" accept="image/jpeg,image/png,image/webp" hidden></label><button type="submit" class="btn-gold">نشر اللحظة</button></form>':''}<div data-moments-list class="hs-moments-list">جارٍ تحميل اللحظات…</div></section>
    </section>`;
}

function meScreen() {
  const p = state.profile;
  const menuGroups = [
    [
      {icon:'wallet',label:'المحفظة',sub:'رصيد العملات وسجل المعاملات',href:'#/wallet',tone:'gold'},
      {icon:'shopping-bag',label:'المتجر',sub:'الإطارات والهدايا والزينة',href:'#/shop',tone:'pink'},
      {icon:'crown',label:'الأرستقراطية VIP',sub:'العضويات والمزايا الحصرية',href:'#/aristocracy',tone:'gold',soon:true},
      {icon:'calendar-check',label:'تسجيل الوصول اليومي',sub:'احصلي على مكافأتك اليومية',href:'#/wallet',tone:'violet'},
      {icon:'user-plus',label:'دعوة الأصدقاء',sub:'شاركي رابط حسابك',href:'#/invite',tone:'violet',soon:true}
    ],
    [
      {icon:'target',label:'المهام',sub:'تحديات يومية وأسبوعية',href:'#/tasks',tone:'pink',soon:true},
      {icon:'chart-no-axes-column-increasing',label:'مستواي',sub:'نقاط الخبرة والتقدم',href:'#/me',tone:'gold'},
      {icon:'award',label:'الشارات والأوسمة',sub:'إنجازاتك ومقتنياتك',href:'#/me',tone:'violet'},
      {icon:'building-2',label:'مركز الوكالة',sub:'إدارة الوكالة والشحن والعمولات',href:'#/agency',tone:'gold'},
      {icon:'users-round',label:'العائلة',sub:'مجتمعك ومجموعتك',href:'#/family',tone:'pink',soon:true}
    ],
    [
      {icon:'users',label:'الأصدقاء والمتابعة',sub:'إدارة علاقاتك في همسات',href:'#/friends',tone:'violet'},
      {icon:'message-circle',label:'الرسائل الخاصة',sub:'محادثاتك مع الأصدقاء',href:'#/inbox',tone:'gold'},
      {icon:'bell',label:'الإشعارات',sub:'آخر التنبيهات والتحديثات',href:'#/notifications',tone:'pink'}
    ]
  ];
  const menu = menuGroups.map(group => `
    <div class="hs-account-group">
      ${group.map(item => `
        <a href="${item.href}" class="hs-account-row" ${item.soon?'data-coming-soon="1"':""}>
          <span class="hs-account-icon ${item.tone}"><i data-lucide="${item.icon}"></i></span>
          <span class="hs-account-copy"><b>${item.label}</b><small>${item.sub}</small></span>
          <i data-lucide="chevron-left" class="hs-account-chevron"></i>
        </a>`).join('')}
    </div>`).join('');
  screen.innerHTML = `
    <div class="hs-me-screen fade-in">
      <div class="hs-me-topbar"><span>H A M S A T</span><button type="button" id="switch-account" class="hs-switch-account"><i data-lucide="users"></i> تبديل الحساب</button></div>
      ${profileView(p, true)}
      <div class="hs-me-content">
        <div class="hs-me-balance">
          <div><small>محفظتي</small><b>${coin(18)} ${num(state.wallet?.balance)}</b></div>
          <a href="#/wallet">عرض المحفظة <i data-lucide="arrow-left"></i></a>
        </div>
        <div class="hs-me-section-title"><span>الخدمات والمزايا</span><small>كل عالم همسات في مكان واحد</small></div>
        ${menu}
        <button id="edit-profile" class="hs-account-row hs-edit-row">
          <span class="hs-account-icon gold"><i data-lucide="user-round-pen"></i></span>
          <span class="hs-account-copy"><b>تعديل الملف الشخصي</b><small>الصورة والاسم والنبذة والبيانات</small></span>
          <i data-lucide="chevron-left" class="hs-account-chevron"></i>
        </button>
        <button id="share-profile" class="hs-account-row hs-edit-row">
          <span class="hs-account-icon violet"><i data-lucide="share-2"></i></span>
          <span class="hs-account-copy"><b>مشاركة حسابي</b><small>انسخي اسم المستخدم لمشاركته</small></span>
          <i data-lucide="chevron-left" class="hs-account-chevron"></i>
        </button>
        <button id="logout" class="hs-logout"><i data-lucide="log-out"></i> تسجيل الخروج</button>
      </div>
    </div>`;
  icons_();
  loadProfileStats(p.uuid, false);
  loadProfileRewards(p.uuid,p);
  bindProfileSocial(p,true);
  const idCopy=$('[data-copy-public-id]');
  if(idCopy) idCopy.onclick=async()=>{try{await navigator.clipboard.writeText(p.publicId);toast('تم نسخ ID الخاص بك');}catch(e){toast(p.publicId);}};
  const editProfileAction = () => openSheet(`<h2 class="text-lg font-bold mb-2">تعديل الملف الشخصي</h2>${profileForm(p, false)}`, (s) => {
    bindProfileForm(s, () => { closeSheet(); toast('تم حفظ التغييرات'); render(); });
  });
  $('#edit-profile-inline')?.addEventListener('click',editProfileAction);
  $('#edit-profile-cover')?.addEventListener('click',editProfileAction);
  document.querySelectorAll('[data-profile-stat-go]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.profileStatGo;
    if(key==='visitors'){toast('قائمة الزوار التفصيلية قيد التجهيز');return;}
    location.hash='#/friends';
  }));
  document.querySelectorAll('[data-coming-soon]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();toast('هذه الخدمة قيد التجهيز وستُفعّل لاحقاً');}));
  $('#switch-account').onclick = () => openSheet(`<h2 class="text-lg font-bold mb-2">تبديل الحساب</h2><p class="text-sm text-[#bba9d6] mb-5">سيتم تسجيل خروجكِ لتتمكني من الدخول بحساب آخر. لن تُحذف بيانات حسابك.</p><div class="grid grid-cols-2 gap-3"><button data-close class="btn-ghost">إلغاء</button><button id="confirm-switch" class="btn-gold">متابعة</button></div>`,s=>s.querySelector('#confirm-switch').onclick=signOut);
  $('#logout').onclick = () => openSheet(`
    <h2 class="text-lg font-bold mb-2">تسجيل الخروج</h2>
    <p class="text-sm text-[#bba9d6] mb-5">هل أنت متأكد أنك تريد تسجيل الخروج من همسات؟ بياناتك محفوظة.</p>
    <div class="grid grid-cols-2 gap-3"><button data-close class="btn-ghost">إلغاء</button><button id="confirm-out" class="btn-danger">تسجيل الخروج</button></div>`,
    (s) => s.querySelector('#confirm-out').onclick = signOut);
  $('#edit-profile').onclick = editProfileAction;
  $('#share-profile').onclick = async () => {
    try { await navigator.clipboard.writeText('@' + p.handle); toast('تم النسخ'); } catch (e) { toast('@' + p.handle); }
  };
}

async function userScreen(handle) {
  if (handle === state.profile?.handle) { location.hash = '#/me'; return; }
  screen.innerHTML = header('الملف الشخصي', `<button onclick="history.back()" class="p-2 -ml-2"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>`) + `<div id="user-body">${loading()}</div>`;
  icons_();
  let profile;
  try {
    ({ profile } = await api.user(handle));
    if (profile?.uuid === state.profile?.uuid) { location.hash = '#/me'; return; }
    $('#user-body').innerHTML = `<div class="fade-in">${profileView(profile, false)}
      <div class="px-5 py-5 space-y-3">
        <div id="friend-actions" class="grid grid-cols-2 gap-2"><button id="friend-action" class="btn-ghost w-full">إضافة صديق</button><button id="follow-action" class="btn-gold w-full">متابعة</button></div>
        <button id="send-message" class="btn-ghost w-full"><i data-lucide="message-circle" class="w-5 h-5"></i>إرسال رسالة</button>
        <button id="send-gift" class="btn-gold w-full"><i data-lucide="gift" class="w-5 h-5"></i>إرسال هدية</button>
      </div></div>`;
  } catch (e) { $('#user-body').innerHTML = `<div class="p-5">${emptyBox('user-x', 'المستخدم غير موجود', e.message)}</div>`; }
  icons_();
  if (profile) { loadProfileStats(profile.uuid, true); loadProfileRewards(profile.uuid,profile); bindProfileSocial(profile,false); }
  const idCopy=$('[data-copy-public-id]');
  if(idCopy) idCopy.onclick=async()=>{try{await navigator.clipboard.writeText(profile.publicId);toast('تم نسخ ID المستخدم');}catch(e){toast(profile.publicId);}};

  if(profile){
    try{
      const status=await api.friendState(profile.uuid), req=status.request;
      const friendBtn=$('#friend-action'), followBtn=$('#follow-action');
      if(req?.status==='accepted') friendBtn.textContent='✓ صديق';
      else if(req?.status==='pending'&&req.sender_id===state.profile.uuid){friendBtn.textContent='تم إرسال الطلب';friendBtn.disabled=true;}
      else if(req?.status==='pending'&&req.receiver_id===state.profile.uuid){friendBtn.textContent='قبول طلب الصداقة';friendBtn.onclick=async()=>{try{await api.respondFriendRequest(req.id,true);toast('أصبحتم أصدقاء');userScreen(handle);}catch(e){toast(e.message,'error');}};}
      else friendBtn.onclick=async()=>{friendBtn.disabled=true;try{await api.sendFriendRequest(profile.uuid);friendBtn.textContent='تم إرسال الطلب';toast('تم إرسال طلب الصداقة');}catch(e){toast(e.message,'error');friendBtn.disabled=false;}};
      followBtn.textContent=status.following?'إلغاء المتابعة':'متابعة';
      followBtn.onclick=async()=>{try{if(status.following)await api.unfollowUser(profile.uuid);else await api.followUser(profile.uuid);toast(status.following?'تم إلغاء المتابعة':'بدأتِ متابعة هذا المستخدم');userScreen(handle);}catch(e){toast(e.message,'error');}};
    }catch(e){toast(e.message,'error');}
  }
  const messageButton = $('#send-message');
  if (messageButton) messageButton.onclick = async () => {
    try { const result = await api.startConversation(profile.uuid); location.hash = '#/dm/' + result.conversationId; }
    catch (err) { toast(err.message, 'error'); }
  };
  const giftButton = $('#send-gift');
  if (giftButton) giftButton.onclick = async () => {
    try {
      if (!state.gifts) state.gifts = (await api.gifts()).gifts;
      const options = state.gifts.map(g => `<option value="${esc(g.id)}">${esc(g.name)} — ${num(g.price)} عملة</option>`).join('');
      openSheet(`
        <h2 class="text-lg font-bold mb-2">إرسال هدية إلى ${esc(profile.displayName)}</h2>
        <p class="text-xs text-[#a993c8] mb-4">رصيدك الحالي: ${num(state.wallet?.balance)} عملة</p>
        <form id="gift-send-form" class="space-y-4">
          <div><label class="label">اختاري الهدية</label><select name="giftId" class="field">${options}</select></div>
          <div><label class="label">الكمية</label><input name="quantity" class="field" type="number" min="1" max="100" value="1" required></div>
          <button type="submit" class="btn-gold w-full"><i data-lucide="send" class="w-5 h-5"></i>تأكيد الإرسال</button>
        </form>`, sheet => {
          const form = sheet.querySelector('#gift-send-form');
          form.onsubmit = async e => {
            e.preventDefault();
            const button = form.querySelector('[type="submit"]');
            button.disabled = true;
            try {
              const values = Object.fromEntries(new FormData(form));
              await api.sendGift(profile.uuid, values.giftId, Number(values.quantity));
              state.wallet = (await api.wallet()).wallet;
              const sentGift = state.gifts.find(g => g.id === values.giftId);
              closeSheet();
              showGiftCelebration(sentGift, Number(values.quantity));
              toast('تم إرسال الهدية بنجاح');
              render();
            } catch (err) {
              toast(err.message, 'error');
              button.disabled = false;
            }
          };
        });
    } catch (err) { toast(err.message, 'error'); }
  };
}


async function friendsScreen(){
  screen.innerHTML=header('الأصدقاء والمتابعة')+`
    <div class="p-4 space-y-4 fade-in">
      <div class="card p-4"><h2 class="font-bold text-gold-300 mb-2">ابحثي عن الأعضاء</h2><input id="friend-search" class="field" placeholder="الاسم أو اسم المستخدم أو HAMSAT-ID..." autocomplete="off"><div id="friend-search-results" class="space-y-2 mt-3"></div></div>
      <section><div class="flex justify-between items-center mb-2"><h3 class="font-bold">طلبات الصداقة</h3><span id="friend-request-count" class="text-xs text-gold-300"></span></div><div id="friend-requests" class="space-y-2">${loading()}</div></section>
      <section><h3 class="font-bold mb-2">أصدقائي</h3><div id="friends-list" class="space-y-2">${loading()}</div></section>
    </div>`;
  icons_();
  const requestsRoot=$('#friend-requests'),friendsRoot=$('#friends-list'),searchRoot=$('#friend-search-results');
  try{
    const [requests,friends]=await Promise.all([api.friendRequests(),api.friends()]);
    $('#friend-request-count').textContent=requests.incoming.length+' واردة';
    requestsRoot.innerHTML=requests.incoming.length?requests.incoming.map(x=>`<div class="card p-3 flex items-center gap-2">${avatar(x.user,42)}<div class="flex-1 min-w-0"><b>${esc(x.user.displayName)}</b><small class="block text-xs opacity-70">@${esc(x.user.handle)} · ${esc(x.user.publicId || "")}</small></div><button class="btn-gold px-3 py-2 text-xs" data-accept="${esc(x.id)}">قبول</button><button class="btn-ghost px-3 py-2 text-xs" data-reject="${esc(x.id)}">رفض</button></div>`).join(''):'<p class="text-sm opacity-70 p-3">لا توجد طلبات جديدة.</p>';
    requestsRoot.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{try{await api.respondFriendRequest(b.dataset.accept,true);toast('تمت إضافة الصديق');friendsScreen();}catch(e){toast(e.message,'error');}});
    requestsRoot.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{try{await api.respondFriendRequest(b.dataset.reject,false);toast('تم رفض الطلب');friendsScreen();}catch(e){toast(e.message,'error');}});
    friendsRoot.innerHTML=friends.friends.length?friends.friends.map(u=>`<a href="#/u/${encodeURIComponent(u.publicId || u.handle)}" class="card p-3 flex items-center gap-3">${avatar(u,44)}<span class="flex-1 min-w-0"><b class="block">${esc(u.displayName)}</b><small class="opacity-70">@${esc(u.handle)}</small></span><span class="text-xs text-gold-300">عرض الملف ←</span></a>`).join(''):'<p class="text-sm opacity-70 p-3">لم تضيفي أصدقاء بعد. ابحثي عن شخص وابدئي بإرسال طلب.</p>';
  }catch(e){requestsRoot.innerHTML=emptyBox('wifi-off','تعذّر تحميل الطلبات',e.message);friendsRoot.innerHTML='';}
  let searchTimer;
  $('#friend-search').oninput=()=>{
    clearTimeout(searchTimer);const term=$('#friend-search').value.trim();
    if(term.length<2){searchRoot.innerHTML='';return;}
    searchTimer=setTimeout(async()=>{
      try{
        const {users}=await api.searchUsers(term);
        searchRoot.innerHTML=users.length?users.map(u=>`<div class="flex items-center gap-2 py-3 border-b border-white/5"><a class="flex items-center gap-3 flex-1 min-w-0 text-right" href="#/u/${encodeURIComponent(u.publicId || u.handle)}">${avatar(u,44)}<span class="min-w-0"><b class="block truncate">${esc(u.displayName || 'عضو جديد')}</b><small class="opacity-70 block truncate">${u.handle?'@'+esc(u.handle)+' · ':''}${esc(u.publicId || '')}</small><small class="text-gold-300">عرض الحساب</small></span></a><button class="btn-gold px-3 py-2 text-xs shrink-0" data-quick-add="${esc(u.uuid)}">إضافة صديق</button></div>`).join(''):'<p class="text-xs opacity-70">لم نعثر على مستخدم بهذا الاسم أو الرقم.</p>';
        searchRoot.querySelectorAll('[data-quick-add]').forEach(b=>b.onclick=async()=>{
          const targetId=b.dataset.quickAdd;
          b.disabled=true;
          try{
            const status=await api.friendState(targetId), req=status.request;
            if(req?.status==='accepted'){b.textContent='✓ صديق';return;}
            if(req?.status==='pending'&&req.sender_id===state.profile.uuid){b.textContent='تم الإرسال';return;}
            if(req?.status==='pending'&&req.receiver_id===state.profile.uuid){
              await api.respondFriendRequest(req.id,true);b.textContent='✓ صديق';toast('تم قبول طلب الصداقة');
            }else{
              await api.sendFriendRequest(targetId);b.textContent='تم إرسال الطلب';toast('تم إرسال طلب الصداقة');
            }
          }catch(e){toast(e.message,'error');b.disabled=false;}
        });
      }catch(e){searchRoot.innerHTML='<p class="text-xs text-red-300">'+esc(e.message)+'</p>';}
    },250);
  };
}

/* ---------- router ---------- */
async function inviteScreen() {
  const inviteUrl=location.origin+location.pathname+'#/u/'+encodeURIComponent(state.profile?.handle||'');
  screen.innerHTML=header('دعوة الأصدقاء')+`<section class="hs-coming-soon"><span><i data-lucide="user-plus"></i></span><h2>ادعي أصدقاءك إلى همسات</h2><p>شاركي رابط ملفك الشخصي حتى يتمكن أصدقاؤك من العثور عليك والانضمام إلى مجتمع HAMSAT.</p><button type="button" id="copy-invite-link" class="btn-gold">نسخ رابط الدعوة</button><small>نظام مكافآت الإحالة غير مفعّل حالياً.</small></section>`;
  icons_();
  $('#copy-invite-link').onclick=async()=>{try{await navigator.clipboard.writeText(inviteUrl);toast('تم نسخ رابط ملفك لمشاركته');}catch(e){toast(inviteUrl);}};
}
function comingSoonScreen(route) {
  const pages={moments:['لحظة','مساحة الصور واليوميات ومشاركة اللحظات مع المجتمع','images'],aristocracy:['الأرستقراطية VIP','عضويات كبار الشخصيات ومزاياها الحصرية','crown'],tasks:['المهام','التحديات اليومية والأسبوعية ومكافآت النشاط','target'],agency:['مركز الوكالة','إدارة المضيفين والوكلاء والتقارير','building-2'],family:['العائلة','مجتمعك ومجموعتك داخل همسات','users-round'],invite:['دعوة الأصدقاء','شاركي رابط ملفك وادعي أصدقاءك إلى همسات','user-plus']};
  const [title,description,icon]=pages[route]||['قريباً','هذه الميزة قيد التجهيز','sparkles'];
  screen.innerHTML=header(title)+`<section class="hs-coming-soon"><span><i data-lucide="${icon}"></i></span><h2>${title}</h2><p>${description}</p><small>نعمل على تجهيزها لتكون جزءاً من تجربة HAMSAT</small><a href="#/me" class="btn-gold">العودة إلى حسابي</a></section>`;
  icons_();
}
async function render() {
  closeSheet();
  if (!state.account) return welcomeScreen();
  if (!state.profile) return onboardingScreen();

  const [path, query] = (location.hash.slice(1) || '/home').split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  const route = parts[0] || 'home';

  closeSideMenu();
  tabbar.classList.remove('hidden');
  screen.className = 'flex-1 flex flex-col has-tabbar';
  tabbar.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === (route === 'inbox' ? 'chat' : route)));
  window.scrollTo(0, 0);

  try {


async function agencyScreen(){
  screen.innerHTML=header('مركز الوكالة')+'<div class="p-4" id="agency-root">'+loading()+'</div>';icons_();
  const root=$('#agency-root');
  try{
    const {agencies}=await api.myAgencies();
    if(!agencies.length){root.innerHTML=emptyBox('building-2','لا توجد وكالة مرتبطة بحسابك','إذا كنتِ صاحبة وكالة أو وكيلة، يجب أن تضيف الإدارة حسابك إلى الوكالة أولاً.');return;}
    const agency=agencies[0],role=agency.memberRole,canManage=role==='owner'||role==='manager',canRecharge=['owner','manager','agent'].includes(role)&&['recharge','both'].includes(agency.agency_type);
    const [finance,rechargeData,packageData,memberData]=await Promise.all([api.agencyFinance(agency.id,canManage),canRecharge?api.agencyRecharges(agency.id):Promise.resolve({recharges:[]}),api.topupPackages(),canManage?api.agencyMembers(agency.id):Promise.resolve({members:[]})]);
    const packages=packageData.packages||[],recharges=rechargeData.recharges||[],members=memberData.members||[];
    root.innerHTML='<div class="space-y-4">'+
      '<section class="card p-4"><div class="flex items-center justify-between gap-3"><div><small class="text-amber-300">HAMSAT AGENCY</small><h2 class="text-xl font-bold mt-1">'+esc(agency.name)+'</h2><p class="text-xs opacity-70 mt-1">'+(agency.agency_type==='recharge'?'وكالة شحن':agency.agency_type==='hosts'?'وكالة مضيفين':'وكالة شحن ومضيفين')+' · '+(role==='owner'?'المالكة':role==='manager'?'مديرة':role==='agent'?'وكيلة':'مضيفة')+'</p></div><span class="pill">'+esc(agency.status)+'</span></div></section>'+
      '<div class="grid grid-cols-2 gap-3">'+(canManage?'<div class="card p-3"><small>رصيد الوكالة</small><b class="block text-lg text-amber-300 mt-1">'+num(finance.agencyBalance||0)+' دج</b></div>':'')+'<div class="card p-3"><small>عمولتي</small><b class="block text-lg text-amber-300 mt-1">'+num(finance.agentBalance||0)+' دج</b></div></div>'+
      (canRecharge?'<section class="card p-4"><h3 class="font-bold mb-3">شحن لاعب عبر الوكالة</h3><form id="agency-recharge-form" class="space-y-3"><label class="block text-sm">المعرّف العام للاعب<input class="field mt-1" name="public_id" type="number" required placeholder="أدخلي ID اللاعب"></label><label class="block text-sm">باقة الشحن<select class="field mt-1" name="package_id" required>'+packages.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+num(p.coins)+' عملة · '+num(p.price_dzd)+' دج</option>').join('')+'</select></label><label class="block text-sm">طريقة استلام الدفع<input class="field mt-1" name="payment_method" required placeholder="نقداً أو طريقة الدفع المتفق عليها"></label><label class="block text-sm">مرجع/رقم الإيصال<input class="field mt-1" name="payment_reference" required minlength="4" placeholder="رقم الإيصال لمنع التكرار"></label><button class="btn-gold w-full" type="submit" '+(!packages.length?'disabled':'')+'>تأكيد الشحن وإضافة العملات</button><p class="text-[10px] opacity-60">لا تؤكدي العملية إلا بعد استلام المبلغ فعلياً. سيتم تسجيلها في سجل الوكالة ومحفظة اللاعب.</p></form></section>':'')+
      (canManage?'<section class="card p-4"><h3 class="font-bold mb-3">إضافة وكيل أو مضيف</h3><form id="agency-add-member-form" class="space-y-3"><label class="block text-sm">المعرّف العام للمستخدم<input class="field mt-1" name="public_id" type="number" required></label><label class="block text-sm">الدور<select class="field mt-1" name="role"><option value="agent">وكيل شحن</option><option value="host">مضيف</option><option value="support">دعم</option><option value="manager">مدير</option></select></label><button class="btn w-full" type="submit">إضافة العضو</button></form><div class="mt-3 space-y-2">'+members.map(m=>'<div class="item"><div><b>'+esc(m.profile?.display_name||m.profile?.handle||'عضو')+'</b><p class="text-xs opacity-60">#'+esc(m.profile?.public_id||'—')+' · '+esc(m.member_role)+'</p></div>'+(m.member_role==='owner'?'':'<button type="button" class="ghost text-xs" data-agency-remove="'+esc(m.profile?.public_id||'')+'">إزالة</button>')+'</div>').join('')+'</div></section>':'')+
      '<section class="card p-4"><h3 class="font-bold mb-3">آخر عمليات الشحن</h3><div class="space-y-2">'+(recharges.length?recharges.map(x=>'<div class="item"><div><b>'+num(x.coins)+' عملة</b><p class="text-xs opacity-70">اللاعب #'+esc(x.target?.public_id||'—')+' · '+num(x.price_dzd)+' دج · '+esc(x.payment_method)+'</p><small class="opacity-50">'+timeAgo(new Date(x.created_at).getTime())+'</small></div><span class="pill">مكتملة</span></div>').join(''):'<p class="text-xs opacity-60">لا توجد عمليات شحن بعد.</p>')+'</div></section>'+
      (agency.agency_type==='hosts'||agency.agency_type==='both'?'<section class="card p-4"><h3 class="font-bold">إدارة المضيفين</h3><p class="text-xs opacity-70 mt-2">تم تجهيز عضوية المضيفين داخل الوكالة. متابعة ساعات البث والأرباح الأسبوعية ستُربط بعد استكمال تسجيل جلسات الصوت واختبارها.</p></section>':'')+
      '</div>';
    const rechargeForm=$('#agency-recharge-form');if(rechargeForm)rechargeForm.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const result=await api.agentRechargeUser(agency.id,Number(f.elements.public_id.value),f.elements.package_id.value,f.elements.payment_method.value.trim(),f.elements.payment_reference.value.trim());toast('تم شحن '+num(result.coins)+' عملة بنجاح');await agencyScreen();}catch(err){toast(err.message,'error');}finally{b.disabled=false;}};
    const memberForm=$('#agency-add-member-form');if(memberForm)memberForm.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{await api.agencyAddMember(agency.id,Number(f.elements.public_id.value),f.elements.role.value);toast('تمت إضافة العضو');await agencyScreen();}catch(err){toast(err.message,'error');}finally{b.disabled=false;}};
    root.querySelectorAll('[data-agency-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('هل تريدين إزالة هذا العضو من الوكالة؟'))return;try{await api.agencyRemoveMember(agency.id,Number(b.dataset.agencyRemove));toast('تمت إزالة العضو');await agencyScreen();}catch(err){toast(err.message,'error');}});
  }catch(e){root.innerHTML=emptyBox('triangle-alert','تعذّر تحميل مركز الوكالة',e.message);}
}
async function notificationsScreen() {
  screen.innerHTML = header('الإشعارات', '<button id="read-all" class="text-xs text-amber-300">تحديد الكل كمقروء</button>') + `<div class="p-4 space-y-3" id="notifications-list">${loading()}</div>`;
  icons_();
  const {notifications}=await api.notifications(), root=$('#notifications-list');
  root.innerHTML=notifications.length?notifications.map(n=>`
    <a href="${esc(n.target_url||'#/home')}" data-notification="${esc(n.id)}" class="card p-3 flex gap-3 items-start ${n.read_at?'opacity-70':'border border-amber-400/40'}">
      <span class="w-10 h-10 rounded-full bg-[#302713] text-amber-300 flex items-center justify-center"><i data-lucide="${n.type==='gift'?'gift':n.type==='message'?'message-circle':'bell'}"></i></span>
      <span class="flex-1 min-w-0"><b class="block">${esc(n.title)}</b><span class="block text-sm text-[#bba9d6]">${esc(n.body||'')}</span><small class="text-[10px] opacity-60">${timeAgo(new Date(n.created_at).getTime())}</small></span>
      ${n.read_at?'':'<span class="w-2 h-2 rounded-full bg-amber-400 mt-2"></span>'}
    </a>`).join(''):emptyBox('bell','لا توجد إشعارات','ستظهر هنا رسائل الأعضاء والهدايا الجديدة.');
  root.querySelectorAll('[data-notification]').forEach(el=>el.addEventListener('click',()=>api.markNotificationRead(el.dataset.notification).catch(()=>{})));
  $('#read-all').onclick=async()=>{try{await api.markAllNotificationsRead();await notificationsScreen();}catch(e){toast(e.message,'error');}};
  icons_();
}

async function inboxScreen() {
  screen.innerHTML = header('الرسائل الخاصة', '<a href="#/friends" class="text-xs text-gold-300">اكتشاف الأعضاء</a>') + `
    <div class="hs-inbox-page"><div class="hs-inbox-intro"><span>HAMSAT · PRIVATE</span><h2>مساحتك الخاصة للحديث</h2><p>محادثاتك تبقى بينك وبين الشخص الذي تراسلينه، بعيداً عن الغرف.</p></div><div id="inbox-list" class="hs-inbox-list">${loading()}</div></div>`;
  icons_();
  try {
    const { conversations } = await api.conversations();
    const root = $('#inbox-list');
    root.innerHTML = conversations.length ? conversations.map(c => `
      <a href="#/dm/${encodeURIComponent(c.id)}" class="hs-inbox-row">
        ${avatar(c.other,52)}
        <div class="min-w-0 flex-1"><div class="hs-inbox-name">${esc(c.other.displayName || c.other.handle)}</div>
        <div class="hs-inbox-preview">${esc(c.lastMessage || 'ابدئي المحادثة')}</div></div>
        <div class="hs-inbox-trailing">${c.unread ? `<span>${num(c.unread)}</span>` : ''}<small>${timeAgo(new Date(c.updatedAt).getTime())}</small></div>
      </a>`).join('') : emptyBox('message-circle','لا توجد محادثات بعد','افتحي ملف أي عضو واضغطي «رسالة خاصة» لبدء محادثة لا يراها الآخرون.');
    icons_();
  } catch(e) { $('#inbox-list').innerHTML=emptyBox('wifi-off','تعذّر تحميل المحادثات',e.message); }
}
async function directMessageScreen(conversationId) {
  let conversation=null;
  try { const list=await api.conversations(); conversation=list.conversations.find(c=>String(c.id)===String(conversationId))||null; } catch(e) { toast(e.message,'error'); }
  const person=conversation?.other;
  screen.innerHTML = header(person?.displayName || 'محادثة خاصة', '<a href="#/inbox" class="text-xs text-gold-300">كل الرسائل</a>') + `
    <div class="hs-dm-page"><div class="hs-dm-person">${person?avatar(person,48):'<span class="hs-dm-avatar">✦</span>'}<div><b>${esc(person?.displayName||'محادثة خاصة')}</b><small>محادثة خاصة · خارج الغرف</small></div></div>
      <div id="dm-messages" class="hs-dm-messages">${loading()}</div>
      <form id="dm-form" class="hs-dm-compose"><input name="body" maxlength="2000" placeholder="اكتبي رسالتك هنا..." autocomplete="off" required><button type="submit" aria-label="إرسال"><i data-lucide="send"></i></button></form>
    </div>`;
  icons_();
  const root=$('#dm-messages'), form=$('#dm-form');
  const draw=async()=>{const {messages}=await api.directMessages(conversationId);root.innerHTML=messages.map(m=>`<div class="hs-dm-line ${m.sender_id===state.account.id?'mine':'theirs'}"><div class="hs-dm-bubble">${esc(m.body)}<small>${timeAgo(new Date(m.created_at).getTime())}${m.sender_id===state.account.id?(m.read_at?' · تمت القراءة':' · تم الإرسال'):''}</small></div></div>`).join('')||'<div class="hs-dm-empty"><span>✧</span><b>أول رسالة بينكما</b><small>ابدئي الحديث، وستظهر الردود هنا مباشرة.</small></div>';root.scrollTop=root.scrollHeight;};
  await draw();
  const channel=api.subscribeDirectMessages(conversationId,()=>draw().catch(e=>toast(e.message,'error')));
  form.onsubmit=async e=>{e.preventDefault();const input=form.elements.body,button=form.querySelector('button');button.disabled=true;try{await api.sendDirectMessage(conversationId,input.value);input.value='';await draw();}catch(err){toast(err.message,'error');}finally{button.disabled=false;input.focus();}};
  window.addEventListener('hashchange',()=>api.unsubscribeRoomChannel(channel),{once:true});
}

    if (route === 'notifications') await notificationsScreen();
    else if (route === 'games') await gamesScreen();
    else if (route === 'inbox') await inboxScreen();
    else if (route === 'friends') await friendsScreen();
    else if (route === 'dm' && parts[1]) await directMessageScreen(decodeURIComponent(parts[1]));
    else if (route === 'rooms') await roomsScreen(params);
    else if (route === 'gifts') await giftsScreen();
    else if (route === 'shop') await shopScreen();
    else if (route === 'wallet') await walletScreen();
    else if (route === 'me') meScreen();
    else if (route === 'invite') await inviteScreen();
    else if (route === 'moments') { meScreen(); document.querySelector('[data-profile-tab="moments"]')?.click(); }
    else if (route === 'agency') await agencyScreen();
    else if (['aristocracy','tasks','family'].includes(route)) comingSoonScreen(route);
    else if (route === 'u' && parts[1]) await userScreen(decodeURIComponent(parts[1]));
    else await homeScreen();
  } catch (e) {
    screen.innerHTML = `<div class="p-5">${emptyBox('triangle-alert', 'حدث خطأ', e.message)}</div>`;
    icons_();
  }
}

function dismissHamsatSplash() {
  const splash = document.getElementById('hamsat-splash');
  if (!splash || splash.dataset.dismissed) return;
  splash.dataset.dismissed = '1';
  splash.classList.add('splash-hide');
  window.setTimeout(() => splash.remove(), 750);
}

async function boot() {
  icons_();
  window.setTimeout(dismissHamsatSplash, 2300);
  if (passwordRecoveryActive) {
    resetPasswordScreen();
    return;
  }
  screen.innerHTML = loading();
  try {
    const session = await api.getSession();
    // Supabase can complete the recovery exchange while getSession/loadMe is pending.
    // Never let the normal authenticated router replace the password form.
    if (passwordRecoveryActive) {
      resetPasswordScreen();
      return;
    }
    if (!session) {
      state.account = state.profile = state.wallet = null;
      return render();
    }
    await loadMe();
    if (passwordRecoveryActive) {
      resetPasswordScreen();
      return;
    }
    await render();
  } catch (e) {
    state.account = state.profile = state.wallet = null;
    screen.innerHTML = `<div class="flex-1 flex flex-col items-center justify-center p-8 text-center">${emptyBox('wifi-off', 'تعذّر الاتصال بخدمة همسات', e.message || 'تحققي من إعداد Supabase واتصال الإنترنت.') }<button id="retry" class="btn-gold mt-4">إعادة المحاولة</button></div>`;
    icons_(); $('#retry').onclick = boot;
  }
}

window.addEventListener('hashchange', () => { if (!passwordRecoveryActive && state.account) render(); });
// Supabase may finish the email recovery callback after the initial page boot.
api.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    passwordRecoveryActive = true;
    resetPasswordScreen();
  }
});
boot();
