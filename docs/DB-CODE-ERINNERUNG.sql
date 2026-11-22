-- Erinnerung für Konten, deren Code nie bestätigt wurde (Idee des Betreibers 22.11.2026)
--
-- Einmal täglich (9:00 UTC, das ist 10:00 oder 11:00 Uhr in Deutschland) sucht ein Auftrag Konten, die vor 24 bis 72 Stunden angelegt wurden
-- und deren E-Mail nie bestätigt wurde (kein Code eingegeben, nie angemeldet). Jedes dieser Konten bekommt genau einmal einen neuen Anmelde-Code
-- über die normale Anmeldung (Supabase Auth, gleiche E-Mail-Vorlage und gleicher Mail-Versand wie sonst). Kein eigener Mail-Dienst.
--
-- Sicherheit und Grenzen:
--  * Die Tabelle code_erinnerungen merkt sich, wem schon eine Erinnerung geschickt wurde. Niemand bekommt sie zweimal.
--  * Höchstens 20 Mails pro Lauf (Supabase erlaubt etwa 30 Anmelde-Mails pro Stunde).
--  * Die Funktion ist für die App nicht aufrufbar (nur der Auftrag und der SQL-Editor).
--  * Der Aufruf an Supabase Auth geschieht ohne geheimen Schlüssel, mit dem öffentlichen Schlüssel aus config.js (wie in der App).
--  * Die Antwort von Supabase Auth wird nicht ausgewertet. Scheitert der Versand, gilt die Erinnerung trotzdem als geschickt.
--
-- Probelauf mit einem Testkonto (E-Mail eingegeben, Code nie bestätigt), ohne auf 24 Stunden zu warten:
--   select public.code_erinnerung_senden(true);   -- ignoriert das Alter, sendet an alle noch unbestätigten Konten ohne Erinnerung
--
-- Ausschalten und rückgängig machen:
--   select cron.unschedule('code-erinnerung');
--   drop function if exists public.code_erinnerung_senden(boolean);
--   drop table if exists public.code_erinnerungen;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.code_erinnerungen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.code_erinnerungen enable row level security;
revoke all on public.code_erinnerungen from anon, authenticated;

create or replace function public.code_erinnerung_senden(p_alle boolean default false)
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  n int := 0;
begin
  for r in
    select u.id, u.email
    from auth.users u
    where u.email is not null
      and u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and (p_alle or (u.created_at < now() - interval '24 hours' and u.created_at > now() - interval '72 hours'))
      and not exists (select 1 from public.code_erinnerungen c where c.user_id = u.id)
    order by u.created_at
    limit 20
  loop
    perform net.http_post(
      url := 'https://esmlmgfbsconhknssgcr.supabase.co/auth/v1/otp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_-p_6fN-0fMyVhmJtpEl-KA_dw6H6IZM'),
      body := jsonb_build_object('email', r.email, 'create_user', false)
    );
    insert into public.code_erinnerungen (user_id) values (r.id);
    n := n + 1;
  end loop;
  return n;
end
$function$;

revoke all on function public.code_erinnerung_senden(boolean) from public, anon, authenticated;

select cron.schedule('code-erinnerung', '0 9 * * *', $$select public.code_erinnerung_senden()$$);
