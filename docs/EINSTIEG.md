# Einstieg für eine neue Sitzung (Stand 19.11.2026, abends)

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
- **Branch der Sitzung vom 19.11.: `claude/laughing-cerf-c9m1eu`** (alles gepusht, **nicht in `main` gemergt, kein Pull Request**). Dort liegen Werbemodell, Store-Entscheidungen, App-Hülle (Capacitor) und Trailer-Stand. Neue Sitzungen bekommen oft einen eigenen Branch zugewiesen, dann zuerst den Stand dieses Branchs holen (`git fetch origin claude/laughing-cerf-c9m1eu` und per Merge übernehmen). Älterer Branch: `claude/determined-curie-eu51fq`. Nach jedem Merge den Branch auf `origin/main` zurücksetzen und mit `--force-with-lease` pushen, sonst gibt es nach Squash-Merges Konflikte.
- **Sicherheits-Hook:** Bash-Befehle, die `app.js` oder `index.html` lesen oder kopieren, werden blockiert (dort steht die E-Mail-Adresse des Betreibers im Impressum). Dann mit Read, Grep und Edit arbeiten und den Hook nicht umgehen.
- **Datenbank:** Admin-Funktionen (`is_admin`, `admin_overview`, `admin_delete_user`) sind live in Supabase eingespielt, die Skripte stehen in `docs/DB-ADMIN.sql`. Änderungen an der Datenbank brauchen eine Freigabe in der Oberfläche des Betreibers.
- **Higgsfield-Anschluss** kann nur lesen (Guthaben, Modelle, fertige Clips). Er erzeugt nichts. Die Clip-Adressen sind in der Sitzung vom Netzwerk gesperrt, geprüft wird über Bildschirmfotos.
- **iPhone:** Die KI kann nicht auf dem iPhone testen. Geprüft wird in Chromium im Handyformat. Neue Funktionen stehen deshalb unter „Nicht geprüft" in `OFFENE-PUNKTE.md`.

## Was nicht im Repo liegt

- Die erzeugten Higgsfield-Videos (liegen im Konto des Betreibers, er muss sie herunterladen).
- Das CapCut-Projekt und die Herzschlag-Tonspur.
- Der Gesprächsverlauf. Was nur besprochen und nicht in `OFFENE-PUNKTE.md` oder `STAND.md` steht, ist verloren. Neue Entscheidungen deshalb immer gleich dort eintragen.

## Aktueller Stand in einem Satz

Die App (Version 84, unverändert) wird jetzt für den **App Store (Apple) und Google Play** vorbereitet, als Test über ein Jahr. Der Apple-Entwicklerzugang (Privatperson) ist aktiv, der App-Eintrag „Nonstop Boxing“ mit Bundle-ID `de.ozcorapci.nonstopboxing` ist angelegt, die App-Hülle läuft im iOS-Simulator (Intro und Anmeldeseite sichtbar, mehr noch nicht geprüft). Google steht noch aus.

## Stand vom 19.11.2026 (Gespräch mit dem Betreiber)

- **Entscheidungen:** Store-Weg gilt (statt nur Web-App), Test über ein Jahr. Konten als Privatperson. Werbemodell: Rewarded-Video vor jeder Einheit, Einmalzahlung (ca. 10 €, Preis offen) blendet Werbung aus, Offline-Training erlaubt, Video wird beim nächsten Start nachgeholt, bis dahin alles gesperrt. Details und Zahlen: `OFFENE-PUNKTE.md`, Abschnitt Geschäftsmodell („Werbemodell des Betreibers“).
- **Reihenfolge laut Betreiber:** erst Apple, Google später. Mein Hinweis (steht): Google verlangt für neue private Konten laut Suchergebnis einen geschlossenen Test mit 12 Testern über 14 Tage, das ist der Engpass. 12 Tester mit Android nötig.
- **Offen bei Apple vor einer Einreichung:** Händlerstatus für die EU (öffentliche Kontaktdaten wahrscheinlich), Kategorie, Altersfreigabe, Datenschutz- und Support-Adresse (Domain `ozcorapci.de` gehört dem Betreiber, noch nichts eingerichtet), App-Datenschutz-Angaben, Beschreibung, Schlüsselwörter, Screenshots, Demo-Zugang für Prüfer. Hauptrisiko: Regel 4.2 (nicht nur eine Webseite). Rewarded-Werbung ist nach 3.2.2(x) erlaubt, Ausblenden gegen Geld muss über Apples Kaufweg laufen (3.1.1), Sperre bei offenem Video ist ungeprüft (2.5.18).
- **App-Hülle:** `docs/APP-HUELLE.md`. Auf dem Mac liegt das Projekt in `~/airbike`, Branch ist ausgecheckt, `npm install` und `npx cap add ios` sind gelaufen, Xcode-Projekt in `ios/` (noch nicht ins Repo übernommen), Team in Xcode gewählt. Neue Dateien der App erreichen die Hülle mit `npm run sync`.
- **Nächste Schritte (Vorschlag, in dieser Reihenfolge):** (1) Im Simulator mit dem Betreiber-Konto anmelden und Plan, Timer, Ton, Speichern, Offline, Datei-Downloads (Sicherung, Kalender) und Erinnerungen prüfen. Vorher fragen, welches Konto, es dürfen keine unnötigen Konten entstehen. (2) Native Funktionen für Regel 4.2 festlegen. (3) `ios/` ins Repo übernehmen und Symbol, Startbild und Hero-Foto ohne Wasserzeichen klären. (4) TestFlight-Build. (5) Händlerstatus, Datenschutz-Adresse, Store-Texte. (6) Google-Konto. (7) Werbung und Kauf einbauen.
- **Trailer:** App-Bilder in 1440×2560 neu aufgenommen (liegen nur auf dem Mac, `~/trailer-bilder/app`, im Repo noch die alten). Ein Video aus iMovie liegt als Hochformat vor (`Downloads/Nonstop Boxing Trailer/…v3_hochformat.mp4`, 1080×1920 hochskaliert aus 606×1080). Der Betreiber will den Trailer in Higgsfield mit Seedance 2.5 neu erzeugen: bis 30 s, Herzschlag als Audio-Referenz, Endkarte (Name, Store-Abzeichen, Adresse) als Endbild. Prompt-Anpassung und Endkarte noch nicht geschrieben. Siehe `video/trailer/STAND.md`.
- **Mac des Betreibers:** macOS 27.2.1, Xcode 27.2 mit iOS-27.2-Simulator, Node 26.13, Homebrew mit ffmpeg 9.0.2. Die KI hat keinen Zugriff auf den Mac (kein Ordner freigegeben), der Betreiber führt Befehle selbst im Terminal aus. **Befehle in eigenen Codeblöcken, wenn möglich mehrere mit `&&` verbinden, ein Schritt nach dem anderen.** Er schickt Bildschirmfotos.
- **Speicherplatz am Mac:** zuletzt 124 GB frei von 460 GB (vor Xcode). Zum Aufräumen nach Rückfrage geeignet: Playwright-Browser in `~/Library/Caches/ms-playwright`, alte Trailer-Dateien, nicht mehr gebrauchte App-Bilder.
