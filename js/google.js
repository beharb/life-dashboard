// Google sign-in (OAuth redirect flow, no popups, so it works in an installed iPhone/Android web app),
// Google Calendar read/write, and data sync through a hidden file in Google Drive (appDataFolder).
import { S, save, merge, payload, ymd, addDays, today } from "./store.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.appdata",
].join(" ");
const TOK = "lifedash.token";
const SYNC_FILE = "life-dashboard.json";

export const redirectUri = () => location.origin + location.pathname;

function getTok() { try { const t = JSON.parse(localStorage.getItem(TOK)); if (t && t.exp > Date.now() + 60e3) return t.access; } catch {} return null; }
export const connected = () => !!getTok();
export const everConnected = () => !!localStorage.getItem("lifedash.gever");

export function signIn() {
  const cid = S.settings.clientId;
  if (!cid) throw new Error("Add your Google OAuth Client ID in Settings first.");
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem("lifedash.state", state);
  localStorage.setItem("lifedash.state", state);
  localStorage.setItem("lifedash.return", location.hash || "#today");
  const p = new URLSearchParams({
    client_id: cid, redirect_uri: redirectUri(), response_type: "token", scope: SCOPES,
    include_granted_scopes: "true", state,
  });
  location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
}

// Called once at startup: picks the token out of the URL after Google redirects back.
export function handleRedirect() {
  if (!location.hash.includes("access_token") && !location.hash.includes("error=")) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const back = localStorage.getItem("lifedash.return") || "#today";
  const want = localStorage.getItem("lifedash.state");
  history.replaceState(null, "", location.pathname + back);
  if (p.get("error")) return { error: p.get("error") };
  if (!want || p.get("state") !== want) return { error: "state mismatch" };
  localStorage.setItem(TOK, JSON.stringify({ access: p.get("access_token"), exp: Date.now() + Number(p.get("expires_in") || 3600) * 1000 }));
  localStorage.setItem("lifedash.gever", "1");
  localStorage.removeItem("lifedash.state");
  return { ok: true };
}

export function signOut() {
  const t = getTok();
  if (t) fetch("https://oauth2.googleapis.com/revoke?token=" + t, { method: "POST" }).catch(() => {});
  localStorage.removeItem(TOK); localStorage.removeItem("lifedash.gever");
  S.gcache = { events: [], cals: [], fetched: 0 }; save();
}

async function api(url, opts = {}) {
  const t = getTok();
  if (!t) throw Object.assign(new Error("Not connected to Google"), { code: 401 });
  const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + t, ...(opts.body && typeof opts.body === "string" && !opts.raw ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem(TOK); throw Object.assign(new Error("Google session expired"), { code: 401 }); }
  if (!r.ok) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? null : (r.headers.get("content-type") || "").includes("json") ? r.json() : r.text();
}

const CAL = "https://www.googleapis.com/calendar/v3";

/* ---------- Calendar ---------- */
export async function fetchCalendars() {
  const res = await api(`${CAL}/users/me/calendarList?minAccessRole=reader&maxResults=100`);
  S.gcache.cals = (res.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary, defRem: (c.defaultReminders || []).filter(r => r.method === "popup").map(r => r.minutes) }));
  return S.gcache.cals;
}

export async function fetchEvents() {
  const cals = S.gcache.cals.length ? S.gcache.cals : await fetchCalendars();
  const tMin = new Date(addDays(today(), -100) + "T00:00:00").toISOString();
  const tMax = new Date(addDays(today(), 200) + "T00:00:00").toISOString();
  const out = [];
  await Promise.all(cals.filter(c => !S.settings.hiddenCals.includes(c.id)).map(async c => {
    let pageToken = "";
    for (let guard = 0; guard < 5; guard++) {
      const q = new URLSearchParams({ timeMin: tMin, timeMax: tMax, singleEvents: "true", orderBy: "startTime", maxResults: "500", ...(pageToken ? { pageToken } : {}) });
      const res = await api(`${CAL}/calendars/${encodeURIComponent(c.id)}/events?${q}`);
      for (const e of res.items || []) {
        if (e.status === "cancelled") continue;
        const allDay = !!e.start.date;
        const s = allDay ? new Date(e.start.date + "T00:00:00") : new Date(e.start.dateTime);
        const en = allDay ? new Date(e.end.date + "T00:00:00") : new Date(e.end.dateTime);
        const rem = e.reminders?.useDefault ? c.defRem : (e.reminders?.overrides || []).filter(r => r.method === "popup").map(r => r.minutes);
        out.push({
          id: "g:" + e.id, gid: e.id, calId: c.id, cal: c.name, color: c.color, title: e.summary || "(No title)",
          date: ymd(s), endDate: allDay ? addDays(ymd(en), -1) : ymd(en), start: allDay ? "" : s.toTimeString().slice(0, 5), end: allDay ? "" : en.toTimeString().slice(0, 5),
          allDay, remind: rem, link: e.htmlLink, location: e.location || "", note: e.description || "", rid: e.recurringEventId || "",
        });
      }
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
  }));
  S.gcache.events = out;
  S.gcache.fetched = Date.now();
  save({ silent: false, from: "gcal" });
  return out;
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
function toGoogle(ev) {
  const body = { summary: ev.title, description: ev.note || "", location: ev.location || "" };
  if (ev.allDay || !ev.start) {
    body.start = { date: ev.date }; body.end = { date: addDays(ev.endDate || ev.date, 1) };
  } else {
    const end = ev.end || addHour(ev.start);
    body.start = { dateTime: `${ev.date}T${ev.start}:00`, timeZone: tz() };
    body.end = { dateTime: `${ev.endDate && ev.endDate !== ev.date ? ev.endDate : ev.date}T${end}:00`, timeZone: tz() };
  }
  const mins = [ev.remind ?? S.settings.leadMin];
  if (ev.important) mins.push(ev.allDay ? 15 * 60 : 24 * 60); // day-before alert for important dates
  body.reminders = { useDefault: false, overrides: [...new Set(mins.filter(m => m != null && m >= 0))].map(minutes => ({ method: "popup", minutes })) };
  if (ev.repeat && ev.repeat !== "none") body.recurrence = [`RRULE:FREQ=${ev.repeat.toUpperCase()}`];
  return body;
}
const addHour = t => { const [h, m] = t.split(":").map(Number); return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };

export async function pushEvent(ev) {
  if (ev.gid) return api(`${CAL}/calendars/primary/events/${encodeURIComponent(ev.gid)}`, { method: "PATCH", body: JSON.stringify(toGoogle(ev)) });
  const r = await api(`${CAL}/calendars/primary/events`, { method: "POST", body: JSON.stringify(toGoogle(ev)) });
  return r;
}
export async function deleteEvent(gid, calId = "primary") {
  return api(`${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(gid)}`, { method: "DELETE" });
}

/* ---------- Drive sync ---------- */
let fileId = localStorage.getItem("lifedash.fileId");
async function findFile() {
  const q = new URLSearchParams({ spaces: "appDataFolder", q: `name='${SYNC_FILE}'`, fields: "files(id,modifiedTime)" });
  const r = await api("https://www.googleapis.com/drive/v3/files?" + q);
  fileId = r.files?.[0]?.id || null;
  if (fileId) localStorage.setItem("lifedash.fileId", fileId);
  return fileId;
}

let syncing = null;
export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!fileId) await findFile();
    let changed = false;
    if (fileId) {
      try {
        const remote = await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        changed = merge(typeof remote === "string" ? JSON.parse(remote) : remote);
      } catch (e) {
        if (String(e.message).includes("404")) { fileId = null; localStorage.removeItem("lifedash.fileId"); } else throw e;
      }
    }
    const body = JSON.stringify(payload());
    if (fileId) {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: "PATCH", body, raw: true, headers: { "Content-Type": "application/json" } });
    } else {
      const boundary = "ld" + Date.now();
      const multi = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: SYNC_FILE, parents: ["appDataFolder"] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const r = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", body: multi, raw: true, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } });
      fileId = r.id; localStorage.setItem("lifedash.fileId", fileId);
    }
    S.lastSync = Date.now();
    save({ silent: !changed, from: "sync" });
    return changed;
  })().finally(() => { syncing = null; });
  return syncing;
}
