import { PHASES, PROFILES, RECOVERY_OPTIONS, HOWTO_VIDEO, TEST_SESSION, TEST_PAUSE_SECS, weekOrder as weekOrderRaw, flatten, sessionBlocks as sessionBlocksRaw, totalSecs, fmtSecs, resolveTarget } from './data.js';
import { buildPlan, parseDay, sessionDate, tooCloseToFight, startOfDay, addDays, DAY } from './plan.js';

/* ---------------- Zustand ---------------- */
const KEY = 'redline.v1';
const DEFAULTS = {
  maxW: 0,
  off: 0,
  startDate: '',
  fightDate: '',
  freq: 3,
  maxWDate: '',
  done: {},
  days: { s1: 1, rec: 3, s2: 4, s3: 6 },
  time: '18:00',
  age: 0,
  ack: false,
  notify: false,
  recOpt: 'opt1',
  profile: 'elite',
  approved: {},
  onboarded: false,
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw, days: { ...DEFAULTS.days, ...(raw.days || {}) }, done: raw.done || {}, approved: raw.approved || {} };
  } catch {
    return { ...DEFAULTS, days: { ...DEFAULTS.days }, done: {}, approved: {} };
  }
}
let state = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Speicher blockiert (z. B. privater Modus) – App läuft trotzdem weiter */
  }
}

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const profile = () => {
  const key = PROFILES[state.profile] ? state.profile : 'elite';
  return { key, ...PROFILES[key] };
};
const profileOk = () => {
  const p = profile();
  return p.approved || Boolean(state.approved[p.key]);
};
const ctx = () => {
  const p = profile();
  return { maxW: Number(state.maxW) || 0, off: p.key === 'elite' ? Number(state.off) || 0 : 0, cap: p.wattCapPct && p.wattCapPct < 100 ? p.wattCapPct : 0 };
};
const weekOrder = (w) => weekOrderRaw(w, profile().hardPerWeek || 3).filter((s) => !tooCloseToFight(sessionDate(w, dayOf(s)), plan().fight));
const sessionBlocks = (session, rec) => sessionBlocksRaw(session, rec, profile());
function profileBanner() {
  const p = profile();
  if (p.blocked) {
    return `<div class="notice" style="background:#3a1311;border-color:#7a2622;color:#ff8a82"><b>Profil ${esc(p.name)}: Plan gesperrt.</b> Dieser Plan ist für diese Altersklasse nicht vorgesehen. Wechsle das Profil unter <a href="#/settings">Einstellungen</a>.</div>`;
  }
  if (!profileOk()) {
    return `<div class="notice"><b>Profil ${esc(p.name)}:</b> Die Werte sind Platzhalter und noch nicht von einem Fachtrainer freigegeben. Bestätige die Freigabe in den <a href="#/settings">Einstellungen</a>.</div>`;
  }
  return '';
}

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');

/* ---------------- Hilfsfunktionen ---------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const effFreq = () => Math.max(1, Math.min(Number(state.freq) || 3, profile().hardPerWeek || 3));
const wochen = (n) => `${n} ${n === 1 ? 'Woche' : 'Wochen'}`;
let planCache = { key: '', value: null };
function plan() {
  const key = [state.fightDate, state.startDate, effFreq(), new Date().toDateString()].join('|');
  if (planCache.key !== key) {
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
  if (session.type === 'recovery') return state.days.rec;
  const idx = ['s1', 's2', 's3'].find((_, i) => session.id.endsWith('s' + (i + 1)));
  return state.days[idx];
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
  const freq = effFreq();
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

/* ---------------- Ansichten ---------------- */
const BRAND_MARK = `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a6e"/><stop offset="1" stop-color="#c7122b"/></linearGradient></defs><circle cx="60" cy="64" r="44" stroke="#262c3c" stroke-width="12"/><path d="M16 64 A44 44 0 0 1 104 64" stroke="url(#bm)" stroke-width="12" stroke-linecap="round"/><path d="M60 64 L88 36" stroke="#fff" stroke-width="8" stroke-linecap="round"/><circle cx="60" cy="64" r="10" fill="#fff"/></svg>`;
const APP_NAME_A = 'AIR';
const APP_NAME_B = 'MASCHINE';
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

function setupCard() {
  const hasDate = Boolean(state.fightDate);
  const rows = [
    [state.onboarded, 'Altersklasse und Hinweis', '#/settings'],
    [hasDate, 'Kampftermin eintragen', '#/settings'],
    [Boolean(state.maxW), 'Max-Watt ermitteln', '#/test'],
  ];
  if (rows.every((r) => r[0])) return '';
  return `<div class="card setup"><span class="kicker">So kommst du in Gang</span>
    ${rows.map(([ok, label, href]) => `<a class="setup-row" href="${href}"><span class="check ${ok ? 'done' : ''}">${ok ? '✓' : ''}</span><span class="grow">${label}</span><span class="muted small">${ok ? 'Erledigt' : 'Offen'}</span></a>`).join('')}
    ${videoCard()}
    <button class="linkbtn" data-act="ob-replay">Einführung noch einmal ansehen</button></div>`;
}

function maxWatNotice() {
  const age = state.maxWDate ? Math.round((startOfDay(new Date()) - startOfDay(new Date(state.maxWDate))) / DAY) : 0;
  if (!state.maxW) {
    return `<a class="card link accent" href="#/test"><span class="kicker">Zuerst</span><h3 style="margin-top:6px">Max-Watt-Test machen</h3><p class="muted small" style="margin:4px 0 0">Aus deinem Bestwert berechnet die App alle Watt-Ziele. Dauert etwa 10 Minuten.</p></a>`;
  }
  if (state.maxWDate && age >= 28) {
    return `<div class="card"><span class="chip amber">Test wiederholen</span><p class="muted small" style="margin:8px 0 0">Dein letzter Test ist ${age} Tage alt. <a href="#/test"><u>Max-Watt neu messen</u></a></p></div>`;
  }
  return '';
}

function viewHome() {
  if (profile().blocked) {
    return `${brandBar()}<h1 class="sr">Kampfvorbereitung</h1>${profileBanner()}`;
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

  let fightInfo = '';
  if (p.status === 'ok' && p.fight) {
    const d = daysToFight();
    fightInfo = `<div class="banner">${HERO_PHOTO}${WHEEL_ART}<div class="banner-in"><span class="kicker">Kampf · ${fmtDate(p.fight)}</span>
      <div class="bignum">${d === 0 ? 'Heute' : d}</div><div class="bannerlbl">${d === 0 ? 'Kampftag' : d === 1 ? 'Tag bis zum Kampf' : 'Tage bis zum Kampf'}</div>
      <p class="muted small" style="margin:10px 0 0">Dein Plan: ${wochen(p.weeks.length)}, ${effFreq()}× pro Woche${p.compressed ? ' · gekürzt (Annahme, <a href="#/plan"><u>Details</u></a>)' : ''}</p></div></div>`;
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
  ${profileBanner()}${fightInfo}
  ${total ? `<p class="muted small">${doneCount} von ${total} Einheiten erledigt</p>` : ''}
  ${setupCard() || maxWatNotice()}${todayHtml}${nextHtml}${list}`;
}

function viewTest() {
  const last = state.maxW
    ? `<p>Dein aktueller Max-Watt-Wert: <b>${state.maxW} W</b>${state.maxWDate ? ` (${fmtDate(new Date(state.maxWDate))})` : ''}</p>`
    : '';
  return `<a href="#/" class="back">← Zurück</a><span class="kicker" style="display:block;margin-top:8px">Grundlage für deine Watt-Ziele</span><h1>Max-Watt-Test</h1>
  ${last}
  <p class="muted">Du fährst drei maximale Sprints von je 10 Sekunden. Dein höchster Wert wird zur Grundlage für alle Watt-Ziele im Plan.</p>
  <h2>So läuft es ab</h2>
  <ol class="plain">
    <li>Zuerst wärmst du dich etwa 4 Minuten auf.</li>
    <li>Dann kommen 3 Sprints von je 10 Sekunden mit voller Kraft, dazwischen ${TEST_PAUSE_SECS / 60} Minute Pause.</li>
    <li>Merke dir nach jedem Sprint den höchsten Wert auf der Anzeige deines Bikes.</li>
    <li>Am Ende trägst du den höchsten der drei Werte ein.</li>
  </ol>
  <div class="notice">Mache den Test nur ausgeruht und aufgewärmt, nicht nach einem harten Trainingstag. Bei Schwindel, Schmerz oder Atemnot sofort abbrechen. Der Wert schwankt mit der Tagesform. Wiederhole den Test alle paar Wochen.</div>
  ${profile().blocked ? '<span class="btn ghost" aria-disabled="true">Für dieses Profil gesperrt</span>' : '<a class="btn primary block" href="#/run/test" data-act="start">Test starten</a>'}
  <h2>Oder Wert direkt eintragen</h2>
  <div class="row"><input id="maxInline" type="number" inputmode="numeric" min="100" max="3000" step="5" placeholder="z. B. 1000" aria-label="Max-Watt"><button class="primary" data-act="savemax">Speichern</button></div>`;
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
  PHASES.forEach((ph) => {
    const weeks = p.weeks.filter((w) => w.tpl >= ph.weeks[0] && w.tpl <= ph.weeks[1]);
    if (!weeks.length) return;
    html += `<div class="phase-dot"><b>${esc(ph.name)}</b><div class="muted small">${esc(ph.text)}</div></div>`;
    weeks.forEach((w) => {
      const list = weekOrder(w);
      const done = list.filter((s) => isDone(s.id)).length;
      const level = { Niedrig: 1, Mittel: 2, 'Mittel–Hoch': 3, Hoch: 4 }[w.load];
      html += `<a class="card link" href="#/week/${w.n}"><div class="week-head"><h3>Woche ${w.n}</h3><span class="muted small">${weekRange(w)}${weekRange(w) ? ' · ' : ''}${done}/${list.length} erledigt</span></div>
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
  return `<a href="#/plan" class="back">← Plan</a><span class="kicker" style="display:block;margin-top:8px">${esc(w.phase)}</span><h1>Woche ${w.n}</h1>
  ${weekRange(w) ? `<p class="muted small">${weekRange(w)}</p>` : ''}${profileBanner()}<p class="muted">${esc(w.phaseText)}</p><p>Belastung: <b>${esc(w.load)}</b></p>${list}
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

  const needMax = !state.maxW && segs.some((s) => s.target.sub.includes('Max-Watt in den Einstellungen'));
  const done = isDone(id);

  return `<a href="#/week/${week.n}" class="back">← Woche ${week.n}</a>
  <span class="kicker" style="display:block;margin-top:8px">Woche ${week.n} · ${esc(week.phase)}</span>
  <h1>${esc(session.title)}</h1>
  <p class="muted">${esc(session.focus)}</p>
  <p><span class="chip red">${isRec ? 'ca. ' + mins(secs) : 'ca. ' + mins(secs) + ' inkl. Warm-up'}</span> ${done ? '<span class="chip ok">erledigt</span>' : ''}</p>
  ${profileBanner()}
  ${needMax ? `<div class="notice"><b>Max-Watt fehlt.</b> Ohne ihn siehst du nur Prozentwerte. Trage deinen besten 10-s-Sprint ein:<div class="row" style="margin-top:8px"><input id="maxInline" type="number" inputmode="numeric" min="0" max="3000" step="5" placeholder="z. B. 1000" aria-label="Max-Watt"><button class="primary" data-act="savemax">Speichern</button></div></div>` : ''}
  ${optBtns}
  <h2>Ablauf</h2>${blockHtml}
  <div class="btn-row" style="position:sticky;bottom:calc(76px + env(safe-area-inset-bottom))">
    ${profile().blocked ? '<span class="btn ghost" aria-disabled="true">Für dieses Profil gesperrt</span>' : `<a class="btn primary" href="#/run/${id}" data-act="start">Starten</a>`}
  </div>
  <div class="btn-row">
    ${done ? `<button class="ghost" data-act="unmark" data-id="${id}">Als offen markieren</button>` : `<button class="ghost" data-act="markdone" data-id="${id}">Als erledigt markieren</button>`}
  </div>`;
}

function viewInfo() {
  const p = profile();
  const pl = plan();
  const lvl = { 0: 'Sehr gut trainiert', 50: 'Gut trainiert', 100: 'Wenig Erfahrung' }[Number(state.off)] || 'Sehr gut trainiert';
  const rows = [
    [state.onboarded, 'Altersklasse', p.name, '#/settings'],
    [Boolean(state.fightDate), 'Kampftermin', pl.fight ? fmtDate(pl.fight) : 'offen', '#/settings'],
    [true, 'Training pro Woche', `${effFreq()}× pro Woche`, '#/settings'],
    ...(p.key === 'elite' ? [[true, 'Trainingsstand', lvl, '#/settings']] : []),
    [Boolean(state.maxW), 'Max-Watt', state.maxW ? `${state.maxW} W` : 'offen', '#/test'],
  ];
  return `<span class="kicker">Neu hier?</span><h1>Einführung</h1>
  <p class="muted">So startest du in wenigen Minuten. Hier findest du die Anleitung, das Erklärvideo und dein aktuelles Setup.</p>
  ${videoCard()}
  <button class="primary block" data-act="ob-replay">Einführung starten</button>
  <h2>Dein Stand</h2>
  <div class="card">${rows
    .map(([ok, label, val, href]) => `<a class="setup-row" href="${href}"><span class="check ${ok ? 'done' : ''}">${ok ? '✓' : ''}</span><span class="grow">${label}</span><b class="${ok ? '' : 'muted'}">${esc(val)}</b></a>`)
    .join('')}</div>
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
  <ul class="plain"><li>Leichtere oder schwächere Athleten erreichen Watt-Ziele schwerer. Dann Anfänger-Modus nutzen.</li><li>Sehr lockere Erholung ist auf dem Air Bike schwer zu steuern. Bleib bewusst im Grundtempo.</li></ul>
  <div class="notice">Gesundheitshinweis: Maximale Sprints sind sehr belastend. Bei Herz-Kreislauf-Problemen, Vorerkrankungen oder Beschwerden vorher ärztlich abklären. Bei Schwindel, Brustschmerz oder Atemnot sofort abbrechen.</div>`;
}

function profileSettingsInfo() {
  const p = profile();
  if (p.blocked) return '<p class="muted small">Dieser Plan ist für U13–U14 gesperrt (Platzhalter-Entscheidung, bitte mit Fachtrainer klären).</p>';
  const rows = [
    ['Rundenlänge', `${p.roundSecs / 60} min`],
    ['Umfang', `${Math.round(p.volume * 100)} %`],
    ['Max-Sprint bis', `${p.maxSprintSecs} s`],
    ['Harte Sessions pro Woche', `${p.hardPerWeek}`],
    ['Watt-Obergrenze', p.wattCapPct && p.wattCapPct < 100 ? `${p.wattCapPct} % vom Max-Watt` : 'keine'],
  ];
  const table = `<table class="targets"><tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</tbody></table>`;
  const approve = p.approved
    ? ''
    : `${state.approved[p.key] ? '' : '<div class="notice">Platzhalterwerte, nicht freigegeben.</div>'}<label style="font-weight:400;display:flex;gap:10px;align-items:center"><input type="checkbox" style="width:auto" data-approve="${p.key}" ${state.approved[p.key] ? 'checked' : ''}> Ein Fachtrainer hat diese Werte freigegeben</label>`;
  return table + approve;
}

function viewSettings() {
  const age = Number(state.age);
  const hf = age ? Math.round(208 - 0.7 * age) : 0;
  const dayOpts = (key) => `<select data-set-day="${key}" aria-label="Tag">${DAY_LONG.map((d, i) => `<option value="${i + 1}" ${Number(state.days[key]) === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  const notifSupported = 'Notification' in window;
  return `<h1>Einstellungen</h1>
  <div class="btn-row"><button class="ghost" data-act="ob-replay">Einführung noch einmal ansehen</button></div>
  <h2>Profil (Altersklasse)</h2>
  <label for="profile">Profil</label>
  <select id="profile" data-set="profile">${Object.entries(PROFILES).map(([k, p]) => `<option value="${k}" ${state.profile === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  ${profileSettingsInfo()}
  <h2>Training</h2>
  <label for="maxW">Max-Watt (bester 10-s-Sprint)</label>
  <input id="maxW" type="number" inputmode="numeric" min="0" max="3000" step="5" value="${state.maxW || ''}" data-set="maxW" placeholder="z. B. 1000">
  <p class="muted small">Daraus berechnet die App alle Watt-Ziele. Am besten ermittelst du ihn mit dem geführten <a href="#/test">Max-Watt-Test</a>.</p>
  ${profile().key === 'elite' ? `<label for="off">Anfänger-Modus</label>
  <select id="off" data-set="off">
    <option value="0" ${!state.off ? 'selected' : ''}>Aus</option>
    <option value="50" ${Number(state.off) === 50 ? 'selected' : ''}>Watt-Ziele −50 W</option>
    <option value="100" ${Number(state.off) === 100 ? 'selected' : ''}>Watt-Ziele −100 W</option>
  </select>
  <p class="muted small">Senkt nur feste Watt-Bereiche (z. B. 200–350 W). Prozent- und Max-Ziele bleiben.</p>` : ''}

  <h2>Aktive Erholung</h2>
  <label for="age">Alter (für den Pulsbereich der Aktiven Erholung)</label>
  <input id="age" type="number" inputmode="numeric" min="10" max="90" value="${state.age || ''}" data-set="age">
  ${hf ? `<p>Pulsbereich in der Aktiven Erholung: <b>${Math.round(hf * 0.7)}–${Math.round(hf * 0.8)} Schläge pro Minute</b></p><p class="muted small">Das ist ein Richtwert aus dem Alter.</p>` : ''}

  <h2>Kampf und Termine</h2>
  <label for="fightDate">Kampftermin (Turnier)</label>
  <input id="fightDate" type="date" value="${esc(state.fightDate)}" data-set="fightDate">
  <label for="freq">Training am Air Bike pro Woche</label>
  <select id="freq" data-set="freq">${[1, 2, 3].map((n) => `<option value="${n}" ${Number(state.freq) === n ? 'selected' : ''}>${n}× pro Woche</option>`).join('')}</select>
  <p class="muted small">${esc(planSummary())}</p>
  ${!state.fightDate ? `<label for="startDate">Startdatum (nur ohne Kampftermin)</label>
  <input id="startDate" type="date" value="${esc(state.startDate)}" data-set="startDate">` : ''}
  <div class="field-row">
    <div><label>Einheit 1</label>${dayOpts('s1')}</div>
    <div><label>Aktive Erholung</label>${dayOpts('rec')}</div>
    ${effFreq() >= 2 ? `<div><label>Einheit 2</label>${dayOpts('s2')}</div>` : ''}
    ${effFreq() >= 3 ? `<div><label>Einheit 3</label>${dayOpts('s3')}</div>` : ''}
  </div>
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
  <p class="muted small">Dein Fortschritt liegt nur in diesem Browser. Wenn du Browserdaten löschst oder das Gerät wechselst, ist er weg. Sichere ihn regelmäßig.</p>
  <div class="btn-row"><button class="ghost" data-act="export">Sichern</button><label class="btn ghost" style="margin:0">Wiederherstellen<input type="file" accept="application/json" data-act="import" hidden></label></div>
  <div class="btn-row"><button class="danger" data-act="reset">Fortschritt zurücksetzen</button></div>`;
}

function notFound() {
  return '<h1>Nicht gefunden</h1><p><a href="#/">Zur Startseite</a></p>';
}

/* ---------------- Router ---------------- */
let cleanup = null;
function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  document.body.classList.remove('running');
  setChrome('idle');
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [view, arg] = parts;
  document.querySelectorAll('#nav a').forEach((a) => {
    const nav = a.dataset.nav;
    const active = (nav === 'home' && !view) || (nav === 'plan' && (view === 'plan' || view === 'week' || view === 's')) || (nav === 'home' && view === 'test') || nav === view;
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
    case 'settings': html = viewSettings(); break;
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
  if (profile().blocked) {
    location.hash = '#/';
    return;
  }
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
      el.box.innerHTML = `<div class="t-mid"><div class="t-label">Test geschafft</div><div class="t-target">Dein höchster Wert?</div>
        <div class="t-sub">Trage den höchsten Wert der drei Sprints ein.</div>
        <input id="testW" type="number" inputmode="numeric" min="100" max="3000" step="5" placeholder="Watt" aria-label="Höchster Wert in Watt" style="max-width:220px;text-align:center;font-size:28px;font-weight:800;margin-top:8px"></div>
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
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AirMaschine//DE', 'CALSCALE:GREGORIAN'];
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
        fold(`SUMMARY:${icsEscape(`AirMaschine W${w.n}: ${s.title}`)}`),
        fold(`DESCRIPTION:${icsEscape(s.focus)}`),
        'BEGIN:VALARM',
        'TRIGGER:PT0S',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape('AirMaschine Training')}`,
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
      new Notification('AirMaschine', { body: `Heute: ${hit.title}`, icon: 'icons/icon-192.png' });
    } catch {
      /* Hinweis nicht möglich */
    }
  }, wait);
}

/* ---------------- Einführung (So startest du) ---------------- */
const OB_STEPS = ['welcome', 'health', 'profile', 'fight', 'level', 'watt', 'done'];
let ob = { step: 0 };

function videoEmbed(url) {
  const yt = url.match(/(?:(?:m\.|www\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0" title="${esc(HOWTO_VIDEO.title)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}?autoplay=1" title="${esc(HOWTO_VIDEO.title)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  return `<video src="${esc(url)}" controls autoplay playsinline preload="metadata"></video>`;
}
function videoCard() {
  const has = Boolean(HOWTO_VIDEO.url);
  return `<button class="videocard ${has ? '' : 'off'}" ${has ? 'data-act="video"' : 'disabled'} aria-label="${esc(HOWTO_VIDEO.title)}">
    <span class="play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>
    <span class="vtxt"><b>${esc(HOWTO_VIDEO.title)}</b><span>${has ? 'Video ansehen (1 Minute)' : 'Erklärvideo folgt in Kürze'}</span></span>
  </button>`;
}
function showVideo() {
  $modal.hidden = false;
  $modal.className = 'vidmode';
  $modal.innerHTML = `<div class="vidfull" role="dialog" aria-modal="true" aria-label="${esc(HOWTO_VIDEO.title)}"><div class="vid">${videoEmbed(HOWTO_VIDEO.url)}</div>
    <button class="vidclose" data-act="closemodal" aria-label="Video schließen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
  $modal.querySelector('.vidclose')?.focus();
}

function obProfileOpts() {
  const sub = { elite: 'Erwachsene und Elite, Plan wie im Grundaufbau', u18: 'Reduzierter Umfang, kürzere Sprints', u16: 'Stark reduziert, 2 harte Einheiten pro Woche', u14: 'Für diese Altersklasse ist der Plan nicht geeignet' };
  return Object.entries(PROFILES)
    .map(([k, p]) => `<button class="opt ${state.profile === k ? 'sel' : ''}" data-act="ob-profile" data-key="${k}"><b>${esc(p.name)}</b><span>${esc(sub[k] || '')}</span></button>`)
    .join('');
}

function obBody(id) {
  const p = profile();
  switch (id) {
    case 'welcome':
      return `<div class="ob-hero"><img src="img/hero.jpg" alt="" onerror="this.remove()"><div class="ob-hero-in">${BRAND_MARK}<b>${APP_NAME_A}<i>${APP_NAME_B}</i></b></div></div>
        <h1>So startest du</h1>
        <p class="muted">In wenigen Minuten ist dein Plan bereit. Du brauchst dein Alter, deinen Kampftermin und deine Leistung in Watt auf dem Air Bike.</p>
        ${videoCard()}
        <ol class="ob-list">
          <li><b>Gesundheit</b><span>Kurzer Hinweis vor dem Start</span></li>
          <li><b>Für wen</b><span>Altersklasse wählen</span></li>
          <li><b>Kampftermin</b><span>Plan richtet sich danach</span></li>
          <li><b>Trainingsstand</b><span>Wie fit bist du am Air Bike?</span></li>
          <li><b>Max-Watt</b><span>Dein Bestwert in Watt, Grundlage aller Ziele</span></li>
        </ol>`;
    case 'health':
      return `<span class="kicker">Schritt 1 von 5</span><h1>Gesundheit</h1>
        <p>Maximale Sprints sind extrem belastend. Lass dich bei Vorerkrankungen oder Unsicherheit vorher ärztlich untersuchen.</p>
        <ul class="plain"><li>Bei Schwindel, Brustschmerz, Atemnot oder Übelkeit sofort abbrechen.</li><li>Immer zuerst aufwärmen.</li><li>Du trainierst auf eigene Verantwortung.</li></ul>`;
    case 'profile':
      return `<span class="kicker">Schritt 2 von 5</span><h1>Für wen?</h1><p class="muted">Die Altersklasse bestimmt Umfang und Sprintdauer.</p>
        ${p.blocked ? '<div class="notice" style="background:rgba(255,45,70,.12);border-color:rgba(255,45,70,.5);color:#ff9aa6">Der Plan ist für diese Altersklasse gesperrt. Du kannst die App trotzdem einrichten, Einheiten starten geht aber nicht.</div>' : ''}
        ${!p.approved && !p.blocked ? '<div class="notice">Die Werte für diese Altersklasse sind Platzhalter und müssen von einem verantwortlichen Trainer freigegeben werden.</div>' : ''}
        ${obProfileOpts()}`;
    case 'fight':
      return `<span class="kicker">Schritt 3 von 5</span><h1>Kampftermin</h1>
        <p class="muted">Der Plan wird rückwärts bis zu deinem Kampf oder Turnier gebaut.</p>
        <label for="obFight">Datum des Kampfes</label>
        <input id="obFight" type="date" value="${esc(ob.fightDraft !== undefined ? ob.fightDraft : state.fightDate)}">
        <label>Wie oft pro Woche kannst du aufs Air Bike?</label>
        <div class="seg">${[1, 2, 3].map((n) => `<button class="opt sm ${Number(state.freq) === n ? 'sel' : ''}" data-act="ob-freq" data-n="${n}"><b>${n}×</b><span>pro Woche</span></button>`).join('')}</div>
        <p class="muted small">Bei weniger als 3 Einheiten wählt die App die wichtigsten aus.</p>
        <button class="linkbtn" data-act="ob-nodate">Ich habe noch keinen Termin</button>`;
    case 'level':
      return `<span class="kicker">Schritt 4 von 5</span><h1>Trainingsstand</h1>
        <p class="muted">Wie fit bist du am Air Bike? Das bestimmt, wie hoch die festen Watt-Ziele im Aufwärmen und in den Stufen liegen.</p>
        ${[[0, 'Sehr gut trainiert', 'Ich fahre regelmäßig hart auf dem Air Bike'], [50, 'Gut trainiert', 'Watt-Ziele 50 W niedriger'], [100, 'Wenig Erfahrung am Air Bike', 'Watt-Ziele 100 W niedriger']]
          .map(([v, t, s]) => `<button class="opt ${ob.levelSet && Number(state.off) === v ? 'sel' : ''}" data-act="ob-level" data-v="${v}"><b>${t}</b><span>${s}</span></button>`)
          .join('')}`;
    case 'watt':
      return `<span class="kicker">Schritt 5 von 5</span><h1>Dein Max-Watt</h1>
        <p class="muted">Das ist die höchste Leistung, die du bei einem maximalen 10-Sekunden-Sprint erreichst. Daraus berechnet die App jedes Watt-Ziel.</p>
        <div class="card"><h3>Ich kenne meinen Wert</h3>
          <div class="row" style="margin-top:8px"><input id="obMax" type="number" inputmode="numeric" min="100" max="3000" step="5" placeholder="z. B. 1000" value="${state.maxW || ''}" aria-label="Max-Watt"><button class="primary" data-act="ob-savemax">OK</button></div></div>
        <div class="card"><h3>Ich messe ihn jetzt</h3><p class="muted small" style="margin:4px 0 10px">Geführter Test mit Aufwärmen und drei Sprints, etwa 10 Minuten.</p>
          <button class="primary block" data-act="ob-test">Max-Watt-Test starten</button></div>
        <button class="linkbtn" data-act="ob-next">Später eintragen (dann siehst du nur Prozentwerte)</button>`;
    case 'done': {
      const pl = plan();
      const d = daysToFight();
      return `<span class="kicker">Fertig</span><h1>Dein Plan steht</h1>
        <ul class="sum">
          <li><span>Altersklasse</span><b>${esc(p.name)}</b></li>
          <li><span>Kampf</span><b>${pl.fight ? fmtDate(pl.fight) + (d !== null ? ' · in ' + d + ' Tagen' : '') : 'noch kein Termin'}</b></li>
          <li><span>Plan</span><b>${pl.weeks.length ? wochen(pl.weeks.length) + ', ' + effFreq() + '× pro Woche' : 'noch nicht berechnet'}</b></li>
          <li><span>Max-Watt</span><b>${state.maxW ? state.maxW + ' W' : 'noch offen'}</b></li>
        </ul>
        ${pl.mode === 'start' ? '<p class="muted small">Ohne Kampftermin gilt der volle Plan über 10 Wochen ab heute. Den Termin kannst du später in den Einstellungen eintragen.</p>' : ''}
        <h2>Als Nächstes</h2>
        ${state.maxW ? `<p>Deine erste Einheit findest du auf der Startseite unter „Nächste Einheit“. Tippe darauf und starte den Timer.</p>` : '<p><b>Mache zuerst den Max-Watt-Test.</b> Er steht oben auf der Startseite. Ohne ihn siehst du nur Prozentwerte statt Watt-Zahlen.</p>'}`;
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
  const nextLabel = id === 'welcome' ? 'Los geht’s' : id === 'health' ? 'Verstanden, weiter' : last ? 'Zur Übersicht' : 'Weiter';
  const showNext = id !== 'watt';
  sheet.innerHTML = `<div class="sheet-in">
    <div class="ob-top">${first ? '<span></span>' : '<button class="ob-back" data-act="ob-back" aria-label="Zurück">← Zurück</button>'}
      <div class="dots" aria-hidden="true">${first ? '' : [1, 2, 3, 4, 5].map((i) => `<i class="${i <= ob.step || last ? 'on' : ''}"></i>`).join('')}</div>
      ${first ? '<button class="ob-skip" data-act="ob-skip">Überspringen</button>' : '<span></span>'}</div>
    <div class="ob-body">${obBody(id)}</div>
    ${showNext ? `<div class="ob-foot"><button class="primary block" data-act="${last ? 'ob-finish' : 'ob-next'}">${nextLabel}</button></div>` : ''}
  </div>`;
  sheet.scrollTop = 0;
}

function startOnboarding(step = 0) {
  ob = { step, levelSet: Boolean(state.onboarded) };
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
  if (id === 'health') {
    state.ack = true;
    save();
  }
  if (id === 'level' && !ob.levelSet) {
    alert('Bitte wähle deinen Trainingsstand.');
    return;
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
  if (OB_STEPS[n] === 'level' && profile().key !== 'elite') n += 1;
  ob.step = Math.min(n, OB_STEPS.length - 1);
  renderOnboarding();
}
function obBack() {
  let n = ob.step - 1;
  if (OB_STEPS[n] === 'level' && profile().key !== 'elite') n -= 1;
  ob.step = Math.max(n, 0);
  renderOnboarding();
}

/* ---------------- Ereignisse ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  switch (act) {
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
    case 'ob-profile':
      state.profile = t.dataset.key;
      if (state.profile !== 'elite') state.off = 0;
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
    case 'ob-level':
      ob.levelSet = true;
      state.off = Number(t.dataset.v);
      save();
      renderOnboarding();
      break;
    case 'ob-nodate':
      obNext(true);
      break;
    case 'ob-savemax': {
      const v = Math.round(Number(document.getElementById('obMax')?.value));
      if (v >= 100 && v <= 3000) {
        state.maxW = v;
        state.maxWDate = new Date().toISOString();
        save();
        ob.step += 1;
        renderOnboarding();
      } else {
        alert('Bitte einen Wert zwischen 100 und 3000 W eingeben.');
      }
      break;
    }
    case 'ob-test':
      closeOnboarding();
      location.hash = '#/test';
      break;
    case 'video':
      showVideo();
      break;
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
    case 'savetest': {
      const v = Math.round(Number(document.getElementById('testW')?.value));
      if (v >= 100 && v <= 3000) {
        state.maxW = v;
        state.maxWDate = new Date().toISOString();
        save();
        location.hash = '#/';
      } else {
        alert('Bitte einen Wert zwischen 100 und 3000 W eingeben.');
      }
      break;
    }
    case 'savemax': {
      const v = Math.round(Number(document.getElementById('maxInline')?.value));
      if (v >= 100 && v <= 3000) {
        state.maxW = v;
        state.maxWDate = new Date().toISOString();
        save();
        route();
      } else {
        alert('Bitte einen Wert zwischen 100 und 3000 W eingeben.');
      }
      break;
    }
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
      download('redline-training.ics', buildICS(), 'text/calendar');
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
      download(`redline-sicherung-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
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
    t.files[0].text().then((txt) => {
      try {
        const obj = JSON.parse(txt);
        if (typeof obj !== 'object' || obj === null || typeof obj.done !== 'object') throw new Error('Format');
        state = { ...DEFAULTS, ...obj, days: { ...DEFAULTS.days, ...(obj.days || {}) }, approved: obj.approved || {} };
        save();
        route();
        alert('Sicherung wiederhergestellt.');
      } catch {
        alert('Datei konnte nicht gelesen werden.');
      }
    });
    return;
  }
  if (t.dataset.approve) {
    state.approved[t.dataset.approve] = t.checked;
    save();
    route();
    return;
  }
  if (t.dataset.set) {
    const k = t.dataset.set;
    state[k] = ['maxW', 'off', 'age', 'freq'].includes(k) ? Number(t.value) || 0 : t.value;
    if (k === 'profile' && t.value !== 'elite') state.off = 0;
    save();
    scheduleReminder();
    route();
  } else if (t.dataset.setDay) {
    state.days[t.dataset.setDay] = Number(t.value);
    save();
    scheduleReminder();
    route();
  }
});

window.addEventListener('hashchange', route);

/* ---------------- Start ---------------- */
route();
if (!state.onboarded) startOnboarding();
scheduleReminder();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
