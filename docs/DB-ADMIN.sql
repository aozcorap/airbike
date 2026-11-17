-- Admin-Ansicht in der App: Testuser und Nutzung (https://aozcorap.github.io/airbike/#/admin)
--
-- Die Seite selbst ist öffentlich, die Daten sind es nicht: Sie kommen aus der Funktion admin_overview(), die nur
-- antwortet, wenn das angemeldete Konto in der Tabelle admins steht. Die Prüfung liegt in der Datenbank.
--
-- Ohne Eintrag in admins liefert jeder Aufruf einen Fehler "Kein Zugriff", auch für angemeldete Nutzer.
-- Einen Admin eintragen (im SQL Editor, die Konto-ID steht in Supabase unter Authentication, Users):
--   insert into public.admins (user_id) values ('<KONTO-ID>');
-- Einen Admin austragen:
--   delete from public.admins where user_id = '<KONTO-ID>';

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Keine Regeln und keine Rechte für Nutzer: Die Tabelle ist von außen nicht lesbar und nicht beschreibbar.
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path to ''
as $function$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$function$;

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
          (count(*) filter (where coalesce((s.state ->> 'onboarded')::boolean, false)))::int as einrichtung_fertig,
          (count(*) filter (where coalesce(nullif(s.state ->> 'maxW', '')::int, 0) > 0))::int as mit_test_watt,
          (count(*) filter (where jsonb_typeof(s.state -> 'done') = 'object' and s.state -> 'done' <> '{}'::jsonb))::int as mit_erledigter_einheit,
          coalesce(sum(case when jsonb_typeof(s.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'done')) else 0 end), 0)::int as einheiten_gesamt
        from auth.users u
        left join public.user_state s on s.user_id = u.id
      ) t
    ),
    'users', (
      select coalesce(jsonb_agg((to_jsonb(x) - 'sort_key') order by x.sort_key desc), '[]'::jsonb) from (
        select
          u.email,
          (u.email_confirmed_at is not null) as bestaetigt,
          u.last_sign_in_at as letzte_anmeldung,
          case when jsonb_typeof(s.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'done')) else 0 end::int as einheiten_erledigt,
          nullif(nullif(s.state ->> 'maxW', '')::int, 0) as test_watt,
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

-- Nur angemeldete Nutzer dürfen die Funktionen aufrufen, Anonyme nicht. Wer wirklich etwas sieht, entscheidet is_admin().
revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
