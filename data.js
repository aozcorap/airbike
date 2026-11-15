// Trainingsplan: 10 Wochen Air-Bike-Conditioning.
// Aufbau: Woche -> Sessions -> Blöcke -> Schritte. Alles wird zur Laufzeit in eine Timer-Folge umgerechnet.

// ---------- Schritt-Bausteine ----------
const work = (label, secs, t = {}) => ({ label, secs, kind: 'work', ...t });
const easy = (label, secs, t = {}) => ({ label, secs, kind: 'easy', rpe: '2–3', ...t });
const rest = (label, secs, t = {}) => ({ label, secs, kind: 'rest', ...t });
const times = (n, arr) => Array.from({ length: n }, () => arr).flat();

// ---------- Block-Bausteine ----------
const pause = (secs, title = 'Pause') => ({ title, repeat: 1, steps: [rest('Pause', secs)] });

const warmup = () => [
  {
    title: 'Warm-up',
    desc: '4 × (30 s Arbeit · 30 s Pause) · 200–400 W',
    note: 'Ziel: am Ende knapp unter der roten Zone. Liegt der Puls nach 2 Wiederholungen unter 80 % HFmax, Intensität erhöhen.',
    repeat: 4,
    trimLast: true,
    steps: [work('Warm-up', 30, { w: [200, 400] }), rest('Pause', 30)],
  },
  pause(60, 'Pause vor Hauptteil'),
];

const warmupLong = () => [
  {
    title: 'Warm-up',
    desc: '4 min Arbeit · 1 min Pause · 150–300 W',
    note: 'Ziel: am Ende knapp unter der roten Zone.',
    repeat: 1,
    steps: [work('Warm-up', 240, { w: [150, 300] }), rest('Pause', 60)],
  },
];

const extWarmup = (reps, lo = 60, hi = 90) => ({
  title: 'Erweitertes Warm-up',
  desc: `${reps} × (10 s Sprint bei ${lo}–${hi} % · 1 min Pause)`,
  repeat: reps,
  steps: [work('10-s-Sprint', 10, { pct: [lo, hi] }), rest('Pause', 60)],
});

const maxSprints = ({ secs, reps, drop, rec = 180 }) => ({
  title: `${secs}-s-Max-Sprints`,
  desc: `${reps} × (${secs} s maximal · ${rec / 60} min Pause) · Leistung höchstens ${drop} % abfallen lassen`,
  repeat: reps,
  steps: [work('Max-Sprint', secs, { pct: 100, hold: drop }), rest('Erholung', rec)],
});

const doubleSprint = (reps) => ({
  title: '2 × 20 s Max-Sprint',
  desc: `${reps} × (20 s max · 20 s Pause · 20 s bei 90 % · 3 min Pause)`,
  repeat: reps,
  steps: [
    work('Sprint 1', 20, { pct: 100, hold: 20 }),
    rest('Pause', 20),
    work('Sprint 2 (90 %)', 20, { pct: 90, hold: 20 }),
    rest('Erholung', 180),
  ],
});

const tripleSprint = (reps) => ({
  title: '3 × 10 s Max-Sprint',
  desc: `${reps} × (3 × 10 s maximal mit 10 s Pause · 3 min Erholung) · jede Wiederholung höchstens 10 % unter Bestwert`,
  repeat: reps,
  steps: [
    work('Sprint 1', 10, { maxEffort: true, within: 10 }),
    rest('Pause', 10),
    work('Sprint 2', 10, { maxEffort: true, within: 10 }),
    rest('Pause', 10),
    work('Sprint 3', 10, { maxEffort: true, within: 10 }),
    rest('Erholung', 180),
  ],
});

const gears = (reps) => ({
  title: 'Gänge hochschalten',
  desc: `${reps} × (30 s @ 300–450 W → 20 s @ 450–600 W → 10 s @ 600–1000 W · 3 min Pause)`,
  note: 'Belastung 7–8 von 10. Nach jeder Wiederholung prüfen: bei mehr als 8 Intensität senken.',
  repeat: reps,
  steps: [
    work('Gang 1 · 30 s', 30, { w: [300, 450], rpe: '7–8' }),
    work('Gang 2 · 20 s', 20, { w: [450, 600], rpe: '7–8' }),
    work('Gang 3 · 10 s', 10, { w: [600, 1000], rpe: '7–8' }),
    rest('Erholung', 180),
  ],
});

const repeated = (reps, pacing, hint) => ({
  title: `12 s Arbeit · 48 s Pause`,
  desc: `${reps} Wiederholungen · Tempostrategie: ${pacing.map((p) => `Wdh. ${p.from}–${p.to} bei ${p.pct === 100 ? 'Maximum' : p.pct + ' %'}`).join(', ')}`,
  note: hint,
  repeat: reps,
  steps: (i) => {
    const p = pacing.find((x) => i >= x.from && i <= x.to) || pacing[pacing.length - 1];
    return [
      work('12-s-Sprint', 12, p.pct === 100 ? { maxEffort: true, rpe: '7–8' } : { pct: p.pct, rpe: '7–8' }),
      rest('Pause', 48),
    ];
  },
});

const pyramid = (counts) => {
  const loads = [
    [1, 60, 60, counts[0], [200, 350]],
    [2, 40, 20, counts[1], [250, 400]],
    [3, 30, 30, counts[2], [300, 500]],
    [4, 20, 40, counts[3], [500, 700]],
    [5, 10, 50, counts[4], null],
    [6, 20, 40, counts[5], [500, 700]],
    [7, 30, 30, counts[6], [300, 500]],
    [8, 40, 20, counts[7], [250, 400]],
    [9, 60, 0, counts[8], [200, 350]],
  ];
  return loads.map(([n, on, off, reps, w]) => ({
    title: `Stufe ${n}`,
    desc: `${reps} × ${on} s Arbeit${off ? ' · ' + off + ' s Pause' : ''} · ${w ? w[0] + '–' + w[1] + ' W' : 'maximale Anstrengung'}`,
    repeat: reps,
    steps: [
      work(`${on} s Arbeit`, on, w ? { w } : { maxEffort: true }),
      ...(off ? [rest('Pause', off, { txt: 'Komplett ausruhen, Zeit zum Wechsel zur nächsten Stufe nutzen' })] : []),
    ],
  }));
};

const fightHiit = ({ reps, on, off, pct, roundSecs = 180 }) => {
  const inner = Math.max(1, Math.floor(roundSecs / (on + off)));
  const minutes = roundSecs / 60;
  return {
    title: 'Fight-HIIT',
    desc: `${reps} × ${minutes}-min-Runde (${inner} × ${on} s Arbeit · ${off} s Pause) · 1 min Pause zwischen den Runden`,
    note: 'Richte dich nach der Belastung: 9 von 10.',
    repeat: reps,
    fight: { on, off, pct },
    steps: [
      ...times(inner, [
        work(`${on} s Arbeit`, on, { pct, rpe: '9' }),
        rest(`${off} s Pause`, off),
      ]),
      rest('Pause zwischen den Runden', 60),
    ],
  };
};

// ---------- Max-Watt-Test ----------
// Vorschlag des Auftraggebers: 1–3 Sprints à 10 s mit 1 min Pause. Das PDF beschreibt keinen Test.
// Vermutung: Eine längere Pause (2–3 min) liefert verlässlichere Werte. Hier zentral einstellbar.
export const TEST_PAUSE_SECS = 60;
export const TEST_SESSION = {
  id: 'test',
  type: 'test',
  title: 'Max-Watt-Test',
  focus: 'Drei maximale 10-Sekunden-Sprints. Dein höchster Wert wird die Grundlage für alle Watt-Ziele.',
  blocks: [
    ...warmup(),
    {
      title: 'Test-Sprints',
      desc: `3 × (10 s maximal · ${TEST_PAUSE_SECS / 60} min Pause)`,
      note: 'Merke dir den höchsten Wert, den dein Bike während der Sprints anzeigt. Du trägst ihn danach ein.',
      repeat: 3,
      steps: [work('Test-Sprint', 10, { maxEffort: true }), rest('Pause', TEST_PAUSE_SECS)],
    },
  ],
};

// ---------- Aktive Erholung (auf das Bike umgeschrieben) ----------
const REC_TXT = '70–80 % HFmax, Belastung 2–3 von 10';
const on = (m) => easy(`${m} min Zone 3`, m * 60, { txt: REC_TXT });
const onS = (s) => easy(`${s} s Zone 3`, s, { txt: REC_TXT });
const off = (m) => rest(`${m} min locker rollen`, m * 60, { txt: 'Sehr locker weiterrollen' });
const offS = (s) => rest(`${s} s locker rollen`, s, { txt: 'Sehr locker weiterrollen' });

export const RECOVERY_OPTIONS = {
  opt1: {
    name: 'Option 1 · Intervalle gemischt',
    blocks: [
      { title: 'Block A', repeat: 2, steps: [on(6), off(2)] },
      { title: 'Block B', repeat: 1, steps: [on(4), off(2)] },
      { title: 'Block C', repeat: 10, steps: [onS(30), offS(30)] },
      { title: 'Block D', repeat: 2, steps: [on(6), off(2)] },
      { title: 'Block E', repeat: 1, steps: [easy('10 min gleichmäßig', 600, { txt: REC_TXT })] },
    ],
  },
  opt2: {
    name: 'Option 2 · Lange Stufen',
    blocks: [
      { title: 'Block A', repeat: 1, steps: [on(6), off(2), on(4), off(1)] },
      { title: 'Block B', repeat: 2, steps: [on(2), off(1)] },
      { title: 'Block C', repeat: 4, steps: [on(1), offS(30)] },
      { title: 'Block D', repeat: 8, steps: [onS(30), offS(30)] },
      { title: 'Block E', repeat: 2, steps: [on(2), off(1)] },
      { title: 'Block F', repeat: 1, steps: [on(4), off(1), easy('10 min gleichmäßig', 600, { txt: REC_TXT })] },
    ],
  },
  opt3: {
    name: 'Option 3 · Gleichmäßig (35 min)',
    blocks: [{ title: 'Gleichmäßig', repeat: 1, steps: [easy('35 min gleichmäßig', 2100, { txt: REC_TXT })] }],
  },
};

// ---------- Profile (Altersklassen) ----------
// ACHTUNG: Die Werte der Jugendprofile sind PLATZHALTER und nicht von einem Fachtrainer freigegeben.
export const PROFILES = {
  elite: { name: 'Elite / Erwachsene', roundSecs: 180, volume: 1, maxSprintSecs: 30, hardPerWeek: 3, wattCapPct: 0, approved: true },
  u18: { name: 'U17–U18', roundSecs: 180, volume: 0.8, maxSprintSecs: 20, hardPerWeek: 3, wattCapPct: 100, approved: false },
  u16: { name: 'U15–U16', roundSecs: 120, volume: 0.6, maxSprintSecs: 15, hardPerWeek: 2, wattCapPct: 90, approved: false },
  u14: { name: 'U13–U14', blocked: true, approved: false },
};

// ---------- Phasen ----------
export const PHASES = [
  { weeks: [1, 2], name: 'Tempo freischalten', text: 'Pyramiden und 20-s-Sprints bauen die Basis auf und holen Geschwindigkeit in die rote Zone.' },
  { weeks: [3, 5], name: 'Max-Effort-Sprints', text: 'Maximale 30-s-, 20-s- und 10-s-Sprints trainieren die Sauerstoffverwertung in der Muskulatur.' },
  { weeks: [6, 8], name: 'Muskelpufferung', text: 'Kontrollierte Intervalle (Belastung 7–8 von 10) trainieren den Umgang mit Übersäuerung.' },
  { weeks: [9, 10], name: 'Fight-HIIT & Taper', text: 'Kampfspezifische 3-min-Runden und kurze Sprints bringen dich frisch und scharf zum Kampf.' },
];

const LOAD = { 1: 'Mittel', 2: 'Mittel', 3: 'Mittel', 4: 'Mittel–Hoch', 5: 'Hoch', 6: 'Mittel', 7: 'Mittel–Hoch', 8: 'Hoch', 9: 'Mittel', 10: 'Niedrig' };

// ---------- Sessions ----------
const NON_MAIN = new Set(['Warm-up', 'Pause vor Hauptteil', 'Erweitertes Warm-up']);
const S = (id, type, title, focus, blocks) => ({ id, type, title, focus, blocks: blocks.map((b) => ({ ...b, main: !NON_MAIN.has(b.title) })) });

const T = {
  pyramid: ['Pyramiden-HIIT', 'Viel Intensität bei kleinem Umfang: kurze und lange Intervalle mit steigendem und sinkendem Tempo.'],
  speed: ['Max-Sprints · Speed-Ausdauer', '20-s-Sprints bei maximaler Intensität. Erst Höchstleistung erreichen, dann um höchstens 20 % abfallen.'],
  periph: ['Max-Sprints · Periphere Anpassung', 'Maximale Sprints für schnelle Anpassungen der Muskelzelle. Attackiere jede Wiederholung.'],
  gears: ['Gänge hochschalten', 'Eine Minute in drei Stufen mit steigender Leistung. Kontrolliert bleiben (7–8 von 10).'],
  repeated: ['Wiederholte Sprints', 'Viele kurze Sprints (12 s) mit langer Pause. Die Tempostrategie steuert die Intensität.'],
  fight: ['Fight-HIIT', 'Boxrunden-Struktur: 3-min-Runden, aufgeteilt in kurze harte Intervalle.'],
  sprintsMax: ['Sprint-Session · Taper', '10-s-Sprints, um das Nervensystem scharf zu machen. Du sollst frisch sein, nicht müde.'],
  taper: ['Sprint-Taper', 'Leichte Sprint-Session vor dem Kampf. Du sollst dich danach nicht müde fühlen.'],
};

const mk = (id, key, blocks) => S(id, key, T[key][0], T[key][1], blocks);

function buildWeeks() {
  const std = warmup();
  const ext4 = extWarmup(4);
  const W = [];

  // Woche 1 und 2
  const pyr1 = pyramid([2, 1, 2, 2, 3, 2, 2, 1, 1]);
  const pyr2 = pyramid([2, 2, 2, 3, 4, 3, 2, 2, 1]);
  const speed = [...std, ext4, maxSprints({ secs: 20, reps: 4, drop: 20 })];
  W.push([mk('w1s1', 'pyramid', [...std, ...pyr1]), mk('w1s2', 'speed', speed), mk('w1s3', 'pyramid', [...std, ...pyr1])]);
  W.push([mk('w2s1', 'pyramid', [...std, ...pyr2]), mk('w2s2', 'speed', speed), mk('w2s3', 'pyramid', [...std, ...pyr2])]);

  // Woche 3
  W.push([
    mk('w3s1', 'periph', [...std, ext4, maxSprints({ secs: 30, reps: 4, drop: 40 })]),
    mk('w3s2', 'periph', [...std, ext4, doubleSprint(5)]),
    mk('w3s3', 'periph', [...std, ext4, maxSprints({ secs: 30, reps: 4, drop: 40 })]),
  ]);
  // Woche 4
  W.push([
    mk('w4s1', 'periph', [...std, ext4, maxSprints({ secs: 30, reps: 5, drop: 40 })]),
    mk('w4s2', 'periph', [...std, ext4, doubleSprint(5)]),
    mk('w4s3', 'periph', [...std, ext4, maxSprints({ secs: 30, reps: 5, drop: 40 })]),
  ]);
  // Woche 5
  W.push([
    mk('w5s1', 'periph', [...std, extWarmup(6), maxSprints({ secs: 30, reps: 5, drop: 40 })]),
    mk('w5s2', 'periph', [...std, ext4, tripleSprint(5)]),
    mk('w5s3', 'periph', [...std, ext4, tripleSprint(5)]),
  ]);

  // Woche 6 bis 8
  const ext5 = extWarmup(5, 70, 100);
  const hint = 'Fange bei etwa 85 % an, gib in der Mitte Gas und lass am Ende etwas nach.';
  const pLong = (n) => [{ from: 1, to: n / 3, pct: 85 }, { from: n / 3 + 1, to: (2 * n) / 3, pct: 95 }, { from: (2 * n) / 3 + 1, to: n, pct: 80 }];
  const w8 = [
    { from: 1, to: 6, pct: 90 },
    { from: 7, to: 12, pct: 80 },
    { from: 13, to: 17, pct: 85 },
    { from: 18, to: 21, pct: 100 },
  ];
  const p15 = [{ from: 1, to: 3, pct: 85 }, { from: 4, to: 9, pct: 95 }, { from: 10, to: 15, pct: 80 }];
  W.push([
    mk('w6s1', 'gears', [...std, ext4, gears(5)]),
    mk('w6s2', 'repeated', [...warmupLong(), ext5, repeated(15, p15, hint)]),
    mk('w6s3', 'gears', [...std, ext4, gears(5)]),
  ]);
  W.push([
    mk('w7s1', 'gears', [...std, ext4, gears(6)]),
    mk('w7s2', 'repeated', [...warmupLong(), ext5, repeated(18, pLong(18), hint)]),
    mk('w7s3', 'repeated', [...warmupLong(), ext5, repeated(18, pLong(18), hint)]),
  ]);
  W.push([
    mk('w8s1', 'gears', [...std, ext4, gears(6)]),
    mk('w8s2', 'repeated', [...std, ext5, repeated(21, w8, 'Starte schnell, nimm in der Mitte Tempo raus und spare dir Kraft für einen großen Schlussspurt.')]),
    mk('w8s3', 'repeated', [...std, ext5, repeated(21, w8, 'Starte schnell, nimm in der Mitte Tempo raus und spare dir Kraft für einen großen Schlussspurt.')]),
  ]);

  // Woche 9 und 10
  W.push([
    mk('w9s1', 'fight', [...std, fightHiit({ reps: 5, on: 20, off: 10, pct: [60, 75] })]),
    mk('w9s2', 'sprintsMax', [
      ...std,
      ext4,
      {
        title: '10-s-Max-Sprints',
        desc: '10 × (10 s maximal · 2 min Pause)',
        note: 'Peile deine persönlichen Bestwerte an. Du sollst dich aufgeladen und bereit fühlen.',
        repeat: 10,
        steps: [work('Max-Sprint', 10, { maxEffort: true }), rest('Erholung', 120)],
      },
    ]),
    mk('w9s3', 'fight', [...std, fightHiit({ reps: 4, on: 15, off: 15, pct: [65, 80] })]),
  ]);
  W.push([
    mk('w10s1', 'taper', [
      ...std,
      ext4,
      {
        title: '10-s-Sprints bei 90 %',
        desc: '6 × (10 s bei 90 % des Bestwerts aus Woche 9 · 2 min Pause)',
        note: 'Du sollst dich danach nicht müde fühlen, nur aufgeladen.',
        repeat: 6,
        steps: [work('Sprint bei 90 %', 10, { pct: 90, rpe: '8–9' }), rest('Erholung', 120)],
      },
    ]),
  ]);
  return W;
}

const SESSIONS = buildWeeks();

export const WEEKS = SESSIONS.map((sessions, idx) => {
  const n = idx + 1;
  const phase = PHASES.find((p) => n >= p.weeks[0] && n <= p.weeks[1]);
  return {
    n,
    phase: phase.name,
    phaseText: phase.text,
    load: LOAD[n],
    sessions,
    recovery: { id: `w${n}r`, type: 'recovery', title: 'Aktive Erholung', focus: 'Locker bleiben (2–3 von 10, 70–80 % HFmax), 30–40 min. Bringt Abwechslung und verbessert die Ausdauer, ohne dich zu ermüden.', blocks: [] },
  };
});

// Reihenfolge innerhalb einer Woche: Session 1, Erholung, Session 2, Session 3
export function weekOrder(week, hardPerWeek = 3) {
  const [s1, s2, s3] = week.sessions;
  const hard = [s1, s2, s3].filter(Boolean).slice(0, hardPerWeek);
  return [hard[0], week.recovery, ...hard.slice(1)].filter(Boolean);
}

export function findSession(id) {
  for (const w of WEEKS) {
    const all = [...w.sessions, w.recovery];
    const s = all.find((x) => x.id === id);
    if (s) return { session: s, week: w };
  }
  return null;
}

// ---------- Umrechnung in Timer-Segmente ----------
const r5 = (v) => Math.round(v / 5) * 5;

export function fmtSecs(s) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}:${String(r).padStart(2, '0')} min` : `${m} min`;
}

export function resolveTarget(step, ctx) {
  const { maxW, off } = ctx;
  const cap = ctx.cap || 0;
  const capW = maxW && cap ? r5((maxW * cap) / 100) : 0;
  let main = '';
  const sub = [];
  if (step.kind === 'rest') {
    return { main: 'PAUSE', sub: step.txt || 'Vollständige Erholung, nicht weitertreten' };
  }
  if (step.w) {
    let lo = Math.max(100, step.w[0] - off);
    let hi = Math.max(lo + 50, step.w[1] - off);
    if (capW) {
      hi = Math.min(hi, capW);
      lo = Math.min(lo, Math.max(100, hi - 50));
      sub.push(`Obergrenze ${cap} % deines Max-Watt`);
    } else if (cap) {
      sub.push(`höchstens ${cap} % deines Max-Watt`);
    }
    main = `${lo}–${hi} W`;
    if (off) sub.push(`Anfänger-Modus: −${off} W`);
  } else if (step.maxEffort) {
    if (maxW && step.within) {
      const top = capW || maxW;
      main = `${r5(top * (1 - step.within / 100))}–${top} W`;
      sub.push(`Maximal, höchstens ${step.within} % unter deinem Bestwert (${top} W)`);
    } else if (capW) {
      main = `bis ${capW} W`;
      sub.push(`Obergrenze ${cap} % deines Max-Watt`);
    } else {
      main = 'MAXIMAL';
      sub.push(maxW ? `Bestwert ca. ${maxW} W` : cap ? `höchstens ${cap} % deines Max-Watt` : 'Alles geben');
      if (step.within) sub.push(`höchstens ${step.within} % unter deinem Bestwert`);
    }
  } else if (step.pct !== undefined) {
    const raw = Array.isArray(step.pct) ? step.pct : [step.pct, step.pct];
    const arr = cap ? raw.map((v) => Math.min(v, cap)) : raw;
    const lbl = arr[0] === arr[1] ? `${arr[0]} %` : `${arr[0]}–${arr[1]} %`;
    if (maxW) {
      const top = r5((maxW * arr[1]) / 100);
      const low = r5((maxW * arr[0]) / 100);
      if (step.hold) {
        const floor = r5(((maxW * arr[0]) / 100) * (1 - step.hold / 100));
        main = `${floor}–${top} W`;
        sub.push(
          raw[0] === 100 && !cap
            ? `Maximal starten (${maxW} W), nicht unter ${floor} W fallen`
            : `${lbl} von deinem Max-Watt starten, nicht unter ${floor} W fallen`,
        );
      } else {
        main = low === top ? `${low} W` : `${low}–${top} W`;
        sub.push(`${lbl} von deinem Max-Watt`);
      }
    } else {
      main = `${lbl} Max-Watt`;
      sub.push('Max-Watt in den Einstellungen eintragen, dann siehst du Watt-Zahlen');
      if (step.hold) sub.push(`höchstens ${step.hold} % Leistungsabfall`);
    }
  } else if (step.rpe) {
    main = `Belastung ${step.rpe}`;
  } else {
    main = 'ARBEIT';
  }
  if (step.rpe && (step.w || step.maxEffort || step.pct !== undefined)) sub.push(`Belastung ${step.rpe} von 10`);
  if (step.txt) sub.push(step.txt);
  return { main, sub: sub.join(' · ') };
}

export function flatten(session, ctx) {
  const blocks = session.blocks;
  const segs = [];
  blocks.forEach((b) => {
    for (let i = 1; i <= b.repeat; i++) {
      const steps = typeof b.steps === 'function' ? b.steps(i) : b.steps;
      steps.forEach((st) => {
        segs.push({
          kind: st.kind,
          label: st.label,
          secs: st.secs,
          block: b.title,
          rep: i,
          reps: b.repeat,
          target: resolveTarget(st, ctx),
        });
      });
    }
    if (b.trimLast && segs.length && segs[segs.length - 1].kind === 'rest') segs.pop();
  });
  while (segs.length && segs[segs.length - 1].kind === 'rest') segs.pop();
  return segs;
}

const describeSteps = (steps) =>
  steps.map((st) => `${fmtSecs(st.secs)} ${st.kind === 'rest' ? 'Pause' : st.label.replace(/^\d+(?:-s-| s )/, '')}`).join(' · ');

function scaleBlock(b, p) {
  if (!b.main) return b;
  const repeat = Math.max(1, Math.round(b.repeat * p.volume));
  if (b.fight) return fightHiit({ ...b.fight, reps: repeat, roundSecs: p.roundSecs });
  const orig = b.steps;
  const probe = typeof orig === 'function' ? orig(1) : orig;
  const capped = probe.some((st) => st.kind === 'work' && (st.hold !== undefined || st.maxEffort) && st.secs > p.maxSprintSecs);
  if (repeat === b.repeat && !capped) return b;
  const capSteps = (steps) =>
    steps.map((st) => (st.kind === 'work' && (st.hold !== undefined || st.maxEffort) && st.secs > p.maxSprintSecs ? { ...st, secs: p.maxSprintSecs } : st));
  const steps =
    typeof orig === 'function'
      ? (i) => capSteps(orig(Math.min(b.repeat, Math.max(1, Math.round((i * b.repeat) / repeat)))))
      : capSteps(orig);
  const first = typeof steps === 'function' ? steps(1) : steps;
  const title = capped ? b.title.replace(/(\d+)(-s| s)\b/g, (m, n, u) => (Number(n) > p.maxSprintSecs ? `${p.maxSprintSecs}${u}` : m)) : b.title;
  return { ...b, title, repeat, steps, desc: `${repeat}× (${describeSteps(first)})` };
}

export function sessionBlocks(session, recoveryKey, profile) {
  if (session.type === 'recovery') return RECOVERY_OPTIONS[recoveryKey || 'opt1'].blocks;
  if (!profile || profile.blocked) return session.blocks;
  return session.blocks.map((b) => scaleBlock(b, profile));
}

export function totalSecs(segs) {
  return segs.reduce((a, s) => a + s.secs, 0);
}
