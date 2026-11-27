// Attrappe für cloud.js: kein Netz, kein echtes Konto, keine echten Daten. Nur für Tests der Web-Version (siehe README.md in diesem Ordner).
// Der Test-Server (server.py) liefert diese Datei anstelle der echten /cloud.js. Die Datei gehört nicht zur App und wird nicht ausgeliefert.
//
// Schalter stehen in localStorage 'stub.cfg' (JSON):
//   admin: true        → Konto ist Admin
//   tester: true       → Konto ist Testkonto (gespielter Kauf)
//   abo: true          → „Ohne Werbung“-Abo ist aktiv
//   club: 'trainer'    → Konto ist Trainer eines Vereins „Testverein“ (ohne Paket); probe: 'laeuft' | 'keine' | 'vorbei'
// Zähler zum Prüfen: window.__buyCalls (Testkäufe), window.__gymCreate (Verein angelegt), window.__push (Push-Aufrufe, anmErr: true lässt die Anmeldung scheitern).
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
const TR = () => ({ name:'Testverein', plaetze_gesamt:0, plaetze_erlaubt:3, probe:(cfg().probe||'laeuft'), plaetze:[], trainer:true, ist_trainer:true, rolle:'trainer', verein:true, id:'00000000-0000-0000-0000-000000000001', gym_id:'00000000-0000-0000-0000-000000000001' });
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
export const gymTrainer = () => ok(cfg().club==='trainer' ? TR() : []);
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
