"use strict";
const TM = { ref: null, base: 0, segs: null };
function tmBase() {
  return S.B && S.B.timing ? S.B.timing.bpm : 120;
}
function tmActive() {
  return !!(S.mix && Array.isArray(S.mix.tempo) && S.mix.tempo.length);
}
function tmSegs() {
  const L = S.mix && S.mix.tempo, base = tmBase();
  if (TM.ref === L && TM.base === base && TM.segs) return TM.segs;
  const segs = [{ u: 0, m: 0, bpm: base }];
  for (const e of (L || []).slice().sort((a, b) => a.at - b.at)) {
    if (!(e.bpm >= 20 && e.bpm <= 400)) continue;
    if (e.at <= 1e-9) { segs[0] = { u: 0, m: 0, bpm: e.bpm }; continue; }
    const p = segs[segs.length - 1];
    segs.push({ u: e.at, m: p.m + (e.at - p.u) * p.bpm / base, bpm: e.bpm });
  }
  TM.ref = L; TM.base = base; TM.segs = segs;
  return segs;
}
function tmSegAt(u) {
  const segs = tmSegs();
  let s = segs[0];
  for (const x of segs) { if (x.u <= u) s = x; else break; }
  return s;
}
function tmSegAtM(m) {
  const segs = tmSegs();
  let s = segs[0];
  for (const x of segs) { if (x.m <= m) s = x; else break; }
  return s;
}
function tmM(u) {
  if (!tmActive()) return u;
  const s = tmSegAt(u);
  return s.m + (u - s.u) * s.bpm / tmBase();
}
function tmU(m) {
  if (!tmActive()) return m;
  const s = tmSegAtM(m);
  return s.u + (m - s.m) * tmBase() / s.bpm;
}
function tmBpmAt(u) {
  return tmActive() ? tmSegAt(u).bpm : tmBase();
}
function tmExport() {
  return tmActive() ? S.mix.tempo.map((e) => [+e.at.toFixed(6), +e.bpm]) : null;
}
function tmFmt(v) {
  return String(Math.round(+v * 100) / 100);
}
function tmBarOf(u) {
  const bpb = S.B.timing.bpb, m = tmM(u);
  return Math.floor(m / bpb + 1e-6) + 1;
}
function tmBarStart(bar) {
  return tmU((bar - 1) * S.B.timing.bpb);
}
function tmCommit(list, label) {
  pushUndo(label || "темп");
  S.mix.tempo = list.filter((e) => e.bpm >= 20 && e.bpm <= 400).sort((a, b) => a.at - b.at);
  if (!S.mix.tempo.length) delete S.mix.tempo;
  saveMix();
  draw();
  if (typeof updatePos === "function") updatePos();
  const m = document.getElementById("tempo-modal");
  if (m && !m.hidden) tmRenderTable();
}
function tmSet(atU, bpm, label) {
  const L = (S.mix.tempo || []).filter((e) => Math.abs(e.at - atU) > 1e-4);
  L.push({ at: Math.max(0, atU), bpm: +bpm });
  tmCommit(L, label || "зміна темпу");
}
async function tmAsk(bar, cur) {
  const html = `<p>Темп діятиме від початку такту <b>${bar}</b> до наступної зміни темпу.</p>
    <label class="tm-ask">Удари на хвилину (BPM)<input type="number" id="tm-ask-v" min="20" max="400" step="0.5" value="${tmFmt(cur)}"></label>
    <p class="muted small">Звук доріжок не прискорюється і не сповільнюється: змінюються сітка, такти, метроном, прилипання нот і темп у MIDI-експорті. Так сітку можна підігнати під живий запис, що «плаває» за темпом.</p>`;
  const p = inkConfirm("Змінити темп", html, "Застосувати");
  setTimeout(() => { const i = document.getElementById("tm-ask-v"); if (i) { i.focus(); i.select(); } }, 30);
  const ok = await p;
  if (!ok) return null;
  const v = parseFloat(String((document.getElementById("tm-ask-v") || {}).value || "").replace(",", "."));
  if (!(v >= 20 && v <= 400)) { toast("Темп має бути від 20 до 400 BPM", true); return null; }
  return v;
}
async function tmChangeAt(u) {
  const bar = tmBarOf(u), at = tmBarStart(bar);
  const v = await tmAsk(bar, tmBpmAt(at + 1e-6));
  if (v == null) return;
  tmSet(at, v);
  toast(`Темп ${tmFmt(v)} BPM від такту ${bar}`);
}
function tmRenderTable() {
  const m = document.getElementById("tempo-modal");
  if (!m) return;
  const base = tmBase(), L = (S.mix.tempo || []).slice().sort((a, b) => a.at - b.at);
  const rows = [`<tr class="tm-base"><td>1</td><td>${fmtTime(0)}</td><td>${tmFmt(L.length && L[0].at <= 1e-9 ? L[0].bpm : base)}</td><td class="muted small">початковий темп пісні</td></tr>`];
  L.forEach((e, i) => {
    if (e.at <= 1e-9) return;
    const sec = e.at * 60 / base;
    rows.push(`<tr data-i="${i}"><td>${tmBarOf(e.at + 1e-6)}</td><td>${fmtTime(sec)}</td><td><input type="number" class="tm-v" min="20" max="400" step="0.5" value="${tmFmt(e.bpm)}" data-hint="Новий темп від цього такту"></td>
      <td><button class="btn ghost sm" data-go="${i}" data-hint="Перейти до цього місця">Перейти</button> <button class="btn ghost sm danger" data-del="${i}" data-hint="Прибрати цю зміну темпу">Видалити</button></td></tr>`);
  });
  $("#tm-rows", m).innerHTML = rows.join("");
  $$(".tm-v", m).forEach((inp) => inp.onchange = () => {
    const i = +inp.closest("tr").dataset.i, v = parseFloat(inp.value);
    if (!(v >= 20 && v <= 400)) { toast("Темп має бути від 20 до 400 BPM", true); tmRenderTable(); return; }
    const L2 = S.mix.tempo.slice().sort((a, b) => a.at - b.at);
    L2[i] = Object.assign({}, L2[i], { bpm: v });
    tmCommit(L2, "зміна темпу");
  });
  $$("[data-go]", m).forEach((b) => b.onclick = () => { const L2 = S.mix.tempo.slice().sort((a, b2) => a.at - b2.at); seek(L2[+b.dataset.go].at); });
  $$("[data-del]", m).forEach((b) => b.onclick = () => {
    const L2 = S.mix.tempo.slice().sort((a, b2) => a.at - b2.at);
    L2.splice(+b.dataset.del, 1);
    tmCommit(L2, "видалити зміну темпу");
  });
  const st = $("#tm-start", m);
  if (st) st.value = tmFmt(L.length && L[0].at <= 1e-9 ? L[0].bpm : base);
  $("#tm-now", m).textContent = `такт ${tmBarOf(S.playBeat)}, зараз ${tmFmt(tmBpmAt(S.playBeat))} BPM`;
}
function openTempo() {
  let m = document.getElementById("tempo-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "tempo-modal";
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="modal-card" style="width:min(640px,94vw)"><div class="modal-head"><h3>Доріжка темпу</h3><button class="x" data-k="x">&times;</button></div>
    <div class="modal-body">
      <p>Тут задаються зміни темпу всередині пісні — наприклад, повільний вступ і швидший приспів, або підгонка сітки під живий запис, що поступово прискорюється.</p>
      <ul class="small muted tm-help">
        <li>Сітка, номери тактів, прилипання, метроном, секвенсор, ноти й нотний запис ідуть за цими темпами.</li>
        <li>Звук доріжок не змінюється — його швидкість змінює обробка «Розтягнути в часі».</li>
        <li>Швидко додати зміну: клацніть правою кнопкою по лінійці з номерами тактів → «Змінити темп тут…».</li>
        <li>MIDI-експорт («MIDI мого аранжування») записує всі зміни темпу, тож у будь-якій програмі ноти стануть на свої такти.</li>
      </ul>
      <div class="tm-bar">
        <label data-hint="Темп від першого такту">Початковий темп <input type="number" id="tm-start" min="20" max="400" step="0.5"></label>
        <button class="btn primary sm" id="tm-add" data-hint="Додати зміну темпу на початку такту, де стоїть курсор">+ Зміна в позиції курсору</button>
        <span class="muted small" id="tm-now"></span>
      </div>
      <table class="tm-table"><thead><tr><th>Такт</th><th>Час</th><th>BPM</th><th></th></tr></thead><tbody id="tm-rows"></tbody></table>
      <div class="modal-actions"><button class="btn ghost danger" id="tm-reset" data-hint="Прибрати всі зміни — один темп на всю пісню">Скинути до ${tmFmt(tmBase())} BPM</button><button class="btn primary" data-k="x">Готово</button></div>
    </div></div>`;
  m.onclick = (e) => { if (e.target === m || e.target.dataset.k === "x") m.hidden = true; };
  $("#tm-add", m).onclick = () => tmChangeAt(S.playBeat);
  $("#tm-start", m).onchange = (e) => {
    const v = parseFloat(e.target.value);
    if (!(v >= 20 && v <= 400)) { toast("Темп має бути від 20 до 400 BPM", true); tmRenderTable(); return; }
    const L = (S.mix.tempo || []).filter((x) => x.at > 1e-9);
    if (Math.abs(v - tmBase()) > 1e-6 || L.length) L.push({ at: 0, bpm: v });
    tmCommit(L, "початковий темп");
  };
  $("#tm-reset", m).onclick = async () => {
    if (!tmActive()) return;
    if (await inkConfirm("Скинути темп", "Прибрати всі зміни темпу? Сітка повернеться до одного темпу на всю пісню. Скасувати можна через Ctrl+Z.", "Скинути", true)) tmCommit([], "скинути темп");
  };
  tmRenderTable();
  m.hidden = false;
}
function tmInfo() {
  const el = document.getElementById("s-tm-info");
  if (!el) return;
  const n = tmActive() ? tmSegs().length - 1 + (Math.abs(tmSegs()[0].bpm - tmBase()) > 1e-6 ? 1 : 0) : 0;
  const v = n ? `${tr("змін темпу:")} ${n}` : tr("Один темп на всю пісню");
  if (el.textContent !== v) el.textContent = v;
}
const _drawTopTm = drawTop;
drawTop = function() {
  _drawTopTm();
  tmInfo();
  if (!tmActive() || !S.B) return;
  const ctx = cvTop.getContext("2d"), dpr = devicePixelRatio || 1, w = cvTop.width / dpr;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "600 11px " + getComputedStyle(document.body).fontFamily;
  for (const s of tmSegs()) {
    const x = beatToX(s.u);
    if (x < -80 || x > w) continue;
    const txt = tmFmt(s.bpm) + " BPM", tw = ctx.measureText(txt).width + 8;
    ctx.fillStyle = "rgba(246,173,85,.9)";
    ctx.fillRect(Math.round(x), 14, 1, 9);
    ctx.fillStyle = "rgba(246,173,85,.18)";
    roundRect(ctx, x + 2, 13, tw, 11, 3);
    ctx.fill();
    ctx.fillStyle = "#f6ad55";
    ctx.fillText(txt, x + 6, 22);
  }
  ctx.restore();
};
(function tmUI() {
  const top = $(".tl-top");
  top.addEventListener("contextmenu", (e) => {
    if (!S.B) return;
    const r = top.getBoundingClientRect(), y = e.clientY - r.top;
    if (y >= 24) return;
    const u = scrollBeat() + (e.clientX - r.left) / S.ppb;
    setTimeout(() => {
      if (document.getElementById("ctxmenu")) return;
      const bar = tmBarOf(u);
      const items = [[`Змінити темп тут (такт ${bar})…`, () => tmChangeAt(u)], ["Доріжка темпу…", openTempo]];
      const at = tmBarStart(bar);
      if ((S.mix.tempo || []).some((x) => Math.abs(x.at - at) < 1e-4 && x.at > 1e-9)) items.push(null, ["Прибрати зміну темпу в цьому такті", () => tmCommit(S.mix.tempo.filter((x) => Math.abs(x.at - at) >= 1e-4), "видалити зміну темпу"), "danger"]);
      menu(e, items);
    }, 0);
  });
  const ob = document.getElementById("s-tm-open");
  if (ob) ob.onclick = needProject(openTempo);
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Доріжка темпу (зміни темпу в пісні)…", needProject(openTempo)]]);
})();
