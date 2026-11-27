-- ÜBERHOLT am 27.11.2026: ersetzt durch die Testwoche, siehe docs/DB-TESTWOCHE.sql. Diese Datei zeigt nur den früheren Stand.
-- Probezeit für Vereine (27.11.2026, Regel des Betreibers, ausgeführt in Supabase am 27.11.2026)
--
-- Regel: Ein Verein hat EINE gemeinsame Gratis-Einheit, wer zuerst trainiert (Trainer oder ein Boxer).
--   - Solange noch keine Plan-Einheit erledigt ist (Probe läuft): Der Trainer trainiert werbefrei und ohne Abo, er darf EINEN Boxer-Platz mit Code anlegen,
--     der Boxer trainiert ebenfalls werbefrei.
--   - Sobald eine Plan-Einheit erledigt ist (Fitness-Test zählt nicht): Die Probe ist vorbei. Ohne Paket gibt es keinen Vereinszugang mehr.
--     Der Boxer trainiert weiter wie eine Privatperson (Abo oder Werbung), der Trainer auch. Weitere Plätze gibt es erst mit Paket.
--   - Mit Paket (seats 3, 5, 10) ändert sich nichts gegenüber heute. Der Probe-Platz zählt als einer der Plätze.
--
-- "Einheit erledigt" = der gespeicherte Stand des Kontos (user_state.state -> 'done') ist nicht leer. Damit "Plan zurücksetzen" die Probe nicht wieder öffnet,
-- wird der Zeitpunkt in gyms.probe_ende festgehalten (gym_probe_pruefen, ruft die App nach der Anmeldung und nach dem Speichern auf).
-- Grenze: Der Stand liegt im Konto des Nutzers, wer ihn vor der ersten Prüfung selbst leert, verlängert die Probe. Echte Absicherung kommt mit dem Kauf-Beleg.
--
-- Bestehende Vereine ohne Paket (z. B. Test-Verein): Für sie läuft die Probe, bis die erste Einheit erledigt ist.
--
-- Rückgängig machen: gym_mein_zugang(), gym_platz_anlegen(text) und gym_laden() aus docs/DB-GYM.sql erneut ausführen, danach
--   drop function if exists public.gym_probe_pruefen(), public.gym_probe_vorbei(uuid);
--   alter table public.gyms drop column if exists probe_ende;

alter table public.gyms add column if not exists probe_ende timestamptz;

-- Ist die Probe dieses Vereins vorbei? (schon festgehalten oder Trainer/Boxer hat eine Einheit erledigt)
create or replace function public.gym_probe_vorbei(p_gym uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select g.probe_ende is not null from public.gyms g where g.id = p_gym), true)
    or exists (
      select 1 from public.user_state st
      where st.user_id in (
        select owner_id from public.gyms where id = p_gym
        union
        select member_id from public.gym_seats where gym_id = p_gym and member_id is not null
      )
      and jsonb_typeof(st.state -> 'done') = 'object' and (st.state -> 'done') <> '{}'::jsonb
    )
$function$;

-- Hält das Ende der Probe fest (nur für den eigenen Verein: als Trainer oder als Boxer mit Platz)
create or replace function public.gym_probe_pruefen()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  gid uuid;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select id into gid from public.gyms where owner_id = uid;
  if gid is null then select gym_id into gid from public.gym_seats where member_id = uid; end if;
  if gid is null then return; end if;
  if public.gym_probe_vorbei(gid) then
    update public.gyms set probe_ende = now() where id = gid and probe_ende is null;
  end if;
end
$function$;

-- Zugang: Mit Paket wie bisher. Ohne Paket nur, solange die Probe läuft.
create or replace function public.gym_mein_zugang()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  r jsonb;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select jsonb_build_object('art', 'verein', 'verein', g.name) into r
    from public.gym_seats s join public.gyms g on g.id = s.gym_id
    where s.member_id = uid and (g.seats > 0 or not public.gym_probe_vorbei(g.id));
  if r is not null then return r; end if;
  select jsonb_build_object('art', 'trainer', 'verein', g.name) into r
    from public.gyms g where g.owner_id = uid and (g.seats > 0 or not public.gym_probe_vorbei(g.id));
  return r;
end
$function$;

-- Platz anlegen: Mit Paket wie bisher. Ohne Paket genau ein Platz, solange die Probe läuft.
create or replace function public.gym_platz_anlegen(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
  neu text;
  roh text;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'Bitte einen Namen eingeben'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  if g.seats = 0 and public.gym_probe_vorbei(g.id) then raise exception 'Die Probe ist vorbei. Für weitere Boxer brauchst du ein Paket'; end if;
  if (select count(*) from public.gym_seats where gym_id = g.id) >= greatest(g.seats, 1) then raise exception 'Alle Plätze sind vergeben'; end if;
  loop
    roh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    neu := substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4);
    exit when not exists (select 1 from public.gym_seats where code = neu);
  end loop;
  insert into public.gym_seats (gym_id, name, code) values (g.id, left(btrim(p_name), 60), neu);
  return public.gym_laden();
end
$function$;

-- Eigenen Verein laden: zusätzlich 'probe' = 'laeuft' oder 'vorbei' (nur ohne Paket), damit die App den richtigen Text zeigt
create or replace function public.gym_laden()
returns jsonb
language plpgsql
stable
security definer
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
    'name', g.name,
    'plaetze_gesamt', g.seats,
    'probe', case when g.seats > 0 then null when public.gym_probe_vorbei(g.id) then 'vorbei' else 'laeuft' end,
    'plaetze', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'belegt', s.member_id is not null) order by s.created_at)
      from public.gym_seats s where s.gym_id = g.id
    ), '[]'::jsonb)
  );
end
$function$;

revoke all on function public.gym_probe_vorbei(uuid), public.gym_probe_pruefen() from public, anon;
grant execute on function public.gym_probe_pruefen() to authenticated;

-- Teil 2 (27.11.2026, ausgeführt in Supabase am 27.11.2026): Ein Boxer mit Platz, dessen Probe vorbei ist und dessen Verein kein Paket hat, bekommt
-- art = 'probe_vorbei' (statt null), damit die App ihm den richtigen Text zeigen kann. Werbefrei bleibt nur art = 'verein' (Prüfung in app.js).
-- Rückgängig machen: gym_mein_zugang() aus Teil 1 dieser Datei erneut ausführen.
create or replace function public.gym_mein_zugang()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  r jsonb;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select jsonb_build_object('art', 'verein', 'verein', g.name) into r
    from public.gym_seats s join public.gyms g on g.id = s.gym_id
    where s.member_id = uid and (g.seats > 0 or not public.gym_probe_vorbei(g.id));
  if r is not null then return r; end if;
  select jsonb_build_object('art', 'trainer', 'verein', g.name) into r
    from public.gyms g where g.owner_id = uid and (g.seats > 0 or not public.gym_probe_vorbei(g.id));
  if r is not null then return r; end if;
  select jsonb_build_object('art', 'probe_vorbei', 'verein', g.name) into r
    from public.gym_seats s join public.gyms g on g.id = s.gym_id
    where s.member_id = uid;
  return r;
end
$function$;
