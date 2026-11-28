"use strict";
const VE_FONTS = [
  ["Inter", "Inter", "sans"], ["Montserrat", "Montserrat", "sans"], ["Manrope", "Manrope", "sans"], ["Rubik", "Rubik", "sans"],
  ["Oswald", "Oswald", "condensed"], ["Unbounded", "Unbounded", "display"], ["Exo 2", "Exo2", "display"], ["Russo One", "RussoOne.ttf", "display"],
  ["Rubik Mono One", "RubikMonoOne", "display"], ["Comfortaa", "Comfortaa.ttf", "rounded"], ["Playfair Display", "PlayfairDisplay.ttf", "serif"],
  ["Lobster", "Lobster.ttf", "script"], ["Pacifico", "Pacifico", "script"], ["Caveat", "Caveat", "hand"], ["Marck Script", "MarckScript.ttf", "hand"],
  ["Neucha", "Neucha", "hand"], ["Press Start 2P", "PressStart2P.ttf", "pixel"]
];
const VE_SYS_FONTS = ["Arial", "Segoe UI", "Georgia", "Times New Roman", "Courier New", "Impact", "Trebuchet MS", "Verdana"];
const VE_FMTS = ["tiktok", "youtube", "square"];
const VE = {
  on: true, doc: null, sel: null, media: {}, fontsReady: {}, hist: [], fut: [], saveT: 0, histT: 0,
  scene: null, tab: "templates", itab: "style", clip: null, tlZoom: 1, tlScroll: 0, syncMode: null, dragging: null,
  frame: null, lvl: 0, lastT: 0
};
const veUid = () => Math.random().toString(36).slice(2, 9);
const veClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const veDur = () => { const r = vsRange(); return Math.max(0.1, (r[1] - r[0]) * period()); };
const veNowT = () => (vsPreviewBeat() - vsRange()[0]) * period();
const veBeatToT = (b) => (b - vsRange()[0]) * period();
const veTToBeat = (t) => vsRange()[0] + t / period();
const veGet = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function veSet(o, path, v) {
  const ks = path.split(".");
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== "object") a[ks[i]] = {}; a = a[ks[i]]; }
  a[ks[ks.length - 1]] = v;
}
function veFontCss(l, px) {
  const fam = l.font || "Inter";
  return `${l.italic ? "italic " : ""}${l.weight || 700} ${px}px "${fam}", Inter, "Segoe UI", sans-serif`;
}
function veLoadFonts() {
  if (VE.fontFaces) return;
  VE.fontFaces = true;
  for (const [fam, file] of VE_FONTS) {
    try {
      const ff = new FontFace(fam, `url(/ui/fonts/${/\./.test(file) ? file : file + ".woff2"})`, { weight: "100 900", style: "normal" });
      document.fonts.add(ff);
      VE.fontsReady[fam] = ff;
    } catch (e) {
    }
  }
}
function veUserFonts() {
  for (const f of VE.doc.fonts || []) {
    if (VE.fontsReady[f.family]) continue;
    try {
      const ff = new FontFace(f.family, `url(/api/project/${S.pid}/video/media/${encodeURIComponent(f.file)})`);
      document.fonts.add(ff);
      VE.fontsReady[f.family] = ff;
    } catch (e) {
    }
  }
}
async function veFontsLoad() {
  const fams = new Set();
  for (const l of VE.doc.layers) if (l.font) fams.add(l.font);
  await Promise.all([...fams].map((f) => VE.fontsReady[f] ? VE.fontsReady[f].load().catch(() => null) : null));
}
function veMediaUrl(name) {
  return name === "@cover" ? `/api/project/${S.pid}/cover?t=${Date.now()}` : `/api/project/${S.pid}/video/media/${encodeURIComponent(name)}`;
}
function veIsVideo(name) { return /\.(mp4|webm|mov|m4v)$/i.test(name || ""); }
function veMedia(name) {
  if (!name) return null;
  if (name === "@cover") return VS.cover ? { kind: "img", el: VS.cover, w: VS.cover.naturalWidth, h: VS.cover.naturalHeight, ok: true } : null;
  let m = VE.media[name];
  if (m) return m;
  m = VE.media[name] = { kind: veIsVideo(name) ? "video" : "img", ok: false, w: 16, h: 9 };
  if (m.kind === "video") {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.onloadeddata = () => { m.ok = true; m.w = v.videoWidth; m.h = v.videoHeight; m.dur = v.duration; veRedraw(); };
    v.onerror = () => { m.err = true; };
    v.src = veMediaUrl(name);
    m.el = v;
  } else if (/\.gif$/i.test(name) && typeof ImageDecoder !== "undefined") {
    veLoadGif(name, m);
  } else {
    const im = new Image();
    im.onload = () => { m.ok = true; m.w = im.naturalWidth; m.h = im.naturalHeight; veRedraw(); };
    im.onerror = () => { m.err = true; };
    im.src = veMediaUrl(name);
    m.el = im;
  }
  return m;
}
async function veLoadGif(name, m) {
  try {
    const buf = await (await fetch(veMediaUrl(name))).arrayBuffer();
    const dec = new ImageDecoder({ data: buf, type: "image/gif" });
    await dec.tracks.ready;
    const n = dec.tracks.selectedTrack.frameCount, frames = [];
    let total = 0;
    for (let i = 0; i < Math.min(n, 400); i++) {
      const r = await dec.decode({ frameIndex: i });
      const bm = await createImageBitmap(r.image);
      const d = (r.image.duration || 100000) / 1e6;
      frames.push({ bm, t: total, d });
      total += d;
      r.image.close();
    }
    m.kind = "gif";
    m.frames = frames;
    m.total = Math.max(0.05, total);
    m.w = frames[0].bm.width;
    m.h = frames[0].bm.height;
    m.ok = true;
    veRedraw();
  } catch (e) {
    const im = new Image();
    im.onload = () => { m.kind = "img"; m.ok = true; m.w = im.naturalWidth; m.h = im.naturalHeight; m.el = im; veRedraw(); };
    im.src = veMediaUrl(name);
  }
}
function veMediaFrame(m, t, l) {
  if (!m || !m.ok) return null;
  if (m.kind === "gif") {
    const tt = ((t * (l.speed || 1)) % m.total + m.total) % m.total;
    let f = m.frames[0];
    for (const x of m.frames) { if (x.t <= tt) f = x; else break; }
    return f.bm;
  }
  return m.el;
}
function veVideoTime(l, t, m) {
  const local = Math.max(0, t - veT0(l)) * (l.speed || 1) + (l.trim || 0);
  const d = m.dur || 0;
  if (!d) return local;
  return l.loop === false ? Math.min(local, d - 0.04) : local % Math.max(0.05, d - 0.02);
}
function veSyncVideos(t, playing) {
  for (const l of VE.doc.layers) {
    if (l.type !== "video" || l.hidden) continue;
    const m = veMedia(l.media);
    if (!m || !m.ok) continue;
    const v = m.el, want = veVideoTime(l, t, m), vis = veVisible(l, t);
    if (playing && vis) {
      v.playbackRate = l.speed || 1;
      if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
      if (v.paused) v.play().catch(() => {});
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
    }
  }
}
async function vePrepare(beat) {
  if (!VE.on || !VE.doc) return;
  const t = veBeatToT(beat);
  const waits = [];
  for (const l of VE.doc.layers) {
    if (l.type !== "video" || l.hidden || !veVisible(l, t)) continue;
    const m = veMedia(l.media);
    if (!m || !m.ok) continue;
    const v = m.el, want = veVideoTime(l, t, m);
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - want) > 0.008) {
      waits.push(new Promise((res) => {
        const done = () => { v.removeEventListener("seeked", done); res(); };
        v.addEventListener("seeked", done);
        v.currentTime = want;
        setTimeout(done, 1500);
      }));
    }
  }
  if (waits.length) await Promise.all(waits);
}
async function veMediaReady() {
  const ws = [];
  for (const l of VE.doc.layers) {
    if (!l.media && !(l.type === "bg")) continue;
    const m = veMedia(l.media);
    if (m && !m.ok && !m.err) ws.push(new Promise((res) => { const t0 = Date.now(); const k = () => (m.ok || m.err || Date.now() - t0 > 8000) ? res() : setTimeout(k, 80); k(); }));
  }
  if (VE.doc.bg && VE.doc.bg.media) veMedia(VE.doc.bg.media);
  await Promise.all(ws);
  await veFontsLoad();
}

function veBase(type, extra) {
  return Object.assign({
    id: veUid(), type, name: "", hidden: false, locked: false, t0: 0, t1: null, opacity: 1, blend: "source-over",
    pos: {}, anim: { in: "none", inDur: 0.4, out: "none", outDur: 0.3, loop: "none", loopAmt: 0.5 }
  }, extra);
}
const VE_TEXT_DEF = {
  text: "Текст", dyn: "", font: "Montserrat", weight: 800, italic: false, size: 72, color: "#ffffff", grad: null,
  stroke: { w: 0, c: "#000000" }, shadow: { on: true, c: "#000000", a: 0.55, blur: 18, x: 0, y: 6 },
  box: { on: false, c: "#000000", a: 0.6, r: 16, pad: 18 }, align: "center", ls: 0, lh: 1.15, upper: false, maxW: 900
};
function veMakeText(text, extra) {
  return veBase("text", Object.assign(JSON.parse(JSON.stringify(VE_TEXT_DEF)), { text, name: text.slice(0, 24) }, extra || {}));
}
function veMakeLyrics(extra) {
  return veBase("lyrics", Object.assign(JSON.parse(JSON.stringify(VE_TEXT_DEF)), {
    name: "Субтитри", text: "", size: 58, weight: 800, font: "Montserrat", mode: "karaoke", hl: "#ffb547", dim: 0.45, lines: [], maxLines: 2,
    box: { on: true, c: "#000000", a: 0.55, r: 18, pad: 16 }, shadow: { on: false, c: "#000000", a: 0.5, blur: 12, x: 0, y: 4 }, maxW: 900,
    anim: { in: "fade", inDur: 0.25, out: "fade", outDur: 0.25, loop: "none", loopAmt: 0.5 }
  }, extra || {}));
}
function veMakeImage(media, extra) {
  return veBase("image", Object.assign({
    name: "Зображення", media, w: 600, radius: 0, border: { w: 0, c: "#ffffff" }, shadow: { on: false, c: "#000000", a: 0.5, blur: 40, x: 0, y: 16 },
    flipX: false, flipY: false, f: { b: 100, c: 100, s: 100, blur: 0, hue: 0 }, kb: 0, mask: "rect", speed: 1
  }, extra || {}));
}
function veMakeVideo(media, extra) {
  return Object.assign(veMakeImage(media, { name: "Відео", trim: 0, loop: true, speed: 1 }), { type: "video" }, extra || {});
}
function veMakeShape(shape, extra) {
  return veBase("shape", Object.assign({ name: "Фігура", shape, w: 400, h: 400, fill: "#ffb547", fa: 1, grad: null, stroke: { w: 0, c: "#ffffff" }, radius: 24 }, extra || {}));
}
function veMakeViz(kind, extra) {
  return veBase("viz", Object.assign({ name: "Візуалізатор", kind, w: 900, h: 260, color: "#ffb547", color2: "#f472b6", bands: 48, gap: 0.35, round: true, sens: 1, mirror: false, src: "mix" }, extra || {}));
}
function veMakeProgress(extra) {
  return veBase("progress", Object.assign({ name: "Прогрес", style: "bar", w: 860, h: 10, color: "#ffb547", track: "#ffffff", ta: 0.15, radius: 6, time: true }, extra || {}));
}
function veMakeWm(extra) {
  return veBase("wm", Object.assign({ name: "Підпис InkBeat" }, extra || {}));
}
function veMakeScene(extra) {
  return veBase("scene", Object.assign({ name: "Сцена", noBg: false, anim: { in: "none", inDur: 0.4, out: "none", outDur: 0.3, loop: "none", loopAmt: 0.5 } }, extra || {}));
}
const VE_ANCHORS = {
  center: { tiktok: [0.5, 0.5], youtube: [0.5, 0.5], square: [0.5, 0.5] },
  top: { tiktok: [0.5, 0.1], youtube: [0.5, 0.09], square: [0.5, 0.09] },
  top2: { tiktok: [0.5, 0.135], youtube: [0.5, 0.145], square: [0.5, 0.14] },
  upper: { tiktok: [0.5, 0.33], youtube: [0.5, 0.33], square: [0.5, 0.33] },
  lower: { tiktok: [0.5, 0.64], youtube: [0.5, 0.72], square: [0.5, 0.7] },
  bottom: { tiktok: [0.5, 0.72], youtube: [0.5, 0.86], square: [0.5, 0.86] },
  foot: { tiktok: [0.5, 0.772], youtube: [0.5, 0.885], square: [0.5, 0.885] },
  corner: { tiktok: [0.21, 0.8], youtube: [0.15, 0.925], square: [0.2, 0.925] }
};
function veAnchor(l, name, sc) {
  const a = VE_ANCHORS[name] || VE_ANCHORS.center;
  for (const f of VE_FMTS) {
    const s = typeof sc === "object" ? sc[f] : sc;
    l.pos[f] = { x: a[f][0], y: a[f][1], s: s || 1, r: 0, kf: [] };
  }
  return l;
}
function vePos(l, fmt) {
  fmt = fmt || VE.encFmt || VS.fmt;
  let p = l.pos[fmt];
  if (!p) {
    const other = VE_FMTS.map((f) => l.pos[f]).find(Boolean);
    p = l.pos[fmt] = other ? { x: other.x, y: other.y, s: other.s, r: other.r, kf: [] } : { x: 0.5, y: 0.5, s: 1, r: 0, kf: [] };
  }
  if (!p.kf) p.kf = [];
  return p;
}
const veEase = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function veTransform(l, t, fmt) {
  const p = vePos(l, fmt);
  const out = { x: p.x, y: p.y, s: p.s, r: p.r, o: 1 };
  const kf = p.kf;
  if (kf && kf.length) {
    if (t <= kf[0].t) Object.assign(out, kf[0]);
    else if (t >= kf[kf.length - 1].t) Object.assign(out, kf[kf.length - 1]);
    else {
      for (let i = 0; i < kf.length - 1; i++) {
        const a = kf[i], b = kf[i + 1];
        if (t >= a.t && t <= b.t) {
          const k = veEase((t - a.t) / Math.max(1e-6, b.t - a.t));
          for (const key of ["x", "y", "s", "r", "o"]) out[key] = (a[key] ?? out[key]) + ((b[key] ?? out[key]) - (a[key] ?? out[key])) * k;
          break;
        }
      }
    }
    if (out.o == null) out.o = 1;
  }
  return out;
}
const veT0 = (l) => l.tail ? Math.max(0, veDur() - l.tail) : (l.t0 || 0);
const veT1 = (l) => l.tail ? veDur() : l.t1 == null ? veDur() : Math.min(l.t1, veDur());
function veVisible(l, t) {
  if (l.hidden) return false;
  if (l.type === "lyrics") return true;
  return t >= veT0(l) - 1e-6 && t <= veT1(l) + 1e-6;
}

function veLayerSize(g, l, W, H, u, fr, t) {
  if (l.type === "text" || l.type === "timer") { const m = veTextLayout(g, l, veTextOf(l, fr, t)); return [m.w, m.h]; }
  if (l.type === "lyrics") { const m = veLyricsLayout(g, l, fr, t); return [m ? m.w : l.maxW * 0.6, m ? m.h : l.size * 1.4]; }
  if (l.type === "image" || l.type === "video") {
    const m = veMedia(l.media), ar = m && m.ok ? m.h / Math.max(1, m.w) : 9 / 16;
    return [l.w, l.mask === "circle" || l.mask === "square" ? l.w : l.w * ar];
  }
  if (l.type === "shape" || l.type === "viz" || l.type === "progress") return [l.w, l.type === "progress" ? Math.max(l.h, l.time ? l.h + 60 : l.h) : l.h];
  if (l.type === "wm") return [330, 52];
  if (l.type === "scene") return [W / u, H / u];
  return [200, 100];
}
function veTextOf(l, fr, t) {
  if (l.type === "timer") {
    const d = veDur(), tt = veClamp(t, 0, d);
    return l.fmtT === "left" ? "-" + vsFmtTime(d - tt) : l.fmtT === "both" ? `${vsFmtTime(tt)} / ${vsFmtTime(d)}` : vsFmtTime(tt);
  }
  const info = fr ? vsInfo(fr.beat) : { sec: "", ch: "" };
  let s = l.dyn === "title" ? (VS.title || S.B.project.title) : l.dyn === "artist" ? (VS.artist || "") : l.dyn === "bpm" ? `${Math.round(S.B.timing.bpm)} BPM`
    : l.dyn === "key" ? `${NOTE_NAMES[S.B.key.tonic]} ${tr(S.B.key.mode === "minor" ? "мінор" : "мажор")}` : l.dyn === "section" ? tr(info.sec) : l.dyn === "chord" ? info.ch : l.text;
  s = s == null ? "" : String(s);
  return l.upper ? s.toLocaleUpperCase() : s;
}
function veWrap(g, text, maxW, ls) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const w of para.split(/(\s+)/)) {
      if (!w) continue;
      const test = line + w;
      if (line.trim() && veMeasure(g, test.trimEnd(), ls) > maxW) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}
function veMeasure(g, s, ls) {
  return g.measureText(s).width + (ls ? ls * Math.max(0, [...s].length - 1) : 0);
}
function veTextLayout(g, l, text) {
  g.font = veFontCss(l, l.size);
  const ls = (l.ls || 0) * l.size;
  const lines = veWrap(g, text || " ", l.maxW || 900, ls);
  const lh = l.size * (l.lh || 1.15);
  let w = 0;
  for (const s of lines) w = Math.max(w, veMeasure(g, s, ls));
  const pad = l.box && l.box.on ? l.box.pad || 0 : 0;
  return { lines, lh, w: Math.max(10, w) + pad * 2, h: lines.length * lh + pad * 2, tw: w, ls, pad };
}
function veFillStyle(g, l, x0, y0, x1, y1) {
  if (l.grad && l.grad.on) {
    const a = (l.grad.angle || 0) * Math.PI / 180, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rr = Math.hypot(x1 - x0, y1 - y0) / 2;
    const gr = g.createLinearGradient(cx - Math.cos(a) * rr, cy - Math.sin(a) * rr, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    gr.addColorStop(0, l.grad.c1 || l.color);
    gr.addColorStop(1, l.grad.c2 || "#f472b6");
    return gr;
  }
  return l.color;
}
function veDrawLine(g, s, x, y, ls) {
  if (!ls) { g.fillText(s, x, y); return; }
  const chars = [...s];
  const full = veMeasure(g, s, ls);
  let cx = g.textAlign === "center" ? x - full / 2 : g.textAlign === "right" ? x - full : x;
  const al = g.textAlign;
  g.textAlign = "left";
  for (const c of chars) { g.fillText(c, cx, y); cx += g.measureText(c).width + ls; }
  g.textAlign = al;
}
function veStrokeLine(g, s, x, y, ls) {
  if (!ls) { g.strokeText(s, x, y); return; }
  const full = veMeasure(g, s, ls);
  let cx = g.textAlign === "center" ? x - full / 2 : g.textAlign === "right" ? x - full : x;
  const al = g.textAlign;
  g.textAlign = "left";
  for (const c of [...s]) { g.strokeText(c, cx, y); cx += g.measureText(c).width + ls; }
  g.textAlign = al;
}
function veBox(g, l, x, y, w, h) {
  if (!(l.box && l.box.on)) return;
  g.save();
  g.globalAlpha *= l.box.a ?? 0.6;
  g.fillStyle = l.box.c || "#000";
  vsRR(g, x, y, w, h, Math.min(l.box.r || 0, h / 2));
  g.fill();
  g.restore();
}
function veShadow(g, sh, u) {
  if (sh && sh.on) {
    g.shadowColor = vsAlpha(sh.c || "#000000", sh.a ?? 0.5);
    g.shadowBlur = (sh.blur || 0) * u;
    g.shadowOffsetX = (sh.x || 0) * u;
    g.shadowOffsetY = (sh.y || 0) * u;
  }
}
function veNoShadow(g) { g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; }
function veDrawTextBlock(g, l, m, u, reveal, colorFn) {
  const w = m.w, h = m.h, x0 = -w / 2, y0 = -h / 2;
  const ax = l.align === "left" ? x0 + m.pad : l.align === "right" ? -x0 - m.pad : 0;
  g.textAlign = l.align || "center";
  g.textBaseline = "alphabetic";
  g.font = veFontCss(l, l.size);
  if (l.box && l.box.on && l.box.mode !== "line") veBox(g, l, x0, y0, w, h);
  let shown = reveal == null ? Infinity : reveal;
  m.lines.forEach((s, i) => {
    const y = y0 + m.pad + m.lh * i + m.lh * 0.5 + l.size * 0.36;
    let txt = s;
    if (shown !== Infinity) { const ch = [...s]; txt = ch.slice(0, Math.max(0, shown)).join(""); shown -= ch.length; }
    if (!txt) return;
    if (l.box && l.box.on && l.box.mode === "line") {
      const lw = veMeasure(g, s, m.ls) + m.pad * 2, lx = l.align === "left" ? x0 : l.align === "right" ? -x0 - lw : -lw / 2;
      veBox(g, l, lx, y - l.size * 0.36 - m.lh / 2, lw, m.lh);
    }
    g.save();
    veShadow(g, l.shadow, 1);
    if (l.stroke && l.stroke.w > 0) {
      g.lineJoin = "round";
      g.miterLimit = 2;
      g.lineWidth = l.stroke.w * 2;
      g.strokeStyle = l.stroke.c;
      veStrokeLine(g, txt, ax, y, m.ls);
      veNoShadow(g);
    }
    g.fillStyle = colorFn ? colorFn(i, txt) : veFillStyle(g, l, x0, y0, -x0, -y0);
    veDrawLine(g, txt, ax, y, m.ls);
    g.restore();
  });
}
function veLyricsLines(l) {
  if (l.lines && l.lines.length) return l.lines;
  return vsPhrases().map((p) => ({ b0: p.start, b1: p.end, text: p.text }));
}
function veLyricsAt(l, beat) {
  const L = veLyricsLines(l);
  let cur = -1;
  for (let i = 0; i < L.length; i++) if (beat >= L[i].b0 - 0.05 && beat < L[i].b1) cur = i;
  return { L, cur };
}
function veLyricsLayout(g, l, fr, t) {
  const beat = fr ? fr.beat : veTToBeat(t);
  const { L, cur } = veLyricsAt(l, beat);
  if (cur < 0) return null;
  const ln = L[cur];
  const text = l.upper ? ln.text.toLocaleUpperCase() : ln.text;
  const m = veTextLayout(g, l, text);
  if (l.mode === "two" && L[cur + 1] && L[cur + 1].b0 - ln.b1 < 2 / period() * 4) {
    const nx = l.upper ? L[cur + 1].text.toLocaleUpperCase() : L[cur + 1].text;
    const m2 = veTextLayout(g, l, nx);
    m.next = m2;
    m.h += m2.h - m2.pad * 2 + l.size * 0.2;
    m.w = Math.max(m.w, m2.w);
  }
  m.cur = cur;
  m.line = ln;
  return m;
}
function veDrawLyrics(g, l, fr, u, t, alphaIn) {
  const m = veLyricsLayout(g, l, fr, t);
  if (!m) return;
  const ln = m.line, beat = fr.beat;
  const a = Math.min(1, (beat - ln.b0 + 0.05) * period() / Math.max(0.01, l.anim.inDur || 0.01), (ln.b1 - beat) * period() / Math.max(0.01, l.anim.outDur || 0.01));
  const anim = l.anim.in || "fade";
  g.save();
  const e = veEase(veClamp(a, 0, 1));
  if (anim !== "none") {
    g.globalAlpha *= e;
    if (anim === "slideUp") g.translate(0, (1 - e) * 40);
    if (anim === "zoom" || anim === "pop") { const s = anim === "pop" ? 0.7 + 0.3 * e + Math.sin(e * Math.PI) * 0.08 : 0.8 + 0.2 * e; g.scale(s, s); }
  }
  const prog = veClamp((beat - ln.b0) / Math.max(1e-6, ln.b1 - ln.b0 - 0.4 / period()), 0, 1);
  const main = { ...m, h: m.next ? m.h - (m.next.h - m.next.pad * 2 + l.size * 0.2) : m.h };
  g.translate(0, -(m.h - main.h) / 2);
  if (l.mode === "word") {
    const words = (l.upper ? ln.text.toLocaleUpperCase() : ln.text).split(/\s+/).filter(Boolean);
    const k = Math.max(1, Math.ceil(prog * words.length + 0.001));
    const part = words.slice(0, k).join(" ");
    const mm = veTextLayout(g, l, part);
    veDrawTextBlock(g, l, mm, u);
  } else if (l.mode === "karaoke" || l.mode === "two") {
    const total = main.lines.reduce((s, x) => s + [...x].length, 0), lit = prog * total;
    let acc = 0;
    veDrawTextBlock(g, l, main, u, null, () => vsAlpha(l.color, 1));
    g.save();
    const x0 = -main.w / 2, y0 = -main.h / 2;
    g.beginPath();
    main.lines.forEach((s, i) => {
      const n = [...s].length, from = acc, to = acc + n;
      acc = to;
      if (lit <= from) return;
      g.font = veFontCss(l, l.size);
      const full = veMeasure(g, s, main.ls), frac = veClamp((lit - from) / Math.max(1, n), 0, 1);
      const lx = l.align === "left" ? x0 + main.pad : l.align === "right" ? -x0 - main.pad - full : -full / 2;
      g.rect(lx - 4, y0 + main.pad + main.lh * i, full * frac + 4, main.lh);
    });
    g.clip();
    const hl = Object.assign({}, l, { color: l.hl || "#ffb547", grad: null, box: { on: false }, stroke: l.stroke, shadow: { on: false } });
    veDrawTextBlock(g, hl, Object.assign({}, main), u);
    g.restore();
  } else {
    veDrawTextBlock(g, l, main, u);
  }
  if (m.next) {
    g.save();
    g.globalAlpha *= l.dim ?? 0.45;
    g.translate(0, main.h / 2 + l.size * 0.2 + (m.next.h - m.next.pad * 2) / 2);
    veDrawTextBlock(g, Object.assign({}, l, { box: { on: false } }), Object.assign({}, m.next, { pad: 0, h: m.next.h - m.next.pad * 2 }), u);
    g.restore();
  }
  g.restore();
}
function veDrawImage(g, l, t, w, h, fr) {
  const m = veMedia(l.media);
  const src = veMediaFrame(m, t - veT0(l), l);
  if (!src && VS.busy) return;
  g.save();
  if (l.shadow && l.shadow.on) {
    g.save();
    veShadow(g, l.shadow, 1);
    g.fillStyle = "#000";
    vePath(g, l, w, h);
    g.fill();
    g.restore();
  }
  vePath(g, l, w, h);
  g.clip();
  if (!src) {
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.font = vsFont(600, 28);
    g.textAlign = "center";
    g.fillText(tr(l.media === "@cover" ? "Немає обкладинки" : m && m.err ? "Файл не знайдено" : "Завантаження…"), 0, 0);
    if (l.media === "@cover") { g.font = vsFont(500, 22); g.fillText(tr("Додайте її у вкладці «Медіа»"), 0, 34); }
  } else {
    const f = l.f || {};
    const flt = [];
    if ((f.b ?? 100) !== 100) flt.push(`brightness(${f.b}%)`);
    if ((f.c ?? 100) !== 100) flt.push(`contrast(${f.c}%)`);
    if ((f.s ?? 100) !== 100) flt.push(`saturate(${f.s}%)`);
    if (f.hue) flt.push(`hue-rotate(${f.hue}deg)`);
    if (f.blur) flt.push(`blur(${f.blur}px)`);
    if (f.gray) flt.push(`grayscale(${f.gray}%)`);
    if (flt.length) g.filter = flt.join(" ");
    const sw = m.w, sh = m.h, cover = Math.max(w / sw, h / sh);
    let k = cover;
    if (l.kb) k *= 1 + l.kb * 0.15 * veClamp((t - veT0(l)) / Math.max(0.1, veT1(l) - veT0(l)), 0, 1);
    g.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
    g.drawImage(src, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
    g.filter = "none";
  }
  g.restore();
  if (l.border && l.border.w > 0) {
    g.save();
    g.lineWidth = l.border.w;
    g.strokeStyle = l.border.c;
    vePath(g, l, w - l.border.w, h - l.border.w);
    g.stroke();
    g.restore();
  }
}
function vePath(g, l, w, h) {
  g.beginPath();
  if (l.mask === "circle") g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else vsRR(g, -w / 2, -h / 2, w, h, Math.min(l.radius || 0, Math.min(w, h) / 2));
}
function veDrawShape(g, l) {
  const w = l.w, h = l.h;
  g.save();
  g.beginPath();
  if (l.shape === "circle") g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (l.shape === "line") { g.rect(-w / 2, -Math.max(2, h) / 2, w, Math.max(2, h)); }
  else if (l.shape === "triangle") { g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); }
  else if (l.shape === "star") {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.42 : 1; g.lineTo(Math.cos(a) * w / 2 * rr, Math.sin(a) * h / 2 * rr); }
    g.closePath();
  } else if (l.shape === "heart") {
    g.moveTo(0, h * 0.3);
    g.bezierCurveTo(-w * 0.6, -h * 0.15, -w * 0.25, -h * 0.65, 0, -h * 0.25);
    g.bezierCurveTo(w * 0.25, -h * 0.65, w * 0.6, -h * 0.15, 0, h * 0.3);
    g.closePath();
  } else vsRR(g, -w / 2, -h / 2, w, h, Math.min(l.radius || 0, Math.min(w, h) / 2));
  if (l.fa > 0) {
    g.globalAlpha *= l.fa ?? 1;
    g.fillStyle = veFillStyle(g, { grad: l.grad, color: l.fill }, -w / 2, -h / 2, w / 2, h / 2);
    g.fill();
    g.globalAlpha /= l.fa || 1;
  }
  if (l.stroke && l.stroke.w > 0) { g.lineWidth = l.stroke.w; g.strokeStyle = l.stroke.c; g.stroke(); }
  g.restore();
}
function veDrawViz(g, l, fr, given) {
  const n = Math.max(8, Math.min(128, l.bands | 0));
  const sp = given || vsSpectrum(fr, n);
  const w = l.w, h = l.h, sens = l.sens || 1;
  const col = (i) => {
    if (!l.color2 || l.color2 === l.color) return l.color;
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, l.color);
    gr.addColorStop(1, l.color2);
    return gr;
  };
  g.save();
  g.fillStyle = col();
  g.strokeStyle = col();
  if (l.kind === "circle") {
    const R = Math.min(w, h) * 0.28, L = Math.min(w, h) * 0.22;
    g.lineCap = l.round ? "round" : "butt";
    g.lineWidth = Math.max(2, (2 * Math.PI * R / n) * (1 - (l.gap ?? 0.35)));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i / n * Math.PI * 2, v = Math.min(1, sp[i] * sens);
      g.beginPath();
      g.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      g.lineTo(Math.cos(a) * (R + 4 + v * L), Math.sin(a) * (R + 4 + v * L));
      g.stroke();
    }
  } else if (l.kind === "wave" || l.kind === "line") {
    g.lineWidth = Math.max(2, h * 0.03);
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const v = Math.min(1, sp[Math.min(n - 1, i)] * sens), x = -w / 2 + i / n * w;
      const y = l.kind === "wave" ? Math.sin(i * 0.9 + fr.beat * 3) * v * h / 2 : -v * h / 2 + h / 2;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    if (l.mirror && l.kind === "wave") {
      g.globalAlpha *= 0.5;
      g.beginPath();
      for (let i = 0; i <= n; i++) { const v = Math.min(1, sp[Math.min(n - 1, i)] * sens), x = -w / 2 + i / n * w, y = -Math.sin(i * 0.9 + fr.beat * 3) * v * h / 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  } else if (l.kind === "dots") {
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, sp[i] * sens), k = Math.round(v * 8);
      for (let j = 0; j < k; j++) {
        g.beginPath();
        g.arc(-w / 2 + cw * (i + 0.5), h / 2 - (j + 0.5) * (h / 8), Math.min(cw, h / 8) * (1 - (l.gap ?? 0.35)) / 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    const cw = w / n, bw = cw * (1 - (l.gap ?? 0.35)), mirror = l.kind === "mirror" || l.mirror;
    for (let i = 0; i < n; i++) {
      const v = Math.max(0.02, Math.min(1, sp[i] * sens)), bh = mirror ? v * h : v * h;
      const x = -w / 2 + cw * i + (cw - bw) / 2, y = mirror ? -bh / 2 : h / 2 - bh;
      vsRR(g, x, y, bw, bh, l.round ? Math.min(bw / 2, bh / 2) : 0);
      g.fill();
    }
  }
  g.restore();
}
function veDrawProgress(g, l, t) {
  const d = veDur(), k = veClamp(t / d, 0, 1), w = l.w, h = l.h;
  const top = l.time ? -(h + 60) / 2 + 50 : -h / 2;
  g.save();
  if (l.style === "dots") {
    const n = 24, cw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i / n <= k ? l.color : vsAlpha(l.track, l.ta ?? 0.15);
      g.beginPath();
      g.arc(-w / 2 + cw * (i + 0.5), top + h / 2, Math.max(2, h / 2), 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.fillStyle = vsAlpha(l.track, l.ta ?? 0.15);
    vsRR(g, -w / 2, top, w, h, Math.min(l.radius, h / 2));
    g.fill();
    g.fillStyle = l.color;
    vsRR(g, -w / 2, top, Math.max(h, w * k), h, Math.min(l.radius, h / 2));
    g.fill();
    if (l.style === "knob") {
      g.beginPath();
      g.arc(-w / 2 + w * k, top + h / 2, h * 1.3, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
    }
  }
  if (l.time) {
    g.font = vsFont(600, 26);
    g.fillStyle = vsAlpha(l.track, 0.75);
    g.textAlign = "left";
    g.fillText(vsFmtTime(Math.min(t, d)), -w / 2, top - 16);
    g.textAlign = "right";
    g.fillText(vsFmtTime(d), w / 2, top - 16);
  }
  g.restore();
}
const VE_IN = { none: "Без анімації", fade: "Поява", slideUp: "Знизу", slideDown: "Згори", slideLeft: "Справа", slideRight: "Зліва", zoom: "Наближення", pop: "Пружина", blur: "З розмиття", spin: "Оберт", typewriter: "Друкарська машинка", wipe: "Шторка" };
const VE_OUT = { none: "Без анімації", fade: "Зникнення", slideUp: "Вгору", slideDown: "Вниз", slideLeft: "Вліво", slideRight: "Вправо", zoom: "Віддалення", blur: "У розмиття", spin: "Оберт" };
const VE_LOOP = { none: "Немає", pulse: "Пульс у долю", beat: "Під гучність", float: "Плавання", shake: "Тремтіння", spin: "Обертання", flicker: "Мерехтіння", glow: "Сяйво" };
function veAnimState(l, t, fr) {
  const st = { dx: 0, dy: 0, s: 1, r: 0, a: 1, blur: 0, reveal: null, wipe: null, glow: 0 };
  const A = l.anim || {};
  const editing = !S.playing && !VS.busy && VE.sel === l.id;
  if (l.type !== "lyrics" && !editing) {
    const t0 = veT0(l), t1 = veT1(l);
    const ki = A.in && A.in !== "none" ? veClamp((t - t0) / Math.max(0.01, A.inDur || 0.4), 0, 1) : 1;
    const ko = A.out && A.out !== "none" ? veClamp((t1 - t) / Math.max(0.01, A.outDur || 0.3), 0, 1) : 1;
    const ap = (kind, k, dir) => {
      if (k >= 1) return;
      const e = veEase(k), inv = 1 - e, D = 120;
      if (kind === "fade") st.a *= e;
      else if (kind === "slideUp") { st.dy += dir * inv * D; st.a *= e; }
      else if (kind === "slideDown") { st.dy -= dir * inv * D; st.a *= e; }
      else if (kind === "slideLeft") { st.dx += dir * inv * D * 1.6; st.a *= e; }
      else if (kind === "slideRight") { st.dx -= dir * inv * D * 1.6; st.a *= e; }
      else if (kind === "zoom") { st.s *= dir > 0 ? 0.6 + 0.4 * e : 1 + 0.4 * inv; st.a *= e; }
      else if (kind === "pop") { const o = k < 1 ? Math.sin(k * Math.PI) * 0.12 : 0; st.s *= 0.5 + 0.5 * e + o; st.a *= Math.min(1, k * 3); }
      else if (kind === "blur") { st.blur += inv * 24; st.a *= e; }
      else if (kind === "spin") { st.r += inv * (dir > 0 ? -180 : 180); st.s *= 0.6 + 0.4 * e; st.a *= e; }
      else if (kind === "typewriter") { st.reveal = k; }
      else if (kind === "wipe") { st.wipe = e; }
    };
    ap(A.in, ki, 1);
    if (A.out === "slideUp") ap("slideDown", ko, -1);
    else if (A.out === "slideDown") ap("slideUp", ko, -1);
    else if (A.out === "slideLeft") ap("slideRight", ko, -1);
    else if (A.out === "slideRight") ap("slideLeft", ko, -1);
    else ap(A.out, ko, -1);
  }
  const amt = A.loopAmt ?? 0.5;
  if (A.loop && A.loop !== "none" && fr) {
    const bf = fr.beat - Math.floor(fr.beat);
    if (A.loop === "pulse") st.s *= 1 + 0.12 * amt * Math.exp(-bf * 6);
    else if (A.loop === "beat") st.s *= 1 + 0.25 * amt * VE.lvl;
    else if (A.loop === "float") st.dy += Math.sin(t * 2.2) * 24 * amt;
    else if (A.loop === "shake") { st.dx += Math.sin(t * 47) * 10 * amt * (0.4 + VE.lvl); st.dy += Math.cos(t * 39) * 8 * amt * (0.4 + VE.lvl); }
    else if (A.loop === "spin") st.r += t * 60 * amt;
    else if (A.loop === "flicker") st.a *= 1 - amt * 0.6 * (Math.sin(t * 31) * Math.sin(t * 7.3) > 0.4 ? 1 : 0);
    else if (A.loop === "glow") st.glow = (0.4 + 0.6 * Math.exp(-bf * 5)) * amt;
  }
  return st;
}
function veSceneCanvas(W, H) {
  let c = VE.scene;
  if (!c || c.width !== W || c.height !== H) {
    c = VE.scene = document.createElement("canvas");
    c.width = W;
    c.height = H;
    VE.sceneG = c.getContext("2d");
  }
  return c;
}
function veDrawBg(g, W, H, fr, u) {
  const bg = VE.doc.bg || { kind: "scene" };
  if (bg.kind === "color") { g.fillStyle = bg.c1 || "#0b0c10"; g.fillRect(0, 0, W, H); return; }
  if (bg.kind === "gradient") {
    const a = (bg.angle ?? 135) * Math.PI / 180, rr = Math.hypot(W, H) / 2;
    const gr = g.createLinearGradient(W / 2 - Math.cos(a) * rr, H / 2 - Math.sin(a) * rr, W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr);
    gr.addColorStop(0, bg.c1 || "#1b1030");
    gr.addColorStop(1, bg.c2 || "#05060a");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    return;
  }
  if (bg.kind === "image" || bg.kind === "blur") {
    g.fillStyle = "#07080b";
    g.fillRect(0, 0, W, H);
    const m = veMedia(bg.media || "@cover"), t = veBeatToT(fr.beat);
    const src = veMediaFrame(m, t, {});
    if (src) {
      const k = Math.max(W / m.w, H / m.h) * (bg.kind === "blur" ? 1.15 : 1) * (1 + (bg.zoom || 0) * 0.1 * Math.sin(t * 0.25));
      g.save();
      const fl = [];
      if (bg.kind === "blur") fl.push(`blur(${Math.round((bg.blur ?? 40) * u)}px)`);
      fl.push(`brightness(${bg.dim != null ? 100 - bg.dim : bg.kind === "blur" ? 55 : 85}%)`);
      g.filter = fl.join(" ");
      g.drawImage(src, (W - m.w * k) / 2, (H - m.h * k) / 2, m.w * k, m.h * k);
      g.restore();
    }
    return;
  }
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
}
function veDrawLayer(g, l, W, H, fr, u, t, opts) {
  const tr = veTransform(l, t, opts && opts.fmt);
  const st = veAnimState(l, t, fr);
  const alpha = (l.opacity ?? 1) * (tr.o ?? 1) * st.a;
  if (alpha <= 0.002) return;
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = l.blend || "source-over";
  g.translate(tr.x * W + st.dx * u, tr.y * H + st.dy * u);
  g.rotate((tr.r + st.r) * Math.PI / 180);
  const sc = tr.s * st.s;
  if (l.type === "scene") {
    g.scale(sc, sc);
    const c = veSceneCanvas(W, H), sg = VE.sceneG;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, W, H);
    VS.bare = true;
    VS.noBg = !!l.noBg;
    I18N.raw = false;
    try { vsDrawBase(sg, W, H, fr); } finally { VS.bare = false; VS.noBg = false; I18N.raw = true; }
    if (st.blur) g.filter = `blur(${st.blur * u}px)`;
    g.drawImage(c, -W / 2, -H / 2);
    g.restore();
    return;
  }
  g.scale(u * sc, u * sc);
  if (st.blur) g.filter = `blur(${st.blur}px)`;
  if (st.glow) { g.shadowColor = l.color || l.fill || "#ffffff"; g.shadowBlur = 40 * st.glow; }
  const [iw, ih] = veLayerSize(g, l, W, H, u, fr, t);
  if (st.wipe != null) { g.beginPath(); g.rect(-iw / 2 - 20, -ih / 2 - 20, (iw + 40) * st.wipe, ih + 40); g.clip(); }
  if (l.type === "text" || l.type === "timer") {
    const m = veTextLayout(g, l, veTextOf(l, fr, t));
    const total = m.lines.reduce((s, x) => s + [...x].length, 0);
    veDrawTextBlock(g, l, m, u, st.reveal != null ? Math.floor(st.reveal * total) : null);
  } else if (l.type === "lyrics") veDrawLyrics(g, l, fr, u, t);
  else if (l.type === "image" || l.type === "video") veDrawImage(g, l, t, iw, ih, fr);
  else if (l.type === "shape") veDrawShape(g, l);
  else if (l.type === "viz") veDrawViz(g, l, fr);
  else if (l.type === "progress") veDrawProgress(g, l, t);
  else if (l.type === "wm") { I18N.raw = false; vsWatermark(g, -165, 12, 1); I18N.raw = true; }
  g.restore();
}
function veDraw(g, W, H, fr, opts) {
  const u = Math.min(W, H) / 1080, t = (fr.beat - fr.r0) * period();
  let lvl = 0;
  for (const tk of tracksAll()) lvl = Math.max(lvl, vsLevelAt(tk, fr.beat));
  VE.lvl = VE.lvl * 0.6 + lvl * 0.4;
  g.save();
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  veDrawBg(g, W, H, fr, u);
  I18N.raw = true;
  try {
    for (const l of VE.doc.layers) {
      if (!veVisible(l, t)) continue;
      if (opts && opts.skip === l.id) continue;
      veDrawLayer(g, l, W, H, fr, u, t, opts);
    }
  } finally { I18N.raw = false; }
  g.restore();
}
function veLayerBox(l, W, H, t) {
  const g = VS.g, u = Math.min(W, H) / 1080, fr = { beat: veTToBeat(t), r0: vsRange()[0], r1: vsRange()[1] };
  const tr = veTransform(l, t);
  g.save();
  I18N.raw = true;
  let iw, ih;
  try { [iw, ih] = veLayerSize(g, l, W, H, u, fr, t); } finally { I18N.raw = false; }
  g.restore();
  const k = l.type === "scene" ? tr.s : u * tr.s;
  return { cx: tr.x * W, cy: tr.y * H, w: iw * k, h: ih * k, r: tr.r, iw, ih, k };
}
function veRedraw() {
  VE.dirtyDraw = true;
}
