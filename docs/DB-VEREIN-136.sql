-- Verein: Paketgröße in der Traineransicht und neuer Code beim Löschen eines Boxer-Kontos (Build 136, 23.11.2026)
--
-- 1. gym_trainer_uebersicht() und gym_uebersicht_fuer() geben zusätzlich 'plaetze' zurück (die Paketgröße, g.seats).
--    Sonst unverändert: dieselben Felder, dieselbe Zugriffsprüfung. Die App zeigt damit „2 von 5 Boxern angelegt“.
-- 2. Löscht ein Boxer sein Konto, wird der Platz frei (member_id = null). Bisher blieb der alte Code gültig, jeder, der ihn kannte, konnte
--    ihn wieder einlösen. Jetzt bekommt der Platz in diesem Fall einen NEUEN Code (Trigger). Gilt auch für „Verein verlassen“ (dort wurde der Code schon erneuert,
--    der Trigger erkennt das und ändert dann nichts).
--
-- Rückgängig machen:
--   drop trigger if exists gym_seats_code_neu on public.gym_seats; drop function if exists public.gym_seats_code_neu();
--   danach gym_trainer_uebersicht() aus docs/DB-TRAINER.sql und gym_uebersicht_fuer() aus docs/DB-ADMIN-VEREINE.sql erneut ausführen.

create or replace function public.gym_trainer_uebersicht()
returns jsonb
language plpgsql
security definer
stable
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select * into g from public.gyms where owner_id = uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'verein', g.name,
    'plaetze', g.seats,
    'heute', to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD'),
    'boxer', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'platz', s.id,
          'name', s.name,
          'belegt', s.member_id is not null,
          'zuletzt_gespeichert', st.updated_at,
          'letzte_anmeldung', u.last_sign_in_at,
          'ti', case when jsonb_typeof(st.state -> 'ti') = 'object' then st.state -> 'ti' else null end,
          'test_watt', nullif(st.state ->> 'maxW', ''),
          'test_datum', st.state ->> 'maxWDate',
          'runs', coalesce((
            select jsonb_object_agg(r.key, r.value)
            from (
              select key, value
              from jsonb_each(case when jsonb_typeof(st.state -> 'runs') = 'object' then st.state -> 'runs' else '{}'::jsonb end)
              where jsonb_typeof(value) = 'object'
              order by value ->> 's' desc
              limit 14
            ) r
          ), '{}'::jsonb),
          'erledigt', coalesce((
            select jsonb_object_agg(d.key, d.value)
            from (
              select key, value
              from jsonb_each(case when jsonb_typeof(st.state -> 'done') = 'object' then st.state -> 'done' else '{}'::jsonb end)
              where jsonb_typeof(value) = 'string'
              order by value #>> '{}' desc
              limit 14
            ) d
          ), '{}'::jsonb)
        )
        order by s.created_at
      )
      from public.gym_seats s
      left join public.user_state st on st.user_id = s.member_id
      left join auth.users u on u.id = s.member_id
      where s.gym_id = g.id
    ), '[]'::jsonb)
  );
end
$function$;

create or replace function public.gym_uebersicht_fuer(p_gym uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to ''
as $function$
declare
  g public.gyms;
begin
  select * into g from public.gyms where id = p_gym;
  if not found then return null; end if;
  return jsonb_build_object(
    'verein', g.name,
    'plaetze', g.seats,
    'heute', to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD'),
    'boxer', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'platz', s.id,
          'name', s.name,
          'belegt', s.member_id is not null,
          'zuletzt_gespeichert', st.updated_at,
          'letzte_anmeldung', u.last_sign_in_at,
          'ti', case when jsonb_typeof(st.state -> 'ti') = 'object' then st.state -> 'ti' else null end,
          'test_watt', nullif(st.state ->> 'maxW', ''),
          'test_datum', st.state ->> 'maxWDate',
          'runs', coalesce((
            select jsonb_object_agg(r.key, r.value)
            from (
              select key, value
              from jsonb_each(case when jsonb_typeof(st.state -> 'runs') = 'object' then st.state -> 'runs' else '{}'::jsonb end)
              where jsonb_typeof(value) = 'object'
              order by value ->> 's' desc
              limit 14
            ) r
          ), '{}'::jsonb),
          'erledigt', coalesce((
            select jsonb_object_agg(d.key, d.value)
            from (
              select key, value
              from jsonb_each(case when jsonb_typeof(st.state -> 'done') = 'object' then st.state -> 'done' else '{}'::jsonb end)
              where jsonb_typeof(value) = 'string'
              order by value #>> '{}' desc
              limit 14
            ) d
          ), '{}'::jsonb)
        )
        order by s.created_at
      )
      from public.gym_seats s
      left join public.user_state st on st.user_id = s.member_id
      left join auth.users u on u.id = s.member_id
      where s.gym_id = g.id
    ), '[]'::jsonb)
  );
end
$function$;

revoke all on function public.gym_trainer_uebersicht() from public, anon;
grant execute on function public.gym_trainer_uebersicht() to authenticated;
revoke all on function public.gym_uebersicht_fuer(uuid) from public, anon, authenticated;

create or replace function public.gym_seats_code_neu()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  roh text;
  neu text;
begin
  -- nur wenn ein belegter Platz frei wird und der Code dabei gleich bleibt (z. B. Boxer-Konto gelöscht)
  if old.member_id is not null and new.member_id is null and new.code = old.code then
    loop
      roh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      neu := substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4);
      exit when not exists (select 1 from public.gym_seats where code = neu);
    end loop;
    new.code := neu;
    new.redeemed_at := null;
  end if;
  return new;
end
$function$;

drop trigger if exists gym_seats_code_neu on public.gym_seats;
create trigger gym_seats_code_neu
  before update on public.gym_seats
  for each row
  execute function public.gym_seats_code_neu();

revoke all on function public.gym_seats_code_neu() from public, anon, authenticated;
