// Bereitet das iOS-Projekt (Ordner ios/, entsteht mit "npx cap add ios") für TestFlight und den App Store vor.
// Läuft auf dem Mac. Kann beliebig oft ausgeführt werden (ändert nur, was noch fehlt).
//  1. App-Symbol (1024 x 1024, ohne Transparenz) einsetzen
//  2. Verschlüsselungsangabe setzen (die App nutzt nur Standard-HTTPS), damit TestFlight nicht danach fragt
//  3. Nur Hochformat (die App ist ein Handy-Timer im Hochformat)
//  4. Nur iPhone (kein iPad), das spart iPad-Screenshots und iPad-Prüfung im Store
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ios = process.env.IOS_DIR || join(root, 'ios');
const icon = join(root, 'ios-assets', 'AppIcon-1024.png');
const setDir = join(ios, 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const plistPath = join(ios, 'App', 'App', 'Info.plist');
const pbxPath = join(ios, 'App', 'App.xcodeproj', 'project.pbxproj');
let problems = 0;
const say = (m) => console.log(m);
const warn = (m) => {
  problems++;
  console.error('WARNUNG:', m);
};

if (!existsSync(ios)) {
  console.error('Der Ordner ios/ fehlt. Zuerst "npx cap add ios" ausführen.');
  process.exit(1);
}

// 1. App-Symbol
try {
  const contentsPath = join(setDir, 'Contents.json');
  const contents = JSON.parse(readFileSync(contentsPath, 'utf8'));
  const images = contents.images || [];
  const big = images.find((i) => i.size === '1024x1024') || images[0];
  if (!big) throw new Error('keine Bildeinträge in Contents.json');
  if (!big.filename) {
    big.filename = 'AppIcon-1024.png';
    writeFileSync(contentsPath, JSON.stringify(contents, null, 2) + '\n');
  }
  copyFileSync(icon, join(setDir, big.filename));
  say(`App-Symbol gesetzt: ${big.filename}`);
} catch (e) {
  warn(`App-Symbol nicht gesetzt (${e.message}). In Xcode unter Assets, AppIcon die Datei ios-assets/AppIcon-1024.png hineinziehen.`);
}

// 2. und 3. Info.plist
try {
  let plist = readFileSync(plistPath, 'utf8');
  const before = plist;
  if (!plist.includes('ITSAppUsesNonExemptEncryption')) {
    plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n</dict>\n</plist>\n');
    say('Verschlüsselungsangabe ergänzt (ITSAppUsesNonExemptEncryption = false)');
  }
  // 2b. Werbung (AdMob): App-ID und Googles Kennung für die Zuordnung von Anzeigen. Ohne die App-ID stürzt die Werbe-Bibliothek beim Start ab.
  // Hier steht die eigene AdMob-App-ID des Betreibers (AdMob, Apps, Nonstop Boxing). Der Werbeblock steht als AD_REWARDED_ID in app.js.
  const ADMOB_APP_ID = 'ca-app-pub-6801495414031100~1462772700';
  if (!plist.includes('GADApplicationIdentifier')) {
    plist = plist.replace(
      /<\/dict>\s*<\/plist>\s*$/,
      `\t<key>GADApplicationIdentifier</key>\n\t<string>${ADMOB_APP_ID}</string>\n\t<key>SKAdNetworkItems</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>cstr6suwn9.skadnetwork</string>\n\t\t</dict>\n\t</array>\n</dict>\n</plist>\n`
    );
    say('Werbung vorbereitet (GADApplicationIdentifier, SKAdNetworkItems)');
  } else if (!plist.includes(`<string>${ADMOB_APP_ID}</string>`)) {
    // Ein früherer Lauf hat eine andere App-ID eingetragen (z. B. Googles Test-ID): ersetzen
    plist = plist.replace(/(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${ADMOB_APP_ID}$2`);
    say('AdMob-App-ID in der Info.plist aktualisiert');
  }
  // 2c. Tracking-Abfrage (App Tracking Transparency): Version 1.0 hat keine Werbung und fragt nicht nach Tracking.
  // Der Schlüssel NSUserTrackingUsageDescription verlangt bei App Store Connect eine Tracking-Angabe im App-Datenschutz (sonst scheitert das Einreichen).
  // Deshalb wird er entfernt, solange ATT_AKTIV false ist. Für Version 1.1 mit Werbung (AD_ENABLED = true in app.js) hier auf true setzen.
  const ATT_AKTIV = false;
  const ATT_TEXT = 'Mit deiner Erlaubnis zeigt dir die App Werbung, die besser zu dir passt. Ohne Erlaubnis läuft trotzdem Werbung, nur nicht auf dich zugeschnitten.';
  if (ATT_AKTIV && !plist.includes('NSUserTrackingUsageDescription')) {
    plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>NSUserTrackingUsageDescription</key>\n\t<string>${ATT_TEXT}</string>\n</dict>\n</plist>\n`);
    say('Text für die Tracking-Abfrage ergänzt (NSUserTrackingUsageDescription)');
  } else if (!ATT_AKTIV && plist.includes('NSUserTrackingUsageDescription')) {
    plist = plist.replace(/\s*<key>NSUserTrackingUsageDescription<\/key>\s*<string>[^<]*<\/string>/, '');
    say('Text für die Tracking-Abfrage entfernt (Version ohne Werbung)');
  }
  const portrait ='<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>';
  const re = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/;
  const found = plist.match(re);
  if (found && /Landscape/.test(found[0])) {
    plist = plist.replace(re, portrait);
    say('Hochformat festgelegt');
  }
  if (plist !== before) writeFileSync(plistPath, plist);
  else say('Info.plist war schon angepasst');
} catch (e) {
  warn(`Info.plist nicht angepasst (${e.message}).`);
}

// 4. Nur iPhone
try {
  let pbx = readFileSync(pbxPath, 'utf8');
  if (/TARGETED_DEVICE_FAMILY = "1,2";/.test(pbx)) {
    pbx = pbx.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, 'TARGETED_DEVICE_FAMILY = 1;');
    writeFileSync(pbxPath, pbx);
    say('Nur iPhone festgelegt');
  } else {
    say('Gerätefamilie schon angepasst oder anders gesetzt');
  }
} catch (e) {
  warn(`Gerätefamilie nicht angepasst (${e.message}).`);
}

console.log(problems ? `Fertig mit ${problems} Warnung(en).` : 'Fertig.');
process.exit(problems ? 2 : 0);
