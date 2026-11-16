# Nonstop Boxing – Mehr Kondition bis zur letzten Runde

Web-App (installierbar auf dem Handy) für ein 10-Wochen-Air-Bike-Training für Boxer, mit Intervall-Timer.

## Funktionen
- 10-Wochen-Plan, der sich nach Kampftermin und Trainingshäufigkeit (1×, 2× oder 3× pro Woche) richtet. Die Kürzungsregeln sind Annahmen und nicht fachlich geprüft.
- Geführter Fitness-Test (3 × 10 s), aus dem Durchschnitt (Test-Watt) werden alle Watt-Ziele berechnet
- Intervall-Timer mit Ton, Vibration und aktivem Bildschirm
- Kampfformat (3–12 Runden, 2 oder 3 Minuten) und Altersklasse steuern Umfang und Wattgrenzen
- Altersklassen-Profile (Rundenlänge, Umfang, Sprintdauer, harte Sessions pro Woche, Watt-Obergrenze). Die Werte stehen in `data.js` unter `PROFILES`. **Die Jugendwerte sind Annahmen und nicht von einem Fachtrainer geprüft.** Es gibt vier Klassen nach Geburtsjahr: bis 14 Jahre (U13–U14 und jünger, die vorsichtigsten Werte: 50 % Umfang, Sprints bis 10 s, höchstens 80 % vom Test-Watt), 15–16, 17–18 und Erwachsene. Es gibt weder eine Sperre noch eine Trainer-Freigabe in der App.
- Aktive Erholung
- Wochenplan, Kalender-Datei (.ics) mit Erinnerungen, Sicherung/Wiederherstellung
- Pflicht-Login mit Konto (Supabase). Der Fortschritt wird je Konto gesichert und auch offline lokal zwischengespeichert; Datenschutz und Impressum sind nur Entwürfe

## Lokal starten
```
python3 -m http.server 8000
```
Dann `http://localhost:8000` öffnen. Auf dem Handy ist ein HTTPS-Hosting nötig (z. B. GitHub Pages), damit Installation und Offline-Modus funktionieren.
