// Entscheidet, wem wann welche Push-Mitteilung zusteht. Reine Funktionen ohne Netz und Datenbank, damit sie sich mit Node testen lassen
// (siehe logik.test.mjs). Gleiche Regeln wie die Erinnerungen der iPhone-App (Trainingszeit, nach 3 und 7 Tagen ohne Öffnen)
// und wie „Aufmerksamkeit nötig“ in der Traineransicht (3 Tage ohne Training).
//
// Grundlage ist der kurze Stand `state.ti`, den die App im gespeicherten Stand ablegt: ti.at (zuletzt aktualisiert, also zuletzt geöffnet),
// ti.last (letzte erledigte Einheit), ti.next ({ title, day }: erste offene Einheit), ti.missed (erster verpasster Planungstag).

const TZ = 'Europe/Berlin';
const TRAIN_WHEN = {
  morgens: { before: true, hour: 19, lead: 'Morgen früh', tip: 'Plane den Termin ein.' },
  mittags: { before: true, hour: 18, lead: 'Morgen Mittag', tip: 'Plane den Termin ein.' },
  abends: { before: false, hour: 8, lead: 'Heute Abend', tip: 'Halte dir den Termin frei.' },
};

const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
// Tag (JJJJ-MM-TT) und Stunde in Deutschland
export function berlin(date) {
  const p = {};
  for (const x of fmt.formatToParts(date)) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const dayNum = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 864e5 : NaN;
};
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const addDay = (s, n) => {
  const t = new Date(dayNum(s) * 864e5 + n * 864e5);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const isoDay = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : berlin(new Date(t)).day;
};

// Zu welcher Stunde erinnert wird und ob am Vorabend
export function reminderSlot(state) {
  const tw = TRAIN_WHEN[state && state.when];
  if (tw) return { hour: tw.hour, before: tw.before, lead: tw.lead, tip: tw.tip, nudgeHour: 8 };
  const hh = Number(String((state && state.time) || '18:00').split(':')[0]);
  const hour = Number.isFinite(hh) && hh >= 0 && hh <= 23 ? hh : 18;
  return { hour, before: false, lead: 'Heute', tip: '', nudgeHour: hour };
}

// Eine Mitteilung für eine Person, die selbst trainiert (oder null). logs: frühere Mitteilungen { kind, ref, sent_at } dieser Person.
export function privateMessage(state, now, logs) {
  const ti = state && state.ti;
  if (!ti || typeof ti !== 'object' || !ti.next || !ti.next.day) return null;
  const nowB = berlin(now);
  if ((logs || []).some((l) => berlin(new Date(l.sent_at)).day === nowB.day)) return null; // höchstens eine Mitteilung pro Tag
  const slot = reminderSlot(state);
  const title = String(ti.next.title || 'Training').slice(0, 60);
  const seen = (kind, ref) => (logs || []).some((l) => l.kind === kind && l.ref === ref);
  const trainedToday = ti.last && isoDay(ti.last) === nowB.day;

  // 1) Erinnerung an die nächste Einheit
  const target = slot.before ? addDay(nowB.day, 1) : nowB.day;
  if (ti.next.day === target && nowB.hour === slot.hour && (slot.before || !trainedToday) && !seen('training', ti.next.day)) {
    const body = slot.lead === 'Heute' ? `Heute: ${title}` : `${slot.lead}: ${title}. ${slot.tip}`;
    return { kind: 'training', ref: ti.next.day, body };
  }
  // 2) Wiedersehen nach 3 und 7 Tagen ohne Öffnen der App (nur mit offener Einheit)
  const openedDay = ti.at ? isoDay(ti.at) : '';
  if (openedDay && nowB.hour === slot.nudgeHour) {
    const gone = daysBetween(openedDay, nowB.day);
    if (gone === 3 && !seen('pause3', ti.at)) return { kind: 'pause3', ref: String(ti.at), body: `Dein nächstes Training wartet: ${title}` };
    if (gone === 7 && !seen('pause7', ti.at)) return { kind: 'pause7', ref: String(ti.at), body: 'Du warst eine Woche nicht da. Eine Einheit hält dich im Plan.' };
  }
  return null;
}

// Wer vom Trainer aus gesehen „Aufmerksamkeit nötig“ hat: ein verpasster Planungstag und seit mindestens 3 Tagen kein Training
export function attention(ti, todayDay) {
  if (!ti || typeof ti !== 'object') return 0;
  const lastDay = ti.last ? isoDay(ti.last) : '';
  const nd = ti.next && ti.next.day ? String(ti.next.day) : '';
  const missed = ti.missed ? String(ti.missed) : nd && nd < todayDay && (!lastDay || nd > lastDay) ? nd : '';
  if (!missed) return 0;
  const days = daysBetween(lastDay || missed, todayDay);
  return days >= 3 ? days : 0;
}

// Eine Mitteilung für einen Trainer (oder null). boxer: [{ id, name, ti }] der eingelösten Plätze.
// Um 9 Uhr, höchstens einmal pro Tag, nur bei neuer Lage oder nach 3 Tagen erneut.
export function trainerMessage(boxer, now, logs) {
  const nowB = berlin(now);
  if (nowB.hour !== 9) return null;
  if ((logs || []).some((l) => berlin(new Date(l.sent_at)).day === nowB.day)) return null;
  const list = (boxer || []).map((b) => ({ ...b, days: attention(b.ti, nowB.day) })).filter((b) => b.days > 0);
  if (!list.length) return null;
  const ref = list.map((b) => b.id).sort().join(',');
  const last = (logs || []).filter((l) => l.kind === 'trainer').sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0];
  if (last && last.ref === ref && daysBetween(berlin(new Date(last.sent_at)).day, nowB.day) < 3) return null;
  const body = list.length === 1 ? `${String(list[0].name || 'Ein Boxer').slice(0, 40)} hat seit ${list[0].days} Tagen nicht trainiert.` : `${list.length} Boxer haben seit mindestens 3 Tagen nicht trainiert.`;
  return { kind: 'trainer', ref, body };
}
