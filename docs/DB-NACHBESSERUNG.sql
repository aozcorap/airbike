-- Nachbesserungen aus der unabhängigen Prüfung vom 22.11.2026 (Datenbank)
--
-- REIHENFOLGE (wichtig):
--  1. Zuerst die App mit Build 125 veröffentlichen (Merge) und warten, bis die Seite auf 125 steht. Die neue App versteht
--     die neue Antwort von gym_code_einloesen ({"fehler": "..."}). Ältere App-Stände würden sie sonst als Erfolg zeigen.
--  2. Dann dieses Skript ausführen (jeder Teil steht für sich, Teile lassen sich einzeln ausführen).
--  3. Danach die Edge-Function feedback-to-github mit supabase/functions/feedback-to-github/index.ts neu veröffentlichen.
--
-- Rückgängig machen steht bei den Teilen.

-- ============================================================================================================
-- TEIL 1: Registrierung ohne Mindestalter und ohne Zustimmung der Eltern (aus DB-REGISTRIERUNG.sql)
-- Ohne diesen Teil weist die Datenbank Registrierungen unter 14 Jahren ab und verlangt unter 17 Jahren eine Elternzustimmung,
-- die die App nicht mehr abfragt. Die Prüfung von Geburtsjahr und Einwilligung bleibt.
-- ============================================================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  by_ int;
  cons boolean;
begin
  by_ := nullif(new.raw_user_meta_data->>'birth_year','')::int;
  cons := coalesce((new.raw_user_meta_data->>'consent')::boolean, false);
  if by_ is null or by_ < 1900 or by_ > extract(year from now())::int then
    raise exception 'Geburtsjahr fehlt oder ist ungültig';
  end if;
  if not cons then raise exception 'Einwilligung fehlt'; end if;
  insert into public.profiles (user_id, birth_year, guardian_consent) values (new.id, by_, false);
  insert into public.user_state (user_id) values (new.id);
  return new;
end $function$;

-- ============================================================================================================
-- TEIL 2: Admin-Ansicht lässt sich nicht mehr durch ungültige Werte im eigenen Stand lahmlegen
-- Vorher: ein Konto konnte z. B. maxW = "abc" in seinen Stand schreiben, dann brach admin_overview für alle ab.
-- ============================================================================================================
create or replace function public.safe_int(t text)
returns int
language sql
immutable
set search_path to ''
as $$ select case when t ~ '^[0-9]{1,6}$' then t::int else null end $$;

create or replace function public.safe_bool(t text)
returns boolean
language sql
immutable
set search_path to ''
as $$ select case when t in ('true', 'false') then t::boolean else null end $$;

revoke all on function public.safe_int(text), public.safe_bool(text) from public, anon, authenticated;

create or replace function public.admin_overview()
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
  return jsonb_build_object(
    'summary', (
      select to_jsonb(t) from (
        select
          count(*)::int as konten_gesamt,
          (count(*) filter (where u.email_confirmed_at is not null))::int as bestaetigt,
          (count(*) filter (where s.state = '{}'::jsonb or s.state is null))::int as nie_genutzt,
          (count(*) filter (where s.state <> '{}'::jsonb and s.updated_at > now() - interval '3 days'))::int as aktiv_3_tage,
          (count(*) filter (where s.state <> '{}'::jsonb and s.updated_at > now() - interval '7 days'))::int as aktiv_7_tage,
          (count(*) filter (where coalesce(public.safe_bool(s.state ->> 'onboarded'), false)))::int as einrichtung_fertig,
          (count(*) filter (where coalesce(public.safe_int(s.state ->> 'maxW'), 0) > 0))::int as mit_test_watt,
          (count(*) filter (where jsonb_typeof(s.state -> 'done') = 'object' and s.state -> 'done' <> '{}'::jsonb))::int as mit_erledigter_einheit,
          coalesce(sum(case when jsonb_typeof(s.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'done')) else 0 end), 0)::int as einheiten_gesamt
        from auth.users u
        left join public.user_state s on s.user_id = u.id
      ) t
    ),
    'users', (
      select coalesce(jsonb_agg((to_jsonb(x) - 'sort_key') order by x.sort_key desc), '[]'::jsonb) from (
        select
          u.id as user_id,
          u.email,
          (u.email_confirmed_at is not null) as bestaetigt,
          public.is_admin_id(u.id) as ist_admin,
          u.last_sign_in_at as letzte_anmeldung,
          case when jsonb_typeof(s.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'done')) else 0 end::int as einheiten_erledigt,
          nullif(public.safe_int(s.state ->> 'maxW'), 0) as test_watt,
          case when jsonb_typeof(s.state -> 'reports') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'reports')) else 0 end::int as meldungen,
          s.updated_at as zuletzt_gespeichert,
          case
            when s.updated_at is null or s.state = '{}'::jsonb then 'nie genutzt'
            when s.updated_at > now() - interval '3 days' then 'aktiv'
            when s.updated_at > now() - interval '14 days' then 'ruhig'
            else 'inaktiv'
          end as aktivitaet,
          coalesce(s.updated_at, u.created_at) as sort_key
        from auth.users u
        left join public.user_state s on s.user_id = u.id
      ) x
    )
  );
end
$function$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Die Regel "state ist ein Objekt" gilt bisher nur für neue Schreibvorgänge, jetzt auch für alte Zeilen
alter table public.user_state validate constraint user_state_is_object;

-- ============================================================================================================
-- TEIL 3: Sendegrenze für Meldungen (aus DB-MELDUNGEN-LIMIT.sql): höchstens 10 pro Stunde und Nutzer, beständig
-- Rückgängig: drop function public.feedback_allow(uuid, int); drop table public.feedback_hits;
-- ============================================================================================================
create table if not exists public.feedback_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists feedback_hits_user_at on public.feedback_hits (user_id, at desc);
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

-- ============================================================================================================
-- TEIL 4: Vereins-Codes: Versuchslimit (10 Fehlversuche pro Stunde und Konto) und Sperre gegen gleichzeitige Aufrufe
-- Falscheingaben werden als Antwort {"fehler": "..."} gemeldet (nicht als Fehler), sonst würde die Datenbank das Mitzählen zurückrollen.
-- Rückgängig: die Funktionen aus docs/DB-GYM.sql neu ausführen und drop table public.gym_versuche;
-- ============================================================================================================
create table if not exists public.gym_versuche (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists gym_versuche_user_at on public.gym_versuche (user_id, at desc);
alter table public.gym_versuche enable row level security;
revoke all on public.gym_versuche from anon, authenticated;

create or replace function public.gym_erstellen(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'Bitte einen Namen eingeben'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text)); -- ein Konto kann nicht gleichzeitig Trainer und Boxer werden
  if exists (select 1 from public.gym_seats where member_id = uid) then raise exception 'Dieses Konto trainiert schon über einen Verein'; end if;
  insert into public.gyms (owner_id, name) values (uid, left(btrim(p_name), 60)) on conflict (owner_id) do nothing;
  return public.gym_laden();
end
$function$;

create or replace function public.gym_code_einloesen(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  roh text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  s public.gym_seats;
  n int;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  delete from public.gym_versuche where at < now() - interval '1 day';
  select count(*) into n from public.gym_versuche where user_id = uid and at > now() - interval '1 hour';
  if n >= 10 then return jsonb_build_object('fehler', 'Zu viele falsche Versuche. Bitte warte eine Stunde.'); end if;
  if exists (select 1 from public.gyms where owner_id = uid) then raise exception 'Dieses Konto ist ein Trainer-Konto'; end if;
  if exists (select 1 from public.gym_seats where member_id = uid) then raise exception 'Du trainierst schon über einen Verein'; end if;
  if char_length(roh) = 12 then
    select * into s from public.gym_seats
      where code = substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4) for update;
  end if;
  if s.id is null or s.member_id is not null then
    insert into public.gym_versuche (user_id) values (uid); -- zählt als Fehlversuch (die Antwort ist kein Fehler, damit der Eintrag bleibt)
    return jsonb_build_object('fehler', 'Der Code ist ungültig oder schon vergeben');
  end if;
  update public.gym_seats set member_id = uid, redeemed_at = now() where id = s.id;
  return public.gym_mein_zugang();
end
$function$;

revoke all on function public.gym_erstellen(text), public.gym_code_einloesen(text) from public, anon;
grant execute on function public.gym_erstellen(text), public.gym_code_einloesen(text) to authenticated;

-- ============================================================================================================
-- TEIL 5: Unbestätigte Konten jede Nacht aufräumen (aus DB-AUFRAEUMEN.sql, Teil 3)
-- Löscht Konten, deren E-Mail nach 7 Tagen nie bestätigt wurde (Profil und Stand gehen automatisch mit).
-- Rückgängig: select cron.unschedule('unbestaetigte-konten-loeschen');
-- ============================================================================================================
select cron.schedule(
  'unbestaetigte-konten-loeschen',
  '17 3 * * *',
  $$ delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days' $$
);

-- ============================================================================================================
-- TEIL 6: Code-Erinnerung: höchstens 10 Mails pro Lauf statt 20 (schont das Stundenkontingent für echte Anmeldungen)
-- ============================================================================================================
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
    limit 10
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
