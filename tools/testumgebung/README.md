# Testumgebung für die Web-Version

Damit sich Änderungen an der App im Browser prüfen lassen, ohne Anmeldung und ohne echte Daten. Der Test-Server liefert die echte App aus dem Repo, nur `cloud.js` wird durch eine **Attrappe** ersetzt (`cloud-attrappe.js`: vorgetäuschtes Konto, kein Netz). Es werden keine App-Dateien verändert und nichts in die Datenbank geschrieben.

## Starten

Im Repo-Ordner:

```bash
python3 tools/testumgebung/server.py 8140
```

Dann im Browser `http://localhost:8140/` öffnen und die Fenstergröße auf 390 × 844 stellen (Handy). Beenden mit Strg+C (oder `pkill -f tools/testumgebung/server.py`).

## Zustand setzen (im Browser, per JavaScript)

Das Intro zuerst überspringen: `document.querySelector('[data-act="intro-skip"]')?.click()`

Dann zum Beispiel:

```js
const tag = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// normaler Nutzer, Kampf in 30 Tagen, Test-Watt 900, eine Einheit erledigt
__setze({}, { onboarded: true, fightDate: tag(30), maxW: 900, done: { w3s1: '2026-11-20T10:00:00Z' } });
```

`__setze(cfg, state)` speichert die Schalter und den Stand und lädt die Seite neu. Das Intro danach noch einmal überspringen.

**Schalter `cfg`:**

| Schalter | Wirkung |
| --- | --- |
| `admin: true` | Konto ist Admin |
| `tester: true` | Testkonto mit gespieltem Kauf |
| `abo: true` | „Ohne Werbung“-Abo aktiv |
| `club: 'trainer'` | Trainer des Vereins „Testverein“ (ohne Paket); `probe: 'laeuft'`, `'keine'` oder `'vorbei'` |

**Stand `state`:** wie in der App gespeichert (`onboarded`, `fightDate`, `startDate`, `maxW`, `done`, `notify`, `when`, `time`, `ti` …). Einheiten-IDs stehen in der Plan-Ansicht (`#/plan`, Links `#/s/<id>`).

## Zähler zum Prüfen

- `window.__buyCalls`: wie oft ein Testkauf ausgelöst wurde.
- `window.__gymCreate`: wie oft „Verein anlegen“ ausgelöst wurde.
- `window.__push`: Aufrufe für Push (`key`, `anm`, `abm`, `anmArgs`, `abmArgs`); `__push.anmErr = true` lässt die Anmeldung scheitern.

Meldungen der App (`alert`) fängst du ab, indem du vorher `window.alert = (t) => (window.__alerts = [...(window.__alerts || []), t])` setzt.

## Grenzen

- Echte Anmeldung, echte Datenbank und echte Push-Zustellung lassen sich hier **nicht** prüfen.
- Der Service Worker (`sw.js`) ist gesperrt, „Neu laden“ und Offline lassen sich hier nicht testen.
- Neue Funktionen von `cloud.js` (neue `export`-Zeilen) brauchen eine passende Zeile in `cloud-attrappe.js`, sonst lädt die App nicht.
- Eine unterbrochene Einheit steht in `localStorage 'redline.run'`; `__setze` löscht sie.
