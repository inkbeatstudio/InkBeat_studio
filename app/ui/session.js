"use strict";
const SES = { open: false, scenes: [], playing: {}, queued: {}, cache: new Map(), ctx: null, t0: 0, out: null, rec: null, log: [], raf: 0, quant: 1 };
function sesScenesDefault() {
  const secs = secList(), bpb = S.B.timing.bpb, out = [], seen = new Set();
  for (const s of secs) {
    const key = s.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = hmBarAt(s.start), len = Math.max(1, Math.min(8, Math.round((tmM(s.end) - tmM(s.start)) / bpb)));
    out.push({ name: s.name_ua.replace(/ \d+$/, ""), a, bars: len, color: s.color });
  }
  if (!out.length) for (let i = 0; i < 4; i++) out.push({ name: `Сцена ${i + 1}`, a: 1 + i * 4, bars: 4, color: "#3b82f6" });
  return out.slice(0, 12);
}
function sesTracks() {
  return tracksAll().filter((t) => mt(t.id).clips.length && (trackNotes(t).length || t.has_audio));
}
function sesKey(t, sc) {
  const m = mt(t.id);
  return [t.id, sc.a, sc.bars, JSON.stringify(m.fx), JSON.stringify(m.inst), JSON.stringify(m.mfx || []), trackNotes(t).length, m.clips.length, modeOf(t)].join("|");
}
function sesHas(t, sc) {
  const bpb = S.B.timing.bpb, a = tmU((sc.a - 1) * bpb), b = tmU((sc.a - 1 + sc.bars) * bpb), m = mt(t.id), md = modeOf(t);
  if (md !== "audio" && arranged(t).some((n) => n[0] >= a && n[0] < b)) return true;
  if (t.has_audio && md !== "midi" && m.clips.some((c) => !c.mute && c.start < b && c.start + c.dur / period() > a)) return true;
  return false;
}
async function sesRender(t, sc) {
  const k = sesKey(t, sc);
  if (SES.cache.has(k)) return SES.cache.get(k);
  const p = (async () => {
    const A = ensureCtx(), SR = A.ctx.sampleRate, P = period(), bpb = S.B.timing.bpb;
    const a = tmU((sc.a - 1) * bpb), b = tmU((sc.a - 1 + sc.bars) * bpb);
    const len = Math.ceil((b - a) * P * SR);
    const ctx = new OfflineAudioContext(2, len, SR);
    await DSP.ensureWorklets(ctx);
    await loadInstrumentBuffers();
    const m = mt(t.id), st = new DSP.Strip(ctx, ctx.destination, fxEnv());
    st.setFx(m.fx);
    st.fader.gain.value = 1;
    scheduleTrackSources(ctx, t, m, st, a, b, (x) => A.buffers[srcKey(x)], A.ibuf);
    return ctx.startRendering();
  })();
  SES.cache.set(k, p);
  return p;
}
function sesBarLen() {
  return S.B.timing.bpb * period();
}
function sesNow() {
  return SES.ctx ? SES.ctx.currentTime : 0;
}
function sesNextBar() {
  const L = sesBarLen() * SES.quant, now = sesNow() + 0.03;
  return SES.t0 + Math.ceil((now - SES.t0) / L) * L;
}
function sesEnsure() {
  if (SES.ctx) return;
  if (S.playing) stopPlay();
  const A = ensureCtx();
  A.ctx.resume();
  SES.ctx = A.ctx;
  SES.out = A.ctx.createGain();
  SES.out.connect(A.master ? A.master.input : A.out);
  SES.t0 = A.ctx.currentTime + 0.1;
  sesTick();
}
async function sesLaunch(tid, si) {
  const t = findT(tid), sc = SES.scenes[si];
  if (!t || !sc) return;
  sesEnsure();
  SES.queued[tid] = si;
  sesPaint();
  const buf = await sesRender(t, sc);
  if (SES.queued[tid] !== si) return;
  const when = sesNextBar();
  const src = SES.ctx.createBufferSource(), g = SES.ctx.createGain();
  src.buffer = buf; src.loop = true;
  g.gain.value = Math.pow(10, (mt(tid).vol || 0) / 20);
  src.connect(g); g.connect(SES.out);
  const L = sesBarLen() * sc.bars, off = ((when - SES.t0) % L + L) % L;
  src.start(when, off % buf.duration);
  const prev = SES.playing[tid];
  if (prev) { try { prev.src.stop(when); } catch (e) {} }
  SES.playing[tid] = { src, si, when, g, vol: g.gain.value };
  if (SES.muted && SES.muted[tid]) g.gain.value = 0;
  delete SES.queued[tid];
  if (SES.rec) SES.log.push([Math.round((when - SES.t0) / sesBarLen()), tid, si]);
  setTimeout(sesPaint, Math.max(0, (when - sesNow()) * 1000));
}
function sesStopTrack(tid) {
  const p = SES.playing[tid];
  if (!p) return;
  const when = sesNextBar();
  try { p.src.stop(when); } catch (e) {}
  delete SES.playing[tid];
  if (SES.rec) SES.log.push([Math.round((when - SES.t0) / sesBarLen()), tid, null]);
  sesPaint();
}
function sesScene(si) {
  for (const t of sesTracks()) { if (sesHas(t, SES.scenes[si])) sesLaunch(t.id, si); else sesStopTrack(t.id); }
}
function sesStopAll(hard) {
  for (const tid of Object.keys(SES.playing)) { try { SES.playing[tid].src.stop(hard ? 0 : sesNextBar()); } catch (e) {} if (SES.rec) SES.log.push([Math.round((sesNextBar() - SES.t0) / sesBarLen()), tid, null]); }
  SES.playing = {};
  SES.queued = {};
  if (hard) { if (SES.out) try { SES.out.disconnect(); } catch (e) {} SES.ctx = null; cancelAnimationFrame(SES.raf); }
  sesPaint();
}
function sesTick() {
  cancelAnimationFrame(SES.raf);
  const step = () => {
    if (!SES.ctx) return;
    const el = document.getElementById("ses-pos");
    if (el) { const bars = (sesNow() - SES.t0) / sesBarLen(); el.textContent = bars >= 0 ? `такт ${Math.floor(bars) + 1}.${Math.floor((bars % 1) * S.B.timing.bpb) + 1}` : "…"; }
    SES.raf = requestAnimationFrame(step);
  };
  SES.raf = requestAnimationFrame(step);
}
function sesCommit() {
  if (!SES.log.length) return toast("Виступ порожній: увімкніть запис і запускайте кліпи.", true);
  const bpb = S.B.timing.bpb, P = period();
  const log = SES.log.slice().sort((x, y) => x[0] - y[0]);
  const first = log[0][0], end = Math.max(...log.map((e) => e[0])) + 1;
  const lastBar = Math.ceil(tmM(arrEnd()) / bpb + 1e-6), start = SES.commitMode === "replace" ? 0 : lastBar;
  pushUndo("виступ у аранжування");
  const tracks = sesTracks();
  for (const t of tracks) {
    const m = mt(t.id), ev = log.filter((e) => e[1] === t.id);
    if (!ev.length) { if (SES.commitMode === "replace") m.clips = []; continue; }
    const base = m.clips.map((c) => ({ ...c }));
    const clips = SES.commitMode === "replace" ? [] : m.clips.slice();
    for (let i = 0; i < ev.length; i++) {
      const [bar, , si] = ev[i];
      if (si == null) continue;
      const stop = (ev.slice(i + 1).find((e) => e[0] > bar) || [end])[0];
      const sc = SES.scenes[si], a = tmU((sc.a - 1) * bpb), c = base.find((x) => !x.mute && x.start <= a + 1e-4 && x.start + x.dur / P > a + 1e-3);
      if (!c) continue;
      const srcA = c.src + (a - c.start) * P;
      for (let k = bar; k < stop; k += sc.bars) {
        const st = tmU((start + k - first) * bpb), en = tmU((start + Math.min(stop, k + sc.bars) - first) * bpb);
        clips.push({ id: uid("c"), start: +st.toFixed(5), src: srcA, dur: (en - st) * P, gain: c.gain || 0, fi: 5e-3, fo: 5e-3, mute: false });
      }
    }
    m.clips = clips;
  }
  _arrCache.clear();
  _tracksKey = "";
  afterEdit(true);
  SES.log = [];
  toast(`Виступ перенесено в аранжування: ${end - first} тактів${SES.commitMode === "replace" ? "" : `, з такту ${lastBar + 1}`}. Ctrl+Z — скасувати.`);
}
function sesPaint() {
  const m = document.getElementById("ses-modal");
  if (!m || m.hidden) return;
  $$(".ses-cell", m).forEach((c) => {
    const tid = c.dataset.t, si = +c.dataset.s, p = SES.playing[tid];
    c.classList.toggle("play", !!p && p.si === si && p.when <= sesNow() + 0.05);
    c.classList.toggle("queue", SES.queued[tid] === si || (!!p && p.si === si && p.when > sesNow() + 0.05));
  });
  const r = $("#ses-rec", m);
  if (r) r.classList.toggle("on", !!SES.rec);
}
function openSession() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  if (!SES.scenes.length || SES.pid !== S.pid) { SES.scenes = (S.mix.scenes && S.mix.scenes.length ? S.mix.scenes : sesScenesDefault()).map((x) => ({ ...x })); SES.pid = S.pid; SES.cache.clear(); }
  let m = document.getElementById("ses-modal");
  if (!m) {
    m = document.createElement("div"); m.className = "modal"; m.id = "ses-modal"; document.body.appendChild(m);
    if (!UIP.mfloat["ses-modal"]) { UIP.mfloat["ses-modal"] = { on: true, rect: { x: Math.max(20, innerWidth / 2 - 540), y: 90, w: 1080, h: Math.min(720, innerHeight - 110) } }; saveUI(); }
  }
  const tracks = sesTracks();
  m.innerHTML = `<div class="modal-card" style="width:min(1080px,96vw)"><div class="modal-head"><h3>Сцени: живий запуск кліпів</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body ses">
      <p class="muted small">Кожна клітинка — фрагмент доріжки з тактів сцени. Клік — запустити по колу (стартує з наступного такту, тож усе грає в ритм). Кнопка сцени ліворуч запускає весь рядок. Увімкніть ● запис — і ваш виступ можна перенести в аранжування.</p>
      <div class="arr-row"><button class="btn ghost sm" id="ses-stop" data-hint="Зупинити все на наступному такті">■ Стоп усе</button><button class="rec-btn sm" id="ses-rec" data-hint="Записувати запуски кліпів, щоб потім перенести виступ в аранжування"><i></i></button><span id="ses-pos" class="muted small">зупинено</span>
        <label data-hint="Коли стартує запущений кліп">Старт <select id="ses-q"><option value="1" ${SES.quant === 1 ? "selected" : ""}>наступний такт</option><option value="2" ${SES.quant === 2 ? "selected" : ""}>кожні 2 такти</option><option value="4" ${SES.quant === 4 ? "selected" : ""}>кожні 4 такти</option></select></label>
        <span class="spacer"></span><select id="ses-cm" data-hint="Куди класти записаний виступ"><option value="append">додати в кінець пісні</option><option value="replace">замінити все аранжування</option></select><button class="btn primary sm" id="ses-commit" data-hint="Перенести записаний виступ на таймлайн">Виступ → аранжування</button></div>
      <div class="ses-grid" style="grid-template-columns:150px repeat(${tracks.length},minmax(92px,1fr))">
        <div class="ses-h"></div>${tracks.map((t) => `<div class="ses-h" style="--tc:${t.color}" data-hint="${escapeHtml(t.name)}">${escapeHtml(t.name.slice(0, 16))}<button class="ses-ts" data-stop="${escapeHtml(t.id)}" data-hint="Зупинити цю доріжку">■</button></div>`).join("")}
        ${SES.scenes.map((sc, si) => `<div class="ses-scene" style="--sc:${sc.color || "#3b82f6"}"><button class="ses-play" data-scene="${si}" data-hint="Запустити всю сцену">▶</button><div class="ses-sn"><input data-sn="${si}" value="${escapeHtml(sc.name)}"><span><input type="number" data-sa="${si}" min="1" value="${sc.a}" data-hint="З якого такту пісні"> · <select data-sb="${si}" data-hint="Довжина кліпу">${[1, 2, 4, 8].map((b) => `<option ${b === sc.bars ? "selected" : ""}>${b}</option>`).join("")}</select> т.</span></div><button class="ses-del" data-del="${si}" data-hint="Прибрати сцену">✕</button></div>
          ${tracks.map((t) => sesHas(t, sc) ? `<button class="ses-cell" data-t="${escapeHtml(t.id)}" data-s="${si}" style="--tc:${t.color}"></button>` : `<div class="ses-empty"></div>`).join("")}`).join("")}
      </div>
      <div class="arr-row"><button class="btn ghost sm" id="ses-add" data-hint="Нова сцена з тактів після останньої">＋ Сцена</button><button class="btn ghost sm" id="ses-reset" data-hint="Створити сцени заново за секціями пісні">Сцени з секцій</button><button class="btn ghost sm" id="ses-prep" data-hint="Заздалегідь підготувати звук усіх кліпів, щоб запуск був миттєвим">Підготувати всі кліпи</button><span class="muted small" id="ses-info"></span></div>
    </div></div>`;
  m.hidden = false;
  const save = () => { S.mix.scenes = SES.scenes.map((x) => ({ ...x })); saveMix(); };
  $("[data-close]", m).onclick = () => { sesStopAll(true); m.hidden = true; };
  $("#ses-stop", m).onclick = () => sesStopAll(false);
  $("#ses-q", m).onchange = (e) => { SES.quant = +e.target.value; };
  $("#ses-cm", m).onchange = (e) => { SES.commitMode = e.target.value; };
  $("#ses-rec", m).onclick = () => { SES.rec = !SES.rec; if (SES.rec) { SES.log = []; sesEnsure(); for (const [tid, p] of Object.entries(SES.playing)) SES.log.push([Math.max(0, Math.ceil((sesNow() - SES.t0) / sesBarLen())), tid, p.si]); toast("Запис виступу: запускайте кліпи й сцени."); } sesPaint(); };
  $("#ses-commit", m).onclick = () => { SES.commitMode = $("#ses-cm", m).value; sesCommit(); };
  $$("[data-stop]", m).forEach((b) => b.onclick = () => sesStopTrack(b.dataset.stop));
  $$("[data-scene]", m).forEach((b) => b.onclick = () => sesScene(+b.dataset.scene));
  $$(".ses-cell", m).forEach((c) => c.onclick = () => { const p = SES.playing[c.dataset.t]; if (p && p.si === +c.dataset.s) sesStopTrack(c.dataset.t); else sesLaunch(c.dataset.t, +c.dataset.s); });
  $$("[data-sn]", m).forEach((i) => i.onchange = () => { SES.scenes[+i.dataset.sn].name = i.value; save(); });
  $$("[data-sa]", m).forEach((i) => i.onchange = () => { SES.scenes[+i.dataset.sa].a = Math.max(1, +i.value || 1); save(); openSession(); });
  $$("[data-sb]", m).forEach((i) => i.onchange = () => { SES.scenes[+i.dataset.sb].bars = +i.value; save(); openSession(); });
  $$("[data-del]", m).forEach((b) => b.onclick = () => { SES.scenes.splice(+b.dataset.del, 1); save(); openSession(); });
  $("#ses-add", m).onclick = () => { const l = SES.scenes[SES.scenes.length - 1]; SES.scenes.push({ name: `Сцена ${SES.scenes.length + 1}`, a: l ? l.a + l.bars : 1, bars: 4, color: "#14b8a6" }); save(); openSession(); };
  $("#ses-reset", m).onclick = () => { SES.scenes = sesScenesDefault(); save(); openSession(); };
  $("#ses-prep", m).onclick = async () => {
    const jobs = [];
    for (const t of tracks) for (const sc of SES.scenes) if (sesHas(t, sc)) jobs.push([t, sc]);
    let k = 0;
    for (const [t, sc] of jobs) { $("#ses-info", m).textContent = `Готую ${++k} з ${jobs.length}…`; await sesRender(t, sc); }
    $("#ses-info", m).textContent = `Готово: ${jobs.length} кліпів.`;
  };
  sesPaint();
}
(function sessionUI() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Сцени: живий запуск кліпів…", needProject(openSession)]]);
})();
