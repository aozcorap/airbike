// Plan-Logik: baut aus dem 10-Wochen-Grundplan einen persönlichen Plan nach Kampftermin und Trainingshäufigkeit.
//
// ACHTUNG: Die Regeln in diesem Modul (Kürzung auf weniger als 10 Wochen, Auswahl der Sessions bei 1× oder 2× pro Woche)
// sind Annahmen und NICHT wissenschaftlich belegt oder von einem Fachtrainer geprüft. Der Grundplan hat 10 Wochen mit je 3 Sessions.
import { WEEKS } from './data.js';

export const DAY = 86400000;
export const MAX_WEEKS = WEEKS.length; // 10
export const FIGHT_GAP_DAYS = 2; // Annahme: letzte harte Session spätestens 2 Tage vor dem Kampf

// Annahme: Bei weniger als 10 Wochen fallen zuerst die Grundlagenwochen (Woche 1–2) weg.
// Die Abschlusswochen 9 und 10 bleiben immer erhalten. Schlüssel = Anzahl der Vorbereitungswochen davor.
export const LEAD_WEEKS = {
  0: [],
  1: [5],
  2: [4, 8],
  3: [3, 5, 8],
  4: [3, 5, 6, 8],
  5: [2, 4, 5, 7, 8],
  6: [2, 3, 4, 5, 7, 8],
  7: [1, 2, 3, 5, 6, 7, 8],
  8: [1, 2, 3, 4, 5, 6, 7, 8],
};

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseDay(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const back = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return back === str ? d : null; // 2026-02-31 ist ungültig
}

export function mondayOf(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Welche Wochen des Grundplans kommen vor, wenn bis zum Kampf `avail` Kalenderwochen bleiben (inkl. aktueller und Kampfwoche)?
export function templateWeeksFor(avail) {
  if (avail >= MAX_WEEKS) return Array.from({ length: MAX_WEEKS }, (_, i) => i + 1);
  if (avail <= 1) return [10];
  if (avail === 2) return [9, 10];
  return [...LEAD_WEEKS[avail - 2], 9, 10];
}

const signature = (s) => `${s.title}|${(s.blocks || []).filter((b) => b.main).map((b) => b.desc || b.title).join('~')}`;

// Annahme: Bei 1× oder 2× pro Woche zuerst verschiedenartige Sessions behalten, Wiederholungen derselben Session fallen zuerst weg,
// danach gilt die Reihenfolge des Grundplans.
export function pickSessions(week, freq) {
  const f = Math.max(1, Math.min(3, Number(freq) || 3));
  const all = week.sessions;
  if (all.length <= f) return all;
  const seen = new Set();
  const unique = [];
  const repeats = [];
  all.forEach((s) => {
    const k = signature(s);
    if (seen.has(k)) repeats.push(s);
    else {
      seen.add(k);
      unique.push(s);
    }
  });
  const chosen = [...unique, ...repeats].slice(0, f);
  return all.filter((s) => chosen.includes(s));
}

export function sessionDate(week, dayNo) {
  return week.monday ? addDays(week.monday, Number(dayNo) - 1) : null;
}

export function tooCloseToFight(date, fight) {
  return Boolean(date && fight && date > addDays(fight, -FIGHT_GAP_DAYS));
}

export function buildPlan({ today, fightDate, startDate, freq }) {
  const t0 = startOfDay(today);
  const f = Number(freq) || 3;
  let tplNums = templateWeeksFor(MAX_WEEKS);
  let mondayFor = () => null;
  let mode = 'none';
  let fight = null;
  let avail = 0;

  if (fightDate) {
    fight = parseDay(fightDate);
    if (!fight) return { status: 'invalid', mode, weeks: [], fight: null, avail: 0, compressed: false, startsIn: 0 };
    if (fight < t0) return { status: 'past', mode, weeks: [], fight, avail: 0, compressed: false, startsIn: 0 };
    const fightMon = mondayOf(fight);
    // Annahme: Ab Freitag zählt die laufende Woche nicht mehr, der Plan beginnt am nächsten Montag (außer der Kampf liegt noch in dieser Woche).
    const thisMon = mondayOf(t0);
    const startMon = (t0.getDay() + 6) % 7 >= 4 ? addDays(thisMon, 7) : thisMon;
    avail = Math.max(1, Math.round((fightMon - startMon) / (7 * DAY)) + 1);
    tplNums = templateWeeksFor(avail);
    mode = 'fight';
    mondayFor = (i) => addDays(fightMon, (i - (tplNums.length - 1)) * 7);
  } else if (parseDay(startDate)) {
    const mon = mondayOf(parseDay(startDate));
    mode = 'start';
    mondayFor = (i) => addDays(mon, i * 7);
  }

  const weeks = tplNums.map((tn, i) => {
    const tw = WEEKS[tn - 1];
    return { ...tw, n: i + 1, tpl: tn, monday: mondayFor(i), sessions: pickSessions(tw, f) };
  });
  return {
    status: 'ok',
    mode,
    weeks,
    fight,
    avail,
    compressed: tplNums.length < MAX_WEEKS,
    startsIn: avail > MAX_WEEKS ? avail - MAX_WEEKS : 0,
  };
}
