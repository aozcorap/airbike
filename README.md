# Redline – 10-Wochen Air-Bike-Camp

Web-App (installierbar auf dem Handy) für ein 10-Wochen-Air-Bike-Training für Boxer, mit Intervall-Timer.

Die Trainingsstruktur basiert auf dem Programm „Assault Bike Conditioning" von Boxing Science.
Dies ist ein privates Projekt. Die Inhalte dürfen ohne Lizenz des Rechteinhabers nicht veröffentlicht oder verkauft werden.

## Funktionen
- 10-Wochen-Plan mit allen Sessions (Pyramiden, Max-Sprints, Muskelpufferung, Fight-HIIT, Taper)
- Intervall-Timer mit Ton, Vibration und aktivem Bildschirm
- Max-Watt-Eingabe: Zielwerte werden automatisch berechnet
- Anfänger-Modus (−50 / −100 W)
- Aktive Erholung (auf das Bike umgeschrieben)
- Wochenplan, Kalender-Datei (.ics) mit Erinnerungen, Sicherung/Wiederherstellung
- Alle Daten bleiben lokal im Browser

## Anpassungen gegenüber der Vorlage
- Woche 9 (Fight-HIIT): Laufband-Werte (km/h, 1,5 % Steigung) auf das Bike umgerechnet. Die Prozentwerte vom Max-Watt sind eine Schätzung.
- Woche 10: gilt die Folie (6 × 10 s bei 90 %).
- Woche 6, Session 3: 5 Wiederholungen laut Folie (die Plan-Grafik nennt 6).
- Woche 8, Wiederholte Sprints: die Folie nennt 21 Wiederholungen, aber Max-Effort nur für Wdh. 18–20. Die App nutzt 18–21.

## Lokal starten
```
python3 -m http.server 8000
```
Dann `http://localhost:8000` öffnen. Auf dem Handy ist ein HTTPS-Hosting nötig (z. B. GitHub Pages), damit Installation und Offline-Modus funktionieren.
