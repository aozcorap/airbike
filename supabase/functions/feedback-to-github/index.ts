import { createClient } from 'jsr:@supabase/supabase-js@2';

// Nimmt eine Meldung aus der App entgegen und legt direkt ein GitHub-Issue an. Es wird nichts in einer Datenbank gespeichert
// (außer den Zeitpunkten für die Sendegrenze, siehe docs/DB-MELDUNGEN-LIMIT.sql).
// Nur angemeldete Nutzer (gültiges JWT, von der Plattform geprüft). Der Zugangsschlüssel liegt nur serverseitig:
// als Secret GITHUB_TOKEN oder verschlüsselt im Supabase Vault (Name github_token, Zugriff nur über get_github_token()).
//
// Diese Datei ist die Fassung für das Repo. Veröffentlicht wird sie von Hand in Supabase (Edge Functions, feedback-to-github).
const REPO = 'aozcorap/airbike';
const KINDS: Record<string, string> = { fehler: 'Fehler', idee: 'Idee', frage: 'Frage' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const clean = (s: unknown) => String(s ?? '').replace(/```/g, "'''");

// Begrenzung: höchstens 10 Meldungen pro Stunde und Nutzer.
// Beständig über die Datenbankfunktion feedback_allow; fehlt sie, gilt der Rückfall im Speicher (setzt sich beim Neustart zurück).
const hits = new Map<string, number[]>();
const limitedLocal = (uid: string) => {
  const now = Date.now();
  const list = (hits.get(uid) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= 10) return true;
  list.push(now);
  hits.set(uid, list);
  return false;
};
const limited = async (admin: ReturnType<typeof createClient>, uid: string) => {
  const { data, error } = await admin.rpc('feedback_allow', { p_user: uid, p_limit: 10 });
  if (error) return limitedLocal(uid);
  return data === false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'nur POST' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: 'nicht angemeldet' }, 401);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'ungültig' }, 400);
  }
  const kind = String(b.kind ?? '');
  const message = String(b.message ?? '').trim();
  if (!(kind in KINDS)) return json({ error: 'Art ungültig' }, 400);
  if (message.length < 10 || message.length > 4000) return json({ error: 'Text zu kurz oder zu lang' }, 400);
  const ctx = (b.context && typeof b.context === 'object' ? b.context : {}) as Record<string, unknown>;
  if (JSON.stringify(ctx).length > 2000) return json({ error: 'Kontext zu groß' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (await limited(admin, u.user.id)) return json({ error: 'Zu viele Meldungen' }, 429);

  let token = Deno.env.get('GITHUB_TOKEN') ?? '';
  if (!token) {
    const { data } = await admin.rpc('get_github_token');
    token = String(data ?? '');
  }
  if (!token) return json({ error: 'GITHUB_TOKEN fehlt' }, 500);

  const label = KINDS[kind];
  const first = message.split('\n')[0].replace(/@/g, '(at)').trim();
  const title = `[${label}] ${first.length > 70 ? first.slice(0, 67) + '...' : first}`;
  const issueBody = [
    `**Meldung aus der App** (Eingang ${new Date().toLocaleDateString('de-DE')})`,
    '',
    `**Art:** ${label}`,
    '**Text:**',
    '```',
    clean(message),
    '```',
    `**Seite:** \`${clean(String(b.page ?? '-').slice(0, 200))}\``,
    `**App-Version:** ${Number(b.app_build) || '-'}`,
    `**Gerät:** ${clean(String(b.device ?? '-').slice(0, 200))}`,
    `**Kontext:** Altersklasse ${clean(String(ctx.profile ?? '-'))} · ${Number(ctx.freq) || '-'}× pro Woche · ${Number(ctx.rounds) || '-'} Runden · Test-Watt vorhanden: ${ctx.hasTest ? 'ja' : 'nein'} · Bildschirm ${clean(String(ctx.screen ?? '-'))} · installiert (Home-Bildschirm): ${ctx.standalone ? 'ja' : 'nein'} · online: ${ctx.online === false ? 'nein' : 'ja'}`,
    ctx.lastError ? `**Letzter App-Fehler:** \`${clean(String(ctx.lastError).slice(0, 300))}\`` : '**Letzter App-Fehler:** keiner',
  ].join('\n');

  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nonstop-boxing-feedback',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body: issueBody, labels: ['tester-feedback', kind] }),
  });
  if (!res.ok) {
    console.error('GitHub-Fehler', res.status, (await res.text()).slice(0, 300));
    return json({ error: 'GitHub-Fehler ' + res.status }, 502);
  }
  const issue = await res.json();
  return json({ issue: issue.number });
});
