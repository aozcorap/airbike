# Ordnung und Ablage: Vorschlag und Dateiverzeichnis (Stand 20.11.2026)

**Status: Vorschlag, noch nicht abgestimmt und noch nicht umgesetzt.** Der Betreiber will alle Dateien zum Projekt an einer zentralen Stelle haben und nicht mehr suchen müssen. Die Umsetzung ist für einen anderen Tag geplant. **Das ist einer der wichtigsten offenen Punkte** (siehe `OFFENE-PUNKTE.md`, Abschnitt „Ablage ordnen“).

Diese Datei wird bei jeder neuen Datei oder jedem neuen Ordner **mitgepflegt**: Wo liegt es heute, wo soll es hin, behalten oder löschen. Am Projektende gibt es damit eine fertige Wegwerfliste.

## Grundregeln (Vorschlag)

1. **Das GitHub-Repo ist öffentlich.** Dort liegt nur, was jeder sehen darf: Code, Anleitungen, kleine Bilder und Töne, Store-Texte. **Nie ins Repo:** Passwörter und Schlüssel, Rechnungen und Verträge (persönliche Daten), das gekaufte Trainingsplan-PDF (Rechte ungeklärt), große Videos und Rohmaterial.
2. **Ein Zentralordner auf dem Mac** für alles, was nicht ins Repo darf oder zu groß ist.
3. **Zugangsdaten gehören in einen Passwortmanager**, nie in Dateien, Ordner oder GitHub.
4. **Erzeugtes** (Zwischenspeicher, Bauordner) wird nicht aufbewahrt, es lässt sich neu erzeugen.

## Zielstruktur auf dem Mac (Vorschlag)

```
~/Nonstop-Boxing/
  00-Uebersicht.md              kurze Übersicht, verweist auf diese Datei
  01-App/airbike/               das GitHub-Projekt (Code, ios/, Doku)
  02-Trainingsplan-Original/    gekauftes PDF, Kaufbeleg, Unterlagen zu den Rechten
  03-Trailer/
    Rohmaterial-Higgsfield/     heruntergeladene Clips, Referenzbilder 1 bis 6, Kopien der Prompts
    App-Bilder/                 App-Aufnahmen 1440 × 2560
    Audio/                      Herzschlag, Original der Klopf-Aufnahme, Musik mit Lizenznachweis
    Schnitt/                    iMovie- und CapCut-Projekte, Exporte v1 bis vN
    Fertig/                     freigegebene Fassungen (Deutsch, Englisch, Hochformat)
  04-Apple-App-Store/           Belege (Entwicklerprogramm), Händlerstatus, TestFlight-Notizen, Datenschutz-Angaben
  05-Google-Play/               dasselbe für Google
  06-Recht-Geld-Marke/          Impressum, Datenschutz-Entwurf, Namens- und Markenprüfung, Preise, Steuer, Rechnungen
  07-Archiv/                    Altes, mit Datum „löschen ab …“
```

**Im Repo bleiben (öffentlich, darf jeder sehen):**
- Code und Anleitungen (`docs/`, `tools/`, `supabase/`, `OFFENE-PUNKTE.md`)
- App-Symbol und Töne (`icons/`, `ios-assets/`, `img/ton/`), Intro-Video (`video/start.mp4`, wird von der App geladen)
- Trailer-Texte: Prompts, Ablauf, Stand (`video/trailer/*.md`) und das Aufnahmeskript
- Vorschlag neu: Store-Texte, Stichwörter und Screenshots für beide Stores in einem Ordner `store/` (öffentlich unkritisch, mit Verlauf)

**Sicherung:** GitHub sichert nur das Repo. Die Ordner 02 bis 07 sollten zusätzlich in Dropbox oder iCloud Drive liegen oder über Time Machine gesichert sein (offen, welche Variante). Das Repo selbst nicht in einen Cloud-Ordner legen, es hat viele Hilfsdateien (`node_modules`).

## Verzeichnis (laufend pflegen)

Ort „unbekannt“ heißt: Der Betreiber weiß nicht, wo es liegt, und muss es suchen.

| Was | Ort heute | Ziel | Aktion |
|---|---|---|---|
| Projekt (GitHub `aozcorap/airbike`) | `~/airbike` | `01-App/airbike` | später verschieben, danach die Pfade in `docs/` anpassen |
| `ios/` (Xcode-Projekt) | `~/airbike/ios`, nicht im Repo | ins Repo übernehmen | behalten, später in Git aufnehmen (`.gitignore` prüfen) |
| `node_modules/`, `www/`, `build/` | `~/airbike` | bleiben im Projekt | löschbar, entstehen neu (`npm install`, `npm run sync`); `build/` nach erfolgreichem Upload |
| `aufnehmen.js.bak` | `~/airbike/video/trailer/app-bilder/` | – | löschen (Sicherungskopie der Skriptänderung) |
| Neue App-Bilder 1440 × 2560 (7 Dateien) | `~/trailer-bilder/app` | `03-Trailer/App-Bilder` | nur `b2_fitnesstest`, `b3_plan`, `b5_timer` werden gebraucht, die übrigen vier später löschen |
| Alte App-Bilder 1080 × 1920 | im Repo `video/trailer/app-bilder/*.png` | durch die neuen ersetzen oder löschen | nach Abschluss des Trailers entscheiden |
| Trailer-Schnitte `v1.mp4` (12,6 MB), `v2.mov` (57,3 MB), `v2.MP3`, `v3.mp4` (26,4 MB), `v3_hochformat.mp4` | `~/Downloads/Nonstop Boxing Trailer/` | `03-Trailer/Schnitt` und `Fertig` | `v3_hochformat.mp4` und `v3.mp4` behalten, `v1`, `v2.mov`, `v2.MP3` nach Abschluss löschen (Betreiber entscheidet) |
| Original der Klopf-Aufnahme (`Neue Aufnahme.m4a`) | Sprachmemos / Chat, Ort unbekannt | `03-Trailer/Audio` | behalten; die drei geschnittenen Schläge liegen im Repo (`img/ton/`) |
| Herzschlag-Tonspur | unbekannt | `03-Trailer/Audio` | suchen, behalten; Lizenz für kommerzielle Nutzung prüfen |
| CapCut-Projekt, iMovie-Projekt | unbekannt | `03-Trailer/Schnitt` | suchen, bis zur fertigen Fassung behalten |
| Higgsfield-Videos und Referenzbilder 1 bis 6 | im Higgsfield-Konto, nicht lokal | `03-Trailer/Rohmaterial-Higgsfield` | herunterladen, danach im Konto aufräumen |
| Gekauftes Trainingsplan-PDF und Kaufbeleg | unbekannt | `02-Trainingsplan-Original` | suchen, **nicht ins öffentliche Repo** |
| Rechnung Apple Developer Program (per E-Mail) | E-Mail-Postfach | `04-Apple-App-Store` | als PDF speichern |
| Zugangsdaten (Apple-ID, Supabase, GitHub-Token, Hosting) | unbekannt | Passwortmanager | nie in Dateien oder GitHub |
| Playwright-Browser (Chromium) | `~/Library/Caches/ms-playwright` | – | löschbar (nur zum Aufnehmen der App-Bilder), neu mit `npx playwright install chromium` |
| Xcode-Zwischenspeicher | `~/Library/Developer/Xcode/DerivedData/App-…` | – | jederzeit löschbar, Xcode baut neu |
| iOS-27.2-Simulator (Programmdateien) | in Xcode | – | löschbar, solange der Simulator wegen der Zertifikatswarnung nicht nutzbar ist (Größe nicht geprüft) |
| Xcode selbst | `/Applications/Xcode.app` | – | behalten (nötig für App Store und TestFlight) |
| Homebrew, `ffmpeg` | `/opt/homebrew` | – | behalten, bis der Trailer fertig ist; danach `ffmpeg` löschbar |
| Xcode-Archiv `App.xcarchive` | `~/airbike/build/` | – | nach erfolgreichem Upload löschbar |
| Web-App auf dem Home-Bildschirm des iPhones | iPhone | – | löschen, sobald die App läuft (Stand liegt im Konto) |
| App aus Xcode auf dem iPhone | iPhone | – | später durch die TestFlight-App ersetzt (gleiche Kennung) |

## Offene Entscheidungen für die Abstimmung

1. Name und Ort des Zentralordners, Vorschlag `~/Nonstop-Boxing` im Benutzerordner.
2. Soll das Projekt (`~/airbike`) in den Zentralordner umziehen, oder bleibt es dort, wo es ist, und der Zentralordner verweist darauf? Ein Umzug heißt: alle Befehle und Anleitungen mit `~/airbike` müssen angepasst werden.
3. Sicherung der Ordner 02 bis 07: Dropbox, iCloud Drive oder Time Machine.
4. Sollen Store-Texte und Screenshots in einen Ordner `store/` im Repo (öffentlich) oder nur lokal?
