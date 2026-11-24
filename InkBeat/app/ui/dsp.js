"use strict";
const DSP = (() => {
  const dbToGain = (db) => Math.pow(10, db / 20);
  const NOTE_DIV = { "1/1": 4, "1/2": 2, "1/4": 1, "1/4.": 1.5, "1/4T": 2 / 3, "1/8": 0.5, "1/8.": 0.75, "1/8T": 1 / 3, "1/16": 0.25, "1/16.": 0.375, "1/32": 0.125 };
  const syncTime = (div, bpm) => (NOTE_DIV[div] || 0.5) * 60 / bpm;
  const WORKLET_SRC = `
  class RzGate extends AudioWorkletProcessor {
    static get parameterDescriptors() { return [
      {name:'threshold', defaultValue:-45}, {name:'attack', defaultValue:2}, {name:'hold', defaultValue:40},
      {name:'release', defaultValue:120}, {name:'range', defaultValue:60}]; }
    constructor() { super(); this.env = 0; this.g = 0; this.holdLeft = 0; }
    process(inputs, outputs, p) {
      const inp = inputs[0], out = outputs[0]; if (!inp.length) return true;
      const thr = Math.pow(10, p.threshold[0] / 20), floor = Math.pow(10, -p.range[0] / 20);
      const aC = Math.exp(-1 / (sampleRate * Math.max(0.1, p.attack[0]) / 1000));
      const rC = Math.exp(-1 / (sampleRate * Math.max(1, p.release[0]) / 1000));
      const holdN = sampleRate * p.hold[0] / 1000;
      for (let i = 0; i < inp[0].length; i++) {
        let x = 0; for (let c = 0; c < inp.length; c++) x = Math.max(x, Math.abs(inp[c][i]));
        this.env = Math.max(x, this.env * 0.9995);
        let target;
        if (this.env > thr) { target = 1; this.holdLeft = holdN; }
        else if (this.holdLeft > 0) { target = 1; this.holdLeft--; }
        else target = floor;
        this.g = target > this.g ? target + (this.g - target) * aC : target + (this.g - target) * rC;
        for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || inp[0])[i] * this.g;
      }
      this.port.postMessage && (this._n = (this._n || 0) + 1) % 40 === 0 && this.port.postMessage(this.g);
      return true;
    }
  }
  registerProcessor('rz-gate', RzGate);
  class RzCrush extends AudioWorkletProcessor {
    static get parameterDescriptors() { return [{name:'bits', defaultValue:10}, {name:'down', defaultValue:2}]; }
    constructor() { super(); this.hold = [0, 0]; this.cnt = 0; }
    process(inputs, outputs, p) {
      const inp = inputs[0], out = outputs[0]; if (!inp.length) return true;
      const step = Math.pow(0.5, Math.max(1, p.bits[0]) - 1), down = Math.max(1, Math.round(p.down[0]));
      for (let i = 0; i < inp[0].length; i++) {
        if (this.cnt++ % down === 0) for (let c = 0; c < inp.length; c++) this.hold[c] = Math.round(inp[c][i] / step) * step;
        for (let c = 0; c < out.length; c++) out[c][i] = this.hold[Math.min(c, inp.length - 1)];
      }
      return true;
    }
  }
  registerProcessor('rz-crush', RzCrush);`;
  const workletURL = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
  const ready = new WeakMap();
  function ensureWorklets(ctx) {
    if (!ctx.audioWorklet) return Promise.resolve(false);
    if (!ready.has(ctx)) ready.set(ctx, ctx.audioWorklet.addModule(workletURL).then(() => true).catch(() => false));
    return ready.get(ctx);
  }
  function wetDry(ctx, mix) {
    const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
    input.connect(dry);
    dry.connect(output);
    wet.connect(output);
    const setMix = (m) => {
      dry.gain.value = Math.cos(m * Math.PI / 2);
      wet.gain.value = Math.sin(m * Math.PI / 2);
    };
    setMix(mix);
    return { input, output, wet, setMix };
  }
  function lfo(ctx, rate, type = "sine") {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = rate;
    o.start();
    return o;
  }
  function noiseBuffer(ctx, sec = 2, crackle = false) {
    const b = ctx.createBuffer(2, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        d[i] = crackle ? Math.random() < 6e-4 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.02 : Math.random() * 2 - 1;
      }
    }
    return b;
  }
  function shaperCurve(type, drive) {
    const n = 2048, c = new Float32Array(n), k = Math.max(1, drive);
    for (let i = 0; i < n; i++) {
      const x = i * 2 / (n - 1) - 1;
      let y;
      if (type === "hard") y = Math.max(-1, Math.min(1, x * k));
      else if (type === "tube") {
        const z = x * k;
        y = z >= 0 ? Math.tanh(z) : Math.tanh(z * 0.6) / 0.85;
      } else if (type === "fold") {
        let z = x * k;
        y = Math.sin(z * Math.PI / 2);
      } else y = Math.tanh(x * k) / Math.tanh(k);
      c[i] = Math.max(-1, Math.min(1, y));
    }
    return c;
  }
  function makeIR(ctx, decay, damping, stereoWidth = 1) {
    const sr = ctx.sampleRate, len = Math.max(0.1, decay) * sr | 0;
    const b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.pow(1 - i / len, 2) * Math.exp(-3 * t / decay);
        const coef = Math.min(0.97, damping * (t / decay) * 0.95 + 0.02);
        const w = Math.random() * 2 - 1;
        lp = lp * coef + w * (1 - coef);
        d[i] = lp * env * (c === 0 ? 1 : stereoWidth * 0.98 + 0.02);
      }
      for (let k = 0; k < 8; k++) {
        const p = Math.floor((7e-3 + Math.random() * 0.045) * sr);
        if (p < len) d[p] += (Math.random() - 0.5) * 0.8;
      }
    }
    return b;
  }
  const FX = {};
  FX.eq = (ctx, P) => {
    const input = ctx.createGain(), output = ctx.createGain();
    let filters = [];
    function build() {
      input.disconnect();
      filters.forEach((f) => f.disconnect());
      filters = P.bands.filter((b) => b.on).map((b) => {
        const f = ctx.createBiquadFilter();
        f.type = b.type;
        f.frequency.value = b.f;
        f.Q.value = b.q;
        f.gain.value = b.g;
        return f;
      });
      let node = input;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }
      node.connect(output);
      output.gain.value = dbToGain(P.out || 0);
    }
    build();
    return { input, output, set(p) {
      P = p;
      build();
    }, filters: () => filters };
  };
  FX.comp = (ctx, P) => {
    const input = ctx.createGain(), output = ctx.createGain(), c = ctx.createDynamicsCompressor(), mk = ctx.createGain();
    input.connect(c);
    c.connect(mk);
    mk.connect(output);
    const set = (p) => {
      P = p;
      c.threshold.value = p.threshold;
      c.ratio.value = p.ratio;
      c.knee.value = p.knee;
      c.attack.value = p.attack / 1e3;
      c.release.value = p.release / 1e3;
      mk.gain.value = dbToGain(p.makeup);
    };
    set(P);
    return { input, output, set, reduction: () => c.reduction };
  };
  FX.limiter = (ctx, P) => {
    const input = ctx.createGain(), output = ctx.createGain(), c = ctx.createDynamicsCompressor(), pre = ctx.createGain();
    input.connect(pre);
    pre.connect(c);
    c.connect(output);
    const set = (p) => {
      P = p;
      pre.gain.value = dbToGain(p.gain);
      c.threshold.value = p.ceiling - 0.5;
      c.ratio.value = 20;
      c.knee.value = 0;
      c.attack.value = 1e-3;
      c.release.value = p.release / 1e3;
      output.gain.value = dbToGain(Math.min(0, p.ceiling + 0.5));
    };
    set(P);
    return { input, output, set, reduction: () => c.reduction };
  };
  FX.gate = (ctx, P) => {
    const input = ctx.createGain(), output = ctx.createGain();
    let node = null, level = 1;
    try {
      node = new AudioWorkletNode(ctx, "rz-gate", { outputChannelCount: [2] });
      node.port.onmessage = (e) => {
        level = e.data;
      };
      input.connect(node);
      node.connect(output);
    } catch (e) {
      input.connect(output);
    }
    const set = (p) => {
      P = p;
      if (!node) return;
      for (const k of ["threshold", "attack", "hold", "release", "range"]) node.parameters.get(k).value = p[k];
    };
    set(P);
    return { input, output, set, level: () => level };
  };
  FX.drive = (ctx, P) => {
    const wd = wetDry(ctx, P.mix), pre = ctx.createGain(), sh = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), post = ctx.createGain();
    sh.oversample = "4x";
    tone.type = "lowpass";
    wd.input.connect(pre);
    pre.connect(sh);
    sh.connect(tone);
    tone.connect(post);
    post.connect(wd.wet);
    const set = (p) => {
      P = p;
      const k = dbToGain(p.drive);
      sh.curve = shaperCurve(p.type, k);
      pre.gain.value = 1;
      tone.frequency.value = p.tone;
      post.gain.value = dbToGain(p.output);
      wd.setMix(p.mix);
    };
    set(P);
    return { input: wd.input, output: wd.output, set };
  };
  FX.filter = (ctx, P, env) => {
    const wd = wetDry(ctx, P.mix), f = ctx.createBiquadFilter(), osc = lfo(ctx, 1), depth = ctx.createGain();
    wd.input.connect(f);
    f.connect(wd.wet);
    osc.connect(depth);
    depth.connect(f.frequency);
    const set = (p) => {
      P = p;
      f.type = p.type;
      f.frequency.value = p.cutoff;
      f.Q.value = p.q;
      osc.frequency.value = p.sync ? 1 / syncTime(p.rate_div, env.bpm) : p.rate;
      depth.gain.value = p.depth * p.cutoff * 0.9;
      wd.setMix(p.mix);
    };
    set(P);
    return { input: wd.input, output: wd.output, set, dispose() {
      osc.stop();
    }, node: f };
  };
  FX.chorus = (ctx, P) => {
    const wd = wetDry(ctx, P.mix), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    wd.input.connect(mono);
    const lines = [0, 1].map((i) => {
      const d = ctx.createDelay(0.1), o = lfo(ctx, 0.8), g = ctx.createGain();
      o.connect(g);
      g.connect(d.delayTime);
      mono.connect(d);
      d.connect(merge, 0, i);
      return { d, o, g };
    });
    merge.connect(wd.wet);
    const set = (p) => {
      P = p;
      lines.forEach((l, i) => {
        l.d.delayTime.value = (p.delay + i * 3) / 1e3;
        l.o.frequency.value = p.rate * (i ? 1.13 : 1);
        l.g.gain.value = p.depth / 1e3;
      });
      wd.setMix(p.mix);
    };
    set(P);
    return { input: wd.input, output: wd.output, set, dispose() {
      lines.forEach((l) => l.o.stop());
    } };
  };
  FX.delay = (ctx, P, env) => {
    const wd = wetDry(ctx, P.mix), dL = ctx.createDelay(4), dR = ctx.createDelay(4), fb = ctx.createGain(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    const merge = ctx.createChannelMerger(2), mono = ctx.createGain(), cross = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    hp.type = "highpass";
    lp.type = "lowpass";
    wd.input.connect(mono);
    mono.connect(hp);
    hp.connect(lp);
    lp.connect(dL);
    dL.connect(merge, 0, 0);
    dL.connect(cross);
    cross.connect(dR);
    dR.connect(merge, 0, 1);
    dR.connect(fb);
    fb.connect(hp);
    merge.connect(wd.wet);
    const set = (p) => {
      P = p;
      const t = p.sync ? syncTime(p.div, env.bpm) : p.ms / 1e3;
      dL.delayTime.value = Math.min(3.9, t);
      dR.delayTime.value = p.pingpong ? Math.min(3.9, t) : 1e-4;
      cross.gain.value = 1;
      fb.gain.value = p.feedback;
      hp.frequency.value = p.hp;
      lp.frequency.value = p.lp;
      wd.setMix(p.mix);
    };
    set(P);
    return { input: wd.input, output: wd.output, set };
  };
  FX.reverb = (ctx, P) => {
    const wd = wetDry(ctx, P.mix), pre = ctx.createDelay(1), conv = ctx.createConvolver(), lc = ctx.createBiquadFilter();
    lc.type = "highpass";
    wd.input.connect(pre);
    pre.connect(lc);
    lc.connect(conv);
    conv.connect(wd.wet);
    let key = "";
    const set = (p) => {
      P = p;
      pre.delayTime.value = p.predelay / 1e3;
      lc.frequency.value = p.lowcut;
      wd.setMix(p.mix);
      const k = `${p.decay}|${p.damping}|${p.width}`;
      if (k !== key) {
        key = k;
        conv.buffer = makeIR(ctx, p.decay, p.damping, p.width);
      }
    };
    set(P);
    return { input: wd.input, output: wd.output, set, ir: () => conv.buffer };
  };
  FX.stereo = (ctx, P) => {
    const input = ctx.createGain(), output = ctx.createGain(), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    input.channelCount = 2;
    input.channelCountMode = "explicit";
    input.channelInterpretation = "speakers";
    const mid = ctx.createGain(), side = ctx.createGain(), lToS = ctx.createGain(), rToS = ctx.createGain(), sNeg = ctx.createGain(), pan = ctx.createStereoPanner();
    input.connect(split);
    split.connect(mid, 0);
    split.connect(mid, 1);
    mid.gain.value = 0.5;
    split.connect(lToS, 0);
    split.connect(rToS, 1);
    rToS.gain.value = -1;
    lToS.connect(side);
    rToS.connect(side);
    side.connect(sNeg);
    sNeg.gain.value = -1;
    mid.connect(merge, 0, 0);
    mid.connect(merge, 0, 1);
    side.connect(merge, 0, 0);
    sNeg.connect(merge, 0, 1);
    merge.connect(pan);
    pan.connect(output);
    const set = (p) => {
      P = p;
      side.gain.value = 0.5 * p.width;
      pan.pan.value = p.pan;
      output.gain.value = dbToGain(p.gain);
    };
    set(P);
    return { input, output, set };
  };
  FX.lofi = (ctx, P) => {
    const wd = wetDry(ctx, P.mix), tone = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), noise = ctx.createBufferSource(), ng = ctx.createGain();
    tone.type = "lowpass";
    hp.type = "highpass";
    hp.frequency.value = 120;
    let crush = null;
    try {
      crush = new AudioWorkletNode(ctx, "rz-crush", { outputChannelCount: [2] });
    } catch (e) {
      crush = null;
    }
    const wow = ctx.createDelay(0.05), wo = lfo(ctx, 0.6), wg = ctx.createGain();
    wo.connect(wg);
    wg.connect(wow.delayTime);
    wow.delayTime.value = 0.01;
    wd.input.connect(wow);
    if (crush) {
      wow.connect(crush);
      crush.connect(hp);
    } else wow.connect(hp);
    hp.connect(tone);
    tone.connect(wd.wet);
    noise.buffer = noiseBuffer(ctx, 3, true);
    noise.loop = true;
    noise.connect(ng);
    ng.connect(wd.wet);
    noise.start();
    const set = (p) => {
      P = p;
      tone.frequency.value = p.tone;
      ng.gain.value = p.noise * 0.25;
      wg.gain.value = p.wow * 3e-3;
      wd.setMix(p.mix);
      if (crush) {
        crush.parameters.get("bits").value = p.bits;
        crush.parameters.get("down").value = p.down;
      }
    };
    set(P);
    return { input: wd.input, output: wd.output, set, dispose() {
      noise.stop();
      wo.stop();
    } };
  };
  FX.tremolo = (ctx, P, env) => {
    const input = ctx.createGain(), output = ctx.createGain(), vca = ctx.createGain(), pan = ctx.createStereoPanner(), o = lfo(ctx, 4), dep = ctx.createGain(), dPan = ctx.createGain();
    input.connect(vca);
    vca.connect(pan);
    pan.connect(output);
    o.connect(dep);
    dep.connect(vca.gain);
    o.connect(dPan);
    dPan.connect(pan.pan);
    const set = (p) => {
      P = p;
      o.type = p.shape;
      o.frequency.value = p.sync ? 1 / syncTime(p.div, env.bpm) : p.rate;
      const isPan = p.mode === "pan";
      vca.gain.value = isPan ? 1 : 1 - p.depth / 2;
      dep.gain.value = isPan ? 0 : p.depth / 2;
      dPan.gain.value = isPan ? p.depth : 0;
    };
    set(P);
    return { input, output, set, dispose() {
      o.stop();
    } };
  };
  FX.pitchfx = (ctx, P) => {
    const wd = wetDry(ctx, P.mix), d1 = ctx.createDelay(0.1), d2 = ctx.createDelay(0.1), o1 = lfo(ctx, 0.31), o2 = lfo(ctx, 0.27), g1 = ctx.createGain(), g2 = ctx.createGain();
    const merge = ctx.createChannelMerger(2), mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    wd.input.connect(mono);
    mono.connect(d1);
    mono.connect(d2);
    o1.connect(g1);
    g1.connect(d1.delayTime);
    o2.connect(g2);
    g2.connect(d2.delayTime);
    d1.connect(merge, 0, 0);
    d2.connect(merge, 0, 1);
    merge.connect(wd.wet);
    const set = (p) => {
      P = p;
      d1.delayTime.value = p.time / 1e3;
      d2.delayTime.value = p.time * 1.37 / 1e3;
      g1.gain.value = g2.gain.value = p.detune / 1e3 * 0.4;
      wd.setMix(p.mix);
    };
    set(P);
    return { input: wd.input, output: wd.output, set, dispose() {
      o1.stop();
      o2.stop();
    } };
  };
  function createFx(ctx, fx, env) {
    const f = FX[fx.type];
    if (!f) return null;
    try {
      return f(ctx, JSON.parse(JSON.stringify(fx.params)), env);
    } catch (e) {
      console.warn("fx", fx.type, e);
      return null;
    }
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function synthNote(ctx, out, P, pitch, vel, t0, dur) {
    const voices = [];
    const g = ctx.createGain();
    g.gain.value = 0;
    const filt = ctx.createBiquadFilter();
    filt.type = P.filter.type;
    filt.Q.value = P.filter.q;
    let tail = filt;
    if (P.drive > 0) {
      const sh = ctx.createWaveShaper();
      sh.curve = shaperCurve("soft", 1 + P.drive * 6);
      filt.connect(sh);
      tail = sh;
    }
    tail.connect(g);
    g.connect(out);
    const f0 = mtof(pitch);
    const uni = Math.max(1, P.unison | 0), spread = P.spread || 0;
    for (const o of P.osc) {
      if (!o.gain) continue;
      for (let u = 0; u < uni; u++) {
        const osc = ctx.createOscillator();
        osc.type = o.type;
        const det = (o.detune || 0) + (uni > 1 ? (u / (uni - 1) - 0.5) * spread : 0);
        osc.frequency.value = f0 * Math.pow(2, o.oct || 0);
        osc.detune.value = det;
        if (P.pitchEnv && P.pitchEnv.semi) {
          osc.detune.setValueAtTime(det + P.pitchEnv.semi * 100, t0);
          osc.detune.setTargetAtTime(det, t0, Math.max(5e-3, P.pitchEnv.decay / 3));
        }
        const og = ctx.createGain();
        og.gain.value = o.gain / Math.sqrt(uni);
        osc.connect(og);
        og.connect(filt);
        if (P.fm && P.fm.index > 0 && o === P.osc[0]) {
          const mod = ctx.createOscillator(), mg = ctx.createGain();
          mod.frequency.value = f0 * P.fm.ratio;
          mg.gain.setValueAtTime(P.fm.index * f0, t0);
          mg.gain.setTargetAtTime(P.fm.index * f0 * (P.fm.sustain || 0), t0, Math.max(0.01, P.fm.decay / 3));
          mod.connect(mg);
          mg.connect(osc.frequency);
          voices.push(mod);
        }
        voices.push(osc);
      }
    }
    if (P.sub) {
      const s = ctx.createOscillator();
      s.type = "sine";
      s.frequency.value = f0 / 2;
      const sg = ctx.createGain();
      sg.gain.value = P.sub;
      s.connect(sg);
      sg.connect(filt);
      voices.push(s);
    }
    if (P.noise) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 1);
      n.loop = true;
      const ng = ctx.createGain();
      ng.gain.value = P.noise;
      n.connect(ng);
      ng.connect(filt);
      voices.push(n);
    }
    const A = P.amp, F = P.filter, FE = P.fenv;
    const peak = (P.gain || 0.3) * (0.3 + 0.7 * vel);
    const tOff = t0 + Math.max(0.02, dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.max(1e-3, A.a));
    g.gain.setTargetAtTime(peak * A.s, t0 + A.a, Math.max(5e-3, A.d / 3));
    g.gain.cancelScheduledValues(tOff);
    g.gain.setTargetAtTime(0, tOff, Math.max(5e-3, A.r / 4));
    const base = Math.min(18e3, F.cutoff * Math.pow(2, (F.keytrack || 0) * (pitch - 60) / 12));
    const top = Math.min(19e3, base * Math.pow(2, F.env || 0));
    filt.frequency.setValueAtTime(base, t0);
    if (F.env) {
      filt.frequency.linearRampToValueAtTime(top, t0 + Math.max(1e-3, FE.a));
      filt.frequency.setTargetAtTime(base + (top - base) * FE.s, t0 + FE.a, Math.max(5e-3, FE.d / 3));
      filt.frequency.setTargetAtTime(base, tOff, Math.max(5e-3, FE.r / 4));
    }
    const end = tOff + A.r * 1.2 + 0.05;
    for (const v of voices) {
      v.start(t0);
      v.stop(end);
    }
  }
  function sampleNote(ctx, out, P, buf, pitch, vel, t0, dur) {
    if (!buf) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = Math.pow(2, (pitch - (P.root || 60)) / 12 + (P.tune || 0) / 12);
    const g = ctx.createGain();
    s.connect(g);
    g.connect(out);
    const peak = (P.gain || 0.8) * (0.3 + 0.7 * vel), A = P.amp || { a: 2e-3, d: 0.1, s: 1, r: 0.15 };
    const tOff = t0 + Math.max(0.02, dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + A.a);
    g.gain.setTargetAtTime(peak * A.s, t0 + A.a, Math.max(5e-3, A.d / 3));
    if (!P.oneshot) {
      g.gain.cancelScheduledValues(tOff);
      g.gain.setTargetAtTime(0, tOff, Math.max(5e-3, A.r / 4));
      s.stop(tOff + A.r * 1.5 + 0.05);
    }
    s.start(t0);
  }
  const DRUM_GROUP = (n) => n === 36 ? "kick" : [38, 39, 40].includes(n) ? "snare" : [42, 44].includes(n) ? "hat" : n === 46 ? "openhat" : [49, 57].includes(n) ? "crash" : n === 51 ? "ride" : [45, 47, 48, 50].includes(n) ? "tom" : "perc";
  function synthDrum(ctx, out, kit, note, vel, t0, pad) {
    const v = (0.25 + 0.75 * vel) * (pad.vol ?? 1), tune = Math.pow(2, (pad.tune || 0) / 12);
    const noise = (dur, type, freq, q, gain) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, Math.min(2, dur + 0.05));
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq * tune;
      f.Q.value = q;
      const g = ctx.createGain();
      s.connect(f);
      f.connect(g);
      g.connect(out);
      g.gain.setValueAtTime(gain * v, t0);
      g.gain.exponentialRampToValueAtTime(8e-4, t0 + dur * (pad.decay ?? 1));
      s.start(t0);
      s.stop(t0 + dur * (pad.decay ?? 1) + 0.05);
    };
    const tone = (f0, f1, dur, gain, type = "sine") => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f0 * tune, t0);
      o.frequency.exponentialRampToValueAtTime(f1 * tune, t0 + dur * 0.6);
      g.gain.setValueAtTime(gain * v, t0);
      g.gain.exponentialRampToValueAtTime(8e-4, t0 + dur * (pad.decay ?? 1));
      o.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + dur * (pad.decay ?? 1) + 0.05);
    };
    const grp = DRUM_GROUP(note);
    if (kit === "808") {
      if (grp === "kick") {
        tone(110, 38, 1.1, 1);
        const sh = 0;
      } else if (grp === "snare") {
        tone(240, 180, 0.15, 0.4, "triangle");
        noise(0.22, "highpass", 1800, 0.7, 0.5);
      } else if (grp === "hat") noise(0.06, "highpass", 9e3, 0.9, 0.3);
      else if (grp === "openhat") noise(0.4, "highpass", 8500, 0.9, 0.28);
      else if (grp === "crash") noise(1.6, "highpass", 6e3, 0.5, 0.22);
      else if (grp === "ride") noise(0.8, "bandpass", 7e3, 3, 0.2);
      else if (grp === "tom") tone(180, 90, 0.5, 0.7);
      else noise(0.1, "bandpass", 3e3, 2, 0.3);
    } else {
      if (grp === "kick") {
        tone(150, 48, 0.32, 0.9);
        noise(0.02, "lowpass", 3e3, 0.7, 0.15);
      } else if (grp === "snare") {
        tone(220, 160, 0.12, 0.35, "triangle");
        noise(0.18, "bandpass", 2600, 0.8, 0.55);
      } else if (grp === "hat") noise(0.05, "highpass", 8e3, 0.8, 0.28);
      else if (grp === "openhat") noise(0.35, "highpass", 7500, 0.8, 0.25);
      else if (grp === "crash") noise(1.4, "highpass", 5e3, 0.5, 0.22);
      else if (grp === "ride") noise(0.6, "bandpass", 6500, 3, 0.18);
      else if (grp === "tom") {
        const f = { 45: 110, 47: 140, 48: 165, 50: 200 }[note] || 140;
        tone(f * 1.4, f, 0.35, 0.6);
      } else noise(0.1, "bandpass", 3e3, 2, 0.3);
    }
  }
  function drumSample(ctx, out, buf, vel, t0, pad) {
    if (!buf) return false;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = Math.pow(2, (pad.tune || 0) / 12);
    const g = ctx.createGain();
    g.gain.value = (0.25 + 0.75 * vel) * (pad.vol ?? 1);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pad.pan || 0;
    s.connect(g);
    g.connect(pn);
    pn.connect(out);
    s.start(t0);
    if ((pad.decay ?? 1) < 1) {
      g.gain.setTargetAtTime(0, t0 + buf.duration * pad.decay * 0.6, buf.duration * pad.decay * 0.15);
    }
    return true;
  }
  function playNote(ctx, out, inst, pitch, vel, t0, dur, buffers) {
    if (!inst) return;
    if (inst.type === "drums") {
      const grp = DRUM_GROUP(pitch), pad = inst.pads && inst.pads[grp] || {};
      if (pad.mute) return;
      if (inst.kit === "song" && drumSample(ctx, out, buffers.get("drum:" + grp) || buffers.get("drum:" + (grp === "openhat" ? "hat" : grp === "ride" ? "crash" : "")), vel, t0, pad)) return;
      synthDrum(ctx, out, inst.kit === "808" ? "808" : "acoustic", pitch, vel, t0, pad);
    } else if (inst.type === "sampler") {
      sampleNote(ctx, out, inst.params, buffers.get("sample:" + inst.sample), pitch, vel, t0, dur);
    } else {
      synthNote(ctx, out, inst.params, pitch, vel, t0, dur);
    }
  }
  class Strip {
    constructor(ctx, dest, env) {
      this.ctx = ctx;
      this.env = env;
      this.input = ctx.createGain();
      this.post = ctx.createGain();
      this.pan = ctx.createStereoPanner();
      this.fader = ctx.createGain();
      this.meterL = ctx.createAnalyser();
      this.meterL.fftSize = 1024;
      this.post.connect(this.pan);
      this.pan.connect(this.fader);
      this.fader.connect(dest);
      this.fader.connect(this.meterL);
      this.nodes = [];
      this.fxList = [];
      this.input.connect(this.post);
    }
    setFx(list) {
      this.input.disconnect();
      for (const n of this.nodes) {
        try {
          n.output.disconnect();
          n.dispose && n.dispose();
        } catch (e) {
        }
      }
      this.nodes = [];
      this.fxList = list;
      let cur = this.input;
      for (const fx of list) {
        if (!fx.on) {
          this.nodes.push(null);
          continue;
        }
        const n = createFx(this.ctx, fx, this.env);
        this.nodes.push(n);
        if (!n) continue;
        cur.connect(n.input);
        cur = n.output;
      }
      cur.connect(this.post);
    }
    updateFx(i, params) {
      const n = this.nodes[i];
      if (n) n.set(JSON.parse(JSON.stringify(params)));
    }
    setVol(db, muted) {
      this.fader.gain.setTargetAtTime(muted ? 0 : dbToGain(db), this.ctx.currentTime, 0.015);
    }
    setPan(p) {
      this.pan.pan.value = p;
    }
    level() {
      const a = this.meterL, d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      let m = 0;
      for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
      return m;
    }
    dispose() {
      try {
        this.fader.disconnect();
      } catch (e) {
      }
      for (const n of this.nodes) n && n.dispose && n.dispose();
    }
  }
  function encodeWav(buf) {
    const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length, bps = 3;
    const ab = new ArrayBuffer(44 + n * ch * bps), v = new DataView(ab);
    const w = (o2, s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o2 + i, s.charCodeAt(i));
    };
    w(0, "RIFF");
    v.setUint32(4, 36 + n * ch * bps, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, ch, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * ch * bps, true);
    v.setUint16(32, ch * bps, true);
    v.setUint16(34, 24, true);
    w(36, "data");
    v.setUint32(40, n * ch * bps, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      let s = Math.max(-1, Math.min(1, data[c][i]));
      let x = Math.round(s * 8388607);
      if (x < 0) x += 16777216;
      v.setUint8(o, x & 255);
      v.setUint8(o + 1, x >> 8 & 255);
      v.setUint8(o + 2, x >> 16 & 255);
      o += 3;
    }
    return new Blob([ab], { type: "audio/wav" });
  }
  return { FX, createFx, ensureWorklets, Strip, playNote, encodeWav, dbToGain, syncTime, makeIR, shaperCurve, DRUM_GROUP, mtof };
})();
