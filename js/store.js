// All data lives in localStorage on each device and is merged through Google Drive (see google.js).
// Every record carries `u` (last-updated ms) so two devices can be merged item by item.
const KEY = "lifedash.v1";
export const COLLS = ["tasks", "notes", "events", "habits", "projects", "focus"];

const defaults = () => ({
  tasks: [], notes: [], events: [], habits: [], projects: [], focus: [],
  checkins: {},
  settings: {
    u: 0, clientId: "", checkinTime: "21:00", morningTime: "08:00",
    focusGoal: 180, leadMin: 30, notify: false, theme: "auto",
    hiddenCals: [], autoConnect: false, waterGoal: 8, sleepGoal: 7.5,
  },
  gcache: { events: [], cals: [], fetched: 0 },
  fired: {},
  lastSync: 0,
  seeded: false,
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) {
      const d = defaults();
      return { ...d, ...s, settings: { ...d.settings, ...s.settings }, gcache: { ...d.gcache, ...s.gcache } };
    }
  } catch (e) { console.warn(e); }
  return defaults();
}

export const S = load();
const subs = new Set();
export const onChange = f => subs.add(f);
let quiet = false;

export function save(opts = {}) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn("save failed", e); }
  if (!quiet && !opts.silent) subs.forEach(f => f(opts));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const live = c => S[c].filter(x => !x.del);
export const byId = (c, id) => S[c].find(x => x.id === id && !x.del);

export function upsert(c, item) {
  item.u = Date.now();
  if (!item.id) { item.id = uid(); item.c = item.u; S[c].push(item); }
  else {
    const i = S[c].findIndex(x => x.id === item.id);
    if (i < 0) S[c].push(item); else S[c][i] = item;
  }
  save();
  return item;
}

export function remove(c, id) {
  const i = S[c].findIndex(x => x.id === id);
  if (i < 0) return;
  // keep a tombstone so the deletion syncs to other devices
  S[c][i] = { id, del: 1, u: Date.now() };
  save();
}

export function setCheckin(date, data) {
  S.checkins[date] = { ...(S.checkins[date] || {}), ...data, u: Date.now() };
  save();
}

export function setSettings(patch) {
  Object.assign(S.settings, patch, { u: Date.now() });
  save();
}

// Habit log values are +ms (checked) or -ms (unchecked), so merges keep the latest tap per day.
export function toggleHabit(h, date) {
  h.log = h.log || {};
  const on = (h.log[date] || 0) > 0;
  h.log[date] = on ? -Date.now() : Date.now();
  h.u = Date.now();
  save();
}
export const habitDone = (h, date) => (h.log?.[date] || 0) > 0;

// ---- sync helpers ----
export function payload() {
  const p = { v: 1, at: Date.now(), checkins: S.checkins, settings: S.settings };
  COLLS.forEach(c => (p[c] = S[c]));
  return p;
}

export function merge(remote) {
  if (!remote || remote.v !== 1) return false;
  let changed = false;
  for (const c of COLLS) {
    const map = new Map(S[c].map(x => [x.id, x]));
    for (const r of remote[c] || []) {
      const l = map.get(r.id);
      if (!l) { map.set(r.id, r); changed = true; continue; }
      if (c === "habits" && !l.del && !r.del) {
        const log = { ...(l.log || {}) };
        for (const [d, v] of Object.entries(r.log || {})) if (Math.abs(v) > Math.abs(log[d] || 0)) { log[d] = v; changed = true; }
        const base = (r.u || 0) > (l.u || 0) ? r : l;
        map.set(r.id, { ...base, log });
        if (base === r) changed = true;
      } else if ((r.u || 0) > (l.u || 0)) { map.set(r.id, r); changed = true; }
    }
    S[c] = [...map.values()];
  }
  for (const [d, r] of Object.entries(remote.checkins || {})) {
    if (!S.checkins[d] || (r.u || 0) > (S.checkins[d].u || 0)) { S.checkins[d] = r; changed = true; }
  }
  if (remote.settings && (remote.settings.u || 0) > (S.settings.u || 0)) {
    S.settings = { ...S.settings, ...remote.settings }; changed = true;
  }
  return changed;
}

export function replaceAll(data) {
  const d = defaults();
  for (const k of Object.keys(d)) if (k in data) S[k] = data[k];
  S.settings = { ...d.settings, ...S.settings, u: Date.now() };
  save();
}

// ---- dates ----
const pad = n => String(n).padStart(2, "0");
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd();
export const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const at = (date, time) => { const d = parseYmd(date); if (time) { const [h, m] = time.split(":").map(Number); d.setHours(h, m, 0, 0); } return d; };
export const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function range(n, end = today()) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out; }
export const fmtDate = (s, o = { weekday: "short", month: "short", day: "numeric" }) => parseYmd(s).toLocaleDateString(undefined, o);
export function relDay(s) {
  const n = diffDays(today(), s);
  if (n === 0) return "Today"; if (n === 1) return "Tomorrow"; if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return parseYmd(s).toLocaleDateString(undefined, { weekday: "long" });
  return fmtDate(s, { month: "short", day: "numeric" });
}
export const fmtMin = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
