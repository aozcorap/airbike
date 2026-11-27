-- Testwoche für Vereine (27.11.2026, Regel des Betreibers). Ersetzt die Probe mit einer gemeinsamen Gratis-Einheit aus docs/DB-PROBE.sql.
-- STATUS: ausgeführt in Supabase am 27.11.2026 (nach "Ja, ausführen" des Betreibers).
--
-- Regel: Der Trainer wählt bei der Anmeldung ein Paket (3, 5 oder 10 Boxer) und testet es 7 Tage ohne Bezahlung.
--   - Während der Woche: Trainer und Boxer trainieren werbefrei, der Trainer legt Boxer-Plätze bis zur Größe des gewählten Pakets an.
--   - Nach der Woche ohne Kauf: kein Vereinszugang mehr. Trainer und Boxer trainieren wie Privatpersonen (Werbung oder Abo).
--     Die Codes bleiben gültig. Mit dem Kauf (gyms.seats > 0) ist der Zugang für alle sofort wieder da.
--   - Jeder Verein hat nur EINE Testwoche (test_bis wird nur einmal gesetzt).
--   - Mit Paket (seats 3, 5, 10) ändert sich nichts gegenüber heute.
-- Grenze: Mit einer neuen E-Mail-Adresse kann jemand einen neuen Verein und damit eine neue Testwoche starten. Echte Absicherung kommt mit dem Kauf-Beleg.
--
-- Rückgängig machen: Funktionen aus docs/DB-PROBE.sql (Teil 1 und Teil 2) erneut ausführen, danach
--   drop function if exists public.gym_testwoche_starten(int), public.gym_test_laeuft(uuid), public.gym_test_woche_setzen(int);
--   alter table public.gyms drop column if exists test_bis, drop column if exists test_plaetze;

alter table public.gyms add column if not exists test_bis timestamptz;
alter table public.gyms add column if not exists test_plaetze int;

-- Läuft die Testwoche dieses Vereins gerade? (nur ohne gekauftes Paket)
create or replace function public.gym_test_laeuft(p_gym uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select g.seats = 0 and g.test_bis is not null and g.test_bis > now() from public.gyms g where g.id = p_gym), false)
$function$;

-- Testwoche starten: einmal je Verein, mit einem der drei Pakete
create or replace function public.gym_testwoche_starten(p_plaetze int)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if p_plaetze not in (3, 5, 10) then raise exception 'Bitte ein Paket wählen (3, 5 oder 10 Boxer)'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  if g.seats > 0 then raise exception 'Das Paket ist schon gekauft'; end if;
  if g.test_bis is not null then raise exception 'Die Testwoche wurde schon genutzt'; end if;
  update public.gyms set test_plaetze = p_plaetze, test_bis = now() + interval '7 days' where id = g.id;
  return public.gym_laden();
end
$function$;

-- Zugang: mit Paket oder während der Testwoche. Danach bekommt ein Boxer art = 'probe_vorbei' (Text in der App, nicht werbefrei).
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
    where s.member_id = uid and (g.seats > 0 or public.gym_test_laeuft(g.id));
  if r is not null then return r; end if;
  select jsonb_build_object('art', 'trainer', 'verein', g.name) into r
    from public.gyms g where g.owner_id = uid and (g.seats > 0 or public.gym_test_laeuft(g.id));
  if r is not null then return r; end if;
  select jsonb_build_object('art', 'probe_vorbei', 'verein', g.name) into r
    from public.gym_seats s join public.gyms g on g.id = s.gym_id
    where s.member_id = uid;
  return r;
end
$function$;

-- Platz anlegen: bis zur Größe des gekauften Pakets, sonst bis zur Größe des Testpakets, solange die Testwoche läuft
create or replace function public.gym_platz_anlegen(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
  erlaubt int;
  neu text;
  roh text;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'Bitte einen Namen eingeben'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  erlaubt := case when g.seats > 0 then g.seats when public.gym_test_laeuft(g.id) then coalesce(g.test_plaetze, 0) else 0 end;
  if erlaubt = 0 then raise exception 'Die Testwoche ist vorbei. Für weitere Boxer brauchst du ein Paket'; end if;
  if (select count(*) from public.gym_seats where gym_id = g.id) >= erlaubt then raise exception 'Alle Plätze sind vergeben'; end if;
  loop
    roh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    neu := substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4);
    exit when not exists (select 1 from public.gym_seats where code = neu);
  end loop;
  insert into public.gym_seats (gym_id, name, code) values (g.id, left(btrim(p_name), 60), neu);
  return public.gym_laden();
end
$function$;

-- Eigenen Verein laden. 'probe' = null (Paket gekauft), 'keine' (Testwoche noch nicht gestartet), 'laeuft' oder 'vorbei'.
-- Neu: 'test_bis' und 'plaetze_erlaubt' (so viele Plätze darf der Trainer jetzt haben).
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
    'probe', case when g.seats > 0 then null when g.test_bis is null then 'keine' when g.test_bis > now() then 'laeuft' else 'vorbei' end,
    'test_bis', case when g.seats = 0 then g.test_bis else null end,
    'plaetze_erlaubt', case when g.seats > 0 then g.seats when g.test_bis > now() then coalesce(g.test_plaetze, 0) else 0 end,
    'test_plaetze', g.test_plaetze,
    'plaetze', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'belegt', s.member_id is not null) order by s.created_at)
      from public.gym_seats s where s.gym_id = g.id
    ), '[]'::jsonb)
  );
end
$function$;

-- Alte App-Versionen (Build 143) rufen noch gym_probe_pruefen auf: tut jetzt nichts mehr, damit kein Fehler entsteht
create or replace function public.gym_probe_pruefen()
returns void
language plpgsql
security definer
set search_path to ''
as $function$ begin return; end $function$;

-- Nur für Admins und Testkonten: Testpaket setzen/zurücksetzen und die Testwoche verschieben (Tage, auch negativ = vorbei), um alles prüfen zu können
create or replace function public.gym_test_paket(p_plaetze integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
begin
  if not (public.is_admin() or public.ist_testkonto()) then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_plaetze not in (0, 3, 5, 10) then raise exception 'Erlaubt sind 0, 3, 5 oder 10 Plätze'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  if (select count(*) from public.gym_seats where gym_id = g.id) > p_plaetze then raise exception 'Es sind schon mehr Plätze angelegt'; end if;
  update public.gyms set seats = p_plaetze,
    test_bis = case when p_plaetze = 0 then null else test_bis end,
    test_plaetze = case when p_plaetze = 0 then null else test_plaetze end
  where id = g.id;
  return public.gym_laden();
end
$function$;

create or replace function public.gym_test_woche_setzen(p_tage int)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
begin
  if not (public.is_admin() or public.ist_testkonto()) then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  update public.gyms set test_bis = now() + make_interval(days => p_tage), test_plaetze = coalesce(test_plaetze, 5) where id = g.id;
  return public.gym_laden();
end
$function$;

-- Die alte Probe-Prüfung gibt es nicht mehr
drop function if exists public.gym_probe_vorbei(uuid);

revoke all on function public.gym_test_laeuft(uuid) from public, anon;
revoke all on function public.gym_testwoche_starten(int), public.gym_test_woche_setzen(int) from public, anon;
grant execute on function public.gym_testwoche_starten(int), public.gym_test_woche_setzen(int) to authenticated;
