export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Click delegation: any element with data-act="name" runs actions[name](el, event).
export const actions = {};
export function act(map) { Object.assign(actions, map); }
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const f = actions[el.dataset.act];
  if (f) { e.preventDefault(); f(el, e); }
});

let toastT;
export function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), ms);
}

let onSheetClose = null;
export function openSheet(html, { full = false, onClose = null } = {}) {
  const body = $("#sheetBody");
  const wasOpen = !$("#sheet").classList.contains("hidden");
  body.className = "sheet" + (full ? " full" : "");
  body.style.animation = wasOpen ? "none" : "";
  body.innerHTML = (full ? "" : '<div class="grab"></div>') + html;
  $("#sheet").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  onSheetClose = onClose;
  body.scrollTop = 0;
  return body;
}
export function closeSheet() {
  $("#sheet").classList.add("hidden");
  document.body.style.overflow = "";
  const f = onSheetClose; onSheetClose = null;
  if (f) f();
}
act({ closesheet: closeSheet });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").classList.contains("hidden")) closeSheet(); });

export function formData(root) {
  const o = {};
  $$("[name]", root).forEach(el => {
    if (el.type === "checkbox") o[el.name] = el.checked;
    else if (el.type === "number") o[el.name] = el.value === "" ? null : Number(el.value);
    else o[el.name] = el.value.trim();
  });
  return o;
}

export const icon = {
  play: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  left: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sync: '<svg class="ico" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/></svg>',
  pin: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 3v2H6v-2l4-3zM12 15v6"/></svg>',
};
