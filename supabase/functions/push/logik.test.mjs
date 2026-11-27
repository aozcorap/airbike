// Prüft die Regeln für Push-Mitteilungen. Aufruf: node supabase/functions/push/logik.test.mjs
import assert from 'node:assert/strict';
import { berlin, privateMessage, trainerMessage, attention, reminderSlot, daysBetween } from './logik.js';

// 2026-11-30 (Montag) 18:10 Uhr in Deutschland (Winterzeit, UTC+1) = 17:10 UTC
const at = (day, hour, min = 10) => new Date(`${day}T${String(hour - 1).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`);
const T = (n, x) => assert.equal(JSON.stringify(n), JSON.stringify(x));
let ok = 0;
const t = (name, fn) => {
  fn();
  ok += 1;
  console.log('ok', name);
};

t('berlin: Tag und Stunde', () => {
  T(berlin(at('2026-11-30', 18)), { day: '2026-11-30', hour: 18 });
  T(berlin(new Date('2026-11-30T23:30:00Z')), { day: '2026-12-01', hour: 0 });
  T(berlin(new Date('2026-07-01T10:00:00Z')), { day: '2026-07-01', hour: 12 }); // Sommerzeit
});
t('daysBetween', () => assert.equal(daysBetween('2026-11-27', '2026-11-30'), 3));

const ti = (o = {}) => ({ at: '2026-11-30T10:00:00Z', last: '2026-11-27T17:00:00Z', next: { title: 'Sprints', day: '2026-11-30' }, missed: null, ...o });

t('Trainingstag, Standard (Uhrzeit 18:00): um 18 Uhr', () => {
  const m = privateMessage({ time: '18:00', ti: ti() }, at('2026-11-30', 18), []);
  assert.equal(m.kind, 'training');
  assert.equal(m.body, 'Heute: Sprints');
});
t('zur falschen Stunde nichts', () => assert.equal(privateMessage({ time: '18:00', ti: ti() }, at('2026-11-30', 17), []), null));
t('schon heute trainiert: keine Erinnerung', () => {
  const s = { time: '18:00', ti: ti({ last: '2026-11-30T08:00:00Z' }) };
  assert.equal(privateMessage(s, at('2026-11-30', 18), []), null);
});
t('abends trainiert: 8 Uhr am Trainingstag', () => {
  const m = privateMessage({ when: 'abends', ti: ti() }, at('2026-11-30', 8), []);
  assert.equal(m.body, 'Heute Abend: Sprints. Halte dir den Termin frei.');
});
t('morgens trainiert: Vorabend 19 Uhr', () => {
  const m = privateMessage({ when: 'morgens', ti: ti({ next: { title: 'Sprints', day: '2026-12-01' } }) }, at('2026-11-30', 19), []);
  assert.equal(m.body, 'Morgen früh: Sprints. Plane den Termin ein.');
});
t('nicht zweimal für denselben Tag', () => {
  const logs = [{ kind: 'training', ref: '2026-11-30', sent_at: '2026-11-29T12:00:00Z' }];
  assert.equal(privateMessage({ time: '18:00', ti: ti() }, at('2026-11-30', 18), logs), null);
});
t('höchstens eine Mitteilung pro Tag', () => {
  const logs = [{ kind: 'pause3', ref: 'x', sent_at: '2026-11-30T07:00:00Z' }];
  assert.equal(privateMessage({ time: '18:00', ti: ti() }, at('2026-11-30', 18), logs), null);
});
t('Pause 3 Tage: nächster Morgen-Zeitpunkt (Uhrzeit-Stunde)', () => {
  // zuletzt geöffnet 27.11., heute 30.11., nächste Einheit erst später (kein Trainingstag heute)
  const s = { time: '18:00', ti: ti({ at: '2026-11-27T10:00:00Z', next: { title: 'Sprints', day: '2026-12-02' } }) };
  const m = privateMessage(s, at('2026-11-30', 18), []);
  assert.equal(m.kind, 'pause3');
  assert.equal(m.body, 'Dein nächstes Training wartet: Sprints');
});
t('Pause 7 Tage', () => {
  const s = { when: 'abends', ti: ti({ at: '2026-11-23T10:00:00Z', next: { title: 'Sprints', day: '2026-12-05' } }) };
  const m = privateMessage(s, at('2026-11-30', 8), []);
  assert.equal(m.kind, 'pause7');
});
t('Pause nicht zweimal für denselben Stand', () => {
  const s = { time: '18:00', ti: ti({ at: '2026-11-27T10:00:00Z', next: { title: 'Sprints', day: '2026-12-02' } }) };
  const logs = [{ kind: 'pause3', ref: '2026-11-27T10:00:00Z', sent_at: '2026-11-29T12:00:00Z' }];
  assert.equal(privateMessage(s, at('2026-11-30', 18), logs), null);
});
t('ohne ti oder ohne offene Einheit nichts', () => {
  assert.equal(privateMessage({}, at('2026-11-30', 18), []), null);
  assert.equal(privateMessage({ ti: { at: 'x' } }, at('2026-11-30', 18), []), null);
});
t('reminderSlot: Rückfall bei kaputter Uhrzeit', () => assert.equal(reminderSlot({ time: 'abc' }).hour, 18));

t('attention: 3 Tage ohne Training', () => {
  assert.equal(attention({ last: '2026-11-26T10:00:00Z', missed: '2026-11-27' }, '2026-11-30'), 4);
  assert.equal(attention({ last: '2026-11-29T10:00:00Z', missed: '2026-11-30' }, '2026-11-30'), 0);
  assert.equal(attention({ last: '', next: { day: '2026-11-25', title: 'x' } }, '2026-11-30'), 5);
  assert.equal(attention(null, '2026-11-30'), 0);
});
t('Trainer: einer, um 9 Uhr', () => {
  const b = [{ id: 'a', name: 'Lena', ti: { last: '2026-11-26T10:00:00Z', missed: '2026-11-27' } }, { id: 'b', name: 'Tom', ti: { last: '2026-11-30T05:00:00Z' } }];
  const m = trainerMessage(b, at('2026-11-30', 9), []);
  assert.equal(m.body, 'Lena hat seit 4 Tagen nicht trainiert.');
  assert.equal(trainerMessage(b, at('2026-11-30', 10), []), null);
});
t('Trainer: mehrere', () => {
  const x = { last: '2026-11-20T10:00:00Z', missed: '2026-11-22' };
  const m = trainerMessage([{ id: 'a', name: 'A', ti: x }, { id: 'b', name: 'B', ti: x }], at('2026-11-30', 9), []);
  assert.equal(m.body, '2 Boxer haben seit mindestens 3 Tagen nicht trainiert.');
});
t('Trainer: gleiche Lage nicht vor 3 Tagen erneut, danach schon', () => {
  const b = [{ id: 'a', name: 'Lena', ti: { last: '2026-11-20T10:00:00Z', missed: '2026-11-22' } }];
  const logs1 = [{ kind: 'trainer', ref: 'a', sent_at: '2026-11-29T08:00:00Z' }];
  assert.equal(trainerMessage(b, at('2026-11-30', 9), logs1), null);
  const logs2 = [{ kind: 'trainer', ref: 'a', sent_at: '2026-11-26T08:00:00Z' }];
  assert.notEqual(trainerMessage(b, at('2026-11-30', 9), logs2), null);
  const logs3 = [{ kind: 'trainer', ref: 'zzz', sent_at: '2026-11-29T08:00:00Z' }];
  assert.notEqual(trainerMessage(b, at('2026-11-30', 9), logs3), null); // gestern, aber andere Lage: darf wieder
  const logs4 = [{ kind: 'trainer', ref: 'zzz', sent_at: '2026-11-30T07:00:00Z' }];
  assert.equal(trainerMessage(b, at('2026-11-30', 9), logs4), null); // heute schon eine Mitteilung
});
console.log(`${ok} Prüfungen bestanden`);
