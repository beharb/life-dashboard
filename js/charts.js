// Small dependency-free SVG charts with hover/tap tooltips.
import { $ } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const tipEl = () => $("#tip");

export function showTip(html, x, y) {
  const t = tipEl(); t.innerHTML = html; t.classList.remove("hidden");
  const w = t.offsetWidth, h = t.offsetHeight;
  let left = x + 14, top = y - h - 12;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (left < 8) left = 8;
  if (top < 8) top = y + 16;
  t.style.left = left + "px"; t.style.top = top + "px";
}
export function hideTip() { tipEl().classList.add("hidden"); }
document.addEventListener("pointerdown", e => { if (!e.target.closest(".chart")) hideTip(); });
addEventListener("scroll", hideTip, { passive: true });

export function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function svg(w, h) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${h}`); s.setAttribute("width", w); s.setAttribute("height", h);
  return s;
}
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, str, anchor = "end") {
  const t = el("text", { x, y, "text-anchor": anchor }, parent); t.textContent = str; return t;
}

function frame(host, { height = 170, yMin = 0, yMax, ticks, fmt = v => v, n }) {
  host.innerHTML = "";
  host.classList.add("chart");
  const W = Math.max(260, host.clientWidth || 320), H = height;
  const P = { l: 30, r: 8, t: 10, b: 22 };
  const s = svg(W, H); host.appendChild(s);
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const y = v => P.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const step = iw / Math.max(1, n);
  const xc = i => P.l + step * i + step / 2;
  const tk = ticks || [yMin, (yMin + yMax) / 2, yMax];
  tk.forEach(v => {
    el("line", { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: v === yMin ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, s);
    text(s, P.l - 6, y(v) + 4, fmt(v));
  });
  return { s, W, H, P, iw, ih, y, xc, step };
}

function xLabels(f, labels) {
  const n = labels.length, every = n <= 8 ? 1 : Math.ceil(n / Math.max(2, Math.floor(f.iw / 52)));
  labels.forEach((l, i) => {
    if ((n - 1 - i) % every === 0) text(f.s, f.xc(i), f.H - 6, l, "middle");
  });
}

function hover(host, f, n, onIndex) {
  const cross = el("line", { y1: f.P.t, y2: f.H - f.P.b, stroke: "var(--axis)", "stroke-width": 1, opacity: 0 }, f.s);
  const move = e => {
    const r = f.s.getBoundingClientRect();
    const x = (e.clientX - r.left) * (f.W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.floor((x - f.P.l) / f.step)));
    const html = onIndex(i, cross);
    if (html == null) { hideTip(); cross.setAttribute("opacity", 0); return; }
    showTip(html, e.clientX, e.clientY);
  };
  f.s.addEventListener("pointermove", move);
  f.s.addEventListener("pointerdown", move);
  f.s.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { hideTip(); cross.setAttribute("opacity", 0); onIndex(-1, cross); } });
  return cross;
}

/* Line chart. series: [{name, values, color, dash}] sharing one y-scale. */
export function lineChart(host, { labels, tips, series, yMin = 0, yMax, ticks, fmt, height }) {
  const n = labels.length;
  const all = series.flatMap(s => s.values).filter(v => v != null);
  yMax = yMax ?? niceMax(Math.max(...all, 1));
  const f = frame(host, { height, yMin, yMax, ticks, fmt, n });
  xLabels(f, labels);
  const dotsBy = [];
  series.forEach(se => {
    let d = "", pen = false;
    se.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += (pen ? "L" : "M") + f.xc(i).toFixed(1) + " " + f.y(v).toFixed(1);
      pen = true;
    });
    el("path", { d, fill: "none", stroke: se.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", ...(se.dash ? { "stroke-dasharray": "4 4" } : {}) }, f.s);
    const dots = se.values.map((v, i) => {
      if (v == null) return null;
      const show = !se.dash && (n <= 31 || se.values.filter(x => x != null).length < 3);
      return el("circle", { cx: f.xc(i), cy: f.y(v), r: show ? 3 : 0, fill: se.color, stroke: "var(--surface)", "stroke-width": 2 }, f.s);
    });
    dotsBy.push({ se, dots });
  });
  hover(host, f, n, (i, cross) => {
    dotsBy.forEach(({ se, dots }) => dots.forEach((c, j) => c && c.setAttribute("r", j === i ? 5 : (!se.dash && n <= 31 ? 3 : 0))));
    if (i < 0) return null;
    const rows = series.filter(se => se.values[i] != null).map(se => `${se.name}: <b>${fmt ? fmt(se.values[i]) : se.values[i]}</b>`);
    if (!rows.length) return null;
    cross.setAttribute("x1", f.xc(i)); cross.setAttribute("x2", f.xc(i)); cross.setAttribute("opacity", 1);
    return `<div>${(tips || labels)[i]}</div>${rows.join("<br>")}`;
  });
}

/* Vertical bar chart, one series. */
export function barChart(host, { labels, tips, values, color = "var(--s1)", fmt = v => v, goal, goalLabel, height, yMax }) {
  const n = labels.length;
  yMax = yMax ?? niceMax(Math.max(...values, goal || 0, 1));
  const f = frame(host, { height, yMin: 0, yMax, fmt, n, ticks: [0, yMax / 2, yMax] });
  xLabels(f, labels);
  const bw = Math.max(2, Math.min(28, f.step - (n > 40 ? 1 : 2)));
  const bars = values.map((v, i) => {
    if (!v) return null;
    const x = f.xc(i) - bw / 2, y0 = f.y(0), y1 = f.y(v), h = y0 - y1, r = Math.min(4, bw / 2, h);
    return el("path", { d: `M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + bw - r}Q${x + bw} ${y1} ${x + bw} ${y1 + r}V${y0}Z`, fill: color }, f.s);
  });
  if (goal) {
    el("line", { x1: f.P.l, x2: f.W - f.P.r, y1: f.y(goal), y2: f.y(goal), stroke: "var(--ink-2)", "stroke-width": 1, "stroke-dasharray": "3 4" }, f.s);
    if (goalLabel) text(f.s, f.W - f.P.r, f.y(goal) - 4, goalLabel, "end");
  }
  hover(host, f, n, (i, cross) => {
    bars.forEach((b, j) => b && b.setAttribute("opacity", i < 0 || j === i ? 1 : 0.45));
    if (i < 0) return null;
    return `<div>${(tips || labels)[i]}</div><b>${fmt(values[i])}</b>`;
  });
}

/* Horizontal bars built in HTML: values are labeled directly. */
export function hbar(host, { rows, fmt = v => v, color = "var(--s1)" }) {
  host.classList.add("chart");
  const max = Math.max(...rows.map(r => r.value), 1);
  host.innerHTML = rows.length ? rows.map(r => `
    <div style="display:grid;grid-template-columns:minmax(80px,38%) 1fr auto;gap:10px;align-items:center;margin:7px 0;font-size:13px">
      <div style="color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.label}</div>
      <div style="height:10px;border-radius:0 4px 4px 0;background:${r.color || color};width:${Math.max(2, (r.value / max) * 100)}%"></div>
      <div style="font-variant-numeric:tabular-nums;color:var(--ink)">${fmt(r.value)}</div>
    </div>`).join("") : '<div class="empty">No data yet.</div>';
}

/* Scatter plot with nearest-point hover. */
export function scatter(host, { points, xMin, xMax, yMin = 0, yMax = 10, xFmt = v => v, yFmt = v => v, xLabel, height = 190, color = "var(--s1)" }) {
  host.innerHTML = ""; host.classList.add("chart");
  const W = Math.max(260, host.clientWidth || 320), H = height, P = { l: 30, r: 10, t: 10, b: 34 };
  const s = svg(W, H); host.appendChild(s);
  const X = v => P.l + ((v - xMin) / (xMax - xMin || 1)) * (W - P.l - P.r);
  const Y = v => P.t + (H - P.t - P.b) - ((v - yMin) / (yMax - yMin || 1)) * (H - P.t - P.b);
  [yMin, (yMin + yMax) / 2, yMax].forEach(v => { el("line", { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), stroke: v === yMin ? "var(--axis)" : "var(--grid)" }, s); text(s, P.l - 6, Y(v) + 4, yFmt(v)); });
  const xs = []; for (let v = Math.ceil(xMin); v <= xMax; v += Math.max(1, Math.round((xMax - xMin) / 5))) xs.push(v);
  xs.forEach(v => text(s, X(v), H - 18, xFmt(v), "middle"));
  if (xLabel) text(s, (W + P.l) / 2, H - 3, xLabel, "middle");
  const dots = points.map(p => el("circle", { cx: X(p.x), cy: Y(p.y), r: 5, fill: color, "fill-opacity": .75, stroke: "var(--surface)", "stroke-width": 2 }, s));
  const move = e => {
    const r = s.getBoundingClientRect(), mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height);
    let best = -1, bd = 900;
    points.forEach((p, i) => { const d = (X(p.x) - mx) ** 2 + (Y(p.y) - my) ** 2; if (d < bd) { bd = d; best = i; } });
    dots.forEach((d, i) => d.setAttribute("r", i === best ? 7 : 5));
    if (best < 0) return hideTip();
    showTip(points[best].tip, e.clientX, e.clientY);
  };
  s.addEventListener("pointermove", move); s.addEventListener("pointerdown", move);
  s.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { hideTip(); dots.forEach(d => d.setAttribute("r", 5)); } });
  if (!points.length) host.insertAdjacentHTML("beforeend", '<div class="empty" style="position:absolute;inset:0;display:grid;place-items:center">Log sleep in your check-ins to see this.</div>');
}

/* Calendar heatmap: columns are weeks, rows Mon–Sun. cells: [{date, v (0..1|null), tip}] starting on a Monday. */
export function heatmap(host, { cells, label = "" }) {
  host.classList.add("chart");
  const step = v => v == null ? "var(--seq-0)" : v <= 0 ? "var(--seq-0)" : v < .34 ? "var(--seq-1)" : v < .67 ? "var(--seq-2)" : v < 1 ? "var(--seq-3)" : "var(--seq-4)";
  const weeks = Math.ceil(cells.length / 7);
  host.innerHTML = `<div class="heat-wrap"><div class="heat" style="grid-template-columns:repeat(${weeks},minmax(10px,1fr))">${cells.map((c, i) => `<i data-i="${i}" style="background:${step(c.v)}${c.future ? ";opacity:.3" : ""}"></i>`).join("")}</div></div>
  <div class="scale">Less <i style="background:var(--seq-0)"></i><i style="background:var(--seq-1)"></i><i style="background:var(--seq-2)"></i><i style="background:var(--seq-3)"></i><i style="background:var(--seq-4)"></i> More ${label}</div>`;
  const h = host.querySelector(".heat");
  const move = e => { const c = e.target.closest("i"); if (!c) return hideTip(); showTip(cells[+c.dataset.i].tip, e.clientX, e.clientY); };
  h.addEventListener("pointermove", move); h.addEventListener("pointerdown", move);
  h.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hideTip(); });
}

export function ring(pct, size = 92, stroke = 8, color = "var(--ink)") {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>`;
}
