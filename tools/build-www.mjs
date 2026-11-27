// Baut den Ordner "www" für die App-Hülle (Capacitor): nur die Dateien, die die App zum Laufen braucht.
// Dieselbe Auswahl wie in .github/workflows/pages.yml, aber ohne Service Worker und ohne Trailer-Material.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const DATEIEN = ['index.html', 'splash.js', 'styles.css', 'app.js', 'data.js', 'plan.js', 'cloud.js', 'legal.js', 'config.js', 'manifest.webmanifest', 'vendor', 'icons', 'img', 'video/start.mp4'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let fehlt = false;
for (const f of DATEIEN) {
  const von = join(root, f);
  if (!existsSync(von)) {
    console.error('Fehlt:', f);
    fehlt = true;
    continue;
  }
  const nach = join(out, f);
  mkdirSync(dirname(nach), { recursive: true });
  cpSync(von, nach, { recursive: true });
}
if (fehlt) process.exit(1);
console.log('www fertig:', DATEIEN.length, 'Einträge');
