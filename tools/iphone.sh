#!/bin/bash
# Baut Nonstop Boxing und installiert die App direkt auf dem iPhone (ohne TestFlight, ohne App Store).
# Läuft auf dem Mac. Voraussetzungen: Xcode, das iPhone ist bei Apple als Gerät eingetragen (ist es), mit dem Mac gekoppelt, entsperrt und per Kabel oder im selben WLAN erreichbar.
# Aufruf: npm run ios:iphone
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE="de.ozcorapci.nonstopboxing"

echo "== iPhone suchen"
JSON="$(mktemp)"
trap 'rm -f "$JSON"' EXIT
xcrun devicectl list devices --json-output "$JSON" >/dev/null 2>&1 || true
GERAET="$(node -e '
const fs = require("fs");
try {
  const liste = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).result.devices;
  const d = liste.find((x) => x.hardwareProperties && x.hardwareProperties.platform === "iOS" && x.hardwareProperties.reality === "physical");
  if (d) console.log(d.hardwareProperties.udid + "\t" + ((d.deviceProperties && d.deviceProperties.name) || "iPhone"));
} catch (e) {}
' "$JSON")"
if [ -z "$GERAET" ]; then
  echo "Kein iPhone gefunden. Bitte das iPhone entsperren, per Kabel anschließen und 'Diesem Computer vertrauen' bestätigen."
  exit 1
fi
UDID="${GERAET%%$'\t'*}"
NAME="${GERAET#*$'\t'}"
echo "   gefunden: $NAME"

echo "== App-Dateien ins iOS-Projekt kopieren"
npm run sync

echo "== iOS-Projekt vorbereiten (Symbol, Hochformat, nur iPhone, Werbung)"
node tools/prepare-ios.mjs || echo "Hinweis: Das Vorbereiten meldete Warnungen, siehe oben. Es geht trotzdem weiter."

echo "== Für das iPhone bauen (dauert einige Minuten)"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$UDID" -derivedDataPath build/iphone -allowProvisioningUpdates build

APP="build/iphone/Build/Products/Debug-iphoneos/App.app"
if [ ! -d "$APP" ]; then
  echo "Die gebaute App wurde nicht gefunden: $APP"
  exit 1
fi

echo "== Auf dem iPhone installieren"
xcrun devicectl device install app --device "$UDID" "$APP"

echo "== App starten"
if ! xcrun devicectl device process launch --device "$UDID" "$BUNDLE"; then
  echo "Die App ist installiert, ließ sich aber nicht starten (iPhone gesperrt?). Bitte von Hand öffnen."
fi

echo "== Fertig. Die App ist auf dem iPhone aktualisiert."
