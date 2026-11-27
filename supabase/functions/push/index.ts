import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { privateMessage, trainerMessage } from './logik.js';

// Push-Mitteilungen für die Web-Version (siehe docs/DB-PUSH.sql und supabase/functions/push/logik.js).
//   { a: 'key' }  → gibt den öffentlichen Schlüssel für die Anmeldung der Geräte zurück (erzeugt die Schlüssel beim ersten Aufruf).
//   { a: 'run' }  → prüft alle angemeldeten Geräte und verschickt fällige Mitteilungen. Nur mit dem geheimen Wert aus push_config (Header x-push-secret),
//                   den nur der stündliche Auftrag `push-senden` in der Datenbank kennt.
//
// Diese Datei ist die Fassung für das Repo. Veröffentlicht wird sie in Supabase (Edge Functions, push) ohne JWT-Prüfung (verify_jwt aus),
// weil der Auftrag und die Schlüsselabfrage keine Anmeldung haben. Der Versand ist durch den geheimen Wert geschützt.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MAX_SENDS = 300; // pro Lauf
const SUBJECT = 'https://aozcorap.github.io/airbike/'; // Kontaktangabe für die Push-Dienste (eine Webadresse, keine E-Mail)

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function keys() {
  const { data } = await db.from('push_keys').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (data) return data;
  const k = webpush.generateVAPIDKeys();
  const row = { id: 1, public_key: k.publicKey, private_key: k.privateKey };
  const { error } = await db.from('push_keys').insert(row);
  if (error) {
    // gleichzeitig angelegt: den bestehenden nehmen
    const again = await db.from('push_keys').select('public_key, private_key').eq('id', 1).maybeSingle();
    if (again.data) return again.data;
    throw error;
  }
  return { public_key: row.public_key, private_key: row.private_key };
}

async function run() {
  const k = await keys();
  webpush.setVapidDetails(SUBJECT, k.public_key, k.private_key);
  const now = new Date();
  const { data: subs } = await db.from('push_subs').select('id, user_id, endpoint, p256dh, auth');
  if (!subs || !subs.length) return { sent: 0, geraete: 0 };
  const users = [...new Set(subs.map((s: any) => s.user_id))];
  const since = new Date(Date.now() - 12 * 864e5).toISOString();
  const [{ data: states }, { data: logs }, { data: gyms }] = await Promise.all([
    db.from('user_state').select('user_id, state').in('user_id', users),
    db.from('push_log').select('user_id, kind, ref, sent_at').in('user_id', users).gte('sent_at', since),
    db.from('gyms').select('id, owner_id').in('owner_id', users),
  ]);
  const stateOf = new Map((states || []).map((r: any) => [r.user_id, r.state || {}]));
  const logsOf = new Map<string, any[]>();
  for (const l of logs || []) (logsOf.get(l.user_id) || logsOf.set(l.user_id, []).get(l.user_id)!).push(l);
  // Boxer der Vereine, die den Geräten gehören
  const gymOf = new Map((gyms || []).map((g: any) => [g.owner_id, g.id]));
  const boxerOf = new Map<string, any[]>();
  if (gymOf.size) {
    const { data: seats } = await db.from('gym_seats').select('gym_id, name, member_id').in('gym_id', [...gymOf.values()]).not('member_id', 'is', null);
    const ids = [...new Set((seats || []).map((s: any) => s.member_id))];
    const { data: bst } = ids.length ? await db.from('user_state').select('user_id, state').in('user_id', ids) : { data: [] };
    const tiOf = new Map((bst || []).map((r: any) => [r.user_id, r.state && r.state.ti]));
    for (const [owner, gid] of gymOf) {
      boxerOf.set(owner, (seats || []).filter((s: any) => s.gym_id === gid).map((s: any) => ({ id: s.member_id, name: s.name, ti: tiOf.get(s.member_id) })));
    }
  }
  const byUser = new Map<string, any[]>();
  for (const s of subs) (byUser.get(s.user_id) || byUser.set(s.user_id, []).get(s.user_id)!).push(s);

  let sent = 0;
  const failed: string[] = [];
  for (const [uid, list] of byUser) {
    if (sent >= MAX_SENDS) break;
    const st: any = stateOf.get(uid) || {};
    const lg = logsOf.get(uid) || [];
    // Eine Mitteilung pro Person und Lauf: erst die eigene Einheit, sonst (Trainer) die Aufmerksamkeit für Boxer
    const msg = privateMessage(st, now, lg) || (boxerOf.has(uid) ? trainerMessage(boxerOf.get(uid), now, lg) : null);
    if (!msg) continue;
    const payload = JSON.stringify({ title: 'Nonstop Boxing', body: msg.body, url: './' });
    let ok = false;
    for (const s of list) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' });
        ok = true;
        await db.from('push_subs').update({ last_ok: now.toISOString() }).eq('id', s.id);
      } catch (e: any) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) await db.from('push_subs').delete().eq('id', s.id); // Gerät hat sich abgemeldet
        else failed.push(String(code || 'fehler'));
      }
    }
    if (ok) {
      sent += 1;
      await db.from('push_log').insert({ user_id: uid, kind: msg.kind, ref: String(msg.ref).slice(0, 200) });
    }
  }
  await db.from('push_log').delete().lt('sent_at', new Date(Date.now() - 60 * 864e5).toISOString());
  return { sent, geraete: subs.length, fehler: failed.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ohne Inhalt */
  }
  try {
    if (body.a === 'key') {
      const k = await keys();
      return json({ key: k.public_key });
    }
    if (body.a === 'run') {
      const { data } = await db.from('push_config').select('secret').eq('id', 1).maybeSingle();
      const given = req.headers.get('x-push-secret') || '';
      if (!data || !given || given !== data.secret) return json({ fehler: 'Kein Zugriff' }, 403);
      return json(await run());
    }
    return json({ fehler: 'Unbekannt' }, 400);
  } catch {
    return json({ fehler: 'Fehler' }, 500);
  }
});
