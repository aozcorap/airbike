-- Beständige Sendegrenze für Meldungen aus der App (höchstens 10 pro Stunde und Nutzer)
--
-- Problem: Die Grenze liegt bisher nur im Speicher der Edge-Function `feedback-to-github` und setzt sich bei jedem
-- Neustart der Funktion zurück. Mit diesem Skript wird sie in der Datenbank gezählt.
--
-- Reihenfolge:
-- 1. Dieses Skript in Supabase im SQL Editor ausführen (Run).
-- 2. Danach die Funktion mit dem Code aus `supabase/functions/feedback-to-github/index.ts` neu veröffentlichen
--    (Supabase, Edge Functions, feedback-to-github, Code ersetzen, Deploy).
-- Die neue Funktion fällt auf die alte Grenze im Speicher zurück, falls die Datenbankfunktion fehlt. Es geht also
-- nichts kaputt, wenn Schritt 2 vor Schritt 1 kommt.

create table if not exists public.feedback_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

create index if not exists feedback_hits_user_at on public.feedback_hits (user_id, at desc);

-- Keine Regeln für Nutzer: Nur die Edge-Function (Service-Rolle) greift darauf zu.
alter table public.feedback_hits enable row level security;

create or replace function public.feedback_allow(p_user uuid, p_limit int default 10)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n int;
begin
  delete from public.feedback_hits where at < now() - interval '1 day';
  select count(*) into n from public.feedback_hits where user_id = p_user and at > now() - interval '1 hour';
  if n >= p_limit then
    return false;
  end if;
  insert into public.feedback_hits (user_id) values (p_user);
  return true;
end
$function$;

revoke all on function public.feedback_allow(uuid, int) from public, anon, authenticated;
grant execute on function public.feedback_allow(uuid, int) to service_role;
