"use strict";
const THIRD = (() => {
  const f = [];
  for (let x = 25; x <= 16e3; x *= Math.pow(2, 1 / 3)) f.push(x);
  return f;
})();
function thirdOctave(buf, maxSec = 60) {
  const N = 8192, sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const acc = new Float64Array(N / 2);
  const span = Math.min(L.length, Math.floor(maxSec * sr)), start = Math.max(0, Math.floor((L.length - span) / 2));
  const step = Math.max(N, Math.floor(span / 60));
  let fr = 0;
  for (let s = start; s + N < start + span; s += step) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = (L[s + i] + R[s + i]) * 0.5;
      e += v * v;
      re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    }
    if (e / N < 1e-6) continue;
    fft(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    fr++;
  }
  const out = THIRD.map((fc) => {
    const a = fc / Math.pow(2, 1 / 6), b = fc * Math.pow(2, 1 / 6);
    let s = 0, n = 0;
    for (let k = Math.max(1, Math.floor(a * N / sr)); k <= Math.min(N / 2 - 1, Math.ceil(b * N / sr)); k++) {
      s += acc[k];
      n++;
    }
    return 10 * Math.log10((n ? s / n : 0) + 1e-20);
  });
  const mean = out.slice(6, 26).reduce((a, b) => a + b, 0) / 20;
  return out.map((v) => v - mean);
}
const MEQ = { amount: 0.6, diff: null, mine: null, ref: null };
async function openMatchEq() {
  if (!ANA.ref || !ANA.ref.buf) {
    toast("Спершу завантажте референс: Аналізатор → «Референс…».", true);
    if (!ANA.open) openAnalyzer();
    return;
  }
  const modal = $("#meq-modal"), box = $("#meq-body");
  box.innerHTML = `<p class="muted">Порівнюю тембр вашого міксу з референсом «${escapeHtml(ANA.ref.name)}»…</p>`;
  modal.hidden = false;
  try {
    const L = arrEnd(), P = period(), span = Math.min(L, 60 / P), from = Math.max(0, L / 2 - span / 2);
    const fx = (S.mix.master.fx || []).filter((f) => !(f.type === "eq" && f.preset === "Під референс"));
    const mix = await renderMixQuick(fx, from, Math.min(L, from + span));
    MEQ.mine = thirdOctave(mix);
    MEQ.ref = thirdOctave(ANA.ref.buf);
  } catch (e) {
    box.innerHTML = `<p>Не вдалося проаналізувати: ${escapeHtml(e.message)}</p>`;
    return;
  }
  const raw = MEQ.ref.map((r, i) => r - MEQ.mine[i]);
  MEQ.diff = raw.map((_, i) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) {
      s += raw[k] * (k === i ? 2 : 1);
      n += k === i ? 2 : 1;
    }
    return Math.max(-8, Math.min(8, s / n));
  });
  const render = () => {
    box.innerHTML = `<p class="muted small">Сіра лінія — ваш мікс, бірюзова — референс, жовта — корекція, яку поставить еквалайзер на Master. Еквалайзер підганяє лише тембр (баланс низів, середини й верхів), а не гучність.</p>
      <canvas id="meq-cv" class="meq-cv"></canvas>
      <label class="rec-gain"><span>Сила підгонки</span><input type="range" id="meq-amt" min="0" max="100" step="1" value="${Math.round(MEQ.amount * 100)}"><b id="meq-amt-v">${Math.round(MEQ.amount * 100)}%</b></label>
      <p class="muted small">Порада: 40–70% — тембр наближається до референсу, але мікс зберігає власний характер. 100% — максимально схоже.</p>
      <div class="modal-actions"><button class="btn ghost" data-close2>Скасувати</button><button class="btn primary" id="meq-go">Поставити EQ на Master</button></div>`;
    drawMeq();
    $("#meq-amt").oninput = (e) => {
      MEQ.amount = e.target.value / 100;
      $("#meq-amt-v").textContent = e.target.value + "%";
      drawMeq();
    };
    box.querySelector("[data-close2]").onclick = () => modal.hidden = true;
    $("#meq-go").onclick = () => {
      pushUndo("EQ під референс");
      const f = Plugins.newFx("eq", null);
      f.preset = "Під референс";
      f.params.bands = meqBands();
      S.mix.master.fx = (S.mix.master.fx || []).filter((x) => !(x.type === "eq" && x.preset === "Під референс"));
      S.mix.master.fx.unshift(f);
      afterEdit(true);
      S.dockMaster = true;
      S.dockTab = "fx";
      S.selFx = f.id;
      S.dockOpen = true;
      renderDock();
      modal.hidden = true;
      toast("Еквалайзер «Під референс» стоїть першим на Master. Точки можна підправити вручну.");
    };
  };
  render();
}
function meqAt(f) {
  const x = Math.log2(f / THIRD[0]) * 3;
  const i = Math.max(0, Math.min(THIRD.length - 1, Math.floor(x))), t = Math.max(0, Math.min(1, x - i));
  const a = MEQ.diff[i], b = MEQ.diff[Math.min(THIRD.length - 1, i + 1)];
  return (a + (b - a) * t) * MEQ.amount;
}
function meqBands() {
  return [
    { type: "lowshelf", f: 70, g: +meqAt(55).toFixed(1), q: 0.7, on: true },
    { type: "peaking", f: 160, g: +meqAt(160).toFixed(1), q: 1, on: true },
    { type: "peaking", f: 400, g: +meqAt(400).toFixed(1), q: 1, on: true },
    { type: "peaking", f: 1000, g: +meqAt(1000).toFixed(1), q: 0.9, on: true },
    { type: "peaking", f: 2500, g: +meqAt(2500).toFixed(1), q: 1, on: true },
    { type: "peaking", f: 5000, g: +meqAt(5000).toFixed(1), q: 1, on: true },
    { type: "highshelf", f: 10e3, g: +meqAt(12e3).toFixed(1), q: 0.7, on: true }
  ];
}
function drawMeq() {
  const cv = $("#meq-cv");
  if (!cv) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#0e1015";
  c.fillRect(0, 0, w, h);
  const X = (f) => 30 + Math.log(f / 25) / Math.log(16e3 / 25) * (w - 40), Y = (db) => h / 2 - db / 24 * (h - 30);
  c.font = "10px sans-serif";
  for (const f of [50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4]) {
    c.strokeStyle = "#1f232c";
    c.beginPath();
    c.moveTo(X(f), 0);
    c.lineTo(X(f), h);
    c.stroke();
    c.fillStyle = "#5d6374";
    c.fillText(f >= 1e3 ? f / 1e3 + "k" : f, X(f) + 2, h - 4);
  }
  for (const db of [-12, -6, 0, 6, 12]) {
    c.strokeStyle = db ? "#1f232c" : "#3a3f4c";
    c.beginPath();
    c.moveTo(30, Y(db));
    c.lineTo(w, Y(db));
    c.stroke();
    c.fillStyle = "#5d6374";
    c.fillText(db, 4, Y(db) + 3);
  }
  const line = (arr, col, wd) => {
    c.strokeStyle = col;
    c.lineWidth = wd;
    c.beginPath();
    arr.forEach((v, i) => i ? c.lineTo(X(THIRD[i]), Y(v)) : c.moveTo(X(THIRD[i]), Y(v)));
    c.stroke();
  };
  line(MEQ.mine, "#5d6374", 1.5);
  line(MEQ.ref, "#4fd1c5", 1.5);
  c.strokeStyle = "#ffb547";
  c.lineWidth = 2.5;
  c.beginPath();
  for (let x = 30; x <= w; x += 2) {
    const f = 25 * Math.pow(16e3 / 25, (x - 30) / (w - 40));
    x === 30 ? c.moveTo(x, Y(meqAt(f))) : c.lineTo(x, Y(meqAt(f)));
  }
  c.stroke();
  c.lineWidth = 1;
}
const MCK = { open: false, mode: "off", nodes: null, raf: 0 };
const MONITORS = {
  off: ["Звичайно", "Без симуляції"],
  mono: ["Моно", "Обидва канали складаються в один — так звучить у колонках-«таблетках», телефоні, клубі. Якщо щось зникає — проблема з фазою або зайвою шириною"],
  phone: ["Телефон", "Динамік смартфона: без басу, вузька середина. Чи чути вокал і головну мелодію?"],
  earbuds: ["Навушники-вкладиші", "Дешеві вкладиші: мало низу, підкреслені верхи"],
  laptop: ["Ноутбук", "Динаміки ноутбука: зрізаний низ, горб на середині"],
  car: ["Машина", "Салон авто: гучний низ і бубніння 100–200 Гц, приглушені верхи. Чи не «гуде» бас?"],
  club: ["Клуб", "Великі колонки: дуже багато суббасу. Чи не забагато низу?"]
};
function mckChain(ctx, mode) {
  const input = ctx.createGain(), output = ctx.createGain();
  const nodes = [];
  const biq = (type, f, g = 0, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.gain.value = g;
    b.Q.value = q;
    nodes.push(b);
    return b;
  };
  let cur = input;
  const chain = (n) => {
    cur.connect(n);
    cur = n;
  };
  if (mode === "mono") {
    const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2), g = ctx.createGain();
    g.gain.value = 0.5;
    g.channelCount = 1;
    g.channelCountMode = "explicit";
    input.connect(sp);
    sp.connect(g, 0);
    sp.connect(g, 1);
    g.connect(mg, 0, 0);
    g.connect(mg, 0, 1);
    cur = mg;
  } else if (mode === "phone") {
    chain(biq("highpass", 380, 0, 1.1));
    chain(biq("highpass", 380, 0, 1.1));
    chain(biq("peaking", 1800, 5, 1));
    chain(biq("lowpass", 6500, 0, 0.9));
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    chain(mono);
  } else if (mode === "earbuds") {
    chain(biq("highpass", 70, 0, 0.7));
    chain(biq("lowshelf", 150, -4));
    chain(biq("highshelf", 5000, 3));
  } else if (mode === "laptop") {
    chain(biq("highpass", 180, 0, 0.9));
    chain(biq("highpass", 180, 0, 0.9));
    chain(biq("peaking", 1500, 4, 0.8));
    chain(biq("highshelf", 9000, -3));
  } else if (mode === "car") {
    chain(biq("lowshelf", 90, 6));
    chain(biq("peaking", 160, 4, 1));
    chain(biq("highshelf", 6000, -4));
  } else if (mode === "club") {
    chain(biq("lowshelf", 70, 8));
    chain(biq("peaking", 3000, -2, 0.8));
  }
  cur.connect(output);
  return { input, output };
}
function mckApply(mode) {
  const A = ensureCtx(), ctx = A.ctx;
  if (!MCK.split) {
    MCK.split = ctx.createChannelSplitter(2);
    MCK.anL = ctx.createAnalyser();
    MCK.anR = ctx.createAnalyser();
    MCK.anL.fftSize = MCK.anR.fftSize = 2048;
    MCK.split.connect(MCK.anL, 0);
    MCK.split.connect(MCK.anR, 1);
  }
  try {
    A.out.disconnect();
  } catch (e) {
  }
  if (MCK.chain) {
    try {
      MCK.chain.output.disconnect();
    } catch (e) {
    }
  }
  A.out.connect(MCK.split);
  if (mode === "off") {
    A.out.connect(ctx.destination);
    MCK.chain = null;
  } else {
    MCK.chain = mckChain(ctx, mode);
    A.out.connect(MCK.chain.input);
    MCK.chain.output.connect(ctx.destination);
  }
  MCK.mode = mode;
}
function openMixCheck() {
  const pnl = $("#mck");
  if (MCK.open) {
    MCK.open = false;
    pnl.hidden = true;
    mckApply("off");
    return;
  }
  MCK.open = true;
  pnl.hidden = false;
  mckApply(MCK.mode);
  pnl.innerHTML = `<div class="ana-head" id="mck-drag"><b>Перевірка міксу</b><span class="muted small">як звучатиме на різних пристроях</span><span class="spacer"></span><button class="x" id="mck-x">&times;</button></div>
    <div class="mck-modes">${Object.entries(MONITORS).map(([k, v]) => `<button class="chip ${MCK.mode === k ? "active" : ""}" data-mm="${k}" data-hint="${escapeHtml(v[1])}">${v[0]}</button>`).join("")}</div>
    <p class="muted small" id="mck-desc">${escapeHtml(MONITORS[MCK.mode][1])}</p>
    <div class="mck-meters"><canvas id="mck-vec" data-hint="Вектороскоп: вертикальна лінія — моно, широка «хмара» — стерео. Горизонтальна лінія — проблема з фазою"></canvas>
      <div class="mck-side"><div class="mck-lbl">Фаза (кореляція)</div><canvas id="mck-cor" data-hint="+1 — повністю моно-сумісно; 0 — дуже широко; менше 0 — частина звуку зникне в моно"></canvas><div class="mck-val" id="mck-cv">—</div>
      <div class="mck-lbl">Ширина стерео</div><div class="mck-val" id="mck-wd">—</div><div class="mck-lbl">Баланс Л/П</div><div class="mck-val" id="mck-bal">—</div><p class="muted small" id="mck-warn"></p></div></div>
    <p class="muted small">Симуляція діє лише на прослуховування — експорт не змінюється. Увімкніть відтворення й перемикайте режими.</p>`;
  dragPanel(pnl, $("#mck-drag"));
  $("#mck-x").onclick = openMixCheck;
  $$("[data-mm]", pnl).forEach((b) => b.onclick = () => {
    mckApply(b.dataset.mm);
    $$("[data-mm]", pnl).forEach((x) => x.classList.toggle("active", x === b));
    $("#mck-desc").textContent = MONITORS[b.dataset.mm][1];
  });
  if (!MCK.raf) mckLoop();
}
function mckLoop() {
  if (!MCK.open) {
    MCK.raf = 0;
    return;
  }
  const L = new Float32Array(2048), R = new Float32Array(2048);
  MCK.anL.getFloatTimeDomainData(L);
  MCK.anR.getFloatTimeDomainData(R);
  let lr = 0, ll = 0, rr = 0, ss = 0, mm = 0;
  for (let i = 0; i < L.length; i++) {
    lr += L[i] * R[i];
    ll += L[i] * L[i];
    rr += R[i] * R[i];
    const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2;
    mm += m * m;
    ss += s * s;
  }
  const act = ll + rr > 1e-6 && S.playing;
  const cor = act ? lr / Math.sqrt(ll * rr + 1e-12) : 1;
  MCK.cor = MCK.cor == null ? cor : MCK.cor * 0.9 + cor * 0.1;
  const cv = $("#mck-vec");
  if (cv) {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "rgba(14,16,21,.35)";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#232733";
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, h);
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();
    if (act) {
      const sc = Math.min(w, h) * 0.42 / Math.max(0.05, Math.sqrt(Math.max(ll, rr) / L.length) * 3);
      c.fillStyle = "rgba(79,209,197,.55)";
      for (let i = 0; i < L.length; i += 2) {
        const x = (L[i] - R[i]) * 0.707 * sc, y = (L[i] + R[i]) * 0.707 * sc;
        c.fillRect(w / 2 + x, h / 2 - y, 1.5, 1.5);
      }
    }
  }
  const cc = $("#mck-cor");
  if (cc) {
    const dpr = devicePixelRatio || 1, w = cc.clientWidth, h = cc.clientHeight;
    if (cc.width !== w * dpr) {
      cc.width = w * dpr;
      cc.height = h * dpr;
    }
    const c = cc.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#ff5d6c55");
    g.addColorStop(0.5, "#ffb54755");
    g.addColorStop(1, "#4ade8055");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const x = (MCK.cor + 1) / 2 * w;
    c.fillStyle = MCK.cor < 0 ? "#ff5d6c" : MCK.cor < 0.3 ? "#ffb547" : "#4ade80";
    c.fillRect(x - 2, 0, 4, h);
    $("#mck-cv").textContent = act ? (MCK.cor > 0 ? "+" : "") + MCK.cor.toFixed(2) : "—";
    const wd = act ? Math.sqrt(ss / (mm + 1e-12)) : 0;
    $("#mck-wd").textContent = act ? (wd < 0.1 ? "майже моно" : wd < 0.35 ? "помірна" : wd < 0.7 ? "широка" : "дуже широка") : "—";
    const bal = act ? 10 * Math.log10((ll + 1e-12) / (rr + 1e-12)) : 0;
    $("#mck-bal").textContent = act ? (Math.abs(bal) < 0.5 ? "по центру" : `${bal > 0 ? "лівіше" : "правіше"} на ${Math.abs(bal).toFixed(1)} дБ`) : "—";
    $("#mck-warn").textContent = act && MCK.cor < 0 ? "Увага: частина звуку в протифазі — у моно (телефон, клуб) вона зникне. Зменште ширину стерео-ефектів або хорусу." : act && Math.abs(bal) > 2 ? "Мікс помітно зміщений в один бік — перевірте панораму." : "";
  }
  MCK.raf = requestAnimationFrame(mckLoop);
}
const VERSIONS = {
  instrumental: ["Інструментал", "усе, крім вокалу", (t) => !["vocals", "backing"].includes(t.kind) && !/vocal|вокал/i.test(t.name)],
  acapella: ["А капела", "лише вокал", (t) => ["vocals", "backing"].includes(t.kind) || /vocal|вокал/i.test(t.name)],
  minus: ["Мінус для виступу", "без головного вокалу, з беками", (t) => t.kind !== "vocals"],
  drums: ["Стем: барабани", "", (t) => t.is_drums || t.kind === "drums" || t.kind === "percussion"],
  bass: ["Стем: бас", "", (t) => t.kind === "bass" || t.role === "bass"],
  music: ["Стем: музика", "усе мелодичне без вокалу, баса й барабанів", (t) => !t.is_drums && !["drums", "percussion", "bass", "vocals", "backing"].includes(t.kind) && t.role !== "bass"]
};
async function renderVersion(key, progress) {
  const [label, , inc] = VERSIONS[key];
  const SR = 44100, P = period(), len = Math.ceil((arrEnd() * P + 4) * SR);
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  await loadInstrumentBuffers();
  const bufs = {};
  for (const t of tracksAll()) if (t.has_audio && inc(t)) {
    try {
      bufs[t.id] = await fetchBuffer(ctx, `/api/project/${S.pid}/full/${srcKey(t)}`);
    } catch (e) {
    }
  }
  buildOfflineGraph(ctx, key === "drums" || key === "bass" || key === "music" ? [] : S.mix.master.fx, 0, arrEnd(), (t) => bufs[t.id], S.audio.ibuf, { forSidechain: true, include: inc });
  progress && progress(`Версія: ${label}…`);
  const out = await ctx.startRendering();
  let pk = 0;
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let k = 0; k < d.length; k++) pk = Math.max(pk, Math.abs(d[k]));
  }
  if (pk > 0.98) for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let k = 0; k < d.length; k++) d[k] *= 0.89 / pk;
  }
  if (pk < 1e-4) return false;
  const fd = new FormData();
  fd.append("file", DSP.encodeWav(out), "x.wav");
  fd.append("name", `Version - ${label}`);
  await fetch(`/api/project/${S.pid}/render`, { method: "POST", body: fd });
  return true;
}
(function exportVersionsUI() {
  const btn = $("#export-btn");
  if (!btn) return;
  btn.addEventListener("click", () => setTimeout(() => {
    const body = $("#ex-body"), act = body && body.querySelector(".ex-actions");
    if (!act || body.querySelector(".ex-vers")) return;
    const box = document.createElement("div");
    box.className = "ex-vers";
    box.innerHTML = `<div class="ex-vers-h"><b>Додаткові версії</b> <span class="muted small">— окремі WAV у папці експорту</span></div>${Object.entries(VERSIONS).map(([k, v]) => `<label class="chk"><input type="checkbox" data-ver="${k}" ${k === "instrumental" ? "checked" : ""}> ${v[0]}${v[1] ? ` <span class="muted small">(${v[1]})</span>` : ""}</label>`).join("")}`;
    act.before(box);
    const go = $("#ex-go");
    go.addEventListener("click", async (e) => {
      const sel = $$("[data-ver]", box).filter((x) => x.checked).map((x) => x.dataset.ver);
      if (!sel.length || go.dataset.verDone) return;
      e.stopImmediatePropagation();
      go.disabled = true;
      $("#ex-progress").hidden = false;
      const prog = (msg, f) => {
        $("#ex-step").textContent = msg;
        if (f != null) $("#ex-bar").style.width = f * 100 + "%";
      };
      try {
        const doRender = $("#ex-render").checked || $("#ex-mix").checked;
        if (doRender) await renderAll((m, f) => prog(m, f * 0.7));
        else await api.post(`/api/project/${S.pid}/render/clear`);
        for (const [i, k] of sel.entries()) {
          prog(`Версія: ${VERSIONS[k][0]}…`, 0.7 + 0.25 * i / sel.length);
          await renderVersion(k);
        }
        prog("Записую пісню, доріжки, MIDI і семпли…", 0.97);
        const r = await api.post(`/api/project/${S.pid}/export`, { use_render: true, mixdown: $("#ex-mix").checked, edited: $("#ex-midi").checked ? editedMidi() : null });
        showExportDone(r);
      } catch (err) {
        $("#ex-title").textContent = "Помилка експорту";
        $("#ex-body").innerHTML = `<p>${escapeHtml(err.message)}</p>`;
      }
    }, true);
  }, 0));
})();
const KB = { access: null, inputs: [], held: new Map(), rec: null, typing: false, oct: 4, vel: 100 };
const QWERTY = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
function kbTarget() {
  const t = S.sel && findT(S.sel);
  return t || null;
}
function kbOn(note, vel) {
  const t = kbTarget();
  if (!t || !S.B) return;
  const A = ensureCtx();
  A.ctx.resume();
  const st = A.strips[t.id];
  if (!st) return;
  const m = mt(t.id);
  st.mIn.gain.value = 1;
  const now = A.ctx.currentTime;
  const g = A.ctx.createGain();
  g.connect(st.mIn);
  DSP.playNote(A.ctx, g, m.inst, note, vel / 127, now, 4, A.ibuf);
  KB.held.set(note, { g, t0: now, beat: S.playing ? curBeat() : null, vel });
}
function kbOff(note) {
  const h = KB.held.get(note);
  if (!h) return;
  KB.held.delete(note);
  const A = S.audio, now = A.ctx.currentTime;
  h.g.gain.setTargetAtTime(0, now, 0.05);
  setTimeout(() => {
    try {
      h.g.disconnect();
    } catch (e) {
    }
  }, 600);
  if (KB.rec && h.beat != null && S.playing) {
    const end = curBeat();
    KB.rec.notes.push([h.beat, Math.max(0.05, end - h.beat), note, h.vel]);
  }
  applyGains();
}
async function kbMidiInit() {
  if (!navigator.requestMIDIAccess) return false;
  try {
    KB.access = await navigator.requestMIDIAccess();
  } catch (e) {
    return false;
  }
  const bind = () => {
    KB.inputs = [...KB.access.inputs.values()];
    for (const inp of KB.inputs) inp.onmidimessage = (e) => {
      const [st, d1, d2] = e.data, cmd = st & 240;
      if (cmd === 144 && d2 > 0) kbOn(d1, d2);
      else if (cmd === 128 || cmd === 144 && d2 === 0) kbOff(d1);
    };
    const el = $("#kb-dev");
    if (el) el.textContent = KB.inputs.length ? "MIDI: " + KB.inputs.map((i) => i.name).join(", ") : "MIDI-клавіатуру не знайдено";
  };
  KB.access.onstatechange = bind;
  bind();
  return true;
}
function openKeyboard() {
  const pnl = $("#kbp");
  if (!pnl.hidden) {
    pnl.hidden = true;
    KB.typing = false;
    return;
  }
  pnl.hidden = false;
  KB.typing = true;
  const keys = [];
  for (let n = 0; n < 24; n++) keys.push(n);
  pnl.innerHTML = `<div class="ana-head" id="kbp-drag"><b>Клавіатура</b><span class="muted small" id="kb-dev">шукаю MIDI…</span><span class="spacer"></span><button class="x" id="kbp-x">&times;</button></div>
    <div class="kb-keys" id="kb-keys">${keys.map((n) => {
      const pc = n % 12, black = [1, 3, 6, 8, 10].includes(pc);
      return `<div class="kb-k ${black ? "b" : "w"}" data-kn="${n}"><span>${black ? "" : NOTE_NAMES[pc] + (KB.oct + Math.floor(n / 12))}</span></div>`;
    }).join("")}</div>
    <div class="kb-row"><button class="btn ghost sm" id="kb-od">Октава −</button><b id="kb-oct">C${KB.oct}</b><button class="btn ghost sm" id="kb-ou">Октава +</button>
      <button class="rec-btn sm ${KB.rec ? "on" : ""}" id="kb-rec" data-hint="Запис нот: увімкніть, відтворення стартує — грайте. Ноти додадуться у вибрану доріжку"><i></i></button>
      <span class="muted small">Грає інструментом вибраної доріжки. Комп'ютерна клавіатура: A W S E D F T G Y H U J K — ноти, Z / X — октава.</span></div>`;
  dragPanel(pnl, $("#kbp-drag"));
  $("#kbp-x").onclick = openKeyboard;
  const base = () => 12 * (KB.oct + 1);
  $$("[data-kn]", pnl).forEach((k) => {
    k.onpointerdown = (e) => {
      k.setPointerCapture(e.pointerId);
      const n = base() + +k.dataset.kn;
      k.classList.add("on");
      kbOn(n, KB.vel);
      k.onpointerup = k.onpointercancel = () => {
        k.classList.remove("on");
        kbOff(n);
      };
    };
  });
  const setOct = (d) => {
    KB.oct = Math.max(0, Math.min(7, KB.oct + d));
    openKeyboard();
    openKeyboard();
  };
  $("#kb-od").onclick = () => setOct(-1);
  $("#kb-ou").onclick = () => setOct(1);
  $("#kb-rec").onclick = () => kbToggleRec();
  kbMidiInit().then((ok) => {
    if (!ok && $("#kb-dev")) $("#kb-dev").textContent = "MIDI недоступний — грайте мишкою або клавіатурою комп'ютера";
  });
}
function kbToggleRec() {
  const t = kbTarget();
  if (KB.rec) {
    const rec = KB.rec;
    KB.rec = null;
    stopPlay();
    const tt = findT(rec.tid);
    if (rec.notes.length && tt) {
      pushUndo("запис нот");
      const notes = editableNotes(tt);
      const q = S.snap || 0;
      for (const n of rec.notes) notes.push([q ? Math.round(n[0] / (q / 2)) * (q / 2) : n[0], n[1], n[2], n[3]]);
      notes.sort((a, b) => a[0] - b[0]);
      notesChanged();
      toast(`Записано ${rec.notes.length} нот у «${tt.name}». Їх можна поправити у вкладці «Ноти».`);
    }
    const b = $("#kb-rec");
    if (b) b.classList.remove("on");
    return;
  }
  if (!t) return toast("Виберіть доріжку, у яку записувати ноти.", true);
  if (modeOf(t) === "audio") {
    mt(t.id).mode = "midi";
    applyGains();
    renderHeads();
  }
  KB.rec = { tid: t.id, notes: [] };
  const b = $("#kb-rec");
  if (b) b.classList.add("on");
  if (!S.playing) play();
  toast("Запис нот: грайте. Ще раз червона кнопка — зупинити.");
}
document.addEventListener("keydown", (e) => {
  if (!KB.typing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
  const k = e.key.toLowerCase();
  if (k === "z" || k === "x") {
    KB.oct = Math.max(0, Math.min(7, KB.oct + (k === "z" ? -1 : 1)));
    const o = $("#kb-oct");
    if (o) o.textContent = "C" + KB.oct;
    e.stopImmediatePropagation();
    return;
  }
  if (k in QWERTY) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const n = 12 * (KB.oct + 1) + QWERTY[k];
    if (!KB.held.has(n)) kbOn(n, KB.vel);
    const el = document.querySelector(`[data-kn="${QWERTY[k]}"]`);
    if (el) el.classList.add("on");
  }
}, true);
document.addEventListener("keyup", (e) => {
  if (!KB.typing) return;
  const k = e.key.toLowerCase();
  if (k in QWERTY) {
    kbOff(12 * (KB.oct + 1) + QWERTY[k]);
    const el = document.querySelector(`[data-kn="${QWERTY[k]}"]`);
    if (el) el.classList.remove("on");
  }
}, true);
const MARK_COLORS = ["#ffb547", "#4fd1c5", "#ec4899", "#a78bfa", "#4ade80", "#60a5fa"];
function markers() {
  return S.mix && S.mix.markers || [];
}
function addMarker(beat, text) {
  if (!S.mix) return;
  pushUndo("маркер");
  S.mix.markers = markers();
  const n = S.mix.markers.length;
  S.mix.markers.push({ id: uid("mk"), beat: Math.max(0, beat), text: text || `Маркер ${n + 1}`, color: MARK_COLORS[n % MARK_COLORS.length] });
  S.mix.markers.sort((a, b) => a.beat - b.beat);
  saveMix();
  draw();
}
const _drawTopMk = drawTop;
drawTop = function() {
  _drawTopMk();
  if (!markers().length) return;
  const ctx = cvTop.getContext("2d"), dpr = devicePixelRatio || 1, w = cvTop.width / dpr;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "600 11px " + getComputedStyle(document.body).fontFamily;
  for (const mk of markers()) {
    const x = beatToX(mk.beat);
    if (x < -200 || x > w) continue;
    const tw = ctx.measureText(mk.text).width + 14;
    mk._x0 = x;
    mk._x1 = x + tw;
    ctx.fillStyle = mk.color;
    ctx.fillRect(x, 0, 2, 22);
    ctx.fillStyle = mk.color + "dd";
    ctx.beginPath();
    ctx.moveTo(x + 2, 2);
    ctx.lineTo(x + tw, 2);
    ctx.lineTo(x + tw - 5, 9);
    ctx.lineTo(x + tw, 16);
    ctx.lineTo(x + 2, 16);
    ctx.fill();
    ctx.fillStyle = "#14161b";
    ctx.fillText(mk.text, x + 6, 13);
  }
  ctx.restore();
};
function markerAt(e) {
  const r = $(".tl-top").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (y > 20) return null;
  return markers().find((m) => x >= m._x0 - 3 && x <= m._x1) || null;
}
(function markerEvents() {
  const top = $(".tl-top");
  if (!top) return;
  top.addEventListener("mousedown", (e) => {
    const mk = markerAt(e);
    if (!mk || e.button !== 0) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const r = top.getBoundingClientRect();
    const b0 = mk.beat, x0 = e.clientX;
    let moved = false, snap = null;
    const mv = (ev) => {
      if (Math.abs(ev.clientX - x0) > 3) {
        if (!moved) snap = JSON.stringify(S.mix);
        moved = true;
        mk.beat = Math.max(0, snapB(b0 + (ev.clientX - x0) / S.ppb, ev.altKey));
        draw();
      }
    };
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
      if (moved) {
        S.mix.markers.sort((a, b) => a.beat - b.beat);
        saveMix();
      } else seek(mk.beat);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, true);
  top.addEventListener("dblclick", (e) => {
    const mk = markerAt(e);
    if (!mk) return;
    e.stopImmediatePropagation();
    const t = (prompt("Текст маркера (нотатка):", mk.text) || "").trim();
    if (!t) return;
    mk.text = t.slice(0, 60);
    saveMix();
    draw();
  }, true);
  top.addEventListener("contextmenu", (e) => {
    const mk = markerAt(e);
    if (!mk) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    menu(e, [["Перейти сюди", () => seek(mk.beat)], ["Перейменувати…", () => {
      const t = (prompt("Текст маркера:", mk.text) || "").trim();
      if (t) {
        mk.text = t.slice(0, 60);
        saveMix();
        draw();
      }
    }], ["Колір", () => {
      mk.color = MARK_COLORS[(MARK_COLORS.indexOf(mk.color) + 1) % MARK_COLORS.length];
      saveMix();
      draw();
    }], null, ["Видалити маркер", () => {
      pushUndo("маркер");
      S.mix.markers = markers().filter((m) => m !== mk);
      saveMix();
      draw();
    }, "danger"]]);
  }, true);
})();
function jumpMarker(dir) {
  const ms = markers();
  if (!ms.length) return;
  const b = S.playBeat;
  const t = dir > 0 ? ms.find((m) => m.beat > b + 1e-3) : [...ms].reverse().find((m) => m.beat < b - 1e-3);
  if (t) seek(t.beat);
}
document.addEventListener("keydown", (e) => {
  if (S.view !== "project" || typingIn(e.target)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
    e.preventDefault();
    addMarker(S.playBeat);
  } else if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    e.preventDefault();
    jumpMarker(e.key === "ArrowRight" ? 1 : -1);
  }
});
S.frozen = S.frozen || {};
async function freezeTrack(t) {
  const A = ensureCtx(), SR = A.ctx.sampleRate, P = period(), len = Math.ceil((arrEnd() * P + 2) * SR);
  toast(`Заморожую «${t.name}»…`);
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  await loadInstrumentBuffers();
  const m = mt(t.id);
  const st = new DSP.Strip(ctx, ctx.destination, fxEnv());
  st.setFx(m.fx);
  st.fader.gain.value = 1;
  scheduleTrackSources(ctx, t, m, st, 0, arrEnd(), (x) => A.buffers[srcKey(x)], A.ibuf);
  (m.fx || []).forEach((fx, i) => {
    const n = st.nodes[i], src = fx.type === "duck" && fx.on && findT(fx.params.source);
    if (!n || !n.sc || !src) return;
    const s2 = new DSP.Strip(ctx, ctx.destination, fxEnv());
    s2.setFx(mt(src.id).fx);
    s2.fader.gain.value = 0;
    scheduleTrackSources(ctx, src, mt(src.id), s2, 0, arrEnd(), (x) => A.buffers[srcKey(x)], A.ibuf);
    s2.post.connect(n.sc);
  });
  S.frozen[t.id] = await ctx.startRendering();
  stopPlay();
  rebuildStrips();
  renderHeads();
  renderDock();
  toast(`«${t.name}» заморожено: ефекти й інструмент більше не навантажують процесор. Щоб змінити — «Розморозити».`);
}
function unfreezeTrack(t) {
  delete S.frozen[t.id];
  stopPlay();
  rebuildStrips();
  renderHeads();
  renderDock();
}
const _rebuildFz = rebuildStrips;
rebuildStrips = function() {
  _rebuildFz();
  const A = S.audio;
  if (!A || !S.frozen) return;
  for (const id of Object.keys(S.frozen)) if (A.strips[id] && A.strips[id].fxList.length) A.strips[id].setFx([]);
};
const _applyGainsFz = applyGains;
applyGains = function() {
  _applyGainsFz();
  const A = S.audio;
  if (!A || !S.frozen) return;
  for (const id of Object.keys(S.frozen)) {
    const st = A.strips[id];
    if (!st) continue;
    st.aIn.gain.value = 1;
    st.mIn.gain.value = 0;
  }
};
const _renderHeadsFz = renderHeads;
renderHeads = function() {
  _renderHeadsFz();
  const heads = $$(".lane-head"), list = tracksAll();
  heads.forEach((h, i) => {
    const t = list[i];
    if (!t) return;
    if (S.frozen && S.frozen[t.id]) {
      h.classList.add("frozen");
      const btn = h.querySelector(".lh-btn.src");
      if (btn) {
        btn.textContent = "❄";
        btn.dataset.hint = "Доріжка заморожена — грає готовий запис. Меню ⋯ → Розморозити";
      }
      const sub = h.querySelector(".lh-sub");
      if (sub) sub.textContent = "заморожено · " + sub.textContent;
    }
  });
};
const _openProjectFz = openProject;
openProject = async function(pid) {
  S.frozen = {};
  return _openProjectFz(pid);
};
(function headMenuExtras() {
  document.addEventListener("click", (e) => {
    const more = e.target.closest && e.target.closest(".lh-more");
    if (!more) return;
    setTimeout(() => {
      const m = $("#ctxmenu");
      const h = more.closest(".lane-head");
      if (!m || !h) return;
      const idx = $$(".lane-head").indexOf(h), t = tracksAll()[idx];
      if (!t) return;
      const b = document.createElement("button");
      const fz = S.frozen && S.frozen[t.id];
      b.textContent = fz ? "Розморозити" : "Заморозити (менше навантаження)";
      b.onclick = () => {
        closeMenu();
        fz ? unfreezeTrack(t) : freezeTrack(t);
      };
      m.appendChild(b);
    }, 0);
  });
})();
(function finishMenus() {
  const tools = MENUS["Інструменти"], view = MENUS["Вигляд"], edit = MENUS["Правка"];
  MENUS["Інструменти"] = () => tools().concat([null, ["EQ під референс…", needProject(openMatchEq)], ["Перевірка міксу (моно, телефон, машина…)", needProject(openMixCheck)], ["Клавіатура / MIDI-клавіатура", needProject(openKeyboard)]]);
  MENUS["Правка"] = () => edit().concat([null, ["Видалені доріжки…", needProject(openRemovedTracks)], null, ["Маркер у позиції курсору  (Ctrl+M)", needProject(() => addMarker(S.playBeat))], ["Наступний маркер  (Alt+→)", needProject(() => jumpMarker(1))], ["Попередній маркер  (Alt+←)", needProject(() => jumpMarker(-1))]]);
  MENUS["Вигляд"] = () => view();
  const anaBtn = $("#t-ana");
  const tb = document.createElement("button");
  tb.className = "chip-toggle";
  tb.id = "t-kb";
  tb.dataset.hint = "Клавіатура: грати й записувати ноти мишкою, клавіатурою комп'ютера або MIDI-клавіатурою";
  tb.textContent = "Клавіші";
  tb.onclick = () => openKeyboard();
  const ck = document.createElement("button");
  ck.className = "chip-toggle";
  ck.id = "t-mck";
  ck.dataset.hint = "Перевірка міксу: як звучатиме в моно, на телефоні, у навушниках, у машині; фаза й ширина стерео";
  ck.textContent = "Перевірка";
  ck.onclick = () => openMixCheck();
  if (anaBtn) {
    anaBtn.after(ck);
    ck.after(tb);
  }
})();
function meqInject() {
  const host = $("#ana .ana-ref");
  if (host && !host.querySelector("#meq-open")) {
    const b = document.createElement("button");
    b.className = "btn ghost sm";
    b.id = "meq-open";
    b.textContent = "EQ під референс";
    b.dataset.hint = "Підігнати тембр міксу під референс: програма порівняє частоти й поставить еквалайзер на Master";
    b.onclick = openMatchEq;
    host.appendChild(b);
  }
}
new MutationObserver(meqInject).observe($("#ana"), { childList: true, subtree: true });
