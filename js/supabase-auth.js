import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase/config.js';

const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)
  && SUPABASE_ANON_KEY
  && !SUPABASE_ANON_KEY.includes('YOUR_');

export const supabaseConfigured = Boolean(configured);
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

function requireClient() {
  if (!supabase) throw new Error('لم يتم إعداد خدمة الحسابات بعد. أضيفي رابط Supabase والمفتاح العام في supabase/config.js.');
  return supabase;
}

export async function signUpWithEmail(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  if (error) throw error;
  return { user: data.user, needsEmailConfirmation: !data.session };
}

export async function signInWithEmail(email, password) {
  const { data, error } = await requireClient().auth.signInWithPassword({
    email: String(email).trim().toLowerCase(), password
  });
  if (error) throw error;
  return data;
}

export async function sendPhoneCode(phone) {
  const { data, error } = await requireClient().auth.signInWithOtp({
    phone: String(phone).replace(/[\\s()-]/g, '')
  });
  if (error) throw error;
  return data;
}

export async function verifyPhoneCode(phone, token) {
  const { data, error } = await requireClient().auth.verifyOtp({
    phone: String(phone).replace(/[\\s()-]/g, ''), token: String(token).trim(), type: 'sms'
  });
  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export async function getSupabaseSession() {
  const { data, error } = await requireClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = requireClient().auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}
