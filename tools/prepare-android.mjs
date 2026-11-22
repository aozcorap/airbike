// Bereitet das Android-Projekt (Ordner android/, entsteht mit "npx cap add android") vor. Läuft auf dem Mac, kann beliebig oft ausgeführt werden.
//  1. App-Symbol (aus ios-assets/AppIcon-1024.png) in allen Größen, auch als anpassbares Symbol (Vordergrund auf dunklem Grund)
//  2. Nur Hochformat
//  3. Erlaubnis für Mitteilungen (Android 13 und neuer) für die Erinnerungen
//  4. Werbung (AdMob): App-ID eintragen. Ohne App-ID stürzt die Werbe-Bibliothek ab. Hier steht noch Googles Test-ID, solange es keine eigene Android-App in AdMob gibt.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = process.env.ANDROID_DIR || join(root, 'android');
const icon = join(root, 'ios-assets', 'AppIcon-1024.png');
const res = join(android, 'app', 'src', 'main', 'res');
const manifestPath = join(android, 'app', 'src', 'main', 'AndroidManifest.xml');
const BG = '0B0D12'; // Hintergrundfarbe des Symbols
const ADMOB_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713'; // Googles Test-ID; später durch die eigene Android-App-ID aus AdMob ersetzen
let problems = 0;
const say = (m) => console.log(m);
const warn = (m) => {
  problems++;
  console.error('WARNUNG:', m);
};

if (!existsSync(android)) {
  console.error('Der Ordner android/ fehlt. Zuerst "npx cap add android" ausführen.');
  process.exit(1);
}

// 1. Symbole
try {
  const tmp = join(root, 'build', 'android-icon');
  mkdirSync(tmp, { recursive: true });
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [dpi, px] of Object.entries(sizes)) {
    const dir = join(res, `mipmap-${dpi}`);
    // Altes Symbol (Quadrat und Kreis): das Bild ist schon quadratisch und dunkel, Android rundet selbst ab
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      execFileSync('sips', ['-z', String(px), String(px), icon, '--out', join(dir, name)], { stdio: 'ignore' });
    }
    // Vordergrund des anpassbaren Symbols: 108 dp, davon sichtbar nur die mittleren 66 %. Das Symbol wird auf etwa 62 % verkleinert und mit dem Hintergrundton aufgefüllt.
    const fg = px * 2.25; // 108 dp bei dieser Dichte
    const inner = Math.round(fg * 0.62);
    const small = join(tmp, `fg-${dpi}.png`);
    execFileSync('sips', ['-z', String(inner), String(inner), icon, '--out', small], { stdio: 'ignore' });
    execFileSync('sips', ['--padToHeightWidth', String(fg), String(fg), '--padColor', BG, small, '--out', join(dir, 'ic_launcher_foreground.png')], { stdio: 'ignore' });
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#${BG}</color>\n</resources>\n`);
  say('App-Symbol gesetzt');
} catch (e) {
  warn(`App-Symbol nicht gesetzt (${e.message}).`);
}

// 2. bis 4. AndroidManifest.xml
try {
  let m = readFileSync(manifestPath, 'utf8');
  const before = m;
  if (!m.includes('android:screenOrientation')) {
    m = m.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:screenOrientation="portrait"');
    say('Hochformat festgelegt');
  }
  if (!m.includes('POST_NOTIFICATIONS')) {
    m = m.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
    say('Erlaubnis für Mitteilungen ergänzt');
  }
  if (!m.includes('com.google.android.gms.ads.APPLICATION_ID')) {
    m = m.replace('<activity', `<meta-data\n            android:name="com.google.android.gms.ads.APPLICATION_ID"\n            android:value="${ADMOB_ANDROID_APP_ID}" />\n\n        <activity`);
    say('AdMob-App-ID (Test-ID) eingetragen');
  }
  if (m !== before) writeFileSync(manifestPath, m);
  else say('AndroidManifest.xml war schon angepasst');
} catch (e) {
  warn(`AndroidManifest.xml nicht angepasst (${e.message}).`);
}

// 5. Version: versionName aus APP_VERSION, versionCode aus APP_BUILD (Google Play verlangt bei jedem Upload eine größere Zahl)
try {
  const gradlePath = join(android, 'app', 'build.gradle');
  const app = readFileSync(join(root, 'app.js'), 'utf8');
  const name = /const APP_VERSION = '([0-9.]+)'/.exec(app)?.[1];
  const code = /const APP_BUILD = (\d+);/.exec(app)?.[1];
  if (existsSync(gradlePath) && name && code) {
    let g = readFileSync(gradlePath, 'utf8');
    const before = g;
    g = g.replace(/versionName\s+"[^"]*"/, `versionName "${name}"`).replace(/versionCode\s+\d+/, `versionCode ${code}`);
    if (g !== before) {
      writeFileSync(gradlePath, g);
      say(`Version gesetzt: ${name} (Code ${code})`);
    }
  }
} catch (e) {
  warn(`Version nicht gesetzt (${e.message}).`);
}

console.log(problems ? `Fertig mit ${problems} Warnung(en).` : 'Fertig.');
process.exit(problems ? 2 : 0);
