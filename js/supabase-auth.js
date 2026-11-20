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

function recordSignInOutsideAuthCallback(session) {
  if (!supabase || !session?.user?.id || !session?.access_token) return;
  try {
    const encoded = session.access_token.split('.')[1];
    if (!encoded) return;
    const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    const sessionId = payload.session_id;
    if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return;
    const userId = session.user.id;
    // Defer the database call until after Supabase's synchronous auth callback returns.
    setTimeout(() => {
      supabase.from('login_events')
        .upsert({ user_id: userId, session_id: sessionId }, { onConflict: 'user_id,session_id', ignoreDuplicates: true })
        .then(({ error }) => { if (error) console.warn('HAMSAT sign-in audit is not available yet:', error.message); })
        .catch(error => console.warn('HAMSAT sign-in audit failed:', error));
    }, 0);
  } catch (error) {
    console.warn('HAMSAT sign-in audit could not read the session id:', error);
  }
}

export function onAuthStateChange(callback) {
  const { data } = requireClient().auth.onAuthStateChange((event, session) => {
    callback(event, session);
    if (event === 'SIGNED_IN') recordSignInOutsideAuthCallback(session);
  });
  return () => data.subscription.unsubscribe();
}
