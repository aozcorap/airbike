// Anbindung an das Konto-System (Supabase): Anmeldung und Sicherung des Fortschritts je Konto.
import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const STORE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
export const redirectUrl = () => location.origin + location.pathname;

export function hasStoredSession() {
  try {
    return Boolean(localStorage.getItem(STORE));
  } catch {
    return false;
  }
}
export async function currentUser() {
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user || null;
  } catch {
    return null;
  }
}
export const signUp = (email, password, meta) => client.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: redirectUrl() } });
export const signIn = (email, password) => client.auth.signInWithPassword({ email, password });
export const signOut = () => client.auth.signOut();
export const resetPassword = (email) => client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
export const updatePassword = (password) => client.auth.updateUser({ password });
export const onAuth = (cb) => client.auth.onAuthStateChange(cb);

export async function pullState(userId) {
  const { data, error } = await client.from('user_state').select('state, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function pushState(userId, state) {
  const { data, error } = await client.from('user_state').upsert({ user_id: userId, state }, { onConflict: 'user_id' }).select('updated_at').single();
  if (error) throw error;
  return data.updated_at;
}
export async function deleteAccount() {
  const { error } = await client.rpc('delete_my_account');
  if (error) throw error;
  try {
    await client.auth.signOut({ scope: 'local' });
  } catch {
    /* Konto ist gelöscht, lokale Abmeldung ist nachrangig */
  }
}
