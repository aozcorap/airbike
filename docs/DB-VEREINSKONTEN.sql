-- Vereinskonten testen und im Admin-Bereich auswerten (Wunsch des Betreibers 23.11.2026)
--
-- 1. Testkonten: Eine kleine Liste von Konten, die wie Admins den GESPIELTEN Kauf nutzen dürfen (Vereinspaket, Abo),
--    ohne Admin zu sein und ohne etwas vom Admin-Bereich zu sehen. Gedacht für das Vereinskonto des Betreibers.
--    Tabelle testkonten (von außen nicht lesbar), Funktion ist_testkonto() (jedes angemeldete Konto fragt nur nach sich selbst).
--    gym_test_paket, abo_test_kaufen und abo_test_beenden erlauben jetzt "Admin ODER Testkonto". Sonst ändert sich nichts.
-- 2. admin_vereine(): liefert zusätzlich je Verein: angelegt am, belegte Plätze, Boxer mit Aktivität in 7 Tagen,
--    erledigte Einheiten aller Boxer, letzte Aktivität. Nur Admin. Dieselben Schlüssel wie bisher plus die neuen.
--
-- Nach der Registrierung des Vereinskontos (nicht Teil dieses Skripts, danach einzeln, jeweils vorher gezeigt):
--   insert into public.testkonten (user_id) select id from auth.users where lower(email) = lower('<Vereins-Mail>');
--   update public.gyms set owner_id = (select id from auth.users where lower(email) = lower('<Vereins-Mail>')) where name = 'Boxring Wetterau';
--
-- Rückgängig machen: Die drei Funktionen mit ihrer früheren Fassung aus docs/DB-GYM.sql, docs/DB-ABO.sql und docs/DB-ADMIN-VEREINE.sql
-- neu anlegen, danach: drop function if exists public.ist_testkonto(); drop table if exists public.testkonten;

create table if not exists public.testkonten (
  user_id uuid primary key references auth.users (id) on delete cascade,
  angelegt timestamptz not null default now()
);
alter table public.testkonten enable row level security;
revoke all on public.testkonten from anon, authenticated;

create or replace function public.ist_testkonto()
returns boolean
language sql
security definer
stable
set search_path to ''
as $$ select exists (select 1 from public.testkonten where user_id = (select auth.uid())) $$;

revoke all on function public.ist_testkonto() from public, anon;
grant execute on function public.ist_testkonto() to authenticated;

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
  if not (public.is_admin() or public.ist_testkonto()) then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_plaetze not in (0, 3, 5, 10) then raise exception 'Erlaubt sind 0, 3, 5 oder 10 Plätze'; end if;
  select * into g from public.gyms where owner_id = uid for update;
  if not found then raise exception 'Kein Verein angelegt'; end if;
  if (select count(*) from public.gym_seats where gym_id = g.id) > p_plaetze then raise exception 'Es sind schon mehr Plätze angelegt'; end if;
  update public.gyms set seats = p_plaetze where id = g.id;
  return public.gym_laden();
end
$function$;

create or replace function public.abo_test_kaufen(p_art text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not (public.is_admin() or public.ist_testkonto()) then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_art not in ('monat', 'jahr') then raise exception 'Unbekannte Art'; end if;
  insert into public.abos (user_id, art, bis, quelle, geaendert)
  values (uid, p_art, now() + case when p_art = 'jahr' then interval '1 year' else interval '1 month' end, 'test', now())
  on conflict (user_id) do update set art = excluded.art, bis = excluded.bis, quelle = 'test', geaendert = now();
  return public.abo_status();
end
$function$;

create or replace function public.abo_test_beenden()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not (public.is_admin() or public.ist_testkonto()) then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  delete from public.abos where user_id = uid and quelle = 'test';
  return public.abo_status();
end
$function$;

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
        'trainer', u.email,
        'angelegt', g.created_at,
        'belegt', coalesce(m.belegt, 0),
        'aktiv_7_tage', coalesce(m.aktiv, 0),
        'einheiten', coalesce(m.einheiten, 0),
        'zuletzt', m.zuletzt
      )
      order by g.name
    )
    from public.gyms g
    left join auth.users u on u.id = g.owner_id
    left join lateral (
      select
        (count(*) filter (where s.member_id is not null))::int as belegt,
        (count(*) filter (where st.updated_at > now() - interval '7 days' and st.state <> '{}'::jsonb))::int as aktiv,
        coalesce(sum(case when jsonb_typeof(st.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(st.state -> 'done')) else 0 end), 0)::int as einheiten,
        max(st.updated_at) as zuletzt
      from public.gym_seats s
      left join public.user_state st on st.user_id = s.member_id
      where s.gym_id = g.id
    ) m on true
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.gym_test_paket(int), public.abo_test_kaufen(text), public.abo_test_beenden(), public.admin_vereine() from public, anon;
grant execute on function public.gym_test_paket(int), public.abo_test_kaufen(text), public.abo_test_beenden(), public.admin_vereine() to authenticated;
