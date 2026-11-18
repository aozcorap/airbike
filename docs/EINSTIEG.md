# Einstieg für eine neue Sitzung (Stand 18.11.2026)

Diese Datei ist für die KI am Anfang jeder neuen Sitzung. Der Gesprächsverlauf früherer Sitzungen steht nicht zur Verfügung, hier ist das Wichtigste.

## Zuerst lesen

1. `OFFENE-PUNKTE.md`: alle offenen Punkte, Entscheidungen und Annahmen (Prototyp und „live").
2. `video/trailer/STAND.md`: Arbeitsstand des Werbetrailers (Prompts, Einstellungen, was morgen offen ist). Die Prompts selbst: `video/trailer/higgsfield-prompts.md`, der Ablauf: `video/trailer/storyboard.md`.
3. `CLAUDE.md`: Regeln für Änderungen an der App.

## Arbeitsweise (Wunsch des Betreibers)

- **Ehrlich und kurz.** Erst die unbequeme Wahrheit, keine Floskeln. Gesichertes von Vermutung trennen. Nichts erfinden, im Zweifel nachfragen.
- **Nichts umsetzen ohne ausdrückliche Freigabe.** Bei „mach erst eine Analyse" oder „noch nichts bauen" wird nichts geändert. Der Betreiber hat das mehrfach bemängelt.
- **Immer nur eine Sache auf einmal.** Keine Aufgabenflut, keine langen To-do-Listen an den Betreiber.
- **Nach der Freigabe bei App-Änderungen:** Version erhöhen, auf Handyformat prüfen, Pull Request erstellen, mergen und kurz berichten. Das hat der Betreiber bisher meist ausdrücklich verlangt. Im Zweifel kurz fragen.
- **Texte für Nutzer** auf Deutsch, kurz, ohne Fachsprache.
- **Begriffe:** „Prototyp" = geschlossener Tester-Kreis, persönlich eingeladen, nur Erwachsene, kein Geld, keine Werbung. „Live" = öffentlich, mit Werbung, Verkauf oder Kindern.
- **Entscheidungen des Betreibers nicht eigenmächtig ändern.** Beispiele: Ablauf des Trailers, keine Elternzustimmung, Altersklassen bleiben.
- **Keine echten E-Mails oder Test-Konten auslösen** ohne Rückfrage (ein früherer Test hat ein Konto in der Datenbank hinterlassen).

## Technik

- Repo `aozcorap/airbike`, Hosting GitHub Pages: https://aozcorap.github.io/airbike/ . Konto-System: Supabase-Projekt `last-round`.
- Entwicklungsbranch `claude/determined-curie-eu51fq`. Nach jedem Merge den Branch auf `origin/main` zurücksetzen und mit `--force-with-lease` pushen, sonst gibt es nach Squash-Merges Konflikte.
- **Sicherheits-Hook:** Bash-Befehle, die `app.js` oder `index.html` lesen oder kopieren, werden blockiert (dort steht die E-Mail-Adresse des Betreibers im Impressum). Dann mit Read, Grep und Edit arbeiten und den Hook nicht umgehen.
- **Datenbank:** Admin-Funktionen (`is_admin`, `admin_overview`, `admin_delete_user`) sind live in Supabase eingespielt, die Skripte stehen in `docs/DB-ADMIN.sql`. Änderungen an der Datenbank brauchen eine Freigabe in der Oberfläche des Betreibers.
- **Higgsfield-Anschluss** kann nur lesen (Guthaben, Modelle, fertige Clips). Er erzeugt nichts. Die Clip-Adressen sind in der Sitzung vom Netzwerk gesperrt, geprüft wird über Bildschirmfotos.
- **iPhone:** Die KI kann nicht auf dem iPhone testen. Geprüft wird in Chromium im Handyformat. Neue Funktionen stehen deshalb unter „Nicht geprüft" in `OFFENE-PUNKTE.md`.

## Was nicht im Repo liegt

- Die erzeugten Higgsfield-Videos (liegen im Konto des Betreibers, er muss sie herunterladen).
- Das CapCut-Projekt und die Herzschlag-Tonspur.
- Der Gesprächsverlauf. Was nur besprochen und nicht in `OFFENE-PUNKTE.md` oder `STAND.md` steht, ist verloren. Neue Entscheidungen deshalb immer gleich dort eintragen.

## Aktueller Stand in einem Satz

Die App läuft als Prototyp (Version 84) für einen geschlossenen Tester-Kreis, der Betreiber wartet auf Rückmeldungen. Parallel entsteht der Werbetrailer (Story-Teil erzeugt, Herzschlag, Stimme, Abspann und schärfere App-Bilder offen), und es gibt offene Fragen zu Installation ohne App Store, Landingpage, App Store und Geschäftsmodell.
