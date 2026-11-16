# Hinweis für Claude

Projekt: Web-App **„Nonstop Boxing – Mehr Kondition bis zur letzten Runde"** von Ahmet Özcorapci. 10-Wochen-Air-Bike-Konditionsplan für Boxer.
Live: https://aozcorap.github.io/airbike/ (GitHub Pages, kein Build). Ahmet ist kein Programmierer und erwartet fertige Ergebnisse.

## Arbeitsweise

- Deutsch, kurz, ohne Floskeln. Unbequeme Wahrheit zuerst, klar widersprechen, Gesichertes und Vermutung trennen. Nichts erfinden, nachfragen.
- Du setzt um, testest selbst (Playwright) und berichtest ehrlich, was geprüft ist und was nicht. Nicht prüfbar für dich: iOS-Safari, Ton und Vibration, echtes Offline.
- **Nicht ändern oder committen ohne Auftrag.** Sagt Ahmet „Ja, mach den PR und Merge": PR auf `main`, Squash-Merge. Entwicklungszweig `claude/nifty-heisenberg-el5tnv`; nach jedem Merge auf `origin/main` zurücksetzen und mit `--force-with-lease` pushen.
- Bei jeder Änderung an der App `APP_BUILD` (app.js) und `CACHE` (sw.js, `redline-vNN`) **gemeinsam** erhöhen (Stand: 49).

## Aufbau

- `index.html`, `app.js`, `data.js` (Plan, Skalierung nach Runden), `plan.js`, `cloud.js` (Supabase), `sw.js` (Service Worker), `styles.css`.
- Konto-Dienst Supabase, Projekt `esmlmgfbsconhknssgcr` („last-round"): Auth, Tabellen `profiles` (Geburtsjahr, nur lesbar) und `user_state`. E-Mails über IONOS-SMTP, Vorlagen in `docs/E-MAIL-VORLAGEN.md`.
- Altersklasse kommt serverseitig aus `profiles.birth_year` (Jugendschutz, nicht umgehbar machen).
- Einheiten pro Woche = gewählte Häufigkeit des Nutzers (harte zuerst, Aktive Erholung zählt mit).

## Tester-Feedback (feste Vorgabe von Ahmet)

- Meldungen (Fehler/Idee/Frage) gehen aus der App über die Supabase-Edge-Function `feedback-to-github` **direkt als GitHub-Issue** (Label `tester-feedback` plus Art) in dieses Repo. Kein Supabase-Zwischenspeicher, kein Sync, kein GitHub-Link in der App. Ablauf: `docs/FEEDBACK-ABLAUF.md`.
- Der GitHub-Token liegt im Supabase-Vault (`github_token`). Nie in Code, Chat oder Dateien schreiben.
- Antworten von Ahmet (GitHub-Kommentar, Close with Comment) erscheinen in der App unter „Meine Meldungen". Nur Kommentare von OWNER/MEMBER/COLLABORATOR.
- Tägliche Mail mit offenen Meldungen: Routine „Nonstop-Boxing: Issues, Features und Fragen" (9:54 Uhr, Gmail). Von Ahmet in claude.ai angelegt, du kannst sie nicht ändern. Routinen mit Gmail-Zugang kannst du nicht selbst anlegen (Connector wird abgelehnt, Datenschutz-Plugin blockiert seine Adresse im Auftragstext). Seine anderen Routinen nicht auslesen.

## Offene Punkte

Siehe `OFFENE-PUNKTE.md` (Nr. 1 bis 26) und `docs/UX-AUSWERTUNG.md`. Blockierend vor echten Nutzern: Rechte am Programm aus dem gekauften PDF (1), Datenschutz/Impressum sind Entwürfe (2), Marke (3), iStock-Wasserzeichen im Foto (4). Außerdem offen: Eltern-Einwilligung bei Minderjährigen, Preis- und Abo-Modell (26), Tester-Nachricht anpassen (24). Beim Start fragen, womit begonnen werden soll.

## Videos

Erklärvideos entstehen im Repo `aozcorap/erklaervideo-vorlage` (eigene CLAUDE.md dort). Das Tester-Video liegt unter `videos/nonstop-boxing-tester-anleitung/`. Dieses Repo hier enthält nur `video/start.mp4` (veraltet) und `video/trailer/` (Entwürfe).
