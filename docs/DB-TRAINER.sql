-- Traineransicht (Konzept siehe OFFENE-PUNKTE.md, 22.11.2026)
--
-- Eine Funktion, keine neue Tabelle, keine Änderung an bestehenden Daten.
-- gym_trainer_uebersicht() gibt dem angemeldeten Trainer den Stand der Boxer, die auf SEINEN Plätzen sitzen, und sonst niemandem.
-- Die Prüfung liegt in der Datenbank (security definer, Zuordnung über gyms.owner_id = angemeldetes Konto und gym_seats.member_id).
--
-- Aus dem gespeicherten Stand des Boxers (public.user_state.state) werden nur diese Felder herausgegeben:
--   ti       kurzer Stand (Woche, Phase, erledigte Einheiten, Einheit von heute, letzte Einheit, versäumter Planungstag)
--   runs     die letzten 14 Einheiten mit Zeitmessung (geplant, gelaufen, Sprünge, Pausen, App verlassen, gespeichert)
--   erledigt die letzten 14 als erledigt markierten Einheiten mit Zeitpunkt
--   maxW und maxWDate (Test-Watt)
-- dazu den Zeitpunkt der letzten Sicherung und der letzten Anmeldung. Sonst nichts (keine E-Mail-Adresse, kein Geburtsjahr, keine Meldungen).
--
-- Rückgängig machen:  drop function if exists public.gym_trainer_uebersicht();

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
