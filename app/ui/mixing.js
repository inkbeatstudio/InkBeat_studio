"use strict";
const MX_WORKLET = `
class InkDuck extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'depth', defaultValue: 8 }, { name: 'threshold', defaultValue: -24 }, { name: 'attack', defaultValue: 5 }, { name: 'release', defaultValue: 160 }, { name: 'low', defaultValue: 1 }]; }
  constructor() { super(); this.env = 0; this.red = 0; this.lp = 0; this.n = 0; this.max = 0; this.alive = true; this.port.onmessage = (e) => { if (e.data && e.data.stop) this.alive = false; }; }
  process(inputs, outputs, p) {
    if (!this.alive) return false;
    const x = inputs[0], sc = inputs[1], out = outputs[0];
    const n = out[0] ? out[0].length : 128;
    const aE = Math.exp(-1 / (sampleRate * 0.002)), rE = Math.exp(-1 / (sampleRate * 0.05));
    const aR = Math.exp(-1 / (sampleRate * Math.max(0.0005, p.attack[0] / 1000))), rR = Math.exp(-1 / (sampleRate * Math.max(0.01, p.release[0] / 1000)));
    const lpA = Math.exp(-2 * Math.PI * 160 / sampleRate), depth = p.depth[0], thr = p.threshold[0], low = p.low[0] > 0.5;
    for (let i = 0; i < n; i++) {
      let s = 0;
      if (sc && sc.length) { for (let c = 0; c < sc.length; c++) s += sc[c][i]; s /= sc.length; }
      if (low) { this.lp = s + (this.lp - s) * lpA; s = this.lp; }
      const a = Math.abs(s);
      this.env = a > this.env ? a + (this.env - a) * aE : a + (this.env - a) * rE;
      const db = 20 * Math.log10(this.env + 1e-9);
      const want = depth * Math.max(0, Math.min(1, (db - thr) / 6));
      this.red = want > this.red ? want + (this.red - want) * aR : want + (this.red - want) * rR;
      const g = Math.pow(10, -this.red / 20);
      for (let c = 0; c < out.length; c++) { const ch = x && x.length ? x[Math.min(c, x.length - 1)] : null; out[c][i] = ch ? ch[i] * g : 0; }
      if (this.red > this.max) this.max = this.red;
    }
    if ((this.n += n) >= 2048) { this.n = 0; this.port.postMessage(-this.max); this.max = 0; }
    return true;
  }
}
registerProcessor('ink-duck', InkDuck);
class InkDynEq extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'freq', defaultValue: 2500 }, { name: 'q', defaultValue: 1.4 }, { name: 'threshold', defaultValue: -30 }, { name: 'range', defaultValue: -6 }]; }
  constructor() { super(); this.s = [[0,0,0,0],[0,0,0,0]]; this.b = [0,0,0,0]; this.env = 0; this.g = 0; this.n = 0; this.min = 0; this.alive = true; this.port.onmessage = (e) => { if (e.data && e.data.stop) this.alive = false; }; }
  process(inputs, outputs, p) {
    if (!this.alive) return false;
    const x = inputs[0], out = outputs[0];
    if (!x || !x.length) return true;
    const n = x[0].length, f = Math.min(sampleRate * 0.45, p.freq[0]), Q = Math.max(0.2, p.q[0]), thr = p.threshold[0], range = p.range[0];
    const w0 = 2 * Math.PI * f / sampleRate, cs = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
    const ba0 = 1 + al, bb0 = al / ba0, bb2 = -al / ba0, ba1 = -2 * cs / ba0, ba2 = (1 - al) / ba0;
    const aE = Math.exp(-1 / (sampleRate * 0.003)), rE = Math.exp(-1 / (sampleRate * 0.08));
    let lvl = 0;
    for (let i = 0; i < n; i++) {
      let m = 0; for (let c = 0; c < x.length; c++) m += x[c][i]; m /= x.length;
      const z = this.b, y = bb0 * m + bb2 * z[1] - ba1 * z[2] - ba2 * z[3]; z[1] = z[0]; z[0] = m; z[3] = z[2]; z[2] = y;
      const a = Math.abs(y); this.env = a > this.env ? a + (this.env - a) * aE : a + (this.env - a) * rE;
    }
    const db = 20 * Math.log10(this.env + 1e-9);
    const want = range < 0 ? Math.max(range, -Math.max(0, db - thr) * 0.8) : Math.min(range, Math.max(0, thr - db) * 0.8 * (db > -70 ? 1 : 0));
    this.g += (want - this.g) * (want < this.g ? 0.5 : 0.08);
    const A = Math.pow(10, this.g / 40), alA = al * A, alD = al / A, a0 = 1 + alD;
    const c0 = (1 + alA) / a0, c1 = -2 * cs / a0, c2 = (1 - alA) / a0, d1 = -2 * cs / a0, d2 = (1 - alD) / a0;
    for (let c = 0; c < out.length; c++) {
      const src = x[Math.min(c, x.length - 1)], st = this.s[Math.min(c, 1)], o = out[c];
      for (let i = 0; i < n; i++) { const v = src[i], y = c0 * v + c1 * st[0] + c2 * st[1] - d1 * st[2] - d2 * st[3]; st[1] = st[0]; st[0] = v; st[3] = st[2]; st[2] = y; o[i] = y; }
    }
    if (this.g < this.min) this.min = this.g;
    if ((this.n += n) >= 2048) { this.n = 0; this.port.postMessage(range < 0 ? this.min : this.g); this.min = 0; }
    return true;
  }
}
registerProcessor('ink-dyneq', InkDynEq);
class InkTrans extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'attack', defaultValue: 0 }, { name: 'sustain', defaultValue: 0 }, { name: 'out', defaultValue: 0 }]; }
  constructor() { super(); this.f = 0; this.s = 0; this.g = 1; this.alive = true; this.port.onmessage = (e) => { if (e.data && e.data.stop) this.alive = false; }; }
  process(inputs, outputs, p) {
    if (!this.alive) return false;
    const x = inputs[0], out = outputs[0];
    if (!x || !x.length) return true;
    const n = x[0].length, at = p.attack[0], su = p.sustain[0], og = Math.pow(10, p.out[0] / 20);
    const fA = Math.exp(-1 / (sampleRate * 0.0008)), fR = Math.exp(-1 / (sampleRate * 0.03));
    const sA = Math.exp(-1 / (sampleRate * 0.02)), sR = Math.exp(-1 / (sampleRate * 0.25));
    for (let i = 0; i < n; i++) {
      let m = 0; for (let c = 0; c < x.length; c++) m = Math.max(m, Math.abs(x[c][i]));
      this.f = m > this.f ? m + (this.f - m) * fA : m + (this.f - m) * fR;
      this.s = m > this.s ? m + (this.s - m) * sA : m + (this.s - m) * sR;
      const tr = Math.max(0, Math.min(3, (this.f - this.s) / (this.s + 1e-4)));
      const sus = Math.max(0, Math.min(3, (this.s - this.f) / (this.f + 1e-4)));
      let want = (1 + at * tr * 0.6) * (1 + su * sus * 0.8);
      want = Math.max(0.1, Math.min(4, want));
      this.g += (want - this.g) * 0.05;
      for (let c = 0; c < out.length; c++) out[c][i] = x[Math.min(c, x.length - 1)][i] * this.g * og;
    }
    return true;
  }
}
registerProcessor('ink-trans', InkTrans);`;
const _mxReady = new WeakMap();
const _ensureW = DSP.ensureWorklets;
DSP.ensureWorklets = async function(ctx) {
  await _ensureW(ctx);
  if (!_mxReady.has(ctx)) _mxReady.set(ctx, ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([MX_WORKLET], { type: "application/javascript" }))).catch((e) => console.warn("mx worklet", e)));
  return _mxReady.get(ctx);
};
function mxWorkletNode(ctx, name, P, keys, inputs = 1) {
  const input = ctx.createGain(), output = ctx.createGain();
  let node = null, info = 0;
  const o = { input, output, info: () => info, reduction: () => info, node: null };
  try {
    node = new AudioWorkletNode(ctx, name, { numberOfInputs: inputs, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = (e) => {
      info = e.data;
    };
    input.connect(node, 0, 0);
    node.connect(output);
    if (inputs > 1) {
      o.sc = ctx.createGain();
      o.sc.connect(node, 0, 1);
    }
    o.node = node;
  } catch (e) {
    input.connect(output);
  }
  o.set = (p) => {
    if (!node) return;
    for (const [k, f] of Object.entries(keys)) {
      const prm = node.parameters.get(k);
      if (prm) prm.value = f(p);
    }
  };
  o.dispose = () => {
    try {
      node && node.port.postMessage({ stop: true });
    } catch (e) {
    }
  };
  o.set(P);
  return o;
}
DSP.FX.duck = (ctx, P) => mxWorkletNode(ctx, "ink-duck", P, { depth: (p) => +p.depth, threshold: (p) => +p.threshold, attack: (p) => +p.attack, release: (p) => +p.release, low: (p) => p.low ? 1 : 0 }, 2);
DSP.FX.dyneq = (ctx, P) => mxWorkletNode(ctx, "ink-dyneq", P, { freq: (p) => +p.freq, q: (p) => +p.q, threshold: (p) => +p.threshold, range: (p) => +p.range });
DSP.FX.transient = (ctx, P) => mxWorkletNode(ctx, "ink-trans", P, { attack: (p) => +p.attack, sustain: (p) => +p.sustain, out: (p) => +p.out });
DSP.FX.mbcomp = (ctx, P) => {
  const input = ctx.createGain(), output = ctx.createGain();
  const mk = (type, f) => {
    const a = ctx.createBiquadFilter();
    a.type = type;
    a.Q.value = Math.SQRT1_2;
    a.frequency.value = f;
    return a;
  };
  const bands = [0, 1, 2].map(() => ({ comp: ctx.createDynamicsCompressor(), gain: ctx.createGain(), filters: [] }));
  const l1 = mk("lowpass", P.f1), l2 = mk("lowpass", P.f1), m1 = mk("highpass", P.f1), m2 = mk("highpass", P.f1), m3 = mk("lowpass", P.f2), m4 = mk("lowpass", P.f2), h1 = mk("highpass", P.f2), h2 = mk("highpass", P.f2);
  input.connect(l1).connect(l2).connect(bands[0].comp);
  input.connect(m1).connect(m2).connect(m3).connect(m4).connect(bands[1].comp);
  input.connect(h1).connect(h2).connect(bands[2].comp);
  bands[0].filters = [l1, l2];
  bands[1].filters = [m1, m2, m3, m4];
  bands[2].filters = [h1, h2];
  for (const b of bands) b.comp.connect(b.gain).connect(output);
  const set = (p) => {
    P = p;
    for (const f of [l1, l2, m1, m2]) f.frequency.value = p.f1;
    for (const f of [m3, m4, h1, h2]) f.frequency.value = Math.max(p.f1 * 1.5, p.f2);
    const thr = [p.tl, p.tm, p.th], g = [p.gl, p.gm, p.gh];
    bands.forEach((b, i) => {
      b.comp.threshold.value = thr[i];
      b.comp.ratio.value = p.ratio;
      b.comp.knee.value = 6;
      b.comp.attack.value = p.attack / 1000;
      b.comp.release.value = p.release / 1000;
      b.gain.gain.value = DSP.dbToGain(g[i]) * (i === 1 ? 1 : 1);
    });
  };
  set(P);
  return { input, output, set, bands: () => bands.map((b) => b.comp.reduction), reduction: () => Math.min(...bands.map((b) => b.comp.reduction)) };
};
const FXC = Plugins.FX;
FXC.duck = {
  name: "Сайдчейн",
  cat: "Динаміка",
  color: "#f97316",
  desc: "Стишує цю доріжку щоразу, коли грає інша (зазвичай бочка). Бас і пади «дихають» у ритм, і мікс стає щільнішим і чистішим на низах.",
  when: "Бас, сабі-бас, пади, акорди, синти — під бочку. Також музика під вокал (щоб голос завжди був зверху).",
  tips: "Джерело — доріжка з бочкою (Drums). «Лише низи» реагує тільки на бочку, ігноруючи хети й тарілки. Глибина 3–6 дБ — непомітно щільно, 10–20 дБ — помпуючий ефект у стилі EDM. Відпуск ~ довжина однієї долі.",
  defaults: () => ({ source: "", depth: 6, threshold: -28, attack: 4, release: 160, low: true }),
  params: [
    { k: "source", label: "Джерело", options: [["", "— виберіть —"]], hint: "Доріжка, від якої стишується ця (зазвичай бочка/барабани)" },
    { k: "depth", label: "Глибина", min: 0, max: 24, step: 0.5, unit: "дБ", hint: "Наскільки стишувати" },
    { k: "threshold", label: "Поріг", min: -60, max: 0, step: 0.5, unit: "дБ", hint: "Від якої гучності джерела спрацьовує" },
    { k: "attack", label: "Атака", min: 0.5, max: 50, step: 0.5, unit: "мс" },
    { k: "release", label: "Відпуск", min: 20, max: 800, step: 5, unit: "мс", hint: "Як швидко повертається гучність" },
    { k: "low", label: "Лише низи джерела", toggle: true, hint: "Реагувати тільки на бочку" }
  ],
  presets: { "Бас під бочку": { depth: 5, threshold: -30, attack: 3, release: 140, low: true }, "Пади: дихання": { depth: 9, threshold: -30, attack: 5, release: 220, low: true }, "EDM-помпа": { depth: 18, threshold: -34, attack: 2, release: 260, low: true }, "Музика під вокал": { depth: 3, threshold: -36, attack: 20, release: 300, low: false } }
};
FXC.mbcomp = {
  name: "Багатосмуговий компресор",
  cat: "Динаміка",
  color: "#fb923c",
  desc: "Ділить звук на низ, середину й верх і стискає кожну частину окремо. Тримає бас під контролем, не «душачи» вокал і тарілки.",
  when: "Master (щільність і рівний баланс), бас (рівний низ), вокал (приборкати бубніння або різкість), повний мікс барабанів.",
  tips: "Почніть з пресету. Поріг смуги — звідки вона стискається. Індикатори показують, скільки знімає кожна смуга: на Master 1–3 дБ уже багато. Гучність смуг — фінальний баланс тембру.",
  defaults: () => ({ f1: 200, f2: 3000, tl: -24, tm: -22, th: -24, ratio: 2.5, attack: 15, release: 150, gl: 0, gm: 0, gh: 0 }),
  params: [
    { k: "f1", label: "Низ/середина", min: 60, max: 600, step: 5, unit: "Гц", log: true },
    { k: "f2", label: "Середина/верх", min: 1200, max: 10e3, step: 50, unit: "Гц", log: true },
    { k: "tl", label: "Поріг низу", min: -60, max: 0, step: 0.5, unit: "дБ" },
    { k: "tm", label: "Поріг середини", min: -60, max: 0, step: 0.5, unit: "дБ" },
    { k: "th", label: "Поріг верху", min: -60, max: 0, step: 0.5, unit: "дБ" },
    { k: "ratio", label: "Ступінь", min: 1, max: 10, step: 0.1, unit: ":1" },
    { k: "attack", label: "Атака", min: 1, max: 100, step: 1, unit: "мс" },
    { k: "release", label: "Відпуск", min: 30, max: 800, step: 5, unit: "мс" },
    { k: "gl", label: "Гучність низу", min: -12, max: 12, step: 0.1, unit: "дБ" },
    { k: "gm", label: "Гучність середини", min: -12, max: 12, step: 0.1, unit: "дБ" },
    { k: "gh", label: "Гучність верху", min: -12, max: 12, step: 0.1, unit: "дБ" }
  ],
  presets: { "Master: склеїти": { f1: 180, f2: 3500, tl: -20, tm: -18, th: -20, ratio: 1.8, attack: 25, release: 200, gl: 0, gm: 0, gh: 0.5 }, "Master: щільно": { f1: 160, f2: 3000, tl: -26, tm: -22, th: -24, ratio: 3, attack: 10, release: 120, gl: 1, gm: 0.5, gh: 1 }, "Бас: рівний низ": { f1: 120, f2: 1500, tl: -30, tm: -20, th: -20, ratio: 4, attack: 8, release: 120, gl: 1, gm: 0, gh: 0 }, "Вокал: без бубніння": { f1: 300, f2: 4000, tl: -34, tm: -20, th: -28, ratio: 3, attack: 6, release: 100, gl: -1, gm: 0, gh: 0 } }
};
FXC.dyneq = {
  name: "Динамічний EQ",
  cat: "Тон",
  color: "#2dd4bf",
  desc: "Еквалайзер, який підрізає частоту лише тоді, коли вона стає надто гучною. Прибирає різкість, бубніння чи гул тільки в ті миті, коли вони заважають.",
  when: "Вокал з різкими верхніми нотами (2–4 кГц), гітари й піаніно з бубнінням (200–400 Гц), бас з гулом окремих нот.",
  tips: "Виставте частоту на проблему (підказка: тимчасово поставте звичайний EQ з вузьким підйомом і знайдіть, де «ріже»). Поріг — звідки починає діяти. Межа −3…−8 дБ.",
  defaults: () => ({ freq: 2800, q: 1.6, threshold: -32, range: -6 }),
  params: [
    { k: "freq", label: "Частота", min: 40, max: 16e3, step: 1, unit: "Гц", log: true },
    { k: "q", label: "Ширина (Q)", min: 0.3, max: 8, step: 0.05, unit: "" },
    { k: "threshold", label: "Поріг", min: -60, max: 0, step: 0.5, unit: "дБ" },
    { k: "range", label: "Межа", min: -18, max: 12, step: 0.5, unit: "дБ", hint: "Мінус — підрізати, коли гучно; плюс — підняти, коли тихо" }
  ],
  presets: { "Вокал: різкість": { freq: 3200, q: 1.8, threshold: -34, range: -6 }, "Бубніння 300 Гц": { freq: 300, q: 1.2, threshold: -30, range: -5 }, "Гул баса": { freq: 90, q: 1.5, threshold: -24, range: -6 }, "Повітря, коли тихо": { freq: 10e3, q: 0.8, threshold: -40, range: 3 } }
};
FXC.transient = {
  name: "Транзієнт-шейпер",
  cat: "Динаміка",
  color: "#facc15",
  desc: "Підсилює або пом'якшує атаку звуку (удар) і хвіст (сустейн) незалежно від гучності. Барабани стають панчевими або м'якими одним рухом.",
  when: "Барабани (більше удару бочки й малого), перкусія, гітари (чіткіше), акустика. Мінус атаки — прибрати клацання.",
  tips: "Атака + — удар чіткіший і ближчий. Сустейн − — сухіше, менше кімнати. Сустейн + — довший хвіст, «більше» барабанів.",
  defaults: () => ({ attack: 0.5, sustain: 0, out: 0 }),
  params: [
    { k: "attack", label: "Атака", min: -1, max: 1, step: 0.01, unit: "", hint: "Плюс — сильніший удар, мінус — м'якший" },
    { k: "sustain", label: "Сустейн", min: -1, max: 1, step: 0.01, unit: "", hint: "Плюс — довший хвіст, мінус — сухіше" },
    { k: "out", label: "Вихід", min: -12, max: 6, step: 0.1, unit: "дБ" }
  ],
  presets: { "Панчеві барабани": { attack: 0.7, sustain: -0.1, out: -1 }, "Сухо й щільно": { attack: 0.3, sustain: -0.6, out: 0 }, "Більше кімнати": { attack: -0.1, sustain: 0.6, out: -1 }, "М'яка атака": { attack: -0.6, sustain: 0, out: 1 } }
};
const VISX = Plugins.VIS;
const setupCv = (cv) => {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) {
    cv.width = w * dpr;
    cv.height = h * dpr;
  }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [c, w, h];
};
function grMeter(cv, label, vals, names) {
  if (!cv || !cv.isConnected) return;
  const [c, w, h] = setupCv(cv);
  c.fillStyle = "#14161b";
  c.fillRect(0, 0, w, h);
  c.font = "11px sans-serif";
  vals.forEach((v, i) => {
    const bw = Math.min(46, (w - 40) / vals.length - 14), x = 20 + i * (bw + 14), H = h - 44;
    c.fillStyle = "#242833";
    c.fillRect(x, 16, bw, H);
    c.fillStyle = v > 0.01 ? "#4ade80" : "#fb923c";
    const r = Math.min(1, Math.abs(v) / 12) * H;
    c.fillRect(x, v > 0 ? 16 + H - r : 16, bw, r);
    c.fillStyle = "#8b91a3";
    c.fillText(names[i], x, h - 14);
    c.fillStyle = "#e9ebf1";
    c.fillText(`${v > 0 ? "+" : ""}${v.toFixed(1)}`, x, h - 2);
  });
  c.fillStyle = "#5d6374";
  c.fillText(label, w - 170, 12);
}
VISX.duck = (cv, P, node) => {
  const draw = () => grMeter(cv, "стишування, дБ", [node && node.reduction ? node.reduction() || 0 : 0], ["сайдчейн"]);
  draw();
  return draw;
};
VISX.mbcomp = (cv, P, node) => {
  const draw = () => grMeter(cv, "стиснення смуг, дБ", node && node.bands ? node.bands() : [0, 0, 0], ["низ", "середина", "верх"]);
  draw();
  return draw;
};
VISX.dyneq = (cv, P, node) => {
  const draw = () => {
    if (!cv || !cv.isConnected) return;
    const [c, w, h] = setupCv(cv);
    c.fillStyle = "#14161b";
    c.fillRect(0, 0, w, h);
    const X = (f) => Math.log(f / 20) / Math.log(1000) * w, Y = (db) => h / 2 - db / 18 * (h / 2 - 10);
    c.strokeStyle = "#242833";
    for (const f of [50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4]) {
      c.beginPath();
      c.moveTo(X(f), 0);
      c.lineTo(X(f), h);
      c.stroke();
    }
    c.strokeStyle = "#3a3f4c";
    c.beginPath();
    c.moveTo(0, Y(0));
    c.lineTo(w, Y(0));
    c.stroke();
    const g = node && node.info ? node.info() || 0 : 0;
    const curve = (gain, col, dash) => {
      c.strokeStyle = col;
      c.setLineDash(dash);
      c.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const f = 20 * Math.pow(1000, x / w), r = Math.log2(f / P.freq) * P.q;
        const db = gain / (1 + r * r * 2.5);
        x ? c.lineTo(x, Y(db)) : c.moveTo(x, Y(db));
      }
      c.stroke();
      c.setLineDash([]);
    };
    curve(P.range, "rgba(45,212,191,.35)", [4, 4]);
    curve(g, "#2dd4bf", []);
    c.fillStyle = "#8b91a3";
    c.font = "11px sans-serif";
    c.fillText(`${Math.round(P.freq)} Гц · зараз ${g > 0 ? "+" : ""}${g.toFixed(1)} дБ`, 8, 14);
  };
  draw();
  return draw;
};
VISX.transient = (cv, P) => {
  const draw = () => {
    if (!cv || !cv.isConnected) return;
    const [c, w, h] = setupCv(cv);
    c.fillStyle = "#14161b";
    c.fillRect(0, 0, w, h);
    const env = (t) => (t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) * 6));
    const shaped = (t) => {
      const e = env(t);
      const att = t < 0.08 ? 1 + P.attack * 0.9 * (1 - t / 0.08) : 1;
      const sus = t > 0.08 ? 1 + P.sustain * 0.8 * Math.min(1, (t - 0.08) * 4) : 1;
      return Math.min(1.9, e * att * sus);
    };
    [[env, "#5d6374"], [shaped, "#facc15"]].forEach(([fn, col]) => {
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const v = fn(x / w * 0.7);
        x ? c.lineTo(x, h - 12 - v / 2 * (h - 24)) : c.moveTo(x, h - 12);
      }
      c.stroke();
    });
    c.lineWidth = 1;
    c.fillStyle = "#8b91a3";
    c.font = "11px sans-serif";
    c.fillText("сіра — оригінал удару, жовта — після шейпера", 8, 14);
  };
  draw();
  return draw;
};
Object.assign(Plugins.CHAINS, {
  "Master: сучасний (мультибенд)": [["eq", Object.keys(FXC.eq.presets)[0]], ["mbcomp", "Master: склеїти"], ["limiter", Object.keys(FXC.limiter.presets)[0]]],
  "Барабани: панч": [["transient", "Панчеві барабани"], ["eq", Object.keys(FXC.eq.presets)[0]], ["comp", Object.keys(FXC.comp.presets)[0]]]
});
function mxEnsure() {
  if (!S.mix.buses) S.mix.buses = [];
  return S.mix.buses;
}
function busById(id) {
  return (S.mix.buses || []).find((b) => b.id === id);
}
function trackDest(A, m) {
  return m && m.out && A.buses && A.buses[m.out] ? A.buses[m.out].input : A.master.input;
}
function mxWire() {
  const A = S.audio;
  if (!A || !A.master || !S.mix) return;
  const ctx = A.ctx, buses = mxEnsure();
  A.buses = A.buses || {};
  const live = new Set();
  for (const b of buses) {
    live.add(b.id);
    let st = A.buses[b.id];
    if (!st) st = A.buses[b.id] = new DSP.Strip(ctx, A.master.input, fxEnv());
    st.env = fxEnv();
    st.setFx(b.fx || []);
    st.setPan(b.pan || 0);
    st.setVol(b.vol || 0, !!b.mute);
  }
  for (const id in A.buses) if (!live.has(id)) {
    A.buses[id].dispose();
    delete A.buses[id];
  }
  for (const t of tracksAll()) {
    const st = A.strips[t.id], m = mt(t.id);
    if (!st) continue;
    const dest = trackDest(A, m);
    if (st._dest !== dest) {
      try {
        st.autoCut.disconnect(st._dest || A.master.input);
      } catch (e) {
      }
      st.autoCut.connect(dest);
      st._dest = dest;
    }
    for (const g of st._sends || []) {
      try {
        st.autoCut.disconnect(g);
        g.disconnect();
      } catch (e) {
      }
    }
    st._sends = [];
    for (const [bid, lvl] of Object.entries(m.sends || {})) {
      if (!A.buses[bid] || lvl <= -60 || m.out === bid) continue;
      const g = ctx.createGain();
      g.gain.value = DSP.dbToGain(lvl);
      st.autoCut.connect(g);
      g.connect(A.buses[bid].input);
      st._sends.push(g);
    }
    (m.fx || []).forEach((fx, i) => {
      if (fx.type !== "duck" || !fx.on) return;
      const n = st.nodes[i], src = A.strips[fx.params.source];
      if (n && n.sc && src && src !== st && n._scFrom !== src) {
        src.post.connect(n.sc);
        n._scFrom = src;
      }
    });
  }
}
const _rebuildStripsMx = rebuildStrips;
rebuildStrips = function() {
  _rebuildStripsMx();
  mxWire();
};
const _applyGainsMx = applyGains;
applyGains = function() {
  _applyGainsMx();
  const A = S.audio;
  if (!A || !A.buses || !S.mix) return;
  for (const b of S.mix.buses || []) if (A.buses[b.id]) A.buses[b.id].setVol(b.vol || 0, !!b.mute);
};
const _dockTargetMx = dockTarget;
dockTarget = function() {
  if (S.dockBus) {
    const b = busById(S.dockBus);
    if (b) return { master: true, bus: b.id, m: b, name: "Шина: " + b.name, color: b.color || "#8b91a3" };
    S.dockBus = null;
  }
  return _dockTargetMx();
};
const _liveStripMx = liveStrip;
liveStrip = function(T) {
  if (T && T.bus) return S.audio && S.audio.buses && S.audio.buses[T.bus];
  return _liveStripMx(T);
};
const _renderPluginMx = renderPlugin;
renderPlugin = function(el, T, f) {
  if (f && f.type === "duck") FXC.duck.params[0].options = [["", "— виберіть —"]].concat(tracksAll().filter((t) => !T.t || t.id !== T.t.id).map((t) => [t.id, t.name]));
  _renderPluginMx(el, T, f);
};
function scheduleTrackSources(ctx, t, m, st, from, end, buffers, ibuf) {
  const P = period(), mode = modeOf(t);
  if (t.has_audio && (mode === "audio" || mode === "both") && buffers(t)) scheduleClips(ctx, t, buffers(t), st.input, from, 0, null);
  if (mode === "midi" || mode === "both") {
    const g = ctx.createGain();
    g.gain.value = mode === "both" ? 0.7 : 1;
    g.connect(st.input);
    for (const n of playNotes(t)) if (n[0] >= from && n[0] < end) DSP.playNote(ctx, g, m.inst, n[2], n[3] / 127, (n[0] - from) * P, n[1] * P, ibuf, noteMods(t, n, (b) => (b - from) * P));
  }
}
function buildOfflineGraph(ctx, masterFx, from, end, buffers, ibuf, opts = {}) {
  const aud = (t) => audible(t) && (!opts.include || opts.include(t));
  const master = new DSP.Strip(ctx, ctx.destination, fxEnv());
  master.setFx(masterFx);
  master.fader.gain.value = DSP.dbToGain(S.mix.master.vol || 0);
  const busSt = {};
  for (const b of S.mix.buses || []) {
    if (b.mute) continue;
    const st = new DSP.Strip(ctx, master.input, fxEnv());
    st.setFx(b.fx || []);
    st.setPan(b.pan || 0);
    st.fader.gain.value = DSP.dbToGain(b.vol || 0);
    busSt[b.id] = st;
  }
  const strips = {};
  for (const t of tracksAll()) {
    const m = mt(t.id);
    const on = aud(t) || opts.forSidechain && (S.mix.tracks && Object.values(S.mix.tracks).some((x) => (x.fx || []).some((f) => f.type === "duck" && f.params.source === t.id)));
    if (!on) continue;
    const dest = m.out && busSt[m.out] ? busSt[m.out].input : master.input;
    const st = new DSP.Strip(ctx, dest, fxEnv());
    st.setFx(m.fx);
    st.setPan(m.pan);
    st.fader.gain.value = aud(t) ? DSP.dbToGain(m.vol) : 0;
    applyAutomation(ctx, st, m, from, 0);
    for (const [bid, lvl] of Object.entries(m.sends || {})) if (busSt[bid] && lvl > -60 && m.out !== bid && aud(t)) {
      const g = ctx.createGain();
      g.gain.value = DSP.dbToGain(lvl);
      st.out.connect(g);
      g.connect(busSt[bid].input);
    }
    strips[t.id] = st;
    scheduleTrackSources(ctx, t, m, st, from, end, buffers, ibuf);
  }
  for (const t of tracksAll()) {
    const st = strips[t.id];
    if (!st) continue;
    (mt(t.id).fx || []).forEach((fx, i) => {
      if (fx.type !== "duck" || !fx.on) return;
      const n = st.nodes[i], src = strips[fx.params.source];
      if (n && n.sc && src) src.post.connect(n.sc);
    });
  }
  return master;
}
renderMixQuick = async function(masterFx, from = 0, to = null) {
  const A = ensureCtx(), SR = A.ctx.sampleRate, P = period();
  const end = to ?? arrEnd(), len = Math.ceil(((end - from) * P + 1) * SR);
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  await loadInstrumentBuffers();
  buildOfflineGraph(ctx, masterFx, from, end, (t) => A.buffers[srcKey(t)], A.ibuf, { forSidechain: true });
  return ctx.startRendering();
};
renderAll = async function(progress) {
  await api.post(`/api/project/${S.pid}/render/clear`);
  const SR = 44100, P = period(), total = arrEnd() * P + 4;
  const len = Math.ceil(total * SR);
  const mixL = new Float32Array(len), mixR = new Float32Array(len);
  const buses = (S.mix.buses || []).map((b) => ({ b, L: new Float32Array(len), R: new Float32Array(len), used: false }));
  const busOf = (id) => buses.find((x) => x.b.id === id);
  const scSources = new Set();
  for (const t of tracksAll()) for (const f of mt(t.id).fx || []) if (f.type === "duck" && f.on && f.params.source) scSources.add(f.params.source);
  const list = tracksAll().slice().sort((a, b) => (scSources.has(b.id) ? 1 : 0) - (scSources.has(a.id) ? 1 : 0));
  const scBuf = {};
  const anyS = anySolo();
  await loadInstrumentBuffers();
  const add = (dL, dR, sL, sR, g = 1) => {
    for (let k = 0; k < len; k++) {
      dL[k] += sL[k] * g;
      dR[k] += sR[k] * g;
    }
  };
  let i = 0;
  for (const t of list) {
    i++;
    const m = mt(t.id), mode = modeOf(t);
    progress(`Рендер ${i}/${list.length}: ${t.name}`, (i - 1) / (list.length + buses.length + 1));
    const ctx2 = new OfflineAudioContext(2, len, SR);
    await DSP.ensureWorklets(ctx2);
    const strip2 = new DSP.Strip(ctx2, ctx2.destination, fxEnv());
    strip2.setFx(m.fx);
    strip2.setPan(m.pan);
    strip2.fader.gain.value = DSP.dbToGain(m.vol);
    applyAutomation(ctx2, strip2, m, 0, 0);
    (m.fx || []).forEach((fx, k) => {
      const n = strip2.nodes[k];
      if (fx.type === "duck" && fx.on && n && n.sc && scBuf[fx.params.source]) {
        const s = ctx2.createBufferSource();
        s.buffer = scBuf[fx.params.source];
        s.connect(n.sc);
        s.start(0);
      }
    });
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
      const notes = playNotes(t), g = ctx2.createGain();
      g.gain.value = mode === "both" ? 0.7 : 1;
      g.connect(strip2.input);
      for (const n of notes) DSP.playNote(ctx2, g, m.inst, n[2], n[3] / 127, n[0] * P, n[1] * P, S.audio.ibuf, noteMods(t, n, (b) => b * P));
      hasContent = hasContent || notes.length > 0;
    }
    if (!hasContent) continue;
    const out2 = await ctx2.startRendering();
    if (scSources.has(t.id)) {
      const pre = 1 / Math.max(1e-3, DSP.dbToGain(m.vol));
      const b = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: SR });
      for (let c = 0; c < 2; c++) {
        const d = out2.getChannelData(c), o = b.getChannelData(c);
        for (let k = 0; k < len; k++) o[k] = d[k] * pre;
      }
      scBuf[t.id] = b;
    }
    const routed = m.out && busOf(m.out) && !busOf(m.out).b.mute ? busOf(m.out) : null;
    const fd2 = new FormData();
    fd2.append("file", DSP.encodeWav(out2), "x.wav");
    fd2.append("name", `${String(i).padStart(2, "0")} ${t.name}${mode === "midi" ? " (instrument)" : ""}`);
    await fetch(`/api/project/${S.pid}/render`, { method: "POST", body: fd2 });
    if (!m.mute && (!anyS || m.solo)) {
      const l = out2.getChannelData(0), r = out2.getChannelData(1);
      if (routed) {
        add(routed.L, routed.R, l, r);
        routed.used = true;
      } else add(mixL, mixR, l, r);
      for (const [bid, lvl] of Object.entries(m.sends || {})) {
        const bx = busOf(bid);
        if (!bx || lvl <= -60 || m.out === bid || bx.b.mute) continue;
        add(bx.L, bx.R, l, r, DSP.dbToGain(lvl));
        bx.used = true;
      }
    }
  }
  for (const [k, bx] of buses.entries()) {
    if (!bx.used || bx.b.mute) continue;
    progress(`Шина: ${bx.b.name}`, (list.length + k) / (list.length + buses.length + 1));
    const ctx3 = new OfflineAudioContext(2, len, SR);
    await DSP.ensureWorklets(ctx3);
    const sb = ctx3.createBuffer(2, len, SR);
    sb.copyToChannel(bx.L, 0);
    sb.copyToChannel(bx.R, 1);
    const st = new DSP.Strip(ctx3, ctx3.destination, fxEnv());
    st.setFx(bx.b.fx || []);
    st.setPan(bx.b.pan || 0);
    st.fader.gain.value = DSP.dbToGain(bx.b.vol || 0);
    const s = ctx3.createBufferSource();
    s.buffer = sb;
    s.connect(st.input);
    s.start(0);
    const o3 = await ctx3.startRendering();
    const fd3 = new FormData();
    fd3.append("file", DSP.encodeWav(o3), "x.wav");
    fd3.append("name", `Bus - ${bx.b.name}`);
    await fetch(`/api/project/${S.pid}/render`, { method: "POST", body: fd3 });
    add(mixL, mixR, o3.getChannelData(0), o3.getChannelData(1));
  }
  progress("Мастер: ефекти Master і зведення…", (list.length + buses.length) / (list.length + buses.length + 1));
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
    for (let k = 0; k < d.length; k++) pk = Math.max(pk, Math.abs(d[k]));
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
  return out;
};
const BUS_KINDS = {
  reverb: ["Ревер", "#60a5fa", () => [Object.assign(Plugins.newFx("reverb", Object.keys(FXC.reverb.presets)[0]), {}), Plugins.newFx("eq", null)].map((f) => {
    if (f.type === "reverb" && "mix" in f.params) f.params.mix = 1;
    if (f.type === "eq") {
      f.params.bands[0] = Object.assign(f.params.bands[0], { on: true, f: 180 });
    }
    return f;
  }), "Спільний ревер для всіх доріжок: посилайте на нього вокал, гітари, пади ручками «посил» на пульті. Звучить цілісніше, ніж окремий ревер на кожній доріжці"],
  delay: ["Дилей", "#a78bfa", () => [Plugins.newFx("delay", Object.keys(FXC.delay.presets)[0])].map((f) => {
    if ("mix" in f.params) f.params.mix = 1;
    return f;
  }), "Спільне ехо в темпі пісні"],
  parallel: ["Паралельна компресія", "#f97316", () => [Plugins.newFx("comp", Object.keys(FXC.comp.presets)[0])].map((f) => {
    Object.assign(f.params, { threshold: -38, ratio: 8, attack: 3, release: 120 });
    return f;
  }), "«Нью-йоркська» компресія: сильно стиснена копія підмішується до оригіналу — барабани й вокал щільніші, але живі"],
  group: ["Група", "#8b91a3", () => [], "Групова шина: виберіть її як «Вихід» у кількох доріжок (наприклад, усіх барабанів), і регулюйте їх разом одним фейдером та ефектами"]
};
function addBus(kind) {
  const [name, color, mk] = BUS_KINDS[kind];
  pushUndo("нова шина");
  const n = (S.mix.buses || []).filter((b) => b.name.startsWith(name)).length;
  mxEnsure().push({ id: uid("bus"), name: n ? `${name} ${n + 1}` : name, color, fx: mk(), vol: kind === "parallel" ? -8 : 0, pan: 0, mute: false, kind });
  afterEdit(true);
  renderDock();
}
const MXV = { raf: 0 };
function renderMixerDock() {
  const dock = DK.cur ? DK.cur.box : $("#dock");
  dock.hidden = !S.dockOpen;
  $("#t-dock").classList.toggle("on", S.dockOpen);
  if (!S.dockOpen) return layout();
  const head = DK.cur ? DK.cur.head : $("#dock-head"), el = DK.cur ? DK.cur.body : $("#dock-body"), T = _dockTargetMx();
  head.innerHTML = `<b>Мікшер</b><span class="muted small">усі канали, шини й Master</span>
    <div class="dk-tabs"><button class="active" data-dt="mixer">Мікшер</button>${T ? `<button data-dt="fx">Канал: ${escapeHtml(T.name)}</button>` : ""}</div><span class="spacer"></span>
    <button class="btn ghost sm" id="mx-assist" data-hint="Помічник зведення: автобаланс гучності, конфлікти частот, поради одним кліком">Помічник зведення</button>
    <button class="btn ghost sm" id="mx-addbus" data-hint="Додати шину: спільний ревер, дилей, паралельна компресія або група">＋ Шина</button>`;
  $$("[data-dt]", head).forEach((b) => b.onclick = () => {
    S.dockTab = b.dataset.dt;
    S.dockBus = null;
    renderDock();
  });
  $("#mx-assist").onclick = () => openMixAssistant();
  $("#mx-addbus").onclick = (e) => menu(e, Object.entries(BUS_KINDS).map(([k, v]) => [`${v[0]} — ${v[3].split(":")[0].split(".")[0]}`, () => addBus(k)]));
  const buses = mxEnsure();
  const outOpts = (m) => `<option value="">Master</option>${buses.map((b) => `<option value="${b.id}" ${m.out === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")}`;
  const strip = (kind, id, name, color, m, extra = "") => `<div class="mx-ch ${kind} ${S.sel === id && kind === "trk" ? "sel" : ""}" data-ch="${kind}:${id}">
    <div class="mx-top"><i style="background:${color}"></i><b title="${escapeHtml(name)}">${escapeHtml(name)}</b></div>
    ${extra}
    <div class="mx-pan"><input type="range" min="-1" max="1" step="0.01" value="${m.pan || 0}" data-pan title="Панорама (подвійний клік — центр)"></div>
    <div class="mx-ms"><button class="mx-b ${m.mute ? "on m" : ""}" data-mute>M</button>${kind === "trk" ? `<button class="mx-b ${m.solo ? "on s" : ""}" data-solo>S</button>` : ""}</div>
    <div class="mx-fad"><canvas class="mx-meter" data-meter="${kind}:${id}"></canvas><input type="range" class="mx-vol" min="-60" max="12" step="0.1" value="${m.vol || 0}" data-vol title="Гучність (подвійний клік — 0 дБ)"></div>
    <div class="mx-db" data-dbv>${(m.vol || 0) <= -59.9 ? "−∞" : ((m.vol || 0) > 0 ? "+" : "") + (m.vol || 0).toFixed(1)}</div>
    ${kind !== "master" ? `<button class="mx-fx" data-fx>${(m.fx || []).length ? (m.fx || []).length + " FX" : "+ FX"}</button>` : `<button class="mx-fx" data-fx>${(m.fx || []).length} FX</button>`}
  </div>`;
  const trks = tracksAll().map((t) => {
    const m = mt(t.id);
    const sends = buses.length ? `<div class="mx-sends">${buses.map((b) => {
      const v = (m.sends || {})[b.id] ?? -60;
      return `<label class="mx-send" title="Посил на «${escapeHtml(b.name)}»: ${v <= -59.9 ? "вимк." : v.toFixed(1) + " дБ"}"><span style="color:${b.color}">${escapeHtml(b.name.slice(0, 6))}</span><input type="range" min="-60" max="6" step="0.5" value="${v}" data-send="${b.id}"></label>`;
    }).join("")}</div>` : "";
    return strip("trk", t.id, t.name, t.color, m, `<select class="mx-out" data-out title="Вихід: куди йде звук доріжки">${outOpts(m)}</select>${sends}`);
  }).join("");
  const bstr = buses.map((b) => strip("bus", b.id, b.name, b.color, b, `<div class="mx-bus-tools"><button class="mx-b" data-ren title="Перейменувати">✎</button><button class="mx-b" data-del title="Видалити шину">×</button></div>`)).join("");
  el.innerHTML = `<div class="mx"><div class="mx-row">${trks}</div>${buses.length ? `<div class="mx-sep"></div><div class="mx-row">${bstr}</div>` : `<div class="mx-hint muted small">Шин ще немає. «＋ Шина» → <b>Ревер</b>: один спільний ревер для всіх доріжок, а на кожній доріжці з'явиться ручка посилу.</div>`}<div class="mx-sep"></div><div class="mx-row">${strip("master", "master", "Master", "#ffb547", S.mix.master)}</div></div>`;
  const resolve = (ch) => {
    const [k, id] = ch.split(":");
    if (k === "trk") return { k, id, m: mt(id) };
    if (k === "bus") return { k, id, m: busById(id) };
    return { k, id, m: S.mix.master };
  };
  $$(".mx-ch", el).forEach((box) => {
    const R = resolve(box.dataset.ch);
    const vol = $("[data-vol]", box), pan = $("[data-pan]", box);
    vol.oninput = () => {
      R.m.vol = +vol.value;
      $("[data-dbv]", box).textContent = R.m.vol <= -59.9 ? "−∞" : (R.m.vol > 0 ? "+" : "") + R.m.vol.toFixed(1);
      applyGains();
    };
    vol.onchange = () => saveMix();
    vol.ondblclick = () => {
      R.m.vol = 0;
      vol.value = 0;
      vol.oninput();
      saveMix();
    };
    pan.oninput = () => {
      R.m.pan = +pan.value;
      if (R.k === "trk" && S.audio && S.audio.strips[R.id]) S.audio.strips[R.id].setPan(R.m.pan);
      if (R.k === "bus" && S.audio && S.audio.buses && S.audio.buses[R.id]) S.audio.buses[R.id].setPan(R.m.pan);
    };
    pan.onchange = () => saveMix();
    pan.ondblclick = () => {
      pan.value = 0;
      pan.oninput();
      saveMix();
    };
    const mb = $("[data-mute]", box);
    if (mb) mb.onclick = () => {
      R.m.mute = !R.m.mute;
      applyGains();
      saveMix();
      renderHeads();
      renderDock();
    };
    const sb = $("[data-solo]", box);
    if (sb) sb.onclick = () => {
      R.m.solo = !R.m.solo;
      applyGains();
      saveMix();
      renderHeads();
      renderDock();
    };
    const ob = $("[data-out]", box);
    if (ob) ob.onchange = () => {
      pushUndo("вихід доріжки");
      R.m.out = ob.value || null;
      afterEdit(true);
    };
    $$("[data-send]", box).forEach((s) => {
      s.oninput = () => {
        R.m.sends = R.m.sends || {};
        R.m.sends[s.dataset.send] = +s.value;
        mxWire();
      };
      s.onchange = () => saveMix();
      s.ondblclick = () => {
        s.value = -60;
        s.oninput();
        saveMix();
      };
    });
    $("[data-fx]", box).onclick = () => {
      if (R.k === "trk") {
        S.dockBus = null;
        S.dockMaster = false;
        selectTrack(R.id);
      } else if (R.k === "bus") {
        S.dockBus = R.id;
        S.dockMaster = false;
      } else {
        S.dockBus = null;
        S.dockMaster = true;
      }
      S.dockTab = "fx";
      S.selFx = null;
      renderDock();
    };
    const rn = $("[data-ren]", box);
    if (rn) rn.onclick = () => {
      const n = (prompt("Назва шини:", R.m.name) || "").trim();
      if (!n) return;
      R.m.name = n;
      saveMix();
      renderDock();
    };
    const dl = $("[data-del]", box);
    if (dl) dl.onclick = async () => {
      if (!await inkConfirm("Підтвердження", "<p>" + escapeHtml(`Видалити шину «${R.m.name}»? Доріжки, що йшли в неї, повернуться на Master.`) + "</p>", "Видалити", true)) return;
      pushUndo("видалити шину");
      S.mix.buses = S.mix.buses.filter((b) => b.id !== R.id);
      for (const t of tracksAll()) {
        const m = mt(t.id);
        if (m.out === R.id) m.out = null;
        if (m.sends) delete m.sends[R.id];
      }
      afterEdit(true);
      renderDock();
    };
    if (R.k === "trk") $(".mx-top", box).onclick = () => {
      selectTrack(R.id);
      S.dockTab = "mixer";
      renderDock();
    };
  });
  if (!MXV.raf) mxMeters();
}
function mxMeters() {
  const cvs = $$(".mx-meter");
  if (!cvs.length || S.dockTab !== "mixer" && dockTarget()) {
    MXV.raf = 0;
    return;
  }
  const A = S.audio;
  const buf = new Float32Array(1024);
  for (const cv of cvs) {
    const [k, id] = cv.dataset.meter.split(":");
    const st = !A ? null : k === "trk" ? A.strips[id] : k === "bus" ? A.buses && A.buses[id] : A.master;
    let pk = 0;
    if (st && st.meterL && S.playing) {
      st.meterL.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
    }
    cv._h = Math.max(pk, (cv._h || 0) * 0.9);
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#0a0b0e";
    c.fillRect(0, 0, w, h);
    const db = 20 * Math.log10(cv._h + 1e-9), f = Math.max(0, Math.min(1, (db + 60) / 66));
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, "#4ade80");
    g.addColorStop(0.72, "#4ade80");
    g.addColorStop(0.86, "#ffb547");
    g.addColorStop(0.95, "#ff5d6c");
    c.fillStyle = g;
    c.fillRect(0, h - f * h, w, f * h);
    if (cv._h > 0.99) {
      c.fillStyle = "#ff5d6c";
      c.fillRect(0, 0, w, 3);
    }
  }
  MXV.raf = requestAnimationFrame(mxMeters);
}
const _renderDockMx = renderDock;
renderDock = function() {
  if (S.B && S.mix && S.dockOpen && (S.dockTab === "mixer" || !dockTarget())) {
    renderMixerDock();
    return;
  }
  _renderDockMx();
  const tabs = (DK.cur ? DK.cur.head : $("#dock-head")).querySelector(".dk-tabs");
  if (tabs && !tabs.querySelector('[data-dt="mixer"]')) {
    const b = document.createElement("button");
    b.dataset.dt = "mixer";
    b.textContent = "Мікшер";
    b.dataset.hint = "Пульт: усі доріжки, шини й Master, посили, виходи";
    b.onclick = () => {
      S.dockTab = "mixer";
      S.dockBus = null;
      renderDock();
    };
    tabs.prepend(b);
  }
};
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j], br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
const BANDS = [["sub", 20, 60], ["bass", 60, 250], ["lowmid", 250, 1e3], ["mid", 1e3, 4e3], ["high", 4e3, 12e3]];
function bandProfile(buf) {
  const N = 4096, d = buf.getChannelData(0), d2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d, sr = buf.sampleRate;
  const acc = new Float64Array(N / 2);
  let frames = 0;
  const step = Math.max(N, Math.floor(d.length / 40));
  for (let s = 0; s + N < d.length; s += step) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = (d[s + i] + d2[s + i]) * 0.5;
      e += v * v;
      re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    }
    if (e / N < 1e-7) continue;
    fft(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const out = {};
  let tot = 0;
  for (const [n, a, b] of BANDS) {
    let s = 0;
    for (let k = Math.floor(a * N / sr); k < Math.min(N / 2, Math.ceil(b * N / sr)); k++) s += acc[k];
    out[n] = s;
    tot += s;
  }
  for (const n in out) out[n] = 10 * Math.log10(out[n] / (tot || 1) + 1e-9);
  out._frames = frames;
  return out;
}
async function renderTrackQuick(t, from, end) {
  const A = ensureCtx(), SR = 22050, P = period(), len = Math.ceil((end - from) * P * SR);
  const ctx = new OfflineAudioContext(2, len, SR);
  await DSP.ensureWorklets(ctx);
  const m = mt(t.id);
  const st = new DSP.Strip(ctx, ctx.destination, fxEnv());
  st.setFx(m.fx);
  st.fader.gain.value = 1;
  scheduleTrackSources(ctx, t, m, st, from, end, (x) => A.buffers[srcKey(x)], A.ibuf);
  return ctx.startRendering();
}
const TARGET_REL = { vocals: 0, drums: -2, bass: -4, backing: -6, guitar: -6, piano: -7, keys: -7, other: -8, strings: -9, pads: -9, chords: -10 };
function roleKey(t) {
  if (t.kind === "vocals") return "vocals";
  if (t.is_drums || t.kind === "drums" || t.kind === "percussion") return "drums";
  if (t.kind === "bass" || t.role === "bass") return "bass";
  if (t.kind === "backing") return "backing";
  if (t.kind === "guitar") return "guitar";
  if (t.kind === "piano") return "piano";
  if (t.gen || t.chords || /chord|акорд/i.test(t.name)) return "chords";
  return "other";
}
async function openMixAssistant() {
  const modal = $("#assist-modal"), box = $("#assist-body");
  box.innerHTML = `<p class="muted">Слухаю кожну доріжку з її ефектами й міряю гучність та частоти…</p><div class="pbar"><div id="as-bar"></div></div>`;
  modal.hidden = false;
  await loadInstrumentBuffers();
  const P = period(), L = arrEnd(), mid = L / 2, span = Math.min(L, 40 / P), from = Math.max(0, mid - span / 2), end = Math.min(L, from + span);
  const info = [];
  const list = tracksAll().filter((t) => !mt(t.id).mute);
  for (const [k, t] of list.entries()) {
    $("#as-bar").style.width = (k / list.length) * 100 + "%";
    try {
      const buf = await renderTrackQuick(t, from, end);
      const lu = lufsOf(buf);
      if (lu < -65) continue;
      info.push({ t, m: mt(t.id), lufs: lu, prof: bandProfile(buf), role: roleKey(t) });
    } catch (e) {
      console.warn(e);
    }
  }
  const sugg = [];
  const ref = info.find((x) => x.role === "vocals") || info.find((x) => x.role === "drums") || info[0];
  if (ref) {
    const refPost = ref.lufs + (ref.m.vol || 0);
    const changes = info.filter((x) => x !== ref).map((x) => {
      const want = refPost + (TARGET_REL[x.role] ?? -8) - (TARGET_REL[ref.role] ?? 0);
      const nv = Math.max(-40, Math.min(10, Math.round((want - x.lufs) * 2) / 2));
      return { x, nv, d: nv - (x.m.vol || 0) };
    }).filter((c) => Math.abs(c.d) >= 1.5);
    if (changes.length) sugg.push({ kind: "balance", title: "Баланс гучності", text: `Опорна доріжка — «${ref.t.name}». Пропоную змінити фейдери: ${changes.map((c) => `«${c.x.t.name}» ${c.d > 0 ? "+" : ""}${c.d.toFixed(1)} дБ`).join(", ")}. Це стартовий баланс, як у професійних міксах цього типу; далі довіряйте вухам.`, apply: () => {
      for (const c of changes) c.x.m.vol = c.nv;
    } });
  }
  const voc = info.find((x) => x.role === "vocals");
  if (voc) {
    for (const x of info) {
      if (x === voc || ["drums", "bass"].includes(x.role)) continue;
      const close = (x.lufs + (x.m.vol || 0)) > (voc.lufs + (voc.m.vol || 0)) - 9;
      if (x.prof.mid > -6.5 && close) sugg.push({ kind: "mask", title: `«${x.t.name}» перекриває вокал`, text: `У «${x.t.name}» багато енергії на 1–4 кГц — там, де розбірливість голосу. Пропоную м'який виріз −3 дБ на 2.5 кГц (еквалайзер) — вокал вийде вперед без підняття гучності.`, apply: () => eqCut(x, 2500, -3, 1.2) });
    }
  }
  for (const x of info) {
    if (["bass", "drums"].includes(x.role)) continue;
    if (x.prof.sub > -16 || x.prof.bass > -4 && x.role !== "vocals" && x.role !== "piano") sugg.push({ kind: "lowcut", title: `Зайвий низ у «${x.t.name}»`, text: `У «${x.t.name}» помітна енергія нижче 100 Гц — вона робить мікс каламутним і заважає басу й бочці. Пропоную зріз низу (HP) на ${x.role === "vocals" ? 90 : 120} Гц.`, apply: () => eqHP(x, x.role === "vocals" ? 90 : 120) });
  }
  const bass = info.find((x) => x.role === "bass"), drums = info.find((x) => x.role === "drums");
  if (bass && drums && !(bass.m.fx || []).some((f) => f.type === "duck")) sugg.push({ kind: "sc", title: "Бас і бочка б'ються на низах", text: `Обидві доріжки сильні нижче 250 Гц. Сайдчейн стишить «${bass.t.name}» на 5 дБ у момент удару бочки — низ стане чистим і щільним.`, apply: () => {
    const f = Plugins.newFx("duck", "Бас під бочку");
    f.params.source = drums.t.id;
    bass.m.fx.push(f);
  } });
  const withRev = info.filter((x) => (x.m.fx || []).some((f) => f.type === "reverb"));
  if (withRev.length >= 3 && !(S.mix.buses || []).some((b) => b.kind === "reverb")) sugg.push({ kind: "bus", title: "Спільний ревер замість кількох", text: `Ревер стоїть окремо на ${withRev.length} доріжках. Один спільний ревер на шині звучить цілісніше («в одному просторі») і менше навантажує ноутбук. Перенесу ревери на шину «Ревер» з посилами.`, apply: () => {
    const [name, color, mk] = BUS_KINDS.reverb;
    const b = { id: uid("bus"), name, color, fx: mk(), vol: 0, pan: 0, mute: false, kind: "reverb" };
    mxEnsure().push(b);
    for (const x of withRev) {
      const rv = x.m.fx.find((f) => f.type === "reverb");
      const wet = rv && rv.params.mix != null ? rv.params.mix : 0.25;
      x.m.fx = x.m.fx.filter((f) => f.type !== "reverb");
      x.m.sends = x.m.sends || {};
      x.m.sends[b.id] = Math.max(-30, Math.round(20 * Math.log10(Math.max(0.03, wet)) * 2) / 2);
    }
  } });
  if (!(S.mix.master.fx || []).some((f) => f.type === "limiter")) sugg.push({ kind: "lim", title: "На Master немає лімітера", text: "Лімітер на Master захищає від перевантаження і дає конкурентну гучність. Можна також одразу скористатися «Мастеринг одним кліком».", apply: () => S.mix.master.fx.push(Plugins.newFx("limiter", Object.keys(FXC.limiter.presets)[0])) });
  box.innerHTML = sugg.length ? `<p class="muted small">Знайдено ${sugg.length}. Кожну пораду можна застосувати окремо; усе скасовується Ctrl+Z.</p><div class="as-list">${sugg.map((s, i) => `<div class="as-item" data-i="${i}"><div><b>${escapeHtml(s.title)}</b><p>${escapeHtml(s.text)}</p></div><button class="btn primary sm" data-ap="${i}">Застосувати</button></div>`).join("")}</div><div class="modal-actions"><button class="btn ghost" data-close2>Закрити</button><button class="btn primary" id="as-all">Застосувати все</button></div>` : `<p>Серйозних проблем не знайдено: баланс і частоти в порядку. Порівняйте мікс з референсом в Аналізаторі.</p><div class="modal-actions"><button class="btn primary" data-close2>Добре</button></div>`;
  const doApply = (idx) => {
    pushUndo("помічник зведення");
    for (const i of idx) sugg[i].apply();
    afterEdit(true);
    renderDock();
    for (const i of idx) {
      const it = box.querySelector(`[data-i="${i}"]`);
      if (it) {
        it.classList.add("done");
        const b = it.querySelector("button");
        b.disabled = true;
        b.textContent = "Готово";
      }
    }
  };
  $$("[data-ap]", box).forEach((b) => b.onclick = () => doApply([+b.dataset.ap]));
  if ($("#as-all")) $("#as-all").onclick = () => doApply(sugg.map((_, i) => i).filter((i) => !box.querySelector(`[data-i="${i}"]`).classList.contains("done")));
  $$("[data-close2]", box).forEach((b) => b.onclick = () => modal.hidden = true);
}
function eqOf(x) {
  let f = x.m.fx.find((q) => q.type === "eq");
  if (!f) {
    f = Plugins.newFx("eq", null);
    x.m.fx.unshift(f);
  }
  return f;
}
function eqCut(x, freq, g, q) {
  const f = eqOf(x), bands = f.params.bands;
  let b = bands.filter((z) => z.type === "peaking").sort((a, c) => Math.abs(Math.log(a.f / freq)) - Math.abs(Math.log(c.f / freq)))[0];
  if (!b) {
    b = { type: "peaking", f: freq, g: 0, q, on: true };
    bands.push(b);
  }
  Object.assign(b, { f: freq, g: Math.min(b.g || 0, g), q, on: true });
}
function eqHP(x, freq) {
  const f = eqOf(x), bands = f.params.bands;
  let b = bands.find((z) => z.type === "highpass");
  if (!b) {
    b = { type: "highpass", f: freq, g: 0, q: 0.71, on: true };
    bands.unshift(b);
  }
  Object.assign(b, { f: Math.max(b.on ? b.f : 0, freq), on: true });
}
(function mxMenus() {
  if (typeof MENUS === "undefined") return;
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["Помічник зведення…", needProject(openMixAssistant)], ["Пульт мікшера", needProject(() => {
    S.dockOpen = true;
    S.dockTab = "mixer";
    renderDock();
    layout();
  })]]);
  LAYOUTS["Зведення"].tab = "mixer";
})();
