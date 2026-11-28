"use strict";
const SL = { src: null, buf: null, a: 0, b: 0, onsets: [], cuts: [], sens: 0.55, mode: "hits", bpm: 120, sync: true, quant: "0", reps: 1, drag: -1, play: null, name: "" };
function slAutoCuts() {
  const dur = SL.b - SL.a;
  if (SL.mode === "hits") {
    const thr = Math.max(0.02, 1 - SL.sens) * 0.6;
    const out = [0];
    for (const [t, s] of SL.onsets) if (s >= thr && t - out[out.length - 1] >= 0.05 && t < dur - 0.02) out.push(t);
    SL.cuts = out;
  } else {
    const step = 60 / (SL.bpm || 120) * { q4: 1, q8: 0.5, q16: 0.25 }[SL.mode];
    const out = [];
    for (let t = 0; t < dur - 0.02; t += step) out.push(+t.toFixed(5));
    SL.cuts = out;
  }
}
function slDraw(m) {
  const cv = $("#sl-cv", m);
  if (!cv || !SL.buf) return;
  const W = cv.clientWidth, H = cv.clientHeight, dpr = devicePixelRatio || 1;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#0f1116";
  g.fillRect(0, 0, W, H);
  const d = SL.buf.getChannelData(0), sr = SL.buf.sampleRate, a0 = Math.floor(SL.a * sr), n = Math.max(1, Math.floor((SL.b - SL.a) * sr));
  const step = Math.max(1, Math.floor(n / W));
  const cuts = SL.cuts.slice().sort((x, y) => x - y);
  for (let i = 0; i < cuts.length; i++) {
    const x0 = cuts[i] / (SL.b - SL.a) * W, x1 = (i + 1 < cuts.length ? cuts[i + 1] : SL.b - SL.a) / (SL.b - SL.a) * W;
    g.fillStyle = i % 2 ? "rgba(79,209,197,.07)" : "rgba(255,181,71,.07)";
    g.fillRect(x0, 0, x1 - x0, H);
    g.fillStyle = "rgba(233,235,241,.55)";
    g.font = "11px sans-serif";
    g.fillText(String(i + 1), x0 + 4, 13);
  }
  g.strokeStyle = "rgba(233,235,241,.75)";
  g.beginPath();
  for (let x = 0; x < W; x++) {
    let mx = 0;
    const s0 = a0 + x * step;
    for (let k = 0; k < step; k += 2) { const v = Math.abs(d[s0 + k] || 0); if (v > mx) mx = v; }
    const h = mx * (H / 2 - 16);
    g.moveTo(x + 0.5, H / 2 + 8 - h);
    g.lineTo(x + 0.5, H / 2 + 8 + h);
  }
  g.stroke();
  for (const c of cuts) {
    const x = c / (SL.b - SL.a) * W;
    g.fillStyle = "#ffb547";
    g.fillRect(x - 1, 0, 2, H);
    g.beginPath();
    g.moveTo(x - 6, 0);
    g.lineTo(x + 6, 0);
    g.lineTo(x, 9);
    g.fill();
  }
  $("#sl-info", m).textContent = `${cuts.length} ${tr("шматків")} · ${(SL.b - SL.a).toFixed(2)} ${LANG === "en" ? "s" : "с"}${SL.bpm ? ` · ${SL.bpm} BPM` : ""}`;
}
function slPlaySlice(i) {
  const A = ensureCtx();
  A.ctx.resume();
  if (SL.play) { try { SL.play.stop(); } catch (e) {} }
  const cuts = SL.cuts.slice().sort((x, y) => x - y);
  const st = cuts[i], en = i + 1 < cuts.length ? cuts[i + 1] : SL.b - SL.a;
  const s = A.ctx.createBufferSource();
  s.buffer = SL.buf;
  s.connect(A.out);
  s.start(0, SL.a + st, Math.max(0.01, en - st));
  SL.play = s;
}
function slPlayAll() {
  const A = ensureCtx();
  A.ctx.resume();
  if (SL.play) { try { SL.play.stop(); } catch (e) {} }
  const s = A.ctx.createBufferSource();
  s.buffer = SL.buf;
  s.connect(A.out);
  s.start(0, SL.a, SL.b - SL.a);
  SL.play = s;
}
function slBind(m) {
  const cv = $("#sl-cv", m);
  const toT = (e) => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(SL.b - SL.a, (e.clientX - r.left) / r.width * (SL.b - SL.a))); };
  const near = (e) => { const r = cv.getBoundingClientRect(); const px = (SL.b - SL.a) / r.width; const t = toT(e); let best = -1, bd = 7 * px; SL.cuts.forEach((c, i) => { const dd = Math.abs(c - t); if (dd < bd && c > 0) { bd = dd; best = i; } }); return best; };
  cv.onmousedown = (e) => {
    const k = near(e);
    if (e.button === 2) { if (k >= 0) { SL.cuts.splice(k, 1); slDraw(m); } return; }
    if (k >= 0) {
      SL.drag = k;
      const mv = (ev) => { SL.cuts[SL.drag] = +toT(ev).toFixed(5); slDraw(m); };
      const up = () => { SL.drag = -1; removeEventListener("mousemove", mv); removeEventListener("mouseup", up); };
      addEventListener("mousemove", mv);
      addEventListener("mouseup", up);
      return;
    }
    const t = toT(e);
    if (e.shiftKey || e.detail === 2) { SL.cuts.push(+t.toFixed(5)); SL.cuts.sort((x, y) => x - y); slDraw(m); return; }
    const cuts = SL.cuts.slice().sort((x, y) => x - y);
    let i = 0;
    while (i + 1 < cuts.length && cuts[i + 1] <= t) i++;
    slPlaySlice(i);
  };
  cv.oncontextmenu = (e) => e.preventDefault();
  cv.onmousemove = (e) => { cv.style.cursor = near(e) >= 0 ? "ew-resize" : "pointer"; };
}
async function openSlicer(src) {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  SL.src = src;
  SL.name = src.name || tr("Брейк");
  const m = careModalBox("sl-modal", "Нарізка на удари", `<p class="muted small">${tr("Програма знаходить удари й ріже звук на шматки. Кожен шматок стає окремою клавішею, а нова доріжка грає його оригінальний ритм — тепер ноти можна переставляти, міняти темп без розтягування звуку й складати нові ритми з тих самих ударів.")}</p>
    <div class="sl-top"><b id="sl-name"></b><span class="muted small" id="sl-info">${tr("Завантаження…")}</span><span class="spacer"></span><button class="btn ghost sm" id="sl-all" data-hint="Послухати весь фрагмент">▶ ${tr("Усе")}</button></div>
    <canvas id="sl-cv" class="sl-cv" data-hint="Клік по шматку — послухати. Тягніть жовтий маркер, щоб посунути розріз. Shift+клік або подвійний клік — новий розріз. Правий клік по маркеру — прибрати його"></canvas>
    <div class="sl-row">
      <div class="np-seg" id="sl-mode">${[["hits", "За ударами"], ["q4", "Чверті"], ["q8", "Восьмі"], ["q16", "Шістнадцяті"]].map(([k, l]) => `<button type="button" data-v="${k}" class="${SL.mode === k ? "on" : ""}" data-hint="${k === "hits" ? "Розрізи там, де програма чує удари" : "Розрізи рівною сіткою за темпом фрагмента"}">${tr(l)}</button>`).join("")}</div>
      <label class="sl-sens" data-hint="Більше — більше розрізів (чутливіше до тихих ударів)">${tr("Чутливість")} <input type="range" id="sl-sens" min="0" max="1" step="0.01" value="${SL.sens}"></label>
      <label data-hint="Темп фрагмента. Програма визначає його сама; виправте, якщо помилилась">BPM <input type="number" id="sl-bpm" min="40" max="260" step="0.01" style="width:80px"></label>
    </div>
    <div class="sl-row">
      <label class="chk" data-hint="Ноти розставляються в темпі вашого проєкту: брейк грає швидше чи повільніше, а звук ударів не розтягується"><input type="checkbox" id="sl-sync" ${SL.sync ? "checked" : ""}> ${tr("Грати в темпі проєкту")}</label>
      <label data-hint="Вирівняти ноти по сітці">${tr("Квантування")} <select id="sl-q"><option value="0">${tr("без квантування")}</option><option value="0.25">1/16</option><option value="0.5">1/8</option></select></label>
      <label data-hint="Скільки разів повторити ритм на новій доріжці">${tr("Повторів")} <input type="number" id="sl-reps" min="1" max="64" value="${SL.reps}" style="width:64px"></label>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-k="x">${tr("Скасувати")}</button><button class="btn primary" id="sl-go" disabled>${tr("Створити доріжку з нарізкою")}</button></div>`);
  m.querySelector(".modal-card").style.width = "min(1000px,96vw)";
  $("#sl-name", m).textContent = SL.name;
  try {
    const A = ensureCtx();
    const url = src.spec ? `/api/project/${S.pid}/sample?f=${encodeURIComponent(src.spec)}` : `/api/project/${S.pid}/full/${srcKey(src.t)}`;
    SL.buf = await fetchBuffer(A.ctx, url);
    SL.a = Math.max(0, src.from || 0);
    SL.b = Math.min(SL.buf.duration, src.to || SL.buf.duration);
    const body = src.spec ? { spec: src.spec, from: SL.a, to: SL.b } : { base: baseId(src.t), source: mt(src.t.id).source, from: SL.a, to: SL.b };
    const r = await api.post(`/api/project/${S.pid}/slice/detect`, body);
    if (r.error) throw new Error(r.error);
    SL.onsets = r.onsets || [];
    SL.bpm = src.bpm || r.bpm || S.B.timing.bpm;
    $("#sl-bpm", m).value = Math.round(SL.bpm * 100) / 100;
    slAutoCuts();
    slDraw(m);
    slBind(m);
    $("#sl-go", m).disabled = false;
  } catch (e) {
    $("#sl-info", m).textContent = tr("Не вдалося") + ": " + e.message;
    return;
  }
  $$("#sl-mode button", m).forEach((b) => b.onclick = () => { SL.mode = b.dataset.v; $$("#sl-mode button", m).forEach((x) => x.classList.toggle("on", x === b)); slAutoCuts(); slDraw(m); });
  $("#sl-sens", m).oninput = (e) => { SL.sens = +e.target.value; if (SL.mode === "hits") { slAutoCuts(); slDraw(m); } };
  $("#sl-bpm", m).onchange = (e) => { SL.bpm = +e.target.value || SL.bpm; if (SL.mode !== "hits") slAutoCuts(); slDraw(m); };
  $("#sl-all", m).onclick = slPlayAll;
  addEventListener("resize", () => { if (!m.hidden) slDraw(m); });
  $("#sl-go", m).onclick = async () => {
    SL.sync = $("#sl-sync", m).checked;
    SL.quant = $("#sl-q", m).value;
    SL.reps = Math.max(1, Math.min(64, +$("#sl-reps", m).value || 1));
    const go = $("#sl-go", m);
    go.disabled = true;
    go.textContent = tr("Ріжу…");
    try {
      const cuts = SL.cuts.slice().sort((x, y) => x - y);
      const body = src.spec ? { spec: src.spec, from: SL.a, to: SL.b, cuts } : { base: baseId(src.t), source: mt(src.t.id).source, from: SL.a, to: SL.b, cuts };
      const r = await api.post(`/api/project/${S.pid}/slice`, body);
      let j;
      for (;;) { await new Promise((res) => setTimeout(res, 300)); j = await api.get(`/api/process/${r.job}`); if (j.status !== "running") break; }
      if (j.status === "error") throw new Error(j.error);
      const sl = j.result.slices || [];
      if (!sl.length) throw new Error(tr("Не вдалося знайти удари у фрагменті."));
      await slCreateTrack(sl);
      m.hidden = true;
    } catch (e) {
      toast(tr("Не вдалося нарізати") + ": " + e.message, true);
      go.disabled = false;
      go.textContent = tr("Створити доріжку з нарізкою");
    }
  };
}
async function slCreateTrack(sl) {
  const P = period(), src = SL.src, total = SL.b - SL.a;
  let origin = 0;
  if (src.t) {
    const clips = (mt(src.t.id).clips || []).filter((c) => !c.mute);
    const c = clips.find((c) => SL.a >= c.src && SL.a < c.src + c.dur) || clips[0];
    origin = c ? c.start + (SL.a - c.src) / P : (SL.a + S.B.timing.pad) / P;
  } else {
    const bpb = S.B.timing.bpb || 4;
    origin = Math.floor(tmM(S.playBeat) / bpb) * bpb;
    origin = tmU(origin);
  }
  const toBeats = (sec) => (SL.sync && SL.bpm ? sec * SL.bpm / 60 : sec / P);
  const loopLen = toBeats(total);
  const q = +SL.quant;
  const notes = [];
  for (let r = 0; r < SL.reps; r++) {
    sl.forEach((s, i) => {
      let at = toBeats(s.start - SL.a) + r * loopLen;
      if (q) at = Math.round(at / q) * q;
      notes.push([+(origin + at).toFixed(5), +Math.max(0.05, toBeats(s.dur)).toFixed(5), 36 + i, 100]);
    });
  }
  const zones = sl.map((s, i) => ({ file: s.file, lo: 36 + i, hi: 36 + i, vlo: 0, vhi: 127, root: 36 + i, tune: 0, gain: 1, pan: 0, loop: null, a: 0.001, r: 0.04, d: 1, s: 1, fixed: true }));
  addMidiTrack("keys");
  const g = S.mix.gens[S.mix.gens.length - 1];
  g.name = tr("Нарізка") + ": " + SL.name;
  g.notes = notes;
  mt(g.id).inst = { type: "multi", name: `${tr("Нарізка")} «${SL.name}» — ${sl.length}`, zones, drums: true, params: { gain: 1, attack: 1, release: 1, vel: 0.4, tune: 0 } };
  if (src.t && src.t.has_audio) mt(src.t.id).mute = true;
  _tracksKey = "";
  afterEdit(true);
  await loadInstrumentBuffers();
  renderDock();
  toast(`${tr("Готово")}: ${sl.length} ${tr("шматків на клавішах від C1, ритм повторено")} ${SL.reps}×.${src.t ? " " + tr("Оригінальну доріжку вимкнено, щоб не звучала двічі.") : ""}`);
}
function slFromTrack(T) {
  if (!T || !T.t || !T.t.has_audio) return toast("Виберіть доріжку із записом.", true);
  const t = T.t, m = T.m, P = period();
  const sc = selectedClips().find((x) => x.t.id === t.id);
  let from, to;
  if (sc) { from = sc.c.src; to = sc.c.src + sc.c.dur; }
  else if (S.loop && S.loop.on) {
    const clips = (m.clips || []).filter((c) => !c.mute);
    const c = clips.find((c) => S.loop.a >= c.start && S.loop.a < c.start + c.dur / P) || clips[0];
    from = c.src + (S.loop.a - c.start) * P;
    to = c.src + (S.loop.b - c.start) * P;
  } else return toast("Виділіть кліп або увімкніть цикл (петлю) на потрібному місці — нарізка візьме лише цей фрагмент.", true);
  openSlicer({ t, from: Math.max(0, from), to, name: t.name });
}
sliceToPads = slFromTrack;
(function slicerUI() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Нарізка брейків на удари…", needProject(() => {
    const t = findT(S.sel);
    if (t && t.has_audio) return slFromTrack({ t, m: mt(t.id) });
    openSoundBrowser({ tab: "samples" });
    toast(tr("Виберіть луп і натисніть «Нарізати» — або виділіть кліп на аудіодоріжці й відкрийте нарізку знову."));
  })]]);
})();
