"use strict";
const MFX_TYPES = {
  arp: { name: "Арпеджіатор", hint: "Затиснутий акорд розкладається на ноти по черзі — як арпеджіо на синтезаторі. Грайте або малюйте довгі акорди", def: { rate: 0.25, mode: "up", oct: 1, gate: 0.8 } },
  chord: { name: "Акорд з однієї ноти", hint: "Кожна нота перетворюється на акорд. «По гамі» — акорд тональності від цієї ноти", def: { shape: "diat" } },
  scale: { name: "Гама (без фальшивих нот)", hint: "Ноти поза гамою підтягуються до найближчої ноти гами з «Гармонії»", def: {} },
  chance: { name: "Ймовірність", hint: "Частина нот випадково пропускається, а гучність трохи гуляє — патерн звучить живіше й щоразу трохи інакше", def: { chance: 0.85, vel: 0.15 } },
  echo: { name: "Ехо нот", hint: "Кожна нота повторюється кілька разів, тихіше й тихіше. Можна зсувати висоту повторів", def: { time: 0.75, repeats: 2, decay: 0.55, step: 0 } },
  transpose: { name: "Транспонування", hint: "Зсуває всі ноти на півтони чи октави без зміни нот у піано-ролі", def: { semi: 0 } },
  human: { name: "Живість", hint: "Невеликі зсуви в часі й гучності — без «машинності»", def: { time: 0.015, vel: 10 } },
  glide: { name: "Глайд (слайди 808)", hint: "Коли ноти накладаються, звук плавно ковзає з однієї висоти на іншу, як у трапових 808. Найкраще з одноголосим інструментом", def: { time: 0.08 } },
};
const MFX_PARAMS = {
  arp: [["rate", "Швидкість", "sel", [[0.5, "1/8"], [0.25, "1/16"], [0.3333333, "1/8 тріоль"], [0.125, "1/32"], [1, "1/4"]]], ["mode", "Порядок", "sel", [["up", "вгору"], ["down", "вниз"], ["updown", "вгору-вниз"], ["random", "випадково"], ["order", "як зіграно"], ["chord", "акорд пульсом"]]], ["oct", "Октави", "sel", [[1, "1"], [2, "2"], [3, "3"]]], ["gate", "Довжина нот", "rng", [0.1, 1, 0.05]]],
  chord: [["shape", "Акорд", "sel", [["diat", "по гамі (тризвук)"], ["diat7", "по гамі (септакорд)"], ["maj", "мажор"], ["min", "мінор"], ["power", "пауер (1-5-8)"], ["oct", "октава"], ["sus2", "sus2"], ["sus4", "sus4"], ["stack", "квінти (1-5-9)"]]]],
  scale: [],
  chance: [["chance", "Залишити нот", "rng", [0.1, 1, 0.05]], ["vel", "Розкид гучності", "rng", [0, 0.5, 0.05]]],
  echo: [["time", "Інтервал", "sel", [[0.25, "1/16"], [0.5, "1/8"], [0.75, "1/8 з крапкою"], [1, "1/4"], [0.3333333, "1/8 тріоль"]]], ["repeats", "Повторів", "sel", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [6, "6"]]], ["decay", "Згасання", "rng", [0.2, 0.9, 0.05]], ["step", "Зсув висоти", "sel", [[0, "без зсуву"], [12, "+октава"], [-12, "−октава"], [7, "+квінта"], [5, "+кварта"]]]],
  transpose: [["semi", "Півтонів", "sel", Array.from({ length: 49 }, (_, i) => [i - 24, (i - 24 > 0 ? "+" : "") + (i - 24)])]],
  human: [["time", "Час", "rng", [0, 0.05, 0.005]], ["vel", "Гучність", "rng", [0, 30, 1]]],
  glide: [["time", "Час слайду, с", "rng", [0.02, 0.4, 0.01]]],
};
const MFX_SHAPES = { maj: [0, 4, 7], min: [0, 3, 7], power: [0, 7, 12], oct: [0, 12], sus2: [0, 2, 7], sus4: [0, 5, 7], stack: [0, 7, 14] };
function mfxHash(a, b) {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function mfxList(t) {
  const m = S.mix && S.mix.tracks && S.mix.tracks[t.id];
  return m && Array.isArray(m.mfx) ? m.mfx.filter((f) => f.on !== false) : [];
}
function mfxArp(notes, f) {
  if (!notes.length) return notes;
  const rate = +f.rate || 0.25, out = [], oct = +f.oct || 1, gate = f.gate ?? 0.8;
  const sorted = [...notes].sort((a, b) => a[0] - b[0]);
  const end = Math.max(...sorted.map((n) => n[0] + n[1]));
  let ptr = 0, active = [], k = 0, lastKey = "";
  for (let x = Math.floor(sorted[0][0] / rate) * rate; x < end - 1e-6; x += rate) {
    while (ptr < sorted.length && sorted[ptr][0] <= x + rate * 0.5) active.push(sorted[ptr++]);
    active = active.filter((n) => n[0] + n[1] > x + 1e-4);
    if (!active.length) { k = 0; continue; }
    const base = f.mode === "order" ? active.map((n) => n[2]) : [...new Set(active.map((n) => n[2]))].sort((a, b) => a - b);
    const tones = [];
    for (let o = 0; o < oct; o++) for (const p of base) tones.push(p + 12 * o);
    const key = tones.join(",");
    if (key !== lastKey) lastKey = key;
    const v = Math.max(...active.map((n) => n[3]));
    const acc = Math.abs(x % 1) < 1e-6 ? 1 : 0.86;
    const st = Math.max(x, Math.min(...active.map((n) => n[0])));
    if (f.mode === "chord") { for (const p of tones) out.push([st, rate * gate, p, Math.round(v * acc)]); k++; continue; }
    let p;
    if (f.mode === "down") p = tones[tones.length - 1 - (k % tones.length)];
    else if (f.mode === "updown") { const L = Math.max(1, tones.length * 2 - 2), i = k % L; p = tones[i < tones.length ? i : L - i]; }
    else if (f.mode === "random") p = tones[Math.floor(mfxHash(x, tones.length) * tones.length) % tones.length];
    else p = tones[k % tones.length];
    out.push([st, rate * gate, p, Math.round(v * acc)]);
    k++;
  }
  return out;
}
function mfxApply(t, notes) {
  let ns = notes;
  for (const f of mfxList(t)) {
    if (f.type === "arp") ns = mfxArp(ns, f);
    else if (f.type === "chord") {
      const out = [];
      for (const n of ns) {
        let iv;
        if (f.shape === "diat" || f.shape === "diat7") {
          const k = hmKey(), sc = hmChordScale(), p = hmSnapP(n[2]), d = sc.indexOf(((p - k.tonic) % 12 + 12) % 12);
          const st = f.shape === "diat7" ? [0, 2, 4, 6] : [0, 2, 4];
          iv = st.map((s) => sc[(d + s) % 7] + (d + s >= 7 ? 12 : 0) - sc[d] + (p - n[2]));
        } else iv = MFX_SHAPES[f.shape] || MFX_SHAPES.maj;
        iv.forEach((i, j) => out.push([n[0], n[1], clamp(n[2] + i, 0, 127), j ? Math.max(1, n[3] - 8) : n[3]]));
      }
      ns = out;
    } else if (f.type === "scale") ns = ns.map((n) => [n[0], n[1], hmSnapP(n[2]), n[3]]);
    else if (f.type === "chance") ns = ns.filter((n) => mfxHash(n[0], n[2]) < (f.chance ?? 0.85)).map((n) => [n[0], n[1], n[2], clamp(Math.round(n[3] * (1 + (mfxHash(n[2], n[0]) * 2 - 1) * (f.vel || 0))), 1, 127)]);
    else if (f.type === "echo") {
      const out = [];
      for (const n of ns) {
        out.push(n);
        for (let j = 1; j <= (+f.repeats || 2); j++) out.push([n[0] + j * (+f.time || 0.5), n[1], clamp(n[2] + j * (+f.step || 0), 0, 127), Math.max(1, Math.round(n[3] * Math.pow(f.decay ?? 0.55, j)))]);
      }
      ns = out;
    } else if (f.type === "transpose") ns = ns.map((n) => [n[0], n[1], clamp(n[2] + (+f.semi || 0), 0, 127), n[3]]);
    else if (f.type === "human") ns = ns.map((n) => [Math.max(0, n[0] + (mfxHash(n[0], n[2] + 7) * 2 - 1) * (f.time || 0)), n[1], n[2], clamp(Math.round(n[3] + (mfxHash(n[2] + 3, n[0]) * 2 - 1) * (f.vel || 0)), 1, 127)]);
  }
  return ns.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}
const _mfxCache = new Map();
const _arrangedRaw = arranged;
arranged = function(t) {
  const raw = _arrangedRaw(t), list = mfxList(t).filter((f) => f.type !== "glide");
  if (!list.length) return raw;
  const key = JSON.stringify(list) + "|" + (S.mix.harmony ? JSON.stringify(S.mix.harmony.scale || "") + S.mix.harmony.tonic : "");
  const c = _mfxCache.get(t.id);
  if (c && c.raw === raw && c.key === key) return c.out;
  const out = mfxApply(t, raw);
  _mfxCache.set(t.id, { raw, key, out });
  return out;
};
const _playNotesRaw = playNotes;
playNotes = function(t) {
  const ns = _playNotesRaw(t), g = mfxList(t).find((f) => f.type === "glide");
  if (!g || !ns.length) return ns;
  const out = ns.map((n) => n.slice(0, 4));
  let head = null;
  for (let i = 0; i < out.length; i++) {
    const n = out[i];
    if (head && n[0] < head[0] + head[1] - 0.01 && n[0] > head[0] + 1e-3) {
      const info = head[4] || (head[4] = { slide: [], time: +g.time || 0.08 });
      info.slide.push([n[0], (n[2] - head[2]) * 100]);
      head[1] = Math.max(head[1], n[0] + n[1] - head[0]);
      out[i] = [n[0], n[1], n[2], n[3], { mute: true }];
      continue;
    }
    head = n;
  }
  return out;
};
const _noteModsRaw = noteMods;
noteMods = function(t, n, toTime) {
  if (n[4] && n[4].mute) return { mute: true };
  const base = _noteModsRaw(t, n, toTime);
  if (!n[4] || !n[4].slide) return base;
  const pts = [[toTime(n[0]), 0]];
  let prev = 0;
  for (const [b, c] of n[4].slide) { const tt = toTime(b); pts.push([tt, prev], [tt + n[4].time, c]); prev = c; }
  return Object.assign({}, base || {}, { bend: pts });
};
const DRUM_KITS = [["song", "Удари з пісні"], ["808", "808"], ["909", "909"], ["acoustic", "Акустичний"], ["rock", "Рок"], ["trap", "Трап"], ["lofi", "Лоу-фай"], ["electro", "Електро"], ["perc", "Перкусія"]];
const KIT_SYN = new Set(["909", "rock", "trap", "lofi", "electro", "perc"]);
function kitGroup(n) {
  return n === 36 || n === 35 ? "kick" : [38, 40].includes(n) ? "snare" : n === 39 ? "clap" : n === 37 ? "rim" : [42, 44].includes(n) ? "hat" : n === 46 ? "openhat" : [49, 57].includes(n) ? "crash" : n === 51 ? "ride" : [45, 47, 48, 50, 41, 43].includes(n) ? "tom" : n === 56 ? "bell" : "perc";
}
function kitSynth(ctx, out, kit, note, vel, t0, pad) {
  const v = (0.25 + 0.75 * vel) * (pad.vol ?? 1), tune = Math.pow(2, (pad.tune || 0) / 12), dk = pad.decay ?? 1;
  let dest = out;
  if (kit === "lofi") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 4200; lp.Q.value = 0.4;
    lp.connect(out); dest = lp;
  }
  if (pad.pan) { const pn = ctx.createStereoPanner(); pn.pan.value = pad.pan; pn.connect(dest); dest = pn; }
  const env = (g, peak, dur, at = 1e-3) => { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak * v, t0 + at); g.gain.exponentialRampToValueAtTime(8e-4, t0 + at + dur * dk); };
  const noise = (dur, type, freq, q, gain, at) => {
    const s = ctx.createBufferSource();
    const len = Math.min(3, dur * dk + 0.1);
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq * tune; f.Q.value = q;
    const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(dest);
    env(g, gain, dur, at);
    s.start(t0); s.stop(t0 + len);
  };
  const tone = (f0, f1, dur, gain, type = "sine", sweep = 0.6, drive = 0) => {
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0 * tune, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * tune), t0 + dur * sweep);
    let node = o;
    if (drive) {
      const ws = ctx.createWaveShaper(), c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * (1 + drive * 6)); }
      ws.curve = c; o.connect(ws); node = ws;
    }
    node.connect(g); g.connect(dest);
    env(g, gain, dur);
    o.start(t0); o.stop(t0 + dur * dk + 0.1);
  };
  const clap = (gain, spread = 0.011) => { for (let i = 0; i < 3; i++) { const tt = t0 + i * spread; const s = ctx.createBufferSource(), b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate), d = b.getChannelData(0); for (let j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1; s.buffer = b; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1300 * tune; f.Q.value = 1.1; const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(dest); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(gain * v * (i === 2 ? 1 : 0.7), tt + 1e-3); g.gain.exponentialRampToValueAtTime(8e-4, tt + (i === 2 ? 0.22 * dk : 0.02)); s.start(tt); s.stop(tt + 0.3); } };
  const g = kitGroup(note);
  const P = {
    "909": { kick: () => { tone(180, 50, 0.45, 1, "sine", 0.25); noise(0.012, "highpass", 2500, 0.7, 0.35); }, snare: () => { tone(190, 170, 0.12, 0.45, "triangle"); noise(0.2, "highpass", 1500, 0.6, 0.5); }, clap: () => clap(0.8), hat: () => noise(0.05, "highpass", 9500, 1.2, 0.28), openhat: () => noise(0.38, "highpass", 9000, 1.2, 0.26), crash: () => noise(1.5, "highpass", 6000, 0.6, 0.22), ride: () => noise(0.9, "bandpass", 8000, 2.5, 0.2), tom: () => { const f = { 41: 90, 43: 105, 45: 120, 47: 145, 48: 170, 50: 200 }[note] || 140; tone(f * 1.6, f, 0.35, 0.65); }, rim: () => tone(1700, 1600, 0.03, 0.5, "square"), bell: () => { tone(800, 800, 0.3, 0.25, "square", 1); tone(540, 540, 0.3, 0.25, "square", 1); }, perc: () => noise(0.08, "bandpass", 3000, 3, 0.35) },
    rock: { kick: () => { tone(120, 55, 0.35, 1, "sine", 0.35); noise(0.03, "lowpass", 2500, 0.7, 0.3); tone(60, 45, 0.25, 0.4); }, snare: () => { tone(200, 150, 0.15, 0.5, "triangle"); noise(0.32, "bandpass", 2200, 0.5, 0.7); noise(0.1, "highpass", 5000, 0.7, 0.25); }, clap: () => clap(0.7), hat: () => noise(0.07, "highpass", 7000, 0.9, 0.3), openhat: () => noise(0.5, "highpass", 6500, 0.9, 0.28), crash: () => noise(2, "highpass", 4500, 0.5, 0.28), ride: () => { noise(1.2, "bandpass", 6000, 3, 0.2); tone(3000, 3000, 0.6, 0.05, "sine", 1); }, tom: () => { const f = { 41: 80, 43: 95, 45: 105, 47: 130, 48: 150, 50: 180 }[note] || 120; tone(f * 1.3, f, 0.5, 0.75); noise(0.05, "lowpass", 1500, 0.7, 0.2); }, rim: () => tone(1500, 1400, 0.04, 0.45, "square"), bell: () => tone(700, 700, 0.4, 0.25, "square", 1), perc: () => noise(0.1, "bandpass", 2500, 3, 0.35) },
    trap: { kick: () => tone(70, 34, 1.6, 1, "sine", 0.12, 0.4), snare: () => { tone(330, 220, 0.08, 0.35, "triangle"); noise(0.16, "highpass", 2200, 0.8, 0.6); clap(0.35, 0.007); }, clap: () => clap(0.9, 0.009), hat: () => noise(0.035, "highpass", 10000, 1.5, 0.3), openhat: () => noise(0.3, "highpass", 9500, 1.5, 0.26), crash: () => noise(1.8, "highpass", 6500, 0.5, 0.2), ride: () => noise(0.8, "bandpass", 8500, 3, 0.18), tom: () => { const f = { 41: 70, 43: 85, 45: 100, 47: 125, 48: 150, 50: 180 }[note] || 110; tone(f * 1.4, f, 0.6, 0.7, "sine", 0.3, 0.2); }, rim: () => tone(1900, 1800, 0.025, 0.5, "square"), bell: () => { tone(800, 800, 0.25, 0.25, "square", 1); tone(540, 540, 0.25, 0.25, "square", 1); }, perc: () => noise(0.06, "bandpass", 4000, 4, 0.35) },
    lofi: { kick: () => { tone(110, 48, 0.38, 0.9, "sine", 0.3, 0.15); }, snare: () => { tone(210, 170, 0.1, 0.35, "triangle"); noise(0.18, "bandpass", 1800, 0.6, 0.45); }, clap: () => clap(0.55, 0.014), hat: () => noise(0.05, "bandpass", 6000, 1, 0.22), openhat: () => noise(0.3, "bandpass", 5500, 1, 0.2), crash: () => noise(1.2, "bandpass", 4500, 0.7, 0.16), ride: () => noise(0.7, "bandpass", 5000, 3, 0.15), tom: () => { const f = { 45: 110, 47: 140, 48: 165, 50: 200 }[note] || 140; tone(f * 1.3, f, 0.35, 0.55); }, rim: () => tone(1300, 1200, 0.04, 0.4, "square"), bell: () => tone(700, 700, 0.3, 0.2, "triangle", 1), perc: () => noise(0.09, "bandpass", 2500, 3, 0.3) },
    electro: { kick: () => { tone(150, 42, 0.4, 1, "sine", 0.2, 0.3); noise(0.008, "highpass", 3000, 0.7, 0.4); }, snare: () => { tone(260, 180, 0.1, 0.45, "square", 0.4); noise(0.18, "highpass", 2500, 0.8, 0.5); }, clap: () => clap(0.85, 0.008), hat: () => noise(0.04, "highpass", 11000, 2, 0.28), openhat: () => noise(0.25, "highpass", 10000, 2, 0.25), crash: () => noise(1.4, "highpass", 7000, 0.5, 0.2), ride: () => noise(0.7, "bandpass", 9000, 4, 0.18), tom: () => { const f = { 45: 120, 47: 150, 48: 180, 50: 220 }[note] || 150; tone(f * 2, f, 0.3, 0.6, "square", 0.3); }, rim: () => tone(2000, 1900, 0.025, 0.45, "square"), bell: () => tone(900, 900, 0.25, 0.25, "square", 1), perc: () => tone(1200, 400, 0.08, 0.35, "square", 0.5) },
    perc: { kick: () => { tone(90, 60, 0.4, 0.9, "sine", 0.4); noise(0.03, "lowpass", 800, 0.7, 0.4); }, snare: () => { tone(400, 300, 0.08, 0.4, "triangle"); noise(0.08, "bandpass", 3500, 1.5, 0.45); }, clap: () => clap(0.8, 0.013), hat: () => noise(0.09, "bandpass", 7000, 3, 0.3), openhat: () => noise(0.35, "highpass", 6000, 1.5, 0.25), crash: () => noise(1.4, "highpass", 5000, 0.5, 0.2), ride: () => tone(2200, 2200, 0.5, 0.18, "triangle", 1), tom: () => { const f = { 41: 140, 43: 170, 45: 200, 47: 260, 48: 320, 50: 380 }[note] || 240; tone(f * 1.15, f, 0.25, 0.7); }, rim: () => tone(1100, 1000, 0.05, 0.5, "triangle"), bell: () => { tone(1250, 1250, 0.35, 0.3, "triangle", 1); tone(1875, 1875, 0.2, 0.12, "sine", 1); }, perc: () => { const f = 300 + (note % 12) * 60; tone(f * 1.2, f, 0.15, 0.55, "triangle"); } },
  }[kit];
  (P[g] || P.perc)();
}
const _dspPlayB = DSP.playNote;
DSP.playNote = function(ctx, out, inst, pitch, vel, t0, dur, buffers, mods) {
  if (mods && mods.mute) return;
  if (inst && inst.type === "drums" && KIT_SYN.has(inst.kit)) {
    const grp = DSP_DRUM_GROUP(pitch), pad = inst.pads && inst.pads[grp] || {};
    if (pad.mute) return;
    if (pad.sample && buffers && buffers.get("drum:" + grp + ":" + pad.sample)) return _dspPlayB(ctx, out, inst, pitch, vel, t0, dur, buffers, mods);
    return kitSynth(ctx, out, inst.kit, pitch, vel, t0, pad);
  }
  return _dspPlayB(ctx, out, inst, pitch, vel, t0, dur, buffers, mods);
};
function DSP_DRUM_GROUP(n) {
  return n === 36 ? "kick" : [38, 39, 40].includes(n) ? "snare" : [42, 44].includes(n) ? "hat" : n === 46 ? "openhat" : [49, 57].includes(n) ? "crash" : n === 51 ? "ride" : [45, 47, 48, 50].includes(n) ? "tom" : "perc";
}
function mfxRefresh(t) {
  _arrCache.clear();
  _mfxCache.delete(t.id);
  saveMix();
  draw();
}
function mfxPanel(el, T) {
  const t = T.t, m = T.m;
  if (t.is_drums && !(m.mfx || []).length) {
    const box0 = document.createElement("div");
    box0.className = "mfx-box";
    box0.innerHTML = `<div class="mfx-head"><h6>MIDI-ефекти</h6><span class="spacer"></span><button class="btn ghost sm" id="mfx-add" data-hint="Ефекти, які змінюють ноти під час відтворення: ймовірність, живість, ехо… Ноти в піано-ролі не змінюються">＋ MIDI-ефект</button></div>`;
    el.querySelector(".inst").insertBefore(box0, el.querySelector(".inst").firstChild.nextSibling);
    $("#mfx-add", box0).onclick = (e) => mfxAddMenu(e, T);
    return;
  }
  const list = m.mfx || [];
  const box = document.createElement("div");
  box.className = "mfx-box";
  box.innerHTML = `<div class="mfx-head"><h6>MIDI-ефекти</h6><span class="muted small">змінюють ноти під час відтворення й експорту; ноти в піано-ролі лишаються як є</span><span class="spacer"></span><button class="btn ghost sm" id="mfx-add" data-hint="Додати ефект нот: арпеджіатор, акорд з однієї ноти, гама, ймовірність, ехо, транспонування, живість, глайд">＋ MIDI-ефект</button></div>
    ${list.map((f, i) => `<div class="mfx-card ${f.on === false ? "off" : ""}" data-i="${i}">
      <div class="mfx-ch"><button class="mfx-pow ${f.on === false ? "" : "on"}" data-pow data-hint="Увімкнути / вимкнути ефект">⏻</button><b data-hint="${escapeHtml(MFX_TYPES[f.type].hint)}">${escapeHtml(MFX_TYPES[f.type].name)}</b><span class="spacer"></span>
        <button class="mfx-b" data-up data-hint="Вище в ланцюжку (обробляється раніше)">▲</button><button class="mfx-b" data-dn data-hint="Нижче в ланцюжку">▼</button><button class="mfx-b" data-del data-hint="Прибрати ефект">✕</button></div>
      <div class="mfx-ps">${(MFX_PARAMS[f.type] || []).map(([k, l, kind, o]) => kind === "sel"
        ? `<label>${escapeHtml(l)}<select data-k="${k}">${o.map(([v, lab]) => `<option value="${v}" ${String(v) === String(f[k]) ? "selected" : ""}>${escapeHtml(lab)}</option>`).join("")}</select></label>`
        : `<label>${escapeHtml(l)} <span class="val">${f[k]}</span><input type="range" data-k="${k}" min="${o[0]}" max="${o[1]}" step="${o[2]}" value="${f[k]}"></label>`).join("") || `<span class="muted small">${escapeHtml(MFX_TYPES[f.type].hint)}</span>`}</div></div>`).join("")}`;
  const inst = el.querySelector(".inst");
  inst.insertBefore(box, inst.firstChild && inst.firstChild.nextSibling);
  $("#mfx-add", box).onclick = (e) => mfxAddMenu(e, T);
  $$(".mfx-card", box).forEach((c) => {
    const i = +c.dataset.i, f = list[i];
    $("[data-pow]", c).onclick = () => { pushUndo("MIDI-ефект"); f.on = f.on === false; mfxRefresh(t); renderDock(); };
    $("[data-del]", c).onclick = () => { pushUndo("MIDI-ефект"); list.splice(i, 1); mfxRefresh(t); renderDock(); };
    $("[data-up]", c).onclick = () => { if (i > 0) { pushUndo("MIDI-ефект"); [list[i - 1], list[i]] = [list[i], list[i - 1]]; mfxRefresh(t); renderDock(); } };
    $("[data-dn]", c).onclick = () => { if (i < list.length - 1) { pushUndo("MIDI-ефект"); [list[i + 1], list[i]] = [list[i], list[i + 1]]; mfxRefresh(t); renderDock(); } };
    $$("[data-k]", c).forEach((inp) => {
      inp.oninput = () => { const v = inp.tagName === "SELECT" && isNaN(+inp.value) ? inp.value : +inp.value; f[inp.dataset.k] = v; const sv = inp.parentElement.querySelector(".val"); if (sv) sv.textContent = v; };
      inp.onchange = () => { pushUndo("MIDI-ефект"); inp.oninput(); mfxRefresh(t); };
    });
  });
}
function mfxAddMenu(e, T) {
  const t = T.t, m = T.m;
  menu(e, Object.entries(MFX_TYPES).filter(([k]) => !t.is_drums || ["chance", "echo", "human"].includes(k)).map(([k, d]) => [d.name, () => {
    pushUndo("MIDI-ефект");
    if (!m.mfx) m.mfx = [];
    m.mfx.push(Object.assign({ type: k, on: true }, Plugins.clone(d.def)));
    if (k === "arp") toast("Арпеджіатор: малюйте в нотах довгі акорди — вони розкладуться на ноти по черзі.");
    if (k === "glide") toast("Глайд: накладіть кінець ноти на початок наступної — звук ковзне на нову висоту.");
    mfxRefresh(t);
    renderDock();
  }]));
}
const _renderInstTabB = renderInstTab;
renderInstTab = function(el, T) {
  _renderInstTabB(el, T);
  if (el.querySelector(".inst")) mfxPanel(el, T);
};
const GROOVES = {
  s54: ["Свінг 54% (легкий)", { sw16: 0.54 }],
  s58: ["Свінг 58%", { sw16: 0.58 }],
  s62: ["Свінг 62% (хіп-хоп)", { sw16: 0.62 }],
  s66: ["Свінг 66% (тріольний)", { sw16: 0.66 }],
  sh8: ["Шафл восьмими", { sw8: 0.66 }],
  lazy: ["Лінивий (малий запізнюється)", { off: [0, 0.03, 0.015, 0.035], snareLate: 0.03, vel: [1, 0.82, 0.92, 0.8] }],
  push: ["Підганяє (трохи раніше)", { off: [0, -0.015, -0.02, -0.015], vel: [1, 0.85, 0.95, 0.85] }],
  drunk: ["П'яний біт (нерівний)", { off: [0, 0.045, -0.01, 0.055], vel: [1, 0.75, 0.9, 0.7] }],
  accent: ["Лише акценти (без зсуву)", { off: [0, 0, 0, 0], vel: [1.1, 0.7, 0.88, 0.7] }],
};
function grooveFromTrack(src) {
  const ns = arranged(src), acc = [[], [], [], []], vacc = [[], [], [], []];
  for (const n of ns) {
    const q = Math.round(n[0] * 4) / 4, d = n[0] - q;
    if (Math.abs(d) > 0.1) continue;
    const pos = ((Math.round((q % 1) * 4)) % 4 + 4) % 4;
    acc[pos].push(d);
    vacc[pos].push(n[3]);
  }
  const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const v0 = avg(vacc[0]) || 100;
  return { off: acc.map(avg), vel: vacc.map((a) => a.length ? avg(a) / v0 : 1) };
}
function grooveApply(t, g, amount, idx) {
  const ns = editableNotes(t), list = idx || ns.map((_, i) => i);
  for (const i of list) {
    const n = ns[i];
    let q, pos, target;
    if (g.sw8) {
      q = Math.round(n[0] * 2) / 2; pos = Math.abs(q % 1 - 0.5) < 1e-6 ? 1 : 0;
      if (Math.abs(n[0] - q) > 0.12) continue;
      target = q + (pos ? (g.sw8 - 0.5) : 0);
    } else {
      q = Math.round(n[0] * 4) / 4; pos = ((Math.round((q % 1) * 4)) % 4 + 4) % 4;
      if (Math.abs(n[0] - q) > 0.07) continue;
      let off = g.sw16 ? (pos % 2 ? (g.sw16 - 0.5) * 0.5 : 0) : (g.off ? g.off[pos] : 0);
      if (g.snareLate && [38, 39, 40].includes(n[2]) && pos === 0 && Math.round(q) % 2 === 1) off += g.snareLate;
      target = q + off;
      if (g.vel) n[3] = clamp(Math.round(n[3] * (1 + (g.vel[pos] - 1) * amount)), 1, 127);
    }
    n[0] = Math.max(0, +(n[0] + (target - n[0]) * amount).toFixed(4));
  }
  ns.sort((a, b) => a[0] - b[0]);
}
function openGroove(tid) {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const list = tracksAll().filter((t) => trackNotes(t).length);
  if (!list.length) return toast("Немає доріжок з нотами.", true);
  const cur = tid || (S.sel && list.some((t) => t.id === S.sel) ? S.sel : list[0].id);
  const m = careModalBox("groove-modal", "Грув і свінг", `<p class="muted">Грув зсуває ноти трохи раніше чи пізніше від сітки й змінює акценти — так біт «качає», як у живого барабанщика або на MPC. Застосовується до нот доріжки, Ctrl+Z скасовує.</p>
    <div class="mel-grid">
      <label data-hint="Яку доріжку «розкачати»">Доріжка <select id="gr-t">${list.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === cur ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label>
      <label data-hint="Шаблон грува. «З доріжки» — узяти мікрозсуви з іншої доріжки, наприклад з живих барабанів оригіналу">Шаблон <select id="gr-p">${Object.entries(GROOVES).map(([k, v]) => `<option value="${k}">${escapeHtml(v[0])}</option>`).join("")}<option value="@track">З доріжки…</option></select></label>
      <label id="gr-srcl" hidden data-hint="Доріжка-джерело грува">Звідки <select id="gr-src">${list.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("")}</select></label>
      <label data-hint="Наскільки сильно застосувати шаблон: 100% — повністю, менше — частково">Сила <input type="range" id="gr-a" min="0.1" max="1" step="0.05" value="1"></label>
      <label class="chk" data-hint="Лише виділені в піано-ролі ноти"><input type="checkbox" id="gr-sel" ${PR.sel.size && PR.tid === cur ? "checked" : ""}> лише виділені ноти</label>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-k="x">Закрити</button><button class="btn primary" id="gr-go">Застосувати грув</button></div>`);
  $("#gr-p", m).onchange = (e) => { $("#gr-srcl", m).hidden = e.target.value !== "@track"; };
  $("#gr-go", m).onclick = () => {
    const t = findT($("#gr-t", m).value), pk = $("#gr-p", m).value, amt = +$("#gr-a", m).value;
    if (!t) return;
    const g = pk === "@track" ? grooveFromTrack(findT($("#gr-src", m).value)) : GROOVES[pk][1];
    pushUndo("грув");
    const idx = $("#gr-sel", m).checked && PR.tid === t.id && PR.sel.size ? [...PR.sel] : null;
    grooveApply(t, g, amt, idx);
    PR.sel = new Set();
    notesChanged();
    if (S.dockTab === "notes") renderDock();
    m.hidden = true;
    toast(`Грув застосовано до «${t.name}». Послухайте; Ctrl+Z — скасувати.`);
  };
}
function careModalBox(id, title, html) {
  let m = document.getElementById(id);
  if (!m) { m = document.createElement("div"); m.className = "modal"; m.id = id; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-card" style="width:min(680px,94vw)"><div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="x" data-k="x">&times;</button></div><div class="modal-body">${html}</div></div>`;
  m.onclick = (e) => { if (e.target === m || e.target.dataset.k === "x") m.hidden = true; };
  m.hidden = false;
  return m;
}
(function beatsUI() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Грув і свінг…", needProject(() => openGroove())]]);
})();
