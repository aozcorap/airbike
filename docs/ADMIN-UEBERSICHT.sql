-- Admin-Übersicht: Welche Testuser gibt es und wie intensiv nutzen sie die App?
--
-- So benutzt du es: Supabase öffnen, Projekt last-round, links "SQL Editor", den gewünschten Teil einfügen, "Run".
-- Beide Abfragen sind reine Lese-Abfragen (select), sie verändern nichts.
-- Sie laufen nur im Supabase-Dashboard (als Betreiber). Angemeldete Nutzer und die App selbst sehen fremde Daten nie,
-- das verhindern die Zeilenregeln der Tabellen.
--
-- Datenschutz: Die Tabelle zeigt E-Mail-Adressen und Trainingsdaten. Nicht weitergeben und keine Bildschirmfotos teilen.
-- Dass der Betreiber diese Daten einsehen kann, sollte vor dem Livegang im Datenschutz stehen.
--
-- Was "aktiv" bedeutet, und was nicht erfasst wird:
-- - Die App speichert nur, wenn sich etwas ändert (Einheit abgehakt, Einstellung geändert, Test gemacht).
--   "zuletzt_gespeichert" ist darum der Zeitpunkt der letzten Änderung, nicht des letzten Öffnens.
--   Wer die App nur öffnet und ansieht, taucht hier nicht auf.
-- - "letzte_anmeldung" ändert sich nur bei einer neuen Anmeldung per Code. Die App bleibt angemeldet, ein Nutzer
--   kann also lange aktiv sein und trotzdem eine alte Anmeldung zeigen.
-- - Nicht erfasst: Seitenaufrufe, Dauer in der App, Timer-Starts ohne Abhaken.

-- 1. ZUSAMMENFASSUNG
select
  count(*) as konten_gesamt,
  count(*) filter (where u.email_confirmed_at is not null) as bestaetigt,
  count(*) filter (where u.email_confirmed_at is null) as unbestaetigt,
  count(*) filter (where s.state = '{}'::jsonb or s.state is null) as nie_genutzt,
  count(*) filter (where s.state <> '{}'::jsonb and s.updated_at > now() - interval '3 days') as aktiv_3_tage,
  count(*) filter (where s.state <> '{}'::jsonb and s.updated_at > now() - interval '7 days') as aktiv_7_tage,
  count(*) filter (where coalesce((s.state ->> 'onboarded')::boolean, false)) as einrichtung_fertig,
  count(*) filter (where coalesce(nullif(s.state ->> 'maxW', '')::int, 0) > 0) as mit_test_watt,
  count(*) filter (where jsonb_typeof(s.state -> 'done') = 'object' and s.state -> 'done' <> '{}'::jsonb) as mit_erledigter_einheit,
  coalesce(sum(case when jsonb_typeof(s.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'done')) else 0 end), 0) as einheiten_gesamt
from auth.users u
left join public.user_state s on s.user_id = u.id;

-- 2. JEDER TESTUSER EINZELN (zuletzt Aktive zuerst)
select
  u.email,
  u.created_at::date as angelegt,
  (u.email_confirmed_at is not null) as bestaetigt,
  u.last_sign_in_at as letzte_anmeldung,
  p.birth_year as geburtsjahr,
  coalesce((s.state ->> 'onboarded')::boolean, false) as einrichtung_fertig,
  case when jsonb_typeof(s.state -> 'done') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'done')) else 0 end as einheiten_erledigt,
  nullif(s.state ->> 'maxW', '')::int as test_watt,
  nullif(s.state ->> 'maxWDate', '') as test_vom,
  nullif(s.state ->> 'fightDate', '') as kampftermin,
  case when jsonb_typeof(s.state -> 'reports') = 'object' then (select count(*) from jsonb_object_keys(s.state -> 'reports')) else 0 end as meldungen,
  s.updated_at as zuletzt_gespeichert,
  case
    when s.updated_at is null or s.state = '{}'::jsonb then 'nie genutzt'
    when s.updated_at > now() - interval '3 days' then 'aktiv'
    when s.updated_at > now() - interval '14 days' then 'ruhig'
    else 'inaktiv'
  end as aktivitaet
from auth.users u
left join public.profiles p on p.user_id = u.id
left join public.user_state s on s.user_id = u.id
order by coalesce(s.updated_at, u.created_at) desc;
