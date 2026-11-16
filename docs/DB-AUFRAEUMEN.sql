-- Unbestätigte Konten aufräumen (Nonstop Boxing, Supabase)
--
-- Problem: Beim Registrieren legt die Datenbank sofort Konto, Geburtsjahr und Einwilligung an, auch wenn der Code
-- aus der E-Mail nie eingegeben wird. Solche Konten bleiben sonst für immer liegen.
-- Wer sich später doch anmelden will, kann sich einfach neu registrieren.
--
-- Von Hand in Supabase ausführen: SQL Editor, den jeweiligen Teil einfügen, Run.
-- Beim Löschen eines Kontos werden profiles und user_state automatisch mitgelöscht (ON DELETE CASCADE, geprüft).

-- 1. ERST PRÜFEN: Welche Konten würden gelöscht? (unbestätigt und älter als 7 Tage)
select id, email, created_at
from auth.users
where email_confirmed_at is null
  and created_at < now() - interval '7 days'
order by created_at;

-- 2. EINMALIG LÖSCHEN (nur ausführen, wenn die Liste oben stimmt)
delete from auth.users
where email_confirmed_at is null
  and created_at < now() - interval '7 days';

-- 3. OPTIONAL: Jede Nacht automatisch aufräumen (braucht die Erweiterung pg_cron).
-- Falls der erste Befehl nicht geht: Supabase, Database, Extensions, pg_cron einschalten und dann den zweiten Befehl ausführen.
create extension if not exists pg_cron;

select cron.schedule(
  'unbestaetigte-konten-loeschen',
  '17 3 * * *',
  $$ delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days' $$
);

-- Wieder abschalten, falls gewünscht:
-- select cron.unschedule('unbestaetigte-konten-loeschen');
