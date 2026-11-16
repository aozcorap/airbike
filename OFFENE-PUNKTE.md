# Offene Punkte – Nonstop Boxing

Stand: 16.11.2026 (aufgeräumt). Wird bei Änderungen nachgeführt. Die Nummern gelten nur innerhalb dieser Datei.

## 1. Vor echten Nutzern (blockierend)

1. **Programm aus gekauftem PDF.** Der Plan steckt öffentlich im Repo. Das Recht zur Nutzung und Vermarktung ist ungeklärt. Für Werbevideo und Verkauf dringend.
2. **Datenschutz** ist ein Entwurf mit Lücken (Mail-Anbieter, Fristen, Stellen mit „Prüfen lassen"). Er nennt den Verantwortlichen und passt zum Verhalten der App, ist aber nicht rechtlich geprüft. Das **Impressum** ist eingetragen (Name, Anschrift, E-Mail, ohne USt-ID, nicht rechtlich geprüft; die Anschrift ist öffentlich sichtbar).
3. **Kein Mindestalter und keine Einwilligung der Eltern (Entscheidung des Betreibers).** Die App fragt beides nicht ab, der Plan passt sich per Altersklasse an das Geburtsjahr an. Risiko: Die Einwilligung Minderjähriger in die Datenverarbeitung (DSGVO Art. 8, in Deutschland unter 16 Jahren Zustimmung der Eltern) ist nicht abgedeckt. Rechtlich prüfen lassen. **Die Datenbank-Regel muss von Hand geändert werden** (`docs/DB-REGISTRIERUNG.sql` im SQL Editor von Supabase), sonst lehnt sie Registrierungen unter 14 Jahren ab und verlangt unter 17 Jahren eine Elternzustimmung.
4. **Rückmeldungen der Tester sind öffentlich.** Sie landen als Issues im öffentlichen Repo, auch wenn ein Tester Namen oder Gesundheitsangaben hineinschreibt. Hinweis in der App und Datenschutz-Entwurf nennen es, rechtlich prüfen.
5. **Name „Nonstop Boxing"** ist nicht auf Marke, App-Store und Domain geprüft.
6. **Foto auf der Startseite** (`img/hero.jpg`) hat ein iStock-Wasserzeichen und liegt im öffentlichen Repo. Lizenz oder Ersatz nötig.
7. **Musik im Tester-Video** (CC BY 4.0, ende.app) verlangt Namensnennung des Urhebers. Prüfen, ob sie im Video und in der Beschreibung steht.
8. **Test-Konten in Supabase löschen** vor dem Start: `lr-test-a@example.com` und ein unbestätigtes Konto, das bei einem Test der Registrierung entstanden ist (Authentication → Users).
9. **GitHub-Token** (Vault `github_token`, nur Issues in `airbike`): **bewusst nicht erneuert** (Entscheidung des Betreibers). Er wurde früher einmal in einem Chat eingefügt, das Risiko gilt als klein. Laut Betreiber ein Jahr gültig, also bis ca. **November 2027**; dann neues Token erzeugen und im Vault ersetzen (sonst scheitern Meldungen mit „GitHub-Fehler 401"). Die Funktion nimmt zuerst das Secret `GITHUB_TOKEN`, falls es existiert, sonst den Vault.
10. **Anmeldung per Code testen:** Registrieren, Code eingeben, abmelden, per Code wieder anmelden, auf iPhone und Android. Vorlagen 1 (Confirm signup) und 4 (Magic link) sind in Supabase eingetragen (`docs/E-MAIL-VORLAGEN.md`), die Mails sind aber nicht mit echtem Versand geprüft.

## 2. Fachlich

1. **Jugendwerte (U17–U18, U15–U16, U13–U14 und jünger)** sind Annahmen und nicht von einem Trainer geprüft. Besonders die Werte für Kinder bis 14 (50 % Umfang, Sprints bis 10 s, 2 harte Einheiten, höchstens 80 % vom Test-Watt) sind geschätzt, nicht belegt. Maximale Sprints und der Fitness-Test sind für Kinder fachlich zu klären. In der App gibt es keine Sperre und keine Freigabe (Entscheidung des Betreibers). Das Alter wird vorsichtig gerechnet (Jahr minus Geburtsjahr minus 1), wer 19 ist, hat daher noch „U17–U18".
2. **Regeln für Rundenzahl und Alter** sind Annahmen (+1 Kampfrunde je 2 Runden ab 3, +2,5 % Umfang je Runde, höchstens +20 %). Nicht fachlich geprüft.
3. **„Sportwissenschaftlich"** ist für Werbung nicht belegt. Das PDF nennt keine Studien mit Quelle. Nur „nach Prinzipien" formulieren, nie „bewiesen". Ein Trainer sollte das bestätigen.

## 3. Technisch

### Aus der Prüfung offen
1. **Unbestätigte Registrierungen** bleiben samt Geburtsjahr und „Einwilligung" in der Datenbank. **Du musst `docs/DB-AUFRAEUMEN.sql` in Supabase ausführen:** erst prüfen, dann einmalig löschen, optional nachts automatisch per `pg_cron` (verfügbar, noch nicht aktiv).
2. **Content-Security-Policy fehlt.** Kein Angriffsweg bekannt. Eine Regel kann die App brechen, Inline-Skripte müssten umgebaut werden. Eher später.
3. **Kalender-Export (.ics):** Einheiten, die aus dem Plan fallen, bleiben im Kalender stehen, weil sich Termine aus einer Datei nicht zuverlässig löschen lassen. Die App weist darauf hin. Dauer und Zeilenumbruch sind behoben.
4. **Konto löschen** hat zwei Rückfragen, aber keine erneute Prüfung per Code.
5. **Barrierefreiheit** (Screenreader liest bei jedem Seitenwechsel alles vor, Tabs ohne Auswahlstatus, kein Fokus in Dialogen): **bewusst nicht gemacht** (Entscheidung des Betreibers). Weitere Kleinigkeiten (`noscript`, Manifest-`id`, Link-Vorschau-Tags, toter Code `peakW`/`ack`, Erinnerung nach dem Abhaken) sind erledigt. Ein vollständiger Scan nach weiterem ungenutztem Code war nicht möglich, ein Sicherheits-Hook blockiert das Einlesen von `app.js`. Offen bleibt `color-scheme` (nicht auf dem iPhone prüfbar) und kein `og:image` (das Foto hat ein Wasserzeichen).
6. **Weitere kleine Funde:** Ein Kontowechsel mit ungesicherten Daten verwirft sie still. Die Rückfrage beim Anmelden läuft in ein 8-Sekunden-Zeitlimit. Der Timer-Stand geht beim Neuladen verloren (die App warnt jetzt davor). Der Ton auf dem iPhone nach einer Sperre ist nicht auf dem Gerät geprüft.
7. **Altnamen „redline"** stehen noch in Speicher-Schlüsseln (`redline.v1`, `redline.sync`, `redline.base`), im Cache (`redline-vNN`), in der Kalender-ID und in `rl-…`. Absichtlich nicht umbenannt, das würde lokale Daten und den Cache entwerten.

### Konto-Dienst und Betrieb (Supabase)
8. **E-Mail-Versand:** Die Mails laufen über den IONOS-Server (Absender Nonstop Boxing). Sendegrenzen von IONOS und Supabase (30 Mails pro Stunde) bei vielen Anmeldungen prüfen. Da jetzt jede Anmeldung eine Mail braucht, ist das der erste Engpass. Kommt keine Mail, kommt niemand rein.
9. **Rückmeldungen der Tester** laufen über die Edge-Function `feedback-to-github` direkt als Issue ins Repo (Ablauf: `docs/FEEDBACK-ABLAUF.md`). Der GitHub-Token liegt im Supabase-Vault (`github_token`). Die Sendegrenze (10 pro Stunde je Nutzer) liegt im Speicher der Funktion und setzt sich bei einem Neustart zurück. Für den Tester-Kreis ausreichend (Vermutung).
10. **Der Plan ist öffentlich lesbar.** Das Login schützt nur den Fortschritt der Nutzer, nicht den Plan.
11. **Supabase-Gratis-Plan:** Projekte mit wenig Aktivität werden pausiert. Beim Tester-Betrieb im Blick behalten (prüfen). Das Projekt `matchmaker` ist pausiert (Gratis-Plan erlaubt zwei Projekte).

### Bedienung und Geräte
12. **Eingabefeld „Uhrzeit"** in den Einstellungen ragte auf dem iPhone über den rechten Rand (Screenshot vom 16.11.). Korrigiert mit der üblichen iOS-Korrektur für Zeitfelder, **auf dem iPhone noch nicht bestätigt**.
13. **Aus der UX-Auswertung (`docs/UX-AUSWERTUNG.md`, Stand unklar, prüfen):** Einstellungen gruppieren und Gefahrenzone (A8, B5, B6), Uhrzeit-Format „06:00 PM" (C2), vier Eingabewege für den Test-Watt (B8).
14. **Fitness-Test wiederholen:** Nach 28 Tagen erscheint ein Hinweis auf der Startseite, ein fester Ort in der App fehlt.
15. **Nicht geprüft:** Geräte unter 360 px, Eingabe mit echter Tastatur auf dem iPhone, Ton und Vibration des Timers auf dem iPhone, Offline-Betrieb. Das kann die KI nicht testen, bitte auf dem Handy prüfen.

## 4. Betrieb

1. **Tester-Nachricht** passt nicht mehr zum neuen Ablauf (Anmeldung per Code, Reihenfolge, Feedback-Weg). Vor dem Versand anpassen.
2. **Tägliche Mail mit offenen Meldungen** (Routine „Nonstop-Boxing: Issues, Features und Fragen", 9:54 Uhr): Der Auftragstext in der Routine ist noch der Einfügetext („Lege eine Routine an …"). Den Teil ab „Auftrag der Routine" einsetzen. Tabelle mit echten Meldungen noch ungetestet.

## 5. Geschäftsmodell

**Preis- und Abo-Modell ist nicht entschieden und nicht gebaut.** Es gibt weder Preise noch Bezahlfunktion noch Abo-Logik. Zu klären:
- Was ist kostenlos, was kostet? (z. B. Einzelpreis, Monats-/Jahresabo, Test-Zeitraum)
- Zahlungsweg (Web-App: z. B. Stripe oder Paddle; App-Store: Gebühr 15 bis 30 %, Pflicht zur Kauf-Funktion des Stores)
- Rechnung, Umsatzsteuer, Widerrufsrecht, Kündigung (rechtlich prüfen)
- Freischaltung im Konto (Supabase: Zahlstatus pro Nutzer, Ablaufdatum)
- Preise und Bedingungen in Datenschutz, Impressum und AGB aufnehmen
- Zusammenhang mit Punkt 1.1: Verkauf setzt geklärte Rechte am Programm voraus.
- Preis für Minderjährige: Vertragsabschluss nur mit Eltern (siehe Punkt 1.3).

## 6. Video

1. **Video in der App (`video/start.mp4`)** zeigt noch den alten Ablauf (Max-Watt, Trainingsstand). Der Name „Last Round" ist per Überblendung durch „Nonstop Boxing" ersetzt (Logo-Szene, App-Kopfzeile, Endkarte); sauberer wäre ein Neurender aus der Quelle. Anpassen, wenn die App fertig ist. Es läuft als Intro bei jedem Start ohne Anmeldung und ist offline nicht verfügbar.
2. **Trailer** (`video/trailer/`): Webadresse für Szene 9 fehlt. Siehe dort auch die offenen Punkte.

## Empfehlung

Punkt 1.1 (Rechte am Plan) und 1.2 (Datenschutz) zuerst klären, danach 1.3 mit dem SQL und den Test der Anmeldung (1.10). Die anderen Punkte blockieren nicht.

## Zuletzt erledigt (16.11.2026)

Anmeldung per Code statt Passwort, Impressum und Datenschutz-Verantwortlicher eingetragen, Datenschutz-Text an das Verhalten angepasst, Sicherung ohne Datenverlust bei gleichzeitigen Änderungen, Import von Sicherungsdateien geprüft, Jugend-Sperre und Trainer-Freigabe entfernt, eigene Klasse für Kinder bis 14, Altersklasse mit Rückfall, Eingaben geprüft, Plan-Randfälle (Kampf in unter einer Woche, Kampftermin entfernen, Trainingstage), Timer-Rückfrage, Update-Hinweis über Intro und Timer.
