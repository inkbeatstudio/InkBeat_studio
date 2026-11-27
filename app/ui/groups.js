"use strict";
const GROUP_COLORS = ["#f59e0b", "#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#f87171", "#22d3ee", "#facc15"];
function groupsAll() {
  return (S.mix && S.mix.groups) || [];
}
function groupOf(id) {
  return groupsAll().find((g) => g.members.includes(id)) || null;
}
function groupFolded(t) {
  const g = groupOf(t.id);
  if (!g || !g.folded) return false;
  const vis = tracksAll().find((x) => g.members.includes(x.id));
  return vis && vis.id !== t.id;
}
function groupCreate(ids, name) {
  if (!S.mix.groups) S.mix.groups = [];
  ids = ids.filter((id) => findT(id));
  if (!ids.length) return;
  pushUndo("нова група");
  for (const g of S.mix.groups) g.members = g.members.filter((x) => !ids.includes(x));
  S.mix.groups = S.mix.groups.filter((g) => g.members.length);
  const g = { id: uid("grp"), name: name || "Група " + (S.mix.groups.length + 1), color: GROUP_COLORS[S.mix.groups.length % GROUP_COLORS.length], folded: false, members: ids };
  S.mix.groups.push(g);
  afterEdit(true);
  renderHeads();
  layout();
  draw();
  return g;
}
function groupRemove(g) {
  pushUndo("розгрупувати");
  S.mix.groups = groupsAll().filter((x) => x !== g);
  afterEdit(true);
  renderHeads();
  layout();
  draw();
}
function groupToggle(g) {
  g.folded = !g.folded;
  saveMix();
  renderHeads();
  layout();
  draw();
}
function groupSet(g, key) {
  pushUndo(key === "mute" ? "mute групи" : "solo групи");
  const on = !g.members.every((id) => mt(id) && mt(id)[key]);
  for (const id of g.members) if (mt(id)) mt(id)[key] = on;
  afterEdit();
  applyGains();
  renderHeads();
  renderDock();
}
function groupVolume(g, e) {
  const box = document.createElement("div");
  box.className = "ctxmenu grp-vol";
  box.id = "ctxmenu";
  box.innerHTML = `<b>${escapeHtml(g.name)}</b><span class="muted small">Гучність усіх доріжок групи разом</span><input type="range" min="-24" max="12" step="0.5" value="0" id="gv"><span id="gv-v">0 дБ</span>`;
  closeMenu();
  document.body.appendChild(box);
  box.style.left = Math.min(innerWidth - 260, e.clientX) + "px";
  box.style.top = Math.min(innerHeight - 120, e.clientY + 6) + "px";
  const base = Object.fromEntries(g.members.filter((id) => mt(id)).map((id) => [id, mt(id).vol || 0]));
  const r = box.querySelector("#gv");
  let pushed = false;
  r.oninput = () => {
    if (!pushed) { pushUndo("гучність групи"); pushed = true; }
    const d = +r.value;
    box.querySelector("#gv-v").textContent = (d > 0 ? "+" : "") + d + " дБ";
    for (const [id, v] of Object.entries(base)) mt(id).vol = Math.max(-60, Math.min(12, v + d));
    applyGains();
  };
  r.onchange = () => { saveMix(); renderDock(); };
  box.addEventListener("mousedown", (ev) => ev.stopPropagation());
}
async function groupBus(g) {
  const busName = g.name;
  addBus("group");
  const b = S.mix.buses[S.mix.buses.length - 1];
  b.name = busName;
  b.color = g.color;
  for (const id of g.members) if (mt(id)) mt(id).out = b.id;
  g.bus = b.id;
  afterEdit(true);
  renderDock();
  toast(`Створено шину «${busName}»: усі доріжки групи тепер ідуть у неї. Її фейдер і ефекти — у мікшері.`);
}
function groupMenu(g, e) {
  menu(e, [
    [g.folded ? "Розгорнути групу" : "Згорнути групу", () => groupToggle(g)],
    ["Гучність групи…", () => setTimeout(() => groupVolume(g, e), 0)],
    ["Mute усієї групи", () => groupSet(g, "mute")],
    ["Solo усієї групи", () => groupSet(g, "solo")],
    ["Виділити всі кліпи групи", () => {
      S.selClips.clear();
      for (const id of g.members) for (const c of (mt(id) && mt(id).clips) || []) S.selClips.add(c.id);
      draw();
    }],
    g.bus && (S.mix.buses || []).some((b) => b.id === g.bus) ? ["Шина групи вже є в мікшері", () => { S.dockOpen = true; S.dockTab = "mixer"; renderDock(); layout(); }] : ["Створити шину групи (один фейдер і ефекти)", () => groupBus(g)],
    ["Перейменувати групу…", () => {
      const n = (prompt("Назва групи:", g.name) || "").trim();
      if (!n) return;
      g.name = n;
      saveMix();
      renderHeads();
    }],
    ["Колір групи", () => {
      g.color = GROUP_COLORS[(GROUP_COLORS.indexOf(g.color) + 1) % GROUP_COLORS.length];
      saveMix();
      renderHeads();
    }],
    null,
    ["Розгрупувати", () => groupRemove(g), "danger"]
  ]);
}
const _renderHeadsG = renderHeads;
renderHeads = function () {
  _renderHeadsG();
  if (!S.mix || !groupsAll().length) return;
  const heads = $$("#heads .lane-head"), list = tracksAll();
  heads.forEach((h, i) => {
    const t = list[i], g = t && groupOf(t.id);
    if (!g) return;
    h.classList.add("in-grp");
    h.style.setProperty("--gc", g.color);
    if (groupFolded(t)) { h.classList.add("gfold"); return; }
    const first = list.find((x) => g.members.includes(x.id)) === t;
    if (!first) return;
    const chip = document.createElement("div");
    chip.className = "grp-chip";
    const n = g.members.filter((id) => findT(id)).length;
    chip.innerHTML = `<button class="grp-fold" data-hint="${g.folded ? "Розгорнути групу" : "Згорнути групу в один рядок"}">${g.folded ? "▸" : "▾"}</button><span class="grp-name">${escapeHtml(g.name)}</span><span class="grp-n">${n}</span><button class="grp-m ${g.members.every((id) => mt(id) && mt(id).mute) ? "on" : ""}" data-hint="Mute усієї групи">M</button><button class="grp-s ${g.members.every((id) => mt(id) && mt(id).solo) ? "on" : ""}" data-hint="Solo усієї групи">S</button><button class="grp-more" data-hint="Меню групи: гучність, шина, перейменувати, розгрупувати">⋯</button>`;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest("button");
      if (!b) return groupToggle(g);
      if (b.classList.contains("grp-fold")) groupToggle(g);
      else if (b.classList.contains("grp-m")) groupSet(g, "mute");
      else if (b.classList.contains("grp-s")) groupSet(g, "solo");
      else groupMenu(g, e);
    });
    h.prepend(chip);
  });
};
document.addEventListener("click", (e) => {
  const more = e.target.closest && e.target.closest(".lh-more");
  if (!more) return;
  setTimeout(() => {
    const m = $("#ctxmenu"), h = more.closest(".lane-head");
    if (!m || !h) return;
    const t = tracksAll()[$$("#heads .lane-head").indexOf(h)];
    if (!t) return;
    const g = groupOf(t.id);
    const add = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => { closeMenu(); fn(); }; m.appendChild(b); };
    m.appendChild(document.createElement("hr"));
    if (g) add(`Вийти з групи «${g.name}»`, () => { pushUndo("вийти з групи"); g.members = g.members.filter((x) => x !== t.id); S.mix.groups = groupsAll().filter((x) => x.members.length); afterEdit(true); renderHeads(); layout(); draw(); });
    else {
      add("Нова група з цієї доріжки…", () => { const n = (prompt("Назва групи:", t.is_drums ? "Барабани" : "Група") || "").trim(); if (n) groupCreate([t.id], n); });
      for (const gg of groupsAll()) add(`Додати в групу «${gg.name}»`, () => { pushUndo("додати в групу"); gg.members.push(t.id); afterEdit(true); renderHeads(); layout(); draw(); });
    }
  }, 5);
});
function openGroupWizard() {
  let m = document.getElementById("grp-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "grp-modal";
    document.body.appendChild(m);
  }
  const ts = tracksAll();
  m.innerHTML = `<div class="modal-card" style="width:min(560px,94vw)"><div class="modal-head"><h3>Нова група доріжок</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body"><p class="muted">Група збирає кілька доріжок разом: їх можна згорнути в один рядок, вимкнути чи увімкнути соло одним кліком, змінити гучність разом і направити в одну шину мікшера.</p>
      <label class="gw-n">Назва <input id="gw-name" value="Група ${groupsAll().length + 1}"></label>
      <div class="gw-list">${ts.map((t) => `<label class="chk"><input type="checkbox" value="${escapeHtml(t.id)}" ${t.id === S.sel ? "checked" : ""}> <i style="background:${t.color}"></i>${escapeHtml(t.name)}${groupOf(t.id) ? ` <span class="muted small">(зараз у «${escapeHtml(groupOf(t.id).name)}»)</span>` : ""}</label>`).join("")}</div>
      <div class="modal-actions"><button class="btn ghost" data-close>Скасувати</button><button class="btn primary" id="gw-ok">Створити групу</button></div></div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => m.hidden = true);
  $("#gw-ok", m).onclick = () => {
    const ids = $$(".gw-list input:checked", m).map((x) => x.value);
    if (!ids.length) return toast("Позначте хоча б одну доріжку.", true);
    m.hidden = true;
    groupCreate(ids, $("#gw-name", m).value.trim());
  };
  m.hidden = false;
}
async function sliceToPads(T) {
  if (!T || !T.t || !T.t.has_audio) return toast("Виберіть доріжку із записом.");
  const t = T.t, m = T.m, P = period();
  const sc = selectedClips().find((x) => x.t.id === t.id);
  const body = { base: baseId(t), source: m.source, sensitivity: 0.5, max: 32 };
  if (sc) { body.from = sc.c.src; body.to = sc.c.src + sc.c.dur; }
  else {
    const L = S.loop && S.loop.on ? S.loop : null;
    if (!L) return toast("Виділіть кліп або увімкніть цикл (петлю) на потрібному місці — нарізка візьме лише цей фрагмент.", true);
    const clips = (m.clips || []).filter((c) => !c.mute);
    const c = clips.find((c) => L.a >= c.start && L.a < c.start + c.dur / P) || clips[0];
    body.from = c.src + (L.a - c.start) * P;
    body.to = c.src + (L.b - c.start) * P;
  }
  toast("Нарізаю фрагмент на удари…");
  try {
    const r = await api.post(`/api/project/${S.pid}/slice`, body);
    let j;
    for (;;) {
      await new Promise((res) => setTimeout(res, 400));
      j = await api.get(`/api/process/${r.job}`);
      if (j.status !== "running") break;
    }
    if (j.status === "error") throw new Error(j.error);
    const sl = j.result.slices || [];
    if (!sl.length) return toast("Не вдалося знайти удари у фрагменті.", true);
    const clips = (m.clips || []).filter((c) => !c.mute);
    const toBeat = (ts) => { const c = clips.find((c) => ts >= c.src && ts < c.src + c.dur) || clips[0]; return c ? c.start + (ts - c.src) / P : (ts + S.B.timing.pad) / P; };
    const zones = sl.map((s, i) => ({ file: s.file, lo: 36 + i, hi: 36 + i, vlo: 0, vhi: 127, root: 36 + i, tune: 0, gain: 1, pan: 0, loop: null, a: 0.002, r: 0.05, d: 1, s: 1 }));
    const notes = sl.map((s, i) => [toBeat(s.start), s.dur / P, 36 + i, 100]);
    addMidiTrack("keys");
    const g = S.mix.gens[S.mix.gens.length - 1];
    g.name = "Нарізка: " + t.name;
    g.notes = notes;
    mt(g.id).inst = { type: "multi", name: `Нарізка «${t.name}» — ${sl.length} пад${sl.length < 5 ? "и" : "ів"}`, zones, drums: true, params: { gain: 1, attack: 1, release: 1, vel: 0.5, tune: 0 } };
    _tracksKey = "";
    afterEdit(true);
    await loadInstrumentBuffers();
    renderDock();
    toast(`Готово: ${sl.length} шматків на клавішах від C1. Нова доріжка грає оригінальний ритм — переставляйте ноти в піано-ролі, щоб зібрати новий біт, або грайте пади з клавіатури.`);
  } catch (e) {
    toast("Не вдалося нарізати: " + e.message, true);
  }
}
(function grpMenus() {
  const edit = MENUS["Правка"];
  MENUS["Правка"] = () => edit().concat([null, ["Нова група доріжок…", needProject(openGroupWizard)]]);
})();
