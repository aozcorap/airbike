// Kleine Prüfung vor jedem Veröffentlichen und vor jedem Store-Build: npm run pruefen
//  1. APP_BUILD in app.js und CACHE in sw.js haben dieselbe Zahl (sonst fehlt der Hinweis „Neu laden“ oder er erscheint dauernd)
//  2. Jede Datei aus der Offline-Liste FILES in sw.js gibt es wirklich
//  3. APP_VERSION steht in app.js und hat die Form 1.1 oder 1.1.1
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'app.js'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
let fehler = 0;
const bad = (m) => {
  fehler++;
  console.error('FEHLER:', m);
};

const build = /const APP_BUILD = (\d+);/.exec(app)?.[1];
const cache = /const CACHE = 'redline-v(\d+)'/.exec(sw)?.[1];
if (!build) bad('APP_BUILD in app.js nicht gefunden.');
if (!cache) bad('CACHE in sw.js nicht gefunden.');
if (build && cache && build !== cache) bad(`APP_BUILD (${build}) und CACHE (${cache}) sind nicht gleich.`);

const version = /const APP_VERSION = '([^']*)'/.exec(app)?.[1];
if (!version || !/^\d+\.\d+(\.\d+)?$/.test(version)) bad(`APP_VERSION fehlt oder hat eine falsche Form (${version || 'nicht gefunden'}).`);

const liste = /const FILES = \[([\s\S]*?)\];/.exec(sw)?.[1] || '';
const dateien = [...liste.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== './');
if (!dateien.length) bad('Die Liste FILES in sw.js ist leer oder nicht lesbar.');
for (const f of dateien) if (!existsSync(join(root, f))) bad(`Die Datei ${f} aus sw.js FILES gibt es nicht.`);

if (fehler) {
  console.error(`${fehler} Fehler.`);
  process.exit(1);
}
console.log(`In Ordnung: Build ${build}, Version ${version}, ${dateien.length} Dateien in der Offline-Liste.`);
