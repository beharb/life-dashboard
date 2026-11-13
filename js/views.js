import { S, save, live, byId, upsert, remove, setSettings, toggleHabit, habitDone, today, addDays, parseYmd, ymd, diffDays, range, fmtDate, relDay, fmtMin, setCheckin } from "./store.js";
import { $, $$, esc, act, openSheet, closeSheet, toast, formData, icon } from "./ui.js";
import { eventsOn, upcomingImportant, tasksDue, overdue, doneOn, createdOn, focusOn, habitsFor, habitRate, habitStreak, checkinStreak, topToday, projectsActive, STAGES } from "./data.js";
import { lineChart, barChart, hbar, scatter, heatmap, ring } from "./charts.js";
import { scoreDay } from "./feedback.js";
import { openCheckin, openMorning, showFeedback } from "./checkin.js";
import * as G from "./google.js";
import * as N from "./notify.js";

export const state = { tab: "today", sub: "", calMonth: today().slice(0, 7), calSel: today(), taskFilter: "today", noteQ: "", statRange: 30 };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

/* ================= TODAY ================= */
function taskRow(t, { showDue = true } = {}) {
  const d = today();
  const due = t.due ? `<span class="${!t.done && t.due < d ? "overdue" : ""}">${relDay(t.due)}${t.time ? " " + t.time : ""}</span>` : "";
  const proj = t.projectId && byId("projects", t.projectId);
  return `<div class="item ${t.done ? "done" : ""}">
    <button class="check ${t.done ? "on" : ""}" data-act="toggleTask" data-id="${t.id}" aria-label="Done"></button>
    <div class="grow tap" data-act="editTask" data-id="${t.id}"><div class="t">${esc(t.title)}</div>
      <div class="meta">${showDue ? due : ""}${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ""}${proj ? `<span>${esc(proj.name)}</span>` : ""}</div></div>
    ${t.pri && t.pri < 3 ? `<span class="pri p${t.pri}"></span>` : ""}
  </div>`;
}
function eventRow(e, date) {
  return `<div class="item tap" data-act="openEvent" data-id="${esc(e.id)}" data-date="${date}">
    <div class="time">${e.allDay ? "All day" : e.start}</div><div class="bar-dot" style="background:${e.important ? "var(--bad)" : e.color || "var(--accent)"}"></div>
    <div class="grow"><div class="t">${e.important ? "★ " : ""}${esc(e.title)}</div><div class="meta">${e.end && !e.allDay ? `<span>until ${e.end}</span>` : ""}${e.location ? `<span>${esc(e.location)}</span>` : ""}${e.cal ? `<span>${esc(e.cal)}</span>` : ""}</div></div></div>`;
}

export function renderToday(v) {
  const d = today(), now = new Date(), c = S.checkins[d] || {};
  const evs = eventsOn(d);
  const upcoming = evs.filter(e => e.allDay || e.end >= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` || !e.end);
  const due = tasksDue(d), od = overdue();
  const open = [...od, ...due.filter(t => !t.done)], closed = due.filter(t => t.done);
  const doneToday = doneOn(d).length;
  const top = topToday();
  const hs = habitsFor(d), hDone = hs.filter(h => habitDone(h, d)).length;
  const fm = focusOn(d), goal = S.settings.focusGoal;
  const projs = projectsActive().filter(p => p.deadline && diffDays(d, p.deadline) <= 7).slice(0, 3);
  const evening = now.getHours() >= 17;
  const imp = upcomingImportant(30).filter(e => e.on !== d).slice(0, 3);

  v.innerHTML = `
  <p class="hello">${greeting()} · ${fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}</p>
  ${c.intention ? `<div class="sub" style="margin-bottom:6px">Intention: <b style="color:var(--ink)">${esc(c.intention)}</b></div>` : ""}
  <div class="tiles" style="margin-top:12px">
    <div class="tile"><div class="k">Tasks</div><div class="v">${doneToday}<small> / ${doneToday + open.length - od.length}</small></div><div class="d">${od.length ? `<span class="down">${od.length} overdue</span>` : "done today"}</div></div>
    <div class="tile"><div class="k">Focus</div><div class="v">${fmtMin(fm)}</div><div class="d">goal ${fmtMin(goal)}</div></div>
    <div class="tile"><div class="k">Habits</div><div class="v">${hDone}<small> / ${hs.length}</small></div><div class="d">today</div></div>
    <div class="tile"><div class="k">Check-in streak</div><div class="v">${checkinStreak()}<small> days</small></div><div class="d">${c.score != null ? `today's score ${c.score}` : "keep it going"}</div></div>
  </div>

  ${evening && !c.done ? `<div class="card" style="margin-top:14px"><div class="spread"><div><h3>How was your day?</h3><div class="sub">14 quick questions, then honest feedback.</div></div><button class="btn sm" data-act="ciOpen">Start</button></div></div>` : ""}
  ${c.done ? `<div class="card tap" style="margin-top:14px" data-act="fbOpen" data-d="${d}"><div class="score"><div class="ring" style="width:56px;height:56px">${ring((c.score || 0) / 100, 56, 6)}<div class="n" style="font-size:17px">${c.score ?? "–"}</div></div><div class="grow"><h3>Today's review</h3><div class="sub">Tap to see what went well and what to improve.</div></div></div></div>` : ""}

  <div class="sec"><h2>Top 3</h2><button class="link" data-act="morning">${top.length ? "Edit" : "Plan"}</button></div>
  ${top.length ? `<div class="list">${top.map(t => taskRow(t)).join("")}</div>` : `<div class="card tap" data-act="morning"><h3>Plan your day</h3><div class="sub">Pick the 3 tasks that would make today a win.</div></div>`}

  <div class="sec"><h2>Schedule</h2><button class="link" data-act="go" data-to="calendar">Calendar</button></div>
  ${upcoming.length ? `<div class="list">${upcoming.map(e => eventRow(e, d)).join("")}</div>` : `<div class="empty">Nothing else on the calendar today.</div>`}

  <div class="sec"><h2>Due</h2><button class="link" data-act="go" data-to="tasks">All tasks</button></div>
  <div class="qadd"><input id="qTask" placeholder="Add task… try “Export teaser tomorrow !1 #client”" enterkeyhint="done"></div>
  ${open.length || closed.length ? `<div class="list">${[...open, ...closed].filter(t => !top.includes(t)).map(t => taskRow(t)).join("") || '<div class="empty" style="padding:14px">All in your top 3.</div>'}</div>` : `<div class="empty">Nothing due today.</div>`}

  ${hs.length ? `<div class="sec"><h2>Habits</h2><button class="link" data-act="go" data-to="tasks/habits">Manage</button></div>
  <div class="chips">${hs.map(h => `<button class="hab-chip" data-act="toggleHabit" data-id="${h.id}"><span class="check ${habitDone(h, d) ? "on" : ""}"></span>${esc(h.name)}${habitStreak(h) >= 2 ? ` <span class="muted small">${habitStreak(h)}d</span>` : ""}</button>`).join("")}</div>` : ""}

  <div class="sec"><h2>Focus</h2></div>
  ${timerCard()}

  ${projs.length ? `<div class="sec"><h2>Deadlines this week</h2><button class="link" data-act="go" data-to="tasks/projects">Projects</button></div><div class="list">${projs.map(p => { const l = diffDays(d, p.deadline); return `<div class="item tap" data-act="editProject" data-id="${p.id}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="meta"><span>${STAGES[p.stage || 0]}</span>${p.client ? `<span>${esc(p.client)}</span>` : ""}</div></div><span class="small ${l <= 1 ? "overdue" : "muted"}">${l < 0 ? `${-l}d late` : l === 0 ? "today" : `${l}d`}</span></div>`; }).join("")}</div>` : ""}

  ${imp.length ? `<div class="sec"><h2>Coming up</h2></div><div class="list">${imp.map(e => `<div class="item tap" data-act="openEvent" data-id="${esc(e.id)}" data-date="${e.on}"><div class="grow"><div class="t">★ ${esc(e.title)}</div></div><span class="small muted">${relDay(e.on)}</span></div>`).join("")}</div>` : ""}

  ${!evening && !c.done ? `<div style="margin-top:18px"><button class="btn ghost block" data-act="ciOpen">Do today's check-in early</button></div>` : ""}
  `;
  const q = $("#qTask");
  q.addEventListener("keydown", e => { if (e.key === "Enter" && q.value.trim()) { addParsedTask(q.value, today()); q.value = ""; } });
}

function timerCard() {
  const t = getTimer();
  if (!t) return `<div class="card"><div class="spread"><div><h3>Deep work</h3><div class="sub">Start a timed session. It's logged to your focus stats.</div></div><button class="btn sm" data-act="focus">${icon.play.replace('class="ico"', 'class="ico" style="width:16px;height:16px"')}</button></div></div>`;
  return `<div class="card tap" data-act="focus"><div class="spread"><div><h3>${esc(t.label || "Focus")} · <span id="tCard">${fmtClock(remaining(t))}</span></h3><div class="sub">${t.paused ? "Paused" : "In progress"}. Tap to open.</div></div></div></div>`;
}

/* ---- quick task parsing ---- */
export function parseTask(text, baseDate) {
  let title = " " + text + " ", due = baseDate || "", pri = 3, tag = "", time = "";
  const rm = re => { const m = title.match(re); if (m) title = title.replace(re, " "); return m; };
  let m;
  if ((m = rm(/\s!([123])?(?=\s)/))) pri = Number(m[1] || 1);
  if ((m = rm(/\s#([\w-]+)(?=\s)/))) tag = m[1];
  if ((m = rm(/\s@(\d{1,2})(?::(\d{2}))?(?=\s)/))) time = `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
  if (rm(/\s(today|tod)(?=\s)/i)) due = today();
  else if (rm(/\s(tomorrow|tmr|tmrw)(?=\s)/i)) due = addDays(today(), 1);
  else if ((m = rm(/\s(next week)(?=\s)/i))) due = addDays(today(), 7);
  else if ((m = rm(/\s(?:on\s)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?=\s)/i))) {
    const idx = DOW.findIndex(d => d.toLowerCase() === m[1].toLowerCase().slice(0, 3));
    let diff = (idx - new Date().getDay() + 7) % 7 || 7; due = addDays(today(), diff);
  }
  return { title: title.replace(/\s+/g, " ").trim(), due, pri, tag, time };
}
function addParsedTask(text, base) {
  const p = parseTask(text, base);
  if (!p.title) return;
  upsert("tasks", { ...p, done: 0 });
  toast(`Added${p.due ? " · " + relDay(p.due) : ""}`);
}

/* ================= CALENDAR ================= */
export function renderCalendar(v) {
  const [y, m] = state.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1), startDow = (first.getDay() + 6) % 7; // Monday first
  const startDate = ymd(new Date(y, m - 1, 1 - startDow));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(startDate, i));
  const sel = state.calSel, evs = eventsOn(sel), tks = tasksDue(sel);
  const gOn = G.connected();
  v.innerHTML = `
  <div class="cal-head"><button class="icon-btn" data-act="calNav" data-d="-1">${icon.left}</button>
    <div class="m">${first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
    <div class="row"><button class="pill" data-act="calToday">Today</button><button class="icon-btn" data-act="calNav" data-d="1">${icon.right}</button></div></div>
  <div class="cal">
    ${["M", "T", "W", "T", "F", "S", "S"].map(d => `<div class="dow">${d}</div>`).join("")}
    ${cells.map(d => {
      const e = eventsOn(d), t = tasksDue(d).filter(x => !x.done);
      const dots = [...e.slice(0, 3).map(x => `<i class="${x.important ? "imp" : ""}" style="${x.important ? "" : `background:${x.color || "var(--accent)"}`}"></i>`), t.length ? '<i class="task"></i>' : ""].join("");
      return `<button class="d ${d.slice(0, 7) !== state.calMonth ? "out" : ""} ${d === today() ? "today" : ""} ${d === sel ? "sel" : ""}" data-act="calSel" data-d="${d}"><span>${+d.slice(8)}</span><div class="dots">${dots}</div></button>`;
    }).join("")}
  </div>
  <div class="small muted" style="margin:8px 2px 0">${gOn ? `Google Calendar synced ${S.gcache.fetched ? timeAgo(S.gcache.fetched) : "never"} · <a href="#" data-act="gRefresh" style="color:var(--accent)">refresh</a>` : G.everConnected() || S.settings.clientId ? `Google session expired · <a href="#" data-act="gconnect" style="color:var(--accent)">reconnect</a>` : `Google Calendar not connected · <a href="#" data-act="settings" style="color:var(--accent)">set up</a>`}</div>

  <div class="sec"><h2>${relDay(sel)} · ${fmtDate(sel, { month: "short", day: "numeric" })}</h2><button class="link" data-act="newEvent" data-d="${sel}">+ Event</button></div>
  ${evs.length ? `<div class="list">${evs.map(e => eventRow(e, sel)).join("")}</div>` : `<div class="empty">No events.</div>`}
  ${tks.length ? `<div class="sec"><h2>Tasks due</h2></div><div class="list">${tks.map(t => taskRow(t, { showDue: false })).join("")}</div>` : ""}
  <div class="sec"><h2>Important dates · next 90 days</h2></div>
  ${(() => { const imp = upcomingImportant(90); return imp.length ? `<div class="list">${imp.map(e => `<div class="item tap" data-act="openEvent" data-id="${esc(e.id)}" data-date="${e.on}"><div class="grow"><div class="t">★ ${esc(e.title)}</div><div class="meta"><span>${fmtDate(e.on)}</span></div></div><span class="small muted">${diffDays(today(), e.on) === 0 ? "today" : `in ${diffDays(today(), e.on)}d`}</span></div>`).join("")}</div>` : `<div class="empty">Mark an event as important (birthdays, deadlines, anniversaries) and it shows here, with an extra reminder the day before.</div>`; })()}
  `;
}
const timeAgo = t => { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };

/* ================= TASKS / PROJECTS / HABITS ================= */
export function renderTasks(v) {
  const sub = state.sub || "tasks";
  v.innerHTML = `<div class="seg" style="margin-top:4px">${[["tasks", "Tasks"], ["projects", "Projects"], ["habits", "Habits"]].map(([k, l]) => `<button class="${sub === k ? "on" : ""}" data-act="go" data-to="tasks/${k}">${l}</button>`).join("")}</div><div id="subv"></div>`;
  const sv = $("#subv");
  if (sub === "projects") return renderProjects(sv);
  if (sub === "habits") return renderHabits(sv);
  const f = state.taskFilter, d = today();
  let list = live("tasks");
  if (f === "today") list = list.filter(t => !t.done && t.due && t.due <= d);
  if (f === "upcoming") list = list.filter(t => !t.done && t.due > d);
  if (f === "someday") list = list.filter(t => !t.done && !t.due);
  if (f === "done") list = list.filter(t => t.done).sort((a, b) => b.done - a.done).slice(0, 80);
  else list.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.time || "").localeCompare(b.time || "") || (a.pri || 3) - (b.pri || 3));
  const groups = {};
  if (f === "upcoming") list.forEach(t => (groups[t.due] = groups[t.due] || []).push(t));
  sv.innerHTML = `
  <div class="qadd"><input id="qTask" placeholder="Add task… “Color grade fri !1 #promo @14:00”" enterkeyhint="done"></div>
  <div class="chips" style="margin-bottom:12px">${[["today", "Today"], ["upcoming", "Upcoming"], ["someday", "No date"], ["done", "Done"]].map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-act="taskFilter" data-f="${k}">${l}</button>`).join("")}</div>
  ${f === "upcoming" ? Object.entries(groups).map(([day, ts]) => `<div class="sec"><h2>${relDay(day)}</h2></div><div class="list">${ts.map(t => taskRow(t, { showDue: false })).join("")}</div>`).join("") || '<div class="empty">Nothing scheduled ahead.</div>'
    : list.length ? `<div class="list">${list.map(t => taskRow(t)).join("")}</div>` : `<div class="empty">${f === "today" ? "Inbox zero for today." : "Nothing here."}</div>`}
  <div class="small muted" style="margin-top:14px">Shortcuts: <code>today</code> <code>tomorrow</code> <code>fri</code> · <code>!1</code> high priority · <code>#tag</code> · <code>@14:30</code> time</div>`;
  const q = $("#qTask");
  q.addEventListener("keydown", e => { if (e.key === "Enter" && q.value.trim()) { addParsedTask(q.value, f === "today" ? d : ""); q.value = ""; } });
}

function renderProjects(v) {
  const ps = live("projects").sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const d = today();
  v.innerHTML = `<div class="sec"><h2>Edit projects</h2><button class="link" data-act="editProject">+ Project</button></div>
  ${ps.map(p => {
    const l = p.deadline ? diffDays(d, p.deadline) : null;
    const openT = live("tasks").filter(t => t.projectId === p.id && !t.done).length;
    const fm = live("focus").filter(f => f.projectId === p.id).reduce((s, f) => s + f.min, 0);
    return `<div class="card tap" data-act="editProject" data-id="${p.id}" style="${p.done ? "opacity:.55" : ""}">
      <div class="spread"><div class="grow"><h3>${esc(p.name)}</h3><div class="sub">${p.client ? esc(p.client) + " · " : ""}${STAGES[p.stage || 0]}</div></div>
      ${l != null && !p.done ? `<div class="small ${l <= 2 ? "overdue" : "muted"}" style="text-align:right">${l < 0 ? `${-l}d late` : l === 0 ? "Due today" : `${l}d left`}<br>${fmtDate(p.deadline, { month: "short", day: "numeric" })}</div>` : p.done ? '<span class="small muted">Delivered</span>' : ""}</div>
      <div class="stages">${STAGES.map((_, i) => `<i class="${i <= (p.stage || 0) ? "on" : ""}"></i>`).join("")}</div>
      <div class="spread small muted"><span>${openT} open task${openT === 1 ? "" : "s"} · ${fmtMin(fm)} focus</span>${!p.done ? `<button class="btn sm ghost" data-act="nextStage" data-id="${p.id}">Next stage →</button>` : ""}</div>
    </div>`;
  }).join("") || '<div class="empty">Track each edit from brief to delivery. Deadlines get reminders 2 days ahead and on the day.</div>'}`;
}

function renderHabits(v) {
  const hs = live("habits"), d = today(), days = range(7);
  v.innerHTML = `<div class="sec"><h2>Habits</h2><button class="link" data-act="editHabit">+ Habit</button></div>
  ${hs.map(h => `<div class="card"><div class="spread"><div class="tap grow" data-act="editHabit" data-id="${h.id}"><h3>${esc(h.name)}</h3><div class="sub">${habitStreak(h)} day streak · ${h.days?.length && h.days.length < 7 ? h.days.map(i => DOW[i]).join(" ") : "Every day"}</div></div></div>
    <div class="week">${days.map(day => { const sched = !h.days?.length || h.days.includes(parseYmd(day).getDay()); return `<button class="${habitDone(h, day) ? "on" : ""} ${sched ? "" : "off"}" data-act="toggleHabit" data-id="${h.id}" data-d="${day}">${day === d ? "Today" : DOW[parseYmd(day).getDay()]}</button>`; }).join("")}</div></div>`).join("")
    || `<div class="empty">Small daily habits build up. Ideas: read 20 min, gym, no phone before 10, learn a new editing technique, 8 glasses of water.</div>`}`;
}

/* ================= NOTES ================= */
export function renderNotes(v) {
  const q = state.noteQ.toLowerCase();
  const ns = live("notes").filter(n => !q || (n.title + " " + n.body).toLowerCase().includes(q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.u - a.u);
  v.innerHTML = `<div class="qadd"><input id="nSearch" placeholder="Search notes" value="${esc(state.noteQ)}" type="search"><button class="btn sm" data-act="editNote">New</button></div>
  ${ns.length ? `<div class="notes-grid">${ns.map(n => `<div class="note" data-act="editNote" data-id="${n.id}"><h4>${n.pinned ? "📌 " : ""}${esc(n.title || "Untitled")}</h4><p>${esc((n.body || "").slice(0, 300))}</p><div class="when">${timeAgo(n.u)}</div></div>`).join("")}</div>` : `<div class="empty">${q ? "No matches." : "No notes yet. Ideas, client briefs, shot lists, journal entries."}</div>`}`;
  const s = $("#nSearch");
  s.addEventListener("input", () => { state.noteQ = s.value; const pos = s.selectionStart; renderNotes(v); const n = $("#nSearch"); n.focus(); n.setSelectionRange(pos, pos); });
}

/* ================= STATS ================= */
export function renderStats(v) {
  const n = state.statRange, days = range(n), d = today();
  const lab = days.map(x => n <= 7 ? DOW[parseYmd(x).getDay()] : fmtDate(x, { month: "short", day: "numeric" }));
  const tipLab = days.map(x => fmtDate(x));
  const ci = days.map(x => S.checkins[x]?.done ? S.checkins[x] : null);
  const scores = days.map(x => S.checkins[x]?.done ? (S.checkins[x].score ?? scoreDay(x).total) : null);
  const ratings = ci.map(c => c?.rating ?? null);
  const doneN = days.map(x => doneOn(x).length), createdN = days.map(x => createdOn(x).length);
  const focusM = days.map(x => focusOn(x));
  const avg = a => { const b = a.filter(x => x != null); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
  const sum = a => a.reduce((s, x) => s + (x || 0), 0);
  const prevDays = range(n, addDays(d, -n));
  const prevDone = sum(prevDays.map(x => doneOn(x).length)), prevFocus = sum(prevDays.map(x => focusOn(x)));
  const prevScore = avg(prevDays.map(x => S.checkins[x]?.done ? S.checkins[x].score : null));
  const delta = (cur, prev, fmt = x => Math.round(x)) => prev == null || cur == null || !prev ? "" : `<span class="${cur >= prev ? "up" : "down"}">${cur >= prev ? "▲" : "▼"} ${fmt(Math.abs(cur - prev))}</span> vs prior ${n}d`;
  const hr = days.map(x => habitRate(x)).filter(x => x != null);
  const avgScore = avg(scores);

  v.innerHTML = `
  <div class="seg" style="margin:4px 0 14px">${[[7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([k, l]) => `<button class="${n === k ? "on" : ""}" data-act="statRange" data-n="${k}">${l}</button>`).join("")}</div>
  <div class="tiles">
    <div class="tile"><div class="k">Avg day score</div><div class="v">${avgScore != null ? Math.round(avgScore) : "–"}</div><div class="d">${delta(avgScore, prevScore) || `${ci.filter(Boolean).length} check-ins`}</div></div>
    <div class="tile"><div class="k">Avg rating</div><div class="v">${avg(ratings) != null ? avg(ratings).toFixed(1) : "–"}<small> /10</small></div><div class="d">self-rated</div></div>
    <div class="tile"><div class="k">Tasks done</div><div class="v">${sum(doneN)}</div><div class="d">${delta(sum(doneN), prevDone) || `${sum(createdN)} added`}</div></div>
    <div class="tile"><div class="k">Focus</div><div class="v">${fmtMin(sum(focusM))}</div><div class="d">${delta(sum(focusM), prevFocus, fmtMin) || `avg ${fmtMin(sum(focusM) / n)}/day`}</div></div>
    <div class="tile"><div class="k">Habit completion</div><div class="v">${hr.length ? Math.round(avg(hr) * 100) + "%" : "–"}</div><div class="d">scheduled habits</div></div>
    <div class="tile"><div class="k">Completion rate</div><div class="v">${sum(createdN) ? Math.round(Math.min(1, sum(doneN) / Math.max(1, sum(createdN))) * 100) + "%" : "–"}</div><div class="d">done ÷ added</div></div>
    <div class="tile"><div class="k">Avg sleep</div><div class="v">${avg(ci.map(c => c?.sleep)) != null ? avg(ci.map(c => c?.sleep)).toFixed(1) : "–"}<small>h</small></div><div class="d">goal ${S.settings.sleepGoal}h</div></div>
    <div class="tile"><div class="k">Check-in streak</div><div class="v">${checkinStreak()}<small> d</small></div><div class="d">consecutive</div></div>
  </div>

  <div class="sec"><h2>Days</h2></div>
  <div class="chart-card"><h3>Day score & your rating</h3><div class="cap">Score is computed from tasks, focus, wellbeing and habits (0–100). Rating is yours, ×10 to share the scale.</div>
    <div class="legend"><span><i style="background:var(--s1)"></i>Day score</span><span><i style="background:var(--s2)"></i>Your rating ×10</span></div><div id="cScore"></div></div>
  <div class="chart-card"><h3>Mood & energy</h3><div class="cap">1–5, from your evening check-ins.</div>
    <div class="legend"><span><i style="background:var(--s1)"></i>Mood</span><span><i style="background:var(--s3)"></i>Energy</span></div><div id="cMood"></div></div>

  <div class="sec"><h2>Productivity</h2></div>
  <div class="chart-card"><h3>Tasks completed</h3><div class="cap">Per day.</div><div id="cTasks"></div></div>
  <div class="chart-card"><h3>Focus time</h3><div class="cap">Minutes of logged deep work per day. Dashed line is your goal.</div><div id="cFocus"></div></div>
  <div class="chart-card"><h3>Score breakdown</h3><div class="cap">Average of each area over the period. Your weakest area is where the gains are.</div><div id="cParts"></div></div>
  <div class="chart-card"><h3>Best days of the week</h3><div class="cap">Average day score by weekday.</div><div id="cDow"></div></div>

  <div class="sec"><h2>Habits & health</h2></div>
  <div class="chart-card"><h3>Habit consistency</h3><div class="cap">Share of scheduled habits done, last 16 weeks.</div><div id="cHeat"></div></div>
  <div class="chart-card"><h3>Sleep vs. day rating</h3><div class="cap">Each dot is a day. Do you rate days higher after more sleep?</div><div id="cSleep"></div></div>

  <div class="sec"><h2>Patterns</h2></div>
  <div class="chart-card"><h3>What gets in the way</h3><div class="cap">Blockers you reported.</div><div id="cBlock"></div></div>
  <div class="chart-card"><h3>Where your tasks go</h3><div class="cap">Completed tasks by tag.</div><div id="cTags"></div></div>
  <div class="chart-card"><h3>Focus by project</h3><div class="cap">Logged focus time per edit project.</div><div id="cProj"></div></div>

  <div class="sec"><h2>Reviews</h2></div>
  ${(() => { const rs = Object.entries(S.checkins).filter(([k, c]) => c.done).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
    return rs.length ? `<div class="list">${rs.map(([k, c]) => `<div class="item tap" data-act="fbOpen" data-d="${k}"><div class="grow"><div class="t">${fmtDate(k)}</div><div class="meta"><span>Rated ${c.rating ?? "–"}/10</span>${c.win ? `<span>${esc(c.win.slice(0, 50))}</span>` : ""}</div></div><b>${c.score ?? "–"}</b></div>`).join("")}</div>` : '<div class="empty">Your daily reviews will appear here.</div>'; })()}
  `;

  const pct = x => Math.round(x);
  lineChart($("#cScore"), { labels: lab, tips: tipLab, yMin: 0, yMax: 100, ticks: [0, 50, 100], fmt: pct, series: [{ name: "Day score", values: scores, color: "var(--s1)" }, { name: "Your rating ×10", values: ratings.map(r => r == null ? null : r * 10), color: "var(--s2)" }] });
  lineChart($("#cMood"), { labels: lab, tips: tipLab, yMin: 1, yMax: 5, ticks: [1, 3, 5], height: 140, series: [{ name: "Mood", values: ci.map(c => c?.mood ?? null), color: "var(--s1)" }, { name: "Energy", values: ci.map(c => c?.energy ?? null), color: "var(--s3)" }] });
  barChart($("#cTasks"), { labels: lab, tips: tipLab, values: doneN, color: "var(--s1)", fmt: x => `${Math.round(x)}${x === doneN[0] && false ? "" : ""}` });
  barChart($("#cFocus"), { labels: lab, tips: tipLab, values: focusM, color: "var(--s1)", goal: S.settings.focusGoal, goalLabel: "goal", fmt: fmtMin });
  const partsAvg = k => avg(days.map(x => S.checkins[x]?.done ? (S.checkins[x].parts?.[k] ?? scoreDay(x).parts[k]) : null));
  hbar($("#cParts"), { rows: [["productivity", "Productivity"], ["focus", "Focus"], ["wellbeing", "Wellbeing"], ["discipline", "Discipline"]].map(([k, l]) => ({ label: l, value: Math.round(partsAvg(k) || 0) })).filter(r => r.value), fmt: x => x + "/100" });
  const dowRows = [1, 2, 3, 4, 5, 6, 0].map(i => { const vals = range(Math.max(n, 28)).filter(x => parseYmd(x).getDay() === i).map(x => S.checkins[x]?.done ? S.checkins[x].score : null); return { label: DOW[i], value: Math.round(avg(vals) || 0) }; });
  barChart($("#cDow"), { labels: dowRows.map(r => r.label), values: dowRows.map(r => r.value), yMax: 100, fmt: x => x || "–", height: 140 });

  // heatmap: 16 weeks ending this week, Monday-first
  const end = addDays(d, (7 - ((parseYmd(d).getDay() + 6) % 7)) - 1), start = addDays(end, -16 * 7 + 1);
  const cells = Array.from({ length: 16 * 7 }, (_, i) => { const x = addDays(start, i), r = x > d ? null : habitRate(x); return { date: x, v: r, future: x > d, tip: `<div>${fmtDate(x)}</div><b>${r == null ? (x > d ? "—" : "No habits scheduled") : Math.round(r * 100) + "% of habits"}</b>` }; });
  heatmap($("#cHeat"), { cells });

  const pts = days.map(x => S.checkins[x]).map((c, i) => c?.done && c.sleep != null && c.rating ? { x: c.sleep, y: c.rating, tip: `<div>${tipLab[i]}</div>Slept <b>${c.sleep}h</b> · rated <b>${c.rating}/10</b>` } : null).filter(Boolean);
  scatter($("#cSleep"), { points: pts, xMin: 3, xMax: 11, yMin: 0, yMax: 10, xFmt: x => x + "h", xLabel: "Hours slept" });

  const bc = {}; ci.forEach(c => (c?.blockers || []).forEach(b => { if (!b.startsWith("Nothing")) bc[b] = (bc[b] || 0) + 1; }));
  hbar($("#cBlock"), { rows: Object.entries(bc).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label: esc(label), value })), fmt: x => `${x}×`, color: "var(--s2)" });
  const tc = {}; days.forEach(x => doneOn(x).forEach(t => { const k = t.tag || "untagged"; tc[k] = (tc[k] || 0) + 1; }));
  hbar($("#cTags"), { rows: Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label: "#" + esc(label), value })) });
  const pc = {}; live("focus").filter(f => days.includes(f.date)).forEach(f => { const p = f.projectId && byId("projects", f.projectId); const k = p ? p.name : f.label || "Other"; pc[k] = (pc[k] || 0) + f.min; });
  hbar($("#cProj"), { rows: Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label: esc(label), value })), fmt: fmtMin, color: "var(--s3)" });
}

/* ================= EDITORS ================= */
const projOpts = sel => `<option value="">None</option>` + projectsActive().map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");

function editTask(id, preset = {}) {
  const t = id ? byId("tasks", id) : { title: "", due: today(), pri: 3, ...preset };
  if (!t) return;
  openSheet(`<h2>${id ? "Edit task" : "New task"}</h2><div id="f">
    <label class="f"><span>Task</span><input class="input" name="title" value="${esc(t.title)}" placeholder="What needs doing?"></label>
    <div class="frow"><label class="f"><span>Due</span><input class="input" type="date" name="due" value="${t.due || ""}"></label><label class="f"><span>Time (optional)</span><input class="input" type="time" name="time" value="${t.time || ""}"></label></div>
    <div class="frow"><label class="f"><span>Priority</span><select name="pri">${[[1, "High"], [2, "Medium"], [3, "Normal"]].map(([v, l]) => `<option value="${v}" ${+t.pri === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f"><span>Tag</span><input class="input" name="tag" value="${esc(t.tag || "")}" placeholder="client, personal…" list="tagList"></label></div>
    <datalist id="tagList">${[...new Set(live("tasks").map(x => x.tag).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join("")}</datalist>
    <label class="f"><span>Project</span><select name="projectId">${projOpts(t.projectId)}</select></label>
    <label class="f"><span>Notes</span><textarea name="note" rows="3">${esc(t.note || "")}</textarea></label>
  </div>
  <div class="sheet-actions">${id ? `<button class="btn danger" data-act="delTask" data-id="${id}">Delete</button>` : ""}<button class="btn" data-act="saveTask" data-id="${id || ""}">Save</button></div>`);
  if (!id) setTimeout(() => $('[name="title"]').focus(), 200);
}

function editEvent(id, date) {
  const e = id ? byId("events", id) : { title: "", date: date || state.calSel || today(), allDay: false, start: nextHalfHour(), end: "", remind: S.settings.leadMin, repeat: "none", important: false };
  if (!e) return;
  const gOk = G.connected();
  openSheet(`<h2>${id ? "Edit event" : "New event"}</h2><div id="f">
    <label class="f"><span>Title</span><input class="input" name="title" value="${esc(e.title)}" placeholder="Shoot, client call, birthday…"></label>
    <div class="frow"><label class="f"><span>Date</span><input class="input" type="date" name="date" value="${e.date}"></label><label class="f"><span>Repeat</span><select name="repeat">${[["none", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]].map(([v, l]) => `<option value="${v}" ${e.repeat === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <div class="switch"><span>All day</span><input type="checkbox" name="allDay" ${e.allDay ? "checked" : ""}></div>
    <div class="frow" id="timeRow"><label class="f"><span>Start</span><input class="input" type="time" name="start" value="${e.start || ""}"></label><label class="f"><span>End</span><input class="input" type="time" name="end" value="${e.end || ""}"></label></div>
    <label class="f"><span>Remind me</span><select name="remind">${[[-1, "No reminder"], [0, "At start"], [10, "10 min before"], [30, "30 min before"], [60, "1 hour before"], [120, "2 hours before"], [1440, "1 day before"]].map(([v, l]) => `<option value="${v}" ${+(e.remind ?? -1) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <div class="switch"><span>★ Important date<br><span class="small muted">Extra reminder a day before, listed under Important dates</span></span><input type="checkbox" name="important" ${e.important ? "checked" : ""}></div>
    <label class="f"><span>Location</span><input class="input" name="location" value="${esc(e.location || "")}"></label>
    <label class="f"><span>Notes</span><textarea name="note" rows="2">${esc(e.note || "")}</textarea></label>
    <div class="switch"><span>Save to Google Calendar<br><span class="small muted">${gOk ? "Google sends the reminder to your phone even when this app is closed" : "Connect Google in Settings to enable"}</span></span><input type="checkbox" name="toGoogle" ${gOk && (e.gid || !id) ? "checked" : ""} ${gOk ? "" : "disabled"}></div>
  </div>
  <div class="sheet-actions">${id ? `<button class="btn danger" data-act="delEvent" data-id="${id}">Delete</button>` : ""}<button class="btn" data-act="saveEvent" data-id="${id || ""}">Save</button></div>`);
  const ad = $('[name="allDay"]'), tr = $("#timeRow");
  const sync = () => tr.classList.toggle("hidden", ad.checked); ad.addEventListener("change", sync); sync();
  if (!id) setTimeout(() => $('[name="title"]').focus(), 200);
}
const nextHalfHour = () => { const d = new Date(Date.now() + 30 * 60e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d.toTimeString().slice(0, 5); };

function viewGoogleEvent(e, date) {
  openSheet(`<h2>${esc(e.title)}</h2>
    <div class="sub">${fmtDate(date, { weekday: "long", month: "long", day: "numeric" })} · ${e.allDay ? "All day" : `${e.start}–${e.end}`}</div>
    ${e.location ? `<p class="sub">📍 ${esc(e.location)}</p>` : ""}${e.note ? `<div class="callout" style="margin-top:12px;white-space:pre-wrap">${esc(e.note).slice(0, 1500)}</div>` : ""}
    <p class="small muted">From Google Calendar · ${esc(e.cal || "")}${e.remind?.length ? ` · reminders ${e.remind.map(m => m >= 60 ? m / 60 + "h" : m + "m").join(", ")} before` : ""}</p>
    <div class="sheet-actions">${e.localId ? `<button class="btn ghost" data-act="editEventLocal" data-id="${e.localId}">Edit</button>` : `<button class="btn ghost" data-act="markImportant" data-gid="${esc(e.gid)}" data-date="${date}">★ Mark important</button>`}${e.link ? `<a class="btn" style="text-align:center;text-decoration:none" href="${esc(e.link)}" target="_blank" rel="noopener">Open in Google</a>` : ""}</div>`);
}

function editProject(id) {
  const p = id ? byId("projects", id) : { name: "", client: "", deadline: "", stage: 0, notes: "" };
  if (!p) return;
  const tasks = id ? live("tasks").filter(t => t.projectId === id) : [];
  openSheet(`<h2>${id ? esc(p.name) : "New project"}</h2><div id="f">
    <label class="f"><span>Project</span><input class="input" name="name" value="${esc(p.name)}" placeholder="e.g. Brand film, music video"></label>
    <div class="frow"><label class="f"><span>Client</span><input class="input" name="client" value="${esc(p.client || "")}"></label><label class="f"><span>Deadline</span><input class="input" type="date" name="deadline" value="${p.deadline || ""}"></label></div>
    <label class="f"><span>Stage</span><select name="stage">${STAGES.map((s, i) => `<option value="${i}" ${+p.stage === i ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label class="f"><span>Notes, links, feedback</span><textarea name="notes" rows="4">${esc(p.notes || "")}</textarea></label>
    <div class="switch"><span>Delivered / archived</span><input type="checkbox" name="done" ${p.done ? "checked" : ""}></div>
  </div>
  ${id ? `<div class="sec"><h2>Tasks</h2><button class="link" data-act="newTaskFor" data-id="${id}">+ Task</button></div>${tasks.length ? `<div class="list">${tasks.map(t => taskRow(t)).join("")}</div>` : '<div class="empty">No tasks yet.</div>'}` : ""}
  <div class="sheet-actions">${id ? `<button class="btn danger" data-act="delProject" data-id="${id}">Delete</button>` : ""}<button class="btn" data-act="saveProject" data-id="${id || ""}">Save</button></div>`);
}

function editHabit(id) {
  const h = id ? byId("habits", id) : { name: "", days: [] };
  if (!h) return;
  const days = h.days?.length ? h.days : [0, 1, 2, 3, 4, 5, 6];
  openSheet(`<h2>${id ? "Edit habit" : "New habit"}</h2><div id="f">
    <label class="f"><span>Habit</span><input class="input" name="name" value="${esc(h.name)}" placeholder="Read 20 min, gym, no phone in bed…"></label>
    <label class="f"><span>Which days</span></label><div class="chips" id="hDays">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button class="chip ${days.includes(i) ? "on" : ""}" data-act="hDay" data-i="${i}">${DOW[i]}</button>`).join("")}</div>
  </div><div class="sheet-actions">${id ? `<button class="btn danger" data-act="delHabit" data-id="${id}">Delete</button>` : ""}<button class="btn" data-act="saveHabit" data-id="${id || ""}">Save</button></div>`);
  if (!id) setTimeout(() => $('[name="name"]').focus(), 200);
}

let noteT;
function editNote(id) {
  const n = id ? byId("notes", id) : upsert("notes", { title: "", body: "", pinned: false });
  openSheet(`<div class="note-editor"><div class="spread"><button class="icon-btn" data-act="closesheet">${icon.left}</button><div class="row"><button class="icon-btn" data-act="pinNote" data-id="${n.id}" style="${n.pinned ? "color:var(--ink)" : ""}" title="Pin">${icon.pin}</button><button class="btn sm danger" data-act="delNote" data-id="${n.id}">Delete</button></div></div>
    <input class="input title" id="nTitle" placeholder="Title" value="${esc(n.title)}"><textarea id="nBody" placeholder="Start writing…">${esc(n.body)}</textarea>
    <div class="small muted" id="nSaved"></div></div>`, { full: true, onClose: () => { const x = byId("notes", n.id); if (x && !x.title && !x.body) remove("notes", n.id); } });
  const doSave = () => { clearTimeout(noteT); noteT = setTimeout(() => { const x = byId("notes", n.id); if (!x) return; x.title = $("#nTitle").value; x.body = $("#nBody").value; upsert("notes", x); $("#nSaved").textContent = "Saved"; }, 400); };
  $("#nTitle").addEventListener("input", doSave); $("#nBody").addEventListener("input", doSave);
  if (!id) setTimeout(() => $("#nTitle").focus(), 200);
}

/* ================= FOCUS TIMER ================= */
const TK = "lifedash.timer";
export const getTimer = () => { try { return JSON.parse(localStorage.getItem(TK)); } catch { return null; } };
const setTimer = t => t ? localStorage.setItem(TK, JSON.stringify(t)) : localStorage.removeItem(TK);
const remaining = t => Math.max(0, t.paused ? t.left : t.end - Date.now());
const fmtClock = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
let focusDur = 50;

function openFocus() {
  const t = getTimer();
  if (!t) {
    openSheet(`<h2>Focus session</h2><div class="sub">Phone face down, notifications off. One thing only.</div>
      <label class="f"><span>Length</span></label><div class="chips">${[25, 50, 90].map(m => `<button class="chip ${focusDur === m ? "on" : ""}" data-act="fDur" data-m="${m}">${m} min</button>`).join("")}</div>
      <label class="f"><span>Working on</span><input class="input" id="fLabel" placeholder="e.g. Rough cut, color pass"></label>
      <label class="f"><span>Project</span><select id="fProj">${projOpts("")}</select></label>
      <div class="sheet-actions"><button class="btn block" data-act="fStart">Start ${focusDur} min</button></div>
      <div class="sec"><h2>Log time manually</h2></div><div class="qadd"><input id="fManual" type="number" inputmode="numeric" placeholder="Minutes worked"><button class="btn sm ghost" data-act="fLog">Log</button></div>`);
    return;
  }
  const total = t.dur * 60e3;
  openSheet(`<div class="timer"><div class="muted">${esc(t.label || "Focus")}</div>
    <div class="ring-lg" style="margin-top:18px">${ring(1 - remaining(t) / total, 240, 10, "var(--accent)")}<div class="big" id="tBig">${fmtClock(remaining(t))}</div></div>
    <div class="sheet-actions" style="justify-content:center"><button class="btn ghost" data-act="fPause">${t.paused ? "Resume" : "Pause"}</button><button class="btn" data-act="fFinish">Finish & log</button></div>
    <button class="btn danger sm" style="margin-top:10px" data-act="fCancel">Discard session</button></div>`, { full: false });
}
function logFocus(t, minutes) {
  if (minutes >= 1) upsert("focus", { date: today(), min: Math.round(minutes), label: t.label || "", projectId: t.projectId || "" });
}
export function timerTick() {
  const t = getTimer(); if (!t) return;
  const r = remaining(t);
  const big = $("#tBig"), card = $("#tCard");
  if (big) { big.textContent = fmtClock(r); const c = big.parentElement.querySelectorAll("circle")[1]; if (c) { const len = +c.getAttribute("stroke-dasharray"); c.setAttribute("stroke-dashoffset", len * (r / (t.dur * 60e3))); } }
  if (card) card.textContent = fmtClock(r);
  if (r <= 0 && !t.paused) {
    logFocus(t, t.dur); setTimer(null);
    N.notify("Focus session done", `${t.dur} minutes logged${t.label ? " · " + t.label : ""}. Take a 5–10 minute break.`, { tag: "focus" });
    toast(`Session done · ${t.dur} min logged`);
    if (big) closeSheet();
  }
}

/* ================= SETTINGS ================= */
function openSettings() {
  const s = S.settings, gOn = G.connected(), perm = N.permission();
  const cals = S.gcache.cals;
  openSheet(`<h2>Settings</h2>
  <div class="sec"><h2>Google Calendar & sync</h2></div>
  <div class="card">
    <label class="f" style="margin-top:0"><span>OAuth Client ID</span><input class="input" id="sClient" value="${esc(s.clientId)}" placeholder="xxxx.apps.googleusercontent.com" autocapitalize="off" spellcheck="false"></label>
    <div class="small muted" style="margin-top:6px">Redirect URI to add in Google Cloud: <code>${esc(G.redirectUri())}</code></div>
    <div class="sheet-actions">${gOn ? `<button class="btn ghost" data-act="gSyncNow">${icon.sync.replace('class="ico"', 'class="ico" style="width:16px;height:16px;display:inline;vertical-align:-3px"')} Sync now</button><button class="btn danger" data-act="gDisconnect">Disconnect</button>` : `<button class="btn block" data-act="gconnect">Connect Google</button>`}</div>
    <div class="small muted" style="margin-top:8px">${gOn ? `Connected. Data last synced to Drive ${S.lastSync ? timeAgo(S.lastSync) : "never"}.` : "Connecting adds calendar sync, and syncs tasks, notes and check-ins between your phone and computer through a hidden file in your Google Drive."}</div>
    ${cals.length ? `<label class="f"><span>Calendars to show</span></label>${cals.map(c => `<div class="switch"><span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c.color};margin-right:8px"></span>${esc(c.name)}</span><input type="checkbox" data-cal="${esc(c.id)}" ${s.hiddenCals.includes(c.id) ? "" : "checked"}></div>`).join("")}` : ""}
    <div class="switch"><span>Reconnect automatically on launch<br><span class="small muted">Google sign-in lasts 1 hour. This renews it when you open the app.</span></span><input type="checkbox" id="sAuto" ${s.autoConnect ? "checked" : ""}></div>
  </div>

  <div class="sec"><h2>Notifications</h2></div>
  <div class="card">
    <div class="switch"><span>Reminders<br><span class="small muted">${perm === "granted" ? "Allowed on this device" : perm === "denied" ? "Blocked. Allow notifications for this site in your browser or phone settings." : perm === "unsupported" ? "On iPhone: Share → Add to Home Screen, then open from the home screen." : "Needs permission"}</span></span><input type="checkbox" id="sNotify" ${s.notify && perm === "granted" ? "checked" : ""} ${perm === "unsupported" ? "disabled" : ""}></div>
    <div class="frow"><label class="f"><span>Morning brief</span><input class="input" type="time" id="sMorning" value="${s.morningTime}"></label><label class="f"><span>Evening check-in</span><input class="input" type="time" id="sCheckin" value="${s.checkinTime}"></label></div>
    <label class="f"><span>Default event reminder</span><select id="sLead">${[[0, "At start"], [10, "10 min before"], [15, "15 min before"], [30, "30 min before"], [60, "1 hour before"]].map(([v, l]) => `<option value="${v}" ${s.leadMin === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <div class="sheet-actions"><button class="btn ghost" data-act="testNotify">Send test notification</button></div>
  </div>

  <div class="sec"><h2>Goals</h2></div>
  <div class="card"><div class="frow"><label class="f" style="margin-top:0"><span>Daily focus (min)</span><input class="input" type="number" id="sFocus" value="${s.focusGoal}"></label><label class="f" style="margin-top:0"><span>Sleep (hours)</span><input class="input" type="number" step="0.5" id="sSleep" value="${s.sleepGoal}"></label></div>
  <label class="f"><span>Water (glasses)</span><input class="input" type="number" id="sWater" value="${s.waterGoal}"></label></div>

  <div class="sec"><h2>Appearance & data</h2></div>
  <div class="card">
    <div class="seg">${[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button class="${s.theme === k ? "on" : ""}" data-act="theme" data-t="${k}">${l}</button>`).join("")}</div>
    <div class="sheet-actions"><button class="btn ghost" data-act="export">Export backup</button><label class="btn ghost" style="text-align:center">Import<input type="file" id="sImport" accept="application/json" hidden></label></div>
  </div>
  <div class="sheet-actions"><button class="btn block" data-act="saveSettings">Save</button></div>`);
  $("#sImport").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); if (!confirm("Replace all data on this device with this backup?")) return; (await import("./store.js")).replaceAll(data); toast("Backup restored"); closeSheet(); } catch { toast("That file isn't a valid backup"); }
  });
}

/* ================= ACTIONS ================= */
export function registerActions(rerender, go) {
  act({
    go: el => go(el.dataset.to),
    settings: openSettings,
    morning: openMorning,
    focus: openFocus,
    quickadd() {
      openSheet(`<h2>Add</h2><div class="list">${[["qaTask", "Task", "Something to do"], ["qaEvent", "Event", "Calendar entry with reminder"], ["qaNote", "Note", "Idea, brief, journal"], ["focus", "Focus session", "Start the timer"], ["qaProject", "Edit project", "Track a video from brief to delivery"], ["qaHabit", "Habit", "Something to do regularly"], ["ciOpen", "Daily check-in", "Review your day"]].map(([a, t, s]) => `<div class="item tap" data-act="${a}"><div class="grow"><div class="t">${t}</div><div class="meta">${s}</div></div>${icon.right}</div>`).join("")}</div>`);
    },
    qaTask: () => editTask(null, state.tab === "calendar" ? { due: state.calSel } : {}),
    qaEvent: () => editEvent(null, state.tab === "calendar" ? state.calSel : today()),
    qaNote: () => editNote(null), qaProject: () => editProject(null), qaHabit: () => editHabit(null),

    toggleTask(el) { const t = byId("tasks", el.dataset.id); if (!t) return; t.done = t.done ? 0 : Date.now(); upsert("tasks", t); if (t.done && navigator.vibrate) navigator.vibrate(10); },
    editTask: el => editTask(el.dataset.id),
    newTaskFor: el => editTask(null, { projectId: el.dataset.id }),
    saveTask(el) {
      const f = formData($("#f")); if (!f.title) return toast("Give it a name");
      const t = el.dataset.id ? byId("tasks", el.dataset.id) : { done: 0 };
      Object.assign(t, f, { pri: Number(f.pri) }); upsert("tasks", t); closeSheet();
    },
    delTask(el) { remove("tasks", el.dataset.id); closeSheet(); toast("Task deleted"); },
    taskFilter(el) { state.taskFilter = el.dataset.f; rerender(); },

    calNav(el) { const [y, m] = state.calMonth.split("-").map(Number); const d = new Date(y, m - 1 + Number(el.dataset.d), 1); state.calMonth = ymd(d).slice(0, 7); rerender(); },
    calToday() { state.calMonth = today().slice(0, 7); state.calSel = today(); rerender(); },
    calSel(el) { state.calSel = el.dataset.d; if (el.dataset.d.slice(0, 7) !== state.calMonth) state.calMonth = el.dataset.d.slice(0, 7); rerender(); },
    newEvent: el => editEvent(null, el.dataset.d),
    openEvent(el) {
      const id = el.dataset.id, date = el.dataset.date;
      if (id.startsWith("g:")) { const e = eventsOn(date).find(x => x.id === id); if (e) viewGoogleEvent(e, date); }
      else editEvent(id);
    },
    editEventLocal: el => editEvent(el.dataset.id),
    markImportant(el) {
      const g = S.gcache.events.find(e => e.gid === el.dataset.gid);
      if (!g) return;
      upsert("events", { title: g.title, date: g.date, endDate: g.endDate, allDay: g.allDay, start: g.start, end: g.end, gid: g.rid || g.gid, important: true, remind: (g.remind || [])[0] ?? S.settings.leadMin, location: g.location, repeat: "none", fromGoogle: true });
      closeSheet(); toast("Marked important");
    },
    async saveEvent(el) {
      const f = formData($("#f")); if (!f.title) return toast("Give it a title");
      const e = el.dataset.id ? byId("events", el.dataset.id) : {};
      const toGoogle = f.toGoogle; delete f.toGoogle;
      Object.assign(e, f, { remind: Number(f.remind) < 0 ? null : Number(f.remind) });
      if (e.allDay) { e.start = ""; e.end = ""; }
      upsert("events", e); closeSheet();
      if (toGoogle && G.connected() && !e.fromGoogle) {
        try { const r = await G.pushEvent(e); if (r?.id) { e.gid = r.id; upsert("events", e); } await G.fetchEvents(); toast("Saved to Google Calendar"); }
        catch (err) { toast("Saved here. Google sync failed: " + err.message); }
      } else toast("Event saved");
    },
    async delEvent(el) {
      const e = byId("events", el.dataset.id); if (!e) return;
      if (!confirm(`Delete “${e.title}”${e.gid && !e.fromGoogle ? " here and from Google Calendar" : ""}?`)) return;
      remove("events", e.id); closeSheet();
      if (e.gid && !e.fromGoogle && G.connected()) { try { await G.deleteEvent(e.gid); await G.fetchEvents(); } catch (err) { toast("Couldn't delete from Google: " + err.message); } }
    },

    editProject: el => editProject(el.dataset.id),
    saveProject(el) {
      const f = formData($("#f")); if (!f.name) return toast("Name the project");
      const p = el.dataset.id ? byId("projects", el.dataset.id) : {};
      Object.assign(p, f, { stage: Number(f.stage) }); upsert("projects", p); closeSheet();
    },
    nextStage(el, ev) {
      ev.stopPropagation();
      const p = byId("projects", el.dataset.id); if (!p) return;
      p.stage = Math.min(STAGES.length - 1, (p.stage || 0) + 1); if (p.stage === STAGES.length - 1) p.done = true;
      upsert("projects", p); toast(`${p.name} → ${STAGES[p.stage]}`);
    },
    delProject(el) { if (!confirm("Delete this project? Its tasks stay.")) return; remove("projects", el.dataset.id); closeSheet(); },

    toggleHabit(el) { const h = byId("habits", el.dataset.id); if (h) { toggleHabit(h, el.dataset.d || today()); if (navigator.vibrate) navigator.vibrate(8); } },
    editHabit: el => editHabit(el.dataset.id),
    hDay: el => el.classList.toggle("on"),
    saveHabit(el) {
      const name = $('[name="name"]').value.trim(); if (!name) return toast("Name the habit");
      const days = $$("#hDays .chip.on").map(b => Number(b.dataset.i));
      const h = el.dataset.id ? byId("habits", el.dataset.id) : { log: {} };
      Object.assign(h, { name, days: days.length === 7 ? [] : days }); upsert("habits", h); closeSheet();
    },
    delHabit(el) { if (!confirm("Delete this habit and its history?")) return; remove("habits", el.dataset.id); closeSheet(); },

    editNote: el => editNote(el.dataset.id),
    pinNote(el) { const n = byId("notes", el.dataset.id); n.pinned = !n.pinned; upsert("notes", n); el.style.color = n.pinned ? "var(--ink)" : ""; toast(n.pinned ? "Pinned" : "Unpinned"); },
    delNote(el) { if (!confirm("Delete this note?")) return; remove("notes", el.dataset.id); closeSheet(); },

    statRange(el) { state.statRange = Number(el.dataset.n); rerender(); },

    fDur(el) { focusDur = Number(el.dataset.m); openFocus(); },
    fStart() { setTimer({ dur: focusDur, end: Date.now() + focusDur * 60e3, label: $("#fLabel").value.trim(), projectId: $("#fProj").value, paused: false }); openFocus(); rerender(); },
    fLog() { const m = Number($("#fManual").value); if (!m) return; logFocus({ label: $("#fLabel").value.trim(), projectId: $("#fProj").value }, m); closeSheet(); toast(`${fmtMin(m)} logged`); },
    fPause() { const t = getTimer(); if (!t) return; if (t.paused) { t.end = Date.now() + t.left; t.paused = false; } else { t.left = t.end - Date.now(); t.paused = true; } setTimer(t); openFocus(); rerender(); },
    fFinish() { const t = getTimer(); if (!t) return; const used = (t.dur * 60e3 - remaining(t)) / 60e3; logFocus(t, used); setTimer(null); closeSheet(); toast(used >= 1 ? `${fmtMin(used)} logged` : "Too short to log"); },
    fCancel() { if (!confirm("Discard this session without logging it?")) return; setTimer(null); closeSheet(); rerender(); },

    gconnect() {
      if (!S.settings.clientId) { const inp = $("#sClient"); if (inp && inp.value.trim()) setSettings({ clientId: inp.value.trim() }); }
      if (!S.settings.clientId) { openSettings(); return toast("Paste your Google OAuth Client ID first (see README)."); }
      G.signIn();
    },
    async gRefresh() { try { await G.fetchEvents(); toast("Calendar refreshed"); } catch (e) { toast(e.message); } },
    async gSyncNow() { try { await G.fetchCalendars(); await G.sync(); await G.fetchEvents(); toast("Synced"); openSettings(); } catch (e) { toast(e.message); } },
    gDisconnect() { if (!confirm("Disconnect Google? Local data stays on this device.")) return; G.signOut(); closeSheet(); rerender(); },
    async testNotify() {
      let p = N.permission(); if (p === "default") p = await N.requestPermission();
      if (p !== "granted") return toast(p === "unsupported" ? "Add the app to your home screen first." : "Notifications are blocked.");
      setSettings({ notify: true }); N.notify("It works", "You'll get reminders like this.", { tag: "test" });
    },
    theme(el) { setSettings({ theme: el.dataset.t }); applyTheme(); openSettings(); },
    export() {
      const blob = new Blob([JSON.stringify((({ gcache, fired, ...rest }) => rest)(S), null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `life-dashboard-${today()}.json`; a.click();
    },
    async saveSettings() {
      const wantNotify = $("#sNotify").checked;
      let notify = wantNotify;
      if (wantNotify && N.permission() !== "granted") notify = (await N.requestPermission()) === "granted";
      const hidden = $$("[data-cal]").filter(c => !c.checked).map(c => c.dataset.cal);
      const calsChanged = JSON.stringify(hidden) !== JSON.stringify(S.settings.hiddenCals);
      setSettings({
        clientId: $("#sClient").value.trim(), autoConnect: $("#sAuto").checked, notify,
        morningTime: $("#sMorning").value || "08:00", checkinTime: $("#sCheckin").value || "21:00", leadMin: Number($("#sLead").value),
        focusGoal: Number($("#sFocus").value) || 180, sleepGoal: Number($("#sSleep").value) || 7.5, waterGoal: Number($("#sWater").value) || 8, hiddenCals: hidden,
      });
      closeSheet(); toast("Settings saved");
      if (calsChanged && G.connected()) G.fetchEvents().catch(e => toast(e.message));
    },
  });
}

export function applyTheme() {
  const t = S.settings.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = t;
}
