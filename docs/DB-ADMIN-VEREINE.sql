-- Admin: Vereinsprofile ansehen (Wunsch des Betreibers 22.11.2026)
--
-- Zwei neue Funktionen, keine neue Tabelle, keine Änderung an bestehenden Daten oder Funktionen.
-- Beide prüfen selbst, ob der Aufrufer Admin ist (public.is_admin()). Wer kein Admin ist, bekommt "Kein Zugriff".
--   admin_vereine()                    Liste aller Vereine: id, Name, Plätze (Paket), belegte Plätze, E-Mail des Trainers
--   admin_verein_uebersicht(p_gym)     der Stand der Boxer eines Vereins, im selben Format wie gym_trainer_uebersicht()
--                                      (Woche, Phase, Einheiten, letzte 14 Einheiten mit Zeitmessung, Test-Watt, letzte Anmeldung)
-- Es werden keine E-Mail-Adressen der Boxer, keine Geburtsjahre und keine Meldungen herausgegeben.
-- Die Hilfsfunktion gym_uebersicht_fuer() kann nur von diesen beiden Funktionen aufgerufen werden, nicht von außen.
--
-- Rückgängig machen:
--   drop function if exists public.admin_vereine(), public.admin_verein_uebersicht(uuid), public.gym_uebersicht_fuer(uuid);

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

revoke all on function public.gym_uebersicht_fuer(uuid) from public, anon, authenticated;

create or replace function public.admin_vereine()
returns jsonb
language plpgsql
security definer
stable
set search_path to ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'plaetze', g.seats,
        'belegt', (select count(*) from public.gym_seats s where s.gym_id = g.id and s.member_id is not null),
        'trainer', u.email
      )
      order by g.name
    )
    from public.gyms g
    left join auth.users u on u.id = g.owner_id
  ), '[]'::jsonb);
end
$function$;

create or replace function public.admin_verein_uebersicht(p_gym uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  return public.gym_uebersicht_fuer(p_gym);
end
$function$;

revoke all on function public.admin_vereine(), public.admin_verein_uebersicht(uuid) from public, anon;
grant execute on function public.admin_vereine(), public.admin_verein_uebersicht(uuid) to authenticated;
