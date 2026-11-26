"use strict";
const AUTO_H = 58;
const AUTOP = {
  vol: { name: "Гучність", min: -40, max: 6, def: 0, unit: "дБ" },
  pan: { name: "Панорама", min: -1, max: 1, def: 0, unit: "" },
  cut: { name: "Фільтр (зріз верхів)", min: 80, max: 20000, def: 20000, unit: "Гц", log: true },
};
S.autoView = {};
function autoH(t) { return S.autoView && S.autoView[t.id] ? AUTO_H : 0; }
function toggleAuto(t, param) {
  S.autoView[t.id] = param || (S.autoView[t.id] ? null : "vol");
  renderHeads(); layout(); draw();
}
const autoPts = (m, p) => m.auto && m.auto[p] || [];
const aNorm = (p, v) => { const d = AUTOP[p]; return d.log ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min); };
const aDenorm = (p, n) => { const d = AUTOP[p]; n = Math.min(1, Math.max(0, n)); return d.log ? d.min * Math.pow(d.max / d.min, n) : d.min + n * (d.max - d.min); };
function aValueAt(pts, b, def) {
  if (!pts.length) return def;
  if (b <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (b <= pts[i][0]) { const [b0, v0] = pts[i - 1], [b1, v1] = pts[i]; return v0 + (v1 - v0) * (b - b0) / Math.max(1e-6, b1 - b0); }
  return pts[pts.length - 1][1];
}
const aFmt = (p, v) => p === "vol" ? `${v.toFixed(1)} дБ` : p === "pan" ? (Math.abs(v) < 0.02 ? "центр" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`) : v >= 1000 ? `${(v / 1000).toFixed(1)} кГц` : `${Math.round(v)} Гц`;
function drawAuto(ctx, t, y, h, w, b0, b1) {
  const p = S.autoView[t.id], m = mt(t.id), pts = autoPts(m, p), d = AUTOP[p];
  ctx.fillStyle = "#101217"; ctx.fillRect(0, y, w, h);
  ctx.fillStyle = "#1f232c"; ctx.fillRect(0, y, w, 1);
  const Y = (v) => y + 4 + (1 - aNorm(p, v)) * (h - 8);
  ctx.strokeStyle = "#262a34"; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(0, Y(d.def)); ctx.lineTo(w, Y(d.def)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.beginPath();
  if (!pts.length) { ctx.moveTo(0, Y(d.def)); ctx.lineTo(w, Y(d.def)); }
  else { ctx.moveTo(0, Y(pts[0][1])); for (const [b, v] of pts) ctx.lineTo(beatToX(b), Y(v)); ctx.lineTo(w, Y(pts[pts.length - 1][1])); }
  ctx.stroke(); ctx.lineWidth = 1;
  for (const [b, v] of pts) { const x = beatToX(b); if (x < -6 || x > w + 6) continue; ctx.beginPath(); ctx.arc(x, Y(v), 4, 0, 7); ctx.fillStyle = "#ffb547"; ctx.fill(); }
  ctx.fillStyle = "#8b91a3"; ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
  ctx.fillText(`A · ${d.name}${pts.length ? "" : " — клік, щоб додати точку"}`, 6, y + 12);
}
function autoAreaAt(e) {
  const r = body.getBoundingClientRect(), y = e.clientY - r.top, x = e.clientX - r.left;
  let acc = 0;
  for (const t of tracksAll()) {
    const lh = laneHeight(t), ah = autoH(t);
    if (ah && y >= acc + lh - ah && y < acc + lh) return { t, y0: acc + lh - ah, h: ah, x, y, beat: scrollBeat() + x / S.ppb };
    acc += lh;
  }
  return null;
}
function autoChanged() {
  saveMix(); draw();
  if (S.playing && S.audio) scheduleAutomation(S.audio.ctx, curBeat(), S.audio.ctx.currentTime);
  else resetAutomation();
}
body.addEventListener("mousedown", (e) => {
  const h = autoAreaAt(e);
  if (!h || e.button !== 0) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const p = S.autoView[h.t.id], m = mt(h.t.id);
  if (!m.auto) m.auto = {};
  if (!m.auto[p]) m.auto[p] = [];
  const pts = m.auto[p];
  const valAtY = (yy) => { const v = aDenorm(p, 1 - (yy - h.y0 - 4) / (h.h - 8)); return p === "cut" ? Math.round(v) : Math.round(v * 100) / 100; };
  let idx = pts.findIndex(([b, v]) => Math.abs(beatToX(b) - h.x) < 7 && Math.abs(h.y0 + 4 + (1 - aNorm(p, v)) * (h.h - 8) - h.y) < 8);
  pushUndo("автоматизація");
  if (idx < 0) { pts.push([Math.max(0, snapB(h.beat, e.altKey)), valAtY(h.y)]); pts.sort((a, b) => a[0] - b[0]); idx = pts.findIndex((q) => q[1] === valAtY(h.y) && Math.abs(q[0] - Math.max(0, snapB(h.beat, e.altKey))) < 1e-6); }
  const pt = pts[idx];
  const tip = $("#hint-text");
  const mv = (ev) => {
    const r = body.getBoundingClientRect(), b = scrollBeat() + (ev.clientX - r.left) / S.ppb;
    pt[0] = Math.max(0, snapB(b, ev.altKey)); pt[1] = valAtY(ev.clientY - r.top);
    pts.sort((a, c) => a[0] - c[0]);
    if (tip) tip.textContent = `${AUTOP[p].name}: ${aFmt(p, pt[1])} · такт ${(pt[0] / S.B.timing.bpb + 1).toFixed(2)}`;
    draw();
  };
  const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); autoChanged(); };
  window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  draw();
}, true);
body.addEventListener("contextmenu", (e) => {
  const h = autoAreaAt(e);
  if (!h) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const p = S.autoView[h.t.id], m = mt(h.t.id), pts = autoPts(m, p);
  const idx = pts.findIndex(([b, v]) => Math.abs(beatToX(b) - h.x) < 7 && Math.abs(h.y0 + 4 + (1 - aNorm(p, v)) * (h.h - 8) - h.y) < 8);
  if (idx >= 0) { pushUndo("автоматизація"); pts.splice(idx, 1); autoChanged(); return; }
  menu(e, [
    ...Object.entries(AUTOP).map(([k, d]) => [`${k === p ? "● " : ""}Показати: ${d.name}${autoPts(m, k).length ? ` (${autoPts(m, k).length} точок)` : ""}`, () => toggleAuto(h.t, k)]),
    null,
    ["Плавне наростання від курсору (2 такти)", () => { pushUndo("автоматизація"); if (!m.auto) m.auto = {}; const b = S.playBeat, d = AUTOP[p]; m.auto[p] = [...autoPts(m, p).filter((q) => q[0] < b || q[0] > b + 2 * S.B.timing.bpb), [b, p === "vol" ? -40 : p === "cut" ? 300 : d.def], [b + 2 * S.B.timing.bpb, d.def]].sort((a, c) => a[0] - c[0]); autoChanged(); }],
    ["Плавне затухання від курсору (2 такти)", () => { pushUndo("автоматизація"); if (!m.auto) m.auto = {}; const b = S.playBeat, d = AUTOP[p]; m.auto[p] = [...autoPts(m, p).filter((q) => q[0] < b || q[0] > b + 2 * S.B.timing.bpb), [b, d.def], [b + 2 * S.B.timing.bpb, p === "vol" ? -40 : p === "cut" ? 300 : d.def]].sort((a, c) => a[0] - c[0]); autoChanged(); }],
    [`Очистити лінію «${AUTOP[p].name}»`, () => { pushUndo("автоматизація"); if (m.auto) m.auto[p] = []; autoChanged(); }],
    ["Сховати лінію", () => toggleAuto(h.t, null)],
  ]);
}, true);
function applyAutomation(ctx, strip, m, startBeat, t0) {
  const P = period();
  const targets = { vol: [strip.autoG.gain, (v) => DSP.dbToGain(v)], pan: [strip.autoPan.pan, (v) => v], cut: [strip.autoCut.frequency, (v) => Math.min(v, ctx.sampleRate / 2 - 200)] };
  for (const [k, [param, conv]] of Object.entries(targets)) {
    const pts = autoPts(m, k), d = AUTOP[k];
    param.cancelScheduledValues(0);
    param.setValueAtTime(conv(aValueAt(pts, startBeat, d.def)), t0);
    for (const [b, v] of pts) if (b > startBeat) param.linearRampToValueAtTime(conv(v), t0 + (b - startBeat) * P);
  }
}
function scheduleAutomation(ctx, b, t0) {
  const A = S.audio; if (!A) return;
  for (const t of tracksAll()) { const st = A.strips[t.id]; if (st && st.autoG) applyAutomation(ctx, st, mt(t.id), b, t0); }
}
function resetAutomation() {
  const A = S.audio; if (!A || !S.mix) return;
  for (const t of tracksAll()) { const st = A.strips[t.id]; if (st && st.autoG) applyAutomation(A.ctx, st, mt(t.id), S.playBeat, A.ctx.currentTime); }
}

function kFilterCoefs(fs) {
  const shelf = (() => { const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
    return [[(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]]; })();
  const hp = (() => { const f0 = 38.13547087602444, Q = 0.5003270373238773, K = Math.tan(Math.PI * f0 / fs), a0 = 1 + K / Q + K * K;
    return [[1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]]; })();
  return [shelf, hp];
}
function lufsOf(buf) {
  const fs = buf.sampleRate, n = buf.length, coefs = kFilterCoefs(fs), chans = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
    let x = buf.getChannelData(c);
    for (const [[b0, b1, b2], [, a1, a2]] of coefs) {
      const y = new Float32Array(n); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
      x = y;
    }
    chans.push(x);
  }
  if (chans.length === 1) chans.push(chans[0]);
  const blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs), zs = [];
  for (let s = 0; s + blk <= n; s += hop) { let z = 0; for (const ch of chans) { let a = 0; for (let i = s; i < s + blk; i++) a += ch[i] * ch[i]; z += a / blk; } zs.push(z); }
  const L = (z) => -0.691 + 10 * Math.log10(z + 1e-12);
  let g = zs.filter((z) => L(z) > -70);
  if (!g.length) return -70;
  const rel = L(g.reduce((a, b) => a + b, 0) / g.length) - 10;
  g = g.filter((z) => L(z) > rel);
  let peak = 0; for (const ch of [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))]) for (let i = 0; i < n; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
  lufsOf.lastPeak = 20 * Math.log10(peak + 1e-9);
  return g.length ? L(g.reduce((a, b) => a + b, 0) / g.length) : -70;
}
async function renderMixQuick(masterFx, from = 0, to = null) {
  const A = ensureCtx(), SR = A.ctx.sampleRate, P = period();
  const end = to ?? arrEnd(), len = Math.ceil(((end - from) * P + 1) * SR);
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  await loadInstrumentBuffers();
  const master = new DSP.Strip(ctx, ctx.destination, fxEnv());
  master.setFx(masterFx); master.fader.gain.value = DSP.dbToGain(S.mix.master.vol || 0);
  for (const t of tracksAll()) {
    if (!audible(t)) continue;
    const m = mt(t.id), mode = modeOf(t);
    const st = new DSP.Strip(ctx, master.input, fxEnv());
    st.setFx(m.fx); st.setPan(m.pan); st.fader.gain.value = DSP.dbToGain(m.vol);
    applyAutomation(ctx, st, m, from, 0);
    if (t.has_audio && (mode === "audio" || mode === "both") && A.buffers[srcKey(t)]) scheduleClips(ctx, t, A.buffers[srcKey(t)], st.input, from, 0, null);
    if (mode === "midi" || mode === "both") {
      const g = ctx.createGain(); g.gain.value = mode === "both" ? 0.7 : 1; g.connect(st.input);
      for (const n of arranged(t)) if (n[0] >= from && n[0] < end) DSP.playNote(ctx, g, m.inst, n[2], n[3] / 127, (n[0] - from) * P, n[1] * P, A.ibuf);
    }
  }
  return ctx.startRendering();
}

async function masterOver(buf, masterFx) {
  const ctx = new OfflineAudioContext(2, buf.length, buf.sampleRate);
  await DSP.ensureWorklets(ctx);
  const master = new DSP.Strip(ctx, ctx.destination, fxEnv());
  master.setFx(masterFx);
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(master.input); s.start(0);
  return ctx.startRendering();
}
const ANA = { open: false, mom: [], st: [], blocks: [], lastBlock: 0, ref: null, refOn: false, match: true };
function ensureAnalyzers() {
  const A = ensureCtx(); if (!A.master) rebuildStrips();
  if (A.anaFor === A.master) return A;
  const ctx = A.ctx;
  A.spec = ctx.createAnalyser(); A.spec.fftSize = 4096; A.spec.smoothingTimeConstant = 0.82;
  const hs = ctx.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 1681; hs.gain.value = 4;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 38; hp.Q.value = 0.5;
  A.kAn = ctx.createAnalyser(); A.kAn.fftSize = 2048;
  A.master.out.connect(A.spec); A.master.out.connect(hs); hs.connect(hp); hp.connect(A.kAn);
  A.anaFor = A.master;
  return A;
}
function openAnalyzer() {
  const pnl = $("#ana");
  ANA.open = !ANA.open; pnl.hidden = !ANA.open; $("#t-ana").classList.toggle("on", ANA.open);
  if (!ANA.open) return;
  ensureAnalyzers();
  pnl.innerHTML = `<div class="ana-head" id="ana-drag"><b>Аналізатор</b><span class="muted small">Master</span><span class="spacer"></span><button class="x" id="ana-x">&times;</button></div>
    <canvas id="ana-spec" data-hint="Спектр міксу: ліворуч низ (бас), праворуч верх. Блакитна лінія — що звучить зараз, сіра — референс або мікс для порівняння"></canvas>
    <div class="ana-lufs">
      <div data-hint="Миттєва гучність (за 0,4 с)"><span>Momentary</span><b id="lu-m">—</b></div>
      <div data-hint="Короткочасна гучність (за 3 с)"><span>Short-term</span><b id="lu-s">—</b></div>
      <div data-hint="Інтегрована гучність з початку відтворення — саме її міряють Spotify, YouTube тощо"><span>Integrated</span><b id="lu-i">—</b></div>
      <div data-hint="Найгучніший пік. Вище 0 дБ — перевантаження"><span>Пік</span><b id="lu-p">—</b></div>
      <button class="btn ghost sm" id="lu-reset" data-hint="Почати вимірювання інтегрованої гучності заново">Скинути</button>
    </div>
    <div class="muted small" id="lu-hint">Ціль для стрімінгу: близько −14 LUFS, пік не вище −1 дБ.</div>
    <div class="ana-ref">
      <button class="btn ghost sm" id="ref-load" data-hint="Завантажити трек, на який хочете бути схожими за звуком і гучністю">Референс…</button>
      <div class="seg small" id="ref-ab" data-hint="Миттєво перемикати між вашим міксом і референсом під час відтворення"><button data-ra="mix" class="active">Мій мікс</button><button data-ra="ref">Референс</button></div>
      <label class="small" data-hint="Зробити референс такої ж гучності, як ваш мікс, щоб чесно порівнювати звук"><input type="checkbox" id="ref-match" ${ANA.match ? "checked" : ""}> рівна гучність</label>
      <span class="muted small" id="ref-name">${ANA.ref ? escapeHtml(ANA.ref.name) + ` · ${ANA.ref.lufs.toFixed(1)} LUFS` : "референс не вибрано"}</span>
      <input type="file" id="ref-file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" hidden>
    </div>
    <button class="btn primary sm wide" id="ana-master" data-hint="Автоматично налаштувати ефекти Master під обрану платформу">Мастеринг одним кліком…</button>`;
  $("#ana-x").onclick = openAnalyzer;
  $("#lu-reset").onclick = () => { ANA.blocks = []; ANA.peak = -120; };
  $("#ref-load").onclick = async () => {
    if (!DESK.on) return $("#ref-file").click();
    const f = (await pickLocal("audio", false))[0];
    if (f) uploadRef(f);
  };
  $("#ref-file").onchange = (e) => uploadRef(e.target.files[0]);
  $$("#ref-ab button").forEach((b) => b.onclick = () => setRef(b.dataset.ra === "ref"));
  $("#ref-match").onchange = (e) => { ANA.match = e.target.checked; setRef(ANA.refOn); };
  $("#ana-master").onclick = openMastering;
  dragPanel(pnl, $("#ana-drag"));
  loadRefInfo();
  anaLoop();
}
function dragPanel(pnl, handle) {
  handle.onpointerdown = (e) => {
    if (e.target.closest("button")) return;
    const r = pnl.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    handle.setPointerCapture(e.pointerId);
    handle.onpointermove = (ev) => { pnl.style.left = Math.max(0, ev.clientX - dx) + "px"; pnl.style.top = Math.max(54, ev.clientY - dy) + "px"; pnl.style.right = "auto"; pnl.style.bottom = "auto"; };
    handle.onpointerup = () => { handle.onpointermove = null; };
  };
}
function anaLoop() {
  if (!ANA.open) return;
  const A = S.audio, cv = $("#ana-spec");
  if (A && A.spec && cv) {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    c.fillStyle = "#0e1014"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#1f232c"; c.fillStyle = "#4b5160"; c.font = "9px ui-monospace,Consolas";
    const fx = (f) => Math.log(f / 20) / Math.log(16000 / 20) * w;
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = fx(f); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.fillText(f >= 1000 ? f / 1000 + "k" : f, x + 2, h - 3); }
    const curve = (an, color, fill) => {
      const d = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(d);
      const sr = A.ctx.sampleRate, bin = sr / an.fftSize;
      c.beginPath();
      for (let x = 0; x <= w; x += 2) { const f = 20 * Math.pow(16000 / 20, x / w), i = Math.min(d.length - 1, Math.round(f / bin)); const db = Math.max(-100, d[i] || -100); const y = h - 12 - (db + 100) / 90 * (h - 16); x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.strokeStyle = color; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1;
      if (fill) { c.lineTo(w, h); c.lineTo(0, h); c.fillStyle = fill; c.fill(); }
    };
    if (ANA.ref && ANA.ref.an && ANA.refPlaying) curve(ANA.refOn ? A.spec : ANA.ref.an, "#5d6374", null);
    curve(ANA.refOn && ANA.ref && ANA.ref.an ? ANA.ref.an : A.spec, "#4fd1c5", "rgba(79,209,197,.08)");
    const td = new Float32Array(A.kAn.fftSize); A.kAn.getFloatTimeDomainData(td);
    let ms = 0; for (let i = 0; i < td.length; i++) ms += td[i] * td[i]; ms /= td.length;
    const now = performance.now();
    ANA.mom.push([now, ms]); ANA.mom = ANA.mom.filter((q) => now - q[0] < 400);
    ANA.st.push([now, ms]); ANA.st = ANA.st.filter((q) => now - q[0] < 3000);
    const avg = (arr) => arr.reduce((a, q) => a + q[1], 0) / Math.max(1, arr.length);
    const L = (z) => -0.691 + 10 * Math.log10(z + 1e-12) + 3.01;
    const mom = L(avg(ANA.mom)), st = L(avg(ANA.st));
    if (S.playing && !ANA.refOn && now - ANA.lastBlock > 100) { ANA.lastBlock = now; ANA.blocks.push(avg(ANA.mom)); }
    let integ = null; const g1 = ANA.blocks.filter((z) => L(z) > -70);
    if (g1.length > 5) { const rel = L(g1.reduce((a, b) => a + b, 0) / g1.length) - 10; const g2 = g1.filter((z) => L(z) > rel); integ = L(g2.reduce((a, b) => a + b, 0) / g2.length); }
    let pk = 0; const sd = new Float32Array(A.spec.fftSize); A.spec.getFloatTimeDomainData(sd); for (let i = 0; i < sd.length; i++) pk = Math.max(pk, Math.abs(sd[i]));
    ANA.peak = Math.max(ANA.peak ?? -120, 20 * Math.log10(pk + 1e-9));
    const set = (id, v, unit = " LUFS") => { const el = $("#" + id); if (el) el.textContent = v == null || v < -69 ? "—" : v.toFixed(1) + unit; };
    set("lu-m", S.playing ? mom : null); set("lu-s", S.playing ? st : null); set("lu-i", integ); set("lu-p", ANA.peak > -119 ? ANA.peak : null, " дБ");
    const pe = $("#lu-p"); if (pe) pe.style.color = ANA.peak > -0.3 ? "#f43f5e" : "";
    ANA.lastST = S.playing ? st : ANA.lastST;
  }
  requestAnimationFrame(anaLoop);
}
async function loadRefInfo() {
  const info = await api.get(`/api/project/${S.pid}/reference`).catch(() => null);
  if (!info || !info.name) return;
  if (ANA.ref && ANA.ref.pid === S.pid) return;
  const A = ensureCtx();
  try {
    const buf = await fetchBuffer(A.ctx, `/api/project/${S.pid}/reference/audio`);
    ANA.ref = { ...info, buf, pid: S.pid };
    ANA.ref.an = A.ctx.createAnalyser(); ANA.ref.an.fftSize = 4096; ANA.ref.an.smoothingTimeConstant = 0.82;
    const el = $("#ref-name"); if (el) el.textContent = `${info.name} · ${info.lufs.toFixed(1)} LUFS`;
  } catch (e) {}
}
async function uploadRef(file) {
  if (!file) return;
  const el = $("#ref-name"); if (el) el.textContent = "завантаження…";
  const fd = new FormData(); fd.append("file", file, file.name);
  const r = await fetch(`/api/project/${S.pid}/reference`, { method: "POST", body: fd });
  if (!r.ok) { if (el) el.textContent = "не вдалося прочитати файл"; return; }
  ANA.ref = null; await loadRefInfo();
  toast("Референс завантажено. Під час відтворення перемикайте «Мій мікс / Референс».");
}
function refStart() {
  if (!ANA.ref || !S.audio) return;
  refStop();
  const A = S.audio, ctx = A.ctx, P = period();
  const s = ctx.createBufferSource(); s.buffer = ANA.ref.buf; s.loop = true;
  ANA.refGain = ctx.createGain(); s.connect(ANA.refGain); s.connect(ANA.ref.an); ANA.refGain.connect(ctx.destination);
  const off = Math.max(0, S.startBeat * P - S.B.timing.pad) % ANA.ref.buf.duration;
  s.start(S.startCtx, off); ANA.refSrc = s; ANA.refPlaying = true;
  setRef(ANA.refOn);
}
function refStop() { if (ANA.refSrc) { try { ANA.refSrc.stop(); } catch (e) {} } ANA.refSrc = null; ANA.refPlaying = false; }
function setRef(on) {
  ANA.refOn = on && !!ANA.ref;
  $$("#ref-ab button").forEach((b) => b.classList.toggle("active", (b.dataset.ra === "ref") === ANA.refOn));
  const A = S.audio; if (!A) return;
  const now = A.ctx.currentTime;
  A.out.gain.setTargetAtTime(ANA.refOn ? 0 : S.vol, now, 0.01);
  if (ANA.refGain && ANA.ref) {
    const mixL = ANA.lastST ?? -14, g = ANA.match ? DSP.dbToGain(Math.max(-24, Math.min(12, mixL - ANA.ref.lufs))) : 1;
    ANA.refGain.gain.setTargetAtTime(ANA.refOn ? g * S.vol : 0, now, 0.01);
  }
}
{
  const _play = play, _stop = stopPlay;
  play = function () { _play(); if (ANA.ref && ANA.ref.pid === S.pid) refStart(); };
  stopPlay = function () { refStop(); if (ANA.refOn && S.audio) { ANA.refOn = false; setRef(false); } _stop(); };
}

const MASTER_TARGETS = [["-14", "Стрімінг: Spotify, YouTube, Deezer (−14 LUFS)"], ["-16", "Apple Music, подкасти (−16 LUFS)"], ["-11", "Соцмережі: TikTok, Instagram, Reels (−11 LUFS)"], ["-9", "Максимально гучно: клуб, SoundCloud (−9 LUFS)"]];
const MASTER_STYLES = { neutral: "Нейтрально", warm: "Тепліше", bright: "Яскравіше", dense: "Щільніше (більше компресії)", wide: "Ширше стерео" };
function masterChain(style, off) {
  const gain = Math.max(0, off), trim = Math.min(0, off);
  const eq = Plugins.newFx("eq"), b = eq.params.bands;
  b[0] = { ...b[0], on: true, f: 28, q: 0.7 };
  if (style === "warm") { b[1].g = 1.5; b[1].f = 110; b[4].g = -1; b[4].f = 9000; }
  else if (style === "bright") { b[4].g = 2; b[4].f = 9000; b[2].g = -1; b[2].f = 320; b[3].g = 1; b[3].f = 3500; }
  else { b[1].g = 0.5; b[1].f = 90; b[4].g = 0.8; b[4].f = 11000; }
  eq.preset = "Мастеринг";
  const comp = Plugins.newFx("comp"); Object.assign(comp.params, style === "dense" ? { threshold: -20, ratio: 3, knee: 8, attack: 20, release: 150, makeup: 2 } : { threshold: -15, ratio: 1.8, knee: 10, attack: 30, release: 220, makeup: 1 }); comp.preset = "Мастеринг";
  const list = [eq, comp];
  if (trim < 0) { const tr = Plugins.newFx("stereo"); tr.params.gain = Math.max(-24, trim); tr.preset = "Мастеринг: рівень"; list.unshift(tr); }
  if (style === "wide") { const st = Plugins.newFx("stereo"); st.params.width = 1.2; st.preset = "Мастеринг"; list.push(st); }
  const lim = Plugins.newFx("limiter"); Object.assign(lim.params, { gain, ceiling: -1, release: 80 }); lim.preset = "Мастеринг";
  list.push(lim);
  return list;
}
function openMastering() {
  const modal = $("#master-modal");
  $("#master-body").innerHTML = `<p>Програма зведе ваш мікс, виміряє його гучність і налаштує ланцюжок на Master: еквалайзер → компресор → лімітер, щоб трек звучав повно і мав потрібну гучність для платформи. Поточні ефекти Master буде замінено (Ctrl+Z повертає).</p>
    <div class="gen-grid"><label>Куди викладатимете<select id="ms-target">${MASTER_TARGETS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
    <label>Характер<select id="ms-style">${Object.entries(MASTER_STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label></div>
    <div class="gen-run"><button class="btn primary" id="ms-go">Проаналізувати і налаштувати</button><span class="muted small" id="ms-info"></span></div>
    <div class="pbar" style="margin-top:10px"><div id="ms-bar"></div></div>`;
  $("#ms-go").onclick = async () => {
    const target = +$("#ms-target").value, style = $("#ms-style").value, info = $("#ms-info"), bar = $("#ms-bar");
    $("#ms-go").disabled = true;
    try {
      if (S.playing) stopPlay();
      info.textContent = "Зводжу мікс без мастерингу (до хвилини, залежно від кількості MIDI-доріжок)…"; bar.style.width = "10%";
      const vol0 = S.mix.master.vol; const raw = await renderMixQuick([]); const L0 = lufsOf(raw), P0 = lufsOf.lastPeak;
      let off = Math.max(-24, Math.min(18, target - L0 + (target > L0 ? 1 : 0)));
      let L1 = L0, pk = P0;
      for (let k = 0; k < 3; k++) {
        info.textContent = `Налаштовую гучність (крок ${k + 1}/3)…`; bar.style.width = (35 + k * 20) + "%";
        const out = await masterOver(raw, masterChain(style, off)); L1 = lufsOf(out); pk = lufsOf.lastPeak;
        if (Math.abs(target - L1) < 0.3) break;
        off = Math.max(-24, Math.min(18, off + (target - L1) * 0.95));
      }
      pushUndo("мастеринг");
      S.mix.master.fx = masterChain(style, off);
      afterEdit(true);
      bar.style.width = "100%";
      info.innerHTML = `Було <b>${L0.toFixed(1)} LUFS</b> (пік ${P0.toFixed(1)} дБ) → стало <b>${L1.toFixed(1)} LUFS</b>, пік ≈ ${Math.min(pk, -1).toFixed(1)} дБ. Ланцюжок — на Master (кнопка «Master» у панелі каналу).`;
      toast("Мастеринг налаштовано. Послухайте і порівняйте з референсом в Аналізаторі.");
    } catch (e) { info.textContent = "Помилка: " + e.message; }
    $("#ms-go").disabled = false;
  };
  modal.querySelector("[data-close]").onclick = () => modal.hidden = true;
  modal.hidden = false;
}
{
  const _rd = renderDock;
  renderDock = function () {
    _rd();
    if (S.dockMaster && S.dockTab === "fx") {
      const rack = $(".rack");
      if (rack && !$("#rack-master")) { const b = document.createElement("button"); b.className = "btn primary sm wide"; b.id = "rack-master"; b.textContent = "Мастеринг одним кліком…"; b.dataset.hint = "Налаштувати Master під Spotify, YouTube, TikTok тощо"; b.onclick = openMastering; rack.appendChild(b); }
    }
  };
}
$("#t-ana").onclick = openAnalyzer;
