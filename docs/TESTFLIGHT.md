# TestFlight: Nonstop Boxing auf das iPhone bringen (Stand 20.11.2026, nicht auf dem Mac getestet)

Ziel: Die App läuft auf dem echten iPhone, ohne den Simulator. Der Simulator des Betreibers erreicht Supabase nicht (Zertifikatswarnung, Ursache auf dem Mac oder im Netz), das iPhone schon.

## Was vorbereitet ist

- `ios-assets/AppIcon-1024.png`: App-Symbol, 1024 × 1024, ohne Transparenz (aus `icons/icon.svg`)
- `tools/prepare-ios.mjs` (`npm run ios:prepare`): setzt Symbol, Verschlüsselungsangabe (nur Standard-HTTPS), Hochformat und „nur iPhone“ im iOS-Projekt. Läuft beliebig oft.
- `tools/testflight.sh` (`npm run ios:testflight`): kopiert die App, bereitet vor, baut ein Archiv und lädt es zu App Store Connect hoch. Die Build-Nummer kommt aus Datum und Uhrzeit.
- `tools/ExportOptions.plist`: Team `TMD2LP9S88`, automatische Signierung, direkter Upload.

## Auf dem Mac (ein Block im Terminal)

Voraussetzung: Xcode ist angemeldet (Xcode, Einstellungen, Konten), der Ordner `ios/` existiert (`npx cap add ios` ist schon gelaufen).

```bash
cd ~/airbike && git checkout main && git pull && npm install && npm run ios:testflight
```

Dauert einige Minuten. Beim ersten Mal fragt macOS eventuell nach dem Passwort für den Schlüsselbund, dann „Immer erlauben“.

## In App Store Connect (im Browser)

1. App „Nonstop Boxing“, Reiter **TestFlight**. Der Build erscheint nach der Verarbeitung, das dauert einige Minuten bis etwa eine Stunde (Vermutung).
2. Fragt Apple nach der Verschlüsselung, steht in der App nur Standard-HTTPS (Angabe „nein, keine eigene Verschlüsselung“, ist im Projekt schon gesetzt).
3. Unter **Interne Tests** eine Gruppe anlegen und das eigene Konto hinzufügen. Interne Tester brauchen nach meinem Wissen keine Prüfung durch Apple (nicht bestätigt).
4. Auf dem iPhone die App **TestFlight** installieren, mit derselben Apple-ID anmelden, „Nonstop Boxing“ installieren.

## Wenn etwas nicht klappt

- **Fehler beim Bauen oder Hochladen:** die letzten 20 Zeilen der Ausgabe weitergeben.
- **„Missing App Icon“ oder ähnlich:** `npm run ios:prepare` meldet dann eine Warnung. Symbol in Xcode unter Assets, AppIcon einsetzen.
- **Anmeldung am Terminal verlangt Passwort oder Freigabe:** zulassen.
- Ohne Skript geht es auch in Xcode: oben das Ziel „Any iOS Device (arm64)“, Product, Archive, Distribute App, App Store Connect, Upload.

## Auf dem iPhone zu prüfen (noch nie getestet)

Anmeldung per Code, Plan (Woche 1 ab 16.11., eingefroren), Timer mit Ton, Einheit abhaken, Speichern und Offline, Tastatur, Sicherung und Kalender-Export (vermutlich Probleme, siehe `docs/APP-HUELLE.md`), Erinnerungen (vermutlich Probleme).

Hinweis: Das Hero-Foto mit iStock-Wasserzeichen ist im Build enthalten. Für den internen Test egal, nicht für den Store.
