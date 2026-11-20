#!/bin/bash
# Baut Nonstop Boxing für iOS und lädt es zu App Store Connect (TestFlight) hoch.
# Läuft auf dem Mac. Voraussetzungen: Xcode, in Xcode das Apple-Konto angemeldet, "npx cap add ios" ist schon gelaufen.
# Nicht auf einem echten Mac getestet (Stand 20.11.2026). Bei einem Fehler den Text der letzten Zeilen weitergeben.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD="$(date +%y%m%d%H%M)" # Build-Nummer aus Datum und Uhrzeit, wird bei jedem Upload größer (Apple verlangt das)
echo "== Build-Nummer $BUILD"

echo "== App-Dateien ins iOS-Projekt kopieren"
npm run sync

echo "== iOS-Projekt vorbereiten (Symbol, Hochformat, nur iPhone)"
node tools/prepare-ios.mjs || echo "Hinweis: Das Vorbereiten meldete Warnungen, siehe oben. Es geht trotzdem weiter."

echo "== Archiv bauen (dauert einige Minuten)"
rm -rf build/App.xcarchive
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/App.xcarchive \
  CURRENT_PROJECT_VERSION="$BUILD" -allowProvisioningUpdates archive

echo "== Zu App Store Connect hochladen"
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist tools/ExportOptions.plist -allowProvisioningUpdates

echo "== Fertig. In App Store Connect unter TestFlight erscheint der Build nach der Verarbeitung (einige Minuten)."
