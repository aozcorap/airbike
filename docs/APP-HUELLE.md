# App-Hülle für iPhone (Stand 19.11.2026, nicht getestet)

Die Web-App wird mit Capacitor in eine iPhone-App verpackt. Die App selbst bleibt unverändert im Hauptordner. Die Hülle besteht nur aus:

- `package.json` und `package-lock.json`: Capacitor 8.6.2 (verlangt **Node 22 oder neuer**)
- `capacitor.config.json`: Name „Nonstop Boxing“, Bundle-ID `de.ozcorapci.nonstopboxing`
- `tools/build-www.mjs`: kopiert die App-Dateien in den Ordner `www` (ohne Service Worker, ohne Trailer und Doku)

`www/` und `node_modules/` entstehen auf dem Rechner und stehen nicht im Repo.

## Schritte auf dem Mac (Terminal im Projektordner)

1. Stand holen: `git checkout main` und `git pull` (die Hülle ist seit Version 85 in `main`)
2. Node prüfen: `node -v` (mindestens 22)
3. `npm install`
4. `npx cap add ios` (legt den Ordner `ios/` an)
5. `npm run sync` (baut `www` und kopiert es ins iOS-Projekt)
6. `npx cap open ios` (öffnet Xcode)
7. In Xcode: oben ein iPhone-Modell als Ziel wählen, links das Projekt „App“ anklicken, bei „Signing & Capabilities“ das eigene Team auswählen, dann auf Start (Dreieck) drücken.

Nach jeder Änderung an der App: `npm run sync` und in Xcode neu starten.

## Stand der Tests (19.11.2026)

- **Läuft im Simulator** (iPhone 18 Pro, iOS 27.2, Xcode 27.2): Das Intro-Video mit „Ton an“ und „Überspringen“ erscheint, danach die Anmeldeseite mit „Code senden“, Datenschutz und Impressum. Bis dahin nichts weiter geprüft.
- Beim ersten Start des Simulators stürzten zwei Systemprogramme ab (MobileCal, WidgetRenderer). Das lag am langsamen Erststart des Simulators und betrifft die App nicht.
- Die Warnung zum Signing („Your team has no devices“) betrifft nur echte iPhones und blockiert den Simulator nicht. Für den Test auf einem echten iPhone muss das iPhone angeschlossen und registriert werden.
- **Der Simulator des Betreibers erreicht Supabase nicht** (Zertifikatswarnung im Simulator-Safari, Ursache am Mac oder Netz). Deshalb Test auf dem echten iPhone.
- **Test auf dem echten iPhone (iPhone 14 Pro, aus Xcode gestartet, 20.11.2026):** Anmeldung per Code geht, der Stand kommt aus dem Konto (gleich wie in der Web-Version), Plan und aktueller Lauf stimmen, Timer läuft, Ton kommt (online und offline), Offline-Betrieb funktioniert.
- **Funktioniert in der Hülle nicht (vom Betreiber bestätigt, in der Web-Version geht es):** Sicherung als Datei: Beim Tippen auf „Sichern“ passiert nichts, in der Web-Version geht es. Wiederherstellen aus einer Datei geht in beiden. Erinnerungen: Der Knopf „Hinweise in der App aktivieren“ fehlt in der Hülle, in der Web-Version ist er da. Beides liegt an fehlenden Web-Funktionen in der Hülle (Datei-Download, Benachrichtigung). **Seit Version 88 gebaut** (Capacitor-Pakete Filesystem, Share, Local Notifications, nur in der iPhone-App aktiv, die Web-Version bleibt unverändert), **noch nicht auf dem iPhone geprüft:** „Sichern“ und der Kalender-Export öffnen das Teilen-Menü (dort „In Dateien sichern“, „Kalender“ usw.), die Erinnerungen kommen als Mitteilungen des iPhones für die nächsten bis zu 30 offenen Einheiten zur eingestellten Uhrzeit, auch bei geschlossener App. Nach dem Holen der neuen Version: `npm install && npm run sync`. Der Kalender-Export wurde noch nicht geprüft.
- Weitere Punkte aus der Liste unten sind noch offen (Tastatur im Zeitfeld, Kalender-Export).

## Was beim Testen im Simulator zu prüfen ist

- Start, Intro-Video, Anmeldung per Code (braucht echte E-Mail, vorher klären, siehe Arbeitsweise in `EINSTIEG.md`)
- Speichern und Sichern, Offline-Betrieb
- Timer mit Ton
- **Sicherung als Datei und Kalender-Export (.ics):** Downloads aus der Web-App funktionieren in der Hülle vermutlich nicht ohne Zusatz (Vermutung)
- **Erinnerungen:** Die Web-Benachrichtigung funktioniert in der Hülle vermutlich nicht, dafür braucht es ein Zusatzpaket von Capacitor (Vermutung)
- Sicherheitsregel (CSP) in `index.html`: Adressen der Hülle (`capacitor://localhost`) sind nicht getestet
- Der Service Worker wird in der Hülle nicht gestartet (Absicht, wird dort nicht gebraucht)

## Noch nicht Teil der Hülle

Werbung, Käufe, Mitteilungen, Android, App-Symbol und Startbild für die Stores, Hero-Foto ohne Wasserzeichen.
