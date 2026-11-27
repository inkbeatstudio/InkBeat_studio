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
function sqSig(t) {
  const a = (SQ.from - 1) * sqBarLen(), b = SQ.to * sqBarLen(), pitches = new Set(SQ_ROWS.map((r) => r[0]));
  let n = 0, sum = 0;
  for (const x of trackNotes(t)) { const nm = tmM(x[0]); if (pitches.has(x[2]) && nm >= a - 0.13 && nm < b - 0.13) { n++; sum += nm * 7 + x[2]; } }
  return n + ":" + Math.round(sum);
}
function sqLoad() {
  SQ.cells = {};
  SQ.meta = {};
  const t = findT(SQ.tid);
  if (!t) return;
  const x = mt(t.id).seqx || {};
  SQ.rowLen = Object.assign({}, x.rowLen || {});
  SQ.fill = x.fill || 0;
  SQ.human = x.human || 0;
  if (x.cells && x.bars === SQ.bars && x.from === SQ.from && x.to === SQ.to && x.sig === sqSig(t)) {
    SQ.cells = Object.assign({}, x.cells);
    SQ.meta = JSON.parse(JSON.stringify(x.meta || {}));
    return;
  }
  const a = (SQ.from - 1) * sqBarLen(), L = SQ.bars * sqBarLen(), st = sqStepLen();
  for (const n of trackNotes(t)) {
    const nm = tmM(n[0]);
    if (nm < a - st / 2 || nm >= a + L - st / 2) continue;
    if (!SQ_ROWS.some((r) => r[0] === n[2])) continue;
    const s = Math.round((nm - a) / st);
    if (s >= 0 && s < sqSteps()) SQ.cells[n[2] + ":" + s] = n[3] >= 105 ? 2 : 1;
  }
}
const SQ_FILLS = [[38, 38, 38, 38], [38, 38, 47, 45], [50, 47, 45, 45], [38, 47, 38, 45], [38, 50, 47, 45]];
const SQ_FILL_ROWS = new Set([38, 39, 42, 46, 50, 47, 45, 51]);
function sqEuclid(k, n, rot) {
  const out = [];
  for (let i = 0; i < n; i++) if (((i + n - (rot || 0)) * k) % n < k) out.push(i);
  return out;
}
function sqWrite() {
  const t = findT(SQ.tid);
  if (!t) return;
  const notes = editableNotes(t);
  const pitches = new Set(SQ_ROWS.map((r) => r[0]));
  const st = sqStepLen(), bl = sqBarLen(), steps = sqSteps();
  const a = (SQ.from - 1) * bl, b = SQ.to * bl;
  for (let i = notes.length - 1; i >= 0; i--) { const nm = tmM(notes[i][0]); if (pitches.has(notes[i][2]) && nm >= a - st / 2 && nm < b - st / 2) notes.splice(i, 1); }
  const L = SQ.bars * bl, hum = SQ.human || 0, meta = SQ.meta || {};
  const rnd = (g, p, k) => mfxHash(g + 0.37 * k, p + k);
  const fillAt = (at) => {
    if (!SQ.fill) return false;
    const bi = Math.floor((at - a + 1e-6) / bl), pos = at - a - bi * bl;
    return (bi + 1) % SQ.fill === 0 && pos >= bl - 1 - 1e-6;
  };
  for (let bar = a; bar < b - 1e-6; bar += L) {
    for (const [p] of SQ_ROWS) {
      const len = Math.min(steps, SQ.rowLen[p] || steps);
      for (let s = 0; s < steps; s++) {
        const gs = Math.round((bar - a) / st) + s, idx = gs % len, k = p + ":" + idx, v = SQ.cells[k];
        if (!v) continue;
        let at = bar + s * st + (s % 2 === 1 ? SQ.swing * st * 0.5 : 0);
        if (at >= b - 1e-6) continue;
        if (SQ_FILL_ROWS.has(p) && fillAt(bar + s * st)) continue;
        const mm = meta[k] || {};
        if (mm.pr != null && mm.pr < 1 && rnd(gs, p, 1) > mm.pr) continue;
        const r = mm.r || 1;
        let vel = v === 2 ? 118 : 92;
        if (hum) { vel = clamp(Math.round(vel + (rnd(gs, p, 2) * 2 - 1) * hum * 22), 20, 127); at += (rnd(gs, p, 3) - 0.5) * hum * 0.03; }
        for (let j = 0; j < r; j++) {
          const a1 = at + j * st / r;
          notes.push([tmU(a1), tmU(a1 + st / r * 0.9) - tmU(a1), p, clamp(vel - j * 7, 20, 127)]);
        }
      }
    }
  }
  if (SQ.fill) {
    for (let bi = SQ.fill - 1; a + (bi + 1) * bl <= b + 1e-6; bi += SQ.fill) {
      const f = SQ_FILLS[bi % SQ_FILLS.length], st0 = a + bi * bl + bl - 1;
      f.forEach((p, j) => notes.push([tmU(st0 + j * 0.25), tmU(st0 + j * 0.25 + 0.22) - tmU(st0 + j * 0.25), p, 82 + j * 10]));
      const nb = a + (bi + 1) * bl;
      if (nb < b - 1e-6 && !notes.some((n) => n[2] === 49 && Math.abs(tmM(n[0]) - nb) < 0.05)) notes.push([tmU(nb), 1, 49, 110]);
    }
  }
  notes.sort((x, y) => x[0] - y[0]);
  const m = mt(t.id);
  m.seqx = { cells: Object.assign({}, SQ.cells), meta: JSON.parse(JSON.stringify(SQ.meta || {})), rowLen: Object.assign({}, SQ.rowLen || {}), fill: SQ.fill || 0, human: SQ.human || 0, bars: SQ.bars, from: SQ.from, to: SQ.to, sig: sqSig(t) };
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
        <label data-hint="Живість: невеликий випадковий розкид гучності й часу — біт звучить як живий">Живість <input type="range" id="sq-hum" min="0" max="1" step="0.05" value="${SQ.human || 0}"></label>
        <label data-hint="Автоматична збивка на останній долі кожних N тактів і тарілка на початку наступного">Збивки <select id="sq-fill">${[[0, "немає"], [2, "кожні 2 такти"], [4, "кожні 4 такти"], [8, "кожні 8 тактів"]].map(([v, l]) => `<option value="${v}" ${(SQ.fill || 0) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <span class="spacer"></span>
        <button class="btn ghost sm" id="sq-play" data-hint="Слухати з початку вибраних тактів по колу">${S.playing ? "■ Стоп" : "▶ Слухати"}</button>
        <button class="btn ghost sm" id="sq-clear" data-hint="Очистити патерн у вибраних тактах">Очистити</button>
      </div>
      ${SQ.tid ? `<div class="seq-mode"><span class="muted small">Клік ставить:</span><div class="seg small">${[["hit", "Удар", "Клік — поставити або прибрати удар"], ["prob", "Ймовірність", "Клік по удару міняє шанс, що він прозвучить: 100 → 75 → 50 → 25%. Так кожен такт звучить трохи інакше"], ["rat", "Ретригер", "Клік по удару ділить його на 2, 3 або 4 швидкі повтори — для трапових хетів і роллів"]].map(([k, l, h]) => `<button data-sqm="${k}" class="${(SQ.mode || "hit") === k ? "active" : ""}" data-hint="${h}">${l}</button>`).join("")}</div>
        <span class="muted small">Справа в кожному рядку — довжина рядка (поліритм) і «Е» — евклідів ритм.</span></div>
        <div class="seq-grid" style="--steps:${steps};grid-template-columns:96px repeat(${steps},minmax(14px,1fr)) 86px">${SQ_ROWS.map(([p, n]) => { const len = Math.min(steps, (SQ.rowLen || {})[p] || steps); return `<div class="sq-lab" data-pv="${p}" data-hint="Клацніть — послухати звук">${n}</div>${Array.from({ length: steps }, (_, s) => { const v = SQ.cells[p + ":" + s] || 0, mm = (SQ.meta || {})[p + ":" + s] || {}; return `<button class="sq-c ${v ? "on" : ""} ${v === 2 ? "acc" : ""} ${Math.floor(s / perBeat) % 2 ? "alt" : ""} ${s >= len ? "dis" : ""} ${mm.pr != null && mm.pr < 1 ? "pr" + Math.round(mm.pr * 100) : ""}" data-p="${p}" data-s="${s}" ${mm.r > 1 ? `data-r="×${mm.r}"` : ""}></button>`; }).join("")}<div class="sq-row"><select data-len="${p}" data-hint="Довжина рядка в кроках. Менше за довжину патерну — рядок «зсувається» відносно інших (поліритм)">${[...new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 24, 32, steps])].filter((x) => x <= steps).sort((x, y) => x - y).map((x) => `<option value="${x}" ${x === len ? "selected" : ""}>${x}</option>`).join("")}</select><button class="btn ghost sm" data-euc="${p}" data-hint="Евклідів ритм: задана кількість ударів рівномірно розподіляється по рядку — так народжуються африканські й латинські ритми">Е</button></div>`; }).join("")}
        <div></div>${Array.from({ length: steps }, (_, s) => `<div class="sq-step" data-st="${s}">${s % perBeat === 0 ? s / perBeat + 1 : ""}</div>`).join("")}<div></div></div>
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
  $("#sq-hum", m).onchange = (e) => { pushUndo("живість"); SQ.human = +e.target.value; sqWrite(); };
  $("#sq-fill", m).onchange = (e) => { pushUndo("збивки"); SQ.fill = +e.target.value; sqWrite(); };
  $$("[data-sqm]", m).forEach((b) => b.onclick = () => { SQ.mode = b.dataset.sqm; sqRender(); });
  $$("[data-len]", m).forEach((sl) => sl.onchange = () => { pushUndo("довжина рядка"); if (!SQ.rowLen) SQ.rowLen = {}; SQ.rowLen[sl.dataset.len] = +sl.value; sqWrite(); sqRender(); });
  $$("[data-euc]", m).forEach((b) => b.onclick = async () => {
    const p = +b.dataset.euc, len = Math.min(sqSteps(), (SQ.rowLen || {})[p] || sqSteps());
    const pr = inkConfirm("Евклідів ритм", `<p>Скільки ударів рівномірно розставити на ${len} кроків?</p><div class="tm-ask"><label>Ударів <input type="number" id="euc-k" min="1" max="${len}" value="${Math.max(1, Math.round(len * 5 / 16))}"></label><label>Зсув <input type="number" id="euc-r" min="0" max="${len - 1}" value="0"></label></div><p class="muted small">Відомі ритми: 3 з 8 — тресильйо, 5 з 8 — сінкільйо, 5 з 16 — боса-нова, 7 з 16 — самба.</p>`, "Заповнити");
    const ok = await pr;
    if (!ok) return;
    const k = clamp(+$("#euc-k").value || 1, 1, len), r = clamp(+$("#euc-r").value || 0, 0, len - 1);
    pushUndo("евклідів ритм");
    for (let s2 = 0; s2 < sqSteps(); s2++) delete SQ.cells[p + ":" + s2];
    for (const s2 of sqEuclid(k, len, r)) SQ.cells[p + ":" + s2] = s2 === sqEuclid(k, len, r)[0] ? 2 : 1;
    sqWrite();
    sqRender();
  });
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
      if ((SQ.mode === "prob" || SQ.mode === "rat") && SQ.cells[c.dataset.p + ":" + c.dataset.s]) {
        const k2 = c.dataset.p + ":" + c.dataset.s;
        if (!SQ.meta) SQ.meta = {};
        const mm = SQ.meta[k2] = SQ.meta[k2] || {};
        pushUndo(SQ.mode === "prob" ? "ймовірність кроку" : "ретригер");
        if (SQ.mode === "prob") { const cyc = [1, 0.75, 0.5, 0.25]; mm.pr = cyc[(cyc.indexOf(mm.pr ?? 1) + 1) % 4]; toast(`Шанс удару: ${Math.round(mm.pr * 100)}%`); }
        else { mm.r = ((mm.r || 1) % 4) + 1; toast(mm.r > 1 ? `Ретригер: ${mm.r} удари на крок` : "Звичайний удар"); }
        sqWrite();
        sqRender();
        return;
      }
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
