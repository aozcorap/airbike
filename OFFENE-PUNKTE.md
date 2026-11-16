# Offene Punkte – Nonstop Boxing

Stand: 16.11.2026. Wird bei Änderungen nachgeführt. Die Nummern gelten nur innerhalb dieses Abschnitts.

**Prototyp** heißt hier: ein geschlossener Tester-Kreis, persönlich eingeladen, nur Erwachsene, keine Werbung, kein Geld. **Live** heißt: jeder darf rein, mit Werbung, Verkauf oder Kindern.

## A. Prototyp: erledigt und bewusst akzeptiert

**Erledigt (vom Betreiber, 16.11.):**
- Anmeldung per Code mit echten Mails getestet
- Test-Konten in Supabase gelöscht
- Tester-Nachricht an den neuen Ablauf angepasst
- Auf dem iPhone geprüft (Zeitfeld, Ton, Zurück-Geste im Timer), keine Beanstandung gemeldet
- Supabase-Projekt `last-round` läuft
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
2. **Datenschutz rechtlich prüfen lassen.** Der Entwurf nennt den Verantwortlichen und passt zum Verhalten der App, hat aber Lücken (Mail-Anbieter, Fristen, Stellen mit „Prüfen lassen“). Das **Impressum** ist eingetragen (Name, Anschrift, E-Mail), ohne USt-ID, nicht rechtlich geprüft, die Anschrift ist öffentlich sichtbar.
3. **Kein Mindestalter und keine Einwilligung der Eltern (Entscheidung des Betreibers).** Der Plan passt sich per Altersklasse an das Geburtsjahr an. Risiko: Die Einwilligung Minderjähriger (DSGVO Art. 8, in Deutschland unter 16 Jahren Zustimmung der Eltern) ist nicht abgedeckt. Rechtlich prüfen lassen. **Die Datenbank-Regel muss von Hand geändert werden** (`docs/DB-REGISTRIERUNG.sql` im SQL Editor von Supabase), sonst lehnt sie Registrierungen unter 14 Jahren ab und verlangt unter 17 Jahren eine Elternzustimmung.
4. **Tester-Meldungen sind öffentlich** und können Namen oder Gesundheitsangaben enthalten. Für live eine datenschutzfreundlichere Lösung oder saubere rechtliche Abdeckung.
5. **Name „Nonstop Boxing“** ist nicht auf Marke, App-Store und Domain geprüft.
6. **Hero-Foto** mit iStock-Wasserzeichen: Lizenz oder Ersatz.
7. **Musik im Video** (bisher CC BY 4.0, ende.app) verlangt Namensnennung. Beim neuen Video neu klären.

### Fachlich
1. **Jugendwerte (U17–U18, U15–U16, U13–U14 und jünger)** sind Annahmen und nicht von einem Trainer geprüft. Besonders die Werte für Kinder bis 14 (50 % Umfang, Sprints bis 10 s, 2 harte Einheiten, höchstens 80 % vom Test-Watt) sind geschätzt, nicht belegt. Maximale Sprints und der Fitness-Test sind für Kinder fachlich zu klären. In der App gibt es keine Sperre und keine Freigabe. Das Alter wird vorsichtig gerechnet (Jahr minus Geburtsjahr minus 1), wer 19 ist, hat daher noch „U17–U18“.
2. **Regeln für Rundenzahl und Alter** sind Annahmen (+1 Kampfrunde je 2 Runden ab 3, +2,5 % Umfang je Runde, höchstens +20 %). Nicht fachlich geprüft.
3. **„Sportwissenschaftlich“** ist für Werbung nicht belegt. Das PDF nennt keine Studien mit Quelle. Nur „nach Prinzipien“ formulieren, nie „bewiesen“. Ein Trainer sollte das bestätigen.

### Technisch und Betrieb
1. **E-Mail-Versand:** Die Mails laufen über den IONOS-Server. Sendegrenzen von IONOS und Supabase (30 Mails pro Stunde) bei vielen Anmeldungen prüfen. Jede Anmeldung braucht eine Mail, kommt keine, kommt niemand rein.
2. **Unbestätigte Registrierungen** bleiben samt Geburtsjahr und „Einwilligung“ in der Datenbank. `docs/DB-AUFRAEUMEN.sql` in Supabase ausführen: erst prüfen, dann einmalig löschen, optional nachts automatisch per `pg_cron` (verfügbar, noch nicht aktiv).
3. **Supabase-Gratis-Plan:** Projekte mit wenig Aktivität werden pausiert, dann kann sich niemand anmelden. Für live prüfen, ob ein bezahlter Plan nötig ist. Das Projekt `matchmaker` ist pausiert (Gratis-Plan erlaubt zwei Projekte).
4. **Sendegrenze der Meldungen:** Die Rückmeldungen laufen über die Edge-Function `feedback-to-github` als Issue ins Repo (Ablauf: `docs/FEEDBACK-ABLAUF.md`). Die Grenze (10 pro Stunde je Nutzer) liegt bisher im Speicher der Funktion und setzt sich bei einem Neustart zurück. **Vorbereitet, noch nicht eingespielt:** `docs/DB-MELDUNGEN-LIMIT.sql` (in Supabase ausführen) und `supabase/functions/feedback-to-github/index.ts` (danach die Funktion neu veröffentlichen). Beides ist nicht gegen die echte Datenbank getestet.
5. **Content-Security-Policy:** eingebaut (nur eigene Dateien, Supabase und die GitHub-Schnittstelle; keine Inline-Skripte). Im Browser getestet (Chromium), **nicht auf dem iPhone**. Ändert sich etwas an externen Adressen oder kommen Inline-Skripte dazu, muss die Regel in `index.html` angepasst werden, sonst blockiert der Browser sie.
6. **Kalender-Export (.ics):** Einheiten, die aus dem Plan fallen, bleiben im Kalender stehen, weil sich Termine aus einer Datei nicht zuverlässig löschen lassen. Die App weist darauf hin.
7. **Barrierefreiheit** (Screenreader liest bei jedem Seitenwechsel alles vor, Tabs ohne Auswahlstatus, kein Fokus in Dialogen): bewusst nicht gemacht. Offen bleiben auch `color-scheme` (nicht auf dem iPhone prüfbar) und kein `og:image` (das Foto hat ein Wasserzeichen). Ein vollständiger Scan nach ungenutztem Code war nicht möglich, ein Sicherheits-Hook blockiert das Einlesen von `app.js`.
8. **Nicht geprüft:** Eingabe mit echter Tastatur auf dem iPhone, Offline-Betrieb, die Sicherheitsregel und das neue Konto-Löschen auf dem iPhone. Das kann die KI nicht testen. Kleine Bildschirme (320 bis 360 px) sind in Chromium ohne Überlauf geprüft. Aus der UX-Auswertung (`docs/UX-AUSWERTUNG.md`) offen: Uhrzeit-Format „06:00 PM“ (C2), tritt auf dem iPhone des Betreibers nicht auf, hängt von der Region des Geräts ab.
9. **Altnamen „redline“** stehen noch in Speicher-Schlüsseln (`redline.v1`, `redline.sync`, `redline.base`, `redline.run`), im Cache (`redline-vNN`), in der Kalender-ID und in `rl-…`. Absichtlich nicht umbenannt: Das würde lokale Daten und den Cache entwerten, und das Wort `redline-vNN` ist zugleich die Marke, an der die App neue Versionen erkennt. Eine Umbenennung ohne Übergang würde den Update-Hinweis auf installierten Apps abschalten.

### Video
1. **Video komplett neu aufbauen.** Das Intro in der App (`video/start.mp4`) zeigt den alten Ablauf (Max-Watt, Trainingsstand, 7 statt 4 Einführungsschritte). Der Name „Last Round“ ist nur per Überblendung durch „Nonstop Boxing“ ersetzt. Es läuft bei jedem Start ohne Anmeldung (5 MB) und ist offline nicht verfügbar. Für live neu rendern, die Videoquelle liegt nicht im Repo.
2. **Trailer** (`video/trailer/`): Webadresse für Szene 9 fehlt. Siehe dort auch die offenen Punkte.

### Geschäftsmodell
**Preis- und Abo-Modell ist nicht entschieden und nicht gebaut.** Es gibt weder Preise noch Bezahlfunktion noch Abo-Logik. Zu klären:
- Was ist kostenlos, was kostet? (z. B. Einzelpreis, Monats-/Jahresabo, Test-Zeitraum)
- Zahlungsweg (Web-App: z. B. Stripe oder Paddle; App-Store: Gebühr 15 bis 30 %, Pflicht zur Kauf-Funktion des Stores)
- Rechnung, Umsatzsteuer, Widerrufsrecht, Kündigung (rechtlich prüfen)
- Freischaltung im Konto (Supabase: Zahlstatus pro Nutzer, Ablaufdatum)
- Preise und Bedingungen in Datenschutz, Impressum und AGB aufnehmen
- Zusammenhang mit Punkt „Rechtlich 1“: Verkauf setzt geklärte Rechte am Programm voraus.
- Preis für Minderjährige: Vertragsabschluss nur mit Eltern (siehe Punkt „Rechtlich 3“).

## Empfehlung für live

Zuerst die Rechte am Plan und den Datenschutz klären (Rechtlich 1 und 2), danach die Kinderfrage (Rechtlich 3, Fachlich 1) und das neue Video. Der Rest ist Aufräumen.

## Zuletzt erledigt (16.11.2026)

Anmeldung per Code statt Passwort, Impressum und Datenschutz-Verantwortlicher eingetragen, Datenschutz-Text an das Verhalten angepasst, Sicherung ohne Datenverlust bei gleichzeitigen Änderungen, Import von Sicherungsdateien geprüft, Jugend-Sperre und Trainer-Freigabe entfernt, eigene Klasse für Kinder bis 14, Altersklasse mit Rückfall, Eingaben geprüft, Plan-Randfälle (Kampf in unter einer Woche, Kampftermin entfernen, Trainingstage), Timer-Rückfrage, Update-Hinweis über Intro und Timer, Kontowechsel mit ungesicherten Daten fragt nach, Rückfragen beim Anmelden ohne Zeitlimit, Test-Watt auf der Einheit nur noch als Link, Zeitfeld für iOS, Kalender-Export mit echter Dauer, Kleinigkeiten (noscript, Manifest, Vorschau-Tags, toter Code, Erinnerung nach dem Abhaken), Offline-Dateien, einheitliche Zählung, Content-Security-Policy, Konto löschen nur mit Code aus der E-Mail (die Mail dazu heißt „Anmelde-Code“, Vorlage 4), Timer merkt sich den Stand und bietet nach Neuladen oder Schließen das Fortsetzen an, kleine Bildschirme geprüft.
