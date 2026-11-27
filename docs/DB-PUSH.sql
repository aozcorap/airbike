-- Push-Mitteilungen für die Web-Version (Wunsch des Betreibers, 28.11.2026)
--
-- Wer in den Einstellungen „Hinweise“ einschaltet, meldet sein Gerät an (Tabelle push_subs). Die Edge-Function `push` prüft stündlich
-- (Auftrag `push-senden`), wem eine Mitteilung zusteht, und schickt sie als Web-Push direkt auf das Gerät.
--
-- Sicherheit:
--  * Alle Tabellen sind für die App gesperrt (nur die Edge-Function mit dem Service-Schlüssel liest und schreibt sie).
--  * Die App meldet ein Gerät nur über `push_anmelden` an und ab, immer für das eigene Konto (auth.uid()).
--  * Die Edge-Function startet den Versand nur mit dem geheimen Wert aus push_config (nur der Auftrag kennt ihn, er liegt in der Datenbank).
--  * Die Schlüssel für den Versand (VAPID) erzeugt die Edge-Function selbst beim ersten Aufruf und speichert sie in push_keys.
--
-- Ausschalten und rückgängig machen:
--   select cron.unschedule('push-senden');
--   drop function if exists public.push_anmelden(text, text, text, text);
--   drop function if exists public.push_abmelden(text);
--   drop table if exists public.push_log, public.push_subs, public.push_config, public.push_keys;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_keys (
  id int primary key check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_config (
  id int primary key check (id = 1),
  secret text not null default gen_random_uuid()::text
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text not null default '',
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
create index if not exists push_subs_user on public.push_subs (user_id);

create table if not exists public.push_log (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  ref text not null default '',
  sent_at timestamptz not null default now()
);
create index if not exists push_log_user on public.push_log (user_id, sent_at desc);

alter table public.push_keys enable row level security;
alter table public.push_config enable row level security;
alter table public.push_subs enable row level security;
alter table public.push_log enable row level security;
revoke all on public.push_keys, public.push_config, public.push_subs, public.push_log from anon, authenticated;
revoke all on sequence public.push_log_id_seq from anon, authenticated;

create or replace function public.push_anmelden(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 700
     or p_p256dh is null or length(p_p256dh) > 200 or p_auth is null or length(p_auth) > 100 then
    raise exception 'Ungültige Anmeldung' using errcode = 'P0001';
  end if;
  insert into public.push_subs (user_id, endpoint, p256dh, auth, ua)
  values (uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua;
  -- höchstens 5 Geräte je Konto, die ältesten fallen weg
  delete from public.push_subs
  where user_id = uid
    and id not in (select id from public.push_subs where user_id = uid order by created_at desc limit 5);
end
$function$;

create or replace function public.push_abmelden(p_endpoint text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  delete from public.push_subs where user_id = auth.uid() and endpoint = p_endpoint;
end
$function$;

revoke all on function public.push_anmelden(text, text, text, text) from public, anon;
revoke all on function public.push_abmelden(text) from public, anon;
grant execute on function public.push_anmelden(text, text, text, text) to authenticated;
grant execute on function public.push_abmelden(text) to authenticated;

-- Stündlicher Auftrag (jeweils um :07), ausgeführt am 28.11.2026. Ruft die Edge-Function `push` mit dem geheimen Wert aus push_config auf.
-- select cron.schedule('push-senden', '7 * * * *', $$select net.http_post(url:='https://esmlmgfbsconhknssgcr.supabase.co/functions/v1/push', headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',(select secret from public.push_config where id=1)), body:='{"a":"run"}'::jsonb)$$);
