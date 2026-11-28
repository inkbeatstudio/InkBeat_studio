"use strict";
const VE_TYPES = {
  scene: ["Сцена", "▦"], text: ["Текст", "T"], lyrics: ["Субтитри", "≡"], image: ["Фото", "▣"], video: ["Відео", "▶"],
  shape: ["Фігура", "◆"], viz: ["Візуалізатор", "▮"], progress: ["Прогрес", "━"], timer: ["Таймер", "◷"], wm: ["Підпис", "★"]
};
const VE_TABS = [
  ["templates", "Шаблони", "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"],
  ["text", "Текст", "M5 6V4h14v2M12 4v16M9 20h6"],
  ["lyrics", "Субтитри", "M4 6h16M4 11h12M4 16h16M4 21h9"],
  ["media", "Медіа", "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4"],
  ["elements", "Елементи", "M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.3 9.2l6.1-.6z"],
  ["viz", "Візуалізатор", "M4 20V10M8 20V4M12 20v-7M16 20V7M20 20v-4"],
  ["bg", "Фон", "M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4"],
  ["layers", "Шари", "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"],
  ["video", "Відео", "M3 6h13v12H3zM16 10l5-3v10l-5-3"]
];
const VE_PRESETS = [
  ["Класичний", { font: "Montserrat", weight: 800, color: "#ffffff", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#000000", a: 0.55, blur: 18, x: 0, y: 6 }, box: { on: false, c: "#000000", a: 0.6, r: 16, pad: 18 }, italic: false, upper: false, ls: 0 }],
  ["Субтитр", { font: "Montserrat", weight: 900, color: "#ffffff", grad: null, stroke: { w: 6, c: "#000000" }, shadow: { on: false, c: "#000000", a: 0.5, blur: 10, x: 0, y: 4 }, box: { on: false }, italic: false, upper: false, ls: 0 }],
  ["Жовтий", { font: "Montserrat", weight: 900, color: "#ffe14d", grad: null, stroke: { w: 5, c: "#000000" }, shadow: { on: false }, box: { on: false }, italic: false, upper: false, ls: 0 }],
  ["Плашка", { font: "Manrope", weight: 800, color: "#ffffff", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: false }, box: { on: true, mode: "line", c: "#000000", a: 0.75, r: 12, pad: 16 }, italic: false, upper: false, ls: 0 }],
  ["Біла плашка", { font: "Manrope", weight: 800, color: "#111111", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: false }, box: { on: true, mode: "line", c: "#ffffff", a: 1, r: 12, pad: 16 }, italic: false, upper: false, ls: 0 }],
  ["Неон", { font: "Unbounded", weight: 700, color: "#ffffff", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#ff2bd6", a: 1, blur: 34, x: 0, y: 0 }, box: { on: false }, italic: false, upper: false, ls: 0.02 }],
  ["Градієнт", { font: "Unbounded", weight: 800, color: "#ffb547", grad: { on: true, c1: "#ffb547", c2: "#f472b6", angle: 0 }, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#000000", a: 0.45, blur: 20, x: 0, y: 6 }, box: { on: false }, italic: false, upper: false, ls: 0 }],
  ["Рукописний", { font: "Caveat", weight: 700, color: "#ffffff", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#000000", a: 0.5, blur: 14, x: 0, y: 4 }, box: { on: false }, italic: false, upper: false, ls: 0 }],
  ["Ретро", { font: "Russo One", weight: 400, color: "#ff5d6c", grad: null, stroke: { w: 3, c: "#ffe14d" }, shadow: { on: true, c: "#1a0b2e", a: 1, blur: 0, x: 6, y: 6 }, box: { on: false }, italic: false, upper: true, ls: 0.03 }],
  ["Елегантний", { font: "Playfair Display", weight: 700, color: "#f5e6c8", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#000000", a: 0.4, blur: 16, x: 0, y: 4 }, box: { on: false }, italic: true, upper: false, ls: 0 }],
  ["Мінімал", { font: "Manrope", weight: 300, color: "#ffffff", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: false }, box: { on: false }, italic: false, upper: true, ls: 0.22 }],
  ["Контур", { font: "Montserrat", weight: 900, color: "#00000000", grad: null, stroke: { w: 3, c: "#ffffff" }, shadow: { on: false }, box: { on: false }, italic: false, upper: true, ls: 0.04 }],
  ["Піксель", { font: "Press Start 2P", weight: 400, color: "#4ade80", grad: null, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#000000", a: 1, blur: 0, x: 4, y: 4 }, box: { on: false }, italic: false, upper: false, ls: 0 }],
  ["Казка", { font: "Lobster", weight: 400, color: "#ffffff", grad: { on: true, c1: "#ffe9a8", c2: "#ff9ad5", angle: 90 }, stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#3b0a45", a: 0.7, blur: 18, x: 0, y: 5 }, box: { on: false }, italic: false, upper: false, ls: 0 }]
];
const VE_EMOJI = ["🔥", "❤️", "✨", "🎵", "🎶", "🎧", "🎤", "🎹", "🥁", "🎸", "💥", "⭐", "😎", "👀", "💯", "🚀", "🌙", "🌈", "⚡", "🖤", "💜", "😍", "🙌", "👉", "👆", "📀", "🎬", "🏆"];

function veActive() { const m = $("#vs-modal"); return !!(m && !m.hidden && VE.doc); }
function veSel() { return VE.doc ? VE.doc.layers.find((l) => l.id === VE.sel) || null : null; }
function veLabel(l) { return l.name || (VE_TYPES[l.type] || [l.type])[0]; }

function veDefaultDoc() {
  const doc = { v: 1, bg: { kind: "scene", c1: "#160f2a", c2: "#05060a", angle: 135, blur: 40, dim: 45 }, layers: [], media: [], fonts: [] };
  doc.layers.push(veAnchor(veMakeScene({}), "center", 1));
  const title = veAnchor(veMakeText("Назва", { dyn: "title", name: "Назва", size: 68, weight: 900 }), "top", 1);
  doc.layers.push(title);
  const artist = veAnchor(veMakeText("Виконавець", { dyn: "artist", name: "Виконавець", size: 36, weight: 700, color: VS.accent || "#ffb547", shadow: { on: false } }), "top2", 1);
  doc.layers.push(artist);
  doc.layers.push(veAnchor(veMakeLyrics({ hl: VS.accent || "#ffb547", hidden: !(VS.lyrics || (S.mix && (S.mix.lyrics || "").trim())) }), "lower", 1));
  const pr = veAnchor(veMakeProgress({ color: VS.accent || "#ffb547" }), "foot", { tiktok: 1, youtube: 1.6, square: 1 });
  doc.layers.push(pr);
  if (VS.wm !== false) doc.layers.push(veAnchor(veMakeWm(), "corner", 1));
  if (VS.intro) {
    const dim = veAnchor(veMakeShape("rect", { name: "Затемнення інтро", w: 3000, h: 3000, fill: "#08090c", fa: 0.82, radius: 0, t0: 0, t1: 2.4, anim: { in: "none", inDur: 0.3, out: "fade", outDur: 0.7, loop: "none", loopAmt: 0.5 } }), "center", 1);
    const big = veAnchor(veMakeText("Назва", { dyn: "title", name: "Назва на старті", size: 96, weight: 900, t0: 0, t1: 2.4, anim: { in: "zoom", inDur: 0.6, out: "fade", outDur: 0.7, loop: "none", loopAmt: 0.5 } }), "center", 1);
    doc.layers.push(dim, big);
  }
  if (VS.cta) {
    doc.layers.push(veAnchor(veMakeText(VS.cta, { name: "Заклик у кінці", size: 46, weight: 800, color: "#14100a", shadow: { on: false }, box: { on: true, c: VS.accent || "#ffb547", a: 1, r: 44, pad: 26 }, tail: 3, anim: { in: "slideUp", inDur: 0.5, out: "none", outDur: 0.3, loop: "pulse", loopAmt: 0.3 } }), "center", 1));
  }
  return doc;
}
async function veLoadDoc() {
  let doc = null;
  try { doc = await api.get(`/api/project/${S.pid}/video/edit`); } catch (e) { doc = null; }
  if (!doc || !Array.isArray(doc.layers)) doc = veDefaultDoc();
  doc.media = doc.media || [];
  doc.fonts = doc.fonts || [];
  doc.bg = doc.bg || { kind: "scene" };
  VE.doc = doc;
  VE.last = JSON.stringify(doc);
  VE.hist = [];
  VE.fut = [];
  VE.sel = null;
  veUserFonts();
}
function veChanged(now) {
  clearTimeout(VE.histT);
  const go = () => {
    if (!VE.doc) return;
    const cur = JSON.stringify(VE.doc);
    if (cur === VE.last) return;
    VE.hist.push(VE.last);
    if (VE.hist.length > 150) VE.hist.shift();
    VE.fut = [];
    VE.last = cur;
    veSaveLater();
    veUndoBtns();
  };
  if (now) go(); else VE.histT = setTimeout(go, 350);
}
function veSaveLater() {
  clearTimeout(VE.saveT);
  VE.saveT = setTimeout(veSaveNow, 700);
}
function veSaveNow() {
  clearTimeout(VE.saveT);
  if (!VE.doc || !S.pid) return;
  api.post(`/api/project/${S.pid}/video/edit`, VE.doc).catch(() => {});
}
function veUndo() {
  veChanged(true);
  if (!VE.hist.length) return;
  VE.fut.push(VE.last);
  VE.last = VE.hist.pop();
  VE.doc = JSON.parse(VE.last);
  if (!veSel()) VE.sel = null;
  veSaveLater();
  veRefresh();
}
function veRedo() {
  if (!VE.fut.length) return;
  VE.hist.push(VE.last);
  VE.last = VE.fut.pop();
  VE.doc = JSON.parse(VE.last);
  if (!veSel()) VE.sel = null;
  veSaveLater();
  veRefresh();
}
function veUndoBtns() {
  if ($("#ve-undo")) $("#ve-undo").disabled = !VE.hist.length;
  if ($("#ve-redo")) $("#ve-redo").disabled = !VE.fut.length;
}
function veRefresh() {
  vePanel();
  veInspector();
  veTimeline();
  veUndoBtns();
}
function veAdd(l, select = true) {
  const scene = VE.doc.layers.findIndex((x) => x.type === "scene");
  VE.doc.layers.push(l);
  if (scene < 0 && l.type === "scene") VE.doc.layers.unshift(VE.doc.layers.pop());
  if (l.t0 == null) l.t0 = 0;
  const t = veNowT();
  if (select) VE.sel = l.id;
  if (l._atNow && l.anim && l.anim.in === "none" && l.anim.out === "none") { l.anim.in = "fade"; l.anim.out = "fade"; }
  if (l.type !== "lyrics" && l.type !== "scene" && l.type !== "wm" && l.type !== "progress" && !l.tail && l.t1 == null && l.t0 === 0 && t > 0.5 && t < veDur() - 1 && l._atNow) { l.t0 = +t.toFixed(2); }
  delete l._atNow;
  veChanged(true);
  veRefresh();
  return l;
}
function veRemove(id) {
  const i = VE.doc.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  VE.doc.layers.splice(i, 1);
  if (VE.sel === id) VE.sel = null;
  veChanged(true);
  veRefresh();
}
function veDuplicate(id) {
  const i = VE.doc.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const c = JSON.parse(JSON.stringify(VE.doc.layers[i]));
  c.id = veUid();
  c.name = veLabel(c) + " (копія)";
  for (const f of VE_FMTS) if (c.pos[f]) { c.pos[f].x = Math.min(0.95, c.pos[f].x + 0.03); c.pos[f].y = Math.min(0.95, c.pos[f].y + 0.03); }
  VE.doc.layers.splice(i + 1, 0, c);
  VE.sel = c.id;
  veChanged(true);
  veRefresh();
}
function veOrder(id, how) {
  const L = VE.doc.layers, i = L.findIndex((l) => l.id === id);
  if (i < 0) return;
  const [l] = L.splice(i, 1);
  let j = how === "front" ? L.length : how === "back" ? 0 : how === "up" ? Math.min(L.length, i + 1) : Math.max(0, i - 1);
  L.splice(j, 0, l);
  veChanged(true);
  veRefresh();
}

function veBuildModal() {
  if ($("#vs-modal")) return;
  const m = document.createElement("div");
  m.className = "modal";
  m.id = "vs-modal";
  m.innerHTML = `<div class="modal-card vs-card ve-card">
    <div class="modal-head ve-head">
      <h3>Відеостудія</h3>
      <div class="np-seg ve-fmt" id="ve-fmt">${Object.entries(VFMT).map(([k, f]) => `<button type="button" data-vf="${k}" data-hint="${escapeHtml(f.name)}">${f.tag}</button>`).join("")}</div>
      <button class="btn ghost sm" id="ve-undo" data-hint="Скасувати (Ctrl+Z)" disabled>↶</button>
      <button class="btn ghost sm" id="ve-redo" data-hint="Повторити (Ctrl+Shift+Z)" disabled>↷</button>
      <span class="ve-grow"></span>
      <div class="vs-actions ve-acts" id="vs-actions"></div>
      <button class="x" id="vs-x">&times;</button>
    </div>
    <div class="ve-main">
      <nav class="ve-tools" id="ve-tools">${VE_TABS.map(([k, l, d]) => `<button data-vt="${k}" data-hint="${l}"><svg viewBox="0 0 24 24" width="20" height="20"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${l}</span></button>`).join("")}</nav>
      <div class="ve-left" id="ve-left"><div id="ve-left-body"></div><div class="vs-panel" id="vs-panel"></div></div>
      <div class="ve-center">
        <div class="vs-stage ve-stage" id="vs-stage"><canvas id="vs-canvas"></canvas><div class="ve-ov" id="ve-ov"></div><div class="ve-banner" id="ve-banner" hidden></div></div>
        <div class="ve-transport">
          <button class="btn ghost sm" id="ve-start" data-hint="На початок">⏮</button>
          <button class="btn ghost sm" id="ve-back" data-hint="Кадр назад (←, коли нічого не вибрано)">◀</button>
          <button class="btn primary sm" id="ve-play" data-hint="Програти / пауза (пробіл)">▶</button>
          <button class="btn ghost sm" id="ve-fwd" data-hint="Кадр вперед (→)">▶︎</button>
          <span class="ve-time" id="ve-time">0:00.0 / 0:00.0</span>
          <span class="ve-grow"></span>
          <label class="vs-chk ve-chk" data-hint="Показувати зони, які закривають кнопки TikTok"><input type="checkbox" id="ve-guides"> Зони TikTok</label>
          <label class="vs-chk ve-chk" data-hint="Прилипання до центру, країв та інших елементів під час перетягування. Утримуйте Alt, щоб тимчасово вимкнути"><input type="checkbox" id="ve-snap" checked> Прилипання</label>
        </div>
      </div>
      <aside class="ve-right" id="ve-insp"></aside>
    </div>
    <div class="ve-tl" id="ve-tl"></div>
  </div>`;
  document.body.appendChild(m);
  $("#vs-x").onclick = () => vsClose();
  window.addEventListener("resize", () => { if (veActive() && VS.canvas && VS.canvas.isConnected) { vsCanvas(); veTimeline(); } });
  $$("#ve-tools [data-vt]").forEach((b) => b.onclick = () => { VE.tab = b.dataset.vt; vePanel(); });
  $$("#ve-fmt [data-vf]").forEach((b) => b.onclick = () => { VS.fmt = b.dataset.vf; vsSave(); vsRender(); veFmtBtns(); });
  $("#ve-undo").onclick = veUndo;
  $("#ve-redo").onclick = veRedo;
  $("#ve-play").onclick = () => vePlayToggle();
  $("#ve-start").onclick = () => veSeekT(0);
  $("#ve-back").onclick = () => veSeekT(veNowT() - 1 / VS.fps);
  $("#ve-fwd").onclick = () => veSeekT(veNowT() + 1 / VS.fps);
  $("#ve-guides").onchange = (e) => { VS.guides = e.target.checked; vsSave(); };
  veOvBind();
  document.addEventListener("keydown", veKeys, true);
}
function veFmtBtns() {
  $$("#ve-fmt [data-vf]").forEach((b) => b.classList.toggle("on", b.dataset.vf === VS.fmt));
  if ($("#ve-guides")) { $("#ve-guides").checked = !!VS.guides; $("#ve-guides").parentElement.hidden = VS.fmt !== "tiktok"; }
}
function vePlayToggle() {
  vsTap();
  if (S.playing) { VS.scrub = curBeat(); stopPlay(); veSyncVideos(veNowT(), false); return; }
  const r = vsRange();
  S.playBeat = VS.scrub != null && VS.scrub >= r[0] && VS.scrub < r[1] - 0.25 ? VS.scrub : r[0];
  play();
  vsLoop();
}
function veSeekT(t) {
  if (S.playing) stopPlay();
  VS.scrub = veTToBeat(veClamp(t, 0, veDur()));
  veSyncVideos(veNowT(), false);
}

function veTick(beat) {
  if (!VE.doc) return;
  const t = veNowT();
  veSyncVideos(t, S.playing);
  const tm = $("#ve-time");
  if (tm) tm.textContent = `${vsFmtTime(t, true)} / ${vsFmtTime(veDur(), true)}`;
  const pb = $("#ve-play");
  if (pb) pb.textContent = S.playing ? "❚❚" : "▶";
  veOvUpdate(t);
  veTlPlayhead(t);
  if (VE.syncMode) veSyncBanner();
}
function veCanvasRect() {
  const c = VS.canvas, st = $("#vs-stage");
  return { c, rc: c.getBoundingClientRect(), st: st.getBoundingClientRect() };
}
function veOvUpdate(t) {
  const ov = $("#ve-ov");
  if (!ov || !VS.canvas) return;
  const { c, rc, st } = veCanvasRect();
  ov.style.left = rc.left - st.left + "px";
  ov.style.top = rc.top - st.top + "px";
  ov.style.width = rc.width + "px";
  ov.style.height = rc.height + "px";
  const l = veSel();
  let box = ov.querySelector(".ve-sel");
  if (!l || !veVisible(l, t) && l.type !== "lyrics" || l.hidden) { if (box) box.hidden = true; return; }
  if (!box) {
    box = document.createElement("div");
    box.className = "ve-sel";
    box.innerHTML = ["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((h) => `<i class="ve-h ve-h-${h}" data-h="${h}"></i>`).join("") + `<i class="ve-rot" data-h="rot"></i><b class="ve-sel-tag"></b>`;
    ov.appendChild(box);
  }
  const k = rc.width / c.width, b = veLayerBox(l, c.width, c.height, t);
  box.hidden = false;
  const w = Math.max(6, b.w * k), h = Math.max(6, b.h * k);
  box.style.width = w + "px";
  box.style.height = h + "px";
  box.style.transform = `translate(${b.cx * k - w / 2}px, ${b.cy * k - h / 2}px) rotate(${b.r}deg)`;
  box.classList.toggle("locked", !!l.locked);
  box.classList.toggle("kf", !!(vePos(l).kf || []).length);
  const tag = box.querySelector(".ve-sel-tag");
  const txt = veLabel(l) + (l.locked ? " · заблоковано" : "");
  if (tag.textContent !== txt) tag.textContent = txt;
  const side = l.type === "text" || l.type === "lyrics" || l.type === "timer" || l.type === "shape" || l.type === "viz" || l.type === "progress" || l.type === "image" || l.type === "video";
  box.querySelectorAll(".ve-h-e, .ve-h-w").forEach((x) => x.hidden = !side);
  box.querySelectorAll(".ve-h-n, .ve-h-s").forEach((x) => x.hidden = !(l.type === "shape" || l.type === "viz" || l.type === "progress"));
}
function veHit(px, py, t, withScene) {
  const c = VS.canvas, L = VE.doc.layers;
  for (let i = L.length - 1; i >= 0; i--) {
    const l = L[i];
    if (!veVisible(l, t) || (l.type === "scene" && !withScene)) continue;
    if (l.type === "lyrics" && veLyricsAt(l, veTToBeat(t)).cur < 0) continue;
    const b = veLayerBox(l, c.width, c.height, t);
    const a = -b.r * Math.PI / 180, dx = px - b.cx, dy = py - b.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    const pad = 6 * c.width / c.getBoundingClientRect().width;
    if (Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad) return l;
  }
  return null;
}
function veEditPos(l, t) {
  const p = vePos(l);
  if (!p.kf.length) return p;
  let k = p.kf.find((x) => Math.abs(x.t - t) < 0.04);
  if (!k) {
    const cur = veTransform(l, t);
    k = { t: +t.toFixed(3), x: cur.x, y: cur.y, s: cur.s, r: cur.r, o: cur.o ?? 1 };
    p.kf.push(k);
    p.kf.sort((a, b) => a.t - b.t);
  }
  return k;
}
function veGuides(lines) {
  const ov = $("#ve-ov");
  ov.querySelectorAll(".ve-gl").forEach((x) => x.remove());
  for (const [dir, v] of lines) {
    const d = document.createElement("i");
    d.className = "ve-gl " + dir;
    d.style[dir === "v" ? "left" : "top"] = v * 100 + "%";
    ov.appendChild(d);
  }
}
function veOvBind() {
  const ov = $("#ve-ov");
  let D = null;
  const toCanvas = (e) => {
    const { c, rc } = veCanvasRect();
    return [(e.clientX - rc.left) * c.width / rc.width, (e.clientY - rc.top) * c.height / rc.height, c.width / rc.width];
  };
  ov.addEventListener("pointerdown", (e) => {
    if (e.button === 2 || !VE.doc) return;
    const t = veNowT(), [px, py, kk] = toCanvas(e);
    const hEl = e.target.closest("[data-h]");
    let l = hEl ? veSel() : veHit(px, py, t, e.altKey);
    if (!l) { VE.sel = null; veInspector(); veTimeline(); return; }
    if (VE.sel !== l.id) { VE.sel = l.id; veInspector(); veTimeline(); }
    if (l.locked) return;
    const c = VS.canvas, b = veLayerBox(l, c.width, c.height, t);
    const p = veEditPos(l, t);
    D = { l, h: hEl ? hEl.dataset.h : "move", px, py, kk, b, p0: { x: p.x, y: p.y, s: p.s, r: p.r }, maxW: l.maxW, w: l.w, hh: l.h, t, moved: false };
    ov.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  ov.addEventListener("pointermove", (e) => {
    if (!D) {
      const t = veNowT();
      if (!VE.doc || !VS.canvas) return;
      const [px, py] = toCanvas(e);
      const h = e.target.closest("[data-h]");
      ov.style.cursor = h ? (h.dataset.h === "rot" ? "grab" : "nwse-resize") : veHit(px, py, t, e.altKey) ? "move" : "default";
      return;
    }
    const [px, py] = toCanvas(e), c = VS.canvas, W = c.width, H = c.height, l = D.l, p = veEditPos(l, D.t);
    D.moved = true;
    const snap = $("#ve-snap") && $("#ve-snap").checked && !e.altKey, th = 8 * D.kk;
    if (D.h === "move") {
      let nx = D.p0.x + (px - D.px) / W, ny = D.p0.y + (py - D.py) / H;
      const gl = [];
      if (snap) {
        const hw = D.b.w / 2 / W, hh = D.b.h / 2 / H;
        const ins = vsInsets(W, H), mx = (VS.fmt === "tiktok" && VS.safe ? ins.l : W * 0.05) / W, my = (VS.fmt === "tiktok" && VS.safe ? ins.t : H * 0.05) / H;
        const mxr = (VS.fmt === "tiktok" && VS.safe ? ins.r : W * 0.05) / W, myb = (VS.fmt === "tiktok" && VS.safe ? ins.b : H * 0.05) / H;
        const xs = [[0.5, 0.5, "c"], [mx + hw, mx, "l"], [1 - mxr - hw, 1 - mxr, "r"]], ys = [[0.5, 0.5, "c"], [my + hh, my, "t"], [1 - myb - hh, 1 - myb, "b"]];
        for (const o of VE.doc.layers) {
          if (o.id === l.id || o.type === "scene" || !veVisible(o, D.t)) continue;
          const tr = veTransform(o, D.t);
          xs.push([tr.x, tr.x, "o"]);
          ys.push([tr.y, tr.y, "o"]);
        }
        let bx = null, by = null;
        for (const [v, line] of xs) if (Math.abs(nx - v) * W < th && (bx == null || Math.abs(nx - v) < Math.abs(nx - bx[0]))) bx = [v, line];
        for (const [v, line] of ys) if (Math.abs(ny - v) * H < th && (by == null || Math.abs(ny - v) < Math.abs(ny - by[0]))) by = [v, line];
        if (bx) { nx = bx[0]; gl.push(["v", bx[1]]); }
        if (by) { ny = by[0]; gl.push(["h", by[1]]); }
      }
      veGuides(gl);
      p.x = +nx.toFixed(4);
      p.y = +ny.toFixed(4);
    } else if (D.h === "rot") {
      const a0 = Math.atan2(D.py - D.b.cy, D.px - D.b.cx), a1 = Math.atan2(py - D.b.cy, px - D.b.cx);
      let r = D.p0.r + (a1 - a0) * 180 / Math.PI;
      r = ((r + 180) % 360 + 360) % 360 - 180;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else if (snap) for (const v of [-180, -90, 0, 90, 180]) if (Math.abs(r - v) < 3) r = v;
      p.r = +r.toFixed(2);
    } else {
      const a = -D.b.r * Math.PI / 180;
      const loc = (x, y) => { const dx = x - D.b.cx, dy = y - D.b.cy; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; };
      const [lx0, ly0] = loc(D.px, D.py), [lx1, ly1] = loc(px, py);
      if (D.h.length === 2) {
        const r0 = Math.hypot(lx0, ly0), r1 = Math.hypot(lx1, ly1);
        p.s = +veClamp(D.p0.s * r1 / Math.max(1, r0), 0.05, 20).toFixed(4);
      } else if (D.h === "e" || D.h === "w") {
        const k = Math.max(0.05, Math.abs(lx1) / Math.max(1, Math.abs(lx0)));
        if (l.type === "text" || l.type === "lyrics" || l.type === "timer") l.maxW = Math.round(veClamp(D.maxW * k, 60, 4000));
        else l.w = Math.round(veClamp(D.w * k, 4, 6000));
      } else {
        const k = Math.max(0.05, Math.abs(ly1) / Math.max(1, Math.abs(ly0)));
        l.h = Math.round(veClamp(D.hh * k, 2, 6000));
      }
    }
    veInspSync();
  });
  const end = () => {
    if (!D) return;
    veGuides([]);
    if (D.moved) veChanged(true);
    D = null;
  };
  ov.addEventListener("pointerup", end);
  ov.addEventListener("pointercancel", end);
  ov.addEventListener("dblclick", (e) => {
    const l = veSel();
    if (!l) return;
    if (l.type === "text" || l.type === "lyrics") {
      VE.itab = "style";
      veInspector();
      const ta = $(l.type === "text" ? "#vi-text" : "#ve-left [data-ln-text]");
      if (l.type === "lyrics") { VE.tab = "lyrics"; vePanel(); }
      if (ta) { ta.focus(); ta.select && ta.select(); }
    }
  });
  ov.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!VE.doc) return;
    const [px, py] = toCanvas(e), l = veHit(px, py, veNowT(), true);
    if (!l) return;
    VE.sel = l.id;
    veInspector();
    veTimeline();
    veLayerMenu(e, l);
  });
  ov.addEventListener("wheel", (e) => {
    const l = veSel();
    if (!l || l.locked || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const p = veEditPos(l, veNowT());
    p.s = +veClamp(p.s * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.05, 20).toFixed(4);
    veInspSync();
    veChanged();
  }, { passive: false });
}
function veLayerMenu(e, l) {
  menu(e, [
    ["Дублювати  (Ctrl+D)", () => veDuplicate(l.id)],
    ["На передній план  (Ctrl+])", () => veOrder(l.id, "front")],
    ["Вище", () => veOrder(l.id, "up")],
    ["Нижче", () => veOrder(l.id, "down")],
    ["На задній план  (Ctrl+[)", () => veOrder(l.id, "back")],
    null,
    [l.hidden ? "Показати" : "Сховати", () => { l.hidden = !l.hidden; veChanged(true); veRefresh(); }],
    [l.locked ? "Розблокувати" : "Заблокувати", () => { l.locked = !l.locked; veChanged(true); veRefresh(); }],
    ["Почати з поточного моменту", () => { l.t0 = +veNowT().toFixed(2); delete l.tail; if (l.t1 != null && l.t1 <= l.t0) l.t1 = null; veChanged(true); veRefresh(); }],
    ["Закінчити на поточному моменті", () => { const t = +veNowT().toFixed(2); if (t > veT0(l)) { l.t1 = t; delete l.tail; veChanged(true); veRefresh(); } }],
    null,
    ["Видалити  (Delete)", () => veRemove(l.id), "danger"]
  ]);
}
function veTyping(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" && !["checkbox", "radio", "range", "color", "button"].includes(t.type) || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}
function veKeys(e) {
  if (!veActive() || VS.busy) return;
  if (VE.syncMode) {
    if (e.key === " " || e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); veSyncKey(e.key); }
    return;
  }
  if (veTyping(e)) { if (e.key === "Escape") e.target.blur(); e.stopPropagation(); return; }
  const l = veSel(), mod = e.ctrlKey || e.metaKey, k = e.key;
  let done = true;
  if (mod && (k === "z" || k === "Z" || k === "я" || k === "Я")) e.shiftKey ? veRedo() : veUndo();
  else if (mod && (k === "y" || k === "н")) veRedo();
  else if (k === " ") vePlayToggle();
  else if (mod && (k === "d" || k === "в") && l) veDuplicate(l.id);
  else if (mod && (k === "c" || k === "с") && l) { VE.clip = JSON.stringify(l); toast("Скопійовано: " + veLabel(l)); }
  else if (mod && (k === "v" || k === "м") && VE.clip) { const c = JSON.parse(VE.clip); c.id = veUid(); for (const f of VE_FMTS) if (c.pos[f]) { c.pos[f].x = Math.min(0.95, c.pos[f].x + 0.03); c.pos[f].y = Math.min(0.95, c.pos[f].y + 0.03); } veAdd(c); }
  else if (mod && (k === "]" || k === "ї") && l) veOrder(l.id, e.shiftKey ? "front" : "up");
  else if (mod && (k === "[" || k === "х") && l) veOrder(l.id, e.shiftKey ? "back" : "down");
  else if ((k === "Delete" || k === "Backspace") && l) veRemove(l.id);
  else if (k === "Escape" && l) { VE.sel = null; veInspector(); veTimeline(); }
  else if (k.startsWith("Arrow") && l && !l.locked && !mod) {
    const c = VS.canvas, st = e.shiftKey ? 10 : 1, p = veEditPos(l, veNowT());
    if (k === "ArrowLeft") p.x -= st / c.width; else if (k === "ArrowRight") p.x += st / c.width;
    else if (k === "ArrowUp") p.y -= st / c.height; else p.y += st / c.height;
    veInspSync();
    veChanged();
  } else if (k === "ArrowLeft" && !l) veSeekT(veNowT() - (e.shiftKey ? 1 : 1 / VS.fps));
  else if (k === "ArrowRight" && !l) veSeekT(veNowT() + (e.shiftKey ? 1 : 1 / VS.fps));
  else if (k === "Home") veSeekT(0);
  else done = false;
  if (done) { e.preventDefault(); e.stopPropagation(); }
}

async function vePrompt(title, hint, def, multi) {
  const field = multi ? `<textarea id="ve-pr" rows="12" style="width:100%;resize:vertical">${escapeHtml(def || "")}</textarea>` : `<input id="ve-pr" style="width:100%" value="${escapeHtml(def || "")}">`;
  const p = inkConfirm(title, `<p class="muted small">${hint}</p>${field}`, "Готово");
  const cm = document.getElementById("ink-confirm");
  if (cm) document.body.appendChild(cm);
  setTimeout(() => { const i = document.getElementById("ve-pr"); if (i) { i.focus(); if (!multi) i.select(); i.addEventListener("keydown", (e) => e.stopPropagation()); } }, 30);
  const ok = await p;
  if (!ok) return null;
  return (document.getElementById("ve-pr") || {}).value ?? null;
}
function veH(title, sub) { return `<div class="ve-phd"><b>${title}</b>${sub ? `<span class="muted small">${sub}</span>` : ""}</div>`; }
function vePanel() {
  const box = $("#ve-left-body"), vp = $("#vs-panel");
  if (!box) return;
  $$("#ve-tools [data-vt]").forEach((b) => b.classList.toggle("on", b.dataset.vt === VE.tab));
  vp.hidden = VE.tab !== "video";
  box.hidden = VE.tab === "video";
  if (VE.tab === "video") return;
  const f = { templates: vePTemplates, text: vePText, lyrics: vePLyrics, media: vePMedia, elements: vePElements, viz: vePViz, bg: vePBg, layers: vePLayers }[VE.tab];
  if (f) f(box);
}
const VE_TEMPLATES = [
  ["classic", "Класика", "Сцена стилю, назва, виконавець, субтитри й прогрес"],
  ["karaoke", "Караоке", "Розмита обкладинка, великий текст із підсвіткою слів"],
  ["cover", "Обкладинка", "Обкладинка пульсує в такт, хвиля під нею"],
  ["minimal", "Мінімал", "Темний градієнт і коло спектра"],
  ["quote", "Цитата", "Великий рядок пісні по центру, як у сторіз"],
  ["clean", "Чисте полотно", "Лише фон — збирайте все самі"]
];
function veTemplate(k) {
  const acc = VS.accent || "#ffb547", doc = { v: 1, bg: { kind: "scene", c1: "#160f2a", c2: "#05060a", angle: 135, blur: 40, dim: 45 }, layers: [], media: VE.doc.media || [], fonts: VE.doc.fonts || [] };
  const L = (l, a, s) => doc.layers.push(veAnchor(l, a, s));
  const lyr = VE.doc.layers.find((l) => l.type === "lyrics");
  const lines = lyr && lyr.lines && lyr.lines.length ? JSON.parse(JSON.stringify(lyr.lines)) : [];
  if (k === "classic") { const d = veDefaultDoc(); doc.layers = d.layers; doc.layers.forEach((l) => { if (l.type === "lyrics") { l.hidden = false; l.lines = lines; } }); }
  else if (k === "karaoke") {
    doc.bg = { kind: "blur", media: "@cover", blur: 50, dim: 55 };
    L(veMakeText("Назва", { dyn: "title", name: "Назва", size: 44, weight: 800, shadow: { on: false } }), "top", 1);
    L(veMakeText("Виконавець", { dyn: "artist", name: "Виконавець", size: 30, weight: 600, color: acc, shadow: { on: false } }), "top2", 1);
    L(veMakeLyrics({ mode: "two", size: 76, weight: 900, hl: acc, lines, box: { on: false }, stroke: { w: 4, c: "#000000" }, maxW: 960 }), "center", 1);
    L(veMakeProgress({ color: acc }), "foot", { tiktok: 1, youtube: 1.6, square: 1 });
    L(veMakeWm(), "corner", 1);
  } else if (k === "cover") {
    doc.bg = { kind: "blur", media: "@cover", blur: 60, dim: 50 };
    L(veMakeImage("@cover", { name: "Обкладинка", w: 640, radius: 36, shadow: { on: true, c: "#000000", a: 0.6, blur: 60, x: 0, y: 24 }, anim: { in: "zoom", inDur: 0.6, out: "fade", outDur: 0.3, loop: "beat", loopAmt: 0.25 } }), "upper", { tiktok: 1, youtube: 0.75, square: 0.8 });
    L(veMakeText("Назва", { dyn: "title", name: "Назва", size: 70, weight: 900 }), "lower", 1);
    L(veMakeViz("mirror", { color: acc, color2: "#f472b6", w: 860, h: 160 }), "bottom", 1);
    L(veMakeLyrics({ hidden: !lines.length, lines, mode: "line", size: 44, hl: acc }), "foot", 1);
  } else if (k === "minimal") {
    doc.bg = { kind: "gradient", c1: "#1b1033", c2: "#040507", angle: 160 };
    L(veMakeViz("circle", { color: acc, color2: "#a78bfa", w: 760, h: 760, bands: 72 }), "center", 1);
    L(veMakeImage("@cover", { name: "Обкладинка", w: 380, mask: "circle", anim: { in: "fade", inDur: 0.5, out: "fade", outDur: 0.3, loop: "spin", loopAmt: 0.12 } }), "center", 1);
    L(veMakeText("Назва", { dyn: "title", name: "Назва", font: "Manrope", size: 56, weight: 800, shadow: { on: false } }), "bottom", 1);
    L(veMakeText("Виконавець", { dyn: "artist", name: "Виконавець", font: "Manrope", size: 32, weight: 400, color: "#c9cdd8", upper: true, ls: 0.2, shadow: { on: false } }), "foot", 1);
  } else if (k === "quote") {
    doc.bg = { kind: "gradient", c1: "#0f172a", c2: "#3b0a2a", angle: 120 };
    L(veMakeLyrics({ mode: "word", font: "Playfair Display", italic: true, weight: 700, size: 84, lines, box: { on: false }, shadow: { on: true, c: "#000000", a: 0.4, blur: 20, x: 0, y: 6 }, maxW: 880, anim: { in: "fade", inDur: 0.2, out: "fade", outDur: 0.3, loop: "none", loopAmt: 0.5 } }), "center", 1);
    L(veMakeText("Назва", { dyn: "title", name: "Назва", font: "Manrope", size: 30, weight: 600, color: "#e9ebf1", upper: true, ls: 0.25, shadow: { on: false } }), "foot", 1);
    L(veMakeViz("line", { color: "#ffffff", color2: "#ffffff", w: 700, h: 90, bands: 64 }), "bottom", 1);
  } else {
    doc.bg = { kind: "color", c1: "#0b0c10" };
  }
  VE.doc = doc;
  VE.sel = null;
  veChanged(true);
  veRefresh();
  toast("Шаблон застосовано. Скасувати — Ctrl+Z.");
}
function vePTemplates(box) {
  box.innerHTML = veH("Шаблони", "Готове розташування елементів. Усе можна змінити після вибору.") +
    `<div class="ve-cards">${VE_TEMPLATES.map(([k, t, d]) => `<button class="ve-tcard t-${k}" data-tpl="${k}"><i></i><b>${t}</b><span>${d}</span></button>`).join("")}</div>
    <div class="muted small ve-note">Шаблон замінює поточні шари. Текст субтитрів зберігається.</div>`;
  $$("[data-tpl]", box).forEach((b) => b.onclick = () => veTemplate(b.dataset.tpl));
}
function veAddText(preset, extra) {
  const l = veMakeText(extra && extra.text || tr("Ваш текст"), Object.assign({}, preset ? JSON.parse(JSON.stringify(preset)) : {}, extra || {}));
  l._atNow = true;
  veAnchor(l, "center", 1);
  veAdd(l);
  VE.itab = "style";
  veInspector();
  setTimeout(() => { const ta = $("#vi-text"); if (ta) { ta.focus(); ta.select(); } }, 30);
}
function vePText(box) {
  const sel = veSel(), isText = sel && (sel.type === "text" || sel.type === "lyrics" || sel.type === "timer");
  box.innerHTML = veH("Текст", isText ? "Клік на стиль — застосувати до вибраного тексту" : "Клік на стиль — додати новий текст") +
    `<button class="btn primary ve-wide" id="vp-addtext">＋ Додати текст</button>
    <div class="ve-presets">${VE_PRESETS.map(([n, p], i) => `<button class="ve-preset" data-pre="${i}"><span style="${vePresetCss(p)}">Aa</span><em>${n}</em></button>`).join("")}</div>
    ${veH("Текст, що змінюється сам", "Підставляється з проєкту")}
    <div class="ve-chips">${[["title", "Назва треку"], ["artist", "Виконавець"], ["bpm", "Темп"], ["key", "Тональність"], ["section", "Частина пісні"], ["chord", "Поточний акорд"]].map(([k, n]) => `<button data-dyn="${k}">${n}</button>`).join("")}<button data-timer="1">Таймер</button></div>`;
  $("#vp-addtext", box).onclick = () => veAddText(VE_PRESETS[0][1]);
  $$("[data-pre]", box).forEach((b) => b.onclick = () => {
    const p = VE_PRESETS[+b.dataset.pre][1], s = veSel();
    if (s && (s.type === "text" || s.type === "lyrics" || s.type === "timer")) {
      const keep = s.type === "lyrics" ? { box: s.box } : {};
      Object.assign(s, JSON.parse(JSON.stringify(p)), s.type === "lyrics" && !p.box.on ? keep : {});
      veChanged(true);
      veInspector();
    } else veAddText(p);
  });
  $$("[data-dyn]", box).forEach((b) => b.onclick = () => veAddText(VE_PRESETS[0][1], { dyn: b.dataset.dyn, text: b.textContent, name: b.textContent, size: b.dataset.dyn === "title" ? 72 : 44 }));
  $("[data-timer]", box).onclick = () => { const l = veAnchor(veBase("timer", Object.assign(JSON.parse(JSON.stringify(VE_TEXT_DEF)), { name: "Таймер", size: 40, font: "Manrope", weight: 700, fmtT: "both" })), "bottom", 1); veAdd(l); };
}
function vePresetCss(p) {
  const c = p.grad && p.grad.on ? `background:linear-gradient(90deg,${p.grad.c1},${p.grad.c2});-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${p.color === "#00000000" ? "transparent" : p.color}`;
  const st = p.stroke && p.stroke.w ? `-webkit-text-stroke:${Math.min(2, p.stroke.w / 2)}px ${p.stroke.c};` : "";
  const sh = p.shadow && p.shadow.on ? `text-shadow:${p.shadow.x / 3}px ${p.shadow.y / 3}px ${p.shadow.blur / 3}px ${vsAlpha(p.shadow.c, p.shadow.a)};` : "";
  const bx = p.box && p.box.on ? `background:${vsAlpha(p.box.c, p.box.a)};padding:0 6px;border-radius:5px;` : "";
  return `font-family:'${p.font}';font-weight:${p.weight};${p.italic ? "font-style:italic;" : ""}${c};${st}${sh}${bx}${p.upper ? "text-transform:uppercase;" : ""}`;
}
function veLyrLayer(create) {
  let l = VE.doc.layers.find((x) => x.type === "lyrics");
  if (!l && create) { l = veAnchor(veMakeLyrics({ hl: VS.accent || "#ffb547" }), "lower", 1); veAdd(l, false); }
  return l;
}
function veLyrMaterialize(l) {
  if (!l.lines || !l.lines.length) l.lines = vsPhrases().map((p) => ({ b0: +p.start.toFixed(3), b1: +p.end.toFixed(3), text: p.text }));
  return l.lines;
}
function vePLyrics(box) {
  const l = veLyrLayer(false);
  if (!l) {
    box.innerHTML = veH("Субтитри" + qhBtn("vlyrics"), "Текст пісні на відео, синхронно з вокалом") + `<button class="btn primary ve-wide" id="vp-addlyr">＋ Додати субтитри</button>
      <div class="muted small ve-note">Текст береться з вокальної студії (вкладка «Текст») і розставляється за нотами вокалу. Можна вставити свій текст і синхронізувати натисканням пробілу.</div>`;
    $("#vp-addlyr", box).onclick = () => { const x = veLyrLayer(true); veLyrMaterialize(x); VE.sel = x.id; veChanged(true); veRefresh(); };
    return;
  }
  const P = period(), auto = !(l.lines && l.lines.length), lines = veLyricsLines(l), now = vsPreviewBeat(), cur = veLyricsAt(l, now).cur;
  box.innerHTML = veH("Субтитри" + qhBtn("vlyrics"), auto ? "Рядки розставлено автоматично за вокалом. Змініть будь-який — і вони стануть вашими." : `${lines.length} рядків`) +
    `<div class="np-seg ve-seg" id="vp-mode">${[["karaoke", "Караоке"], ["two", "Караоке + наступний"], ["line", "Рядок"], ["word", "По слову"]].map(([k, n]) => `<button data-m="${k}" class="${l.mode === k ? "on" : ""}">${n}</button>`).join("")}</div>
    <div class="ve-lyr-acts">
      <button class="btn ghost sm" id="vp-sync" data-hint="Програвання з початку: натискайте пробіл на початку кожного рядка — і текст ляже точно під голос">⏱ Синхронізувати пробілом</button>
      <button class="btn ghost sm" id="vp-auto" data-hint="Заново розставити рядки за нотами вокальної доріжки">Авто за вокалом</button>
      <button class="btn ghost sm" id="vp-paste" data-hint="Вставити свій текст: кожен рядок — окремий субтитр">Вставити текст…</button>
      <button class="btn ghost sm" id="vp-shift" data-hint="Зсунути всі рядки раніше чи пізніше">Зсув…</button>
    </div>
    <div class="ve-lines" id="vp-lines">${lines.map((x, i) => `<div class="ve-line ${i === cur ? "cur" : ""}" data-i="${i}">
        <button class="ve-ln-go" data-go="${i}" data-hint="Перейти до рядка">${i + 1}</button>
        <input class="ve-ln-t" data-t0="${i}" value="${vsFmtTime((x.b0 - vsRange()[0]) * P, true)}" data-hint="Початок рядка (хв:сек від початку відео)">
        <input class="ve-ln-t" data-t1="${i}" value="${vsFmtTime((x.b1 - vsRange()[0]) * P, true)}" data-hint="Кінець рядка">
        <input class="ve-ln-x" data-ln-text="${i}" value="${escapeHtml(x.text)}">
        <button class="ve-ln-b" data-now="${i}" data-hint="Почати рядок з поточного моменту">⤓</button>
        <button class="ve-ln-b" data-del="${i}" data-hint="Видалити рядок">✕</button></div>`).join("") || `<div class="muted small ve-note">Рядків немає. Вставте текст або додайте рядок.</div>`}</div>
    <button class="btn ghost sm ve-wide" id="vp-addline">＋ Рядок з поточного моменту</button>
    <div class="muted small ve-note">Час рахується від початку відео. Стиль тексту — праворуч, у вкладці «Стиль».</div>`;
  const commit = () => { veChanged(true); veTimeline(); };
  $$("#vp-mode [data-m]", box).forEach((b) => b.onclick = () => { l.mode = b.dataset.m; commit(); vePLyrics(box); veInspector(); });
  $("#vp-auto", box).onclick = () => { VS.phr = null; l.lines = []; veLyrMaterialize(l); commit(); vePLyrics(box); if (!l.lines.length) toast("Не вдалося розставити: потрібні текст пісні у вокальній студії й вокальна доріжка з нотами.", true); };
  $("#vp-sync", box).onclick = () => veSyncStart(l);
  $("#vp-paste", box).onclick = () => vePasteLyrics(l);
  $("#vp-shift", box).onclick = async () => {
    const v = await vePrompt("Зсув субтитрів", "На скільки секунд зсунути всі рядки? Від'ємне значення — раніше.", "0.2");
    const sec = parseFloat(String(v || "").replace(",", "."));
    if (!isFinite(sec) || !sec) return;
    veLyrMaterialize(l).forEach((x) => { x.b0 += sec / P; x.b1 += sec / P; });
    commit();
    vePLyrics(box);
  };
  $("#vp-addline", box).onclick = () => {
    const L = veLyrMaterialize(l), b = vsPreviewBeat();
    L.push({ b0: b, b1: b + S.B.timing.bpb * 2, text: tr("Новий рядок") });
    L.sort((a, c) => a.b0 - c.b0);
    commit();
    vePLyrics(box);
  };
  $$("[data-go]", box).forEach((b) => b.onclick = () => { const x = lines[+b.dataset.go]; veSeekT((x.b0 - vsRange()[0]) * P + 0.01); });
  $$("[data-ln-text]", box).forEach((inp) => { inp.oninput = () => { const L = veLyrMaterialize(l); L[+inp.dataset.lnText].text = inp.value; veChanged(); }; });
  const tset = (inp, key) => inp.onchange = () => {
    const s = vsParseTime(inp.value);
    if (s == null) { toast("Час вводиться як хв:сек, наприклад 0:12.5", true); return vePLyrics(box); }
    const L = veLyrMaterialize(l), x = L[+inp.dataset[key === "b0" ? "t0" : "t1"]];
    x[key] = vsRange()[0] + s / P;
    if (x.b1 <= x.b0) x.b1 = x.b0 + 0.5 / P;
    L.sort((a, c) => a.b0 - c.b0);
    commit();
    vePLyrics(box);
  };
  $$("[data-t0]", box).forEach((i) => tset(i, "b0"));
  $$("[data-t1]", box).forEach((i) => tset(i, "b1"));
  $$("[data-now]", box).forEach((b) => b.onclick = () => {
    const L = veLyrMaterialize(l), i = +b.dataset.now, x = L[i], nb = vsPreviewBeat(), len = x.b1 - x.b0;
    x.b0 = nb;
    x.b1 = nb + Math.max(0.5 / P, len);
    if (i > 0 && L[i - 1].b1 > nb) L[i - 1].b1 = nb;
    commit();
    vePLyrics(box);
  });
  $$("[data-del]", box).forEach((b) => b.onclick = () => { veLyrMaterialize(l).splice(+b.dataset.del, 1); commit(); vePLyrics(box); });
  $$(".ve-ln-t, .ve-ln-x", box).forEach((x) => x.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") x.blur(); });
  const c = box.querySelector(".ve-line.cur");
  if (c) c.scrollIntoView({ block: "nearest" });
}
async function vePasteLyrics(l) {
  const base = (S.mix && S.mix.lyrics) || veLyricsLines(l).map((x) => x.text).join("\n");
  const txt = await vePrompt("Текст субтитрів", "Кожен рядок — окремий субтитр. Після вставки натисніть «Синхронізувати пробілом», щоб розставити час під голос.", base, true);
  if (txt == null) return;
  const rows = String(txt).split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !/^\[.*\]$/.test(s));
  const old = veLyricsLines(l), r = vsRange(), P = period(), dur = r[1] - r[0];
  const step = Math.max(1 / P, Math.min(S.B.timing.bpb * 2, dur / Math.max(1, rows.length)));
  l.lines = rows.map((text, i) => old[i] ? { b0: old[i].b0, b1: old[i].b1, text } : { b0: r[0] + i * step, b1: r[0] + (i + 1) * step - 0.05, text });
  veChanged(true);
  veRefresh();
}
function veSyncStart(l) {
  veLyrMaterialize(l);
  if (!l.lines.length) return toast("Спершу додайте текст субтитрів.", true);
  VE.syncMode = { l, i: 0 };
  if (S.playing) stopPlay();
  VS.scrub = vsRange()[0];
  $("#ve-banner").hidden = false;
  veSyncBanner();
  vePlayToggle();
}
function veSyncBanner() {
  const s = VE.syncMode, b = $("#ve-banner");
  if (!s || !b) return;
  const L = s.l.lines, nx = L[s.i];
  b.innerHTML = `<b>Синхронізація ${Math.min(s.i + 1, L.length)} / ${L.length}</b>${nx ? `<span>Далі: «${escapeHtml(nx.text)}»</span>` : "<span>Усі рядки розставлено</span>"}<em>Пробіл — почати рядок · Enter — закінчити рядок · Esc — готово</em>`;
  if (!S.playing && s.started) veSyncKey("Escape");
  s.started = s.started || S.playing;
}
function veSyncKey(k) {
  const s = VE.syncMode;
  if (!s) return;
  const L = s.l.lines, b = curBeat();
  if (k === "Escape" || s.i >= L.length && k === " ") {
    VE.syncMode = null;
    $("#ve-banner").hidden = true;
    if (S.playing) { VS.scrub = curBeat(); stopPlay(); }
    veChanged(true);
    veRefresh();
    toast("Субтитри синхронізовано. Тонко підправити можна в списку або на таймлайні.");
    return;
  }
  if (k === " ") {
    const x = L[s.i];
    const len = x.b1 - x.b0;
    if (s.i > 0 && (L[s.i - 1].open || L[s.i - 1].b1 > b)) L[s.i - 1].b1 = b - 0.02;
    if (s.i > 0) delete L[s.i - 1].open;
    x.b0 = b;
    x.b1 = b + Math.max(1 / period(), Math.min(len, S.B.timing.bpb * 4));
    x.open = true;
    s.i++;
    for (let j = s.i; j < L.length; j++) if (L[j].b0 < x.b1) { const d = x.b1 - L[j].b0 + 0.05; L[j].b0 += d; L[j].b1 += d; }
  } else if (k === "Enter" && s.i > 0) {
    L[s.i - 1].b1 = Math.max(L[s.i - 1].b0 + 0.25, b);
    delete L[s.i - 1].open;
  }
  veSyncBanner();
}
async function veUpload(kind) {
  const files = await pickLocal(kind, kind === "media");
  const out = [];
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", f, f.name);
    try {
      const r = await fetch(`/api/project/${S.pid}/video/media`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "помилка");
      out.push(j);
    } catch (e) {
      toast(`«${f.name}» не додано: ${e.message}`, true);
    }
  }
  return out;
}
function vePMedia(box) {
  const lib = VE.doc.media || [];
  box.innerHTML = veH("Медіа", "Фото, GIF і відеокліпи поверх або під музикою") +
    `<button class="btn primary ve-wide" id="vp-up">＋ Завантажити фото, GIF або відео</button>
    <div class="ve-media">
      <button class="ve-mitem" data-cover="1">${VS.cover ? `<img src="${VS.cover.src}" alt="">` : "<i>немає</i>"}<span>Обкладинка</span></button>
      ${lib.map((m) => `<button class="ve-mitem" data-m="${escapeHtml(m.name)}" title="${escapeHtml(m.orig || m.name)}">${veIsVideo(m.name) ? `<video src="${veMediaUrl(m.name)}#t=0.5" muted preload="metadata"></video><b>▶</b>` : `<img src="${veMediaUrl(m.name)}" alt="" loading="lazy">`}<span>${escapeHtml((m.orig || m.name).slice(0, 18))}</span></button>`).join("")}
    </div>
    <div class="muted small ve-note">JPG, PNG, WEBP, GIF (з анімацією), MP4, WEBM, MOV. Файли зберігаються в папці проєкту. Звук із відеокліпів не використовується — у відео звучить ваш трек.</div>`;
  $("#vp-up", box).onclick = async () => {
    const res = await veUpload("media");
    for (const j of res) {
      if (!VE.doc.media.find((m) => m.name === j.name)) VE.doc.media.push({ name: j.name, orig: j.orig });
      const l = veIsVideo(j.name) ? veMakeVideo(j.name, { name: j.orig.slice(0, 24) }) : veMakeImage(j.name, { name: j.orig.slice(0, 24) });
      l._atNow = true;
      veAdd(veAnchor(l, "center", 1));
    }
    vePanel();
  };
  $("[data-cover]", box).onclick = () => {
    if (!VS.cover) { vsCoverUpload(); return toast("Виберіть обкладинку, потім натисніть ще раз."); }
    veAdd(veAnchor(veMakeImage("@cover", { name: "Обкладинка", w: 600, radius: 28 }), "center", 1));
  };
  $$("[data-m]", box).forEach((b) => b.onclick = () => {
    const n = b.dataset.m, l = veIsVideo(n) ? veMakeVideo(n) : veMakeImage(n);
    l._atNow = true;
    veAdd(veAnchor(l, "center", 1));
  });
  $$("[data-m]", box).forEach((b) => b.oncontextmenu = (e) => {
    e.preventDefault();
    menu(e, [["Прибрати з бібліотеки відео", () => { VE.doc.media = VE.doc.media.filter((m) => m.name !== b.dataset.m); veChanged(true); vePanel(); }]]);
  });
}
function vePElements(box) {
  const acc = VS.accent || "#ffb547";
  box.innerHTML = veH("Фігури") + `<div class="ve-grid6">${[["rect", "▬"], ["circle", "●"], ["line", "―"], ["triangle", "▲"], ["star", "★"], ["heart", "♥"]].map(([k, i]) => `<button data-sh="${k}" data-hint="Додати фігуру">${i}</button>`).join("")}</div>` +
    veH("Прогрес і час") + `<div class="ve-chips"><button data-pr="bar">Смуга прогресу</button><button data-pr="knob">Смуга з повзунком</button><button data-pr="dots">Крапки</button><button data-tm="1">Таймер</button><button data-wm="1">Підпис InkBeat</button></div>` +
    veH("Стікери", "Емодзі як окремі елементи — їх можна анімувати") + `<div class="ve-emoji">${VE_EMOJI.map((e) => `<button data-em="${e}">${e}</button>`).join("")}</div>`;
  $$("[data-sh]", box).forEach((b) => b.onclick = () => {
    const k = b.dataset.sh, l = veMakeShape(k, { fill: acc, w: k === "line" ? 600 : 360, h: k === "line" ? 8 : k === "rect" ? 220 : 360 });
    l._atNow = true;
    veAdd(veAnchor(l, "center", 1));
  });
  $$("[data-pr]", box).forEach((b) => b.onclick = () => veAdd(veAnchor(veMakeProgress({ style: b.dataset.pr, color: acc, h: b.dataset.pr === "dots" ? 12 : 10 }), "foot", 1)));
  $("[data-tm]", box).onclick = () => veAdd(veAnchor(veBase("timer", Object.assign(JSON.parse(JSON.stringify(VE_TEXT_DEF)), { name: "Таймер", size: 40, font: "Manrope", weight: 700, fmtT: "both" })), "bottom", 1));
  $("[data-wm]", box).onclick = () => veAdd(veAnchor(veMakeWm(), "corner", 1));
  $$("[data-em]", box).forEach((b) => b.onclick = () => {
    const l = veMakeText(b.dataset.em, { name: "Стікер " + b.dataset.em, font: "Segoe UI Emoji", weight: 400, size: 160, shadow: { on: false }, anim: { in: "pop", inDur: 0.5, out: "fade", outDur: 0.3, loop: "pulse", loopAmt: 0.4 } });
    l._atNow = true;
    veAdd(veAnchor(l, "center", 1));
  });
}
function vePViz(box) {
  const acc = VS.accent || "#ffb547";
  const K = [["bars", "Стовпчики"], ["mirror", "Дзеркало"], ["circle", "Коло"], ["wave", "Хвиля"], ["line", "Лінія"], ["dots", "Крапки"]];
  box.innerHTML = veH("Візуалізатор", "Рухається під звук треку") + `<div class="ve-cards two">${K.map(([k, n]) => `<button class="ve-vcard" data-vz="${k}"><canvas width="160" height="70" data-prev="${k}"></canvas><b>${n}</b></button>`).join("")}</div>`;
  $$("[data-vz]", box).forEach((b) => b.onclick = () => {
    const k = b.dataset.vz, l = veMakeViz(k, { color: acc, w: k === "circle" ? 700 : 900, h: k === "circle" ? 700 : 240 });
    veAdd(veAnchor(l, k === "circle" ? "center" : "bottom", 1));
  });
  $$("[data-prev]", box).forEach((c) => {
    const g = c.getContext("2d"), l = veMakeViz(c.dataset.prev, { color: acc, w: 140, h: 56, bands: 24 });
    if (l.kind === "circle") { l.w = 70; l.h = 70; }
    g.translate(80, 35);
    const a = new Float32Array(l.bands);
    for (let i = 0; i < a.length; i++) a[i] = 0.25 + 0.6 * Math.abs(Math.sin(i * 0.55)) * (1 - i / a.length * 0.5);
    veDrawViz(g, l, { beat: 3.3, r0: 0, r1: 8, live: false }, a);
  });
}
function vePBg(box) {
  const bg = VE.doc.bg, scene = VE.doc.layers.find((l) => l.type === "scene");
  const kinds = [["scene", "Сцена стилю"], ["color", "Колір"], ["gradient", "Градієнт"], ["image", "Фото"], ["blur", "Розмите фото"]];
  box.innerHTML = veH("Фон", "Те, що під усіма елементами") +
    `<div class="ve-bgk">${kinds.map(([k, n]) => `<button data-bk="${k}" class="${bg.kind === k ? "on" : ""}">${n}</button>`).join("")}</div>
    <div id="vp-bgopt"></div>
    ${veH("Сцена стилю", "Анімація зі стилю відео: доріжки, ноти, обкладинка або візуалізатор")}
    <label class="vs-chk"><input type="checkbox" id="vp-scene" ${scene && !scene.hidden ? "checked" : ""}> Показувати сцену</label>
    <label class="vs-chk"><input type="checkbox" id="vp-scenebg" ${scene && scene.noBg ? "checked" : ""}> Без власного фону сцени (видно фон знизу)</label>
    <div class="ve-chips">${Object.entries(VSTYLES).filter(([k]) => k !== "screen").map(([k, s]) => `<button data-st="${k}" class="${VS.style === k ? "on" : ""}">${s[0]}</button>`).join("")}</div>`;
  const opt = $("#vp-bgopt", box);
  const row = (lab, html) => `<div class="vi-row"><span>${lab}</span><div>${html}</div></div>`;
  if (bg.kind === "color") opt.innerHTML = row("Колір", `<input type="color" data-bg="c1" value="${bg.c1 || "#0b0c10"}">`);
  else if (bg.kind === "gradient") opt.innerHTML = row("Колір 1", `<input type="color" data-bg="c1" value="${bg.c1 || "#1b1030"}">`) + row("Колір 2", `<input type="color" data-bg="c2" value="${bg.c2 || "#05060a"}">`) + row("Кут", `<input type="range" min="0" max="360" data-bg="angle" value="${bg.angle ?? 135}">`);
  else if (bg.kind === "image" || bg.kind === "blur") {
    const lib = VE.doc.media || [];
    opt.innerHTML = `<div class="ve-media sm"><button class="ve-mitem ${(bg.media || "@cover") === "@cover" ? "on" : ""}" data-bm="@cover">${VS.cover ? `<img src="${VS.cover.src}" alt="">` : "<i>немає</i>"}<span>Обкладинка</span></button>${lib.map((m) => `<button class="ve-mitem ${bg.media === m.name ? "on" : ""}" data-bm="${escapeHtml(m.name)}">${veIsVideo(m.name) ? `<video src="${veMediaUrl(m.name)}#t=0.5" muted preload="metadata"></video>` : `<img src="${veMediaUrl(m.name)}" alt="">`}<span>${escapeHtml((m.orig || m.name).slice(0, 14))}</span></button>`).join("")}<button class="ve-mitem" data-bup="1"><i>＋</i><span>Завантажити</span></button></div>` +
      (bg.kind === "blur" ? row("Розмиття", `<input type="range" min="0" max="100" data-bg="blur" value="${bg.blur ?? 40}">`) : "") +
      row("Затемнення", `<input type="range" min="0" max="90" data-bg="dim" value="${bg.dim ?? (bg.kind === "blur" ? 45 : 15)}">`) + row("Повільне наближення", `<input type="range" min="0" max="10" data-bg="zoom" value="${bg.zoom || 0}">`);
  } else opt.innerHTML = `<div class="muted small ve-note">Фон малює сама сцена стилю. Колір фону сцени — у вкладці «Відео» → «Оформлення».</div>`;
  $$("[data-bk]", box).forEach((b) => b.onclick = () => {
    bg.kind = b.dataset.bk;
    if (scene) scene.noBg = bg.kind !== "scene";
    if ((bg.kind === "image" || bg.kind === "blur") && !bg.media) bg.media = "@cover";
    veChanged(true);
    vePBg(box);
  });
  $$("[data-bg]", box).forEach((i) => i.oninput = () => { bg[i.dataset.bg] = i.type === "range" ? +i.value : i.value; veChanged(); });
  $$("[data-bm]", box).forEach((b) => b.onclick = () => { bg.media = b.dataset.bm; veChanged(true); vePBg(box); });
  const up = $("[data-bup]", box);
  if (up) up.onclick = async () => { const r = await veUpload("media"); if (r[0]) { VE.doc.media.push({ name: r[0].name, orig: r[0].orig }); bg.media = r[0].name; veChanged(true); vePBg(box); } };
  $("#vp-scene", box).onchange = (e) => {
    let s = VE.doc.layers.find((l) => l.type === "scene");
    if (!s && e.target.checked) { s = veAnchor(veMakeScene({ noBg: bg.kind !== "scene" }), "center", 1); VE.doc.layers.unshift(s); }
    if (s) s.hidden = !e.target.checked;
    veChanged(true);
    veRefresh();
  };
  $("#vp-scenebg", box).onchange = (e) => { if (scene) { scene.noBg = e.target.checked; veChanged(true); } };
  $$("[data-st]", box).forEach((b) => b.onclick = () => { VS.style = b.dataset.st; vsSave(); vsRender(); vePBg(box); });
}
function vePLayers(box) {
  const L = VE.doc.layers.slice().reverse();
  box.innerHTML = veH("Шари", "Верхній у списку — поверх усіх. Перетягуйте, щоб змінити порядок.") +
    `<div class="ve-layers" id="vp-layers">${L.map((l) => `<div class="ve-lrow ${VE.sel === l.id ? "on" : ""} ${l.hidden ? "off" : ""}" data-lid="${l.id}" draggable="true">
      <i class="ve-lic">${(VE_TYPES[l.type] || ["", "?"])[1]}</i><span>${escapeHtml(veLabel(l))}</span>
      <button data-eye="${l.id}" data-hint="Показати / сховати">${l.hidden ? "◌" : "◉"}</button>
      <button data-lock="${l.id}" data-hint="Заблокувати від випадкового переміщення">${l.locked ? "🔒" : "🔓"}</button></div>`).join("")}</div>`;
  $$("[data-lid]", box).forEach((r) => {
    r.onclick = (e) => { if (e.target.closest("button")) return; VE.sel = r.dataset.lid; veRefresh(); };
    r.oncontextmenu = (e) => { e.preventDefault(); const l = VE.doc.layers.find((x) => x.id === r.dataset.lid); if (l) veLayerMenu(e, l); };
    r.ondragstart = (e) => { e.dataTransfer.setData("text/ve", r.dataset.lid); r.classList.add("drag"); };
    r.ondragend = () => r.classList.remove("drag");
    r.ondragover = (e) => { e.preventDefault(); r.classList.add("over"); };
    r.ondragleave = () => r.classList.remove("over");
    r.ondrop = (e) => {
      e.preventDefault();
      r.classList.remove("over");
      const id = e.dataTransfer.getData("text/ve"), Ls = VE.doc.layers, from = Ls.findIndex((x) => x.id === id), to = Ls.findIndex((x) => x.id === r.dataset.lid);
      if (from < 0 || to < 0 || from === to) return;
      const [x] = Ls.splice(from, 1);
      Ls.splice(to, 0, x);
      veChanged(true);
      veRefresh();
    };
  });
  $$("[data-eye]", box).forEach((b) => b.onclick = () => { const l = VE.doc.layers.find((x) => x.id === b.dataset.eye); l.hidden = !l.hidden; veChanged(true); veRefresh(); });
  $$("[data-lock]", box).forEach((b) => b.onclick = () => { const l = VE.doc.layers.find((x) => x.id === b.dataset.lock); l.locked = !l.locked; veChanged(true); veRefresh(); });
}
