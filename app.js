import { PHASES, PROFILES, RECOVERY_OPTIONS, TEST_SESSION, TEST_PAUSE_SECS, weekOrder as weekOrderRaw, flatten, sessionBlocks as sessionBlocksRaw, totalSecs, fmtSecs, resolveTarget } from './data.js';
import * as cloud from './cloud.js';
import { buildPlan, parseDay, sessionDate, tooCloseToFight, startOfDay, addDays, DAY } from './plan.js';

/* ---------------- Zustand ---------------- */
const KEY = 'redline.v1';
const DEFAULTS = {
  maxW: 0,
  startDate: '',
  fightDate: '',
  freq: 3,
  maxWDate: '',
  peakW: 0,
  sprints: [],
  rounds: 3,
  roundMin: 0,
  done: {},
  days: { s1: 1, rec: 3, s2: 4, s3: 6 },
  time: '18:00',
  age: 0,
  ack: false,
  notify: false,
  recOpt: 'opt1',
  profile: 'elite',
  reports: {},
  onboarded: false,
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

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const profile = () => {
  const key = PROFILES[state.profile] ? state.profile : 'elite';
  return { key, ...PROFILES[key] };
};
const ctx = () => {
  const p = profile();
  return { maxW: Number(state.maxW) || 0, cap: p.wattCapPct && p.wattCapPct < 100 ? p.wattCapPct : 0 };
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
const fmtRoundSecs = () => (state.roundMin ? (Number(state.roundMin) === 2 ? 120 : 180) : (PROFILES[state.profile] && PROFILES[state.profile].roundSecs) || 180);
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
function plan() {
  const key = [state.fightDate, state.startDate, effFreq(), userFreq(), new Date().toDateString()].join('|');
  if (planCache.key !== key) {
    dayKeyOf.clear();
    planCache = { key, value: buildPlan({ today: new Date(), fightDate: state.fightDate, startDate: state.startDate, freq: effFreq() }) };
  }
  return planCache.value;
}
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
  if (p.mode === 'none') return 'Trage deinen Kampftermin ein. Dann stellt die App den Plan darauf ein.';
  let txt = '';
  if (p.mode === 'fight') {
    txt = `${p.fight ? `Noch ${daysToFight()} Tage bis zum Kampf. ` : ''}Dein Plan hat ${wochen(p.weeks.length)} mit ${freq}× Training pro Woche.`;
    if (p.startsIn > 0) txt += ` Er beginnt am ${fmtDate(p.weeks[0].monday)}, vorher ist noch Zeit.`;
    if (p.compressed) txt += ' Der Plan ist gekürzt. Wie gekürzt wird, ist eine Annahme und noch nicht von einem Fachtrainer geprüft.';
  } else {
    txt = `Dein Plan hat ${wochen(p.weeks.length)} mit ${freq}× Training pro Woche.`;
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
    return `<div class="group"><span class="rep sm">${k}×</span>${stepPill(steps[0])}${stepPill(steps[1])}</div>${rest.map(stepPill).join('')}`;
  }
  return steps.map(stepPill).join('');
}

function stepCard(b, no, isRec) {
  const warm = /warm-up/i.test(b.title);
  const type = isRec ? 'easy' : warm ? 'warm' : b.title === 'Pause vor Hauptteil' ? 'rest' : 'main';
  const badge = { easy: 'Locker', warm: 'Aufwärmen', rest: 'Pause', main: 'Hauptteil' }[type];
  const steps = typeof b.steps === 'function' ? b.steps(1) : b.steps;
  const rows = typeof b.steps === 'function' ? blockTargets(b) : [];
  return `<section class="step ${type}">
    <div class="step-head"><span class="step-no">${no}</span><h3>${esc(b.title)}</h3><span class="badge">${badge}</span></div>
    <div class="pills">${b.repeat > 1 ? `<span class="rep">${b.repeat}×</span>` : ''}${stepPills(steps)}</div>
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
  state.peakW = Math.max(...vals);
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
  state.peakW = 0;
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
const HERO_PHOTO = '<img class="art-photo" src="img/hero.jpg" alt="" onerror="this.remove()">';
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
  const age = new Date().getFullYear() - y;
  return age <= 16 ? 'u16' : age <= 18 ? 'u18' : 'elite';
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

function setupCard() {
  if (!state.onboarded || state.maxW) return '';
  return `<a class="card hero link setupcta" href="#/test"><span class="kicker">Nächster Schritt</span><h2 style="margin:6px 0 4px">Fitness-Test machen</h2>
    <p class="muted" style="margin:0 0 14px">Drei Sprints à 10 Sekunden, etwa 10 Minuten. Danach zeigt dir die App deine Watt-Ziele.</p><div class="btn primary">Test starten</div></a>`;
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

function viewHome() {
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

  let fightInfo = '';
  if (p.status === 'ok' && p.fight) {
    const d = daysToFight();
    fightInfo = `<div class="banner">${HERO_PHOTO}${WHEEL_ART}<div class="banner-in"><span class="kicker">Kampf · ${fmtDate(p.fight)}</span>
      <div class="bignum">${d === 0 ? 'Heute' : d}</div><div class="bannerlbl">${d === 0 ? 'Kampftag' : d === 1 ? 'Tag bis zum Kampf' : 'Tage bis zum Kampf'}</div>
      <p class="muted small" style="margin:10px 0 0">Dein Plan: ${wochen(p.weeks.length)}, ${userFreq()}× pro Woche · ${formatLabel()}${p.compressed ? ' · gekürzt (Annahme, <a href="#/plan"><u>Details</u></a>)' : ''}</p></div></div>`;
  } else if (p.status === 'past' || p.status === 'invalid') {
    fightInfo = `<div class="notice">${esc(planSummary())} <a href="#/settings">Einstellungen</a></div>`;
  } else {
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

  const doneCount = allSessions().filter(({ s }) => isDone(s.id)).length;
  const total = allSessions().length;
  const week = cw || (next ? next.w : p.weeks[p.weeks.length - 1]);
  const list = week
    ? `<h2>Woche ${week.n} · ${esc(week.phase)}</h2>` +
      weekOrder(week)
        .map((s) => `<a class="card link row" href="#/s/${s.id}"><span class="check ${isDone(s.id) ? 'done' : ''}">${isDone(s.id) ? '✓' : ''}</span><span class="grow"><b>${esc(s.title)}</b><br><span class="muted small">${DAY_NAMES[Number(dayOf(s)) - 1]} · ${mins(sessionSecs(s))}</span></span></a>`)
        .join('')
    : '';

  return `${brandBar()}<h1 class="sr">Kampfvorbereitung</h1>
  ${fightInfo}
  ${total ? `<p class="muted small">${doneCount} von ${total} Einheiten erledigt</p>` : ''}
  ${setupCard() || maxWatNotice()}${todayHtml}${nextHtml}${list}`;
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
  return html;
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
  ${needMax ? `<div class="notice"><b>Test-Watt fehlt.</b> Ohne ihn siehst du nur Prozentwerte. Kennst du ihn schon? Trage ihn hier ein, oder <a href="#/test"><u>mache den Fitness-Test</u></a>:${wattInput('mi')}<button class="primary block" style="margin-top:10px" data-act="savemax">Speichern</button></div>` : ''}
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

function viewMore() {
  const row = (href, title, sub) => `<a class="card link row" href="${href}"><span class="grow"><b>${title}</b><br><span class="muted small">${sub}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  return `<h1>Mehr</h1>
  ${account ? `<div class="card"><div class="row between"><span class="muted">Angemeldet als</span><b style="word-break:break-all;text-align:right">${esc(account.email || '')}</b></div>
  <p class="muted small" style="margin:8px 0 12px">${esc(syncLabel())}</p>
  <button class="ghost block logout" data-act="logout">Abmelden</button></div>` : ''}
  ${row('#/settings', 'Einstellungen', 'Kampf, Training, Erinnerungen, Daten')}
  ${row('#/info', 'Einführung und Wissen', 'So startest du, Belastungsskala, Hinweise')}
  ${row('#/feedback', 'Fehler melden oder Feedback', 'Etwas klappt nicht oder du hast eine Idee? Schreib es uns.')}
  ${Object.keys(state.reports || {}).length ? row('#/reports', `Meine Meldungen${reportsUnseen ? ' <span class="newchip">Neu</span>' : ''}`, 'Status und Antworten zu deinen Meldungen') : ''}
  ${row('#/datenschutz', 'Datenschutz', 'Welche Daten wir speichern')}
  ${row('#/impressum', 'Impressum', 'Wer hinter der App steht')}
  <p class="muted small center" style="margin-top:22px">${APP_NAME_A.trim()} ${APP_NAME_B}<br>Mehr Kondition bis zur letzten Runde<br>Version ${APP_BUILD}</p>`;
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
    { done: Object.keys(state.done || {}).length > 0, title: 'Erste Einheit trainieren', text: 'Öffne deine nächste Einheit und tippe auf Starten. Der Timer führt dich durch jede Runde und zeigt dir das Watt-Ziel.', value: Object.keys(state.done || {}).length ? `${Object.keys(state.done).length} Einheit(en) erledigt` : '', btn: nextSession() ? `<a class="btn primary" href="#/s/${nextSession().s.id}">Einheit öffnen</a>` : '<a class="btn primary" href="#/plan">Zum Plan</a>', again: '<a class="stepchange" href="#/plan">Zum Plan</a>' },
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
  return `<table class="targets"><tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</tbody></table>`;
}

function viewSettings() {
  const accAge = account && account.birthYear ? new Date().getFullYear() - account.birthYear : 0; // aus dem Geburtsjahr der Registrierung
  const age = accAge || Number(state.age);
  const hf = age ? Math.round(208 - 0.7 * age) : 0;
  const dayOpts = (key) => `<select data-set-day="${key}" aria-label="Tag">${DAY_LONG.map((d, i) => `<option value="${i + 1}" ${Number(state.days[key]) === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  const notifSupported = 'Notification' in window;
  return `<a href="#/more" class="back">← Mehr</a><h1>Einstellungen</h1>

  <h2>Dein Kampf</h2>
  <label for="fightDate">Kampftermin (Turnier)</label>
  ${dateField('fightDate', state.fightDate, 'data-set="fightDate"')}
  ${!state.fightDate ? `<label for="startDate">Startdatum (nur ohne Kampftermin)</label>
  ${dateField('startDate', state.startDate, 'data-set="startDate"')}` : ''}
  <label for="rounds">Anzahl der Runden im nächsten Kampf</label>
  <select id="rounds" data-set="rounds">${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `<option value="${n}" ${fmtRounds() === n ? 'selected' : ''}>${n} Runden</option>`).join('')}</select>
  <label for="roundMin">Länge einer Runde</label>
  <select id="roundMin" data-set="roundMin">${[2, 3].map((m) => `<option value="${m}" ${fmtRoundSecs() === m * 60 ? 'selected' : ''}>${m} Minuten</option>`).join('')}</select>
  <p class="muted small">${esc(planSummary())} Daran richten sich auch die Kampfrunden und der Umfang aus. Die Zuordnung ist eine Annahme und noch nicht von einem Fachtrainer geprüft.</p>

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
  <label for="time">Uhrzeit</label>
  <input id="time" type="time" value="${esc(state.time)}" data-set="time">
  <div class="btn-row"><button class="primary" data-act="ics">Kalender-Datei (.ics) laden</button></div>
  <p class="muted small">Der Kalender erinnert am zuverlässigsten, auch bei geschlossener App. Datei öffnen und in deinen Kalender importieren. Zuerst Kampftermin setzen.</p>
  ${
    notifSupported
      ? `<div class="btn-row"><button class="ghost" data-act="notif">${state.notify ? 'Hinweise in der App: an' : 'Hinweise in der App aktivieren'}</button></div>
         <p class="muted small">Funktioniert nur, solange die App geöffnet ist. Auf dem iPhone ist das unzuverlässig, nutze dort den Kalender.</p>`
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
  if (view !== 'feedback') {
    if (view !== 'more') lastRoute = location.hash || '#/'; // zuletzt besuchte Seite vor „Mehr“, dort ist meist der Fehler passiert
    fb = { kind: 'fehler', text: '', sent: false, busy: false };
  }
  document.querySelectorAll('#nav a').forEach((a) => {
    const nav = a.dataset.nav;
    const active = (nav === 'home' && !view) || (nav === 'plan' && (view === 'plan' || view === 'week' || view === 's')) || (nav === 'progress' && (view === 'progress' || view === 'test')) || (nav === 'more' && ['more', 'settings', 'info', 'feedback', 'reports', 'datenschutz', 'impressum'].includes(view));
    a.classList.toggle('active', active);
  });
  if (view === 'run') {
    runView(arg);
    return;
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
    case 'feedback': html = viewFeedback(); break;
    case 'reports': html = viewReports(); loadReports(); break;
    case 'settings': html = viewSettings(); break;
    case 'datenschutz': html = viewLegal('privacy'); break;
    case 'impressum': html = viewLegal('imprint'); break;
    case 'test': html = viewTest(); break;
    default: html = notFound();
  }
  $app.innerHTML = html;
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
    if (actx.state === 'suspended') actx.resume();
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

  document.body.classList.add('running');
  $app.innerHTML = `<div class="timer k-prep" id="timer">
    <div class="t-top"><span id="t-block"></span><span id="t-count"></span></div>
    <div class="t-mid"><div class="t-blockname" id="t-blockname"></div><div class="t-round" id="t-round"></div><div class="t-label" id="t-label"></div><div class="t-time" id="t-time">0:00</div><div class="t-target" id="t-target"></div><div class="t-sub" id="t-sub"></div></div>
    <div class="t-next" id="t-next"></div>
    <div class="t-bar"><i id="t-bar"></i></div>
    <div class="t-btns"><button data-act="tprev">Zurück</button><button class="main" data-act="tpause" id="t-play">Pause</button><button data-act="tnext">Weiter</button></div>
    <button class="t-exit" data-act="texit">Abbrechen</button>
  </div>`;
  const q = (i) => document.getElementById(i);
  const el = { box: q('timer'), block: q('t-block'), count: q('t-count'), label: q('t-label'), blockname: q('t-blockname'), round: q('t-round'), time: q('t-time'), target: q('t-target'), sub: q('t-sub'), next: q('t-next'), bar: q('t-bar'), play: q('t-play') };

  let i = 0;
  let elapsed = 0; // ms im aktuellen Segment
  let last = Date.now();
  let paused = !actx;
  let finished = false;
  let lastShownSec = -1;
  let beepedAt = -1;
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
    el.sub.textContent = seg.target.sub;
    const nx = segs[i + 1];
    el.next.textContent = nx ? (nx.kind === 'rest' ? `Danach: Pause · ${fmtSecs(nx.secs)}` : `Danach: ${nx.label.replace(/^\d+(?:[.,]\d+)?\s*(?:s|min)\s+/i, '')} · ${fmtSecs(nx.secs)} · ${nx.target.main.replace(/ W$/, '\u00A0W')}`) : 'Letztes Intervall';
    lastShownSec = -1;
    beepedAt = -1;
  }

  function paintTime() {
    const seg = segs[i];
    const remain = Math.max(0, Math.ceil((seg.secs * 1000 - elapsed) / 1000));
    if (remain !== lastShownSec) {
      lastShownSec = remain;
      el.time.textContent = fmt(remain);
      if (seg.secs > 5 && remain >= 1 && remain <= 3 && beepedAt !== remain && !paused) {
        beepedAt = remain;
        beep(820, 90, 0.35);
        vib([40]);
      }
    }
    const doneMs = segs.slice(0, i).reduce((a, s) => a + s.secs * 1000, 0) + Math.min(elapsed, seg.secs * 1000);
    el.bar.style.width = `${Math.min(100, (doneMs / (total * 1000)) * 100)}%`;
  }

  function finish() {
    finished = true;
    unlockScreen();
    beep(900, 180);
    setTimeout(() => beep(1100, 180), 240);
    setTimeout(() => beep(1400, 360), 480);
    vib([200, 100, 200, 100, 400]);
    el.box.className = 'timer k-done';
    setChrome('done');
    if (session.type === 'test') {
      el.box.innerHTML = `<div class="t-mid"><div class="t-label">Test geschafft</div><div class="t-target">Deine drei Werte?</div>
        <div class="t-sub">Trage den höchsten Wert jedes Sprints ein.</div>
        <div class="tw-wrap">${sprintInputs('tw')}</div></div>
        <div class="btn-row"><button class="main" style="background:#fff;color:#111" data-act="savetest">Speichern</button></div>
        <button class="t-exit" data-act="texit">Ohne Speichern zurück</button>`;
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
    const dt = (now - last) * speed;
    last = now;
    if (paused || finished) return;
    elapsed += dt;
    while (!finished && elapsed >= segs[i].secs * 1000) {
      const carry = elapsed - segs[i].secs * 1000;
      if (i + 1 >= segs.length) {
        finish();
        return;
      }
      i += 1;
      elapsed = carry;
      paintSegment();
      cue(segs[i]);
    }
    paintTime();
  }

  // Steuerung über globale Delegation (siehe unten)
  runCtl = {
    toggle() {
      ensureAudio();
      paused = !paused;
      last = Date.now();
      el.play.textContent = paused ? 'Fortsetzen' : 'Pause';
      if (!paused) lockScreen();
    },
    prev() {
      if (finished) return;
      goto(elapsed > 2000 ? i : i - 1);
    },
    next() {
      if (finished) return;
      goto(i + 1);
    },
  };

  paintSegment();
  paintTime();
  el.play.textContent = paused ? 'Start' : 'Pause';
  if (!paused) {
    lockScreen();
    last = Date.now();
  }
  const timer = setInterval(tick, 100);
  const onVis = () => {
    if (document.visibilityState === 'visible' && !paused && !finished) lockScreen();
    tick();
  };
  document.addEventListener('visibilitychange', onVis);
  cleanup = () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    unlockScreen();
    runCtl = null;
  };
}
let runCtl = null;

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
      lines.push(
        'BEGIN:VEVENT',
        `UID:redline-${s.id}@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dt}`,
        'DURATION:PT45M',
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
  return lines.join('\r\n');
}
function download(name, text, type) {
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
function scheduleReminder() {
  clearTimeout(reminderTimer);
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
  const sub = { elite: 'Erwachsene und Elite, Plan wie im Grundaufbau', u18: 'Reduzierter Umfang, kürzere Sprints', u16: 'Stark reduziert, 2 harte Einheiten pro Woche' };
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
      return `<div class="ob-hero"><img src="img/hero.jpg" alt="" onerror="this.remove()"><div class="ob-hero-in">${BRAND_MARK}<b>${APP_NAME_A}<i>${APP_NAME_B}</i></b></div></div>
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
  if (id === 'welcome') {
    state.ack = true;
    save();
  }
  if (id === 'fight') {
    if (noDate) {
      const n = new Date();
      state.fightDate = '';
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
  c.peakW = obj.peakW ? num(obj.peakW, 100, 3000, 0) : 0;
  c.maxWDate = isIso(obj.maxWDate) ? obj.maxWDate : '';
  c.sprints = Array.isArray(obj.sprints) ? obj.sprints.slice(0, 3).map((v) => num(v, 100, 3000, 0)).filter(Boolean) : [];
  c.startDate = isDayStr(obj.startDate) ? obj.startDate : '';
  c.fightDate = isDayStr(obj.fightDate) ? obj.fightDate : '';
  c.freq = num(obj.freq, 1, 3, DEFAULTS.freq);
  c.rounds = num(obj.rounds, 3, 12, DEFAULTS.rounds);
  c.roundMin = [0, 2, 3].includes(Number(obj.roundMin)) ? Number(obj.roundMin) : 0;
  c.age = obj.age ? num(obj.age, 10, 90, 0) : 0;
  c.time = typeof obj.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(obj.time) ? obj.time : DEFAULTS.time;
  for (const k of Object.keys(DEFAULTS.days)) c.days[k] = num(isObj(obj.days) ? obj.days[k] : undefined, 1, 7, DEFAULTS.days[k]);
  c.ack = obj.ack === true;
  c.notify = obj.notify === true;
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
          const remote = await withTimeout(cloud.pullState(account.id), 8000);
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
    } catch {
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

async function syncOnLogin(user) {
  const info = readSync();
  if (info.owner && info.owner !== user.id) {
    // Auf dem Gerät liegen Daten eines anderen Kontos: nicht übernehmen
    state = freshState();
    save(true);
    writeSync({ owner: user.id, email: user.email, syncedAt: '', dirty: false });
  }
  let remote;
  try {
    remote = await cloud.pullState(user.id);
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
      await pushNow();
    } else writeSync({ dirty: false });
  } else if (!info2.owner && hasProgress(state)) {
    const useDevice = confirm('Auf diesem Gerät ist schon Fortschritt gespeichert.\n\nOK = Gerätedaten ins Konto übernehmen\nAbbrechen = Daten aus dem Konto laden');
    writeSync({ owner: user.id, email: user.email });
    if (useDevice) {
      writeSync({ syncedAt: remote.updated_at, dirty: true });
      await pushNow();
    } else applyRemote(remote);
  } else if (info2.dirty) {
    writeSync({ owner: user.id, email: user.email });
    if (remote.updated_at !== info2.syncedAt) {
      state = normalizeState(mergeStates(readBase(), state, remote.state));
      save(true);
      writeSync({ syncedAt: remote.updated_at });
    }
    await pushNow();
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
  account = { id: user.id, email: user.email || readSync().email || '', birthYear: await loadBirthYear(user, quick) };
  if (quick) {
    // Server nicht erreichbar: sofort mit lokalen Daten starten, Abgleich läuft im Hintergrund
    syncStatus = 'offline';
    withTimeout(syncOnLogin(account), 60000)
      .then(() => {
        if (!document.querySelector('.timer') && !document.getElementById('onboard')) route();
      })
      .catch(() => {
        syncStatus = navigator.onLine ? 'error' : 'offline';
      });
  } else {
    try {
      await withTimeout(syncOnLogin(account), 8000);
    } catch {
      syncStatus = navigator.onLine ? 'error' : 'offline'; // mit lokalen Daten weiterarbeiten, später erneut versuchen
    }
  }
  if (!state.onboarded && ageClassKey()) state.profile = ageClassKey();
  if (enforceProfile()) save();
  closeAuth();
  route();
  setTimeout(checkReports, 3000);
  if (!state.onboarded) startOnboarding();
  scheduleReminder();
}
function closeAuth() {
  document.getElementById('auth')?.remove();
  if (!document.getElementById('onboard')) document.body.classList.remove('obopen');
}
function renderLoading() {
  authShell(`${authBrand()}<p class="muted center" style="margin-top:30px">Lade …</p>`);
}
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
window.addEventListener('online', () => {
  if (account && readSync().dirty) pushNow();
});
document.addEventListener('visibilitychange', async () => {
  if (!account) return;
  if (document.visibilityState === 'hidden') {
    if (readSync().dirty) pushNow();
    return;
  }
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
  if (/invalid login|invalid_credentials/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/otp|token has expired|token.*invalid|expired/i.test(m)) return 'Der Code stimmt nicht oder ist abgelaufen. Prüfe die Zahl oder fordere einen neuen Code an.';
  if (/not confirmed|email_not_confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail. Schau auch im Spam-Ordner nach.';
  if (/rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/i.test(m)) return 'Zu viele Versuche. Bitte warte kurz und versuche es später noch einmal.';
  if (/database error|saving new user|unexpected_failure/i.test(m)) return 'Die Registrierung ist nicht möglich. Bitte prüfe Alter und Einwilligung.';
  if (/password/i.test(m) && /short|weak|least|characters/i.test(m)) return 'Das Passwort ist zu kurz oder zu schwach (mindestens 8 Zeichen).';
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
const legalLinks = () => `<p class="muted small center" style="margin-top:18px"><a href="#" data-act="auth-view" data-v="privacy">Datenschutz</a> · <a href="#" data-act="auth-view" data-v="imprint">Impressum</a></p>`;

function renderAuth(view = 'login') {
  const prevEmail = document.getElementById('aEmail')?.value;
  if (prevEmail !== undefined) authEmail = prevEmail.trim();
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
${legalLinks()}`;
  } else if (view === 'register') {
    body = `${authBrand()}${authTabs('register')}${authMessage()}
      <label for="aEmail">E-Mail</label><input id="aEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" value="${em}">
      <label for="aYear">Geburtsjahr</label><input id="aYear" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" placeholder="z. B. 2008">
      <p class="muted small" style="margin:10px 0 0">Du meldest dich immer mit einem Code per E-Mail an, ein Passwort gibt es nicht.</p>
      <label class="chk"><input id="aConsent" type="checkbox"><span>Ich habe die <a href="#" data-act="auth-view" data-v="privacy">Datenschutzerklärung</a> gelesen und willige in die Verarbeitung meiner Daten (E-Mail, Geburtsjahr, Trainingsdaten) zur Sicherung meines Fortschritts ein.</span></label>
      <button class="primary block" style="margin-top:14px" data-act="auth-register">Code senden</button>${legalLinks()}`;
  } else if (view === 'confirm') {
    body = `${authBrand()}<h1 style="font-size:28px">Code eingeben</h1><p>Wir haben einen Code an <b>${em}</b> geschickt. Gib ihn hier ein, dann bist du angemeldet.</p>${authMessage()}
      <label for="aCode">Code aus der E-Mail</label><input id="aCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*">
      <button class="primary block" style="margin-top:16px" data-act="auth-verify">Anmelden</button>
      <p class="muted small">Keine Mail da? Schau im Spam-Ordner nach oder fordere einen neuen Code an.</p>
      <button class="linkbtn" data-act="auth-resend">Neuen Code senden</button>
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
  let problem = '';
  if (!/^\S+@\S+\.\S+$/.test(email)) problem = 'Bitte gib eine gültige E-Mail-Adresse ein.';
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
    const { error } = await cloud.sendCode(email, true, { birth_year: year, consent: true });
    if (error) {
      authMsg = authError(error);
      return renderAuth('register');
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
    if (error) {
      authMsg = /signups? not allowed/i.test(String(error.message || error.code)) ? 'Zu dieser Adresse gibt es kein Konto. Bitte registriere dich.' : authError(error);
      return renderAuth('login');
    }
    authMsg = '';
    authPrev = 'login';
    renderAuth('confirm');
  });
}
async function doResend(btn) {
  await withBusy(btn, async () => {
    const { error } = await cloud.sendCode(authEmail, authPrev === 'register', undefined);
    authMsg = error ? authError(error) : 'Ein neuer Code ist unterwegs.';
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
async function doLogout() {
  const ok = await pushNow();
  if (!ok && !confirm('Die letzten Änderungen konnten nicht gesichert werden. Trotzdem abmelden? Sie gehen dann verloren.')) return;
  try {
    await cloud.signOut();
  } catch {
    /* lokal abmelden genügt */
  }
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* ignorieren */
  }
  location.hash = '';
  location.reload();
}
async function doDeleteAccount() {
  if (!confirm('Konto wirklich löschen?\n\nDein Konto und alle gesicherten Daten werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.')) return;
  if (!confirm('Letzte Rückfrage: Konto jetzt endgültig löschen?')) return;
  try {
    await cloud.deleteAccount();
  } catch {
    alert('Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal.');
    return;
  }
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* ignorieren */
  }
  location.hash = '';
  location.reload();
}

/* ---- Konto in den Einstellungen und rechtliche Seiten (Entwurf) ---- */
function accountDangerZone() {
  if (!account) return '';
  return `<div class="btn-row"><button class="danger" data-act="delacc">Konto löschen</button></div>`;
}
const draftBanner = '<div class="notice"><b>Entwurf.</b> Dieser Text ist nicht rechtlich geprüft und muss vor einer Veröffentlichung von einer fachkundigen Person durchgesehen und ergänzt werden. Angaben in eckigen Klammern fehlen noch.</div>';
function legalPrivacy() {
  return `<h1>Datenschutz</h1>${draftBanner}
  <h2>Wer ist verantwortlich?</h2><p>Ahmet Özcorapci<br>Hospitalgasse 36d<br>61169 Friedberg<br>Kontakt für Datenschutzfragen: siehe Impressum.</p>
  <h2>Welche Daten werden verarbeitet?</h2>
  <ul class="plain"><li><b>Konto:</b> E-Mail-Adresse, Geburtsjahr und der Zeitpunkt deiner Einwilligung.</li>
  <li><b>Rückmeldungen:</b> Wenn du über „Fehler melden“ etwas schickst, wird deine Meldung als <b>öffentliches Issue auf GitHub</b> veröffentlicht, ohne deinen Namen und ohne deine E-Mail-Adresse. Sie enthält deinen Text, die Art, die Seite, auf der du warst, die App-Version, die vollständige Kennung deines Browsers und Geräts, die Bildschirmgröße, ob du online warst, die letzte Fehlermeldung der App und deine Einstellungen (Altersklasse, Trainingshäufigkeit, Runden, ob ein Test-Watt vorliegt). Damit du den Stand sehen kannst, speichert die App in deinem Konto außerdem die Nummer deiner Meldung und ihre erste Zeile (bis 60 Zeichen). Das wird mit dem Konto gelöscht. Eine einmal veröffentlichte Meldung wird nicht automatisch gelöscht, wenn du dein Konto löschst. Schreibe deshalb keine privaten Daten in den Text. [Prüfen lassen]</li>
  <li><b>Trainingsdaten:</b> Altersklasse, Kampftermin, Trainingshäufigkeit, Kampfformat, Test-Watt mit Datum, erledigte Einheiten und deine Einstellungen.</li>
  <li><b>Technisch:</b> Beim Aufruf der Seite verarbeitet der Hosting-Anbieter deine IP-Adresse. Beim Anmelden und beim Sichern verarbeitet der Konto-Anbieter technische Zugriffsdaten (z. B. IP-Adresse und Zeitpunkt) in seinen Protokollen. Dein Geburtsjahr liegt zusätzlich in den Kontodaten des Anmeldedienstes.</li>
  <li><b>E-Mails:</b> Für den Anmelde-Code wird eine E-Mail über den Mail-Dienst des Konto-Anbieters verschickt. [Mail-Anbieter ergänzen]</li></ul>
  <h2>Wozu?</h2><p>Zur Anmeldung und damit dein Fortschritt gesichert ist und auf einem neuen Gerät wieder zur Verfügung steht. Es gibt keine Werbung und keine Auswertung deines Verhaltens durch Dritte.</p>
  <h2>Rechtsgrundlage</h2><p>Deine Einwilligung und die Bereitstellung der App (Art. 6 Abs. 1 Buchst. a und b DSGVO). [Prüfen lassen]</p>
  <h2>Alter</h2><p>Dein Geburtsjahr bestimmt deine Altersklasse und damit den Umfang deines Plans. Es gibt kein Mindestalter und keine Einwilligung der Eltern, das Alter wird nicht nachgewiesen. [Rechtlich prüfen lassen: Einwilligung Minderjähriger]</p>
  <h2>Wer erhält die Daten?</h2><p>Konto und Trainingsdaten liegen bei Supabase (Datenbank in Frankfurt am Main). Die Seite selbst wird über GitHub Pages ausgeliefert. Meldungen laufen über Supabase zu GitHub. Wenn du unter „Meine Meldungen“ den Stand abrufst, verbindet sich dein Gerät direkt mit GitHub, das dabei deine IP-Adresse verarbeitet. Mit beiden Anbietern sind Auftragsverarbeitungsverträge zu prüfen und die Frage einer Übermittlung in Drittländer zu klären. [Prüfen lassen]</p>
  <h2>Speicherung auf deinem Gerät</h2><p>Die App speichert Einstellungen, Fortschritt und dein Anmelde-Token zusätzlich in deinem Browser (lokaler Speicher), damit sie auch offline funktioniert und du angemeldet bleibst. Beim Abmelden werden diese Daten auf dem Gerät gelöscht.</p>
  <h2>Wie lange?</h2><p>Bis du dein Konto löschst. Das geht jederzeit in den Einstellungen („Konto löschen“). Dabei werden Konto und alle gesicherten Daten in der Datenbank gelöscht. Sicherungskopien und Protokolle des Anbieters können noch eine begrenzte Zeit weiter bestehen. [Fristen prüfen und ergänzen]</p>
  <h2>Deine Rechte</h2><p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerruf deiner Einwilligung (mit Wirkung für die Zukunft) sowie Beschwerde bei der zuständigen Datenschutz-Aufsichtsbehörde. Wende dich dazu an die oben genannte Stelle.</p>`;
}
function legalImprint() {
  return `<h1>Impressum</h1>
  <h2>Anbieter</h2><p>Ahmet Özcorapci<br>Hospitalgasse 36d<br>61169 Friedberg</p>
  <h2>Kontakt</h2><p>E-Mail: <a href="mailto:ahmet@ozcorapci.de">ahmet@ozcorapci.de</a></p>`;
}
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
    case 'auth-resend':
      doResend(t);
      break;
    case 'logout':
      doLogout();
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
      route();
      break;
    case 'unmark':
      delete state.done[t.dataset.id];
      save();
      route();
      break;
    case 'savetest':
      if (saveSprints('tw')) {
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
    case 'texit':
      if (document.querySelector('.timer.k-done') || confirm('Training wirklich abbrechen?')) {
        const id = location.hash.split('/')[2];
        location.hash = id === 'test' ? '#/test' : `#/s/${id}`;
      }
      break;
    case 'tdone':
      state.done[t.dataset.id] = new Date().toISOString();
      save();
      location.hash = '#/';
      break;
    case 'ics':
      if (!plan().weeks[0]?.monday) {
        alert('Bitte zuerst den Kampftermin setzen.');
        break;
      }
      download('nonstop-boxing-training.ics', buildICS(), 'text/calendar');
      break;
    case 'notif':
      if (state.notify) {
        state.notify = false;
        save();
        route();
      } else if ('Notification' in window) {
        Notification.requestPermission().then((p) => {
          state.notify = p === 'granted';
          save();
          scheduleReminder();
          route();
        });
      }
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
    state[k] = ['maxW', 'age', 'freq', 'rounds', 'roundMin'].includes(k) ? Number(t.value) || 0 : t.value;
    if (k === 'maxW') { state.sprints = []; state.peakW = 0; state.maxWDate = state.maxW ? new Date().toISOString() : ''; }
    if (k === 'profile' && PROFILES[t.value] && PROFILES[t.value].roundSecs) state.roundMin = PROFILES[t.value].roundSecs / 60;
    save();
    scheduleReminder();
    route();
    toast('Gespeichert');
  } else if (t.dataset.setDay) {
    state.days[t.dataset.setDay] = Number(t.value);
    save();
    scheduleReminder();
    toast('Gespeichert');
    route();
  }
});

window.addEventListener('hashchange', () => {
  if (account) route();
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
const APP_BUILD = 68;
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
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    await Promise.all(['./', 'index.html', 'app.js', 'data.js', 'plan.js', 'cloud.js', 'config.js', 'styles.css'].map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
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
  const bar = document.createElement('div');
  bar.id = 'update';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span><b>Neue Version verfügbar.</b> Lade neu, um sie zu nutzen.</span><button class="primary" data-act="update-reload">Neu laden</button>';
  document.body.appendChild(bar);
}
