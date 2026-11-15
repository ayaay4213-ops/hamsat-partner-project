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

for (const file of ['js/app.js', 'js/api.js', 'js/voice-room.js', 'js/livekit-room.js', 'workers/hamsat-api.js']) {
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
