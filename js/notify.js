// In-app reminders. A static site has no push server, so these fire while the app is open or
// recently backgrounded. Reminders that must arrive with the app closed come from Google Calendar
// (events made here are written to Google with reminders when you're connected).
import { S, save, today, addDays, at, live, hm } from "./store.js";
import { eventsOn, tasksDue, projectsActive, overdue, topToday } from "./data.js";

export const supported = () => "Notification" in window;
export const permission = () => (supported() ? Notification.permission : "unsupported");

export async function requestPermission() {
  if (!supported()) return "unsupported";
  const p = await Notification.requestPermission();
  return p;
}

export async function notify(title, body, { tag, url = "./#today" } = {}) {
  if (permission() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url } });
    else new Notification(title, { body, tag, icon: "icons/icon-192.png" });
    return true;
  } catch (e) { console.warn(e); return false; }
}

const WINDOW = 2 * 3600e3; // fire a missed reminder only if it's at most 2h late

function due(key, when, now) {
  if (S.fired[key]) return false;
  const t = when.getTime();
  return now >= t && now - t < WINDOW;
}
function mark(key) { S.fired[key] = Date.now(); }

export async function tick() {
  if (!S.settings.notify || permission() !== "granted") return;
  const now = Date.now(), d = today(), tomorrow = addDays(d, 1);
  const jobs = [];

  // events today & tomorrow
  for (const date of [d, tomorrow]) {
    for (const e of eventsOn(date)) {
      const start = at(date, e.allDay ? S.settings.morningTime : e.start);
      const def = e.allDay ? 0 : S.settings.leadMin;
      const leads = new Set(Array.isArray(e.remind) ? (e.remind.length ? e.remind : [def]) : [e.remind ?? def]);
      if (e.important) leads.add(24 * 60);
      for (const lead of leads) {
        if (lead == null) continue;
        const when = new Date(start.getTime() - lead * 60e3);
        const key = `ev:${e.id}:${date}:${lead}`;
        if (due(key, when, now) && now < start.getTime() + (e.allDay ? 12 * 3600e3 : 0)) {
          const whenTxt = e.allDay ? (date === d ? "Today" : "Tomorrow") : (lead >= 1440 ? `Tomorrow ${e.start}` : lead ? `in ${lead >= 60 ? Math.round(lead / 60) + "h" : lead + " min"} · ${e.start}` : `now · ${e.start}`);
          jobs.push([key, (e.important ? "★ " : "") + e.title, whenTxt + (e.location ? ` · ${e.location}` : ""), "./#calendar"]);
        }
      }
    }
  }
  // timed tasks
  for (const t of tasksDue(d)) {
    if (t.done || !t.time) continue;
    const key = `task:${t.id}:${t.due}:${t.time}`;
    if (due(key, new Date(at(d, t.time).getTime() - 10 * 60e3), now)) jobs.push([key, t.title, `Task due at ${t.time}`, "./#tasks"]);
  }
  // morning brief
  const mKey = `morning:${d}`;
  if (due(mKey, at(d, S.settings.morningTime), now)) {
    const ev = eventsOn(d).length, tk = tasksDue(d).filter(t => !t.done).length, od = overdue().length;
    const parts = [`${ev} event${ev === 1 ? "" : "s"}`, `${tk} task${tk === 1 ? "" : "s"} due`];
    if (od) parts.push(`${od} overdue`);
    jobs.push([mKey, "Good morning", parts.join(" · ") + (topToday().length ? "" : " — pick your top 3."), "./#today"]);
  }
  // project deadlines: 2 days before and on the day
  for (const p of projectsActive()) {
    if (!p.deadline) continue;
    for (const [off, label] of [[-2, "due in 2 days"], [0, "due today"]]) {
      const key = `proj:${p.id}:${p.deadline}:${off}`;
      if (due(key, at(addDays(p.deadline, off), S.settings.morningTime), now)) jobs.push([key, p.name, `Project ${label}${p.client ? " · " + p.client : ""}`, "./#tasks/projects"]);
    }
  }
  // evening check-in
  const cKey = `checkin:${d}`;
  if (!S.checkins[d]?.done && due(cKey, at(d, S.settings.checkinTime), now)) jobs.push([cKey, "How was your day?", "Two minutes of questions, then your feedback.", "./#today/checkin"]);

  for (const [key, title, body, url] of jobs) { mark(key); await notify(title, body, { tag: key, url }); }
  if (jobs.length) {
    // forget fired keys older than 4 days
    for (const [k, v] of Object.entries(S.fired)) if (now - v > 4 * 864e5) delete S.fired[k];
    save({ silent: true });
  }
  updateBadge();
}

export function updateBadge() {
  if (!("setAppBadge" in navigator)) return;
  const n = tasksDue(today()).filter(t => !t.done).length + overdue().length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

export function start() {
  tick();
  setInterval(tick, 30e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}
