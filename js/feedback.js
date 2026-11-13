// Rule-based day review. Runs fully on the device.
import { S, addDays, range, fmtMin, live, ymd } from "./store.js";
import { tasksDue, doneOn, focusOn, habitsFor, habitRate, habitStreak, checkinStreak, projectsActive, overdue, STAGES } from "./data.js";
import { habitDone, diffDays } from "./store.js";

const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const avg = a => { const b = a.filter(v => v != null && !isNaN(v)); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : null; };

export const BLOCKERS = ["Phone / social media", "Low energy", "Unclear priorities", "Meetings & calls", "Client revisions", "Procrastination", "Render / tech issues", "Interruptions", "Personal stuff", "Nothing — smooth day"];

const BLOCKER_TIPS = {
  "Phone / social media": "Put the phone in another room for your first focus block, and start the focus timer before opening any app.",
  "Low energy": "Protect sleep tonight: screens off 30 min before bed, and do your hardest edit in your best-energy hours tomorrow.",
  "Unclear priorities": "Pick tomorrow's top 3 tonight, so the morning starts with a decision already made.",
  "Meetings & calls": "Block a 2-hour no-calls window in your calendar for deep editing tomorrow.",
  "Client revisions": "Collect client notes into one written list per round and confirm it before opening the timeline. Fewer, bigger revision rounds.",
  "Procrastination": "Shrink the first step: open the project and do 10 minutes. Starting is the hard part.",
  "Render / tech issues": "Queue exports and renders for breaks or end of day, and keep proxies and auto-save backups ready.",
  "Interruptions": "Use the focus timer as a visible 'busy' signal and batch messages to two check times.",
  "Personal stuff": "Be kind to yourself. Keep tomorrow light and choose one meaningful task.",
};

export function scoreDay(date) {
  const c = S.checkins[date] || {};
  const due = tasksDue(date), done = doneOn(date);
  const planned = new Map([...due, ...(c.top3 || []).map(id => live("tasks").find(t => t.id === id)).filter(Boolean)].map(t => [t.id, t]));
  const plannedDone = [...planned.values()].filter(t => t.done && ymd(new Date(t.done)) <= date).length;
  const rate = planned.size ? plannedDone / planned.size : null;

  // Productivity: plan completion + most important task
  const mitPts = { yes: 100, partly: 55, no: 10 }[c.mit];
  let prod = avg([rate != null ? rate * 100 : done.length ? Math.min(100, 50 + done.length * 12) : (c.mit ? null : 30), mitPts]);
  // Focus: deep work minutes vs goal, penalized by heavy screen time
  const fm = focusOn(date), goal = S.settings.focusGoal || 180;
  let focus = Math.min(100, (fm / goal) * 100);
  if (c.screen === "4+") focus -= 15; else if (c.screen === "2-4") focus -= 6;
  // Wellbeing: sleep, mood, energy, movement, water, breaks
  const sl = c.sleep;
  const sleepPts = sl == null ? null : sl >= 7 && sl <= 9 ? 100 : sl >= 6.5 ? 80 : sl >= 6 ? 65 : sl >= 5 ? 40 : sl > 9.5 ? 70 : 20;
  const well = avg([sleepPts, c.mood ? c.mood * 20 : null, c.energy ? c.energy * 20 : null, c.moved == null ? null : c.moved ? 100 : 35,
    c.water == null ? null : Math.min(100, (c.water / (S.settings.waterGoal || 8)) * 100), { yes: 100, some: 65, no: 25 }[c.breaks]]);
  // Discipline: habits + screen time
  const hr = habitRate(date);
  const scr = { "<1": 100, "1-2": 80, "2-4": 50, "4+": 20 }[c.screen];
  const disc = avg([hr != null ? hr * 100 : null, scr]);

  const parts = { productivity: prod, focus, wellbeing: well, discipline: disc };
  const W = { productivity: .35, focus: .2, wellbeing: .25, discipline: .2 };
  let tw = 0, ts = 0;
  for (const k in parts) if (parts[k] != null) { tw += W[k]; ts += W[k] * parts[k]; }
  const total = tw ? clamp(ts / tw) : null;
  for (const k in parts) parts[k] = parts[k] == null ? null : clamp(parts[k]);
  return { total, parts, stats: { planned: planned.size, plannedDone, done: done.length, focus: fm, habitRate: hr } };
}

export function feedback(date) {
  const c = S.checkins[date] || {};
  const sc = scoreDay(date);
  const { stats, parts } = sc;
  const good = [], lack = [], tips = [];
  const prev = range(7, addDays(date, -1));
  const prevScores = prev.map(d => S.checkins[d]?.done ? scoreDay(d).total : null);
  const avgPrev = avg(prevScores);
  const avgFocus = avg(prev.map(d => focusOn(d)));
  const avgSleep = avg(prev.map(d => S.checkins[d]?.sleep));

  // --- tasks
  if (stats.planned) {
    const r = stats.plannedDone / stats.planned;
    if (r >= .99) good.push(`You finished everything you planned (${stats.plannedDone}/${stats.planned}).`);
    else if (r >= .6) good.push(`You finished ${stats.plannedDone} of ${stats.planned} planned tasks.`);
    else lack.push(`Only ${stats.plannedDone} of ${stats.planned} planned tasks got done.`);
    if (r < .6 && stats.planned > 5) tips.push("You may be planning too much. Cap tomorrow at 3 must-dos and treat the rest as a bonus.");
  } else if (stats.done) good.push(`You closed ${stats.done} task${stats.done > 1 ? "s" : ""}.`);
  else lack.push("No tasks were planned or finished. The day had no clear target.");
  if (!c.top3?.length) tips.push("Start tomorrow by picking your top 3 on the Today screen. Days with a plan score higher.");
  if (c.mit === "yes") good.push("You moved your most important task forward.");
  if (c.mit === "no") { lack.push("Your most important task didn't get touched."); tips.push("Do the most important task first, before email and messages, even if only for 25 minutes."); }
  const od = overdue().length;
  if (od >= 3) { lack.push(`${od} tasks are overdue.`); tips.push("Spend 5 minutes on overdue tasks: reschedule, delegate or delete. A stale list kills motivation."); }

  // --- focus
  const goal = S.settings.focusGoal || 180;
  if (stats.focus >= goal) good.push(`${fmtMin(stats.focus)} of deep work. You hit your focus goal.`);
  else if (stats.focus >= goal * .5) good.push(`${fmtMin(stats.focus)} of logged focus time.`);
  else if (stats.focus > 0) lack.push(`Only ${fmtMin(stats.focus)} of focused work (goal ${fmtMin(goal)}).`);
  else lack.push("No focus sessions logged today.");
  if (stats.focus < goal * .5) tips.push(`Schedule two focus blocks tomorrow (e.g. 2 × 50 min) and run them with the timer.`);
  if (avgFocus != null && avgFocus > 0 && stats.focus > avgFocus * 1.25) good.push(`Focus time was above your 7-day average (${fmtMin(avgFocus)}).`);
  if (c.screen === "4+") { lack.push("Screen time / social media was over 4 hours."); tips.push("Set a 1-hour daily limit on your two most-used social apps."); }
  else if (c.screen === "<1") good.push("Social media stayed under an hour.");

  // --- wellbeing
  if (c.sleep != null) {
    if (c.sleep >= 7 && c.sleep <= 9) good.push(`Solid sleep (${c.sleep}h).`);
    else if (c.sleep < 6.5) { lack.push(`Short sleep (${c.sleep}h). It affects focus and mood.`); tips.push(`Aim for lights-out by ${bedtime()} to get ${S.settings.sleepGoal}h.`); }
    if (avgSleep != null && c.sleep < avgSleep - 1) lack.push(`That's over an hour below your usual ${avgSleep.toFixed(1)}h.`);
  }
  if (c.moved === true) good.push("You moved your body today.");
  if (c.moved === false) { lack.push("No exercise or movement."); tips.push("A 20-minute walk counts. Take it after lunch or between edits."); }
  if (c.breaks === "no") { lack.push("No real breaks. Long sessions in front of the timeline drain you."); tips.push("Use the 50/10 rhythm: 50 minutes of focus, then 10 away from the screen."); }
  if (c.water != null) {
    if (c.water >= (S.settings.waterGoal || 8)) good.push("You hit your water goal.");
    else if (c.water <= 4) { lack.push(`Only ${c.water} glasses of water.`); tips.push("Keep a bottle on your desk and refill it at every export."); }
  }
  if (c.energy && c.energy <= 2 && (c.sleep ?? 8) >= 7) tips.push("Energy was low despite enough sleep. Check meals, caffeine timing and daylight.");

  // --- habits
  const hs = habitsFor(date);
  if (hs.length) {
    const doneH = hs.filter(h => habitDone(h, date));
    const missed = hs.filter(h => !habitDone(h, date));
    if (doneH.length === hs.length) good.push(`All ${hs.length} habits done.`);
    else if (missed.length) lack.push(`Missed habit${missed.length > 1 ? "s" : ""}: ${missed.map(h => h.name).join(", ")}.`);
    const best = hs.map(h => [h, habitStreak(h, date)]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 3) good.push(`${best[0].name}: ${best[1]}-day streak. Keep it alive.`);
  } else tips.push("Add 2–3 small daily habits in Plan → Habits. They make streaks and consistency visible.");

  // --- projects
  for (const p of projectsActive()) {
    if (!p.deadline) continue;
    const left = diffDays(date, p.deadline);
    if (left >= 0 && left <= 3) tips.push(`"${p.name}" is due ${left === 0 ? "today" : `in ${left} day${left > 1 ? "s" : ""}`} (stage: ${STAGES[p.stage || 0]}). Block time for it tomorrow morning.`);
    if (left < 0) lack.push(`"${p.name}" is past its deadline.`);
  }

  // --- blockers
  for (const b of c.blockers || []) if (BLOCKER_TIPS[b]) tips.push(BLOCKER_TIPS[b]);

  // --- self-perception
  if (c.rating && sc.total != null) {
    const diff = c.rating * 10 - sc.total;
    if (diff <= -25) good.push("By the numbers the day went better than it felt to you. Give yourself some credit.");
    if (diff >= 25) tips.push("You rated the day higher than the numbers. Notice what made it feel good. That's worth repeating.");
  }
  const streak = checkinStreak();
  if (streak >= 3) good.push(`${streak}-day check-in streak.`);

  // --- summary
  let summary;
  const t = sc.total ?? 0;
  if (t >= 85) summary = "An excellent day. You planned, executed and looked after yourself.";
  else if (t >= 70) summary = "A good, solid day with a few things to tighten.";
  else if (t >= 55) summary = "A mixed day. Some real progress, and some leaks to fix.";
  else if (t >= 40) summary = "A tough day. Fix one or two things below and tomorrow will feel different.";
  else summary = "A rough one. That happens. Reset tonight and keep tomorrow simple.";
  if (avgPrev != null && sc.total != null) {
    const d = Math.round(sc.total - avgPrev);
    if (Math.abs(d) >= 5) summary += ` That's ${Math.abs(d)} points ${d > 0 ? "above" : "below"} your 7-day average.`;
  }
  const weakest = Object.entries(parts).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0];
  if (weakest && weakest[1] < 60) summary += ` Your weakest area today was ${weakest[0]}.`;

  return { ...sc, good, lack, tips: [...new Set(tips)].slice(0, 6), summary };
}

function bedtime() {
  const [h, m] = (S.settings.morningTime || "08:00").split(":").map(Number);
  let mins = h * 60 + m - (S.settings.sleepGoal || 7.5) * 60 - 20;
  mins = (mins + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
}
