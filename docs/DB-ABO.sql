-- Abo „Ohne Werbung“ (Monat, Jahr) für Privatpersonen (Entscheidung des Betreibers 23.11.2026)
--
-- Eine neue Tabelle und drei Funktionen. Keine Änderung an bestehenden Tabellen, Daten oder Funktionen.
--   abos             ein Abo je Konto: Art (monat, jahr), läuft bis, Quelle (test, apple, google)
--   abo_status()     liefert dem angemeldeten Konto den eigenen Stand: {aktiv, art, bis, quelle}
--   abo_test_kaufen(p_art)   nur Admin: setzt ein Test-Abo (Monat = 1 Monat, Jahr = 1 Jahr). Ersetzt den Kauf in der Web-Version,
--                    bis es den In-App-Kauf gibt. Ein echter Kauf (Apple, Google) schreibt später dieselbe Zeile mit quelle = apple oder google.
--   abo_test_beenden()       nur Admin: löscht das eigene Test-Abo, damit man den Ablauf erneut testen kann
-- Die Tabelle ist von außen weder lesbar noch beschreibbar. Wird ein Konto gelöscht, verschwindet sein Abo mit.
--
-- Rückgängig machen (nur solange noch niemand ein echtes Abo hat):
--   drop function if exists public.abo_status(), public.abo_test_kaufen(text), public.abo_test_beenden();
--   drop table if exists public.abos;

create table if not exists public.abos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  art text not null check (art in ('monat', 'jahr')),
  bis timestamptz not null,
  quelle text not null default 'test' check (quelle in ('test', 'apple', 'google')),
  geaendert timestamptz not null default now()
);
alter table public.abos enable row level security;
revoke all on public.abos from anon, authenticated;

create or replace function public.abo_status()
returns jsonb
language plpgsql
security definer
stable
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  a public.abos;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select * into a from public.abos where user_id = uid;
  if not found then return jsonb_build_object('aktiv', false); end if;
  return jsonb_build_object('aktiv', a.bis > now(), 'art', a.art, 'bis', a.bis, 'quelle', a.quelle);
end
$function$;

create or replace function public.abo_test_kaufen(p_art text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_art not in ('monat', 'jahr') then raise exception 'Unbekannte Art'; end if;
  insert into public.abos (user_id, art, bis, quelle, geaendert)
  values (uid, p_art, now() + case when p_art = 'jahr' then interval '1 year' else interval '1 month' end, 'test', now())
  on conflict (user_id) do update set art = excluded.art, bis = excluded.bis, quelle = 'test', geaendert = now();
  return public.abo_status();
end
$function$;

create or replace function public.abo_test_beenden()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  delete from public.abos where user_id = uid and quelle = 'test';
  return public.abo_status();
end
$function$;

revoke all on function public.abo_status(), public.abo_test_kaufen(text), public.abo_test_beenden() from public, anon;
grant execute on function public.abo_status(), public.abo_test_kaufen(text), public.abo_test_beenden() to authenticated;
