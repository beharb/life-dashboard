// Derived queries shared by views, notifications and feedback.
import { S, live, today, parseYmd, diffDays, ymd, habitDone, at } from "./store.js";

function occursOn(e, date) {
  if (date >= e.date && date <= (e.endDate || e.date)) return true;
  if (!e.repeat || e.repeat === "none" || date < e.date) return false;
  const a = parseYmd(e.date), b = parseYmd(date);
  if (e.repeat === "yearly") return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (e.repeat === "monthly") return a.getDate() === b.getDate();
  if (e.repeat === "weekly") return diffDays(e.date, date) % 7 === 0;
  if (e.repeat === "daily") return true;
  return false;
}

/* Local events plus Google events. A local event already pushed to Google is shown once (the Google copy). */
export function eventsOn(date) {
  const g = S.gcache.events;
  const gIds = new Set(g.flatMap(e => [e.gid, e.rid]).filter(Boolean));
  const local = live("events").filter(e => !(e.gid && gIds.has(e.gid)) && occursOn(e, date)).map(e => ({ ...e, local: true }));
  const localByGid = new Map(live("events").filter(e => e.gid).map(e => [e.gid, e]));
  const remote = g.filter(e => date >= e.date && date <= (e.endDate || e.date)).map(e => {
    const l = localByGid.get(e.gid) || localByGid.get(e.rid);
    return l ? { ...e, localId: l.id, important: l.important } : e;
  });
  return [...local, ...remote].sort((a, b) => (a.allDay === b.allDay ? (a.start || "").localeCompare(b.start || "") : a.allDay ? -1 : 1));
}

export function upcomingImportant(days = 60) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = ymd(new Date(Date.now() + i * 864e5));
    eventsOn(d).filter(e => e.important).forEach(e => out.push({ ...e, on: d }));
  }
  return out;
}

export const tasksDue = date => live("tasks").filter(t => t.due === date);
export const overdue = () => live("tasks").filter(t => !t.done && t.due && t.due < today());
export const doneOn = date => live("tasks").filter(t => t.done && ymd(new Date(t.done)) === date);
export const createdOn = date => live("tasks").filter(t => t.c && ymd(new Date(t.c)) === date);
export const focusOn = date => live("focus").filter(f => f.date === date).reduce((s, f) => s + (f.min || 0), 0);
export const habitsFor = date => live("habits").filter(h => !h.days || h.days.length === 0 || h.days.includes(parseYmd(date).getDay()));
export function habitRate(date) {
  const hs = habitsFor(date); if (!hs.length) return null;
  return hs.filter(h => habitDone(h, date)).length / hs.length;
}
export function habitStreak(h, from = today()) {
  let n = 0, d = parseYmd(from);
  if (!habitDone(h, from)) d.setDate(d.getDate() - 1); // today not ticked yet doesn't break it
  for (let i = 0; i < 400; i++) {
    const k = ymd(d), sched = !h.days || !h.days.length || h.days.includes(d.getDay());
    if (sched) { if (habitDone(h, k)) n++; else break; }
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function checkinStreak() {
  let n = 0, d = parseYmd(today());
  if (!S.checkins[today()]?.done) d.setDate(d.getDate() - 1);
  while (S.checkins[ymd(d)]?.done) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export const topToday = () => (S.checkins[today()]?.top3 || []).map(id => live("tasks").find(t => t.id === id)).filter(Boolean);
export const projectsActive = () => live("projects").filter(p => !p.done).sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
export const STAGES = ["Brief", "Footage", "Rough cut", "Fine cut", "Color & sound", "Review", "Delivered"];
export const eventStart = (e, date) => at(date || e.date, e.allDay ? null : e.start);
