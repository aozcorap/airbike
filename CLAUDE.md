# Regeln für dieses Projekt

- **Neue Sitzung: zuerst `docs/EINSTIEG.md` lesen.** Dort stehen Arbeitsweise des Betreibers, Technik-Hinweise und die Verweise auf `OFFENE-PUNKTE.md` und `video/trailer/STAND.md`. Der Gesprächsverlauf früherer Sitzungen steht nicht zur Verfügung.

- **Jede Änderung an der App erhöht die Version**, damit Nutzer den Hinweis „Neu laden“ automatisch sehen: `APP_BUILD` in `app.js` und `CACHE = 'redline-vNN'` in `sw.js` um 1 erhöhen, beide gleich. Das gilt für jede Änderung an `app.js`, `styles.css`, `data.js`, `plan.js`, `cloud.js`, `index.html` oder anderen App-Dateien.
- Die App zeigt bei neuer Version den Hinweis mit dem Knopf „Neu laden“. Sie lädt nie stillschweigend neu.
- Auf ein Handy-Layout prüfen (390 × 844), bevor etwas als erledigt gemeldet wird.
- Texte für Nutzer auf Deutsch, kurz und ohne Fachsprache.
