"use strict";
const PF = { open: false, setlist: [], idx: 0, flt: null, dly: null, dlyG: null, xy: { x: 1, y: 0 }, raf: 0 };
function pfChain() {
  if (!SES.ctx || PF.flt) return;
  const ctx = SES.ctx;
  PF.flt = ctx.createBiquadFilter();
  PF.flt.type = "lowpass";
  PF.flt.frequency.value = 20000;
  PF.flt.Q.value = 0.7;
  PF.dly = ctx.createDelay(2);
  PF.dly.delayTime.value = Math.min(1.9, period() * 0.75);
  const fb = ctx.createGain();
  fb.gain.value = 0.45;
  PF.dlyG = ctx.createGain();
  PF.dlyG.gain.value = 0;
  try { SES.out.disconnect(); } catch (e) {}
  SES.out.connect(PF.flt);
  const dest = S.audio.master ? S.audio.master.input : S.audio.out;
  PF.flt.connect(dest);
  PF.flt.connect(PF.dlyG);
  PF.dlyG.connect(PF.dly);
  PF.dly.connect(fb); fb.connect(PF.dly);
  PF.dly.connect(dest);
}
const _sesEnsureP = sesEnsure;
sesEnsure = function() {
  const had = !!SES.ctx;
  _sesEnsureP();
  if (!had) { PF.flt = null; if (PF.open || CTL.on) pfChain(); }
};
function pfXY(x, y) {
  PF.xy = { x, y };
  if (!PF.flt) return;
  const now = SES.ctx.currentTime;
  PF.flt.frequency.setTargetAtTime(Math.max(120, 20000 * Math.pow(x, 2.2)), now, 0.03);
  PF.flt.Q.setTargetAtTime(0.7 + y * 14, now, 0.03);
}
function pfTapeStop() {
  if (!SES.ctx) return;
  const now = SES.ctx.currentTime;
  for (const p of Object.values(SES.playing)) { try { p.src.playbackRate.setValueAtTime(1, now); p.src.playbackRate.linearRampToValueAtTime(0.05, now + 0.7); } catch (e) {} }
  setTimeout(() => sesStopAll(true), 750);
}
function pfMute(tid) {
  if (!SES.muted) SES.muted = {};
  SES.muted[tid] = !SES.muted[tid];
  const p = SES.playing[tid];
  if (p && p.g) p.g.gain.setTargetAtTime(SES.muted[tid] ? 0 : p.vol, SES.ctx.currentTime, 0.02);
  pfRender();
}
async function pfLoadSong(i) {
  if (!PF.setlist[i]) return;
  sesStopAll(true);
  PF.idx = i;
  await openProject(PF.setlist[i]);
  SES.scenes = []; SES.pid = null;
  SES.scenes = (S.mix.scenes && S.mix.scenes.length ? S.mix.scenes : sesScenesDefault()).map((x) => ({ ...x }));
  SES.pid = S.pid;
  SES.cache.clear();
  pfRender();
}
function pfRender() {
  let o = document.getElementById("pf-ov");
  if (!PF.open) { if (o) o.remove(); cancelAnimationFrame(PF.raf); return; }
  if (!o) { o = document.createElement("div"); o.id = "pf-ov"; o.className = "pf-ov"; document.body.appendChild(o); }
  if (!SES.scenes.length || SES.pid !== S.pid) { SES.scenes = (S.mix.scenes && S.mix.scenes.length ? S.mix.scenes : sesScenesDefault()).map((x) => ({ ...x })); SES.pid = S.pid; SES.cache.clear(); }
  const tracks = sesTracks();
  o.innerHTML = `<div class="pf-top"><b class="pf-title">${escapeHtml(S.B.project.title)}</b><span id="pf-pos" class="pf-pos">—</span><span class="pf-bpm">${Math.round(S.B.timing.bpm)} BPM</span>
      <span class="spacer"></span>
      ${PF.setlist.length > 1 ? `<button class="pf-btn" id="pf-prev" ${PF.idx ? "" : "disabled"}>◀ Попередня</button><span class="pf-set">${PF.idx + 1} / ${PF.setlist.length}</span><button class="pf-btn" id="pf-next" ${PF.idx < PF.setlist.length - 1 ? "" : "disabled"}>Наступна ▶</button>` : ""}
      <button class="pf-btn" id="pf-set" data-hint="Сетліст: кілька пісень для виступу підряд">Сетліст…</button><button class="pf-btn" id="pf-ctl" data-hint="Підключити MIDI-контролер з падами">Контролер…</button><button class="pf-btn" id="pf-2nd" data-hint="Друге вікно: акорди, секція й текст великим шрифтом — для другого монітора">Друге вікно</button><button class="pf-btn x" id="pf-x" data-hint="Вийти з режиму виступу (Esc)">✕</button></div>
    <div class="pf-main">
      <div class="pf-scenes">${SES.scenes.map((sc, si) => `<button class="pf-scene" data-sc="${si}" style="--sc:${sc.color || "#3b82f6"}"><b>${escapeHtml(sc.name)}</b><span>${sc.bars} т.</span></button>`).join("")}<button class="pf-scene stop" id="pf-stop"><b>■ Стоп</b><span>на наступному такті</span></button></div>
      <div class="pf-side">
        <div class="pf-xy" id="pf-xy" data-hint="Тягніть: вліво — фільтр закривається, вгору — резонанс. Відпустіть — повернеться"><i id="pf-dot"></i><span>Фільтр</span></div>
        <div class="pf-fx"><button class="pf-btn big" id="pf-echo" data-hint="Тримайте — звук іде в ехо, відпустіть — ехо згасає">Ехо (тримати)</button><button class="pf-btn big" id="pf-tape" data-hint="Ефект зупинки плівки й тиша">Стоп плівки</button><button class="pf-btn big" id="pf-rise" data-hint="Райзер на 2 такти — перед дропом">Райзер</button><button class="pf-btn big" id="pf-imp" data-hint="Удар">Удар</button></div>
        <div class="pf-mutes">${tracks.map((t) => `<button class="pf-mute ${SES.muted && SES.muted[t.id] ? "off" : ""}" data-m="${escapeHtml(t.id)}" style="--tc:${t.color}">${escapeHtml(t.name.slice(0, 14))}</button>`).join("")}</div>
      </div>
    </div>`;
  $("#pf-x", o).onclick = () => { PF.open = false; sesStopAll(true); pfRender(); };
  $("#pf-stop", o).onclick = () => sesStopAll(false);
  $$("[data-sc]", o).forEach((b) => b.onclick = () => { sesEnsure(); pfChain(); sesScene(+b.dataset.sc); });
  $$("[data-m]", o).forEach((b) => b.onclick = () => pfMute(b.dataset.m));
  if ($("#pf-prev", o)) $("#pf-prev", o).onclick = () => pfLoadSong(PF.idx - 1);
  if ($("#pf-next", o)) $("#pf-next", o).onclick = () => pfLoadSong(PF.idx + 1);
  $("#pf-set", o).onclick = pfSetlist;
  $("#pf-ctl", o).onclick = openController;
  $("#pf-2nd", o).onclick = openSecondWindow;
  $("#pf-tape", o).onclick = pfTapeStop;
  const fxNote = (n, beats) => { sesEnsure(); pfChain(); trfxNote(SES.ctx, PF.flt, { type: "trfx", gain: 0.8 }, n, 0.9, sesNow() + 0.02, beats * period()); };
  $("#pf-rise", o).onclick = () => fxNote(37, S.B.timing.bpb * 2);
  $("#pf-imp", o).onclick = () => fxNote(36, 2);
  const echo = $("#pf-echo", o);
  echo.onpointerdown = () => { sesEnsure(); pfChain(); PF.dlyG.gain.setTargetAtTime(0.8, SES.ctx.currentTime, 0.02); echo.classList.add("on"); };
  echo.onpointerup = echo.onpointerleave = () => { if (PF.dlyG) PF.dlyG.gain.setTargetAtTime(0, SES.ctx.currentTime, 0.05); echo.classList.remove("on"); };
  const xy = $("#pf-xy", o), dot = $("#pf-dot", o);
  const setDot = () => { dot.style.left = PF.xy.x * 100 + "%"; dot.style.top = (1 - PF.xy.y) * 100 + "%"; };
  setDot();
  let drag = false;
  const at = (e) => { const r = xy.getBoundingClientRect(); pfXY(clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)); setDot(); };
  xy.onpointerdown = (e) => { drag = true; xy.setPointerCapture(e.pointerId); sesEnsure(); pfChain(); at(e); };
  xy.onpointermove = (e) => { if (drag) at(e); };
  xy.onpointerup = () => { drag = false; pfXY(1, 0); setDot(); };
  pfPaint();
  cancelAnimationFrame(PF.raf);
  const tick = () => {
    if (!PF.open) return;
    const el = document.getElementById("pf-pos");
    if (el) el.textContent = SES.ctx ? (() => { const bars = (sesNow() - SES.t0) / sesBarLen(); return bars >= 0 ? `${Math.floor(bars) + 1}.${Math.floor((bars % 1) * S.B.timing.bpb) + 1}` : "…"; })() : "—";
    PF.raf = requestAnimationFrame(tick);
  };
  PF.raf = requestAnimationFrame(tick);
}
function pfPaint() {
  const o = document.getElementById("pf-ov");
  if (!o) return;
  const active = new Set(Object.values(SES.playing).map((p) => p.si)), queued = new Set(Object.values(SES.queued));
  $$("[data-sc]", o).forEach((b) => { const si = +b.dataset.sc; b.classList.toggle("play", active.has(si)); b.classList.toggle("queue", queued.has(si)); });
}
const _sesPaintP = sesPaint;
sesPaint = function() {
  _sesPaintP();
  pfPaint();
  ctlLeds();
};
function openPerform() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  PF.open = true;
  if (!PF.setlist.length) { PF.setlist = [S.pid]; PF.idx = 0; }
  pfRender();
  toast("Режим виступу: кнопки сцен запускають частини пісні в ритм. Esc — вийти.");
}
document.addEventListener("keydown", (e) => {
  if (!PF.open || typingIn(e.target)) return;
  if (e.key === "Escape") { PF.open = false; sesStopAll(true); pfRender(); e.preventDefault(); }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && SES.scenes[n - 1]) { sesEnsure(); pfChain(); sesScene(n - 1); e.preventDefault(); }
  if (e.key === " ") { sesStopAll(false); e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
async function pfSetlist() {
  const all = await api.get("/api/projects");
  const list = (all.projects || all).filter((p) => p.id);
  const m = careModalBox("pfset-modal", "Сетліст", `<p class="muted">Пісні для виступу підряд. Кнопки «Наступна / Попередня» вгорі перемикають їх, сцени кожної пісні беруться з її секцій.</p>
    <div class="alb"><div><h5>Сетліст</h5><div class="alb-list">${PF.setlist.map((id, i) => { const p = list.find((x) => x.id === id); return `<div class="alb-row" data-i="${i}"><b>${i + 1}.</b><span>${escapeHtml(p ? p.title : id)}</span><span class="spacer"></span><button data-up>▲</button><button data-dn>▼</button><button data-rm>✕</button></div>`; }).join("")}</div></div>
    <div><h5>Проєкти</h5><div class="alb-list">${list.filter((p) => !PF.setlist.includes(p.id)).map((p) => `<div class="alb-row"><span>${escapeHtml(p.title)}</span><span class="spacer"></span><button data-add="${escapeHtml(p.id)}">＋</button></div>`).join("")}</div></div></div>
    <div class="modal-actions"><button class="btn primary" data-k="x">Готово</button></div>`);
  $$("[data-add]", m).forEach((b) => b.onclick = () => { PF.setlist.push(b.dataset.add); pfSetlist(); });
  $$(".alb-row[data-i]", m).forEach((r) => {
    const i = +r.dataset.i;
    $("[data-up]", r).onclick = () => { if (i) { [PF.setlist[i - 1], PF.setlist[i]] = [PF.setlist[i], PF.setlist[i - 1]]; pfSetlist(); } };
    $("[data-dn]", r).onclick = () => { if (i < PF.setlist.length - 1) { [PF.setlist[i + 1], PF.setlist[i]] = [PF.setlist[i], PF.setlist[i + 1]]; pfSetlist(); } };
    $("[data-rm]", r).onclick = () => { PF.setlist.splice(i, 1); pfSetlist(); };
  });
  const prev = m.onclick;
  m.onclick = (e) => { prev(e); if (m.hidden) pfRender(); };
}
const CTL_T = {
  launchpad: { name: "Novation Launchpad (сітка 8×8, програмний режим)", cell: (r, c) => 10 * (8 - r) + (c + 1), scene: (r) => ({ cc: 10 * (8 - r) + 9 }), colors: { off: 0, has: 1, play: 21, queue: 13 } },
  apc: { name: "Akai APC mini (сітка 8×8)", cell: (r, c) => (7 - r) * 8 + c, scene: (r) => ({ note: 82 + r }), colors: { off: 0, has: 5, play: 1, queue: 6 } },
  pads: { name: "Пади 4×4 (MPC, ноти 36–51)", cell: (r, c) => c < 4 && r < 4 ? 36 + (3 - r) * 4 + c : -1, scene: () => null, colors: null },
  keys: { name: "Клавіші: кожна клавіша від C3 — сцена", cell: () => -1, scene: (r) => ({ note: 48 + r }), colors: null },
};
const CTL = { on: false, tpl: "launchpad", access: null, outs: [], learn: false };
function ctlCellAt(note, cc) {
  const T = CTL_T[CTL.tpl], tracks = sesTracks();
  for (let r = 0; r < Math.min(8, SES.scenes.length); r++) {
    const sc = T.scene(r);
    if (sc && ((sc.note != null && sc.note === note) || (sc.cc != null && sc.cc === cc))) return { scene: r };
    if (note == null) continue;
    for (let c = 0; c < Math.min(8, tracks.length); c++) if (T.cell(r, c) === note) return { r, c, t: tracks[c] };
  }
  return null;
}
function ctlMsg(e) {
  const [st, d1, d2] = e.data, type = st & 0xf0;
  if (!CTL.on || !d2) return;
  const hit = type === 0x90 ? ctlCellAt(d1, null) : type === 0xb0 ? ctlCellAt(null, d1) : null;
  if (!hit) return;
  if (!SES.scenes.length || SES.pid !== S.pid) { SES.scenes = sesScenesDefault(); SES.pid = S.pid; }
  sesEnsure(); pfChain();
  if (hit.scene != null) sesScene(hit.scene);
  else if (hit.t && sesHas(hit.t, SES.scenes[hit.r])) { const p = SES.playing[hit.t.id]; if (p && p.si === hit.r) sesStopTrack(hit.t.id); else sesLaunch(hit.t.id, hit.r); }
}
function ctlLeds() {
  const T = CTL_T[CTL.tpl];
  if (!CTL.on || !T.colors || !CTL.outs.length) return;
  const tracks = sesTracks();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const n = T.cell(r, c);
    if (n < 0) continue;
    const t = tracks[c], sc = SES.scenes[r];
    let col = T.colors.off;
    if (t && sc && sesHas(t, sc)) { const p = SES.playing[t.id]; col = p && p.si === r ? T.colors.play : SES.queued[t.id] === r ? T.colors.queue : T.colors.has; }
    for (const o of CTL.outs) try { o.send([0x90, n, col]); } catch (e) {}
  }
}
async function openController() {
  const m = careModalBox("ctl-modal", "MIDI-контролер для сцен", `<p class="muted">Підключіть контролер з падами — сітка пада відповідає сітці сцен: рядки — сцени, стовпці — доріжки. На Launchpad і APC mini пади світяться: є кліп, грає, чекає старту.</p>
    <div class="mel-grid"><label>Шаблон <select id="ctl-t">${Object.entries(CTL_T).map(([k, v]) => `<option value="${k}" ${CTL.tpl === k ? "selected" : ""}>${escapeHtml(v.name)}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" id="ctl-on" ${CTL.on ? "checked" : ""}> Увімкнути</label></div>
    <p class="muted small" id="ctl-st"></p>
    <p class="muted small">Launchpad: увімкніть «Programmer mode» (тримайте Session і натисніть помаранчеву кнопку праворуч унизу). Права колонка кнопок запускає сцени.</p>`);
  const st = $("#ctl-st", m);
  if (!navigator.requestMIDIAccess) { st.textContent = "MIDI недоступний у цьому вікні."; return; }
  try { CTL.access = CTL.access || await navigator.requestMIDIAccess({ sysex: false }); } catch (e) { st.textContent = "Немає доступу до MIDI: " + e.message; return; }
  const bind = () => {
    for (const i of CTL.access.inputs.values()) i.addEventListener("midimessage", ctlMsg);
    CTL.outs = [...CTL.access.outputs.values()];
    st.textContent = `Входів: ${CTL.access.inputs.size}, виходів: ${CTL.access.outputs.size}.${CTL.access.inputs.size ? "" : " Контролер не знайдено — підключіть і відкрийте вікно ще раз."}`;
  };
  if (!CTL.bound) { CTL.bound = true; bind(); CTL.access.onstatechange = bind; } else bind();
  $("#ctl-t", m).onchange = (e) => { CTL.tpl = e.target.value; ctlLeds(); };
  $("#ctl-on", m).onchange = (e) => { CTL.on = e.target.checked; if (CTL.on) { if (!SES.scenes.length || SES.pid !== S.pid) { SES.scenes = sesScenesDefault(); SES.pid = S.pid; } ctlLeds(); toast("Контролер увімкнено: натискайте пади — запускаються кліпи сцен."); } };
}
const LIVE = { on: false, t: 0, bc: null };
function liveState() {
  const b = S.playBeat, bpb = S.B.timing.bpb, m = tmM(b);
  const ch = chordList().find((c) => c.label !== "N" && b >= c.start && b < c.end), nx = chordList().find((c) => c.label !== "N" && c.start > b + 1e-3);
  const sec = secList().find((s) => b >= s.start && b < s.end);
  let line = "", next = "";
  try { const ph = vsPhrases(); const i = ph.findIndex((p) => b >= p.start - 0.25 && b < p.end); if (i >= 0) { line = ph[i].text; next = (ph[i + 1] || {}).text || ""; } else { const k = ph.findIndex((p) => p.start > b); if (k >= 0) next = ph[k].text; } } catch (e) {}
  return { title: S.B.project.title, bar: Math.floor(m / bpb) + 1, beat: Math.floor(m % bpb) + 1, bpm: Math.round(tmBpmAt(b)), chord: ch ? ch.label : "", next: nx ? nx.label : "", section: sec ? sec.name_ua : "", line, nextLine: next, playing: !!S.playing, key: S.B.key ? `${NOTE_NAMES[hmKey().tonic]} ${hmKey().minor ? "мінор" : "мажор"}` : "" };
}
function openSecondWindow() {
  if (!S.B) return toast("Спершу відкрийте проєкт.", true);
  LIVE.on = true;
  if (!LIVE.bc && "BroadcastChannel" in window) LIVE.bc = new BroadcastChannel("inkbeat-live");
  const api2 = window.pywebview && window.pywebview.api;
  if (api2 && api2.open_window) api2.open_window("ui/second.html", tr("InkBeat — друге вікно")).then((ok) => { if (!ok) window.open("/ui/second.html", "inkbeat2"); });
  else window.open("/ui/second.html", "inkbeat2", "width=1100,height=700");
  toast("Друге вікно відкрито: перетягніть його на другий монітор і розгорніть на весь екран (F11).");
}
setInterval(() => {
  if (!LIVE.on || !S.B) return;
  const st = liveState();
  if (LIVE.bc) LIVE.bc.postMessage(st);
  const now = Date.now();
  if (now - LIVE.t > 180) { LIVE.t = now; fetch("/api/live/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st) }).catch(() => {}); }
}, 100);
(function performUI() {
  const view = MENUS["Вигляд"];
  MENUS["Вигляд"] = () => view().concat([null, ["Режим виступу (сцени, ефекти, сетліст)…", needProject(openPerform)], ["Друге вікно для другого монітора…", needProject(openSecondWindow)]]);
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["MIDI-контролер для сцен…", needProject(openController)]]);
})();
