"use strict";
const SQ_ROWS = [[49, "Тарілка"], [51, "Райд"], [46, "Хет відкр."], [42, "Хет закр."], [39, "Плеск"], [38, "Малий"], [50, "Том вис."], [47, "Том сер."], [45, "Том низ."], [36, "Бочка"]];
const SQ = { tid: null, bars: 1, from: 1, to: 4, cells: {}, swing: 0, raf: 0, m: null };
function sqTracks() {
  return tracksAll().filter((t) => t.is_drums);
}
function sqStepLen() {
  return 0.25;
}
function sqSteps() {
  return Math.round(S.B.timing.bpb / sqStepLen()) * SQ.bars;
}
function sqBarLen() {
  return S.B.timing.bpb;
}
function sqLoad() {
  SQ.cells = {};
  const t = findT(SQ.tid);
  if (!t) return;
  const a = (SQ.from - 1) * sqBarLen(), L = SQ.bars * sqBarLen(), st = sqStepLen();
  for (const n of trackNotes(t)) {
    const nm = tmM(n[0]);
    if (nm < a - st / 2 || nm >= a + L - st / 2) continue;
    if (!SQ_ROWS.some((r) => r[0] === n[2])) continue;
    const s = Math.round((nm - a) / st);
    if (s >= 0 && s < sqSteps()) SQ.cells[n[2] + ":" + s] = n[3] >= 105 ? 2 : 1;
  }
}
function sqWrite() {
  const t = findT(SQ.tid);
  if (!t) return;
  const notes = editableNotes(t);
  const pitches = new Set(SQ_ROWS.map((r) => r[0]));
  const st = sqStepLen(), bl = sqBarLen();
  const a = (SQ.from - 1) * bl, b = SQ.to * bl;
  for (let i = notes.length - 1; i >= 0; i--) { const nm = tmM(notes[i][0]); if (pitches.has(notes[i][2]) && nm >= a - st / 2 && nm < b - st / 2) notes.splice(i, 1); }
  const L = SQ.bars * bl;
  for (let bar = a; bar < b - 1e-6; bar += L) {
    for (const [k, v] of Object.entries(SQ.cells)) {
      const [p, s] = k.split(":").map(Number);
      const at = bar + s * st + (s % 2 === 1 ? SQ.swing * st * 0.5 : 0);
      if (at >= b - 1e-6) continue;
      notes.push([tmU(at), tmU(at + st * 0.9) - tmU(at), p, v === 2 ? 118 : 92]);
    }
  }
  notes.sort((x, y) => x[0] - y[0]);
  const m = mt(t.id);
  if (t.has_audio && modeOf(t) === "audio") {
    m.mode = "both";
    applyGains();
    renderHeads();
    toast("Доріжка тепер звучить «Разом»: оригінальний запис + ваш патерн. Щоб чути лише патерн, натисніть кнопку режиму на доріжці до «MIDI».");
  }
  notesChanged();
  if (S.dockTab === "notes" && S.sel === t.id) renderDock();
}
function openStepSeq() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  let list = sqTracks();
  if (!SQ.tid || !findT(SQ.tid)) {
    const sel = S.sel && findT(S.sel);
    SQ.tid = sel && sel.is_drums ? sel.id : (list.find((t) => t.gen) || list[0] || {}).id || null;
  }
  const cur = Math.max(1, Math.floor(tmM(S.playBeat) / sqBarLen()) + 1);
  if (!SQ.opened) { SQ.from = cur; SQ.to = cur + 3; SQ.opened = true; }
  let m = document.getElementById("seq-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "seq-modal";
    document.body.appendChild(m);
    if (!UIP.mfloat["seq-modal"]) { UIP.mfloat["seq-modal"] = { on: true, rect: { x: Math.max(20, innerWidth / 2 - 470), y: 140, w: 960, h: 620 } }; saveUI(); }
  }
  SQ.m = m;
  if (SQ.tid) sqLoad();
  sqRender();
  m.hidden = false;
  sqTick();
}
function sqRender() {
  const m = SQ.m, list = sqTracks(), steps = SQ.tid ? sqSteps() : 16, perBeat = Math.round(1 / sqStepLen());
  m.innerHTML = `<div class="modal-card seq-card"><div class="modal-head"><h3>Покроковий секвенсор</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body">
      <div class="seq-top">
        <label>Доріжка <select id="sq-t">${list.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === SQ.tid ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}<option value="@new">＋ Нова барабанна доріжка</option></select></label>
        <label data-hint="Довжина патерну: 1 такт — 16 кроків, 2 такти — 32">Патерн <select id="sq-bars"><option value="1" ${SQ.bars === 1 ? "selected" : ""}>1 такт</option><option value="2" ${SQ.bars === 2 ? "selected" : ""}>2 такти</option></select></label>
        <label data-hint="Патерн повторюється в цих тактах. Решта пісні не змінюється">Такти <input type="number" id="sq-from" min="1" value="${SQ.from}"> – <input type="number" id="sq-to" min="1" value="${SQ.to}"></label>
        <label data-hint="Свінг: зсуває кожен другий крок — грув стає «качаючим»">Свінг <input type="range" id="sq-sw" min="0" max="0.6" step="0.01" value="${SQ.swing}"></label>
        <span class="spacer"></span>
        <button class="btn ghost sm" id="sq-play" data-hint="Слухати з початку вибраних тактів по колу">${S.playing ? "■ Стоп" : "▶ Слухати"}</button>
        <button class="btn ghost sm" id="sq-clear" data-hint="Очистити патерн у вибраних тактах">Очистити</button>
      </div>
      ${SQ.tid ? `<div class="seq-grid" style="--steps:${steps}">${SQ_ROWS.map(([p, n]) => `<div class="sq-lab" data-pv="${p}" data-hint="Клацніть — послухати звук">${n}</div>${Array.from({ length: steps }, (_, s) => { const v = SQ.cells[p + ":" + s] || 0; return `<button class="sq-c ${v ? "on" : ""} ${v === 2 ? "acc" : ""} ${Math.floor(s / perBeat) % 2 ? "alt" : ""}" data-p="${p}" data-s="${s}"></button>`; }).join("")}`).join("")}
        <div></div>${Array.from({ length: steps }, (_, s) => `<div class="sq-step" data-st="${s}">${s % perBeat === 0 ? s / perBeat + 1 : ""}</div>`).join("")}</div>
      <p class="muted small">Клік — поставити / прибрати удар. Shift + клік або правий клік — акцент (гучніше). Тягніть мишкою по клітинках, щоб малювати кілька підряд. Зміни одразу пишуться в доріжку — їх видно й у піано-ролі, Ctrl+Z скасовує.</p>
      <div class="seq-pre"><span class="muted small">Готові патерни:</span>${Object.keys(SQ_PRESETS).map((k) => `<button class="btn ghost sm" data-pre="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join("")}</div>` : `<div class="dock-empty">У проєкті немає барабанної доріжки. Виберіть у списку «＋ Нова барабанна доріжка».</div>`}
    </div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => { m.hidden = true; cancelAnimationFrame(SQ.raf); SQ.raf = 0; });
  $("#sq-t", m).onchange = (e) => {
    if (e.target.value === "@new") {
      addMidiTrack("drums");
      SQ.tid = S.mix.gens[S.mix.gens.length - 1].id;
    } else SQ.tid = e.target.value;
    sqLoad();
    sqRender();
  };
  $("#sq-bars", m).onchange = (e) => { SQ.bars = +e.target.value; SQ.to = Math.max(SQ.to, SQ.from + SQ.bars - 1); sqLoad(); sqRender(); };
  const rng = () => {
    SQ.from = Math.max(1, +$("#sq-from", m).value || 1);
    SQ.to = Math.max(SQ.from + SQ.bars - 1, +$("#sq-to", m).value || SQ.from);
    sqLoad();
    sqRender();
  };
  $("#sq-from", m).onchange = rng;
  $("#sq-to", m).onchange = rng;
  $("#sq-sw", m).oninput = (e) => { SQ.swing = +e.target.value; };
  $("#sq-sw", m).onchange = () => { pushUndo("свінг"); sqWrite(); };
  $("#sq-play", m).onclick = () => {
    if (S.playing) { stopPlay(); sqRender(); return; }
    const a = tmU((SQ.from - 1) * sqBarLen()), b = tmU(SQ.to * sqBarLen());
    if (typeof setLoop === "function") setLoop(a, b, true);
    S.playBeat = a;
    play();
    setTimeout(sqRender, 50);
  };
  const clr = $("#sq-clear", m);
  if (clr) clr.onclick = () => { pushUndo("очистити патерн"); SQ.cells = {}; sqWrite(); sqRender(); };
  $$("[data-pre]", m).forEach((b) => b.onclick = () => {
    pushUndo("патерн " + b.dataset.pre);
    SQ.cells = {};
    const P = SQ_PRESETS[b.dataset.pre];
    const per = Math.round(S.B.timing.bpb / sqStepLen());
    for (let bar = 0; bar < SQ.bars; bar++) for (const [p, steps] of Object.entries(P)) for (const s of steps) {
      if (s < per) SQ.cells[p + ":" + (s + bar * per)] = 1;
    }
    sqWrite();
    sqRender();
  });
  $$("[data-pv]", m).forEach((l) => l.onclick = () => { const t = findT(SQ.tid); if (t) audition({ t, m: mt(t.id) }, +l.dataset.pv, 0.9); });
  let paint = null;
  const setCell = (c, val) => {
    const k = c.dataset.p + ":" + c.dataset.s;
    if (val) SQ.cells[k] = val; else delete SQ.cells[k];
    c.classList.toggle("on", !!val);
    c.classList.toggle("acc", val === 2);
  };
  $$(".sq-c", m).forEach((c) => {
    c.onpointerdown = (e) => {
      e.preventDefault();
      const k = c.dataset.p + ":" + c.dataset.s, cur = SQ.cells[k] || 0;
      const acc = e.shiftKey || e.button === 2;
      paint = acc ? (cur === 2 ? 1 : 2) : cur ? 0 : 1;
      pushUndo("крок секвенсора");
      setCell(c, paint);
      if (paint) { const t = findT(SQ.tid); if (t) audition({ t, m: mt(t.id) }, +c.dataset.p, paint === 2 ? 0.95 : 0.7); }
    };
    c.onpointerenter = () => { if (paint !== null) setCell(c, paint); };
    c.oncontextmenu = (e) => e.preventDefault();
  });
  const up = () => { if (paint !== null) { paint = null; sqWrite(); } };
  m.onpointerup = up;
  m.onpointerleave = up;
}
function sqTick() {
  cancelAnimationFrame(SQ.raf);
  const step = () => {
    if (!SQ.m || SQ.m.hidden) { SQ.raf = 0; return; }
    const st = sqStepLen(), a = (SQ.from - 1) * sqBarLen(), L = SQ.bars * sqBarLen();
    let cur = -1;
    const pm = tmM(S.playBeat);
    if (S.playing && pm >= a && pm < SQ.to * sqBarLen()) cur = Math.floor(((pm - a) % L) / st);
    if (cur !== SQ.cur) {
      SQ.cur = cur;
      $$(".sq-c.now, .sq-step.now", SQ.m).forEach((x) => x.classList.remove("now"));
      if (cur >= 0) $$(`.sq-c[data-s="${cur}"], .sq-step[data-st="${cur}"]`, SQ.m).forEach((x) => x.classList.add("now"));
    }
    SQ.raf = requestAnimationFrame(step);
  };
  SQ.raf = requestAnimationFrame(step);
}
const SQ_PRESETS = {
  "Поп / рок": { 36: [0, 8], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
  "Хіп-хоп": { 36: [0, 7, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
  "Трап": { 36: [0, 11], 38: [8], 42: [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14, 15], 46: [] },
  "Хаус": { 36: [0, 4, 8, 12], 39: [4, 12], 42: [2, 6, 10, 14], 46: [] },
  "Драм-н-бейс": { 36: [0, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
  "Реггетон": { 36: [0, 4, 8, 12], 38: [3, 6, 11, 14], 42: [0, 2, 4, 6, 8, 10, 12, 14] }
};
(function sqMenus() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Покроковий секвенсор барабанів…", needProject(openStepSeq)]]);
})();
