// Anbindung an das Konto-System (Supabase): Anmeldung und Sicherung des Fortschritts je Konto.
// Hash der Adresse sichern, bevor die Bibliothek ihn auswertet und löscht (alte Bestätigungs-Links)
export const INITIAL_HASH = typeof location !== 'undefined' ? location.hash : '';
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
export const signOut = () => client.auth.signOut();
export const sendCode = (email, create, data) => client.auth.signInWithOtp({ email, options: { shouldCreateUser: create, ...(data ? { data } : {}) } });
export const verifyCode = (email, token, type) => client.auth.verifyOtp({ email, token, type });
// Anmeldung mit Passwort: nur für das Demo-Konto der App-Prüfung bei Apple (alle anderen melden sich mit dem Code an)
export const signInPassword = (email, password) => client.auth.signInWithPassword({ email, password });
export const onAuth = (cb) => client.auth.onAuthStateChange(cb);

// Admin-Ansicht: Wer Daten bekommt, entscheidet die Datenbank (Funktionen is_admin und admin_overview, siehe docs/DB-ADMIN.sql)
export const isAdmin = async () => {
  try {
    const { data, error } = await client.rpc('is_admin');
    return !error && data === true;
  } catch {
    return false;
  }
};
export const adminOverview = () => client.rpc('admin_overview');
// Konto eines Nutzers löschen (die Datenbank erlaubt es nur Admins und nie für sich selbst oder andere Admins)
export const adminDeleteUser = (target) => client.rpc('admin_delete_user', { target });

export async function pullState(userId) {
  const { data, error } = await client.from('user_state').select('state, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
// Legt die eigene Zeile an, falls sie fehlt (die Datenbank erlaubt das nur für die eigene Nutzer-ID). Existiert sie schon, ist das in Ordnung.
export async function ensureStateRow(userId) {
  const { error } = await client.from('user_state').insert({ user_id: userId });
  if (error && error.code !== '23505') throw error;
}
// Schreibt nur, wenn niemand seit unserem letzten Stand etwas geändert hat (Versionsprüfung über updated_at).
// Ergebnis: { ok: true, updated_at } oder { ok: false } bei Konflikt.
export async function pushStateIf(userId, state, expectedVersion) {
  const { data, error } = await client.from('user_state').update({ state }).eq('user_id', userId).eq('updated_at', expectedVersion).select('updated_at');
  if (error) throw error;
  if (!data || !data.length) return { ok: false };
  return { ok: true, updated_at: data[0].updated_at };
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
// Meldung geht direkt an die Brücken-Funktion, die daraus ein GitHub-Issue macht (nichts wird in der Datenbank gespeichert)
export const sendFeedback = async (payload) => {
  const { error, data } = await client.functions.invoke('feedback-to-github', { body: payload });
  if (!error) return { error: null, data };
  const status = error.context && error.context.status;
  return { error: Object.assign(new Error(status === 429 ? 'Zu viele Meldungen' : 'Senden fehlgeschlagen'), { status }), data: null };
};
