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
    "room-seat-limit"
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
  for (const token of ["$('#asset-batch-form').onsubmit", 'profile_orig_01_royal_crown', 'profile_ref_09_purple_cat_bows', 'catalog/room-backgrounds', 'catalog/profile-frames']) {
    if (!js.includes(token)) errors.push(`Missing batch asset upload behavior: ${token}`);
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
for (const file of ['js/app.js', 'js/api.js', 'js/admin.js', 'js/voice-room.js', 'js/livekit-room.js', 'workers/hamsat-api.js']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`JavaScript syntax error in ${file}: ${check.stderr || check.stdout}`);
}

if (errors.length) {
  console.error('Hamsat validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Hamsat validation passed: required files, PWA manifest, local references, audio-room migration markers, and JavaScript syntax.');
