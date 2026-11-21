-- Gym-Konto (Verein): Trainer legt Plätze an, jeder Boxer bekommt einen eigenen Code (Idee des Betreibers 21.11.2026, siehe OFFENE-PUNKTE.md)
--
-- Zwei neue Tabellen, keine Änderung an bestehenden Tabellen oder Daten:
--   gyms      ein Verein je Trainer-Konto, "seats" = Zahl der gekauften Plätze (0 = noch kein Paket, erlaubt sind 3, 5 und 10)
--   gym_seats ein Platz = ein Boxer = ein Code. Wird der Platz gelöscht, ist der Code für immer ungültig.
--
-- Von außen sind die Tabellen weder lesbar noch beschreibbar. Alles läuft über die Funktionen unten, die selbst prüfen,
-- wer fragt (security definer). Die Regeln liegen also in der Datenbank, nicht in der App.
--
-- Das Paket wird vorerst von einem Admin gesetzt (gym_test_paket), bis es den Kauf über Apple gibt.
-- Rückgängig machen (nur solange noch niemand die Funktion nutzt):
--   drop function if exists public.gym_erstellen(text), public.gym_laden(), public.gym_platz_anlegen(text),
--     public.gym_platz_loeschen(uuid), public.gym_code_einloesen(text), public.gym_mein_zugang(), public.gym_test_paket(int);
--   drop table if exists public.gym_seats, public.gyms;

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  seats int not null default 0 check (seats in (0, 3, 5, 10)),
  created_at timestamptz not null default now()
);

create table if not exists public.gym_seats (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  code text not null unique,
  member_id uuid unique references auth.users (id) on delete set null, -- ein Konto kann höchstens einen Platz belegen
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gym_seats_gym_idx on public.gym_seats (gym_id);

alter table public.gyms enable row level security;
alter table public.gym_seats enable row level security;
revoke all on public.gyms from anon, authenticated;
revoke all on public.gym_seats from anon, authenticated;

-- Verein anlegen (ein Konto, ein Verein). Das Paket kommt später durch den Kauf, vorerst 0 Plätze.
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
  if exists (select 1 from public.gym_seats where member_id = uid) then raise exception 'Dieses Konto trainiert schon über einen Verein'; end if;
  insert into public.gyms (owner_id, name) values (uid, left(btrim(p_name), 60)) on conflict (owner_id) do nothing;
  return public.gym_laden();
end
$function$;

-- Eigenen Verein mit allen Plätzen laden (null, wenn es keinen gibt)
create or replace function public.gym_laden()
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
    'name', g.name,
    'plaetze_gesamt', g.seats,
    'plaetze', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'belegt', s.member_id is not null) order by s.created_at)
      from public.gym_seats s where s.gym_id = g.id
    ), '[]'::jsonb)
  );
end
$function$;

-- Platz für einen Boxer anlegen: erzeugt einen neuen, zufälligen Code (12 Zeichen, Form XXXX-XXXX-XXXX)
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
  if g.seats = 0 then raise exception 'Noch kein Paket gewählt'; end if;
  if (select count(*) from public.gym_seats where gym_id = g.id) >= g.seats then raise exception 'Alle Plätze sind vergeben'; end if;
  loop
    roh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    neu := substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4);
    exit when not exists (select 1 from public.gym_seats where code = neu);
  end loop;
  insert into public.gym_seats (gym_id, name, code) values (g.id, left(btrim(p_name), 60), neu);
  return public.gym_laden();
end
$function$;

-- Platz löschen: der Code ist sofort und für immer ungültig, der Boxer verliert den Zugang (sein Konto und seine Daten bleiben)
create or replace function public.gym_platz_loeschen(p_platz uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  delete from public.gym_seats s using public.gyms g where s.id = p_platz and s.gym_id = g.id and g.owner_id = uid;
  return public.gym_laden();
end
$function$;

-- Boxer löst seinen Code ein. Ein Code geht nur einmal, ein Konto hat höchstens einen Platz.
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
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if char_length(roh) <> 12 then raise exception 'Der Code ist ungültig'; end if;
  if exists (select 1 from public.gyms where owner_id = uid) then raise exception 'Dieses Konto ist ein Trainer-Konto'; end if;
  if exists (select 1 from public.gym_seats where member_id = uid) then raise exception 'Du trainierst schon über einen Verein'; end if;
  select * into s from public.gym_seats
    where code = substr(roh, 1, 4) || '-' || substr(roh, 5, 4) || '-' || substr(roh, 9, 4) for update;
  if not found or s.member_id is not null then raise exception 'Der Code ist ungültig oder schon vergeben'; end if;
  update public.gym_seats set member_id = uid, redeemed_at = now() where id = s.id;
  return public.gym_mein_zugang();
end
$function$;

-- Welchen Zugang hat das eigene Konto? art = 'verein' (Boxer mit Platz) oder 'trainer', sonst null. Ohne Paket (0 Plätze) gilt kein Zugang.
create or replace function public.gym_mein_zugang()
returns jsonb
language plpgsql
security definer
stable
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  r jsonb;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  select jsonb_build_object('art', 'verein', 'verein', g.name) into r
    from public.gym_seats s join public.gyms g on g.id = s.gym_id
    where s.member_id = uid and g.seats > 0;
  if r is not null then return r; end if;
  select jsonb_build_object('art', 'trainer', 'verein', g.name) into r from public.gyms g where g.owner_id = uid and g.seats > 0;
  return r;
end
$function$;

-- Testschalter: Nur Admins, nur für den eigenen Verein. Ersetzt den Kauf, bis es den In-App-Kauf gibt.
-- Weniger Plätze als schon angelegt sind nicht möglich.
create or replace function public.gym_test_paket(p_plaetze int)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  g public.gyms;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_plaetze not in (0, 3, 5, 10) then raise exception 'Erlaubt sind 0, 3, 5 oder 10 Plätze'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  if (select count(*) from public.gym_seats where gym_id = g.id) > p_plaetze then raise exception 'Es sind schon mehr Plätze angelegt'; end if;
  update public.gyms set seats = p_plaetze where id = g.id;
  return public.gym_laden();
end
$function$;

-- Nur angemeldete Nutzer dürfen die Funktionen aufrufen (nie anonym)
revoke all on function public.gym_erstellen(text), public.gym_laden(), public.gym_platz_anlegen(text), public.gym_platz_loeschen(uuid),
  public.gym_code_einloesen(text), public.gym_mein_zugang(), public.gym_test_paket(int) from public, anon;
grant execute on function public.gym_erstellen(text), public.gym_laden(), public.gym_platz_anlegen(text), public.gym_platz_loeschen(uuid),
  public.gym_code_einloesen(text), public.gym_mein_zugang(), public.gym_test_paket(int) to authenticated;
