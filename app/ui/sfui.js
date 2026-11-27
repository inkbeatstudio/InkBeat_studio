"use strict";
const SFU = { libs: null };
function multiNote(ctx, out, inst, pitch, vel, t0, dur, buffers) {
  const P = inst.params || {}, v127 = Math.round(vel * 127);
  const zs = (inst.zones || []).filter((z) => pitch >= z.lo && pitch <= z.hi && v127 >= z.vlo && v127 <= z.vhi);
  if (!zs.length) return;
  const sens = P.vel ?? 0.7, velG = (1 - sens) + sens * vel * vel;
  for (const z of zs) {
    const buf = buffers.get("multi:" + z.file);
    if (!buf) continue;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = Math.pow(2, (pitch - z.root) / 12 + ((z.tune || 0) + (P.tune || 0) * 100) / 1200);
    if (z.loop && z.loop[1] > z.loop[0] + 0.002) {
      s.loop = true;
      s.loopStart = z.loop[0];
      s.loopEnd = Math.min(buf.duration, z.loop[1]);
    }
    const g = ctx.createGain();
    let tail = g;
    if (z.pan) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = z.pan;
      g.connect(pn);
      tail = pn;
    }
    s.connect(g);
    tail.connect(out);
    const peak = (z.gain || 1) * (P.gain ?? 1) * velG * 0.9;
    const a = Math.max(0.001, (z.a || 0.002) * (P.attack ?? 1)), r = Math.max(0.02, Math.min(8, (z.r || 0.25) * (P.release ?? 1)));
    const sus = z.s ?? 1, dec = Math.max(0.01, z.d || 1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    if (sus < 0.999) g.gain.setTargetAtTime(Math.max(1e-4, peak * sus), t0 + a, dec / 4);
    s.start(t0);
    const tOff = t0 + Math.max(0.03, dur);
    if (!s.loop && !inst.drums && buf.duration / s.playbackRate.value < Math.max(0.03, dur)) {
      s.stop(t0 + buf.duration / s.playbackRate.value + 0.02);
      continue;
    }
    if (inst.drums && !s.loop) { s.stop(t0 + Math.min(buf.duration / s.playbackRate.value, 12) + 0.05); continue; }
    g.gain.cancelScheduledValues(tOff);
    g.gain.setTargetAtTime(0, tOff, r / 4);
    s.stop(tOff + r * 1.6 + 0.05);
  }
}
const _dspPlay = DSP.playNote;
DSP.playNote = function (ctx, out, inst, pitch, vel, t0, dur, buffers, mods) {
  if (!inst) return;
  if (!mods) return inst.type === "multi" ? multiNote(ctx, out, inst, pitch, vel, t0, dur, buffers) : _dspPlay(ctx, out, inst, pitch, vel, t0, dur, buffers);
  const made = [];
  const oO = ctx.createOscillator, oB = ctx.createBufferSource;
  ctx.createOscillator = function () { const n = oO.call(ctx); made.push(n); return n; };
  ctx.createBufferSource = function () { const n = oB.call(ctx); made.push(n); return n; };
  try {
    if (inst.type === "multi") multiNote(ctx, out, inst, pitch, vel, t0, dur, buffers);
    else _dspPlay(ctx, out, inst, pitch, vel, t0, dur, buffers);
  } finally {
    ctx.createOscillator = oO;
    ctx.createBufferSource = oB;
  }
  const targets = made.filter((n) => n.detune);
  if (!targets.length) return;
  const end = t0 + dur + 3;
  if (mods.bend && mods.bend.length) {
    const cs = ctx.createConstantSource();
    cs.offset.setValueAtTime(mods.bend[0][1], t0);
    for (const [t, c] of mods.bend) if (t > t0) cs.offset.linearRampToValueAtTime(c, t);
    for (const n of targets) cs.connect(n.detune);
    cs.start(t0);
    cs.stop(end);
  }
  if (mods.vib && mods.vib.some((x) => x[1] > 0.5)) {
    const lfo = ctx.createOscillator(), dg = ctx.createGain();
    lfo.frequency.value = 5.6;
    dg.gain.setValueAtTime(mods.vib[0][1], t0);
    for (const [t, c] of mods.vib) if (t > t0) dg.gain.linearRampToValueAtTime(c, t);
    lfo.connect(dg);
    for (const n of targets) dg.connect(n.detune);
    lfo.start(t0);
    lfo.stop(end);
  }
};
function ccOf(t) {
  const m = S.mix && mt(t.id);
  return m && m.cc || null;
}
function ccVal(ev, b, def) {
  if (!ev || !ev.length) return def;
  let lo = 0, hi = ev.length - 1;
  if (b < ev[0][0]) return def;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ev[mid][0] <= b) lo = mid; else hi = mid - 1;
  }
  return ev[lo][1];
}
function playNotes(t) {
  const notes = arranged(t), cc = ccOf(t), ped = cc && cc["64"];
  if (!ped || !ped.length) return notes;
  return notes.map((n) => {
    const end = n[0] + n[1];
    if (ccVal(ped, end, 0) < 0.5) return n;
    const up = ped.find((e) => e[0] > end && e[1] < 0.5);
    const ne = up ? up[0] : end + 8;
    const nxt = notes.find((m) => m[2] === n[2] && m[0] > n[0] + 1e-4 && m[0] < ne);
    return [n[0], (nxt ? Math.min(ne, nxt[0]) : ne) - n[0], n[2], n[3]];
  });
}
function noteMods(t, n, toTime) {
  const cc = ccOf(t);
  if (!cc) return null;
  const pb = cc.pb, md = cc["1"], range = (mt(t.id).pbRange || 2) * 100;
  const a = n[0], b = n[0] + n[1] + 2;
  const out = {};
  if (pb && pb.length) {
    const pts = [[toTime(a), ccVal(pb, a, 0) * range]];
    for (const e of pb) if (e[0] > a && e[0] < b) pts.push([toTime(e[0]), e[1] * range]);
    if (pts.length > 1 || Math.abs(pts[0][1]) > 0.5) out.bend = pts;
  }
  if (md && md.length) {
    const pts = [[toTime(a), ccVal(md, a, 0) * 60]];
    for (const e of md) if (e[0] > a && e[0] < b) pts.push([toTime(e[0]), e[1] * 60]);
    if (pts.some((p) => p[1] > 0.5)) out.vib = pts;
  }
  return out.bend || out.vib ? out : null;
}
async function sfLibs(force) {
  if (!SFU.libs || force) SFU.libs = await api.get(`/api/project/${S.pid}/soundfont`).catch(() => []);
  return SFU.libs;
}
async function sfImport(T) {
  let meta = null;
  try {
    if (DESK.on && DESK.api && DESK.api.open_files) {
      const paths = await DESK.api.open_files("soundfont", false).catch(() => null);
      if (paths === null) return sfImportBrowser(T);
      if (!paths || !paths.length) return;
      toast("Читаю бібліотеку звуків…");
      meta = await api.post(`/api/project/${S.pid}/soundfont`, { path: paths[0] });
    } else return sfImportBrowser(T);
  } catch (e) {
    return toast("Не вдалося відкрити: " + e.message, true);
  }
  sfAfterImport(T, meta);
}
async function sfImportBrowser(T) {
  const f = await new Promise((res) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".sf2,.sfz,.zip";
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
  if (!f) return;
  if (/\.sfz$/i.test(f.name)) toast("SFZ посилається на окремі файли звуків. У вікні браузера завантажте .zip з .sfz і папкою семплів (у застосунку можна вибрати .sfz напряму).", true);
  const fd = new FormData();
  fd.append("file", f, f.name);
  toast("Читаю бібліотеку звуків…");
  const meta = await fetch(`/api/project/${S.pid}/soundfont`, { method: "POST", body: fd }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  sfAfterImport(T, meta);
}
async function sfAfterImport(T, meta) {
  if (!meta || meta.error) return toast("Не вдалося відкрити: " + (meta && meta.error || "невідома помилка"), true);
  await sfLibs(true);
  const pick = meta.presets.find((p) => T.t.is_drums ? p.bank === 128 : p.bank !== 128) || meta.presets[0];
  await sfChoose(T, meta.id, pick.index);
  toast(`Бібліотеку «${meta.name}» додано: ${meta.presets.length} ${meta.presets.length === 1 ? "інструмент" : "інструментів"}. Виберіть потрібний у списку.`);
}
async function sfChoose(T, lid, index) {
  const st = $("#mu-status");
  if (st) st.textContent = "Завантажую звуки інструмента…";
  try {
    const r = await api.post(`/api/project/${S.pid}/soundfont/${lid}/preset`, { index });
    if (r.error) throw new Error(r.error);
    pushUndo("інструмент з бібліотеки");
    const m = T.m;
    m.inst = Object.assign({ type: "multi", params: (m.inst && m.inst.params) || { gain: 1, attack: 1, release: 1, vel: 0.7, tune: 0 } }, { lib: r.lib, preset: r.preset, name: r.name, zones: r.zones, drums: r.drums });
    UIP.lastMulti = { lib: r.lib, preset: r.preset, name: r.name, zones: true };
    saveUI();
    afterEdit();
    await loadInstrumentBuffers();
    renderDock();
  } catch (e) {
    if (st) st.textContent = "";
    toast("Не вдалося: " + e.message, true);
  }
}
async function renderMulti(box, T) {
  const inst = T.m.inst, P = inst.params || (inst.params = { gain: 1, attack: 1, release: 1, vel: 0.7, tune: 0 });
  box.innerHTML = `<div class="mu"><div class="mu-row"><b>${inst.name ? escapeHtml(inst.name) : "Інструмент не вибрано"}</b><span class="muted small" id="mu-status">${inst.zones && inst.zones.length ? `${inst.zones.length} семплів` : ""}</span><span class="spacer"></span>
      <button class="btn primary sm" id="mu-add" data-hint="Відкрити файл SoundFont (.sf2), SFZ або .zip з SFZ і семплами. Бібліотека збережеться в проєкті">Завантажити SF2 / SFZ…</button></div>
    <div class="mu-row" id="mu-pick"><span class="muted small">Завантаження списку…</span></div>
    <div class="mu-knobs">
      ${[["gain", "Гучність", 0, 2, 0.01], ["vel", "Чутливість до сили", 0, 1, 0.01], ["attack", "Атака ×", 0.2, 5, 0.01], ["release", "Згасання ×", 0.1, 4, 0.01], ["tune", "Підстроювання, пт", -12, 12, 1]].map(([k, l, a, b, s]) => `<label class="mu-k">${l} <input type="range" data-mk="${k}" min="${a}" max="${b}" step="${s}" value="${P[k] ?? (k === "tune" ? 0 : 1)}"><span data-mv="${k}">${(+(P[k] ?? (k === "tune" ? 0 : 1))).toFixed(k === "tune" ? 0 : 2)}</span></label>`).join("")}
    </div>
    <p class="muted small">SoundFont і SFZ — безкоштовні й платні бібліотеки записаних інструментів: роялі, струнні, гітари, духові, хори, барабани. Один файл .sf2 часто містить сотні інструментів (наприклад, увесь набір General MIDI). Звук зберігається в проєкті й експортується разом з ним.</p></div>`;
  $("#mu-add", box).onclick = () => sfImport(T);
  $$("[data-mk]", box).forEach((r) => {
    r.oninput = () => { P[r.dataset.mk] = +r.value; $(`[data-mv="${r.dataset.mk}"]`, box).textContent = (+r.value).toFixed(r.dataset.mk === "tune" ? 0 : 2); };
    r.onchange = () => { saveMix(); };
  });
  const libs = await sfLibs();
  const pick = $("#mu-pick", box);
  if (!pick || !pick.isConnected) return;
  if (!libs.length) {
    pick.innerHTML = `<span class="muted small">У проєкті ще немає бібліотек. Натисніть «Завантажити SF2 / SFZ…».</span>`;
    return;
  }
  const lib = libs.find((l) => l.id === inst.lib) || libs[0];
  pick.innerHTML = `<select id="mu-lib" data-hint="Бібліотека звуків у цьому проєкті">${libs.map((l) => `<option value="${l.id}" ${l.id === lib.id ? "selected" : ""}>${escapeHtml(l.name)}</option>`).join("")}</select>
    <input id="mu-q" placeholder="Пошук: piano, strings, guitar…" data-hint="Фільтр інструментів за назвою">
    <select id="mu-pre" size="6" data-hint="Клацніть інструмент — він одразу стане звуком цієї доріжки">${lib.presets.map((p) => `<option value="${p.index}" ${lib.id === inst.lib && p.index === inst.preset ? "selected" : ""}>${p.bank === 128 ? "🥁 " : ""}${String(p.program + 1).padStart(3, "0")} ${escapeHtml(p.name)}</option>`).join("")}</select>`;
  $("#mu-lib", pick).onchange = () => { inst.lib = $("#mu-lib", pick).value; renderMulti(box, T); };
  $("#mu-q", pick).oninput = (e) => {
    const q = e.target.value.toLowerCase();
    [...$("#mu-pre", pick).options].forEach((o) => o.hidden = q && !o.textContent.toLowerCase().includes(q));
  };
  $("#mu-pre", pick).onchange = (e) => sfChoose(T, lib.id, +e.target.value);
  if (inst.lib && (!inst.zones || !inst.zones.length) && inst.preset != null) sfChoose(T, inst.lib, inst.preset);
}
