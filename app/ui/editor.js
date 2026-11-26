"use strict";
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const period = () => S.B.timing.period;
const timingKey = () => `${S.B.timing.bpm.toFixed(4)}|${S.B.timing.pad.toFixed(4)}`;
let _tracksCache = null, _tracksKey = "";
function baseTracks() {
  return S.B ? S.B.tracks : [];
}
function tracksAll() {
  if (!S.B) return [];
  const gens = S.mix && S.mix.gens || [];
  const key = (S.B._rev || (S.B._rev = Math.random())) + "|" + JSON.stringify(S.mix && S.mix.clones || []) + "|" + JSON.stringify(gens.map((g) => [g.id, g.name, g.color, g.rev || 0]));
  if (key === _tracksKey && _tracksCache) return _tracksCache;
  const list = [];
  for (const t of S.B.tracks) {
    list.push(t);
    for (const c of (S.mix && S.mix.clones || []).filter((c2) => c2.of === t.id)) {
      list.push({ ...t, id: c.id, name: c.name, color: c.color || t.color, of: t.id, clone: true, settings: t.settings });
    }
  }
  for (const g of gens) list.push({ id: g.id, name: g.name, color: g.color, kind: "gen", role: g.role, is_drums: !!g.is_drums, has_audio: false, virtual: true, gen: true, user: !!g.user, enabled: true, notes: g.notes, program: g.program || 0, settings: {} });
  _tracksCache = list;
  _tracksKey = key;
  return list;
}
const baseId = (t) => t.of || t.id;
const findT = (id) => tracksAll().find((t) => t.id === id);
const mt = (id) => S.mix.tracks[id];
function defaultClip(t) {
  const tm = S.B.timing;
  return { id: uid("c"), start: tm.pad / tm.period, src: 0, dur: S.B.project.duration, gain: 0, fi: 5e-3, fo: 5e-3, mute: false };
}
function defaultTrackMix(t) {
  return { vol: 0, pan: 0, mute: false, solo: false, mode: null, fx: [], inst: Plugins.defaultInstrument(t), source: null, clips: [defaultClip(t)] };
}
function syncMix() {
  if (!S.B) return;
  if (!S.mix || S.mix.v !== 1) S.mix = { v: 1, timingKey: timingKey(), tracks: {}, clones: [], master: { vol: 0, fx: [] } };
  if (S.mix.timingKey && S.mix.timingKey !== timingKey()) {
    const [oldBpm, oldPad] = S.mix.timingKey.split("|").map(Number);
    const oP = 60 / oldBpm, nP = period(), nPad = S.B.timing.pad;
    for (const id in S.mix.tracks) for (const c of S.mix.tracks[id].clips) c.start = Math.max(0, (c.start * oP - oldPad + nPad) / nP);
    const mapB = (b) => Math.max(0, (b * oP - oldPad + nPad) / nP);
    for (const arr of [S.mix.sections, S.mix.chords]) if (arr) for (const x of arr) { x.start = mapB(x.start); x.end = mapB(x.end); }
    for (const g of S.mix.gens || []) for (const n of g.notes) { const e = mapB(n[0] + n[1]); n[0] = mapB(n[0]); n[1] = Math.max(0.02, e - n[0]); }
    S.mix.timingKey = timingKey();
    saveMix();
  }
  S.mix.timingKey = timingKey();
  for (const t of tracksAll()) if (!S.mix.tracks[t.id]) S.mix.tracks[t.id] = defaultTrackMix(t);
  _arrCache.clear();
}
let _saveT = null;
function saveMix() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => fetch(`/api/project/${S.pid}/mix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S.mix) }), 500);
}
function pushUndo(label) {
  S.undo.push({ label, state: JSON.stringify(S.mix) });
  if (S.undo.length > 80) S.undo.shift();
  S.redo = [];
}
function restore(state) {
  S.mix = JSON.parse(state);
  _tracksKey = "";
  _arrCache.clear();
  afterEdit(true);
}
function undo() {
  const u = S.undo.pop();
  if (!u) return toast("Нічого скасовувати");
  S.redo.push({ label: u.label, state: JSON.stringify(S.mix) });
  restore(u.state);
  toast("Скасовано: " + u.label);
}
function redo() {
  const r = S.redo.pop();
  if (!r) return;
  S.undo.push({ label: r.label, state: JSON.stringify(S.mix) });
  restore(r.state);
  toast("Повторено: " + r.label);
}
function afterEdit(structural = false) {
  _arrCache.clear();
  saveMix();
  if (structural) {
    syncMix();
    renderHeads();
    renderTrackForm();
    renderDock();
    layout();
    rebuildStrips();
  }
  draw();
  if (S.playing) {
    const b = S.playBeat;
    stopPlay();
    S.playBeat = b;
    play();
  }
}
function arrEnd() {
  let e = S.B ? S.B.end_beat : 0;
  if (S.mix) for (const id in S.mix.tracks) for (const c of S.mix.tracks[id].clips) e = Math.max(e, c.start + c.dur / period());
  return e;
}
const _arrCache = new Map();
function arranged(t) {
  if (_arrCache.has(t.id)) return _arrCache.get(t.id);
  const P = period(), pad = S.B.timing.pad, out = [];
  const clips = mt(t.id).clips.filter((c) => !c.mute);
  for (const n of trackNotes(t)) {
    const ts = n[0] * P - pad, te = ts + n[1] * P;
    for (const c of clips) {
      if (ts >= c.src && ts < c.src + c.dur) {
        const b = c.start + (ts - c.src) / P;
        const len = Math.min(te, c.src + c.dur) - ts;
        out.push([b, Math.max(0.02, len / P), n[2], n[3]]);
      }
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  _arrCache.set(t.id, out);
  return out;
}
const laneHeight = (t) => (S.laneH[t.id] || (S.sel === t.id ? 170 : t.is_drums ? 92 : 76)) + autoH(t);
const modeOf = (t) => S.mix && mt(t.id) && mt(t.id).mode || (t.has_audio ? S.listen : "midi");
const anySolo = () => tracksAll().some((t) => mt(t.id).solo);
const audible = (t) => {
  const m = mt(t.id);
  return !m.mute && (!anySolo() || m.solo);
};
function renderHeads() {
  const box = $("#heads");
  box.innerHTML = "";
  for (const t of tracksAll()) {
    const m = mt(t.id);
    const h = document.createElement("div");
    h.className = "lane-head" + (S.sel === t.id ? " sel" : "") + (t.enabled ? "" : " off");
    h.style.height = laneHeight(t) + "px";
    const src = modeOf(t);
    const srcLabel = { audio: "ОРИГ", midi: "MIDI", both: "РАЗОМ" }[src];
    const ver = m.source ? " · оброблено" : "";
    const fxn = m.fx.filter((f) => f.on).length;
    const nn = trackNotes(t).length;
    const sub = (t.gen ? (t.user ? "MIDI · " : "згенеровано · ") : t.id === "_chords" ? "з акордів пісні · " : "") + (t.is_drums ? `${nn} ударів` : `${nn} нот`) + (mt(t.id).notes && !t.gen ? " · змінено" : "");
    h.innerHTML = `<span class="cbar" style="background:${t.color}"></span>
      <canvas class="lh-meter" width="6" height="60"></canvas>
      <div class="lh-top"><span class="lh-name" data-hint="${t.id === "_chords" ? "Доріжка з акордами пісні, розкладеними на ноти — готова гармонія для паду чи піаніно. Вимкнути: меню ⋯ → «Видалити доріжку» або галочка «Доріжка акордів» у панелі «Проєкт»." : escapeHtml(t.name)}">${t.clone ? "⧉ " : ""}${escapeHtml(t.name)}</span>
        <button class="lh-more" data-hint="Меню доріжки: дублювати, видалити, перейменувати, скинути кліпи">⋯</button></div>
      <div class="lh-sub">${sub}${fxn ? ` · ${fxn} FX` : ""}${ver}</div>
      <div class="lh-btns">
        <button class="lh-btn m ${m.mute ? "on" : ""}" data-hint="M — вимкнути звук доріжки">M</button>
        <button class="lh-btn s ${m.solo ? "on" : ""}" data-hint="S — соло: чути лише цю доріжку (можна кілька)">S</button>
        ${t.has_audio ? `<button class="lh-btn src ${src}" data-hint="Що звучить: ОРИГ — запис зі стему; MIDI — ноти через вибраний інструмент; РАЗОМ — обидва">${srcLabel}</button>` : ""}
        <button class="lh-btn au ${S.autoView && S.autoView[t.id] ? "on" : ""}" data-hint="A — лінія автоматизації: гучність, панорама або фільтр змінюються з часом">A</button>
        <button class="lh-btn ex ${t.enabled ? "on" : ""}" data-hint="Чи включати MIDI цієї доріжки в експорт">${t.enabled ? "✓ MIDI" : "MIDI"}</button>
      </div>`;
    h.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) {
        e.stopPropagation();
        if (b.classList.contains("lh-more")) return trackMenu(t, e);
        if (b.classList.contains("m")) m.mute = !m.mute;
        else if (b.classList.contains("s")) m.solo = !m.solo;
        else if (b.classList.contains("src")) {
          const order = ["audio", "midi", "both"];
          m.mode = order[(order.indexOf(src) + 1) % 3];
        } else if (b.classList.contains("au")) {
          toggleAuto(t);
          return;
        } else if (b.classList.contains("ex")) {
          if (t.clone) return toast("Клон експортується разом з оригіналом; MIDI клону — у «edited arrangement».");
          patchTrack(t.id, { enabled: !t.enabled });
          return;
        }
        saveMix();
        applyGains();
        renderHeads();
        renderDock();
        return;
      }
      selectTrack(t.id);
    });
    h.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      trackMenu(t, e);
    });
    box.appendChild(h);
  }
}
function onSelectTrack() {
  renderDock();
}
function trackMenu(t, e) {
  const m = mt(t.id);
  menu(e, [
    ["Дублювати доріжку (копія з ефектами і кліпами)", () => duplicateTrack(t)],
    ["Перейменувати…", () => {
      const n = prompt("Нова назва доріжки:", t.name);
      if (!n) return;
      if (t.clone || t.gen) {
        pushUndo("перейменування");
        (t.gen ? S.mix.gens : S.mix.clones).find((c) => c.id === t.id).name = n.trim();
        _tracksKey = "";
        afterEdit(true);
      } else patchTrack(t.id, { name: n.trim() });
    }],
    ["Скинути кліпи (повернути всю доріжку)", () => {
      pushUndo("скинути кліпи");
      m.clips = [defaultClip(t)];
      afterEdit();
    }],
    ["Очистити ефекти", () => {
      pushUndo("очистити ефекти");
      m.fx = [];
      afterEdit(true);
    }],
    ["Повернути оригінальний звук (без обробки)", () => {
      pushUndo("оригінальний звук");
      m.source = null;
      afterEdit(true);
      loadAudio();
    }],
    null,
    t.gen ? [t.user ? "Видалити доріжку" : "Видалити згенеровану доріжку", () => {
      pushUndo("видалити доріжку");
      S.mix.gens = S.mix.gens.filter((g) => g.id !== t.id);
      delete S.mix.tracks[t.id];
      if (S.sel === t.id) S.sel = null;
      _tracksKey = "";
      afterEdit(true);
    }, "danger"] : t.clone ? ["Видалити доріжку-копію", () => {
      pushUndo("видалити копію");
      S.mix.clones = S.mix.clones.filter((c) => c.id !== t.id);
      delete S.mix.tracks[t.id];
      if (S.sel === t.id) S.sel = null;
      _tracksKey = "";
      afterEdit(true);
    }, "danger"] : t.recorded ? ["Видалити цей запис", () => deleteRecording(t), "danger"] : ["Видалити доріжку", () => removeTrack(t), "danger"]
  ]);
}
async function removeTrack(t) {
  const chords = t.id === "_chords";
  const copies = (S.mix.clones || []).filter((c) => c.of === t.id).length;
  const ok = await inkConfirm(`Видалити «${t.name}»?`,
    chords ? "<p>Це автоматична доріжка акордів — програма створила її з гармонії пісні. Вона зникне з редактора та з експорту.</p><p class=\"muted\">Увімкнути її знову можна галочкою «Доріжка акордів» у панелі «Проєкт → Гармонія».</p>"
      : `<p>Доріжка зникне з редактора, мікшера й експорту (MIDI, стеми, мікс).${copies ? ` Разом з нею сховаються й ${copies} її копії.` : ""}</p><p class="muted">Файли не стираються: повернути доріжку з усіма ефектами можна через «Правка → Видалені доріжки…».</p>`,
    "Видалити", true);
  if (!ok) return;
  stopPlay();
  await flushMix();
  if (S.sel === t.id || (S.mix.clones || []).some((c) => c.of === t.id && c.id === S.sel)) S.sel = null;
  _tracksKey = "";
  await buildNow(chords ? { chords_track: false } : { tracks: { [t.id]: { removed: true } } });
  toast(`Доріжку «${t.name}» видалено.`, false, ["Повернути", () => restoreTrack(t.id)]);
}
async function buildNow(patch) {
  try {
    $("#audio-status").textContent = "перерахунок…";
    S.B = await api.post(`/api/project/${S.pid}/build`, patch);
    _tracksKey = "";
    _tracksCache = null;
    const cb = document.getElementById("s-chords");
    if (cb) cb.checked = S.B.settings.chords_track !== false;
    renderEditor();
    await loadAudio();
  } catch (e) {
    toast("Не вдалося оновити проєкт: " + e.message, true);
  }
  $("#audio-status").textContent = "";
}
async function restoreTrack(id) {
  stopPlay();
  _tracksKey = "";
  await buildNow(id === "_chords" ? { chords_track: true } : { tracks: { [id]: { removed: false } } });
  toast("Доріжку повернуто.");
}
function openRemovedTracks() {
  if (!S.B) return;
  const list = (S.B.removed || []).slice();
  let m = document.getElementById("removed-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "removed-modal";
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="modal-card" style="width:min(520px,92vw)"><div class="modal-head"><h3>Видалені доріжки</h3><button class="x" data-k="x">&times;</button></div>
    <div class="modal-body"><p class="muted">Видалені доріжки не потрапляють в експорт, але їхні файли й ефекти збережені. Натисніть «Повернути», щоб доріжка знову з'явилася в проєкті.</p>
    ${list.length ? list.map((r) => `<div class="rm-row"><span class="cbar" style="background:${r.color}"></span><span class="rm-name">${escapeHtml(r.name)}</span><button class="btn small" data-r="${escapeHtml(r.id)}">Повернути</button></div>`).join("") : `<p>Немає видалених доріжок.</p>`}
    <div class="modal-actions"><button class="btn ghost" data-k="x">Закрити</button></div></div></div>`;
  m.onclick = async (e) => {
    if (e.target.dataset.k === "x" || e.target === m) m.hidden = true;
    const r = e.target.dataset.r;
    if (r) {
      m.hidden = true;
      await restoreTrack(r);
    }
  };
  m.hidden = false;
}
function duplicateTrack(t) {
  if (t.gen) {
    pushUndo("дублювання доріжки");
    const g = Plugins.clone(S.mix.gens.find((x) => x.id === t.id));
    g.id = uid("gen"); g.name = t.name + " (копія)"; g.notes = Plugins.clone(trackNotes(t));
    S.mix.gens.push(g);
    S.mix.tracks[g.id] = Plugins.clone(mt(t.id));
    S.mix.tracks[g.id].notes = null;
    S.mix.tracks[g.id].clips.forEach((c) => c.id = uid("c"));
    _tracksKey = ""; S.sel = g.id; afterEdit(true);
    return;
  }
  pushUndo("дублювання доріжки");
  const base = baseId(t);
  const id = uid(base + "__c");
  const n = S.mix.clones.filter((c) => c.of === base).length + 1;
  S.mix.clones.push({ id, of: base, name: `${findT(base).name} (копія ${n})`, color: t.color });
  S.mix.tracks[id] = Plugins.clone(mt(t.id));
  S.mix.tracks[id].clips.forEach((c) => c.id = uid("c"));
  S.mix.tracks[id].solo = false;
  _tracksKey = "";
  S.sel = id;
  afterEdit(true);
  toast("Створено копію доріжки — редагуйте її окремо (ефекти, обробка, кліпи).");
}
function menu(e, items) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "ctxmenu";
  m.id = "ctxmenu";
  for (const it of items) {
    if (!it) {
      m.appendChild(Object.assign(document.createElement("hr")));
      continue;
    }
    const b = document.createElement("button");
    b.textContent = it[0];
    if (it[2]) b.className = it[2];
    b.onclick = () => {
      closeMenu();
      it[1]();
    };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + "px";
  m.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + "px";
  setTimeout(() => document.addEventListener("mousedown", closeMenuOutside), 0);
}
function closeMenuOutside(e) {
  if (!e.target.closest("#ctxmenu")) closeMenu();
}
function closeMenu() {
  const m = $("#ctxmenu");
  if (m) m.remove();
  document.removeEventListener("mousedown", closeMenuOutside);
}
function laneTop(id) {
  let y = 0;
  for (const t of tracksAll()) {
    if (t.id === id) return y;
    y += laneHeight(t);
  }
  return -1;
}
function drawBody() {
  const B = S.B, tm = B.timing, ctx = cvBody.getContext("2d"), dpr = devicePixelRatio || 1;
  const w = cvBody.width / dpr, h = cvBody.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const b0 = scrollBeat(), b1 = b0 + w / S.ppb, bpb = tm.bpb;
  for (const s of secList()) {
    const x0 = beatToX(s.start), x1 = beatToX(s.end);
    if (x1 < 0 || x0 > w) continue;
    ctx.fillStyle = s.color + "08";
    ctx.fillRect(x0, 0, x1 - x0, h);
  }
  const step = gridStep();
  for (let b = Math.floor(b0 / step) * step; b <= b1; b += step) {
    const x = Math.round(beatToX(b));
    const isBar = Math.abs(b / bpb - Math.round(b / bpb)) < 1e-6, isBeat = Math.abs(b - Math.round(b)) < 1e-6;
    ctx.fillStyle = isBar ? "#262a34" : isBeat ? "#191c23" : "#14161b";
    ctx.fillRect(x, 0, 1, h);
  }
  let y = 0;
  for (const t of tracksAll()) {
    const lh = laneHeight(t), m = mt(t.id);
    if (S.sel === t.id) {
      ctx.fillStyle = "rgba(255,255,255,.025)";
      ctx.fillRect(0, y, w, lh);
    }
    const ah = autoH(t), ch2 = lh - ah;
    for (const c of m.clips) drawClip(ctx, t, c, y, ch2, w);
    const notes = arranged(t);
    if (t.is_drums) drawDrumsArr(ctx, t, notes, y, ch2, b0, b1);
    else drawNotesArr(ctx, t, notes, y, ch2, b0, b1);
    if (ah) drawAuto(ctx, t, y + ch2, ah, w, b0, b1);
    ctx.fillStyle = "#1f232c";
    ctx.fillRect(0, y + lh - 1, w, 1);
    y += lh;
  }
  if (S.sel && S.drag && S.drag.ghostX != null) {
    ctx.fillStyle = "#ffb547";
    ctx.fillRect(S.drag.ghostX, 0, 1, h);
  }
  const px = beatToX(S.playBeat);
  ctx.fillStyle = "#4fd1c5";
  ctx.fillRect(Math.round(px), 0, 1.5, h);
}
function clipX(c) {
  const x0 = beatToX(c.start);
  return [x0, x0 + c.dur / period() * S.ppb];
}
function drawClip(ctx, t, c, y, lh, w) {
  const [x0, x1] = clipX(c);
  if (x1 < 0 || x0 > w) return;
  const sel = S.selClips.has(c.id);
  const top = y + 2, hh = lh - 4;
  ctx.fillStyle = c.mute ? "rgba(90,96,112,.10)" : t.color + (sel ? "26" : "14");
  roundRect(ctx, x0, top, Math.max(3, x1 - x0), hh, 5);
  ctx.fill();
  ctx.strokeStyle = sel ? "#ffb547" : t.color + "55";
  ctx.lineWidth = sel ? 1.5 : 1;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = c.mute ? "#3a3f4f" : t.color + (sel ? "aa" : "66");
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x0, top, Math.max(3, x1 - x0), 12, 5);
  ctx.clip();
  ctx.fillRect(x0, top, x1 - x0, 12);
  if (x1 - x0 > 40) {
    ctx.fillStyle = "#0c0d11";
    ctx.font = "600 9px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(`${t.name}${c.gain ? ` ${c.gain > 0 ? "+" : ""}${c.gain.toFixed(1)} дБ` : ""}${c.mute ? " (вимк.)" : ""}`, Math.max(x0, 0) + 5, top + 9);
  }
  ctx.restore();
  const pk = S.audio && S.audio.peaks[srcKey(t)];
  if (pk && t.has_audio) {
    const mid = top + 12 + (hh - 12) / 2, amp = (hh - 14) * 0.45 * Math.pow(10, c.gain / 20);
    ctx.fillStyle = c.mute ? "#3a3f4f88" : t.color + (sel ? "55" : "38");
    const xa = Math.max(0, x0), xb = Math.min(w, x1);
    for (let x = xa; x < xb; x += 2) {
      const ta = c.src + (x - x0) / S.ppb * period(), tb = ta + 2 / S.ppb * period();
      if (tb < 0) continue;
      const ia = Math.max(0, Math.floor(ta * pk.rate)), ib = Math.min(pk.data.length, Math.ceil(tb * pk.rate));
      if (ia >= pk.data.length) break;
      let mx = 0;
      for (let i = ia; i < ib; i++) if (pk.data[i] > mx) mx = pk.data[i];
      let g = 1;
      const lt = (x - x0) / S.ppb * period();
      if (lt < c.fi) g = lt / c.fi;
      if (c.dur - lt < c.fo) g = Math.min(g, (c.dur - lt) / c.fo);
      const v = Math.max(0.5, Math.min(hh / 2 - 7, mx * amp * g));
      ctx.fillRect(x, mid - v, 1.5, v * 2);
    }
  }
  const fiX = x0 + c.fi / period() * S.ppb, foX = x1 - c.fo / period() * S.ppb;
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  if (c.fi > 0.02) {
    ctx.beginPath();
    ctx.moveTo(x0, top + hh);
    ctx.lineTo(fiX, top + 12);
    ctx.stroke();
  }
  if (c.fo > 0.02) {
    ctx.beginPath();
    ctx.moveTo(foX, top + 12);
    ctx.lineTo(x1, top + hh);
    ctx.stroke();
  }
  if (sel) {
    ctx.fillStyle = "#ffb547";
    ctx.fillRect(fiX - 3, top + 12, 6, 6);
    ctx.fillRect(foX - 3, top + 12, 6, 6);
  }
}
function drawNotesArr(ctx, t, notes, y, lh, b0, b1) {
  if (!notes.length) return;
  let lo = 127, hi = 0;
  for (const n of trackNotes(t)) {
    lo = Math.min(lo, n[2]);
    hi = Math.max(hi, n[2]);
  }
  lo -= 1;
  hi += 1;
  const span = Math.max(12, hi - lo + 1), pad = 16, usable = lh - pad - 6, nh = Math.max(2, Math.min(9, usable / span - 0.5));
  const col = t.enabled ? t.color : "#4b5160", mode = modeOf(t);
  for (const n of notes) {
    if (n[0] + n[1] < b0 || n[0] > b1) continue;
    const x = beatToX(n[0]), ww = Math.max(2, n[1] * S.ppb - 1), yy = y + pad + (1 - (n[2] - lo) / span) * usable - nh / 2;
    ctx.globalAlpha = (mode === "audio" && t.has_audio ? 0.35 : 0.55) + 0.45 * (n[3] / 127);
    ctx.fillStyle = col;
    ctx.fillRect(x, yy, ww, nh);
  }
  ctx.globalAlpha = 1;
}
function drawDrumsArr(ctx, t, notes, y, lh, b0, b1) {
  const rows = DRUM_ROWS.length, pad = 16, rh = (lh - pad - 4) / rows;
  ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
  DRUM_LABELS.forEach((l, i) => {
    ctx.fillStyle = "#4b5160";
    ctx.fillText(l, 4, y + pad + rh * i + rh / 2 + 3);
  });
  for (const n of notes) {
    if (n[0] < b0 - 0.5 || n[0] > b1) continue;
    const r = DRUM_ROWS.findIndex((g) => g.includes(n[2]));
    if (r < 0) continue;
    ctx.globalAlpha = 0.35 + 0.65 * (n[3] / 127);
    ctx.fillStyle = n[2] === 46 ? "#ffd27a" : t.enabled ? t.color : "#4b5160";
    ctx.fillRect(beatToX(n[0]), y + pad + rh * r + 1, Math.max(2, Math.min(7, S.ppb * 0.18)), rh - 2);
  }
  ctx.globalAlpha = 1;
}
S.tool = "select";
S.snap = 1;
S.clipboard = null;
const snapB = (b, force) => S.snap && !force ? Math.round(b / S.snap) * S.snap : b;
function hitClip(e) {
  const r = body.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let acc = 0;
  for (const t of tracksAll()) {
    const lh = laneHeight(t);
    if (y < acc + lh) {
      const clips = mt(t.id).clips;
      for (let i = clips.length - 1; i >= 0; i--) {
        const c = clips[i], [x0, x1] = clipX(c);
        if (x >= x0 - 4 && x <= x1 + 4) {
          const top = acc + 2, ly = y - top;
          const fiX = x0 + c.fi / period() * S.ppb, foX = x1 - c.fo / period() * S.ppb;
          let part = "move";
          if (S.selClips.has(c.id) && ly >= 10 && ly <= 22 && Math.abs(x - fiX) < 7) part = "fadeIn";
          else if (S.selClips.has(c.id) && ly >= 10 && ly <= 22 && Math.abs(x - foX) < 7) part = "fadeOut";
          else if (Math.abs(x - x0) < 6) part = "trimL";
          else if (Math.abs(x - x1) < 6) part = "trimR";
          return { t, c, part, beat: scrollBeat() + x / S.ppb, x, y };
        }
      }
      return { t, c: null, beat: scrollBeat() + x / S.ppb, x, y };
    }
    acc += lh;
  }
  return null;
}
body.addEventListener("mousemove", (e) => {
  if (S.drag) return;
  const h = hitClip(e);
  body.style.cursor = !h || !h.c ? "default" : S.tool === "knife" ? "crosshair" : { trimL: "w-resize", trimR: "e-resize", fadeIn: "ew-resize", fadeOut: "ew-resize", move: "grab" }[h.part];
});
body.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  closeMenu();
  const h = hitClip(e);
  if (!h) return;
  if (S.sel !== h.t.id || S.dockMaster) {
    S.dockMaster = false;
    S.sel = h.t.id;
    onSelectTrack();
    renderHeads();
    renderTrackForm();
    renderDock();
    layout();
  }
  if (!h.c) {
    if (!e.shiftKey) S.selClips.clear();
    seek(clamp(h.beat, 0, arrEnd()));
    draw();
    return;
  }
  if (S.tool === "knife") {
    splitClip(h.t, h.c, snapB(h.beat, e.altKey));
    return;
  }
  if (e.shiftKey) {
    S.selClips.has(h.c.id) ? S.selClips.delete(h.c.id) : S.selClips.add(h.c.id);
    draw();
    return;
  }
  if (!S.selClips.has(h.c.id)) {
    S.selClips.clear();
    S.selClips.add(h.c.id);
  }
  const snapshot = JSON.stringify(S.mix);
  const startState = selectedClips().map(({ c }) => ({ c, start: c.start, src: c.src, dur: c.dur, fi: c.fi, fo: c.fo }));
  S.drag = { part: h.part, beat0: h.beat, clip: h.c, startState, moved: false, snapshot };
  draw();
  const mv = (ev) => {
    const r = body.getBoundingClientRect(), b = scrollBeat() + (ev.clientX - r.left) / S.ppb;
    const free = ev.altKey, P = period();
    const d = S.drag;
    d.moved = true;
    if (d.part === "move") {
      const lead = d.startState.find((s) => s.c === d.clip);
      const ns = Math.max(0, snapB(lead.start + (b - d.beat0), free));
      const delta = ns - lead.start;
      for (const s of d.startState) s.c.start = Math.max(0, s.start + delta);
      d.ghostX = beatToX(ns);
    } else if (d.part === "trimL") {
      const s = d.startState.find((s2) => s2.c === d.clip), end = s.start + s.dur / P;
      const ns = Math.min(end - 0.05 / P, Math.max(0, snapB(b, free)));
      const delta = ns - s.start;
      s.c.start = ns;
      s.c.src = s.src + delta * P;
      s.c.dur = s.dur - delta * P;
    } else if (d.part === "trimR") {
      const s = d.startState.find((s2) => s2.c === d.clip);
      const ne = Math.max(s.start + 0.05 / P, snapB(b, free));
      s.c.dur = (ne - s.start) * P;
    } else if (d.part === "fadeIn") {
      const c = d.clip;
      c.fi = clamp((b - c.start) * P, 5e-3, c.dur / 2);
    } else if (d.part === "fadeOut") {
      const c = d.clip;
      c.fo = clamp((c.start + c.dur / P - b) * P, 5e-3, c.dur / 2);
    }
    _arrCache.clear();
    draw();
  };
  const up = () => {
    window.removeEventListener("mousemove", mv);
    window.removeEventListener("mouseup", up);
    const d = S.drag;
    S.drag = null;
    if (d && d.moved) {
      S.undo.push({ label: { move: "переміщення", trimL: "обрізання", trimR: "обрізання", fadeIn: "фейд", fadeOut: "фейд" }[d.part], state: d.snapshot });
      S.redo = [];
      afterEdit();
    } else if (d && d.part === "move") seek(clamp(d.beat0, 0, arrEnd()));
    draw();
  };
  window.addEventListener("mousemove", mv);
  window.addEventListener("mouseup", up);
});
body.addEventListener("dblclick", (e) => {
  const h = hitClip(e);
  if (h && h.c) splitClip(h.t, h.c, snapB(h.beat, e.altKey));
});
body.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const h = hitClip(e);
  if (!h) return;
  if (!h.c) return menu(e, [["Вставити тут (Ctrl+V)", () => {
    seek(snapB(h.beat));
    pasteClips();
  }], ["Скинути кліпи доріжки", () => {
    pushUndo("скинути кліпи");
    mt(h.t.id).clips = [defaultClip(h.t)];
    afterEdit();
  }]]);
  if (!S.selClips.has(h.c.id)) {
    S.selClips.clear();
    S.selClips.add(h.c.id);
    draw();
  }
  const c = h.c;
  menu(e, [
    ["Розрізати тут (S / подвійний клік)", () => splitClip(h.t, c, snapB(h.beat, e.altKey))],
    ["Дублювати (Ctrl+D)", () => duplicateClips()],
    ["Копіювати (Ctrl+C)", () => copyClips()],
    [c.mute ? "Увімкнути кліп (M)" : "Вимкнути кліп (M)", () => muteClips()],
    ["Гучність кліпу…", () => {
      const v = prompt("Гучність кліпу, дБ (наприклад −3 або 2.5):", c.gain);
      if (v === null) return;
      pushUndo("гучність кліпу");
      selectedClips().forEach((x) => x.c.gain = clamp(parseFloat(v.replace(",", ".")) || 0, -40, 18));
      afterEdit();
    }],
    ["Фейди: м'які 50 мс", () => {
      pushUndo("фейди");
      selectedClips().forEach((x) => {
        x.c.fi = 0.05;
        x.c.fo = 0.05;
      });
      afterEdit();
    }],
    ["Фейди: прибрати", () => {
      pushUndo("фейди");
      selectedClips().forEach((x) => {
        x.c.fi = 5e-3;
        x.c.fo = 5e-3;
      });
      afterEdit();
    }],
    ["Вирізати шум з цього місця (профіль шуму)", () => {
      S.sel = h.t.id;
      openProcess("denoise", { useClip: c });
    }],
    null,
    ["Видалити (Delete)", () => deleteClips(), "danger"]
  ]);
});
function selectedClips() {
  const out = [];
  for (const t of tracksAll()) for (const c of mt(t.id).clips) if (S.selClips.has(c.id)) out.push({ t, c });
  return out;
}
function splitClip(t, c, b) {
  const P = period(), end = c.start + c.dur / P;
  if (b <= c.start + 0.01 || b >= end - 0.01) return toast("Різати можна всередині кліпу.");
  pushUndo("розрізання");
  const leftDur = (b - c.start) * P;
  const right = { ...c, id: uid("c"), start: b, src: c.src + leftDur, dur: c.dur - leftDur, fi: 5e-3 };
  c.dur = leftDur;
  c.fo = 5e-3;
  const clips = mt(t.id).clips;
  clips.splice(clips.indexOf(c) + 1, 0, right);
  S.selClips.clear();
  S.selClips.add(right.id);
  afterEdit();
}
function splitAtPlayhead() {
  const sel = selectedClips();
  const targets = sel.length ? sel : S.sel ? mt(S.sel).clips.map((c) => ({ t: findT(S.sel), c })) : [];
  const P = period();
  let done = 0;
  const snap = JSON.stringify(S.mix);
  for (const { t, c } of targets) if (S.playBeat > c.start + 0.01 && S.playBeat < c.start + c.dur / P - 0.01) {
    const leftDur = (S.playBeat - c.start) * P;
    const right = { ...c, id: uid("c"), start: S.playBeat, src: c.src + leftDur, dur: c.dur - leftDur, fi: 5e-3 };
    c.dur = leftDur;
    c.fo = 5e-3;
    const cl = mt(t.id).clips;
    cl.splice(cl.indexOf(c) + 1, 0, right);
    done++;
  }
  if (done) {
    S.undo.push({ label: "розрізання", state: snap });
    S.redo = [];
    afterEdit();
  } else toast("Поставте курсор відтворення всередину кліпу (виділеного або на вибраній доріжці).");
}
function deleteClips() {
  const sel = selectedClips();
  if (!sel.length) return;
  pushUndo("видалення кліпів");
  for (const { t, c } of sel) {
    const cl = mt(t.id).clips;
    cl.splice(cl.indexOf(c), 1);
  }
  S.selClips.clear();
  afterEdit();
}
function duplicateClips() {
  const sel = selectedClips();
  if (!sel.length) return toast("Спершу виділіть кліп (клік по ньому).");
  pushUndo("дублювання кліпів");
  const P = period();
  const first = Math.min(...sel.map((s) => s.c.start)), last = Math.max(...sel.map((s) => s.c.start + s.c.dur / P));
  let shift = last - first;
  if (S.snap) shift = Math.ceil(shift / S.snap - 1e-6) * S.snap;
  S.selClips.clear();
  for (const { t, c } of sel) {
    const n = { ...c, id: uid("c"), start: c.start + shift };
    mt(t.id).clips.push(n);
    S.selClips.add(n.id);
  }
  afterEdit();
}
function copyClips() {
  const sel = selectedClips();
  if (!sel.length) return;
  S.clipboard = sel.map(({ t, c }) => ({ tid: t.id, c: { ...c } }));
  toast(`Скопійовано кліпів: ${sel.length}`);
}
function pasteClips() {
  if (!S.clipboard) return toast("Буфер порожній — спершу Ctrl+C.");
  pushUndo("вставлення");
  const first = Math.min(...S.clipboard.map((x) => x.c.start));
  S.selClips.clear();
  for (const { tid, c } of S.clipboard) {
    if (!S.mix.tracks[tid]) continue;
    const n = { ...c, id: uid("c"), start: snapB(S.playBeat) + (c.start - first) };
    S.mix.tracks[tid].clips.push(n);
    S.selClips.add(n.id);
  }
  afterEdit();
}
function muteClips() {
  const sel = selectedClips();
  if (!sel.length) return;
  pushUndo("вимкнення кліпу");
  const v = !sel[0].c.mute;
  sel.forEach((s) => s.c.mute = v);
  afterEdit();
}
function srcKey(t) {
  const m = S.mix && mt(t.id);
  return m && m.source || baseId(t);
}
function previewURL(key) {
  return key.startsWith("v") && S.versions && S.versions[key] ? `/api/project/${S.pid}/vpreview/${key}` : `/api/project/${S.pid}/audio/${key}`;
}
function ensureCtx() {
  if (S.audio && S.audio.ctx) return S.audio;
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 32e3, latencyHint: "interactive" });
  const out = ctx.createGain();
  out.gain.value = S.vol;
  out.connect(ctx.destination);
  S.audio = { ctx, out, buffers: {}, peaks: {}, sources: [], strips: {}, master: null, ibuf: new Map(), timer: null, ptr: {}, nextMetro: 0, loadedFor: null };
  DSP.ensureWorklets(ctx).then(() => rebuildStrips());
  return S.audio;
}
async function fetchBuffer(ctx, url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return ctx.decodeAudioData(await r.arrayBuffer());
}
async function loadAudio() {
  const A = ensureCtx(), pid = S.pid;
  A.loadedFor = pid;
  S.versions = await api.get(`/api/project/${pid}/versions`).catch(() => ({}));
  const keys = [...new Set(tracksAll().filter((t) => t.has_audio).map(srcKey))].filter((k) => !A.buffers[k]);
  let done = 0;
  const status = $("#audio-status");
  if (keys.length) status.textContent = `аудіо 0/${keys.length}`;
  await Promise.all(keys.map(async (k) => {
    try {
      const buf = await fetchBuffer(A.ctx, previewURL(k));
      if (A.loadedFor !== pid) return;
      A.buffers[k] = buf;
      A.peaks[k] = makePeaks(buf);
    } catch (e) {
      console.warn(e);
    }
    done++;
    status.textContent = done < keys.length ? `аудіо ${done}/${keys.length}` : "";
    draw();
  }));
  rebuildStrips();
  loadInstrumentBuffers();
}
function makePeaks(buf) {
  const rate = 200, data = buf.getChannelData(0), hop = Math.floor(buf.sampleRate / rate), out = new Float32Array(Math.ceil(data.length / hop));
  let g = 0;
  for (let i = 0; i < out.length; i++) {
    let m = 0;
    const a = i * hop, b = Math.min(data.length, a + hop);
    for (let j = a; j < b; j += 2) {
      const v = Math.abs(data[j]);
      if (v > m) m = v;
    }
    out[i] = m;
    if (m > g) g = m;
  }
  if (g > 0) for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(out[i] / g);
  return { rate, data: out };
}
async function loadInstrumentBuffers(ctx) {
  const A = ensureCtx();
  ctx = ctx || A.ctx;
  const need = [];
  const kit = await loadKitSilent();
  for (const t of tracksAll()) {
    const inst = mt(t.id).inst;
    if (!inst) continue;
    if (inst.type === "sampler" && inst.sample && !A.ibuf.has("sample:" + inst.sample)) need.push(["sample:" + inst.sample, `/api/project/${S.pid}/sample?f=${encodeURIComponent(inst.sample)}`]);
    if (inst.type === "drums" && inst.kit === "song" && kit) {
      const map = { kick: "Kick", snare: "Snare", hat: "Closed Hat", openhat: "Open Hat", crash: "Crash", ride: "Ride", tom: "Tom" };
      for (const [g, cls] of Object.entries(map)) {
        const choice = inst.pads && inst.pads[g] && inst.pads[g].sample || null;
        const smp = choice || (kit.tracks.flatMap((k) => k.samples).find((s) => s.class === cls) || {}).file;
        if (smp && !A.ibuf.has("drum:" + g + ":" + smp)) need.push(["drum:" + g + ":" + smp, `/api/project/${S.pid}/sample?f=${encodeURIComponent(smp)}`, "drum:" + g]);
        else if (smp) A.ibuf.set("drum:" + g, A.ibuf.get("drum:" + g + ":" + smp));
      }
    }
    if (inst.type === "drums" && inst.pads) for (const [g, pd] of Object.entries(inst.pads)) {
      if (pd && pd.sample && String(pd.sample).startsWith("lib:") && !A.ibuf.has("drum:" + g + ":" + pd.sample)) need.push(["drum:" + g + ":" + pd.sample, `/api/project/${S.pid}/sample?f=${encodeURIComponent(pd.sample)}`]);
    }
  }
  await Promise.all(need.map(async ([k, url, alias]) => {
    try {
      const b = await fetchBuffer(ctx, url);
      A.ibuf.set(k, b);
      if (alias) A.ibuf.set(alias, b);
    } catch (e) {
    }
  }));
}
async function loadKitSilent() {
  if (S.kit && S.kit._pid === S.pid) return S.kit;
  try {
    S.kit = await api.get(`/api/project/${S.pid}/kit`);
    S.kit._pid = S.pid;
    return S.kit;
  } catch (e) {
    return null;
  }
}
function fxEnv() {
  return { bpm: S.B.timing.bpm, tonic: S.B.key && S.B.key.tonic, mode: S.B.key && S.B.key.mode };
}
function rebuildStrips() {
  const A = S.audio;
  if (!A || !S.B || !S.mix) return;
  const ctx = A.ctx;
  if (!A.master) {
    A.master = new DSP.Strip(ctx, A.out, fxEnv());
  }
  A.master.env = fxEnv();
  A.master.setFx(S.mix.master.fx);
  A.master.setVol(S.mix.master.vol || 0, false);
  const live = new Set();
  for (const t of tracksAll()) {
    live.add(t.id);
    let st = A.strips[t.id];
    if (!st) {
      st = A.strips[t.id] = new DSP.Strip(ctx, A.master.input, fxEnv());
      st.aIn = ctx.createGain();
      st.mIn = ctx.createGain();
      st.aIn.connect(st.input);
      st.mIn.connect(st.input);
    }
    st.env = fxEnv();
    const m = mt(t.id);
    st.setFx(m.fx);
    st.setPan(m.pan);
  }
  for (const id in A.strips) if (!live.has(id)) {
    A.strips[id].dispose();
    delete A.strips[id];
  }
  applyGains();
}
function applyGains() {
  const A = S.audio;
  if (!A || !S.B || !S.mix) return;
  for (const t of tracksAll()) {
    const st = A.strips[t.id];
    if (!st) continue;
    const m = mt(t.id), mode = modeOf(t), on = audible(t);
    st.setVol(m.vol, !on);
    st.aIn.gain.value = mode === "audio" || mode === "both" ? 1 : 0;
    st.mIn.gain.value = mode === "midi" || mode === "both" ? mode === "both" ? 0.7 : 1 : 0;
  }
  if (A.master) A.master.setVol(S.mix.master.vol || 0, false);
}
function scheduleClips(ctx, t, buf, dest, P0, when0, sources) {
  const P = period();
  for (const c of mt(t.id).clips) {
    if (c.mute) continue;
    const cEnd = c.start + c.dur / P;
    if (cEnd <= P0) continue;
    let when = when0 + Math.max(0, (c.start - P0) * P);
    const into = Math.max(0, (P0 - c.start) * P);
    let off = c.src + into, remain = c.dur - into;
    if (off < 0) {
      when += -off;
      remain -= -off;
      off = 0;
    }
    if (remain <= 1e-3 || off >= buf.duration) continue;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    s.connect(g);
    g.connect(dest);
    const gv = Math.pow(10, (c.gain || 0) / 20), tau0 = into;
    if (tau0 < c.fi) {
      g.gain.setValueAtTime(gv * tau0 / c.fi, when);
      g.gain.linearRampToValueAtTime(gv, when + (c.fi - tau0));
    } else g.gain.setValueAtTime(gv, when);
    const foStart = when + Math.max(0, c.dur - c.fo - tau0);
    if (c.fo > 0) {
      g.gain.setValueAtTime(gv, Math.max(when + 1e-4, foStart));
      g.gain.linearRampToValueAtTime(0, when + (c.dur - tau0));
    }
    s.start(when, off, remain);
    sources && sources.push(s);
  }
}
function play() {
  if (!S.B) return;
  const A = ensureCtx();
  A.ctx.resume();
  if (!A.master) rebuildStrips();
  const ctx = A.ctx;
  S.startCtx = ctx.currentTime + 0.06;
  S.startBeat = S.playBeat;
  A.sources = [];
  for (const t of tracksAll()) {
    const st = A.strips[t.id];
    if (!st) continue;
    if (S.frozen && S.frozen[t.id]) {
      const fb = S.frozen[t.id], off = S.startBeat * period();
      if (off < fb.duration) {
        const s0 = ctx.createBufferSource();
        s0.buffer = fb;
        s0.connect(st.aIn);
        s0.start(S.startCtx, off);
        A.sources.push(s0);
      }
      A.ptr[t.id] = lowerBound(arranged(t), S.startBeat - 1e-6);
      continue;
    }
    if (t.has_audio) {
      const buf = A.buffers[srcKey(t)];
      if (buf) scheduleClips(ctx, t, buf, st.aIn, S.startBeat, S.startCtx, A.sources);
    }
    A.ptr[t.id] = lowerBound(arranged(t), S.startBeat - 1e-6);
  }
  A.nextMetro = Math.ceil(S.startBeat - 1e-6);
  applyGains();
  scheduleAutomation(ctx, S.startBeat, S.startCtx);
  S.playing = true;
  $("#t-play").classList.add("on");
  $("#play-ico").innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>';
  clearInterval(A.timer);
  A.timer = setInterval(schedule, 25);
  requestAnimationFrame(tick);
}
function stopPlay() {
  if (!S.audio) {
    S.playing = false;
    return;
  }
  const A = S.audio;
  clearInterval(A.timer);
  for (const s of A.sources) {
    try {
      s.stop();
    } catch (e) {
    }
  }
  A.sources = [];
  resetAutomation();
  if (S.playing) for (const id in A.strips) {
    const st = A.strips[id];
    st.mIn.disconnect();
    const n = A.ctx.createGain();
    n.connect(st.input);
    st.mIn = n;
  }
  S.playing = false;
  $("#t-play").classList.remove("on");
  $("#play-ico").innerHTML = '<path d="M7 4l13 8-13 8z" fill="currentColor"/>';
  applyGains();
}
function seek(b) {
  const was = S.playing;
  if (was) stopPlay();
  S.playBeat = b;
  updatePos();
  draw();
  if (was) play();
}
function curBeat() {
  return S.startBeat + Math.max(0, S.audio.ctx.currentTime - S.startCtx) / period();
}
function tick() {
  if (!S.playing) return;
  S.playBeat = curBeat();
  if (S.playBeat > arrEnd() + 2) {
    stopPlay();
    S.playBeat = 0;
    draw();
    updatePos();
    return;
  }
  const x = beatToX(S.playBeat), w = body.clientWidth;
  if (x > w * 0.85 || x < 0) body.scrollLeft = Math.max(0, S.playBeat * S.ppb - w * 0.15);
  updatePos();
  draw();
  drawMeters();
  requestAnimationFrame(tick);
}
function updatePos() {
  if (!S.B) return;
  const bpb = S.B.timing.bpb, b = S.playBeat;
  $("#ro-pos").textContent = `${Math.floor(b / bpb) + 1}.${Math.floor(b % bpb) + 1}.${Math.floor(b % 1 * 4) + 1}`;
}
function lowerBound(notes, b) {
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const m = lo + hi >> 1;
    if (notes[m][0] < b) lo = m + 1;
    else hi = m;
  }
  return lo;
}
function schedule() {
  const A = S.audio, ctx = A.ctx, P = period();
  const horizon = ctx.currentTime + 0.15, hBeat = S.startBeat + (horizon - S.startCtx) / P;
  for (const t of tracksAll()) {
    const notes = arranged(t), st = A.strips[t.id];
    const mode = modeOf(t);
    if (!st || !(mode === "midi" || mode === "both") || !audible(t) || S.frozen && S.frozen[t.id]) {
      A.ptr[t.id] = lowerBound(notes, hBeat);
      continue;
    }
    let i = A.ptr[t.id] || 0;
    const inst = mt(t.id).inst;
    while (i < notes.length && notes[i][0] < hBeat) {
      const n = notes[i], when = S.startCtx + (n[0] - S.startBeat) * P;
      if (when >= ctx.currentTime - 0.01) DSP.playNote(ctx, st.mIn, inst, n[2], n[3] / 127, Math.max(when, ctx.currentTime), n[1] * P, A.ibuf);
      i++;
    }
    A.ptr[t.id] = i;
  }
  if (S.metro) {
    while (A.nextMetro < hBeat) {
      const when = S.startCtx + (A.nextMetro - S.startBeat) * P;
      if (when >= ctx.currentTime - 0.01) {
        const o = ctx.createOscillator(), g = ctx.createGain(), acc = A.nextMetro % S.B.timing.bpb === 0;
        o.frequency.value = acc ? 1760 : 1180;
        g.gain.setValueAtTime(acc ? 0.35 : 0.2, when);
        g.gain.exponentialRampToValueAtTime(8e-4, when + 0.05);
        o.connect(g);
        g.connect(A.out);
        o.start(when);
        o.stop(when + 0.06);
      }
      A.nextMetro++;
    }
  } else A.nextMetro = Math.ceil(hBeat);
}
function drawMeters() {
  const A = S.audio;
  if (!A) return;
  const heads = $$("#heads .lane-head"), list = tracksAll();
  heads.forEach((h, i) => {
    const t = list[i], st = t && A.strips[t.id], cv = h.querySelector(".lh-meter");
    if (!st || !cv) return;
    const c = cv.getContext("2d"), v = Math.min(1, st.level() * 1.2);
    c.clearRect(0, 0, 6, 60);
    c.fillStyle = "#1b1e26";
    c.fillRect(0, 0, 6, 60);
    c.fillStyle = v > 0.95 ? "#f43f5e" : v > 0.7 ? "#ffb547" : "#4ade80";
    c.fillRect(0, 60 - v * 60, 6, v * 60);
  });
  const dm = $("#dock-meter");
  if (dm) {
    const st = S.dockMaster ? A.master : A.strips[S.sel];
    if (st) {
      const c = dm.getContext("2d"), v = Math.min(1, st.level() * 1.2), H = dm.height;
      c.clearRect(0, 0, dm.width, H);
      c.fillStyle = "#1b1e26";
      c.fillRect(0, 0, dm.width, H);
      c.fillStyle = v > 0.95 ? "#f43f5e" : v > 0.7 ? "#ffb547" : "#4ade80";
      c.fillRect(0, H - v * H, dm.width, v * H);
    }
  }
  if (S.liveVis) S.liveVis();
}
setInterval(() => {
  if (!S.playing && S.view === "project" && S.liveVis) S.liveVis();
}, 120);
S.dockTab = "fx";
S.dockOpen = true;
S.selFx = null;
function dockTarget() {
  if (S.dockMaster) return { master: true, m: S.mix.master, name: "Master (увесь мікс)", color: "#4fd1c5" };
  const t = S.sel && findT(S.sel);
  return t ? { t, m: mt(t.id), name: t.name, color: t.color } : null;
}
function renderDock() {
  const dock = $("#dock");
  if (!dock || !S.B || !S.mix) return;
  dock.hidden = !S.dockOpen;
  $("#t-dock").classList.toggle("on", S.dockOpen);
  if (!S.dockOpen) {
    layout();
    return;
  }
  const T = dockTarget();
  const head = $("#dock-head"), bodyEl = $("#dock-body");
  if (!T) {
    head.innerHTML = `<b>Канал</b><span class="muted">— виберіть доріжку зліва або</span><button class="btn ghost sm" id="dk-master">Master</button>`;
    bodyEl.innerHTML = `<div class="dock-empty">Тут з'являться ефекти, інструмент і обробка вибраної доріжки. Клацніть на назву доріжки ліворуч.</div>`;
    $("#dk-master").onclick = () => {
      S.dockMaster = true;
      renderDock();
    };
    return;
  }
  const tabs = T.master ? [["fx", "Ефекти"]] : [["fx", "Ефекти"], ["notes", "Ноти"], ["inst", "Інструмент (MIDI)"], ["proc", "Обробка звуку"], ["pitch", "Висота нот"], ["ver", "Версії"]];
  if (T.master) S.dockTab = "fx";
  if (!T.master && T.t && !T.t.has_audio && (S.dockTab === "proc" || S.dockTab === "ver" || S.dockTab === "pitch")) S.dockTab = "inst";
  head.innerHTML = `<i class="dk-color" style="background:${T.color}"></i><b>${escapeHtml(T.name)}</b>
    <div class="dk-tabs">${tabs.map(([k, l]) => `<button data-dt="${k}" class="${S.dockTab === k ? "active" : ""}" data-hint="${{ fx: "Ефекти цієї доріжки: еквалайзер, компресор, ревер…", notes: "Редактор нот: додати, видалити, посунути, змінити довжину й гучність", inst: "Яким інструментом грають MIDI-ноти доріжки", proc: "Автотюн, шумоподавлення, зміна тону — змінює сам запис", pitch: "Редактор висоти нот: тягніть ноти голосу вгору-вниз, вирівнюйте фальш і вібрато", ver: "Історія обробок: повернутися до будь-якої версії" }[k]}">${l}</button>`).join("")}</div>
    <span class="spacer"></span>
    <button class="btn ghost sm ${S.dockMaster ? "on" : ""}" id="dk-master" data-hint="Ефекти на весь мікс (Master)">Master</button>`;
  $$("[data-dt]", head).forEach((b) => b.onclick = () => {
    S.dockTab = b.dataset.dt;
    renderDock();
  });
  $("#dk-master").onclick = () => {
    S.dockMaster = !S.dockMaster;
    S.selFx = null;
    renderDock();
  };
  S.liveVis = null;
  if (S.dockTab === "fx") renderFxTab(bodyEl, T);
  else if (S.dockTab === "inst") renderInstTab(bodyEl, T);
  else if (S.dockTab === "notes") renderNotesTab(bodyEl, T);
  else if (S.dockTab === "proc") renderProcTab(bodyEl, T);
  else if (S.dockTab === "pitch") renderPitchTab(bodyEl, T);
  else renderVerTab(bodyEl, T);
}
function stripHTML(T) {
  const m = T.m;
  return `<div class="dk-strip">
    <canvas id="dock-meter" width="10" height="150"></canvas>
    <div class="fader"><input type="range" id="dk-vol" min="-40" max="12" step="0.1" value="${m.vol || 0}" orient="vertical" data-hint="Гучність доріжки (подвійний клік — 0 дБ)"><span id="dk-vol-v">${(m.vol || 0).toFixed(1)} дБ</span></div>
    ${T.master ? "" : `<div id="dk-pan" class="dk-pan" data-hint="Панорама: ліво — право (подвійний клік — центр)"></div>
    <div class="dk-ms"><button class="lh-btn m ${m.mute ? "on" : ""}" id="dk-m">M</button><button class="lh-btn s ${m.solo ? "on" : ""}" id="dk-s">S</button></div>`}
  </div>`;
}
function bindStrip(T) {
  const v = $("#dk-vol");
  v.oninput = () => {
    T.m.vol = +v.value;
    $("#dk-vol-v").textContent = (+v.value).toFixed(1) + " дБ";
    applyGains();
    saveMix();
  };
  v.ondblclick = () => {
    v.value = 0;
    v.oninput();
  };
  if (T.master) return;
  Plugins.controls($("#dk-pan"), [{ k: "pan", label: "Пан", min: -1, max: 1, step: 0.01, unit: "" }], T.m, (k, val) => {
    T.m.pan = val;
    const st = S.audio && S.audio.strips[T.t.id];
    if (st) st.setPan(val);
    saveMix();
  }, { pan: 0 });
  $("#dk-m").onclick = () => {
    T.m.mute = !T.m.mute;
    saveMix();
    applyGains();
    renderHeads();
    renderDock();
  };
  $("#dk-s").onclick = () => {
    T.m.solo = !T.m.solo;
    saveMix();
    applyGains();
    renderHeads();
    renderDock();
  };
}
function liveStrip(T) {
  const A = S.audio;
  if (!A) return null;
  return T.master ? A.master : A.strips[T.t.id];
}
function renderFxTab(el, T) {
  const list = T.m.fx;
  if (S.selFx && !list.find((f2) => f2.id === S.selFx)) S.selFx = null;
  if (!S.selFx && list.length) S.selFx = list[0].id;
  el.innerHTML = `${stripHTML(T)}
    <div class="rack">
      <div class="rack-head"><b>Ланцюжок ефектів</b><span class="muted small">звук іде згори вниз</span></div>
      <div class="rack-list" id="rack-list">${list.map((f2, i) => `<div class="slot ${S.selFx === f2.id ? "sel" : ""} ${f2.on ? "" : "bypass"}" data-id="${f2.id}" draggable="true" data-hint="Клік — відкрити; перетягніть, щоб змінити порядок; кружечок — увімкнути/вимкнути">
        <button class="pwr ${f2.on ? "on" : ""}" data-pwr="${f2.id}" title="Увімк./вимк.">⏻</button><i style="background:${Plugins.FX[f2.type].color}"></i>
        <span>${i + 1}. ${escapeHtml(Plugins.FX[f2.type].name)}</span><em>${escapeHtml(f2.preset || "")}</em><button class="x" data-del="${f2.id}" title="Прибрати">×</button></div>`).join("") || `<div class="rack-empty">Ефектів ще немає.<br>Додайте окремий ефект або готовий ланцюжок.</div>`}</div>
      <button class="btn primary sm wide" id="fx-add" data-hint="Відкрити бібліотеку ефектів з описами">＋ Додати ефект</button>
      <button class="btn ghost sm wide" id="fx-chain" data-hint="Кілька ефектів одразу, налаштованих під задачу (вокал, бас, мастер…)">Готові ланцюжки…</button>
    </div>
    <div class="plug" id="plug"></div>`;
  bindStrip(T);
  $("#fx-add").onclick = () => openBrowser(T);
  $("#fx-chain").onclick = (e) => menu(e, Object.keys(Plugins.CHAINS).map((name) => [name, () => {
    pushUndo("ланцюжок " + name);
    for (const [type, pr] of Plugins.CHAINS[name]) T.m.fx.push(Plugins.newFx(type, pr));
    S.selFx = T.m.fx[T.m.fx.length - 1].id;
    afterEdit(true);
    toast(`Додано ланцюжок «${name}». Підкрутіть ручки під свій смак.`);
  }]));
  $$(".slot", el).forEach((s) => {
    s.onclick = (e) => {
      if (e.target.dataset.pwr) {
        const f2 = list.find((x) => x.id === e.target.dataset.pwr);
        pushUndo("ефект увімк./вимк.");
        f2.on = !f2.on;
        afterEdit(true);
        return;
      }
      if (e.target.dataset.del) {
        pushUndo("прибрати ефект");
        T.m.fx = T.m.fx.filter((x) => x.id !== e.target.dataset.del);
        afterEdit(true);
        return;
      }
      S.selFx = s.dataset.id;
      renderDock();
    };
    s.ondragstart = (e) => e.dataTransfer.setData("text/plain", s.dataset.id);
    s.ondragover = (e) => e.preventDefault();
    s.ondrop = (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData("text/plain"), to = s.dataset.id;
      if (from === to) return;
      pushUndo("порядок ефектів");
      const a = T.m.fx.findIndex((f2) => f2.id === from), item = T.m.fx.splice(a, 1)[0], b = T.m.fx.findIndex((f2) => f2.id === to);
      T.m.fx.splice(b, 0, item);
      afterEdit(true);
    };
  });
  const f = list.find((x) => x.id === S.selFx);
  if (f) renderPlugin($("#plug"), T, f);
  else $("#plug").innerHTML = `<div class="plug-empty"><h4>Як працюють ефекти</h4><p>Кожна доріжка має свій ланцюжок: звук проходить через ефекти по черзі. Ефекти діють тільки на цю доріжку.</p><p>Типовий порядок: <b>Еквалайзер → Компресор → Сатурація → Дилей → Ревер</b>.</p><p>Що чути одразу — під час відтворення. В експорт піде точно те, що ви чуєте (у повній якості).</p></div>`;
}
function renderPlugin(el, T, f) {
  const def = Plugins.FX[f.type], i = T.m.fx.indexOf(f), st = liveStrip(T);
  el.innerHTML = `<div class="plug-head"><i style="background:${def.color}"></i><b>${escapeHtml(def.name)}</b>
      <select id="pl-preset" data-hint="Готові налаштування цього ефекту"><option value="">Пресет…</option>${Object.keys(def.presets).map((p) => `<option ${f.preset === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}</select>
      <button class="lh-btn ${f.on ? "on" : ""}" id="pl-on">${f.on ? "Увімкнено" : "Вимкнено"}</button>
      <button class="lh-btn" id="pl-info" data-hint="Що робить цей ефект і як ним користуватися">?</button></div>
    <div class="plug-info" id="pl-infobox" ${S.showInfo ? "" : "hidden"}><p>${escapeHtml(def.desc)}</p><p><b>Коли:</b> ${escapeHtml(def.when)}</p><p><b>Як:</b> ${escapeHtml(def.tips)}</p></div>
    <div class="plug-body"><canvas class="vis" id="pl-vis"></canvas><div class="ctls" id="pl-ctls"></div></div>
    ${f.type === "eq" ? `<div class="eq-bands" id="eq-bands"></div>` : ""}`;
  $("#pl-info").onclick = () => {
    S.showInfo = !S.showInfo;
    $("#pl-infobox").hidden = !S.showInfo;
  };
  $("#pl-on").onclick = () => {
    pushUndo("ефект увімк./вимк.");
    f.on = !f.on;
    afterEdit(true);
  };
  $("#pl-preset").onchange = (e) => {
    if (!e.target.value) return;
    pushUndo("пресет");
    const n = Plugins.newFx(f.type, e.target.value);
    f.params = n.params;
    f.preset = e.target.value;
    afterEdit(true);
  };
  let snapTaken = false;
  const changed = (live) => {
    if (!snapTaken) {
      pushUndo("налаштування " + def.name);
      snapTaken = true;
    }
    f.preset = null;
    const strip = liveStrip(T);
    if (strip) strip.updateFx(i, f.params);
    if (vis) vis();
    if (!live) {
      saveMix();
      snapTaken = false;
    }
  };
  const node = st && st.nodes[i];
  const vis = (Plugins.VIS[f.type] || (() => null))($("#pl-vis"), f.params, f.type === "eq" ? changed : node, fxEnv());
  if (["comp", "limiter", "gate", "tune", "harm", "deess"].includes(f.type)) S.liveVis = () => {
    const cv = $("#pl-vis");
    if (!cv) {
      S.liveVis = null;
      return;
    }
    const n = liveStrip(T) && liveStrip(T).nodes[i];
    Plugins.VIS[f.type](cv, f.params, n, fxEnv());
  };
  Plugins.controls($("#pl-ctls"), def.params, f.params, (k, v, live) => {
    f.params[k] = v;
    changed(live);
  }, def.defaults());
  if (f.type === "eq") renderEqBands($("#eq-bands"), f, changed);
}
function renderEqBands(box, f, changed) {
  const TYPES = [["highpass", "Зріз низу"], ["lowshelf", "Низ (полиця)"], ["peaking", "Дзвін"], ["highshelf", "Верх (полиця)"], ["lowpass", "Зріз верху"], ["notch", "Вирізати"]];
  box.innerHTML = f.params.bands.map((b, i) => `<div class="band ${b.on ? "" : "off"}"><label><input type="checkbox" ${b.on ? "checked" : ""} data-b="${i}" data-k="on"> ${i + 1}</label>
    <select data-b="${i}" data-k="type">${TYPES.map(([v, l]) => `<option value="${v}" ${b.type === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <input type="number" data-b="${i}" data-k="f" value="${b.f}" min="20" max="20000"> Гц <input type="number" data-b="${i}" data-k="g" value="${b.g}" step="0.5" min="-18" max="18"> дБ <input type="number" data-b="${i}" data-k="q" value="${b.q.toFixed(2)}" step="0.1" min="0.1" max="18"> Q</div>`).join("");
  $$("[data-b]", box).forEach((inp) => inp.onchange = () => {
    const b = f.params.bands[+inp.dataset.b], k = inp.dataset.k;
    b[k] = k === "on" ? inp.checked : k === "type" ? inp.value : parseFloat(inp.value);
    changed(false);
    renderDock();
  });
}
function openBrowser(T) {
  const modal = $("#browser-modal");
  const cats = {};
  for (const [k, d] of Object.entries(Plugins.FX)) (cats[d.cat] = cats[d.cat] || []).push([k, d]);
  $("#browser-body").innerHTML = `<p class="muted">Ефект додається в кінець ланцюжка доріжки <b>${escapeHtml(T.name)}</b> і діє лише на неї. Наведіть на картку — побачите, коли його використовувати.</p>` + Object.entries(cats).map(([cat, items]) => `<h4 class="br-cat">${escapeHtml(cat)}</h4><div class="br-grid">${items.map(([k, d]) => `
      <div class="br-card" data-k="${k}" style="border-top-color:${d.color}"><b>${escapeHtml(d.name)}</b><p>${escapeHtml(d.desc)}</p><p class="muted small">${escapeHtml(d.when)}</p>
      <div class="br-pre"><button class="btn primary sm" data-add="${k}">Додати</button>${Object.keys(d.presets).slice(0, 3).map((p) => `<button class="btn ghost sm" data-add="${k}" data-pr="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join("")}</div></div>`).join("")}</div>`).join("");
  $$("[data-add]", modal).forEach((b) => b.onclick = () => {
    pushUndo("додати ефект");
    const fx = Plugins.newFx(b.dataset.add, b.dataset.pr || null);
    T.m.fx.push(fx);
    S.selFx = fx.id;
    modal.hidden = true;
    S.dockTab = "fx";
    afterEdit(true);
  });
  modal.hidden = false;
}
function renderInstTab(el, T) {
  const t = T.t, m = T.m;
  if (!m.inst) m.inst = Plugins.defaultInstrument(t);
  const inst = m.inst;
  const mode = modeOf(t);
  const warn = t.has_audio && mode === "audio" ? `<div class="inst-warn">Зараз ця доріжка звучить оригіналом. Щоб чути інструмент, натисніть <b>ОРИГ</b> на доріжці (стане MIDI або РАЗОМ) або <button class="link" id="to-midi">увімкнути MIDI тут</button>.</div>` : "";
  el.innerHTML = `${stripHTML(T)}<div class="inst">
    ${warn}
    <div class="inst-type">${[["synth", "Синтезатор", "Багато пресетів: піаніно, бас, пади, ліди, струнні…"], ["sampler", "Семплер (звук з пісні)", "Грає нотами будь-який семпл, вирізаний з цієї пісні"], ["drums", "Драм-кіт", "Удари з пісні або синтезовані 808 / акустичні"]].map(([k, l, h]) => `<button data-it="${k}" class="${inst.type === k ? "active" : ""}" data-hint="${h}">${l}</button>`).join("")}</div>
    <div id="inst-body"></div>
    <div class="kbd-strip" id="kbd" data-hint="Клацніть клавішу — почуєте інструмент"></div>
  </div>`;
  bindStrip(T);
  const tm = $("#to-midi");
  if (tm) tm.onclick = () => {
    m.mode = "midi";
    saveMix();
    applyGains();
    renderHeads();
    renderDock();
  };
  $$("[data-it]", el).forEach((b) => b.onclick = () => {
    pushUndo("тип інструмента");
    if (b.dataset.it === "synth") m.inst = { type: "synth", preset: "Плак", params: Plugins.presetByName("Плак") };
    else if (b.dataset.it === "drums") m.inst = { type: "drums", kit: "song", pads: {} };
    else m.inst = { type: "sampler", sample: null, params: { root: 60, tune: 0, gain: 0.8, amp: { a: 2e-3, d: 0.2, s: 1, r: 0.2 }, oneshot: false } };
    afterEdit();
    renderDock();
    loadInstrumentBuffers();
  });
  const box = $("#inst-body");
  if (inst.type === "synth") renderSynth(box, T);
  else if (inst.type === "sampler") renderSampler(box, T);
  else renderDrums(box, T);
  renderKeyboard($("#kbd"), T);
}
function audition(T, pitch, vel = 0.8) {
  const A = ensureCtx();
  A.ctx.resume();
  if (!A.strips[T.t.id]) rebuildStrips();
  const st = A.strips[T.t.id];
  const g = A.ctx.createGain();
  g.connect(st.input);
  DSP.playNote(A.ctx, g, T.m.inst, pitch, vel, A.ctx.currentTime + 0.01, 0.5, A.ibuf);
}
function renderKeyboard(box, T) {
  if (T.m.inst.type === "drums") {
    box.innerHTML = "";
    return;
  }
  const lo = 36, hi = 84;
  let html = "";
  for (let p = lo; p <= hi; p++) {
    const black = [1, 3, 6, 8, 10].includes(p % 12);
    html += `<button class="${black ? "bk" : "wk"}" data-p="${p}" title="${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}">${p % 12 === 0 ? "C" + (p / 12 - 1) : ""}</button>`;
  }
  box.innerHTML = html;
  $$("button", box).forEach((b) => b.onmousedown = () => audition(T, +b.dataset.p));
}
function renderSynth(box, T) {
  const inst = T.m.inst, P = inst.params;
  const WAVES = [["sine", "∿ синус"], ["triangle", "△ трикутник"], ["sawtooth", "⩘ пила"], ["square", "⊓ квадрат"]];
  box.innerHTML = `<div class="syn">
    <div class="syn-presets">${Object.entries(Plugins.SYNTH_PRESETS).map(([g, items]) => `<div class="sp-group"><span>${escapeHtml(g)}</span>${Object.keys(items).map((n) => `<button class="chip ${inst.preset === n ? "active" : ""}" data-pr="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("")}</div>`).join("")}</div>
    <div class="syn-grid">
      <div class="syn-sec"><h6>Осцилятори <span class="muted">(джерело звуку)</span></h6>${P.osc.map((o, i) => `<div class="osc" data-o="${i}"><select data-ok="type">${WAVES.map(([v, l]) => `<option value="${v}" ${o.type === v ? "selected" : ""}>${l}</option>`).join("")}</select><div class="ctls mini" id="osc${i}"></div></div>`).join("")}
        <div class="ctls mini" id="syn-extra"></div></div>
      <div class="syn-sec"><h6>Фільтр <span class="muted">(тембр: темніше / яскравіше)</span></h6><canvas class="vis small" id="syn-fvis"></canvas><div class="ctls mini" id="syn-filter"></div><h6>Огинаюча фільтра</h6><canvas class="vis small" id="syn-fenv"></canvas></div>
      <div class="syn-sec"><h6>Гучність у часі (ADSR) <span class="muted">— тягніть точки</span></h6><canvas class="vis small" id="syn-amp"></canvas>
        <p class="muted small">A — наростання, D — спад, S — рівень утримання, R — затухання після відпускання ноти.</p><div class="ctls mini" id="syn-fm"></div></div>
    </div></div>`;
  let taken = false;
  const changed = (live) => {
    if (!taken) {
      pushUndo("налаштування синта");
      taken = true;
    }
    inst.preset = inst.preset && !live ? inst.preset : inst.preset;
    if (!live) {
      saveMix();
      taken = false;
    }
  };
  $$("[data-pr]", box).forEach((b) => b.onclick = () => {
    pushUndo("пресет інструмента");
    inst.preset = b.dataset.pr;
    inst.params = Plugins.presetByName(b.dataset.pr);
    saveMix();
    renderDock();
    audition(T, T.t.role === "bass" ? 40 : 60);
  });
  P.osc.forEach((o, i) => {
    Plugins.controls($("#osc" + i), [{ k: "oct", label: "Октава", min: -2, max: 2, step: 1, unit: "" }, { k: "detune", label: "Розстр.", min: -50, max: 50, step: 1, unit: "ц" }, { k: "gain", label: "Рівень", min: 0, max: 1, step: 0.01, pct: true, unit: "%" }], o, (k, v, live) => {
      o[k] = v;
      changed(live);
    });
    box.querySelector(`[data-o="${i}"] select`).onchange = (e) => {
      o.type = e.target.value;
      changed(false);
      audition(T, 60);
    };
  });
  Plugins.controls($("#syn-extra"), [{ k: "unison", label: "Унісон", min: 1, max: 5, step: 1, unit: "", hint: "Кількість голосів на ноту (товщина)" }, { k: "spread", label: "Розкид", min: 0, max: 60, step: 1, unit: "ц", hint: "Розстройка голосів унісону" }, { k: "sub", label: "Саб", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Синус на октаву нижче" }, { k: "noise", label: "Шум", min: 0, max: 0.3, step: 5e-3, pct: true, unit: "%", hint: "Додати шум (дихання, атака)" }, { k: "drive", label: "Драйв", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Перевантаження" }, { k: "gain", label: "Гучність", min: 0.02, max: 0.8, step: 0.01, pct: true, unit: "%", hint: "Гучність інструмента" }], P, (k, v, live) => {
    P[k] = v;
    changed(live);
  });
  const fvis = () => Plugins.VIS.filter($("#syn-fvis"), { type: P.filter.type, cutoff: P.filter.cutoff, q: P.filter.q, depth: 0 });
  Plugins.controls($("#syn-filter"), [{ k: "type", label: "Тип", options: [["lowpass", "Low-pass"], ["highpass", "High-pass"], ["bandpass", "Band-pass"]] }, { k: "cutoff", label: "Частота", min: 40, max: 18e3, step: 1, unit: "Гц", log: true, hint: "Частота зрізу фільтра" }, { k: "q", label: "Резонанс", min: 0.1, max: 15, step: 0.01, unit: "", log: true }, { k: "env", label: "Огин.", min: 0, max: 5, step: 0.05, unit: "окт", hint: "Наскільки огинаюча відкриває фільтр (плаки, «вау»)" }, { k: "keytrack", label: "Трекінг", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Вищі ноти — яскравіші" }], P.filter, (k, v, live) => {
    P.filter[k] = v;
    fvis();
    changed(live);
  });
  fvis();
  Plugins.adsrVis($("#syn-fenv"), P.fenv, changed, "#4fd1c5");
  Plugins.adsrVis($("#syn-amp"), P.amp, changed);
  Plugins.controls($("#syn-fm"), [{ k: "ratio", label: "FM ratio", min: 0.5, max: 16, step: 0.01, unit: "", hint: "FM-синтез: співвідношення частот (дзвони, Rhodes)" }, { k: "index", label: "FM глиб.", min: 0, max: 6, step: 0.01, unit: "", hint: "Сила FM — металевість звуку" }, { k: "decay", label: "FM спад", min: 0.01, max: 3, step: 0.01, unit: "с" }], P.fm, (k, v, live) => {
    P.fm[k] = v;
    changed(live);
  });
}
async function renderSampler(box, T) {
  const inst = T.m.inst, P = inst.params;
  const kit = await loadKitSilent();
  if (!box.isConnected) return;
  const all = kit ? kit.tracks.flatMap((k) => k.samples.map((s) => ({ ...s, track: k.name }))) : [];
  box.innerHTML = `<div class="smp-inst">
    <div><h6>Семпл</h6><select id="sm-file" data-hint="Звук, який гратиме ноти доріжки"><option value="">— виберіть звук з пісні —</option>${all.map((s) => `<option value="${escapeHtml(s.file)}" ${inst.sample === s.file ? "selected" : ""}>${escapeHtml(s.track)} · ${escapeHtml(s.name)}${s.root_name ? " (root " + s.root_name + ")" : ""}</option>`).join("")}</select>
    <p class="muted small">Root — нота, на якій семпл звучить у своїй висоті. Для «note»-семплів вона виставляється автоматично.</p><canvas class="vis small" id="sm-wave"></canvas></div>
    <div><div class="ctls mini" id="sm-ctls"></div><h6>Гучність у часі (ADSR)</h6><canvas class="vis small" id="sm-amp"></canvas></div></div>`;
  const drawWave = () => {
    const b = S.audio && S.audio.ibuf.get("sample:" + inst.sample);
    const cv = $("#sm-wave");
    if (!cv) return;
    const dpr = devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr;
    cv.height = cv.clientHeight * dpr;
    const c = cv.getContext("2d");
    c.scale(dpr, dpr);
    if (!b) return;
    const d = b.getChannelData(0), w = cv.clientWidth, h = cv.clientHeight, st = Math.ceil(d.length / w);
    c.fillStyle = T.color;
    for (let x = 0; x < w; x++) {
      let mx = 0;
      for (let j = x * st; j < (x + 1) * st && j < d.length; j++) mx = Math.max(mx, Math.abs(d[j]));
      c.fillRect(x, h / 2 - mx * h / 2, 1, mx * h);
    }
  };
  $("#sm-file").onchange = async (e) => {
    pushUndo("семпл");
    inst.sample = e.target.value || null;
    const s = all.find((x) => x.file === inst.sample);
    if (s && s.root) P.root = s.root;
    saveMix();
    await loadInstrumentBuffers();
    renderDock();
    audition(T, P.root);
  };
  let taken = false;
  const changed = (live) => {
    if (!taken) {
      pushUndo("семплер");
      taken = true;
    }
    if (!live) {
      saveMix();
      taken = false;
    }
  };
  Plugins.controls($("#sm-ctls"), [{ k: "root", label: "Root", min: 24, max: 96, step: 1, unit: "", hint: "Нота оригінальної висоти семпла" }, { k: "tune", label: "Тон", min: -12, max: 12, step: 0.1, unit: "пт", hint: "Підстроювання в півтонах" }, { k: "gain", label: "Гучність", min: 0.05, max: 1.5, step: 0.01, pct: true, unit: "%" }, { k: "oneshot", label: "One-shot", toggle: true, hint: "Грати семпл до кінця незалежно від довжини ноти" }], P, (k, v, live) => {
    P[k] = v;
    changed(live);
  });
  Plugins.adsrVis($("#sm-amp"), P.amp, changed);
  drawWave();
}
async function renderDrums(box, T) {
  const inst = T.m.inst;
  inst.pads = inst.pads || {};
  const kit = await loadKitSilent();
  if (!box.isConnected) return;
  const drumSmp = kit ? kit.tracks.flatMap((k) => k.samples.filter((s) => s.kind === "drum")) : [];
  S.selPad = S.selPad || "kick";
  box.innerHTML = `<div class="drums">
    <div><h6>Набір</h6><div class="seg small" id="kit-seg">${[["song", "Удари з пісні"], ["808", "808 (синт)"], ["acoustic", "Акустичний (синт)"]].map(([k, l]) => `<button data-kit="${k}" class="${inst.kit === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="pads">${Plugins.DRUM_PADS.map(([g, l, n]) => `<button class="pad ${S.selPad === g ? "sel" : ""} ${(inst.pads[g] || {}).mute ? "muted" : ""}" data-pad="${g}" data-n="${n}" data-hint="Клік — послухати і налаштувати пад «${l}»">${l}</button>`).join("")}</div></div>
    <div><h6>Пад: ${escapeHtml((Plugins.DRUM_PADS.find((p) => p[0] === S.selPad) || [])[1] || "")}</h6><div class="ctls mini" id="pad-ctls"></div>
      ${inst.kit === "song" && drumSmp.length ? `<select id="pad-smp" data-hint="Який семпл з пісні грає цей пад"><option value="">авто (найкращий удар)</option>${drumSmp.map((s) => `<option value="${escapeHtml(s.file)}" ${(inst.pads[S.selPad] || {}).sample === s.file ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>` : ""}
      <p class="muted small">Барабанні MIDI-ноти вже розкладені: бочка, малий, хети, тарілки, томи. Тут ви вирішуєте, як вони звучать.</p></div></div>`;
  $$("[data-kit]", box).forEach((b) => b.onclick = async () => {
    pushUndo("драм-кіт");
    inst.kit = b.dataset.kit;
    saveMix();
    await loadInstrumentBuffers();
    renderDock();
  });
  $$("[data-pad]", box).forEach((b) => b.onclick = () => {
    S.selPad = b.dataset.pad;
    audition(T, +b.dataset.n, 0.9);
    renderDock();
  });
  const pad = inst.pads[S.selPad] = Object.assign({ vol: 1, tune: 0, decay: 1, pan: 0, mute: false }, inst.pads[S.selPad] || {});
  let taken = false;
  const changed = (live) => {
    if (!taken) {
      pushUndo("пад");
      taken = true;
    }
    if (!live) {
      saveMix();
      taken = false;
    }
  };
  Plugins.controls($("#pad-ctls"), [{ k: "vol", label: "Гучність", min: 0, max: 1.5, step: 0.01, pct: true, unit: "%" }, { k: "tune", label: "Тон", min: -12, max: 12, step: 0.1, unit: "пт" }, { k: "decay", label: "Довжина", min: 0.1, max: 1, step: 0.01, pct: true, unit: "%" }, { k: "pan", label: "Пан", min: -1, max: 1, step: 0.01, unit: "" }, { k: "mute", label: "Вимк.", toggle: true }], pad, (k, v, live) => {
    pad[k] = v;
    changed(live);
    if (!live && k !== "mute") audition(T, +$(`[data-pad="${S.selPad}"]`).dataset.n, 0.9);
  });
  const ps = $("#pad-smp");
  if (ps) ps.onchange = async () => {
    pushUndo("семпл пада");
    pad.sample = ps.value || null;
    saveMix();
    await loadInstrumentBuffers();
    audition(T, +$(`[data-pad="${S.selPad}"]`).dataset.n, 0.9);
  };
}
const PROC = {
  autotune: {
    name: "Автотюн",
    icon: "◎",
    desc: "Підтягує висоту голосу до нот тональності. Повільно (60–150 мс) — природна корекція; 0 мс — роботизований ефект як у T-Pain.",
    params: () => [
      { k: "tonic", label: "Тоніка", options: NOTE_NAMES.map((n, i) => [i, n]) },
      { k: "scale", label: "Лад", options: [["major", "мажор"], ["minor", "мінор"], ["harmonic_minor", "гарм. мінор"], ["dorian", "дорійський"], ["mixolydian", "міксолідійський"], ["pentatonic_major", "пентатоніка мажор"], ["pentatonic_minor", "пентатоніка мінор"], ["blues", "блюз"], ["chromatic", "хроматика (усі ноти)"]] },
      { k: "strength", label: "Сила", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Наскільки сильно тягнути до ноти" },
      { k: "speed_ms", label: "Швидкість", min: 0, max: 200, step: 1, unit: "мс", hint: "0 — миттєво (робот), 20–60 — поп, 100+ — непомітно" },
      { k: "humanize", label: "Природність", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Зберігає вібрато та живі коливання" }
    ],
    defaults: () => ({ tonic: S.B.key.tonic, scale: S.B.key.mode, strength: 1, speed_ms: 25, humanize: 0.35 }),
    presets: { "Природний": { strength: 0.8, speed_ms: 60, humanize: 0.6 }, "Поп": { strength: 1, speed_ms: 20, humanize: 0.3 }, "Робот (жорсткий)": { strength: 1, speed_ms: 0, humanize: 0 } }
  },
  pitch: {
    name: "Зміна тону",
    icon: "↕",
    desc: "Транспонує доріжку вгору або вниз без зміни темпу. Для голосу — режим «голос» (зберігає тембр), для інструментів — «інструмент».",
    params: () => [{ k: "semitones", label: "Півтони", min: -12, max: 12, step: 0.5, unit: "пт", hint: "+12 — октава вгору, −12 — октава вниз" }, { k: "mode", label: "Режим", options: [["voice", "голос (одноголосся)"], ["instrument", "інструмент / акорди"]] }],
    defaults: () => ({ semitones: 2, mode: "voice" }),
    presets: { "+1 тон": { semitones: 2 }, "−1 тон": { semitones: -2 }, "Октава вниз": { semitones: -12 }, "Октава вгору": { semitones: 12 } }
  },
  denoise: {
    name: "Шумоподавлення",
    icon: "≋",
    desc: "Прибирає постійний шум: шипіння, гул, фон. Найточніше — якщо дати зразок шуму: клацніть правою кнопкою на кліпі в місці, де лише шум, → «Вирізати шум з цього місця».",
    params: () => [{ k: "amount_db", label: "Сила", min: 3, max: 30, step: 0.5, unit: "дБ", hint: "Наскільки приглушити шум" }, { k: "sensitivity", label: "Поріг", min: 0.5, max: 3, step: 0.05, unit: "", hint: "Більше — обережніше (менше зачіпає голос)" }],
    defaults: () => ({ amount_db: 14, sensitivity: 1.5 }),
    presets: { "Легко": { amount_db: 8, sensitivity: 2 }, "Середньо": { amount_db: 14, sensitivity: 1.5 }, "Сильно": { amount_db: 24, sensitivity: 1.1 } }
  },
  debleed: {
    name: "Прибрати інші інструменти",
    icon: "⫶",
    desc: "Порівнює доріжку з рештою стемів і приглушує залишки інших інструментів, що «протекли» під час розділення (наприклад, барабани у вокалі).",
    params: () => [{ k: "strength", label: "Сила", min: 0.2, max: 4, step: 0.05, unit: "×" }, { k: "reduction_db", label: "Глибина", min: 6, max: 40, step: 1, unit: "дБ" }],
    defaults: () => ({ strength: 1, reduction_db: 18 }),
    presets: { "Обережно": { strength: 0.6, reduction_db: 12 }, "Сильно": { strength: 2, reduction_db: 30 } }
  },
  deess: {
    name: "Де-есер",
    icon: "ѕ",
    desc: "Приглушує різкі «с», «ш», «ц» у вокалі, не чіпаючи решту.",
    params: () => [{ k: "amount_db", label: "Сила", min: 2, max: 20, step: 0.5, unit: "дБ" }, { k: "freq", label: "Від частоти", min: 3e3, max: 1e4, step: 50, unit: "Гц", log: true }, { k: "sensitivity", label: "Чутливість", min: 0, max: 1, step: 0.01, pct: true, unit: "%" }],
    defaults: () => ({ amount_db: 8, freq: 5e3, sensitivity: 0.5 }),
    presets: {}
  },
  gate: {
    name: "Тиша між фразами",
    icon: "▁",
    desc: "Робить паузи по-справжньому тихими: глушить усе, що тихіше за поріг.",
    params: () => [{ k: "threshold_db", label: "Поріг", min: -80, max: -10, step: 0.5, unit: "дБ" }, { k: "release_ms", label: "Відпуск", min: 20, max: 600, step: 5, unit: "мс" }, { k: "range_db", label: "Глибина", min: 6, max: 80, step: 1, unit: "дБ" }],
    defaults: () => ({ threshold_db: -45, release_ms: 150, range_db: 40 }),
    presets: {}
  },
  normalize: { name: "Нормалізація", icon: "⇕", desc: "Піднімає гучність так, щоб найгучніше місце було на заданому рівні.", params: () => [{ k: "peak_db", label: "Пік", min: -12, max: 0, step: 0.1, unit: "дБ" }], defaults: () => ({ peak_db: -1 }), presets: {} },
  gain: { name: "Гучність запису", icon: "±", desc: "Змінює гучність самого запису (до ефектів).", params: () => [{ k: "db", label: "Гучність", min: -24, max: 24, step: 0.1, unit: "дБ" }], defaults: () => ({ db: 3 }), presets: {} },
  reverse: { name: "Реверс", icon: "⇆", desc: "Розвертає запис задом наперед — для ефектних переходів (наприклад, реверс-тарілка або вокал).", params: () => [], defaults: () => ({}), presets: {} }
};
function renderProcTab(el, T) {
  const m = T.m, v = m.source && S.versions && S.versions[m.source];
  el.innerHTML = `${stripHTML(T)}<div class="proc">
    <div class="proc-state">${v ? `Зараз звучить: <b>${escapeHtml(v.chain.join(" → "))}</b> <button class="link" id="pr-orig">повернути оригінал</button>` : "Зараз звучить: <b>оригінальний стем</b>. Кожна обробка створює нову версію — оригінал не змінюється."}</div>
    <div class="proc-grid">${Object.entries(PROC).map(([k, d]) => `<button class="proc-card" data-op="${k}" data-hint="${escapeHtml(d.desc)}"><span class="pi">${d.icon}</span><b>${escapeHtml(d.name)}</b><span class="muted small">${escapeHtml(d.desc.split(".")[0])}.</span></button>`).join("")}</div>
    <p class="muted small">Обробка застосовується до поточної версії звуку цієї доріжки (можна робити кілька підряд: шумоподавлення → автотюн → де-есер). Ефекти з вкладки «Ефекти» діють поверх.</p></div>`;
  bindStrip(T);
  const o = $("#pr-orig");
  if (o) o.onclick = () => {
    pushUndo("оригінальний звук");
    m.source = null;
    afterEdit(true);
    loadAudio();
    renderDock();
  };
  $$("[data-op]", el).forEach((b) => b.onclick = () => openProcess(b.dataset.op));
}
function openProcess(op, opts = {}) {
  const T = opts.target || dockTarget() || { t: findT(S.sel), m: mt(S.sel) };
  if (!T.t) return toast("Виберіть доріжку.");
  if (!T.t.has_audio) return toast("Обробка звуку доступна для доріжок із записом (не для MIDI-акордів).");
  const d = PROC[op], P = d.defaults();
  const modal = $("#proc-modal");
  $("#proc-title").textContent = `${d.name} — ${T.t.name}`;
  const clip = opts.useClip;
  $("#proc-body").innerHTML = `<p>${escapeHtml(d.desc)}</p>${clip ? `<p class="inst-warn">Зразок шуму: кліп з ${clip.src.toFixed(2)} с до ${(clip.src + Math.min(clip.dur, 4)).toFixed(2)} с запису. Переконайтесь, що там лише шум, без голосу.</p>` : ""}
    ${Object.keys(d.presets).length ? `<div class="br-pre">${Object.keys(d.presets).map((p) => `<button class="btn ghost sm" data-pp="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join("")}</div>` : ""}
    <div class="ctls" id="proc-ctls"></div>
    <div class="pv" data-hint="Прослуховування фрагмента до застосування. Змінюйте ручки — звук оновиться сам за секунду-дві">
      <div class="pv-row">
        <button class="btn primary sm" id="pv-play">▶ Прослухати</button>
        <div class="seg small" id="pv-ab" data-hint="Миттєве порівняння: До — без обробки, Після — з обробкою (клавіша A)"><button data-ab="a">До</button><button data-ab="b" class="active">Після</button></div>
        <select id="pv-where" data-hint="Який фрагмент слухати">
          <option value="cursor">від курсору відтворення</option><option value="loud">найгучніше місце</option>${clip || selectedClips().some((x) => x.t.id === T.t.id) ? '<option value="clip">виділений кліп</option>' : ""}
        </select>
        <select id="pv-len" data-hint="Довжина фрагмента"><option value="6">6 с</option><option value="10" selected>10 с</option><option value="16">16 с</option></select>
        <label class="pv-fx" data-hint="Слухати разом з ефектами доріжки (еквалайзер, ревер тощо)"><input type="checkbox" id="pv-fx" checked> з ефектами доріжки</label>
      </div>
      <div class="pv-bar"><div id="pv-pos"></div></div>
      <div class="muted small" id="pv-status">Натисніть «Прослухати». Фрагмент грає по колу; ручки можна крутити під час прослуховування.</div>
    </div>
    <div class="proc-run"><button class="btn primary" id="proc-go">Застосувати до всієї доріжки</button><span class="muted" id="proc-status"></span><div class="pbar"><div id="proc-bar"></div></div></div>`;
  const pv = previewer(T, op, P, clip);
  const draw2 = () => Plugins.controls($("#proc-ctls"), d.params(), P, (k, v, live) => {
    P[k] = k === "tonic" ? +v : v;
    if (!live) pv.changed();
  });
  draw2();
  $$("[data-pp]", modal).forEach((b) => b.onclick = () => {
    Object.assign(P, d.presets[b.dataset.pp]);
    draw2();
    pv.changed();
  });
  modal.querySelector("[data-close]").onclick = () => { pv.stop(); modal.hidden = true; };
  $("#proc-go").onclick = async () => {
    pv.stop();
    const btn = $("#proc-go");
    btn.disabled = true;
    if (clip) P.region = [Math.max(0, clip.src), Math.max(0, clip.src) + Math.min(clip.dur, 4)];
    $("#proc-status").textContent = "Обробка…";
    try {
      const r = await api.post(`/api/project/${S.pid}/process`, { base: baseId(T.t), source: T.m.source, op, params: P });
      let j;
      while (true) {
        await new Promise((res) => setTimeout(res, 400));
        j = await api.get(`/api/process/${r.job}`);
        $("#proc-bar").style.width = j.progress * 100 + "%";
        if (j.status !== "running") break;
      }
      if (j.status === "error") throw new Error(j.error);
      pushUndo(d.name);
      S.versions = await api.get(`/api/project/${S.pid}/versions`);
      T.m.source = j.result.vid;
      await loadAudio();
      afterEdit(true);
      const stats = j.result.stats || {};
      toast(`${d.name}: готово${stats.avg_correction_cents ? ` (середня корекція ${stats.avg_correction_cents} центів)` : ""}${stats.gain_db ? ` (${stats.gain_db > 0 ? "+" : ""}${stats.gain_db} дБ)` : ""}. Порівняйте з оригіналом у вкладці «Версії».`);
      modal.hidden = true;
      S.dockTab = "proc";
      renderDock();
    } catch (e) {
      toast("Помилка обробки: " + e.message, true);
      $("#proc-status").textContent = "";
      btn.disabled = false;
    }
  };
  modal.hidden = false;
}
function previewer(T, op, P, clip) {
  const A = ensureCtx(), ctx = A.ctx, Pd = period();
  let bufA = null, bufB = null, srcs = [], gA = null, gB = null, playing = false, startedAt = 0, offset = 0, ab = "b", req = 0, timer = null, raf = 0, win = null;
  const status = (t) => { const el = $("#pv-status"); if (el) el.textContent = t; };
  function songTimeAtCursor() {
    const c = mt(T.t.id).clips.find((c) => S.playBeat >= c.start && S.playBeat < c.start + c.dur / Pd);
    return c ? c.src + (S.playBeat - c.start) * Pd : Math.max(0, S.playBeat * Pd - S.B.timing.pad);
  }
  function loudest(len) {
    const pk = A.peaks[srcKey(T.t)];
    if (!pk) return 0;
    const w = Math.max(1, Math.round(len * pk.rate));
    let sum = 0, best = 0, bi = 0;
    for (let i = 0; i < pk.data.length; i++) { sum += pk.data[i]; if (i >= w) sum -= pk.data[i - w]; if (i >= w - 1 && sum > best) { best = sum; bi = i - w + 1; } }
    return bi / pk.rate;
  }
  function windowNow() {
    const where = $("#pv-where").value, len = +$("#pv-len").value;
    if (where === "clip") {
      const c = clip || (selectedClips().find((x) => x.t.id === T.t.id) || {}).c;
      if (c) return [Math.max(0, c.src), Math.min(c.dur, 20)];
    }
    if (where === "loud") return [loudest(len), len];
    const t = songTimeAtCursor();
    return [t > 0.05 ? t : loudest(len), len];
  }
  async function fetchWav(o, params, w) {
    const r = await fetch(`/api/project/${S.pid}/preview`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base: baseId(T.t), source: T.m.source, op: o, params, start: w[0], dur: w[1] }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.statusText); }
    return ctx.decodeAudioData(await r.arrayBuffer());
  }
  async function render(full) {
    const id = ++req;
    const w = windowNow();
    const params = { ...P };
    if (clip && op === "denoise") params.region = [Math.max(0, clip.src), Math.max(0, clip.src) + Math.min(clip.dur, 4)];
    status("Обробляю фрагмент…");
    try {
      const sameWin = win && win[0] === w[0] && win[1] === w[1];
      const [a, b] = await Promise.all([sameWin && bufA && !full ? bufA : fetchWav("none", {}, w), fetchWav(op, params, w)]);
      if (id !== req) return;
      bufA = a; bufB = b; win = w;
      const m = Math.floor(w[0] / 60), sec = (w[0] % 60).toFixed(1).padStart(4, "0");
      status(`Фрагмент ${m}:${sec} – ${w[1]} с. ${ab === "b" ? "Звучить: ПІСЛЯ обробки" : "Звучить: ДО обробки"}. Клавіша A — перемкнути.`);
      if (playing) start(currentOffset());
    } catch (e) { if (id === req) status("Помилка: " + e.message); }
  }
  function currentOffset() { return bufA ? ((ctx.currentTime - startedAt) + offset) % bufA.duration : 0; }
  function dest() {
    if ($("#pv-fx") && $("#pv-fx").checked) { if (!A.strips[T.t.id]) rebuildStrips(); const st = A.strips[T.t.id]; if (st) return st.input; }
    return A.out;
  }
  function killSources() { for (const s of srcs) { try { s.stop(); } catch (e) {} } srcs = []; }
  function start(off) {
    killSources();
    if (!bufA || !bufB) return;
    const d = dest();
    gA = ctx.createGain(); gB = ctx.createGain(); gA.connect(d); gB.connect(d);
    gA.gain.value = ab === "a" ? 1 : 0; gB.gain.value = ab === "b" ? 1 : 0;
    const t0 = ctx.currentTime + 0.03;
    for (const [buf, g] of [[bufA, gA], [bufB, gB]]) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(g); s.start(t0, off % buf.duration); srcs.push(s); }
    startedAt = t0; offset = off;
    cancelAnimationFrame(raf);
    const tickPv = () => { if (!playing) return; const el = $("#pv-pos"); if (el && bufA) el.style.width = (currentOffset() / bufA.duration * 100) + "%"; raf = requestAnimationFrame(tickPv); };
    tickPv();
  }
  function setAB(v) {
    ab = v;
    $$("#pv-ab button").forEach((b) => b.classList.toggle("active", b.dataset.ab === v));
    if (gA && gB) { const now = ctx.currentTime; gA.gain.setTargetAtTime(v === "a" ? 1 : 0, now, 0.01); gB.gain.setTargetAtTime(v === "b" ? 1 : 0, now, 0.01); }
    if (win) render.lastStatus = status(`${v === "b" ? "Звучить: ПІСЛЯ обробки" : "Звучить: ДО обробки"}. Клавіша A — перемкнути.`);
  }
  function stop() {
    playing = false; killSources(); cancelAnimationFrame(raf); clearTimeout(timer);
    document.removeEventListener("keydown", onKey, true);
    const b = $("#pv-play"); if (b) b.textContent = "▶ Прослухати";
  }
  function onKey(e) { if (e.key.toLowerCase() === "a" && !typingIn(e.target)) { e.preventDefault(); e.stopPropagation(); setAB(ab === "a" ? "b" : "a"); } }
  $("#pv-play").onclick = async () => {
    if (playing) return stop();
    if (S.playing) stopPlay();
    ctx.resume(); playing = true; $("#pv-play").textContent = "■ Стоп";
    document.addEventListener("keydown", onKey, true);
    if (!bufA || !bufB) await render(true); else start(0);
    if (playing && bufA && bufB && !srcs.length) start(0);
  };
  $$("#pv-ab button").forEach((b) => b.onclick = () => setAB(b.dataset.ab));
  $("#pv-where").onchange = () => { bufA = bufB = null; win = null; if (playing) render(true); };
  $("#pv-len").onchange = () => { bufA = bufB = null; win = null; if (playing) render(true); };
  $("#pv-fx").onchange = () => { if (playing) start(currentOffset()); };
  return {
    changed() { clearTimeout(timer); if (bufB || playing) timer = setTimeout(() => render(false), 450); },
    stop,
  };
}
function renderVerTab(el, T) {
  const base = baseId(T.t), vs = Object.values(S.versions || {}).filter((v) => v.base === base).sort((a, b) => a.created < b.created ? -1 : 1);
  el.innerHTML = `${stripHTML(T)}<div class="vers">
    <div class="ver ${!T.m.source ? "cur" : ""}"><b>Оригінальний стем</b><span class="muted small">після розділення</span><button class="btn ghost sm" data-use="">${!T.m.source ? "звучить зараз" : "Використати"}</button></div>
    ${vs.map((v) => `<div class="ver ${T.m.source === v.vid ? "cur" : ""}"><b>${escapeHtml(v.chain.join(" → "))}</b><span class="muted small">${escapeHtml(v.created)}</span>
      <button class="btn ghost sm" data-use="${v.vid}">${T.m.source === v.vid ? "звучить зараз" : "Використати"}</button><button class="x" data-delv="${v.vid}" title="Видалити версію">×</button></div>`).join("") || `<p class="muted">Ще немає оброблених версій. Перейдіть у «Обробка звуку».</p>`}
    <p class="muted small">Порада: швидко перемикайте «Використати», щоб порівняти до/після. Ефекти доріжки при цьому залишаються.</p></div>`;
  bindStrip(T);
  $$("[data-use]", el).forEach((b) => b.onclick = async () => {
    pushUndo("версія");
    T.m.source = b.dataset.use || null;
    await loadAudio();
    afterEdit(true);
    renderDock();
  });
  $$("[data-delv]", el).forEach((b) => b.onclick = async () => {
    if (!await inkConfirm("Підтвердження", "<p>" + escapeHtml("Видалити цю версію назавжди?") + "</p>", "Видалити", true)) return;
    await api.del(`/api/project/${S.pid}/version/${b.dataset.delv}`);
    for (const id in S.mix.tracks) if (S.mix.tracks[id].source === b.dataset.delv) S.mix.tracks[id].source = null;
    S.versions = await api.get(`/api/project/${S.pid}/versions`);
    afterEdit(true);
    loadAudio();
    renderDock();
  });
}
function hasEdits() {
  if (!S.mix) return false;
  if (S.mix.master.fx.length || S.mix.clones.length || (S.mix.gens || []).length || S.mix.sections || S.mix.chords) return true;
  for (const t of tracksAll()) {
    const m = mt(t.id);
    if (m.fx.length || m.source || m.vol || m.pan || m.mode || m.notes || m.clips.length !== 1) return true;
    const c = m.clips[0], d = defaultClip(t);
    if (Math.abs(c.start - d.start) > 1e-3 || Math.abs(c.dur - d.dur) > 1e-3 || c.gain || c.mute) return true;
  }
  return false;
}
async function renderAll(progress) {
  await api.post(`/api/project/${S.pid}/render/clear`);
  const SR = 44100, P = period(), total = arrEnd() * P + 4;
  const len = Math.ceil(total * SR);
  const mixL = new Float32Array(len), mixR = new Float32Array(len);
  const list = tracksAll();
  const anyS = anySolo();
  let i = 0;
  for (const t of list) {
    i++;
    const m = mt(t.id), mode = modeOf(t);
    progress(`Рендер ${i}/${list.length}: ${t.name}`, (i - 1) / (list.length + 1));
    const ctx2 = new OfflineAudioContext(2, len, SR);
    await DSP.ensureWorklets(ctx2);
    const strip2 = new DSP.Strip(ctx2, ctx2.destination, fxEnv());
    strip2.setFx(m.fx);
    strip2.setPan(m.pan);
    strip2.fader.gain.value = DSP.dbToGain(m.vol);
    applyAutomation(ctx2, strip2, m, 0, 0);
    let hasContent = false;
    if (t.has_audio && (mode === "audio" || mode === "both")) {
      try {
        const buf = await fetchBuffer(ctx2, `/api/project/${S.pid}/full/${srcKey(t)}`);
        scheduleClips(ctx2, t, buf, strip2.input, 0, 0, null);
        hasContent = true;
      } catch (e) {
        console.warn(e);
      }
    }
    if (mode === "midi" || mode === "both") {
      await loadInstrumentBuffers();
      const notes = arranged(t), g = ctx2.createGain();
      g.gain.value = mode === "both" ? 0.7 : 1;
      g.connect(strip2.input);
      for (const n of notes) DSP.playNote(ctx2, g, m.inst, n[2], n[3] / 127, n[0] * P, n[1] * P, S.audio.ibuf);
      hasContent = hasContent || notes.length > 0;
    }
    if (!hasContent) continue;
    const out2 = await ctx2.startRendering();
    const blob = DSP.encodeWav(out2);
    const fd2 = new FormData();
    fd2.append("file", blob, "x.wav");
    fd2.append("name", `${String(i).padStart(2, "0")} ${t.name}${mode === "midi" ? " (instrument)" : ""}`);
    await fetch(`/api/project/${S.pid}/render`, { method: "POST", body: fd2 });
    if (!m.mute && (!anyS || m.solo)) {
      const l = out2.getChannelData(0), r = out2.getChannelData(1);
      for (let k = 0; k < len; k++) {
        mixL[k] += l[k];
        mixR[k] += r[k];
      }
    }
  }
  progress("Мастер: ефекти Master і зведення…", list.length / (list.length + 1));
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  const sum = ctx.createBuffer(2, len, SR);
  sum.copyToChannel(mixL, 0);
  sum.copyToChannel(mixR, 1);
  const strip = new DSP.Strip(ctx, ctx.destination, fxEnv());
  strip.setFx(S.mix.master.fx);
  strip.fader.gain.value = DSP.dbToGain(S.mix.master.vol || 0);
  const s = ctx.createBufferSource();
  s.buffer = sum;
  s.connect(strip.input);
  s.start(0);
  const out = await ctx.startRendering();
  let pk = 0;
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let k = 0; k < d.length; k++) {
      const v = Math.abs(d[k]);
      if (v > pk) pk = v;
    }
  }
  if (pk > 0.98) {
    const g = 0.89 / pk;
    for (let c = 0; c < 2; c++) {
      const d = out.getChannelData(c);
      for (let k = 0; k < d.length; k++) d[k] *= g;
    }
    toast(`Мікс був перевантажений (+${(20 * Math.log10(pk)).toFixed(1)} дБ) — гучність зменшено, щоб не було спотворень. Порада: додайте Лімітер на Master.`);
  }
  const fd = new FormData();
  fd.append("file", DSP.encodeWav(out), "x.wav");
  fd.append("name", "00 Full mix (InkBeat master)");
  await fetch(`/api/project/${S.pid}/render`, { method: "POST", body: fd });
}
function editedMidi() {
  return tracksAll().filter((t) => (t.enabled || t.clone) && arranged(t).length && !mt(t.id).mute).map((t) => ({ name: t.name, program: t.program, is_drums: t.is_drums, notes: arranged(t).map((n) => [+n[0].toFixed(5), +n[1].toFixed(5), n[2], n[3]]) }));
}
$("#export-btn").addEventListener("click", () => {
  const modal = $("#export-modal");
  const edits = hasEdits();
  $("#ex-title").textContent = "Експорт";
  $("#ex-body").innerHTML = `
    <p>Буде створено папку проєкту: готова пісня, окремі доріжки у WAV, MIDI, семпли й інструкція. Ці файли — стандартні формати, тож проєкт можна продовжити в будь-якій музичній програмі.</p>
    <label class="ex-opt"><input type="checkbox" id="ex-render" ${edits ? "checked" : ""}> <span><b>Записати мої зміни у WAV</b> — ефекти, обробку (автотюн, шумоподавлення…), різання й переміщення кліпів, інструменти. Кожна доріжка окремо + повний мікс з Master. ${edits ? "" : "<span class='muted'>(змін поки немає)</span>"}</span></label>
    <label class="ex-opt"><input type="checkbox" id="ex-midi" ${edits ? "checked" : ""}> <span><b>MIDI мого аранжування</b> — ноти з урахуванням вирізаних, переміщених і продубльованих кліпів.</span></label>
    <label class="ex-opt"><input type="checkbox" id="ex-mix" checked> <span><b>Готовий мікс у MP3 (320 кбіт/с) і WAV</b> — один файл усієї пісні з ефектами й Master, щоб одразу викласти чи надіслати.</span></label>
    <div class="ex-actions"><button class="btn primary" id="ex-go">Експортувати</button></div>
    <div id="ex-progress" hidden><div class="pbar"><div id="ex-bar"></div></div><p class="muted" id="ex-step"></p></div>`;
  modal.hidden = false;
  $("#ex-go").onclick = async () => {
    const doMix = $("#ex-mix").checked, doRender = $("#ex-render").checked || doMix, doMidi = $("#ex-midi").checked;
    $("#ex-go").disabled = true;
    $("#ex-progress").hidden = false;
    const prog = (msg, f) => {
      $("#ex-step").textContent = msg;
      $("#ex-bar").style.width = f * 100 + "%";
    };
    try {
      if (doRender) await renderAll(prog);
      prog("Записую пісню, доріжки, MIDI і семпли…", 0.97);
      const r = await api.post(`/api/project/${S.pid}/export`, { use_render: doRender, mixdown: doMix, edited: doMidi ? editedMidi() : null });
      showExportDone(r);
    } catch (e) {
      $("#ex-title").textContent = "Помилка експорту";
      $("#ex-body").innerHTML = `<p>${escapeHtml(e.message)}</p>`;
    }
  };
});
function showExportDone(r) {
  const tm = S.B.timing, mid = r.files.find((f) => f.endsWith("all tracks.mid")) || "";
  const rendered = r.files.some((f) => f.startsWith("Rendered"));
  const hasMix = r.files.some((f) => f.endsWith(" - mix.mp3"));
  const daws = ["FL Studio", "Ableton Live", "Logic Pro", "GarageBand", "Cubase", "Studio One", "Reaper", "Bitwig", "LMMS"];
  $("#ex-title").textContent = "Експорт готовий";
  $("#ex-body").innerHTML = `<div class="ex-path">${escapeHtml(r.path)}</div>
    <div class="ex-actions"><button class="btn primary" id="ex-open">Відкрити папку</button>${hasMix ? `<a class="btn ghost" href="/api/project/${S.pid}/mixdown/mp3" download data-hint="Готова пісня одним файлом MP3 320 кбіт/с — щоб надіслати чи викласти">Пісня MP3 ⤓</a><a class="btn ghost" href="/api/project/${S.pid}/mixdown/wav" download data-hint="Готова пісня без втрати якості — для стрімінгових сервісів і дистриб'юторів">Пісня WAV ⤓</a>` : ""}<a class="btn ghost" href="/api/project/${S.pid}/midi" download data-hint="Усі партії нотами в одному MIDI-файлі">MIDI ⤓</a><a class="btn ghost" href="/api/project/${S.pid}/guide" target="_blank" data-hint="Поради, якими інструментами й ефектами відтворити звук кожної доріжки">Звуковий гід</a></div>
    <ol class="steps">
      ${hasMix ? `<li><b>Готова пісня</b><p><span class="kbd">… - mix.mp3</span> і <span class="kbd">… - mix.wav</span> — увесь трек з ефектами й Master. Можна одразу слухати, надсилати й публікувати.</p></li>` : ""}
      <li><b>Окремі доріжки</b><p>${rendered ? `<span class="kbd">Rendered (InkBeat edits)</span> — кожна доріжка з вашими ефектами й обробкою. ` : ""}<span class="kbd">Stems (aligned)</span> — оригінальні розділені доріжки. Усі WAV починаються з однієї точки, тож у будь-якій програмі просто поставте їх на початок — вони збіжуться між собою й з MIDI.</p></li>
      <li><b>Ноти (MIDI)</b><p>${r.files.some((f) => f.includes("edited arrangement")) ? "Ваше аранжування: <span class='kbd'>… - edited arrangement.mid</span>. Оригінал: " : ""}<span class="kbd">${escapeHtml(mid)}</span> — усі партії, темп ${tm.bpm.toFixed(2)} BPM уже записаний у файл. Окремі партії — у папці <span class="kbd">MIDI</span>.</p></li>
      <li><b>Семпли й лупи</b><p><span class="kbd">Samples</span> — удари барабанів, окремі ноти, вокальні фрази й лупи в темпі, вирізані з пісні.</p></li>
    </ol>
    <div class="ex-daw"><b>Продовжити в іншій програмі</b><p class="muted small">WAV і MIDI — стандартні формати, тож проєкт відкривається в будь-якій музичній програмі. Покрокова інструкція для кожної з них — у файлі <span class="kbd">ЯК ВІДКРИТИ В ІНШИХ ПРОГРАМАХ.txt</span> у цій папці.</p><div class="ex-daw-list">${daws.map((d) => `<span>${d}</span>`).join("")}<span>та інші</span></div></div>
    <details><summary class="muted small" style="cursor:pointer;margin-top:12px">Усі файли (${r.files.length})</summary><div class="filetree">${r.files.map(escapeHtml).join("<br>")}</div></details>`;
  $("#ex-open").onclick = () => api.post(`/api/project/${S.pid}/open`);
}
function setTool(t) {
  S.tool = t;
  $$("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
}
$$("[data-tool]").forEach((b) => b.onclick = () => setTool(b.dataset.tool));
$("#snap-sel").onchange = (e) => {
  S.snap = +e.target.value;
};
$("#t-undo").onclick = () => undo();
$("#t-redo").onclick = () => redo();
$("#t-dock").onclick = () => {
  S.dockOpen = !S.dockOpen;
  renderDock();
  layout();
  draw();
};
$("#t-split").onclick = () => splitAtPlayhead();
$("#t-dup").onclick = () => duplicateClips();
$("#t-del").onclick = () => deleteClips();
$$("#listen-seg button").forEach((b) => b.addEventListener("click", () => {
  if (S.mix) {
    for (const id in S.mix.tracks) S.mix.tracks[id].mode = null;
    saveMix();
    applyGains();
    renderHeads();
    draw();
  }
}));
function typingIn(el) {
  if (!el || !el.matches) return false;
  if (el.isContentEditable || el.matches("textarea, select")) return true;
  return el.matches("input") && !/^(range|checkbox|radio|button|color|file)$/i.test(el.type || "");
}
document.addEventListener("keydown", (e) => {
  if (S.view !== "project" || typingIn(e.target)) return;
  if (document.querySelector(".modal:not([hidden])") && !e.ctrlKey && !e.metaKey) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.code === "Space") {
    e.preventDefault();
    S.playing ? stopPlay() : play();
  } else if (e.code === "Home") {
    seek(0);
    body.scrollLeft = 0;
  } else if (ctrl && k === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (ctrl && k === "y" || ctrl && e.shiftKey && k === "z") {
    e.preventDefault();
    redo();
  } else if (ctrl && k === "d") {
    e.preventDefault();
    duplicateClips();
  } else if (ctrl && k === "c") copyClips();
  else if (ctrl && k === "v") pasteClips();
  else if (ctrl && k === "a") {
    e.preventDefault();
    S.selClips = new Set(tracksAll().flatMap((t) => mt(t.id).clips.map((c) => c.id)));
    draw();
  } else if (k === "delete" || k === "backspace") deleteClips();
  else if (k === "s" && !ctrl) splitAtPlayhead();
  else if (k === "m" && !ctrl) muteClips();
  else if (k === "v" && !ctrl) setTool("select");
  else if (k === "c" && !ctrl) setTool("knife");
  else if (e.key === "F9") {
    e.preventDefault();
    $("#t-dock").click();
  } else if (e.key === "+" || e.key === "=") setZoom(S.ppb * 1.25);
  else if (e.key === "-") setZoom(S.ppb / 1.25);
  else if (k === "escape") {
    if (!S.selClips.size && S.sel) { S.sel = null; onSelectTrack(); renderHeads(); renderTrackForm(); layout(); }
    S.selClips.clear();
    closeMenu();
    draw();
  }
});
$$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal").hidden = true));
