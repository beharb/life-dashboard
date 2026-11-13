// Evening check-in (one question per screen) and the morning plan.
import { S, setCheckin, today, live, upsert, addDays, fmtMin, fmtDate } from "./store.js";
import { openSheet, closeSheet, esc, act, $, $$, toast } from "./ui.js";
import { feedback, BLOCKERS } from "./feedback.js";
import { ring } from "./charts.js";
import { focusOn, doneOn, tasksDue, overdue } from "./data.js";

const Q = [
  { k: "rating", q: "How would you rate today overall?", type: "scale10", lo: "Awful", hi: "Perfect" },
  { k: "mood", q: "How was your mood?", type: "scale5", lo: "Low", hi: "Great" },
  { k: "energy", q: "And your energy?", type: "scale5", lo: "Drained", hi: "Charged" },
  { k: "sleep", q: "How many hours did you sleep last night?", type: "num", min: 0, max: 14, step: .5, def: 7, unit: "h" },
  { k: "mit", q: "Did you work on your most important task?", type: "one", opts: [["yes", "Yes, properly"], ["partly", "Partly"], ["no", "No"]] },
  { k: "blockers", q: "What got in the way today?", sub: "Pick all that apply.", type: "many", opts: BLOCKERS.map(b => [b, b]) },
  { k: "moved", q: "Did you exercise or move your body?", type: "one", opts: [[true, "Yes"], [false, "No"]] },
  { k: "breaks", q: "Did you take real breaks away from the screen?", type: "one", opts: [["yes", "Yes, regularly"], ["some", "A few"], ["no", "Not really"]] },
  { k: "screen", q: "Time on social media / phone scrolling?", type: "one", opts: [["<1", "Under 1 hour"], ["1-2", "1–2 hours"], ["2-4", "2–4 hours"], ["4+", "4+ hours"]] },
  { k: "water", q: "Glasses of water today?", type: "num", min: 0, max: 20, step: 1, def: 6, unit: "" },
  { k: "win", q: "What was your biggest win today?", type: "text", ph: "Even a small one counts" },
  { k: "lesson", q: "What would you do differently?", type: "text", ph: "One honest sentence" },
  { k: "grateful", q: "One thing you're grateful for?", type: "text", ph: "" },
  { k: "tomorrow", q: "What's the #1 thing for tomorrow?", sub: "It becomes a task for tomorrow.", type: "text", ph: "e.g. Finish rough cut for …" },
];

let ans = {}, step = 0, date = today();

export function openCheckin(d = today()) {
  date = d; step = 0;
  const prev = S.checkins[d] || {};
  ans = { ...prev };
  render();
}

function render() {
  if (step >= Q.length) return finish();
  const q = Q[step], v = ans[q.k];
  let body = "";
  if (q.type === "scale10" || q.type === "scale5") {
    const n = q.type === "scale10" ? 10 : 5;
    body = `<div class="scale-pick ${n === 10 ? "ten" : ""}">${Array.from({ length: n }, (_, i) => `<button data-act="ciPick" data-v="${i + 1}" class="${v === i + 1 ? "on" : ""}">${i + 1}</button>`).join("")}</div><div class="scale-ends"><span>${q.lo}</span><span>${q.hi}</span></div>`;
  } else if (q.type === "one") {
    body = q.opts.map(([val, label]) => `<button class="opt ${v === val ? "on" : ""}" data-act="ciPick" data-v='${JSON.stringify(val)}'>${label}</button>`).join("");
  } else if (q.type === "many") {
    const sel = v || [];
    body = `<div class="chips">${q.opts.map(([val, label]) => `<button class="chip ${sel.includes(val) ? "on" : ""}" data-act="ciToggle" data-v="${esc(val)}">${esc(label)}</button>`).join("")}</div>`;
  } else if (q.type === "num") {
    body = `<div class="stepper"><button data-act="ciNum" data-d="-1">−</button><div class="val" id="ciVal">${v ?? q.def}${q.unit}</div><button data-act="ciNum" data-d="1">+</button></div>`;
    if (v == null) ans[q.k] = q.def;
  } else if (q.type === "text") {
    body = `<textarea id="ciText" rows="4" placeholder="${esc(q.ph)}">${esc(v || "")}</textarea>`;
  }
  const optional = q.type === "text" || q.type === "many";
  openSheet(`<div class="ci">
    <div class="spread"><button class="icon-btn" data-act="${step ? "ciBack" : "closesheet"}">${step ? '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>' : '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'}</button><span class="muted small">${step + 1} / ${Q.length}</span><span style="width:36px"></span></div>
    <div class="ci-progress"><i style="width:${((step) / Q.length) * 100}%"></i></div>
    <p class="ci-q">${q.q}</p>${q.sub ? `<div class="sub">${q.sub}</div>` : ""}
    <div class="ci-body">${body}</div>
    <div class="sheet-actions"><button class="btn block" data-act="ciNext" ${!optional && ans[q.k] == null ? "disabled" : ""}>${step === Q.length - 1 ? "See my feedback" : optional && !ans[q.k]?.length ? "Skip" : "Next"}</button></div>
  </div>`, { full: true });
  const ta = $("#ciText");
  if (ta) { ta.addEventListener("input", () => { ans[q.k] = ta.value; $('[data-act="ciNext"]').textContent = step === Q.length - 1 ? "See my feedback" : ta.value.trim() ? "Next" : "Skip"; }); setTimeout(() => ta.focus(), 250); }
}

act({
  ciPick(el) { const q = Q[step]; ans[q.k] = q.type.startsWith("scale") ? +el.dataset.v : JSON.parse(el.dataset.v); setTimeout(() => { step++; render(); }, 140); render(); },
  ciToggle(el) {
    const q = Q[step], v = el.dataset.v, cur = new Set(ans[q.k] || []);
    if (v.startsWith("Nothing")) { ans[q.k] = cur.has(v) ? [] : [v]; }
    else { cur.has(v) ? cur.delete(v) : cur.add(v); [...cur].filter(x => x.startsWith("Nothing")).forEach(x => cur.delete(x)); ans[q.k] = [...cur]; }
    render();
  },
  ciNum(el) { const q = Q[step]; ans[q.k] = Math.max(q.min, Math.min(q.max, +((ans[q.k] ?? q.def) + q.step * +el.dataset.d).toFixed(1))); $("#ciVal").textContent = ans[q.k] + q.unit; },
  ciBack() { step = Math.max(0, step - 1); render(); },
  ciNext() { const ta = $("#ciText"); if (ta) ans[Q[step].k] = ta.value.trim(); step++; render(); },
});

function finish() {
  const t = (ans.tomorrow || "").trim();
  if (t && !ans.tomorrowTask) {
    const task = upsert("tasks", { title: t, due: addDays(date, 1), pri: 1, tag: "", done: 0 });
    ans.tomorrowTask = task.id;
    S.checkins[addDays(date, 1)] = { ...(S.checkins[addDays(date, 1)] || {}), top3: [...new Set([task.id, ...(S.checkins[addDays(date, 1)]?.top3 || [])])].slice(0, 3), u: Date.now() };
  }
  setCheckin(date, { ...ans, done: true, at: Date.now() });
  const fb = feedback(date);
  setCheckin(date, { score: fb.total, parts: fb.parts });
  showFeedback(date);
}

export function showFeedback(d = today()) {
  const fb = feedback(d), c = S.checkins[d] || {};
  const part = (k, label) => fb.parts[k] == null ? "" : `<div class="part"><div class="spread"><span>${label}</span><span>${fb.parts[k]}</span></div><div class="meter"><i style="width:${fb.parts[k]}%"></i></div></div>`;
  const list = (cls, title, arr) => arr.length ? `<div class="${cls}"><h4>${title}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  openSheet(`<div class="fb">
    <div class="spread"><span class="muted small">${fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}</span><button class="icon-btn" data-act="closesheet"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <h2>Your day in review</h2>
    <div class="card" style="margin-top:12px"><div class="score"><div class="ring">${ring((fb.total || 0) / 100)}<div class="n">${fb.total ?? "–"}</div></div>
      <div class="parts">${part("productivity", "Productivity")}${part("focus", "Focus")}${part("wellbeing", "Wellbeing")}${part("discipline", "Discipline")}</div></div>
      <p class="summary">${esc(fb.summary)}</p>
      <div class="sub" style="margin-top:8px">You rated it <b>${c.rating ?? "–"}/10</b> · ${fb.stats.done} tasks done · ${fmtMin(fb.stats.focus)} focus</div>
    </div>
    ${list("good", "What went well", fb.good)}
    ${list("lack", "Where you lacked", fb.lack)}
    ${list("tips", "Try tomorrow", fb.tips)}
    ${c.win ? `<h4>Win</h4><div class="callout">${esc(c.win)}</div>` : ""}
    ${c.lesson ? `<h4>Lesson</h4><div class="callout">${esc(c.lesson)}</div>` : ""}
    ${c.grateful ? `<h4>Grateful for</h4><div class="callout">${esc(c.grateful)}</div>` : ""}
    <div class="sheet-actions"><button class="btn ghost" data-act="ciEdit" data-d="${d}">Edit answers</button><button class="btn" data-act="closesheet">Done</button></div>
  </div>`, { full: true });
}
act({ ciEdit(el) { openCheckin(el.dataset.d); }, ciOpen() { openCheckin(); }, fbOpen(el) { showFeedback(el.dataset.d || today()); } });

/* ---------- Morning plan: intention + top 3 ---------- */
let pick = [];
export function openMorning() {
  const d = today(), c = S.checkins[d] || {};
  pick = [...(c.top3 || [])];
  const cands = live("tasks").filter(t => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.pri || 3) - (b.pri || 3));
  const row = t => `<div class="item tap" data-act="mPick" data-id="${t.id}"><button class="check ${pick.includes(t.id) ? "on" : ""}"></button><div class="grow"><div class="t">${esc(t.title)}</div><div class="meta">${t.due ? `<span class="${t.due < d ? "overdue" : ""}">${t.due === d ? "Today" : fmtDate(t.due, { month: "short", day: "numeric" })}</span>` : ""}${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ""}</div></div></div>`;
  openSheet(`<h2>Plan your day</h2><div class="sub">Pick up to 3 tasks that would make today a win.</div>
    <label class="f"><span>Today's intention</span><input class="input" id="mInt" placeholder="e.g. Calm, focused, finish the edit" value="${esc(c.intention || "")}"></label>
    <div class="sec"><h2>Top 3 · <span id="mCount">${pick.length}</span>/3</h2></div>
    <div class="qadd"><input id="mNew" placeholder="Add a new task for today…"><button class="btn sm" data-act="mAdd">Add</button></div>
    <div class="list" id="mList">${cands.map(row).join("") || '<div class="empty" style="padding:14px">No open tasks. Add one above.</div>'}</div>
    <div class="sheet-actions"><button class="btn block" data-act="mSave">Save plan</button></div>`);
  $("#mNew").addEventListener("keydown", e => { if (e.key === "Enter") actionsMorningAdd(); });
}
function actionsMorningAdd() {
  const inp = $("#mNew"), v = inp.value.trim(); if (!v) return;
  const t = upsert("tasks", { title: v, due: today(), pri: 2, done: 0 });
  if (pick.length < 3) pick.push(t.id);
  const keep = $("#mInt").value;
  setCheckin(today(), { top3: pick });
  openMorning(); $("#mInt").value = keep;
}
act({
  mPick(el) {
    const id = el.dataset.id;
    if (pick.includes(id)) pick = pick.filter(x => x !== id);
    else if (pick.length < 3) pick.push(id); else return toast("Three is the limit. Unpick one first.");
    el.querySelector(".check").classList.toggle("on", pick.includes(id));
    $("#mCount").textContent = pick.length;
  },
  mAdd: actionsMorningAdd,
  mSave() { setCheckin(today(), { top3: pick, intention: $("#mInt").value.trim() }); closeSheet(); toast("Plan saved. Go get it."); },
});
