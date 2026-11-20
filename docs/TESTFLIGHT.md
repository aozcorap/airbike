# TestFlight: Nonstop Boxing auf das iPhone bringen (Stand 20.11.2026)

**Überholt (Entscheidung des Betreibers, 20.11.2026 abends): TestFlight wird nicht weiter genutzt.** Der Betreiber hat sich aus der internen Gruppe genommen und will keine Tester darüber. Die App kommt direkt aufs iPhone mit:

```bash
cd ~/airbike && git checkout main && git pull && npm install && npm run ios:iphone
```

Das Skript `tools/iphone.sh` sucht das gekoppelte iPhone, kopiert die App (`npm run sync`), bereitet das Projekt vor, baut für das Gerät, installiert (`xcrun devicectl device install app`) und startet die App. Das iPhone muss entsperrt und per Kabel oder im selben WLAN erreichbar sein. Der Aufruf ist unabhängig von App Store Connect. Am 20.11.2026 lief es auf dem Mac des Betreibers einmal durch (`BUILD SUCCEEDED`, App installiert und gestartet, Version 95), siehe Abschnitt „Direkt aufs iPhone“ am Ende. Der Rest dieser Datei beschreibt den früheren TestFlight-Weg (Upload mit `npm run ios:testflight`), der weiter funktioniert, falls er später wieder gebraucht wird, und die dabei gefundenen Fehler.

Ziel (früherer Weg): Die App läuft auf dem echten iPhone, ohne den Simulator. Der Simulator des Betreibers erreicht Supabase nicht (Zertifikatswarnung, Ursache auf dem Mac oder im Netz), das iPhone schon.

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

## Bekannter Fehler beim ersten Mal (am 20.11.2026 aufgetreten)

`Communication with Apple failed: Your team has no devices from which to generate a provisioning profile` und `No profiles for 'de.ozcorapci.nonstopboxing' were found`, danach `ARCHIVE FAILED`.

Ursache: Neue Entwicklerkonten brauchen mindestens ein eingetragenes Gerät, damit Xcode ein Signaturprofil erzeugen darf. Lösung: das echte iPhone einmal anschließen und die App aus Xcode auf dem iPhone starten.

1. iPhone per Kabel anschließen, entsperren, „Diesem Computer vertrauen“ bestätigen.
2. Am iPhone Entwicklermodus einschalten (Einstellungen, Datenschutz & Sicherheit, Entwicklermodus, danach Neustart). Der Eintrag erscheint erst, wenn das iPhone einmal mit Xcode verbunden war.
3. In Xcode (`npx cap open ios`) oben das iPhone als Ziel wählen, Start drücken. Xcode trägt das Gerät ein.
4. Falls das iPhone fragt: Einstellungen, Allgemein, VPN & Geräteverwaltung, Entwicklerprofil, Vertrauen.
5. Danach den TestFlight-Block noch einmal ausführen.

## Zweiter bekannter Fehler: Upload scheitert mit „Invalid Signature“ (20.11.2026, gelöst)

`exportArchive Invalid Signature. ... Cordova.framework ... is not properly signed ... distribution certificate` und `EXPORT FAILED`. Das Archiv selbst war fertig (`ARCHIVE SUCCEEDED`), nur der Upload scheiterte.

**Ursache (gesichert):** Auf dem Mac gab es nur das Zertifikat „Apple Development“, aber kein „Apple Distribution“. `xcodebuild -exportArchive` legt es nicht selbst an.

**Lösung (gesichert):** Das Zertifikat „Apple Distribution“ für das Team `TMD2LP9S88` anlegen (Xcode, Einstellungen, Konten, Zertifikate verwalten, Plus, Apple Distribution). Danach `npm run ios:testflight` noch einmal ausführen. Am 20.11.2026 um 14:39 lief der Upload damit ohne Fehler durch (`EXPORT SUCCEEDED`, Build 2611201438). Ob ein Zertifikat vorhanden ist, zeigt `security find-identity -v -p codesigning` (es müssen „Apple Development“ und „Apple Distribution“ erscheinen).

Der Weg über den Xcode-Organizer (`open ~/airbike/build/App.xcarchive`, Distribute App) bleibt als Ausweg, falls der Upload später wieder scheitert. Das Skript öffnet den Organizer bei einem Fehler selbst.

## Wenn etwas nicht klappt

- **Fehler beim Bauen oder Hochladen:** die letzten 20 Zeilen der Ausgabe weitergeben.
- **„Missing App Icon“ oder ähnlich:** `npm run ios:prepare` meldet dann eine Warnung. Symbol in Xcode unter Assets, AppIcon einsetzen.
- **Anmeldung am Terminal verlangt Passwort oder Freigabe:** zulassen.
- Ohne Skript geht es auch in Xcode: oben das Ziel „Any iOS Device (arm64)“, Product, Archive, Distribute App, App Store Connect, Upload.

## Auf dem iPhone zu prüfen (noch nie getestet)

Anmeldung per Code, Plan (Woche 1 ab 16.11., eingefroren), Timer mit Ton, Einheit abhaken, Speichern und Offline, Tastatur, Sicherung und Kalender-Export (vermutlich Probleme, siehe `docs/APP-HUELLE.md`), Erinnerungen (vermutlich Probleme).

Hinweis: Das Hero-Foto mit iStock-Wasserzeichen ist im Build enthalten. Für den internen Test egal, nicht für den Store.

## Direkt aufs iPhone (seit 20.11.2026, ohne TestFlight)

`npm run ios:iphone` (Skript `tools/iphone.sh`). Das Skript nimmt das erste gekoppelte echte iPhone aus `xcrun devicectl list devices`, kopiert die App (`npm run sync`), führt `tools/prepare-ios.mjs` aus, baut mit `xcodebuild` (Debug, Ziel `id=<UDID>`, Ausgabe in `build/iphone`), installiert mit `xcrun devicectl device install app` und startet mit `xcrun devicectl device process launch`.

- **Geprüft (20.11.2026, auf dem Mac des Betreibers, von der KI gestartet):** Der Lauf endete mit `BUILD SUCCEEDED`, `App installed` und `Launched application`, Version 95 mit dem Google-Werbe-Paket. Das iPhone war als „available (paired)“ gelistet.
- **Nicht geprüft:** ob der gelbe TestFlight-Punkt am Symbol verschwindet, und der Ablauf der Test-Werbung auf dem iPhone.
- **Wenn kein iPhone gefunden wird:** iPhone entsperren, per Kabel anschließen, „Diesem Computer vertrauen“ bestätigen.
- **Bei Signierfehlern:** wie oben (Xcode, Konten, Zertifikate). Für diesen Weg reicht das Zertifikat „Apple Development“.
