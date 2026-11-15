import { WEEKS, PHASES, PROFILES, RECOVERY_OPTIONS, weekOrder as weekOrderRaw, findSession, flatten, sessionBlocks as sessionBlocksRaw, totalSecs, fmtSecs, resolveTarget } from './data.js';

/* ---------------- Zustand ---------------- */
const KEY = 'redline.v1';
const DEFAULTS = {
  maxW: 0,
  off: 0,
  startDate: '',
  done: {},
  days: { s1: 1, rec: 3, s2: 4, s3: 6 },
  time: '18:00',
  age: 0,
  ack: false,
  notify: false,
  recOpt: 'opt1',
  profile: 'elite',
  approved: {},
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
const weekOrder = (w) => weekOrderRaw(w, profile().hardPerWeek || 3);
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

function allSessions() {
  return WEEKS.flatMap((w) => weekOrder(w).map((s) => ({ s, w })));
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

function mondayOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function currentWeekNo() {
  if (!state.startDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - mondayOf(state.startDate)) / (7 * 86400000)) + 1;
}
function nextSession() {
  return allSessions().find(({ s }) => !isDone(s.id)) || null;
}

function autoDesc(block) {
  if (block.desc) return block.desc;
  const steps = typeof block.steps === 'function' ? block.steps(1) : block.steps;
  const parts = steps.map((st) => `${fmtSecs(st.secs)} ${st.kind === 'rest' ? 'locker' : 'Zone 3'}`);
  return `${block.repeat}× (${parts.join(' · ')})`;
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
    return `<tr><td>${esc(t.label)}${when}</td><td><b>${esc(t.main)}</b></td></tr>`;
  });
}

/* ---------------- Ansichten ---------------- */
function viewHome() {
  if (profile().blocked) {
    return `<span class="kicker">Redline</span><h1>10-Wochen Air-Bike-Camp</h1>${profileBanner()}`;
  }
  const next = nextSession();
  const wk = currentWeekNo();
  let todayHtml = '';
  if (wk >= 1 && wk <= WEEKS.length) {
    const todayIso = ((new Date().getDay() + 6) % 7) + 1;
    const hit = weekOrder(WEEKS[wk - 1]).find((s) => Number(dayOf(s)) === todayIso);
    if (hit) {
      todayHtml = `<a class="card link" href="#/s/${hit.id}"><span class="chip ${isDone(hit.id) ? 'ok' : 'amber'}">Heute laut Plan${isDone(hit.id) ? ' · erledigt' : ''}</span><h3 style="margin-top:8px">${esc(hit.title)}</h3><span class="muted small">Woche ${wk}</span></a>`;
    }
  }
  let startInfo = '';
  if (state.startDate && wk < 1) {
    startInfo = `<p class="muted">Dein Start ist am ${new Date(state.startDate + 'T00:00:00').toLocaleDateString('de-DE')}.</p>`;
  }
  const maxNotice = !state.maxW
    ? `<div class="notice">Trage in den <a href="#/settings">Einstellungen</a> deinen Max-Watt ein (bester 10-s-Sprint). Dann zeigt die App dir Watt-Zahlen statt nur Prozentwerten.</div>`
    : '';

  let nextHtml;
  if (!next) {
    nextHtml = `<div class="card hero"><span class="kicker">Geschafft</span><h2 style="margin-top:6px">Programm abgeschlossen</h2><p class="muted">Alle 10 Wochen sind erledigt.</p></div>`;
  } else {
    const { s, w } = next;
    nextHtml = `<a class="card hero link" href="#/s/${s.id}">
      <span class="kicker">Nächste Session · Woche ${w.n}</span>
      <h2 style="margin:6px 0 4px">${esc(s.title)}</h2>
      <p class="muted" style="margin:0 0 12px">${esc(s.focus)}</p>
      <span class="chip red">${s.type === 'recovery' ? '30–40 min' : 'ca. ' + mins(sessionSecs(s))}</span> <span class="chip">${esc(w.phase)}</span>
    </a>`;
  }

  const doneCount = Object.keys(state.done).length;
  const total = allSessions().length;
  const cw = Math.min(Math.max(wk, 1), WEEKS.length);
  const week = wk >= 1 ? WEEKS[cw - 1] : next ? next.w : WEEKS[WEEKS.length - 1];
  const list = weekOrder(week)
    .map((s) => `<a class="card link row" href="#/s/${s.id}"><span class="check ${isDone(s.id) ? 'done' : ''}">${isDone(s.id) ? '✓' : ''}</span><span class="grow"><b>${esc(s.title)}</b><br><span class="muted small">${DAY_NAMES[Number(dayOf(s)) - 1]} · ${s.type === 'recovery' ? '30–40 min' : mins(sessionSecs(s))}</span></span></a>`)
    .join('');

  return `<span class="kicker">Redline</span><h1>10-Wochen Air-Bike-Camp</h1>
  <p class="muted">${doneCount} von ${total} Sessions erledigt</p>
  ${profileBanner()}${startInfo}${maxNotice}${todayHtml}${nextHtml}
  <h2>Woche ${week.n} · ${esc(week.phase)}</h2>${list}`;
}

function viewPlan() {
  let html = '<h1>Trainingsplan</h1><p class="muted">10 Wochen in 4 Phasen. Mindestens 1–2 Tage Abstand zwischen den harten Sessions.</p>';
  PHASES.forEach((ph) => {
    html += `<div class="phase-dot"><b>${esc(ph.name)}</b> <span class="muted small">Woche ${ph.weeks[0]}–${ph.weeks[1]}</span><div class="muted small">${esc(ph.text)}</div></div>`;
    WEEKS.filter((w) => w.n >= ph.weeks[0] && w.n <= ph.weeks[1]).forEach((w) => {
      const list = weekOrder(w);
      const done = list.filter((s) => isDone(s.id)).length;
      const level = { Niedrig: 1, Mittel: 2, 'Mittel–Hoch': 3, Hoch: 4 }[w.load];
      html += `<a class="card link" href="#/week/${w.n}"><div class="week-head"><h3>Woche ${w.n}</h3><span class="muted small">${done}/${list.length} erledigt</span></div>
        <div class="muted small">Belastung: ${esc(w.load)}</div>
        <div class="load-bar" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</div></a>`;
    });
  });
  return html;
}

function viewWeek(n) {
  const w = WEEKS[n - 1];
  if (!w) return notFound();
  const list = weekOrder(w)
    .map((s) => `<a class="card link row" href="#/s/${s.id}"><span class="check ${isDone(s.id) ? 'done' : ''}">${isDone(s.id) ? '✓' : ''}</span><span class="grow"><b>${esc(s.title)}</b><br><span class="muted small">${DAY_NAMES[Number(dayOf(s)) - 1]} · ${s.type === 'recovery' ? '30–40 min' : mins(sessionSecs(s))}</span></span></a>`)
    .join('');
  return `<a href="#/plan" class="muted small">← Plan</a><span class="kicker" style="display:block;margin-top:8px">${esc(w.phase)}</span><h1>Woche ${w.n}</h1>
  ${profileBanner()}<p class="muted">${esc(w.phaseText)}</p><p>Belastung: <b>${esc(w.load)}</b></p>${list}
  ${w.n === 10 ? '<p class="muted small">In Woche 10 steht nur eine Sprint-Session an, damit du frisch in den Kampf gehst.</p>' : ''}`;
}

function viewSession(id) {
  const found = findSession(id);
  if (!found) return notFound();
  const { session, week } = found;
  const isRec = session.type === 'recovery';
  const blocks = sessionBlocks(session, state.recOpt);
  const secs = sessionSecs(session);
  const segs = flatten({ ...session, blocks }, ctx());
  const adapted = segs.some((s) => s.target.sub.includes('Schätzung'));

  const optBtns = isRec
    ? `<h2>Variante</h2><div class="btn-row" style="flex-direction:column">${Object.entries(RECOVERY_OPTIONS)
        .map(([k, o]) => `<button class="${state.recOpt === k ? 'primary' : ''}" data-act="opt" data-key="${k}">${esc(o.name)}</button>`)
        .join('')}</div>`
    : '';

  const blockHtml = blocks
    .map((b) => {
      const rows = blockTargets(b);
      return `<div class="block"><h3>${esc(b.title)}</h3><div>${esc(autoDesc(b))}</div>${rows.length ? `<table class="targets"><tbody>${rows.join('')}</tbody></table>` : ''}${b.note ? `<div class="note">${esc(b.note)}</div>` : ''}</div>`;
    })
    .join('');

  const needMax = !state.maxW && segs.some((s) => s.target.sub.includes('Max-Watt in den Einstellungen'));
  const done = isDone(id);

  return `<a href="#/week/${week.n}" class="muted small">← Woche ${week.n}</a>
  <span class="kicker" style="display:block;margin-top:8px">Woche ${week.n} · ${esc(week.phase)}</span>
  <h1>${esc(session.title)}</h1>
  <p class="muted">${esc(session.focus)}</p>
  <p><span class="chip red">${isRec ? 'ca. ' + mins(secs) : 'ca. ' + mins(secs) + ' inkl. Warm-up'}</span> ${done ? '<span class="chip ok">erledigt</span>' : ''} ${adapted ? '<span class="chip amber">angepasst</span>' : ''}</p>
  ${profileBanner()}
  ${needMax ? `<div class="notice"><b>Max-Watt fehlt.</b> Ohne ihn siehst du nur Prozentwerte. Trage deinen besten 10-s-Sprint ein:<div class="row" style="margin-top:8px"><input id="maxInline" type="number" inputmode="numeric" min="0" max="3000" step="5" placeholder="z. B. 1000" aria-label="Max-Watt"><button class="primary" data-act="savemax">Speichern</button></div></div>` : ''}
  ${adapted ? '<div class="notice">Diese Session ist aus einer Laufband-Vorlage auf das Bike umgerechnet. Die Prozentwerte sind eine Schätzung. Richte dich vor allem nach der Belastung 9 von 10.</div>' : ''}
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
  return `<h1>Wissen</h1>
  <h2>Die Rote Zone</h2>
  <p>Boxen zwingt dich immer wieder über 90 % deines Maximalpulses. Die harten Sessions trainieren genau das: klar denken, schnelle Füße und kräftige Schläge, auch wenn die Atmung schwer geht.</p>
  <h2>Belastungsskala (RPE)</h2>
  <table class="rpe"><tbody>
    <tr><td>0</td><td>Ruhe</td></tr><tr><td>1–2</td><td>Sehr, sehr leicht bis leicht</td></tr><tr><td>3</td><td>Moderat</td></tr>
    <tr><td>4–6</td><td>Hart</td></tr><tr><td>7–8</td><td>Sehr hart (Muskelpufferung, Gänge, Wiederholte Sprints)</td></tr>
    <tr><td>9</td><td>Fast maximal (Rote Zone, HIIT)</td></tr><tr><td>10</td><td>Maximal</td></tr>
  </tbody></table>
  <p class="muted small">Die Belastung 10 ist das Maximum, das du über die jeweilige Dauer einmalig geben könntest. Ziehst du ein bisschen davon ab, hast du 9 von 10. Ein 15-s-Intervall und ein 4-min-Intervall können beide bei 9 von 10 liegen, auch wenn die Watt sehr verschieden sind.</p>
  <h2>Keine Grauzone</h2>
  <p>Fast alles ist entweder sehr hart (Zone 3) oder bewusst locker (Erholung). Dauerhaftes „mittelhartes“ Tempo bringt wenig und ermüdet trotzdem. Rund 75–80 % des Trainings sollten hart sein, 10–20 % Erholung.</p>
  <h2>Pausen</h2>
  <p>In den Pausen komplett erholen: absteigen, nicht weitertreten. Nur die Aktive-Erholung-Sessions sind locker durchgehend.</p>
  <h2>Wöchentlicher Rhythmus</h2>
  <p>Beispiel: Mo Conditioning, Mi Aktive Erholung, Do Conditioning, Sa Conditioning. Halte mindestens 1–2 Tage zwischen den harten HIIT-Sessions. Die Tage kannst du in den Einstellungen anpassen.</p>
  <h2>Warum Air Bike?</h2>
  <p>Kein Aufprall, kaum Technik und Ganzkörperbelastung. Du kannst sehr hart trainieren, ohne Sehnen und Gelenke wie beim Sprinten zu belasten.</p>
  <h2>Grenzen des Air Bikes</h2>
  <ul class="plain"><li>Leichtere oder schwächere Athleten erreichen Watt-Ziele schwerer. Dann Anfänger-Modus nutzen.</li><li>Die Rote Zone erreichst du über hohe Trittfrequenz, nicht nur über Kraft.</li><li>Sehr lockere Erholung ist auf dem Air Bike schwer zu steuern, ohne dass Laktat entsteht.</li></ul>
  <div class="notice">Gesundheitshinweis: Max-Sprints und Training in der Roten Zone sind sehr belastend. Bei Herz-Kreislauf-Problemen, Vorerkrankungen oder Beschwerden vorher ärztlich abklären. Bei Schwindel, Brustschmerz oder Atemnot sofort abbrechen.</div>`;
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
  <h2>Profil (Altersklasse)</h2>
  <label for="profile">Profil</label>
  <select id="profile" data-set="profile">${Object.entries(PROFILES).map(([k, p]) => `<option value="${k}" ${state.profile === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  ${profileSettingsInfo()}
  <h2>Training</h2>
  <label for="maxW">Max-Watt (bester 10-s-Sprint)</label>
  <input id="maxW" type="number" inputmode="numeric" min="0" max="3000" step="5" value="${state.maxW || ''}" data-set="maxW" placeholder="z. B. 1000">
  <p class="muted small">Daraus berechnet die App Zielwerte für Sprints in Prozent. Teste ihn nach dem Warm-up mit einem maximalen 10-s-Sprint.</p>
  ${profile().key === 'elite' ? `<label for="off">Anfänger-Modus</label>
  <select id="off" data-set="off">
    <option value="0" ${!state.off ? 'selected' : ''}>Aus</option>
    <option value="50" ${Number(state.off) === 50 ? 'selected' : ''}>Watt-Ziele −50 W</option>
    <option value="100" ${Number(state.off) === 100 ? 'selected' : ''}>Watt-Ziele −100 W</option>
  </select>
  <p class="muted small">Senkt nur feste Watt-Bereiche (z. B. 200–350 W). Prozent- und Max-Ziele bleiben.</p>` : ''}

  <h2>Herzfrequenz</h2>
  <label for="age">Alter</label>
  <input id="age" type="number" inputmode="numeric" min="10" max="90" value="${state.age || ''}" data-set="age">
  ${hf ? `<p>Geschätzter HFmax: <b>${hf} bpm</b> (208 − 0,7 × Alter)<br>Rote Zone ab 90 %: <b>${Math.round(hf * 0.9)} bpm</b><br>Aktive Erholung 70–80 %: <b>${Math.round(hf * 0.7)}–${Math.round(hf * 0.8)} bpm</b></p><p class="muted small">Das ist eine Schätzformel. Ein echter Maximalpuls-Test ist genauer.</p>` : ''}

  <h2>Start und Termine</h2>
  <label for="startDate">Startdatum (Woche 1)</label>
  <input id="startDate" type="date" value="${esc(state.startDate)}" data-set="startDate">
  <div class="field-row">
    <div><label>Session 1</label>${dayOpts('s1')}</div>
    <div><label>Aktive Erholung</label>${dayOpts('rec')}</div>
    <div><label>Session 2</label>${dayOpts('s2')}</div>
    <div><label>Session 3</label>${dayOpts('s3')}</div>
  </div>
  <label for="time">Uhrzeit</label>
  <input id="time" type="time" value="${esc(state.time)}" data-set="time">
  <div class="btn-row"><button class="primary" data-act="ics">Kalender-Datei (.ics) laden</button></div>
  <p class="muted small">Der Kalender erinnert am zuverlässigsten, auch bei geschlossener App. Datei öffnen und in deinen Kalender importieren. Zuerst Startdatum setzen.</p>
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
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [view, arg] = parts;
  document.querySelectorAll('#nav a').forEach((a) => {
    const nav = a.dataset.nav;
    const active = (nav === 'home' && !view) || (nav === 'plan' && (view === 'plan' || view === 'week' || view === 's')) || nav === view;
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
    default: html = notFound();
  }
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}

/* ---------------- Timer ---------------- */
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
  const found = findSession(id);
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
    <div class="t-mid"><div class="t-label" id="t-label"></div><div class="t-time" id="t-time">0:00</div><div class="t-target" id="t-target"></div><div class="t-sub" id="t-sub"></div></div>
    <div class="t-next" id="t-next"></div>
    <div class="t-bar"><i id="t-bar"></i></div>
    <div class="t-btns"><button data-act="tprev">Zurück</button><button class="main" data-act="tpause" id="t-play">Pause</button><button data-act="tnext">Weiter</button></div>
    <button class="t-exit" data-act="texit">Abbrechen</button>
  </div>`;
  const q = (i) => document.getElementById(i);
  const el = { box: q('timer'), block: q('t-block'), count: q('t-count'), label: q('t-label'), time: q('t-time'), target: q('t-target'), sub: q('t-sub'), next: q('t-next'), bar: q('t-bar'), play: q('t-play') };

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
    el.block.textContent = seg.kind === 'prep' ? session.title : `${seg.block}${seg.reps > 1 ? ` · ${seg.rep}/${seg.reps}` : ''}`;
    el.count.textContent = `${i + 1} / ${segs.length}`;
    el.label.textContent = seg.label.toLowerCase() === seg.target.main.toLowerCase() || (seg.kind === 'rest' && seg.label === 'Pause') ? '' : seg.label;
    el.target.textContent = seg.target.main;
    el.sub.textContent = seg.target.sub;
    const nx = segs[i + 1];
    el.next.textContent = nx ? `Danach: ${nx.label} · ${fmtSecs(nx.secs)} · ${nx.target.main}` : 'Letztes Intervall';
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
function showDisclaimer() {
  $modal.hidden = false;
  $modal.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="dtitle">
    <span class="kicker">Bevor es losgeht</span>
    <h2 id="dtitle" style="margin-top:6px">Gesundheitshinweis</h2>
    <p>Max-Sprints und Training in der Roten Zone sind extrem belastend. Lass dich bei Vorerkrankungen oder Unsicherheit vorher ärztlich untersuchen.</p>
    <ul class="plain"><li>Bei Schwindel, Brustschmerz, Atemnot oder Übelkeit sofort abbrechen.</li><li>Immer zuerst aufwärmen.</li><li>Du trainierst auf eigene Verantwortung.</li></ul>
    <button class="primary block" data-act="ack">Verstanden</button></div>`;
  $modal.querySelector('button')?.focus();
}

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
  const start = mondayOf(state.startDate);
  const startDay = new Date(state.startDate + 'T00:00:00');
  const [hh, mm] = (state.time || '18:00').split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Redline//DE', 'CALSCALE:GREGORIAN'];
  WEEKS.forEach((w) => {
    weekOrder(w).forEach((s) => {
      const d = new Date(start);
      d.setDate(d.getDate() + (w.n - 1) * 7 + (Number(dayOf(s)) - 1));
      if (d < startDay) return;
      const dt = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:redline-${s.id}@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dt}`,
        'DURATION:PT45M',
        fold(`SUMMARY:${icsEscape(`Redline W${w.n}: ${s.title}`)}`),
        fold(`DESCRIPTION:${icsEscape(s.focus)}`),
        'BEGIN:VALARM',
        'TRIGGER:PT0S',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape('Redline Training')}`,
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
  const wk = currentWeekNo();
  if (wk < 1 || wk > WEEKS.length) return;
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  const hit = weekOrder(WEEKS[wk - 1]).find((s) => Number(dayOf(s)) === todayIso && !isDone(s.id));
  if (!hit) return;
  const [hh, mm] = (state.time || '18:00').split(':').map(Number);
  const at = new Date();
  at.setHours(hh, mm, 0, 0);
  const wait = at - Date.now();
  if (wait <= 0 || wait > 2147483000) return;
  reminderTimer = setTimeout(() => {
    try {
      new Notification('Redline', { body: `Heute: ${hit.title}`, icon: 'icons/icon-192.png' });
    } catch {
      /* Hinweis nicht möglich */
    }
  }, wait);
}

/* ---------------- Ereignisse ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  switch (act) {
    case 'ack':
      state.ack = true;
      save();
      $modal.hidden = true;
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
    case 'savemax': {
      const v = Number(document.getElementById('maxInline')?.value);
      if (v >= 100 && v <= 3000) {
        state.maxW = v;
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
        location.hash = `#/s/${id}`;
      }
      break;
    case 'tdone':
      state.done[t.dataset.id] = new Date().toISOString();
      save();
      location.hash = '#/';
      break;
    case 'ics':
      if (!state.startDate) {
        alert('Bitte zuerst das Startdatum setzen.');
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
    state[k] = ['maxW', 'off', 'age'].includes(k) ? Number(t.value) || 0 : t.value;
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
if (!state.ack) showDisclaimer();
scheduleReminder();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
