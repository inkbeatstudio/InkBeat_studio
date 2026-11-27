"use strict";
const VH_VOICES = [["3u", "Терція вище", 2], ["3d", "Терція нижче", -2], ["5u", "Квінта вище", 4], ["6d", "Секста нижче", -5], ["8d", "Октава нижче", "o-12"], ["8u", "Октава вище", "o12"]];
async function vhProcess(id, notes, onp) {
  const t = findT(id), T = mt(id);
  const r = await api.post(`/api/project/${S.pid}/process`, { base: baseId(t), source: T.source, op: "harmony", params: { notes } });
  let j;
  for (;;) { await new Promise((res) => setTimeout(res, 500)); j = await api.get(`/api/process/${r.job}`); if (onp) onp(j.progress); if (j.status !== "running") break; }
  if (j.status === "error") throw new Error(j.error);
  T.source = j.result.vid;
}
function openVocalHarmony(t) {
  if (!t || !t.has_audio) return toast("Гармонію можна зробити для доріжки із записом голосу.", true);
  const ns = trackNotes(t);
  if (!ns.length) return toast("У доріжці немає розпізнаних нот мелодії. Спершу увімкніть розпізнавання нот (вкладка «Ноти»).", true);
  const k = hmKey();
  const m = careModalBox("vh-modal", "Вокальна гармонія", `<p class="muted">Програма робить бек-голоси з вашого запису «${escapeHtml(t.name)}»: кожна нота мелодії зсувається на інтервал у гамі ${escapeHtml(NOTE_NAMES[k.tonic] + " " + HM_SCALES[k.scale][0].toLowerCase())}, тож гармонія звучить правильно. Кожен голос — окрема доріжка-копія, її можна стишити, рознести в панорамі чи вимкнути.</p>
    <div class="vh-voices">${VH_VOICES.map(([key, l], i) => `<label class="chk"><input type="checkbox" data-v="${key}" ${i === 0 || i === 2 ? "checked" : ""}> ${escapeHtml(l)}</label>`).join("")}</div>
    <div class="mel-grid"><label data-hint="Гучність бек-голосів відносно основного">Гучність, дБ <input type="range" id="vh-vol" min="-18" max="0" step="1" value="-7"></label>
      <label data-hint="Рознести голоси ліворуч і праворуч">Ширина <input type="range" id="vh-pan" min="0" max="1" step="0.05" value="0.5"></label>
      <label class="chk" data-hint="Лише виділений цикл замість усієї пісні"><input type="checkbox" id="vh-loop" ${S.loop && S.loop.b > S.loop.a ? "" : "disabled"}> лише виділений цикл</label></div>
    <div class="pbar"><div id="vh-bar" style="width:0%"></div></div><p class="muted small" id="vh-st">Обробка займає приблизно стільки часу, скільки триває пісня, на кожен голос.</p>
    <div class="modal-actions"><button class="btn ghost" data-k="x">Скасувати</button><button class="btn primary" id="vh-go">Створити гармонію</button></div>`);
  $("#vh-go", m).onclick = async () => {
    const pick = VH_VOICES.filter(([key]) => $(`[data-v="${key}"]`, m).checked);
    if (!pick.length) return toast("Виберіть хоча б один голос.", true);
    const P = period(), pad = S.B.timing.pad, loop = $("#vh-loop", m).checked && S.loop;
    const sc = k.sc, ton = k.tonic;
    const step = (p, d) => { const sp = hmSnapP(p); return hmP(hmDeg(sp, sc, ton) + d, sc, ton) + (p - sp); };
    const vol = +$("#vh-vol", m).value, width = +$("#vh-pan", m).value;
    $("#vh-go", m).disabled = true;
    pushUndo("вокальна гармонія");
    try {
      let i = 0;
      for (const [key, label, d] of pick) {
        i++;
        $("#vh-st", m).textContent = `Голос «${label}» (${i} з ${pick.length})…`;
        const notes = ns.filter((n) => !loop || (n[0] >= S.loop.a - 0.01 && n[0] < S.loop.b)).map((n) => {
          const semis = typeof d === "string" ? +d.slice(1) : step(n[2], d) - n[2];
          return [+(n[0] * P - pad).toFixed(4), +((n[0] + n[1]) * P - pad).toFixed(4), semis];
        });
        duplicateTrack(t);
        const id = S.sel, cl = S.mix.clones.find((c) => c.id === id);
        if (cl) cl.name = `${t.name} · ${label}`;
        const tm = mt(id);
        tm.vol = (mt(t.id).vol || 0) + vol;
        tm.pan = pick.length === 1 ? 0 : ((i - 1) / (pick.length - 1) * 2 - 1) * width;
        tm.mode = "audio";
        await vhProcess(id, notes, (p) => { $("#vh-bar", m).style.width = Math.round(((i - 1) + p) / pick.length * 100) + "%"; });
      }
      S.versions = await api.get(`/api/project/${S.pid}/versions`);
      _tracksKey = "";
      await loadAudio();
      afterEdit(true);
      m.hidden = true;
      toast(`Гармонію створено: ${pick.length} голос(и). Послухайте разом з основним вокалом.`);
    } catch (e) {
      afterEdit(true);
      $("#vh-st", m).textContent = "Не вдалося: " + e.message;
      $("#vh-go", m).disabled = false;
    }
  };
}
const CHM = { on: false, stream: null, ctx: null, an: null, raf: 0, hist: [], cur: null, rec: false, log: [] };
const CH_TEMPL = (() => {
  const out = [];
  for (let r = 0; r < 12; r++) for (const [k, iv, w] of [["", [0, 4, 7], 1], ["m", [0, 3, 7], 1], ["7", [0, 4, 7, 10], 0.92], ["m7", [0, 3, 7, 10], 0.92], ["maj7", [0, 4, 7, 11], 0.9], ["sus4", [0, 5, 7], 0.85], ["dim", [0, 3, 6], 0.85]]) {
    const v = new Array(12).fill(0);
    iv.forEach((i, j) => { v[(r + i) % 12] = j === 0 ? 1.2 : 1; });
    out.push({ root: r, kind: k, v, w });
  }
  return out;
})();
function chChroma(an, sr) {
  const N = an.frequencyBinCount, buf = new Float32Array(N);
  an.getFloatFrequencyData(buf);
  const c = new Array(12).fill(0);
  let tot = 0;
  for (let i = 2; i < N; i++) {
    const f = i * sr / (N * 2);
    if (f < 60 || f > 2200) continue;
    const mag = Math.pow(10, buf[i] / 20);
    const midi = 69 + 12 * Math.log2(f / 440), pc = ((Math.round(midi) % 12) + 12) % 12;
    c[pc] += mag * mag;
    tot += mag * mag;
  }
  return { c, tot };
}
function chMatch(c) {
  const norm = Math.sqrt(c.reduce((s, x) => s + x * x, 0)) || 1;
  let best = null, bs = -1;
  for (const t of CH_TEMPL) {
    let d = 0, nn = 0;
    for (let i = 0; i < 12; i++) { d += c[i] * t.v[i]; nn += t.v[i] * t.v[i]; }
    const sc = d / norm / Math.sqrt(nn) * t.w;
    if (sc > bs) { bs = sc; best = t; }
  }
  return { ...best, score: bs };
}
async function openChordMic() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const m = careModalBox("chm-modal", "Акорди з мікрофона", `<p class="muted">Грайте акорди на гітарі, піаніно чи укулеле — програма впізнає їх наживо. Увімкніть «Записувати» і відтворення: кожен такт отримає акорд, який ви зіграли, — так можна швидко «зняти» гармонію своєї пісні.</p>
    <div class="chm"><div class="chm-big" id="chm-name">—</div><div class="chm-conf"><i id="chm-conf"></i></div><canvas id="chm-cv" width="360" height="70"></canvas></div>
    <div class="arr-row"><label data-hint="Як часто писати акорд">Крок <select id="chm-step"><option value="1">кожен такт</option><option value="0.5">півтакту</option></select></label>
      <label class="chk" data-hint="Писати впізнані акорди в рядок акордів під час відтворення"><input type="checkbox" id="chm-rec"> Записувати під час відтворення</label><span class="muted small" id="chm-info"></span></div>
    <div class="modal-actions"><button class="btn ghost" id="chm-stop">Закрити</button><button class="btn primary" id="chm-save" disabled>Записати впізнані акорди в пісню</button></div>`);
  try {
    CHM.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    $("#chm-info", m).textContent = "Немає доступу до мікрофона: " + e.message;
    return;
  }
  CHM.ctx = ensureCtx().ctx;
  CHM.ctx.resume();
  const src = CHM.ctx.createMediaStreamSource(CHM.stream);
  CHM.an = CHM.ctx.createAnalyser();
  CHM.an.fftSize = 16384;
  CHM.an.smoothingTimeConstant = 0.6;
  src.connect(CHM.an);
  CHM.hist = []; CHM.log = [];
  const close = () => { cancelAnimationFrame(CHM.raf); if (CHM.stream) CHM.stream.getTracks().forEach((x) => x.stop()); CHM.stream = null; m.hidden = true; };
  m.onclick = (e) => { if (e.target === m || e.target.dataset.k === "x") close(); };
  $("#chm-stop", m).onclick = close;
  $("#chm-rec", m).onchange = (e) => { CHM.rec = e.target.checked; if (CHM.rec) { CHM.log = []; if (!S.playing) play(); } };
  $("#chm-save", m).onclick = () => {
    if (!CHM.log.length) return;
    pushUndo("акорди з мікрофона");
    ownArrangement();
    const stepB = +$("#chm-step", m).value * S.B.timing.bpb;
    const cells = new Map();
    for (const e of CHM.log) { const k = Math.floor(tmM(e.b) / stepB); const a = cells.get(k) || {}; const key = e.root + ":" + e.kind; a[key] = (a[key] || 0) + e.score; cells.set(k, a); }
    const items = [];
    for (const [k, votes] of [...cells.entries()].sort((x, y) => x[0] - y[0])) {
      const [best] = Object.entries(votes).sort((x, y) => y[1] - x[1]);
      const [root, kind] = best[0].split(":");
      const a = tmU(k * stepB), b = tmU((k + 1) * stepB), last = items[items.length - 1];
      if (last && last.root === +root && last.kind === kind && Math.abs(last.end - a) < 1e-3) last.end = b;
      else items.push({ start: a, end: b, root: +root, kind, label: chordName(+root, kind), user: true });
    }
    const a0 = items[0].start, b0 = items[items.length - 1].end;
    S.mix.chords = S.mix.chords.filter((c) => c.end <= a0 + 1e-3 || c.start >= b0 - 1e-3).concat(items).sort((x, y) => x.start - y.start);
    hmAfterChords(`Записано акордів: ${items.length}.`);
    close();
  };
  const cv = $("#chm-cv", m);
  const loop = () => {
    if (!CHM.stream) return;
    const { c, tot } = chChroma(CHM.an, CHM.ctx.sampleRate);
    CHM.hist.push(c);
    if (CHM.hist.length > 12) CHM.hist.shift();
    const avg = new Array(12).fill(0);
    CHM.hist.forEach((h) => h.forEach((v, i) => { avg[i] += v; }));
    const g = cv.getContext("2d");
    g.fillStyle = "#0e1014"; g.fillRect(0, 0, 360, 70);
    const mx = Math.max(...avg) || 1;
    avg.forEach((v, i) => { g.fillStyle = "#4fd1c5"; g.fillRect(i * 30 + 3, 56 - v / mx * 50, 24, v / mx * 50); g.fillStyle = "#8b91a3"; g.font = "9px sans-serif"; g.fillText(NOTE_NAMES[i], i * 30 + 6, 68); });
    const quiet = tot < 1e-7;
    const r = quiet ? null : chMatch(avg);
    const name = $("#chm-name", m), conf = $("#chm-conf", m);
    if (r && r.score > 0.62) {
      name.textContent = chordName(r.root, r.kind);
      conf.style.width = Math.round(Math.min(1, (r.score - 0.6) / 0.35) * 100) + "%";
      if (CHM.rec && S.playing) { CHM.log.push({ b: S.playBeat, root: r.root, kind: r.kind, score: r.score }); $("#chm-info", m).textContent = `Зібрано ${CHM.log.length} знімків, такт ${hmBarAt(S.playBeat)}`; $("#chm-save", m).disabled = false; }
    } else { name.textContent = quiet ? "тиша" : "…"; conf.style.width = "0%"; }
    CHM.raf = requestAnimationFrame(loop);
  };
  loop();
}
const SB = { list: [], q: "", kind: "all", audio: null };
function sbFit(s) {
  const bpm = S.B ? S.B.timing.bpm : 120, k = S.B ? hmKey() : null;
  let factor = 1, semis = 0;
  if (s.bpm && s.dur >= 1.5) { let sb = s.bpm; while (sb < bpm * 0.7) sb *= 2; while (sb > bpm * 1.4) sb /= 2; factor = sb / bpm; }
  if (s.key && k && (s.kind === "note" || s.dur >= 1.5)) { semis = ((k.tonic - s.key.tonic) % 12 + 12) % 12; if (semis > 6) semis -= 12; if (s.key.mode !== (k.minor ? "minor" : "major")) { semis = (((k.tonic + (k.minor ? 3 : -3)) - s.key.tonic) % 12 + 12) % 12; if (semis > 6) semis -= 12; } }
  else if (s.root != null && k && s.kind === "note") { semis = ((k.tonic - s.root) % 12 + 12) % 12; if (semis > 6) semis -= 12; }
  return { factor: +factor.toFixed(4), semis };
}
function sbPlay(url) {
  if (SB.audio) { SB.audio.pause(); SB.audio = null; }
  SB.audio = new Audio(url);
  SB.audio.play().catch(() => {});
}
async function sbRender(m) {
  const k = S.B ? hmKey() : null;
  const list = SB.list.filter((s) => (!SB.q || s.name.toLowerCase().includes(SB.q)) && (SB.kind === "all" || (SB.kind === "loop" ? s.dur >= 1.5 && s.bpm : SB.kind === "note" ? s.kind === "note" : s.kind !== "note" && s.dur < 1.5)));
  $("#sb-list", m).innerHTML = list.length ? list.map((s) => {
    const f = sbFit(s);
    return `<div class="sb-row" data-f="${escapeHtml(s.file)}"><button class="btn ghost sm" data-pl="0" data-hint="Слухати як є">▶</button><button class="btn ghost sm" data-pl="1" data-hint="Слухати в темпі ${S.B ? Math.round(S.B.timing.bpm) : ""} BPM і тональності проєкту">▶ у проєкті</button>
      <b>${escapeHtml(s.name)}</b><span class="muted small">${s.dur ? s.dur.toFixed(1) + " с" : ""}${s.bpm && s.dur >= 1.5 ? ` · ${s.bpm} BPM` : ""}${s.key ? ` · ${NOTE_NAMES[s.key.tonic]} ${s.key.mode === "minor" ? "мінор" : "мажор"}` : s.root_name ? ` · ${s.root_name}` : ""}${(f.factor !== 1 || f.semis) ? ` · ${f.factor !== 1 ? "×" + (1 / f.factor).toFixed(2) + " " : ""}${f.semis ? (f.semis > 0 ? "+" : "") + f.semis + " пт" : ""}` : ""}</span>
      <span class="spacer"></span><button class="btn ghost sm" data-add="audio" data-hint="Додати аудіодоріжкою з позиції курсору, підігнавши під темп і тональність">＋ доріжка</button><button class="btn ghost sm" data-add="smp" data-hint="Новий інструмент-семплер з цим звуком">＋ семплер</button></div>`;
  }).join("") : `<div class="dock-empty">Немає звуків. Додайте свої семпли через «Бібліотеку» або синтезуйте пак («Інструменти» → «Паки звуків»).</div>`;
  $$(".sb-row", m).forEach((row) => {
    const s = SB.list.find((x) => x.file === row.dataset.f), f = sbFit(s);
    const fitUrl = `/api/library/fit?f=${encodeURIComponent(s.file)}&factor=${f.factor}&semis=${f.semis}`;
    $$("[data-pl]", row).forEach((b) => b.onclick = () => sbPlay(b.dataset.pl === "1" ? fitUrl : `/api/library/sample/${encodeURIComponent(s.file.replace(/^lib:/, ""))}`));
    $("[data-add=audio]", row).onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = "…";
      try {
        const blob = await (await fetch(fitUrl)).blob();
        const fd = new FormData();
        fd.append("file", blob, s.name + ".wav");
        fd.append("start", String(Math.max(0, S.playBeat * period() - S.B.timing.pad)));
        fd.append("name", s.name);
        fd.append("kind", "other");
        fd.append("transcribe", "0");
        stopPlay();
        await flushMix();
        const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd }), j = await r.json();
        if (!r.ok) throw new Error(j.error || "помилка");
        await careWait(j.job, () => {});
        await reloadProject();
        toast(`«${s.name}» додано з такту ${hmBarAt(S.playBeat)}.`);
      } catch (er) { toast("Не вдалося: " + er.message, true); }
      btn.disabled = false; btn.textContent = tr("＋ доріжка");
    };
    $("[data-add=smp]", row).onclick = async () => {
      pushUndo("семплер з браузера");
      addMidiTrack("keys");
      mt(S.sel).inst = { type: "sampler", sample: s.file, params: { root: s.root || 60, tune: 0, gain: 0.8, amp: { a: 2e-3, d: 0.2, s: 1, r: 0.3 }, oneshot: s.kind !== "note" } };
      afterEdit(true);
      await loadInstrumentBuffers();
      S.dockTab = "inst";
      renderDock();
      toast(`Семплер з «${s.name}» готовий.`);
    };
  });
}
async function openSampleBrowser() {
  const m = careModalBox("sb-modal", "Браузер звуків", `<p class="muted small">Звуки вашої бібліотеки з визначеним темпом і тональністю. «▶ у проєкті» — послухати вже підігнаним під темп і тональність пісні, без зміни висоти чи швидкості окремо.</p>
    <div class="arr-row"><input id="sb-q" placeholder="пошук за назвою" value="${escapeHtml(SB.q)}"><div class="seg small">${[["all", "Усі"], ["hit", "Удари"], ["note", "Ноти"], ["loop", "Лупи"]].map(([k, l]) => `<button data-sk="${k}" class="${SB.kind === k ? "active" : ""}">${l}</button>`).join("")}</div><span class="muted small" id="sb-st"></span></div>
    <div class="sb-list" id="sb-list"><div class="dock-empty">Завантаження…</div></div>`);
  m.querySelector(".modal-card").style.width = "min(860px,96vw)";
  const ref = m.onclick;
  m.onclick = (e) => { ref(e); if (m.hidden && SB.audio) { SB.audio.pause(); SB.audio = null; } };
  $("#sb-q", m).oninput = (e) => { SB.q = e.target.value.toLowerCase(); sbRender(m); };
  $$("[data-sk]", m).forEach((b) => b.onclick = () => { SB.kind = b.dataset.sk; $$("[data-sk]", m).forEach((x) => x.classList.toggle("active", x === b)); sbRender(m); });
  let lib = await api.get("/api/library");
  SB.list = lib.samples || [];
  sbRender(m);
  if (SB.list.some((s) => !("bpm" in s) || s.bpm === undefined)) {
    $("#sb-st", m).textContent = "Визначаю темп і тональність…";
    try { await api.post("/api/library/analyze", {}); lib = await api.get("/api/library"); SB.list = lib.samples || []; sbRender(m); $("#sb-st", m).textContent = ""; } catch (e) { $("#sb-st", m).textContent = ""; }
  }
}
(function voice2UI() {
  document.addEventListener("click", (e) => {
    const more = e.target.closest && e.target.closest(".lh-more");
    if (!more) return;
    setTimeout(() => {
      const mm = $("#ctxmenu"), h = more.closest(".lane-head");
      if (!mm || !h) return;
      const t = tracksAll()[$$(".lane-head").indexOf(h)];
      if (!t || !t.has_audio || !trackNotes(t).length) return;
      const b = document.createElement("button");
      b.textContent = tr("Вокальна гармонія (бек-голоси)…");
      b.onclick = () => { closeMenu(); openVocalHarmony(t); };
      mm.appendChild(b);
    }, 0);
  });
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["Вокальна гармонія вибраної доріжки…", needProject(() => openVocalHarmony(S.sel && findT(S.sel)))], ["Акорди з мікрофона…", needProject(openChordMic)], ["Браузер звуків (темп і тональність)…", needProject(openSampleBrowser)]]);
})();
