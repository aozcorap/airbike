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
export const signOut = (scope) => client.auth.signOut(scope ? { scope } : undefined);
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
// Testkonten (z. B. das Vereinskonto des Betreibers) dürfen den gespielten Kauf nutzen, ohne Admin zu sein (siehe docs/DB-VEREINSKONTEN.sql)
export const isTestAccount = async () => {
  try {
    const { data, error } = await client.rpc('ist_testkonto');
    return !error && data === true;
  } catch {
    return false;
  }
};
export const adminOverview =() => client.rpc('admin_overview');
// Konto eines Nutzers löschen (die Datenbank erlaubt es nur Admins und nie für sich selbst oder andere Admins)
export const adminDeleteUser = (target) => client.rpc('admin_delete_user', { target });

// Gym-Konto (Verein): Plätze, Codes und Zugang prüft die Datenbank (siehe docs/DB-GYM.sql)
export const gymLoad = () => client.rpc('gym_laden');
export const gymCreate = (name) => client.rpc('gym_erstellen', { p_name: name });
export const gymAddSeat = (name) => client.rpc('gym_platz_anlegen', { p_name: name });
export const gymDeleteSeat = (id) => client.rpc('gym_platz_loeschen', { p_platz: id });
export const gymRedeem = (code) => client.rpc('gym_code_einloesen', { p_code: code });
// Nur für Admins (die Datenbank prüft das): alle Vereine und der Stand der Boxer eines Vereins (siehe docs/DB-ADMIN-VEREINE.sql)
export const adminClubs = () => client.rpc('admin_vereine');
export const adminClubOverview = (id) => client.rpc('admin_verein_uebersicht', { p_gym: id });
// Abo „Ohne Werbung“ (siehe docs/DB-ABO.sql). Testkauf nur für Admins, bis es den In-App-Kauf gibt.
export const aboStatus = () => client.rpc('abo_status');
export const aboTestBuy = (art) => client.rpc('abo_test_kaufen', { p_art: art });
export const aboTestEnd = () => client.rpc('abo_test_beenden');
export const gymLeave = () => client.rpc('gym_verlassen');
// Push-Mitteilungen der Web-Version (siehe docs/DB-PUSH.sql und supabase/functions/push)
export const pushKey = () => client.functions.invoke('push', { body: { a: 'key' } });
export const pushAnmelden = (endpoint, p256dh, auth, ua) => client.rpc('push_anmelden', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_ua: ua || '' });
export const pushAbmelden = (endpoint) => client.rpc('push_abmelden', { p_endpoint: endpoint });
export const gymAccess = ()=> client.rpc('gym_mein_zugang');
// Testwoche des Vereins: eine Woche das gewählte Paket testen (siehe docs/DB-TESTWOCHE.sql). Die zweite Funktion ist nur für Admins und Testkonten.
export const gymTestWeek = (seats) => client.rpc('gym_testwoche_starten', { p_plaetze: seats });
export const gymTestWeekSet = (days) => client.rpc('gym_test_woche_setzen', { p_tage: days });
export const gymTestPackage = (seats) => client.rpc('gym_test_paket', { p_plaetze: seats });
// Traineransicht: Stand der Boxer auf den eigenen Plätzen (die Datenbank gibt nur diese Daten heraus, siehe docs/DB-TRAINER.sql)
export const gymTrainer = () => client.rpc('gym_trainer_uebersicht');

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
