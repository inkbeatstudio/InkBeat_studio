"use strict";
const VFMT = {
  tiktok: { w: 1080, h: 1920, name: "TikTok · Reels · Shorts", tag: "9:16", file: "TikTok 9x16" },
  youtube: { w: 1920, h: 1080, name: "YouTube", tag: "16:9", file: "YouTube 16x9" },
  square: { w: 1080, h: 1080, name: "Instagram", tag: "1:1", file: "Instagram 1x1" }
};
const VSTYLES = {
  studio: ["Студія", "Доріжки, ноти й хвилі, як у програмі"],
  notes: ["Ноти", "Ноти падають на клавіатуру"],
  wave: ["Візуалізатор", "Коло спектра, акорд і доріжки"],
  cover: ["Обкладинка", "Обкладинка, назва і хвиля треку"],
  screen: ["Екран", "Запис самої програми"]
};
const VACCENTS = ["#ffb547", "#4fd1c5", "#f472b6", "#a78bfa", "#60a5fa", "#ff5d6c", "#e9ebf1"];
const VS = {
  fmt: "tiktok", all: false, style: "studio", q: 1080, fps: 30, hq: true, wm: true, mic: false, accent: "#ffb547", bg: "dark",
  safe: true, guides: true, intro: true, lyrics: false, fadeIn: true, fadeOut: true, artist: "",
  title: "", cta: "", r0: 0, r1: 0, pid: null, scrub: null,
  busy: false, stop: false, raf: 0, canvas: null, g: null, an: null, fbuf: null, screen: null,
  cover: null, mixBuf: null, mixKey: "", mixJob: 0, wave: null, spec: null, bgCache: null, phr: null, ovEnv: null
};
const VPREF = ["fmt", "all", "style", "q", "fps", "hq", "wm", "mic", "accent", "bg", "safe", "guides", "intro", "lyrics", "fadeIn", "fadeOut", "artist"];
function vsLoad() {
  try {
    const g = JSON.parse(localStorage.getItem("inkbeat.video") || "{}");
    for (const k of VPREF) if (k in g) VS[k] = g[k];
    const p = JSON.parse(localStorage.getItem("inkbeat.video." + S.pid) || "{}");
    VS.title = p.title || S.B.project.title;
    VS.cta = p.cta || "";
    VS.r0 = typeof p.r0 === "number" ? p.r0 : null;
    VS.r1 = typeof p.r1 === "number" ? p.r1 : null;
  } catch (e) {
    VS.title = S.B.project.title;
  }
  if (!VSTYLES[VS.style]) VS.style = "studio";
  if (!VFMT[VS.fmt]) VS.fmt = "tiktok";
}
function vsSave() {
  try {
    const g = {};
    for (const k of VPREF) g[k] = VS[k];
    localStorage.setItem("inkbeat.video", JSON.stringify(g));
    localStorage.setItem("inkbeat.video." + S.pid, JSON.stringify({ title: VS.title, cta: VS.cta, r0: VS.r0, r1: VS.r1 }));
  } catch (e) {
  }
}
const vsEnd = () => Math.max(arrEnd(), 1);
function vsSize(key = VS.fmt) {
  const f = VFMT[key], k = VS.q === 720 ? 720 / 1080 : 1;
  return [Math.round(f.w * k / 2) * 2, Math.round(f.h * k / 2) * 2];
}
function vsFirst() {
  let first = vsEnd();
  for (const t of tracksAll()) for (const c of mt(t.id).clips) if (!c.mute) first = Math.min(first, c.start);
  return Math.max(0, Math.min(first, vsEnd() - 1));
}
function vsRange() {
  const end = vsEnd();
  if (VS.r0 == null || VS.r1 == null || VS.r1 <= VS.r0) { VS.r0 = vsFirst(); VS.r1 = end; }
  VS.r0 = Math.max(0, Math.min(VS.r0, end - 0.25));
  VS.r1 = Math.max(VS.r0 + 0.25, Math.min(VS.r1, end));
  return [VS.r0, VS.r1];
}
function vsFmtTime(s, dec) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return dec ? `${m}:${r.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(r)).padStart(2, "0")}`;
}
function vsParseTime(v) {
  v = String(v || "").trim().replace(",", ".");
  if (!v) return null;
  const p = v.split(":").map(Number);
  if (p.some((x) => !isFinite(x) || x < 0)) return null;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
}
function vsRR(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function vsAlpha(hex, a) {
  const h = (hex || "#888888").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const vsFont = (w, px) => `${w} ${px}px Inter, "Segoe UI", sans-serif`;
function vsFit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 2 && g.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
function vsInsets(W, H) {
  const u = Math.min(W, H) / 1080;
  if (H > W && VS.safe) return { t: 150 * u, r: 140 * u, b: 360 * u, l: 56 * u, u };
  return { t: 56 * u, r: 60 * u, b: 56 * u, l: 60 * u, u };
}
function vsLevelAt(t, b) {
  const m = mt(t.id);
  if (!m || m.mute) return 0;
  let lv = 0;
  const P = period(), mode = modeOf(t);
  if (t.has_audio && mode !== "midi") {
    const pk = S.audio && S.audio.peaks ? S.audio.peaks[srcKey(t)] : null;
    if (pk) {
      for (const c of m.clips) {
        if (c.mute) continue;
        if (b >= c.start && b < c.start + c.dur / P) {
          const i = Math.floor((c.src + (b - c.start) * P) * 200);
          let v = 0;
          for (let k = i - 4; k <= i + 4; k++) if (k >= 0 && k < pk.length) v = Math.max(v, pk[k]);
          lv = Math.min(1, v * 1.7);
          break;
        }
      }
    }
  }
  if (mode !== "audio" || !t.has_audio) {
    const ns = arranged(t);
    for (let i = lowerBound(ns, b - 8); i < ns.length && ns[i][0] <= b; i++) {
      const n = ns[i], dt = b - n[0];
      if (dt <= n[1] + 0.3) lv = Math.max(lv, (n[3] / 127) * Math.exp(-dt * 1.4));
    }
  }
  return lv;
}
function vsFFT(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
const VS_WIN = (() => {
  const w = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 2047);
  return w;
})();
function vsBands(n, sr, size, mag) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f0 = 40 * Math.pow(14000 / 40, i / n), f1 = 40 * Math.pow(14000 / 40, (i + 1) / n);
    const a = Math.max(1, Math.floor(f0 / sr * size)), b = Math.max(a + 1, Math.ceil(f1 / sr * size));
    let m = 0;
    for (let k = a; k < b && k < size / 2; k++) m = Math.max(m, mag(k));
    out[i] = m;
  }
  return out;
}
function vsSpecFromBuf(beat, n) {
  const buf = VS.mixBuf;
  if (!buf) return null;
  const sr = buf.sampleRate, c = Math.floor((beat - buf.r0) * period() * sr) - 1024;
  if (c < -1024 || c > buf.length) return null;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const re = new Float32Array(2048), im = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) {
    const k = c + i;
    re[i] = k >= 0 && k < buf.length ? (L[k] + R[k]) * 0.5 * VS_WIN[i] : 0;
  }
  vsFFT(re, im);
  const out = vsBands(n, sr, 2048, (k) => Math.hypot(re[k], im[k]));
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(1, (20 * Math.log10(out[i] / 256 + 1e-9) + 62) / 56));
  return out;
}
function vsSpectrum(fr, n) {
  let out = null;
  if (fr.live && VS.an) {
    if (!VS.fbuf || VS.fbuf.length !== VS.an.frequencyBinCount) VS.fbuf = new Uint8Array(VS.an.frequencyBinCount);
    VS.an.getByteFrequencyData(VS.fbuf);
    out = vsBands(n, VS.an.context.sampleRate, VS.an.fftSize, (k) => VS.fbuf[k] / 255);
  } else out = vsSpecFromBuf(fr.beat, n);
  if (!out) {
    out = new Float32Array(n);
    const t = fr.beat * 0.6;
    for (let i = 0; i < n; i++) out[i] = 0.1 + 0.07 * Math.sin(i * 0.35 + t * 1.6) * Math.sin(i * 0.11 + t * 0.7);
  }
  if (fr.smooth) {
    if (!VS.spec || VS.spec.length !== n) VS.spec = new Float32Array(n);
    for (let i = 0; i < n; i++) VS.spec[i] = out[i] > VS.spec[i] ? out[i] : VS.spec[i] * 0.82 + out[i] * 0.18;
    return VS.spec;
  }
  return out;
}
function vsInfo(beat) {
  const sec = secList().find((s) => beat >= s.start && beat < s.end);
  const ch = chordList().find((c) => beat >= c.start && beat < c.end && c.label !== "N");
  return { sec: sec ? (sec.name_ua || sec.name || sec.label || "") : "", ch: ch ? ch.label : "" };
}
function vsPhrases() {
  const lines = (S.mix && S.mix.lyrics || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(\[.*\]|\(.*\)|(куплет|приспів|бридж|інтро|аутро|програш|пре-?приспів|verse|chorus|bridge|intro|outro|hook|pre-?chorus)(\s*\d+)?\s*:?|.*:)$/iu.test(l));
  const key = lines.join("|") + "|" + (S.B._rev || "") + "|" + JSON.stringify((S.mix.clones || []).length);
  if (VS.phr && VS.phr.key === key) return VS.phr.list;
  const voc = tracksAll().find((t) => !mt(t.id).mute && (t.kind === "vocals" || /vocal|вокал|голос/i.test(t.name)));
  const list = [];
  if (voc && lines.length) {
    const groups = [];
    let cur = null;
    for (const n of arranged(voc)) {
      if (!cur || n[0] - cur.end > 0.9) { cur = { start: n[0], end: n[0] + n[1], ns: [] }; groups.push(cur); }
      cur.end = Math.max(cur.end, n[0] + n[1]);
      cur.ns.push(n);
    }
    const maxLen = S.B.timing.bpb * 2;
    const split = (gr) => {
      if (gr.end - gr.start <= maxLen || gr.ns.length < 4) return [gr];
      let best = -1, gap = 0, end = gr.ns[0][0] + gr.ns[0][1];
      for (let i = 1; i < gr.ns.length; i++) {
        const gp = gr.ns[i][0] - end, mid = gr.ns[i][0] - gr.start;
        if (gp > gap - 1e-6 && mid > 1 && gr.end - gr.ns[i][0] > 1) { gap = gp; best = i; }
        end = Math.max(end, gr.ns[i][0] + gr.ns[i][1]);
      }
      if (best < 0) return [gr];
      const a = gr.ns.slice(0, best), b = gr.ns.slice(best);
      const mk = (ns) => ({ start: ns[0][0], end: Math.max(...ns.map((n) => n[0] + n[1])), ns });
      return [...split(mk(a)), ...split(mk(b))];
    };
    const pieces = groups.flatMap(split);
    groups.length = 0;
    groups.push(...pieces);
    const merged = [];
    for (const p of groups) {
      const last = merged[merged.length - 1];
      if (last && p.end - last.start < 3) last.end = p.end;
      else merged.push(p);
    }
    merged.forEach((p, i) => { if (i < lines.length) list.push({ start: p.start, end: p.end + 0.6, text: lines[i] }); });
  }
  VS.phr = { key, list };
  return list;
}
function vsBg(g, W, H, beat) {
  const u = Math.min(W, H) / 1080;
  if (VS.bg === "cover" && VS.cover) {
    const k = W + "x" + H + VS.cover.src;
    if (!VS.bgCache || VS.bgCache.k !== k) {
      const c = document.createElement("canvas");
      c.width = Math.ceil(W / 4);
      c.height = Math.ceil(H / 4);
      const x = c.getContext("2d"), s = Math.max(c.width, c.height) / Math.min(VS.cover.width, VS.cover.height) * 1.15;
      x.filter = "blur(14px) brightness(0.42) saturate(1.2)";
      x.drawImage(VS.cover, (c.width - VS.cover.width * s) / 2, (c.height - VS.cover.height * s) / 2, VS.cover.width * s, VS.cover.height * s);
      VS.bgCache = { k, c };
    }
    g.drawImage(VS.bgCache.c, 0, 0, W, H);
    g.fillStyle = "rgba(8,9,12,0.35)";
    g.fillRect(0, 0, W, H);
    return;
  }
  g.fillStyle = "#0b0c10";
  g.fillRect(0, 0, W, H);
  const t = beat * 0.12, a1 = VS.bg === "accent" ? 0.32 : 0.14, a2 = VS.bg === "accent" ? 0.16 : 0.1;
  let gr = g.createRadialGradient(W * (0.2 + 0.06 * Math.sin(t)), H * 0.12, 0, W * 0.2, H * 0.12, 950 * u);
  gr.addColorStop(0, vsAlpha(VS.accent, a1));
  gr.addColorStop(1, vsAlpha(VS.accent, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W * 0.85, H * (0.9 + 0.03 * Math.cos(t)), 0, W * 0.85, H * 0.9, 1000 * u);
  gr.addColorStop(0, `rgba(79,209,197,${a2})`);
  gr.addColorStop(1, "rgba(79,209,197,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}
function vsLogo(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s / 32, s / 32);
  g.fillStyle = "#1b1e26";
  vsRR(g, 0, 0, 32, 32, 7);
  g.fill();
  g.fillStyle = "#ffb547";
  [[6, 12, 8], [11, 7, 18], [16, 10, 12]].forEach(([a, b, h]) => { vsRR(g, a, b, 3, h, 1.5); g.fill(); });
  g.fillStyle = "#4fd1c5";
  [[21, 9, 6], [21, 15, 4], [21, 21, 6]].forEach(([a, b, w]) => { vsRR(g, a, b, w, 3, 1); g.fill(); });
  g.restore();
}
function vsWatermark(g, x, y, u) {
  vsLogo(g, x, y - 2 * u, 38 * u);
  g.fillStyle = "#c9cdd8";
  g.font = vsFont(700, 21 * u);
  g.fillText("Зроблено в INKBEAT", x + 50 * u, y + 24 * u);
}
function vsCoverArt(g, x, y, s, lvl) {
  g.save();
  vsRR(g, x, y, s, s, s * 0.06);
  g.clip();
  if (VS.cover) g.drawImage(VS.cover, x, y, s, s);
  else {
    const gr = g.createLinearGradient(x, y, x + s, y + s);
    gr.addColorStop(0, vsAlpha(VS.accent, 0.95));
    gr.addColorStop(1, "#1b1e26");
    g.fillStyle = gr;
    g.fillRect(x, y, s, s);
    g.globalAlpha = 0.18;
    g.strokeStyle = "#fff";
    g.lineWidth = s * 0.012;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.arc(x + s * 0.78, y + s * 0.78, s * (0.12 + i * 0.09), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    vsLogo(g, x + s * 0.08, y + s * 0.08, s * 0.16);
    g.fillStyle = "#fff";
    g.font = vsFont(800, s * 0.11);
    const lines = [];
    let line = "";
    for (const w of (VS.title || S.B.project.title).split(/\s+/)) {
      if (line && g.measureText(line + " " + w).width > s * 0.8) { lines.push(line); line = w; } else line = line ? line + " " + w : w;
    }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => g.fillText(l, x + s * 0.08, y + s * 0.62 + i * s * 0.12));
  }
  g.restore();
  if (lvl > 0.05) {
    const lw = Math.max(2, s * 0.01 * (1 + lvl * 2));
    g.strokeStyle = vsAlpha(VS.accent, 0.25 + lvl * 0.5);
    g.lineWidth = lw;
    vsRR(g, x - lw, y - lw, s + lw * 2, s + lw * 2, s * 0.07);
    g.stroke();
  }
}
function vsHeader(g, W, H, beat, ins, compact) {
  const u = ins.u, vertical = H > W;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#eef0f5";
  g.font = vsFont(800, (vertical ? 70 : 60) * u);
  let ty = ins.t + (vertical ? 64 : 60) * u;
  g.fillText(vsFit(g, VS.title || S.B.project.title, W - ins.l - ins.r), ins.l, ty);
  if (VS.artist) {
    g.fillStyle = VS.accent;
    g.font = vsFont(600, (vertical ? 38 : 32) * u);
    ty += (vertical ? 56 : 48) * u;
    g.fillText(vsFit(g, VS.artist, W - ins.l - ins.r), ins.l, ty);
  }
  if (compact) return ty;
  const tm = S.B.timing, key = S.B.key, info = vsInfo(beat);
  const chips = [`${Math.round(tm.bpm)} BPM`, `${NOTE_NAMES[key.tonic]} ${key.mode === "minor" ? "мінор" : "мажор"}`];
  if (info.sec) chips.push(info.sec);
  g.font = vsFont(600, 25 * u);
  let cx = ins.l;
  ty += 30 * u;
  for (const [i, c] of chips.entries()) {
    const w = g.measureText(c).width + 34 * u;
    if (cx + w > W - ins.r) break;
    const hot = i === 2;
    g.fillStyle = hot ? vsAlpha(VS.accent, 0.18) : "rgba(255,255,255,0.07)";
    vsRR(g, cx, ty, w, 44 * u, 22 * u);
    g.fill();
    g.fillStyle = hot ? VS.accent : "#c9cdd8";
    g.fillText(c, cx + 17 * u, ty + 30 * u);
    cx += w + 10 * u;
  }
  return ty + 44 * u;
}
function vsFooter(g, W, H, fr, ins) {
  const u = ins.u, P = period();
  const y = H - ins.b - (VS.wm ? 64 : 10) * u;
  const k = Math.max(0, Math.min(1, (fr.beat - fr.r0) / Math.max(1e-6, fr.r1 - fr.r0)));
  g.fillStyle = "rgba(255,255,255,0.09)";
  vsRR(g, ins.l, y, W - ins.l - ins.r, 8 * u, 4 * u);
  g.fill();
  g.fillStyle = VS.accent;
  vsRR(g, ins.l, y, Math.max(8 * u, (W - ins.l - ins.r) * k), 8 * u, 4 * u);
  g.fill();
  g.font = vsFont(600, 23 * u);
  g.fillStyle = "#9aa0b0";
  g.fillText(vsFmtTime((fr.beat - fr.r0) * P), ins.l, y - 14 * u);
  g.textAlign = "right";
  g.fillText(vsFmtTime((fr.r1 - fr.r0) * P), W - ins.r, y - 14 * u);
  g.textAlign = "left";
  if (VS.wm) vsWatermark(g, ins.l, H - ins.b - 36 * u, u);
}
function vsLyrics(g, W, H, fr, ins, yCenter) {
  if (!VS.lyrics) return;
  const b = fr.beat, p = vsPhrases().filter((x) => b >= x.start - 0.25 && b < x.end).pop();
  if (!p) return;
  const u = ins.u, a = Math.min(1, (b - p.start + 0.25) / 0.35, (p.end - b) / 0.35);
  g.save();
  g.globalAlpha = Math.max(0, a);
  g.font = vsFont(800, (H > W ? 52 : 44) * u);
  const maxW = W - ins.l - ins.r - 40 * u, lines = [];
  let line = "";
  for (const w of p.text.split(/\s+/)) {
    if (line && g.measureText(line + " " + w).width > maxW) { lines.push(line); line = w; } else line = line ? line + " " + w : w;
  }
  lines.push(line);
  const lh = (H > W ? 64 : 54) * u;
  let y = yCenter - Math.min(3, lines.length) * lh / 2 + lh * 0.75;
  g.textAlign = "center";
  for (const l of lines.slice(0, 3)) {
    const w = g.measureText(l).width;
    g.fillStyle = "rgba(8,9,12,0.62)";
    vsRR(g, W / 2 - w / 2 - 22 * u, y - lh * 0.78, w + 44 * u, lh * 1.02, 14 * u);
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillText(l, W / 2, y);
    y += lh;
  }
  g.textAlign = "left";
  g.restore();
}
function vsOverlays(g, W, H, fr, ins) {
  const P = period(), t = (fr.beat - fr.r0) * P, dur = (fr.r1 - fr.r0) * P, u = ins.u;
  if (VS.intro && t < 2.4 && dur > 6) {
    const a = t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.7), s = 1 + 0.04 * Math.min(1, t / 2.4);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = "rgba(8,9,12,0.8)";
    g.fillRect(0, 0, W, H);
    g.textAlign = "center";
    g.translate(W / 2, H / 2);
    g.scale(s, s);
    g.fillStyle = "#ffffff";
    g.font = vsFont(800, (H > W ? 88 : 76) * u);
    g.fillText(vsFit(g, VS.title || S.B.project.title, W - 120 * u), 0, 0);
    if (VS.artist) {
      g.fillStyle = VS.accent;
      g.font = vsFont(600, (H > W ? 44 : 38) * u);
      g.fillText(VS.artist, 0, 70 * u);
    }
    g.fillStyle = VS.accent;
    g.fillRect(-60 * u, (VS.artist ? 108 : 46) * u, 120 * u * Math.min(1, t / 0.8), 5 * u);
    g.restore();
  }
  if (VS.cta && dur > 5 && t > dur - 3) {
    const a = Math.min(1, (t - (dur - 3)) / 0.5), dy = (1 - a) * 30 * u;
    g.save();
    g.globalAlpha = a;
    g.font = vsFont(800, (H > W ? 46 : 40) * u);
    const txt = vsFit(g, VS.cta, W - ins.l - ins.r - 60 * u), w = g.measureText(txt).width, y = H * 0.5;
    g.fillStyle = VS.accent;
    vsRR(g, W / 2 - w / 2 - 34 * u, y - 52 * u + dy, w + 68 * u, 84 * u, 42 * u);
    g.fill();
    g.fillStyle = "#14100a";
    g.textAlign = "center";
    g.fillText(txt, W / 2, y + 6 * u + dy);
    g.textAlign = "left";
    g.restore();
  }
}
function vsStudio(g, W, H, fr) {
  const beat = fr.beat;
  vsBg(g, W, H, beat);
  const ins = vsInsets(W, H), u = ins.u, P = period(), bpb = S.B.timing.bpb, vertical = H > W;
  const top = vsHeader(g, W, H, beat, ins) + 34 * u;
  const bottom = H - ins.b - (VS.wm ? 124 : 70) * u;
  const x0 = ins.l, x1 = W - ins.r, aw = x1 - x0;
  const bars = vertical ? 4 : W > H ? 8 : 6, ppb = aw / (bars * bpb), playX = x0 + aw * 0.32;
  const X = (b) => playX + (b - beat) * ppb;
  const rulerH = 88 * u;
  g.save();
  vsRR(g, x0, top, aw, bottom - top, 22 * u);
  g.clip();
  g.fillStyle = "rgba(18,20,27,0.86)";
  g.fillRect(x0, top, aw, bottom - top);
  const bLo = beat - (playX - x0) / ppb - 1, bHi = beat + (x1 - playX) / ppb + 1;
  for (const s of secList()) {
    if (s.end < bLo || s.start > bHi) continue;
    const a = X(s.start), b = X(s.end);
    g.fillStyle = vsAlpha(s.color || "#6b7280", 0.32);
    g.fillRect(a, top, b - a, 38 * u);
    g.fillStyle = "#eef0f5";
    g.font = vsFont(700, 21 * u);
    g.fillText(s.name_ua || s.name || "", Math.max(a, x0) + 12 * u, top + 27 * u);
  }
  g.font = vsFont(600, 20 * u);
  for (const c of chordList()) {
    if (c.end < bLo || c.start > bHi || c.label === "N") continue;
    g.fillStyle = beat >= c.start && beat < c.end ? VS.accent : "#8b91a3";
    g.fillText(c.label, X(c.start) + 8 * u, top + 68 * u);
  }
  for (let b = Math.floor(bLo); b < bHi; b++) {
    const bar = ((b % bpb) + bpb) % bpb === 0;
    g.fillStyle = bar ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.035)";
    g.fillRect(X(b), top + rulerH, Math.max(1, u * (bar ? 2 : 1)), bottom - top - rulerH);
  }
  const list = tracksAll().filter((t) => !mt(t.id).mute);
  const lh = Math.min(vertical ? 190 * u : 150 * u, (bottom - top - rulerH - 8 * u) / Math.max(1, list.length));
  let y = top + rulerH + 4 * u;
  for (const t of list) {
    const m = mt(t.id), col = t.color || "#888", lvl = vsLevelAt(t, beat);
    for (const c of m.clips) {
      if (c.mute) continue;
      const cb = c.start, ce = c.start + c.dur / P;
      if (ce < bLo || cb > bHi) continue;
      const a = X(cb), b = X(ce);
      g.fillStyle = vsAlpha(col, 0.15 + lvl * 0.14);
      vsRR(g, a, y + 3 * u, b - a, lh - 6 * u, 10 * u);
      g.fill();
      g.strokeStyle = vsAlpha(col, 0.55);
      g.lineWidth = 2 * u;
      g.stroke();
      const pk = t.has_audio && S.audio && S.audio.peaks ? S.audio.peaks[srcKey(t)] : null;
      if (pk && modeOf(t) !== "midi") {
        g.fillStyle = vsAlpha(col, 0.55);
        const mid = y + lh / 2, amp = (lh - 18 * u) / 2;
        for (let x = Math.max(a, x0); x < Math.min(b, x1); x += 3 * u) {
          const i = Math.floor((c.src + (beat + (x - playX) / ppb - cb) * P) * 200);
          const v = i >= 0 && i < pk.length ? pk[i] : 0;
          const h = Math.max(1, Math.min(1, v * 1.6) * amp);
          g.fillRect(x, mid - h, 2 * u, h * 2);
        }
      }
    }
    const ns = arranged(t);
    if (ns.length) {
      let lo = 127, hi = 0;
      for (const n of ns) { if (n[2] < lo) lo = n[2]; if (n[2] > hi) hi = n[2]; }
      const span = Math.max(12, hi - lo + 1), nh = Math.max(3 * u, (lh - 16 * u) / span);
      for (let i = lowerBound(ns, bLo - 16); i < ns.length && ns[i][0] <= bHi; i++) {
        const n = ns[i];
        if (n[0] + n[1] < bLo) continue;
        const ny = y + lh - 8 * u - (n[2] - lo + 1) * ((lh - 16 * u) / span);
        const on = beat >= n[0] && beat < n[0] + n[1];
        g.fillStyle = on ? "#ffffff" : vsAlpha(col, t.has_audio && modeOf(t) === "audio" ? 0.55 : 0.95);
        if (on) { g.shadowColor = col; g.shadowBlur = 18 * u; }
        vsRR(g, X(n[0]), ny, Math.max(3 * u, n[1] * ppb - 2 * u), nh, Math.min(3 * u, nh / 2));
        g.fill();
        g.shadowBlur = 0;
      }
    }
    g.font = vsFont(700, (vertical ? 25 : 21) * u);
    const nm = vsFit(g, t.name, aw * 0.6), tw = g.measureText(nm).width;
    g.fillStyle = "rgba(11,12,16,0.74)";
    vsRR(g, x0 + 12 * u, y + 10 * u, tw + 44 * u, 38 * u, 10 * u);
    g.fill();
    g.fillStyle = col;
    vsRR(g, x0 + 22 * u, y + 20 * u, 8 * u, 18 * u, 3 * u);
    g.fill();
    g.fillStyle = "#eef0f5";
    g.fillText(nm, x0 + 38 * u, y + 37 * u);
    if (lvl > 0.02) {
      g.fillStyle = vsAlpha(col, 0.9);
      g.fillRect(x0 + 12 * u, y + 52 * u, (tw + 44 * u) * lvl, 4 * u);
    }
    y += lh;
    if (y > bottom) break;
  }
  g.fillStyle = VS.accent;
  g.shadowColor = VS.accent;
  g.shadowBlur = 20 * u;
  g.fillRect(playX - 1.5 * u, top, 3 * u, bottom - top);
  g.shadowBlur = 0;
  g.restore();
  vsFooter(g, W, H, fr, ins);
  vsLyrics(g, W, H, fr, ins, bottom - (vertical ? 120 : 90) * u);
}
const VS_BLACK = [1, 3, 6, 8, 10];
function vsNotes(g, W, H, fr) {
  const beat = fr.beat;
  vsBg(g, W, H, beat);
  const ins = vsInsets(W, H), u = ins.u, bpb = S.B.timing.bpb, vertical = H >= W;
  const top = vsHeader(g, W, H, beat, ins, !vertical) + 28 * u;
  const bottom = H - ins.b - (VS.wm ? 124 : 70) * u;
  const look = vertical ? bpb * (H > W * 1.4 ? 4 : 2.5) : bpb * 3;
  const all = [];
  let lo = 127, hi = 0;
  for (const t of tracksAll()) {
    if (t.is_drums || mt(t.id).mute) continue;
    const ns = arranged(t);
    for (const n of ns) { if (n[2] < lo) lo = n[2]; if (n[2] > hi) hi = n[2]; }
    for (let i = lowerBound(ns, beat - 16); i < ns.length && ns[i][0] <= beat + look; i++) {
      const n = ns[i];
      if (n[0] + n[1] >= beat - 0.1) all.push([n[0], n[1], n[2], t]);
    }
  }
  if (lo > hi) { lo = 48; hi = 84; }
  lo = Math.max(21, lo - 2);
  hi = Math.min(108, hi + 2);
  while (VS_BLACK.includes(lo % 12)) lo--;
  while (VS_BLACK.includes(hi % 12)) hi++;
  const whites = [];
  for (let p = lo; p <= hi; p++) if (!VS_BLACK.includes(p % 12)) whites.push(p);
  const nW = whites.length, active = new Map();
  for (const n of all) if (beat >= n[0] && beat < n[0] + n[1]) active.set(n[2], n[3].color);
  const wIdx = (p) => whites.findIndex((w) => w >= p);
  const note = (x, y, w, h, n) => {
    const on = active.has(n[2]) && beat >= n[0] && beat < n[0] + n[1];
    g.fillStyle = on ? "#ffffff" : n[3].color;
    if (on) { g.shadowColor = n[3].color; g.shadowBlur = 24 * u; }
    vsRR(g, x, y, w, h, Math.min(10 * u, Math.min(w, h) / 2));
    g.fill();
    g.shadowBlur = 0;
  };
  if (vertical) {
    const kx0 = ins.l, kw = (W - ins.l - ins.r) / nW, keyH = Math.min(220 * u, kw * 6), keyY = bottom - keyH;
    const ppb = (keyY - top) / look;
    const xOf = (p) => VS_BLACK.includes(p % 12) ? kx0 + wIdx(p) * kw - kw * 0.3 : kx0 + wIdx(p) * kw;
    g.save();
    g.beginPath();
    g.rect(0, top, W, keyY - top);
    g.clip();
    for (let b = Math.ceil(beat); b < beat + look + 1; b++) {
      const bar = b % bpb === 0;
      g.fillStyle = bar ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
      g.fillRect(kx0, keyY - (b - beat) * ppb, W - ins.l - ins.r, Math.max(1, u * (bar ? 2 : 1)));
    }
    for (const n of all) {
      const bl = VS_BLACK.includes(n[2] % 12), yb = keyY - (n[0] - beat) * ppb, yt = keyY - (n[0] + n[1] - beat) * ppb;
      note(xOf(n[2]) + 2 * u, yt, (bl ? kw * 0.6 : kw) - 4 * u, Math.max(6 * u, yb - yt - 2 * u), n);
    }
    g.restore();
    for (const [i, p] of whites.entries()) {
      g.fillStyle = active.get(p) || "#e9ebf1";
      vsRR(g, kx0 + i * kw + u, keyY, kw - 2 * u, keyH, 6 * u);
      g.fill();
    }
    for (let p = lo; p <= hi; p++) {
      if (!VS_BLACK.includes(p % 12)) continue;
      g.fillStyle = active.get(p) || "#15171d";
      vsRR(g, xOf(p), keyY, kw * 0.6, keyH * 0.62, 4 * u);
      g.fill();
    }
    g.fillStyle = VS.accent;
    g.fillRect(kx0, keyY - 3 * u, W - ins.l - ins.r, 3 * u);
    vsLyrics(g, W, H, fr, ins, top + (keyY - top) * 0.35);
  } else {
    const kh = (bottom - top) / nW, keyW = Math.min(200 * u, kh * 7), keyX = ins.l + keyW;
    const ppb = (W - ins.r - keyX) / look;
    const yOf = (p) => VS_BLACK.includes(p % 12) ? bottom - wIdx(p) * kh - kh * 0.3 : bottom - (wIdx(p) + 1) * kh;
    g.save();
    g.beginPath();
    g.rect(keyX, 0, W - ins.r - keyX, H);
    g.clip();
    for (let b = Math.ceil(beat); b < beat + look + 1; b++) {
      const bar = b % bpb === 0;
      g.fillStyle = bar ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
      g.fillRect(keyX + (b - beat) * ppb, top, Math.max(1, u * (bar ? 2 : 1)), bottom - top);
    }
    for (const n of all) {
      const bl = VS_BLACK.includes(n[2] % 12), xa = keyX + (n[0] - beat) * ppb, xb = keyX + (n[0] + n[1] - beat) * ppb;
      note(xa, yOf(n[2]) + 2 * u, Math.max(6 * u, xb - xa - 2 * u), (bl ? kh * 0.6 : kh) - 4 * u, n);
    }
    g.restore();
    for (const [i, p] of whites.entries()) {
      g.fillStyle = active.get(p) || "#e9ebf1";
      vsRR(g, ins.l, bottom - (i + 1) * kh + u, keyW, kh - 2 * u, 5 * u);
      g.fill();
    }
    for (let p = lo; p <= hi; p++) {
      if (!VS_BLACK.includes(p % 12)) continue;
      g.fillStyle = active.get(p) || "#15171d";
      vsRR(g, ins.l, yOf(p), keyW * 0.62, kh * 0.6, 4 * u);
      g.fill();
    }
    g.fillStyle = VS.accent;
    g.fillRect(keyX, top, 3 * u, bottom - top);
    vsLyrics(g, W, H, fr, ins, top + 60 * u);
  }
  vsFooter(g, W, H, fr, ins);
}
function vsChips(g, list, fr, x0, maxW, y, u, center) {
  g.font = vsFont(700, 21 * u);
  const ws = list.map((t) => Math.min(g.measureText(t.name).width, 360 * u) + 50 * u);
  const rows = [];
  let row = [], rw = 0;
  for (let i = 0; i < list.length; i++) {
    if (rw + ws[i] > maxW && row.length) { rows.push([row, rw]); row = []; rw = 0; }
    row.push(i);
    rw += ws[i] + 12 * u;
  }
  if (row.length) rows.push([row, rw]);
  for (const [r, w] of rows.slice(0, 3)) {
    let x = center ? x0 + (maxW - w + 12 * u) / 2 : x0;
    for (const i of r) {
      const t = list[i], l = vsLevelAt(t, fr.beat);
      g.fillStyle = vsAlpha(t.color, 0.12 + l * 0.5);
      vsRR(g, x, y, ws[i], 44 * u, 22 * u);
      g.fill();
      g.fillStyle = t.color;
      g.beginPath();
      g.arc(x + 22 * u, y + 22 * u, (6 + l * 6) * u, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#eef0f5";
      g.fillText(vsFit(g, t.name, ws[i] - 50 * u), x + 38 * u, y + 30 * u);
      x += ws[i] + 12 * u;
    }
    y += 56 * u;
  }
  return y;
}
function vsWave(g, W, H, fr) {
  const beat = fr.beat;
  vsBg(g, W, H, beat);
  const ins = vsInsets(W, H), u = ins.u, vertical = H > W * 1.2, wide = W > H * 1.2;
  let cx, cy, R, barMax;
  if (vertical) { cx = W / 2; cy = ins.t + (H - ins.t - ins.b) * 0.3; R = 230 * u; barMax = 170 * u; }
  else if (wide) { cx = W * 0.3; cy = H * 0.5; R = 190 * u; barMax = 150 * u; }
  else { cx = W / 2; cy = ins.t + 300 * u; R = 150 * u; barMax = 120 * u; }
  const sp = vsSpectrum(fr, 96);
  let energy = 0;
  for (let i = 0; i < 24; i++) energy += sp[i];
  const pulse = 1 + Math.min(0.08, energy / 24 * 0.12);
  g.lineWidth = (wide || vertical ? 9 : 7) * u;
  g.lineCap = "round";
  for (let i = 0; i < 96; i++) {
    const a = -Math.PI / 2 + (i / 96) * Math.PI * 2, len = 12 * u + sp[i] * barMax, r0 = R + 16 * u;
    g.strokeStyle = i % 2 ? vsAlpha(VS.accent, 0.5 + sp[i] * 0.5) : `rgba(79,209,197,${0.45 + sp[i] * 0.5})`;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
    g.stroke();
  }
  g.lineCap = "butt";
  g.save();
  g.beginPath();
  g.arc(cx, cy, R * pulse, 0, Math.PI * 2);
  g.fillStyle = "#14161d";
  g.fill();
  g.clip();
  if (VS.cover) { const s = R * 2 * pulse; g.drawImage(VS.cover, cx - s / 2, cy - s / 2, s, s); }
  else vsLogo(g, cx - R * 0.55 * pulse, cy - R * 0.55 * pulse, R * 1.1 * pulse);
  g.restore();
  g.strokeStyle = vsAlpha(VS.accent, 0.4);
  g.lineWidth = 3 * u;
  g.beginPath();
  g.arc(cx, cy, R * pulse, 0, Math.PI * 2);
  g.stroke();
  const info = vsInfo(beat), line = [info.sec, info.ch].filter(Boolean).join("  ·  ");
  const list = tracksAll().filter((t) => !mt(t.id).mute).slice(0, 10);
  if (wide) {
    const tx = W * 0.56, maxW = W - ins.r - tx;
    let y = H * 0.36;
    g.fillStyle = "#eef0f5";
    g.font = vsFont(800, 66 * u);
    g.fillText(vsFit(g, VS.title || S.B.project.title, maxW), tx, y);
    if (VS.artist) {
      g.fillStyle = VS.accent;
      g.font = vsFont(600, 36 * u);
      y += 58 * u;
      g.fillText(vsFit(g, VS.artist, maxW), tx, y);
    }
    if (line) {
      g.fillStyle = "#c9cdd8";
      g.font = vsFont(600, 30 * u);
      y += 62 * u;
      g.fillText(line, tx, y);
    }
    vsChips(g, list, fr, tx, maxW, y + 40 * u, u, false);
  } else {
    g.textAlign = "center";
    let y = cy + R + barMax + (vertical ? 120 : 80) * u;
    g.fillStyle = "#eef0f5";
    g.font = vsFont(800, (vertical ? 74 : 56) * u);
    g.fillText(vsFit(g, VS.title || S.B.project.title, W - ins.l - ins.r), cx, y);
    if (VS.artist) {
      g.fillStyle = VS.accent;
      g.font = vsFont(600, (vertical ? 40 : 32) * u);
      y += (vertical ? 58 : 46) * u;
      g.fillText(VS.artist, cx, y);
    }
    if (line) {
      g.fillStyle = "#c9cdd8";
      g.font = vsFont(600, (vertical ? 30 : 26) * u);
      y += (vertical ? 64 : 50) * u;
      g.fillText(line, cx, y);
    }
    g.textAlign = "left";
    if (vertical) vsChips(g, list, fr, ins.l, W - ins.l - ins.r, y + 44 * u, u, true);
  }
  vsFooter(g, W, H, fr, ins);
  vsLyrics(g, W, H, fr, ins, vertical ? cy : wide ? H - ins.b - 150 * u : cy);
}
function vsWaveData() {
  const buf = VS.mixBuf;
  if (!buf) return null;
  if (VS.wave && VS.wave.key === VS.mixKey) return VS.wave.d;
  const n = 360, d = new Float32Array(n), L = buf.getChannelData(0), step = Math.max(4, Math.floor(buf.length / n));
  let mx = 1e-6;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * step; k < Math.min(buf.length, (i + 1) * step); k += 4) s += L[k] * L[k];
    d[i] = Math.sqrt(s / (step / 4));
    mx = Math.max(mx, d[i]);
  }
  for (let i = 0; i < n; i++) d[i] = Math.pow(d[i] / mx, 0.7);
  VS.wave = { key: VS.mixKey, d };
  return d;
}
function vsCover(g, W, H, fr) {
  const beat = fr.beat;
  vsBg(g, W, H, beat);
  const ins = vsInsets(W, H), u = ins.u, vertical = H > W, square = Math.abs(W - H) < 10;
  let lvl = 0;
  for (const t of tracksAll()) lvl = Math.max(lvl, vsLevelAt(t, beat));
  let cs, cx, cy, tx, ty, center = true;
  if (vertical) { cs = Math.min(W - ins.l - ins.r, (H - ins.t - ins.b) * 0.5); cx = ins.l + (W - ins.l - ins.r - cs) / 2; cy = ins.t + 30 * u; tx = cx + cs / 2; ty = cy + cs + 110 * u; }
  else if (square) { cs = 500 * u; cx = (W - cs) / 2; cy = ins.t + 20 * u; tx = W / 2; ty = cy + cs + 90 * u; }
  else { cs = H - ins.t - ins.b - 230 * u; cx = ins.l + 30 * u; cy = ins.t + 30 * u; tx = cx + cs + 80 * u; ty = cy + 120 * u; center = false; }
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 60 * u;
  g.shadowOffsetY = 20 * u;
  g.fillStyle = "#000";
  vsRR(g, cx, cy, cs, cs, cs * 0.06);
  g.fill();
  g.restore();
  vsCoverArt(g, cx, cy, cs, lvl);
  g.textAlign = center ? "center" : "left";
  const maxW = center ? W - ins.l - ins.r : W - ins.r - tx;
  g.fillStyle = "#eef0f5";
  g.font = vsFont(800, (vertical ? 72 : 64) * u);
  g.fillText(vsFit(g, VS.title || S.B.project.title, maxW), tx, ty);
  let y = ty;
  if (VS.artist) {
    g.fillStyle = VS.accent;
    g.font = vsFont(600, (vertical ? 40 : 36) * u);
    y += 58 * u;
    g.fillText(vsFit(g, VS.artist, maxW), tx, y);
  }
  const info = vsInfo(beat);
  if (info.sec || info.ch) {
    g.fillStyle = "#9aa0b0";
    g.font = vsFont(600, 28 * u);
    y += 56 * u;
    g.fillText([info.sec, info.ch].filter(Boolean).join("  ·  "), tx, y);
  }
  g.textAlign = "left";
  const wd = vsWaveData();
  const wx = center ? ins.l : tx, ww = center ? W - ins.l - ins.r : W - ins.r - tx;
  const wy = center ? y + 70 * u : cy + cs - 150 * u, wh = (vertical ? 140 : 120) * u;
  const k = Math.max(0, Math.min(1, (beat - fr.r0) / Math.max(1e-6, fr.r1 - fr.r0)));
  const n = wd ? wd.length : 120, bw = ww / n;
  for (let i = 0; i < n; i++) {
    const v = wd ? wd[i] : 0.15 + 0.1 * Math.abs(Math.sin(i * 0.37)), h = Math.max(4 * u, v * wh);
    g.fillStyle = i / n <= k ? VS.accent : "rgba(255,255,255,0.18)";
    vsRR(g, wx + i * bw + bw * 0.15, wy + (wh - h) / 2, Math.max(1, bw * 0.7), h, Math.min(3 * u, bw * 0.35));
    g.fill();
  }
  const P = period();
  g.font = vsFont(600, 24 * u);
  g.fillStyle = "#9aa0b0";
  g.fillText(vsFmtTime((beat - fr.r0) * P), wx, wy + wh + 40 * u);
  g.textAlign = "right";
  g.fillText(vsFmtTime((fr.r1 - fr.r0) * P), wx + ww, wy + wh + 40 * u);
  g.textAlign = "left";
  if (VS.wm) vsWatermark(g, ins.l, H - ins.b - 36 * u, u);
  vsLyrics(g, W, H, fr, ins, vertical ? wy + wh + 150 * u : H - ins.b - 130 * u);
}
function vsScreen(g, W, H) {
  const v = VS.screen, u = Math.min(W, H) / 1080;
  if (!v || !v.videoWidth) {
    vsBg(g, W, H, 0);
    g.textAlign = "center";
    g.fillStyle = "#c9cdd8";
    g.font = vsFont(700, 46 * u);
    g.fillText("Запис екрана програми", W / 2, H / 2 - 30 * u);
    g.fillStyle = "#8b91a3";
    g.font = vsFont(500, 28 * u);
    g.fillText("Натисніть «Записати екран» і оберіть вікно InkBeat", W / 2, H / 2 + 30 * u);
    g.textAlign = "left";
    return;
  }
  const vw = v.videoWidth, vh = v.videoHeight, cover = Math.max(W / vw, H / vh), fit = Math.min(W / vw, H / vh);
  g.fillStyle = "#0b0c10";
  g.fillRect(0, 0, W, H);
  g.save();
  g.filter = `blur(${Math.round(36 * u)}px) brightness(0.42)`;
  g.drawImage(v, (W - vw * cover) / 2, (H - vh * cover) / 2, vw * cover, vh * cover);
  g.restore();
  const dw = vw * fit, dh = vh * fit, tb = (H - dh) / 2;
  g.drawImage(v, (W - dw) / 2, tb, dw, dh);
  if (H > W * 1.2 && tb > 180 * u) {
    g.textAlign = "center";
    g.fillStyle = "#eef0f5";
    g.font = vsFont(800, 62 * u);
    g.fillText(vsFit(g, VS.title || S.B.project.title, W - 100 * u), W / 2, tb / 2 + 10 * u);
    if (VS.artist) {
      g.fillStyle = VS.accent;
      g.font = vsFont(600, 36 * u);
      g.fillText(VS.artist, W / 2, tb / 2 + 62 * u);
    }
    g.textAlign = "left";
  }
  if (VS.wm) {
    const pad = 40 * u, wy = H - pad - 40 * u - (H > W && VS.safe ? 300 * u : 0);
    g.fillStyle = "rgba(11,12,16,0.72)";
    vsRR(g, pad - 10 * u, wy - 10 * u, 330 * u, 60 * u, 14 * u);
    g.fill();
    vsWatermark(g, pad, wy + 4 * u, u);
  }
}
function vsGuides(g, W, H) {
  if (!(H > W && VS.safe && VS.guides)) return;
  const ins = vsInsets(W, H), u = ins.u;
  g.save();
  g.fillStyle = "rgba(255,93,108,0.10)";
  g.fillRect(0, 0, W, ins.t);
  g.fillRect(0, H - ins.b, W, ins.b);
  g.fillRect(W - ins.r, ins.t, ins.r, H - ins.t - ins.b);
  g.setLineDash([14 * u, 10 * u]);
  g.strokeStyle = "rgba(255,93,108,0.7)";
  g.lineWidth = 3 * u;
  g.strokeRect(ins.l, ins.t, W - ins.l - ins.r, H - ins.t - ins.b);
  g.setLineDash([]);
  g.fillStyle = "rgba(255,93,108,0.95)";
  g.font = vsFont(700, 22 * u);
  g.fillText("Тут будуть кнопки й підпис TikTok. У відео цієї рамки немає.", ins.l, H - ins.b + 44 * u);
  g.restore();
}
function vsDrawTo(g, W, H, fr) {
  if (VS.style === "notes") vsNotes(g, W, H, fr);
  else if (VS.style === "wave") vsWave(g, W, H, fr);
  else if (VS.style === "cover") vsCover(g, W, H, fr);
  else if (VS.style === "screen") vsScreen(g, W, H);
  else vsStudio(g, W, H, fr);
  if (VS.style !== "screen") vsOverlays(g, W, H, fr, vsInsets(W, H));
}
function vsDraw(beat, live, guides) {
  const r = vsRange(), W = VS.canvas.width, H = VS.canvas.height;
  vsDrawTo(VS.g, W, H, { beat, r0: r[0], r1: r[1], live: !!live, smooth: !!live });
  if (guides) vsGuides(VS.g, W, H);
}
function vsCanvas() {
  const [w, h] = vsSize(), c = VS.canvas;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; VS.bgCache = null; }
  const box = $("#vs-stage"), k = Math.max(0.05, Math.min((box.clientWidth - 24) / w, (box.clientHeight - 24) / h));
  c.style.width = Math.floor(w * k) + "px";
  c.style.height = Math.floor(h * k) + "px";
}
function vsTap() {
  const A = ensureCtx();
  if (!A.master) rebuildStrips();
  if (!VS.an || VS.an.context !== A.ctx) {
    VS.an = A.ctx.createAnalyser();
    VS.an.fftSize = 2048;
    VS.an.smoothingTimeConstant = 0.72;
    VS.fbuf = null;
  }
  try { A.master.out.connect(VS.an); } catch (e) {}
  return A;
}
function vsPreviewBeat() {
  const r = vsRange();
  if (S.playing) return curBeat();
  return Math.max(r[0], Math.min(r[1], VS.scrub != null ? VS.scrub : r[0]));
}
function vsLoop() {
  cancelAnimationFrame(VS.raf);
  const step = () => {
    const m = $("#vs-modal");
    if (!VS.canvas || !m || m.hidden || VS.busy) return;
    const b = vsPreviewBeat();
    if (S.playing && b >= vsRange()[1]) {
      stopPlay();
      VS.scrub = vsRange()[0];
      if ($("#vs-play")) $("#vs-play").textContent = "▶ Переглянути";
    }
    vsDraw(b, S.playing, true);
    vsOverview();
    VS.raf = requestAnimationFrame(step);
  };
  VS.raf = requestAnimationFrame(step);
}
function vsMixLater() {
  clearTimeout(VS.mixT);
  VS.mixT = setTimeout(vsMixNow, 700);
}
async function vsMixNow() {
  const r = vsRange();
  const key = `${S.pid}|${r[0].toFixed(3)}|${r[1].toFixed(3)}|${JSON.stringify(S.mix.master.fx || []).length}|${tracksAll().length}|${S.B._rev}`;
  if (VS.mixKey === key && VS.mixBuf) return VS.mixBuf;
  const job = ++VS.mixJob, st = $("#vs-ana");
  if (st) st.textContent = "· аналізую звук…";
  try {
    ensureCtx();
    await loadInstrumentBuffers();
    const buf = await renderMixQuick(S.mix.master.fx, r[0], r[1]);
    if (job !== VS.mixJob) return VS.mixBuf;
    buf.r0 = r[0];
    VS.mixBuf = buf;
    VS.mixKey = key;
  } catch (e) {
    VS.mixBuf = null;
  }
  if (st && job === VS.mixJob) st.textContent = "";
  return VS.mixBuf;
}
function vsOverview() {
  const c = $("#vs-ov");
  if (!c || !c.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const end = vsEnd(), X = (b) => b / end * w, r = vsRange();
  g.fillStyle = "#0d0f14";
  g.fillRect(0, 0, w, h);
  for (const s of secList()) {
    g.fillStyle = vsAlpha(s.color || "#6b7280", 0.4);
    g.fillRect(X(s.start), 0, Math.max(1, X(s.end) - X(s.start) - 1), 10);
  }
  const key = `${end}|${w}|${tracksAll().length}|${S.B._rev}`;
  if (!VS.ovEnv || VS.ovEnv.key !== key) {
    const d = new Float32Array(Math.ceil(w)), list = tracksAll();
    for (let x = 0; x < d.length; x++) {
      let s = 0;
      for (const t of list) s += vsLevelAt(t, x / w * end);
      d[x] = s;
    }
    let mx = 1e-6;
    for (const v of d) mx = Math.max(mx, v);
    for (let x = 0; x < d.length; x++) d[x] = Math.pow(d[x] / mx, 0.6);
    VS.ovEnv = { key, d };
  }
  const mid = 10 + (h - 10) / 2, amp = (h - 14) / 2;
  for (let x = 0; x < VS.ovEnv.d.length; x++) {
    const v = VS.ovEnv.d[x], b = x / w * end;
    g.fillStyle = b >= r[0] && b <= r[1] ? vsAlpha(VS.accent, 0.85) : "rgba(255,255,255,0.22)";
    g.fillRect(x, mid - v * amp, 1, Math.max(1, v * amp * 2));
  }
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(0, 10, X(r[0]), h - 10);
  g.fillRect(X(r[1]), 10, w - X(r[1]), h - 10);
  g.strokeStyle = VS.accent;
  g.lineWidth = 2;
  g.strokeRect(X(r[0]) + 1, 11, Math.max(2, X(r[1]) - X(r[0]) - 2), h - 12);
  for (const b of r) {
    g.fillStyle = VS.accent;
    vsRR(g, X(b) - 4, h / 2 - 6, 8, 22, 3);
    g.fill();
  }
  g.fillStyle = "#ffffff";
  g.fillRect(X(vsPreviewBeat()), 0, 1.5, h);
}
function vsOvBind() {
  const c = $("#vs-ov");
  if (!c) return;
  let drag = null;
  const beatAt = (e) => {
    const rc = c.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width)) * vsEnd();
  };
  const near = (b) => {
    const r = vsRange(), px = vsEnd() / c.clientWidth * 8;
    return Math.abs(b - r[0]) < px ? "a" : Math.abs(b - r[1]) < px ? "b" : null;
  };
  c.onpointerdown = (e) => {
    const b = beatAt(e);
    drag = near(b) || (e.shiftKey ? "b" : "s");
    if (drag === "s" && S.playing) { stopPlay(); if ($("#vs-play")) $("#vs-play").textContent = "▶ Переглянути"; }
    c.setPointerCapture(e.pointerId);
    c.onpointermove(e);
  };
  c.onpointermove = (e) => {
    const b = beatAt(e);
    if (!drag) { c.style.cursor = near(b) ? "ew-resize" : "pointer"; return; }
    const v = e.altKey ? b : Math.round(b * 4) / 4;
    if (drag === "a") { VS.r0 = Math.min(v, VS.r1 - 0.25); VS.scrub = VS.r0; }
    else if (drag === "b") { VS.r1 = Math.max(v, VS.r0 + 0.25); VS.scrub = Math.max(VS.r0, VS.r1 - 4); }
    else VS.scrub = b;
    if (drag !== "s") vsRangeChanged(false);
  };
  c.onpointerup = () => {
    if (drag && drag !== "s") vsRangeChanged(true);
    drag = null;
  };
}
function vsRangeChanged(heavy) {
  vsRange();
  const P = period();
  if ($("#vs-t0") && document.activeElement !== $("#vs-t0")) $("#vs-t0").value = vsFmtTime(VS.r0 * P, true);
  if ($("#vs-t1") && document.activeElement !== $("#vs-t1")) $("#vs-t1").value = vsFmtTime(VS.r1 * P, true);
  vsUpdateDur();
  if (heavy) { vsSave(); vsMixLater(); }
}
function vsUpdateDur() {
  const el = $("#vs-dur");
  if (!el) return;
  const r = vsRange(), d = (r[1] - r[0]) * period(), bpb = S.B.timing.bpb;
  const warn = VS.fmt === "tiktok" && d > 180 ? " · для TikTok краще до 3 хв" : VS.fmt === "square" && d > 90 ? " · для Instagram краще до 90 с" : "";
  el.innerHTML = `Тривалість <b>${vsFmtTime(d, true)}</b> · такти ${Math.floor(r[0] / bpb) + 1}–${Math.ceil(r[1] / bpb)}${warn}`;
}
function vsPreset(k) {
  const P = period(), end = vsEnd();
  if (k === "all") { VS.r0 = vsFirst(); VS.r1 = end; }
  else if (k === "chorus") {
    const secs = secList();
    const s = secs.find((x) => x.kind === "chorus") || secs.slice().sort((a, b) => (b.energy || 0) - (a.energy || 0))[0];
    if (!s) return toast("У проєкті немає розмічених секцій.", true);
    VS.r0 = s.start;
    VS.r1 = s.end;
  } else {
    const len = +k / P;
    VS.r1 = Math.min(end, VS.r0 + len);
    if (VS.r1 - VS.r0 < len - 0.01) VS.r0 = Math.max(0, VS.r1 - len);
  }
  VS.scrub = VS.r0;
  vsRangeChanged(true);
}
function vsPanel() {
  const P = period(), r = vsRange(), scr = VS.style === "screen", tt = VS.fmt === "tiktok";
  const sw = VACCENTS.map((c) => `<button type="button" class="vs-sw ${VS.accent === c ? "on" : ""}" data-acc="${c}" style="background:${c}"></button>`).join("");
  return `
    <div class="vs-sec"><div class="vs-h">Формат</div>
      <div class="vs-fmts">${Object.entries(VFMT).map(([k, f]) => `<button class="vs-fmt ${VS.fmt === k ? "on" : ""}" data-fmt="${k}"><i style="aspect-ratio:${f.w}/${f.h}"></i><b>${f.tag}</b><span>${f.name}</span></button>`).join("")}</div>
      <label class="vs-chk" ${scr ? "hidden" : ""}><input type="checkbox" id="vs-all" ${VS.all ? "checked" : ""}> Зробити всі три формати за один раз</label></div>
    <div class="vs-sec"><div class="vs-h">Стиль</div><div class="vs-styles">${Object.entries(VSTYLES).map(([k, s]) => `<button class="vs-style ${VS.style === k ? "on" : ""}" data-style="${k}"><b>${s[0]}</b><span>${s[1]}</span></button>`).join("")}</div></div>
    <div class="vs-sec" ${scr ? "hidden" : ""}><div class="vs-h">Фрагмент <span class="muted" id="vs-ana"></span></div>
      <canvas id="vs-ov" class="vs-ov" data-hint="Тягніть краї рамки — початок і кінець відео. Клік — подивитися кадр у цьому місці. Alt — без прив'язки до долей"></canvas>
      <div class="vs-times">
        <label>Від <input type="text" id="vs-t0" value="${vsFmtTime(r[0] * P, true)}" data-hint="Початок відео: хвилини:секунди, наприклад 0:42.5"></label><button class="btn ghost sm" data-set="0" data-hint="Початок — там, де стоїть курсор у редакторі">⇤ курсор</button>
        <label>До <input type="text" id="vs-t1" value="${vsFmtTime(r[1] * P, true)}" data-hint="Кінець відео: хвилини:секунди"></label><button class="btn ghost sm" data-set="1" data-hint="Кінець — там, де стоїть курсор у редакторі">курсор ⇥</button></div>
      <div class="vs-presets"><button data-pre="all">Уся пісня</button><button data-pre="chorus">Приспів</button><button data-pre="15">15 с</button><button data-pre="30">30 с</button><button data-pre="60">60 с</button></div>
      <div class="muted small" id="vs-dur"></div></div>
    <div class="vs-sec"><div class="vs-h">Текст</div>
      <input type="text" id="vs-title" maxlength="60" placeholder="Назва треку" value="${escapeHtml(VS.title || "")}">
      <input type="text" id="vs-artist" maxlength="60" placeholder="Ваш нік або ім'я" value="${escapeHtml(VS.artist || "")}">
      <input type="text" id="vs-cta" maxlength="60" placeholder="Напис у кінці: «Повна версія — у профілі»" value="${escapeHtml(VS.cta || "")}" ${scr ? "hidden" : ""}>
      <label class="vs-chk" ${scr ? "hidden" : ""}><input type="checkbox" id="vs-intro" ${VS.intro ? "checked" : ""}> Назва на весь екран на початку</label>
      <label class="vs-chk" ${scr ? "hidden" : ""}><input type="checkbox" id="vs-lyr" ${VS.lyrics ? "checked" : ""}> Текст пісні субтитрами</label>
      <label class="vs-chk"><input type="checkbox" id="vs-wm" ${VS.wm ? "checked" : ""}> Підпис «Зроблено в INKBEAT»</label></div>
    <div class="vs-sec" ${scr ? "hidden" : ""}><div class="vs-h">Оформлення</div>
      <div class="vs-row"><span class="muted small">Колір</span><div class="vs-sws">${sw}</div></div>
      <div class="vs-row"><span class="muted small">Фон</span><div class="np-seg"><button type="button" data-bg="dark" class="${VS.bg === "dark" ? "on" : ""}">Темний</button><button type="button" data-bg="accent" class="${VS.bg === "accent" ? "on" : ""}">Кольоровий</button><button type="button" data-bg="cover" class="${VS.bg === "cover" ? "on" : ""}">З обкладинки</button></div></div>
      <div class="vs-row vs-cov"><div class="vs-thumb">${VS.cover ? `<img src="${VS.cover.src}" alt="">` : "немає"}</div><div class="vs-covbtns"><button class="btn ghost sm" id="vs-cov-up">${VS.cover ? "Замінити обкладинку" : "Додати обкладинку"}</button>${VS.cover ? '<button class="btn ghost sm" id="vs-cov-del">Прибрати</button>' : ""}<div class="muted small">JPG або PNG, обріжеться до квадрата</div></div></div></div>
    <div class="vs-sec"><div class="vs-h">Якість</div>
      <div class="np-seg"><button type="button" data-q="1080" class="${VS.q === 1080 ? "on" : ""}">1080p</button><button type="button" data-q="720" class="${VS.q === 720 ? "on" : ""}">720p</button><span class="vs-gap"></span><button type="button" data-fps="30" class="${VS.fps === 30 ? "on" : ""}">30 к/с</button><button type="button" data-fps="60" class="${VS.fps === 60 ? "on" : ""}">60 к/с</button></div>
      <label class="vs-chk" ${scr ? "hidden" : ""}><input type="checkbox" id="vs-hq" ${VS.hq ? "checked" : ""}> Звук як в експорті (найчистіший)</label>
      <label class="vs-chk" ${scr ? "hidden" : ""}><input type="checkbox" id="vs-fade" ${VS.fadeOut ? "checked" : ""}> Плавне затухання звуку в кінці</label>
      <label class="vs-chk" ${tt ? "" : "hidden"}><input type="checkbox" id="vs-safe" ${VS.safe ? "checked" : ""}> Не ставити важливе під кнопки TikTok</label>
      <label class="vs-chk" ${tt && VS.safe ? "" : "hidden"}><input type="checkbox" id="vs-guides" ${VS.guides ? "checked" : ""}> Показувати ці зони в перегляді</label>
      <label class="vs-chk" ${scr ? "" : "hidden"}><input type="checkbox" id="vs-mic" ${VS.mic ? "checked" : ""}> Додати мікрофон (ваш голос поверх)</label></div>
    <div class="vs-tip muted small">${scr ? "Вікно відеостудії сховається, а вгорі з'явиться кнопка «Зупинити запис». Звук програми записується напряму, без шумів кімнати." : vsOfflineOk() ? "Відео збирається кадр за кадром — швидше за реальний час і без пропущених кадрів. Вікно можна згорнути." : "Відео записується в реальному часі разом із програванням. Не згортайте вікно під час запису."}</div>`;
}
function vsBind() {
  const p = $("#vs-panel");
  const on = (sel, fn) => p.querySelectorAll(sel).forEach((el) => el.onclick = (e) => fn(e.currentTarget));
  on("[data-fmt]", (b) => { VS.fmt = b.dataset.fmt; vsSave(); vsRender(); });
  on("[data-style]", (b) => { VS.style = b.dataset.style; vsSave(); vsRender(); });
  on("[data-q]", (b) => { VS.q = +b.dataset.q; vsSave(); vsRender(); });
  on("[data-fps]", (b) => { VS.fps = +b.dataset.fps; vsSave(); vsRender(); });
  on("[data-bg]", (b) => {
    VS.bg = b.dataset.bg;
    if (VS.bg === "cover" && !VS.cover) toast("Спершу додайте обкладинку нижче.");
    VS.bgCache = null;
    vsSave();
    vsRender();
  });
  on("[data-acc]", (b) => { VS.accent = b.dataset.acc; vsSave(); vsRender(); });
  on("[data-pre]", (b) => vsPreset(b.dataset.pre));
  on("[data-set]", (b) => {
    if (b.dataset.set === "0") VS.r0 = Math.min(S.playBeat, VS.r1 - 0.25);
    else VS.r1 = Math.max(S.playBeat, VS.r0 + 0.25);
    VS.scrub = VS.r0;
    vsRangeChanged(true);
  });
  const tIn = (id, k) => {
    const el = $(id);
    if (!el) return;
    const apply = () => {
      const s = vsParseTime(el.value);
      if (s == null) { toast("Час вводиться як хв:сек, наприклад 1:23.5", true); el.blur(); vsRangeChanged(false); return; }
      VS[k] = s / period();
      if (VS.r1 <= VS.r0) { if (k === "r0") VS.r1 = Math.min(vsEnd(), VS.r0 + 4); else VS.r0 = Math.max(0, VS.r1 - 4); }
      VS.scrub = VS.r0;
      el.blur();
      vsRangeChanged(true);
    };
    el.onchange = apply;
    el.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") apply(); };
  };
  tIn("#vs-t0", "r0");
  tIn("#vs-t1", "r1");
  const txt = (id, k) => { const el = $(id); if (el) { el.oninput = () => { VS[k] = el.value; vsSave(); }; el.onkeydown = (e) => e.stopPropagation(); } };
  txt("#vs-title", "title");
  txt("#vs-artist", "artist");
  txt("#vs-cta", "cta");
  const chk = (id, k, re) => { const el = $(id); if (el) el.onchange = () => { VS[k] = el.checked; vsSave(); if (re) vsRender(); }; };
  chk("#vs-all", "all", true);
  chk("#vs-intro", "intro");
  chk("#vs-wm", "wm");
  chk("#vs-hq", "hq");
  chk("#vs-fade", "fadeOut");
  chk("#vs-safe", "safe", true);
  chk("#vs-guides", "guides");
  chk("#vs-mic", "mic");
  if ($("#vs-lyr")) $("#vs-lyr").onchange = (e) => {
    VS.lyrics = e.target.checked;
    vsSave();
    if (VS.lyrics && !(S.mix && (S.mix.lyrics || "").trim())) toast("Текст пісні порожній: додайте його у вокальній студії, вкладка «Текст».", true);
    else if (VS.lyrics && !vsPhrases().length) toast("Не знайшов вокальну доріжку з нотами — субтитрам нема на що спиратися.", true);
  };
  if ($("#vs-cov-up")) $("#vs-cov-up").onclick = vsCoverUpload;
  if ($("#vs-cov-del")) $("#vs-cov-del").onclick = async () => {
    await api.del(`/api/project/${S.pid}/cover`).catch(() => {});
    VS.cover = null;
    VS.bgCache = null;
    if (VS.bg === "cover") VS.bg = "dark";
    vsRender();
  };
  vsOvBind();
  vsUpdateDur();
}
function vsCoverUpload() {
  const run = async (f) => {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f, f.name);
    try {
      const r = await fetch(`/api/project/${S.pid}/cover`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "помилка");
      await vsLoadCover();
      if (VS.bg === "dark") VS.bg = "cover";
      vsSave();
      vsRender();
    } catch (e) {
      toast("Обкладинку не додано: " + e.message, true);
    }
  };
  pickLocal("image", false).then((fs) => run(fs[0]));
}
function vsLoadCover() {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { VS.cover = im; VS.bgCache = null; res(im); };
    im.onerror = () => { VS.cover = null; res(null); };
    im.src = `/api/project/${S.pid}/cover?t=${Date.now()}`;
  });
}
function vsRender() {
  $("#vs-panel").innerHTML = vsPanel();
  vsBind();
  vsCanvas();
  vsResetActions();
}
const vsOfflineOk = () => typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
async function openVideoStudio() {
  if (!S.B) return toast("Спершу відкрийте проєкт.", true);
  if (VS.pid !== S.pid) Object.assign(VS, { cover: null, mixBuf: null, mixKey: "", bgCache: null, phr: null, ovEnv: null });
  vsLoad();
  VS.pid = S.pid;
  VS.scrub = null;
  if (!tracksAll().length) toast("У проєкті ще немає доріжок — відео буде порожнім.", true);
  let m = $("#vs-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "vs-modal";
    m.innerHTML = `<div class="modal-card vs-card"><div class="modal-head"><h3>Відеостудія</h3><span class="muted small vs-sub">Відео треку для TikTok, Reels, Shorts, YouTube та Instagram</span><button class="x" id="vs-x">&times;</button></div>
      <div class="vs-body"><div class="vs-stage" id="vs-stage"></div><div class="vs-side"><div class="vs-panel" id="vs-panel"></div><div class="vs-actions" id="vs-actions"></div></div></div></div>`;
    document.body.appendChild(m);
    $("#vs-x").onclick = () => vsClose();
    m.addEventListener("click", (e) => { if (e.target === m && !VS.busy) vsClose(); });
    window.addEventListener("resize", () => { const mm = $("#vs-modal"); if (mm && !mm.hidden && VS.canvas && VS.canvas.isConnected) vsCanvas(); });
  }
  if (!$("#vs-canvas")) $("#vs-stage").innerHTML = `<canvas id="vs-canvas"></canvas>`;
  VS.canvas = $("#vs-canvas");
  VS.g = VS.canvas.getContext("2d");
  m.hidden = false;
  if (!VS.cover) await vsLoadCover();
  vsRender();
  vsTap();
  vsLoop();
  vsMixLater();
}
function vsClose() {
  if (VS.busy) return toast("Зачекайте, поки відео збереться, або натисніть «Скасувати».", true);
  if (S.playing) stopPlay();
  $("#vs-modal").hidden = true;
  cancelAnimationFrame(VS.raf);
}
function vsStatus(html) {
  $("#vs-actions").innerHTML = html;
}
function vsResetActions() {
  const scr = VS.style === "screen";
  vsStatus(`${scr ? "" : '<button class="btn ghost" id="vs-play">▶ Переглянути</button>'}<button class="btn primary" id="vs-rec"><i class="vs-dot"></i>${scr ? "Записати екран" : VS.all ? "Зробити 3 відео" : "Зробити відео"}</button>`);
  if ($("#vs-play")) $("#vs-play").onclick = () => {
    vsTap();
    if (S.playing) { VS.scrub = curBeat(); stopPlay(); $("#vs-play").textContent = "▶ Переглянути"; return; }
    const r = vsRange();
    S.playBeat = VS.scrub != null && VS.scrub >= r[0] && VS.scrub < r[1] - 0.5 ? VS.scrub : r[0];
    play();
    $("#vs-play").textContent = "❚❚ Пауза";
    vsLoop();
  };
  $("#vs-rec").onclick = () => vsRecord();
}
function vsMime() {
  const list = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return list.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
}
function vsProg(text, k) {
  if (!$("#vs-pb")) {
    vsStatus(`<div class="vs-prog"><div class="pbar"><div id="vs-pb"></div></div><span id="vs-pt"></span></div><button class="btn ghost" id="vs-cancel">Скасувати</button>`);
    $("#vs-cancel").onclick = () => { VS.stop = true; $("#vs-cancel").disabled = true; $("#vs-cancel").textContent = "Зупиняю…"; };
  }
  $("#vs-pb").style.width = Math.max(2, Math.min(100, k * 100)) + "%";
  $("#vs-pt").textContent = text;
}
async function vsEncoderConfig(w, h, fps) {
  const bitrate = Math.round(w * h * fps * (fps > 30 ? 0.09 : 0.13));
  const cands = [
    ["avc1.640033", "h264"], ["avc1.4d0033", "h264"], ["avc1.42e033", "h264"], ["vp09.00.41.08", "ivf"], ["vp8", "ivf"]
  ];
  for (const [codec, kind] of cands) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: "quality" };
    if (kind === "h264") cfg.avc = { format: "annexb" };
    try {
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s && s.supported) return { cfg, kind, fourcc: codec.startsWith("vp09") ? "VP90" : "VP80" };
    } catch (e) {
    }
  }
  return null;
}
function vsIvf(chunks, w, h, fps, fourcc) {
  const head = new ArrayBuffer(32), v = new DataView(head);
  "DKIF".split("").forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  v.setUint16(4, 0, true);
  v.setUint16(6, 32, true);
  fourcc.split("").forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
  v.setUint16(12, w, true);
  v.setUint16(14, h, true);
  v.setUint32(16, fps, true);
  v.setUint32(20, 1, true);
  v.setUint32(24, chunks.length, true);
  const parts = [head];
  chunks.forEach((c, i) => {
    const fh = new ArrayBuffer(12), d = new DataView(fh);
    d.setUint32(0, c.byteLength, true);
    d.setUint32(4, i, true);
    d.setUint32(8, 0, true);
    parts.push(fh, c);
  });
  return new Blob(parts, { type: "video/x-ivf" });
}
async function vsEncodeOffline(fmtKey, r, label) {
  const [w, h] = vsSize(fmtKey), fps = VS.fps, P = period();
  const conf = await vsEncoderConfig(w, h, fps);
  if (!conf) return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d", { alpha: false });
  const chunks = [];
  let err = null;
  const enc = new VideoEncoder({
    output: (ch) => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); chunks.push(b); },
    error: (e) => { err = e; }
  });
  enc.configure(conf.cfg);
  const total = Math.max(1, Math.round((r[1] - r[0]) * P * fps));
  VS.spec = null;
  VS.bgCache = null;
  const t0 = performance.now();
  for (let f = 0; f < total; f++) {
    if (VS.stop || err) break;
    vsDrawTo(g, w, h, { beat: r[0] + f / fps / P, r0: r[0], r1: r[1], live: false, smooth: true });
    const vf = new VideoFrame(cv, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();
    while (enc.encodeQueueSize > 6) await new Promise((res) => setTimeout(res, 2));
    if (f % 8 === 0) {
      const el = (performance.now() - t0) / 1000, left = el / Math.max(1, f) * (total - f);
      vsProg(`${label}: кадр ${f} з ${total}${f > 30 ? ` · ще ≈${vsFmtTime(left)}` : ""}`, f / total);
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  await enc.flush().catch((e) => { err = err || e; });
  enc.close();
  VS.bgCache = null;
  if (err) throw new Error("кодувальник відео зупинився: " + (err.message || err));
  if (VS.stop) return "cancel";
  const blob = conf.kind === "h264" ? new Blob(chunks, { type: "video/h264" }) : vsIvf(chunks, w, h, fps, conf.fourcc);
  return { blob, kind: conf.kind, duration: total / fps };
}
async function vsSend(blob, o) {
  const fd = new FormData();
  fd.append("file", blob, o.kind === "h264" ? "video.h264" : o.kind === "ivf" ? "video.ivf" : blob.type.includes("mp4") ? "video.mp4" : "video.webm");
  if (o.audioBlob) fd.append("audio", o.audioBlob, "audio.wav");
  fd.append("title", VS.title || S.B.project.title);
  fd.append("label", o.label);
  fd.append("audio", o.audio);
  fd.append("vcodec", o.kind === "h264" || o.kind === "ivf" ? o.kind : "");
  fd.append("audio_start", String(o.audio_start || 0));
  fd.append("lead", String(o.lead || 0));
  fd.append("duration", String(o.duration || 0));
  fd.append("fps", String(VS.fps));
  fd.append("fade_in", VS.fadeIn ? "1" : "0");
  fd.append("fade_out", VS.fadeOut ? "1" : "0");
  const r = await fetch(`/api/project/${S.pid}/video`, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "помилка");
  return careWait(j.job, (p) => vsProg(`${o.label}: збираю MP4… ${Math.round(p * 100)}%`, p));
}
async function vsAudio(r) {
  if (VS.hq) {
    vsProg("Готую чистий звук…", 0.01);
    await flushMix();
    await renderAll((msg, f) => vsProg("Чистий звук: " + (msg || ""), f || 0));
    return { audio: "mix", audio_start: r[0] * period() };
  }
  vsProg("Зводжу звук…", 0.02);
  const buf = await vsMixNow();
  if (!buf) throw new Error("не вдалося звести звук");
  return { audio: "file", audioBlob: new Blob([DSP.encodeWav(buf)], { type: "audio/wav" }), audio_start: 0 };
}
async function vsRecord() {
  if (VS.busy) return;
  if (VS.style === "screen") return vsScreenRecord();
  const r = vsRange(), P = period();
  if ((r[1] - r[0]) * P < 1) return toast("Фрагмент занадто короткий.", true);
  if (S.playing) stopPlay();
  VS.busy = true;
  VS.stop = false;
  const fmts = VS.all ? Object.keys(VFMT) : [VS.fmt], done = [];
  try {
    await loadInstrumentBuffers();
    if (VS.lyrics) vsPhrases();
    await vsMixNow();
    if (vsOfflineOk() && await vsEncoderConfig(...vsSize(fmts[0]), VS.fps)) {
      const au = await vsAudio(r);
      for (const k of fmts) {
        if (VS.stop) break;
        const label = VFMT[k].file;
        const enc = await vsEncodeOffline(k, r, label);
        if (enc === "cancel" || VS.stop) break;
        if (!enc) throw new Error("цей формат не підтримується кодувальником");
        done.push({ ...(await vsSend(enc.blob, { ...au, kind: enc.kind, duration: enc.duration, label })), fmt: k });
      }
    } else {
      const res = await vsRealtime(r);
      if (res) done.push({ ...res, fmt: VS.fmt });
    }
  } catch (e) {
    VS.busy = false;
    vsStatus(`<div class="vs-err warn">Не вдалося зробити відео: ${escapeHtml(e.message || String(e))}</div><button class="btn primary" id="vs-again">Добре</button>`);
    $("#vs-again").onclick = () => { vsResetActions(); vsLoop(); };
    return;
  }
  VS.busy = false;
  if (!done.length) { vsResetActions(); vsLoop(); toast("Скасовано."); return; }
  vsResult(done);
}
async function vsRealtime(r) {
  const P = period(), fps = VS.fps;
  if (!window.MediaRecorder || !VS.canvas.captureStream) throw new Error("запис відео недоступний у цьому вікні");
  vsCanvas();
  const A = vsTap();
  await A.ctx.resume();
  const dest = A.ctx.createMediaStreamDestination();
  A.master.out.connect(dest);
  const stream = new MediaStream([...VS.canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = vsMime(), [w, h] = vsSize();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(w * h * fps * 0.14), audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => rec.onstop = res);
  S.playBeat = r[0];
  vsDraw(r[0], false, false);
  const started = new Promise((res) => rec.onstart = res);
  rec.start(500);
  await started;
  const recStart = performance.now();
  await new Promise((res) => setTimeout(res, 120));
  play();
  const lead = (performance.now() + (S.startCtx - A.ctx.currentTime) * 1000 - recStart) / 1000;
  let endBeat = r[1];
  await new Promise((res) => {
    const step = () => {
      const b = S.playing ? curBeat() : endBeat;
      vsDraw(Math.min(b, r[1]), true, false);
      vsProg(`Запис: ${vsFmtTime((b - r[0]) * P)} / ${vsFmtTime((r[1] - r[0]) * P)}`, (b - r[0]) / (r[1] - r[0]));
      if (b >= r[1] || VS.stop || !S.playing) { endBeat = Math.min(b, r[1]); res(); return; }
      VS.raf = requestAnimationFrame(step);
    };
    VS.raf = requestAnimationFrame(step);
  });
  stopPlay();
  vsDraw(endBeat, false, false);
  await new Promise((res) => setTimeout(res, 350));
  rec.stop();
  await stopped;
  try { A.master.out.disconnect(dest); } catch (e) {}
  if (VS.stop) return null;
  const blob = new Blob(chunks, { type: (mime || "video/webm").split(";")[0] });
  const duration = (endBeat - r[0]) * P + lead + 0.3;
  const au = VS.hq ? await vsAudio(r) : { audio: "video" };
  return vsSend(blob, { ...au, kind: "", duration, lead: au.audio === "video" ? 0 : lead, label: VFMT[VS.fmt].file });
}
function vsResult(list) {
  const first = list[0], box = $("#vs-stage");
  const url = (f) => `/api/project/${S.pid}/video/file/${encodeURIComponent(f)}`;
  box.innerHTML = `<video id="vs-video" controls autoplay playsinline></video>`;
  const v = $("#vs-video");
  const show = (r) => {
    const [ww, hh] = vsSize(r.fmt), kk = Math.min((box.clientWidth - 24) / ww, (box.clientHeight - 24) / hh);
    v.src = url(r.file);
    v.style.width = Math.floor(ww * kk) + "px";
    v.style.height = Math.floor(hh * kk) + "px";
  };
  show(first);
  vsStatus(`<div class="vs-done"><b>${list.length > 1 ? "Відео готові" : "Відео готове"}</b>${list.map((r, i) => `<button class="vs-file ${i === 0 ? "on" : ""}" data-i="${i}">${escapeHtml(r.file)}<span>${r.size ? fmtSize(r.size) : ""}</span></button>`).join("")}${first.note ? `<span class="muted small">${escapeHtml(first.note)}</span>` : ""}</div>
    <button class="btn ghost" id="vs-new">Нове відео</button><button class="btn primary" id="vs-open">Відкрити папку</button>`);
  $$(".vs-file").forEach((b) => b.onclick = () => {
    show(list[+b.dataset.i]);
    $$(".vs-file").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#vs-open").onclick = () => api.post(`/api/project/${S.pid}/video/open`, {});
  $("#vs-new").onclick = () => {
    box.innerHTML = `<canvas id="vs-canvas"></canvas>`;
    VS.canvas = $("#vs-canvas");
    VS.g = VS.canvas.getContext("2d");
    vsRender();
    vsLoop();
  };
  toast(list.length > 1 ? `Готово ${list.length} відео — вони в папці проєкту «video».` : "Відео збережено в папку проєкту «video».");
}
async function vsScreenRecord() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return toast("Запис екрана недоступний у цьому вікні. Оберіть інший стиль відео.", true);
  let disp;
  try {
    disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: VS.fps }, audio: false });
  } catch (e) {
    return toast("Запис екрана скасовано або заборонено.", true);
  }
  const A = vsTap();
  await A.ctx.resume();
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = disp;
  await v.play().catch(() => {});
  VS.screen = v;
  VS.busy = true;
  VS.stop = false;
  vsCanvas();
  const dest = A.ctx.createMediaStreamDestination();
  A.master.out.connect(dest);
  let mic = null;
  if (VS.mic) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      A.ctx.createMediaStreamSource(mic).connect(dest);
    } catch (e) {
      toast("Мікрофон недоступний — записую лише звук програми.", true);
    }
  }
  const fps = VS.fps, [w, h] = vsSize(), mime = vsMime();
  const stream = new MediaStream([...VS.canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(w * h * fps * 0.14), audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => rec.onstop = res);
  $("#vs-modal").hidden = true;
  const pill = document.createElement("div");
  pill.id = "vs-pill";
  pill.innerHTML = `<i class="vs-dot"></i><span id="vs-pill-t">0:00</span><button class="btn small" id="vs-pill-pause">Пауза</button><button class="btn small primary" id="vs-pill-stop">Зупинити запис</button>`;
  document.body.appendChild(pill);
  $("#vs-pill-stop").onclick = () => { VS.stop = true; };
  $("#vs-pill-pause").onclick = () => {
    if (rec.state === "recording") { rec.pause(); $("#vs-pill-pause").textContent = "Продовжити"; pill.classList.add("paused"); }
    else if (rec.state === "paused") { rec.resume(); $("#vs-pill-pause").textContent = "Пауза"; pill.classList.remove("paused"); }
  };
  disp.getVideoTracks()[0].addEventListener("ended", () => { VS.stop = true; });
  rec.start(500);
  let acc = 0, last = performance.now();
  cancelAnimationFrame(VS.raf);
  await new Promise((res) => {
    const step = () => {
      const now = performance.now();
      if (rec.state === "recording") acc += now - last;
      last = now;
      vsDraw(S.playing ? curBeat() : S.playBeat, S.playing, false);
      $("#vs-pill-t").textContent = vsFmtTime(acc / 1000);
      if (VS.stop) { res(); return; }
      VS.raf = requestAnimationFrame(step);
    };
    VS.raf = requestAnimationFrame(step);
  });
  rec.stop();
  await stopped;
  disp.getTracks().forEach((t) => t.stop());
  if (mic) mic.getTracks().forEach((t) => t.stop());
  try { A.master.out.disconnect(dest); } catch (e) {}
  pill.remove();
  VS.screen = null;
  VS.stop = false;
  $("#vs-modal").hidden = false;
  try {
    const res = await vsSend(new Blob(chunks, { type: (mime || "video/webm").split(";")[0] }), { audio: "video", kind: "", duration: acc / 1000, label: VFMT[VS.fmt].file + " - екран" });
    VS.busy = false;
    vsResult([{ ...res, fmt: VS.fmt }]);
  } catch (e) {
    VS.busy = false;
    vsStatus(`<div class="vs-err warn">Не вдалося зберегти відео: ${escapeHtml(e.message)}</div><button class="btn primary" id="vs-again">Добре</button>`);
    $("#vs-again").onclick = () => { vsResetActions(); vsLoop(); };
  }
}
(function videoHooks() {
  $("#t-video").onclick = () => openVideoStudio();
  const file = MENUS["Файл"];
  MENUS["Файл"] = () => {
    const items = file();
    const i = items.findIndex((x) => x && /Експорт/.test(x[0]));
    items.splice(i >= 0 ? i + 1 : items.length, 0, ["Відеостудія: відео для TikTok, YouTube…", needProject(openVideoStudio)]);
    return items;
  };
})();
