import { PHASES, PROFILES, RECOVERY_OPTIONS, TEST_SESSION, TEST_PAUSE_SECS, weekOrder as weekOrderRaw, ageBand, flatten, sessionBlocks as sessionBlocksRaw, totalSecs, fmtSecs, resolveTarget } from './data.js';
import * as cloud from './cloud.js';
import { legalImprint } from './legal.js'; // Impressum steht in eigener Datei (Kontaktdaten nicht in app.js)
import { buildPlan, parseDay, sessionDate, tooCloseToFight, startOfDay, addDays, mondayOf, planStartMonday, DAY } from './plan.js';

/* ---------------- Zustand ---------------- */
const KEY = 'redline.v1';
const DEFAULTS = {
  maxW: 0,
  startDate: '',
  fightDate: '',
  planBase: '', // eingefrorener Planstart (Montag als Datum), damit der Plan nicht jeden Tag wandert
  freq: 3,
  maxWDate: '',
  sprints: [],
  rounds: 3,
  roundMin: 0,
  done: {},
  days: { s1: 1, rec: 3, s2: 4, s3: 6 },
  time: '18:00',
  when: '', // wann man trainiert: morgens, mittags, abends (leer = frühere Einstellung: Erinnerung am Trainingstag zur Uhrzeit)
  age: 0,
  notify: false,
  recOpt: 'opt1',
  profile: 'elite',
  reports: {},
  onboarded: false,
};

// Trainingszeit → Zeitpunkt der Erinnerung. before = am Vorabend, at = Uhrzeit der Erinnerung, time = Uhrzeit des Trainings (Kalender-Datei)
const TRAIN_WHEN = {
  morgens: { name: 'Morgens', time: '07:00', before: true, at: [19, 0], lead: 'Morgen früh', tip: 'Plane den Termin ein.' },
  mittags: { name: 'Mittags', time: '12:00', before: true, at: [18, 0], lead: 'Morgen Mittag', tip: 'Plane den Termin ein.' },
  abends: { name: 'Abends', time: '18:00', before: false, at: [8, 0], lead: 'Heute Abend', tip: 'Halte dir den Termin frei.' },
};
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw, days: { ...DEFAULTS.days, ...(raw.days || {}) }, done: raw.done || {} };
  } catch {
    return { ...DEFAULTS, days: { ...DEFAULTS.days }, done: {} };
  }
}
let state = load();
function save(localOnly = false) {
  const corrected = enforceProfile();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Speicher blockiert (z. B. privater Modus) – App läuft trotzdem weiter */
  }
  if ((!localOnly || corrected) && typeof account !== 'undefined' && account) {
    writeSync({ dirty: true });
    schedulePush();
  }
}

// App-Hülle (iPhone-App): Dort fehlen Web-Funktionen wie Datei-Download und Benachrichtigung, sie laufen über Capacitor-Pakete.
// In der Web-Version ist window.Capacitor nicht vorhanden, dann bleibt alles wie bisher.
function isNativeApp() {
  return Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}
function nativePlugin(name) {
  return (isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
}

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
// Kennen wir das Geburtsjahr (noch) nicht, gilt die vorsichtigste Klasse, damit niemand versehentlich einen zu harten Plan bekommt
const ageUnknown = () => typeof account !== 'undefined' && Boolean(account) && !account.birthYear;
const profile = () => {
  const key = ageUnknown() ? 'u14' : PROFILES[state.profile] ? state.profile : 'elite';
  return { key, ...PROFILES[key] };
};
// Erwachsene (Klasse „Elite“): Wattwerte nach Alter in 5- bis 10-Jahres-Stufen angepasst (siehe AGE_BANDS in data.js)
const ageBandNow = () => {
  const y = typeof account !== 'undefined' && account && account.birthYear;
  if (!y || profile().key !== 'elite') return null;
  return ageBand(new Date().getFullYear() - y - 1);
};
const ctx = () => {
  const p = profile();
  const band = ageBandNow();
  return { maxW: Number(state.maxW) || 0, cap: p.wattCapPct && p.wattCapPct < 100 ? p.wattCapPct : 0, ageFactor: band ? band.pct / 100 : 1 };
};
// Der Wochentag einer Einheit richtet sich nach ihrer Stelle in der Woche (Einheit 1, 2, 3, Aktive Erholung), nicht nach ihrer Nummer im Grundplan
const dayKeyOf = new Map();
function weekOrderBase(w) {
  const list = weekOrderRaw(w, profile().hardPerWeek || 3, userFreq());
  let h = 0;
  list.forEach((s) => dayKeyOf.set(s.id, s.type === 'recovery' ? 'rec' : ['s1', 's2', 's3'][h++]));
  return list;
}
const weekOrder = (w) => weekOrderBase(w).filter((s) => !tooCloseToFight(sessionDate(w, dayOf(s)), plan().fight));
const fmtRounds = () => Math.max(3, Math.min(12, Number(state.rounds) || 3));
const fmtRoundSecs = () => (state.roundMin ? (Number(state.roundMin) === 2 ? 120 : 180) : profile().roundSecs || 180);
const formatLabel = () => `${fmtRounds()} Runden à ${fmtRoundSecs() / 60} Minuten`;
const sessionBlocks = (session, rec) => sessionBlocksRaw(session, rec, profile(), { rounds: fmtRounds(), roundSecs: fmtRoundSecs() });
// Letzten Fehler der App merken, damit er einer Meldung beigelegt werden kann
let lastError = '';
window.addEventListener('error', (e) => {
  lastError = `${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`.slice(0, 300);
});
window.addEventListener('unhandledrejection', (e) => {
  lastError = String((e.reason && e.reason.message) || e.reason).slice(0, 300);
});
let lastRoute = '#/';
let fb = { kind: 'fehler', text: '', sent: false, busy: false };

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');

/* ---------------- Hilfsfunktionen ---------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const userFreq = () => Math.max(1, Math.min(Number(state.freq) || 3, 3)); // Einheiten pro Woche insgesamt, so wie gewählt
const effFreq = () => Math.min(userFreq(), profile().hardPerWeek || 3); // davon harte Einheiten
const wochen = (n) => `${n} ${n === 1 ? 'Woche' : 'Wochen'}`;
let planCache = { key: '', value: null };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Plan einfrieren: Der Plan beginnt an dem Montag, an dem er angelegt wurde, und wandert danach nicht mehr
function freezePlan() {
  state.planBase = state.fightDate ? ymd(planStartMonday(new Date())) : '';
}
function plan() {
  // Konten ohne gespeicherten Planstart (vor Version 86): Der Plan bleibt so, wie er in dieser Woche ist (Montag der laufenden Woche)
  if (state.fightDate && !parseDay(state.planBase)) {
    state.planBase = ymd(mondayOf(startOfDay(new Date())));
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* Speicher blockiert */
    }
  }
  const key = [state.fightDate, state.startDate, state.planBase, effFreq(), userFreq(), new Date().toDateString()].join('|');
  if (planCache.key !== key) {
    dayKeyOf.clear();
    planCache = { key, value: buildPlan({ today: new Date(), fightDate: state.fightDate, startDate: state.startDate, freq: effFreq(), base: state.fightDate ? state.planBase : '' }) };
  }
  // Den Plan gibt es erst mit Kampftermin (oder Startdatum) UND Test-Watt (Wunsch des Betreibers, 23.11.2026). Vorher: leer, mit Hinweis was fehlt.
  const v = planCache.value;
  return v.status === 'ok' && !planReady() ? { ...v, weeks: [], waiting: true } : v;
}
const planReady = () => Boolean((state.fightDate || parseDay(state.startDate)) && Number(state.maxW) > 0);
function findInPlan(id) {
  if (id === 'test') return { session: TEST_SESSION, week: { n: 0, phase: 'Test' } };
  for (const w of plan().weeks) {
    const s = [...w.sessions, w.recovery].find((x) => x.id === id);
    if (s) return { session: s, week: w };
  }
  return null;
}
function allSessions() {
  return plan().weeks.flatMap((w) => weekOrder(w).map((s) => ({ s, w })));
}
// Erledigte Einheiten im aktuellen Plan (einheitlich für Startseite, Fortschritt und Einführung)
const doneInPlan = () => allSessions().filter(({ s }) => isDone(s.id)).length;
function sessionSecs(session) {
  const blocks = sessionBlocks(session, state.recOpt);
  return totalSecs(flatten({ ...session, blocks }, ctx())) + 10;
}
const mins = (secs) => `${Math.round(secs / 60)} min`;
const isDone = (id) => Boolean(state.done[id]);
const dayOf = (session) => {
  if (!dayKeyOf.has(session.id)) plan().weeks.forEach((w) => weekOrderBase(w));
  const key = dayKeyOf.get(session.id) || (session.type === 'recovery' ? 'rec' : ['s1', 's2', 's3'].find((_, i) => session.id.endsWith('s' + (i + 1))));
  return state.days[key];
};
const fmtDate = (d) => d.toLocaleDateString('de-DE');

function currentWeek() {
  const today = startOfDay(new Date());
  return plan().weeks.find((w) => w.monday && today >= w.monday && today < addDays(w.monday, 7)) || null;
}
function nextSession() {
  return allSessions().find(({ s }) => !isDone(s.id)) || null;
}
function daysToFight() {
  const f = plan().fight;
  return f ? Math.round((f - startOfDay(new Date())) / DAY) : null;
}
function planSummary() {
  const p = plan();
  const freq = userFreq();
  if (p.status === 'invalid') return 'Das Datum ist ungültig.';
  if (p.status === 'past') return 'Der Kampftermin liegt in der Vergangenheit. Bitte ein neues Datum eintragen.';
  if (p.waiting) {
    const hasDate = Boolean(p.fight || parseDay(state.startDate));
    if (hasDate) return 'Dein Plan entsteht, sobald du den Fitness-Test gemacht hast. Daraus berechnet die App deine Watt-Ziele.';
    return Number(state.maxW) > 0 ? 'Trage deinen Kampftermin ein. Dann stellt die App den Plan darauf ein.' : 'Dein Plan entsteht, sobald du deinen Kampftermin eingetragen und den Fitness-Test gemacht hast.';
  }
  if (p.mode === 'none') return 'Trage deinen Kampftermin ein. Dann stellt die App den Plan darauf ein.';
  let txt = '';
  if (p.mode === 'fight') {
    txt = `${p.fight ? `Noch ${daysToFight()} Tage bis zum Kampf. ` : ''}Dein Plan hat ${wochen(p.weeks.length)} mit ${freq}× Training pro Woche.`;
    if (p.startsIn > 0) txt += ` Er beginnt am ${fmtDate(p.weeks[0].monday)}, vorher ist noch Zeit.`;
    if (p.compressed) txt += ' Der Plan ist gekürzt. Wie gekürzt wird, ist eine Annahme und noch nicht von einem Fachtrainer geprüft.';
    if (p.weeks.length === 1) txt += ' Das ist sehr kurzfristig: Es bleibt nur die Kampfwoche. Einheiten an Tagen, die schon vorbei sind, kannst du auslassen.';
  } else {
    txt = `Dein Plan hat ${wochen(p.weeks.length)} mit ${freq}× Training pro Woche.`;
    const sd = parseDay(state.startDate);
    if (sd && sd < startOfDay(new Date())) txt += ' Das Startdatum liegt in der Vergangenheit, die ersten Einheiten sind schon vorbei.';
  }
  if (freq < 3) txt += ' Bei weniger als 3 Einheiten pro Woche wählt die App die wichtigsten aus. Die Auswahl ist eine Annahme.';
  if (freq > effFreq()) txt += ` In deiner Altersklasse sind höchstens ${effFreq()} harte Einheiten pro Woche vorgesehen, die übrige ist eine Aktive Erholung.`;
  return txt;
}

function blockTargets(b) {
  const c = ctx();
  const seen = new Map();
  for (let i = 1; i <= b.repeat; i++) {
    const steps = typeof b.steps === 'function' ? b.steps(i) : b.steps;
    steps
      .filter((st) => st.kind !== 'rest')
      .forEach((st) => {
        const main = resolveTarget(st, c).main;
        if (!/\d W$/.test(main) && main !== 'MAXIMAL') return;
        const key = `${st.label}|${main}`;
        if (!seen.has(key)) seen.set(key, { label: st.label, main, reps: [] });
        if (!seen.get(key).reps.includes(i)) seen.get(key).reps.push(i);
      });
  }
  return [...seen.values()].map((t) => {
    const all = t.reps.length === b.repeat;
    const consecutive = t.reps[t.reps.length - 1] - t.reps[0] + 1 === t.reps.length;
    const when = all ? '' : consecutive ? ` (Wdh. ${t.reps[0]}–${t.reps[t.reps.length - 1]})` : ` (Wdh. ${t.reps.join(', ')})`;
    return `<tr><td>${esc(t.label === b.title ? 'Zielbereich' : t.label)}${when}</td><td><b>${esc(t.main)}</b></td></tr>`;
  });
}

function stepPill(st) {
  const t = resolveTarget(st, ctx());
  const dur = fmtSecs(st.secs);
  let sub;
  if (st.kind === 'rest') sub = /locker|rollen/i.test(st.label) ? 'locker' : 'Pause';
  else if (t.main === 'MAXIMAL') sub = 'Maximal';
  else if (t.main && t.main !== 'ARBEIT') sub = t.main;
  else sub = st.label;
  return `<div class="pill ${st.kind}"><b>${esc(dur)}</b><span>${esc(sub)}</span></div>`;
}

// Fasst bei langen Abfolgen ein sich wiederholendes Paar (z. B. 20 s Arbeit, 10 s Pause) zusammen.
function stepPills(steps) {
  const same = (x, y) => x.kind === y.kind && x.secs === y.secs && x.label === y.label;
  if (steps.length >= 6 && same(steps[0], steps[2]) && same(steps[1], steps[3])) {
    let k = 1;
    while (steps[2 * k + 1] && same(steps[0], steps[2 * k]) && same(steps[1], steps[2 * k + 1])) k++;
    const rest = steps.slice(2 * k);
    return `<div class="group"><span class="rep sm">${k}×</span>${stepPill(steps[0])}${stepPill(steps[1])}</div>${rest.length ? `<div class="pgrid">${rest.map(stepPill).join('')}</div>` : ''}`;
  }
  return `<div class="pgrid">${steps.map(stepPill).join('')}</div>`; // zwei Spalten (Arbeit | Pause), damit alle Blöcke sauber untereinander stehen
}

function stepCard(b, no, isRec) {
  const warm = /warm-up/i.test(b.title);
  const type = isRec ? 'easy' : warm ? 'warm' : b.title === 'Pause vor Hauptteil' ? 'rest' : 'main';
  const badge = { easy: 'Locker', warm: 'Aufwärmen', rest: 'Pause', main: 'Hauptteil' }[type];
  const steps = typeof b.steps === 'function' ? b.steps(1) : b.steps;
  const rows = typeof b.steps === 'function' ? blockTargets(b) : [];
  return `<section class="step ${type}">
    <div class="step-head"><span class="step-no">${no}</span><h3>${esc(b.title)}</h3><span class="badge">${badge}</span></div>
    <div class="pills"><span class="rep">${b.repeat}×</span>${stepPills(steps)}</div>
    ${rows.length ? `<table class="targets"><tbody>${rows.join('')}</tbody></table>` : ''}
    ${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}
  </section>`;
}

/* Test-Watt = Durchschnitt der drei Sprint-Höchstwerte */
const sprintInputs = (pre) =>
  `<div class="sprint-grid">${[1, 2, 3]
    .map((i) => `<div><label for="${pre}${i}" class="small" style="margin:0 0 4px">Sprint ${i}</label><input id="${pre}${i}" type="number" inputmode="numeric" min="100" max="3000" step="1" placeholder="Watt" aria-label="Höchster Wert Sprint ${i} in Watt"></div>`)
    .join('')}</div>`;
function saveSprints(pre) {
  const raw = [1, 2, 3].map((i) => Number(document.getElementById(pre + i)?.value));
  if (raw.some((v) => !(v >= 100 && v <= 3000))) {
    alert('Bitte gib alle drei Werte zwischen 100 und 3000 Watt ein.');
    return false;
  }
  const vals = raw.map(Math.round);
  state.sprints = vals;
  state.maxW = Math.round(vals.reduce((x, y) => x + y, 0) / 3);
  state.maxWDate = new Date().toISOString();
  save();
  return true;
}
// Wer seinen Test-Watt schon kennt, trägt nur den Durchschnitt ein
const wattInput = (pre) =>
  `<label for="${pre}W" class="small" style="margin:0 0 4px">Dein Test-Watt (Durchschnitt aus drei Sprints)</label><input id="${pre}W" type="number" inputmode="numeric" min="100" max="3000" step="1" placeholder="Watt" aria-label="Dein Test-Watt in Watt">`;
function saveTestWatt(pre) {
  const v = Number(document.getElementById(pre + 'W')?.value);
  if (!(v >= 100 && v <= 3000)) {
    alert('Bitte gib einen Wert zwischen 100 und 3000 Watt ein.');
    return false;
  }
  state.maxW = Math.round(v);
  state.sprints = [];
  state.maxWDate = new Date().toISOString();
  save();
  return true;
}
const testWattLine = () =>
  state.maxW
    ? `<p>Dein Test-Watt: <b>${state.maxW} W</b>${state.sprints && state.sprints.length === 3 ? ` (Durchschnitt aus ${state.sprints.join(', ')} W)` : ''}${state.maxWDate ? ` · ${fmtDate(new Date(state.maxWDate))}` : ''}</p>`
    : '';

/* ---------------- Ansichten ---------------- */
const BRAND_MARK = `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a6e"/><stop offset="1" stop-color="#c7122b"/></linearGradient></defs><circle cx="60" cy="64" r="44" stroke="#262c3c" stroke-width="12"/><path d="M16 64 A44 44 0 0 1 104 64" stroke="url(#bm)" stroke-width="12" stroke-linecap="round"/><path d="M60 64 L88 36" stroke="#fff" stroke-width="8" stroke-linecap="round"/><circle cx="60" cy="64" r="10" fill="#fff"/></svg>`;
const APP_NAME_A = 'NONSTOP ';
const APP_NAME_B = 'BOXING';
const brandBar = () => `<div class="brandbar">${BRAND_MARK}<b>${APP_NAME_A}<i>${APP_NAME_B}</i></b></div>`;
const HERO_PHOTO = '<img class="art-photo" src="img/hero.jpg" alt="" data-hide-on-error>';
// Fehlendes Bild still entfernen (statt Inline-Handler, damit die Content-Security-Policy keine Inline-Skripte erlauben muss)
document.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-hide-on-error')) t.remove();
  },
  true,
);
const WHEEL_ART = (() => {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const x1 = (160 + Math.cos(a) * 16).toFixed(1);
    const y1 = (160 + Math.sin(a) * 16).toFixed(1);
    const x2 = (160 + Math.cos(a) * 118).toFixed(1);
    const y2 = (160 + Math.sin(a) * 118).toFixed(1);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  return `<svg class="art" viewBox="0 0 320 320" fill="none" aria-hidden="true"><defs><radialGradient id="wg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff2d46" stop-opacity=".38"/><stop offset="1" stop-color="#ff2d46" stop-opacity="0"/></radialGradient></defs><circle cx="160" cy="160" r="156" fill="url(#wg)"/><g stroke="#fff" stroke-opacity=".13" stroke-width="1.5">${spokes}</g><circle cx="160" cy="160" r="118" stroke="#ff2d46" stroke-opacity=".7" stroke-width="3"/><circle cx="160" cy="160" r="104" stroke="#fff" stroke-opacity=".1" stroke-width="2"/><circle cx="160" cy="160" r="16" fill="#ff2d46" fill-opacity=".85"/></svg>`;
})();


// Altersklasse aus dem Geburtsjahr der Registrierung (Jugendschutz: nur die eigene oder eine mildere Klasse wählbar)
const PROFILE_ORDER = Object.keys(PROFILES);
const ageClassKey = () => {
  const y = account && account.birthYear;
  if (!y) return null;
  const age = new Date().getFullYear() - y - 1; // ohne Geburtsmonat im Zweifel das jüngere Alter (streng)
  return age <= 14 ? 'u14' : age <= 16 ? 'u16' : age <= 18 ? 'u18' : 'elite';
};
function allowedProfiles() {
  const own = ageClassKey();
  if (!own) return PROFILE_ORDER;
  return PROFILE_ORDER.filter((k) => PROFILE_ORDER.indexOf(k) >= PROFILE_ORDER.indexOf(own));
}
function enforceProfile() {
  const own = typeof account !== 'undefined' ? ageClassKey() : null;
  if (!own || allowedProfiles().includes(state.profile)) return false;
  state.profile = own;
  return true;
}
// Geburtsjahr kommt vom Server (Tabelle profiles, vom Nutzer nicht änderbar), nicht aus den änderbaren Kontodaten
async function loadBirthYear(user, offline) {
  const s = readSync();
  const cached = s.birthOwner === user.id ? Number(s.birth) || 0 : 0;
  if (offline) return cached;
  try {
    const { data } = await withTimeout(cloud.client.from('profiles').select('birth_year').eq('user_id', user.id).maybeSingle(), 4000);
    const y = Number(data && data.birth_year) || 0;
    if (y) {
      if (y !== cached) writeSync({ birth: y, birthOwner: user.id });
      return y;
    }
  } catch {
    /* offline oder Server nicht erreichbar: zwischengespeicherten Wert nutzen */
  }
  return cached;
}

// Startkarte (Wunsch des Betreibers, 27.11.2026): Solange Kampftermin (oder Startdatum) oder Fitness-Test fehlen, zeigt die App auf Heute und im Plan
// eine einzige Karte mit den zwei Schritten und einem Knopf zum nächsten offenen Schritt. Danach erscheint der Plan.
function startCard() {
  const p = plan();
  if (!state.onboarded || planReady() || p.status === 'past' || p.status === 'invalid') return '';
  const start = parseDay(state.startDate);
  const hasFight = Boolean(p.fight); // nur ein echter Kampftermin bekommt das Häkchen; ein Startdatum (z. B. nach „Ich habe keinen Kampftermin mehr“) ist kein Kampftermin
  const hasWatt = Number(state.maxW) > 0;
  const step = (done, title, text) => `<li class="${done ? 'done' : ''}"><b>${title}</b><br><span class="muted small">${text}</span></li>`;
  const dateText = hasFight ? `Kampf am ${fmtDate(p.fight)}` : start ? `Ohne Kampftermin startet dein Plan am ${fmtDate(start)}. Mit Kampftermin richtet er sich nach dem Kampf.` : 'Der Plan richtet sich nach deinem Kampf.';
  const open = (hasFight ? 0 : 1) + (hasWatt ? 0 : 1);
  return `<div class="card hero setupcta"><span class="kicker">So startest du</span><h2 style="margin:6px 0 4px">${open === 1 ? 'Noch ein Schritt bis zu deinem Plan' : 'Noch zwei Schritte bis zu deinem Plan'}</h2>
    <ul class="fsteps">${step(hasFight, hasFight ? 'Kampftermin eingetragen' : 'Kampftermin eintragen', dateText)}${step(hasWatt, hasWatt ? 'Fitness-Test gemacht' : 'Fitness-Test machen', 'Drei Sprints à 10 Sekunden, etwa 10 Minuten. Daraus berechnet die App deine Watt-Ziele.')}</ul>
    <a class="btn primary" style="margin-top:12px" href="${hasFight ? '#/test' : '#/settings'}">${hasFight ? 'Weiter: Fitness-Test' : 'Weiter: Kampftermin'}</a>${!hasFight && start && !hasWatt ? '<a class="btn" style="margin-top:8px" href="#/test">Ohne Kampftermin: Fitness-Test machen</a>' : ''}</div>`;
}

function maxWatNotice() {
  const age = state.maxWDate ? Math.round((startOfDay(new Date()) - startOfDay(new Date(state.maxWDate))) / DAY) : 0;
  if (!state.maxW) {
    return `<a class="card link accent" href="#/test"><span class="kicker">Zuerst</span><h3 style="margin-top:6px">Fitness-Test machen</h3><p class="muted small" style="margin:4px 0 0">Aus deinem Test-Watt berechnet die App alle Watt-Ziele. Dauert etwa 10 Minuten.</p></a>`;
  }
  if (state.maxWDate && age >= 28) {
    return `<div class="card"><span class="chip amber">Test wiederholen</span><p class="muted small" style="margin:8px 0 0">Dein letzter Test ist ${age} Tage alt. <a href="#/test"><u>Test-Watt neu messen</u></a></p></div>`;
  }
  return '';
}

// Trainer, der sich nur als Verein registriert hat (keine Einrichtung für Privatpersonen gemacht): Startseite zeigt nur den Verein
const trainerOnlyHome = () => Boolean(account && clubInfo.loaded && clubInfo.trainer && !account.isAdmin && !state.onboarded);
function viewHome() {
  if (trainerOnlyHome()) {
    return `${brandBar()}<h1 class="sr">Heute</h1>${clubHomeHtml()}
    <p class="muted small center" style="margin-top:16px">Du trainierst auch selbst? Dann richte dein eigenes Training ein. Dafür brauchst du kein Abo, es ist in deinem Paket enthalten.</p>
    <button class="ghost block" data-act="ob-replay">Eigenes Training einrichten</button>`;
  }
  const p = plan();
  const next = nextSession();
  const cw = currentWeek();
  let todayHtml = '';
  if (cw) {
    const todayIso = ((new Date().getDay() + 6) % 7) + 1;
    const hit = weekOrder(cw).find((s) => Number(dayOf(s)) === todayIso && !tooCloseToFight(sessionDate(cw, dayOf(s)), p.fight));
    if (hit) {
      todayHtml = `<a class="card link" href="#/s/${hit.id}"><span class="chip ${isDone(hit.id) ? 'ok' : 'amber'}">Heute laut Plan${isDone(hit.id) ? ' · erledigt' : ''}</span><h3 style="margin-top:8px">${esc(hit.title)}</h3><span class="muted small">Woche ${cw.n}</span></a>`;
    }
  }

  const sc = startCard();
  let fightInfo = '';
  if (p.status === 'ok' && p.fight) {
    const d = daysToFight();
    fightInfo = `<div class="banner">${HERO_PHOTO}${WHEEL_ART}<div class="banner-in"><span class="kicker">Kampf · ${fmtDate(p.fight)}</span>
      <div class="bignum">${d === 0 ? 'Heute' : d}</div><div class="bannerlbl">${d === 0 ? 'Kampftag' : d === 1 ? 'Tag bis zum Kampf' : 'Tage bis zum Kampf'}</div>
      <p class="muted small" style="margin:10px 0 0">${p.waiting ? 'Dein Plan entsteht, sobald du den Fitness-Test gemacht hast.' : `Dein Plan: ${wochen(p.weeks.length)}, ${userFreq()}× pro Woche · ${formatLabel()}${p.compressed ? ' · gekürzt (Annahme, <a href="#/plan"><u>Details</u></a>)' : ''}${p.weeks.length === 1 ? ' · sehr kurzfristig, nur die Kampfwoche' : ''}`}</p></div></div>`;
  } else if (p.status === 'past' || p.status === 'invalid') {
    fightInfo = `<div class="notice">${esc(planSummary())} <a href="#/settings">Einstellungen</a></div>`;
  } else if (!sc) {
    fightInfo = `<div class="banner">${HERO_PHOTO}${WHEEL_ART}<div class="banner-in"><span class="kicker">Kampfvorbereitung</span>
      <div class="bannerlbl" style="font-size:28px;line-height:1.1;margin:6px 0 4px;color:#fff;letter-spacing:.04em">Dein Plan bis zum Kampf</div>
      <p class="muted small">Trage deinen Kampftermin ein. Dann stellt die App den Plan darauf ein.</p>
      <a class="btn primary" href="#/settings">Kampftermin eintragen</a></div></div>`;
  }

  let nextHtml;
  if (p.status !== 'ok' || !p.weeks.length) {
    nextHtml = '';
  } else if (!allSessions().length) {
    nextHtml = `<div class="card hero"><span class="kicker">Kampfwoche</span><h2 style="margin-top:6px">Keine Einheit mehr vor dem Kampf</h2><p class="muted">Ruh dich aus, iss und trink gut und schlaf viel.</p></div>`;
  } else if (!next) {
    nextHtml = `<div class="card hero"><span class="kicker">Geschafft</span><h2 style="margin-top:6px">Plan abgeschlossen</h2><p class="muted">Alle Einheiten sind erledigt.</p></div>`;
  } else {
    const { s, w } = next;
    nextHtml = `<a class="card hero link" href="#/s/${s.id}">
      <span class="kicker">Nächste Einheit · Woche ${w.n}</span>
      <h2 style="margin:6px 0 4px">${esc(s.title)}</h2>
      <p class="muted" style="margin:0 0 12px">${esc(s.focus)}</p>
      <span class="chip red">${'ca. ' + mins(sessionSecs(s))}</span> <span class="chip">${esc(w.phase)}</span>
    </a>`;
  }

  const doneCount = doneInPlan();
  const total = allSessions().length;
  const week = cw || (next ? next.w : p.weeks[p.weeks.length - 1]);
  const list = week
    ? `<h2>Woche ${week.n} · ${esc(week.phase)}</h2>` +
      weekOrder(week)
        .map((s) => `<a class="card link row" href="#/s/${s.id}"><span class="check ${isDone(s.id) ? 'done' : ''}">${isDone(s.id) ? '✓' : ''}</span><span class="grow"><b>${esc(s.title)}</b><br><span class="muted small">${DAY_NAMES[Number(dayOf(s)) - 1]} · ${mins(sessionSecs(s))}</span></span></a>`)
        .join('')
    : '';

  const run = readRun();
  const runFound = run && Date.now() - run.t < RUN_MAX_AGE && (run.i > 0 || run.elapsed > 5000) ? findInPlan(run.id) : null;
  const runHtml = runFound ? `<a class="card link accent" href="#/run/${esc(run.id)}"><span class="kicker">Unterbrochen</span><h3 style="margin-top:6px">Training fortsetzen</h3><p class="muted small" style="margin:4px 0 0">${esc(runFound.session.title)}</p></a>` : '';

  return `${brandBar()}<h1 class="sr">Kampfvorbereitung</h1>
  ${clubInfo.trainer ? clubHomeHtml() : ''}${ageUnknown() ? '<div class="notice"><b>Dein Alter konnte nicht geladen werden.</b> Bis es geladen ist, gilt der vorsichtigste Plan (U13–U14 und jünger). Prüfe deine Verbindung und öffne die App neu.</div>' : ''}${fightInfo}
  ${total ? `<p class="muted small">${doneCount} von ${total} Einheiten erledigt</p>` : ''}
  ${runHtml}${sc || maxWatNotice()}${clubInfo.trainer ? '' : clubHomeHtml()}${todayHtml}${nextHtml}${list}`;
}

function viewTest() {
  return `<a href="#/" class="back">← Zurück</a><span class="kicker" style="display:block;margin-top:8px">Grundlage für deine Watt-Ziele</span><h1>Fitness-Test</h1>
  ${testWattLine()}
  <p class="muted">Du fährst drei maximale Sprints von je 10 Sekunden. Der Durchschnitt deiner drei Höchstwerte ist dein Test-Watt und die Grundlage für alle Watt-Ziele im Plan.</p>
  <h2>So läuft es ab</h2>
  <ol class="plain">
    <li>Zuerst wärmst du dich etwa 4 Minuten auf.</li>
    <li>Dann kommen 3 Sprints von je 10 Sekunden mit voller Kraft, dazwischen ${TEST_PAUSE_SECS / 60} Minute Pause.</li>
    <li>Merke dir nach jedem Sprint den höchsten Wert auf der Anzeige deines Bikes.</li>
    <li>Am Ende trägst du die drei Werte ein. Die App rechnet den Durchschnitt.</li>
  </ol>
  <div class="notice">Mache den Test nur ausgeruht und aufgewärmt, nicht nach einem harten Trainingstag. Bei Schwindel, Schmerz oder Atemnot sofort abbrechen. Der Wert schwankt mit der Tagesform. Wiederhole den Test alle paar Wochen.</div>
  <a class="btn primary block" href="#/run/test" data-act="start">Test starten</a>
  <h2>Test-Watt schon bekannt?</h2>
  <p class="muted small">Dann trage hier nur den Durchschnitt deiner drei Sprints ein.</p>
  ${wattInput('mi')}
  <button class="primary block" style="margin-top:12px" data-act="savemax">Speichern</button>`;
}

function weekRange(w) {
  if (!w.monday) return '';
  const end = addDays(w.monday, 6);
  return `${w.monday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}–${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
}

function viewPlan() {
  const p = plan();
  let html = `<h1>Trainingsplan</h1><p class="muted">${esc(planSummary())}</p>`;
  const sc = startCard();
  if (sc) return html + sc;
  if (p.waiting) {
    const hasDate = Boolean(p.fight || parseDay(state.startDate));
    const hasWatt = Number(state.maxW) > 0;
    const step = (done, title, text) => `<li class="${done ? 'done' : ''}"><b>${title}</b><br><span class="muted small">${text}</span></li>`;
    return `${html}<div class="card"><ul class="fsteps">${step(Boolean(p.fight), 'Kampftermin eintragen', hasDate && !p.fight ? 'Ohne Kampftermin startet der Plan an deinem Startdatum. Mit Kampftermin stellt die App ihn rückwärts vom Kampf aus ein.' : 'Dann stellt die App den Plan rückwärts vom Kampf aus ein.')}${step(hasWatt, 'Fitness-Test machen', 'Drei Sprints à 10 Sekunden. Daraus berechnet die App deine Watt-Ziele.')}</ul></div>
    ${hasDate ? '' : '<a class="btn primary" style="display:block;text-align:center" href="#/settings">Kampftermin eintragen</a>'}${hasWatt ? '' : '<a class="btn primary" style="display:block;text-align:center;margin-top:10px" href="#/test">Fitness-Test machen</a>'}`;
  }
  if (p.status !== 'ok') return html;
  let phaseNo = 0;
  PHASES.forEach((ph) => {
    const weeks = p.weeks.filter((w) => w.tpl >= ph.weeks[0] && w.tpl <= ph.weeks[1]);
    if (!weeks.length) return;
    phaseNo += 1;
    html += `<div class="phase-dot"><span class="kicker">Phase ${phaseNo}</span><b>${esc(ph.name)}</b><div class="muted small">${esc(ph.text)}</div></div>`;
    weeks.forEach((w) => {
      const list = weekOrder(w);
      const done = list.filter((s) => isDone(s.id)).length;
      const level = { Niedrig: 1, Mittel: 2, 'Mittel–Hoch': 3, Hoch: 4 }[w.load];
      html += `<a class="card link" href="#/week/${w.n}"><div class="week-head"><h3>Woche ${w.n}</h3><span class="muted small">${weekRange(w)}${weekRange(w) ? ' · ' : ''}${list.length ? `${done}/${list.length} erledigt` : 'Kampfwoche, keine Einheit'}</span></div>
        <div class="muted small">Belastung: ${esc(w.load)}</div>
        <div class="load-bar" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</div></a>`;
    });
  });
  return `${html}<p class="muted small center" style="margin-top:22px">Kampf abgesagt oder neu anfangen? <a href="#/settings"><u>Plan zurücksetzen</u></a></p>`;
}

// Plan zurücksetzen (Wunsch des Betreibers, 23.11.2026): Kampf abgesagt oder neu anfangen. Löscht Kampftermin, Startdatum, Test-Watt, erledigte Einheiten und den Stand der Einheiten
// (den der Trainer sieht). Bleibt: Konto, Einstellungen (Runden, Tage, Erinnerungen, Altersklasse), Meldungen.
function resetPlan() {
  if (!confirm('Plan wirklich zurücksetzen?\n\nGelöscht werden: Kampftermin, Test-Watt, alle erledigten Einheiten und der Stand deiner Einheiten (auch für deinen Trainer).\n\nBleiben: dein Konto, deine Einstellungen (Runden, Trainingstage, Erinnerungen) und deine Meldungen.\n\nDanach trägst du einen neuen Kampftermin ein und machst den Fitness-Test neu.')) return;
  state.fightDate = '';
  state.startDate = '';
  state.planBase = '';
  state.maxW = 0;
  state.maxWDate = '';
  state.sprints = [];
  state.done = {};
  state.runs = {};
  delete state.ti;
  writeRun(null);
  planCache = { key: '', value: null };
  save();
  scheduleReminder();
  updateTrainerInfo();
  toast('Plan zurückgesetzt');
  location.hash = '#/';
  route();
}

function sessionRow(w, s) {
  const d = sessionDate(w, dayOf(s));
  return `<a class="card link row" href="#/s/${s.id}"><span class="check ${isDone(s.id) ? 'done' : ''}">${isDone(s.id) ? '✓' : ''}</span><span class="grow"><b>${esc(s.title)}</b><br><span class="muted small">${DAY_NAMES[Number(dayOf(s)) - 1]}${d ? ' ' + d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''} · ${mins(sessionSecs(s))}</span></span></a>`;
}

function viewWeek(n) {
  const w = plan().weeks[n - 1];
  if (!w) return notFound();
  const list = weekOrder(w).map((s) => sessionRow(w, s)).join('');
  const phases = PHASES.filter((ph) => plan().weeks.some((x) => x.tpl >= ph.weeks[0] && x.tpl <= ph.weeks[1]));
  const pi = phases.findIndex((ph) => w.tpl >= ph.weeks[0] && w.tpl <= ph.weeks[1]);
  const level = { Niedrig: 1, Mittel: 2, 'Mittel–Hoch': 3, Hoch: 4 }[w.load];
  return `<a href="#/plan" class="back">← Plan</a>
  <div class="phase-dot" style="margin-top:8px"><span class="kicker">Phase ${pi + 1}</span><b>${esc(w.phase)}</b><div class="muted small">${esc(w.phaseText)}</div></div>
  <h1>Woche ${w.n}</h1>
  ${weekRange(w) ? `<p class="muted small">${weekRange(w)}</p>` : ''}
  <div class="card"><div class="row between"><span class="muted">Belastung</span><b>${esc(w.load)}</b></div>
    <div class="load-bar" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</div></div>
  <h2>Einheiten</h2>
  ${list}
  ${list ? '' : '<p class="muted">In dieser Woche steht keine Einheit mehr an. Ruh dich aus.</p>'}
  ${w.tpl === 10 ? '<p class="muted small">In der Kampfwoche steht nur eine leichte Sprint-Einheit an, damit du frisch in den Kampf gehst.</p>' : ''}`;
}

function viewSession(id) {
  if (id === 'test') return viewTest();
  const found = findInPlan(id);
  if (!found) return notFound();
  const { session, week } = found;
  const isRec = session.type === 'recovery';
  const blocks = sessionBlocks(session, state.recOpt);
  const secs = sessionSecs(session);
  const segs = flatten({ ...session, blocks }, ctx());

  const optBtns = isRec
    ? `<h2>Variante</h2><div class="btn-row" style="flex-direction:column">${Object.entries(RECOVERY_OPTIONS)
        .map(([k, o]) => `<button class="${state.recOpt === k ? 'primary' : ''}" data-act="opt" data-key="${k}">${esc(o.name)}</button>`)
        .join('')}</div>`
    : '';

  const blockHtml = blocks.map((b, i) => stepCard(b, i + 1, isRec)).join('');

  const needMax = !state.maxW && segs.some((s) => s.target.sub.includes('Mache den Fitness-Test'));
  const done = isDone(id);

  return `<a href="#/week/${week.n}" class="back">← Woche ${week.n}</a>
  <span class="kicker" style="display:block;margin-top:8px">Woche ${week.n} · ${esc(week.phase)}</span>
  <h1>${esc(session.title)}</h1>
  <p class="muted">${esc(session.focus)}</p>
  <p><span class="chip red">${isRec ? 'ca. ' + mins(secs) : 'ca. ' + mins(secs) + ' inkl. Warm-up'}</span> ${done ? '<span class="chip ok">erledigt</span>' : ''}</p>
  ${needMax ? `<div class="notice"><b>Test-Watt fehlt.</b> Ohne ihn siehst du nur Prozentwerte. <a href="#/test"><u>Mache den Fitness-Test</u></a> oder trage deinen Test-Watt in den <a href="#/settings"><u>Einstellungen</u></a> ein.</div>` : ''}
  ${optBtns}
  <h2>Ablauf</h2>${blockHtml}
  <div class="btn-row" style="position:sticky;bottom:calc(76px + env(safe-area-inset-bottom))">
    <a class="btn primary" href="#/run/${id}" data-act="start">Starten</a>
  </div>
  <div class="btn-row">
    ${done ? `<button class="ghost" data-act="unmark" data-id="${id}">Als offen markieren</button>` : `<button class="ghost" data-act="markdone" data-id="${id}">Als erledigt markieren</button>`}
  </div>`;
}

// Meine Meldungen: Status und Antworten kommen öffentlich von GitHub (Issues), nichts davon liegt in einer eigenen Datenbank
const GH_API = 'https://api.github.com/repos/aozcorap/airbike';
let reportInfo = {};
let reportsUnseen = false;
async function fetchReport(n) {
  const h = { Accept: 'application/vnd.github+json' };
  const [ri, rc] = await Promise.all([fetch(`${GH_API}/issues/${n}`, { headers: h }), fetch(`${GH_API}/issues/${n}/comments?per_page=50`, { headers: h })]);
  if (!ri.ok) throw new Error('GitHub ' + ri.status);
  const issue = await ri.json();
  const comments = rc.ok ? await rc.json() : [];
  const owner = comments
    .filter((c) => ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c.author_association))
    .map((c) => ({ body: String(c.body || '').replace(/\n*---\s*\n_Generated by[\s\S]*$/, '').trim().slice(0, 1500), at: c.created_at }));
  return { state: issue.state, reason: issue.state_reason || '', owner };
}
function setReportsDot(on) {
  reportsUnseen = on;
  document.querySelectorAll('#nav .navdot').forEach((d) => {
    d.hidden = !on;
  });
}
async function loadReports(markSeen = true) {
  const reps = state.reports || {};
  const keys = Object.keys(reps).sort((a, b) => Number(b) - Number(a)).slice(0, 10);
  let unseen = false;
  let changed = false;
  await Promise.all(
    keys.map(async (n) => {
      const r = reps[n];
      if (!markSeen && r.st === 'closed') return; // schon gesehen und erledigt: nicht erneut abfragen
      try {
        const info = await fetchReport(n);
        info.isNew = info.state !== r.st || info.owner.length > (r.c || 0);
        reportInfo[n] = info;
        if (info.isNew) unseen = true;
        if (markSeen && info.isNew) {
          state.reports[n] = { ...r, st: info.state, c: info.owner.length };
          changed = true;
        }
      } catch {
        reportInfo[n] = { error: true };
      }
    }),
  );
  if (markSeen) {
    if (changed) save();
    setReportsDot(false);
  } else setReportsDot(unseen);
  if (markSeen && location.hash === '#/reports') {
    $app.innerHTML = viewReports();
  }
}
const checkReports = () => (Object.keys(state.reports || {}).length ? loadReports(false) : setReportsDot(false));

function viewReports() {
  const reps = state.reports || {};
  const keys = Object.keys(reps).sort((a, b) => Number(b) - Number(a));
  const kind = { fehler: 'Fehler', idee: 'Idee', frage: 'Frage' };
  const cards = keys
    .map((n) => {
      const r = reps[n];
      const info = reportInfo[n];
      let status = '<span class="chip">wird geladen …</span>';
      let body = '';
      if (info && info.error) status = '<span class="chip amber">Stand gerade nicht abrufbar</span>';
      else if (info) {
        status = info.state === 'closed' ? (info.reason === 'not_planned' ? '<span class="chip">Geschlossen</span>' : '<span class="chip ok">Gelöst</span>') : '<span class="chip red">Offen</span>';
        body = info.owner.map((c) => `<div class="reply"><span class="muted small">Antwort vom ${esc(new Date(c.at).toLocaleDateString('de-DE'))}</span><p>${esc(c.body)}</p></div>`).join('');
        if (!info.owner.length && info.state === 'open') body = '<p class="muted small" style="margin:8px 0 0">Noch keine Antwort. Wir schauen es uns an.</p>';
      }
      return `<div class="card"><div class="row between"><span class="muted small">${esc(kind[r.k] || 'Meldung')} · #${esc(n)} · ${esc(new Date(r.at).toLocaleDateString('de-DE'))}</span>${info && info.isNew ? '<span class="newchip">Neu</span>' : ''}</div>
      <h3 style="margin:6px 0 8px">${esc(r.t || 'Meldung')}</h3>${status}${body}</div>`;
    })
    .join('');
  return `<a href="#/more" class="back">← Mehr</a><h1>Meine Meldungen</h1>
  <p class="muted">Hier siehst du, wie es mit deinen Meldungen weitergeht. Deine Meldungen und die Antworten sind öffentlich einsehbar.</p>
  ${cards || '<p class="muted">Du hast noch nichts gemeldet.</p>'}`;
}

function viewFeedback() {
  if (!account) return `<a href="#/more" class="back">← Mehr</a><h1>Fehler melden</h1><p>Zum Melden musst du angemeldet sein.</p>`;
  if (fb.sent) {
    return `<a href="#/more" class="back">← Mehr</a><div class="card hero" style="margin-top:16px"><span class="kicker">Angekommen</span><h2 style="margin:6px 0 8px">Danke für deine Meldung</h2>
    <p class="muted">Wir schauen sie uns an. Antworten und den Stand findest du unter <a href="#/reports"><u>Mehr → Meine Meldungen</u></a>.</p>
    <button class="primary block" data-act="fb-again">Noch etwas melden</button></div>`;
  }
  const kinds = [['fehler', 'Fehler'], ['idee', 'Idee'], ['frage', 'Frage']];
  return `<a href="#/more" class="back">← Mehr</a><h1>Fehler melden</h1>
  <p class="muted">Etwas funktioniert nicht, ist unklar oder du hast eine Idee? Schreib es hier. Das hilft uns, die App besser zu machen.</p>
  <label>Worum geht es?</label>
  <div class="seg">${kinds.map(([k, l]) => `<button class="opt sm ${fb.kind === k ? 'sel' : ''}" data-act="fb-kind" data-k="${k}"><b>${l}</b></button>`).join('')}</div>
  <label for="fbText">${fb.kind === 'fehler' ? 'Was ist passiert?' : fb.kind === 'idee' ? 'Was wünschst du dir?' : 'Was möchtest du wissen?'}</label>
  <textarea id="fbText" rows="6" maxlength="4000" placeholder="${fb.kind === 'fehler' ? 'Was hast du gemacht, was hast du erwartet, was ist stattdessen passiert?' : 'Schreib in eigenen Worten.'}">${esc(fb.text)}</textarea>
  <p class="muted small"><b>Deine Meldung wird öffentlich auf GitHub veröffentlicht</b>, ohne deinen Namen und ohne deine E-Mail-Adresse. Wir schicken automatisch mit: die Seite, auf der du warst, die App-Version, die Kennung deines Browsers und Geräts, die Bildschirmgröße, die letzte Fehlermeldung der App und deine Einstellungen (z. B. Altersklasse, Trainingshäufigkeit). Bitte schreibe keine privaten Daten in den Text.</p>
  <button class="primary block" data-act="fb-send" ${fb.busy ? 'disabled' : ''}>${fb.busy ? 'Wird gesendet …' : 'Absenden'}</button>`;
}

async function sendFeedbackNow() {
  const text = (document.getElementById('fbText')?.value || '').trim();
  fb.text = text;
  if (text.length < 10) {
    alert('Bitte beschreibe es in mindestens 10 Zeichen.');
    return;
  }
  if (!account) return;
  fb.busy = true;
  route();
  const row = {
    kind: fb.kind,
    message: text,
    page: String(lastRoute).slice(0, 200),
    app_build: APP_BUILD,
    device: String(navigator.userAgent).slice(0, 400),
    context: {
      profile: state.profile,
      freq: state.freq,
      rounds: state.rounds,
      roundMin: state.roundMin,
      hasTest: Boolean(state.maxW),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      standalone: Boolean(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)),
      online: navigator.onLine,
      lastError,
    },
  };
  let error = null;
  let data = null;
  try {
    ({ error, data } = await withTimeout(cloud.sendFeedback(row), 15000));
  } catch (e) {
    error = e || new Error('Zeitüberschreitung');
  }
  fb.busy = false;
  if (error) {
    alert(/Zu viele/.test(String(error.message)) ? 'Du hast gerade schon mehrere Meldungen gesendet. Bitte versuche es später noch einmal.' : 'Das Senden hat nicht geklappt. Prüfe dein Netz und versuche es noch einmal. Dein Text bleibt erhalten.');
    route();
    return;
  }
  fb.sent = true;
  if (data && data.issue) {
    fb.issue = data.issue;
    state.reports = { ...(state.reports || {}), [data.issue]: { k: fb.kind, t: text.split('\n')[0].slice(0, 60), at: new Date().toISOString(), st: 'open', c: 0 } };
    save();
  }
  toast('Danke, deine Meldung ist angekommen');
  route();
}

/* ---------------- Admin: Testuser und Nutzung (nur für Admins, die Datenbank prüft das) ---------------- */
let adminData = null;
let adminState = 'idle'; // idle, loading, ok, denied, error
const admWhen = (ts) => {
  if (!ts) return '–';
  const d = new Date(String(ts));
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
function adminHtml() {
  if (adminState === 'denied') return '<div class="notice">Kein Zugriff. Diese Ansicht ist nur für Admins.</div>';
  if (!adminData) {
    if (adminState === 'error') return '<div class="notice">Die Daten konnten nicht geladen werden. Prüfe deine Verbindung.</div><button class="ghost block" data-act="admin-refresh">Erneut versuchen</button>';
    return '<p class="muted">Lädt …</p>';
  }
  const s = adminData.summary || {};
  const n = (k) => esc(Number(s[k]) || 0);
  const tile = (label, big, sub) => `<div class="card adm-tile"><span class="muted small">${label}</span><b class="adm-v">${big}</b><span class="muted small">${sub}</span></div>`;
  const tone = { aktiv: 'ok', ruhig: 'amber', inaktiv: 'red' };
  const rows = (adminData.users || [])
    .map(
      (u) => `<tr><td>${esc(u.email || '')}</td><td><span class="chip ${tone[u.aktivitaet] || ''}">${esc(u.aktivitaet || '')}</span></td><td>${esc(Number(u.einheiten_erledigt) || 0)}</td><td>${u.test_watt ? esc(Number(u.test_watt)) : '–'}</td><td>${esc(Number(u.meldungen) || 0)}</td><td>${esc(admWhen(u.zuletzt_gespeichert))}</td><td>${esc(admWhen(u.letzte_anmeldung))}</td><td>${u.bestaetigt ? 'ja' : 'nein'}</td><td class="adm-act">${u.ist_admin || !u.user_id ? '<span class="muted small">Admin</span>' : `<button class="ghost adm-del" data-act="admin-del" data-id="${esc(u.user_id)}" data-mail="${esc(u.email || '')}">Löschen</button>`}</td></tr>`,
    )
    .join('');
  return `<p class="muted">Von ${n('konten_gesamt')} Konten sind ${n('bestaetigt')} bestätigt. In den letzten 7 Tagen waren ${n('aktiv_7_tage')} aktiv, insgesamt sind ${n('einheiten_gesamt')} Einheiten erledigt.</p>
  <div class="adm-tiles">
    ${tile('Konten', n('konten_gesamt'), `bestätigt ${n('bestaetigt')} · nie genutzt ${n('nie_genutzt')}`)}
    ${tile('Aktiv in 7 Tagen', n('aktiv_7_tage'), `in 3 Tagen ${n('aktiv_3_tage')}`)}
    ${tile('Einheiten erledigt', n('einheiten_gesamt'), `Konten mit mindestens einer ${n('mit_erledigter_einheit')}`)}
    ${tile('Mit Test-Watt', n('mit_test_watt'), `Einrichtung fertig ${n('einrichtung_fertig')}`)}
  </div>
  <h2>Alle Testuser</h2>
  <div class="adm-scroll"><table class="adm-table"><thead><tr><th>E-Mail</th><th>Status</th><th>Einheiten</th><th>Test-Watt</th><th>Meldungen</th><th>Zuletzt gespeichert</th><th>Letzte Anmeldung</th><th>Bestätigt</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9">Noch keine Konten.</td></tr>'}</tbody></table></div>
  <button class="ghost block" style="margin-top:14px" data-act="admin-refresh">Aktualisieren</button>
  <details class="muted small" style="margin-top:14px"><summary>Was bedeutet der Status?</summary>
    <p><b>aktiv</b>: in den letzten 3 Tagen etwas gespeichert. <b>ruhig</b>: bis 14 Tage her. <b>inaktiv</b>: länger her. <b>nie genutzt</b>: Konto ohne gespeicherte Daten.</p>
    <p>Die App speichert nur, wenn sich etwas ändert (Einheit abgehakt, Test gemacht, Einstellung geändert). Wer sie nur öffnet, taucht hier nicht auf. Die letzte Anmeldung ändert sich nur bei einer neuen Anmeldung per Code.</p>
    <p>Diese Seite zeigt E-Mail-Adressen. Keine Bildschirmfotos teilen.</p></details>`;
}
let adminBusy = false;
async function adminDelete(id, mail) {
  if (adminBusy || !id) return;
  if (!confirm(`Konto ${mail || ''} wirklich löschen?\n\nDas Konto und alle gespeicherten Daten dieses Nutzers werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.`)) return;
  adminBusy = true;
  try {
    const { error } = await withTimeout(cloud.adminDeleteUser(id), 12000);
    if (error) alert(/Kein Zugriff|42501/i.test(`${error.message || ''} ${error.code || ''}`) ? 'Kein Zugriff.' : /Admin|eigene/i.test(error.message || '') ? error.message : 'Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal.');
    else toast('Konto gelöscht');
  } catch {
    alert('Das Konto konnte nicht gelöscht werden. Prüfe deine Verbindung.');
  }
  adminBusy = false;
  loadAdmin();
}
// Vereine für den Admin: Auswahl eines Vereinsprofils, eigener Verein (Plätze, Codes, Test-Paket)
let adminClubs = null;
function adminClubsHtml() {
  if (!adminClubs) return '<h2>Vereine</h2><div class="card"><p class="muted" style="margin:0">Vereine laden …</p></div>';
  if (adminClubs === 'error') return '<h2>Vereine</h2><div class="notice">Die Vereine konnten nicht geladen werden.</div>';
  if (!adminClubs.length) return '<h2>Vereine</h2><div class="card"><b>Vereinsprofil ansehen</b><p class="muted small" style="margin:6px 0 0">Noch gibt es keine Vereine.</p></div>';
  const n = (v) => Number(v) || 0;
  const sum = (k) => adminClubs.reduce((a, c) => a + n(c[k]), 0);
  const pk = (x) => adminClubs.filter((c) => n(c.plaetze) === x).length;
  const tile = (label, big, sub) => `<div class="card adm-tile"><span class="muted small">${label}</span><b class="adm-v">${big}</b><span class="muted small">${sub}</span></div>`;
  const rows = adminClubs
    .map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.trainer || '–')}</td><td>${n(c.plaetze) ? `${n(c.plaetze)} Boxer` : 'kein Paket'}</td><td>${n(c.belegt)} von ${n(c.plaetze)}</td><td>${n(c.aktiv_7_tage)}</td><td>${n(c.einheiten)}</td><td>${esc(admWhen(c.zuletzt))}</td><td>${esc(admWhen(c.angelegt))}</td></tr>`)
    .join('');
  return `<h2>Vereine</h2>
  <div class="adm-tiles">
    ${tile('Vereine', n(adminClubs.length), `ohne Paket ${pk(0)}`)}
    ${tile('Pakete', `${pk(3)} · ${pk(5)} · ${pk(10)}`, '3er · 5er · 10er')}
    ${tile('Plätze belegt', `${sum('belegt')} von ${sum('plaetze')}`, 'alle Vereine')}
    ${tile('Aktiv in 7 Tagen', sum('aktiv_7_tage'), `Einheiten gesamt ${sum('einheiten')}`)}
  </div>
  <div class="adm-scroll" style="margin-top:12px"><table class="adm-table"><thead><tr><th>Verein</th><th>Trainer</th><th>Paket</th><th>Plätze belegt</th><th>Aktiv 7 Tage</th><th>Einheiten</th><th>Zuletzt aktiv</th><th>Angelegt</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="card" style="margin-top:12px"><label for="admClub" class="small" style="margin:0 0 4px"><b>Vereinsprofil ansehen</b></label>
  <select id="admClub" style="width:100%">${adminClubs.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${n(c.belegt)}/${n(c.plaetze)})</option>`).join('')}</select>
  <button class="primary block" style="margin-top:10px" data-act="adm-club-open">Ansehen</button></div>
  <h2>Privatkonten</h2>`;
}
async function loadAdminClubs() {
  try {
    const { data, error } = await withTimeout(cloud.adminClubs(), 12000);
    adminClubs = error ? 'error' : Array.isArray(data) ? data : [];
  } catch {
    adminClubs = 'error';
  }
  const el = document.getElementById('admClubs');
  if (el && location.hash === '#/admin') el.innerHTML = adminClubsHtml();
}
function viewAdmin() {
  return `<a href="#/profile" class="back">← Profil</a><h1>Admin</h1><div id="admClubs">${adminClubsHtml()}</div><div id="adminBody">${adminHtml()}</div>`;
}
// Vereinsprofil eines Vereins, nur lesend (Admin)
function viewClub(id) {
  if (!account || !account.isAdmin) return '<a href="#/profile" class="back">← Profil</a><h1>Vereinsprofil</h1><div class="notice">Kein Zugriff. Diese Ansicht ist nur für Admins.</div>';
  return `<a href="#/admin" class="back">← Admin</a><h1>Vereinsprofil</h1><p class="muted small" style="margin-top:-4px">Nur lesend, so sieht der Trainer seine Boxer.</p><div id="trBody">${trainerHtml()}</div>`;
}
async function loadClubView(id) {
  if (!account || !account.isAdmin || !/^[0-9a-f-]{36}$/i.test(String(id || ''))) return;
  if (!tr.data) tr.state = 'loading';
  try {
    const { data, error } = await withTimeout(cloud.adminClubOverview(id), 12000);
    if (error) throw error;
    tr.data = data || null;
    tr.state = 'ok';
  } catch {
    tr.state = 'error';
  }
  trRender();
}
async function loadAdmin() {
  if (!adminData) adminState = 'loading';
  try {
    const { data, error } = await withTimeout(cloud.adminOverview(), 12000);
    if (error) {
      adminData = null;
      adminState = /Kein Zugriff|42501|permission denied/i.test(`${error.message || ''} ${error.code || ''}`) ? 'denied' : 'error';
    } else {
      adminData = data;
      adminState = 'ok';
    }
  } catch {
    adminState = 'error';
  }
  if (location.hash === '#/admin') {
    const el = document.getElementById('adminBody');
    if (el) el.innerHTML = adminHtml();
  }
}

/* ---------------- Verein (Gym-Konto): Trainer legt Plätze an, Boxer lösen ihren Code ein ---------------- */
let gym = { state: 'idle', data: null, access: null, busy: false, msg: '' }; // state: idle, loading, ok, error
const gymErr = (error) => (error && error.code === 'P0001' && error.message ? error.message : 'Das hat nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal.');
// Text in die Zwischenablage legen (neuer Weg, sonst der alte über ein verstecktes Feld); true, wenn es geklappt hat
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const done = document.execCommand('copy');
      ta.remove();
      return done;
    } catch {
      return false;
    }
  }
}
function gymHtml() {
  if (gym.state === 'loading' || gym.state === 'idle') return '<p class="muted">Lädt …</p>';
  if (gym.state === 'error') return '<div class="notice">Die Daten konnten nicht geladen werden. Prüfe deine Verbindung.</div><button class="ghost block" data-act="gym-refresh">Erneut versuchen</button>';
  const msg = gym.msg ? `<div class="notice" role="alert">${esc(gym.msg)}</div>` : '';
  const d = gym.data;
  if (d) {
    const total = Number(d.plaetze_gesamt) || 0;
    const seats = d.plaetze || [];
    const probe = d.probe || ''; // ohne Paket: 'keine' (Testwoche nicht gestartet), 'laeuft' oder 'vorbei'
    const allowed = Number(d.plaetze_erlaubt) || 0;
    const testMs = d.test_bis ? new Date(d.test_bis).getTime() : 0;
    const tplaetze = Number(d.test_plaetze) || 0;
    const full = seats.length >= allowed;
    const rows = seats
      .map(
        (s) => `<div class="seat"><div class="seathead"><b>${esc(s.name)}</b><span class="chip ${s.belegt ? 'ok' : ''}">${s.belegt ? 'Eingelöst' : 'Noch nicht eingelöst'}</span></div><div class="coderow"><span class="code">${esc(s.code)}</span><button class="copybtn" data-act="gym-copy" data-code="${esc(s.code)}" aria-label="Code von ${esc(s.name)} kopieren"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="12" rx="2.2"/><path d="M15.5 5.5v-.3A1.7 1.7 0 0 0 13.8 3.5H6.2A1.7 1.7 0 0 0 4.5 5.2v9.6a1.7 1.7 0 0 0 1.7 1.7h.3"/></svg></button><button class="ghost seat-del" data-act="gym-del" data-id="${esc(s.id)}" data-name="${esc(s.name)}" aria-label="${esc(s.name)} löschen">Löschen</button></div>${s.belegt ? '' : `<button class="ghost block" style="margin-top:8px" data-act="gym-invite" data-code="${esc(s.code)}" data-name="${esc(s.name)}">Einladung kopieren</button>`}</div>`,
      )
      .join('');
    const redeemed = seats.filter((s) => s.belegt).length;
    const step = (done, title, text) => `<li class="${done ? 'done' : ''}"><b>${title}</b><br><span class="muted small">${text}</span></li>`;
    const guide =
      allowed && !redeemed
        ? `<div class="card"><h2 style="margin-top:0;font-size:20px">So geht es weiter</h2><ul class="fsteps">${step(false, 'Boxer anlegen', 'Schreibe den Namen und tippe auf „Boxer anlegen“.')}${step(false, 'Einladung schicken', 'Tippe neben dem Namen auf „Einladung kopieren“ und schicke den Text an den Boxer.')}${step(false, 'Boxer löst den Code ein', 'Er meldet sich als Privatperson an und trägt den Code ein. Dann siehst du seinen Stand.')}</ul></div>`
        : '';
    return `${msg}<div class="card"><div class="row between"><b>${esc(d.name)}</b><span class="chip ${total || probe === 'laeuft' ? 'ok' : 'amber'}">${total ? `Paket: ${total} Boxer` : probe === 'laeuft' ? `Testwoche: ${testDaysText(testMs)}` : probe === 'vorbei' ? 'Testwoche vorbei' : 'Noch kein Paket'}</span></div>
    <p class="muted small" style="margin:8px 0 0">${total ? `${seats.length} von ${total} Boxern angelegt, ${redeemed} haben ihren Code eingelöst. Du und deine Boxer trainieren ohne Werbung.` : probe === 'laeuft' ? `${seats.length} von ${tplaetze} Boxern angelegt, ${redeemed} haben ihren Code eingelöst. Du und deine Boxer trainieren in der Testwoche ohne Werbung. Danach brauchst du das Paket, sonst trainiert ihr mit Werbung oder Abo weiter. Die Codes bleiben gültig.` : probe === 'vorbei' ? 'Die Testwoche ist vorbei. Mit dem Paket trainieren du und deine Boxer wieder ohne Werbung, auch mit den bisherigen Codes. Bis dahin trainiert ihr mit Werbung oder Abo. Der Kauf der Pakete kommt mit der iPhone-App.' : 'Du hast noch keine Testwoche gestartet. Wähle ein Paket und teste es sieben Tage ohne Bezahlung.'}</p></div>
    ${probe === 'keine' ? `<div class="card"><h2 style="margin-top:0">Testwoche starten</h2><p class="muted small">Du und deine Boxer trainieren sieben Tage ohne Werbung. Danach brauchst du das Paket.</p><div class="btn-row">${[3, 5, 10].map((n) => `<button class="primary" data-act="gym-week" data-n="${n}" ${gym.busy ? 'disabled' : ''}>${n} Boxer</button>`).join('')}</div></div>` : ''}
    ${guide}
    ${seats.length ? `<div class="card seats">${rows}</div>` : ''}
    ${!total && payUi() ? `<div class="card"><h2 style="margin-top:0">Paket wählen</h2>${pkgBlockHtml('gym-pkg-buy', false)}</div>` : ''}
    <div class="card"><h2 style="margin-top:0">Neuer Boxer</h2>
    <p class="muted small">Jeder Boxer bekommt einen eigenen Code. Verlässt ein Boxer den Verein selbst, ist sein Platz wieder frei und hat einen neuen Code. Du kannst einen Boxer auch selbst löschen.</p>
    <label for="gymSeatName" class="small" style="margin:0 0 4px">Name des Boxers</label>
    <input id="gymSeatName" type="text" maxlength="60" autocomplete="off" placeholder="z. B. Lena" ${allowed && !full ? '' : 'disabled'}>
    <button class="primary block" style="margin-top:10px" data-act="gym-add" ${allowed && !full && !gym.busy ? '' : 'disabled'}>Boxer anlegen</button>
    ${total && full ? '<p class="muted small" style="margin-bottom:0">Alle Plätze im Paket sind vergeben. Lösche einen Boxer oder nimm ein größeres Paket.</p>' : ''}
    ${!total && probe === 'vorbei' ? '<p class="muted small" style="margin-bottom:0">Die Testwoche ist vorbei. Für weitere Boxer brauchst du das Paket.</p>' : ''}
    ${!total && probe === 'keine' ? '<p class="muted small" style="margin-bottom:0">Starte zuerst die Testwoche.</p>' : ''}
    ${!total && probe === 'laeuft' && full ? '<p class="muted small" style="margin-bottom:0">Alle Plätze im Testpaket sind vergeben.</p>' : ''}</div>
    ${account && account.isAdmin ? `<div class="card"><h2 style="margin-top:0">Test-Paket (nur für dich)</h2><p class="muted small">Ersetzt den Kauf, solange es ihn noch nicht gibt.</p><div class="btn-row">${[0, 3, 5, 10].map((n) => `<button class="ghost" data-act="gym-pkg" data-n="${n}" ${n === total ? 'aria-pressed="true"' : ''}>${n ? n + ' Boxer' : 'Kein Paket'}</button>`).join('')}</div><p class="muted small">Testwoche verschieben (nur ohne Paket). „Kein Paket“ setzt die Testwoche zurück.</p><div class="btn-row"><button class="ghost" data-act="gym-weekset" data-d="-1">Testwoche beenden</button><button class="ghost" data-act="gym-weekset" data-d="7">Neue 7 Tage</button></div></div>` : ''}`;
  }
  if (gym.access && gym.access.art === 'probe_vorbei') {
    return `${msg}<div class="card"><div class="row between"><b>${esc(gym.access.verein)}</b><span class="chip amber">Testwoche vorbei</span></div><p class="muted small" style="margin:8px 0 0">Die Testwoche deines Vereins ist vorbei. Du trainierst jetzt mit Werbung oder Abo, bis dein Trainer das Paket gekauft hat. Dein Code bleibt gültig und dein Fortschritt bleibt.</p></div>
    <div class="card"><h2 style="margin-top:0">Verein verlassen</h2><p class="muted small">Dein Trainer sieht dich danach nicht mehr. Dein Konto und dein Fortschritt bleiben. Du kannst später einen neuen Code einlösen.</p><button class="ghost block" data-act="gym-leave" ${gym.busy ? 'disabled' : ''}>Verein verlassen</button></div>`;
  }
  if (gym.access) {
    return `${msg}<div class="card"><div class="row between"><b>${esc(gym.access.verein)}</b><span class="chip ok">Dein Verein</span></div><p class="muted small" style="margin:8px 0 0">Du trainierst über den Platz deines Vereins, ohne Werbung. Verlässt du den Verein, endet der Zugang, dein Fortschritt bleibt.</p></div>
    <div class="card"><h2 style="margin-top:0">Verein verlassen</h2><p class="muted small">Dein Trainer sieht dich danach nicht mehr und du trainierst wieder mit Werbung. Dein Konto und dein Fortschritt bleiben. Du kannst später einen neuen Code einlösen.</p><button class="ghost block" data-act="gym-leave" ${gym.busy ? 'disabled' : ''}>Verein verlassen</button></div>`;
  }
  return `${msg}<div class="card"><h2 style="margin-top:0">Ich habe einen Code</h2>
  <p class="muted small">Dein Trainer hat dir einen Code gegeben? Trag ihn hier ein.</p>
  <label for="gymCode" class="small" style="margin:0 0 4px">Code</label>
  <input id="gymCode" type="text" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX">
  <button class="main block" style="margin-top:10px" data-act="gym-redeem" ${gym.busy ? 'disabled' : ''}>Code einlösen</button></div>
  <div class="card"><h2 style="margin-top:0">Ich bin Trainer</h2>
  <p class="muted small">Lege deinen Verein an und gib deinen Boxern je einen eigenen Code. Pakete gibt es für 3, 5 oder 10 Boxer.</p>
  ${
    payUi() && !(vorschau() && !testPay())
      ? pkgBlockHtml('gym-create-pkg', true)
      : `<label for="gymName" class="small" style="margin:0 0 4px">Name des Vereins</label>
  <input id="gymName" type="text" maxlength="60" autocomplete="off" placeholder="z. B. Boxclub Musterstadt">
  <button class="main block" style="margin-top:10px" data-act="gym-create" ${gym.busy ? 'disabled' : ''}>Verein anlegen</button>`
  }</div>`;
}
function viewVerein() {
  const back = account && account.isAdmin ? '<a href="#/admin" class="back">← Admin</a>' : '<a href="#/profile" class="back">← Profil</a>';
  if (!account) return `${back}<h1>Verein</h1><div class="notice">Bitte melde dich zuerst an.</div>`;
  return `${back}<h1 id="gymTitle">${clubInfo.trainer || gym.data ? 'Deine Boxer' : 'Verein'}</h1><div id="gymBody">${gymHtml()}</div>`;
}
function gymRender() {
  if (location.hash !== '#/verein') return;
  const el = document.getElementById('gymBody');
  if (el) el.innerHTML = gymHtml();
  const title = document.getElementById('gymTitle');
  if (title) title.textContent = gym.data ? 'Deine Boxer' : 'Verein'; // Überschrift passt sich an, sobald die Daten da sind
}
async function loadGym() {
  if (!account) return;
  if (!gym.data && !gym.access) gym.state = 'loading';
  try {
    const [g, a] = await withTimeout(Promise.all([cloud.gymLoad(), cloud.gymAccess()]), 12000);
    if (g.error || a.error) throw g.error || a.error;
    gym.data = g.data || null;
    gym.access = a.data || null;
    gym.state = 'ok';
    clubInfo = { loaded: true, access: gym.access, trainer: Boolean(gym.data), attention: clubInfo.attention || 0, ...clubSeats(gym.data) }; // Startseite zeigt den gleichen Stand
  } catch {
    gym.state = 'error';
  }
  gymRender();
}
// Führt eine Gym-Aktion aus und zeigt danach den neuen Stand (die Datenbank liefert ihn gleich mit)
async function gymDo(fn, okMsg) {
  if (gym.busy) return;
  gym.busy = true;
  gym.msg = '';
  const request = fn(); // zuerst abschicken (liest die Eingabefelder), dann die Ansicht neu zeichnen
  gymRender();
  try {
    const { data, error } = await withTimeout(request, 12000);
    if (error) gym.msg = gymErr(error);
    else if (data && data.fehler) gym.msg = String(data.fehler);
    else {
      if (okMsg) toast(okMsg);
      await loadGym();
    }
  } catch {
    gym.msg = gymErr(null);
  }
  gym.busy = false;
  gymRender();
}

/* ---------------- Trainer: Stand der Boxer auf den eigenen Plätzen (Konzept siehe OFFENE-PUNKTE.md) ---------------- */
let tr = { state: 'idle', data: null, open: '' };
const trNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const trDay = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // Form JJJJ-MM-TT
};
const trDayNum = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5 : NaN;
};
const trMS = (secs) => `${Math.floor(trNum(secs) / 60)}:${String(Math.round(trNum(secs) % 60)).padStart(2, '0')}`;
const trWhen = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '–' : new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
// Warum eine Einheit nicht als „voll trainiert“ gilt (leer = voll trainiert)
function trReasons(r) {
  const out = [];
  const plan = trNum(r.plan);
  const act = trNum(r.act);
  if (!r.fin) out.push(`abgebrochen nach ${trMS(act)} von ${trMS(plan)}`);
  else if (act < plan - 3) out.push(`nur ${trMS(act)} von ${trMS(plan)} gelaufen`);
  if (trNum(r.skip) > 0) out.push(`${trNum(r.skip)}× übersprungen`);
  if (trNum(r.pz) > 0) out.push(`Pause ${trMS(r.pzs)}${trNum(r.pz) > 1 ? ` (${trNum(r.pz)}×)` : ''}`);
  if (trNum(r.bg) > 0) out.push(`App verlassen ${trMS(r.bgs)}${trNum(r.bg) > 1 ? ` (${trNum(r.bg)}×)` : ''}`);
  if (trNum(r.res) > 0) out.push('nach Unterbrechung fortgesetzt');
  return out;
}
// Auswertung eines Boxers: Ampel, Status von heute, Aufmerksamkeit (3 Tage ohne Training, wenn in der Zeit eine Einheit geplant war)
function trAnalyse(b, heute) {
  const ti = b.ti && typeof b.ti === 'object' ? b.ti : null;
  const runs = b.runs && typeof b.runs === 'object' ? b.runs : {};
  const done = b.erledigt && typeof b.erledigt === 'object' ? b.erledigt : {};
  const lastAct = [b.zuletzt_gespeichert, b.letzte_anmeldung].filter(Boolean).sort().pop() || '';
  const idle = lastAct ? trDayNum(heute) - trDayNum(trDay(lastAct)) : null;
  let ampel = ['frei', ''];
  if (b.belegt) ampel = !lastAct ? ['noch nicht gestartet', 'amber'] : idle <= 3 ? ['aktiv', 'ok'] : idle <= 14 ? ['ruhig', 'amber'] : ['inaktiv', 'red'];
  let attention = '';
  if (b.belegt && ti) {
    // Verpasst ist: ein Planungstag nach der letzten Einheit, der schon vorbei ist. Der Trainer rechnet das selbst gegen heute,
    // damit es auch bei Boxern auffällt, die die App nicht mehr öffnen (deren Stand bleibt eingefroren).
    const lastDay = ti.last ? trDay(ti.last) : '';
    const nd = ti.next && ti.next.day ? String(ti.next.day) : '';
    const missedDay = ti.missed ? String(ti.missed) : nd && nd < heute && (!lastDay || nd > lastDay) ? nd : '';
    if (missedDay) {
      const days = trDayNum(heute) - trDayNum(lastDay || missedDay);
      if (days >= 3) attention = `seit ${days} Tagen nicht trainiert`;
    }
  }
  let today = { tone: '', text: '' };
  if (b.belegt && ti) {
    if (ti.today && ti.at && trDay(ti.at) === heute) {
      const r = runs[ti.today.id];
      const rToday = r && r.s && trDay(r.s) === heute ? r : null;
      const plan = `${Math.round(trNum(ti.today.secs) / 60)} min`;
      if (rToday) {
        const why = trReasons(rToday);
        today = why.length ? { tone: 'amber', text: `nicht voll trainiert (${esc(String(ti.today.title))}, ${plan}): ${esc(why.join(', '))}` } : { tone: 'ok', text: `voll trainiert (${esc(String(ti.today.title))}, ${plan})` };
      } else if (done[ti.today.id] && trDay(done[ti.today.id]) === heute) today = { tone: 'amber', text: `ohne Timer als erledigt markiert (${esc(String(ti.today.title))}, ${plan})` };
      else today = { tone: 'red', text: `noch nicht trainiert (${esc(String(ti.today.title))}, ${plan})` };
    } else if (ti.today) today = { tone: '', text: `Stand vom ${esc(trWhen(ti.at))}, noch nichts von heute bekannt` };
    else today = { tone: '', text: 'heute ist nichts geplant' };
  }
  return { ti, runs, done, ampel, attention, today, lastAct };
}
function trAttentionCount(data) {
  if (!data || !Array.isArray(data.boxer)) return 0;
  return data.boxer.filter((b) => trAnalyse(b, data.heute).attention).length;
}
function trainerHtml() {
  if (tr.state === 'loading' || tr.state === 'idle') return '<p class="muted">Lädt …</p>';
  if (tr.state === 'error') return '<div class="notice">Die Daten konnten nicht geladen werden. Prüfe deine Verbindung.</div><button class="ghost block" data-act="tr-refresh">Erneut versuchen</button>';
  const d = tr.data;
  if (!d) return '<div class="notice">Du hast noch keinen Verein. Lege ihn unter „Profil“, „Verein“ an.</div>';
  const list = (d.boxer || []).map((b) => ({ b, a: trAnalyse(b, d.heute) }));
  const need = list.filter(({ a }) => a.attention);
  const warn = need.length ? `<div class="notice" role="alert"><b>Aufmerksamkeit nötig: ${need.length} ${need.length === 1 ? 'Boxer' : 'Boxer'}</b><br>${need.map(({ b, a }) => `${esc(b.name)}: ${esc(a.attention)}`).join('<br>')}</div>` : '';
  const cards = list
    .filter(({ b }) => b.belegt)
    .map(({ b, a }) => {
      const ti = a.ti;
      const open = tr.open === b.platz;
      const status = ti ? `Woche ${trNum(ti.week) || '–'}${ti.phase ? ` · ${esc(String(ti.phase))}` : ''} · ${trNum(ti.done)} von ${trNum(ti.total)} Einheiten erledigt` : 'noch keine Daten von diesem Boxer';
      const runRows = Object.entries(a.runs)
        .filter(([, r]) => r && typeof r === 'object')
        .sort((x, y) => String(y[1].s).localeCompare(String(x[1].s)))
        .slice(0, 8)
        .map(([, r]) => {
          const why = trReasons(r);
          return `<div class="seat"><div class="seathead"><b>${esc(String(r.t || 'Einheit'))}</b><span class="chip ${why.length ? 'amber' : 'ok'}">${why.length ? 'nicht voll' : 'voll trainiert'}</span></div><p class="muted small" style="margin:4px 0 0">${esc(trWhen(r.s))} · geplant ${trMS(r.plan)}, gelaufen ${trMS(r.act)}${r.sv ? ` · gespeichert ${esc(trWhen(r.sv))}` : r.fin ? ' · noch nicht gespeichert' : ''}${why.length ? `<br>${esc(why.join(', '))}` : ''}</p></div>`;
        })
        .join('');
      const more = open
        ? `<div style="margin-top:10px">${runRows || '<p class="muted small">Noch keine Einheit mit Timer.</p>'}${b.test_watt ? `<p class="muted small">Test-Watt: ${esc(String(b.test_watt))} W${b.test_datum ? `, gemessen ${esc(trWhen(b.test_datum))}` : ''}</p>` : ''}</div>`
        : '';
      return `<div class="card"><div class="row between"><b>${esc(b.name)}</b><span class="chip ${a.ampel[1]}">${esc(a.ampel[0])}</span></div>
      <p class="muted small" style="margin:6px 0 0">${status}</p>
      ${a.today.text ? `<p class="small" style="margin:6px 0 0"><span class="chip ${a.today.tone}">Heute</span> ${a.today.text}</p>` : ''}
      <p class="muted small" style="margin:6px 0 0">Zuletzt in der App: ${a.lastAct ? esc(trWhen(a.lastAct)) : '–'}</p>
      ${a.attention ? `<p class="small" style="margin:6px 0 0;color:#ff8b99">${esc(a.attention)}</p>` : ''}
      <button class="ghost block" style="margin-top:10px" data-act="tr-open" data-id="${esc(b.platz)}">${open ? 'Weniger anzeigen' : 'Letzte Einheiten anzeigen'}</button>${more}</div>`;
    })
    .join('');
  const free = list.filter(({ b }) => !b.belegt).length;
  const tot = Number(d.plaetze) || list.length; // Paketgröße (plaetze), sonst die Zahl der angelegten Boxer
  const empty = list.length ? 'Noch niemand hat seinen Code eingelöst. Gib den Boxern ihre Codes unter „Deine Boxer“.' : 'Du hast noch keinen Boxer angelegt. Tippe unten auf „Deine Boxer“.';
  return `${warn}<div class="card"><div class="row between"><b>${esc(d.verein)}</b><span class="chip">${list.length} von ${tot} Boxern angelegt</span></div><p class="muted small" style="margin:8px 0 0">${list.length - free} haben ihren Code eingelöst.</p></div>${cards || `<div class="notice">${empty}</div>`}`;
}
function trRender() {
  if (location.hash !== '#/profile' && !location.hash.startsWith('#/club/')) return;
  const el = document.getElementById('trBody');
  if (el) el.innerHTML = trainerHtml();
}
async function loadTrainer() {
  if (!account) return;
  if (!tr.data) tr.state = 'loading';
  try {
    const { data, error } = await withTimeout(cloud.gymTrainer(), 12000);
    if (error) throw error;
    tr.data = data || null;
    tr.state = 'ok';
    if (clubInfo.trainer) clubInfo.attention = trAttentionCount(tr.data);
  } catch {
    tr.state = 'error';
  }
  trRender();
}
async function loadTrainerAttention() {
  try {
    const { data, error } = await withTimeout(cloud.gymTrainer(), 12000);
    if (error) return;
    clubInfo.attention = trAttentionCount(data);
    if (['', '#', '#/'].includes(location.hash) && !document.querySelector('.timer') && !document.getElementById('onboard')) route();
  } catch {
    /* ohne Verbindung bleibt der Hinweis weg */
  }
}

function viewMore() {
  const row = (href, title, sub) => `<a class="card link row" href="${href}"><span class="grow"><b>${title}</b><br><span class="muted small">${sub}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  return `<h1>Mehr</h1>
  ${row('#/info', 'Einführung und Wissen', 'So startest du, Belastungsskala, Hinweise')}
  ${row('#/feedback', 'Fehler melden oder Feedback', 'Etwas klappt nicht oder du hast eine Idee? Schreib es uns.')}
  ${Object.keys(state.reports || {}).length ? row('#/reports', `Meine Meldungen${reportsUnseen ? ' <span class="newchip">Neu</span>' : ''}`, 'Status und Antworten zu deinen Meldungen') : ''}
  ${row('#/news', 'Das ist neu', `Was sich in Version ${APP_VERSION} geändert hat`)}
  <p class="center morelinks"><a href="#/datenschutz">Datenschutz</a> · <a href="#/impressum">Impressum</a></p>
  <p class="muted small center" style="margin-top:22px">${APP_NAME_A.trim()} ${APP_NAME_B}<br>Mehr Kondition bis zur letzten Runde<br>Version ${APP_VERSION} (${APP_BUILD})</p>`;
}

// Profil: ein Profil für alle. Persönliches Konto: Konto und Einstellungen. Trainer-Konto (hat einen Verein): die Traineransicht.
const trainerProfile = () => Boolean(account && clubInfo.trainer && !account.isAdmin); // Admin sieht im Profil nur sein persönliches Konto, Vereine liegen im Admin-Bereich
const profileBtn = () => `<a class="profbtn" href="#/profile" aria-label="Profil${trainerProfile() && clubInfo.attention ? `, ${clubInfo.attention} Boxer brauchen Aufmerksamkeit` : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.8-4 3.7-6 7.5-6s6.7 2 7.5 6"/></svg>${trainerProfile() && clubInfo.attention ? '<i aria-hidden="true"></i>' : ''}</a>`;
function accountCardHtml() {
  return account
    ? `<div class="card"><div class="row between"><span class="muted">Angemeldet als</span><b style="word-break:break-all;text-align:right">${esc(account.email || '')}</b></div>
  <p class="muted small" style="margin:8px 0 12px">${esc(syncLabel())}</p>
  <button class="ghost block logout" data-act="logout">Abmelden</button></div>`
    : '';
}
function viewProfile() {
  const row = (href, title, sub) => `<a class="card link row" href="${href}"><span class="grow"><b>${title}</b><br><span class="muted small">${sub}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  if (trainerProfile()) {
    return `<a href="#/" class="back">← Zurück</a><h1>Profil</h1><div id="trBody">${trainerHtml()}</div>
  ${row('#/verein', 'Deine Boxer', 'Boxer anlegen, Einladung schicken, Codes kopieren')}
  ${row('#/settings', 'Einstellungen', 'Kampf, Training, Erinnerungen, Daten, Konto löschen')}
  ${accountCardHtml()}
  <p class="muted small">„Voll trainiert“ heißt: geplante Zeit komplett gelaufen, nichts übersprungen, keine Pause, App nicht verlassen. Die App misst, dass der Timer lief, nicht, dass jemand gefahren ist.</p>`;
  }
  return `<a href="#/" class="back">← Zurück</a><h1>Profil</h1>
  ${accountCardHtml()}
  ${row('#/settings', 'Einstellungen', 'Kampf, Training, Erinnerungen, Daten')}
  ${payUi() && !werbefrei() ? row('#/abo', 'Ohne Werbung', `Monat ${PRICE.monat} oder Jahr ${PRICE.jahr}`) : ''}
  ${payUi() && abo.aktiv ? row('#/abo', `Ohne Werbung <span class="chip ok">aktiv</span>`, `${abo.art === 'jahr' ? 'Jahresabo' : 'Monatsabo'} bis ${esc(aboBisText())}`) : ''}
  ${account && !account.isAdmin ? row('#/verein', 'Verein', clubInfo.access ? `Dein Verein: ${esc(clubInfo.access.verein)}` : 'Du hast einen Code von deinem Trainer? Hier eintragen.') : ''}
  ${account && account.isAdmin ? row('#/admin', 'Admin', 'Vereine, Testuser und Nutzung') : ''}`;
}

/* ---------------- Ohne Werbung: Abo (Monat, Jahr) und Vereinspakete ---------------- */
// Entscheidung des Betreibers 23.11.2026: Das erste Training ist gratis. Danach wählt man: Abo ohne Werbung oder mit Werbung weiter.
// In der Web-Version wird der Kauf nur gespielt (Testkauf, nur Admin) und die Werbung ist nur ein Platzhalter (nur Admin).
// Echte Käufe und echte Werbung gibt es erst in der iPhone-App 1.1. Dann PAYWALL_FUER_ALLE auf true stellen.
const PAYWALL_FUER_ALLE = false;
const PRICE = { monat: '1,99 €', jahr: '14,99 €' };
const PAKETE = [
  { n: 3, preis: '39,99 €', je: '13,33 €', tag: '' },
  { n: 5, preis: '49,99 €', je: '10,00 €', tag: 'beliebt' },
  { n: 10, preis: '69,99 €', je: '7,00 €', tag: 'günstigster Preis' },
];
let abo = { loaded: false, aktiv: false, art: '', bis: '' };
let aboPick = 'jahr'; // das Jahresabo ist vorgewählt
let adChoiceId = ''; // Einheit, für die „Weiter mit Werbung“ gewählt wurde
// Vorschau (Entscheidung des Betreibers, 28.11.2026): Die Web-Version zeigt allen Nutzern die Auswahl „Ohne Werbung“ und die Werbung (Platzhalter mit Countdown),
// aber der Kauf ist nur ein Hinweis („noch nicht freigeschaltet, du nutzt alles kostenlos“). Gespielte Käufe gibt es nur für Admin und Testkonten.
// Die Vorschau endet erst, wenn die Stores live sind und echte Werbung und echte Käufe laufen (dann PAYWALL_FUER_ALLE auf true, Web ohne Vorschau).
const vorschau = () => !isNativeApp();
const testPay = () => Boolean(account && account.isTester && !account.isAdmin); // nur Testkonten (z. B. das Vereinskonto des Betreibers, siehe docs/DB-VEREINSKONTEN.sql); der Admin sieht wie jede Privatperson die Vorschau
const payUi = () => Boolean(account && (testPay() || PAYWALL_FUER_ALLE || vorschau()));
const kaufHint = () => (isNativeApp() ? '' : testPay() ? '<p class="testhint">Zum Testen in der Web-Version: der Kauf wird nur gespielt.</p>' : '<div class="notice" style="margin-top:10px"><b>Vorschau:</b> Bezahlen ist noch nicht freigeschaltet. Du nutzt alles vorerst kostenlos.</div>');
const kaufVorschauAlert = () => alert('Bezahlen ist noch nicht freigeschaltet. Das ist eine Vorschau, du trainierst vorerst kostenlos weiter.');
// Werbefrei: Abo, Boxer mit Vereinsplatz, Trainer (Admin nicht, damit man den Ablauf testen kann)
const werbefrei = () => Boolean(abo.aktiv || (clubInfo.access && clubInfo.access.art === 'verein') || (clubInfo.trainer && (clubInfo.seatsTotal > 0 || clubInfo.probe === 'laeuft') && !(account && account.isAdmin))); // access.art ist auch bei Trainern gesetzt ('trainer'), nur 'verein' ist ein Boxer mit Platz; ein Trainer ist nur mit Paket werbefrei
const adDue = (id) => Boolean(account) && id !== 'test' && !werbefrei() && Object.keys(state.done || {}).length >= 1 && (!payUi() || adChoiceId === id);
const adPlaceholderOn = () => !nativePlugin('AdMob') && Boolean(account && (testPay() || vorschau()));
async function loadAbo() {
  if (!account) return;
  pushResync();
  try {
    const { data, error } = await withTimeout(cloud.aboStatus(), 8000);
    if (error) return;
    abo = { loaded: true, aktiv: Boolean(data && data.aktiv), art: (data && data.art) || '', bis: (data && data.bis) || '' };
  } catch {
    /* ohne Verbindung bleibt es beim bisherigen Stand */
  }
  if (['#/profile', '#/abo'].includes(location.hash) && !document.querySelector('.timer')) route();
}
const aboBisText = () => {
  const d = new Date(abo.bis);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE');
};
// Vor einer Einheit ab dem zweiten Training: Auswahl zeigen (nur wer die Bezahl-Ansicht sieht, nicht werbefrei ist und nicht schon „mit Werbung“ gewählt hat)
function runNeedsChoice(id) {
  if (!payUi() || id === 'test' || werbefrei() || adChoiceId === id) return false;
  if (Object.keys(state.done || {}).length < 1) return false; // das erste Training ist gratis
  const saved = readRun();
  return !(saved && saved.id === id); // eine unterbrochene Einheit darf man ohne Auswahl fortsetzen
}
function viewAbo(id) {
  if (!account) return '<a href="#/" class="back">← Zurück</a><h1>Ohne Werbung</h1><div class="notice">Bitte melde dich zuerst an.</div>';
  if (abo.aktiv) {
    return `<a href="#/profile" class="back">← Profil</a><h1>Ohne Werbung</h1>
    <div class="card"><div class="row between"><b>Ohne Werbung</b><span class="chip ok">aktiv</span></div><p class="muted small" style="margin:8px 0 0">${abo.art === 'jahr' ? 'Jahresabo' : 'Monatsabo'}, gültig bis ${esc(aboBisText())}.</p></div>
    ${account.isAdmin || account.isTester ? '<button class="ghost block" data-act="abo-end">Test-Abo beenden</button><p class="testhint">Nur für Testkonten: danach kannst du den Ablauf noch einmal testen.</p>' : ''}`;
  }
  const grey = vorschau() && !testPay(); // Vorschau: Preise und Kaufknopf sind ausgegraut und nicht anklickbar, nur „Weiter mit Werbung“ geht
  const card = (art, titel, preis, sub, tag) => `<button class="pk ${aboPick === art && !grey ? 'sel' : ''}" data-act="abo-pick" data-art="${art}" ${grey ? 'disabled style="opacity:.4"' : ''}><div class="top"><b>${titel}</b><span class="pr">${preis}</span></div><span class="muted small">${sub}${tag ? ` <span class="tag">${tag}</span>` : ''}</span><ul><li>Keine Werbung</li><li>Jederzeit kündbar</li></ul></button>`;
  const label = aboPick === 'jahr' ? `Jahr für ${PRICE.jahr} wählen` : `Monat für ${PRICE.monat} wählen`;
  return `${id ? '<a href="#/" class="back">← Zurück</a>' : '<a href="#/profile" class="back">← Profil</a>'}<h1>${id ? 'Ohne Werbung trainieren' : 'Ohne Werbung'}</h1>
  <p class="muted">${id ? 'Dein erstes Training war gratis. Für das nächste wähle, wie du weitermachen willst.' : 'Mit dem Abo siehst du vor dem Training keine Werbung.'}</p>
  ${card('monat', 'Monat', PRICE.monat, 'monatlich kündbar', '')}
  ${card('jahr', 'Jahr', PRICE.jahr, '1,25 € im Monat', 'Empfohlen · spart 37 %')}
  <button class="${grey ? 'ghost' : 'primary'} block" style="margin-top:6px${grey ? ';opacity:.4' : ''}" data-act="abo-buy" ${grey ? 'disabled' : ''}>${label}</button>
  ${kaufHint()}
  ${id ? `<button class="${grey ? 'primary' : 'ghost'} block" style="margin-top:${grey ? 18 : 14}px" data-act="abo-skip" data-id="${esc(id)}">Weiter mit Werbung${grey ? ' (Simulation)' : ''}</button>` : ''}`;
}
async function aboBuy() {
  if (!testPay()) {
    if (vorschau()) kaufVorschauAlert();
    else alert('Der Kauf ist in dieser Version noch nicht möglich.');
    return;
  }
  try {
    const { error } = await withTimeout(cloud.aboTestBuy(aboPick), 12000);
    if (error) throw error;
    await loadAbo();
    toast('Testkauf gespielt: Ohne Werbung ist aktiv');
    route();
  } catch {
    alert('Das hat nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal.');
  }
}
async function aboEnd() {
  try {
    const { error } = await withTimeout(cloud.aboTestEnd(), 12000);
    if (error) throw error;
    await loadAbo();
    toast('Test-Abo beendet');
    route();
  } catch {
    alert('Das hat nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal.');
  }
}
// Pakete für Vereine: Auswahl und Knopf (Testkauf nur für Admins, siehe oben)
function pkgBlockHtml(action, withName) {
  const sel = gym.pkg || 5;
  const p = PAKETE.find((x) => x.n === sel) || PAKETE[1];
  const grey = vorschau() && !testPay(); // Vorschau: Pakete und Kaufknopf ausgegraut, darunter „Kostenlos weitermachen“
  const cards = PAKETE.map((x) => `<button class="pk ${x.n === sel && !grey ? 'sel' : ''}" data-act="pkg-pick" data-n="${x.n}" ${grey ? 'disabled style="opacity:.4"' : ''}><div class="top"><b>${x.n} Boxer</b><span class="pr">${x.preis}</span></div><span class="muted small">${x.je} je Boxer im Jahr${x.tag ? ` <span class="tag">${x.tag}</span>` : ''}</span></button>`).join('');
  return `${withName ? `<label for="gymName" class="small" style="margin:0 0 4px">Name des Vereins</label><input id="gymName" type="text" maxlength="60" autocomplete="off" placeholder="z. B. Boxclub Musterstadt" value="${esc(gym.name || '')}">` : ''}
  <h3 style="font-size:20px;margin:16px 0 4px">Wähle dein Paket</h3><p class="muted small" style="margin:0 0 4px">Jahresabo. Jeder Boxer trainiert ohne Werbung.</p>
  ${cards}
  <p class="muted small" style="margin:6px 2px">In jedem Paket: Codes für deine Boxer, Traineransicht mit Stand und Aufmerksamkeit, Plätze jederzeit neu vergeben.</p>
  <button class="${grey ? 'ghost' : 'primary'} block" data-act="${action}" ${gym.busy || grey ? 'disabled' : ''} ${grey ? 'style="opacity:.4"' : ''}>Paket mit ${p.n} Boxern für ${p.preis} wählen</button>
  ${kaufHint()}
  ${grey ? '<a class="btn primary block" style="display:block;text-align:center;margin-top:12px" href="#/">Kostenlos weitermachen (Werbung wird nur simuliert)</a>' : ''}`;
}
// Platzhalter für das Werbevideo in der Web-Version (nur Admin): 5 Sekunden
function placeholderAd() {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'adfake';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Werbung (Platzhalter)');
    let n = 5;
    box.innerHTML = `<b>Werbung (Platzhalter)</b><p class="muted small">Vorschau: So sieht die Werbung später aus. In der iPhone-App läuft hier ein Werbevideo, in der Web-Version ist es ein Platzhalter. Gleich geht es weiter.</p><p id="adfakeN" class="adbig">${n}</p>`;
    document.body.appendChild(box);
    const iv = setInterval(() => {
      n -= 1;
      const el = document.getElementById('adfakeN');
      if (el) el.textContent = String(n);
      if (n <= 0) {
        clearInterval(iv);
        box.remove();
        resolve('ok');
      }
    }, 1000);
  });
}

function viewProgress() {
  const all = allSessions();
  const total = all.length;
  const done = all.filter(({ s }) => isDone(s.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const d = daysToFight();
  const cw = currentWeek();
  const wk = cw ? weekOrder(cw) : [];
  const wkDone = wk.filter((s) => isDone(s.id)).length;
  const age = state.maxWDate ? Math.round((startOfDay(new Date()) - startOfDay(new Date(state.maxWDate))) / DAY) : 0;
  const sp = state.sprints && state.sprints.length === 3 ? state.sprints : null;
  return `<h1>Fortschritt</h1>
  <div class="card hero"><span class="kicker">Einheiten</span>
    <div class="bignum">${done}<span class="of"> / ${total}</span></div>
    <div class="meter" role="img" aria-label="${pct} Prozent erledigt"><i style="width:${pct}%"></i></div>
    <p class="muted small" style="margin:10px 0 0">${pct} % deines Plans erledigt${d !== null && d >= 0 ? ` · noch ${d} ${d === 1 ? 'Tag' : 'Tage'} bis zum Kampf` : ''}</p></div>
  ${cw && wk.length ? `<div class="card"><div class="row between"><span class="muted">Diese Woche (Woche ${cw.n})</span><b>${wkDone} von ${wk.length}</b></div></div>` : ''}
  <h2>Fitness-Test</h2>
  <div class="card">
    ${state.maxW ? `<div class="row between"><span class="muted">Test-Watt</span><b class="bignum-s">${state.maxW} W</b></div>
      ${sp ? `<p class="muted small" style="margin:8px 0 0">Durchschnitt aus ${sp.join(', ')} W</p>` : ''}
      ${state.maxWDate ? `<p class="muted small" style="margin:4px 0 0">Gemessen am ${fmtDate(new Date(state.maxWDate))}${age ? ` (vor ${age} Tagen)` : ''}</p>` : ''}
      ${state.maxWDate && age >= 28 ? '<p class="amber-note">Zeit für einen neuen Test: Wiederhole ihn alle paar Wochen, damit die Watt-Ziele zu deiner Form passen.</p>' : ''}`
      : '<p style="margin:0 0 4px"><b>Noch kein Test.</b> Ohne Test-Watt siehst du nur Prozentwerte.</p>'}
    <a class="btn primary block" style="margin-top:12px" href="#/test">${state.maxW ? 'Test wiederholen' : 'Fitness-Test machen'}</a>
  </div>`;
}

function viewInfo() {
  const p = profile();
  const pl = plan();
  const steps = [
    { done: Boolean(state.onboarded && (state.fightDate || state.startDate)), title: 'Einrichten', text: 'Altersklasse, Kampftermin und Kampfformat eintragen. Daraus baut die App deinen Plan.', value: state.onboarded && (state.fightDate || state.startDate) ? `${p.name} · ${pl.fight ? 'Kampf ' + fmtDate(pl.fight) : 'ohne Kampftermin'} · ${formatLabel()}` : '', btn: state.onboarded ? '<a class="btn primary" href="#/settings">Eintragen</a>' : '<button class="primary" data-act="ob-replay">Jetzt einrichten</button>', again: '<a class="stepchange" href="#/settings">Ändern</a>' },
    { done: Boolean(state.maxW), title: 'Fitness-Test', text: 'Drei Sprints à 10 Sekunden auf dem Air Bike, 1 Minute Pause dazwischen. Du trägst danach die drei Höchstwerte ein. Der Durchschnitt ist dein Test-Watt, daraus berechnet die App alle Watt-Ziele.', value: state.maxW ? `Test-Watt: ${state.maxW} W` : '', btn: '<a class="btn primary" href="#/test">Test starten</a>', again: '<a class="stepchange" href="#/test">Wiederholen</a>' },
    { done: doneInPlan() > 0, title: 'Erste Einheit trainieren', text: 'Öffne deine nächste Einheit und tippe auf Starten. Der Timer führt dich durch jede Runde und zeigt dir das Watt-Ziel.', value: doneInPlan() ? `${doneInPlan()} Einheit(en) erledigt` : '', btn: nextSession() ? `<a class="btn primary" href="#/s/${nextSession().s.id}">Einheit öffnen</a>` : '<a class="btn primary" href="#/plan">Zum Plan</a>', again: '<a class="stepchange" href="#/plan">Zum Plan</a>' },
  ];
  const cur = steps.findIndex((x) => !x.done);
  const stepHtml = steps
    .map((x, i) => {
      const cls = x.done ? 'done' : i === cur ? 'current' : 'later';
      return `<li class="stepcard ${cls}"><span class="stepnum">${x.done ? '✓' : i + 1}</span><div class="stepbody"><h3>${x.title}${i === cur ? '<span class="steptag">Jetzt</span>' : ''}</h3><p>${x.text}</p>${x.value ? `<p class="stepval">${esc(x.value)}</p>` : ''}${i === cur ? `<div class="stepact">${x.btn}</div>` : x.done ? `<div class="stepact">${x.again}</div>` : ''}</div></li>`;
    })
    .join('');
  return `<a href="#/more" class="back">← Mehr</a><span class="kicker">Neu hier?</span><h1>So startest du</h1>
  <p class="muted">Drei Schritte, dann trainierst du nach deinem Plan.</p>
  <ol class="steps">${stepHtml}</ol>
  ${cur === -1 ? '<div class="notice">Alles eingerichtet. Deine nächste Einheit findest du unter <a href="#/"><u>Heute</u></a>.</div>' : ''}
  <button class="linkbtn" data-act="ob-replay">Schritt-für-Schritt-Einführung noch einmal ansehen</button>
  <h2>Gut zu wissen</h2>
  <h3>Belastungsskala von 1 bis 10</h3>
  <table class="rpe"><tbody>
    <tr><td>1–2</td><td>Sehr leicht bis leicht</td></tr><tr><td>3</td><td>Moderat, du kannst dich noch gut unterhalten</td></tr>
    <tr><td>4–6</td><td>Hart</td></tr><tr><td>7–8</td><td>Sehr hart (Tempo-Stufen, Kurz-Sprints)</td></tr>
    <tr><td>9</td><td>Fast maximal (Kampfrunden)</td></tr><tr><td>10</td><td>Maximal</td></tr>
  </tbody></table>
  <p class="muted">Die 10 ist das Maximum, das du über die jeweilige Dauer einmal geben könntest. Ziehst du ein bisschen davon ab, hast du 9 von 10. Ein 15-Sekunden-Sprint und ein 4-Minuten-Intervall können beide bei 9 von 10 liegen, auch wenn die Watt sehr verschieden sind.</p>
  <h3 style="margin-top:18px">Pausen</h3>
  <p>In den Pausen komplett erholen: absteigen, nicht weitertreten. Nur die Aktive Erholung ist durchgehend locker.</p>
  <h3 style="margin-top:18px">Wöchentlicher Rhythmus</h3>
  <p>Halte mindestens 1–2 Tage zwischen den harten Einheiten. Die Tage kannst du in den Einstellungen anpassen.</p>
  <h3 style="margin-top:18px">Warum Air Bike?</h3>
  <p>Kein Aufprall, kaum Technik und Ganzkörperbelastung. Du kannst sehr hart trainieren, ohne Sehnen und Gelenke wie beim Sprinten zu belasten.</p>
  <h3 style="margin-top:18px">Grenzen des Air Bikes</h3>
  <ul class="plain"><li>Die Watt-Ziele richten sich nach deinem Test-Watt. Wiederhole den Fitness-Test alle paar Wochen, damit sie zu deiner Form passen.</li><li>Sehr lockere Erholung ist auf dem Air Bike schwer zu steuern. Bleib bewusst im Grundtempo.</li></ul>
  <div class="notice">Gesundheitshinweis: Maximale Sprints sind sehr belastend. Bei Herz-Kreislauf-Problemen, Vorerkrankungen oder Beschwerden vorher ärztlich abklären. Bei Schwindel, Brustschmerz oder Atemnot sofort abbrechen.</div>`;
}

function profileSettingsInfo() {
  const p = profile();
  const rows = [
    ['Umfang', `${Math.round(p.volume * 100)} %`],
    ['Max-Sprint bis', `${p.maxSprintSecs} s`],
    ['Harte Sessions pro Woche', `${p.hardPerWeek}`],
    ['Watt-Obergrenze', p.wattCapPct && p.wattCapPct < 100 ? `${p.wattCapPct} % vom Test-Watt` : 'keine'],
  ];
  const band = ageBandNow();
  if (band) rows.push([`Wattwerte (${band.name})`, `${String(band.pct).replace('.', ',')} % vom Plan`]);
  return `<table class="targets"><tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</tbody></table>`;
}

function viewSettings() {
  const accAge = account && account.birthYear ? new Date().getFullYear() - account.birthYear : 0; // aus dem Geburtsjahr der Registrierung
  const age = accAge || Number(state.age);
  const hf = age ? Math.round(208 - 0.7 * age) : 0;
  const dayOpts = (key) => `<select data-set-day="${key}" aria-label="Tag">${DAY_LONG.map((d, i) => `<option value="${i + 1}" ${Number(state.days[key]) === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  const nativeNotif = Boolean(nativePlugin('LocalNotifications'));
  const notifSupported = 'Notification' in window || nativeNotif || iosNeedsHome();
  return `<a href="#/profile" class="back">← Profil</a><h1>Einstellungen</h1>

  <h2>Dein Kampf</h2>
  <label for="fightDate">Kampftermin (Turnier)</label>
  ${dateField('fightDate', state.fightDate, 'data-set="fightDate"')}
  ${state.fightDate ? '<button class="linkbtn inline" data-act="fight-remove">Ich habe keinen Kampftermin mehr</button>' : ''}
  ${!state.fightDate ? `<label for="startDate">Startdatum (nur ohne Kampftermin)</label>
  ${dateField('startDate', state.startDate, 'data-set="startDate"')}` : ''}
  <label for="rounds">Anzahl der Runden im nächsten Kampf</label>
  <select id="rounds" data-set="rounds">${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `<option value="${n}" ${fmtRounds() === n ? 'selected' : ''}>${n} Runden</option>`).join('')}</select>
  <label for="roundMin">Länge einer Runde</label>
  <select id="roundMin" data-set="roundMin">${[2, 3].map((m) => `<option value="${m}" ${fmtRoundSecs() === m * 60 ? 'selected' : ''}>${m} Minuten</option>`).join('')}</select>
  <p class="muted small">${esc(planSummary())} Daran richten sich auch die Kampfrunden und der Umfang aus. Die Zuordnung ist eine Annahme und noch nicht von einem Fachtrainer geprüft.</p>
  ${state.fightDate || state.startDate || state.maxW || Object.keys(state.done || {}).length ? '<div class="card"><b>Kampf abgesagt oder neu anfangen?</b><p class="muted small" style="margin:6px 0 10px">Mit „Plan zurücksetzen“ beginnst du wieder von vorn: Kampftermin, Test-Watt und erledigte Einheiten werden gelöscht. Danach trägst du einen neuen Kampftermin ein und machst den Fitness-Test neu. Dein Konto und deine übrigen Einstellungen bleiben.</p><button class="ghost block" data-act="plan-reset">Plan zurücksetzen</button></div>' : ''}

  <h2>Dein Training</h2>
  <label for="profile">Altersklasse</label>
  <select id="profile" data-set="profile">${Object.entries(PROFILES).filter(([k]) => allowedProfiles().includes(k) || state.profile === k).map(([k, p]) => `<option value="${k}" ${state.profile === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  ${profileSettingsInfo()}
  <label for="maxW">Test-Watt (Durchschnitt deiner 3 Sprints)</label>
  <input id="maxW" type="number" inputmode="numeric" min="0" max="3000" step="5" value="${state.maxW || ''}" data-set="maxW" placeholder="z. B. 1000">
  <p class="muted small">Daraus berechnet die App alle Watt-Ziele. Am besten ermittelst du ihn mit dem geführten <a href="#/test"><u>Fitness-Test</u></a>.</p>
  <label for="freq">Training am Air Bike pro Woche</label>
  <select id="freq" data-set="freq">${[1, 2, 3].map((n) => `<option value="${n}" ${Number(state.freq) === n ? 'selected' : ''}>${n}× pro Woche</option>`).join('')}</select>
  <div class="field-row">
    <div><label>Einheit 1</label>${dayOpts('s1')}</div>
    ${effFreq() >= 2 ? `<div><label>Einheit 2</label>${dayOpts('s2')}</div>` : ''}
    ${effFreq() >= 3 ? `<div><label>Einheit 3</label>${dayOpts('s3')}</div>` : ''}
    ${userFreq() > effFreq() ? `<div><label>Aktive Erholung</label>${dayOpts('rec')}</div>` : ''}
  </div>
  ${accAge ? '' : `<label for="age">Alter (für den Pulsbereich der Aktiven Erholung)</label>
  <input id="age" type="number" inputmode="numeric" min="10" max="90" value="${state.age || ''}" data-set="age">`}
  ${hf ? `<p>Pulsbereich in der Aktiven Erholung: <b>${Math.round(hf * 0.7)}–${Math.round(hf * 0.8)} Schläge pro Minute</b></p><p class="muted small">Das ist ein Richtwert aus dem Alter${accAge ? ' (aus deinem Geburtsjahr)' : ''}.</p>` : ''}

  <h2>Erinnerungen</h2>
  ${nativeNotif ? `<label for="when">Wann trainierst du?</label>
  <select id="when" data-set="when"><option value="" ${state.when ? '' : 'selected'}>Erinnerung am Trainingstag zur Uhrzeit</option>${Object.entries(TRAIN_WHEN).map(([k, w]) => `<option value="${k}" ${state.when === k ? 'selected' : ''}>${w.name}</option>`).join('')}</select>
  <p class="muted small">${state.when === 'abends' ? 'Du wirst am Trainingstag um 8:00 Uhr erinnert, damit du dir den Abend freihältst.' : state.when ? `Du wirst am Abend vorher um ${TRAIN_WHEN[state.when].at[0]}:00 Uhr erinnert, damit du dir den Termin freihältst.` : 'Wähle, wann du trainierst, dann erinnert dich die App zum passenden Zeitpunkt.'}</p>` : ''}
  <label for="time">Uhrzeit${nativeNotif && state.when ? ' des Trainings (für die Kalender-Datei)' : ''}</label>
  <input id="time" type="time" value="${esc(state.time)}" data-set="time">
  <div class="btn-row"><button class="primary" data-act="ics">Kalender-Datei (.ics) laden</button></div>
  <p class="muted small">Der Kalender erinnert am zuverlässigsten, auch bei geschlossener App. Datei öffnen und in deinen Kalender importieren. Zuerst Kampftermin setzen. Ändert sich dein Plan, lade die Datei neu. Termine aus einer früheren Datei bleiben im Kalender stehen und müssen dort von Hand gelöscht werden.</p>
  ${
    notifSupported
      ? `<div class="btn-row"><button class="ghost" data-act="notif">${state.notify ? 'Hinweise in der App: an' : 'Hinweise in der App aktivieren'}</button></div>
         <p class="muted small">${nativeNotif ? 'Das iPhone erinnert dich zur eingestellten Uhrzeit an die nächsten offenen Einheiten, auch bei geschlossener App. Erledigte Einheiten werden nicht mehr gemeldet.' : pushSupported() ? `Du bekommst Mitteilungen zu deinen Trainingszeiten und wenn du ein paar Tage nicht da warst, auch wenn die App geschlossen ist. Trainer bekommen eine Mitteilung, wenn Boxer ein paar Tage nicht trainiert haben. Die Mitteilungen kommen auf dieses Gerät.${iosNeedsHome() ? '' : ' Zeitpunkt: siehe „Uhrzeit“ oben.'}` : iosNeedsHome() ? IOS_HOME_HINT : 'Dieser Browser kann keine Mitteilungen schicken. Nutze den Kalender.'}</p>
         ${nativeNotif && notifHint ? '<div class="notice" role="alert">Mitteilungen sind für Nonstop Boxing ausgeschaltet. Das Fenster zum Erlauben zeigt das iPhone nur einmal. Tippe auf „Einstellungen öffnen“, wähle dort <b>Mitteilungen</b> und schalte sie ein. Danach kommst du zurück zur App, die Erinnerungen gehen dann von selbst an.<div class="btn-row"><button class="primary" data-act="open-settings">Einstellungen öffnen</button></div></div>' : ''}`
      : ''
  }

  <h2>Daten</h2>
  <p class="muted small">${account ? 'Dein Fortschritt wird in deinem Konto gesichert. Zusätzlich kannst du ihn hier als Datei speichern.' : 'Dein Fortschritt liegt nur in diesem Browser. Wenn du Browserdaten löschst oder das Gerät wechselst, ist er weg. Sichere ihn regelmäßig.'}</p>
  <div class="btn-row"><button class="ghost" data-act="export">Sichern</button><label class="btn ghost" style="margin:0">Wiederherstellen<input type="file" accept="application/json" data-act="import" hidden></label></div>

  <h2 class="danger-h">Gefahrenzone</h2>
  <p class="muted small">Diese Aktionen lassen sich nicht rückgängig machen.</p>
  <div class="btn-row"><button class="danger" data-act="reset">Fortschritt zurücksetzen</button></div>
  ${accountDangerZone()}`;
}

function notFound() {
  return '<h1>Nicht gefunden</h1><p><a href="#/">Zur Startseite</a></p>';
}

/* ---------------- Router ---------------- */
let cleanup = null;
function route() {
  if (enforceProfile()) save();
  closeModalCal();
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.classList.remove('running');
  setChrome('idle');
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [view, arg] = parts;
  if (view !== 'admin') {
    adminData = null; // Nutzerdaten nicht im Speicher behalten, wenn man die Admin-Ansicht verlässt
    adminState = 'idle';
  }
  if (view !== 'verein') gym = { state: 'idle', data: null, access: null, busy: false, msg: '' }; // Codes nicht im Speicher behalten
  if (view !== 'profile' && view !== 'club') tr = { state: 'idle', data: null, open: '' };
  if (view !== 'admin') adminClubs = null; // Daten der Boxer nicht im Speicher behalten
  if (view !== 'feedback') {
    if (view !== 'more') lastRoute = location.hash || '#/'; // zuletzt besuchte Seite vor „Mehr“, dort ist meist der Fehler passiert
    fb = { kind: 'fehler', text: '', sent: false, busy: false };
  }
  document.querySelectorAll('#nav a').forEach((a) => {
    const nav = a.dataset.nav;
    const active = (nav === 'home' && !view) || (nav === 'plan' && (view === 'plan' || view === 'week' || view === 's')) || (nav === 'progress' && (view === 'progress' || view === 'test')) || (nav === 'more' && ['more', 'info', 'feedback', 'reports', 'datenschutz', 'impressum', 'news'].includes(view));
    a.classList.toggle('active', active);
  });
  if (view === 'run') {
    if (runNeedsChoice(arg)) {
      $app.innerHTML = profileBtn() + viewAbo(arg); // ab dem zweiten Training: Abo ohne Werbung oder mit Werbung weiter
      window.scrollTo(0, 0);
      return;
    }
    runView(arg);
    return;
  }
  if (updatePending) {
    updatePending = false;
    showUpdateBanner();
  }
  let html;
  switch (view) {
    case '': case undefined: html = viewHome(); break;
    case 'plan': html = viewPlan(); break;
    case 'week': html = viewWeek(Number(arg)); break;
    case 's': html = viewSession(arg); break;
    case 'info': html = viewInfo(); break;
    case 'progress': html = viewProgress(); break;
    case 'more': html = viewMore(); break;
    case 'abo': html = viewAbo(''); break;
    case 'paket': html = viewPaket(); break;
    case 'profile': html = viewProfile(); if (account && clubInfo.trainer && !account.isAdmin) loadTrainer(); break;
    case 'club': html = viewClub(arg); loadClubView(arg); break;
    case 'feedback': html = viewFeedback(); break;
    case 'reports': html = viewReports(); loadReports(); break;
    case 'admin': html = viewAdmin(); loadAdmin(); loadAdminClubs(); break;
    case 'verein': html = viewVerein(); loadGym(); break;
    case 'settings': html = viewSettings(); break;
    case 'datenschutz': html = viewLegal('privacy'); break;
    case 'impressum': html = viewLegal('imprint'); break;
    case 'news': html = viewNews(); break;
    case 'test': html = viewTest(); break;
    default: html = notFound();
  }
  $app.innerHTML = (['test', 'profile'].includes(view) ? '' : profileBtn()) + html; // Profil-Symbol oben rechts auf allen Seiten außer Timer, Fitness-Test und Profil
  window.scrollTo(0, 0);
}

/* ---------------- Timer ---------------- */
const CHROME = { prep: '#2a2370', work: '#b3141b', rest: '#12263f', easy: '#0f3b3a', done: '#0f2a18', idle: '#07080c' };
function setChrome(kind) {
  const col = CHROME[kind] || CHROME.idle;
  document.getElementById('themeColor')?.setAttribute('content', col);
  document.documentElement.style.background = kind === 'idle' ? '' : col;
  document.body.style.background = kind === 'idle' ? '' : col;
  // iOS 26 Safari ignoriert theme-color und färbt die obere Leiste nach einem festen Element am oberen Rand.
  // Das Element wird bei jedem Wechsel neu erzeugt, damit Safari die Farbe neu liest.
  document.getElementById('chromeTint')?.remove();
  if (kind !== 'idle') {
    const tint = document.createElement('div');
    tint.id = 'chromeTint';
    tint.setAttribute('aria-hidden', 'true');
    tint.style.background = col;
    document.body.appendChild(tint);
  }
}
let actx = null;
function ensureAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state !== 'running') actx.resume().catch(() => {}); // auch „interrupted“ (iOS nach Sperre oder Anruf)
    loadKnocks();
  } catch {
    actx = null;
  }
}
function beep(freq, ms, vol = 0.5) {
  if (!actx) return;
  try {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + ms / 1000);
  } catch {
    /* kein Ton möglich */
  }
}
// Holzklopfen vor dem Ende einer Pause: drei echte Aufnahmen (Knöchel an der Tür, vom Betreiber aufgenommen), je eine pro Sekunde.
// Die Dateien werden beim ersten Audio-Start geladen. Solange sie fehlen, kommt ersatzweise ein kurzer Ton.
const KNOCK_FILES = ['img/ton/klopf1.wav', 'img/ton/klopf2.wav', 'img/ton/klopf3.wav'];
let knockBuffers = null;
let knockLoading = false;
function loadKnocks() {
  if (knockBuffers || knockLoading || !actx) return;
  knockLoading = true;
  const decode = (data) => new Promise((resolve, reject) => actx.decodeAudioData(data, resolve, reject)); // mit Rückruf, damit es auch auf älteren iPhones geht
  Promise.all(KNOCK_FILES.map((f) => fetch(f).then((r) => r.arrayBuffer()).then(decode)))
    .then((bufs) => {
      knockBuffers = bufs;
    })
    .catch(() => {
      knockLoading = false; // beim nächsten Start noch einmal versuchen
    });
}
function knock(nr) {
  if (!actx) return;
  const buf = knockBuffers && knockBuffers[nr % KNOCK_FILES.length];
  if (!buf) {
    beep(420, 80, 0.7);
    return;
  }
  try {
    const s = actx.createBufferSource();
    s.buffer = buf;
    s.connect(actx.destination);
    s.start();
  } catch {
    /* kein Ton möglich */
  }
}
const vib = (p) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* Vibration nicht verfügbar */
  }
};

let wakeLock = null;
async function lockScreen() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) || null;
  } catch {
    wakeLock = null;
  }
}
function unlockScreen() {
  try {
    wakeLock?.release();
  } catch {
    /* ignorieren */
  }
  wakeLock = null;
}

// Werbung (nur iPhone-App): Vor jeder neuen Einheit läuft ein Video bis zum Ende.
// AD_REWARDED_ID ist der eigene Anzeigenblock des Betreibers in AdMob (die App-ID steht in tools/prepare-ios.mjs).
// AD_TESTING = true: Das Paket nimmt dann Googles Test-Anzeigen und ignoriert die eigene ID (keine echte Werbung, kein Geld, keine ungültigen Klicks auf eigene Anzeigen).
// Erst auf false stellen, wenn echte Werbung laufen soll (AdMob-Konto von Google genehmigt).
// Vor der ersten Anzeige fragt die App die Einwilligung (Googles UMP, Nachricht „Nonstop Boxing EU“ in AdMob) und danach die Tracking-Abfrage von Apple (ATT) ab.
// Noch nicht eingebaut: Knopf zum nachträglichen Ändern der Einwilligung, Sperre bei dauerhaft fehlender Werbung. Ist keine Werbung verfügbar, startet die Einheit trotzdem.
const AD_REWARDED_ID = 'ca-app-pub-6801495414031100/2952160370';
// AD_ENABLED = false: Die Werbung ist ganz abgeschaltet (Version 1.0 im App Store, Entscheidung des Betreibers 20.11.2026). Der Datenschutztext passt sich an.
// Erst auf true stellen, wenn echte Werbung kommt: App im Store, in AdMob den Shop hinzugefügt, Google hat die App geprüft, AD_TESTING dann auf false. Auch img/datenschutz.html von Hand anpassen.
const AD_ENABLED = false;
const AD_TESTING = true;
let adInit = null;
// Einwilligung, Tracking-Abfrage und Start der Werbe-Bibliothek, einmal pro App-Start. Ergebnis: true = Anzeigen dürfen angefragt werden.
let adNote = ''; // Diagnose für den Testmodus: was Googles Einwilligung gemeldet hat
const adFail = (why) => {
  if (AD_TESTING) alert(`Werbung (Test): ${why}${adNote ? `\n${adNote}` : ''}`); // nur im Testmodus, damit man sieht, warum kein Video kommt
};
async function adSetup(ad) {
  let info = await withTimeout(ad.requestConsentInfo(), 10000);
  adNote = `Einwilligung: Status ${info.status}, Fenster ${info.isConsentFormAvailable ? 'ja' : 'nein'}, Anzeigen erlaubt ${info.canRequestAds ? 'ja' : 'nein'}`;
  if (info.isConsentFormAvailable) {
    info = await ad.showConsentForm(); // zeigt das Fenster nur, wenn eine Einwilligung nötig ist, und wartet auf die Antwort des Nutzers
    adNote += ` | danach: Status ${info.status}, Anzeigen erlaubt ${info.canRequestAds ? 'ja' : 'nein'}`;
  }
  if (AD_TESTING) alert(`Werbung (Test), Diagnose:\n${adNote}`); // nur im Testmodus, einmal pro App-Start
  if (!info.canRequestAds) return false;
  const att = await ad.trackingAuthorizationStatus();
  if (att && att.status === 'notDetermined') await ad.requestTrackingAuthorization(); // Apple-Fenster, nur einmal
  await withTimeout(ad.initialize(), 10000);
  return true;
}
// Ergebnis: 'ok' (Video gesehen oder keine Werbung verfügbar) oder 'abbruch' (Video vorzeitig geschlossen)
async function playStartAd() {
  if (!nativePlugin('AdMob') && adPlaceholderOn()) return placeholderAd();
  const ad = AD_ENABLED ? nativePlugin('AdMob') : null;
  if (!ad) return 'ok';
  try {
    if (!adInit) adInit = adSetup(ad);
    const ready = await adInit;
    if (!ready) {
      adInit = null; // ohne Einwilligung keine Anzeige, beim nächsten Mal wieder fragen
      adFail('keine Anzeige, weil die Einwilligung fehlt.');
      return 'ok';
    }
    await withTimeout(ad.prepareRewardVideoAd({ adId: AD_REWARDED_ID, isTesting: AD_TESTING }), 10000);
  } catch (e) {
    adInit = null;
    adFail(`Fehler bei Einwilligung oder Laden: ${String((e && (e.message || e.code)) || e).slice(0, 120)}`);
    return 'ok'; // keine Werbung verfügbar (kein Netz, keine Anzeige, Einwilligung nicht abrufbar): die Einheit nicht sperren
  }
  try {
    await ad.showRewardVideoAd();
    return 'ok';
  } catch (e) {
    if (e && e.code === 'REWARDED_AD_CANCELLED') return 'abbruch';
    adFail(`Video konnte nicht gezeigt werden: ${String((e && (e.message || e.code)) || e).slice(0, 120)}`);
    return 'ok';
  }
}

function runView(id) {
  const found = findInPlan(id);
  if (!found) {
    $app.innerHTML = notFound();
    return;
  }
  const { session } = found;
  const blocks = sessionBlocks(session, state.recOpt);
  const c = ctx();
  const segs = flatten({ ...session, blocks }, c);
  const first = segs[0];
  segs.unshift({
    kind: 'prep',
    label: 'Bereit machen',
    secs: 10,
    block: session.title,
    rep: 1,
    reps: 1,
    target: { main: 'Aufs Bike', sub: first ? `Gleich: ${first.label} · ${first.target.main}` : '' },
  });
  const total = totalSecs(segs);
  const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
  const isTest = session.type === 'test';
  const entered = [null, null, null]; // Werte, die schon während der Pausen eingetragen wurden

  // Wurde das Training unterbrochen (z. B. Neuladen, App geschlossen), anbieten, dort fortzusetzen
  let resumeAt = null;
  const saved = readRun();
  if (saved && saved.id === id && Date.now() - saved.t < RUN_MAX_AGE && Number.isInteger(saved.i) && saved.i >= 0 && saved.i < segs.length && (saved.i > 0 || saved.elapsed > 5000)) {
    if (confirm(`Dein Training wurde unterbrochen (Schritt ${saved.i + 1} von ${segs.length}).\n\nOK = dort fortsetzen\nAbbrechen = von vorn beginnen`)) resumeAt = saved;
    else writeRun(null);
  }

  document.body.classList.add('running');
  runHash = location.hash;
  const upd = document.getElementById('update'); // Update-Hinweis nicht über den Timer legen, danach wieder zeigen
  if (upd) {
    upd.remove();
    updatePending = true;
  }
  $app.innerHTML = `<div class="timer k-prep" id="timer">
    <div class="t-top"><span id="t-block"></span><span id="t-count"></span></div>
    <div class="t-mid"><div class="t-blockname" id="t-blockname"></div><div class="t-round" id="t-round"></div><div class="t-label" id="t-label"></div><div class="t-time" id="t-time">0:00</div><div class="t-target" id="t-target"></div><div class="t-sub" id="t-sub"></div></div>
    <div class="t-next" id="t-next"></div>
    <div class="t-bar"><i id="t-bar"></i></div>
    <div class="t-btns"><button data-act="tprev">Zurück</button><button class="main" data-act="tpause" id="t-play">Pause</button><button data-act="tnext">Weiter</button></div>
    <button class="t-exit" data-act="texit">Abbrechen</button>
    ${isTest ? `<div class="t-entry" id="t-entry" hidden role="group" aria-label="Wert des Sprints eintragen">
      <div class="te-head"><span id="te-title"></span><button data-act="te-close" aria-label="Fenster schließen">✕</button></div>
      <div class="te-row"><input id="te-in" type="number" inputmode="numeric" min="100" max="3000" step="1" placeholder="Watt" aria-label="Höchster Wert in Watt"><button class="main" data-act="te-ok">OK</button></div>
    </div>` : ''}
  </div>`;
  const q = (i) => document.getElementById(i);
  const el = { box: q('timer'), block: q('t-block'), count: q('t-count'), label: q('t-label'), blockname: q('t-blockname'), round: q('t-round'), time: q('t-time'), target: q('t-target'), sub: q('t-sub'), next: q('t-next'), bar: q('t-bar'), play: q('t-play') };

  let i = resumeAt ? resumeAt.i : 0;
  let elapsed = resumeAt ? Math.max(0, Math.min(Number(resumeAt.elapsed) || 0, segs[i].secs * 1000)) : 0; // ms im aktuellen Segment
  let last = Date.now();
  // Neue Einheit: erst das Video (iPhone-App mit Werbung, in der Web-Version ein Platzhalter nur für Admins). Das erste Training ist gratis, Abo, Verein und Trainer sehen keine Werbung.
  let adGate = !resumeAt && adDue(id) && ((AD_ENABLED && Boolean(nativePlugin('AdMob'))) || adPlaceholderOn());
  let adBusy = false;
  let paused = !actx || Boolean(resumeAt) || adGate; // nach dem Fortsetzen wartet der Timer auf „Fortsetzen“
  // Messung für die Traineransicht (alles in Echtzeit, unabhängig von ?speed=): gelaufene Zeit, Sprünge, Pausen, App verlassen
  let started = !paused; // Training hat wirklich begonnen (erster Start gedrückt)
  let startedIso = started ? new Date().toISOString() : '';
  let act = 0; // ms, in denen der Timer sichtbar und ohne Pause lief
  let skip = 0; // Tipps auf „Weiter“ oder „Zurück“
  let pz = 0; // Zahl der Pausen
  let pzMs = 0;
  let pauseAt = 0;
  let bg = 0; // Zahl der Male, die die App länger als 3 Sekunden verlassen wurde (Handy gesperrt, andere App)
  let bgMs = 0;
  let hiddenAt = 0;
  let finished = false;
  let awaitingLast = false; // Fitness-Test: Eingabefenster für den dritten Sprint ist offen, die Seite mit den drei Werten folgt erst danach
  let lastShownSec = -1;
  let beepedAt = -1;
  let knocked = new Set(); // Sekunden (10, 9, 8), zu denen in dieser Pause schon geklopft wurde
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function cue(seg) {
    if (seg.kind === 'work' || seg.kind === 'easy') {
      beep(1100, 420);
      vib([350]);
    } else if (seg.kind === 'rest') {
      beep(520, 300);
      vib([160]);
    }
  }

  // Die große Wattzahl so verkleinern, dass sie in die Breite passt (z. B. „540–900 W“ auf schmalen Handys)
  function fitTarget() {
    const t = el.target;
    t.style.fontSize = '';
    let size = parseFloat(getComputedStyle(t).fontSize);
    // Breite des Textes samt Innenabstand links und rechts gegen die Box messen (scrollWidth zählt den rechten Abstand je nach Browser nicht mit)
    const range = document.createRange();
    const fits = () => {
      const cs = getComputedStyle(t);
      range.selectNodeContents(t);
      return range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) <= t.clientWidth + 1 && t.scrollWidth <= t.clientWidth + 1;
    };
    for (let n = 0; n < 60 && !fits() && size > 24; n++) {
      size *= 0.94;
      t.style.fontSize = `${size}px`;
    }
  }

  // Fitness-Test: Nach jedem Sprint öffnet sich in der Pause ein Fenster für den höchsten Wert.
  // Es schließt sich 10 s vor Ende der Pause oder früher über das ✕.
  const entry = isTest ? { box: q('t-entry'), title: q('te-title'), input: q('te-in'), n: 0 } : null;
  const sprintNo = (k) => segs.slice(0, k + 1).filter((s) => s.label === 'Test-Sprint').length;
  const validWatt = (v) => v >= 100 && v <= 3000;
  function placeEntry() {
    if (!entry || entry.box.hidden) return;
    entry.box.style.bottom = `${Math.max(8, el.box.clientHeight - el.bar.parentElement.offsetTop + 8)}px`;
  }
  function hideEntry() {
    if (!entry) return;
    entry.input.blur();
    entry.box.hidden = true;
  }
  function showEntry(n) {
    entry.n = n;
    entry.title.textContent = `Sprint ${n}: Höchster Wert?`;
    entry.input.value = entered[n - 1] ?? '';
    entry.input.classList.remove('bad');
    entry.box.hidden = false;
    placeEntry();
  }
  function entryOk() {
    const v = Math.round(Number(entry.input.value));
    if (!validWatt(v)) {
      entry.input.classList.add('bad');
      return;
    }
    entered[entry.n - 1] = v;
    hideEntry();
    if (awaitingLast) {
      awaitingLast = false;
      renderFinish();
    }
  }
  function entryClose() {
    const v = Math.round(Number(entry.input.value));
    if (validWatt(v)) entered[entry.n - 1] = v; // schon Eingetipptes nicht verlieren
    hideEntry();
    if (awaitingLast) {
      awaitingLast = false;
      renderFinish(); // wer das Fenster schließt, kann die Werte auf der nächsten Seite eintragen
    }
  }
  if (entry) {
    entry.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') entryOk();
    });
    entry.input.addEventListener('input', () => entry.input.classList.remove('bad'));
    window.addEventListener('resize', placeEntry);
  }

  function paintSegment() {
    const seg = segs[i];
    el.box.className = `timer k-${seg.kind}`;
    setChrome(seg.kind);
    el.block.textContent = seg.kind === 'prep' ? session.title : `${seg.block}${seg.reps > 1 ? ` · ${seg.rep}/${seg.reps}` : ''}`;
    el.count.textContent = `${i + 1} / ${segs.length}`;
    el.blockname.textContent = seg.kind === 'prep' || seg.block.toLowerCase() === seg.label.toLowerCase() ? '' : seg.block;
    el.round.textContent = seg.kind !== 'prep' && seg.reps > 1 ? `Runde ${seg.rep} von ${seg.reps}` : '';
    el.label.textContent = seg.label.toLowerCase() === seg.target.main.toLowerCase() || (seg.kind === 'rest' && seg.label === 'Pause') ? '' : seg.label;
    el.target.textContent = seg.target.main;
    fitTarget();
    el.sub.textContent = seg.target.sub;
    const nx = segs[i + 1];
    el.next.textContent = nx ? (nx.kind === 'rest' ? `Danach: Pause · ${fmtSecs(nx.secs)}` : `Danach: ${nx.label.replace(/^\d+(?:[.,]\d+)?\s*(?:s|min)\s+/i, '')} · ${fmtSecs(nx.secs)} · ${nx.target.main.replace(/ W$/, '\u00A0W')}`) : 'Letztes Intervall';
    lastShownSec = -1;
    beepedAt = -1;
    knocked = new Set();
    if (entry) {
      if (seg.kind === 'rest' && i > 0 && segs[i - 1].label === 'Test-Sprint') showEntry(sprintNo(i - 1));
      else hideEntry();
    }
  }

  function paintTime() {
    const seg = segs[i];
    const remain = Math.max(0, Math.ceil((seg.secs * 1000 - elapsed) / 1000));
    if (entry && !entry.box.hidden && remain <= 10) entryClose(); // 10 s vor Ende der Pause: Fenster weg, Sprint wird sichtbar
    if (remain !== lastShownSec) {
      lastShownSec = remain;
      el.time.textContent = fmt(remain);
      if (!finished) writeRun({ id, i, elapsed: Math.round(elapsed), t: Date.now() }); // Stand merken, einmal pro Sekunde
      // Dreimaliges Klopfen, je ein Schlag pro Sekunde (bei 10, 9 und 8 Sekunden Rest einer Pause), wie im Boxen das Zeichen für die nächste Runde.
      // Nur bei Pausen über 10 s, nicht bei angehaltenem Timer, jeder Schlag nur einmal pro Pause.
      if (seg.kind === 'rest' && seg.secs > 10 && remain <= 10 && remain >= 8 && !knocked.has(remain) && !paused) {
        knocked.add(remain);
        knock(10 - remain);
        vib([50]);
      }
      if (seg.secs > 5 && remain >= 1 && remain <= 3 && beepedAt !== remain && !paused) {
        beepedAt = remain;
        beep(820, 90, 0.9);
        vib([40]);
      }
    }
    const doneMs = segs.slice(0, i).reduce((a, s) => a + s.secs * 1000, 0) + Math.min(elapsed, seg.secs * 1000);
    el.bar.style.width = `${Math.min(100, (doneMs / (total * 1000)) * 100)}%`;
  }

  // Stand dieser Einheit in den gespeicherten Stand schreiben (state.runs), damit der Trainer ihn sieht.
  // „voll trainiert“ heißt: bis zum Ende gelaufen, geplante Zeit komplett gelaufen, nichts übersprungen, keine Pause, App nicht verlassen.
  function snapRun(final) {
    if (!started) return;
    const nowMs = Date.now();
    const rec = {
      t: String(session.title || '').slice(0, 60),
      s: startedIso,
      e: final ? new Date(nowMs).toISOString() : '',
      act: Math.round(act / 1000),
      plan: Math.round(total),
      skip,
      pz,
      pzs: Math.round((pzMs + (pauseAt ? nowMs - pauseAt : 0)) / 1000),
      bg,
      bgs: Math.round(bgMs / 1000),
      res: resumeAt ? 1 : 0,
      fin: Boolean(final),
    };
    rec.full = rec.fin && rec.skip === 0 && rec.pz === 0 && rec.bg === 0 && rec.res === 0 && rec.act >= rec.plan - 3;
    if (state.runs && state.runs[id] && state.runs[id].sv) rec.sv = state.runs[id].sv;
    state.runs = state.runs || {};
    state.runs[id] = rec;
    const keys = Object.keys(state.runs);
    if (keys.length > 40) {
      keys.sort((a, b) => (String(state.runs[a].s) < String(state.runs[b].s) ? -1 : 1));
      for (const k of keys.slice(0, keys.length - 40)) delete state.runs[k];
    }
    save();
  }

  function finish() {
    finished = true;
    snapRun(true);
    writeRun(null);
    unlockScreen();
    beep(900, 180);
    setTimeout(() => beep(1100, 180), 240);
    setTimeout(() => beep(1400, 360), 480);
    vib([200, 100, 200, 100, 400]);
    el.box.className = 'timer k-done';
    setChrome('done');
    if (isTest && !entered[2]) {
      // Fitness-Test: Auch nach dem dritten Sprint kommt zuerst das Eingabefenster. Erst wenn der Wert eingetragen ist, folgt die Seite mit den drei Werten.
      awaitingLast = true;
      el.block.textContent = '';
      el.count.textContent = '';
      el.blockname.textContent = '';
      el.round.textContent = '';
      el.label.textContent = 'Test geschafft';
      el.time.textContent = '';
      el.target.textContent = '';
      el.target.style.fontSize = '';
      el.sub.textContent = 'Trag den höchsten Wert des dritten Sprints ein.';
      el.next.textContent = '';
      const btns = el.box.querySelector('.t-btns');
      if (btns) btns.style.display = 'none';
      showEntry(3);
      return;
    }
    renderFinish();
  }

  function renderFinish() {
    if (session.type === 'test') {
      el.box.innerHTML = `<div class="t-mid"><div class="t-label">Test geschafft</div><div class="t-target">Deine drei Werte?</div>
        <div class="t-sub">${entered.every(Boolean) ? 'Kontrolliere deine drei Werte und speichere sie.' : 'Trage den höchsten Wert jedes Sprints ein.'}</div>
        <div class="tw-wrap">${sprintInputs('tw')}</div></div>
        <div class="btn-row"><button class="main" style="background:#fff;color:#111" data-act="savetest">Speichern</button></div>
        <button class="t-exit" data-act="texit">Ohne Speichern zurück</button>`;
      entered.forEach((v, k) => {
        if (v) document.getElementById(`tw${k + 1}`).value = v;
      });
      return;
    }
    el.box.innerHTML = `<div class="t-mid"><div class="t-label">Geschafft</div><div class="t-target">${esc(session.title)}</div><div class="t-sub">Gut gemacht. Trinken, locker auslaufen lassen und kurz notieren, wie es sich angefühlt hat.</div></div>
      <div class="btn-row"><button class="main" style="background:#fff;color:#111" data-act="tdone" data-id="${esc(id)}">Als erledigt markieren</button></div>
      <button class="t-exit" data-act="texit">Ohne Markieren zurück</button>`;
  }

  function goto(n) {
    if (n < 0) n = 0;
    if (n >= segs.length) {
      finish();
      return;
    }
    i = n;
    elapsed = 0;
    paintSegment();
    cue(segs[i]);
    paintTime();
  }

  function tick() {
    const now = Date.now();
    const real = now - last;
    const dt = real * speed;
    last = now;
    if (paused || finished) return;
    if (!document.hidden) act += Math.min(real, 1000); // Echtzeit, in der der Timer sichtbar lief (ein Sprung nach langem Hintergrund zählt höchstens eine Sekunde)
    elapsed += dt;
    let moved = false;
    while (!finished && elapsed >= segs[i].secs * 1000) {
      const carry = elapsed - segs[i].secs * 1000;
      if (i + 1 >= segs.length) {
        finish();
        return;
      }
      i += 1;
      elapsed = carry;
      moved = true;
    }
    // Nach längerer Pause im Hintergrund nur das aktuelle Signal geben, nicht alle verpassten auf einmal
    if (moved) {
      paintSegment();
      cue(segs[i]);
    }
    paintTime();
  }

  // Video vor der Einheit. Danach wartet der Timer auf „Start“ (das Tippen weckt auch den Ton nach dem Video wieder auf).
  async function runAd() {
    if (adBusy) return;
    adBusy = true;
    paused = true;
    el.play.disabled = true;
    el.play.textContent = 'Start'; // grau und gesperrt, solange das Video läuft
    const r = await playStartAd();
    adBusy = false;
    if (!document.body.contains(el.play)) return; // Einheit inzwischen verlassen
    el.play.disabled = false;
    last = Date.now();
    if (r === 'abbruch') {
      el.play.textContent = 'Video ansehen';
      toast('Bitte sieh das Video bis zum Ende an, dann startet die Einheit.');
      return;
    }
    adGate = false;
    el.play.textContent = 'Start';
  }

  // Steuerung über globale Delegation (siehe unten)
  runCtl = {
    toggle() {
      if (adGate) {
        runAd();
        return;
      }
      ensureAudio();
      paused = !paused;
      last = Date.now();
      if (paused && started && !finished) {
        pauseAt = last;
        pz += 1;
      } else if (!paused) {
        if (pauseAt) pzMs += last - pauseAt;
        pauseAt = 0;
        if (!started) {
          started = true;
          startedIso = new Date().toISOString();
        }
      }
      el.play.textContent = paused ? 'Fortsetzen' : 'Pause';
      if (!paused) lockScreen();
    },
    prev() {
      if (finished || adGate) return;
      skip += 1;
      goto(elapsed > 2000 ? i : i - 1);
    },
    next() {
      if (finished || adGate) return;
      skip += 1;
      goto(i + 1);
    },
    awaiting: () => awaitingLast,
    entryOk: () => entry && entryOk(),
    entryClose: () => entry && entryClose(),
  };

  paintSegment();
  paintTime();
  el.play.textContent = paused ? (resumeAt ? 'Fortsetzen' : 'Start') : 'Pause';
  if (!paused) {
    lockScreen();
    last = Date.now();
  }
  if (adGate) runAd();
  const timer = setInterval(tick, 100);
  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      if (started && !finished && !paused) hiddenAt = Date.now();
      if (!finished) snapRun(false); // Zwischenstand sichern, falls die App im Hintergrund beendet wird (eine fertige Einheit nicht zu „abgebrochen“ machen)
    } else if (hiddenAt) {
      const gap = Date.now() - hiddenAt;
      hiddenAt = 0;
      if (gap > 3000) {
        bg += 1;
        bgMs += gap;
      }
    }
    if (document.visibilityState === 'visible' && !paused && !finished) {
      lockScreen();
      ensureAudio();
    }
    tick();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', fitTarget); // auch beim Drehen des Handys
  cleanup = () => {
    if (started && !finished) snapRun(false); // Einheit vorzeitig verlassen: Stand für den Trainer festhalten
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', fitTarget);
    window.removeEventListener('resize', placeEntry);
    unlockScreen();
    runCtl = null;
    writeRun(null); // Training bewusst verlassen: nichts mehr zum Fortsetzen
  };
}
const RUN_KEY = 'redline.run';
const RUN_MAX_AGE = 3 * 3600 * 1000; // länger als 3 Stunden unterbrochene Trainings werden nicht mehr angeboten
const readRun = () => {
  try {
    return JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeRun = (v) => {
  try {
    if (v) localStorage.setItem(RUN_KEY, JSON.stringify(v));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* Speicher blockiert */
  }
};
let runCtl = null;
// Der Timer zeigt die fertige Seite. Solange das Eingabefenster für den dritten Sprint offen ist, gilt er noch nicht als fertig (Abbrechen fragt nach).
const timerDone = () => Boolean(document.querySelector('.timer.k-done')) && !(runCtl && runCtl.awaiting && runCtl.awaiting());
let runHash = ''; // Adresse der laufenden Einheit (für die Rückfrage beim Verlassen)
let leaveOk = false; // Verlassen ist schon bestätigt (z. B. über „Abbrechen“)
let reloading = false;
let updatePending = false; // neue Version gefunden, während ein Training läuft

/* ---------------- Modal / Hinweis ---------------- */
/* ---------------- Kalender (.ics) ---------------- */
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
}
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ' ' + rest.slice(73);
  }
  out.push(rest);
  return out.join('\r\n');
}
function buildICS() {
  const p = plan();
  const today = startOfDay(new Date());
  const [hh, mm] = (state.time || '18:00').split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NonstopBoxing//DE', 'CALSCALE:GREGORIAN'];
  p.weeks.forEach((w) => {
    weekOrder(w).forEach((s) => {
      const d = sessionDate(w, dayOf(s));
      if (!d || d < today || tooCloseToFight(d, p.fight)) return;
      const dt = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
      const durMin = Math.max(15, Math.ceil(sessionSecs(s) / 300) * 5); // echte Länge der Einheit, auf 5 Minuten aufgerundet
      lines.push(
        'BEGIN:VEVENT',
        `UID:redline-${s.id}@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dt}`,
        `DURATION:PT${durMin}M`,
        fold(`SUMMARY:${icsEscape(`Nonstop Boxing W${w.n}: ${s.title}`)}`),
        fold(`DESCRIPTION:${icsEscape(s.focus)}`),
        'BEGIN:VALARM',
        'TRIGGER:PT0S',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape('Nonstop Boxing Training')}`,
        'END:VALARM',
        'END:VEVENT',
      );
    });
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n'; // die Datei muss mit einem Zeilenumbruch enden
}
async function download(name, text, type) {
  // iPhone-App: Datei in den Zwischenspeicher schreiben und das Teilen-Menü öffnen (dort „In Dateien sichern“, „Kalender“ usw.)
  const fs = nativePlugin('Filesystem');
  const share = nativePlugin('Share');
  if (fs && share) {
    try {
      const f = await fs.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await share.share({ title: name, url: f.uri });
    } catch (e) {
      if (!/cancel/i.test(String((e && e.message) || e))) alert('Die Datei konnte nicht gespeichert werden. Bitte versuche es noch einmal.');
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- In-App-Hinweis ---------------- */
let reminderTimer = null;
// iPhone-App: Das Apple-Fenster „Mitteilungen erlauben?“ zeigt iOS nur ein einziges Mal. Wurde es abgelehnt, hilft nur der Weg über die iPhone-Einstellungen.
// Dann zeigen wir einen Hinweis mit Knopf „Einstellungen öffnen“ und schalten die Erinnerungen von selbst ein, sobald man mit Erlaubnis zurückkommt.
let notifHint = false;
let awaitingNotif = false;
async function enableNativeNotif() {
  const ln = nativePlugin('LocalNotifications');
  if (!ln) return;
  try {
    let st = await ln.checkPermissions();
    let disp = st && st.display;
    if (disp === 'prompt' || disp === 'prompt-with-rationale') {
      st = await ln.requestPermissions();
      disp = st && st.display;
    }
    if (disp === 'granted') {
      state.notify = true;
      notifHint = false;
      awaitingNotif = false;
    } else {
      state.notify = false;
      notifHint = true;
      awaitingNotif = true;
    }
    save();
    scheduleReminder();
    route();
    // Schon abgelehnt: gleich nach dem Tippen ein Fenster, das zu den Einstellungen der App führt (so machen es auch andere iPhone-Apps)
    if (!state.notify && confirm('Mitteilungen sind für Nonstop Boxing ausgeschaltet. Das iPhone fragt nur einmal. Jetzt die Einstellungen öffnen und Mitteilungen einschalten?')) openAppSettings();
  } catch (e) {
    alert(`Die Erlaubnis für Mitteilungen konnte nicht abgefragt werden. Bitte versuche es noch einmal. (${String((e && e.message) || e).slice(0, 80)})`);
  }
}
function openAppSettings() {
  // springt direkt zu den Einstellungen dieser App (dort Mitteilungen einschalten); Capacitor-Paket @capacitor/app-launcher, Methode openUrl
  const hand = () => alert('Öffne bitte die iPhone-Einstellungen, wähle Nonstop Boxing und schalte Mitteilungen ein.');
  const launcher = nativePlugin('AppLauncher');
  if (!launcher || typeof launcher.openUrl !== 'function') {
    hand();
    return;
  }
  try {
    launcher.openUrl({ url: 'app-settings:' }).catch(hand);
  } catch {
    hand();
  }
}
async function recheckNotifPermission() {
  if (!awaitingNotif) return;
  const ln = nativePlugin('LocalNotifications');
  if (!ln) return;
  try {
    const st = await ln.checkPermissions();
    if (st && st.display === 'granted') {
      awaitingNotif = false;
      notifHint = false;
      state.notify = true;
      save();
      scheduleReminder();
      route();
      toast('Erinnerungen sind an');
    }
  } catch {
    /* später noch einmal */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recheckNotifPermission();
});
window.addEventListener('focus', recheckNotifPermission);
// iPhone-App: Erinnerungen als echte Mitteilungen des Geräts, auch bei geschlossener App. Geplant werden die nächsten offenen Einheiten.
let nativeReminderRun = Promise.resolve();
function scheduleNativeReminders() {
  const ln = nativePlugin('LocalNotifications');
  if (!ln) return;
  nativeReminderRun = nativeReminderRun.then(async () => {
    try {
      const pending = await ln.getPending();
      if (pending && pending.notifications && pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      if (!state.notify) return;
      const [hh, mm] = (state.time || '18:00').split(':').map(Number);
      const list = [];
      for (const w of plan().weeks) {
        if (!w.monday) continue;
        for (const s of weekOrder(w)) {
          if (isDone(s.id)) continue;
          const d = sessionDate(w, dayOf(s));
          if (!d || tooCloseToFight(d, plan().fight)) continue;
          const at = new Date(d);
          const tw = TRAIN_WHEN[state.when];
          if (tw) {
            // Je nach Trainingszeit: am Trainingstag morgens (abends trainieren) oder am Vorabend (morgens und mittags trainieren)
            if (tw.before) at.setDate(at.getDate() - 1);
            at.setHours(tw.at[0], tw.at[1], 0, 0);
          } else {
            at.setHours(hh, mm, 0, 0);
          }
          if (at.getTime() > Date.now()) list.push({ at, body: tw ? `${tw.lead}: ${s.title}. ${tw.tip}` : `Heute: ${s.title}` });
        }
      }
      list.sort((a, b) => a.at - b.at);
      // badge: 1 = rote Zahl auf dem App-Symbol, bis die App geöffnet wird (dann löscht clearNativeBadge sie wieder)
      const notifications = list.slice(0, 30).map((n, i) => ({ id: i + 1, title: 'Nonstop Boxing', body: n.body, badge: 1, schedule: { at: n.at } }));
      // Wiedersehens-Hinweise: nach 3 und nach 7 Tagen ohne Öffnen der App. Bei jedem Öffnen und Verlassen der App werden sie neu geplant, kommen also nur, wenn man wirklich weg war.
      const next = nextOpenSession();
      if (next) {
        const nudge = (days, id, body) => {
          const at = new Date(Date.now() + days * 864e5);
          if (TRAIN_WHEN[state.when]) at.setHours(8, 0, 0, 0);
          else at.setHours(hh, mm, 0, 0);
          if (at.getTime() > Date.now()) notifications.push({ id, title: 'Nonstop Boxing', body, badge: 1, schedule: { at } });
        };
        nudge(3, 101, `Dein nächstes Training wartet: ${next.title}`);
        nudge(7, 102, 'Du warst eine Woche nicht da. Eine Einheit hält dich im Plan.');
      }
      // Einmalige Erinnerung 24 Stunden nach der Bestätigung des Kontos: Einrichtung noch offen oder noch kein Fitness-Test
      const first = setupNudge();
      if (first) notifications.push({ id: 103, title: 'Nonstop Boxing', body: first.body, badge: 1, schedule: { at: first.at } });
      if (notifications.length) await ln.schedule({ notifications });
    } catch {
      /* Erinnerungen nicht möglich, die App läuft trotzdem weiter */
    }
  });
}
// Erinnerung für neue Konten: 24 Stunden nach der Bestätigung, falls die Einrichtung (Kampftermin, Trainingstage) noch offen ist
// oder zwar eingerichtet, aber weder Fitness-Test noch Einheit gemacht wurde. Geplant wird sie bei jedem Öffnen und Verlassen der App neu,
// der Zeitpunkt bleibt dabei fest (Bestätigung + 24 Stunden). Ist der Stand schon erledigt oder die Zeit vorbei, entfällt sie.
function setupNudge() {
  const since = account && account.since;
  if (!since) return null;
  const at = new Date(since + 864e5);
  if (at.getTime() <= Date.now()) return null;
  if (!state.onboarded) return { at, body: 'Dein Plan wartet noch. Trag deinen Kampftermin und deine Trainingstage ein, dann kann es losgehen.' };
  if (!state.maxW && !Object.keys(state.done || {}).length) return { at, body: 'Mach deinen Fitness-Test, etwa 10 Minuten. Danach zeigt dir die App deine Watt-Ziele.' };
  return null;
}
// Kurzer Stand für die Traineransicht (steht im gespeicherten Stand des Boxers als state.ti):
// Woche und Phase, erledigte Einheiten, die Einheit von heute, Zeitpunkt der letzten Einheit und der erste Planungstag danach, den er nicht trainiert hat.
function computeTi() {
  const p = plan();
  const today = startOfDay(new Date());
  const cw = currentWeek();
  let todayS = null;
  let nextS = null;
  const doneAt = Object.values(state.done || {}).filter(isIso).sort();
  const last = doneAt.length ? doneAt[doneAt.length - 1] : '';
  const lastDay = last ? startOfDay(new Date(last)) : null;
  let missed = null;
  // Gezählt wird erst ab dem Tag, an dem dieser Plan zum ersten Mal erfasst wurde. Sonst stünde bei einem neuen Boxer oder einem neuen Plan
  // sofort „nicht trainiert“ für Tage, die schon vorbei waren, bevor er sich eingerichtet hat.
  const old = state.ti;
  const pk = [state.planBase, state.fightDate, state.startDate, userFreq()].join('|');
  const since = old && old.pk === pk && isIso(old.since) ? old.since : new Date().toISOString();
  const floor = startOfDay(new Date(since));
  for (const w of p.weeks) {
    if (!w.monday) continue;
    for (const s of weekOrder(w)) {
      const d = sessionDate(w, dayOf(s));
      if (!d || tooCloseToFight(d, p.fight)) continue;
      const dd = startOfDay(d);
      if (dd.getTime() === today.getTime() && !todayS) todayS = { id: s.id, title: String(s.title).slice(0, 60), secs: sessionSecs(s) };
      if (!isDone(s.id) && dd >= floor) {
        if (!nextS) nextS = { title: String(s.title).slice(0, 60), day: ymd(dd) }; // erste offene Einheit: der Trainer rechnet damit selbst, auch wenn der Boxer die App nie wieder öffnet
        if (dd < today && (!lastDay || dd > lastDay) && !missed) missed = ymd(dd);
      }
    }
  }
  return { at: new Date().toISOString(), week: cw ? cw.n : 0, phase: cw ? String(cw.phase).slice(0, 40) : '', done: doneInPlan(), total: allSessions().length, today: todayS, next: nextS, last, missed, fight: state.fightDate || '', pk, since };
}
let tiBusy = false;
function updateTrainerInfo() {
  if (!account || tiBusy) return;
  tiBusy = true;
  try {
    const ti = computeTi();
    const old = state.ti;
    const key = (x) => {
      if (!x) return '';
      const { at, ...rest } = x;
      return JSON.stringify(rest);
    };
    if (!old || key(ti) !== key(old) || Date.now() - (Date.parse(old.at) || 0) > 6 * 36e5) {
      state.ti = ti;
      save();
    }
  } catch {
    /* ohne Trainer-Info läuft alles weiter */
  } finally {
    tiBusy = false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.querySelector('.timer')) updateTrainerInfo();
});
// Die nächste noch nicht erledigte Einheit im Plan (für den Wiedersehens-Hinweis)
function nextOpenSession() {
  for (const w of plan().weeks) {
    for (const s of weekOrder(w)) if (!isDone(s.id)) return s;
  }
  return null;
}
// Beim Öffnen der App: rote Zahl auf dem Symbol und angezeigte Hinweise löschen, Wiedersehens-Hinweise ab jetzt neu zählen
function clearNativeBadge() {
  const ln = nativePlugin('LocalNotifications');
  if (!ln) return;
  try {
    ln.removeAllDeliveredNotifications().catch(() => {});
  } catch {
    /* kein Problem, die Zahl bleibt dann stehen */
  }
}
document.addEventListener('visibilitychange', () => {
  if (!nativePlugin('LocalNotifications')) return;
  if (document.visibilityState === 'visible') clearNativeBadge();
  if (state.notify) scheduleReminder();
});
// Einmalige Frage, ob die App erinnern darf (das iPhone zeigt sein eigenes Fenster nur ein einziges Mal, deshalb erst unsere Frage)
const NOTIFASK_KEY = 'redline.notifask';
/* ---------------- Vereinscode: Frage nach der Einrichtung und Hinweis auf der Startseite ---------------- */
const CLUBASK_KEY = 'redline.clubask';
const CLUBHIDE_KEY = 'redline.clubhide';
let clubInfo = { loaded: false, access: null, trainer: false };
// Zahlen für die Startseite des Trainers: Paketgröße, angelegte und eingelöste Plätze (aus gym_laden)
const clubSeats = (d) => ({
  seatsTotal: d ? Number(d.plaetze_gesamt) || 0 : 0,
  seatsCount: d && Array.isArray(d.plaetze) ? d.plaetze.length : 0,
  seatsRedeemed: d && Array.isArray(d.plaetze) ? d.plaetze.filter((s) => s.belegt).length : 0,
  probe: d && d.probe ? String(d.probe) : '', // Verein ohne Paket: 'keine' (Testwoche nicht gestartet), 'laeuft' oder 'vorbei'
  testBis: d && d.test_bis ? new Date(d.test_bis).getTime() : 0,
});
// Tage bis zum Ende der Testwoche (angefangene Tage zählen)
const testDays = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / DAY));
const testDaysText = (ms) => { const n = testDays(ms); return n <= 1 ? 'noch 1 Tag' : `noch ${n} Tage`; };
async function loadClubInfo() {
  if (!account) return;
  try {
    const [g, a] = await withTimeout(Promise.all([cloud.gymLoad(), cloud.gymAccess()]), 8000);
    if (g.error || a.error) return;
    clubInfo = { loaded: true, access: a.data || null, trainer: Boolean(g.data), attention: clubInfo.attention || 0, ...clubSeats(g.data) };
    if (clubInfo.trainer) loadTrainerAttention();
    if (['', '#', '#/', '#/profile'].includes(location.hash) && !document.querySelector('.timer') && !document.getElementById('onboard')) route();
  } catch {
    /* ohne Verbindung bleibt der Hinweis einfach weg */
  }
}
// Nach einer erledigten Einheit: Stand sichern und den Vereinsstand neu laden (ist die Testwoche vorbei, setzt die Werbung dann sofort ein)
async function refreshClubAfterUnit() {
  if (!account || !(clubInfo.trainer || clubInfo.access)) return;
  try {
    await withTimeout(pushNow(), 15000);
  } catch {
    /* ohne Verbindung klappt es beim nächsten Start */
  }
  loadClubInfo();
}
function clubHomeHtml() {
  if (account && account.isAdmin) return ''; // Admin: Vereinsdetails nur im Admin-Bereich
  if (clubInfo.loaded && clubInfo.trainer) {
    if (clubInfo.attention) return `<a class="card link accent row" href="#/profile"><span class="grow"><span class="kicker">Trainer</span><br><b>Aufmerksamkeit nötig: ${clubInfo.attention} ${clubInfo.attention === 1 ? 'Boxer' : 'Boxer'}</b><br><span class="muted small">Seit 3 Tagen oder länger nicht trainiert.</span></span><span class="chev" aria-hidden="true">›</span></a>`;
    const t = clubInfo.seatsTotal || 0;
    const c = clubInfo.seatsCount || 0;
    let head = '';
    let sub = '';
    if (!t && clubInfo.probe === 'laeuft') {
      const left = `Testwoche: ${testDaysText(clubInfo.testBis)}.`;
      head = c ? (clubInfo.seatsRedeemed ? left : 'Nächster Schritt: Codes weitergeben') : 'Nächster Schritt: Boxer anlegen';
      sub = c ? (clubInfo.seatsRedeemed ? 'Danach brauchst du das Paket, sonst trainiert ihr mit Werbung oder Abo.' : `${left} Noch hat niemand seinen Code eingelöst.`) : `${left} Lege deinen ersten Boxer an und schicke ihm den Code.`;
    } else if (!t && clubInfo.probe === 'vorbei') {
      head = 'Testwoche vorbei';
      sub = 'Mit dem Paket trainieren du und deine Boxer wieder ohne Werbung. Die Codes bleiben gültig.';
    } else if (!t) {
      head = 'Testwoche starten';
      sub = 'Wähle ein Paket und teste es sieben Tage ohne Bezahlung.';
    } else if (!c) {
      head = 'Nächster Schritt: Boxer anlegen';
      sub = `0 von ${t} Boxern angelegt. Lege den ersten Boxer an und schicke ihm den Code.`;
    } else if (!clubInfo.seatsRedeemed) {
      head = 'Nächster Schritt: Codes weitergeben';
      sub = `${c} von ${t} Boxern angelegt. Noch hat niemand seinen Code eingelöst.`;
    } else return '';
    return `<a class="card link accent row" href="#/verein"><span class="grow"><span class="kicker">Dein Verein</span><br><b>${head}</b><br><span class="muted small">${sub}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  }
  if (!clubInfo.loaded) return '';
  if (clubInfo.access && clubInfo.access.art === 'probe_vorbei') return `<a class="card link row" href="#/verein"><span class="grow"><span class="chip amber">Testwoche vorbei</span> <b>${esc(clubInfo.access.verein)}</b><br><span class="muted small">Du trainierst jetzt mit Werbung oder Abo, bis dein Trainer das Paket gekauft hat.</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  if (clubInfo.access) return `<a class="card link row" href="#/verein"><span class="grow"><span class="chip ok">Dein Verein</span> <b>${esc(clubInfo.access.verein)}</b><br><span class="muted small">Du trainierst ohne Werbung.</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  let hidden = false;
  try {
    hidden = Boolean(localStorage.getItem(CLUBHIDE_KEY));
  } catch {
    /* Speicher nicht verfügbar */
  }
  if (hidden) return '';
  return `<div class="card"><b>Du hast einen Vereinscode?</b><p class="muted small" style="margin:6px 0 0">Dein Trainer gibt ihn dir. Dann trainierst du über deinen Verein, ohne Werbung.</p><div class="btn-row"><a class="btn primary" href="#/verein">Code eingeben</a><button class="ghost" data-act="club-hide">Ausblenden</button></div></div>`;
}
async function maybeAskClub() {
  if (readPendClub()) return maybeAskNotif(); // wer sich als Verein registriert hat, wird nicht nach einem Vereinscode gefragt
  if (!account || document.getElementById('clubask') || document.getElementById('onboard') || document.body.classList.contains('running')) return maybeAskNotif();
  try {
    if (localStorage.getItem(CLUBASK_KEY)) return maybeAskNotif();
    localStorage.setItem(CLUBASK_KEY, '1');
  } catch {
    return maybeAskNotif();
  }
  if (!clubInfo.loaded) await loadClubInfo();
  if (clubInfo.access || clubInfo.trainer || account.isAdmin) return maybeAskNotif();
  const box = document.createElement('div');
  box.id = 'clubask';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Vereinscode');
  box.innerHTML = `<b>Hast du einen Vereinscode?</b><p class="muted small">Dein Trainer gibt dir den Code. Dann trainierst du über deinen Verein, ohne Werbung. Ohne Code geht es einfach weiter.</p><label for="clubCode" class="small" style="margin:0 0 4px">Vereinscode</label><input id="clubCode" type="text" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"><p id="clubMsg" class="small" role="alert" style="color:#ff8b99;margin:8px 0 0" hidden></p><div class="btn-row"><button class="primary" data-act="club-ask-go">Code einlösen</button><button class="ghost" data-act="club-ask-later">Ich habe keinen Code</button></div>`;
  document.body.appendChild(box);
}
async function clubAskGo() {
  const el = document.getElementById('clubCode');
  const msg = document.getElementById('clubMsg');
  if (!el || !msg || el.disabled) return;
  el.disabled = true;
  msg.hidden = true;
  try {
    const { data, error } = await withTimeout(cloud.gymRedeem(el.value), 12000);
    if (error || (data && data.fehler)) {
      msg.textContent = error ? gymErr(error) : String(data.fehler); // data.fehler: Falscheingaben meldet die Datenbank als Antwort, damit sie mitgezählt werden (Versuchslimit)
      msg.hidden = false;
      el.disabled = false;
      return;
    }
    document.getElementById('clubask')?.remove();
    toast('Code eingelöst');
    clubInfo = { loaded: false, access: null, trainer: false };
    await loadClubInfo();
    setTimeout(maybeAskNotif, 600);
  } catch {
    msg.textContent = gymErr(null);
    msg.hidden = false;
    el.disabled = false;
  }
}
// Verein-Registrierung: Nach der Anmeldung wird das gewählte Paket bestätigt (Kauf, in der Web-Version nur gespielt für Admins und Testkonten). Erst danach wird der Verein angelegt.
function readPendClub() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDCLUB_KEY) || 'null');
    return p && p.name && account && String(p.email) === String(account.email || '').toLowerCase() ? p : null;
  } catch {
    return null;
  }
}
const CLUBSKIP_KEY = 'redline.clubskip';
function dropPendClub(skip = false) {
  try {
    localStorage.removeItem(PENDCLUB_KEY);
    if (skip && account) localStorage.setItem(CLUBSKIP_KEY, String(account.email || '').toLowerCase());
  } catch {
    /* Speicher nicht verfügbar */
  }
}
// Neues Konto auf einem anderen Gerät: Der Vereinswunsch steht auch in den Kontodaten (user_metadata), nur für Konten der letzten zwei Tage und nicht nach „Später“
function adoptMetaClub(user) {
  try {
    const m = (user && user.user_metadata) || {};
    if (!m.club_name || !account || account.since < Date.now() - 2 * DAY) return null;
    const email = String(account.email || '').toLowerCase();
    if (localStorage.getItem(CLUBSKIP_KEY) === email) return null;
    const p = { name: String(m.club_name).slice(0, 60), pkg: [3, 5, 10].includes(Number(m.club_pkg)) ? Number(m.club_pkg) : 5, email };
    localStorage.setItem(PENDCLUB_KEY, JSON.stringify(p));
    return p;
  } catch {
    return null;
  }
}
// Nach der Anmeldung als Verein: sofort die Seite „Paket bestätigen“ (keine Einführung für Privatpersonen)
async function openClubSignup() {
  if (!account || !readPendClub()) return;
  if (!clubInfo.loaded) await loadClubInfo();
  if (clubInfo.loaded && (clubInfo.access || clubInfo.trainer)) {
    dropPendClub(); // hat schon einen Verein
    if (location.hash === '#/paket') {
      location.hash = '#/verein';
      route();
    }
    return;
  }
  if (document.querySelector('.timer')) return;
  location.hash = '#/paket';
  route();
}
function viewPaket() {
  const p = readPendClub();
  if (!account || !p) return '<a href="#/" class="back">← Zurück</a><h1>Testwoche starten</h1><div class="notice">Es gibt keinen offenen Vereinswunsch.</div>';
  const pk = PAKETE.find((x) => x.n === p.pkg) || PAKETE[1];
  const feat = '<ul class="feat"><li>Ein Platz mit eigenem Code für jeden Boxer</li><li>Traineransicht: Stand, Aufmerksamkeit, letzte Einheiten</li><li>Alle Boxer trainieren ohne Werbung</li><li><b>Dazu für dich:</b> Du als Trainer trainierst selbst auch ohne Werbung und ohne eigenes Abo mit</li></ul>';
  return `<h1>Testwoche starten</h1><p class="muted">Dein Verein „${esc(p.name)}“ wird angelegt. Teste dein Paket eine Woche kostenlos.</p>
  <div class="card"><div class="row between"><b>Paket mit ${pk.n} Boxern und dir</b><b>${pk.preis}</b></div><span class="muted small">${pk.je} je Boxer, Jahresabo, jederzeit kündbar. Die erste Woche ist kostenlos.</span>${feat}</div>
  <div class="notice"><b>Du und deine Boxer trainieren sieben Tage ohne Werbung.</b><br>Danach brauchst du das Paket. Ohne Paket trainiert ihr mit Werbung oder Abo weiter. Der Kauf kommt mit der iPhone-App.</div>
  <button class="primary block" style="margin-top:6px" data-act="clubbuy-go">Eine Woche kostenlos testen</button>
  <button class="ghost block" style="margin-top:14px" data-act="clubbuy-later">Später</button>`;
}
async function clubBuyGo() {
  const p = readPendClub();
  if (!p) return;
  const btn = document.querySelector('[data-act="clubbuy-go"]');
  if (btn) btn.disabled = true;
  try {
    const r = await withTimeout(cloud.gymCreate(p.name), 12000);
    if (r.error) throw r.error;
    if (r.data && r.data.fehler) throw new Error(String(r.data.fehler));
    const r2 = await withTimeout(cloud.gymTestWeek(p.pkg), 12000);
    if (r2.error) throw r2.error;
    dropPendClub();
    clubInfo = { loaded: false, access: null, trainer: false };
    await loadClubInfo();
    toast('Testwoche gestartet');
    location.hash = '#/verein';
    route();
  } catch (e) {
    if (btn) btn.disabled = false;
    alert(`${gymErr(e)}\n\nFalls dein Verein schon angelegt ist, findest du ihn unter Profil, Deine Boxer.`);
  }
}
function clubBuyLater() {
  dropPendClub(true);
  toast('Du findest den Verein später unter Profil, Verein.');
  location.hash = '#/';
  route();
  if (!state.onboarded) startOnboarding();
}
// Neue Konten: Die Erlaubnis für Mitteilungen wird schon vor der Einrichtung erfragt, damit die Erinnerung nach 24 Stunden kommen kann.
// Zu welcher Tageszeit jemand trainiert, fragt maybeAskNotif danach trotzdem noch einmal.
const SETUPASK_KEY = 'redline.setupask';
function setupAskDone() {
  try {
    return Boolean(localStorage.getItem(SETUPASK_KEY));
  } catch {
    return false;
  }
}
function maybeAskSetupNudge() {
  if (!nativePlugin('LocalNotifications') || state.notify || state.onboarded) return;
  if (!account || !account.since || account.since + 864e5 < Date.now()) return; // nur für neue Konten
  if (document.getElementById('setupask') || document.getElementById('notifask') || setupAskDone()) return;
  try {
    localStorage.setItem(SETUPASK_KEY, '1');
  } catch {
    return;
  }
  const box = document.createElement('div');
  box.id = 'setupask';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Erinnerung zur Einrichtung');
  box.innerHTML = `<b>Soll ich dich morgen erinnern?</b><p class="muted small">Falls deine Einrichtung dann noch offen ist, schicke ich dir eine kurze Mitteilung. Mehr nicht.</p><div class="btn-row"><button class="primary" data-act="setupask-yes">Ja, erinnern</button><button class="ghost" data-act="setupask-no">Nein danke</button></div>`;
  document.body.appendChild(box);
}
function maybeAskNotif() {
  // state.notify schon an (über die Frage vor der Einrichtung), aber noch keine Tageszeit gewählt: einmal danach fragen
  const askWhenOnly = state.notify && !state.when && setupAskDone();
  if (!nativePlugin('LocalNotifications') || !state.onboarded || (state.notify && !askWhenOnly)) return;
  if (document.getElementById('notifask') || document.getElementById('clubask') || document.body.classList.contains('running') || document.getElementById('onboard')) return;
  try {
    if (localStorage.getItem(NOTIFASK_KEY)) return;
    localStorage.setItem(NOTIFASK_KEY, '1');
  } catch {
    return;
  }
  const box = document.createElement('div');
  box.id = 'notifask';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Erinnerungen');
  box.innerHTML = `<b>Soll ich dich ans Training erinnern?</b><p class="muted small">Wann trainierst du meistens? Ich erinnere dich rechtzeitig, damit du dir den Termin freihältst, und melde mich, wenn du ein paar Tage nicht da warst. Das kannst du jederzeit in den Einstellungen ändern.</p><div class="btn-row">${Object.entries(TRAIN_WHEN).map(([k, w]) => `<button class="primary" data-act="notifask-when" data-w="${k}">${w.name}</button>`).join('')}<button class="ghost" data-act="notifask-no">Nicht jetzt</button></div>`;
  document.body.appendChild(box);
}
setTimeout(maybeAskNotif, 4000);
/* ---- Push-Mitteilungen der Web-Version (Server schickt sie direkt aufs Gerät, auch bei geschlossener App; siehe docs/DB-PUSH.sql) ---- */
const pushSupported = () => !isNativeApp() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => Boolean((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
const iosNeedsHome = () => !isNativeApp() && isIos() && !isStandalone(); // iPhone: Mitteilungen gehen nur, wenn die Seite zum Home-Bildschirm hinzugefügt wurde
const IOS_HOME_HINT = 'Auf dem iPhone geht das nur, wenn du die Seite zum Home-Bildschirm hinzufügst: Im Safari auf „Teilen“ tippen, „Zum Home-Bildschirm“ wählen und die App von dort öffnen. Dann kannst du die Hinweise einschalten.';
let pushOn = false; // dieses Gerät ist für Mitteilungen angemeldet
const b64ToBytes = (b) => {
  const s = atob((b + '='.repeat((4 - (b.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function pushCurrent() {
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
// Nach dem Anmelden: Ist dieses Gerät angemeldet, die Anmeldung für das aktuelle Konto auffrischen (ein Aufruf je Start)
let pushResynced = false;
async function pushResync() {
  if (pushResynced || !pushSupported() || !account) return;
  pushResynced = true;
  const sub = await pushCurrent();
  pushOn = Boolean(sub) && Boolean(state.notify);
  if (!sub || !state.notify || Notification.permission !== 'granted') return;
  try {
    const j = sub.toJSON();
    await cloud.pushAnmelden(j.endpoint, j.keys.p256dh, j.keys.auth, navigator.userAgent.slice(0, 150));
  } catch {
    /* beim nächsten Start noch einmal */
  }
}
async function pushEnable() {
  const perm = await Notification.requestPermission(); // zuerst, damit es zum Tippen des Nutzers gehört
  if (perm !== 'granted') return 'denied';
  const { data, error } = await withTimeout(cloud.pushKey(), 12000);
  if (error || !data || !data.key) throw error || new Error('kein Schlüssel');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.key) });
  const j = sub.toJSON();
  const r = await cloud.pushAnmelden(j.endpoint, j.keys.p256dh, j.keys.auth, navigator.userAgent.slice(0, 150));
  if (r && r.error) throw r.error;
  return 'ok';
}
async function pushDisable() {
  const sub = await pushCurrent();
  if (!sub) return;
  try {
    await cloud.pushAbmelden(sub.endpoint);
  } catch {
    /* Server-Eintrag räumt sich bei der nächsten Zustellung selbst auf */
  }
  try {
    await sub.unsubscribe();
  } catch {
    /* schon abgemeldet */
  }
}
let pushBusy = false;
async function togglePush() {
  if (pushBusy) return;
  if (!state.notify && iosNeedsHome()) {
    alert(IOS_HOME_HINT);
    return;
  }
  pushBusy = true;
  try {
    if (state.notify) {
      await pushDisable();
      pushOn = false;
      state.notify = false;
      save();
      route();
      toast('Hinweise sind aus');
    } else {
      const r = await pushEnable();
      if (r === 'denied') {
        alert('Mitteilungen sind für diese Seite blockiert. Erlaube sie in den Einstellungen deines Browsers oder Geräts und tippe dann noch einmal auf „Hinweise aktivieren“.');
      } else {
        pushOn = true;
        state.notify = true;
        save();
        route();
        toast('Hinweise sind an');
      }
    }
  } catch {
    alert('Das hat nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal.');
  }
  pushBusy = false;
}
function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (nativePlugin('LocalNotifications')) {
    scheduleNativeReminders();
    return;
  }
  if (pushOn) return; // Mitteilungen kommen vom Server, nicht doppelt aus der geöffneten Seite
  if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const cw = currentWeek();
  if (!cw) return;
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  const hit = weekOrder(cw).find((s) => Number(dayOf(s)) === todayIso && !isDone(s.id) && !tooCloseToFight(sessionDate(cw, dayOf(s)), plan().fight));
  if (!hit) return;
  const [hh, mm] = (state.time || '18:00').split(':').map(Number);
  const at = new Date();
  at.setHours(hh, mm, 0, 0);
  const wait = at - Date.now();
  if (wait <= 0 || wait > 2147483000) return;
  reminderTimer = setTimeout(() => {
    if (isDone(hit.id) || !state.notify) return; // inzwischen erledigt oder abgeschaltet: nicht mehr erinnern
    try {
      new Notification('Nonstop Boxing', { body: `Heute: ${hit.title}`, icon: 'icons/icon-192.png' });
    } catch {
      /* Hinweis nicht möglich */
    }
  }, wait);
}


/* ---------------- Eigener Kalender (statt Browser-Kalender) ---------------- */
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parseIso = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
const dateLabel = (s) => {
  const p = parseIso(s);
  return p ? fmtDate(new Date(p.y, p.m, p.d)) : '';
};
function dateField(id, value, extra = '') {
  return `<input id="${id}" type="hidden" value="${esc(value)}" ${extra}><button type="button" class="datebtn ${value ? '' : 'empty'}" data-act="pickdate" data-for="${id}" aria-label="Datum wählen"><span id="${id}Txt">${value ? esc(dateLabel(value)) : 'Datum wählen'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg></button>`;
}
let cal = null;
function closeModalCal() {
  if (!cal) return;
  cal = null;
  $modal.hidden = true;
  $modal.className = '';
  $modal.innerHTML = '';
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModalCal();
});
function renderCalendar() {
  const first = new Date(cal.y, cal.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(cal.y, cal.m + 1, 0).getDate();
  const now = new Date();
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) {
    const iso = isoOf(cal.y, cal.m, d);
    cells.push(`<button type="button" class="calday ${iso === cal.sel ? 'sel' : ''} ${iso === todayIso ? 'today' : ''}" data-act="cal-day" data-iso="${iso}" aria-label="${d}. ${MONTHS[cal.m]} ${cal.y}">${d}</button>`);
  }
  $modal.hidden = false;
  $modal.className = 'calmode';
  $modal.innerHTML = `<div class="card calcard" role="dialog" aria-modal="true" aria-label="Datum wählen">
    <div class="calhead"><button type="button" class="calnav" data-act="cal-prev" aria-label="Vorheriger Monat">‹</button><b>${MONTHS[cal.m]} ${cal.y}</b><button type="button" class="calnav" data-act="cal-next" aria-label="Nächster Monat">›</button></div>
    <div class="calgrid calweek">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="calgrid">${cells.join('')}</div>
    <div class="btn-row"><button type="button" class="ghost" data-act="cal-today">Heute</button><button type="button" class="ghost" data-act="closemodal">Abbrechen</button></div>
  </div>`;
}
function openCalendar(id) {
  const cur = parseIso(document.getElementById(id)?.value);
  const now = new Date();
  cal = { id, y: cur ? cur.y : now.getFullYear(), m: cur ? cur.m : now.getMonth(), sel: cur ? isoOf(cur.y, cur.m, cur.d) : '' };
  renderCalendar();
}
function pickDate(iso) {
  const input = document.getElementById(cal.id);
  if (input) {
    input.value = iso;
    const txt = document.getElementById(cal.id + 'Txt');
    if (txt) txt.textContent = dateLabel(iso);
    input.parentElement?.querySelector('.datebtn')?.classList.remove('empty');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  cal = null;
  $modal.hidden = true;
  $modal.className = '';
  $modal.innerHTML = '';
}

/* ---------------- Einführung (So startest du) ---------------- */
const OB_STEPS = ['welcome', 'fight', 'watt', 'done'];
let ob = { step: 0 };

function obProfileOpts() {
  const sub = { elite: 'Erwachsene und Elite, Plan wie im Grundaufbau', u18: 'Reduzierter Umfang, kürzere Sprints', u16: 'Stark reduziert, 2 harte Einheiten pro Woche', u14: 'Am stärksten reduziert, Sprints bis 10 Sekunden, 2 harte Einheiten pro Woche' };
  const ok = allowedProfiles();
  return Object.entries(PROFILES)
    .filter(([k]) => ok.includes(k))
    .map(([k, p]) => `<button class="opt ${state.profile === k ? 'sel' : ''}" data-act="ob-profile" data-key="${k}"><b>${esc(p.name)}</b><span>${esc(sub[k] || '')}</span></button>`)
    .join('');
}

function obBody(id) {
  const p = profile();
  switch (id) {
    case 'welcome':
      return `<div class="ob-hero"><img src="img/hero.jpg" alt="" data-hide-on-error><div class="ob-hero-in">${BRAND_MARK}<b>${APP_NAME_A}<i>${APP_NAME_B}</i></b></div></div>
        <h1>So startest du</h1>
        <p class="muted">In wenigen Minuten ist dein Plan bereit.</p>
        <div class="notice"><b>Gesundheit:</b> Maximale Sprints sind extrem belastend. Lass dich bei Vorerkrankungen vorher ärztlich untersuchen. Bei Schwindel, Brustschmerz, Atemnot oder Übelkeit sofort abbrechen. Du trainierst auf eigene Verantwortung.</div>
        <ol class="ob-list">
          <li><b>Dein Kampf</b><span>Termin, Runden und Rundenlänge</span></li>
          <li><b>Fitness-Test</b><span>3 Sprints, daraus berechnet die App deine Watt-Ziele</span></li>
          <li><b>Training</b><span>Dein Plan bis zum Kampf, Einheit für Einheit</span></li>
        </ol>`;
    case 'fight': {
      const own = ageClassKey();
      const ok = allowedProfiles();
      const ageRow = own
        ? `<div class="agerow"><span>Altersklasse</span><b>${esc(p.name)}</b>${ok.length > 1 ? '<button class="linkbtn inline" data-act="ob-profile-toggle">ändern</button>' : ''}</div>${ob.profileOpen ? obProfileOpts() : ''}`
        : `<label>Altersklasse</label>${obProfileOpts()}`;
      return `<span class="kicker">Schritt 1 von 2</span><h1>Dein Kampf</h1>
        ${ageRow}
        <label for="obFight">Kampftermin</label>
        ${dateField('obFight', ob.fightDraft !== undefined ? ob.fightDraft : state.fightDate)}
        <button class="linkbtn inline" data-act="ob-nodate">Ich habe noch keinen Termin</button>
        <label>Wie viele Runden hat dein Kampf?</label>
        <div class="rounds-grid">${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `<button class="opt sm ${fmtRounds() === n ? 'sel' : ''}" data-act="ob-rounds" data-n="${n}"><b>${n}</b></button>`).join('')}</div>
        <label>Länge einer Runde</label>
        <div class="seg2x">${[2, 3].map((m) => `<button class="opt sm ${fmtRoundSecs() === m * 60 ? 'sel' : ''}" data-act="ob-rlen" data-n="${m}"><b>${m} Minuten</b></button>`).join('')}</div>
        <label>Training pro Woche</label>
        <div class="seg">${[1, 2, 3].map((n) => `<button class="opt sm ${Number(state.freq) === n ? 'sel' : ''}" data-act="ob-freq" data-n="${n}"><b>${n}×</b><span>pro Woche</span></button>`).join('')}</div>
        <p class="muted small">Bei weniger als 3 Einheiten wählt die App die wichtigsten aus. Mehr Runden bedeuten mehr Kampfrunden im Training. Wie viel mehr, ist eine Annahme und noch nicht von einem Fachtrainer geprüft.</p>`;
    }
    case 'watt':
      return `<span class="kicker">Schritt 2 von 2</span><h1>Dein Fitness-Test</h1>
        <p class="muted">Du fährst drei maximale 10-Sekunden-Sprints. Der Durchschnitt deiner drei Höchstwerte ist dein Test-Watt. Daraus berechnet die App jedes Watt-Ziel.</p>
        <button class="primary block" data-act="ob-test">Fitness-Test starten</button>
        <p class="muted small center" style="margin:8px 0 0">Geführt, mit Aufwärmen, etwa 10 Minuten.</p>
        <details class="manual"><summary>Ich kenne meinen Test-Watt schon</summary>
          <div style="margin-top:8px">${wattInput('ob')}</div>
          <button class="ghost block" style="margin-top:12px" data-act="ob-savemax">Test-Watt speichern</button></details>
        <button class="later" data-act="ob-next">Später machen (dann siehst du nur Prozentwerte)</button>`;
    case 'done': {
      const pl = plan();
      const d = daysToFight();
      return `<span class="kicker">Fertig</span><h1>Dein Plan steht</h1>
        <ul class="sum">
          <li><span>Altersklasse</span><b>${esc(p.name)}</b></li>
          <li><span>Kampf</span><b>${pl.fight ? fmtDate(pl.fight) + (d !== null ? ' · in ' + d + ' Tagen' : '') : 'noch kein Termin'}</b></li>
          <li><span>Plan</span><b>${pl.weeks.length ? wochen(pl.weeks.length) + ', ' + userFreq() + '× pro Woche' : 'noch nicht berechnet'}</b></li>
          <li><span>Kampfformat</span><b>${formatLabel()}</b></li>
          <li><span>Test-Watt</span><b>${state.maxW ? state.maxW + ' W' : 'noch offen'}</b></li>
        </ul>
        ${pl.mode === 'start' ? '<p class="muted small">Ohne Kampftermin gilt der volle Plan über 10 Wochen ab heute. Den Termin kannst du später in den Einstellungen eintragen.</p>' : ''}
        <h2>Als Nächstes</h2>
        ${state.maxW ? `<p>Deine erste Einheit findest du auf der Startseite unter „Nächste Einheit“. Tippe darauf und starte den Timer.</p>` : '<p><b>Mache zuerst den Fitness-Test.</b> Ohne ihn siehst du nur Prozentwerte statt Watt-Zahlen.</p>'}`;
    }
    default:
      return '';
  }
}

function renderOnboarding() {
  let sheet = document.getElementById('onboard');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'onboard';
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
  }
  document.body.classList.add('obopen');
  const id = OB_STEPS[ob.step];
  const last = ob.step === OB_STEPS.length - 1;
  const first = ob.step === 0;
  const nextLabel = id === 'welcome' ? 'Verstanden, los geht’s' : last ? (state.maxW ? 'Zur Übersicht' : 'Fitness-Test starten') : 'Weiter';
  const showNext = id !== 'watt';
  sheet.innerHTML = `<div class="sheet-in">
    <div class="ob-top">${first ? '<span></span>' : '<button class="ob-back" data-act="ob-back" aria-label="Zurück">← Zurück</button>'}
      <div class="dots" aria-hidden="true">${first ? '' : [1, 2].map((i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>
      ${first ? '<button class="ob-skip" data-act="ob-skip">Überspringen</button>' : '<span></span>'}</div>
    <div class="ob-body">${obBody(id)}</div>
    ${showNext ? `<div class="ob-foot"><button class="primary block" data-act="${last ? (state.maxW ? 'ob-finish' : 'ob-test') : 'ob-next'}">${nextLabel}</button>${last && !state.maxW ?'<button class="linkbtn" data-act="ob-finish">Später, zur Übersicht</button>' : ''}</div>` : ''}
  </div>`;
  sheet.scrollTop = 0;
}

function startOnboarding(step = 0) {
  ob = { step };
  renderOnboarding();
}
function closeOnboarding() {
  document.getElementById('onboard')?.remove();
  document.body.classList.remove('obopen');
  state.onboarded = true;
  save();
  scheduleReminder();
  route();
}
function obNext(noDate = false) {
  const id = OB_STEPS[ob.step];
  if (id === 'fight') {
    if (noDate) {
      const n = new Date();
      state.fightDate = '';
      state.planBase = '';
      state.startDate = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
      ob.fightDraft = undefined;
    } else {
      const v = document.getElementById('obFight')?.value || '';
      if (v) {
        const d = parseDay(v);
        if (!d || d <= startOfDay(new Date())) {
          alert('Bitte ein Datum in der Zukunft eintragen (frühestens morgen).');
          return;
        }
        state.fightDate = v;
        state.startDate = '';
        freezePlan();
        ob.fightDraft = undefined;
      } else if (!state.fightDate && !state.startDate) {
        alert('Trage deinen Kampftermin ein oder wähle „Ich habe noch keinen Termin“.');
        return;
      }
    }
    save();
  }
  let n = ob.step + 1;
  ob.step = Math.min(n, OB_STEPS.length - 1);
  renderOnboarding();
}
function obBack() {
  let n = ob.step - 1;
  ob.step = Math.max(n, 0);
  renderOnboarding();
}

/* ---------------- Konto, Anmeldung und Sicherung ---------------- */
const SYNC_KEY = 'redline.sync';
let account = null; // { id, email } sobald angemeldet
let syncStatus = ''; // 'ok' | 'pending' | 'offline' | 'error'
let pushTimer = null;
let authView = 'login';
let authPrev = 'login';
let authMsg = '';
let authEmail = '';

const readSync = () => {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
  } catch {
    return {};
  }
};
const writeSync = (patch) => {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ ...readSync(), ...patch }));
  } catch {
    /* Speicher blockiert */
  }
};
const BASE_KEY = 'redline.base';
const readBase = () => {
  try {
    return JSON.parse(localStorage.getItem(BASE_KEY) || '{}');
  } catch {
    return {};
  }
};
const writeBase = (s) => {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(s));
  } catch {
    /* Speicher blockiert */
  }
};
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Dreiwege-Zusammenführung: Was auf diesem Gerät gegenüber dem letzten gemeinsamen Stand geändert wurde, gewinnt;
// alles andere kommt vom Konto. Erledigte Einheiten und Unterobjekte werden je Schlüssel zusammengeführt.
function mergeStates(base, local, remote) {
  const out = { ...remote };
  for (const k of new Set([...Object.keys(local), ...Object.keys(base)])) {
    if (isObj(local[k]) && isObj(remote[k])) {
      const merged = { ...remote[k] };
      for (const kk of new Set([...Object.keys(local[k]), ...Object.keys(base[k] || {})])) {
        if (!same(local[k][kk], (base[k] || {})[kk])) {
          if (kk in local[k]) merged[kk] = local[k][kk];
          else delete merged[kk];
        }
      }
      out[k] = merged;
    } else if (!same(local[k], base[k])) {
      if (k in local) out[k] = local[k];
      else delete out[k];
    }
  }
  return out;
}
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const freshState = () => ({ ...DEFAULTS, days: { ...DEFAULTS.days }, done: {}, reports: {} });
const normalizeState = (raw) => ({ ...DEFAULTS, ...raw, days: { ...DEFAULTS.days, ...(raw.days || {}) }, done: raw.done || {}, reports: raw.reports || {} });
// Sicherungsdatei prüfen: nur bekannte Felder mit gültigen Werten übernehmen, alles andere wird verworfen
const isDayStr = (v) => v === '' || Boolean(parseDay(v));
const isIso = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
function sanitizeImport(obj) {
  if (!isObj(obj) || !isObj(obj.done)) throw new Error('Format');
  const num = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : fallback;
  };
  const c = freshState();
  c.maxW = obj.maxW ? num(obj.maxW, 100, 3000, 0) : 0;
  c.maxWDate = isIso(obj.maxWDate) ? obj.maxWDate : '';
  c.sprints = Array.isArray(obj.sprints) ? obj.sprints.slice(0, 3).map((v) => num(v, 100, 3000, 0)).filter(Boolean) : [];
  c.startDate = isDayStr(obj.startDate) ? obj.startDate : '';
  c.fightDate = isDayStr(obj.fightDate) ? obj.fightDate : '';
  c.planBase = c.fightDate && isDayStr(obj.planBase) ? obj.planBase : '';
  c.freq = num(obj.freq, 1, 3, DEFAULTS.freq);
  c.rounds = num(obj.rounds, 3, 12, DEFAULTS.rounds);
  c.roundMin = [0, 2, 3].includes(Number(obj.roundMin)) ? Number(obj.roundMin) : 0;
  c.age = obj.age ? num(obj.age, 10, 90, 0) : 0;
  c.time = typeof obj.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(obj.time) ? obj.time : DEFAULTS.time;
  for (const k of Object.keys(DEFAULTS.days)) c.days[k] = num(isObj(obj.days) ? obj.days[k] : undefined, 1, 7, DEFAULTS.days[k]);
  c.notify = obj.notify === true;
  c.when = typeof obj.when === 'string' && TRAIN_WHEN[obj.when] ? obj.when : '';
  c.onboarded = obj.onboarded === true;
  c.recOpt = Object.hasOwn(RECOVERY_OPTIONS, obj.recOpt) ? obj.recOpt : DEFAULTS.recOpt;
  c.profile = Object.hasOwn(PROFILES, obj.profile) ? obj.profile : DEFAULTS.profile;
  for (const [id, at] of Object.entries(obj.done).slice(0, 500)) if (id.length <= 40 && isIso(at)) c.done[id] = at;
  if (isObj(obj.reports)) {
    for (const [n, r] of Object.entries(obj.reports).slice(0, 100)) {
      if (!/^\d{1,9}$/.test(n) || !isObj(r)) continue;
      c.reports[n] = { k: ['fehler', 'idee', 'frage'].includes(r.k) ? r.k : 'fehler', t: String(r.t || '').slice(0, 60), at: isIso(r.at) ? r.at : new Date().toISOString(), st: r.st === 'closed' ? 'closed' : 'open', c: num(r.c, 0, 1000, 0) };
    }
  }
  return c;
}
const hasProgress = (s) => Boolean(s.onboarded || s.maxW || Object.keys(s.done || {}).length);

function schedulePush(delay = 1500) {
  clearTimeout(pushTimer);
  if (!account) return;
  syncStatus = 'pending';
  pushTimer = setTimeout(pushNow, delay);
}
// Abgelaufene oder widerrufene Anmeldung (zum Beispiel Konto auf anderem Gerät gelöscht oder Sitzung beendet): Hinweis mit Knopf zum neuen Anmelden.
// Daten auf dem Gerät bleiben dabei erhalten, der Abgleich beim nächsten Anmelden führt sie zusammen.
const isAuthError = (e) => Boolean(e) && (e.status === 401 || /jwt|refresh token|not authenticated|invalid token/i.test(String(e.message || '')) || e.code === 'PGRST301' || e.code === 'PGRST303');
function sessionExpired() {
  if (!account || signingOut || sessionWarned) return;
  sessionWarned = true;
  syncStatus = 'error';
  const box = document.createElement('div');
  box.id = 'sessionexp';
  box.setAttribute('role', 'alert');
  box.innerHTML = '<span><b>Deine Anmeldung ist abgelaufen.</b> Melde dich neu an, damit dein Fortschritt wieder gesichert wird. Nicht gesicherte Daten bleiben auf diesem Gerät.</span><button class="primary" data-act="relogin">Neu anmelden</button>';
  document.body.appendChild(box);
}
let pushing = null;
async function pushNow() {
  clearTimeout(pushTimer);
  if (!account) return true;
  if (!readSync().dirty) return true;
  if (!navigator.onLine) {
    syncStatus = 'offline';
    return false;
  }
  if (pushing) return pushing;
  pushing = (async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        let version = readSync().syncedAt;
        if (!version) {
          let remote = await withTimeout(cloud.pullState(account.id), 8000);
          if (!remote) {
            // Zeile im Konto fehlt: selbst anlegen, sonst scheitert die Sicherung dauerhaft
            await withTimeout(cloud.ensureStateRow(account.id), 8000);
            remote = await withTimeout(cloud.pullState(account.id), 8000);
          }
          version = remote ? remote.updated_at : '';
          if (!version) throw new Error('keine Zeile');
          if (remote.state && Object.keys(remote.state).length) {
            state = normalizeState(mergeStates(readBase(), state, remote.state));
            save(true);
          }
        }
        // Stand zum Sendezeitpunkt festhalten: Änderungen während der Anfrage dürfen nicht als gesichert gelten
        const sent = JSON.stringify(state);
        const r = await withTimeout(cloud.pushStateIf(account.id, JSON.parse(sent), version), 8000);
        if (r.ok) {
          const changedMeanwhile = JSON.stringify(state) !== sent;
          writeSync({ dirty: changedMeanwhile, syncedAt: r.updated_at });
          writeBase(JSON.parse(sent));
          syncStatus = changedMeanwhile ? 'pending' : 'ok';
          if (changedMeanwhile) setTimeout(pushNow, 300);
          return true;
        }
        // Konflikt: Stand vom Konto holen, zusammenführen, erneut versuchen
        const remote = await withTimeout(cloud.pullState(account.id), 8000);
        state = normalizeState(mergeStates(readBase(), state, (remote && remote.state) || {}));
        save(true);
        writeSync({ syncedAt: remote ? remote.updated_at : '' });
      }
      syncStatus = 'error';
      return false;
    } catch (e) {
      if (isAuthError(e)) sessionExpired();
      syncStatus = navigator.onLine ? 'error' : 'offline';
      return false;
    } finally {
      pushing = null;
    }
  })();
  return pushing;
}
const syncLabel = () => {
  const i = readSync();
  if (i.dirty && !navigator.onLine) return 'Offline, wird später gesichert';
  if (syncStatus === 'ok' || (!i.dirty && i.syncedAt)) return 'Gesichert im Konto';
  if (syncStatus === 'offline') return 'Offline, wird später gesichert';
  if (syncStatus === 'error') return 'Sicherung fehlgeschlagen, wird erneut versucht';
  return i.dirty ? 'Wird gesichert …' : 'Noch nicht gesichert';
};

let loginAborted = false; // Anmeldung wurde abgebrochen, weil Änderungen eines anderen Kontos ungesichert auf dem Gerät liegen
const pushQuick = () => withTimeout(pushNow(), 6000).catch(() => {}); // läuft bei Zeitüberschreitung im Hintergrund weiter
async function syncOnLogin(user) {
  const info = readSync();
  if (info.owner && info.owner !== user.id) {
    // Auf dem Gerät liegen Daten eines anderen Kontos: nicht übernehmen. Sind sie noch nicht gesichert, vorher fragen.
    if (info.dirty && hasProgress(state) && !confirm(`Auf diesem Gerät liegen noch nicht gesicherte Änderungen von ${info.email || 'einem anderen Konto'}. Sie gehen verloren, wenn du dich mit diesem Konto anmeldest.\n\nOK = trotzdem anmelden\nAbbrechen = abmelden, damit du dich mit dem anderen Konto anmelden kannst`)) {
      loginAborted = true;
      try {
        await cloud.signOut();
      } catch {
        /* lokal abgemeldet genügt */
      }
      return;
    }
    state = freshState();
    save(true);
    writeSync({ owner: user.id, email: user.email, syncedAt: '', dirty: false });
  }
  let remote;
  try {
    remote = await withTimeout(cloud.pullState(user.id), 6000);
  } catch {
    writeSync({ owner: user.id, email: user.email });
    syncStatus = navigator.onLine ? 'error' : 'offline';
    return;
  }
  const info2 = readSync();
  const remoteHas = Boolean(remote && remote.state && Object.keys(remote.state).length);
  if (!remoteHas) {
    writeSync({ owner: user.id, email: user.email, syncedAt: remote ? remote.updated_at : '' });
    if (hasProgress(state)) {
      writeSync({ dirty: true });
      await pushQuick();
    } else writeSync({ dirty: false });
  } else if (!info2.owner && hasProgress(state)) {
    const useDevice = confirm('Auf diesem Gerät ist schon Fortschritt gespeichert.\n\nOK = Gerätedaten ins Konto übernehmen\nAbbrechen = Daten aus dem Konto laden');
    writeSync({ owner: user.id, email: user.email });
    if (useDevice) {
      writeSync({ syncedAt: remote.updated_at, dirty: true });
      await pushQuick();
    } else applyRemote(remote);
  } else if (info2.dirty) {
    writeSync({ owner: user.id, email: user.email });
    if (remote.updated_at !== info2.syncedAt) {
      state = normalizeState(mergeStates(readBase(), state, remote.state));
      save(true);
      writeSync({ syncedAt: remote.updated_at });
    }
    await pushQuick();
  } else {
    writeSync({ owner: user.id, email: user.email });
    if (remote.updated_at !== info2.syncedAt) applyRemote(remote);
    else syncStatus = 'ok';
  }
}
function applyRemote(remote) {
  state = normalizeState(remote.state);
  const fixed = enforceProfile();
  save(true);
  writeBase(state);
  writeSync({ syncedAt: remote.updated_at, dirty: false });
  syncStatus = 'ok';
  if (fixed) save(); // unzulässige Altersklasse aus dem Konto korrigiert: Korrektur ins Konto zurückschreiben
}

async function startSession(user, quick = false) {
  signingOut = false;
  sessionWarned = false;
  document.getElementById('sessionexp')?.remove();
  // since: Zeitpunkt der Bestätigung des Kontos (für die Erinnerung nach 24 Stunden, gilt nur für neue Konten)
  account = { id: user.id, email: user.email || readSync().email || '', birthYear: await loadBirthYear(user, quick), since: Date.parse(user.email_confirmed_at || user.created_at || '') || 0 };
  if (quick) {
    // Server nicht erreichbar: sofort mit lokalen Daten starten, Abgleich läuft im Hintergrund
    syncStatus = 'offline';
    withTimeout(syncOnLogin(account), 60000)
      .then(() => {
        if (loginAborted) {
          loginAborted = false;
          account = null;
          renderAuth('login');
          return;
        }
        if (!document.querySelector('.timer') && !document.getElementById('onboard')) route();
      })
      .catch(() => {
        syncStatus = navigator.onLine ? 'error' : 'offline';
      });
  } else {
    try {
      // Kein äußeres Zeitlimit: Rückfragen an den Nutzer dürfen beliebig lange dauern, die Netzwerkaufrufe darin haben eigene Zeitlimits
      await syncOnLogin(account);
    } catch {
      syncStatus = navigator.onLine ? 'error' : 'offline'; // mit lokalen Daten weiterarbeiten, später erneut versuchen
    }
    if (loginAborted) {
      loginAborted = false;
      account = null;
      renderAuth('login');
      return;
    }
  }
  if (!state.onboarded && ageClassKey()) state.profile = ageClassKey();
  if (enforceProfile()) save();
  closeAuth();
  route();
  setTimeout(checkReports, 3000);
  abo = { loaded: false, aktiv: false, art: '', bis: '' };
  setTimeout(loadClubInfo, 1500);
  setTimeout(loadAbo, 1700);
  cloud.isAdmin().then((v) => {
    if (!account) return;
    account.isAdmin = v;
    if (v && location.hash === '#/profile' && !document.querySelector('.timer')) route(); // Menüpunkt „Admin“ nachträglich zeigen
  });
  cloud.isTestAccount().then((v) => {
    if (!account) return;
    account.isTester = v;
    if (v && ['#/profile', '#/verein', '#/paket'].includes(location.hash) && !document.querySelector('.timer')) route();
  });
  const pendClub = readPendClub() || adoptMetaClub(user);
  if (pendClub) setTimeout(() => openClubSignup(), 800); // Verein: keine Einrichtung für Privatpersonen, sondern gleich das Paket bestätigen
  if (!account.birthYear) setTimeout(retryBirthYear, 8000);
  if (!state.onboarded && !pendClub) {
    startOnboarding();
    setTimeout(maybeAskSetupNudge, 2500);
  }
  scheduleReminder();
  updateTrainerInfo();
}
function closeAuth() {
  document.getElementById('auth')?.remove();
  if (!document.getElementById('onboard')) document.body.classList.remove('obopen');
}
function renderLoading() {
  authShell(`${authBrand()}<p class="muted center" style="margin-top:30px">Lade …</p>`);
}
// Beendet Supabase die Sitzung von sich aus (Token abgelaufen oder widerrufen), gibt es einen Hinweis zum neuen Anmelden
cloud.onAuth((event) => {
  if (event === 'SIGNED_OUT' && account && !signingOut) sessionExpired();
});
async function boot() {
  renderLoading();
  let quickStart = false;
  let user = null;
  let timedOut = false;
  try {
    user = await withTimeout(cloud.currentUser(), 4000);
  } catch {
    timedOut = true;
  }
  if (/access_token=|error_description=|type=recovery/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  if (!user && cloud.hasStoredSession() && readSync().owner && (!navigator.onLine || timedOut)) {
    user = { id: readSync().owner, email: readSync().email };
    quickStart = true;
  }
  if (!user) {
    renderAuth('login');
    showIntro();
    return;
  }
  await startSession(user, quickStart);
}
// Geburtsjahr nachladen, falls es beim Start nicht ankam (schlechtes Netz, neues Gerät)
async function retryBirthYear() {
  if (!account || account.birthYear || !navigator.onLine) return;
  const y = await loadBirthYear({ id: account.id }, false);
  if (!y || !account) return;
  account.birthYear = y;
  if (enforceProfile()) save();
  if (!document.getElementById('onboard') && !document.querySelector('.timer')) route();
}
window.addEventListener('online', () => {
  if (account && readSync().dirty) pushNow();
  retryBirthYear();
});
document.addEventListener('visibilitychange', async () => {
  if (!account) return;
  if (document.visibilityState === 'hidden') {
    if (readSync().dirty) pushNow();
    return;
  }
  retryBirthYear();
  if (!navigator.onLine) return;
  try {
    if (readSync().dirty) return void (await pushNow());
    const remote = await withTimeout(cloud.pullState(account.id), 6000);
    if (remote && remote.state && Object.keys(remote.state).length && remote.updated_at !== readSync().syncedAt) {
      applyRemote(remote);
      if (!document.getElementById('onboard') && !document.querySelector('.timer')) route();
    }
  } catch {
    /* später wieder */
  }
});

/* ---- Intro-Video vor der Anmeldung (einmal pro Gerät, überspringbar) ---- */
function showIntro() {
  try {
    if (sessionStorage.getItem('rl-intro')) return; // nur je Sitzung: beim Neuladen nicht erneut
  } catch {
    /* ohne Speicher: Intro zeigen */
  }
  if (document.getElementById('intro')) return;
  const box = document.createElement('div');
  box.id = 'intro';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Intro-Video');
  box.innerHTML = `<div class="intro-box"><div class="intro-bar"><button class="intro-btn" data-act="intro-sound" aria-pressed="false">Ton an</button><button class="intro-btn skip" data-act="intro-skip">Überspringen</button></div>
    <video src="video/start.mp4" autoplay muted playsinline preload="auto"></video></div>`;
  document.body.appendChild(box);
  const v = box.querySelector('video');
  v.addEventListener('ended', closeIntro);
  v.addEventListener('error', closeIntro);
  v.play().catch(() => v.setAttribute('controls', ''));
  box.querySelector('.skip').focus();
}
function closeIntro() {
  document.getElementById('intro')?.remove();
  try {
    sessionStorage.setItem('rl-intro', '1');
  } catch {
    /* egal */
  }
}

/* ---- Anmeldeseiten ---- */
function authMessage() {
  return authMsg ? `<div class="notice" role="alert">${esc(authMsg)}</div>` : '';
}
function authError(err) {
  const m = String((err && (err.message || err.code)) || '');
  if (/otp|token has expired|token.*invalid|expired/i.test(m)) return 'Der Code stimmt nicht oder ist abgelaufen. Prüfe die Zahl oder fordere einen neuen Code an.';
  if (/invalid login credentials|invalid_credentials/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/not confirmed|email_not_confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail. Schau auch im Spam-Ordner nach.';
  if (/rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/i.test(m)) return 'Zu viele Versuche. Bitte warte kurz und versuche es später noch einmal.';
  if (/database error|saving new user|unexpected_failure/i.test(m)) return 'Die Registrierung ist nicht möglich. Bitte prüfe Alter und Einwilligung.';
  if (/valid email|invalid format|email address.*invalid|is invalid/i.test(m)) return 'Diese E-Mail-Adresse ist nicht gültig.';
  if (/network|fetch|failed to/i.test(m)) return 'Keine Verbindung. Bitte prüfe dein Internet.';
  return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
}
function authShell(inner) {
  let sheet = document.getElementById('auth');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'auth';
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
  }
  document.body.classList.add('obopen');
  sheet.innerHTML = `<div class="sheet-in">${inner}</div>`;
  sheet.scrollTop = 0;
}
const authBrand = () => `<div class="auth-brand">${BRAND_MARK}<b>${APP_NAME_A}<i>${APP_NAME_B}</i></b></div><p class="auth-tag">Mehr Kondition bis zur letzten Runde</p>`;
const authTabs = (on) => `<div class="seg2" role="tablist"><button class="${on === 'login' ? 'sel' : ''}" data-act="auth-view" data-v="login" role="tab">Anmelden</button><button class="${on === 'register' ? 'sel' : ''}" data-act="auth-view" data-v="register" role="tab">Registrieren</button></div>`;
const legalLinks = (top = 18) => `<p class="muted small center" style="margin-top:${top}px"><a href="#" data-act="auth-view" data-v="privacy">Datenschutz</a> · <a href="#" data-act="auth-view" data-v="imprint">Impressum</a></p>`;

// Registrieren als Privatperson oder als Verein (Trainer). Ein Verein braucht ein Paket, der Kauf folgt nach der Anmeldung (siehe maybeFinishClubSignup).
let authKind = 'privat';
let authPkg = 5;
let authYear = '';
let authClub = '';
const PENDCLUB_KEY = 'redline.pendclub';
const kindSwitch = () => `<div class="kindsw" role="tablist"><button class="${authKind === 'privat' ? 'on' : ''}" data-act="auth-kind" data-k="privat" role="tab">Privatperson</button><button class="${authKind === 'verein' ? 'on' : ''}" data-act="auth-kind" data-k="verein" role="tab">Verein</button></div>`;
function clubSignupHtml() {
  const cards = PAKETE.map((x) => `<button class="pk ${x.n === authPkg ? 'sel' : ''}" data-act="auth-pkg" data-n="${x.n}"><div class="top"><b>${x.n} Boxer</b><span class="pr">${x.preis}</span></div><span class="muted small">${x.je} je Boxer im Jahr${x.tag ? ` <span class="tag">${x.tag}</span>` : ''}</span></button>`).join('');
  return `<h2 style="font-size:22px;margin:4px 0 4px">Dein Verein mit Nonstop Boxing</h2>
    <div class="notice" style="margin:0 0 10px"><b>Die erste Woche ist kostenlos.</b><br>Du wählst dein Paket und testest es sieben Tage ohne Bezahlung. Du und deine Boxer trainieren in dieser Zeit ohne Werbung. Danach brauchst du das Paket, sonst trainiert ihr mit Werbung oder Abo weiter.</div>
    <p class="muted small" style="margin:0 0 6px">Für Vereine gibt es drei Jahrespakete. Du wählst deines jetzt und startest nach der Anmeldung die Testwoche.</p>
    <ul class="feat"><li>Ein Platz mit eigenem Code für jeden Boxer</li><li>Traineransicht: Stand, Aufmerksamkeit, letzte Einheiten</li><li>Alle Boxer trainieren ohne Werbung</li><li><b>Dazu für dich:</b> Du als Trainer trainierst selbst auch ohne Werbung und ohne eigenes Abo mit</li><li>Plätze jederzeit neu vergeben</li><li>Jahresabo, jederzeit kündbar</li></ul>${cards}`;
}
function renderAuth(view = 'login') {
  const prevEmail = document.getElementById('aEmail')?.value;
  if (prevEmail !== undefined) authEmail = prevEmail.trim();
  const prevYear = document.getElementById('aYear')?.value;
  if (prevYear !== undefined) authYear = prevYear;
  const prevClub = document.getElementById('aClub')?.value;
  if (prevClub !== undefined) authClub = prevClub;
  if (view === 'privacy' || view === 'imprint') {
    if (authView !== 'privacy' && authView !== 'imprint') authPrev = authView;
  }
  authView = view;
  const em = esc(authEmail);
  let body = '';
  if (view === 'login') {
    body = `${authBrand()}${authTabs('login')}${authMessage()}
      <p class="muted" style="margin:0 0 4px">Wir schicken dir einen Code per E-Mail. Damit meldest du dich an.</p>
      <label for="aEmail">E-Mail</label><input id="aEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" value="${em}">
      <button class="primary block" style="margin-top:16px" data-act="auth-code">Code senden</button>
      <p class="muted small center" style="margin-top:18px"><a href="#" data-act="auth-view" data-v="pw">Anmeldung mit Passwort (App-Prüfung)</a></p>
${legalLinks(6)}`;
  } else if (view === 'pw') {
    body = `${authBrand()}${authTabs('login')}${authMessage()}
      <p class="muted" style="margin:0 0 4px">Nur für die Prüfung der App bei Apple. Alle anderen melden sich mit dem Code an.</p>
      <label for="aEmail">E-Mail</label><input id="aEmail" type="email" inputmode="email" autocomplete="username" autocapitalize="none" value="${em}">
      <label for="aPw">Passwort</label><input id="aPw" type="password" autocomplete="current-password">
      <button class="primary block" style="margin-top:16px" data-act="auth-pw">Anmelden</button>
      <button class="linkbtn" data-act="auth-view" data-v="login">Zurück zur Anmeldung mit Code</button>${legalLinks()}`;
  } else if (view === 'register') {
    const isClub = authKind === 'verein';
    body = `${authBrand()}${authTabs('register')}${kindSwitch()}${authMessage()}${isClub ? clubSignupHtml() : ''}
      ${isClub ? `<label for="aClub" style="margin-top:14px">Name des Vereins</label><input id="aClub" type="text" maxlength="60" autocomplete="off" value="${esc(authClub)}">` : ''}
      <label for="aEmail">${isClub ? 'E-Mail des Trainers' : 'E-Mail'}</label><input id="aEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" value="${em}">
      <label for="aYear">${isClub ? 'Dein Geburtsjahr' : 'Geburtsjahr'}</label><input id="aYear" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" placeholder="${isClub ? 'z. B. 1985' : 'z. B. 2008'}" value="${esc(authYear)}">
      <p class="muted small" style="margin:10px 0 0">Du meldest dich immer mit einem Code per E-Mail an, ein Passwort gibt es nicht.</p>
      <label class="chk"><input id="aConsent" type="checkbox"><span>Ich habe die <a href="#" data-act="auth-view" data-v="privacy">Datenschutzerklärung</a> gelesen und willige in die Verarbeitung meiner Daten (E-Mail, Geburtsjahr, Trainingsdaten) zur Sicherung meines Fortschritts ein.</span></label>
      <button class="primary block" style="margin-top:14px" data-act="auth-register">Code senden</button>
      ${isClub ? `<p class="muted small center" style="margin-top:10px">Danach: Code eingeben, die Testwoche mit dem Paket für ${authPkg} Boxer starten (danach ${(PAKETE.find((x) => x.n === authPkg) || PAKETE[1]).preis} im Jahr), dann legst du deine Boxer an und gibst ihnen ihre Codes.</p>` : ''}${legalLinks()}`;
  } else if (view === 'confirm') {
    body = `${authBrand()}<h1 style="font-size:28px">Code eingeben</h1><p>${authPrev === 'register' ? `Wir haben einen Code an <b>${em}</b> geschickt.` : `Wir haben einen Code an <b>${em}</b> geschickt.`} Gib ihn hier ein, dann bist du angemeldet.</p>${authMessage()}
      <label for="aCode">Code aus der E-Mail</label><input id="aCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*">
      <button class="primary block" style="margin-top:16px" data-act="auth-verify">Anmelden</button>
      <p class="muted small">Keine Mail da? Schau im Spam-Ordner nach oder fordere einen neuen Code an.</p>
      <button class="linkbtn" data-act="auth-resend">Neuen Code senden</button>
      ${authPrev === 'register' ? '' : '<button class="linkbtn" data-act="auth-view" data-v="register">Noch kein Konto? Registrieren</button>'}
      <button class="linkbtn" data-act="auth-view" data-v="${authPrev === 'register' ? 'register' : 'login'}">Zurück</button>`;
  } else if (view === 'privacy' || view === 'imprint') {
    body = `<button class="ob-back" data-act="auth-view" data-v="${authPrev}">← Zurück</button>${view === 'privacy' ? legalPrivacy() : legalImprint()}`;
  }
  authShell(body);
}
async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    await fn();
  } finally {
    if (btn && document.body.contains(btn)) btn.disabled = false;
  }
}
async function doRegister(btn) {
  const email = document.getElementById('aEmail').value.trim();
  const year = Number(document.getElementById('aYear').value);
  const consent = document.getElementById('aConsent').checked;
  authEmail = email;
  const nowY = new Date().getFullYear();
  const clubName = authKind === 'verein' ? (document.getElementById('aClub')?.value || '').trim() : '';
  let problem = '';
  if (authKind === 'verein' && !clubName) problem = 'Bitte gib den Namen des Vereins ein.';
  else if (!/^\S+@\S+\.\S+$/.test(email)) problem = 'Bitte gib eine gültige E-Mail-Adresse ein.';
  else if (!year || year < 1900 || year > nowY) problem = 'Bitte gib dein Geburtsjahr ein.';
  else if (!consent) problem = 'Bitte stimme der Datenschutzerklärung zu.';
  if (problem) {
    authMsg = problem;
    renderAuth('register');
    const y = document.getElementById('aYear');
    if (y) y.value = year || '';
    return;
  }
  await withBusy(btn, async () => {
    const { error } = await cloud.sendCode(email, true, { birth_year: year, consent: true, ...(clubName ? { club_name: clubName.slice(0, 60), club_pkg: authPkg } : {}) });
    if (error) {
      authMsg = authError(error);
      return renderAuth('register');
    }
    try {
      if (clubName) localStorage.setItem(PENDCLUB_KEY, JSON.stringify({ name: clubName.slice(0, 60), pkg: authPkg, email: email.toLowerCase() }));
      else localStorage.removeItem(PENDCLUB_KEY);
    } catch {
      /* Speicher nicht verfügbar: dann legt der Trainer den Verein später im Profil an */
    }
    authMsg = '';
    authPrev = 'register';
    renderAuth('confirm');
  });
}
async function doCode(btn) {
  const email = document.getElementById('aEmail').value.trim();
  authEmail = email;
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    authMsg = 'Bitte gib eine gültige E-Mail-Adresse ein.';
    return renderAuth('login');
  }
  await withBusy(btn, async () => {
    const { error } = await cloud.sendCode(email, false);
    // Gibt es kein Konto, schickt der Server keine Mail. Das sagen wir dem Nutzer ehrlich.
    if (error) {
      authMsg = noAccountError(error) ? NO_ACCOUNT_MSG : authError(error);
      return renderAuth('login');
    }
    authMsg = '';
    authPrev = 'login';
    renderAuth('confirm');
  });
}
const NO_ACCOUNT_MSG = 'Zu dieser E-Mail-Adresse gibt es kein Konto. Prüfe die Schreibweise oder registriere dich.';
const noAccountError = (e) => /signups? not allowed|otp_disabled/i.test(String((e && (e.message || e.code)) || ''));
async function doResend(btn) {
  await withBusy(btn, async () => {
    const { error } = await cloud.sendCode(authEmail, authPrev === 'register', undefined);
    authMsg = error ? (noAccountError(error) ? NO_ACCOUNT_MSG : authError(error)) : 'Ein neuer Code ist unterwegs.';
    renderAuth('confirm');
  });
}
async function doVerify(btn) {
  const code = document.getElementById('aCode').value.replace(/\s/g, '');
  if (!/^\d{6,10}$/.test(code)) {
    authMsg = 'Bitte gib den Code aus der E-Mail ein (nur Ziffern).';
    return renderAuth('confirm');
  }
  await withBusy(btn, async () => {
    const { data, error } = await cloud.verifyCode(authEmail, code, 'email');
    if (error || !data?.session?.user) {
      authMsg = authError(error);
      return renderAuth('confirm');
    }
    authMsg = '';
    await startSession(data.session.user);
  });
}
// Anmeldung mit Passwort: nur für das Demo-Konto der App-Prüfung bei Apple
async function doPassword(btn) {
  const email = document.getElementById('aEmail').value.trim();
  const pw = document.getElementById('aPw').value;
  authEmail = email;
  if (!/^\S+@\S+\.\S+$/.test(email) || !pw) {
    authMsg = 'Bitte gib E-Mail-Adresse und Passwort ein.';
    return renderAuth('pw');
  }
  await withBusy(btn, async () => {
    const { data, error } = await cloud.signInPassword(email, pw);
    if (error || !data?.session?.user) {
      authMsg = authError(error);
      return renderAuth('pw');
    }
    authMsg = '';
    await startSession(data.session.user);
  });
}
let signingOut = false; // wir melden selbst ab oder löschen das Konto: kein Hinweis „Anmeldung abgelaufen“
let sessionWarned = false;
// Beim Abmelden und beim Löschen des Kontos alle geplanten und angezeigten Mitteilungen entfernen (sonst kommen die des alten Kontos weiter)
async function cancelAllNativeNotifications() {
  const ln = nativePlugin('LocalNotifications');
  if (!ln) return;
  try {
    const pending = await ln.getPending();
    if (pending && pending.notifications && pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    await ln.removeAllDeliveredNotifications();
  } catch {
    /* Mitteilungen ließen sich nicht entfernen, die App meldet trotzdem ab */
  }
}
// Daten dieses Kontos auf dem Gerät entfernen, dazu die Fragen, die zum Konto gehören (das nächste Konto bekommt sie wieder)
function clearDeviceData() {
  try {
    for (const k of [KEY, SYNC_KEY, BASE_KEY, RUN_KEY, CLUBASK_KEY, CLUBHIDE_KEY, SETUPASK_KEY, PENDCLUB_KEY, CLUBSKIP_KEY]) localStorage.removeItem(k);
  } catch {
    /* ignorieren */
  }
}
async function doLogout() {
  const ok = await pushNow();
  if (!ok && !confirm('Die letzten Änderungen konnten nicht gesichert werden. Trotzdem abmelden? Sie gehen dann verloren.')) return;
  signingOut = true;
  if (pushSupported()) await pushDisable(); // dieses Gerät soll keine Mitteilungen des alten Kontos mehr bekommen
  try {
    await cloud.signOut();
  } catch {
    /* lokal abmelden genügt */
  }
  await cancelAllNativeNotifications();
  clearDeviceData();
  location.hash = '';
  location.reload();
}
async function doDeleteAccount() {
  if (!confirm('Konto wirklich löschen?\n\nDein Konto und alle gesicherten Daten werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.')) return;
  if (!confirm('Letzte Rückfrage: Konto jetzt endgültig löschen?')) return;
  // Zur Sicherheit muss man sich erneut ausweisen: Code an die E-Mail-Adresse des Kontos
  const email = account && account.email;
  if (!email) {
    alert('Das Konto konnte nicht geprüft werden. Bitte melde dich neu an.');
    return;
  }
  const { error } = await cloud.sendCode(email, false);
  if (error) {
    alert('Der Bestätigungs-Code konnte nicht gesendet werden. Bitte versuche es später noch einmal.');
    return;
  }
  showDeleteSheet(email);
}
function showDeleteSheet(email, msg = '') {
  let sheet = document.getElementById('delsheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'delsheet';
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
  }
  document.body.classList.add('obopen');
  sheet.dataset.email = email;
  sheet.innerHTML = `<div class="sheet-in"><h1 style="font-size:28px">Konto löschen</h1>
    <p>Zur Sicherheit haben wir einen Code an <b>${esc(email)}</b> geschickt. Gib ihn ein, dann werden dein Konto und alle gesicherten Daten endgültig gelöscht.</p>
    ${msg ? `<div class="notice" role="alert">${esc(msg)}</div>` : ''}
    <label for="dCode">Code aus der E-Mail</label><input id="dCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*">
    <button class="danger block" style="margin-top:16px" data-act="del-confirm">Konto endgültig löschen</button>
    <button class="linkbtn" data-act="del-cancel">Abbrechen, Konto behalten</button></div>`;
  sheet.scrollTop = 0;
}
function closeDeleteSheet() {
  document.getElementById('delsheet')?.remove();
  if (!document.getElementById('onboard') && !document.getElementById('auth')) document.body.classList.remove('obopen');
}
async function doDeleteConfirm(btn) {
  const email = document.getElementById('delsheet')?.dataset.email || '';
  const code = (document.getElementById('dCode')?.value || '').replace(/\s/g, '');
  if (!/^\d{6,10}$/.test(code)) return showDeleteSheet(email, 'Bitte gib den Code aus der E-Mail ein (nur Ziffern).');
  await withBusy(btn, async () => {
    const { error } = await cloud.verifyCode(email, code, 'email');
    if (error) return showDeleteSheet(email, authError(error));
    signingOut = true;
    try {
      await cloud.deleteAccount();
    } catch {
      signingOut = false;
      return showDeleteSheet(email, 'Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal.');
    }
    await cancelAllNativeNotifications();
    clearDeviceData();
    location.hash = '';
    location.reload();
  });
}

/* ---- Konto in den Einstellungen und rechtliche Seiten (Entwurf) ---- */
function accountDangerZone() {
  if (!account) return '';
  return `<div class="btn-row"><button class="danger" data-act="delacc">Konto löschen</button></div>`;
}
function legalPrivacy() {
  return `<h1>Datenschutz</h1>
  <h2>Wer ist verantwortlich?</h2><p>Ahmet Özcorapci<br>Hospitalgasse 36d<br>61169 Friedberg<br>Kontakt für Datenschutzfragen: siehe Impressum.</p>
  <h2>Welche Daten werden verarbeitet?</h2>
  <ul class="plain"><li><b>Konto:</b> E-Mail-Adresse, Geburtsjahr und der Zeitpunkt deiner Einwilligung.</li>
  <li><b>Rückmeldungen:</b> Wenn du über „Fehler melden“ etwas schickst, wird deine Meldung als <b>öffentliches Issue auf GitHub</b> veröffentlicht, ohne deinen Namen und ohne deine E-Mail-Adresse. Sie enthält deinen Text, die Art, die Seite, auf der du warst, die App-Version, die vollständige Kennung deines Browsers und Geräts, die Bildschirmgröße, ob du online warst, die letzte Fehlermeldung der App und deine Einstellungen (Altersklasse, Trainingshäufigkeit, Runden, ob ein Test-Watt vorliegt). Damit du den Stand sehen kannst, speichert die App in deinem Konto außerdem die Nummer deiner Meldung und ihre erste Zeile (bis 60 Zeichen). Das wird mit dem Konto gelöscht. Eine einmal veröffentlichte Meldung wird nicht automatisch gelöscht, wenn du dein Konto löschst. Schreibe deshalb keine privaten Daten in den Text.</li>
  <li><b>Trainingsdaten:</b> Altersklasse, Kampftermin, Trainingshäufigkeit, Kampfformat, Test-Watt mit Datum, erledigte Einheiten und deine Einstellungen.</li>
  <li><b>Technisch:</b> Beim Aufruf der Seite verarbeitet der Hosting-Anbieter deine IP-Adresse. Beim Anmelden und beim Sichern verarbeitet der Konto-Anbieter technische Zugriffsdaten (z. B. IP-Adresse und Zeitpunkt) in seinen Protokollen. Dein Geburtsjahr liegt zusätzlich in den Kontodaten des Anmeldedienstes.</li>
  <li><b>E-Mails:</b> Für den Anmelde-Code wird eine E-Mail über den Mail-Dienst des Konto-Anbieters verschickt. Hast du dich registriert, den Code aber nicht eingegeben, schicken wir dir nach etwa einem Tag einmal einen neuen Code. Danach melden wir uns nicht mehr per E-Mail.</li>
  <li><b>Mitteilungen in der Web-Version:</b> Wenn du in den Einstellungen „Hinweise“ einschaltest, speichern wir die Adresse deines Geräts für Mitteilungen (die Push-Adresse deines Browsers) und die dafür nötigen Schlüssel. Unser Server schickt dir darüber Erinnerungen zu deinen Trainingszeiten und, wenn du ein paar Tage nicht da warst, einen Hinweis. Trainer bekommen eine Mitteilung, wenn Boxer ein paar Tage nicht trainiert haben. Der Push-Dienst deines Browsers oder Geräts (zum Beispiel von Apple, Google oder Mozilla) leitet die Mitteilung weiter und verarbeitet dabei technische Daten. Wir merken uns, welche Mitteilung wann geschickt wurde, damit niemand doppelt benachrichtigt wird (60 Tage). Du kannst die Hinweise jederzeit in den Einstellungen oder im Browser ausschalten, beim Abmelden und Löschen deines Kontos werden die Daten gelöscht.</li>
  <li><b>Erinnerungen in der iPhone-App:</b> Wenn du es erlaubst, schickt die App Mitteilungen auf dein Gerät (zum Beispiel zu deinen Trainingseinheiten oder wenn deine Einrichtung nach einem Tag noch offen ist). Diese Mitteilungen werden auf deinem Gerät geplant, es werden dafür keine Daten an einen Server geschickt. Du kannst sie jederzeit in den iPhone-Einstellungen ausschalten.</li>
  <li><b>Verein und Trainer:</b> Nur wenn du einen Vereins-Code einlöst, sieht dein Trainer einen Teil deiner Trainingsdaten: den Namen, den der Trainer für deinen Platz eingetragen hat, deine erledigten Einheiten, deine Plan-Woche und Phase, ob und wie lange du die letzten Einheiten gelaufen bist und ob du sie ohne Pause und ohne Überspringen durchgezogen hast, deinen Test-Watt mit Datum sowie den Zeitpunkt deiner letzten Anmeldung und Speicherung. Deine E-Mail-Adresse sieht der Trainer nicht. Ohne eingelösten Code sieht dein Trainer diese Daten nicht. Auch der Betreiber der App kann den Stand der Boxer eines Vereins einsehen, um die Vereine zu betreuen. Das Konto bleibt dein Konto: Du kannst den Verein jederzeit unter „Profil“, „Verein“ selbst verlassen. Dann sieht der Trainer dich nicht mehr. Löschst du dein Konto, ist dein Platz ebenfalls frei.</li>
  <li><b>Abo und Verein:</b> Schließt du ein Abo „Ohne Werbung“ ab, speichern wir Art und Laufzeit des Abos und woher es kommt (später Apple oder Google). Registrierst du einen Verein, speichern wir den Vereinsnamen, das gewählte Paket und die E-Mail-Adresse des Trainers. Der Betreiber der App sieht im Admin-Bereich die Vereine mit E-Mail-Adresse des Trainers, Paket und Nutzung.</li></ul>
  <h2>Wozu?</h2><p>Zur Anmeldung und damit dein Fortschritt gesichert ist und auf einem neuen Gerät wieder zur Verfügung steht. ${AD_ENABLED ? 'In der Web-Version gibt es keine Werbung und keine Auswertung deines Verhaltens durch Dritte. <b>In der iPhone-App</b> läuft vor einer neuen Einheit ein Werbevideo (Google AdMob). Dafür kann Google Geräte- und Nutzungsdaten verarbeiten, zum Beispiel deine IP-Adresse, Kennungen deines Geräts und Angaben dazu, welche Anzeige gezeigt und angesehen wurde. Ob personalisierte Werbung erlaubt ist, entscheidest du in der Abfrage der App.' : 'Es gibt keine Werbung und keine Auswertung deines Verhaltens durch Dritte.'}</p>
  <h2>Rechtsgrundlage</h2><p>Deine Einwilligung und die Bereitstellung der App (Art. 6 Abs. 1 Buchst. a und b DSGVO).</p>
  <h2>Alter</h2><p>Dein Geburtsjahr bestimmt deine Altersklasse und damit den Umfang deines Plans. Es gibt kein Mindestalter und keine Einwilligung der Eltern, das Alter wird nicht nachgewiesen.</p>
  <h2>Wer erhält die Daten?</h2><p>Konto und Trainingsdaten liegen bei Supabase (Datenbank in Frankfurt am Main). Die Seite selbst wird über GitHub Pages ausgeliefert. Meldungen laufen über Supabase zu GitHub.${AD_ENABLED ? ' In der iPhone-App erhält außerdem Google (AdMob) die Daten für die Werbung, siehe oben.' : ''} Wenn du unter „Meine Meldungen“ den Stand abrufst, verbindet sich dein Gerät direkt mit GitHub, das dabei deine IP-Adresse verarbeitet. Mit beiden Anbietern sind Auftragsverarbeitungsverträge zu prüfen und die Frage einer Übermittlung in Drittländer zu klären.</p>
  <h2>Speicherung auf deinem Gerät</h2><p>Die App speichert Einstellungen, Fortschritt und dein Anmelde-Token zusätzlich in deinem Browser (lokaler Speicher), damit sie auch offline funktioniert und du angemeldet bleibst. Dazu gehört bei der Registrierung als Verein auch der Vereinswunsch (Vereinsname, Paket und E-Mail-Adresse), den die App bis zur Bestätigung des Pakets merkt. Beim Abmelden werden diese Daten auf dem Gerät gelöscht.</p>
  <h2>Wie lange?</h2><p>Bis du dein Konto löschst. Das geht jederzeit in den Einstellungen („Konto löschen“). Dabei werden Konto und alle gesicherten Daten in der Datenbank gelöscht. Sicherungskopien und Protokolle des Anbieters können noch eine begrenzte Zeit weiter bestehen.</p>
  <h2>Deine Rechte</h2><p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerruf deiner Einwilligung (mit Wirkung für die Zukunft) sowie Beschwerde bei der zuständigen Datenschutz-Aufsichtsbehörde. Wende dich dazu an die oben genannte Stelle.</p>`;
}
const viewNews = () => `<a href="#/more" class="back">← Mehr</a><h1>Das ist neu</h1>${NEUES.map((n) => `<div class="card"><div class="row between"><b>Version ${esc(n.v)}</b><span class="muted small">${esc(n.datum)}</span></div><ul class="news">${n.punkte.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}`;
const viewLegal = (which) => `<a href="#/more" class="back">← Mehr</a>${which === 'privacy' ? legalPrivacy() : legalImprint()}`;

/* ---------------- Ereignisse ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.tagName === 'A' && t.getAttribute('href') === '#') e.preventDefault();
  const act = t.dataset.act;
  switch (act) {
    case 'intro-skip':
      closeIntro();
      break;
    case 'intro-sound': {
      const v = document.querySelector('#intro video');
      if (v) {
        v.muted = !v.muted;
        t.textContent = v.muted ? 'Ton an' : 'Ton aus';
        t.setAttribute('aria-pressed', String(!v.muted));
      }
      break;
    }
    case 'auth-view':
      authMsg = '';
      renderAuth(t.dataset.v);
      break;
    case 'auth-register':
      doRegister(t);
      break;
    case 'auth-verify':
      doVerify(t);
      break;
    case 'auth-code':
      doCode(t);
      break;
    case 'auth-pw':
      doPassword(t);
      break;
    case 'auth-resend':
      doResend(t);
      break;
    case 'logout':
      doLogout();
      break;
    case 'admin-refresh':
      loadAdmin();
      break;
    case 'admin-del':
      adminDelete(t.dataset.id, t.dataset.mail);
      break;
    case 'gym-refresh':
      gym.state = 'idle';
      loadGym();
      break;
    case 'gym-create':
      gymDo(() => cloud.gymCreate(document.getElementById('gymName')?.value || ''), 'Verein angelegt');
      break;
    case 'gym-redeem':
      gymDo(() => cloud.gymRedeem(document.getElementById('gymCode')?.value || ''), 'Code eingelöst');
      break;
    case 'pkg-pick':
      gym.name = document.getElementById('gymName')?.value ?? gym.name;
      gym.pkg = Number(t.dataset.n) || 5;
      gymRender();
      break;
    case 'gym-pkg-buy':
      if (!testPay() && vorschau()) {
        kaufVorschauAlert();
        break;
      }
      gymDo(() => cloud.gymTestPackage(gym.pkg || 5), 'Paket gewählt (Testkauf)');
      break;
    case 'gym-create-pkg': {
      if (!testPay() && vorschau()) {
        kaufVorschauAlert();
        break;
      }
      const nm = document.getElementById('gymName')?.value || '';
      const nPk = gym.pkg || 5;
      gymDo(async () => {
        const r = await cloud.gymCreate(nm);
        if (r.error || (r.data && r.data.fehler)) return r;
        return cloud.gymTestPackage(nPk); // Testkauf, nur Admin (die Datenbank prüft das), echter Kauf kommt mit der iPhone-App 1.1
      }, 'Verein angelegt');
      break;
    }
    case 'abo-pick':
      aboPick = t.dataset.art === 'monat' ? 'monat' : 'jahr';
      route();
      break;
    case 'abo-buy':
      aboBuy();
      break;
    case 'abo-end':
      aboEnd();
      break;
    case 'plan-reset':
      resetPlan();
      break;
    case 'abo-skip':
      adChoiceId = t.dataset.id || '';
      route();
      break;
    case 'gym-invite': {
      const vn = (gym.data && gym.data.name) || '';
      const txt = `Hallo ${t.dataset.name || ''}, ich habe dir bei Nonstop Boxing einen Platz in unserem Verein ${vn} angelegt. Melde dich in der App als Privatperson an und gib danach deinen Code ein (Startseite: „Code eingeben“, oder Profil, Verein). Dein Code: ${t.dataset.code || ''}. Damit trainierst du ohne Werbung.`;
      copyText(txt).then((okc) => (okc ? toast('Einladung kopiert') : alert(`Der Text konnte nicht kopiert werden. Bitte von Hand abschreiben:\n\n${txt}`)));
      break;
    }
    case 'gym-add':
      gymDo(() => cloud.gymAddSeat(document.getElementById('gymSeatName')?.value || ''), 'Platz angelegt');
      break;
    case 'gym-del':
      if (confirm(`${t.dataset.name || 'Diesen Boxer'} wirklich löschen?\n\nDer Code ist danach ungültig und der Boxer verliert den Zugang über den Verein. Sein Fortschritt bleibt erhalten.`)) gymDo(() => cloud.gymDeleteSeat(t.dataset.id), 'Boxer gelöscht');
      break;
    case 'gym-leave':
      if (confirm('Verein wirklich verlassen?\n\nDein Trainer sieht dich danach nicht mehr und du trainierst wieder mit Werbung. Dein Konto und dein Fortschritt bleiben.')) gymDo(() => cloud.gymLeave(), 'Du hast den Verein verlassen');
      break;
    case 'gym-copy':
      copyText(t.dataset.code || '').then((okc) => (okc ? toast('Code kopiert') : alert(`Der Code konnte nicht kopiert werden. Bitte von Hand abschreiben: ${t.dataset.code || ''}`)));
      break;
    case 'gym-pkg':
      gymDo(() => cloud.gymTestPackage(Number(t.dataset.n)), 'Test-Paket gesetzt');
      break;
    case 'gym-week':
      gymDo(() => cloud.gymTestWeek(Number(t.dataset.n)), 'Testwoche gestartet');
      break;
    case 'gym-weekset':
      gymDo(() => cloud.gymTestWeekSet(Number(t.dataset.d)), 'Testwoche verschoben');
      break;
    case 'del-confirm':
      doDeleteConfirm(t);
      break;
    case 'del-cancel':
      closeDeleteSheet();
      break;
    case 'delacc':
      doDeleteAccount();
      break;
    case 'ob-next':
      obNext();
      break;
    case 'ob-back':
      obBack();
      break;
    case 'ob-skip':
      closeOnboarding();
      break;
    case 'ob-finish':
      closeOnboarding();
      location.hash = '#/';
      scheduleReminder(); // Erinnerung zur Einrichtung entfällt, wenn sie jetzt fertig ist
      setTimeout(maybeAskClub, 800);
      break;
    case 'club-ask-go':
      clubAskGo();
      break;
    case 'club-ask-later':
      document.getElementById('clubask')?.remove();
      setTimeout(maybeAskNotif, 300);
      break;
    case 'relogin':
      document.getElementById('sessionexp')?.remove();
      signingOut = true;
      (async () => {
        try {
          await cloud.signOut('local');
        } catch {
          /* lokal abgemeldet genügt */
        }
        account = null;
        renderAuth('login');
      })();
      break;
    case 'auth-kind':
      authKind = t.dataset.k === 'verein' ? 'verein' : 'privat';
      renderAuth('register');
      break;
    case 'auth-pkg':
      authPkg = Number(t.dataset.n) || 5;
      renderAuth('register');
      break;
    case 'clubbuy-go':
      clubBuyGo();
      break;
    case 'clubbuy-later':
      clubBuyLater();
      break;
    case 'tr-open':
      tr.open = tr.open === t.dataset.id ? '' : t.dataset.id;
      trRender();
      break;
    case 'tr-refresh':
      tr.state = 'idle';
      if (location.hash.startsWith('#/club/')) loadClubView(location.hash.slice(7));
      else loadTrainer();
      break;
    case 'adm-club-open': {
      const cid = document.getElementById('admClub')?.value;
      if (cid && /^[0-9a-f-]{36}$/i.test(cid)) location.hash = `#/club/${cid}`;
      break;
    }
    case 'setupask-yes':
      document.getElementById('setupask')?.remove();
      enableNativeNotif();
      break;
    case 'setupask-no':
      document.getElementById('setupask')?.remove();
      break;
    case 'club-hide':
      try {
        localStorage.setItem(CLUBHIDE_KEY, '1');
      } catch {
        /* Speicher nicht verfügbar */
      }
      route();
      break;
    case 'ob-replay':
      startOnboarding(0);
      break;
    case 'ob-profile-toggle':
      ob.fightDraft = document.getElementById('obFight')?.value || '';
      ob.profileOpen = !ob.profileOpen;
      renderOnboarding();
      break;
    case 'ob-profile':
      if (!allowedProfiles().includes(t.dataset.key)) break;
      ob.fightDraft = document.getElementById('obFight')?.value || '';
      ob.profileOpen = false;
      state.profile = t.dataset.key;
      if (!ob.lenChosen && PROFILES[state.profile] && PROFILES[state.profile].roundSecs) state.roundMin = PROFILES[state.profile].roundSecs / 60;
      save();
      renderOnboarding();
      break;
    case 'ob-freq': {
      ob.fightDraft = document.getElementById('obFight')?.value || '';
      state.freq = Number(t.dataset.n);
      save();
      renderOnboarding();
      break;
    }
    case 'ob-rounds':
      ob.fightDraft = document.getElementById('obFight')?.value || '';
      state.rounds = Number(t.dataset.n);
      save();
      renderOnboarding();
      break;
    case 'ob-rlen':
      ob.lenChosen = true;
      ob.fightDraft = document.getElementById('obFight')?.value || '';
      state.roundMin = Number(t.dataset.n);
      save();
      renderOnboarding();
      break;
    case 'ob-nodate':
      obNext(true);
      break;
    case 'ob-savemax':
      if (saveTestWatt('ob')) {
        ob.step += 1;
        renderOnboarding();
      }
      break;
    case 'ob-test':
      closeOnboarding();
      location.hash = '#/test';
      break;
    case 'fb-kind':
      fb.text = document.getElementById('fbText')?.value || '';
      fb.kind = t.dataset.k;
      route();
      break;
    case 'fb-send':
      sendFeedbackNow();
      break;
    case 'fb-again':
      fb = { kind: 'fehler', text: '', sent: false, busy: false };
      route();
      break;
    case 'notifask-when': {
      const w = TRAIN_WHEN[t.dataset.w];
      document.getElementById('notifask')?.remove();
      if (w) {
        state.when = t.dataset.w;
        state.time = w.time;
        save();
      }
      enableNativeNotif();
      break;
    }
    case 'notifask-no':
      document.getElementById('notifask')?.remove();
      break;
    case 'oldver-store': {
      const launcher = nativePlugin('AppLauncher');
      if (launcher && typeof launcher.openUrl === 'function') launcher.openUrl({ url: STORE_URL }).catch(() => {});
      else window.open(STORE_URL, '_blank');
      break;
    }
    case 'oldver-close':
      document.getElementById('oldver')?.remove();
      break;
    case 'news-close':
      document.getElementById('newsnote')?.remove();
      break;
    case 'update-reload':
      if (document.body.classList.contains('running') && !confirm('Dein Training läuft noch. Trotzdem neu laden?')) break;
      hardReload();
      break;
    case 'pickdate':
      openCalendar(t.dataset.for);
      break;
    case 'cal-prev':
      cal.m -= 1;
      if (cal.m < 0) { cal.m = 11; cal.y -= 1; }
      renderCalendar();
      break;
    case 'cal-next':
      cal.m += 1;
      if (cal.m > 11) { cal.m = 0; cal.y += 1; }
      renderCalendar();
      break;
    case 'cal-day':
      pickDate(t.dataset.iso);
      break;
    case 'cal-today': {
      const n = new Date();
      pickDate(isoOf(n.getFullYear(), n.getMonth(), n.getDate()));
      break;
    }
    case 'closemodal':
      $modal.hidden = true;
      $modal.className = '';
      $modal.innerHTML = '';
      break;
    case 'start':
      ensureAudio();
      break;
    case 'opt':
      state.recOpt = t.dataset.key;
      save();
      route();
      break;
    case 'markdone':
      state.done[t.dataset.id] = new Date().toISOString();
      save();
      scheduleReminder();
      updateTrainerInfo();
      refreshClubAfterUnit();
      route();
      break;
    case 'unmark':
      delete state.done[t.dataset.id];
      save();
      scheduleReminder();
      updateTrainerInfo();
      route();
      break;
    case 'savetest':
      if (saveSprints('tw')) {
        if (state.runs && state.runs.test) {
          state.runs.test.sv = new Date().toISOString();
          save();
        }
        toast(`Test-Watt gespeichert: ${state.maxW} W`);
        location.hash = '#/progress';
      }
      break;
    case 'savemax':
      if (saveTestWatt('mi')) {
        toast(`Test-Watt gespeichert: ${state.maxW} W`);
        if (location.hash === '#/test') location.hash = '#/progress';
        else route();
      }
      break;
    case 'tpause':
      runCtl?.toggle();
      break;
    case 'tprev':
      runCtl?.prev();
      break;
    case 'tnext':
      runCtl?.next();
      break;
    case 'te-ok':
      runCtl?.entryOk();
      break;
    case 'te-close':
      runCtl?.entryClose();
      break;
    case 'texit':
      if (timerDone() || confirm('Training wirklich abbrechen?')) {
        leaveOk = true;
        const id = location.hash.split('/')[2];
        location.hash = id === 'test' ? '#/test' : `#/s/${id}`;
      }
      break;
    case 'tdone':
      state.done[t.dataset.id] = new Date().toISOString();
      if (state.runs && state.runs[t.dataset.id]) state.runs[t.dataset.id].sv = state.done[t.dataset.id]; // Zeitpunkt von „Speichern“ für den Trainer
      save();
      scheduleReminder();
      updateTrainerInfo();
      refreshClubAfterUnit();
      location.hash = '#/';
      break;
    case 'fight-remove':
      if (confirm('Kampftermin entfernen? Der Plan läuft dann über 10 Wochen ab heute.')) {
        const n = new Date();
        state.fightDate = '';
        state.planBase = '';
        state.startDate = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        save();
        scheduleReminder();
        route();
        toast('Gespeichert');
      }
      break;
    case 'ics':
      if (!plan().weeks[0]?.monday) {
        alert('Bitte zuerst den Kampftermin setzen.');
        break;
      }
      download('nonstop-boxing-training.ics', buildICS(), 'text/calendar');
      break;
    case 'notif':
      if (pushSupported()) {
        togglePush();
      } else if (iosNeedsHome() && !nativePlugin('LocalNotifications')) {
        alert(IOS_HOME_HINT);
      } else if (state.notify) {
        state.notify = false;
        save();
        scheduleReminder();
        route();
      } else if (nativePlugin('LocalNotifications')) {
        enableNativeNotif();
      } else if ('Notification' in window) {
        Notification.requestPermission().then((p) => {
          state.notify = p === 'granted';
          save();
          scheduleReminder();
          route();
        });
      }
      break;
    case 'open-settings':
      openAppSettings();
      break;
    case 'export':
      download(`nonstop-boxing-sicherung-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
      break;
    case 'reset':
      if (confirm('Fortschritt wirklich löschen? Deine Einstellungen bleiben erhalten.')) {
        state.done = {};
        save();
        route();
      }
      break;
    default:
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'import' && t.files?.[0]) {
    const file = t.files[0];
    t.value = ''; // dieselbe Datei lässt sich danach erneut wählen
    if (file.size > 500000) {
      alert('Die Datei ist zu groß für eine Sicherung.');
      return;
    }
    file.text().then((txt) => {
      let next;
      try {
        next = sanitizeImport(JSON.parse(txt));
      } catch {
        alert('Datei konnte nicht gelesen werden. Es ist keine gültige Sicherung.');
        return;
      }
      if (!confirm(`Sicherung einspielen? Dein aktueller Stand wird ersetzt. In der Datei: ${Object.keys(next.done).length} erledigte Einheiten.`)) return;
      state = next;
      save();
      route();
      alert('Sicherung wiederhergestellt.');
    });
    return;
  }
  if (t.dataset.set) {
    const k = t.dataset.set;
    if (k === 'profile' && !allowedProfiles().includes(t.value)) {
      route();
      return;
    }
    if (k === 'fightDate' && t.value) {
      const d = parseDay(t.value);
      if (!d || d <= startOfDay(new Date())) {
        toast('Bitte ein Datum in der Zukunft eintragen (frühestens morgen).');
        route();
        return;
      }
    }
    if (k === 'maxW' || k === 'age') {
      const v = Number(t.value);
      const [lo, hi] = k === 'maxW' ? [100, 3000] : [10, 90];
      if (t.value !== '' && !(v >= lo && v <= hi)) {
        toast(k === 'maxW' ? 'Test-Watt: bitte 100 bis 3000 Watt eingeben.' : 'Alter: bitte 10 bis 90 eingeben.');
        route();
        return;
      }
    }
    state[k] = ['maxW', 'age', 'freq', 'rounds', 'roundMin'].includes(k) ? Math.round(Number(t.value)) || 0 : t.value;
    if (k === 'when' && TRAIN_WHEN[t.value]) state.time = TRAIN_WHEN[t.value].time;
    if (k === 'fightDate') freezePlan();
    if (k === 'maxW') { state.sprints = []; state.maxWDate = state.maxW ? new Date().toISOString() : ''; }
    if (k === 'profile' && PROFILES[t.value] && PROFILES[t.value].roundSecs) state.roundMin = PROFILES[t.value].roundSecs / 60;
    save();
    scheduleReminder();
    route();
    toast('Gespeichert');
  } else if (t.dataset.setDay) {
    const key = t.dataset.setDay;
    const val = Number(t.value);
    // Zwei harte Einheiten brauchen mindestens einen Tag Abstand (auch von Sonntag auf Montag)
    const hard = ['s1', 's2', 's3'].slice(0, effFreq());
    const tooClose = (a, b) => {
      const d = Math.abs(a - b);
      return Math.min(d, 7 - d) < 2;
    };
    if (hard.includes(key) && hard.some((o) => o !== key && tooClose(val, Number(state.days[o])))) {
      toast('Zwei harte Einheiten brauchen mindestens einen Ruhetag dazwischen.');
      route();
      return;
    }
    state.days[key] = val;
    save();
    scheduleReminder();
    toast('Gespeichert');
    route();
  }
});

window.addEventListener('hashchange', () => {
  if (!account) return;
  // Läuft ein Training, fragt auch die Zurück-Taste nach, statt es still abzubrechen
  if (document.body.classList.contains('running') && !timerDone()) {
    if (location.hash === runHash) return; // Rückkehr zur laufenden Einheit
    if (!leaveOk && !confirm('Training wirklich verlassen? Der Stand dieser Einheit geht verloren.')) {
      location.hash = runHash;
      return;
    }
  }
  leaveOk = false;
  route();
});
window.addEventListener('beforeunload', (e) => {
  if (!reloading && document.body.classList.contains('running') && !timerDone()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('#auth') && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
    document.querySelector('#auth .primary')?.click();
  }
});

/* ---------------- Start ---------------- */
boot();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Update-Hinweis: Eine neue Version der App meldet sich per Banner, statt unbemerkt erst beim übernächsten Start zu erscheinen
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 30 * 60 * 1000);
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner();
  });
}
// Zusätzliche Prüfung unabhängig vom Service Worker (nötig für die App auf dem Home-Bildschirm): die App fragt selbst, welche Version online ist.
// Die Zahl muss gleich der in sw.js (redline-vNN) sein. Bei jeder Änderung beide erhöhen.
const APP_BUILD = 154;
// Die Version, die Nutzer sehen (gleich der Version im App Store). APP_BUILD ist nur die interne Zählung für den Hinweis "Neu laden".
const APP_VERSION = '1.1';
// Neuigkeiten, neueste zuerst. Bei jeder sichtbaren Änderung oben einen Eintrag ergänzen (neue Version nur, wenn auch im App Store eine neue Version erscheint).
const NEUES = [
  { v: '1.1', datum: '21.11.2026', punkte: ['Kontakt: Impressum und Datenschutz nennen jetzt die Adresse support@nonstop-boxing.de.', 'Neu in der Web-Version: Mitteilungen direkt aufs Gerät, auch wenn die App geschlossen ist. Schalte unter „Einstellungen“, „Erinnerungen“ die Hinweise ein. Du bekommst eine Erinnerung zur Trainingszeit und einen Hinweis, wenn du ein paar Tage nicht da warst. Trainer erfahren, wenn Boxer ein paar Tage nicht trainiert haben. Auf dem iPhone geht das nur, wenn du die Seite zum Home-Bildschirm hinzufügst.', 'Vorschau: Auch die Vereinspakete sind ausgegraut. Darunter steht der Knopf „Kostenlos weitermachen (Werbung wird nur simuliert)“. „Weiter mit Werbung (Simulation)“ ist jetzt als roter Knopf gut zu sehen.', 'Vorschau: Die Preise bei „Ohne Werbung“ sind ausgegraut und nicht anklickbar. Nur „Weiter mit Werbung (Simulation)“ funktioniert.', 'Der Admin sieht bei „Ohne Werbung“ und bei den Vereinspaketen dieselbe Vorschau wie alle anderen. Den gespielten Kauf gibt es nur noch für Testkonten.', 'Vorschau: Ab dem zweiten Training siehst du jetzt auch in der Web-Version die Auswahl „Ohne Werbung“ und die Werbung (ein Platzhalter mit Countdown). Bezahlen ist noch nicht freigeschaltet, du nutzt alles vorerst kostenlos.', 'Neu starten: Hast du keinen Kampftermin (zum Beispiel nach „Ich habe keinen Kampftermin mehr“), bekommt der Schritt „Kampftermin“ auf der Startseite und im Plan kein Häkchen mehr. Der Knopf führt zum Eintragen, der Fitness-Test geht auch ohne Termin.', 'Verein: Auch auf der Seite „Registrieren“ steht jetzt, dass die erste Woche kostenlos ist.', 'Verein: Eine Woche kostenlos testen. Du wählst bei der Registrierung dein Paket (3, 5 oder 10 Boxer) und testest es sieben Tage ohne Bezahlung. Du und deine Boxer trainieren in dieser Zeit ohne Werbung. Danach brauchst du das Paket, sonst trainiert ihr mit Werbung oder Abo weiter. Die Codes bleiben gültig.', 'Neu starten: Solange Kampftermin oder Fitness-Test fehlen, zeigt die App eine Karte „So startest du“ mit den zwei Schritten und einem Knopf zum nächsten.', 'Verein: Die Schritte unter „So geht es weiter“ haben keine Häkchen mehr, und die Seite heißt auch beim ersten Öffnen „Deine Boxer“.', 'Plan zurücksetzen: Ist der Kampf abgesagt oder willst du neu anfangen, setzt du den Plan unter „Einstellungen“ zurück. Kampftermin, Test-Watt und erledigte Einheiten werden gelöscht, danach legst du alles neu an.', 'Trainingsplan: Den Plan gibt es erst, wenn du deinen Kampftermin eingetragen und den Fitness-Test gemacht hast. Vorher zeigt die App, was noch fehlt. Das gilt für alle, auch für Trainer, die selbst trainieren.', 'Verein: Als Trainer trainierst du zusätzlich zu deinen Boxern selbst ohne Werbung und ohne eigenes Abo mit. Das steht jetzt bei der Registrierung und beim Paket.', 'Einheiten: Die Blöcke eines Satzes (zum Beispiel 20 s Arbeit, 20 s Pause, 20 s Arbeit, 3 min Pause) stehen jetzt sauber in zwei Spalten untereinander.', 'Verein: Nach der Registrierung gibt es keine Einrichtung für Privatpersonen mehr, sondern gleich „Paket bestätigen“. Danach legst du unter „Deine Boxer“ deine Boxer an, kopierst eine Einladung mit dem Code und schickst sie ab. Die Startseite zeigt dir den nächsten Schritt.', 'Neu: Du kannst dich jetzt als Verein registrieren. Du siehst die drei Pakete (3, 5 oder 10 Boxer) mit allem, was dabei ist, und bestätigst dein Paket nach der Anmeldung. Admin: Auswertung der Vereine mit Paketen und Nutzung.', 'Fehlerbehebung: Wer selbst einen Verein besitzt und Admin ist, galt fälschlich als werbefrei und sah die Auswahl „Ohne Werbung“ nicht.', 'Neu: „Ohne Werbung“. Das erste Training ist gratis. Ab dem zweiten wählst du ein Abo (Monat 1,99 €, Jahr 14,99 €) oder trainierst mit Werbung. Vereine wählen beim Anlegen ein Paket (3, 5 oder 10 Boxer). Zum Testen wird der Kauf nur gespielt.', 'Anmelden mit einer E-Mail-Adresse ohne Konto: Die App sagt jetzt gleich, dass es kein Konto gibt, statt so zu tun, als wäre ein Code unterwegs.', 'Neu: Oben rechts gibt es das Profil (Mensch-Symbol). Dort sind dein Konto, Abmelden, Einstellungen und der Verein. Trainer sehen dort gleich ihre Boxer. Unter „Mehr“ stehen Einführung, Fehler melden, Meine Meldungen und „Das ist neu“.', 'Boxer können den Verein jetzt selbst verlassen (unter „Profil“, „Verein“). Der Trainer sieht sie dann nicht mehr, Konto und Fortschritt bleiben.', 'Der Datenschutztext erklärt jetzt, was dein Trainer im Verein von dir sieht und dass auch der Betreiber der App den Stand der Vereine einsehen kann.', 'Trainer: „Aufmerksamkeit nötig“ erkennt jetzt auch Boxer, die die App gar nicht mehr öffnen, und meldet neue Boxer nicht mehr gleich als „nicht trainiert“.', 'Ist deine Anmeldung abgelaufen, zeigt die App einen Hinweis mit Knopf zum neuen Anmelden. Beim Abmelden werden auch alle geplanten Erinnerungen entfernt.', 'Neu für Trainer: Im Profil siehst du, wer von deinen Boxern trainiert, in welcher Phase er ist und ob er die Einheit wirklich voll durchgezogen hat. Dafür misst die App jetzt bei jeder Einheit die gelaufene Zeit.', 'Das Klopfen vor dem Ende einer Pause und der Piepton in den letzten drei Sekunden sind lauter.', 'Fitness-Test: Auch nach dem dritten Sprint fragt die App sofort nach dem höchsten Wert. Danach siehst du alle drei Werte und kannst sie noch ändern.', 'Neu angemeldet und noch nicht eingerichtet? Die App erinnert dich einmal nach 24 Stunden.', 'Zweimal schnell tippen zoomt die App nicht mehr hinein.', 'Der Datenschutztext zeigt keinen Entwurf-Hinweis mehr.', 'Eingabefelder sind besser lesbar.', 'Neu: Verein. Trainer legen Plätze für ihre Boxer an, jeder Boxer bekommt einen eigenen Code. Den Code gibst du nach der Einrichtung, auf der Startseite oder unter „Profil“, „Verein“ ein.', 'Die App fragt, wann du trainierst, und erinnert dich rechtzeitig: abends Trainierende morgens, morgens und mittags Trainierende am Vorabend.', 'Rote Zahl auf dem App-Symbol, wenn eine Einheit wartet.', 'Ein Hinweis, wenn du ein paar Tage nicht da warst.', 'Ein Hinweis, wenn deine App zu alt ist und im App Store aktualisiert werden sollte.'] },
  { v: '1.0', datum: '21.11.2026', punkte: ['Die App ist jetzt im App Store.', 'Training, Plan, Fortschritt und Kampftermin an einem Ort.', 'Erinnerungen, Sichern und Kalender-Export.'] },
];
async function checkForUpdate() {
  try {
    const r = await fetch('sw.js?check=' + Date.now(), { cache: 'no-store' });
    const m = /redline-v(\d+)/.exec(await r.text());
    if (m && Number(m[1]) > APP_BUILD) showUpdateBanner();
  } catch {
    /* offline: später erneut */
  }
}
setTimeout(checkForUpdate, 1500);
// Nach einem Update einmal kurz zeigen, was neu ist (neue Nutzer sehen den Hinweis nicht)
const SEENVER_KEY = 'redline.seenver';
function showNewsNote() {
  let seen = null;
  try {
    seen = localStorage.getItem(SEENVER_KEY);
    if (seen !== APP_VERSION) localStorage.setItem(SEENVER_KEY, APP_VERSION);
  } catch {
    return;
  }
  if (!seen || seen === APP_VERSION || document.getElementById('newsnote')) return;
  if (document.body.classList.contains('running')) return;
  const bar = document.createElement('div');
  bar.id = 'newsnote';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span><b>Neu in Version ${APP_VERSION}.</b> <a href="#/news" data-act="news-close">Ansehen</a></span><button class="ghost" data-act="news-close">OK</button>`;
  document.body.appendChild(bar);
}
setTimeout(showNewsNote, 2500);
// Hinweis für zu alte Versionen (nur iPhone-App): Die App fragt eine kleine Datei im Web (img/mindestversion.json), welche Version mindestens nötig ist.
// Ist die eigene Version älter, kommt ein Hinweis mit Knopf zum App Store. Zum Auslösen in der Datei "min" erhöhen, z. B. auf "1.2".
const MINVER_URL = 'https://aozcorap.github.io/airbike/img/mindestversion.json';
const STORE_URL = 'https://apps.apple.com/app/id6836837991';
const verParts = (v) => String(v || '0').split('.').map((n) => Number(n) || 0);
function verLess(a, b) {
  const x = verParts(a);
  const y = verParts(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
}
async function checkMinVersion() {
  if (!isNativeApp()) return;
  try {
    const r = await fetch(`${MINVER_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j || typeof j.min !== 'string' || !verLess(APP_VERSION, j.min)) return;
    showOldVersionNote(typeof j.text === 'string' ? j.text.slice(0, 160) : '');
  } catch {
    /* offline oder Datei fehlt: kein Hinweis */
  }
}
function showOldVersionNote(text) {
  if (document.getElementById('oldver') || document.body.classList.contains('running')) return;
  const bar = document.createElement('div');
  bar.id = 'oldver';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span><b>Bitte aktualisiere die App.</b> <span class="oldtxt"></span></span><button class="primary" data-act="oldver-store">Zum App Store</button><button class="ghost" data-act="oldver-close">Später</button>';
  bar.querySelector('.oldtxt').textContent = text || 'Es gibt eine neue Version im App Store.';
  document.body.appendChild(bar);
}
setTimeout(checkMinVersion, 3000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkMinVersion();
});
setInterval(checkForUpdate, 2 * 60 * 1000);
window.addEventListener('focus', checkForUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForUpdate();
    if (account) checkReports();
  }
});
window.addEventListener('pageshow', checkForUpdate);
window.addEventListener('online', checkForUpdate);
async function hardReload() {
  reloading = true;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    await Promise.all(['./', 'index.html', 'splash.js', 'app.js', 'data.js', 'plan.js', 'cloud.js', 'config.js', 'styles.css', 'vendor/supabase.js', 'manifest.webmanifest', 'img/hero.jpg', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'].map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
  } catch {
    /* im Zweifel trotzdem neu laden */
  }
  location.reload();
}
// Kurze Bestätigung unten über der Menüleiste
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = '<span class="tick" aria-hidden="true">✓</span><span></span>';
  el.lastChild.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function showUpdateBanner() {
  if (document.getElementById('update')) return;
  if (document.body.classList.contains('running')) {
    updatePending = true; // während des Trainings nicht stören, danach zeigen
    return;
  }
  const bar = document.createElement('div');
  bar.id = 'update';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span><b>Neue Version verfügbar.</b> Lade neu, um sie zu nutzen.</span><button class="primary" data-act="update-reload">Neu laden</button>';
  document.body.appendChild(bar);
}
