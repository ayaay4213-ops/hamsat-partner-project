import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const required = [
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/api.js',
  'js/voice-room.js',
  'js/livekit-room.js',
  'supabase/functions/livekit-token/index.ts',
  'supabase/migrations/0009_live_room_seats.sql',
  'supabase/migrations/0010_room_policy_and_trigger_hardening.sql',
  'supabase/migrations/0012_room_security_and_lifecycle.sql',
  'supabase/migrations/0049_synchronized_room_games.sql',
  'supabase/migrations/0050_seed_profile_frame_catalog.sql',
  'supabase/migrations/0051_protect_game_answer_keys.sql',
  'supabase/migrations/0056_room_and_gift_integrity.sql',
  'supabase/migrations/20261122224438_0078_configurable_room_seat_layout.sql',
  'supabase/SETUP-AR.md',
  'workers/hamsat-api.js',
  'assets/hamsat-hero.svg'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required file: ${file}`);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons)) {
    errors.push('manifest.json is missing required PWA fields');
  }
  for (const icon of manifest.icons || []) {
    if (icon.src && !fs.existsSync(path.join(root, icon.src))) {
      errors.push(`Missing PWA icon: ${icon.src}`);
    }
  }
} catch (error) {
  errors.push(`Invalid manifest.json: ${error.message}`);
}

let html = '';
try {
  html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
} catch {}
const localRefs = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)]
  .map(match => match[1])
  .filter(ref => !/^(?:https?:|data:|\/\/|mailto:|tel:|javascript:)/i.test(ref));
for (const ref of localRefs) {
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  if (clean && !fs.existsSync(path.join(root, clean))) errors.push(`Broken local reference in index.html: ${ref}`);
}


const configurableRoomSeatsPath = path.join(root, 'supabase/migrations/20261122224438_0078_configurable_room_seat_layout.sql');
if (fs.existsSync(configurableRoomSeatsPath)) {
  const sql = fs.readFileSync(configurableRoomSeatsPath, 'utf8').toLowerCase();
  for (const token of [
    'rooms_reference_layout_fixed_check',
    'check (seat_limit between 1 and 10)',
    "seat_layout in ('grid', 'one-top', 'two-top', 'row')",
    'private.guard_room_seat_limit_change',
    'generate_series(2, v_limit)',
    'create trigger rooms_guard_seat_limit_change'
  ]) {
    if (!sql.includes(token.toLowerCase())) errors.push(`Missing configurable room-seat SQL: ${token}`);
  }
}

const hardeningMigrationPath = path.join(root, 'supabase/migrations/0010_room_policy_and_trigger_hardening.sql');
if (fs.existsSync(hardeningMigrationPath)) {
  const sql = fs.readFileSync(hardeningMigrationPath, 'utf8').toLowerCase();
  const dollarQuotes = sql.match(/\$\$/g) || [];
  if (dollarQuotes.length % 2 !== 0 || /\b(?:do|as)\s+\$(?!\$)/i.test(sql)) {
    errors.push('Invalid SQL dollar-quote delimiters in room hardening migration');
  }
  for (const token of [
    'create or replace function public.is_room_member',
    'grant execute on function public.is_room_member(uuid) to authenticated',
    'drop function if exists public.is_room_member(uuid, uuid)',
    'public.is_room_member(room_messages.room_id)',
    'alter publication supabase_realtime add table public.room_members',
    'revoke truncate, references, trigger on all tables in schema public from anon, authenticated',
    'revoke insert, update, delete on public.room_seats from anon, authenticated',
    'revoke insert, update on public.profiles from authenticated',
    'grant update (handle, display_name, bio, country, color, avatar_url, cover_url, background_url)',
    'revoke all on function public.handle_new_user() from public, anon, authenticated',
    'revoke all on function public.rls_auto_enable() from public, anon, authenticated'
  ]) {
    if (!sql.includes(token.toLowerCase())) errors.push(`Missing security hardening SQL: ${token}`);
  }
}

const roomLifecycleMigrationPath = path.join(root, 'supabase/migrations/0012_room_security_and_lifecycle.sql');
if (fs.existsSync(roomLifecycleMigrationPath)) {
  const sql = fs.readFileSync(roomLifecycleMigrationPath, 'utf8').toLowerCase();
  const dollarQuotes = sql.match(/\$\$/g) || [];
  if (dollarQuotes.length % 2 !== 0) errors.push('Invalid SQL dollar-quote delimiters in room lifecycle migration');
  if (!/create(?:\s+or\s+replace)?\s+function public\.request_room_seat/i.test(sql)) {
    errors.push('Missing room lifecycle SQL: public.request_room_seat function');
  }
  for (const token of [
    'create schema if not exists private',
    'create or replace function private.is_room_member',
    'private.is_room_member(room_members.room_id)',
    'private.is_room_member(room_messages.room_id)',
    'private.is_room_member(room_seats.room_id)',
    'p_seat_no = 1 and v_owner <> v_user',
    'create trigger room_member_release_seat',
    'alter publication supabase_realtime add table public.room_members',
    'revoke insert, update, delete on public.room_seats from anon, authenticated'
  ]) {
    if (!sql.includes(token.toLowerCase())) errors.push(`Missing room lifecycle SQL: ${token}`);
  }
}

const seatMigrationPath = path.join(root, 'supabase/migrations/0009_live_room_seats.sql');
if (fs.existsSync(seatMigrationPath)) {
  const sql = fs.readFileSync(seatMigrationPath, 'utf8');
  for (const token of [
    'create table if not exists public.room_seats',
    'create or replace function public.request_room_seat',
    'create or replace function public.leave_room_seat',
    'create or replace function public.is_room_member',
    'as $',
    'public.is_room_member(room_id)',
    'public.is_room_member(room_messages.room_id)',
    'alter publication supabase_realtime add table public.room_seats',
    'alter publication supabase_realtime add table public.room_members'
  ]) {
    if (!sql.toLowerCase().includes(token.toLowerCase())) errors.push(`Missing required audio-room SQL: ${token}`);
  }
}

const expandedSeatsPath = path.join(root, 'supabase/migrations/0037_room_twelve_seats.sql');
if (fs.existsSync(expandedSeatsPath)) {
  const sql = fs.readFileSync(expandedSeatsPath, 'utf8').toLowerCase();
  for (const token of [
    'seat_no between 1 and 12',
    'seat_limit = any (array[4,6,8,10,12])',
    'if p_seat_no > v_limit then',
    'grant execute on function public.request_room_seat(uuid, integer) to authenticated'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing twelve-seat support SQL: ${token}`);
  }
}
const roomActivityPath = path.join(root, 'supabase/migrations/0038_room_activity_events.sql');
if (fs.existsSync(roomActivityPath)) {
  const sql = fs.readFileSync(roomActivityPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.room_activity_events',
    'private.is_room_member(room_activity_events.room_id)',
    'create or replace function public.send_room_emoji',
    'create or replace function public.send_room_gift',
    'public.send_gift(p_recipient, p_gift_id, p_quantity)'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing secure room activity SQL: ${token}`);
  }
}
const giftCategoriesPath = path.join(root, 'supabase/migrations/0039_gift_categories.sql');
if (fs.existsSync(giftCategoriesPath)) {
  const sql = fs.readFileSync(giftCategoriesPath, 'utf8').toLowerCase();
  for (const token of ["category text not null default 'app'", "gifts_category_check", "'event'", "'lucky'", "'special'"]) {
    if (!sql.includes(token)) errors.push(`Missing gift category SQL: ${token}`);
  }
}
const roomBombPath = path.join(root, 'supabase/migrations/0040_room_bomb_rewards.sql');
if (fs.existsSync(roomBombPath)) {
  const sql = fs.readFileSync(roomBombPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.room_bomb_levels',
    'create table if not exists public.room_bombs',
    'create table if not exists public.room_bomb_contributions',
    'private.apply_room_bomb_contribution',
    'create trigger room_gift_updates_bomb',
    'create or replace function public.refresh_room_bomb'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing room bomb SQL: ${token}`);
  }
}
const cosmeticsPath = path.join(root, 'supabase/migrations/0041_cosmetic_slots_and_expiry.sql');
if (fs.existsSync(cosmeticsPath)) {
  const sql = fs.readFileSync(cosmeticsPath, 'utf8').toLowerCase();
  for (const token of [
    'equipped_entrance_id',
    'equipped_bubble_id',
    'equipped_special_id',
    'duration_days',
    'expires_at',
    'create or replace function public.unequip_shop_item',
    'create or replace function public.refresh_cosmetic_expirations'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing cosmetic inventory SQL: ${token}`);
  }
}
const agencyPath = path.join(root, 'supabase/migrations/0042_agencies_and_agent_recharge.sql');
if (fs.existsSync(agencyPath)) {
  const sql = fs.readFileSync(agencyPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.agencies',
    'create table if not exists public.agency_members',
    'private.is_agency_member',
    'create or replace function public.agent_recharge_user',
    'create or replace function public.create_external_topup_order'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing agency and recharge SQL: ${token}`);
  }
}
const hostAgencyPath = path.join(root, 'supabase/migrations/0043_host_agency_metrics.sql');
if (fs.existsSync(hostAgencyPath)) {
  const sql = fs.readFileSync(hostAgencyPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.agency_host_sessions',
    'create table if not exists public.agency_host_daily_stats',
    'create or replace function public.host_start_session',
    'create or replace function public.host_heartbeat_session',
    'create or replace function public.host_end_session',
    'private.record_agency_host_gift'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing host agency metrics SQL: ${token}`);
  }
}
const safetyPath = path.join(root, 'supabase/migrations/0044_user_safety_and_reports.sql');
if (fs.existsSync(safetyPath)) {
  const sql = fs.readFileSync(safetyPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.user_blocks',
    'create table if not exists public.user_reports',
    'create or replace function public.block_user',
    'create or replace function public.report_user',
    'create or replace function public.report_room',
    'private.is_user_blocked'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing user safety SQL: ${token}`);
  }
}
const multiplayerGamesPath = path.join(root, 'supabase/migrations/0049_synchronized_room_games.sql');
if (fs.existsSync(multiplayerGamesPath)) {
  const sql = fs.readFileSync(multiplayerGamesPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.room_game_sessions',
    'create table if not exists public.room_game_players',
    'create table if not exists public.room_game_answers',
    'private.room_game_answer_keys',
    'create or replace function public.room_game_create',
    'create or replace function public.room_game_join',
    'create or replace function public.room_game_start',
    'create or replace function public.room_game_answer',
    'create or replace function public.room_game_next',
    'create or replace function public.room_game_state',
    'create or replace function public.room_game_cancel',
    'room_game_one_live_per_room_idx',
    'revoke all on public.room_game_sessions,public.room_game_players,public.room_game_answers from anon,authenticated',
    'alter publication supabase_realtime add table public.room_game_sessions'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing synchronized room games SQL: ${token}`);
  }
}
const gameAnswerProtectionPath = path.join(root, 'supabase/migrations/0051_protect_game_answer_keys.sql');
if (fs.existsSync(gameAnswerProtectionPath)) {
  const sql = fs.readFileSync(gameAnswerProtectionPath, 'utf8').toLowerCase();
  for (const token of [
    'revoke all on public.games from anon,authenticated',
    'grant select (id,name,description,game_type,icon,active,sort_order,created_at,updated_at)',
    'grant insert,update,delete on public.games to authenticated'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing game answer-key protection: ${token}`);
  }
}
const profileFramesPath = path.join(root, 'supabase/migrations/0050_seed_profile_frame_catalog.sql');
if (fs.existsSync(profileFramesPath)) {
  const sql = fs.readFileSync(profileFramesPath, 'utf8').toLowerCase();
  const frameSeedCount=(sql.split("  ('profile_orig_").length-1)+(sql.split("  ('profile_ref_").length-1);
  if (frameSeedCount !== 18) {
    errors.push('Profile frame catalog must seed exactly 18 inactive items');
  }
  for (const token of ["'profile_frame'", 'false', 'null', 'on conflict (id) do nothing']) {
    if (!sql.includes(token)) errors.push(`Missing safe profile-frame catalog setting: ${token}`);
  }
}
const compatibilityPath = path.join(root, 'supabase/migrations/0046_catalog_and_wallet_type_compatibility.sql');
if (fs.existsSync(compatibilityPath)) {
  const sql = fs.readFileSync(compatibilityPath, 'utf8').toLowerCase();
  for (const token of [
    'room_bomb_reward',
    'agency_topup',
    'wallet_transactions_transaction_type_check',
    'profile_frame',
    'chat_bubble',
    'special_id',
    'shop_items_item_type_check'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing catalog/wallet compatibility SQL: ${token}`);
  }
} else {
  errors.push('Missing catalog and wallet compatibility migration: 0046');
}
const hardeningPath = path.join(root, 'supabase/migrations/0045_security_and_query_hardening.sql');
if (!fs.existsSync(hardeningPath)) errors.push('Missing security and query hardening migration: 0045');

const liveKitRoomPath = path.join(root, 'js/livekit-room.js');
if (fs.existsSync(liveKitRoomPath)) {
  const js = fs.readFileSync(liveKitRoomPath, 'utf8');
  for (const token of [
    'async function refreshPermissions()',
    "table: 'room_seats'",
    'supabase.removeChannel(seatChannel)',
    'refreshPermissions',
    'get muted()'
  ]) {
    if (!js.includes(token)) errors.push(`Missing LiveKit seat-sync behavior: ${token}`);
  }
}
const appRoomPath = path.join(root, 'js/app.js');
if (fs.existsSync(appRoomPath)) {
  const js = fs.readFileSync(appRoomPath, 'utf8');
  for (const token of [
    'state.voiceRoom.refreshPermissions()',
    'voiceMute.disabled=!controller.canPublish',
    'room-game-center-toggle',
    'room-emoji-panel',
    'data-chat-filter="gifts"',
    'api.sendRoomEmoji',
    'api.sendRoomGift',
    'room-bomb-floating',
    'room-game-join',
    'data-group-answer',
    'api.createRoomGameSession',
    'api.joinRoomGameSession',
    'api.startRoomGameSession',
    'api.answerRoomGameSession',
    'api.nextRoomGameQuestion',
    'api.cancelRoomGameSession',
    'api.roomGameState',
    'api.roomBombState',
    'data-shop-category="profile_frame"',
    'api.unequipShopItem',
    'async function agencyScreen',
    'api.agentRechargeUser',
    'api.hostStartSession',
    'api.blockUser',
    'api.reportRoom',
    'api.kickRoomParticipant',
    'data-kick-room-member',
    'function renderRoomMiniBubble()',
    "state.roomMinimized=true;state.minimizedRoom=r",
    "data-room-bg-item",
    "معاينة — ستُطبّق بعد حفظ الإعدادات",
    'r.seatLimit = Math.min(10, Math.max(1, Number(r.seatLimit) || 10))',
    "Array.from({length:r.seatLimit}",
    "seatsEl.dataset.layout=roomSeatLayout",
  ]) {
    if (!js.includes(token)) errors.push(`Missing room interaction UI behavior: ${token}`);
  }
  const miniResumeStart = js.indexOf("$('#room-mini-resume').onclick");
  const miniExitStart = js.indexOf("$('#room-mini-exit').onclick", miniResumeStart);
  if (miniResumeStart < 0 || miniExitStart < 0) {
    errors.push('Missing room mini-bubble resume/exit controls');
  } else {
    const resumeHandler = js.slice(miniResumeStart, miniExitStart);
    if (!resumeHandler.includes('await openRoom(current)')) {
      errors.push('Room mini-bubble must restore the minimized room');
    }
    if (resumeHandler.includes('.leave(')) {
      errors.push('Room mini-bubble resume must preserve the existing voice connection');
    }
  }
}

const adminScriptPath = path.join(root, 'js/admin.js');
if (fs.existsSync(adminScriptPath)) {
  const js = fs.readFileSync(adminScriptPath, 'utf8');
  for (const token of ["$('#room-background-files').onchange", "$('#profile-frame-files').onchange", "$('#asset-batch-upload').onclick", 'PROFILE_FRAME_ASSETS', 'profile_ref_09_purple_cat_bows', 'backgrounds.length!==12', 'frames.length!==9', 'publishBlocked=media&&!x.image_url&&!x.active', "لا يمكن نشر خلفية أو إطار قبل رفع صورته ومراجعتها.", 'URL.createObjectURL', 'catalog/room-backgrounds', 'catalog/profile-frames', 'URL.revokeObjectURL(url)', 'data-replace-image', 'replaceMediaImage', 'اكتمل الرفع جزئياً']) {
    if (!js.includes(token)) errors.push(`Missing preview/mapped asset upload behavior: ${token}`);
  }
}
if (fs.existsSync(appRoomPath)) {
  const js = fs.readFileSync(appRoomPath, 'utf8');
  if (!js.includes('avatar-frame-overlay') || !js.includes('equippedProfileFrameUrl')) {
    errors.push('Missing transparent equipped profile-frame rendering');
  }
}
const apiFilePath = path.join(root, 'js/api.js');
if (fs.existsSync(apiFilePath)) {
  const js = fs.readFileSync(apiFilePath, 'utf8');
  for (const token of ['roomEvents: async', 'subscribeRoomEvents:', 'sendRoomEmoji: async', 'sendRoomGift: async', 'sendRoomGiftToAll: async', 'roomBombState: async', 'unequipShopItem: async', 'agentRechargeUser: async', 'hostStartSession: async', 'blockUser: async', 'reportUser: async', 'reportRoom: async', 'findRoomGameSession: async', 'createRoomGameSession: async', 'joinRoomGameSession: async', 'startRoomGameSession: async', 'answerRoomGameSession: async', 'nextRoomGameQuestion: async', 'cancelRoomGameSession: async', 'roomGameState: async', 'subscribeRoomGame:']) {
    if (!js.includes(token)) errors.push(`Missing room interaction API method: ${token}`);
  }
}
const roomCssPath = path.join(root, 'css/styles.css');
if (fs.existsSync(roomCssPath)) {
  const css = fs.readFileSync(roomCssPath, 'utf8');
  for (const token of ['.hs-room-mini-bubble{position:relative;width:62px;height:62px', '.hs-room-mini-exit{position:absolute', '.hs-room-mini-resume:focus-visible']) {
    if (!css.includes(token)) errors.push(`Missing circular minimized-room styling: ${token}`);
  }
}
for (const file of ['js/app.js', 'js/api.js', 'js/admin.js', 'js/voice-room.js', 'js/livekit-room.js', 'workers/hamsat-api.js']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`JavaScript syntax error in ${file}: ${check.stderr || check.stdout}`);
}

const roomIntegrityPath = path.join(root, 'supabase/migrations/0056_room_and_gift_integrity.sql');
if (fs.existsSync(roomIntegrityPath)) {
  const sql = fs.readFileSync(roomIntegrityPath, 'utf8').toLowerCase();
  for (const token of [
    "now() >= v_started_at + interval '30 seconds'",
    "'question_started_at',v_session.question_started_at",
    'private.gift_request_results',
    'alter table private.gift_request_results enable row level security',
    'private.claim_gift_request',
    'private.complete_gift_request',
    'p_request_id uuid',
    "private.claim_gift_request(v_user,'room_all',p_request_id)",
    'room_seats rs where rs.room_id=s.room_id and rs.user_id=v_user',
    'room_members rm where rm.room_id=v_room_id and rm.user_id=v_user',
    "v_end_at := least(now(),coalesce(v_old.last_heartbeat_at,v_old.started_at)+interval '45 seconds')",
    "interval '45 seconds'"
  ]) {
    if (!sql.includes(token)) errors.push(`Missing room/gift integrity protection: ${token}`);
  }
}
if (fs.existsSync(apiFilePath)) {
  const js = fs.readFileSync(apiFilePath, 'utf8');
  if (!/p_request_id:\s*requestId/.test(js)) errors.push('Gift API calls must pass the idempotency request UUID');
  const meBlock = js.match(/return\s*\{\s*account:\s*\{([^}]*)\}/s);
  if (!meBlock || /\bemail\b/i.test(meBlock[1])) errors.push('The account payload must expose only a safe public identity, never an email address');
}
if (fs.existsSync(appRoomPath)) {
  const js = fs.readFileSync(appRoomPath, 'utf8');
  if (/state\.account(?:\?\.)?\.email|state\.account\[['"]email['"]\]/i.test(js)) errors.push('The account UI must never render the authentication email');
  for (const token of ['room-game-countdown','question_started_at','const deadline=questionStartedMs+30000-(serverNowMs-Date.now())','roomGiftRequestId','directGiftRequestId','directGiftRequestSignature','api.sendGift(profile.uuid, values.giftId, quantity, directGiftRequestId)','crypto.randomUUID()']) {
    if (!js.includes(token)) errors.push(`Missing room/account privacy UI protection: ${token}`);
  }
}

const roomGameHostMembershipPath = path.join(root, 'supabase/migrations/0059_require_room_membership_for_game_host.sql');
if (fs.existsSync(roomGameHostMembershipPath)) {
  const sql = fs.readFileSync(roomGameHostMembershipPath, 'utf8').toLowerCase();
  for (const token of [
    'create or replace function public.room_game_create',
    'create or replace function public.room_game_start',
    'create or replace function public.room_game_next',
    'create or replace function public.room_game_cancel',
    'from public.room_members rm',
    'set search_path to \'\'',
    'security definer',
    'يجب أن يبقى مضيف الجولة داخل الغرفة'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing room-game host membership protection: ${token}`);
  }
  const membershipChecks = (sql.match(/from public\.room_members rm/g) || []).length;
  if (membershipChecks !== 4) errors.push('Room-game host membership migration must protect all four host operations');
} else {
  errors.push('Missing room-game host membership migration: 0059');
}


const authApiPath = path.join(root, 'js/api.js');
if (fs.existsSync(authApiPath)) {
  const js = fs.readFileSync(authApiPath, 'utf8');
  if (!js.includes("new URL('/', window.location.href).toString()")) {
    errors.push('Auth callbacks must use the current HAMSAT origin, not a stale hard-coded deployment URL');
  }
  if (/hamsat-preview-git-build-hamsat-complete-app-hamsat\.vercel\.app/.test(js)) {
    errors.push('Stale HAMSAT preview URL remains in auth callback configuration');
  }
}
if (fs.existsSync(appRoomPath)) {
  const js = fs.readFileSync(appRoomPath, 'utf8');
  if (!/data-method="phone" class="auth-method active"/.test(js) || !/let authMethod = 'phone'/.test(js)) {
    errors.push('Phone OTP must be the default active HAMSAT authentication method');
  }
  if (!js.includes("showFeedback('تم إنشاء الحساب. تحققي من بريدك الإلكتروني")) {
    errors.push('Email signup without an immediate session must guide users to confirm email');
  }
  if (/أوقفي Confirm email|إيقاف Confirm email/.test(js)) {
    errors.push('Authentication UI must not instruct users to disable email confirmation');
  }
}
const moderationSourcePath = path.join(root, 'supabase/functions/admin-user-moderate/index.ts');
if (fs.existsSync(moderationSourcePath)) {
  const source = fs.readFileSync(moderationSourcePath, 'utf8');
  for (const token of [
    'caller.auth.getUser(token)',
    'caller.rpc("is_admin")',
    'isAdmin !== true',
    'authData.user.id === userId',
    'target.role === "admin"',
    'service.auth.admin.updateUserById'
  ]) {
    if (!source.includes(token)) errors.push(`Admin moderation source is missing security check: ${token}`);
  }
} else {
  errors.push('Missing tracked source for deployed admin-user-moderate Edge Function');
}
const accountModerationPath = path.join(root, 'supabase/migrations/0027_account_moderation.sql');
if (fs.existsSync(accountModerationPath)) {
  const sql = fs.readFileSync(accountModerationPath, 'utf8').toLowerCase();
  for (const token of [
    'create trigger protect_profile_moderation_fields',
    'before update on public.profiles',
    'execute function public.protect_profile_moderation_fields()'
  ]) {
    if (!sql.includes(token)) errors.push(`Missing profile moderation trigger setup: ${token}`);
  }
} else {
  errors.push('Missing account moderation migration: 0027');
}
const profileProtectionPath = path.join(root, 'supabase/migrations/0036_protect_profile_ranks_and_couple_identity.sql');
if (fs.existsSync(profileProtectionPath)) {
  const sql = fs.readFileSync(profileProtectionPath, 'utf8').toLowerCase();
  for (const token of ['new.role is distinct from old.role','new.is_banned is distinct from old.is_banned','new.vip_level is distinct from old.vip_level','new.wealth_level is distinct from old.wealth_level','new.charisma_level is distinct from old.charisma_level']) {
    if (!sql.includes(token)) errors.push(`Missing protected profile field in migration 0036: ${token}`);
  }
} else {
  errors.push('Missing profile-rank protection migration: 0036');
}

const directGiftCompatPath = path.join(root, 'supabase/migrations/0057_legacy_gift_rpc_compatibility.sql');
if (directGiftCompatPath && fs.existsSync(directGiftCompatPath)) {
  const sql = fs.readFileSync(directGiftCompatPath, 'utf8').toLowerCase();
  for (const token of ['create or replace function public.send_gift(', 'p_quantity integer default 1', 'security invoker', 'gen_random_uuid()', 'revoke all on function public.send_gift(uuid,text,integer) from public,anon', 'grant execute on function public.send_gift(uuid,text,integer) to authenticated']) {
    if (!sql.includes(token)) errors.push(`Missing legacy direct-gift RPC compatibility protection: ${token}`);
  }
} else {
  errors.push('Missing legacy direct-gift RPC compatibility migration: 0057');
}
const roomGiftCompatPath = path.join(root, 'supabase/migrations/0058_legacy_room_gift_rpc_compatibility.sql');
if (fs.existsSync(roomGiftCompatPath)) {
  const sql = fs.readFileSync(roomGiftCompatPath, 'utf8').toLowerCase();
  for (const token of ['create or replace function public.send_room_gift(', 'create or replace function public.send_room_gift_to_all(', 'p_quantity integer default 1', 'security invoker', 'gen_random_uuid()', 'grant execute on function public.send_room_gift(uuid,uuid,text,integer) to authenticated', 'grant execute on function public.send_room_gift_to_all(uuid,text,integer) to authenticated']) {
    if (!sql.includes(token)) errors.push(`Missing legacy room-gift RPC compatibility protection: ${token}`);
  }
} else {
  errors.push('Missing legacy room-gift RPC compatibility migration: 0058');
}
if (fs.existsSync(appRoomPath)) {
  const js = fs.readFileSync(appRoomPath, 'utf8');
  for (const token of ['const stopHostSessionTracking=async()=>', 'const ensureHostSessionTracking=async()=>', 'await state.voiceRoom.refreshPermissions()', 'if(leaving) await stopHostSessionTracking();', 'else await ensureHostSessionTracking();']) {
    if (!js.includes(token)) errors.push(`Missing host microphone-seat session tracking behavior: ${token}`);
  }
}


const roomAvatarPath = path.join(root, 'js/app.js');
const roomStylePath = path.join(root, 'css/styles.css');
if (fs.existsSync(roomAvatarPath)) {
  const js = fs.readFileSync(roomAvatarPath, 'utf8');
  for (const token of [
    'const memberById=Object.fromEntries(members.map(member=>[member.userId,member]))',
    'seat?(seat.member||memberById[seat.user_id]||null):null',
    'avatar(m,58)'
  ]) {
    if (!js.includes(token)) errors.push(`Room microphone seats are missing profile/avatar fallback: ${token}`);
  }
}
if (fs.existsSync(roomStylePath)) {
  const css = fs.readFileSync(roomStylePath, 'utf8');
  for (const token of [
    '.room-sheet .hs-room-stage',
    '.room-sheet .hs-room-seat .hs-seat-ring .avatar',
    '.room-sheet .hs-room-seat .hs-seat-live-mic',
    '.room-sheet .hs-room-chat-area'
  ]) {
    if (!css.includes(token)) errors.push(`Missing HAMSAT room visual redesign styling: ${token}`);
  }
}
if (html) {
  for (const token of ['css/styles.css?v=20261123-royal-room-v22','js/app.js?v=20261123-dm-realtime-fallback-v1']) {
    if (!html.includes(token)) errors.push(`HAMSAT room assets are missing cache-busting reference: ${token}`);
  }
}

const adminJsPath = path.join(root, 'js/admin.js');
const adminHtmlPath = path.join(root, 'admin.html');
if (fs.existsSync(adminJsPath)) {
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  if (!adminJs.includes('const sections=[') || !adminJs.includes('await Promise.all(sections.map(async([label,load])=>')) {
    errors.push('Super Admin boot must isolate failures by section instead of failing as one batch');
  }
  if (!adminJs.includes("console.error('HAMSAT admin section failed:',label,error)")) {
    errors.push('Super Admin section failures must be logged with their section name');
  }
  if (!adminJs.includes("$('#'+ids[i]).textContent='—'")) {
    errors.push('Super Admin statistics must show a safe fallback when an individual count fails');
  }
}
if (fs.existsSync(adminHtmlPath)) {
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  if (!adminHtml.includes('js/admin.js?v=20261123-staff-permissions-v2')) {
    errors.push('Super Admin script must use the current cache-busting version');
  }
}

if (fs.existsSync(adminJsPath)) {
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  if (!adminJs.includes("if(error)throw error;") || !adminJs.includes("نقاط الوصول يجب أن تكون عدداً صحيحاً أكبر من صفر")) {
    errors.push('Room bomb admin must surface load errors and validate a positive integer threshold');
  }
  if (!adminJs.includes("قيم المكافأة يجب أن تكون أعداداً صحيحة غير سالبة")) {
    errors.push('Room bomb admin must reject invalid negative or non-integer reward amounts');
  }
}
if (fs.existsSync(adminHtmlPath)) {
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  if (!adminHtml.includes('js/admin.js?v=20261123-staff-permissions-v2')) {
    errors.push('Admin script cache-busting must match the room bomb validation update');
  }
}

const appApiPath = path.join(root, 'js/api.js');
if (fs.existsSync(appRoomPath) && fs.existsSync(appApiPath)) {
  const appSource = fs.readFileSync(appRoomPath, 'utf8');
  const apiSource = fs.readFileSync(appApiPath, 'utf8');
  const apiMethods = new Set([...apiSource.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/gm)].map(match => match[1]));
  const calledMethods = new Set([...appSource.matchAll(/\bapi\.([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]));
  for (const method of calledMethods) {
    if (!apiMethods.has(method)) errors.push(`App calls an API method that is not defined: api.${method}`);
  }
}
if (fs.existsSync(adminJsPath)) {
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  const selectedAssetsDeclarations = (adminJs.match(/const selectedAssets=/g) || []).length;
  if (selectedAssetsDeclarations !== 1) errors.push('Super Admin asset selection state must be declared exactly once');
}
if (fs.existsSync(adminHtmlPath)) {
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const adminJs = fs.existsSync(adminJsPath) ? fs.readFileSync(adminJsPath, 'utf8') : '';
  const tabs = [...adminHtml.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  for (const tab of tabs) {
    if (!adminHtml.includes('id="' + tab + '"')) errors.push(`Super Admin tab has no matching content section: ${tab}`);
    if (!adminJs.includes("'" + tab + "'")) errors.push(`Super Admin boot/tab handler is missing section: ${tab}`);
  }
}


const roomOwnerLimitPath = path.join(root, 'js/app.js');
if (fs.existsSync(roomOwnerLimitPath)) {
  const js = fs.readFileSync(roomOwnerLimitPath, 'utf8');
  if (!js.includes("const isRoomOwner = String(r.ownerUuid || '').toLowerCase() === String(state.profile?.uuid || state.account?.id || '').toLowerCase()")) {
    errors.push('Room owner controls must compare normalized owner/profile identifiers');
  }
  if (!js.includes('يمكن لكل عضو إنشاء غرفة واحدة فقط. هذه غرفتك الحالية.')) {
    errors.push('Room creation UI must direct a member to their existing room');
  }
}
if (fs.existsSync(apiFilePath)) {
  const js = fs.readFileSync(apiFilePath, 'utf8');
  if (!js.includes("from('rooms').select('id').eq('owner_id', user.id).limit(1)")) {
    errors.push('Room creation API must reject a second room owned by the same member');
  }
}
if (fs.existsSync(roomStylePath)) {
  const css = fs.readFileSync(roomStylePath, 'utf8');
  if (!css.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important')) {
    errors.push('Room seats must use a balanced three-column mobile layout');
  }
  if (!css.includes('#tabbar .tab{display:flex!important;align-items:center!important;justify-content:center!important')) {
    errors.push('Bottom navigation tabs must be evenly centered');
  }
}
if (html) {
  for (const token of ['css/styles.css?v=20261123-royal-room-v22','js/app.js?v=20261123-dm-realtime-fallback-v1']) {
    if (!html.includes(token)) errors.push(`HAMSAT must refresh the latest room layout assets: ${token}`);
  }
}
if (fs.existsSync(appRoomPath) && !fs.readFileSync(appRoomPath, 'utf8').includes("api.js?v=20261123-dm-reliability-v1")) {
  errors.push('HAMSAT must refresh the API module containing public-handle privacy safeguards');
}


const oneRoomMigrationPath = path.join(root, 'supabase/migrations/0060_one_room_per_member.sql');
if (!fs.existsSync(oneRoomMigrationPath)) {
  errors.push('Missing database-level one-room-per-member migration: 0060');
} else {
  const sql = fs.readFileSync(oneRoomMigrationPath, 'utf8').toLowerCase();
  if (!sql.includes('create unique index if not exists rooms_one_owned_room_per_member_idx') || !sql.includes('having count(*) > 1')) {
    errors.push('One-room migration must preflight duplicate owners and create a unique owner index');
  }
}


const integratedRoomPath = path.join(root, 'js/app.js');
const integratedApiPath = path.join(root, 'js/api.js');
const integratedCssPath = path.join(root, 'css/styles.css');
const integratedHtmlPath = path.join(root, 'index.html');
if (fs.existsSync(integratedRoomPath)) {
  const js = fs.readFileSync(integratedRoomPath, 'utf8');
  for (const token of ['hs-room-unified','let roomJoinedAt=Date.now()','api.roomMessages(r.id,roomJoinedAt)','api.roomEvents(r.id,roomJoinedAt)','Promise.allSettled([api.friendRequests(),api.friends()])']) {
    if (!js.includes(token)) errors.push('Missing integrated room, join-time chat or independent friends loading: ' + token);
  }
}
if (fs.existsSync(integratedApiPath)) {
  const js = fs.readFileSync(integratedApiPath, 'utf8');
  for (const token of ['roomMessages: async (roomId, since = null)','roomEvents: async (roomId, since = null)',"query.gte('created_at', new Date(since).toISOString())"]) {
    if (!js.includes(token)) errors.push('Missing join-time filtering for room history: ' + token);
  }
}
if (fs.existsSync(integratedCssPath)) {
  const css = fs.readFileSync(integratedCssPath, 'utf8');
  for (const token of ['.hs-room-unified{display:flex!important','.hs-room-unified>.hs-room-chat-area','.hs-home-hero-art-large img','grid-template-columns:repeat(6,minmax(0,1fr))!important']) {
    if (!css.includes(token)) errors.push('Missing integrated room and moments navigation styling: ' + token);
  }
}
if (fs.existsSync(integratedHtmlPath)) {
  const htmlSource = fs.readFileSync(integratedHtmlPath, 'utf8');
  if (!htmlSource.includes('data-tab="moments"') || !htmlSource.includes('grid grid-cols-6 pb-safe')) {
    errors.push('Bottom navigation must include the moments shortcut beside the profile tab');
  }
}
const roomHistoryMigrationPath = path.join(root, 'supabase/migrations/0061_room_chat_history_since_join.sql');
if (!fs.existsSync(roomHistoryMigrationPath)) {
  errors.push('Missing room chat history since-join migration 0061');
} else {
  const sql = fs.readFileSync(roomHistoryMigrationPath, 'utf8').toLowerCase();
  if (!sql.includes('room_messages.created_at >= m.joined_at') || !sql.includes('auth.uid()')) {
    errors.push('Room chat history policy must restrict messages to the current membership period');
  }
}

const micInviteMigrationPath = path.join(root, 'supabase/migrations/20261122230000_0077_room_seat_invitations.sql');
if (!fs.existsSync(micInviteMigrationPath)) {
  errors.push('Missing secure room microphone invitation migration: 0077');
} else {
  const sql = fs.readFileSync(micInviteMigrationPath, 'utf8').toLowerCase();
  for (const token of [
    'create table if not exists public.room_seat_invitations',
    'invite_room_member_to_seat',
    'respond_room_seat_invitation',
    'status = \'pending\'',
    'expires_at <= now()',
    'auth.uid() = invitee_id or auth.uid() = inviter_id',
    'alter publication supabase_realtime add table public.room_seat_invitations',
    'insert into public.room_seats(room_id,seat_no,user_id)',
    'create unique index if not exists room_seat_invites_one_pending_per_recipient_uidx'
  ]) {
    if (!sql.includes(token)) errors.push('Missing microphone invitation security/acceptance SQL: ' + token);
  }
}
if (fs.existsSync(appRoomPath)) {
  const js = fs.readFileSync(appRoomPath, 'utf8');
  for (const token of [
    'data-invite-seat',
    'api.inviteRoomMemberToSeat',
    'api.respondRoomSeatInvitation',
    'api.subscribeRoomSeatInvitations',
    'api.pendingRoomSeatInvitations',
    'room-seat-invite-accept',
    'room-seat-invite-decline',
    'تم قبول الدعوة وصعدتِ تلقائياً إلى المايك'
  ]) {
    if (!js.includes(token)) errors.push('Missing host-to-member microphone invitation UI: ' + token);
  }
}
if (fs.existsSync(apiFilePath)) {
  const js = fs.readFileSync(apiFilePath, 'utf8');
  for (const token of ['inviteRoomMemberToSeat: async', 'respondRoomSeatInvitation: async', 'subscribeRoomSeatInvitations:', 'pendingRoomSeatInvitations: async']) {
    if (!js.includes(token)) errors.push('Missing microphone invitation API method: ' + token);
  }
}
if (fs.existsSync(roomStylePath)) {
  const css = fs.readFileSync(roomStylePath, 'utf8');
  for (const token of ['.hs-room-seat-invite-modal', '.hs-room-seat-invite-card', '.hs-room-invite-seat-action']) {
    if (!css.includes(token)) errors.push('Missing microphone invitation dialog styling: ' + token);
  }
}

const livekitTokenPath = path.join(root, 'supabase/functions/livekit-token/index.ts');
if (fs.existsSync(livekitTokenPath)) {
  const source = fs.readFileSync(livekitTokenPath, 'utf8');
  for (const token of [
    'const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")',
    '|| !serviceRoleKey',
    'const moderationDb = createClient(supabaseUrl, serviceRoleKey',
    '.select("display_name,is_banned")',
    'if (!profile || profile.is_banned === true)',
    'هذا الحساب غير مخوّل بالاتصال الصوتي'
  ]) {
    if (!source.includes(token)) errors.push('LiveKit token issuance must reject banned or unverifiable accounts: ' + token);
  }
} else {
  errors.push('Missing LiveKit token Edge Function');
}

const moderationFunctionPath = path.join(root, 'supabase/functions/admin-user-moderate/index.ts');
if (fs.existsSync(moderationFunctionPath)) {
  const source = fs.readFileSync(moderationFunctionPath, 'utf8');
  for (const token of [
    'RoomServiceClient',
    'removeUserFromLiveKitRooms',
    'roomService.removeParticipant(roomId, userId)',
    'const livekitFailures: string[] = []',
    'const databaseFailures: string[] = []',
    'if (databaseRoomClean) processed++',
    'livekit_failed_rooms: livekitFailures.length',
    'database_failed_rooms: databaseFailures.length',
    'livekit_cleanup: livekitCleanup',
    'warning: livekitCleanup.ok ? undefined : livekitCleanup.warning'
  ]) {
    if (!source.includes(token)) errors.push('Account moderation must clean up active LiveKit rooms and report failures: ' + token);
  }
} else {
  errors.push('Missing account moderation Edge Function');
}
const adminUiPath = path.join(root, 'js/admin.js');
if (fs.existsSync(adminUiPath)) {
  const source = fs.readFileSync(adminUiPath, 'utf8');
  if (!source.includes('Boolean(data?.warning)')) errors.push('Admin moderation UI must display LiveKit cleanup warnings');
}

const inboxApiPath = path.join(root, 'js/api.js');
if (fs.existsSync(inboxApiPath)) {
  const js = fs.readFileSync(inboxApiPath, 'utf8');
  for (const token of [
    ".order('created_at', { ascending: false, foreignTable: 'dm_messages' })",
    ".limit(1, { foreignTable: 'dm_messages' })",
    ".is('read_at', null)",
    "unreadCounts[c.id] || 0",
    ".order('created_at',{ascending:false}).limit(200)",
    "DM sender profiles could not be loaded; rendering messages without profile decoration.",
    "DM messages loaded, but read receipts could not be updated.",
    "if(readError)console.warn(",
    ".slice().reverse().map(m=>({...m,profile:byId[m.sender_id]||null}))",
    ".select('id,conversation_id,sender_id,body,created_at,read_at').single()",
    "if (!data?.id) throw new Error('لم يتم تأكيد حفظ الرسالة؛ حاولي مرة أخرى.')",
    ".subscribe((status,error)=>{if(status!=='SUBSCRIBED')console.warn('Direct-message realtime status:'",
    ".subscribe((status,error)=>{if(status!=='SUBSCRIBED')console.warn('Inbox realtime status:'",
    "Inbox participant profiles could not be loaded; showing neutral placeholders.",
    "other:byId[otherId] || {uuid:otherId,displayName:'عضو',handle:'عضو',avatarUrl:null}"
  ]) {
    if (!js.includes(token)) errors.push('Inbox must load the latest message preview and preserve unread counts: ' + token);
  }
} else {
  errors.push('Missing API client file for inbox validation');
}

const inboxUiPath = path.join(root, 'js/app.js');
if (fs.existsSync(inboxUiPath)) {
  const js = fs.readFileSync(inboxUiPath, 'utf8');
  for (const token of [
    'const inboxPoll=window.setInterval(',
    'const dmPoll=window.setInterval(',
    "document.visibilityState!=='hidden'",
    'window.clearInterval(inboxPoll)',
    'window.clearInterval(dmPoll)'
  ]) {
    if (!js.includes(token)) errors.push('Private messaging must refresh safely when Realtime disconnects: ' + token);
  }
} else {
  errors.push('Missing app UI file for inbox fallback validation');
}

const topupAdminPath = path.join(root, 'js/admin.js');
if (fs.existsSync(topupAdminPath)) {
  const js = fs.readFileSync(topupAdminPath, 'utf8');
  for (const token of [
    'async function loadExternalTopupOrders()',
    "from('external_topup_orders').select(",
    "'طلبات الشحن الخارجية',loadExternalTopupOrders"
  ]) {
    if (!js.includes(token)) errors.push('Missing read-only external top-up order visibility: ' + token);
  }
} else {
  errors.push('Missing admin JavaScript for external top-up order visibility');
}

const staffUiPath = path.join(root, 'js/admin.js');
if (fs.existsSync(staffUiPath)) {
  const js = fs.readFileSync(staffUiPath, 'utf8');
  for (const token of [
    'async function loadStaffRoles()',
    "supabase.rpc('assign_staff_permissions'",
    "supabase.from('staff_roles').select(",
    "supabase.from('staff_audit_log').select(",
    'data-staff-revoke',
    "supabase.rpc('staff_update_user_report'",
    "'staff'"
  ]) {
    if (!js.includes(token)) errors.push('Missing Super Admin staff-role management flow: ' + token);
  }
} else {
  errors.push('Missing admin JavaScript for staff-role management');
}

const presenceSecurityPath = path.join(root, 'supabase/migrations/20261123080000_0079_security_and_presence_reconciliation.sql');
if (fs.existsSync(presenceSecurityPath)) {
  const sql = fs.readFileSync(presenceSecurityPath, 'utf8').toLowerCase();
  for (const token of [
    'revoke all on function public.capture_auth_login_event() from public, anon, authenticated',
    'interval \'180 seconds\'',
    'revoke truncate, references, trigger, maintain',
    'grant update (status, responded_at)'
  ]) {
    if (!sql.includes(token)) errors.push('Missing security/presence reconciliation safeguard: ' + token);
  }
} else {
  errors.push('Missing security and presence reconciliation migration: 0079');
}

const agencyRolePath = path.join(root, 'supabase/migrations/20261123140000_0082_agency_role_type_validation.sql');
if (fs.existsSync(agencyRolePath)) {
  const sql = fs.readFileSync(agencyRolePath, 'utf8').toLowerCase();
  for (const token of [
    'coalesce(public.is_admin(), false)',
    "p_role = 'agent' and v_agency_type not in ('recharge','both')",
    "p_role = 'host' and v_agency_type not in ('hosts','both')"
  ]) {
    if (!sql.includes(token)) errors.push('Missing agency role/type authorization: ' + token);
  }
} else {
  errors.push('Missing agency role/type validation migration: 0082');
}

const rechargePolicyPath = path.join(root, 'supabase/migrations/20261123150000_0084_scope_agency_recharge_history.sql');
if (fs.existsSync(rechargePolicyPath)) {
  const sql = fs.readFileSync(rechargePolicyPath, 'utf8').toLowerCase();
  for (const token of [
    'coalesce(public.is_admin(), false)',
    "private.is_agency_member(agency_id, array['owner','manager']::text[])",
    "private.is_agency_member(agency_id, array['agent']::text[])"
  ]) {
    if (!sql.includes(token)) errors.push('Missing agency recharge history scope: ' + token);
  }
} else {
  errors.push('Missing agency recharge history policy migration: 0084');
}

const shopHardeningPath = path.join(root, 'supabase/migrations/20261123130000_0080_shop_idempotency_and_bomb_progress.sql');
if (fs.existsSync(shopHardeningPath)) {
  const sql = fs.readFileSync(shopHardeningPath, 'utf8').toLowerCase();
  for (const token of [
    'revoke all on function public.purchase_shop_item(text) from public, anon, authenticated',
    'grant execute on function public.purchase_shop_item(text) to authenticated',
    'revoke all on function private.apply_room_bomb_contribution() from public, anon, authenticated'
  ]) {
    if (!sql.includes(token)) errors.push('Missing shop/bomb RPC execution hardening: ' + token);
  }
} else {
  errors.push('Missing shop idempotency and room-bomb migration: 0080');
}

const reportRateLimitPath = path.join(root, 'supabase/migrations/20261123153000_0085_report_rate_limits.sql');
if (fs.existsSync(reportRateLimitPath)) {
  const sql = fs.readFileSync(reportRateLimitPath, 'utf8').toLowerCase();
  for (const token of [
    'revoke all on function public.report_user(bigint,text,text) from public, anon, authenticated',
    'revoke all on function public.report_room(uuid,text,text) from public, anon, authenticated',
    'grant execute on function public.report_user(bigint,text,text) to authenticated',
    'grant execute on function public.report_room(uuid,text,text) to authenticated'
  ]) {
    if (!sql.includes(token)) errors.push('Report RPC execution must be restricted to authenticated users: ' + token);
  }
} else {
  errors.push('Missing report rate-limit migration: 0085');
}

const staffMigrationPath = path.join(root, 'supabase/migrations/20261123170000_0088_harden_staff_role_table_grants.sql');
if (fs.existsSync(staffMigrationPath)) {
  const sql = fs.readFileSync(staffMigrationPath, 'utf8').toLowerCase();
  for (const token of [
    'revoke all on table public.staff_roles, public.staff_audit_log from anon, authenticated',
    'grant select on table public.staff_roles, public.staff_audit_log to authenticated',
    'revoke all on function public.assign_staff_permissions(uuid, text[], boolean) from public, anon',
    'grant execute on function public.assign_staff_permissions(uuid, text[], boolean) to authenticated',
    'revoke all on function public.has_staff_permission(text) from public, anon',
    'grant execute on function public.has_staff_permission(text) to authenticated',
    'revoke all on function public.staff_update_user_report(bigint, text, text) from public, anon'
  ]) {
    if (!sql.includes(token)) errors.push('Missing staff-role privilege safeguard: ' + token);
  }
} else {
  errors.push('Missing staff-role privilege hardening migration: 0088');
}

const dmBlockMigrationPath = path.join(root, 'supabase/migrations/20261123163000_0087_dm_block_consistency.sql');
if (fs.existsSync(dmBlockMigrationPath)) {
  const sql = fs.readFileSync(dmBlockMigrationPath, 'utf8').toLowerCase();
  for (const token of [
    'create or replace function public.get_or_create_conversation(p_other_user uuid)',
    'security invoker',
    'select private.get_or_create_conversation(p_other_user)',
    'revoke all on function public.get_or_create_conversation(uuid) from public, anon',
    'grant execute on function public.get_or_create_conversation(uuid) to authenticated'
  ]) {
    if (!sql.includes(token)) errors.push('Missing direct-message block enforcement: ' + token);
  }
} else {
  errors.push('Missing direct-message block consistency migration: 0087');
}

const dmGrantsMigrationPath = path.join(root, 'supabase/migrations/20261123173000_0089_harden_dm_column_grants.sql');
if (fs.existsSync(dmGrantsMigrationPath)) {
  const sql = fs.readFileSync(dmGrantsMigrationPath, 'utf8').toLowerCase();
  for (const token of [
    'revoke all on table public.dm_conversations from anon, authenticated',
    'grant select on table public.dm_conversations to authenticated',
    'revoke references (id, user_a, user_b, created_at, updated_at)',
    'revoke all on table public.dm_messages from anon, authenticated',
    'revoke insert (id, conversation_id, sender_id, body, created_at, read_at)',
    'revoke update (id, conversation_id, sender_id, body, created_at, read_at)',
    'revoke references (id, conversation_id, sender_id, body, created_at, read_at)',
    'grant select on table public.dm_messages to authenticated',
    'grant insert (conversation_id, sender_id, body)',
    'grant update (read_at)'
  ]) {
    if (!sql.includes(token)) errors.push('Missing private-message least-privilege grant: ' + token);
  }
} else {
  errors.push('Missing private-message column grant migration: 0089');
}

const feedbackMigrationPath = path.join(root, 'supabase/migrations/20261123160000_0086_user_feedback_inbox.sql');
if (fs.existsSync(feedbackMigrationPath)) {
  const sql = fs.readFileSync(feedbackMigrationPath, 'utf8').toLowerCase();
  for (const token of [
    'alter table public.user_feedback enable row level security',
    'revoke all on table public.user_feedback from anon, authenticated',
    'create policy "admins read user feedback"',
    'revoke all on function public.submit_user_feedback(text,text) from public, anon, authenticated',
    'grant execute on function public.submit_user_feedback(text,text) to authenticated',
    'revoke all on function public.admin_update_user_feedback(bigint,text) from public, anon, authenticated',
    'if coalesce(public.is_admin(), false) is not true then',
    'grant execute on function public.admin_update_user_feedback(bigint,text) to authenticated'
  ]) {
    if (!sql.includes(token)) errors.push('Missing user-feedback access control: ' + token);
  }
} else {
  errors.push('Missing user feedback inbox migration: 0086');
}

if (errors.length) {
  console.error('Hamsat validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Hamsat validation passed: required files, PWA manifest, local references, room/gift integrity, game-host membership, authentication, moderation safeguards, and JavaScript syntax.');
