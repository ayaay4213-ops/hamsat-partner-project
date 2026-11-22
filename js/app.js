import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
import { api } from './api.js?v=20261121-room-bomb-stack-v2';
import { createVoiceRoom } from './voice-room.js?v=20261116-room-controls-v3';

const $ = (s, r = document) => r.querySelector(s);
const screen = $('#screen');
const tabbar = $('#tabbar');

const state = { isAdmin: false, account: null, profile: null, wallet: null, gifts: null, roomChannel: null, roomEventChannel: null, roomBombTimer: null, roomSeatTimer: null, hostSessionId: null, hostSessionTimer: null, activeRoomId: null, voiceRoom: null, roomMinimized: false, minimizedRoom: null };

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
  const profileHandle = p?.handle ? ` data-profile-handle="${esc(p.handle)}"` : '';
  const style = `width:${size}px;height:${size}px;background:${esc(p?.color || '#5b3a85')};font-size:${Math.round(size * 0.42)}px`;
  const equippedFrame = String(p?.equippedProfileFrameId || p?.equippedFrameId || '').toLowerCase();
  const frameStyle = /diamond|empress|crystal|ice/.test(equippedFrame) ? 'diamond' : /neon|gamer/.test(equippedFrame) ? 'neon' : /moon|celestial/.test(equippedFrame) ? 'moon' : /cat|kawaii/.test(equippedFrame) ? 'cat' : /rose|heart|butterfly/.test(equippedFrame) ? 'rose' : /gold|royal|crown|midnight/.test(equippedFrame) ? 'royal' : '';
  const frameClass = frameStyle ? ' frame-' + frameStyle : '';
  const frameOverlay = p?.equippedProfileFrameUrl ? `<img class="avatar-frame-overlay" src="${esc(p.equippedProfileFrameUrl)}" alt="" aria-hidden="true" loading="lazy">` : '';
  return p?.avatarUrl
    ? `<div class="avatar avatar-photo${frameClass}"${profileHandle} style="${style}"><img src="${esc(p.avatarUrl)}" alt="${esc(p.displayName || 'الصورة الشخصية')}" loading="lazy">${frameOverlay}</div>`
    : `<div class="avatar${frameClass}"${profileHandle} style="${style}">${initial(p?.displayName)}${frameOverlay}</div>`;
}
document.addEventListener('click', event => {
  const target = event.target.closest('.avatar[data-profile-handle]');
  if (!target) return;
  if (target.closest('.hs-gift-recipient')) return;
  const handle = target.dataset.profileHandle;
  if (!handle) return;
  event.preventDefault();
  event.stopPropagation();
  location.hash = '#/u/' + encodeURIComponent(handle);
}, true);

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
async function openSideMenu() {
  const root = $('#side-drawer-root'); if (!root) return;
  // Show the Super Admin entry only after the database confirms the fixed owner identity.
  const showAdmin = state.account ? await api.isAdmin().catch(() => false) : false;
  root.innerHTML = `<button class="side-drawer-backdrop" aria-label="إغلاق القائمة"></button><aside class="side-drawer" dir="rtl">
    <div class="side-drawer-brand"><span>H A M S A T</span><strong>HAMSAT ✦</strong><small>مساحتك للتواصل واللقاء</small></div>
    <nav class="side-drawer-links"><a href="#/home"><i data-lucide="house"></i>الرئيسية</a><a href="#/recent-rooms"><i data-lucide="history"></i>غرفي الأخيرة</a><a href="#/inbox"><i data-lucide="message-circle"></i>الرسائل الخاصة</a><a href="#/friends"><i data-lucide="users"></i>الأصدقاء والمتابعة</a><a href="#/notifications"><i data-lucide="bell"></i>الإشعارات</a><a href="#/gifts"><i data-lucide="gift"></i>الهدايا</a><a href="#/games"><i data-lucide="gamepad-2"></i>الألعاب</a><a href="#/shop"><i data-lucide="gem"></i>المتجر والمقتنيات</a><a href="#/wallet"><i data-lucide="wallet"></i>المحفظة</a><a href="#/me"><i data-lucide="user-round"></i>حسابي</a>${showAdmin ? '<a href="admin.html"><i data-lucide="shield"></i>لوحة الإدارة</a>' : ''}</nav>
    <p class="side-drawer-note">همسات · تواصل بأمان واحترام</p></aside>`;
  root.querySelector('.side-drawer-backdrop').onclick = closeSideMenu;
  root.querySelectorAll('a').forEach(a => a.onclick = closeSideMenu); icons_();
}
function closeSideMenu() { const root=$('#side-drawer-root'); if(root) root.innerHTML=''; }
function menuButton() { return state.isAdmin ? `<button type="button" class="menu-button" aria-label="القائمة" onclick="window.hamsatOpenMenu()"><i data-lucide="menu"></i></button>` : ''; }
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
function closeSheet(force = false) { if (state.roomGameTimer) { clearInterval(state.roomGameTimer); state.roomGameTimer = null; } if (state.roomMinimized && !force) { if (state.roomSeatTimer) { clearInterval(state.roomSeatTimer); state.roomSeatTimer = null; } $('#sheet-root').innerHTML = ''; return; } if (force) { state.roomMinimized = false; state.minimizedRoom = null; $('#room-mini-root').innerHTML = ''; } if (state.voiceRoom) { const voice=state.voiceRoom; state.voiceRoom=null; voice.leave().catch(e=>console.warn('Could not stop room audio',e)); } if (state.roomChannel) { api.unsubscribeRoomChannel(state.roomChannel); state.roomChannel = null; } if (state.roomEventChannel) { api.unsubscribeRoomChannel(state.roomEventChannel); state.roomEventChannel = null; } if (state.roomBombTimer) { clearInterval(state.roomBombTimer); state.roomBombTimer = null; } if (state.roomSeatTimer) { clearInterval(state.roomSeatTimer); state.roomSeatTimer = null; } if (state.hostSessionTimer) { clearInterval(state.hostSessionTimer); state.hostSessionTimer = null; } if (state.hostSessionId) { const sessionId=state.hostSessionId; state.hostSessionId=null; api.hostEndSession(sessionId).catch(e=>console.warn('Could not close host session',e)); } if (state.activeRoomId) { const id=state.activeRoomId; state.activeRoomId=null; api.leaveRoom(id).catch(e=>console.warn('Could not leave room',e)); } $('#sheet-root').innerHTML = ''; }

function renderRoomMiniBubble() {
  const root = $('#room-mini-root');
  if (!root) return;
  const room = state.minimizedRoom;
  if (!state.roomMinimized || !room) { root.innerHTML = ''; return; }
  root.innerHTML = `<div class="hs-room-mini-bubble" role="region" aria-label="الغرفة الصوتية المصغرة">
    <button type="button" id="room-mini-resume" class="hs-room-mini-resume" aria-label="العودة إلى الغرفة">
      <span class="hs-room-mini-icon"><i data-lucide="audio-lines"></i><em></em></span>
      <span class="sr-only">${esc(room.title || 'غرفة همسات')} — الصوت مستمر</span>
    </button>
    <button type="button" id="room-mini-exit" class="hs-room-mini-exit" aria-label="مغادرة الغرفة" title="مغادرة الغرفة"><i data-lucide="log-out"></i></button>
  </div>`;
  $('#room-mini-resume').onclick = async () => {
    const current = state.minimizedRoom;
    state.roomMinimized = false;
    state.minimizedRoom = null;
    root.innerHTML = '';
    if (state.roomChannel) { await api.unsubscribeRoomChannel(state.roomChannel); state.roomChannel = null; }
    if (state.roomEventChannel) { await api.unsubscribeRoomChannel(state.roomEventChannel); state.roomEventChannel = null; }
    if (state.roomBombTimer) { clearInterval(state.roomBombTimer); state.roomBombTimer = null; }
    await openRoom(current);
  };
  $('#room-mini-exit').onclick = async () => {
    const current = state.minimizedRoom;
    if (!current || !confirm('هل تريدين مغادرة الغرفة وإيقاف الاتصال الصوتي؟')) return;
    state.roomMinimized = false;
    state.minimizedRoom = null;
    root.innerHTML = '';
    closeSheet(true);
    toast('غادرتِ الغرفة الصوتية.');
  };
  icons_();
}

/* ---------- auth ---------- */
async function signOut() {
  closeSheet(true);
  try { await api.signOut(); } catch (e) { toast(e.message, 'error'); return; }
  state.account = state.profile = state.wallet = null;
  state.isAdmin = false;
  location.hash = '#/home';
  await render();
}

async function loadMe() {
  const data = await api.me();
  state.account = data.account;
  state.profile = data.profile;
  state.wallet = data.wallet;
  state.isAdmin = await api.isAdmin().catch(() => false);
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
        <button type="button" data-method="phone" class="auth-method active">رقم الهاتف</button>
        <button type="button" data-method="email" class="auth-method">البريد الإلكتروني</button>
      </div>
      <form id="auth-preview-form" class="space-y-3">
        <label class="label" id="auth-id-label">البريد الإلكتروني</label>
        <input id="auth-identity" class="field" type="email" autocomplete="email" dir="ltr" placeholder="name@example.com" required>
        <div id="auth-password-fields" class="space-y-3"><label class="label" id="auth-password-label">كلمة المرور</label>
        <div class="password-tools" data-password-tools><input id="auth-password" class="field" type="password" autocomplete="current-password" placeholder="أدخلي كلمة المرور" required><button type="button" data-password-toggle aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور"><i data-lucide="eye"></i></button><button type="button" data-password-copy aria-label="نسخ كلمة المرور" title="نسخ كلمة المرور"><i data-lucide="copy"></i></button></div>
        <div id="auth-password-rules" class="hidden rounded-xl border border-gold-600/30 bg-ink-800/70 p-3 text-xs leading-6 text-[#cbb9a6]">لإنشاء حساب، يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل، وحرف إنجليزي صغير وحرف كبير ورقم ورمز خاص مثل @ أو # أو !</div></div>
        <div id="auth-otp-field" class="hidden"><label class="label" for="auth-otp-code">رمز التحقق المرسل برسالة SMS</label><input id="auth-otp-code" class="field" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" dir="ltr" placeholder="000000"></div>
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
  const passwordFields = $('#auth-password-fields');
  const identityLabel = $('#auth-id-label');
  const otpField = $('#auth-otp-field');
  let authMethod = 'phone', pendingPhone = null;
  wirePasswordTools(screen);
  const forgot = $('#auth-forgot');
  const showFeedback = (message, isError = false) => {
    feedback.textContent = message;
    feedback.className = 'text-xs leading-6 mt-3 rounded-xl p-3 ' + (isError
      ? 'border border-red-500/30 bg-red-950/30 text-red-200'
      : 'border border-gold-600/30 bg-ink-800/70 text-[#e7d8a8]');
    feedback.classList.remove('hidden');
  };
  const clearFeedback = () => { feedback.textContent = ''; feedback.classList.add('hidden'); };
  const syncAuthMode = () => {
    const phoneMode = authMethod === 'phone';
    const signingUp = authMode === 'signup' && !phoneMode;
    submit.innerHTML = phoneMode ? (pendingPhone ? '<i data-lucide="shield-check" class="w-5 h-5"></i>تحقق من الرمز' : '<i data-lucide="message-square" class="w-5 h-5"></i>إرسال رمز SMS') : (signingUp ? '<i data-lucide="user-plus" class="w-5 h-5"></i>إنشاء الحساب' : '<i data-lucide="log-in" class="w-5 h-5"></i>تسجيل الدخول');
    create.textContent = signingUp ? 'لديك حساب؟ تسجيل الدخول' : 'إنشاء حساب جديد';
    create.classList.toggle('hidden', phoneMode);
    forgot.classList.toggle('hidden', signingUp || phoneMode);
    passwordFields.classList.toggle('hidden', phoneMode || !!pendingPhone);
    otpField.classList.toggle('hidden', !phoneMode || !pendingPhone);
    identityLabel.classList.toggle('hidden', phoneMode && !!pendingPhone);
    identity.classList.toggle('hidden', phoneMode && !!pendingPhone);
    identity.type = phoneMode ? 'tel' : 'email';
    identity.autocomplete = phoneMode ? 'tel' : 'email';
    identity.placeholder = phoneMode ? '+213XXXXXXXXX' : 'name@example.com';
    identity.dir = phoneMode ? 'ltr' : 'ltr';
    identity.required = !(phoneMode && !!pendingPhone);
    passwordInput.required = !phoneMode;
    passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
    passwordInput.setAttribute('aria-describedby', signingUp ? 'auth-password-rules' : '');
    rules.classList.toggle('hidden', !signingUp);
    clearFeedback();
    icons_();
  };
  screen.querySelectorAll('[data-method]').forEach(button => button.onclick = () => {
    authMethod = button.dataset.method;
    authMode = 'signin'; pendingPhone = null;
    identity.value = ''; identity.readOnly = false;
    const code = $('#auth-otp-code'); if(code) code.value = '';
    screen.querySelectorAll('[data-method]').forEach(x=>x.classList.toggle('active',x===button));
    syncAuthMode();
  });
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
    if (authMethod === 'phone') {
      submit.disabled = true; clearFeedback();
      try {
        if (!pendingPhone) {
          let phone = identity.value.trim().replace(/[\s().-]/g, '');
          if (/^0\d{9}$/.test(phone)) phone = '+213' + phone.slice(1);
          else if (/^213\d{9}$/.test(phone)) phone = '+' + phone;
          if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('اكتبي الرقم بالصيغة الدولية، مثال الجزائر +213XXXXXXXXX.');
          await api.sendPhoneOtp(phone); pendingPhone = phone; identity.readOnly = true; syncAuthMode();
          showFeedback('أرسلنا رمز التحقق إلى الرقم المدخل. أدخلي الرمز المكوّن من 6 أرقام.');
        } else {
          await api.verifyPhoneOtp(pendingPhone, $('#auth-otp-code').value);
          toast('تم التحقق من الهاتف وتسجيل الدخول.'); await boot();
        }
      } catch(err) { showFeedback(err.message || 'تعذر إكمال التحقق. حاولي مجدداً.', true); }
      finally { submit.disabled = false; }
      return;
    }
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
          showFeedback('تم إنشاء الحساب. تحققي من بريدك الإلكتروني وافتحي رابط التأكيد المرسل إليكِ، ثم عودي لتسجيل الدخول. افحصي الرسائل غير المرغوب فيها إذا لم تجدي الرسالة.', false);
        }
      }
    } catch (err) {
      const message = String(err?.message || '');
      if (/password.*(weak|contain|character)|weak password/i.test(message)) {
        showFeedback('كلمة المرور لا تحقق شروط الأمان. استخدمي 8 أحرف على الأقل مع حرف صغير وكبير ورقم ورمز خاص.', true);
      } else if (/email not confirmed/i.test(message)) {
        showFeedback('لم يتم تأكيد البريد الإلكتروني بعد. افتحي رسالة التأكيد المرسلة إليكِ، ثم أعيدي تسجيل الدخول.', true);
      } else if (/invalid login credentials/i.test(message)) {
        showFeedback('البريد أو كلمة المرور غير صحيحة. تأكدي من كتابتهما كما عند إنشاء الحساب.', true);
      } else {
        showFeedback(message || 'تعذّر إكمال العملية. حاولي مرة أخرى.', true);
      }
    } finally { submit.disabled = false; }
  };
  syncAuthMode();
}

function profileForm(p = {}, isNew = true) {
  const color = p.color || COLORS[0];
  return `
  <form id="profile-form" class="space-y-4">
    <div class="flex flex-col items-center gap-3 pb-2">
      <div id="pf-avatar">${avatar({ displayName: p.displayName || 'ه', color, avatarUrl: p.avatarUrl }, 76)}</div>
      <label class="photo-picker"><i data-lucide="camera"></i><span>اختيار صورة من الهاتف</span><input type="file" name="avatarFile" accept="image/*" hidden></label>
      <input type="hidden" name="avatarUrl" value="${esc(p.avatarUrl || '')}">
      <div class="profile-media-fields card p-3 space-y-3">
        <div><label class="label">غلاف الملف الشخصي</label><label class="photo-picker"><i data-lucide="image"></i><span>اختيار صورة غلاف</span><input type="file" name="coverFile" accept="image/*" hidden></label><input type="hidden" name="coverUrl" value="${esc(p.coverUrl || '')}"></div>
        <div><label class="label">خلفية ملفي الشخصي</label><label class="photo-picker"><i data-lucide="palette"></i><span>اختيار خلفية من الهاتف</span><input type="file" name="backgroundFile" accept="image/*" hidden></label><input type="hidden" name="backgroundUrl" value="${esc(p.backgroundUrl || '')}"></div>
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

async function homeScreen(params = new URLSearchParams()) {
  screen.innerHTML = header('الرئيسية', '<button id="new-room" class="btn-gold text-sm py-2 px-3"><i data-lucide="plus" class="w-4 h-4"></i>إنشاء غرفة</button>') + `
    <div class="px-4 pt-4 pb-6 fade-in">
      <a href="#/activities" class="hs-weekly-banner mb-3" aria-label="استكشفي فعاليات همسات الأسبوعية">
        <div><small>HAMSAT · WEEKLY EVENTS</small><strong>نجوم همسات</strong><span>فعاليات، تحديات، وغرف مميزة بانتظارك</span><em class="hs-banner-action">اكتشفي الأنشطة <i data-lucide="arrow-left"></i></em></div><i data-lucide="crown"></i>
      </a>
      <div class="hs-home-categories mb-4">
        <a href="#/family"><i data-lucide="users-round"></i><span>عائلة</span></a>
        <a href="#/family"><i data-lucide="gem"></i><span>قائمة CP</span></a>
        <a href="#/me"><i data-lucide="trophy"></i><span>كارزما</span></a>
      </div>
      <div class="flex items-center justify-between mb-2"><span class="text-sm font-bold">الغرف الصوتية</span><span id="rooms-real-count" class="text-xs text-gold-300">—</span></div>
      <div id="filters" class="flex gap-2 overflow-x-auto no-scrollbar pb-3">
        ${['الكل', ...TOPICS].map(t => `<button data-t="${esc(t)}" class="chip ${t === roomFilter ? 'active' : ''}">${esc(t)}</button>`).join('')}
      </div>
      <div id="rooms-list" class="hs-home-room-list space-y-3 pt-1 pb-6"><div class="skeleton h-40"></div></div>
    </div>`;
  icons_();
  const roomAction = $('#new-room');
  if (roomAction) roomAction.onclick = newRoomSheet;
  if (params.get('new')) {
    history.replaceState(null, '', '#/home');
    newRoomSheet();
  }
  let rooms = [];
  const draw = () => {
    const list = roomFilter === 'الكل' ? rooms : rooms.filter(r => r.topic === roomFilter);
    const el = $('#rooms-list');
    if (!el) return;
    el.innerHTML = list.length ? list.map(roomCard).join('') : emptyBox('mic-off', 'لا توجد غرف في هذا التصنيف', 'يمكنك اختيار تصنيف آخر أو إنشاء غرفة جديدة');
    bindRoomCards(el, list);
    const badge = $('#rooms-real-count');
    if (badge) badge.textContent = num(list.length) + ' غرفة';
    icons_();
  };
  $('#filters').querySelectorAll('[data-t]').forEach(button => button.onclick = () => {
    roomFilter = button.dataset.t;
    $('#filters').querySelectorAll('.chip').forEach(chip => chip.classList.toggle('active', chip === button));
    draw();
  });
  try {
    rooms = (await api.rooms()).rooms || [];
    const ownRoom = rooms.find(room => String(room.ownerUuid || '').toLowerCase() === String(state.profile?.uuid || state.account?.id || '').toLowerCase());
    if (ownRoom && roomAction) {
      roomAction.innerHTML = '<i data-lucide="door-open" class="w-4 h-4"></i> دخول إلى غرفتك';
      roomAction.onclick = () => openRoom(ownRoom);
      icons_();
    }
    draw();
    const inviteId = params.get('invite');
    if (inviteId) {
      const { room } = await api.roomById(inviteId);
      history.replaceState(null, '', location.pathname + location.search + '#/home');
      openRoom(room);
    }
  } catch (error) {
    const el = $('#rooms-list');
    if (el) el.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الغرف', error.message || 'حاولي مرة أخرى');
    icons_();
  }
}
function emptyBox(icon, title, sub = '') {
  return `<div class="card p-6 text-center"><i data-lucide="${icon}" class="w-8 h-8 mx-auto text-ink-500 mb-3"></i><p class="font-bold text-sm">${esc(title)}</p>${sub ? `<p class="text-xs text-[#8a76a8] mt-1">${esc(sub)}</p>` : ''}</div>`;
}

function roomCard(r) {
  return `<button data-room="${esc(r.id)}" class="room-card card w-full text-right overflow-hidden transition" aria-label="دخول غرفة ${esc(r.title)}">
    <div class="room-cover" ${r.coverUrl ? `style="background-image:url('${esc(r.coverUrl)}');background-size:cover;background-position:center"` : ''}>
      <div class="room-cover-glow"></div>
      <span class="room-cover-tag"><i data-lucide="users" class="w-3.5 h-3.5"></i> غرفة عامة</span>
      <span class="room-cover-symbol"><i data-lucide="audio-lines" class="w-10 h-10"></i></span>
      <span class="room-cover-topic">${esc(r.topic)}</span>
    </div>
    <div class="room-card-body">
      <div class="room-card-title-row">
        <p class="font-extrabold text-[15px] truncate">${esc(r.title)}</p>
        <span class="room-enter" aria-hidden="true"><i data-lucide="log-in"></i></span>
      </div>
    </div>
  </button>`;
}
function bindRoomCards(root, rooms) {
  root.querySelectorAll('[data-room]').forEach(b => b.onclick = () => openRoom(rooms.find(r => r.id === b.dataset.room)));
}

async function openRoom(r) {
  if (!r) return;

  const isRoomOwner = String(r.ownerUuid || '').toLowerCase() === String(state.profile?.uuid || state.account?.id || '').toLowerCase();
  let roomSeatLayout = ['grid','one-top','two-top'].includes(r.seatLayout) ? r.seatLayout : 'grid';
  openSheet(`
    <div class="hs-room-canvas">
    <div class="hs-room-head">
      <div class="hs-room-cover" style="${r.coverUrl ? `background-image:linear-gradient(180deg,#08090a22,#08090add),url(${JSON.stringify(r.coverUrl)})` : ''}">
        <div class="hs-room-head-row">
          <button type="button" class="hs-room-close" data-close aria-label="إغلاق الغرفة"><i data-lucide="power"></i></button>
          <button type="button" id="room-minimize" class="hs-room-close hs-room-minimize" aria-label="تصغير والاحتفاظ بالغرفة"><i data-lucide="minimize-2"></i></button>
          <span class="hs-room-state" aria-label="مباشر" title="مباشر"><i></i></span>
        </div><button type="button" id="room-bomb-floating" class="hs-room-bomb-floating" aria-label="قنبلة الغرفة"><span class="hs-bomb-art" aria-hidden="true"><span class="hs-bomb-single">💣</span><span class="hs-bomb-fuse-spark"></span></span><b id="room-bomb-level">LV.1</b><small id="room-bomb-percent">0%</small><i class="hs-room-bomb-progress"><em id="room-bomb-bar"></em></i></button>
        <div class="hs-room-title-row">
          <div class="hs-room-owner">${avatar({displayName:r.ownerName,color:r.ownerColor},52)}</div><div class="hs-room-cover-thumb" aria-label="غلاف الغرفة" style="${r.coverUrl ? 'background-image:url('+JSON.stringify(r.coverUrl)+')' : ''}">${r.coverUrl ? '' : '<i data-lucide="image"></i>'}</div>
          <div class="min-w-0 flex-1"><h2><span class="hs-room-title-emoji">${esc(r.roomEmoji||'🎙️')}</span> ${esc(r.title)}</h2><p>${esc(r.topic)} · بواسطة ${esc(r.ownerName||'عضو')}</p></div>
          <span class="hs-room-owner-tag" aria-label="المضيفة"><i data-lucide="crown"></i></span>
        ${'</div>'}
      </div>
      <div class="hs-room-meta hs-room-meta-compact"><span class="hs-room-member-count"><i data-lucide="users"></i><b id="room-member-count">—</b></span><span class="hs-room-id-chip" dir="ltr"><b>${esc(r.publicId || "ROOM")}</b><button type="button" id="room-copy-id" aria-label="نسخ رقم الغرفة" title="نسخ رقم الغرفة"><i data-lucide="copy"></i></button></span><div class="hs-room-meta-actions"><button type="button" id="room-copy-link" aria-label="نسخ الرابط" title="نسخ الرابط"><i data-lucide="link"></i></button>${isRoomOwner ? '<button type="button" id="room-settings-toggle" class="hs-room-settings-launch" aria-label="إعدادات الغرفة" title="إعدادات الغرفة" aria-expanded="false"><i data-lucide="settings-2"></i></button>' : ''}<button type="button" id="room-share" aria-label="مشاركة الأصدقاء" title="مشاركة الأصدقاء"><i data-lucide="share-2"></i></button><button type="button" id="room-report" aria-label="الإبلاغ عن الغرفة" title="الإبلاغ عن الغرفة"><i data-lucide="flag"></i></button><button type="button" id="room-exit" class="hs-room-exit" aria-label="مغادرة الغرفة" title="مغادرة الغرفة"><i data-lucide="log-out"></i></button></div></div>
    <nav class="hs-room-quick-actions" aria-label="اختصارات الغرفة"><a href="#/games" aria-label="الألعاب" title="الألعاب"><i data-lucide="gamepad-2"></i></a><a href="#/shop" aria-label="المتجر" title="المتجر"><i data-lucide="shopping-bag"></i></a><button type="button" id="room-send-gift-quick" aria-label="الهدايا" title="الهدايا"><i data-lucide="gift"></i></button></nav>
    </div>
    ${isRoomOwner ? `
      <div id="room-owner-menu" class="hs-room-owner-menu hidden" role="dialog" aria-label="أدوات المضيفة">
        <div class="hs-owner-menu-grabber"></div><div class="hs-owner-menu-title">أدوات الغرفة</div>
        <div class="hs-owner-menu-grid">
          <button type="button" data-owner-action="gift"><i data-lucide="gift"></i><span>الهدايا</span></button>
          <button type="button" data-owner-action="games"><i data-lucide="gamepad-2"></i><span>غرفة اللعب</span></button>
          <button type="button" data-owner-action="invite"><i data-lucide="users"></i><span>دعوة الأصدقاء</span></button>
          <button type="button" data-owner-action="share"><i data-lucide="share-2"></i><span>مشاركة الغرفة</span></button>
          <button type="button" data-owner-action="settings" class="hs-owner-settings-tile"><i data-lucide="settings"></i><span>إعدادات الغرفة</span></button>
        </div>
      </div>
      <section id="room-settings-panel" class="hs-room-settings hidden" aria-label="إعدادات الغرفة">
        <header class="hs-room-settings-header"><button type="button" id="room-settings-close" aria-label="رجوع"><i data-lucide="arrow-right"></i></button><h3>إعدادات الغرفة</h3><span></span></header>
        <div class="hs-room-settings-group hs-room-cover-settings"><h4>غلاف الغرفة</h4><p class="hs-room-settings-hint">هذا الغلاف يظهر كصورة دائرية بجانب اسم الغرفة فقط.</p><label class="photo-picker room-cover-picker" for="room-background-file"><i data-lucide="image-plus"></i><span>اختيار غلاف من الهاتف</span><input id="room-background-file" type="file" accept="image/*" hidden></label><div id="room-cover-preview" class="hs-room-cover-preview">${r.coverUrl?`<img src="${esc(r.coverUrl)}" alt="غلاف الغرفة">`:"<span>لم يتم اختيار غلاف بعد</span>"}</div><button type="button" id="room-cover-save" class="btn-gold w-full mt-2">حفظ غلاف الغرفة</button></div>
        <div class="hs-room-settings-group hs-room-info-settings"><h4>معلومات الغرفة</h4>
          <div class="hs-room-settings-fields"></div>
          <div class="hs-room-setting-row"><label>رمز الغرفة</label><div id="room-emoji-pick" class="hs-room-emoji-pick">${['🎙️','👑','🌙','💎','🌹','🦋','✨','🎶','💕','🔥','☕','🎧','🪄','🥂','🩷','💜','⭐','🌸','🦄','🎤'].map(e=>`<button type="button" data-room-emoji="${e}" class="${(r.roomEmoji||'🎙️')===e?'active':''}">${e}</button>`).join('')}</div></div></div>
        <div class="hs-room-settings-group"><h4>إعدادات الصوت والمقاعد</h4>
          <div class="hs-room-setting-row"><label for="room-seat-limit">عدد الميكروفونات</label><select id="room-seat-limit" class="field"><option value="4" ${(r.seatLimit||8)===4?'selected':''}>4</option><option value="6" ${(r.seatLimit||8)===6?'selected':''}>6</option><option value="8" ${(r.seatLimit||8)===8?'selected':''}>8</option><option value="10" ${(r.seatLimit||8)===10?'selected':''}>10</option><option value="12" ${(r.seatLimit||8)===12?'selected':''}>12</option><option value="16" ${(r.seatLimit||8)===16?'selected':''}>16</option></select></div>
          <div class="hs-room-setting-row"><label for="room-seat-layout">ترتيب المايكات</label><select id="room-seat-layout" class="field"><option value="grid" ${roomSeatLayout==='grid'?'selected':''}>توزيع متوازن في الوسط</option><option value="one-top" ${roomSeatLayout==='one-top'?'selected':''}>مايك واحد بالأعلى والبقية تحته</option><option value="two-top" ${roomSeatLayout==='two-top'?'selected':''}>مايكان بالأعلى والبقية تحتهما</option></select></div>
          <p class="hs-room-settings-hint">يُحفظ ترتيب المايكات في الغرفة نفسها ويظهر لجميع أعضائها.</p>
          <p class="hs-room-settings-hint">لا يمكن تقليل عدد المقاعد إذا كانت المقاعد المراد حذفها مشغولة.</p>
        </div>
        <div class="hs-room-settings-group hs-room-background-settings"><h4>خلفية المايكات</h4><p class="hs-room-settings-hint">هذه الخلفية مستقلة تمامًا عن غلاف الغرفة، وتظهر خلف المايكات فقط.</p>
          <label class="photo-picker hs-room-background-picker" for="room-background-gallery-file"><i data-lucide="images"></i><span>اختيار خلفية الغرفة من معرض الهاتف</span><input id="room-background-gallery-file" type="file" accept="image/*" hidden></label><p class="hs-room-settings-hint">اختاري صورة من هاتفك، ثم اضغطي حفظ خلفية الغرفة.</p><div id="room-background-catalog" class="mt-3"><p class="text-xs opacity-60">أو اختاري من خلفيات المتجر والمقتنيات</p></div>
          <div id="room-background-preview" class="hs-room-background-preview" aria-live="polite"><div>لم تختاري خلفية للمايكات بعد</div></div>
          <button type="button" id="room-background-reset" class="btn-ghost w-full mt-2">إزالة خلفية المايكات</button><button type="button" id="room-background-save" class="btn-gold w-full mt-2">حفظ خلفية الغرفة</button>
        </div>
        <div class="hs-room-settings-group"><h4>إدارة الأعضاء</h4><p class="hs-room-settings-hint">كتم المتحدث أو إنزاله من المايك أو إخراجه من الغرفة.</p><div id="room-admin-members" class="space-y-2"><p class="text-xs opacity-60">جارٍ تحميل قائمة الأعضاء...</p></div></div>
        <button type="button" id="room-settings-save" class="btn-gold w-full mt-4">حفظ الإعدادات</button>
      </section>` : ''}
    <div id="room-invite-panel" class="card p-3 mb-3 hidden"><div class="flex items-center justify-between mb-2"><b class="text-gold-300">اختاري صديقًا لدعوته</b><button type="button" id="room-invite-close" class="text-sm">إغلاق</button></div><div id="room-invite-friends" class="space-y-2"></div></div>
    <button type="button" id="room-gift-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق الهدايا"></button><div id="room-gift-panel" class="hs-gift-picker hidden"><div class="hs-gift-picker-head"><span class="hs-gift-picker-mark" aria-hidden="true">✦</span><button type="button" id="room-gift-close" aria-label="إغلاق">×</button></div><form id="room-gift-form" class="space-y-3"><div class="flex items-center justify-between gap-2"><label class="label">اختاري العضو</label><button type="button" id="room-gift-all" class="hs-gift-all" aria-label="كل المايكات" title="كل المايكات"><i data-lucide="users"></i></button></div><select name="recipient" class="field" aria-label="المستلم"></select><div id="room-gift-recipient-grid" class="hs-gift-recipient-grid" aria-label="اختيار مستلم الهدية"></div><input type="hidden" name="gift" value=""><div id="room-gift-categories" class="hs-room-gift-categories"><button type="button" data-gift-category="app" class="active">هدية التطبيق</button><button type="button" data-gift-category="event">هدية الحدث</button><button type="button" data-gift-category="lucky">الهدايا المحظوظة</button><button type="button" data-gift-category="special">هدية خاصة</button></div><div id="room-gift-grid" class="hs-gift-grid"></div><label class="label">الكمية</label><select name="quantity" class="field"><option value="1">×1</option><option value="10">×10</option><option value="99">×99</option></select><p id="room-gift-selection" class="hs-gift-selection">اختاري هدية للمتابعة</p><button type="submit" id="room-gift-submit" class="hs-gift-submit btn-gold w-full" aria-label="إرسال الهدية" title="إرسال الهدية" disabled><i data-lucide="send"></i><span>إرسال الهدية</span></button><div class="hs-gift-wallet-footer"><span><i data-lucide="wallet"></i><b id="room-gift-balance">—</b></span><a href="#/wallet" aria-label="شحن الرصيد" title="شحن الرصيد"><i data-lucide="plus-circle"></i></a></div></form></div>
    <button type="button" id="room-game-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق مركز الألعاب"></button><div id="room-game-center" class="hs-room-game-center hidden" role="dialog" aria-label="مركز الألعاب"><div class="hs-room-panel-handle"></div><div class="hs-room-game-head"><div><span>H A M S A T</span><h3>🎮 GAME CENTER</h3></div><button type="button" id="room-game-close" aria-label="إغلاق">×</button></div><div class="hs-room-game-balance"><span>رصيدك <b id="room-game-balance">—</b> عملة</span><button type="button" id="room-game-balance-refresh" aria-label="تحديث الرصيد">↻</button></div><div class="hs-room-game-banners"><div class="hs-room-game-banner"><b>🏆 قاعة الشهرة</b><small>أبرز نجوم همسات</small></div><div class="hs-room-game-banner"><b>🤝 شريك الغرفة</b><small>العبوا معاً</small></div></div><div id="room-games-grid" class="hs-room-games-grid"><p class="text-xs opacity-70">جارٍ تحميل الألعاب...</p></div><div id="room-game-stage" class="hs-room-game-stage hidden"></div></div>
    <button type="button" id="room-bomb-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق قنبلة الغرفة"></button><div id="room-bomb-panel" class="hs-room-bomb-panel hidden" role="dialog" aria-label="قنبلة الغرفة"><div class="hs-room-panel-handle"></div><div class="hs-room-bomb-head"><div><span>HAMSAT ROOM EVENT</span><h3>💣 قنبلة الغرفة</h3></div><button type="button" id="room-bomb-close" aria-label="إغلاق">×</button></div><p class="hs-room-bomb-description">كل هدية تُرسل داخل الغرفة تزيد تقدم القنبلة. عند اكتمال المستوى تُوزّع العملات تلقائياً على الموجودين، مع مكافآت إضافية لأعلى المساهمين.</p><div class="hs-room-bomb-status"><div><b id="room-bomb-panel-level">LV.1</b><span id="room-bomb-countdown">بانتظار أول هدية</span></div><strong id="room-bomb-panel-percent">0%</strong></div><div class="hs-room-bomb-track"><i id="room-bomb-panel-bar"></i></div><div id="room-bomb-levels" class="hs-room-bomb-levels"></div><div class="hs-room-bomb-top"><h4>🏆 أعلى المساهمين</h4><div id="room-bomb-top3"><p>لا توجد مساهمات بعد.</p></div></div></div>
    <div class="hs-room-unified" aria-label="واجهة الغرفة الصوتية">
    <section class="hs-room-stage">
      <div class="hs-room-section-title hs-room-icon-heading"><div><i data-lucide="mic" aria-hidden="true"></i><span class="sr-only">المقاعد</span></div><span class="hs-room-seat-count" aria-label="عدد المقاعد">${r.seatLimit||8}</span></div>
      <div class="hs-seat-live-timer" aria-live="off"><span class="sr-only">وقت المايك</span><strong id="room-bomb-sit-time" data-started-at="">00:00</strong></div><div id="room-seats" class="hs-room-seats"></div>
       
      
    </section>
    <section class="hs-room-people hs-room-people-compact">
      <div class="hs-room-section-title hs-room-icon-heading"><div><i data-lucide="users" aria-hidden="true"></i><span class="sr-only">الحاضرون</span></div><span class="hs-room-people-live" aria-label="متصلون الآن"><i></i></span></div>
      <div id="room-members" class="hs-room-members"><span class="text-xs">جارٍ تحميل الأعضاء...</span></div>
    </section>
    <section class="hs-room-chat-area">
      <div class="hs-room-chat-heading">
        <div><i data-lucide="message-circle" aria-hidden="true"></i><b>الدردشة</b></div>
        <span class="hs-room-people-live" aria-label="متصلون الآن"><i></i></span>
      </div>
      <div id="room-chat-tabs" class="hs-room-chat-tabs hs-room-chat-icon-tabs">
        <button type="button" data-chat-filter="all" class="active" aria-label="الكل" title="الكل"><i data-lucide="layers"></i></button>
        <button type="button" data-chat-filter="chat" aria-label="الدردشة" title="الدردشة"><i data-lucide="message-square"></i></button>
        <button type="button" data-chat-filter="gifts" aria-label="الهدايا" title="الهدايا"><i data-lucide="gift"></i></button>
        <button type="button" data-chat-filter="games" aria-label="الألعاب" title="الألعاب"><i data-lucide="gamepad-2"></i></button>
      </div>
      <div id="room-chat" class="hs-room-chat"><p class="text-xs text-[#8a76a8] text-center">جارٍ تحميل الرسائل...</p></div>
      <div class="hs-room-bottom-bar" aria-label="أدوات الغرفة والكتابة">
        <div class="hs-room-compose-wrap">
          <form id="room-chat-form" class="hs-room-compose">
            <button type="button" id="room-emoji-toggle" class="hs-compose-emoji" aria-label="إدراج إيموجي"><i data-lucide="smile"></i></button>
            <input name="message" maxlength="1000" placeholder="اكتبي رسالة للجميع..." autocomplete="off" required>
            <button type="submit" aria-label="إرسال الرسالة"><i data-lucide="send"></i></button>
          </form>
        </div>
        <div class="hs-room-tools-row" aria-label="أدوات الغرفة">
          <button type="button" id="voice-start" class="hs-tool-mic" aria-label="تشغيل الميكروفون"><i data-lucide="mic"></i></button>
          <button type="button" id="voice-mute" class="hs-tool-icon" aria-label="كتم الميكروفون" title="كتم الميكروفون" disabled><i data-lucide="mic-off"></i></button>
          <button type="button" id="room-audio-mute" class="hs-tool-icon" aria-label="كتم صوت الغرفة" title="كتم صوت الغرفة" disabled><i data-lucide="volume-2"></i></button>
          <button type="button" id="voice-audio-enable" class="hs-tool-icon" aria-label="سماع المشاركين" disabled><i data-lucide="headphones"></i></button>
          <button type="button" id="room-send-gift" class="hs-tool-gift" aria-label="الهدايا"><i data-lucide="gift"></i></button>
          <button type="button" id="room-game-center-toggle" class="hs-tool-icon" aria-label="الألعاب"><i data-lucide="gamepad-2"></i></button>
          <button type="button" id="room-settings-shortcut" class="hs-tool-icon" aria-label="إعدادات الغرفة" title="إعدادات الغرفة"><i data-lucide="grid-2x2"></i></button>
        </div>
        <p id="voice-status" class="hs-room-voice-status sr-only" role="status">الصوت غير متصل</p>
        <div class="sr-only"><button type="button" id="voice-leave" hidden>إيقاف الصوت</button><div id="voice-audio" aria-hidden="true"></div></div>
      </div>
    </section>
    </div>
    </div>
    <button type="button" id="room-emoji-backdrop" class="hs-room-panel-backdrop hidden" aria-label="إغلاق التفاعلات"></button><div id="room-emoji-panel" class="hs-room-emoji-panel hidden" role="dialog" aria-label="اختيار تفاعل"><div class="hs-room-panel-handle"></div><div class="hs-room-emoji-head"><b>التفاعلات</b><button type="button" id="room-emoji-close" aria-label="إغلاق">×</button></div><div class="hs-room-emoji-categories"><button type="button" class="active" data-emoji-category="default">Default</button></div><div id="room-emoji-grid" class="hs-room-emoji-grid"></div><div id="room-emoji-pagination" class="hs-room-emoji-pagination"></div></div>
    ${isRoomOwner ? `<button id="del-room" class="btn-danger w-full mt-3"><i data-lucide="trash-2" class="w-5 h-5"></i> حذف الغرفة</button>` : ''}
  `, async (sheet) => {
    sheet.classList.add('room-sheet');
    const applyRoomBackground=(url)=>{
      const canvas=sheet.querySelector('.hs-room-canvas');
      const unified=sheet.querySelector('.hs-room-unified');
      const stage=sheet.querySelector('.hs-room-stage');
      if(!canvas||!unified||!stage)return;
      const floatingBomb=sheet.querySelector('#room-bomb-floating');
      const sitTimer=sheet.querySelector('.hs-seat-live-timer');
      let bombStack=stage.querySelector('.hs-room-bomb-stack');
      if(!bombStack){bombStack=document.createElement('div');bombStack.className='hs-room-bomb-stack';stage.appendChild(bombStack);}
      if(floatingBomb&&floatingBomb.parentElement!==bombStack)bombStack.appendChild(floatingBomb);
      if(sitTimer&&sitTimer.parentElement!==bombStack)bombStack.appendChild(sitTimer);
      if(url) canvas.style.setProperty('background-image','url('+JSON.stringify(String(url))+')','important');
      canvas.style.setProperty('background-size','cover','important');
      canvas.style.setProperty('background-position','center center','important');
      canvas.style.setProperty('background-repeat','no-repeat','important');
      unified.style.setProperty('background','transparent','important');
      stage.style.setProperty('background','rgba(8,11,18,.22)','important');
      stage.style.setProperty('backdrop-filter','none','important');
      stage.style.setProperty('-webkit-backdrop-filter','none','important');
      stage.style.setProperty('min-height','0','important');
      stage.style.setProperty('flex','0 0 auto','important');
      const bottomBar=sheet.querySelector('.hs-room-bottom-bar');
      if(bottomBar&&bottomBar.parentElement!==canvas)canvas.appendChild(bottomBar);
    };
    applyRoomBackground(r.backgroundUrl||null);
    api.roomBackground(r.id).then(({imageUrl})=>{r.backgroundUrl=imageUrl;applyRoomBackground(imageUrl);}).catch(error=>console.warn('تعذر تحميل خلفية الغرفة المشتركة:',error));
    if(!r.backgroundUrl&&r.backgroundItemId&&!/^https?:\/\//i.test(r.backgroundItemId)){api.shopItems().then(({items})=>applyRoomBackground(items.find(item=>item.id===r.backgroundItemId)?.image_url||null)).catch(()=>{});}
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
    const reportRoomButton=sheet.querySelector('#room-report');
     if(reportRoomButton)reportRoomButton.onclick=()=>openSheet(`<h2 class="text-lg font-bold mb-3">الإبلاغ عن الغرفة</h2><form id="room-report-form" class="space-y-3"><label class="label">سبب البلاغ<select class="field" name="reason"><option>إساءة أو مضايقة</option><option>محتوى غير مناسب</option><option>انتحال أو احتيال</option><option>مخالفة قواعد المجتمع</option><option>سبب آخر</option></select></label><label class="label">تفاصيل إضافية<textarea class="field" name="details" rows="3" maxlength="2000" placeholder="اكتبي تفاصيل تساعد الإدارة على مراجعة البلاغ"></textarea></label><div class="grid grid-cols-2 gap-2"><button type="button" data-close class="btn-ghost">إلغاء</button><button type="submit" class="btn-gold">إرسال البلاغ</button></div></form>`,reportSheet=>{reportSheet.querySelector('#room-report-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;try{await api.reportRoom(r.id,form.elements.reason.value,form.elements.details.value);closeSheet();toast('تم إرسال بلاغ الغرفة إلى الإدارة');}catch(error){toast(error.message,'error');button.disabled=false;}};});
     const settingsToggle=sheet.querySelector('#room-settings-toggle');
    if(settingsToggle){
      const panel=sheet.querySelector('#room-settings-panel'),ownerMenu=sheet.querySelector('#room-owner-menu');let chosenEmoji=r.roomEmoji||'🎙️',chosenCover=r.coverUrl||null,chosenBackgroundId=r.backgroundItemId||null,chosenBackgroundUrl=r.backgroundUrl||null,chosenCoverFile=null,coverPreviewUrl=null,chosenBackgroundFile=null,backgroundPreviewUrl=null;
      settingsToggle.setAttribute('aria-expanded','false');
      settingsToggle.onclick=()=>{const opening=ownerMenu.classList.contains('hidden');ownerMenu.classList.toggle('hidden',!opening);ownerMenu.hidden=!opening;ownerMenu.setAttribute('aria-hidden',String(!opening));settingsToggle.setAttribute('aria-expanded',String(opening));};
      const settingsClose=sheet.querySelector('#room-settings-close');
      const closeRoomSettings=()=>{panel.classList.add('hidden');panel.hidden=true;panel.setAttribute('aria-hidden','true');ownerMenu.classList.add('hidden');ownerMenu.hidden=true;ownerMenu.setAttribute('aria-hidden','true');settingsToggle.setAttribute('aria-expanded','false');};
      if(settingsClose)settingsClose.onclick=closeRoomSettings;
      panel.setAttribute('aria-hidden','true');
      ownerMenu.querySelectorAll('[data-owner-action]').forEach(button=>button.onclick=async()=>{
        const action=button.dataset.ownerAction;ownerMenu.classList.add('hidden');
        if(action==='settings'){panel.hidden=false;panel.classList.remove('hidden');panel.setAttribute('aria-hidden','false');panel.scrollTop=0;await loadRoomSettings();}
        if(action==='gift')sheet.querySelector('#room-send-gift')?.click();
        if(action==='games')sheet.querySelector('#room-game-center-toggle')?.click();
        if(action==='invite')sheet.querySelector('#room-share')?.click();
        if(action==='share')sheet.querySelector('#room-copy-link')?.click();
      });
      const loadRoomSettings=async()=>{
        const opening=true;
        if(opening){
          const catalog=sheet.querySelector('#room-background-catalog');
          catalog.innerHTML='<p class="text-xs opacity-60">جارٍ تحميل الخلفيات...</p>';
          try{
            const [catalogResult,inventoryResult]=await Promise.all([api.shopItems(),api.inventory()]);
            const backgrounds=catalogResult.items.filter(item=>item.item_type==='room_background');chosenBackgroundUrl=r.backgroundUrl||(/^https?:\/\//i.test(chosenBackgroundId||'')?chosenBackgroundId:(backgrounds.find(item=>item.id===chosenBackgroundId)?.image_url||null));applyRoomBackground(chosenBackgroundUrl);sheet.querySelector('#room-background-preview').innerHTML=chosenBackgroundUrl?'<img src="'+esc(chosenBackgroundUrl)+'" alt="معاينة خلفية الغرفة" class="w-full h-36 object-cover"><p class="px-3 py-2 text-xs text-center text-gold-300">الخلفية المحفوظة</p>':'<div class="h-20 grid place-items-center text-xs">لا توجد خلفية محفوظة للمايكات</div>';
            const ownedIds=new Set(inventoryResult.items.filter(item=>item.item_type==='room_background'&&(!item.expiresAt||new Date(item.expiresAt).getTime()>Date.now())).map(item=>item.id));
            catalog.innerHTML=backgrounds.length?'<div class="grid grid-cols-2 gap-2">'+backgrounds.map(item=>{const owned=ownedIds.has(item.id);return '<article class="rounded-xl border border-gold-600/30 p-2 text-center"><div class="h-20 rounded-lg overflow-hidden bg-black/30">'+(item.image_url?'<img src="'+esc(item.image_url)+'" alt="'+esc(item.name)+'" class="w-full h-full object-cover">':'<div class="h-full grid place-items-center">🌌</div>')+'</div><b class="block text-xs mt-2">'+esc(item.name)+'</b><small class="text-[10px] text-gold-300">'+(owned?'مملوكة':Number(item.price)===0?'مجانية':num(item.price)+' عملة')+'</small><button type="button" data-room-bg-item="'+esc(item.id)+'" data-owned="'+owned+'" class="btn-ghost w-full mt-2 text-xs">'+(owned?'اختيار':'شراء')+'</button></article>';}).join('')+'</div>':'<p class="text-xs opacity-60">لا توجد خلفيات في المتجر حالياً.</p>';
            catalog.querySelectorAll('[data-room-bg-item]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const item=backgrounds.find(x=>x.id===button.dataset.roomBgItem);if(!item)return;if(button.dataset.owned!=='true'){await api.purchaseShopItem(item.id);toast('تم شراء الخلفية وإضافتها إلى مقتنياتك');button.dataset.owned='true';button.textContent='اختيار';button.closest('article').querySelector('small').textContent='مملوكة';}else{chosenBackgroundFile=null;const galleryInput=sheet.querySelector('#room-background-gallery-file');if(galleryInput)galleryInput.value='';if(backgroundPreviewUrl){URL.revokeObjectURL(backgroundPreviewUrl);backgroundPreviewUrl=null;}chosenBackgroundId=item.id;chosenBackgroundUrl=item.image_url||null;sheet.querySelector('#room-background-preview').innerHTML=item.image_url?'<img src="'+esc(item.image_url)+'" alt="معاينة خلفية المتجر" class="w-full h-36 object-cover"><p class="px-3 py-2 text-xs text-center text-gold-300">معاينة — ستُطبّق بعد حفظ الإعدادات</p>':'<div class="h-20 grid place-items-center text-xs">الخلفية المختارة</div>';sheet.querySelector('#room-background-preview').innerHTML=item.image_url?'<img src="'+esc(item.image_url)+'" alt="معاينة خلفية المتجر" class="w-full h-36 object-cover"><p class="px-3 py-2 text-xs text-center text-gold-300">معاينة — ستُطبّق بعد حفظ الإعدادات</p>':'<div class="h-20 grid place-items-center text-xs">الخلفية المختارة</div>';toast('تم اختيار الخلفية');}}catch(error){toast(error.message,'error');}finally{button.disabled=false;}});
          }catch(error){catalog.innerHTML='<p class="text-xs text-red-300">تعذّر تحميل خلفيات المتجر: '+esc(error.message)+'</p>';}
        }
        if(!panel.querySelector('#room-edit-title')){
          const editor=document.createElement('div');
          editor.className='hs-room-settings-fields';
          editor.innerHTML='<label class="label" for="room-edit-title">اسم الغرفة</label><input id="room-edit-title" class="field" maxlength="60" value="'+esc(r.title)+'" placeholder="اسم الغرفة"><label class="label mt-3" for="room-edit-topic">التصنيف</label><select id="room-edit-topic" class="field">'+TOPICS.map(t=>'<option value="'+esc(t)+'" '+(r.topic===t?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select><label class="label mt-3" for="room-edit-description">وصف الغرفة</label><textarea id="room-edit-description" class="field" rows="3" maxlength="240" placeholder="اكتبي نبذة عن غرفتك">'+esc(r.description||'')+'</textarea>';
          panel.insertBefore(editor,panel.querySelector('#room-emoji-pick').parentElement);
        }
      };
      sheet.querySelector('#room-settings-close').onclick=closeRoomSettings;
      sheet.querySelectorAll('[data-room-emoji]').forEach(b=>b.onclick=()=>{chosenEmoji=b.dataset.roomEmoji;sheet.querySelectorAll('[data-room-emoji]').forEach(x=>x.classList.toggle('active',x===b));});
      sheet.querySelector('#room-background-reset').onclick=()=>{chosenBackgroundId=null;chosenBackgroundUrl=null;chosenBackgroundFile=null;const picker=sheet.querySelector('#room-background-gallery-file');if(picker)picker.value='';if(backgroundPreviewUrl){URL.revokeObjectURL(backgroundPreviewUrl);backgroundPreviewUrl=null;}applyRoomBackground(null);sheet.querySelector('#room-background-preview').innerHTML='<div class="h-20 grid place-items-center text-xs opacity-60">تمت إزالة خلفية المايكات — اضغطي حفظ خلفية الغرفة لتأكيد الإزالة</div>';};
      sheet.querySelector('#room-background-gallery-file').onchange=()=>{const input=sheet.querySelector('#room-background-gallery-file'),file=input.files?.[0];if(!file)return;const ext=(file.name.split('.').pop()||'').toLowerCase(),mime=(file.type||'').toLowerCase();const allowed=['jpg','jpeg','png','webp'].includes(ext)||['image/jpeg','image/jpg','image/pjpeg','image/png','image/webp'].includes(mime);if(!allowed){toast('الصيغ المدعومة: JPG وPNG وWEBP. إذا كانت الصورة بصيغة HEIC حوّليها إلى JPG أولاً.','error');input.value='';return;}if(file.size>5*1024*1024){toast('حجم الصورة يجب ألا يتجاوز 5 ميغابايت','error');input.value='';return;}if(backgroundPreviewUrl)URL.revokeObjectURL(backgroundPreviewUrl);chosenBackgroundFile=file;backgroundPreviewUrl=URL.createObjectURL(file);chosenBackgroundId=null;chosenBackgroundUrl=backgroundPreviewUrl;applyRoomBackground(chosenBackgroundUrl);sheet.querySelector('#room-background-preview').innerHTML='<img src="'+esc(backgroundPreviewUrl)+'" alt="معاينة خلفية الغرفة" class="w-full h-36 object-cover"><p class="px-3 py-2 text-xs text-center text-gold-300">معاينة من معرض الهاتف — اضغطي حفظ خلفية الغرفة</p>';};
      sheet.querySelector('#room-cover-save').onclick=async()=>{const btn=sheet.querySelector('#room-cover-save');btn.disabled=true;try{if(chosenCoverFile){btn.textContent='جارٍ رفع الغلاف...';const uploaded=await api.uploadMedia(chosenCoverFile,'room-covers');chosenCover=uploaded.url;chosenCoverFile=null;if(coverPreviewUrl){URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null;}}const saved=await api.updateRoomSettings(r.id,{title:r.title,topic:r.topic,description:r.description,coverUrl:chosenCover,backgroundItemId:r.backgroundItemId,roomEmoji:r.roomEmoji,seatLimit:r.seatLimit});r.coverUrl=saved.coverUrl??chosenCover;const thumb=sheet.querySelector('.hs-room-cover-thumb');if(thumb){thumb.style.backgroundImage=r.coverUrl?'url('+JSON.stringify(r.coverUrl)+')':'none';thumb.innerHTML=r.coverUrl?'':'<i data-lucide="image"></i>';icons_();}sheet.querySelector('#room-cover-preview').innerHTML=r.coverUrl?'<img src="'+esc(r.coverUrl)+'" alt="غلاف الغرفة المحفوظ">':'<span>لم يتم اختيار غلاف بعد</span>';sheet.querySelector('.room-cover-picker span').textContent='تم حفظ غلاف الغرفة ✓';toast('تم حفظ غلاف الغرفة بشكل مستقل');closeRoomSettings();}catch(e){toast(e.message,'error');}finally{btn.disabled=false;btn.textContent='حفظ غلاف الغرفة';}};
      sheet.querySelector('#room-background-save').onclick=async()=>{const btn=sheet.querySelector('#room-background-save');btn.disabled=true;try{if(chosenBackgroundFile){btn.textContent='جارٍ رفع خلفية المايكات...';const uploaded=await api.uploadMedia(chosenBackgroundFile,'room-backgrounds');chosenBackgroundId=null;chosenBackgroundUrl=uploaded.url;chosenBackgroundFile=null;if(backgroundPreviewUrl){URL.revokeObjectURL(backgroundPreviewUrl);backgroundPreviewUrl=null;}}await api.saveRoomBackground(r.id,chosenBackgroundUrl,chosenBackgroundId);r.backgroundUrl=chosenBackgroundUrl;r.backgroundItemId=chosenBackgroundId;applyRoomBackground(chosenBackgroundUrl);sheet.querySelector('#room-background-preview').innerHTML=chosenBackgroundUrl?'<img src="'+esc(chosenBackgroundUrl)+'" alt="خلفية الغرفة المحفوظة" class="w-full h-36 object-cover"><p class="px-3 py-2 text-xs text-center text-gold-300">تم حفظ خلفية الغرفة ✓</p>':'<div class="h-20 grid place-items-center text-xs">لا توجد خلفية محفوظة للمايكات</div>';toast('تم حفظ خلفية الغرفة بشكل مستقل');closeRoomSettings();}catch(e){toast(e.message,'error');}finally{btn.disabled=false;btn.textContent='حفظ خلفية الغرفة';}};
      sheet.querySelector('#room-background-file').onchange=()=>{const input=sheet.querySelector('#room-background-file'),file=input.files?.[0];if(!file)return;const label=sheet.querySelector('.room-cover-picker span');if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('اختاري صورة بصيغة PNG أو JPG أو WEBP','error');input.value='';return;}if(file.size>5*1024*1024){toast('حجم الصورة يجب ألا يتجاوز 5 ميغابايت','error');input.value='';return;}if(coverPreviewUrl)URL.revokeObjectURL(coverPreviewUrl);chosenCoverFile=file;coverPreviewUrl=URL.createObjectURL(file);label.textContent='معاينة جاهزة — ستُرفع عند الحفظ';sheet.querySelector('#room-cover-preview').innerHTML='<img src="'+esc(coverPreviewUrl)+'" alt="معاينة غلاف الغرفة">';};
      sheet.querySelector('#room-settings-save').onclick=async()=>{const btn=sheet.querySelector('#room-settings-save');btn.disabled=true;try{if(chosenCoverFile){btn.textContent='جارٍ رفع غلاف الغرفة...';const uploaded=await api.uploadMedia(chosenCoverFile,'room-covers');chosenCover=uploaded.url;chosenCoverFile=null;if(coverPreviewUrl){URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null;}sheet.querySelector('#room-cover-preview').innerHTML='<img src="'+esc(chosenCover)+'" alt="معاينة غلاف الغرفة">';}if(chosenBackgroundFile){btn.textContent='جارٍ رفع خلفية المايكات...';const bgUpload=await api.uploadMedia(chosenBackgroundFile,'room-backgrounds');chosenBackgroundId=null;chosenBackgroundUrl=bgUpload.url;chosenBackgroundFile=null;if(backgroundPreviewUrl){URL.revokeObjectURL(backgroundPreviewUrl);backgroundPreviewUrl=null;}}btn.textContent='جارٍ حفظ الإعدادات...';roomSeatLayout=sheet.querySelector('#room-seat-layout')?.value||roomSeatLayout;const saved=await api.updateRoomSettings(r.id,{title:sheet.querySelector('#room-edit-title')?.value||r.title,topic:sheet.querySelector('#room-edit-topic')?.value||r.topic,description:sheet.querySelector('#room-edit-description')?.value??r.description,coverUrl:chosenCover,backgroundItemId:chosenBackgroundId,roomEmoji:chosenEmoji,seatLimit:Number(sheet.querySelector('#room-seat-limit')?.value||r.seatLimit||8),seatLayout:roomSeatLayout});r.title=saved.title;r.topic=saved.topic;r.description=saved.description;r.coverUrl=saved.coverUrl;r.backgroundItemId=saved.backgroundItemId;r.roomEmoji=saved.roomEmoji;r.seatLimit=saved.seatLimit;r.seatLayout=saved.seatLayout||roomSeatLayout;roomSeatLayout=r.seatLayout;await api.saveRoomBackground(r.id,chosenBackgroundUrl,chosenBackgroundId);r.backgroundUrl=chosenBackgroundUrl;const coverThumb=sheet.querySelector('.hs-room-cover-thumb');if(coverThumb){coverThumb.style.backgroundImage=chosenCover?'url('+JSON.stringify(chosenCover)+')':'none';coverThumb.innerHTML=chosenCover?'':'<i data-lucide="image"></i>';icons_();}sheet.querySelector('.hs-room-title-emoji').textContent=chosenEmoji;sheet.querySelector('.hs-room-title-row h2').lastChild.textContent=' '+r.title;sheet.querySelector('.hs-room-title-row p').textContent=r.topic+' · بواسطة '+(r.ownerName||'عضو');applyRoomBackground(chosenBackgroundUrl);sheet.querySelector('.hs-room-seat-count').textContent=r.seatLimit+' مقاعد';await drawMembers();if(chosenCover){sheet.querySelector('.room-cover-picker span').textContent='تم حفظ غلاف الغرفة ✓';sheet.querySelector('#room-cover-preview').innerHTML='<img src="'+esc(chosenCover)+'" alt="غلاف الغرفة المحفوظ">';}else{sheet.querySelector('.room-cover-picker span').textContent='اختيار صورة غلاف الغرفة من الهاتف';sheet.querySelector('#room-cover-preview').innerHTML='<span>لم يتم اختيار غلاف بعد</span>';}toast('تم حفظ إعدادات الغرفة لجميع أعضائها');closeRoomSettings();}catch(e){toast(e.message,'error');}finally{btn.disabled=false;btn.textContent='حفظ الإعدادات';}};
    }
    const chat=sheet.querySelector('#room-chat'), membersEl=sheet.querySelector('#room-members'), seatsEl=sheet.querySelector('#room-seats'), countEl=sheet.querySelector('#room-member-count'), form=sheet.querySelector('#room-chat-form');
    const chatTabs=sheet.querySelector('#room-chat-tabs'),bottomBar=sheet.querySelector('.hs-room-bottom-bar'),composeWrap=sheet.querySelector('.hs-room-compose-wrap');
    if(chatTabs&&bottomBar&&composeWrap&&chatTabs.parentElement!==bottomBar)bottomBar.insertBefore(chatTabs,composeWrap);
    const voiceStatus=sheet.querySelector('#voice-status'), voiceStart=sheet.querySelector('#voice-start'), voiceAudioEnable=sheet.querySelector('#voice-audio-enable'), voiceMute=sheet.querySelector('#voice-mute'), roomAudioMute=sheet.querySelector('#room-audio-mute'), voiceLeave=sheet.querySelector('#voice-leave');
    const stopHostSessionTracking=async()=>{
      if(state.hostSessionTimer){clearInterval(state.hostSessionTimer);state.hostSessionTimer=null;}
      if(state.hostSessionId){const sessionId=state.hostSessionId;state.hostSessionId=null;await api.hostEndSession(sessionId).catch(err=>console.warn('Could not close host session',err));}
    };
    const ensureHostSessionTracking=async()=>{
      if(!state.voiceRoom||state.hostSessionId)return;
      const sessionId=await api.hostStartSession(r.id);
      if(!sessionId)return;
      state.hostSessionId=sessionId;
      state.hostSessionTimer=window.setInterval(async()=>{
        try{
          const active=await api.hostHeartbeatSession(sessionId);
          if(active===false&&state.hostSessionId===sessionId){
            clearInterval(state.hostSessionTimer);state.hostSessionTimer=null;state.hostSessionId=null;
            await api.hostEndSession(sessionId).catch(err=>console.warn('Could not close inactive host session',err));
          }
        }catch(err){console.warn('Host session heartbeat failed',err);}
      },30000);
    };
        voiceStart.onclick=async()=>{voiceStart.disabled=true;voiceStatus.textContent='جارٍ الاتصال بالغرفة الصوتية...';try{const controller=createVoiceRoom({roomId:r.id,userId:state.profile.uuid,onState:s=>{if(voiceStatus.isConnected)voiceStatus.textContent=s.message;if(Array.isArray(s.activeSpeakers)){const active=new Set(s.activeSpeakers);sheet.querySelectorAll('#room-seats .hs-room-seat[data-user-id]').forEach(seat=>seat.classList.toggle('is-speaking',active.has(seat.dataset.userId)));}if(voiceMute.isConnected){voiceMute.disabled=!controller.canPublish;voiceMute.innerHTML='<i data-lucide="'+(s.muted?'mic':'mic-off')+'"></i>';voiceMute.setAttribute('aria-label',s.muted?'تشغيل الميكروفون':'كتم الميكروفون');voiceMute.title=s.muted?'تشغيل الميكروفون':'كتم الميكروفون';icons_();}if(roomAudioMute?.isConnected){roomAudioMute.disabled=!s.connected;roomAudioMute.innerHTML='<i data-lucide="'+(s.roomAudioMuted?'volume-x':'volume-2')+'"></i>';roomAudioMute.setAttribute('aria-label',s.roomAudioMuted?'تشغيل صوت الغرفة':'كتم صوت الغرفة');roomAudioMute.title=s.roomAudioMuted?'تشغيل صوت الغرفة':'كتم صوت الغرفة';icons_();}if(voiceStart.isConnected&&s.connected)voiceStart.textContent=controller.canPublish?'الميكروفون متصل':'دخلتِ للاستماع';}});state.voiceRoom=controller;await controller.join();try{await ensureHostSessionTracking();}catch(err){console.warn('Host session tracking unavailable',err.message);}voiceMute.disabled=!controller.canPublish;roomAudioMute.disabled=false;roomAudioMute.innerHTML='<i data-lucide="'+(controller.roomAudioMuted?'volume-x':'volume-2')+'"></i>';voiceAudioEnable.disabled=false;voiceLeave.hidden=false;voiceStart.textContent=controller.canPublish?'الميكروفون متصل':'دخلتِ للاستماع';voiceStatus.textContent=controller.canPublish?'أنتِ متصلة ويمكنك التحدث.':'أنتِ متصلة وتسمعين الغرفة. احجزي مقعداً للتحدث.';}catch(e){if(state.voiceRoom){const failed=state.voiceRoom;state.voiceRoom=null;failed.leave().catch(()=>{});}voiceStatus.textContent='تعذّر تشغيل الصوت: '+e.message;voiceStart.disabled=false;}};
    voiceAudioEnable.onclick=async()=>{if(!state.voiceRoom)return;voiceAudioEnable.disabled=true;try{await state.voiceRoom.enableAudio();voiceStatus.textContent='تم تفعيل سماع أصوات المشاركين';voiceAudioEnable.textContent='الصوت مفعّل ✓';}catch(e){voiceStatus.textContent='تعذّر تشغيل صوت الآخرين: '+e.message;voiceAudioEnable.disabled=false;}};
    voiceMute.onclick=async()=>{const controller=state.voiceRoom;if(!controller)return;voiceMute.disabled=true;try{const muted=await controller.setMuted(!controller.muted);voiceMute.innerHTML='<i data-lucide="'+(muted?'mic':'mic-off')+'"></i>';voiceMute.setAttribute('aria-label',muted?'تشغيل الميكروفون':'كتم الميكروفون');voiceMute.title=muted?'تشغيل الميكروفون':'كتم الميكروفون';icons_();voiceStatus.textContent=muted?'الميكروفون مكتوم':'الميكروفون يعمل';}catch(error){toast(error.message,'error');}finally{voiceMute.disabled=!state.voiceRoom?.canPublish;}};
     roomAudioMute.onclick=()=>{const controller=state.voiceRoom;if(!controller)return;const muted=controller.toggleRoomAudioMute();roomAudioMute.innerHTML='<i data-lucide="'+(muted?'volume-x':'volume-2')+'"></i>';roomAudioMute.setAttribute('aria-label',muted?'تشغيل صوت الغرفة':'كتم صوت الغرفة');roomAudioMute.title=muted?'تشغيل صوت الغرفة':'كتم صوت الغرفة';icons_();toast(muted?'تم كتم صوت الغرفة على جهازك':'تم تشغيل صوت الغرفة');};
    voiceLeave.onclick=async()=>{const controller=state.voiceRoom;state.voiceRoom=null;if(controller)await controller.leave();await stopHostSessionTracking();voiceMute.disabled=true;roomAudioMute.disabled=true;voiceAudioEnable.disabled=true;voiceAudioEnable.textContent='سماع الآخرين';voiceLeave.hidden=true;voiceStart.disabled=false;voiceStart.textContent='تشغيل الميكروفون';voiceStatus.textContent='تم إيقاف الصوت';};
    if(state.voiceRoom){voiceMute.disabled=!state.voiceRoom.canPublish;roomAudioMute.disabled=false;roomAudioMute.innerHTML='<i data-lucide="'+(state.voiceRoom.roomAudioMuted?'volume-x':'volume-2')+'"></i>';voiceAudioEnable.disabled=false;voiceLeave.hidden=false;voiceStart.disabled=true;voiceStart.textContent=state.voiceRoom.canPublish?'الميكروفون متصل':'دخلتِ للاستماع';voiceStatus.textContent='الغرفة الصوتية مستمرة في الخلفية.';}
    let roomChatFilter='all', roomEventsLoaded=false;
    const seenRoomEventIds=new Set();
    const animateBombExplosion=(level=1)=>{
      const stage=sheet.querySelector('.hs-room-stage');if(!stage)return;
      const burst=document.createElement('div');burst.className='hs-bomb-explosion lv-'+Math.max(1,Math.min(5,Number(level)||1));burst.setAttribute('aria-hidden','true');
      burst.innerHTML='<span class="hs-burst-flash"></span>'+[1,2,3,4,5].map(n=>'<i class="hs-burst-bomb lv-'+n+'">💣</i>').join('')+'<b>BOOM!</b>';
      stage.appendChild(burst);window.setTimeout(()=>burst.remove(),2100);
    };
    const animateRoomEvent=(event)=>{
      if(event.event_type==='emoji'){
        const seat=[...sheet.querySelectorAll('#room-seats .hs-room-seat[data-user-id]')].find(el=>el.dataset.userId===event.actor_id);
        if(seat){const effect=document.createElement('span');effect.className='hs-seat-emoji-effect';effect.textContent=event.payload?.emoji||'✨';seat.appendChild(effect);window.setTimeout(()=>effect.remove(),3600);}
      } else if(event.event_type==='gift'){showGiftCelebration({name:event.payload?.gift_name||'هدية',icon:'gift'},Number(event.payload?.quantity||1));}else if(event.event_type==='bomb'){const completed=Number(event.payload?.level_completed||1);animateBombExplosion(completed);toast('💥 اكتمل انفجار المستوى '+completed+' وتم توزيع الجوائز!');}
    };
    let roomJoinedAt=Date.now();
    const drawMessages=async()=>{
      const [messageData,eventData]=await Promise.all([api.roomMessages(r.id,roomJoinedAt),api.roomEvents(r.id,roomJoinedAt).catch(()=>({events:[]}))]);
      if(!chat.isConnected)return;
      const messages=messageData.messages||[],events=eventData.events||[];
      if(roomEventsLoaded){events.forEach(event=>{if(!seenRoomEventIds.has(event.id)){seenRoomEventIds.add(event.id);animateRoomEvent(event);}});}
      else{events.forEach(event=>seenRoomEventIds.add(event.id));roomEventsLoaded=true;}
      const items=[];
      if(roomChatFilter==='all'||roomChatFilter==='chat'){messages.forEach(m=>items.push({at:m.createdAt,html:'<div class="hs-room-message '+(m.userId===state.profile?.uuid?'mine':'')+'">'+avatar({displayName:m.displayName,color:m.color,avatarUrl:m.avatarUrl,handle:m.handle,equippedProfileFrameId:m.equippedProfileFrameId,equippedProfileFrameUrl:m.equippedProfileFrameUrl},30)+'<div><b>'+esc(m.displayName)+'</b><p>'+esc(m.body)+'</p><small>'+timeAgo(m.createdAt)+'</small></div></div>'}));}
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
    const formatRoomDuration=(milliseconds)=>{const total=Math.max(0,Math.floor(milliseconds/1000)),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;return hours?`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`:`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;};
    const updateRoomSeatTimers=()=>{const now=Date.now();sheet.querySelectorAll('.hs-seat-duration[data-started-at]').forEach(el=>{const start=Date.parse(el.dataset.startedAt);el.textContent=Number.isFinite(start)?formatRoomDuration(now-start):'—';});const mine=[...sheet.querySelectorAll('#room-seats .hs-room-seat[data-own="true"]')][0];const timer=sheet.querySelector('#room-bomb-sit-time');if(timer){const start=Date.parse(mine?.querySelector('.hs-seat-duration')?.dataset.startedAt||'');timer.textContent=Number.isFinite(start)?formatRoomDuration(now-start):'00:00';timer.dataset.startedAt=Number.isFinite(start)?String(start):'';timer.classList.toggle('active',Number.isFinite(start));}};
    let previousSeatUsers=new Set();
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
      // Use the already-loaded room member profile as a fallback when the seat join has no embedded profile.
      // This keeps the real avatar_url and equipped frame visible on every occupied microphone seat.
      const memberById=Object.fromEntries(members.map(member=>[member.userId,member]));
      const adminMembersEl=sheet.querySelector('#room-admin-members');
      const renderMemberRows=()=>members.length?members.map(m=>`<div class="hs-room-person">${m.handle?`<button type="button" class="hs-member-avatar-link" data-open-member-profile="${esc(m.handle)}" aria-label="عرض ملف ${esc(m.displayName)}">${avatar(m,34)}</button>`:avatar(m,34)}<span>${esc(m.displayName)}</span>${m.userId!==state.profile?.uuid?`<button type="button" class="hs-room-member-action" data-local-mute="${esc(m.userId)}">${mutedRoomUsers.has(m.userId)?'إلغاء الكتم':'كتم صوته لدي'}</button>${host?`<button type="button" class="hs-room-member-action danger" data-kick-room-member="${esc(m.userId)}">طرد من الغرفة</button>`:``}${host&&seatedUsers.has(m.userId)?`<button type="button" class="hs-room-member-action" data-host-mute="${esc(m.userId)}">${remotelyMutedUsers.has(m.userId)?'إلغاء كتم المايك':'كتم المايك'}</button><button type="button" class="hs-room-member-action danger" data-remove-seat="${esc(m.userId)}">إنزال من الكرسي</button>`:''}`:''}</div>`).join(''):'<span class="text-xs text-[#8a76a8]">لا يوجد أعضاء بعد</span>';
      membersEl.innerHTML=renderMemberRows();
      if(adminMembersEl)adminMembersEl.innerHTML=renderMemberRows();
      const actionRoots=[membersEl,adminMembersEl].filter(Boolean);
      actionRoots.forEach(root=>root.querySelectorAll('[data-open-member-profile]').forEach(button=>button.addEventListener('click',event=>{
        event.stopPropagation();
        location.hash='#/u/'+encodeURIComponent(button.dataset.openMemberProfile);
      })));
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
      actionRoots.forEach(root=>root.querySelectorAll('[data-kick-room-member]').forEach(b=>b.onclick=async()=>{
        const uid=b.dataset.kickRoomMember;
        if(!confirm('سيتم طرد هذا العضو من الغرفة وإيقاف اتصاله الصوتي. هل تريدين المتابعة؟'))return;
        b.disabled=true;
        try{await api.kickRoomParticipant(r.id,uid);remotelyMutedUsers.delete(uid);toast('تم طرد العضو من الغرفة');await drawMembers();}
        catch(e){toast(e.message,'error');b.disabled=false;}
      }));
      const bySeat=Object.fromEntries(seats.map(x=>[x.seat_no,x]));
      seatsEl.dataset.layout=roomSeatLayout;seatsEl.dataset.seatCount=String(Math.max(1,Math.min(16,Number(r.seatLimit)||8)));
      seatsEl.innerHTML=Array.from({length:Math.max(1,Math.min(16,Number(r.seatLimit)||8))},(_,i)=>{
        const n=i+1,seat=bySeat[n],m=seat?(seat.member||memberById[seat.user_id]||null):null,own=seat?.user_id===state.profile?.uuid,isHost=r.ownerUuid===state.profile?.uuid&&n===1;
        if(!seat)return `<button type="button" data-seat="${n}" class="hs-room-seat empty" aria-label="طلب المايك ${n}"><span class="hs-seat-ring"><span class="hs-seat-chair"><i data-lucide="armchair"></i></span><i class="hs-seat-center-mic" data-lucide="mic"></i></span><b>${isHost?'مقعد المضيفة':'مقعد '+n}</b><small>${isHost?'مقعد المضيفة':'اضغطي لطلب المايك'}</small><span class="hs-seat-number">${n}</span></button>`;
        return `<button type="button" data-seat="${n}" data-user-id="${esc(seat.user_id)}" data-user-handle="${esc(m?.handle||'')}" data-own="${own}" class="hs-room-seat occupied ${own?'mine':''}" aria-label="${own?'مقعدك على المايك':'عرض ملف '+esc(m?.displayName||'العضو')}"><span class="hs-seat-ring occupied-ring">${m?avatar(m,58):'<span class="hs-seat-mic"><i data-lucide="user-round"></i></span>'}<i class="hs-seat-live-mic" data-lucide="mic"></i></span><b>${esc(m?.displayName||'عضو')}</b><small>${own?'أنتِ على المايك':'متحدث'}</small><small class="hs-seat-duration" data-started-at="${esc(seat.seated_at||'')}">00:00</small>${isHost?'<em>المضيفة</em>':''}<span class="hs-seat-number">${n}</span></button>`;
      }).join('');
      const currentSeatUsers=new Set(seats.map(x=>x.user_id));
      seatsEl.querySelectorAll('.hs-room-seat.occupied[data-user-id]').forEach(el=>{if(!previousSeatUsers.has(el.dataset.userId))el.classList.add('hs-seat-arrive');});
      previousSeatUsers=currentSeatUsers;
      updateRoomSeatTimers();
      seatsEl.querySelectorAll('[data-seat]').forEach(b=>b.onclick=async()=>{
        if(b.dataset.own!=='true'&&b.dataset.userHandle){
          location.hash='#/u/'+encodeURIComponent(b.dataset.userHandle);
          return;
        }
        const leaving=b.dataset.own==='true';
        try{
          b.disabled=true;
          if(leaving) await api.leaveRoomSeat(r.id);
          else await api.requestRoomSeat(r.id,Number(b.dataset.seat));

          // The LiveKit controller refreshes its token from room_seats realtime.
          // Ask it to sync immediately too, so the UI never waits for a network event.
          if(state.voiceRoom){
            await state.voiceRoom.refreshPermissions();
            if(leaving) await stopHostSessionTracking();
            else await ensureHostSessionTracking();
          }else if(!leaving) await voiceStart.onclick();

          await drawMembers();
          toast(leaving?'غادرتِ المايك':'تم حجز المقعد');
        }catch(e){
          toast(e.message,'error');
          await drawMembers().catch(()=>{});
        }
      });
      icons_();
    };
    try{const joinedRoom=await api.joinRoom(r.id);rememberRecentRoom(r);const myMembership=joinedRoom.members?.find(member=>member.userId===state.profile?.uuid);roomJoinedAt=Date.now();state.activeRoomId=r.id;const savedRoomBackground=await api.roomBackground(r.id);r.backgroundUrl=savedRoomBackground.imageUrl;applyRoomBackground(savedRoomBackground.imageUrl);await Promise.all([drawMessages(),drawMembers()]);if(state.roomSeatTimer)clearInterval(state.roomSeatTimer);state.roomSeatTimer=window.setInterval(updateRoomSeatTimers,1000);state.roomChannel=api.subscribeRoomMessages(r.id,async payload=>{try{if(payload?.new?.seat_layout){roomSeatLayout=payload.new.seat_layout;r.seatLayout=roomSeatLayout;}await Promise.all([drawMessages(),drawMembers()]);if(payload?.table==='room_backgrounds'||payload?.new?.image_url!==undefined){const bg=await api.roomBackground(r.id);r.backgroundUrl=bg.imageUrl;applyRoomBackground(bg.imageUrl);}}catch(e){toast(e.message,'error');}});state.roomEventChannel=api.subscribeRoomEvents(r.id,()=>Promise.all([drawMessages(),drawRoomBomb()]).catch(e=>toast(e.message,'error')));}
    catch(e){chat.innerHTML=emptyBox('wifi-off','تعذّر فتح الغرفة',e.message);}
    sheet.querySelector('#room-minimize').onclick=()=>{state.roomMinimized=true;state.minimizedRoom=r;$('#sheet-root').innerHTML='';renderRoomMiniBubble();toast('تم الاحتفاظ بالغرفة؛ الصوت مستمر ويمكنك العودة من الفقاعة.');};
    sheet.querySelector('#room-exit').onclick=async()=>{const button=sheet.querySelector('#room-exit');button.disabled=true;try{if(state.voiceRoom){const voice=state.voiceRoom;state.voiceRoom=null;await voice.leave();}if(state.hostSessionTimer){clearInterval(state.hostSessionTimer);state.hostSessionTimer=null;}if(state.hostSessionId){const sessionId=state.hostSessionId;state.hostSessionId=null;await api.hostEndSession(sessionId).catch(e=>console.warn('Could not close host session',e));}if(state.roomChannel){await api.unsubscribeRoomChannel(state.roomChannel);state.roomChannel=null;}if(state.roomEventChannel){await api.unsubscribeRoomChannel(state.roomEventChannel);state.roomEventChannel=null;}if(state.roomBombTimer){clearInterval(state.roomBombTimer);state.roomBombTimer=null;}if(state.activeRoomId===r.id)state.activeRoomId=null;state.roomMinimized=false;state.minimizedRoom=null;$('#room-mini-root').innerHTML='';await api.leaveRoom(r.id);$('#sheet-root').innerHTML='';toast('غادرتِ الغرفة. ستبقى غرفتك محفوظة ويمكن للجميع دخولها.');}catch(e){toast(e.message,'error');button.disabled=false;}};
    form.onsubmit=async e=>{e.preventDefault();const input=form.elements.message,button=form.querySelector('button'),value=input.value.trim();if(!value)return;button.disabled=true;try{await api.sendRoomMessage(r.id,value);input.value='';await drawMessages();}catch(err){toast(err.message,'error');}finally{button.disabled=false;input.focus();}};
    const emojiPanel=sheet.querySelector('#room-emoji-panel');
    const emojiSet=state.profile?.equippedEmojiPackId==='emoji_luxe'?['👑','💎','✨','🥂','🪞','💍','🌟','🎀','🦢','🌹','💫','🪄','🩷','🫶','🌸','🔥','👏','🎉','🎤','🎧']:state.profile?.equippedEmojiPackId==='emoji_moon'?['🌙','⭐','🌟','☄️','🪐','🌌','✨','🌠','🌃','🦋','🌷','💜','🩵','🫶','🎶','🎧','☕','🌸','👏','🎤']:['💖','🌹','😂','😍','👏','✨','🌙','🥰','🫶','🎉','🔥','💎','👑','🦋','🎶','🎤','💜','🩷','🌸','🥂','😎','🤩','💫','🌈','🎊','💐','🩵','🧡','💚','⭐'];
    let emojiPage=0;
    const emojiGrid=sheet.querySelector('#room-emoji-grid'),emojiPagination=sheet.querySelector('#room-emoji-pagination');
    const drawEmojiPage=()=>{
      const pages=Math.ceil(emojiSet.length/20),start=emojiPage*20;
      emojiGrid.innerHTML=emojiSet.slice(start,start+20).map(e=>'<button type="button" data-room-emoji="'+e+'" aria-label="إرسال '+e+'">'+e+'</button>').join('');
      emojiPagination.innerHTML=Array.from({length:pages},(_,i)=>'<button type="button" data-emoji-page="'+i+'" class="'+(i===emojiPage?'active':'')+'" aria-label="صفحة '+(i+1)+'"></button>').join('');
      emojiPagination.querySelectorAll('[data-emoji-page]').forEach(b=>b.onclick=()=>{emojiPage=Number(b.dataset.emojiPage);drawEmojiPage();});
      emojiGrid.querySelectorAll('[data-room-emoji]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api.sendRoomEmoji(r.id,b.dataset.roomEmoji);toast('تم إرسال التفاعل');}catch(e){if(/مقاعد المايك/.test(e.message||'')){try{await api.sendRoomMessage(r.id,b.dataset.roomEmoji);toast('تم إرسال الإيموجي في الدردشة');}catch(fallbackError){toast(fallbackError.message,'error');return;}}else{toast(e.message,'error');return;}}finally{b.disabled=false;}emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');await drawMessages();});
    };
    drawEmojiPage();
    let emojiTouchStartX=0;emojiGrid.addEventListener('touchstart',e=>{emojiTouchStartX=e.changedTouches[0].clientX;},{passive:true});emojiGrid.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-emojiTouchStartX;if(Math.abs(delta)>45){emojiPage=Math.max(0,Math.min(Math.ceil(emojiSet.length/20)-1,emojiPage+(delta<0?1:-1)));drawEmojiPage();}},{passive:true});
    sheet.querySelector('#room-emoji-toggle')?.addEventListener('click',()=>{const opening=emojiPanel.classList.contains('hidden');if(opening){sheet.querySelector('#room-gift-panel').classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');sheet.querySelector('#room-game-center').classList.add('hidden');sheet.querySelector('#room-game-backdrop').classList.add('hidden');}emojiPanel.classList.toggle('hidden',!opening);sheet.querySelector('#room-emoji-backdrop').classList.toggle('hidden',!opening);});
    const gamePanel=sheet.querySelector('#room-game-center'),gameBackdrop=sheet.querySelector('#room-game-backdrop'),gameGrid=sheet.querySelector('#room-games-grid'),gameStage=sheet.querySelector('#room-game-stage');
    let roomGameChannel=null,roomGameSessionId=null,roomGameRendering=false,roomGameRefreshQueued=false;
    const closeRoomGames=()=>{if(state.roomGameTimer){clearInterval(state.roomGameTimer);state.roomGameTimer=null;}gamePanel.classList.add('hidden');gameBackdrop.classList.add('hidden');gameGrid.classList.remove('hidden');gameStage.classList.add('hidden');if(roomGameChannel){api.unsubscribeRoomChannel(roomGameChannel).catch(()=>{});roomGameChannel=null;}roomGameSessionId=null;};
    sheet.querySelector('#room-game-close').onclick=closeRoomGames;gameBackdrop.onclick=closeRoomGames;
    sheet.querySelector('#room-game-balance-refresh').onclick=async()=>{try{state.wallet=(await api.wallet()).wallet;sheet.querySelector('#room-game-balance').textContent=num(state.wallet?.balance);}catch(e){toast(e.message,'error');}};
    const showRoomGameSession=async(sessionId)=>{
      if(roomGameRendering){roomGameRefreshQueued=true;return;}roomGameRendering=true;
      try{
        const data=await api.roomGameState(sessionId);
        if(state.roomGameTimer){clearInterval(state.roomGameTimer);state.roomGameTimer=null;}
        const game=(roomGameGames||[]).find(x=>x.id===data.game_id),isHost=data.host_id===state.profile?.id,joined=(data.players||[]).some(x=>x.user_id===state.profile?.id),question=data.question;
        const serverNowMs=Date.parse(data.server_now)||Date.now(),questionStartedMs=Date.parse(data.question_started_at);
        const remainingSeconds=Number.isFinite(questionStartedMs)?Math.max(0,Math.ceil((30000-Math.max(0,serverNowMs-questionStartedMs))/1000)):0;
        gameGrid.classList.add('hidden');gameStage.classList.remove('hidden');
        const players=(data.players||[]).map((p,i)=>'<div class="hs-room-game-player"><span>'+(i+1)+'. '+esc(p.display_name||'عضو')+'</span><b>'+num(p.score)+' نقطة</b></div>').join('');
        let body='';
        if(data.status==='lobby'){
          body='<p class="text-sm text-center mb-3">بانتظار اللاعبين للانضمام</p><div class="hs-room-game-players">'+(players||'<p>لا يوجد لاعبون بعد</p>')+'</div>';
          if(!joined)body+='<button type="button" id="room-game-join" class="btn-gold w-full mt-3">انضم إلى الجولة</button>';
          if(isHost)body+='<button type="button" id="room-game-start" class="btn-gold w-full mt-3" '+((data.players||[]).length<2?'disabled':'')+'>ابدأ الجولة ('+num((data.players||[]).length)+'/2 على الأقل)</button><button type="button" id="room-game-cancel" class="btn-ghost w-full mt-2">إلغاء الجولة</button>';
        }else if(data.status==='active'&&question){
          const myAnswer=data.my_answer;
          body='<div class="hs-room-game-progress"><b>'+esc(game?.name||'تحدي الغرفة')+'</b><span>'+num(data.current_question_index+1)+' / '+num(data.question_count)+'</span></div><div class="hs-room-game-track"><i style="width:'+(((data.current_question_index+1)/data.question_count)*100)+'%"></i></div><div id="room-game-countdown" class="text-center text-sm text-amber-300 my-2" aria-live="polite">الوقت المتبقي: '+num(remainingSeconds)+' ث</div><h4>'+esc(question.question||'')+'</h4><div class="hs-room-game-options">'+(myAnswer?'<p class="text-sm text-center">'+(myAnswer.is_correct?'إجابة صحيحة! ✨':'تم تسجيل إجابتك، حظاً أوفر في السؤال التالي.')+'</p>':(question.options||[]).map((o,i)=>'<button type="button" data-group-answer="'+i+'">'+esc(o)+'</button>').join(''))+'</div><div class="hs-room-game-players mt-4">'+players+'</div>';
          if(isHost)body+='<button type="button" id="room-game-next" class="btn-gold w-full mt-3">'+(data.current_question_index+1>=data.question_count?'إنهاء الجولة':'السؤال التالي')+'</button><button type="button" id="room-game-cancel" class="btn-ghost w-full mt-2">إنهاء وإلغاء الجولة</button>';
          else if(myAnswer)body+='<p class="text-xs text-center mt-3 opacity-70">بانتظار المضيف للانتقال إلى السؤال التالي</p>';
        }else{
          body='<div class="hs-room-game-result"><div>'+(data.status==='cancelled'?'↩️':'🏆')+'</div><h4>'+(data.status==='cancelled'?'تم إلغاء الجولة':'انتهت الجولة!')+'</h4><div class="hs-room-game-players">'+players+'</div><p class="text-xs mt-3">'+(data.status==='cancelled'?'لم تُحتسب مكافآت أو عملات لهذه الجولة.':'تم حفظ نتائج هذه الجولة داخل الغرفة.')+'</p></div>';
        }
        gameStage.innerHTML='<div class="flex items-center justify-between mb-3"><span class="text-xs text-gold-300">'+esc(game?.name||'تحدي جماعي')+'</span><span class="text-xs opacity-60">'+(data.status==='lobby'?'ردهة الانتظار':data.status==='active'?'جولة مباشرة':'مكتملة')+'</span></div>'+body;
        if(data.status==='active'&&question){
          const deadline=questionStartedMs+30000-(serverNowMs-Date.now());
          const updateGameCountdown=()=>{
            const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));
            const timer=sheet.querySelector('#room-game-countdown');
            if(timer)timer.textContent=left>0?'الوقت المتبقي: '+num(left)+' ث':'انتهى وقت الإجابة';
            if(left===0){
              if(state.roomGameTimer){clearInterval(state.roomGameTimer);state.roomGameTimer=null;}
              gameStage.querySelectorAll('[data-group-answer]').forEach(button=>button.disabled=true);
            }
          };
          updateGameCountdown();
          if(remainingSeconds>0)state.roomGameTimer=window.setInterval(updateGameCountdown,250);
        }
        sheet.querySelector('#room-game-join')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await api.joinRoomGameSession(sessionId);await showRoomGameSession(sessionId);}catch(err){toast(err.message,'error');e.currentTarget.disabled=false;}});
        sheet.querySelector('#room-game-start')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await api.startRoomGameSession(sessionId);await showRoomGameSession(sessionId);}catch(err){toast(err.message,'error');e.currentTarget.disabled=false;}});
        sheet.querySelectorAll('[data-group-answer]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await api.answerRoomGameSession(sessionId,Number(button.dataset.groupAnswer));toast(result.is_correct?'إجابة صحيحة!':'تم تسجيل الإجابة.');await showRoomGameSession(sessionId);}catch(err){toast(err.message,'error');button.disabled=false;}});
        sheet.querySelector('#room-game-next')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await api.nextRoomGameQuestion(sessionId);await showRoomGameSession(sessionId);}catch(err){toast(err.message,'error');e.currentTarget.disabled=false;}});
        sheet.querySelector('#room-game-cancel')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await api.cancelRoomGameSession(sessionId);await showRoomGameSession(sessionId);}catch(err){toast(err.message,'error');e.currentTarget.disabled=false;}});
        if(roomGameChannel&&roomGameSessionId!==sessionId){await api.unsubscribeRoomChannel(roomGameChannel);roomGameChannel=null;}
        roomGameSessionId=sessionId;
        if(!roomGameChannel){roomGameChannel=api.subscribeRoomGame(sessionId,()=>showRoomGameSession(sessionId).catch(err=>toast(err.message,'error')));}
      }catch(e){toast(e.message,'error');}
      finally{roomGameRendering=false;if(roomGameRefreshQueued&&roomGameSessionId){roomGameRefreshQueued=false;Promise.resolve().then(()=>showRoomGameSession(roomGameSessionId));}}
    };
    let roomGameGames=[];
    const loadRoomGames=async()=>{
      gameGrid.innerHTML='<p class="text-xs opacity-70">جارٍ تحميل الألعاب...</p>';
      try{
        const result=await Promise.all([api.games(),api.findRoomGameSession(r.id)]);
        roomGameGames=result[0].games||[];
        if(result[1]){await showRoomGameSession(result[1].id);return;}
        gameStage.classList.add('hidden');gameGrid.classList.remove('hidden');
        gameGrid.innerHTML=roomGameGames.length?roomGameGames.map(g=>'<article class="hs-room-game-card"><span>'+esc(g.icon||'🎮')+'</span><b>'+esc(g.name)+'</b><small>'+esc(g.description||'لعبة من مجتمع همسات')+'</small><small class="hs-game-mode">تحدي جماعي مباشر · بلا خصم من المحفظة</small>'+(r.ownerUuid===state.profile?.uuid?'<button type="button" data-room-create="'+esc(g.id)+'">إنشاء جولة جماعية</button>':'<small>بانتظار مضيف الغرفة لإنشاء جولة</small>')+'</article>').join(''):'<p class="text-xs opacity-70">لا توجد ألعاب منشورة بعد.</p>';
        gameGrid.querySelectorAll('[data-room-create]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const id=await api.createRoomGameSession(r.id,b.dataset.roomCreate);await showRoomGameSession(id);}catch(e){toast(e.message,'error');b.disabled=false;}});
      }catch(e){gameGrid.innerHTML='<p class="text-xs text-rose-300">'+esc(e.message)+'</p>';}
    };
    sheet.querySelector('#room-game-center-toggle').onclick=()=>{emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');gamePanel.classList.remove('hidden');gameBackdrop.classList.remove('hidden');sheet.querySelector('#room-game-balance').textContent=num(state.wallet?.balance);loadRoomGames();};
    const bombPanel=sheet.querySelector('#room-bomb-panel'),bombBackdrop=sheet.querySelector('#room-bomb-backdrop');
    let roomBombEndsAt=null,bombExpiryHandled=false;
    const updateRoomBombCountdown=()=>{const el=sheet.querySelector('#room-bomb-countdown');if(!el)return;if(!roomBombEndsAt){el.textContent='بانتظار أول هدية';return;}const left=Math.max(0,roomBombEndsAt-Date.now());if(!left){el.textContent='انتهى الوقت · إعادة ضبط القنبلة';if(!bombExpiryHandled){bombExpiryHandled=true;drawRoomBomb();}return;}const total=Math.floor(left/1000),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60),seconds=total%60;el.textContent='متبقي '+hours+'س '+minutes+'د '+seconds+'ث';};
    const drawRoomBomb=async()=>{
      try{
        const data=await api.roomBombState(r.id),bomb=data.bomb||{level:1,progress:0},level=Number(bomb.level||1),config=(data.levels||[]).find(x=>Number(x.level)===level),threshold=Number(config?.threshold||5000),progress=Number(bomb.progress||0),percent=Math.min(100,Math.floor(progress/threshold*100));
        roomBombEndsAt=bomb.ends_at?new Date(bomb.ends_at).getTime():null;bombExpiryHandled=false;
        sheet.querySelector('#room-bomb-level').textContent='LV.'+level;sheet.querySelector('#room-bomb-percent').textContent=percent+'%';sheet.querySelector('#room-bomb-bar').style.width=percent+'%';sheet.querySelector('#room-bomb-floating').dataset.level=String(level);sheet.querySelector('#room-bomb-floating').style.setProperty('--bomb-level',String(level));
        sheet.querySelector('#room-bomb-panel-level').textContent='LV.'+level;sheet.querySelector('#room-bomb-panel-percent').textContent=percent+'%';sheet.querySelector('#room-bomb-panel-bar').style.width=percent+'%';
        sheet.querySelector('#room-bomb-levels').innerHTML=(data.levels||[]).map(x=>'<span class="'+(Number(x.level)<level?'done':Number(x.level)===level?'current':'')+'">LV.'+num(x.level)+'</span>').join('');
        sheet.querySelector('#room-bomb-top3').innerHTML=(data.contributors||[]).length?data.contributors.map((x,i)=>'<div class="hs-room-bomb-contributor"><b>'+(i+1)+'</b><span>'+(esc(x.profile?.displayName||'عضو'))+'</span><strong>'+num(x.points)+'</strong></div>').join(''):'<p>لا توجد مساهمات بعد.</p>';
        updateRoomBombCountdown();
      }catch(error){console.warn('Room bomb is waiting for its database migration:',error.message);}
    };
    const closeRoomBomb=()=>{bombPanel.classList.add('hidden');bombBackdrop.classList.add('hidden');};
    sheet.querySelector('#room-bomb-floating').onclick=()=>{bombPanel.classList.remove('hidden');bombBackdrop.classList.remove('hidden');drawRoomBomb();};
    sheet.querySelector('#room-bomb-close').onclick=closeRoomBomb;bombBackdrop.onclick=closeRoomBomb;
    sheet.querySelector('#room-settings-shortcut').onclick=()=>{const settingsTile=sheet.querySelector('#room-owner-menu [data-owner-action="settings"]');if(settingsTile){settingsTile.click();return;}toast('إعدادات الغرفة وإدارة الأعضاء متاحة للمضيفة فقط');};
    state.roomBombTimer=window.setInterval(updateRoomBombCountdown,1000);

    sheet.querySelector('#room-emoji-close')?.addEventListener('click',()=>{emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');});sheet.querySelector('#room-emoji-backdrop')?.addEventListener('click',()=>{emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');});
    const giftPanel=sheet.querySelector('#room-gift-panel'),giftForm=sheet.querySelector('#room-gift-form'),giftGrid=sheet.querySelector('#room-gift-grid'),giftSubmit=giftForm.querySelector('[type="submit"]'),giftBalanceLabel=sheet.querySelector('#room-gift-balance');
    let selectedGiftCategory='app',roomGiftRequestId=null;
    giftForm.elements.quantity.addEventListener('change',()=>{roomGiftRequestId=null;refreshGiftEstimate();});giftForm.elements.recipient.addEventListener('change',()=>{roomGiftRequestId=null;refreshGiftEstimate();});
    giftGrid.addEventListener('click',event=>{if(event.target.closest('[data-gift]'))roomGiftRequestId=null;});
    const refreshGiftEstimate=()=>{const gift=state.gifts?.find(item=>String(item.id)===String(giftForm.elements.gift.value));const recipient=giftForm.elements.recipient.value;if(giftBalanceLabel)giftBalanceLabel.innerHTML='<i data-lucide="wallet"></i><b>'+num(state.wallet?.balance||0)+'</b>';if(!gift){sheet.querySelector('#room-gift-selection').textContent='اختاري الهدية والمستلم للمتابعة';giftSubmit.disabled=true;icons_();return;}const qty=Number(giftForm.elements.quantity.value||1),count=recipient==='__all__'?Number(giftForm.elements.recipient.selectedOptions[0]?.dataset.count||1):1,total=Number(gift.price||0)*qty*count,balance=Number(state.wallet?.balance||0);sheet.querySelector('#room-gift-selection').textContent=gift.name+' · '+num(qty)+' هدية · الإجمالي '+num(total)+' عملة';giftSubmit.disabled=!recipient||total>balance;icons_();};
    const drawRoomGiftGrid=()=>{
      const filtered=(state.gifts||[]).filter(g=>(g.category||'app')===selectedGiftCategory);
      giftGrid.innerHTML=filtered.map(g=>'<button type="button" class="hs-gift-choice '+(String(g.id)===String(giftForm.elements.gift.value)?'selected':'')+'" data-gift="'+esc(g.id)+'" aria-pressed="'+(String(g.id)===String(giftForm.elements.gift.value))+'"><span class="hs-gift-choice-art">'+(g.image_url||g.imageUrl||g.image?'<img src="'+esc(g.image_url||g.imageUrl||g.image)+'" alt="'+esc(g.name)+'" loading="lazy">':'<i data-lucide="'+esc(g.icon||'gift')+'"></i>')+'</span><b>'+esc(g.name)+'</b><small>'+num(g.price)+' عملة</small><em>اختيار</em></button>').join('')||'<p class="text-xs opacity-70">لا توجد هدايا في هذا التصنيف حالياً</p>';
      giftGrid.querySelectorAll('[data-gift]').forEach(b=>b.setAttribute('aria-pressed',String(String(b.dataset.gift)===String(giftForm.elements.gift.value))));
      icons_();
    };
    sheet.querySelectorAll('#room-gift-categories [data-gift-category]').forEach(button=>button.onclick=()=>{selectedGiftCategory=button.dataset.giftCategory;giftForm.elements.gift.value='';roomGiftRequestId=null;sheet.querySelectorAll('#room-gift-categories [data-gift-category]').forEach(x=>x.classList.toggle('active',x===button));drawRoomGiftGrid();refreshGiftEstimate();});
    giftGrid.addEventListener('click',event=>{const button=event.target.closest('.hs-gift-choice[data-gift]');if(!button)return;const chosen=state.gifts?.find(g=>String(g.id)===String(button.dataset.gift));if(!chosen){toast('تعذّر العثور على بيانات الهدية. أعيدي فتح نافذة الهدايا.','error');return;}giftForm.elements.gift.value=String(chosen.id);giftGrid.querySelectorAll('.hs-gift-choice').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});roomGiftRequestId=null;refreshGiftEstimate();});
     const quickGift=sheet.querySelector('#room-send-gift-quick');if(quickGift)quickGift.onclick=()=>sheet.querySelector('#room-send-gift')?.click();
    sheet.querySelector('#room-send-gift').onclick=async()=>{
      try{
        const [{members},{seats},giftData,walletData]=await Promise.all([api.roomMembers(r.id),api.roomSeats(r.id),state.gifts?Promise.resolve({gifts:state.gifts}):api.gifts(),api.wallet()]);
        state.gifts=giftData.gifts;state.wallet=walletData.wallet;if(giftBalanceLabel)giftBalanceLabel.textContent='رصيدك الحالي: '+num(state.wallet.balance)+' عملة';
        const seatedIds=new Set(seats.map(x=>x.user_id));
        const seatNumbers=Object.fromEntries(seats.map(x=>[x.user_id,x.seat_no]));
        const recipientGrid=sheet.querySelector('#room-gift-recipient-grid');
        const renderRoomGiftRecipients=()=>{
          const seatedRecipients=members.filter(m=>seatedIds.has(m.userId));
          const recipients=[...seatedRecipients];
          if(state.profile?.uuid&&!recipients.some(m=>String(m.userId)===String(state.profile.uuid)))recipients.push({...state.profile,userId:state.profile.uuid});
          const options=recipients.map(m=>'<option value="'+esc(m.userId)+'">'+esc(m.displayName)+(seatedIds.has(m.userId)?' · مقعد '+num(seatNumbers[m.userId]||''):' · أنا')+'</option>');
          if(seatedRecipients.length)options.push('<option value="__all__" data-count="'+seatedRecipients.length+'">All · كل المايكات ('+num(seatedRecipients.length)+')</option>');
          giftForm.elements.recipient.innerHTML=options.join('')||'<option value="" selected disabled>لا يوجد أعضاء في الغرفة</option>';
          giftForm.elements.recipient.value=state.profile?.uuid||recipients[0]?.userId||'';
          recipientGrid.innerHTML=(seatedRecipients.length?'<button type="button" class="hs-gift-recipient hs-gift-recipient-all" data-gift-recipient="__all__" title="كل المايكات" aria-label="كل المايكات"><i data-lucide="users"></i></button>':'')+recipients.map(m=>'<button type="button" class="hs-gift-recipient '+(String(m.userId)===String(state.profile?.uuid)?'hs-gift-recipient-self':'')+'" data-gift-recipient="'+esc(m.userId)+'" title="'+esc(m.displayName)+'" aria-label="إرسال الهدية إلى '+esc(m.displayName)+'">'+avatar(m,42)+'<span class="sr-only">'+esc(m.displayName)+(String(m.userId)===String(state.profile?.uuid)?' · أنا':'')+'</span></button>').join('')||'<p class="text-xs opacity-70">لا يوجد أعضاء في الغرفة حالياً</p>';
          recipientGrid.querySelectorAll('[data-gift-recipient]').forEach(button=>button.onclick=()=>{
            giftForm.elements.recipient.value=button.dataset.giftRecipient;
            recipientGrid.querySelectorAll('.hs-gift-recipient').forEach(item=>item.classList.toggle('selected',item===button));
            roomGiftRequestId=null;refreshGiftEstimate();
          });
          recipientGrid.querySelectorAll('.hs-gift-recipient').forEach(button=>button.classList.toggle('selected',button.dataset.giftRecipient===giftForm.elements.recipient.value));
          if(!recipients.length)toast('لا يوجد أعضاء في الغرفة حالياً');
        };
        renderRoomGiftRecipients();
        sheet.querySelector('#room-gift-all').onclick=()=>{roomGiftRequestId=null;renderRoomGiftRecipients();const allOption=giftForm.elements.recipient.querySelector('option[value="__all__"]');if(!allOption){toast('لا يوجد أعضاء آخرون على المايك');return;}giftForm.elements.recipient.value='__all__';recipientGrid.querySelectorAll('.hs-gift-recipient').forEach(item=>item.classList.toggle('selected',item.dataset.giftRecipient==='__all__'));sheet.querySelector('#room-gift-selection').textContent='سيتم إرسال الهدية إلى جميع الجالسين على المايك';refreshGiftEstimate();};
        roomGiftRequestId=null;giftForm.elements.gift.value='';giftSubmit.disabled=true;
        sheet.querySelector('#room-gift-selection').textContent='اختاري هدية للمتابعة';
        selectedGiftCategory='app';sheet.querySelectorAll('#room-gift-categories [data-gift-category]').forEach(x=>x.classList.toggle('active',x.dataset.giftCategory==='app'));drawRoomGiftGrid();
        refreshGiftEstimate();emojiPanel.classList.add('hidden');sheet.querySelector('#room-emoji-backdrop').classList.add('hidden');sheet.querySelector('#room-game-center').classList.add('hidden');sheet.querySelector('#room-game-backdrop').classList.add('hidden');giftPanel.classList.remove('hidden');sheet.querySelector('#room-gift-backdrop').classList.remove('hidden');icons_();
      }catch(e){toast(e.message,'error');}
    };
    sheet.querySelector('#room-gift-close').onclick=()=>{giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');};sheet.querySelector('#room-gift-backdrop').onclick=()=>{giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');};
    giftForm.onsubmit=async e=>{e.preventDefault();const b=giftSubmit;if(!giftForm.elements.gift.value){toast('اختاري هدية أولاً');return;}const chosenId=String(giftForm.elements.gift.value),recipientId=giftForm.elements.recipient.value,gift=state.gifts?.find(g=>String(g.id)===chosenId);if(!gift){toast('اختاري هدية من الصور أولاً','error');return;}if(!recipientId){toast('اختاري مستلماً أولاً','error');return;}b.disabled=true;try{const v=Object.fromEntries(new FormData(giftForm)),quantity=Number(v.quantity||1);state.wallet=(await api.wallet()).wallet;const seatsNow=recipientId==='__all__'?(await api.roomSeats(r.id)).seats.filter(x=>x.user_id!==state.profile?.uuid).length:1,total=Number(gift.price||0)*quantity*seatsNow;if(total>Number(state.wallet?.balance||0))throw new Error('رصيدك الحالي غير كافٍ لهذه الهدية. رصيدك '+num(state.wallet?.balance||0)+' عملة.');if(recipientId==='__all__'&&!confirm('سيتم إرسال '+(gift.name||'الهدية')+' ×'+quantity+' إلى '+num(seatsNow)+' أعضاء. الإجمالي المتوقع: '+num(total)+' عملة. هل تريدين المتابعة؟'))return;if(!roomGiftRequestId)roomGiftRequestId=crypto.randomUUID();const recipientName=recipientId==='__all__'?'كل المايكات':members.find(m=>m.userId===recipientId)?.displayName||'العضو';const result=recipientId==='__all__'?await api.sendRoomGiftToAll(r.id,chosenId,quantity,roomGiftRequestId):await api.sendRoomGift(r.id,recipientId,chosenId,quantity,roomGiftRequestId);state.wallet=(await api.wallet()).wallet;if(giftBalanceLabel)giftBalanceLabel.innerHTML='<i data-lucide="wallet"></i><b>'+num(state.wallet.balance)+'</b>';roomGiftRequestId=null;giftPanel.classList.add('hidden');sheet.querySelector('#room-gift-backdrop').classList.add('hidden');toast('أرسلتِ '+num(quantity)+' × '+gift.name+' إلى '+recipientName+(result?.recipients_count?' · '+num(result.recipients_count)+' مستلم':''));api.sendRoomMessage(r.id,'🎁 '+(state.profile?.displayName||'عضو')+' أرسل '+num(quantity)+' × '+gift.name+' إلى '+recipientName).catch(error=>console.warn('Gift room notice could not be posted:',error));refreshGiftEstimate();}catch(err){toast(err.message,'error');}finally{b.disabled=false;}};
    drawRoomBomb();
    const del=sheet.querySelector('#del-room');if(del)del.onclick=async()=>{if(!confirm('هل تريد حذف هذه الغرفة؟'))return;del.disabled=true;try{await api.deleteRoom(r.id);closeSheet();toast('تم حذف الغرفة');render();}catch(e){toast(e.message,'error');del.disabled=false;}};
  });
}
let roomFilter = 'الكل';
const RECENT_ROOMS_LIMIT = 50;
function recentRoomsStorageKey() {
  const userId = state.profile?.uuid || state.account?.id || 'guest';
  return 'hamsat:recent-rooms:' + String(userId);
}
function readRecentRooms() {
  try {
    const value = JSON.parse(localStorage.getItem(recentRoomsStorageKey()) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') : [];
  } catch { return []; }
}
function rememberRecentRoom(room) {
  if (!room?.id) return;
  const entries = readRecentRooms().filter(item => item.id !== String(room.id));
  entries.unshift({
    id: String(room.id),
    title: String(room.title || 'غرفة همسات'),
    topic: String(room.topic || 'عام'),
    coverUrl: room.coverUrl || null,
    publicId: room.publicId || null,
    roomEmoji: room.roomEmoji || '🎙️',
    ownerName: room.ownerName || '',
    ownerUuid: room.ownerUuid || '',
    visitedAt: new Date().toISOString()
  });
  try { localStorage.setItem(recentRoomsStorageKey(), JSON.stringify(entries.slice(0, RECENT_ROOMS_LIMIT))); }
  catch (error) { console.warn('تعذّر حفظ سجل الغرف الأخيرة:', error); }
}
async function recentRoomsScreen() {
  screen.innerHTML = header('غرفي', '<button id="refresh-recent-rooms" class="btn-ghost text-sm py-2 px-3"><i data-lucide="refresh-cw" class="w-4 h-4"></i>تحديث</button>') + `
    <div class="px-4 pt-4 pb-6 fade-in">
      <section class="card p-4 mb-4">
        <span class="text-[10px] tracking-[.2em] text-gold-400">H A M S A T · MY ROOMS</span>
        <h2 class="text-lg font-extrabold mt-1">الغرف التي زرتِها مؤخرًا</h2>
        <p class="text-xs mt-1 leading-6">تجدين هنا آخر الغرف التي دخلتِ إليها، ويمكنك العودة إليها بضغطة واحدة.</p>
      </section>
      <div id="recent-room-list" class="hs-home-room-list space-y-3"><div class="skeleton h-32"></div></div>
    </div>`;
  icons_();
  const root = $('#recent-room-list');
  const draw = async () => {
    root.innerHTML = loading();
    try {
      const recent = readRecentRooms();
      if (!recent.length) {
        root.innerHTML = emptyBox('history', 'لم تدخلي أي غرفة بعد', 'عندما تدخلين غرفة صوتية ستظهر هنا تلقائيًا لتعودي إليها لاحقًا.');
        return;
      }
      const { rooms = [] } = await api.rooms();
      const byId = new Map(rooms.map(room => [String(room.id), room]));
      const ordered = recent.map(entry => ({ entry, room: byId.get(entry.id) || null }));
      root.innerHTML = ordered.map(({ entry, room }) => {
        if (room) return roomCard(room);
        const dateLabel = entry.visitedAt ? new Date(entry.visitedAt).toLocaleDateString('ar-DZ') : '';
        return `<article class="card recent-unavailable-card flex items-center gap-3 p-3" aria-label="غرفة زرتها سابقًا وغير متاحة الآن">
          <div class="recent-unavailable-icon">${esc(entry.roomEmoji || '🎙️')}</div>
          <div class="min-w-0 flex-1"><b class="block truncate">${esc(entry.title || 'غرفة همسات')}</b><p class="text-xs mt-1">${esc(entry.topic || 'عام')}${dateLabel ? ' · ' + esc(dateLabel) : ''}</p><small class="block mt-1">زرتِ هذه الغرفة سابقًا · غير متاحة الآن</small></div>
          <i data-lucide="clock-3" class="w-4 h-4"></i>
        </article>`;
      }).join('');
      bindRoomCards(root, ordered.filter(item => item.room).map(item => item.room));
      icons_();
    } catch (error) {
      root.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل غرفك الأخيرة', error.message || 'حاولي مرة أخرى');
      icons_();
    }
  };
  $('#refresh-recent-rooms').onclick = draw;
  await draw();
}
async function newRoomSheet() {
  try {
    const { rooms } = await api.rooms();
    const ownedRoom = rooms.find(room => String(room.ownerUuid || '').toLowerCase() === String(state.profile?.uuid || state.account?.id || '').toLowerCase());
    if (ownedRoom) {
      toast('يمكن لكل عضو إنشاء غرفة واحدة فقط. هذه غرفتك الحالية.');
      openRoom(ownedRoom);
      return;
    }
  } catch (error) {
    toast('تعذر التحقق من غرفتك الآن. حاولي مرة أخرى.', 'error');
    return;
  }
  openSheet(`
    <h2 class="text-lg font-bold mb-4">غرفة جديدة</h2>
    <form id="room-form" class="space-y-4">
      <div><label class="label">عنوان الغرفة</label><input name="title" class="field" maxlength="50" required placeholder="مثال: سهرة شعرية"></div>
      <div><label class="label">الموضوع</label><div id="topic-pick" class="flex flex-wrap gap-2">${TOPICS.map((t, i) => `<button type="button" data-t="${t}" class="chip ${i === 0 ? 'active' : ''}">${t}</button>`).join('')}</div><input type="hidden" name="topic" value="${TOPICS[0]}"></div>
      <div><label class="label">وصف قصير</label><textarea name="description" class="field resize-none" rows="3" maxlength="160" placeholder="اختياري"></textarea></div>
      <div><label class="label">صورة الغرفة</label><label class="photo-picker room-photo-picker"><i data-lucide="image-plus"></i><span>اختيار غلاف من الهاتف</span><input type="file" name="coverFile" accept="image/*" hidden></label><input type="hidden" name="coverUrl" value=""></div>
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
      <div class="card ornament p-4 mb-4"><p class="font-bold text-gold-300">تحديات همسات الجماعية</p><p class="text-xs text-[#c7bdab] leading-6 mt-1">اختاري لعبة منشورة، ثم ادخلي إحدى الغرف الصوتية لبدء جولة جماعية مع الأعضاء. النتائج تُحسب داخل الجولة فقط ولا تخصم من رصيد العملات.</p></div>
      <div id="games-grid" class="grid grid-cols-1 gap-3">${loading()}</div>
    </div>`;
  icons_();
  try {
    const games=(await api.games()).games||[];
    const root=$('#games-grid');
    root.innerHTML=games.length?games.map(g=>`
      <article class="card p-4 flex items-center gap-3">
        <div class="w-14 h-14 rounded-2xl bg-[#302713] border border-amber-400/30 flex items-center justify-center text-3xl">${esc(g.icon||'🎮')}</div>
        <div class="min-w-0 flex-1"><b class="block">${esc(g.name)}</b><p class="text-xs text-[#bba9d6] mt-1">${esc(g.description||'تحدي ممتع من مجتمع همسات')}</p><small class="text-[10px] text-gold-300">لعب جماعي مباشر داخل الغرف</small></div>
      </article>`).join(''):emptyBox('gamepad-2','لا توجد ألعاب منشورة','ستظهر الألعاب هنا بعد نشرها من لوحة الإدارة.');
    icons_();
  } catch(e) { $('#games-grid').innerHTML=emptyBox('wifi-off','تعذّر تحميل الألعاب',e.message); }
}

async function giftsScreen() {
  screen.innerHTML = header('الهدايا', `<a href="#/wallet" class="flex items-center gap-1.5 text-sm">${coin(18)}<span class="font-bold text-gold-300">${num(state.wallet?.balance)}</span></a>`) + `
    <div class="px-5 pt-4 pb-6 fade-in">
      <div class="rounded-2xl border border-dashed border-ink-500 p-4 flex gap-3 mb-5">
        <i data-lucide="info" class="w-5 h-5 text-gold-400 shrink-0 mt-0.5"></i>
        <p class="text-[13px] text-[#cbb9e6] leading-6">اختاري عضوًا من قائمة الأعضاء وافتحي ملفه لإرسال هدية. يتم خصم العملات وتحويلها عبر قاعدة البيانات بشكل آمن.</p>
      </div>
      <label for="gift-search" class="block text-xs font-semibold text-[#cbb9e6] mb-2">ابحثي عن هدية</label>
      <input id="gift-search" type="search" dir="rtl" autocomplete="off" placeholder="اكتبي اسم الهدية…" aria-label="البحث في الهدايا" class="w-full rounded-xl border border-[#6c5730] bg-[#17131f] px-4 py-3 text-sm text-white outline-none focus:border-amber-300 mb-3">
      <div id="gifts-grid" class="grid grid-cols-2 gap-3">${loading()}</div>
      <section class="mt-7"><div class="flex items-center justify-between mb-3"><h3 class="font-bold">اختاري عضوًا لإرسال هدية</h3><span id="gift-member-count" class="text-xs text-[#a993c8]"></span></div><label for="gift-member-search" class="sr-only">ابحثي عن عضو</label><input id="gift-member-search" type="search" dir="rtl" autocomplete="off" placeholder="ابحثي باسم العضو أو اسم المستخدم…" aria-label="البحث عن عضو لإرسال هدية" class="w-full rounded-xl border border-[#6c5730] bg-[#17131f] px-4 py-3 text-sm text-white outline-none focus:border-amber-300 mb-3"><div id="gift-members" class="space-y-2">${loading()}</div></section>
    </div>`;
  icons_();
  try {
    const [giftResult,memberResult]=await Promise.all([state.gifts?Promise.resolve({gifts:state.gifts}):api.gifts(),api.users()]);
    state.gifts=giftResult.gifts; const el=$('#gifts-grid');if(!el)return;
    const renderGiftCatalog=(query='')=>{
      const normalized=query.trim().toLocaleLowerCase('ar');
      const filtered=state.gifts.filter(g=>String(g.name||'').toLocaleLowerCase('ar').includes(normalized));
      el.innerHTML=filtered.length?filtered.map(g=>`<article class="gift-card card p-4 flex flex-col items-center text-center"><div class="gift-art gift-art-luxe"><i data-lucide="${esc(g.icon || 'gift')}"></i><span>✦</span></div><p class="font-bold">${esc(g.name)}</p><p class="flex items-center gap-1 text-sm text-gold-300 mt-1">${coin(16)}${num(g.price)}</p><small class="gift-card-note">هدية همسات</small></article>`).join(''):emptyBox('search','لا توجد هدايا مطابقة','جرّبي كتابة جزء آخر من اسم الهدية');
      icons_();
    };
    renderGiftCatalog();
    $('#gift-search')?.addEventListener('input',event=>renderGiftCatalog(event.target.value));
    const members=$('#gift-members');
    const giftRecipients=memberResult.users.filter(u=>u.uuid!==state.profile?.uuid);
    const renderGiftRecipients=(query='')=>{
      const normalized=query.trim().toLocaleLowerCase('ar');
      const filtered=giftRecipients.filter(u=>[u.displayName,u.handle].some(value=>String(value||'').toLocaleLowerCase('ar').includes(normalized)));
      $('#gift-member-count').textContent=`${num(filtered.length)} من ${num(giftRecipients.length)} عضو`;
      members.innerHTML=filtered.map(u=>`<a href="#/u/${encodeURIComponent(u.publicId || u.handle)}" class="gift-member-row card flex items-center gap-3 p-3">${avatar(u,42)}<span class="flex-1 min-w-0"><strong class="block text-sm truncate">${esc(u.displayName)}</strong><small class="text-xs text-[#a993c8]">@${esc(u.handle)}</small></span><span class="text-xs text-gold-300">إرسال هدية ←</span></a>`).join('')||emptyBox('search','لا يوجد عضو مطابق','جرّبي اسمًا آخر أو جزءًا من اسم المستخدم');
    };
    renderGiftRecipients();
    $('#gift-member-search')?.addEventListener('input',event=>renderGiftRecipients(event.target.value));
    icons_();
  } catch(e){const el=$('#gifts-grid');if(el){el.className='';el.innerHTML=emptyBox('wifi-off','تعذّر تحميل الهدايا',e.message);}const m=$('#gift-members');if(m)m.innerHTML=emptyBox('wifi-off','تعذّر تحميل الأعضاء',e.message);icons_();}
}


async function shopScreen() {
  screen.innerHTML = header('المتجر والمقتنيات', `<a href="#/wallet" class="text-sm text-gold-300">${coin(18)} ${num(state.wallet?.balance)}</a>`) + `
    <div class="px-5 pt-4 pb-8 fade-in">
      <div class="card ornament p-4 mb-4"><p class="font-bold text-gold-300">متجر همسات الملكي</p><p class="text-xs text-[#c7bdab] leading-6 mt-1">امتلكي إطارات لحسابك وحزم إيموجي وخلفيات للغرف. العناصر التي تشترينها تبقى محفوظة في مقتنياتك.</p></div>
      <div class="flex gap-2 mb-3"><button class="chip active" data-shop-tab="all">المتجر</button><button class="chip" data-shop-tab="owned">مقتنياتي</button></div>
      <div class="hs-shop-layout"><nav id="shop-category-tabs" class="hs-shop-category-tabs"><button type="button" class="active" data-shop-category="all">الكل</button><button type="button" data-shop-category="ride">الركوبة</button><button type="button" data-shop-category="frame">الإطار</button><button type="button" data-shop-category="special_id">ايدي مميز</button><button type="button" data-shop-category="ring">الخاتم</button><button type="button" data-shop-category="profile_frame">خلفية بطاقة البيانات</button><button type="button" data-shop-category="entrance">مؤثرات الدخولية</button></nav><div class="hs-shop-products"><label for="shop-search" class="sr-only">البحث في المتجر والمقتنيات</label><input id="shop-search" type="search" dir="rtl" autocomplete="off" placeholder="ابحثي عن عنصر…" aria-label="البحث في المتجر والمقتنيات" class="hs-shop-search"><div id="shop-grid" class="grid grid-cols-2 gap-3"></div></div></div>
    </div>`;
  icons_();
  let items=[],owned=[];
  try {
    const [catalog,inventory]=await Promise.all([api.shopItems(),api.inventory()]);
    items=catalog.items;owned=inventory.items;
  } catch(e) { $('#shop-grid').innerHTML=emptyBox('wifi-off','تعذّر تحميل المتجر',e.message);return; }
  let mode='all',category='all',searchQuery='';
  const draw=()=>{
    const baseList=mode==='owned'?owned:items;
    const query=searchQuery.trim().toLocaleLowerCase('ar');
    const list=baseList.filter(it=>(category==='all'||it.item_type===category)&&(!query||[it.name,it.rarity,it.item_type].some(value=>String(value||'').toLocaleLowerCase('ar').includes(query))));
    $('#shop-grid').innerHTML=list.length?list.map(it=>{
      const has=owned.some(o=>o.id===it.id);
      const visual=it.image_url?'<div class="cosmetic-preview"><img src="'+esc(it.image_url)+'" alt="'+esc(it.name)+'" loading="lazy" style="width:100%;height:100%;object-fit:contain;border-radius:12px"></div>':['frame','profile_frame','sound_frame'].includes(it.item_type)?'<div class="cosmetic-preview"><span class="cosmetic-avatar '+esc(it.visual_key)+'">هـ</span></div>':
        '<div class="cosmetic-preview emoji-preview">'+(it.visual_key==='love'?'💖 💗 💕':it.visual_key==='luxe'?'👑 💎 ✨':'🌙 ⭐ 🌟')+'</div>';
      const equippedId=({frame:state.profile?.equippedFrameId,profile_frame:state.profile?.equippedProfileFrameId,entrance:state.profile?.equippedEntranceId,chat_bubble:state.profile?.equippedBubbleId,special_id:state.profile?.equippedSpecialId,sound_frame:state.profile?.equippedSoundFrameId,voice_wave:state.profile?.equippedVoiceWaveId,emoji_pack:state.profile?.equippedEmojiPackId})[it.item_type];
      const equipped=has&&equippedId===it.id;const roomBackground=it.item_type==='room_background';const costLabel=Number(it.price)===0?'مجانية':num(it.price)+' عملة';
      const remaining=it.expiresAt?Math.max(0,Math.ceil((new Date(it.expiresAt).getTime()-Date.now())/86400000)):null;const expiry=it.expiresAt?'متبقي '+num(remaining)+' يوم':'دائم';
      return `<article class="card p-3 flex flex-col items-center text-center cosmetic-card">${visual}<p class="font-bold text-sm mt-2">${esc(it.name)}</p><span class="text-[10px] text-gold-300 mt-1">${esc(it.rarity)}</span><p class="text-xs text-[#c7bdab] mt-2">${has?expiry:costLabel}</p>
        <button class="btn-${has?(equipped?'ghost':'gold'):'gold'} w-full text-xs py-2 mt-3" data-item="${esc(it.id)}" data-type="${esc(it.item_type)}" data-owned="${has}" data-equipped="${equipped}">${roomBackground?(has?'اختيار من إعدادات الغرفة':'شراء الخلفية'):has?(equipped?'إلغاء الاستخدام':'استخدام'):'شراء'}</button></article>`;
    }).join(''):emptyBox('search',searchQuery?'لا توجد نتائج مطابقة':mode==='owned'?'لا توجد مقتنيات بعد':'لا توجد عناصر في هذا القسم',searchQuery?'جرّبي كلمة بحث أخرى':mode==='owned'?'تصفحي المتجر لاقتناء أول إطار أو حزمة إيموجي':'اختاري قسمًا آخر من أقسام المتجر');
    $('#shop-grid').querySelectorAll('[data-item]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{
        if(b.dataset.owned==='true'){if(b.dataset.type==='room_background'){toast('افتحي إعدادات غرفتك ثم اختاري الخلفية من قائمة الخلفيات المملوكة');}else if(b.dataset.equipped==='true'){await api.unequipShopItem(b.dataset.type);toast('تم إلغاء استخدام العنصر');}else{await api.equipShopItem(b.dataset.item);toast('تم تجهيز العنصر في حسابك');}if(b.dataset.type!=='room_background')state.profile=(await api.me()).profile;}
        else{await api.purchaseShopItem(b.dataset.item);state.wallet=(await api.wallet()).wallet;owned=(await api.inventory()).items;toast('تم الشراء وإضافة العنصر إلى مقتنياتك');}
        draw();
      }catch(e){toast(e.message,'error');b.disabled=false;}
    });
    icons_();
  };
  $('#shop-search')?.addEventListener('input',event=>{searchQuery=event.target.value;draw();});
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
  const levelDetails=`
    <div class="hs-level-card">
      <div class="hs-level-top"><span class="hs-level-emblem">✦</span><div><small>مستوى العضو</small><b>المستوى ${num(level)}</b></div><strong>${num(xp)} XP</strong></div>
      <div class="hs-level-track"><span style="width:${percent}%"></span></div>
      <div class="hs-level-foot"><span>${level>=10?'وصلتِ إلى أعلى مستوى حالياً':num(xp-start)+' نقطة في هذا المستوى'}</span><span>${level>=10?'MAX':num(next-xp)+' XP للمستوى التالي'}</span></div>
    </div>`;
  const badgeDetails=badges.length?'<div class="hs-badge-grid">'+badges.map(b=>`<div class="hs-badge-chip" title="${esc(b.description||'')}"><span>${esc(b.icon||'✦')}</span><b>${esc(b.name)}</b><small>${esc(b.rarity||'')}</small></div>`).join('')+'</div>':'<p class="hs-reward-empty">إنجازاتك الأولى بانتظارك — شاركي في الغرف وكوني صداقات.</p>';
  const itemDetails=items.length?'<div class="hs-collection-grid">'+items.map(item=>`<div class="hs-collection-item">${item.image_url?'<img src="'+esc(item.image_url)+'" alt="" loading="lazy">':'<span class="hs-collection-symbol">✧</span>'}<b>${esc(item.name)}</b><small>${esc(typeNames[item.item_type]||'عنصر')} · ${esc(item.rarity||'عادي')}</small>${(profile.equippedFrameId===item.id||profile.equippedEmojiPackId===item.id)?'<em>مجهز</em>':''}</div>`).join('')+'</div>':'<p class="hs-reward-empty">لا توجد مقتنيات بعد. اكتشفي المتجر لإضافة أول زينة إلى حسابك.</p>';
  host.innerHTML=`
    <div class="hs-profile-shortcuts" aria-label="اختصارات الحساب">
      <button type="button" data-reward-open="level"><i data-lucide="chart-no-axes-column-increasing"></i><b>المستوى</b><small>LV.${num(level)}</small></button>
      <button type="button" data-reward-open="badges"><i data-lucide="award"></i><b>الشارات والإنجازات</b><small>${num(badges.length)} شارة</small></button>
      <button type="button" data-reward-open="items"><i data-lucide="gem"></i><b>المقتنيات</b><small>${num(items.length)} عنصر</small></button>
    </div>`;
  host.querySelector('[data-reward-open="level"]').onclick=()=>openSheet('<h2 class="hs-profile-detail-title">المستوى</h2>'+levelDetails);
  host.querySelector('[data-reward-open="badges"]').onclick=()=>openSheet('<h2 class="hs-profile-detail-title">الشارات والإنجازات</h2>'+badgeDetails);
  host.querySelector('[data-reward-open="items"]').onclick=()=>openSheet('<h2 class="hs-profile-detail-title">المقتنيات</h2>'+itemDetails);
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
 const coverButton=root.querySelector('#edit-profile-cover');if(coverButton&&own)coverButton.onclick=()=>{
  const picker=document.createElement('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.hidden=true;root.appendChild(picker);
  picker.onchange=async()=>{
   const file=picker.files?.[0];picker.remove();if(!file)return;
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('اختاري صورة JPG أو PNG أو WEBP لا تتجاوز 5MB','error');return;}
   coverButton.disabled=true;
   try{
    const uploaded=await api.uploadMedia(file,'profile-covers');
    const saved=await api.saveProfile({...profile,coverUrl:uploaded.url});
    if(!saved?.profile?.coverUrl)throw new Error('لم يؤكد الخادم حفظ غلاف الحساب');
    Object.assign(profile,saved.profile);
    state.profile=saved.profile;
    const cover=root.querySelector('.hs-profile-cover');
    if(cover){
      cover.style.backgroundImage='linear-gradient(180deg,rgba(7,8,12,.02),rgba(7,8,12,.82)),url('+JSON.stringify(saved.profile.coverUrl)+')';
      let image=cover.querySelector('.hs-profile-cover-image');
      if(!image){image=document.createElement('img');image.className='hs-profile-cover-image';image.alt='غلاف الحساب';cover.prepend(image);}
      image.src=saved.profile.coverUrl;
    }
    toast('تم حفظ غلاف الحساب وإظهاره في ملفك');
   }catch(error){toast('تعذر حفظ غلاف الحساب: '+error.message,'error');}
   finally{coverButton.disabled=false;}
  };
  picker.click();
 };
 const share=root.querySelector('#share-profile-cover');if(share)share.onclick=async()=>{const url=location.origin+location.pathname+'#/u/'+encodeURIComponent(profile.handle||profile.publicId||'');try{if(navigator.share)await navigator.share({title:'HAMSAT',url});else{await navigator.clipboard.writeText(url);toast('تم نسخ رابط الحساب');}}catch(e){if(e.name!=='AbortError')toast(url);}};
 if(!own) await loadCoupleSpace(profile,own); else loadProfileMoments(profile.uuid,true);
 const form=root.querySelector('[data-moment-form]');if(form)form.onsubmit=async e=>{e.preventDefault();const body=form.elements.body.value.trim(),file=form.elements.momentImage.files?.[0],btn=form.querySelector('[type=submit]');btn.disabled=true;try{let imageUrl=null;if(file)imageUrl=(await api.uploadMedia(file,'moments')).url;if(!body&&!imageUrl)throw new Error('اكتبي شيئاً أو أضيفي صورة');await api.createMoment(body,imageUrl);form.reset();toast('تم نشر لحظتك');await loadProfileMoments(profile.uuid,true);}catch(err){toast(err.message,'error');}finally{btn.disabled=false;}};
}
async function loadProfileMoments(id,own){
 const host=document.querySelector('[data-moments-list]');if(!host)return;host.textContent='جارٍ تحميل اللحظات…';
 try{
  const {moments}=await api.moments(id);
  host.innerHTML=moments.length?moments.map(m=>'<article class="hs-moment-card" data-moment-card="'+esc(m.id)+'">'+(m.image_url?'<img src="'+esc(m.image_url)+'" alt="صورة لحظة" loading="lazy">':'')+(m.body?'<p>'+esc(m.body)+'</p>':'')+'<small>'+dateAr(new Date(m.created_at).getTime())+'</small>'+
   '<div class="hs-moment-social"><button type="button" data-moment-like="'+esc(m.id)+'" data-liked="'+(m.likedByMe?'true':'false')+'">'+(m.likedByMe?'♥':'♡')+' إعجاب · '+num(m.likesCount)+'</button><span>التعليقات · '+num(m.comments.length)+'</span></div>'+
   '<div class="hs-moment-comments">'+m.comments.map(c=>'<p><b>'+esc(c.profile?.display_name||'عضو')+'</b> '+esc(c.body)+'</p>').join('')+'</div>'+
   '<form data-moment-comment="'+esc(m.id)+'" class="hs-moment-comment-form"><input name="body" maxlength="500" placeholder="اكتبي تعليقاً…" required><button type="submit">إرسال</button></form>'+
   (own?'<button type="button" data-delete-moment="'+esc(m.id)+'">حذف</button>':'')+'</article>').join(''):'<div class="hs-moment-empty">لا توجد لحظات منشورة بعد.</div>';
  host.querySelectorAll('[data-moment-like]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api.toggleMomentLike(b.dataset.momentLike,b.dataset.liked==='true');await loadProfileMoments(id,own);}catch(e){toast(e.message,'error');b.disabled=false;}});
  host.querySelectorAll('[data-moment-comment]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await api.addMomentComment(form.dataset.momentComment,form.elements.body.value);await loadProfileMoments(id,own);}catch(err){toast(err.message,'error');button.disabled=false;}});
  host.querySelectorAll('[data-delete-moment]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف هذه اللحظة؟'))return;try{await api.deleteMoment(b.dataset.deleteMoment);await loadProfileMoments(id,own);}catch(e){toast(e.message,'error');}});
 }catch(e){host.innerHTML='<div class="hs-moment-empty">تعذر تحميل اللحظات: '+esc(e.message)+'</div>';}
}
async function loadCoupleSpace(profile,own){const host=document.querySelector('[data-couple-space]');if(!host)return;try{const {space,partner}=await api.coupleSpace(profile.uuid),title='<div class="hs-cp-title"><b>مساحة CP</b><small>مساحتكما المشتركة</small></div>';if(!space){host.innerHTML=title+(own?'<p class="hs-cp-empty">لا توجد مساحة CP مرتبطة بحسابك بعد.</p>':'<p class="hs-cp-empty">لا توجد مساحة CP لهذا العضو حالياً.</p><button type="button" class="btn-gold" data-cp-invite>إرسال دعوة CP</button>');host.querySelector('[data-cp-invite]')?.addEventListener('click',async()=>{try{await api.inviteCouple(profile.uuid);toast('تم إرسال دعوة CP');await loadCoupleSpace(profile,false);}catch(e){toast(e.message,'error');}});return;}host.innerHTML=title+'<div class="hs-cp-pair">'+avatar(profile,54)+'<span>♡</span>'+avatar(partner||{},54)+'</div><b class="hs-cp-names">'+esc(profile.displayName)+' & '+esc(partner?.displayName||'عضو')+'</b><small class="hs-cp-state">'+(space.status==='active'?'مرتبطان في همسات':'دعوة CP بانتظار الرد')+'</small>'+(space.status==='pending'&&space.partner_id===state.profile?.uuid?'<div class="hs-cp-actions"><button data-cp-accept>قبول</button><button data-cp-reject>رفض</button></div>':'')+(space.status==='active'&&own?'<button data-cp-end>إنهاء الارتباط</button>':'');host.querySelector('[data-cp-accept]')?.addEventListener('click',async()=>{await api.respondCoupleSpace(space.id,true);loadCoupleSpace(profile,own);});host.querySelector('[data-cp-reject]')?.addEventListener('click',async()=>{await api.respondCoupleSpace(space.id,false);loadCoupleSpace(profile,own);});host.querySelector('[data-cp-end]')?.addEventListener('click',async()=>{if(confirm('إنهاء مساحة CP؟')){await api.endCoupleSpace(space.id);loadCoupleSpace(profile,own);}});}catch(e){host.innerHTML='<div class="hs-cp-empty">تعذر تحميل مساحة CP: '+esc(e.message)+'</div>';}}

function profileView(p, own) {
  const avatarFrame = `
    <div class="hs-profile-frame">
      <div class="hs-profile-frame-glow"></div>
      <div class="hs-profile-avatar">${avatar(p, 104)}</div>
      <span class="hs-frame-spark hs-frame-spark-a">✦</span><span class="hs-frame-spark hs-frame-spark-b">✧</span>
    </div>`;
  return `
    <section class="hs-profile-page ${own?'hs-profile-own':''}" style="${p.backgroundUrl ? `background-image:linear-gradient(180deg,rgba(7,8,12,.38),rgba(7,8,12,.72)),url(${JSON.stringify(p.backgroundUrl)})` : ''}">
      <div class="hs-profile-cover" style="${p.coverUrl ? `background-image:linear-gradient(180deg,rgba(7,8,12,.02),rgba(7,8,12,.82)),url(${JSON.stringify(p.coverUrl)})` : ''}">
        ${p.coverUrl ? `<img class="hs-profile-cover-image" src="${esc(p.coverUrl)}" alt="غلاف الحساب" loading="eager">` : ''}
        <div class="hs-cover-shine"></div><span class="hs-cover-star">✧</span><div class="hs-cover-actions">${own?'<button type="button" id="edit-profile-cover"><i data-lucide="camera"></i></button>':''}<button type="button" id="share-profile-cover"><i data-lucide="share-2"></i></button></div>
      </div>
      <div class="hs-profile-main">
        ${avatarFrame}
        <div class="hs-profile-identity">
          <h2>${esc(p.displayName)} ${p.role==='admin'?'<span class="hs-admin-badge">ADMIN</span>':''}</h2>
          <p class="hs-profile-demographics">${p.age?num(p.age)+' سنة':''}${p.gender==='female'?' · ♀':p.gender==='male'?' · ♂':''}</p>
          <p dir="ltr">@${esc(p.handle)}</p>
          ${p.publicId ? `<div class="hs-profile-id-row" dir="ltr">${p.country ? `<span class="hs-profile-country-flag" title="${esc(p.country)}">${/الجزائر|algeria/i.test(p.country)?'🇩🇿':/tunisia/i.test(p.country)?'🇹🇳':/morocco/i.test(p.country)?'🇲🇦':/egypt/i.test(p.country)?'🇪🇬':'🌍'}</span>`:''}<button type="button" data-copy-public-id="${esc(p.publicId)}" class="hs-profile-id"><i data-lucide="copy"></i> ID: ${esc(p.publicId)}</button></div>` : ''}
          ${own ? profileStatsMarkup() : ''}
          ${own ? `<div class="hs-profile-quick-info">
            <a href="#/wallet" class="hs-profile-wallet-mini"><span><small>المحفظة</small><b>${coin(20)} ${num(state.wallet?.balance)}</b></span><i data-lucide="wallet"></i></a>
            <div class="hs-profile-level-mini">
              <a href="#/wallet" class="hs-profile-level-wealth"><i data-lucide="shield"></i><span>الثروة</span><b>LV.${num(p.wealthLevel || 0)}</b></a>
              <a href="#/aristocracy" class="hs-profile-level-vip"><i data-lucide="gem"></i><span>VIP</span><b>${p.vipLevel > 0 ? `VIP ${num(p.vipLevel)}` : '—'}</b></a>
              <a href="#/me" class="hs-profile-level-charisma"><i data-lucide="sparkles"></i><span>الكاريزما</span><b>LV.${num(p.charismaLevel || 0)}</b></a>
            </div>
          </div>` : ''}
          ${!own && p.bio ? `<p class="hs-profile-bio">${esc(p.bio)}</p>` : ''}
          ${!own ? `<div class="hs-profile-tags hs-profile-info-chips">
            ${p.role==='admin'?'<span class="hs-profile-info-chip"><i data-lucide="shield-check"></i> إدارة همسات</span>':''}
            ${p.vipLevel>0?'<span class="hs-profile-info-chip"><i data-lucide="crown"></i> VIP '+num(p.vipLevel)+'</span>':''}
            <span class="hs-profile-info-chip"><i data-lucide="gem"></i> ثروة ${num(p.wealthLevel)}</span>
            <span class="hs-profile-info-chip"><i data-lucide="sparkles"></i> كاريزما ${num(p.charismaLevel)}</span>
            <span class="hs-profile-info-chip"><i data-lucide="badge-check"></i> عضو في همسات</span>
            ${p.createdAt ? `<span class="hs-profile-info-chip"><i data-lucide="calendar-days"></i> منذ ${dateAr(p.createdAt)}</span>` : ''}
          </div>` : ''}
        </div>
      </div>
      ${own ? `
        <div class="hs-profile-dashboard">
          ${profileRewardsMarkup()}
          <section class="hs-moments-card hs-moments-shortcut">
            <button type="button" id="open-my-moments"><i data-lucide="images"></i><b>لحظاتي</b><small>عرض المنشورات</small></button>
          </section>
        </div>` : `
        <div class="hs-profile-ribbon"><span>✧</span><b>H A M S A T</b><span>♡</span></div>
        <div class="hs-profile-tabs"><button class="active" type="button" data-profile-tab="profile">الملف الشخصي</button><button type="button" data-profile-tab="moments">لحظة</button></div>
        <div data-profile-panel="profile">${profileStatsMarkup()}${profileRewardsMarkup()}<section class="hs-cp-card" data-couple-space><div class="hs-cp-title"><b>مساحة CP</b><small>مساحتكما المشتركة</small></div><div class="hs-cp-loading">جارٍ تحميل مساحة CP…</div></section></div>
        <section data-profile-panel="moments" class="hs-moments-panel" hidden><div data-moments-list class="hs-moments-list">جارٍ تحميل اللحظات…</div></section>
      `}
    </section>`;
}
function meScreen() {
 const p=state.profile||{}, wallet=Number(state.wallet?.balance||0), flag=p.country&&/الجزائر|algeria/i.test(p.country)?'🇩🇿':p.country&&/tunisia/i.test(p.country)?'🇹🇳':p.country&&/morocco/i.test(p.country)?'🇲🇦':p.country&&/egypt/i.test(p.country)?'🇪🇬':'🌍';
 const tiles=[['medal','ميدالية الشرف','#/honor'],['users-round','العائلة','#/family'],['store','المتجر','#/shop'],['heart-handshake','منزل CP','#/cp'],['mic-2','بيانات المضيف','#/host-data'],['target','مركز المهام','#/tasks']];
 const rows=[['history','سجل المكافآت','#/wallet'],['backpack','الأدوات والمقتنيات','#/inventory'],['message-square','التعليقات والاقتراحات','#/feedback'],['settings','الإعدادات','#/settings']];
 screen.innerHTML='<main class="hs-me-v2 hs-me-reference" dir="rtl">'+
 '<section class="hs-me-hero"><div class="hs-me-hero-glow"></div><div class="hs-me-hero-top"><span class="hs-me-brand-mark">HAMSAT <i>✦</i></span><button id="me-checkin" class="hs-me-checkin"><i data-lucide="calendar-check"></i><span>تسجيل الحضور</span></button></div>'+
 '<div class="hs-me-user"><div class="hs-me-avatar">'+avatar(p,82)+'</div><div class="hs-me-user-copy"><div class="hs-me-name">'+esc(p.displayName||'عضو همسات')+' <span>'+flag+'</span></div><div class="hs-me-handle" dir="ltr">@'+esc(p.handle||'hamsat_user')+'</div><button class="hs-me-uid" data-copy-public-id="'+esc(p.publicId||'')+'" dir="ltr"><i data-lucide="copy"></i> UID: '+esc(p.publicId||'—')+'</button><span class="hs-me-level"><i data-lucide="star"></i> LEVEL '+num(p.charismaLevel||1)+'</span></div></div>'+
 '<div class="hs-me-stats"><button data-profile-stat-go="following"><b data-profile-stat="following">—</b><span>Following</span></button><i></i><button data-profile-stat-go="fans"><b data-profile-stat="followers">—</b><span>Fans</span></button><i></i><button><b>'+num(p.charismaLevel||0)+'</b><span>Charisma</span></button></div></section>'+
 '<section class="hs-me-wallet-banner"><div class="hs-me-wallet-art" aria-hidden="true"><span class="hs-wallet-coin coin-a">✦</span><span class="hs-wallet-coin coin-b">✦</span><span class="hs-wallet-bag"><i data-lucide="coins"></i></span></div><div class="hs-me-wallet-copy"><small>محفظة همسات</small><strong>'+num(wallet)+' <em>Coins</em></strong><span>رصيدكِ وإدارة العملات</span></div><span class="hs-me-first-tag">FIRST RECHARGE</span><a href="#/wallet" class="hs-me-wallet-open" aria-label="فتح المحفظة"><i data-lucide="chevron-left"></i></a></section>'+
 '<div class="hs-me-level-cards"><a href="#/aristocracy" class="hs-me-vip-card"><span class="hs-metal-icon"><i data-lucide="crown"></i></span><small>عضوية VIP</small><b>'+(p.vipLevel>0?'VIP '+num(p.vipLevel):'VIP')+'</b><em>اكتشفي امتيازاتكِ</em></a><a href="#/wallet" class="hs-me-wealth-card"><span class="hs-metal-icon"><i data-lucide="gem"></i></span><small>مستوى الثروة</small><b>LV. '+num(p.wealthLevel||0)+'</b><em>تقدّم مستوى الثروة</em></a></div>'+
 '<a href="#/wallet" class="hs-me-spin-banner"><div class="hs-me-wheel-art"><span class="hs-wheel-center">✦</span><i></i></div><div class="hs-me-cash"><small>PURPLE LUCKY SPIN</small><b>Cash-out</b><span>تحويل الألماس إلى نقد</span><strong>$0 <em>=</em> 0</strong><small>Only 900000 left to withdraw</small><i class="hs-spin-progress"><span></span></i></div><i data-lucide="chevron-left" class="hs-spin-arrow"></i></a>'+
 '<section class="hs-me-quick-card"><div class="hs-me-section-heading"><div><small>HAMSAT SERVICES</small><h2>الوصول السريع</h2></div><span>06</span></div><div class="hs-me-quick-grid">'+tiles.map((x,i)=>'<a href="'+x[2]+'" class="hs-me-service hs-me-service-'+i+'"><span><i data-lucide="'+x[0]+'"></i></span><b>'+x[1]+'</b></a>').join('')+'</div></section>'+
 '<section class="hs-me-settings-card"><div class="hs-me-section-heading"><div><small>ACCOUNT & SUPPORT</small><h2>الحساب والخدمات</h2></div><i data-lucide="sliders-horizontal"></i></div>'+rows.map(x=>'<a href="'+x[2]+'"><span><i data-lucide="'+x[0]+'"></i></span><b>'+x[1]+'</b><i data-lucide="chevron-left" class="hs-me-chevron"></i></a>').join('')+'<button id="me-logout"><span><i data-lucide="log-out"></i></span><b>تسجيل الخروج</b><i data-lucide="chevron-left" class="hs-me-chevron"></i></button></section><div class="hs-me-footer">H A M S A T <i>✦</i></div></main>';
 icons_(); loadProfileStats(p.uuid,false);
 const copy=$('[data-copy-public-id]');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(p.publicId||'');toast('تم نسخ UID');}catch(e){toast(p.publicId||'لا يوجد UID');}};
 $('#me-checkin').onclick=dailyCheckinSheet;
 $('#me-logout').onclick=()=>openSheet('<h2 class="font-bold mb-2">تسجيل الخروج</h2><p class="text-sm mb-4">هل تريدين تسجيل الخروج من همسات؟</p><div class="grid grid-cols-2 gap-2"><button data-close class="btn-ghost">إلغاء</button><button id="confirm-me-logout" class="btn-danger">تسجيل الخروج</button></div>',s=>s.querySelector('#confirm-me-logout').onclick=signOut);
 document.querySelectorAll('[data-profile-stat-go]').forEach(x=>x.onclick=()=>location.hash='#/friends');
}
function dailyCheckinSheet(){
 const rewards=[24,30,36,45,54,72,90];
 openSheet('<div class="hs-checkin-sheet"><h2>مكافأة الحضور الأسبوعية</h2><p>اليوم 1 إلى اليوم 7</p><div class="hs-checkin-days">'+rewards.map((v,i)=>'<div class="hs-checkin-day"><small>اليوم '+(i+1)+'</small><b>✦ '+v+'</b><span>عملة</span></div>').join('')+'</div><p class="hs-checkin-note">مكافأة الخادم الحالية: '+num(state.wallet?.dailyReward||20)+' عملة. لم يتم تغيير اقتصاد العملات أو جدول الصرف.</p><button id="claim-current-daily" class="btn-gold w-full">استلام المكافأة اليومية الحالية</button></div>',s=>s.querySelector('#claim-current-daily').onclick=async e=>{const btn=e.currentTarget;btn.disabled=true;try{const r=await api.claimDaily();state.wallet=r.wallet;closeSheet();toast('تم استلام المكافأة');meScreen();}catch(err){toast(err.message,'error');btn.disabled=false;}});
}
function mePage(title,body){screen.innerHTML=header(title)+'<main class="hs-me-subpage" dir="rtl">'+body+'</main>';icons_();}
async function cpHouseScreen(){
 mePage('المنزل CP','<section class="hs-cp-house"><button id="cp-help" class="hs-cp-help">؟</button><div class="hs-cp-palace">🏰</div><div class="hs-cp-mascot">🥺</div><h2>ليس لديكِ CP بعد</h2><p>ابحثي عن شخص مميز وابدئي مساحة مشتركة.</p><a href="#/friends" class="hs-cp-meet">للقاء أصدقاء جدد</a></section>');
 $('#cp-help').onclick=()=>openSheet('<h2 class="font-bold">مساحة CP</h2><p class="text-sm">مساحة مشتركة بينك وبين صديق بعد قبول الدعوة.</p>');
 try{const r=await api.coupleSpace(state.profile.uuid);if(r.space&&r.partner){$('.hs-cp-house h2').textContent=r.space.status==='active'?'لديكِ مساحة CP':'دعوة CP بانتظار الرد';$('.hs-cp-house p').textContent=r.partner.displayName||'شريك CP';}}catch(e){console.warn(e);}
}
function honorScreen(){
 mePage('ميدالية الشرف','<section class="hs-honor-page"><div class="hs-honor-medal">🏅</div><h2>ميدالية الشرف</h2><div class="hs-honor-slots">'+Array.from({length:5},()=>'<span>＋</span>').join('')+'</div><div class="hs-honor-counters"><span><b>C</b><small>0</small></span><span><b>B</b><small>0</small></span><span><b>A</b><small>0</small></span><span><b>S</b><small>0</small></span></div><div class="hs-honor-tabs"><button class="active" data-honor="achievement">ميداليات الإنجاز</button><button data-honor="activity">ميداليات النشاط</button></div><div class="hs-honor-empty">لا توجد ميداليات مسجلة بعد.</div></section>');
 document.querySelectorAll('[data-honor]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-honor]').forEach(x=>x.classList.toggle('active',x===b));$('.hs-honor-empty').textContent=b.dataset.honor==='achievement'?'لا توجد ميداليات إنجاز بعد.':'لا توجد ميداليات نشاط بعد.';});
}
function familyScreen(){
 mePage('ترتيب العائلة للشهر','<section class="hs-family-page"><div class="hs-family-countdown">الوقت المتبقي <b>— : — : —</b></div><h2>أفضل العائلات</h2><div class="hs-family-podium"><div class="hs-family-place second"><span>🥈</span><b>TOP 2</b><small>— EXP</small></div><div class="hs-family-place first"><span>👑</span><b>TOP 1</b><small>— EXP</small></div><div class="hs-family-place third"><span>🥉</span><b>TOP 3</b><small>— EXP</small></div></div><p class="hs-family-empty">ترتيب العائلات يحتاج إلى ربط بيانات الخادم.</p><div class="hs-family-actions"><button id="family-create">إنشاء</button><button id="family-join">إنضم إلى</button></div></section>');
 $('#family-create').onclick=()=>toast('خدمة إنشاء العائلات غير مربوطة بالخادم بعد.');$('#family-join').onclick=()=>toast('خدمة العائلات غير مربوطة بالخادم بعد.');
}
function tasksScreen(){
 mePage('مركز المهام','<section class="hs-tasks-page"><div class="hs-task-rewards"><div><small>اليوم</small><b>—</b></div><div><small>الأسبوع الحالي</small><b>—</b></div></div><div class="hs-task-tabs"><button class="active" data-task="host">المضيف</button><button data-task="daily">يومياً</button></div><article class="hs-task-card"><span>🎙️</span><div><b>تحدثي على المايك لمدة ساعة</b><small>0 / 60 دقيقة</small><i><em></em></i></div><button disabled>غير مفعّل</button></article><p class="hs-task-note">واجهة المهام جاهزة؛ احتساب التقدم والمكافآت يحتاج إلى خدمة مهام موثقة.</p></section>');
 document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-task]').forEach(x=>x.classList.toggle('active',x===b));});
}
async function hostDataScreen(){
 mePage('بيانات المضيف','<section class="hs-host-data"><div class="hs-host-overview"><span>معلومات المضيف</span><b>'+esc(state.profile.displayName||'عضو')+'</b><small>حالة الوكالة: جارٍ التحقق</small><strong>50,000 / ساعة</strong><div class="hs-host-progress"><i></i></div><small>تقدم الترقية</small></div><button id="host-range">آخر 30 يوماً ▾</button><h3>ملخص الماسات</h3><div class="hs-host-grid">'+[['إجمالي الدخل','—'],['الاستهلاك','—'],['الراتب الأساسي','—'],['الهدايا','—'],['المهام','—']].map(x=>'<div><small>'+x[0]+'</small><b>'+x[1]+'</b></div>').join('')+'</div><p class="hs-task-note">بيانات المضيف التفصيلية غير متاحة حتى ربط سجل الاستحقاقات.</p></section>');
 $('#host-range').onclick=()=>openSheet('<h2 class="font-bold mb-3">الفترة الزمنية</h2><div class="grid grid-cols-2 gap-2"><button class="btn-ghost" data-close>7 أيام</button><button class="btn-ghost" data-close>30 يوماً</button><button class="btn-ghost" data-close>هذا الشهر</button><button class="btn-ghost" data-close>الشهر السابق</button></div>');
 try{const r=await api.myAgencies();const ag=(r.agencies||[]).find(x=>['hosts','both'].includes(x.agency_type));if(ag){const s=await api.agencyHostStats(ag.id);const own=(s.stats||[]).filter(x=>x.host_id===state.profile.uuid);const total=own.reduce((n,x)=>n+Number(x.gift_coins||0),0);$('.hs-host-grid div:first-child b').textContent=num(total);$('.hs-host-grid div:nth-child(4) b').textContent=num(total);$('.hs-host-overview small').textContent='حالة الوكالة: '+ag.status;}}catch(e){console.warn(e);}
}
function settingsScreen(){
 const items=[['bell','إشعار الرسالة','notify'],['link','ربط الحساب','bind'],['languages','إعداد اللغة','language'],['info','حول','about'],['message-square','التعليقات والاقتراحات','feedback'],['ban','القائمة السوداء','blacklist'],['shield-check','بيان الخصوصية','privacy']];
 mePage('إعدادات','<section class="hs-settings-page">'+items.map(x=>'<button data-setting="'+x[2]+'"><i data-lucide="'+x[0]+'"></i><b>'+x[1]+'</b><i data-lucide="chevron-left" class="hs-me-chevron"></i></button>').join('')+'<button id="settings-logout" class="hs-settings-logout">تسجيل الخروج</button></section>');
 document.querySelectorAll('[data-setting]').forEach(b=>b.onclick=()=>{const k=b.dataset.setting;if(k==='notify'){const on=localStorage.getItem('hamsat:message-notifications')!=='off';localStorage.setItem('hamsat:message-notifications',on?'off':'on');toast(on?'تم إيقاف التفضيل المحلي':'تم تفعيل التفضيل المحلي');}else if(k==='feedback')location.hash='#/feedback';else if(k==='language')openSheet('<h2 class="font-bold mb-3">إعداد اللغة</h2><button class="btn-gold w-full" data-close>العربية</button>');else openSheet('<h2 class="font-bold mb-2">'+(k==='privacy'?'بيان الخصوصية':k==='blacklist'?'القائمة السوداء':k==='about'?'حول همسات':'ربط الحساب')+'</h2><p class="text-sm">هذه الخدمة تحتاج إلى ربط إعداداتها بالخادم.</p>');});
 $('#settings-logout').onclick=()=>openSheet('<h2 class="font-bold mb-3">تسجيل الخروج</h2><button id="settings-confirm-out" class="btn-danger w-full">تأكيد تسجيل الخروج</button>',s=>s.querySelector('#settings-confirm-out').onclick=signOut);
}
function feedbackScreen(){mePage('التعليقات والاقتراحات','<form id="me-feedback-form" class="hs-feedback-page"><label>نوع الملاحظة<select name="type" class="field"><option>اقتراح</option><option>مشكلة تقنية</option><option>شكوى</option></select></label><label>التفاصيل<textarea name="body" class="field" rows="5" required maxlength="1500" placeholder="اكتبي ملاحظتك"></textarea></label><button class="btn-gold w-full">إرسال</button><p class="hs-task-note">خدمة إرسال الملاحظات تحتاج إلى endpoint دعم.</p></form>');$('#me-feedback-form').onsubmit=e=>{e.preventDefault();toast('خدمة إرسال الملاحظات غير مربوطة بالخادم بعد.','error');};}
function inventoryScreen(){mePage('أدوات','<div id="me-inventory" class="hs-inventory-list">جارٍ تحميل المقتنيات…</div>');api.inventory().then(r=>{const el=$('#me-inventory');if(!el)return;el.innerHTML=(r.items||[]).length?r.items.map(x=>'<article><b>'+esc(x.name)+'</b><small>'+esc(x.item_type||'عنصر')+'</small></article>').join(''):'لا توجد مقتنيات بعد.';}).catch(e=>{$('#me-inventory').textContent=e.message;});}

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
        <button id="send-gift" class="btn-gold w-full"><i data-lucide="gift" class="w-5 h-5"></i>إرسال هدية</button><div class="grid grid-cols-2 gap-2"><button id="block-user" class="btn-ghost w-full">حظر المستخدم</button><button id="report-user" class="btn-ghost w-full">إبلاغ</button></div>
      </div></div>`;
  } catch (e) { $('#user-body').innerHTML = `<div class="p-5">${emptyBox('user-x', 'المستخدم غير موجود', e.message)}</div>`; }
  icons_();
  if (profile) { loadProfileStats(profile.uuid, true); loadProfileRewards(profile.uuid,profile); bindProfileSocial(profile,false); }
  const idCopy=$('[data-copy-public-id]');
  if(idCopy) idCopy.onclick=async()=>{try{await navigator.clipboard.writeText(profile.publicId);toast('تم نسخ ID المستخدم');}catch(e){toast(profile.publicId);}};

  if(profile){
    try{
      const blockState=await api.blockState(profile.uuid),blockBtn=$('#block-user');
      if(blockBtn){blockBtn.textContent=blockState.blocked?'إلغاء الحظر':'حظر المستخدم';blockBtn.onclick=async()=>{try{if(blockState.blocked){await api.unblockUser(profile.publicId);toast('تم إلغاء الحظر');}else{if(!confirm('هل تريدين حظر هذا المستخدم؟ لن تتمكني من مراسلته ما دام الحظر مفعلاً.'))return;await api.blockUser(profile.publicId);toast('تم حظر المستخدم');}userScreen(handle);}catch(e){toast(e.message,'error');}};}
      const reportBtn=$('#report-user');if(reportBtn)reportBtn.onclick=()=>openSheet('<h2 class="text-lg font-bold mb-3">الإبلاغ عن حساب</h2><form id="report-user-form" class="space-y-3"><label class="label">سبب البلاغ<select class="field" name="reason"><option>إساءة أو مضايقة</option><option>انتحال شخصية</option><option>محتوى غير مناسب</option><option>احتيال أو طلب أموال</option><option>رسائل مزعجة</option><option>سبب آخر</option></select></label><label class="label">تفاصيل إضافية<textarea class="field" name="details" rows="3" maxlength="2000" placeholder="اكتبي ما حدث باختصار"></textarea></label><button class="btn-gold w-full" type="submit">إرسال البلاغ</button></form>',sheet=>{sheet.querySelector('#report-user-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{await api.reportUser(profile.publicId,f.elements.reason.value,f.elements.details.value);closeSheet();toast('تم إرسال البلاغ إلى الإدارة');}catch(err){toast(err.message,'error');b.disabled=false;}};});
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
          let directGiftRequestId = null;
          let directGiftRequestSignature = null;
          form.onsubmit = async e => {
            e.preventDefault();
            const button = form.querySelector('[type="submit"]');
            const values = Object.fromEntries(new FormData(form));
            const quantity = Number(values.quantity);
            const signature = JSON.stringify([profile.uuid, values.giftId, quantity]);
            if (directGiftRequestId && directGiftRequestSignature !== signature) {
              toast('لم يتأكد الإرسال السابق بعد. أعيدي المحاولة بنفس الهدية والكمية أو أغلقي النافذة وافتحيها لبدء طلب جديد.', 'error');
              return;
            }
            if (!directGiftRequestId) {
              directGiftRequestId = crypto.randomUUID();
              directGiftRequestSignature = signature;
            }
            button.disabled = true;
            try {
              // Keep the same request UUID across retries, including wallet refresh failures.
              await api.sendGift(profile.uuid, values.giftId, quantity, directGiftRequestId);
              state.wallet = (await api.wallet()).wallet;
              const sentGift = state.gifts.find(g => g.id === values.giftId);
              closeSheet();
              showGiftCelebration(sentGift, quantity);
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
  const [requestResult,friendsResult]=await Promise.allSettled([api.friendRequests(),api.friends()]);
  if(requestResult.status==='fulfilled'){
    const requests=requestResult.value;
    $('#friend-request-count').textContent=requests.incoming.length+' واردة';
    requestsRoot.innerHTML=requests.incoming.length?requests.incoming.map(x=>`<div class="card p-3 flex items-center gap-2">${avatar(x.user,42)}<div class="flex-1 min-w-0"><b>${esc(x.user.displayName)}</b><small class="block text-xs opacity-70">@${esc(x.user.handle)} · ${esc(x.user.publicId || "")}</small></div><button class="btn-gold px-3 py-2 text-xs" data-accept="${esc(x.id)}">قبول</button><button class="btn-ghost px-3 py-2 text-xs" data-reject="${esc(x.id)}">رفض</button></div>`).join(''):'<p class="text-sm opacity-70 p-3">لا توجد طلبات جديدة.</p>';
    requestsRoot.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{try{await api.respondFriendRequest(b.dataset.accept,true);toast('تمت إضافة الصديق');friendsScreen();}catch(e){toast(e.message,'error');}});
    requestsRoot.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{try{await api.respondFriendRequest(b.dataset.reject,false);toast('تم رفض الطلب');friendsScreen();}catch(e){toast(e.message,'error');}});
  }else{requestsRoot.innerHTML=emptyBox('wifi-off','تعذّر تحميل الطلبات',requestResult.reason?.message||'حاولي مجدداً');}
  if(friendsResult.status==='fulfilled'){
    const friends=friendsResult.value.friends||[];
    friendsRoot.innerHTML=friends.length?friends.map(u=>`<a href="#/u/${encodeURIComponent(u.publicId || u.handle)}" class="card p-3 flex items-center gap-3">${avatar(u,44)}<span class="flex-1 min-w-0"><b class="block">${esc(u.displayName)}</b><small class="opacity-70">@${esc(u.handle)}</small></span><span class="text-xs text-gold-300">عرض الملف ←</span></a>`).join(''):'<p class="text-sm opacity-70 p-3">لا توجد صداقات مؤكدة بعد. ستظهر هنا الحسابات التي تقبلين طلب صداقتها أو تقبل طلبك.</p>';
  }else{friendsRoot.innerHTML=emptyBox('wifi-off','تعذّر تحميل الأصدقاء',friendsResult.reason?.message||'حاولي مجدداً');}
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
  const activeTab = route === 'inbox' ? 'chat' : ['rooms','activities'].includes(route) ? 'home' : route;
  tabbar.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
  window.scrollTo(0, 0);

  try {


async function agencyScreen(){
  screen.innerHTML=header('مركز الوكالة')+'<div class="p-4" id="agency-root">'+loading()+'</div>';icons_();
  const root=$('#agency-root');
  try{
    const {agencies}=await api.myAgencies();
    if(!agencies.length){root.innerHTML=emptyBox('building-2','لا توجد وكالة مرتبطة بحسابك','إذا كنتِ صاحبة وكالة أو وكيلة، يجب أن تضيف الإدارة حسابك إلى الوكالة أولاً.');return;}
    const agency=agencies[0],role=agency.memberRole,canManage=role==='owner'||role==='manager',canRecharge=['owner','manager','agent'].includes(role)&&['recharge','both'].includes(agency.agency_type);
    const [finance,rechargeData,packageData,memberData,hostStatsData]=await Promise.all([api.agencyFinance(agency.id,canManage),canRecharge?api.agencyRecharges(agency.id):Promise.resolve({recharges:[]}),api.topupPackages(),canManage?api.agencyMembers(agency.id):Promise.resolve({members:[]}),(agency.agency_type==='hosts'||agency.agency_type==='both')?api.agencyHostStats(agency.id).catch(()=>({stats:[]})):Promise.resolve({stats:[]})]);
    const packages=packageData.packages||[],recharges=rechargeData.recharges||[],members=memberData.members||[],hostStats=hostStatsData.stats||[];
    const hostGroups=Object.values(hostStats.reduce((acc,x)=>{const id=x.host_id;if(!acc[id])acc[id]={profile:x.profile,live_seconds:0,gift_coins:0,session_count:0};acc[id].live_seconds+=Number(x.live_seconds||0);acc[id].gift_coins+=Number(x.gift_coins||0);acc[id].session_count+=Number(x.session_count||0);return acc;},{}));
    root.innerHTML='<div class="space-y-4">'+
      '<section class="card p-4"><div class="flex items-center justify-between gap-3"><div><small class="text-amber-300">HAMSAT AGENCY</small><h2 class="text-xl font-bold mt-1">'+esc(agency.name)+'</h2><p class="text-xs opacity-70 mt-1">'+(agency.agency_type==='recharge'?'وكالة شحن':agency.agency_type==='hosts'?'وكالة مضيفين':'وكالة شحن ومضيفين')+' · '+(role==='owner'?'المالكة':role==='manager'?'مديرة':role==='agent'?'وكيلة':'مضيفة')+'</p></div><span class="pill">'+esc(agency.status)+'</span></div></section>'+
      '<div class="grid grid-cols-2 gap-3">'+(canManage?'<div class="card p-3"><small>رصيد الوكالة</small><b class="block text-lg text-amber-300 mt-1">'+num(finance.agencyBalance||0)+' دج</b></div>':'')+'<div class="card p-3"><small>عمولتي</small><b class="block text-lg text-amber-300 mt-1">'+num(finance.agentBalance||0)+' دج</b></div></div>'+
      (canRecharge?'<section class="card p-4"><h3 class="font-bold mb-3">شحن لاعب عبر الوكالة</h3><form id="agency-recharge-form" class="space-y-3"><label class="block text-sm">المعرّف العام للاعب<input class="field mt-1" name="public_id" type="number" required placeholder="أدخلي ID اللاعب"></label><label class="block text-sm">باقة الشحن<select class="field mt-1" name="package_id" required>'+packages.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+num(p.coins)+' عملة · '+num(p.price_dzd)+' دج</option>').join('')+'</select></label><label class="block text-sm">طريقة استلام الدفع<input class="field mt-1" name="payment_method" required placeholder="نقداً أو طريقة الدفع المتفق عليها"></label><label class="block text-sm">مرجع/رقم الإيصال<input class="field mt-1" name="payment_reference" required minlength="4" placeholder="رقم الإيصال لمنع التكرار"></label><button class="btn-gold w-full" type="submit" '+(!packages.length?'disabled':'')+'>تأكيد الشحن وإضافة العملات</button><p class="text-[10px] opacity-60">لا تؤكدي العملية إلا بعد استلام المبلغ فعلياً. سيتم تسجيلها في سجل الوكالة ومحفظة اللاعب.</p></form></section>':'')+
      (canManage?'<section class="card p-4"><h3 class="font-bold mb-3">إضافة وكيل أو مضيف</h3><form id="agency-add-member-form" class="space-y-3"><label class="block text-sm">المعرّف العام للمستخدم<input class="field mt-1" name="public_id" type="number" required></label><label class="block text-sm">الدور<select class="field mt-1" name="role"><option value="agent">وكيل شحن</option><option value="host">مضيف</option><option value="support">دعم</option><option value="manager">مدير</option></select></label><button class="btn w-full" type="submit">إضافة العضو</button></form><div class="mt-3 space-y-2">'+members.map(m=>'<div class="item"><div><b>'+esc(m.profile?.display_name||m.profile?.handle||'عضو')+'</b><p class="text-xs opacity-60">#'+esc(m.profile?.public_id||'—')+' · '+esc(m.member_role)+'</p></div>'+(m.member_role==='owner'?'':'<button type="button" class="ghost text-xs" data-agency-remove="'+esc(m.profile?.public_id||'')+'">إزالة</button>')+'</div>').join('')+'</div></section>':'')+
      '<section class="card p-4"><h3 class="font-bold mb-3">آخر عمليات الشحن</h3><div class="space-y-2">'+(recharges.length?recharges.map(x=>'<div class="item"><div><b>'+num(x.coins)+' عملة</b><p class="text-xs opacity-70">اللاعب #'+esc(x.target?.public_id||'—')+' · '+num(x.price_dzd)+' دج · '+esc(x.payment_method)+'</p><small class="opacity-50">'+timeAgo(new Date(x.created_at).getTime())+'</small></div><span class="pill">مكتملة</span></div>').join(''):'<p class="text-xs opacity-60">لا توجد عمليات شحن بعد.</p>')+'</div></section>'+
      (agency.agency_type==='hosts'||agency.agency_type==='both'?'<section class="card p-4"><h3 class="font-bold mb-3">أداء المضيفين</h3><div class="grid grid-cols-2 gap-3 mb-3"><div class="rounded-xl bg-white/5 p-3"><small>ساعات البث المسجلة</small><b class="block text-lg text-amber-300">'+num(Math.floor(hostGroups.reduce((n,x)=>n+x.live_seconds,0)/3600))+' س</b></div><div class="rounded-xl bg-white/5 p-3"><small>عملات الهدايا</small><b class="block text-lg text-amber-300">'+num(hostGroups.reduce((n,x)=>n+x.gift_coins,0))+'</b></div></div><div class="space-y-2">'+(hostGroups.length?hostGroups.map(x=>'<div class="item"><div><b>'+esc(x.profile?.display_name||x.profile?.handle||'مضيفة')+'</b><p class="text-xs opacity-70">'+num(Math.floor(x.live_seconds/3600))+' ساعة · '+num(x.session_count)+' جلسة</p></div><strong class="text-amber-300">'+num(x.gift_coins)+'</strong></div>').join(''):'<p class="text-xs opacity-60">لا توجد جلسات أو هدايا مسجلة بعد.</p>')+'</div></section>':'')+
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
  const root=$('#inbox-list');let loadingList=false;
  const refresh=async()=>{
    if(loadingList||!root?.isConnected)return;loadingList=true;
    try{
      const {conversations=[]}=await api.conversations();
      if(!root.isConnected)return;
      root.innerHTML=conversations.length?conversations.map(c=>`
        <a href="#/dm/${encodeURIComponent(c.id)}" class="hs-inbox-row">
          ${avatar(c.other,52)}
          <div class="min-w-0 flex-1"><div class="hs-inbox-name">${esc(c.other.displayName||c.other.handle)}</div>
          <div class="hs-inbox-preview">${esc(c.lastMessage||'ابدئي المحادثة')}</div></div>
          <div class="hs-inbox-trailing">${c.unread?`<span>${num(c.unread)}</span>`:''}<small>${timeAgo(new Date(c.updatedAt).getTime())}</small></div>
        </a>`).join(''):emptyBox('message-circle','لا توجد محادثات بعد','افتحي ملف أي عضو واضغطي «رسالة خاصة» لبدء محادثة لا يراها الآخرون.');
      icons_();
    }catch(e){if(root?.isConnected)root.innerHTML=emptyBox('wifi-off','تعذّر تحميل المحادثات',e.message);}
    finally{loadingList=false;}
  };
  await refresh();
  const channel=api.subscribeInbox(()=>refresh().catch(e=>console.warn('Inbox refresh:',e.message)));
  window.addEventListener('hashchange',()=>api.unsubscribeRoomChannel(channel),{once:true});
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
  const draw=async()=>{const {messages}=await api.directMessages(conversationId);root.innerHTML=messages.map(m=>{const mine=m.sender_id===state.account.id,person=m.profile||(mine?state.profile:conversation?.other);return `<div class="hs-dm-line ${mine?'mine':'theirs'}">${avatar(person,30)}<div class="hs-dm-bubble">${esc(m.body)}<small>${timeAgo(new Date(m.created_at).getTime())}${mine?(m.read_at?' · تمت القراءة':' · تم الإرسال'):''}</small></div></div>`;}).join('')||'<div class="hs-dm-empty"><span>✧</span><b>أول رسالة بينكما</b><small>ابدئي الحديث، وستظهر الردود هنا مباشرة.</small></div>';root.scrollTop=root.scrollHeight;};
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
    else if (route === 'rooms') await homeScreen(params);
    else if (route === 'recent-rooms') await recentRoomsScreen(params);
    else if (route === 'gifts') await giftsScreen();
    else if (route === 'shop') await shopScreen();
    else if (route === 'wallet') await walletScreen();
    else if (route === 'me') meScreen();
    else if (route === 'cp') await cpHouseScreen();
    else if (route === 'honor') honorScreen();
    else if (route === 'family') familyScreen();
    else if (route === 'tasks') tasksScreen();
    else if (route === 'host-data') await hostDataScreen();
    else if (route === 'settings') settingsScreen();
    else if (route === 'feedback') feedbackScreen();
    else if (route === 'inventory') inventoryScreen();
    else if (route === 'invite') await inviteScreen();
    else if (route === 'moments') await momentsFeedScreen();
    else if (route === 'activities') await activitiesScreen();
    else if (route === 'agency') await agencyScreen();
    else if (route === 'aristocracy') comingSoonScreen(route);
    else if (route === 'u' && parts[1]) await userScreen(decodeURIComponent(parts[1]));
    else await homeScreen();
  } catch (e) {
    screen.innerHTML = `<div class="p-5">${emptyBox('triangle-alert', 'حدث خطأ', e.message)}</div>`;
    icons_();
  }
}


async function activitiesScreen() {
  screen.innerHTML = header('الأنشطة', '<a href="#/recent-rooms" class="text-xs text-gold-300">غرفي الأخيرة</a>') + `
    <section class="hs-activities-page">
      <div class="hs-activities-hero"><small>H A M S A T · DISCOVER</small><h2>عالم همسات مليء بالحياة</h2><p>اكتشفي الفعاليات والغرف والأصدقاء الجدد</p></div>
      <div class="hs-activity-banners">
        <a href="#/games" class="hs-activity-banner hs-activity-games"><span><small>PLAY & WIN</small><b>تحديات وألعاب</b><em>ادخلي أجواء المنافسة</em></span><i data-lucide="gamepad-2"></i></a>
        <a href="#/moments" class="hs-activity-banner hs-activity-moments"><span><small>SHARE YOUR MOMENT</small><b>لحظات الأصدقاء</b><em>شاهدي وشاركي أجمل اللحظات</em></span><i data-lucide="images"></i></a>
        <a href="#/wallet" class="hs-activity-banner hs-activity-rewards"><span><small>DAILY REWARDS</small><b>مكافآت همسات</b><em>تابعي رصيدك ومكافآتك</em></span><i data-lucide="gift"></i></a>
      </div>
      <div class="hs-activities-section-head"><div><small>LIVE NOW</small><h3>أحدث الغرف</h3></div><button id="activities-refresh" type="button" aria-label="تحديث الغرف"><i data-lucide="refresh-cw"></i></button></div>
      <div id="activities-latest-rooms" class="hs-home-room-list space-y-3"><div class="skeleton h-36"></div></div>
    </section>`;
  icons_();
  const root = $('#activities-latest-rooms');
  const load = async () => {
    root.innerHTML = loading();
    try {
      const { rooms = [] } = await api.rooms();
      const latest = rooms.slice(0, 8);
      root.innerHTML = latest.length ? latest.map(roomCard).join('') : emptyBox('audio-lines', 'لا توجد غرف مباشرة الآن', 'يمكنك إنشاء غرفة والبدء باستقبال الأصدقاء.');
      bindRoomCards(root, latest);
      icons_();
    } catch (error) {
      root.innerHTML = emptyBox('wifi-off', 'تعذّر تحميل الغرف', error.message || 'حاولي مرة أخرى');
      icons_();
    }
  };
  $('#activities-refresh').onclick = load;
  await load();
}

async function momentsFeedScreen() {
  screen.innerHTML = header('اللحظات') + `
    <section class="hs-moments-feed-page">
      <nav class="hs-moments-switch" aria-label="اللحظات">
        <button type="button" id="hs-moments-view" class="active"><i data-lucide="images"></i> مشاهدة اللحظات</button>
        <button type="button" id="hs-moments-create"><i data-lucide="plus-circle"></i> نشر لحظة</button>
      </nav>
      <section id="hs-moment-create-panel" class="hs-moment-create-panel hidden">
        <form id="hs-moment-create-form">
          <label class="hs-moment-upload" for="hs-moment-image"><i data-lucide="image-plus"></i><span>اختاري صورة من هاتفك</span><input id="hs-moment-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <div id="hs-moment-image-preview" class="hs-moment-image-preview hidden"></div>
          <textarea name="body" maxlength="1000" placeholder="اكتبي ما تريدين مشاركته..." rows="4"></textarea>
          <label class="hs-moment-location"><i data-lucide="map-pin"></i><input name="location" maxlength="120" placeholder="أضيفي المكان (اختياري)"></label>
          <button type="submit" class="btn-gold w-full"><i data-lucide="send"></i> نشر اللحظة</button>
        </form>
      </section>
      <div class="hs-moments-feed-list" id="hs-moments-feed-list"><div class="hs-moment-empty">جارٍ تحميل اللحظات…</div></div>
    </section>`;
  icons_();
  const host = $('#hs-moments-feed-list'), createPanel=$('#hs-moment-create-panel'), createForm=$('#hs-moment-create-form');
  const viewButton=$('#hs-moments-view'),createButton=$('#hs-moments-create');
  let feedItems = [], selectedImage=null, previewUrl=null;
  const showView = (view) => {
    const creating=view==='create';
    createPanel.classList.toggle('hidden',!creating);
    host.classList.toggle('hidden',creating);
    viewButton.classList.toggle('active',!creating);createButton.classList.toggle('active',creating);
  };
  viewButton.onclick=()=>showView('feed');createButton.onclick=()=>showView('create');
  createForm.elements.image.onchange=()=>{
    const file=createForm.elements.image.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('اختاري صورة JPG أو PNG أو WEBP','error');createForm.elements.image.value='';return;}
    if(file.size>5*1024*1024){toast('حجم الصورة يجب ألا يتجاوز 5 ميغابايت','error');createForm.elements.image.value='';return;}
    selectedImage=file;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);
    const preview=$('#hs-moment-image-preview');preview.classList.remove('hidden');preview.innerHTML='<img src="'+esc(previewUrl)+'" alt="معاينة الصورة"><button type="button" id="hs-moment-remove-image" aria-label="إزالة الصورة">×</button>';
    $('#hs-moment-remove-image').onclick=()=>{selectedImage=null;createForm.elements.image.value='';if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;preview.classList.add('hidden');preview.innerHTML='';};
  };
  createForm.onsubmit=async event=>{
    event.preventDefault();const button=createForm.querySelector('button[type="submit"]'),body=createForm.elements.body.value.trim(),locationText=createForm.elements.location.value.trim();
    if(!body&&!selectedImage){toast('أضيفي نصاً أو صورة قبل النشر','error');return;}
    button.disabled=true;button.textContent='جارٍ نشر اللحظة...';
    try{
      let imageUrl=null;if(selectedImage){const uploaded=await api.uploadMedia(selectedImage,'moments');imageUrl=uploaded.url;}
      await api.createMoment(body,imageUrl,locationText);
      createForm.reset();selectedImage=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('#hs-moment-image-preview').classList.add('hidden');$('#hs-moment-image-preview').innerHTML='';
      toast('تم نشر لحظتك للجميع');showView('feed');await refresh();
    }catch(error){toast(error.message||'تعذر نشر اللحظة','error');}
    finally{button.disabled=false;button.innerHTML='<i data-lucide="send"></i> نشر اللحظة';icons_();}
  };
  const draw = () => {
    if (!host) return;
    host.innerHTML = feedItems.length ? feedItems.map(m => {
      const p=m.profile||{};
      return `<article class="hs-moment-card hs-moment-feed-card" data-moment-card="${esc(m.id)}">
        <div class="hs-moment-feed-author">${avatar(p,40)}<div><b>${esc(p.displayName||'عضو')}</b><small>@${esc(p.handle||'')}</small></div></div>
        ${m.image_url?'<img src="'+esc(m.image_url)+'" alt="صورة لحظة" loading="lazy">':''}
        ${m.body?'<p>'+esc(m.body)+'</p>':''}
        ${m.location?'<div class="hs-moment-location-label"><i data-lucide="map-pin"></i>'+esc(m.location)+'</div>':''}
        <small>${dateAr(new Date(m.created_at).getTime())}</small>
        <div class="hs-moment-social"><button type="button" data-moment-like="${esc(m.id)}" data-liked="${m.likedByMe?'true':'false'}">${m.likedByMe?'♥':'♡'} إعجاب · ${num(m.likesCount)}</button><span>التعليقات · ${num(m.comments.length)}</span></div>
        <div class="hs-moment-comments">${m.comments.map(c=>'<p class="hs-moment-comment-person">'+avatar(c.profile,24)+'<span><b>'+esc(c.profile?.displayName||'عضو')+'</b> '+esc(c.body)+'</span></p>').join('')}</div>
        <form data-moment-comment="${esc(m.id)}" class="hs-moment-comment-form"><input name="body" maxlength="500" placeholder="اكتبي تعليقاً…" required><button type="submit">إرسال</button></form>
      </article>`;
    }).join('') : '<div class="hs-moment-empty">لا توجد لحظات منشورة بعد.</div>';
    host.querySelectorAll('[data-moment-like]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;try{await api.toggleMomentLike(button.dataset.momentLike,button.dataset.liked==='true');await refresh();}catch(error){toast(error.message,'error');button.disabled=false;}
    });
    host.querySelectorAll('[data-moment-comment]').forEach(form=>form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('button');button.disabled=true;
      try{await api.addMomentComment(form.dataset.momentComment,form.elements.body.value);await refresh();}catch(error){toast(error.message,'error');button.disabled=false;}
    });
    icons_();
  };
  const refresh = async () => {
    host.innerHTML='<div class="hs-moment-empty">جارٍ تحديث اللحظات…</div>';
    try{const result=await api.momentsFeed();feedItems=result.moments||[];draw();}
    catch(error){host.innerHTML='<div class="hs-moment-empty">تعذر تحميل اللحظات: '+esc(error.message)+'</div>';}
  };
  await refresh();
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
  window.HAMSAT_SPLASH_CONTROLLED = true;
  const splashStartedAt = Number(window.HAMSAT_SPLASH_STARTED_AT || Date.now());
  window.setTimeout(dismissHamsatSplash, Math.max(0, 4000 - (Date.now() - splashStartedAt)));
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
