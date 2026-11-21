#!/bin/bash
# Baut die Test-App für Android und installiert sie auf dem verbundenen Android-Handy oder dem gestarteten Emulator.
# Aufruf: npm run android:test
# Voraussetzungen (einmalig): Android Studio (brew install --cask android-studio, einmal öffnen und den Assistenten durchklicken) und Java 21 (brew install openjdk@21).
set -e
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME_ANDROID:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
PAKET="de.ozcorapci.nonstopboxing"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Java 21 fehlt. Bitte ausführen: brew install openjdk@21"; exit 1
fi
if [ ! -d android ]; then
  echo "== Android-Projekt anlegen"; npx cap add android
fi

echo "== Web-Dateien übernehmen"; npm run sync
echo "== Projekt vorbereiten (Symbol, Hochformat, Mitteilungen, Werbe-ID)"; node tools/prepare-android.mjs
echo "== App bauen (dauert beim ersten Mal einige Minuten)"; (cd android && ./gradlew assembleDebug)

APK="android/app/build/outputs/apk/debug/app-debug.apk"
GERAETE=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$GERAETE" ]; then
  echo "Kein Android-Gerät gefunden. Die App ist gebaut: $APK"
  echo "Handy per USB anschließen (Entwickleroptionen, USB-Debugging) oder den Emulator in Android Studio starten, dann den Befehl wiederholen."
  exit 0
fi
for G in $GERAETE; do
  echo "== Installieren auf $G"; "$ADB" -s "$G" install -r "$APK"
  "$ADB" -s "$G" shell monkey -p "$PAKET" 1 >/dev/null 2>&1 || echo "Die App ließ sich nicht starten. Bitte von Hand öffnen."
done
echo "== Fertig. Die App ist auf dem Gerät aktualisiert."
