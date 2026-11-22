-- Boxer verlässt den Verein selbst (Entscheidung des Betreibers 22.11.2026)
--
-- Eine neue Funktion, keine Änderung an Tabellen oder Daten. Sie wirkt nur auf den Platz des eigenen Kontos:
--   * der Boxer ist danach nicht mehr eingetragen, der Trainer sieht ihn nicht mehr
--   * der Platz bleibt mit seinem Namen bestehen und ist wieder frei, bekommt aber einen NEUEN Code
--     (der alte Code ist damit ungültig, der Trainer gibt den neuen weiter)
--   * Konto, Fortschritt und Trainingsdaten des Boxers bleiben unberührt
--   * ein Trainer-Konto oder ein Konto ohne Platz bekommt eine Meldung statt einer Änderung
-- Rückgängig machen: drop function if exists public.gym_verlassen();
create or replace function public.gym_verlassen()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  s public.gym_seats;
  neu text;
  roh text;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into s from public.gym_seats where member_id = uid for update;
  if not found then return jsonb_build_object('fehler', 'Du bist in keinem Verein'); end if;
  loop
    roh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    neu := substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4);
    exit when not exists (select 1 from public.gym_seats where code = neu);
  end loop;
  update public.gym_seats set member_id = null, redeemed_at = null, code = neu where id = s.id;
  return public.gym_mein_zugang();
end
$function$;

revoke all on function public.gym_verlassen() from public, anon;
grant execute on function public.gym_verlassen() to authenticated;
