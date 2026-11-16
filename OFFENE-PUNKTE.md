# Offene Punkte – Nonstop Boxing

Stand: 16.11.2026. Wird bei Änderungen nachgeführt.

## Rechtlich (vor echten Nutzern, blockierend)

1. **Programm aus gekauftem PDF.** Der Plan steckt öffentlich im Repo. Das Recht zur Nutzung und Vermarktung ist ungeklärt. Für Werbevideo und Verkauf dringend.
2. **Datenschutz** ist ein Entwurf mit Lücken (`[...]`). Ohne ihn keine echten Nutzer, besonders keine Minderjährigen. Das Impressum ist eingetragen (Name, Anschrift, E-Mail, ohne USt-ID, nicht rechtlich geprüft; die Anschrift ist öffentlich sichtbar).
3. **Name „Nonstop Boxing"** ist nicht auf Marke, App-Store und Domain geprüft.
4. **Foto auf der Startseite** (`img/hero.jpg`) hat ein iStock-Wasserzeichen und liegt im öffentlichen Repo. Lizenz oder Ersatz nötig.
14. **Rückmeldungen der Tester sind öffentlich.** Sie landen als Issues im öffentlichen Repo, auch wenn ein Tester Namen oder Gesundheitsangaben hineinschreibt. Der Hinweis in der App steht drin, die Datenschutz-Entwürfe müssen es sauber abdecken.
15. **Kein Mindestalter und keine Einwilligung der Eltern (Entscheidung des Betreibers).** Die App fragt beides nicht mehr ab, der Plan passt sich weiter per Altersklasse an das Geburtsjahr an. Risiko: Die Einwilligung Minderjähriger in die Datenverarbeitung (DSGVO Art. 8, in Deutschland unter 16 Jahren Zustimmung der Eltern) ist damit nicht abgedeckt. Rechtlich prüfen lassen. **Die Datenbank-Regel muss von Hand geändert werden** (`docs/DB-REGISTRIERUNG.sql`), sonst lehnt sie Registrierungen unter 14 Jahren ab und verlangt unter 17 Jahren eine Elternzustimmung.
16. **Musik im Tester-Video** (CC BY 4.0, ende.app) verlangt Namensnennung des Urhebers. Prüfen, ob sie im Video und in der Beschreibung steht.

## Fachlich

5. **Jugendwerte (U17–U18, U16 und jünger)** sind Annahmen und nicht von einem Trainer geprüft. In der App gibt es keine Sperre und keine Freigabe mehr, Kinder unter 15 bekommen das Profil „U16 und jünger“ (schonendste Werte). Entscheidung des Betreibers.
6. **Regeln für Rundenzahl und Alter** sind Annahmen (+1 Kampfrunde je 2 Runden ab 3, +2,5 % Umfang je Runde, höchstens +20 %). Nicht fachlich geprüft.
7. **„Sportwissenschaftlich"** ist für Werbung nicht belegt. Das PDF nennt keine Studien mit Quelle. Nur „nach Prinzipien" formulieren, nie „bewiesen". Ein Trainer sollte das bestätigen.

## Technisch

8. **Konto-Dienst (Supabase):** E-Mails laufen über den IONOS-Server (Absender Nonstop Boxing), die drei Vorlagen sind eingetragen (Vorlagen in `docs/E-MAIL-VORLAGEN.md`, getestet nur die Passwort-Mail). Offen: Bestätigungs-Mail testen, Sendegrenzen von IONOS und Supabase (30 Mails pro Stunde) bei vielen Nutzern prüfen. Schutz gegen geleakte Passwörter ist aus, Mindestpasswort serverseitig 6 Zeichen.
   Rückmeldungen der Tester laufen **nicht** über Supabase-Tabellen, sondern über die Edge-Function `feedback-to-github` direkt als Issue ins Repo (Ablauf: `docs/FEEDBACK-ABLAUF.md`). Der GitHub-Token liegt im Supabase-Vault (`github_token`).
9. **Der Plan ist öffentlich lesbar.** Das Login schützt nur den Fortschritt der Nutzer, nicht den Plan.
10. **Projekt `matchmaker` in Supabase ist pausiert** (Gratis-Plan erlaubt zwei Projekte).
11. **Nicht testbar von der KI:** iOS-Safari, Ton und Vibration des Timers, Offline-Betrieb. Auf dem Handy prüfen.
17. **GitHub-Token neu erzeugen.** Der Token wurde im Chat eingefügt. Neu erzeugen und im Vault ersetzen (SQL). Ablaufdatum prüfen, sonst gehen Meldungen still verloren.
18. **Test-Konto `lr-test-a@example.com`** in Supabase vor dem Start löschen.
19. **Sendegrenze für Meldungen** (10 pro Stunde je Nutzer) liegt im Speicher der Funktion und setzt sich bei einem Neustart zurück. Für den Tester-Kreis ausreichend (Vermutung).
20. **Supabase-Gratis-Plan:** Projekte mit wenig Aktivität werden pausiert. Beim Tester-Betrieb im Blick behalten (prüfen).
27. **E-Mail-Vorlagen mit Code in Supabase einfügen** (`docs/E-MAIL-VORLAGEN.md`, Vorlage 1 und 4 Magic link; Anmeldung läuft jetzt standardmäßig per Code, Passwort ist freiwillig). Bestätigung und Passwort-Reset laufen in der App über einen Zahlen-Code, nicht mehr über den Link. Ohne neue Vorlagen steht in der Mail kein Code. Nicht getestet (braucht echte Mail).
21. **Bedienung (UX-Auswertung, Stand unklar, prüfen):** Einstellungen gruppieren und Gefahrenzone (A8, B5, B6), Uhrzeit-Format „06:00 PM" (C2), „Woche 10: 0/0" (B7), doppelte Eingabewege für Test-Watt (B8). Siehe `docs/UX-AUSWERTUNG.md`.
22. **Nicht geprüft:** Barrierefreiheit (Vorlesefunktion), Geräte unter 360 px, Eingabe mit echter Tastatur auf dem iPhone.
23. **Fitness-Test wiederholen** nach 4 bis 6 Wochen: Hinweis und fester Ort fehlen.

## Betrieb

24. **Tester-Nachricht** passt nicht mehr zum neuen Ablauf (Reihenfolge, Feedback-Weg). Vor dem Versand anpassen.
25. **Tägliche Mail mit offenen Meldungen** (Routine „Nonstop-Boxing: Issues, Features und Fragen", 9:54 Uhr): Der Auftragstext in der Routine ist noch der Einfügetext („Lege eine Routine an …"). Den Teil ab „Auftrag der Routine" einsetzen. Tabelle mit echten Meldungen noch ungetestet.

## Geschäftsmodell

26. **Preis- und Abo-Modell ist nicht entschieden und nicht gebaut.** Es gibt weder Preise noch Bezahlfunktion noch Abo-Logik. Zu klären:
    - Was ist kostenlos, was kostet? (z. B. Einzelpreis, Monats-/Jahresabo, Test-Zeitraum)
    - Zahlungsweg (Web-App: z. B. Stripe oder Paddle; App-Store: Gebühr 15 bis 30 %, Pflicht zur Kauf-Funktion des Stores)
    - Rechnung, Umsatzsteuer, Widerrufsrecht, Kündigung (rechtlich prüfen)
    - Freischaltung im Konto (Supabase: Zahlstatus pro Nutzer, Ablaufdatum)
    - Preise und Bedingungen in Datenschutz, Impressum und AGB aufnehmen
    - Zusammenhang mit Punkt 1: Verkauf setzt geklärte Rechte am Programm voraus.
    - Preis für Minderjährige: Vertragsabschluss nur mit Eltern (siehe Punkt 15).

## Video

12. **Video in der App (`video/start.mp4`)** zeigt noch den alten Ablauf (Max-Watt, Trainingsstand). Der Name „Last Round“ ist per Überblendung durch „Nonstop Boxing“ ersetzt (Logo-Szene, App-Kopfzeile, Endkarte); sauberer wäre ein Neurender aus der Quelle. Anpassen, wenn die App fertig ist.
13. **Trailer** (`video/trailer/`): Webadresse für Szene 9 fehlt. Siehe dort auch die offenen Punkte.

## Empfehlung

Punkt 1 und 2 zuerst klären, die anderen blockieren nicht.
