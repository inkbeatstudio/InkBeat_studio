"use strict";
const TABS = {
  mixer: ["Мікшер", "Пульт: усі доріжки, шини й Master"],
  fx: ["Ефекти", "Ефекти доріжки: еквалайзер, компресор, ревер…"],
  notes: ["Ноти", "Піано-рол: ноти доріжки"],
  inst: ["Інструмент", "Яким інструментом грають MIDI-ноти"],
  proc: ["Обробка звуку", "Автотюн, шумоприбирання, зміна тону"],
  pitch: ["Висота нот", "Редактор висоти голосу"],
  ver: ["Версії", "Історія обробок доріжки"]
};
const AUDIO_ONLY = new Set(["proc", "pitch", "ver"]);
const WM = { z: 300, list: [], panes: [], seq: 0, hidden: false, layer: null, depth: 0, dragPane: null, ctxSave: null, refreshQ: 0 };
const UIW = (() => {
  if (!UIP.wins) UIP.wins = { panes: [], dock: null, side: null };
  if (!UIP.mfloat) UIP.mfloat = {};
  return UIP.wins;
})();
function wmLayer() {
  if (!WM.layer) {
    WM.layer = document.createElement("div");
    WM.layer.id = "fw-layer";
    document.body.appendChild(WM.layer);
  }
  return WM.layer;
}
function vw() { return document.documentElement.clientWidth; }
function vh() { return document.documentElement.clientHeight; }
function absRect(r) {
  if (!r) return null;
  const frac = r.w <= 1.01 && r.h <= 1.01;
  return frac ? { x: r.x * vw(), y: r.y * vh(), w: r.w * vw(), h: r.h * vh() } : Object.assign({}, r);
}
function clampRect(r, minW = 260, minH = 140) {
  const W = vw(), H = vh();
  r.w = Math.max(minW, Math.min(W - 8, r.w));
  r.h = Math.max(minH, Math.min(H - 8, r.h));
  r.x = Math.max(4 - r.w + 120, Math.min(W - 120, r.x));
  r.y = Math.max(4, Math.min(H - 36, r.y));
  return r;
}
function wmRaise(w) {
  WM.z += 1;
  w.el.style.zIndex = w.top ? WM.z + 5000 : WM.z;
  WM.list.forEach((x) => x.el.classList.toggle("focus", x === w));
}
function wmEdges(self) {
  const xs = [0, vw()], ys = [0, vh()];
  const tb = $(".topbar");
  if (tb) ys.push(tb.getBoundingClientRect().bottom);
  for (const w of WM.list) {
    if (w === self || w.el.hidden || w.collapsed) continue;
    const r = w.el.getBoundingClientRect();
    xs.push(r.left, r.right);
    ys.push(r.top, r.bottom);
  }
  return { xs, ys };
}
function snap(v, size, list, d = 12) {
  for (const e of list) {
    if (Math.abs(v - e) < d) return e;
    if (Math.abs(v + size - e) < d) return e - size;
  }
  return v;
}
function dockZone(on, y) {
  let z = document.getElementById("fw-dockzone");
  if (!z) {
    z = document.createElement("div");
    z.id = "fw-dockzone";
    z.innerHTML = "<span>Відпустіть тут, щоб повернути вікно в нижню панель</span>";
    document.body.appendChild(z);
  }
  z.classList.toggle("show", !!on);
  z.classList.toggle("hot", !!on && y > vh() - 90);
  return z.classList.contains("hot");
}
function makeWin(o) {
  const w = Object.assign({ id: "w" + (++WM.seq), top: false, collapsed: false, max: false, fade: false }, o);
  const el = document.createElement("div");
  el.className = "fw" + (o.cls ? " " + o.cls : "");
  el.innerHTML = `<div class="fw-head"><i class="fw-dot"></i><b class="fw-title"></b><span class="fw-extra"></span><span class="fw-sp"></span>
    <button class="fw-b" data-a="menu" data-hint="Налаштування вікна: прозорість, «поверх усіх», розмір">⋯</button>
    <button class="fw-b" data-a="min" data-hint="Згорнути до заголовка / розгорнути назад">▁</button>
    <button class="fw-b" data-a="max" data-hint="На весь екран / звичайний розмір (або подвійний клік по заголовку)">□</button>
    ${o.dockable === false ? "" : `<button class="fw-b" data-a="dock" data-hint="${escapeHtml(o.dockHint || "Повернути на місце")}">⇲</button>`}
    <button class="fw-b x" data-a="close" data-hint="${escapeHtml(o.closeHint || "Закрити вікно")}">×</button></div>
    <div class="fw-body"></div>${["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<div class="fw-rz ${d}" data-rz="${d}"></div>`).join("")}`;
  w.el = el;
  w.head = el.querySelector(".fw-head");
  w.body = el.querySelector(".fw-body");
  w.extra = el.querySelector(".fw-extra");
  w.setTitle = (t, color) => {
    el.querySelector(".fw-title").textContent = t;
    el.querySelector(".fw-dot").style.background = color || "var(--amber)";
  };
  w.setTitle(o.title || "", o.color);
  const r = clampRect(absRect(o.rect) || { x: 120 + (WM.list.length % 6) * 34, y: 110 + (WM.list.length % 6) * 30, w: 560, h: 380 }, o.minW, o.minH);
  w.rect = r;
  w.apply = () => {
    const R = w.max ? { x: 6, y: ($(".topbar")?.getBoundingClientRect().bottom || 0) + 6, w: vw() - 12, h: vh() - ($(".topbar")?.getBoundingClientRect().bottom || 0) - 12 } : w.rect;
    Object.assign(el.style, { left: R.x + "px", top: R.y + "px", width: R.w + "px", height: w.collapsed ? "" : R.h + "px" });
    el.classList.toggle("collapsed", w.collapsed);
    el.classList.toggle("maxed", w.max);
    el.classList.toggle("fade", w.fade);
    el.classList.toggle("ontop", w.top);
  };
  if (o.state) Object.assign(w, { top: !!o.state.top, collapsed: !!o.state.collapsed, fade: !!o.state.fade, opacity: o.state.opacity || 1 });
  el.style.setProperty("--fw-op", w.opacity || 1);
  w.apply();
  if (o.first) wmLayer().prepend(el);
  else wmLayer().appendChild(el);
  WM.list.push(w);
  wmRaise(w);
  el.addEventListener("pointerdown", () => wmRaise(w), true);
  w.head.addEventListener("dblclick", (e) => {
    if (e.target.closest("button,select,input")) return;
    w.max = !w.max;
    w.apply();
    w.changed();
  });
  w.head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button,select,input,.dk-tabs")) return;
    w.startDrag(e);
  });
  w.startDrag = (e, offX, offY) => {
    e.preventDefault();
    if (w.max) {
      const fx = (e.clientX - w.el.getBoundingClientRect().left) / w.el.offsetWidth;
      w.max = false;
      w.rect.x = e.clientX - w.rect.w * fx;
      w.rect.y = e.clientY - 16;
      w.apply();
    }
    const dx = offX != null ? offX : e.clientX - w.rect.x, dy = offY != null ? offY : e.clientY - w.rect.y;
    const E = wmEdges(w);
    document.body.classList.add("fw-dragging");
    let hot = false;
    const mv = (ev) => {
      let x = ev.clientX - dx, y = ev.clientY - dy;
      if (!ev.altKey) {
        x = snap(x, w.rect.w, E.xs);
        y = snap(y, w.el.offsetHeight, E.ys);
      }
      w.rect.x = x;
      w.rect.y = Math.max(0, y);
      w.apply();
      if (w.onDockDrop) hot = dockZone(true, ev.clientY);
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      document.body.classList.remove("fw-dragging");
      if (w.onDockDrop) dockZone(false);
      clampRect(w.rect, w.minW, w.minH);
      w.apply();
      if (hot && w.onDockDrop) return w.onDockDrop();
      w.changed();
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };
  $$(".fw-rz", el).forEach((h) => h.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (w.max) { w.max = false; w.apply(); }
    const d = h.dataset.rz, x0 = e.clientX, y0 = e.clientY, R0 = Object.assign({}, w.rect), E = wmEdges(w);
    const minW = w.minW || 260, minH = w.minH || 140;
    document.body.classList.add("fw-dragging");
    const mv = (ev) => {
      const ddx = ev.clientX - x0, ddy = ev.clientY - y0, R = Object.assign({}, R0);
      if (d.includes("e")) R.w = Math.max(minW, R0.w + ddx);
      if (d.includes("s")) R.h = Math.max(minH, R0.h + ddy);
      if (d.includes("w")) { R.w = Math.max(minW, R0.w - ddx); R.x = R0.x + R0.w - R.w; }
      if (d.includes("n")) { R.h = Math.max(minH, R0.h - ddy); R.y = R0.y + R0.h - R.h; }
      if (!ev.altKey) {
        if (d.includes("e")) { const s = snap(R.x + R.w, 0, E.xs); R.w = Math.max(minW, s - R.x); }
        if (d.includes("s")) { const s = snap(R.y + R.h, 0, E.ys); R.h = Math.max(minH, s - R.y); }
      }
      w.rect = R;
      w.apply();
      if (w.onResize) w.onResize();
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      document.body.classList.remove("fw-dragging");
      w.changed();
      if (w.onResize) w.onResize();
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  }));
  w.head.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "min") { w.collapsed = !w.collapsed; w.apply(); w.changed(); }
    else if (a === "max") { w.max = !w.max; w.apply(); w.changed(); if (w.onResize) w.onResize(); }
    else if (a === "close") w.close();
    else if (a === "dock") (w.onDockDrop || w.close)();
    else if (a === "menu") winMenu(e, w);
  });
  w.changed = () => { if (w.onChange) w.onChange(); };
  w.state = () => ({ rect: { x: Math.round(w.rect.x), y: Math.round(w.rect.y), w: Math.round(w.rect.w), h: Math.round(w.rect.h) }, top: w.top, collapsed: w.collapsed, fade: w.fade, opacity: w.opacity || 1 });
  w.destroy = () => {
    el.remove();
    WM.list = WM.list.filter((x) => x !== w);
  };
  w.close = () => (o.onClose ? o.onClose(w) : w.destroy());
  return w;
}
function winMenu(e, w) {
  const op = (v) => () => {
    w.opacity = v;
    w.el.style.setProperty("--fw-op", v);
    w.changed();
  };
  menu(e, [
    [(w.top ? "✓ " : "") + "Поверх усіх вікон", () => { w.top = !w.top; w.apply(); wmRaise(w); w.changed(); }],
    [(w.fade ? "✓ " : "") + "Напівпрозоре, коли миша не на ньому", () => { w.fade = !w.fade; w.apply(); w.changed(); }],
    null,
    [((w.opacity || 1) === 1 ? "✓ " : "") + "Прозорість: немає", op(1)],
    [(w.opacity === 0.9 ? "✓ " : "") + "Прозорість: 10%", op(0.9)],
    [(w.opacity === 0.75 ? "✓ " : "") + "Прозорість: 25%", op(0.75)],
    null,
    ["Притиснути ліворуч", () => wmSnapSide(w, "l")],
    ["Притиснути праворуч", () => wmSnapSide(w, "r")],
    ["Притиснути донизу", () => wmSnapSide(w, "b")],
    ["Розмір за замовчуванням", () => { w.max = false; w.rect = clampRect({ x: (vw() - 620) / 2, y: (vh() - 420) / 2, w: 620, h: 420 }); w.apply(); w.changed(); if (w.onResize) w.onResize(); }]
  ].concat(w.extraMenu ? [null].concat(w.extraMenu()) : []));
}
function wmSnapSide(w, side) {
  const top = ($(".topbar")?.getBoundingClientRect().bottom || 0) + 4;
  w.max = false;
  if (side === "l") w.rect = { x: 4, y: top, w: Math.min(520, vw() * 0.36), h: vh() - top - 8 };
  if (side === "r") w.rect = { x: vw() - Math.min(520, vw() * 0.36) - 4, y: top, w: Math.min(520, vw() * 0.36), h: vh() - top - 8 };
  if (side === "b") w.rect = { x: 4, y: vh() - Math.min(380, vh() * 0.42) - 4, w: vw() - 8, h: Math.min(380, vh() * 0.42) };
  w.apply();
  w.changed();
  if (w.onResize) w.onResize();
}
function paneTargetOk(p) {
  if (p.tab === "mixer") return true;
  if (p.master) return p.tab === "fx" ? true : "Для Master (усього міксу) доступна лише вкладка «Ефекти». Виберіть доріжку у списку вгорі вікна.";
  const id = p.follow ? S.sel : p.sel;
  const t = id && findT(id);
  if (!t) return "Виберіть доріжку: клацніть на неї в редакторі або виберіть у списку вгорі вікна.";
  if (AUDIO_ONLY.has(p.tab) && !t.has_audio) return `«${TABS[p.tab][0]}» працює лише з доріжками-записами (вокал, гітара, стеми). «${t.name}» — MIDI-доріжка.`;
  return true;
}
function occupied(tab, except) {
  return WM.panes.find((p) => p !== except && p.tab === tab);
}
function ctxEnter(p) {
  if (DK.cur === p) { WM.depth++; return; }
  if (DK.cur) ctxExit(true);
  WM.ctxSave = { dockTab: S.dockTab, sel: S.sel, dockMaster: S.dockMaster, dockBus: S.dockBus, selFx: S.selFx, liveVis: S.liveVis, dockOpen: S.dockOpen };
  const inj = p.follow ? S.sel : p.sel;
  p._inj = inj;
  Object.assign(S, { dockTab: p.tab, sel: p.master ? S.sel : inj, dockMaster: !!p.master, dockBus: p.bus || null, selFx: p.selFx || null, liveVis: p.liveVis || null, dockOpen: true });
  p._injSel = S.sel;
  DK.cur = p;
  DK.root = p.box;
  WM.depth = 1;
}
function ctxExit(force, fromEvent) {
  const p = DK.cur;
  if (!p) return;
  if (!force && --WM.depth > 0) return;
  const sv = WM.ctxSave;
  const newSel = S.sel !== p._injSel ? S.sel : undefined;
  let toMain = false;
  p.liveVis = S.liveVis;
  if (p.tab === "mixer") {
    if (S.dockTab !== "mixer" && TABS[S.dockTab]) {
      Object.assign(sv, { dockTab: S.dockTab, dockMaster: S.dockMaster, dockBus: S.dockBus, selFx: S.selFx, dockOpen: true });
      toMain = true;
    }
  } else {
    p.selFx = S.selFx;
    p.bus = S.dockBus;
    if (S.dockMaster !== !!p.master) {
      p.master = S.dockMaster;
      if (p.master) p.follow = false;
    }
    if (S.dockTab !== p.tab && TABS[S.dockTab] && !occupied(S.dockTab, p)) p.tab = S.dockTab;
  }
  Object.assign(S, { dockTab: sv.dockTab, sel: sv.sel, dockMaster: sv.dockMaster, dockBus: sv.dockBus, selFx: sv.selFx, liveVis: sv.liveVis, dockOpen: sv.dockOpen });
  DK.cur = null;
  DK.root = null;
  WM.depth = 0;
  const tb = $("#t-dock");
  if (tb) tb.classList.toggle("on", !!S.dockOpen);
  if (toMain) {
    if (newSel !== undefined) S.sel = newSel;
    if (typeof onSelectTrack === "function") onSelectTrack();
    renderHeads();
    if (WM.dockWin) wmRaise(WM.dockWin);
    renderDock();
    layout();
    draw();
  } else if (newSel !== undefined) {
    S.sel = newSel;
    if (typeof onSelectTrack === "function") onSelectTrack();
    renderHeads();
    if (typeof renderTrackForm === "function") renderTrackForm();
    renderDock();
    layout();
    draw();
  } else if (fromEvent) wmQueueMain();
}
function withPane(p, fn) {
  ctxEnter(p);
  try {
    return fn();
  } finally {
    ctxExit();
  }
}
const _rdBase = renderDock;
function mainAlt(T) {
  const order = !T ? ["mixer"] : T.master ? ["fx"] : (T.t && T.t.has_audio) ? ["fx", "notes", "inst", "proc", "pitch", "ver", "mixer"] : ["fx", "notes", "inst", "mixer"];
  return order.find((k) => !occupied(k));
}
function renderMainDock() {
  if (WM.dockWin && !S.dockOpen) return dockMainBack(true);
  const T = S.B && S.mix ? dockTarget() : null;
  const wantMixer = S.dockTab === "mixer" || !T;
  if (S.B && S.mix && S.dockOpen && (occupied(S.dockTab) || (wantMixer && occupied("mixer")))) {
    const alt = T ? mainAlt(T) : null;
    if (alt && alt !== "mixer") S.dockTab = alt;
    else if (alt === "mixer" && !occupied("mixer")) S.dockTab = "mixer";
    else return mainPlaceholder(T);
  }
  _rdBase();
  if (S.B && S.mix && S.dockOpen && TABS[S.dockTab] && occupied(S.dockTab) && T) {
    const alt = mainAlt(T);
    if (alt && alt !== S.dockTab) { S.dockTab = alt; _rdBase(); } else return mainPlaceholder(T);
  }
  decorateMainHead();
}
function mainPlaceholder(T) {
  const dock = $("#dock");
  if (!dock) return;
  dock.hidden = !S.dockOpen;
  const head = $("#dock-head"), body = $("#dock-body");
  head.innerHTML = T ? `<i class="dk-color" style="background:${T.color}"></i><b>${escapeHtml(T.name)}</b><span class="muted small">усі вкладки винесено в окремі вікна</span><span class="spacer"></span>` : `<b>Канал</b><span class="muted">— виберіть доріжку зліва</span><span class="spacer"></span>`;
  body.innerHTML = `<div class="dock-empty">${T ? "Усі вкладки цієї доріжки зараз відкриті в окремих вікнах." : "Мікшер відкрито в окремому вікні. Клацніть на назву доріжки ліворуч, щоб побачити її ефекти й інструмент тут."}
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" id="dk-showwins">Показати вікна</button><button class="btn ghost sm" id="dk-dockall">Повернути всі вікна в панель</button></div></div>`;
  $("#dk-showwins").onclick = () => { wmShowAll(true); WM.panes.forEach((p) => wmRaise(p.win)); };
  $("#dk-dockall").onclick = () => wmDockAll();
  decorateMainHead();
}
function decorateMainHead() {
  const head = $("#dock-head");
  if (!head || !S.B) return;
  $$(".dk-tabs [data-dt]", head).forEach((b) => {
    const p = occupied(b.dataset.dt);
    b.classList.toggle("away", !!p);
    if (p) {
      b.dataset.hint = `«${TABS[b.dataset.dt][0]}» відкрито в окремому вікні. Клацніть, щоб перейти до нього`;
      b.onclick = (e) => { e.stopPropagation(); wmFocus(p); };
    } else {
      b.title = "Перетягніть вкладку вгору, щоб відкрити її в окремому вікні. Правий клік — більше дій";
    }
  });
  if (!head.querySelector("#dk-detach")) {
    const b = document.createElement("button");
    b.className = "btn ghost sm";
    b.id = "dk-detach";
    b.innerHTML = "⧉";
    b.dataset.hint = "Окремі вікна: винести поточну вкладку, мікшер або всю панель в окреме вікно, яке можна вільно рухати й змінювати розмір";
    b.onclick = (e) => menu(e, detachMenu());
    head.appendChild(b);
  }
}
function detachMenu() {
  const cur = S.dockTab;
  const items = [];
  if (TABS[cur] && !occupied(cur) && dockTarget()) items.push([`Вкладку «${TABS[cur][0]}» — в окреме вікно`, () => openPane(cur)]);
  if (!occupied("mixer")) items.push(["Мікшер — в окреме вікно", () => openPane("mixer")]);
  for (const k of ["fx", "notes", "inst", "proc", "pitch", "ver"]) if (k !== cur && !occupied(k)) items.push([`«${TABS[k][0]}» — в окреме вікно`, () => openPane(k)]);
  items.push(null);
  items.push([UIW.dock ? "Повернути панель каналу на місце" : "Усю панель каналу — плаваючим вікном", () => UIW.dock ? dockMainBack() : floatMain()]);
  if (WM.panes.length) items.push(["Повернути всі вікна в панель", () => wmDockAll()]);
  return items;
}
renderDock = function () {
  if (DK.cur) {
    const p = DK.cur;
    const ok = paneTargetOk(p);
    if (ok !== true) paneMessage(p, ok);
    else _rdBase();
    paneDecorate(p);
    return;
  }
  renderMainDock();
  wmQueueRefresh();
};
function wmQueueRefresh() {
  if (!WM.panes.length || WM.refreshQ) return;
  WM.refreshQ = requestAnimationFrame(() => {
    WM.refreshQ = 0;
    for (const p of WM.panes) {
      const a = document.activeElement;
      if (a && p.box.contains(a) && typeof typingIn === "function" && typingIn(a)) continue;
      if (WM.dragPane === p) continue;
      renderPane(p);
    }
  });
}
function renderPane(p) {
  if (!S.B || !S.mix) return;
  withPane(p, () => renderDock());
}
function paneMessage(p, msg) {
  p.head.innerHTML = `<div class="dk-tabs"></div><span class="spacer"></span>`;
  p.body.innerHTML = `<div class="dock-empty">${escapeHtml(msg)}</div>`;
}
function paneDecorate(p) {
  const head = p.head;
  let tabs = head.querySelector(".dk-tabs");
  const T = paneTargetOk(p) === true && p.tab !== "mixer" ? dockTarget() : null;
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.className = "dk-tabs";
    head.prepend(tabs);
  }
  const avail = p.master ? ["fx"] : Object.keys(TABS).filter((k) => k === "mixer" || !T || T.master || (T.t && (T.t.has_audio || !AUDIO_ONLY.has(k))));
  tabs.innerHTML = avail.map((k) => {
    const o = k !== p.tab && occupied(k, p);
    return `<button data-pt="${k}" class="${k === p.tab ? "active" : ""}${o ? " away" : ""}" data-hint="${escapeHtml(o ? `«${TABS[k][0]}» уже відкрито в іншому вікні — клацніть, щоб перейти` : TABS[k][1])}">${TABS[k][0]}</button>`;
  }).join("");
  $$(".dk-tabs [data-dt]", head).forEach((b) => b.remove());
  $$("[data-pt]", tabs).forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const k = b.dataset.pt, o = occupied(k, p);
    if (o) return wmFocus(o);
    p.tab = k;
    p.selFx = null;
    p.liveVis = null;
    paneChanged(p);
    renderPane(p);
    renderMainDock();
  });
  const mb = head.querySelector("#dk-master");
  if (mb) mb.remove();
  p.win.setTitle(p.tab === "mixer" ? "Мікшер" : `${TABS[p.tab][0]}${T ? " — " + T.name : p.master ? " — Master" : ""}`, T ? T.color : p.master ? "#4fd1c5" : "var(--amber)");
  paneTargetUI(p);
}
function paneTargetUI(p) {
  const ex = p.win.extra;
  if (p.tab === "mixer") { ex.innerHTML = ""; return; }
  const cur = p.master ? "@master" : p.follow ? "@follow" : p.sel || "@follow";
  ex.innerHTML = `<select class="fw-target" data-hint="Яку доріжку показує вікно. «Вибрана доріжка» — вікно саме перемикається, коли ви вибираєте іншу доріжку. Конкретна доріжка — вікно закріплене за нею">
    <option value="@follow">⟲ Вибрана доріжка</option><option value="@master">Master (увесь мікс)</option>
    ${tracksAll().map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("")}</select>`;
  const s = ex.querySelector("select");
  s.value = cur;
  s.onchange = () => {
    const v = s.value;
    p.follow = v === "@follow";
    p.master = v === "@master";
    p.sel = p.follow || p.master ? null : v;
    if (p.master) p.tab = "fx";
    p.selFx = null;
    p.liveVis = null;
    paneChanged(p);
    renderPane(p);
    renderMainDock();
  };
}
function openPane(tab, opt = {}) {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const ex = occupied(tab);
  if (ex) { wmFocus(ex); return ex; }
  const box = document.createElement("div");
  box.className = "dock pane-dock";
  box.innerHTML = `<div class="dock-head"></div><div class="dock-body"></div>`;
  const defRect = tab === "mixer" ? { x: vw() - Math.min(920, vw() * 0.6) - 16, y: vh() - Math.min(420, vh() * 0.5) - 16, w: Math.min(920, vw() * 0.6), h: Math.min(420, vh() * 0.5) } : null;
  const p = { tab, follow: opt.follow !== false && !opt.sel, sel: opt.sel || null, master: !!opt.master, bus: null, selFx: null, liveVis: null, box, head: box.querySelector(".dock-head"), body: box.querySelector(".dock-body") };
  if (p.sel && !findT(p.sel)) { p.sel = null; p.follow = true; }
  const w = makeWin({ title: TABS[tab][0], rect: opt.rect || defRect || null, state: opt.state, cls: "fw-pane", minW: 320, minH: 180, dockHint: "Повернути вкладку в нижню панель (або перетягніть вікно до низу екрана)", closeHint: "Закрити вікно (вкладка повернеться в нижню панель)",
    onClose: () => closePane(p, false), onChange: () => paneChanged(p) });
  w.onDockDrop = () => closePane(p, true);
  w.onResize = () => { if (p.tab === "notes" || p.tab === "pitch" || p.tab === "mixer") renderPane(p); };
  w.extraMenu = () => [["Повернути в нижню панель", () => closePane(p, true)]];
  w.body.appendChild(box);
  p.win = w;
  WM.panes.push(p);
  bindPaneCtx(p);
  if (S.dockTab === tab) S.dockTab = mainAlt(dockTarget()) || "fx";
  renderPane(p);
  renderMainDock();
  paneChanged(p);
  if (!opt.silent && !UIP.wmTipShown) {
    UIP.wmTipShown = true;
    saveUI();
    toast("Окреме вікно: тягніть за заголовок, змінюйте розмір за краї, подвійний клік — на весь екран. Перетягніть до низу екрана — повернеться в панель. F10 — сховати/показати всі вікна.");
  }
  return p;
}
function closePane(p, toDock) {
  WM.panes = WM.panes.filter((x) => x !== p);
  p.win.destroy();
  if (toDock) {
    S.dockOpen = true;
    if (p.tab !== "mixer" && !p.follow && p.sel && findT(p.sel)) S.sel = p.sel;
    S.dockTab = p.tab;
    if (p.master) S.dockMaster = true;
    if (typeof onSelectTrack === "function" && !p.follow) onSelectTrack();
    renderHeads();
    layout();
  }
  renderMainDock();
  saveWins();
  draw();
}
function paneChanged() {
  saveWins();
}
function bindPaneCtx(p) {
  const T = ["pointerdown", "mousedown", "click", "dblclick", "input", "change", "keydown", "keyup", "wheel", "contextmenu", "pointerup", "mouseup", "focusin", "dragstart", "drop"];
  for (const t of T) {
    p.box.addEventListener(t, (e) => {
      ctxEnter(p);
      if (t === "pointerdown" || t === "mousedown") WM.dragPane = p;
      setTimeout(() => { if (DK.cur === p && WM.dragPane !== p) ctxExit(true, true); }, 0);
    }, true);
    p.box.addEventListener(t, () => { if (DK.cur === p && WM.dragPane !== p) ctxExit(true, true); });
  }
}
for (const t of ["pointerdown", "mousedown", "click", "keydown", "wheel", "input", "change", "focusin", "contextmenu"]) {
  window.addEventListener(t, (e) => {
    if (DK.cur && !(e.target && e.target.nodeType === 1 && DK.cur.box.contains(e.target)) && WM.dragPane !== DK.cur) ctxExit(true);
  }, true);
}
for (const t of ["pointermove", "mousemove", "pointerup", "mouseup"]) {
  window.addEventListener(t, (e) => {
    const p = WM.dragPane;
    if (!p || !WM.panes.includes(p)) { WM.dragPane = null; return; }
    if (DK.cur !== p) ctxEnter(p);
    if (t === "pointerup" || t === "mouseup") {
      setTimeout(() => {
        if (WM.dragPane === p) WM.dragPane = null;
        if (DK.cur === p) ctxExit(true, true);
      }, 0);
    }
  }, true);
}
function wmQueueMain() {
  if (WM.mainQ) return;
  WM.mainQ = requestAnimationFrame(() => {
    WM.mainQ = 0;
    if (S.B && S.view === "project") renderMainDock();
  });
}
setInterval(() => {
  if (!WM.panes.length || S.view !== "project" || DK.cur) return;
  for (const p of WM.panes) {
    if (!p.liveVis || p.win.collapsed || WM.hidden) continue;
    try {
      withPane(p, () => { if (S.liveVis) S.liveVis(); });
    } catch (e) {
      p.liveVis = null;
    }
  }
}, 60);
function wmFocus(p) {
  if (WM.hidden) wmShowAll(true);
  if (p.win.collapsed) { p.win.collapsed = false; p.win.apply(); }
  wmRaise(p.win);
  p.win.el.classList.remove("flash");
  void p.win.el.offsetWidth;
  p.win.el.classList.add("flash");
}
function wmShowAll(on) {
  WM.hidden = !on;
  wmLayer().classList.toggle("hid", WM.hidden);
}
function wmDockAll() {
  for (const p of WM.panes.slice()) closePane(p, false);
  if (UIW.dock) dockMainBack();
  if (UIW.side) dockSideBack();
  for (const id of Object.keys(UIP.mfloat)) if (UIP.mfloat[id] && UIP.mfloat[id].on) { UIP.mfloat[id].on = false; const m = document.getElementById(id); if (m) mfApply(m); }
  saveUI();
  toast("Усі вікна повернуто на свої місця.");
}
function wmCascade() {
  const top = ($(".topbar")?.getBoundingClientRect().bottom || 0) + 20;
  WM.list.filter((w) => !w.el.hidden).forEach((w, i) => {
    w.max = false;
    w.collapsed = false;
    w.rect = clampRect({ x: 60 + i * 36, y: top + i * 32, w: Math.min(720, vw() * 0.5), h: Math.min(440, vh() * 0.55) });
    w.apply();
    wmRaise(w);
    if (w.onResize) w.onResize();
    w.changed();
  });
}
function wmTile() {
  const ws = WM.list.filter((w) => !w.el.hidden);
  if (!ws.length) return;
  const top = ($(".topbar")?.getBoundingClientRect().bottom || 0) + 4;
  const cols = Math.ceil(Math.sqrt(ws.length)), rows = Math.ceil(ws.length / cols);
  const W = (vw() - 8) / cols, H = (vh() - top - 4) / rows;
  ws.forEach((w, i) => {
    w.max = false;
    w.collapsed = false;
    w.rect = { x: 4 + (i % cols) * W, y: top + Math.floor(i / cols) * H, w: W - 4, h: H - 4 };
    w.apply();
    if (w.onResize) w.onResize();
    w.changed();
  });
}
function hostWin(kind) {
  const isDock = kind === "dock";
  const node = isDock ? $("#dock") : $("#side");
  if (!node) return null;
  const st = UIW[kind];
  const ph = document.createElement("div");
  ph.id = "fw-ph-" + kind;
  ph.hidden = true;
  node.before(ph);
  const def = isDock ? { x: 40, y: vh() - Math.min(400, vh() * 0.45) - 30, w: Math.min(1100, vw() - 80), h: Math.min(400, vh() * 0.45) } : { x: vw() - 380, y: 120, w: 340, h: Math.min(700, vh() - 160) };
  const w = makeWin({ title: isDock ? "Панель каналу" : "Бічна панель", rect: st && st.rect || def, state: st, first: isDock, cls: "fw-host", minW: isDock ? 420 : 260, minH: 200,
    dockHint: "Повернути панель на її місце", closeHint: isDock ? "Сховати панель (повернеться на місце; відкрити знову — F9)" : "Сховати бічну панель",
    onClose: () => { isDock ? dockMainBack(true) : dockSideBack(true); }, onChange: () => { UIW[kind] = Object.assign(w.state(), { on: true }); saveUI(); } });
  w.onDockDrop = isDock ? () => dockMainBack() : null;
  w.onResize = () => { if (isDock) renderDock(); };
  w.body.appendChild(node);
  node.hidden = false;
  node.classList.add("floated");
  UIW[kind] = Object.assign(w.state(), { on: true });
  saveUI();
  return w;
}
function floatMain() {
  if (WM.dockWin) return wmRaise(WM.dockWin);
  S.dockOpen = true;
  WM.dockWin = hostWin("dock");
  renderDock();
  layout();
  draw();
}
function dockMainBack(hide) {
  const w = WM.dockWin, node = $("#dock"), ph = $("#fw-ph-dock");
  if (w && node && ph) {
    ph.replaceWith(node);
    node.classList.remove("floated");
    w.destroy();
  }
  WM.dockWin = null;
  UIW.dock = null;
  saveUI();
  if (hide) S.dockOpen = false;
  renderDock();
  setTimeout(() => { layout(); draw(); }, 20);
}
function floatSide() {
  if (WM.sideWin) return wmRaise(WM.sideWin);
  WM.sideWin = hostWin("side");
  setTimeout(() => { layout(); draw(); }, 20);
}
function dockSideBack(hide) {
  const w = WM.sideWin, node = $("#side"), ph = $("#fw-ph-side");
  if (w && node && ph) {
    ph.replaceWith(node);
    node.classList.remove("floated");
    w.destroy();
  }
  WM.sideWin = null;
  UIW.side = null;
  if (node) node.hidden = !!hide;
  storeLayout();
  saveUI();
  setTimeout(() => { layout(); draw(); }, 20);
}
function saveWins() {
  UIW.panes = WM.panes.map((p) => Object.assign(p.win.state(), { tab: p.tab, follow: p.follow, sel: p.sel, master: p.master }));
  saveUI();
}
function winsSnapshot() {
  return { panes: WM.panes.map((p) => Object.assign(p.win.state(), { tab: p.tab, follow: p.follow, sel: p.sel, master: p.master })), dock: WM.dockWin ? Object.assign(WM.dockWin.state(), { on: true }) : null, side: WM.sideWin ? Object.assign(WM.sideWin.state(), { on: true }) : null };
}
function restoreWins(W) {
  if (!S.B || S.view !== "project") return;
  for (const p of WM.panes.slice()) { WM.panes = WM.panes.filter((x) => x !== p); p.win.destroy(); }
  if (WM.dockWin) dockMainBack();
  if (WM.sideWin) dockSideBack();
  W = W || { panes: [] };
  if (W.side && W.side.on) { UIW.side = W.side; floatSide(); }
  if (W.dock && W.dock.on) { UIW.dock = W.dock; floatMain(); }
  for (const s of W.panes || []) if (TABS[s.tab]) openPane(s.tab, { rect: s.rect, state: s, follow: s.follow, sel: s.sel, master: s.master, silent: true });
  saveWins();
  renderMainDock();
}
const _storeLayoutW = storeLayout;
storeLayout = function () {
  _storeLayoutW();
  UIP.layout.wins = winsSnapshot();
  saveUI();
};
const _applyLayoutW = applyLayout;
applyLayout = function (L, opts = {}) {
  _applyLayoutW(L, opts);
  if (!S.B || S.view !== "project") return;
  const W = L && L.wins ? L.wins : opts.silent ? { panes: UIW.panes, dock: UIW.dock, side: UIW.side } : { panes: [] };
  restoreWins(W);
  UIP.layout.wins = winsSnapshot();
  if (!opts.silent) saveUI();
};
LAYOUTS["Вільні вікна"] = { side: false, headw: 210, dock: true, dockh: 0.36, tab: "notes", wins: { panes: [
  { tab: "mixer", follow: true, rect: { x: 0.5, y: 0.2, w: 0.49, h: 0.4 } },
  { tab: "fx", follow: true, rect: { x: 0.2, y: 0.2, w: 0.29, h: 0.4 } }
] } };
LAYOUTS["Ноти + мікшер"] = { side: false, headw: 210, dock: false, wins: { panes: [
  { tab: "mixer", follow: true, rect: { x: 0.5, y: 0.52, w: 0.495, h: 0.46 } },
  { tab: "notes", follow: true, rect: { x: 0.005, y: 0.52, w: 0.49, h: 0.46 } }
] } };
const _show = show;
show = function (view) {
  _show(view);
  wmLayer().classList.toggle("off", view !== "project");
  if (view !== "project") $$("#fw-layer > .modal.floatm:not([hidden])").forEach((m) => { if (!/^upd/.test(m.id)) m.hidden = true; });
};
addEventListener("resize", () => {
  for (const w of WM.list) {
    clampRect(w.rect, w.minW, w.minH);
    w.apply();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "F10" && S.view === "project") {
    e.preventDefault();
    wmShowAll(WM.hidden);
    toast(WM.hidden ? "Окремі вікна сховано. F10 — показати знову." : "Окремі вікна показано.");
  }
});
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest && e.target.closest("#dock-head .dk-tabs [data-dt]");
  if (!b || e.button !== 0 || b.classList.contains("away")) return;
  const tab = b.dataset.dt;
  if (!TABS[tab]) return;
  const x0 = e.clientX, y0 = e.clientY;
  let done = false;
  const mv = (ev) => {
    if (done) return;
    if (Math.abs(ev.clientY - y0) > 26 || Math.abs(ev.clientX - x0) > 90) {
      done = true;
      cleanup();
      if (tab !== "mixer" && !dockTarget()) return;
      const p = openPane(tab, { rect: { x: ev.clientX - 160, y: ev.clientY - 14, w: tab === "mixer" ? Math.min(900, vw() * 0.6) : 640, h: tab === "notes" || tab === "pitch" ? 420 : 380 } });
      if (p && p.win) p.win.startDrag(ev, 160, 14);
    }
  };
  const cleanup = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", cleanup); };
  addEventListener("pointermove", mv);
  addEventListener("pointerup", cleanup);
}, true);
document.addEventListener("contextmenu", (e) => {
  const b = e.target.closest && e.target.closest("#dock-head .dk-tabs [data-dt]");
  if (!b || !TABS[b.dataset.dt]) return;
  e.preventDefault();
  const tab = b.dataset.dt;
  const items = [[`Відкрити «${TABS[tab][0]}» в окремому вікні`, () => openPane(tab)]];
  if (tab !== "mixer" && S.sel && findT(S.sel)) items.push([`Окреме вікно, закріплене за «${findT(S.sel).name}»`, () => openPane(tab, { follow: false, sel: S.sel })]);
  items.push(null, ["Усю панель — плаваючим вікном", () => floatMain()]);
  menu(e, items);
});
(function sideDetach() {
  const tabs = $("#side .side-tabs");
  if (!tabs || tabs.querySelector(".side-detach")) return;
  const b = document.createElement("button");
  b.className = "side-detach";
  b.innerHTML = "⧉";
  b.dataset.hint = "Винести бічну панель в окреме вікно, яке можна поставити будь-де. Ще раз — повернути на місце";
  b.onclick = (e) => { e.stopPropagation(); WM.sideWin ? dockSideBack() : floatSide(); };
  tabs.appendChild(b);
})();
const MF_SKIP = new Set(["close-modal", "ink-confirm"]);
function mfDecorate(m, raise) {
  if (!m.id || MF_SKIP.has(m.id) || m.classList.contains("no-float")) return;
  const card = m.querySelector(":scope > .modal-card");
  const head = card && card.querySelector(".modal-head");
  if (!head) return;
  if (head.querySelector(".mf-btn")) return mfApply(m, raise);
  const b = document.createElement("button");
  b.className = "mf-btn";
  b.type = "button";
  b.dataset.hint = "Відкріпити: вікно стане плаваючим — програма за ним залишиться доступною, вікно можна рухати й змінювати розмір. Ще раз — закріпити по центру";
  b.textContent = "⧉";
  const x = head.querySelector(".x,[data-close],[data-nz='close']");
  if (x) x.before(b);
  else head.appendChild(b);
  b.onclick = (e) => {
    e.stopPropagation();
    const st = UIP.mfloat[m.id] || {};
    st.on = !st.on;
    if (st.on && !st.rect) {
      const r = card.getBoundingClientRect();
      st.rect = { x: Math.round(r.left + 40), y: Math.round(r.top + 20), w: Math.round(r.width), h: Math.round(r.height) };
    }
    UIP.mfloat[m.id] = st;
    saveUI();
    mfApply(m, true);
  };
  head.addEventListener("pointerdown", (e) => {
    if (!m.classList.contains("floatm") || e.button !== 0 || e.target.closest("button,select,input,a,label")) return;
    e.preventDefault();
    const st = UIP.mfloat[m.id], dx = e.clientX - st.rect.x, dy = e.clientY - st.rect.y;
    const mv = (ev) => {
      st.rect.x = Math.max(-st.rect.w + 120, Math.min(vw() - 120, ev.clientX - dx));
      st.rect.y = Math.max(0, Math.min(vh() - 40, ev.clientY - dy));
      card.style.left = st.rect.x + "px";
      card.style.top = st.rect.y + "px";
    };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); saveUI(); };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  });
  card.addEventListener("pointerup", () => {
    if (!m.classList.contains("floatm")) return;
    const st = UIP.mfloat[m.id];
    const w = card.offsetWidth, h = card.offsetHeight;
    if (st && (Math.abs(w - st.rect.w) > 2 || Math.abs(h - st.rect.h) > 2)) { st.rect.w = w; st.rect.h = h; saveUI(); }
  });
  card.addEventListener("pointerdown", () => {
    if (!m.classList.contains("floatm")) return;
    WM.z += 1;
    m.style.zIndex = WM.z;
    WM.list.forEach((x) => x.el.classList.remove("focus"));
  }, true);
  mfApply(m, true);
}
function mfApply(m, raise) {
  const card = m.querySelector(":scope > .modal-card");
  if (!card) return;
  const st = UIP.mfloat[m.id];
  const on = !!(st && st.on);
  m.classList.toggle("floatm", on);
  const b = card.querySelector(".mf-btn");
  if (b) {
    b.classList.toggle("on", on);
    const t = on ? "⧈" : "⧉";
    if (b.textContent !== t) b.textContent = t;
  }
  if (on) {
    const r = st.rect;
    r.w = Math.min(r.w, vw() - 16);
    r.h = Math.min(r.h, vh() - 16);
    r.x = Math.max(-r.w + 120, Math.min(vw() - 120, r.x));
    r.y = Math.max(0, Math.min(vh() - 40, r.y));
    Object.assign(card.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
    const L = wmLayer();
    if (m.parentElement !== L) L.appendChild(m);
    if (!m.hidden && (raise || !m.style.zIndex)) { WM.z += 1; m.style.zIndex = WM.z; }
  } else {
    for (const k of ["left", "top", "width", "height"]) card.style[k] = "";
    if (m.parentElement === WM.layer) document.body.appendChild(m);
    m.style.zIndex = "";
  }
}
new MutationObserver((muts) => {
  for (const mu of muts) {
    if (mu.type === "attributes" && mu.target.classList && mu.target.classList.contains("modal")) {
      if (!mu.target.hidden) mfDecorate(mu.target, true);
    } else if (mu.type === "childList") {
      if (mu.target.classList && mu.target.classList.contains("mf-btn")) continue;
      const t = mu.target.closest ? mu.target.closest(".modal") : null;
      if (t && !t.hidden) mfDecorate(t);
      for (const n of mu.addedNodes) if (n.nodeType === 1 && n.classList.contains("modal") && !n.hidden) mfDecorate(n, true);
    }
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
$$(".modal").forEach((m) => { if (!m.hidden) mfDecorate(m); });
(function wmMenus() {
  const view = MENUS["Вигляд"];
  MENUS["Вигляд"] = () => {
    const base = view();
    const i = base.findIndex((x) => x && /^Розкладка:/.test(x[0]));
    const items = [
      ["Окреме вікно: Мікшер", needProject(() => openPane("mixer"))],
      ["Окреме вікно: Ефекти", needProject(() => openPane("fx"))],
      ["Окреме вікно: Ноти (піано-рол)", needProject(() => openPane("notes"))],
      ["Окреме вікно: Інструмент", needProject(() => openPane("inst"))],
      ["Окреме вікно: Обробка звуку", needProject(() => openPane("proc"))],
      ["Окреме вікно: Висота нот", needProject(() => openPane("pitch"))],
      ["Окреме вікно: Версії", needProject(() => openPane("ver"))],
      [WM.dockWin ? "Панель каналу — на місце" : "Панель каналу — плаваючим вікном", needProject(() => WM.dockWin ? dockMainBack() : floatMain())],
      [WM.sideWin ? "Бічна панель — на місце" : "Бічна панель — плаваючим вікном", needProject(() => WM.sideWin ? dockSideBack() : floatSide())],
      ["Розставити вікна каскадом", needProject(wmCascade)],
      ["Розставити вікна плиткою", needProject(wmTile)],
      [WM.hidden ? "Показати окремі вікна  (F10)" : "Сховати окремі вікна  (F10)", needProject(() => wmShowAll(WM.hidden))],
      ["Повернути всі вікна на місце", needProject(wmDockAll)],
      null
    ];
    base.splice(i < 0 ? base.length : i, 0, ...items);
    return base;
  };
})();
