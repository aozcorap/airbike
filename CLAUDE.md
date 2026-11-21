# Regeln für dieses Projekt

- **Neue Sitzung: zuerst `docs/EINSTIEG.md` lesen.** Dort stehen Arbeitsweise des Betreibers, Technik-Hinweise und die Verweise auf `OFFENE-PUNKTE.md` und `video/trailer/STAND.md`. Der Gesprächsverlauf früherer Sitzungen steht nicht zur Verfügung.

- **Jede Änderung an der App erhöht die Version**, damit Nutzer den Hinweis „Neu laden“ automatisch sehen: `APP_BUILD` in `app.js` und `CACHE = 'redline-vNN'` in `sw.js` um 1 erhöhen, beide gleich. Das gilt für jede Änderung an `app.js`, `styles.css`, `data.js`, `plan.js`, `cloud.js`, `index.html` oder anderen App-Dateien.
- **Neuigkeiten pflegen:** Bei jeder Änderung, die Nutzer bemerken, oben in der Liste `NEUES` in `app.js` einen Stichpunkt ergänzen (kurz, Deutsch). `APP_VERSION` (z. B. `'1.1'`) ändert sich nur, wenn bei Apple eine neue Version erscheint (1.0.1 Fehlerbehebung, 1.1 Neues, 2.0 Großes). Dann auch die Version in Xcode (Marketing-Version) setzen und im App Store Connect das Feld „Was ist neu in dieser Version“ mit denselben Stichpunkten füllen. Die App zeigt „Version 1.0 (106)“ unten unter „Mehr“ und die Liste unter „Das ist neu“.
- Die App zeigt bei neuer Version den Hinweis mit dem Knopf „Neu laden“. Sie lädt nie stillschweigend neu.
- Auf ein Handy-Layout prüfen (390 × 844), bevor etwas als erledigt gemeldet wird.
- Texte für Nutzer auf Deutsch, kurz und ohne Fachsprache.
