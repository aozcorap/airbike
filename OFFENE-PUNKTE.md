# Offene Punkte – Nonstop Boxing

Stand: 17.11.2026. Nächster Schritt: Rückmeldungen der Tester abwarten, dann entscheiden. Wird bei Änderungen nachgeführt. Die Nummern gelten nur innerhalb dieses Abschnitts.

**Prototyp** heißt hier: ein geschlossener Tester-Kreis, persönlich eingeladen, nur Erwachsene, keine Werbung, kein Geld. **Live** heißt: jeder darf rein, mit Werbung, Verkauf oder Kindern.

## A. Prototyp: erledigt und bewusst akzeptiert

**Erledigt (vom Betreiber, 16.11.):**
- Anmeldung per Code mit echten Mails getestet
- Test-Konten in Supabase gelöscht
- Tester-Nachricht an den neuen Ablauf angepasst
- Auf dem iPhone geprüft (Zeitfeld, Ton, Zurück-Geste im Timer), keine Beanstandung gemeldet
- Supabase-Projekt `last-round` läuft
- Admin-Ansicht in der App: `https://aozcorap.github.io/airbike/#/admin` (Mehr, Admin). Sichtbar und nutzbar nur für Konten in der Tabelle `admins`, die Prüfung liegt in der Datenbank (`docs/DB-ADMIN.sql`, am 17.11. eingespielt, Admin eingetragen: das Konto des Betreibers). Zeigt Konten, letzte Änderung, erledigte Einheiten, Test-Watt. Reines Öffnen der App wird nicht erfasst. Weitere Admins: `insert into public.admins (user_id) values ('<KONTO-ID>');`. Ersatz ohne App: `docs/ADMIN-UEBERSICHT.sql`. Geschützt ist die Ansicht so gut wie das Admin-Konto, deshalb dort Zwei-Faktor einschalten.
- Meldungen aus der App kommen an, die tägliche Mail-Routine „Nonstop-Boxing: Issues, Features und Fragen“ (9:54 Uhr) läuft mit richtigem Auftragstext

**Bewusst akzeptiert für den Prototyp (Entscheidung des Betreibers):**
- Hero-Foto (`img/hero.jpg`) mit iStock-Wasserzeichen bleibt
- Der Plan aus dem gekauften PDF liegt öffentlich im Repo
- Der Datenschutz ist ein Entwurf
- Tester-Meldungen sind öffentlich (Issues im öffentlichen Repo, das Formular warnt davor)
- GitHub-Token (Vault `github_token`, nur Issues in `airbike`) wurde nicht erneuert, früher einmal in einem Chat eingefügt, Risiko klein. Laut Betreiber ein Jahr gültig, bis ca. **November 2027**; dann neues Token erzeugen und im Vault ersetzen (sonst scheitern Meldungen mit „GitHub-Fehler 401“). Die Funktion nimmt zuerst das Secret `GITHUB_TOKEN`, falls es existiert, sonst den Vault.
- Das Intro-Video zeigt den alten Ablauf und bleibt, bis es für live neu gebaut wird
- Annahme: Im Prototyp testen nur Erwachsene. Das spart die Datenbank-Änderung für Minderjährige, die Elternzustimmung und die Trainerprüfung der Kinderwerte.

## B. Für live offen

### Rechtlich
1. **Programm aus gekauftem PDF.** Das Recht zur Nutzung und Vermarktung ist ungeklärt. Der Plan steckt öffentlich im Repo und ist im Login-freien Teil lesbar (das Login schützt nur den Fortschritt der Nutzer). Für Werbung und Verkauf zwingend klären.
2. **Datenschutz rechtlich prüfen lassen.** Der Entwurf nennt den Verantwortlichen und passt zum Verhalten der App, hat aber Lücken (Mail-Anbieter, Fristen, Stellen mit „Prüfen lassen“). Das **Impressum** ist eingetragen (Name, Anschrift, E-Mail), ohne USt-ID, nicht rechtlich geprüft, die Anschrift ist öffentlich sichtbar. Im Datenschutz nennen, dass der Betreiber Konten und Trainingsdaten der Nutzer einsehen kann (Admin-Überblick).
3. **Kein Mindestalter und keine Einwilligung der Eltern (Entscheidung des Betreibers).** Der Plan passt sich per Altersklasse an das Geburtsjahr an. Risiko: Die Einwilligung Minderjähriger (DSGVO Art. 8, in Deutschland unter 16 Jahren Zustimmung der Eltern) ist nicht abgedeckt. Rechtlich prüfen lassen. **Die Datenbank-Regel muss von Hand geändert werden** (`docs/DB-REGISTRIERUNG.sql` im SQL Editor von Supabase), sonst lehnt sie Registrierungen unter 14 Jahren ab und verlangt unter 17 Jahren eine Elternzustimmung.
4. **Tester-Meldungen sind öffentlich** und können Namen oder Gesundheitsangaben enthalten. Für live eine datenschutzfreundlichere Lösung oder saubere rechtliche Abdeckung.
5. **Name „Nonstop Boxing“** ist nicht auf Marke, App-Store und Domain geprüft.
6. **Hero-Foto** mit iStock-Wasserzeichen: Lizenz oder Ersatz.
7. **Musik im Video** (bisher CC BY 4.0, ende.app) verlangt Namensnennung. Beim neuen Video neu klären.

### Fachlich
1. **Jugendwerte (U17–U18, U15–U16, U13–U14 und jünger)** sind Annahmen und nicht von einem Trainer geprüft. Besonders die Werte für Kinder bis 14 (50 % Umfang, Sprints bis 10 s, 2 harte Einheiten, höchstens 80 % vom Test-Watt) sind geschätzt, nicht belegt. Maximale Sprints und der Fitness-Test sind für Kinder fachlich zu klären. In der App gibt es keine Sperre und keine Freigabe. Das Alter wird vorsichtig gerechnet (Jahr minus Geburtsjahr minus 1), wer 19 ist, hat daher noch „U17–U18“.
2. **Regeln für Rundenzahl und Alter** sind Annahmen (+1 Kampfrunde je 2 Runden ab 3, +2,5 % Umfang je Runde, höchstens +20 %). Nicht fachlich geprüft.
3. **„Sportwissenschaftlich“** ist für Werbung nicht belegt. Das PDF nennt keine Studien mit Quelle. Nur „nach Prinzipien“ formulieren, nie „bewiesen“. Ein Trainer sollte das bestätigen.

4. **Wattwerte nach Alter (Erwachsene)** sind Annahmen und nicht von einem Trainer oder Sportmediziner geprüft. Ab Version 82 werden alle Wattwerte der Klasse „Elite / Erwachsene“ nach Alter gesenkt (Dauer, Wiederholungen und Pausen bleiben): bis 29 Jahre 100 %, 30–39 95 %, 40–49 90 %, 50–54 85 %, 55–59 82,5 %, 60–64 80 %, 65–69 77,5 %, ab 70 75 % (`AGE_BANDS` in `data.js`). Der Test-Watt selbst und der Test (maximal) bleiben unverändert. Das Alter kommt aus dem Geburtsjahr (Jahr minus Geburtsjahr minus 1). Wer kein Konto hat oder dessen Alter fehlt, bekommt 100 %. Nicht angepasst: Umfang, Sprintdauer, harte Einheiten pro Woche, die festen Richtwerte ohne Test-Watt.

### Technisch und Betrieb
1. **E-Mail-Versand:** Die Mails laufen über den IONOS-Server. Sendegrenzen von IONOS und Supabase (30 Mails pro Stunde) bei vielen Anmeldungen prüfen. Jede Anmeldung braucht eine Mail, kommt keine, kommt niemand rein.
2. **Unbestätigte Registrierungen** bleiben samt Geburtsjahr und „Einwilligung“ in der Datenbank. `docs/DB-AUFRAEUMEN.sql` in Supabase ausführen: erst prüfen, dann einmalig löschen, optional nachts automatisch per `pg_cron` (verfügbar, noch nicht aktiv).
3. **Supabase-Gratis-Plan:** Projekte mit wenig Aktivität werden pausiert, dann kann sich niemand anmelden. Für live prüfen, ob ein bezahlter Plan nötig ist. Das Projekt `matchmaker` ist pausiert (Gratis-Plan erlaubt zwei Projekte).
4. **Sendegrenze der Meldungen:** Die Rückmeldungen laufen über die Edge-Function `feedback-to-github` als Issue ins Repo (Ablauf: `docs/FEEDBACK-ABLAUF.md`). Die Grenze (10 pro Stunde je Nutzer) liegt bisher im Speicher der Funktion und setzt sich bei einem Neustart zurück. **Vorbereitet, noch nicht eingespielt:** `docs/DB-MELDUNGEN-LIMIT.sql` (in Supabase ausführen) und `supabase/functions/feedback-to-github/index.ts` (danach die Funktion neu veröffentlichen). Beides ist nicht gegen die echte Datenbank getestet.
5. **Content-Security-Policy:** eingebaut (nur eigene Dateien, Supabase und die GitHub-Schnittstelle; keine Inline-Skripte). Im Browser getestet (Chromium), **nicht auf dem iPhone**. Ändert sich etwas an externen Adressen oder kommen Inline-Skripte dazu, muss die Regel in `index.html` angepasst werden, sonst blockiert der Browser sie.
6. **Kalender-Export (.ics):** Einheiten, die aus dem Plan fallen, bleiben im Kalender stehen, weil sich Termine aus einer Datei nicht zuverlässig löschen lassen. Die App weist darauf hin.
7. **Barrierefreiheit** (Screenreader liest bei jedem Seitenwechsel alles vor, Tabs ohne Auswahlstatus, kein Fokus in Dialogen): bewusst nicht gemacht. Offen bleiben auch `color-scheme` (nicht auf dem iPhone prüfbar) und kein `og:image` (das Foto hat ein Wasserzeichen). Ein vollständiger Scan nach ungenutztem Code war nicht möglich, ein Sicherheits-Hook blockiert das Einlesen von `app.js`.
8. **Nicht geprüft:** Eingabe mit echter Tastatur auf dem iPhone, Offline-Betrieb, die Sicherheitsregel, das neue Konto-Löschen, die Admin-Ansicht und die große Wattzahl im Timer auf dem iPhone. Das kann die KI nicht testen. Kleine Bildschirme (320 bis 360 px) sind in Chromium ohne Überlauf geprüft. Aus der UX-Auswertung (`docs/UX-AUSWERTUNG.md`) offen: Uhrzeit-Format „06:00 PM“ (C2), tritt auf dem iPhone des Betreibers nicht auf, hängt von der Region des Geräts ab.
9. **Altnamen „redline“** stehen noch in Speicher-Schlüsseln (`redline.v1`, `redline.sync`, `redline.base`, `redline.run`), im Cache (`redline-vNN`), in der Kalender-ID und in `rl-…`. Absichtlich nicht umbenannt: Das würde lokale Daten und den Cache entwerten, und das Wort `redline-vNN` ist zugleich die Marke, an der die App neue Versionen erkennt. Eine Umbenennung ohne Übergang würde den Update-Hinweis auf installierten Apps abschalten.

10. **Timer im Querformat:** Der Text unter der Zeit („Gleich: …“) überdeckt den Start-Knopf (getestet bei 844×390, war schon vor der großen Wattzahl so). Relevant, wenn das Handy quer auf einem Ständer liegt. Nicht behoben.
11. **Test-Konto `t@y.de`:** Durch einen Test der KI wurde eine Anmeldemail ausgelöst, das Konto liegt unbestätigt in Supabase. Löschen nur auf Anweisung des Betreibers (siehe auch Punkt 2).
12. **Zwei-Faktor** bei GitHub und Supabase einschalten (Empfehlung, nur der Betreiber kann das). Die Admin-Ansicht ist nur so sicher wie das Admin-Konto.
13. **Altes Dashboard-Artifact** (`claude.ai/artifact/Ftx8Voas4KtMhWAJNkSNva`) wird nicht mehr gebraucht, ersetzt durch die Admin-Ansicht in der App. Kann gelöscht werden.
14. **Installation ohne App Store (Wunsch des Betreibers, noch nicht gebaut).** Die App ist eine Web-App. Nutzer sollen sie wie aus einem App Store mit einem Knopf „Jetzt installieren" auf den Home-Bildschirm bekommen. Stand der Prüfung (aus Wissen, nicht live geprüft): **Android (Chrome)** kann einen echten Installieren-Knopf (`beforeinstallprompt`), das ist in der App noch nicht eingebaut. **iPhone (Safari)** erlaubt das nicht automatisch, der Nutzer muss „Teilen, Zum Home-Bildschirm" selbst tippen. Umsetzungsvorschlag: Android-Knopf plus geführte Anleitung nur auf dem iPhone (Pfeil, 3 Schritte), dazu QR-Code und Kurz-GIF im Trailer-Abspann. Nur in der EU gibt es alternative App-Marktplätze (aufwendig, mit Gebühren). Eine Provision an Apple oder Google entfällt nach meiner Kenntnis, wenn man über die Webseite bezahlen lässt. Rechtliche Lage nicht geprüft.
15. **Landingpage mit „Jetzt installieren"** (Wortlaut des Betreibers: „die Seite entsprechend bauen"). Gemeint ist vermutlich die Webseite, auf die der Trailer verweist. Webadresse ist noch nicht festgelegt. Vor dem Bauen mit dem Betreiber klären, was genau drauf soll.

### Video
1. **Video komplett neu aufbauen.** Das Intro in der App (`video/start.mp4`) zeigt den alten Ablauf (Max-Watt, Trainingsstand, 7 statt 4 Einführungsschritte). Der Name „Last Round“ ist nur per Überblendung durch „Nonstop Boxing“ ersetzt. Es läuft bei jedem Start ohne Anmeldung (5 MB) und ist offline nicht verfügbar. Für live neu rendern, die Videoquelle liegt nicht im Repo.
2. **Trailer** (`video/trailer/`): Der Story-Teil (25 s) ist in Higgsfield als Entwurf erzeugt. Alles zum Weiterarbeiten steht in `video/trailer/STAND.md`. Offen: Herzschlag in CapCut lauter machen, deutsche Stimme, Abspann mit Webadresse (fehlt), Untertitel, Musik-Rechte, **die drei App-Bilder (Fitness-Test, Plan, Timer) sind nicht scharf genug und müssen höher aufgelöst neu aufgenommen werden**.

### Geschäftsmodell
**Preis- und Abo-Modell ist nicht entschieden und nicht gebaut.** Es gibt weder Preise noch Bezahlfunktion noch Abo-Logik. Zu klären:
- Was ist kostenlos, was kostet? (z. B. Einzelpreis, Monats-/Jahresabo, Test-Zeitraum)
- Zahlungsweg (Web-App: z. B. Stripe oder Paddle; App-Store: Gebühr 15 bis 30 %, Pflicht zur Kauf-Funktion des Stores). Nach meinem Wissen, nicht live geprüft: Apple Developer Program 99 € bzw. 99 US-Dollar pro Jahr, Provision 30 % (15 % im Small Business Program), Google Play ca. 25 Dollar einmalig und meist 15 %. Der Betreiber will **nicht** über den App Store gehen. Siehe Technik 14.
- Rechnung, Umsatzsteuer, Widerrufsrecht, Kündigung (rechtlich prüfen)
- Freischaltung im Konto (Supabase: Zahlstatus pro Nutzer, Ablaufdatum)
- Preise und Bedingungen in Datenschutz, Impressum und AGB aufnehmen
- Zusammenhang mit Punkt „Rechtlich 1“: Verkauf setzt geklärte Rechte am Programm voraus.
- Preis für Minderjährige: Vertragsabschluss nur mit Eltern (siehe Punkt „Rechtlich 3“).

## Empfehlung für live

Zuerst die Rechte am Plan und den Datenschutz klären (Rechtlich 1 und 2), danach die Kinderfrage (Rechtlich 3, Fachlich 1) und das neue Video. Der Rest ist Aufräumen.

## Zuletzt erledigt (16./17.11.2026)

Admin-Ansicht in der App, Wattzahl im Timer deutlich größer und hervorgehoben (Version 78), Eingabefelder nach dem Test zentriert (80), Sprint-Wert direkt in der Pause eintragen (81), Wattwerte für Erwachsene nach Alter (82), Konto direkt in der Admin-Ansicht löschen (83).

Anmeldung per Code statt Passwort, Impressum und Datenschutz-Verantwortlicher eingetragen, Datenschutz-Text an das Verhalten angepasst, Sicherung ohne Datenverlust bei gleichzeitigen Änderungen, Import von Sicherungsdateien geprüft, Jugend-Sperre und Trainer-Freigabe entfernt, eigene Klasse für Kinder bis 14, Altersklasse mit Rückfall, Eingaben geprüft, Plan-Randfälle (Kampf in unter einer Woche, Kampftermin entfernen, Trainingstage), Timer-Rückfrage, Update-Hinweis über Intro und Timer, Kontowechsel mit ungesicherten Daten fragt nach, Rückfragen beim Anmelden ohne Zeitlimit, Test-Watt auf der Einheit nur noch als Link, Zeitfeld für iOS, Kalender-Export mit echter Dauer, Kleinigkeiten (noscript, Manifest, Vorschau-Tags, toter Code, Erinnerung nach dem Abhaken), Offline-Dateien, einheitliche Zählung, Content-Security-Policy, Konto löschen nur mit Code aus der E-Mail (die Mail dazu heißt „Anmelde-Code“, Vorlage 4), Timer merkt sich den Stand und bietet nach Neuladen oder Schließen das Fortsetzen an, kleine Bildschirme geprüft.
