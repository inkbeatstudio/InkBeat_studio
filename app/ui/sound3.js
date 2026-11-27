"use strict";
const WAVES = {
  organ: ["Орган", [1, 0.8, 0, 0.6, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.3]],
  hollow: ["Порожниста", [1, 0, 0.5, 0, 0.3, 0, 0.2, 0, 0.12, 0, 0.08, 0, 0.05, 0, 0.03, 0]],
  bright: ["Яскрава", [1, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.38, 0.35, 0.32, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2]],
  bell: ["Дзвін", [1, 0, 0, 0.5, 0, 0, 0.35, 0, 0.25, 0, 0, 0.2, 0, 0, 0, 0.15]],
  vowel: ["Голос «а»", [0.6, 0.9, 1, 0.7, 0.4, 0.2, 0.3, 0.5, 0.35, 0.15, 0.08, 0.05, 0.03, 0.02, 0.01, 0.01]],
  soft: ["М'який квадрат", [1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11, 0, 0, 0, 0, 0, 0, 0]],
  flute: ["Флейта", [1, 0.25, 0.08, 0.03, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
};
const _pwCache = new WeakMap();
function periodicFor(ctx, h) {
  let m = _pwCache.get(ctx);
  if (!m) { m = new Map(); _pwCache.set(ctx, m); }
  const key = h.join(",");
  if (m.has(key)) return m.get(key);
  const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
  h.forEach((v, i) => { im[i + 1] = v; });
  const w = ctx.createPeriodicWave(re, im);
  m.set(key, w);
  return w;
}
function lfoHz(l) {
  if (!l.sync) return +l.rate || 2;
  const bpm = S.B ? S.B.timing.bpm : 120, beats = { "1/1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25, "1/4T": 2 / 3, "1/8T": 1 / 3, "2/1": 8 }[l.div] || 1;
  return bpm / 60 / beats;
}
const _dspPlayS = DSP.playNote;
DSP.playNote = function(ctx, out, inst, pitch, vel, t0, dur, buffers, mods) {
  if (mods && mods.mute) return;
  if (inst && inst.type === "sampler" && inst.params && inst.params.grain && inst.params.grain.on) return grainNote(ctx, out, inst, pitch, vel, t0, dur, buffers);
  if (!inst || inst.type !== "synth" || !inst.params) return _dspPlayS(ctx, out, inst, pitch, vel, t0, dur, buffers, mods);
  const P = inst.params, lfos = (P.lfo || []).filter((l) => l.on && l.depth > 0), wave = P.wave && P.wave.on ? P.wave.h : null;
  if (!lfos.length && !wave) return _dspPlayS(ctx, out, inst, pitch, vel, t0, dur, buffers, mods);
  let dest = out;
  const end = t0 + Math.max(0.02, dur) + (P.amp ? P.amp.r * 1.2 : 0.3) + 0.1;
  const amp = lfos.find((l) => l.dest === "amp"), pan = lfos.find((l) => l.dest === "pan");
  const extra = [];
  if (pan) {
    const pn = ctx.createStereoPanner(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = pan.shape || "sine"; o.frequency.value = lfoHz(pan); g.gain.value = pan.depth;
    o.connect(g); g.connect(pn.pan); pn.connect(dest); dest = pn; extra.push(o);
  }
  if (amp) {
    const vca = ctx.createGain(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = amp.shape || "sine"; o.frequency.value = lfoHz(amp);
    vca.gain.value = 1 - amp.depth / 2; g.gain.value = amp.depth / 2;
    o.connect(g); g.connect(vca.gain); vca.connect(dest); dest = vca; extra.push(o);
  }
  const caps = [], filts = [];
  const co = ctx.createOscillator, cf = ctx.createBiquadFilter;
  ctx.createOscillator = function() { const o = co.call(ctx); caps.push(o); return o; };
  ctx.createBiquadFilter = function() { const f = cf.call(ctx); filts.push(f); return f; };
  let P2 = P;
  if (wave) P2 = Object.assign({}, P, { osc: P.osc.map((o, i) => i === 0 ? Object.assign({}, o, { type: "sine" }) : o) });
  try {
    _dspPlayS(ctx, dest, Object.assign({}, inst, { params: P2 }), pitch, vel, t0, dur, buffers, mods);
  } finally {
    ctx.createOscillator = co;
    ctx.createBiquadFilter = cf;
  }
  const voices = [];
  let k = 0;
  const uni = Math.max(1, P.unison | 0);
  P.osc.forEach((o, si) => {
    if (!o.gain) return;
    for (let u = 0; u < uni; u++) {
      const v = caps[k++];
      if (v) voices.push([v, si]);
      if (P.fm && P.fm.index > 0 && si === 0) k++;
    }
  });
  if (wave) { const pw = periodicFor(ctx, wave); for (const [v, si] of voices) if (si === 0) try { v.setPeriodicWave(pw); } catch (e) {} }
  for (const l of lfos) {
    if (l.dest !== "pitch" && l.dest !== "filter") continue;
    const o = co.call(ctx), g = ctx.createGain();
    o.type = l.shape || "sine"; o.frequency.value = lfoHz(l);
    if (l.dest === "pitch") { g.gain.value = l.depth * 100 * (l.semis || 1); o.connect(g); for (const [v] of voices) g.connect(v.detune); }
    else if (filts[0]) { g.gain.value = l.depth * 3600; o.connect(g); g.connect(filts[0].detune); }
    extra.push(o);
  }
  for (const o of extra) { o.start(t0); o.stop(end); }
};
function grainNote(ctx, out, inst, pitch, vel, t0, dur, buffers) {
  const buf = buffers && buffers.get("sample:" + inst.sample);
  if (!buf) return;
  const P = inst.params, G = P.grain, rate = Math.pow(2, (pitch - (P.root || 60)) / 12 + (P.tune || 0) / 12);
  const size = clamp(G.size || 0.08, 0.01, 0.5), dens = clamp(G.density || 20, 2, 80), spray = G.spray || 0, len = buf.duration;
  const A = P.amp || { a: 0.05, r: 0.3 }, tEnd = t0 + Math.max(0.05, dur) + (A.r || 0.3);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime((P.gain || 0.8) * (0.3 + 0.7 * vel), t0 + Math.max(0.005, A.a || 0.05));
  master.gain.setValueAtTime((P.gain || 0.8) * (0.3 + 0.7 * vel), t0 + Math.max(0.02, dur));
  master.gain.linearRampToValueAtTime(0, tEnd);
  master.connect(out);
  let n = 0;
  for (let t = t0; t < tEnd && n < 600; t += 1 / dens, n++) {
    const prog = (t - t0) * (G.scan || 0);
    const pos = clamp(((G.pos || 0.3) + prog + (Math.random() * 2 - 1) * spray) % 1, 0, 0.999) * Math.max(0.01, len - size);
    const s = ctx.createBufferSource(), g = ctx.createGain(), pn = ctx.createStereoPanner();
    s.buffer = buf;
    s.playbackRate.value = rate * Math.pow(2, (Math.random() * 2 - 1) * (G.pitchRand || 0) / 12);
    pn.pan.value = (Math.random() * 2 - 1) * (G.width ?? 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + size / 2);
    g.gain.linearRampToValueAtTime(0, t + size);
    s.connect(g); g.connect(pn); pn.connect(master);
    s.start(t, pos, size * rate + 0.01);
    s.stop(t + size + 0.02);
  }
}
const DESIGN_DEF = {
  kick: { body: 55, sweep: 3, tdec: 0.5, noise: 0.1, nfreq: 3000, ndec: 0.02, click: 0.4, drive: 0.2 },
  snare: { body: 190, sweep: 1.3, tdec: 0.12, noise: 0.7, nfreq: 2500, ndec: 0.2, click: 0.2, drive: 0 },
  hat: { body: 0, sweep: 1, tdec: 0.01, noise: 0.5, nfreq: 9000, ndec: 0.05, click: 0, drive: 0 },
  openhat: { body: 0, sweep: 1, tdec: 0.01, noise: 0.45, nfreq: 8500, ndec: 0.4, click: 0, drive: 0 },
  crash: { body: 0, sweep: 1, tdec: 0.01, noise: 0.35, nfreq: 6000, ndec: 1.5, click: 0, drive: 0 },
  ride: { body: 3000, sweep: 1, tdec: 0.6, noise: 0.25, nfreq: 7000, ndec: 0.8, click: 0, drive: 0 },
  tom: { body: 120, sweep: 1.5, tdec: 0.4, noise: 0.1, nfreq: 1500, ndec: 0.05, click: 0.1, drive: 0 },
  perc: { body: 600, sweep: 1.2, tdec: 0.12, noise: 0.2, nfreq: 3000, ndec: 0.06, click: 0.2, drive: 0 },
};
const DESIGN_P = [["body", "Тон, Гц", 0, 4000, 1], ["sweep", "Спад тону ×", 1, 8, 0.1], ["tdec", "Довжина тону, с", 0.01, 2, 0.01], ["noise", "Шум", 0, 1, 0.01], ["nfreq", "Колір шуму, Гц", 200, 14000, 10], ["ndec", "Довжина шуму, с", 0.01, 2, 0.01], ["click", "Клік (атака)", 0, 1, 0.01], ["drive", "Перегруз", 0, 1, 0.01]];
function designDrum(ctx, out, note, vel, t0, pad) {
  const grp = DSP_DRUM_GROUP(note), d = Object.assign({}, DESIGN_DEF[grp] || DESIGN_DEF.perc, pad.dz || {});
  const v = (0.25 + 0.75 * vel) * (pad.vol ?? 1), tune = Math.pow(2, (pad.tune || 0) / 12);
  let dest = out;
  if (pad.pan) { const pn = ctx.createStereoPanner(); pn.pan.value = pad.pan; pn.connect(out); dest = pn; }
  if (d.drive > 0) { const ws = ctx.createWaveShaper(), c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 512 - 1) * (1 + d.drive * 8)); ws.curve = c; ws.connect(dest); dest = ws; }
  if (d.body > 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(d.body * d.sweep * tune, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, d.body * tune), t0 + Math.min(0.08, d.tdec * 0.3));
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 1e-3); g.gain.exponentialRampToValueAtTime(8e-4, t0 + d.tdec);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + d.tdec + 0.05);
  }
  if (d.noise > 0) {
    const len = d.ndec + 0.05, b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; f.type = d.nfreq > 5000 ? "highpass" : "bandpass"; f.frequency.value = d.nfreq * tune; f.Q.value = 0.8;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v * d.noise, t0 + 1e-3); g.gain.exponentialRampToValueAtTime(8e-4, t0 + d.ndec);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0); s.stop(t0 + len);
  }
  if (d.click > 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = 1800;
    g.gain.setValueAtTime(v * d.click * 0.5, t0); g.gain.exponentialRampToValueAtTime(8e-4, t0 + 0.006);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.01);
  }
}
const _dspPlayD = DSP.playNote;
DSP.playNote = function(ctx, out, inst, pitch, vel, t0, dur, buffers, mods) {
  if (mods && mods.mute) return;
  if (inst && inst.type === "drums" && inst.kit === "design") {
    const grp = DSP_DRUM_GROUP(pitch), pad = inst.pads && inst.pads[grp] || {};
    if (pad.mute) return;
    return designDrum(ctx, out, pitch, vel, t0, pad);
  }
  return _dspPlayD(ctx, out, inst, pitch, vel, t0, dur, buffers, mods);
};
DRUM_KITS.push(["design", "Конструктор (свій звук)"]);
function fxLfo(ctx, hz, type = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  o.start();
  return o;
}
function fxWetDry(ctx, mix) {
  const input = ctx.createGain(), output = ctx.createGain(), wet = ctx.createGain(), dry = ctx.createGain();
  input.connect(dry); dry.connect(output); wet.connect(output);
  const set = (m) => { wet.gain.value = m; dry.gain.value = 1 - m; };
  set(mix);
  return { input, output, wet, set };
}
function fxRate(p, env) {
  return p.sync ? 1 / DSP.syncTime(p.div, env && env.bpm || 120) : p.rate;
}
DSP.FX.phaser = (ctx, P, env) => {
  const wd = fxWetDry(ctx, P.mix), stages = [], o = fxLfo(ctx, fxRate(P, env)), dep = ctx.createGain(), fb = ctx.createGain();
  let prev = wd.input;
  for (let i = 0; i < 6; i++) { const f = ctx.createBiquadFilter(); f.type = "allpass"; f.Q.value = 0.6; prev.connect(f); prev = f; stages.push(f); o.connect(dep); dep.connect(f.frequency); }
  prev.connect(wd.wet); prev.connect(fb); fb.connect(stages[0]);
  const set = (p) => { P = p; o.frequency.value = fxRate(p, env); stages.forEach((f) => f.frequency.value = p.freq); dep.gain.value = p.freq * p.depth * 0.9; fb.gain.value = p.feedback; wd.set(p.mix); };
  set(P);
  return { input: wd.input, output: wd.output, set, dispose() { o.stop(); } };
};
DSP.FX.flanger = (ctx, P, env) => {
  const wd = fxWetDry(ctx, P.mix), d = ctx.createDelay(0.05), o = fxLfo(ctx, fxRate(P, env)), dep = ctx.createGain(), fb = ctx.createGain();
  wd.input.connect(d); d.connect(wd.wet); d.connect(fb); fb.connect(d); o.connect(dep); dep.connect(d.delayTime);
  const set = (p) => { P = p; o.frequency.value = fxRate(p, env); d.delayTime.value = p.delay / 1000; dep.gain.value = p.depth / 1000; fb.gain.value = p.feedback; wd.set(p.mix); };
  set(P);
  return { input: wd.input, output: wd.output, set, dispose() { o.stop(); } };
};
DSP.FX.autofilter = (ctx, P, env) => {
  const input = ctx.createGain(), output = ctx.createGain(), f = ctx.createBiquadFilter(), o = fxLfo(ctx, fxRate(P, env)), dep = ctx.createGain();
  input.connect(f); f.connect(output); o.connect(dep); dep.connect(f.detune);
  const set = (p) => { P = p; f.type = p.type; f.frequency.value = p.freq; f.Q.value = p.q; o.type = p.shape; o.frequency.value = fxRate(p, env); dep.gain.value = p.depth * 2400; };
  set(P);
  return { input, output, set, dispose() { o.stop(); } };
};
DSP.FX.multiband = (ctx, P) => {
  const input = ctx.createGain(), output = ctx.createGain(), bands = [];
  const mk = (type, freq) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.707; return f; };
  const chain = (nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes; };
  const lo = chain([mk("lowpass", P.low), mk("lowpass", P.low)]), mid = chain([mk("highpass", P.low), mk("highpass", P.low), mk("lowpass", P.high), mk("lowpass", P.high)]), hi = chain([mk("highpass", P.high), mk("highpass", P.high)]);
  for (const [fl, key] of [[lo, "l"], [mid, "m"], [hi, "h"]]) {
    const c = ctx.createDynamicsCompressor(), g = ctx.createGain();
    input.connect(fl[0]); fl[fl.length - 1].connect(c); c.connect(g); g.connect(output);
    bands.push({ fl, c, g, key });
  }
  const set = (p) => {
    P = p;
    lo.forEach((f) => f.frequency.value = p.low); hi.forEach((f) => f.frequency.value = p.high);
    mid[0].frequency.value = mid[1].frequency.value = p.low; mid[2].frequency.value = mid[3].frequency.value = p.high;
    for (const b of bands) { b.c.threshold.value = p[b.key + "thr"]; b.c.ratio.value = p.ratio; b.c.attack.value = 0.01; b.c.release.value = 0.15; b.c.knee.value = 6; b.g.gain.value = Math.pow(10, (p[b.key + "gain"] || 0) / 20); }
  };
  set(P);
  return { input, output, set, dispose() {} };
};
DSP.FX.vocoder = (ctx, P) => {
  const input = ctx.createGain(), output = ctx.createGain(), wd = ctx.createGain(), dry = ctx.createGain();
  const car = ctx.createGain(), oscs = [], N = 16, bands = [];
  const sh = ctx.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.abs(i / 512 - 1);
  sh.curve = curve;
  input.connect(dry); dry.connect(output); wd.connect(output);
  const noise = ctx.createBufferSource(), nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  noise.buffer = nb; noise.loop = true;
  const ng = ctx.createGain(); noise.connect(ng); ng.connect(car); noise.start();
  for (let i = 0; i < N; i++) {
    const fr = 120 * Math.pow(7000 / 120, i / (N - 1));
    const mb = ctx.createBiquadFilter(); mb.type = "bandpass"; mb.frequency.value = fr; mb.Q.value = 6;
    const rect = ctx.createWaveShaper(); rect.curve = curve;
    const env = ctx.createBiquadFilter(); env.type = "lowpass"; env.frequency.value = 30;
    const cb = ctx.createBiquadFilter(); cb.type = "bandpass"; cb.frequency.value = fr; cb.Q.value = 6;
    const vca = ctx.createGain(); vca.gain.value = 0;
    input.connect(mb); mb.connect(rect); rect.connect(env); env.connect(vca.gain);
    car.connect(cb); cb.connect(vca); vca.connect(wd);
    bands.push(vca);
  }
  const set = (p) => {
    P = p;
    oscs.forEach((o) => { try { o.stop(); } catch (e) {} });
    oscs.length = 0;
    const iv = { one: [0], fifth: [0, 7], maj: [0, 4, 7], min: [0, 3, 7], oct: [0, 12] }[p.chord] || [0];
    for (const i of iv) for (const d of [-6, 6]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 440 * Math.pow(2, (p.note + i - 69) / 12); o.detune.value = d; const g = ctx.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(car); o.start(); oscs.push(o); }
    ng.gain.value = p.noise * 0.3;
    wd.gain.value = p.mix * 6;
    dry.gain.value = 1 - p.mix;
  };
  set(P);
  return { input, output, set, dispose() { oscs.forEach((o) => { try { o.stop(); } catch (e) {} }); try { noise.stop(); } catch (e) {} } };
};
(function addFxDefs() {
  const DIVS = ["1/1", "1/2", "1/4", "1/8", "1/16", "1/4T", "1/8T", "2/1"];
  const syncP = [{ k: "sync", label: "Sync", toggle: true, hint: "У темпі пісні" }, { k: "div", label: "Ноти", options: DIVS.map((d) => [d, d]), hint: "Швидкість у нотах" }, { k: "rate", label: "Швидк.", min: 0.05, max: 10, step: 0.01, unit: "Гц", log: true, hint: "Швидкість (без Sync)" }];
  const mix = { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Суміш" };
  Object.assign(Plugins.FX, {
    phaser: { name: "Фейзер", cat: "Рух", color: "#14b8a6", desc: "Хвилястий «космічний» рух звуку — класика 70-х і сучасних синтів.", when: "Гітари, Rhodes, пади, хети, синти.", tips: "Повільний темп і великий зворотний зв'язок — глибока «труба». Mix 50% — класичний звук.",
      defaults: () => ({ sync: false, div: "1/2", rate: 0.4, freq: 900, depth: 0.7, feedback: 0.4, mix: 0.5 }),
      params: [...syncP, { k: "freq", label: "Частота", min: 200, max: 4000, step: 1, unit: "Гц", log: true, hint: "Центр руху" }, { k: "depth", label: "Глибина", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Розмах руху" }, { k: "feedback", label: "Зв'язок", min: 0, max: 0.9, step: 0.01, unit: "%", pct: true, hint: "Виразність ефекту" }, mix],
      presets: { "Повільний": { sync: false, div: "1/2", rate: 0.2, freq: 700, depth: 0.8, feedback: 0.5, mix: 0.5 }, "У темпі 1/4": { sync: true, div: "1/4", rate: 1, freq: 1200, depth: 0.6, feedback: 0.3, mix: 0.45 } } },
    flanger: { name: "Флендер", cat: "Рух", color: "#0ea5e9", desc: "Металевий «реактивний» свист — коротка затримка, що плаває.", when: "Гітари, барабани в переходах, синти, ефектні вставки.", tips: "Великий зв'язок — різкий «літак». Маленька глибина — легке мерехтіння.",
      defaults: () => ({ sync: false, div: "1/1", rate: 0.25, delay: 3, depth: 2, feedback: 0.6, mix: 0.5 }),
      params: [...syncP, { k: "delay", label: "Затримка", min: 0.5, max: 15, step: 0.1, unit: "мс", hint: "Базова затримка" }, { k: "depth", label: "Глибина", min: 0, max: 8, step: 0.1, unit: "мс", hint: "Розмах" }, { k: "feedback", label: "Зв'язок", min: -0.9, max: 0.9, step: 0.01, unit: "", hint: "Металевість" }, mix],
      presets: { "Літак": { sync: false, div: "1/1", rate: 0.15, delay: 2, depth: 3, feedback: 0.8, mix: 0.6 }, "Легкий": { sync: false, div: "1/1", rate: 0.4, delay: 4, depth: 1, feedback: 0.3, mix: 0.3 } } },
    autofilter: { name: "Автофільтр", cat: "Рух", color: "#f97316", desc: "Фільтр, що сам відкривається й закривається в темпі — «вау» і пульсації.", when: "Синти, басові лінії, пади, барабанні лупи в підйомах.", tips: "Sync 1/8 і «Пила» — ритмічні пульсації. Повільний синус 1/1 — плавне «дихання».",
      defaults: () => ({ type: "lowpass", freq: 900, q: 4, shape: "sine", sync: true, div: "1/4", rate: 1, depth: 0.7 }),
      params: [{ k: "type", label: "Тип", options: [["lowpass", "Низькі"], ["bandpass", "Смуга"], ["highpass", "Високі"]], hint: "Тип фільтра" }, { k: "freq", label: "Частота", min: 100, max: 8000, step: 1, unit: "Гц", log: true, hint: "Центр руху" }, { k: "q", label: "Резонанс", min: 0.5, max: 18, step: 0.1, unit: "", hint: "Виразність «вау»" }, { k: "shape", label: "Форма", options: [["sine", "Синус"], ["triangle", "Трикутник"], ["square", "Квадрат"], ["sawtooth", "Пила"]], hint: "Форма руху" }, ...syncP, { k: "depth", label: "Глибина", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Розмах" }],
      presets: { "Вау 1/8": { type: "bandpass", freq: 1200, q: 6, shape: "triangle", sync: true, div: "1/8", rate: 1, depth: 0.8 }, "Дихання": { type: "lowpass", freq: 600, q: 2, shape: "sine", sync: true, div: "1/1", rate: 1, depth: 0.9 } } },
    multiband: { name: "Багатосмуговий компресор", cat: "Динаміка", color: "#eab308", desc: "Стискає низи, середину й верхи окремо — щільний мікс без «качання» всього звуку.", when: "Мастер, барабанна шина, бас, вокал з різкими верхами.", tips: "Поріг низів трохи нижче — щільніший бас. Плюс 1–2 дБ на верхах — «повітря».",
      defaults: () => ({ low: 200, high: 3000, ratio: 3, lthr: -20, mthr: -18, hthr: -20, lgain: 0, mgain: 0, hgain: 0 }),
      params: [{ k: "low", label: "Низи до", min: 60, max: 600, step: 1, unit: "Гц", log: true, hint: "Межа низів і середини" }, { k: "high", label: "Верхи від", min: 1500, max: 9000, step: 1, unit: "Гц", log: true, hint: "Межа середини й верхів" }, { k: "ratio", label: "Ступінь", min: 1, max: 10, step: 0.1, unit: ":1", hint: "Наскільки сильно стискати" }, { k: "lthr", label: "Поріг низів", min: -50, max: 0, step: 0.5, unit: "дБ", hint: "" }, { k: "mthr", label: "Поріг сер.", min: -50, max: 0, step: 0.5, unit: "дБ", hint: "" }, { k: "hthr", label: "Поріг верхів", min: -50, max: 0, step: 0.5, unit: "дБ", hint: "" }, { k: "lgain", label: "Низи +", min: -12, max: 12, step: 0.1, unit: "дБ", hint: "" }, { k: "mgain", label: "Сер. +", min: -12, max: 12, step: 0.1, unit: "дБ", hint: "" }, { k: "hgain", label: "Верхи +", min: -12, max: 12, step: 0.1, unit: "дБ", hint: "" }],
      presets: { "Мастер: м'яко": { low: 180, high: 3500, ratio: 2, lthr: -18, mthr: -16, hthr: -18, lgain: 0.5, mgain: 0, hgain: 1 }, "Барабани: щільно": { low: 150, high: 4000, ratio: 4, lthr: -24, mthr: -20, hthr: -22, lgain: 1.5, mgain: 0, hgain: 1 } } },
    vocoder: { name: "Вокодер (робот-голос)", cat: "Колір", color: "#8b5cf6", desc: "Голос «говорить» синтезатором — звучить як робот або хор машин.", when: "Вокал, бек-вокал, речитатив, ефектні вставки.", tips: "Виберіть ноту тональності пісні й акорд. Трохи шуму — розбірливіші приголосні.",
      defaults: () => ({ note: 48, chord: "maj", noise: 0.3, mix: 0.8 }),
      params: [{ k: "note", label: "Нота", min: 36, max: 72, step: 1, unit: "", hint: "Висота синтезатора (MIDI-нота, 48 = До малої октави)" }, { k: "chord", label: "Акорд", options: [["one", "Одна нота"], ["fifth", "Квінта"], ["maj", "Мажор"], ["min", "Мінор"], ["oct", "Октава"]], hint: "Скільки голосів у робота" }, { k: "noise", label: "Шум", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Розбірливість шиплячих" }, mix],
      presets: { "Робот": { note: 48, chord: "one", noise: 0.2, mix: 1 }, "Хор машин": { note: 48, chord: "maj", noise: 0.3, mix: 0.85 } } },
  });
})();
function synthExtras(box, T) {
  const inst = T.m.inst, P = inst.params;
  if (!P) return;
  if (!P.lfo) P.lfo = [{ on: false, dest: "pitch", shape: "sine", sync: false, div: "1/8", rate: 5, depth: 0.2 }, { on: false, dest: "filter", shape: "sine", sync: true, div: "1/4", rate: 1, depth: 0.4 }];
  if (!P.wave) P.wave = { on: false, h: WAVES.organ[1].slice() };
  const macro = () => ({ bright: Math.log(P.filter.cutoff / 200) / Math.log(90), attack: Math.sqrt(P.amp.a / 2), tail: Math.sqrt(P.amp.r / 4), thick: ((P.unison || 1) - 1) / 6, dirt: P.drive || 0 });
  const mv = macro();
  const el = document.createElement("div");
  el.className = "syn-x";
  const DIVS = ["1/1", "1/2", "1/4", "1/8", "1/16", "1/4T", "1/8T", "2/1"];
  el.innerHTML = `<div class="syn-mac"><h6 data-hint="Прості ручки, що одночасно змінюють кілька параметрів синтезатора">Швидкі ручки</h6>
      ${[["bright", "Яскравість", "Відкриває фільтр — звук світлішає"], ["attack", "Атака", "Як швидко звук з'являється: мало — удар, багато — плавний вхід"], ["tail", "Хвіст", "Як довго звук згасає після відпускання"], ["thick", "Товщина", "Кілька розстроєних копій — товстий «суперсо»"], ["dirt", "Бруд", "Перегруз — агресивніше й тепліше"]].map(([k, l, h]) => `<label data-hint="${h}">${l}<input type="range" data-mac="${k}" min="0" max="1" step="0.01" value="${clamp(mv[k], 0, 1)}"></label>`).join("")}</div>
    <div class="syn-lfos">${P.lfo.map((l, i) => `<div class="syn-lfo" data-l="${i}"><h6><label class="chk" data-hint="LFO — повільний генератор, що рухає параметр: вібрато, «вау», пульсації, рух по панорамі"><input type="checkbox" data-lk="on" ${l.on ? "checked" : ""}> LFO ${i + 1}</label></h6>
      <label>Що рухає<select data-lk="dest">${[["pitch", "висоту (вібрато)"], ["filter", "фільтр (вау)"], ["amp", "гучність (тремоло)"], ["pan", "панораму"]].map(([v, t]) => `<option value="${v}" ${l.dest === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Форма<select data-lk="shape">${[["sine", "синус"], ["triangle", "трикутник"], ["square", "квадрат"], ["sawtooth", "пила"]].map(([v, t]) => `<option value="${v}" ${l.shape === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" data-lk="sync" ${l.sync ? "checked" : ""}> у темпі</label>
      <label>${l.sync ? "Ноти" : "Швидкість, Гц"}${l.sync ? `<select data-lk="div">${DIVS.map((d) => `<option ${l.div === d ? "selected" : ""}>${d}</option>`).join("")}</select>` : `<input type="range" data-lk="rate" min="0.1" max="15" step="0.1" value="${l.rate}">`}</label>
      <label>Глибина<input type="range" data-lk="depth" min="0" max="1" step="0.01" value="${l.depth}"></label></div>`).join("")}</div>
    <div class="syn-wave"><h6><label class="chk" data-hint="Замість стандартної форми перший генератор грає вашу хвилю: висота стовпчиків — гучність обертонів"><input type="checkbox" id="wv-on" ${P.wave.on ? "checked" : ""}> Своя хвиля (генератор 1)</label></h6>
      <canvas id="wv-cv" width="320" height="80" data-hint="Тягніть мишкою по стовпчиках — малюйте тембр. Лівий стовпчик — основний тон, далі обертони"></canvas>
      <div class="wv-pre">${Object.entries(WAVES).map(([k, w]) => `<button class="btn ghost sm" data-wv="${k}">${w[0]}</button>`).join("")}</div></div>`;
  box.appendChild(el);
  const commit = (label, rerender) => { saveMix(); if (rerender) renderDock(); };
  let undoT = 0;
  const und = (l) => { const n = Date.now(); if (n - undoT > 1500) pushUndo(l); undoT = n; };
  $$("[data-mac]", el).forEach((r) => r.oninput = () => {
    und("швидкі ручки");
    const v = +r.value;
    if (r.dataset.mac === "bright") P.filter.cutoff = Math.round(200 * Math.pow(90, v));
    else if (r.dataset.mac === "attack") P.amp.a = Math.max(1e-3, +(v * v * 2).toFixed(3));
    else if (r.dataset.mac === "tail") P.amp.r = Math.max(0.02, +(v * v * 4).toFixed(3));
    else if (r.dataset.mac === "thick") { P.unison = 1 + Math.round(v * 6); P.spread = Math.round(v * 40); }
    else if (r.dataset.mac === "dirt") P.drive = v;
    saveMix();
  });
  $$("[data-mac]", el).forEach((r) => r.onchange = () => audition(T, 60, 0.8));
  $$(".syn-lfo", el).forEach((d) => {
    const l = P.lfo[+d.dataset.l];
    $$("[data-lk]", d).forEach((inp) => {
      inp.onchange = () => {
        und("LFO");
        const k = inp.dataset.lk;
        l[k] = inp.type === "checkbox" ? inp.checked : inp.type === "range" ? +inp.value : inp.value;
        commit("LFO", k === "sync");
        audition(T, 60, 0.8);
      };
    });
  });
  const cv = $("#wv-cv", el), h = P.wave.h;
  const paintW = () => { const c = cv.getContext("2d"); c.fillStyle = "#0e1014"; c.fillRect(0, 0, 320, 80); const w = 320 / h.length; h.forEach((v, i) => { c.fillStyle = P.wave.on ? "#a78bfa" : "#4b5262"; c.fillRect(i * w + 2, 78 - v * 74, w - 4, v * 74); }); };
  paintW();
  let drawing = false;
  const setAt = (e) => { const r = cv.getBoundingClientRect(), i = Math.floor((e.clientX - r.left) / r.width * h.length), v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); if (i >= 0 && i < h.length) { h[i] = +v.toFixed(2); paintW(); } };
  cv.onpointerdown = (e) => { und("своя хвиля"); drawing = true; cv.setPointerCapture(e.pointerId); setAt(e); };
  cv.onpointermove = (e) => { if (drawing) setAt(e); };
  cv.onpointerup = () => { drawing = false; if (!h[0] && !h.some((x) => x > 0)) h[0] = 1; saveMix(); audition(T, 60, 0.8); };
  $("#wv-on", el).onchange = (e) => { und("своя хвиля"); P.wave.on = e.target.checked; paintW(); saveMix(); audition(T, 60, 0.8); };
  $$("[data-wv]", el).forEach((b) => b.onclick = () => { und("своя хвиля"); P.wave.h = WAVES[b.dataset.wv][1].slice(); P.wave.on = true; commit("", true); audition(T, 60, 0.8); });
}
const _renderSynth3 = renderSynth;
renderSynth = function(box, T) {
  _renderSynth3(box, T);
  synthExtras(box, T);
};
const _renderSampler3 = renderSampler;
renderSampler = async function(box, T) {
  await _renderSampler3(box, T);
  if (!box.isConnected) return;
  const P = T.m.inst.params, smp = T.m.inst.sample, sel = $("#sm-file", box);
  if (sel && smp && ![...sel.options].some((o) => o.value === smp)) {
    const o = document.createElement("option");
    o.value = smp; o.textContent = "★ " + String(smp).replace(/^lib:/, "").replace(/\.wav$/i, ""); o.selected = true;
    sel.appendChild(o);
  }
  if (!P.grain) P.grain = { on: false, pos: 0.3, scan: 0, spray: 0.05, size: 0.08, density: 25, pitchRand: 0, width: 0.5 };
  const G = P.grain, el = document.createElement("div");
  el.className = "syn-x";
  el.innerHTML = `<div class="syn-mac"><h6><label class="chk" data-hint="Гранулярний синтез: семпл ріжеться на сотні крихітних шматочків, які звучать хмарою. З будь-якого звуку виходять пади, текстури й атмосфери"><input type="checkbox" id="gr-on" ${G.on ? "checked" : ""}> Гранулярний режим</label></h6>
    ${[["pos", "Місце в семплі", 0, 1, 0.01, "З якої частини семпла брати шматочки"], ["scan", "Рух по семплу", 0, 0.5, 0.01, "Позиція повільно йде вперед, поки нота звучить"], ["spray", "Розкид", 0, 0.5, 0.01, "Наскільки випадково брати шматочки навколо позиції"], ["size", "Розмір шматочка, с", 0.01, 0.4, 0.005, "Маленькі — шорстка текстура, великі — плавна хмара"], ["density", "Щільність", 2, 80, 1, "Скільки шматочків за секунду"], ["pitchRand", "Розкид висоти", 0, 12, 0.1, "Випадкове розстроювання шматочків, півтонів"], ["width", "Ширина", 0, 1, 0.01, "Розкидання по стерео"]].map(([k, l, a, b, s, hh]) => `<label data-hint="${hh}">${l}<input type="range" data-g="${k}" min="${a}" max="${b}" step="${s}" value="${G[k]}"></label>`).join("")}</div>`;
  box.appendChild(el);
  $("#gr-on", el).onchange = (e) => { pushUndo("гранулярний режим"); G.on = e.target.checked; if (G.on && (!P.amp || P.amp.a < 0.05)) P.amp = Object.assign({}, P.amp || {}, { a: 0.15, d: 0.2, s: 1, r: 0.8 }); saveMix(); audition(T, 60, 0.8); };
  $$("[data-g]", el).forEach((r) => { r.oninput = () => { G[r.dataset.g] = +r.value; saveMix(); }; r.onchange = () => audition(T, 60, 0.8); });
};
const _renderDrums3 = renderDrums;
renderDrums = async function(box, T) {
  await _renderDrums3(box, T);
  if (!box.isConnected || T.m.inst.kit !== "design") return;
  const grp = S.selPad || "kick", pads = T.m.inst.pads, pad = pads[grp] = pads[grp] || {};
  const d = pad.dz = Object.assign({}, DESIGN_DEF[grp] || DESIGN_DEF.perc, pad.dz || {});
  const el = document.createElement("div");
  el.className = "syn-x";
  el.innerHTML = `<div class="syn-mac"><h6 data-hint="Звук пада створюється з нуля: тон (тіло удару) + шум (тріск, шелест) + клік (атака)">Конструктор звуку: ${escapeHtml((Plugins.DRUM_PADS.find((p) => p[0] === grp) || [])[1] || grp)}</h6>
    ${DESIGN_P.map(([k, l, a, b, s]) => `<label>${l}<input type="range" data-dz="${k}" min="${a}" max="${b}" step="${s}" value="${d[k]}"></label>`).join("")}
    <button class="btn ghost sm" id="dz-reset" data-hint="Повернути стандартний звук цього пада">Скинути пад</button></div>`;
  box.appendChild(el);
  const n = (Plugins.DRUM_PADS.find((p) => p[0] === grp) || [0, 0, 36])[2];
  let ut = 0;
  $$("[data-dz]", el).forEach((r) => { r.oninput = () => { if (Date.now() - ut > 1500) pushUndo("звук пада"); ut = Date.now(); d[r.dataset.dz] = +r.value; saveMix(); }; r.onchange = () => audition(T, n, 0.9); });
  $("#dz-reset", el).onclick = () => { pushUndo("звук пада"); delete pad.dz; saveMix(); renderDock(); audition(T, n, 0.9); };
};
async function resampleTrack(t, opts) {
  const A = ensureCtx(), SR = A.ctx.sampleRate, P = period();
  const a = opts.loop && S.loop ? S.loop.a : 0, b = opts.loop && S.loop ? S.loop.b : arrEnd();
  const len = Math.ceil(((b - a) * P + (opts.tail || 1.5)) * SR);
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  await loadInstrumentBuffers();
  const m = mt(t.id), st = new DSP.Strip(ctx, ctx.destination, fxEnv());
  st.setFx(m.fx);
  st.fader.gain.value = 1;
  scheduleTrackSources(ctx, t, m, st, a, b, (x) => A.buffers[srcKey(x)], A.ibuf);
  return ctx.startRendering();
}
async function openResample(t) {
  const hasLoop = !!(S.loop && S.loop.b > S.loop.a);
  const m = careModalBox("resample-modal", "Ресемплінг: звук доріжки → новий семпл", `<p>Звук доріжки «${escapeHtml(t.name)}» з усіма ефектами записується в новий семпл. Його можна грати як інструмент на клавіатурі, різати, розтягувати чи пустити в гранулярний режим — так народжуються нові звуки.</p>
    <div class="mel-grid">
      <label data-hint="Яку частину записати">Що записати <select id="rs-rng"><option value="loop" ${hasLoop ? "selected" : ""} ${hasLoop ? "" : "disabled"}>виділений цикл${hasLoop ? "" : " (немає)"}</option><option value="all" ${hasLoop ? "" : "selected"}>усю доріжку</option></select></label>
      <label data-hint="Куди покласти результат">Результат <select id="rs-to"><option value="sampler">новий інструмент-семплер</option><option value="audio">нова аудіодоріжка</option></select></label>
      <label data-hint="Назва семпла в бібліотеці">Назва <input id="rs-name" value="${escapeHtml(t.name.slice(0, 30))} resample"></label>
    </div><p class="muted small">Порада: виділіть 1–2 такти циклом (тягніть по лінійці) — вийде луп або звук для семплера.</p>
    <div class="modal-actions"><button class="btn ghost" data-k="x">Скасувати</button><button class="btn primary" id="rs-go">Записати</button></div>`);
  $("#rs-go", m).onclick = async () => {
    const loop = $("#rs-rng", m).value === "loop", to = $("#rs-to", m).value, name = ($("#rs-name", m).value || "resample").replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 50) || "resample";
    $("#rs-go", m).disabled = true;
    $("#rs-go", m).textContent = "Записую…";
    try {
      const buf = await resampleTrack(t, { loop });
      const wav = new Blob([DSP.encodeWav(buf)], { type: "audio/wav" });
      if (to === "sampler") {
        const fd = new FormData();
        fd.append("files", wav, name + ".wav");
        const r = await fetch("/api/library/sample", { method: "POST", body: fd }), j = await r.json();
        if (!r.ok || !j.added || !j.added.length) throw new Error((j.errors || [])[0] || j.error || "помилка");
        const add = j.added[0], sid = add.id, root = add.root || 60;
        pushUndo("ресемплінг");
        addMidiTrack("keys");
        const nt = findT(S.sel);
        mt(nt.id).inst = { type: "sampler", sample: sid, params: { root, tune: 0, gain: 0.8, amp: { a: 2e-3, d: 0.2, s: 1, r: 0.3 }, oneshot: false } };
        afterEdit(true);
        await loadInstrumentBuffers();
        S.dockTab = "inst";
        renderDock();
        m.hidden = true;
        toast(`Семпл «${name}» готовий: нова доріжка-семплер. Грайте його з клавіатури (нота, визначена як основна, звучить в оригінальній висоті).`);
      } else {
        const fd = new FormData();
        fd.append("file", wav, name + ".wav");
        fd.append("start", String(Math.max(0, (loop ? S.loop.a : 0) * period() - S.B.timing.pad)));
        fd.append("name", name);
        fd.append("kind", "other");
        fd.append("transcribe", "0");
        stopPlay();
        await flushMix();
        const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd }), j = await r.json();
        if (!r.ok) throw new Error(j.error || "помилка");
        await careWait(j.job, () => {});
        m.hidden = true;
        await reloadProject();
        toast(`Аудіодоріжку «${name}» додано.`);
      }
    } catch (e) {
      toast("Не вдалося: " + e.message, true);
      $("#rs-go", m).disabled = false;
      $("#rs-go", m).textContent = "Записати";
    }
  };
}
(function sound3Menus() {
  document.addEventListener("click", (e) => {
    const more = e.target.closest && e.target.closest(".lh-more");
    if (!more) return;
    setTimeout(() => {
      const m = $("#ctxmenu"), h = more.closest(".lane-head");
      if (!m || !h) return;
      const t = tracksAll()[$$(".lane-head").indexOf(h)];
      if (!t) return;
      const b = document.createElement("button");
      b.textContent = tr("Ресемплінг: записати звук у новий семпл…");
      b.onclick = () => { closeMenu(); openResample(t); };
      m.appendChild(b);
    }, 0);
  });
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Ресемплінг вибраної доріжки…", needProject(() => { const t = S.sel && findT(S.sel); if (!t) return toast("Спершу виберіть доріжку.", true); openResample(t); })]]);
})();
