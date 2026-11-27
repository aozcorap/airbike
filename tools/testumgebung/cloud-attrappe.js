// Attrappe für cloud.js: kein Netz, kein echtes Konto, keine echten Daten. Nur für Tests der Web-Version (siehe README.md in diesem Ordner).
// Der Test-Server (server.py) liefert diese Datei anstelle der echten /cloud.js. Die Datei gehört nicht zur App und wird nicht ausgeliefert.
//
// Schalter stehen in localStorage 'stub.cfg' (JSON):
//   admin: true        → Konto ist Admin
//   tester: true       → Konto ist Testkonto (gespielter Kauf)
//   abo: true          → „Ohne Werbung“-Abo ist aktiv
//   club: 'trainer'    → Konto ist Trainer eines Vereins „Testverein“ (ohne Paket); probe: 'laeuft' | 'keine' | 'vorbei'
// Zähler zum Prüfen: window.__buyCalls (Testkäufe), window.__gymCreate (Verein angelegt), window.__push (Push-Aufrufe, anmErr: true lässt die Anmeldung scheitern).
// Hilfe: boxer: true zeigt drei Beispiel-Boxer in der Trainer-Ansicht (Deine Boxer) und Beispieldaten zum Fortschritt (Profil).
// Hilfe: window.__setze(cfg, state) setzt Schalter und Stand (localStorage 'redline.v1'), räumt eine unterbrochene Einheit weg und lädt neu.
const cfg = () => { try { return JSON.parse(localStorage.getItem('stub.cfg') || '{}'); } catch { return {}; } };
window.__buyCalls = 0; window.__rpc = [];
const ok = (data = null) => Promise.resolve({ data, error: null });
export const INITIAL_HASH = '';
const chain = { select(){return this;}, eq(){return this;}, insert(){return ok();}, update(){return this;}, maybeSingle(){return ok(null);}, single(){return ok(null);}, then(r){return r({data:null,error:null});} };
export const client = { from: () => chain, rpc: () => ok(null), auth: { getSession: () => Promise.resolve({data:{session:null}}), getUser: () => Promise.resolve({data:{user:{id:'stub-user',user_metadata:{birth_year:1990}}}}) } };
export const redirectUrl = () => location.origin + location.pathname;
export const hasStoredSession = () => true;
const user = { id: 'stub-user', email: 'stub@example.invalid', user_metadata: { birth_year: 1990 }, created_at: '2020-01-01T00:00:00Z' };
export const currentUser = async () => user;
export const signOut = async () => {};
export const sendCode = async () => ({ error: null });
export const verifyCode = async () => ({ data: null, error: { message: 'stub' } });
export const signInPassword = async () => ({ data: null, error: { message: 'stub' } });
export const onAuth = () => ({ data: { subscription: { unsubscribe(){} } } });
export const isAdmin = async () => !!cfg().admin;
export const isTestAccount = async () => !!cfg().tester;
export const adminOverview = () => ok([]);
export const adminDeleteUser = () => ok();
// Beispiel-Boxer (fiktiv) nur mit Schalter boxer: true, für Screenshots der Trainer-Ansicht
const BEISPIEL = [{ name:'Max Muster', code:'MAX-7K2Q', belegt:true }, { name:'Lena Beispiel', code:'LENA-4PXR', belegt:false }, { name:'Jonas Probe', code:'JONAS-9TMW', belegt:true }];
const TR = () => ({ name:'Testverein', plaetze_gesamt:(cfg().boxer?3:0), plaetze_erlaubt:3, probe:(cfg().probe||'laeuft'), plaetze:(cfg().boxer?BEISPIEL:[]), trainer:true, ist_trainer:true, rolle:'trainer', verein:true, id:'00000000-0000-0000-0000-000000000001', gym_id:'00000000-0000-0000-0000-000000000001' });
window.__gymCreate = 0;
export const gymLoad = () => ok(cfg().club==='trainer' ? TR() : null);
export const gymCreate = () => { window.__gymCreate++; return ok(); };
export const gymAddSeat = () => ok();
export const gymDeleteSeat = () => ok();
export const gymRedeem = () => ok();
export const adminClubs = () => ok([]);
export const adminClubOverview = () => ok();
export const aboStatus = () => ok(cfg().abo ? { aktiv: true, art: 'jahr', bis: '2027-11-27T00:00:00Z' } : { aktiv: false });
export const aboTestBuy = (art) => { window.__buyCalls++; return ok(); };
export const aboTestEnd = () => ok();
export const gymLeave = () => ok();
export const gymAccess = () => ok(cfg().club==='trainer' ? { trainer:true, ist_trainer:true, name:'Testverein', plaetze_gesamt:0, probe:(cfg().probe||'laeuft') } : null);
export const gymTestWeek = () => ok();
export const gymTestWeekSet = () => ok();
export const gymTestPackage = () => ok();
// Trainer-Ansicht mit Beispieldaten (fiktiv), nur mit Schalter boxer: true. Zeiten sind relativ zu heute (Berlin), damit die Ampeln stimmen.
const TRAINER_DATEN = () => {
  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const vor = (tage, h = 17) => new Date(Date.parse(heute + 'T00:00:00Z') - tage * 864e5 + h * 36e5).toISOString();
  const lauf = (tage, t, plan, act, x = {}) => ({ s: vor(tage), t, plan, act, fin: true, skip: 0, pz: 0, pzs: 0, bg: 0, bgs: 0, res: 0, sv: vor(tage, 18), ...x });
  return {
    verein: 'Testverein', heute, plaetze: 3,
    boxer: [
      { platz: 'p1', name: 'Max Muster', belegt: true, test_watt: 940, test_datum: vor(14), zuletzt_gespeichert: vor(0, 9), letzte_anmeldung: vor(0, 9), erledigt: {},
        ti: { week: 3, phase: 'Tempo aufbauen', done: 7, total: 27, at: vor(0, 9), last: vor(1), next: { title: 'Sprints · Tempo-Ausdauer', day: heute }, today: { id: 'w3s2', title: 'Sprints · Tempo-Ausdauer', secs: 780 } },
        runs: {
          w3s2: lauf(0, 'Sprints · Tempo-Ausdauer', 780, 780),
          w3s1: lauf(1, 'Aktive Erholung', 3480, 3480),
          w2s3: lauf(4, 'Sprints · Tempo-Ausdauer', 780, 780),
          w2s2: lauf(6, 'Aktive Erholung', 3480, 3420, { skip: 1 }),
          w2s1: lauf(8, 'Stufen-Intervalle', 960, 960),
        } },
      { platz: 'p3', name: 'Jonas Probe', belegt: true, test_watt: 860, test_datum: vor(20), zuletzt_gespeichert: vor(5, 19), letzte_anmeldung: vor(5, 19), erledigt: {},
        ti: { week: 2, phase: 'Tempo aufbauen', done: 3, total: 27, at: vor(5, 19), last: vor(5), next: { title: 'Aktive Erholung', day: vor(4).slice(0, 10) }, missed: vor(4).slice(0, 10), today: null },
        runs: {
          w2s1: lauf(5, 'Stufen-Intervalle', 960, 720, { fin: false }),
          w1s3: lauf(8, 'Sprints · Tempo-Ausdauer', 780, 780, { pz: 1, pzs: 45 }),
          w1s2: lauf(10, 'Aktive Erholung', 3480, 3480),
        } },
    ],
  };
};
export const gymTrainer = () => ok(cfg().club==='trainer' ? (cfg().boxer ? TRAINER_DATEN() : TR()) : []);
export const pullState = async () => ({ state: {}, updated_at: 'v1' });
export const ensureStateRow = async () => {};
export const pushStateIf = async () => ({ ok: true, updated_at: 'v' + Date.now() });
export const deleteAccount = async () => {};
export const sendFeedback = async () => ({ error: null, data: {} });
window.__push = { key: 0, anm: 0, abm: 0, anmArgs: null, abmArgs: null, anmErr: false };
export const pushKey = async () => { window.__push.key++; return { data: { key: 'BDZOGoJAedFNhPNl51kU0_THBBy3x-dpajYqXY5ch7IrWFRMWwS5QoAwwOJHwTAf9YZ9ETrUR8Eua7lE7-8PoDk' }, error: null }; };
export const pushAnmelden = async (...a) => { window.__push.anm++; window.__push.anmArgs = JSON.parse(JSON.stringify(a)); return window.__push.anmErr ? { data: null, error: { message: 'x' } } : { data: null, error: null }; };
export const pushAbmelden = async (...a) => { window.__push.abm++; window.__push.abmArgs = JSON.parse(JSON.stringify(a)); return { data: null, error: null }; };

window.__setze = (cfg, state) => {
  localStorage.setItem('stub.cfg', JSON.stringify(cfg || {}));
  localStorage.setItem('redline.v1', JSON.stringify(state || { onboarded: true }));
  localStorage.removeItem('redline.run');
  location.hash = '#/';
  location.reload();
};
