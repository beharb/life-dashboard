import { S, onChange, save } from "./store.js";
import { $, $$, toast } from "./ui.js";
import * as V from "./views.js";
import * as G from "./google.js";
import * as N from "./notify.js";
import { openCheckin } from "./checkin.js";

const TITLES = { today: "Today", calendar: "Calendar", tasks: "Plan", notes: "Notes", stats: "Insights" };
const RENDER = { today: V.renderToday, calendar: V.renderCalendar, tasks: V.renderTasks, notes: V.renderNotes, stats: V.renderStats };

function route() {
  const [tab, sub] = (location.hash.slice(1) || "today").split("/");
  V.state.tab = RENDER[tab] ? tab : "today";
  V.state.sub = sub || "";
  if (V.state.tab === "today" && sub === "checkin") { history.replaceState(null, "", "#today"); setTimeout(() => openCheckin(), 50); }
  render();
  scrollTo(0, 0);
}

let raf;
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    $$(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === V.state.tab));
    $("#topTitle").textContent = TITLES[V.state.tab];
    const pill = $("#gPill");
    pill.classList.toggle("hidden", G.connected() || !(G.everConnected() || S.settings.clientId));
    pill.textContent = G.everConnected() ? "Reconnect Google" : "Connect Google";
    try { RENDER[V.state.tab]($("#view")); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="empty">Something went wrong: ${e.message}</div>`; }
  });
}
const go = to => { location.hash = to; };
V.registerActions(render, go);

// Re-render after any data change and queue a Drive sync.
let syncT;
onChange(opts => {
  render();
  N.updateBadge();
  if (opts.from === "sync" || opts.from === "gcal") return;
  if (G.connected()) { clearTimeout(syncT); syncT = setTimeout(doSync, 3000); }
});

async function doSync(withCalendar = false) {
  if (!G.connected() || !navigator.onLine) return;
  try {
    await G.sync();
    if (withCalendar || Date.now() - S.gcache.fetched > 10 * 60e3) await G.fetchEvents();
  } catch (e) {
    console.warn(e);
    if (e.code === 401) render(); else toast("Sync: " + e.message);
  }
}

// ---- boot ----
V.applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
const r = G.handleRedirect();
if (r?.ok) { toast("Google connected"); G.fetchCalendars().then(() => doSync(true)).catch(e => toast(e.message)); }
else if (r?.error) toast("Google sign-in failed: " + r.error);
else if (!G.connected() && S.settings.autoConnect && G.everConnected() && navigator.onLine) {
  const last = Number(localStorage.getItem("lifedash.autoTry") || 0);
  if (Date.now() - last > 5 * 60e3) { localStorage.setItem("lifedash.autoTry", Date.now()); G.signIn(); }
}
else doSync();

addEventListener("hashchange", route);
addEventListener("resize", () => { if (V.state.tab === "stats") render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); doSync(); } });
addEventListener("online", () => doSync());
setInterval(V.timerTick, 1000);
setInterval(() => { if (!document.hidden && V.state.tab === "today") render(); }, 60e3);
route();
N.start();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e));

// First run: seed one example of each thing so the screens aren't empty.
if (!S.seeded) {
  S.seeded = true;
  S.habits.push({ id: "h1", name: "Move 30 min", days: [], log: {}, u: Date.now(), c: Date.now() }, { id: "h2", name: "Read 20 min", days: [], log: {}, u: Date.now(), c: Date.now() }, { id: "h3", name: "No phone first hour", days: [], log: {}, u: Date.now(), c: Date.now() });
  save();
}
