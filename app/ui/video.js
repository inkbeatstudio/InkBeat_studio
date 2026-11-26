"use strict";
const VFMT = {
  tiktok: { w: 1080, h: 1920, name: "TikTok · Reels · Shorts", tag: "9:16", file: "TikTok 9x16" },
  youtube: { w: 1920, h: 1080, name: "YouTube", tag: "16:9", file: "YouTube 16x9" },
  square: { w: 1080, h: 1080, name: "Instagram", tag: "1:1", file: "Instagram 1x1" }
};
const VSTYLES = {
  studio: ["Студія", "Доріжки, ноти й хвилі — як у програмі, з курсором, що рухається"],
  notes: ["Ноти", "Ноти падають на клавіатуру, кожна партія своїм кольором"],
  wave: ["Візуалізатор", "Назва, коло спектра, активність доріжок і поточний акорд"],
  screen: ["Екран", "Запис самої програми: показуйте, як створюєте трек"]
};
const VS = { fmt: "tiktok", style: "studio", range: "all", q: 1080, hq: true, wm: true, mic: false, title: "", artist: "", busy: false, stop: false, raf: 0, canvas: null, g: null, an: null, fbuf: null, tbuf: null, screen: null, lv: {} };
function vsLoad() {
  try {
    Object.assign(VS, JSON.parse(localStorage.getItem("inkbeat.video") || "{}"), { busy: false, stop: false, screen: null });
  } catch (e) {
  }
}
function vsSave() {
  try {
    localStorage.setItem("inkbeat.video", JSON.stringify({ fmt: VS.fmt, style: VS.style, q: VS.q, hq: VS.hq, wm: VS.wm, mic: VS.mic, artist: VS.artist }));
  } catch (e) {
  }
}
function vsSize() {
  const f = VFMT[VS.fmt], k = VS.q === 720 ? 720 / 1080 : 1;
  return [Math.round(f.w * k / 2) * 2, Math.round(f.h * k / 2) * 2];
}
function vsRange() {
  const P = period(), end = Math.max(arrEnd(), 1);
  if (VS.range === "cursor") return [Math.min(S.playBeat, end - 1), end];
  if (VS.range.startsWith("sec:")) {
    const s = secList()[+VS.range.slice(4)];
    if (s) return [s.start, s.end];
  }
  if (VS.range === "bars") {
    const bpb = S.B.timing.bpb, a = Math.max(1, +($("#vs-from") && $("#vs-from").value || 1)), b = Math.max(a, +($("#vs-to") && $("#vs-to").value || a + 7));
    return [(a - 1) * bpb, Math.min(end, b * bpb)];
  }
  let first = end;
  for (const t of tracksAll()) for (const c of mt(t.id).clips) if (!c.mute) first = Math.min(first, c.start);
  return [Math.max(0, Math.min(first, end - 1)), end];
}
function vsFmtTime(s) {
  s = Math.max(0, s);
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
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
function vsLevels() {
  const A = S.audio;
  VS.lv = {};
  if (!A || !S.playing) return;
  if (!VS.tbuf) VS.tbuf = new Float32Array(1024);
  for (const t of tracksAll()) {
    const st = A.strips[t.id];
    if (!st || !st.meterL) continue;
    st.meterL.getFloatTimeDomainData(VS.tbuf);
    let s = 0;
    for (let i = 0; i < VS.tbuf.length; i += 4) s += VS.tbuf[i] * VS.tbuf[i];
    const db = 10 * Math.log10(s / (VS.tbuf.length / 4) + 1e-9);
    VS.lv[t.id] = Math.max(0, Math.min(1, (db + 48) / 44));
  }
}
function vsSpectrum(n) {
  const out = new Float32Array(n);
  if (VS.an && S.playing) {
    if (!VS.fbuf) VS.fbuf = new Uint8Array(VS.an.frequencyBinCount);
    VS.an.getByteFrequencyData(VS.fbuf);
    const L = VS.fbuf.length, sr = S.audio.ctx.sampleRate;
    for (let i = 0; i < n; i++) {
      const f0 = 40 * Math.pow(14000 / 40, i / n), f1 = 40 * Math.pow(14000 / 40, (i + 1) / n);
      const a = Math.max(1, Math.floor(f0 / (sr / 2) * L)), b = Math.max(a + 1, Math.ceil(f1 / (sr / 2) * L));
      let m = 0;
      for (let k = a; k < b && k < L; k++) m = Math.max(m, VS.fbuf[k]);
      out[i] = m / 255;
    }
  } else {
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) out[i] = 0.12 + 0.08 * Math.sin(i * 0.35 + t * 1.6) * Math.sin(i * 0.11 + t * 0.7);
  }
  return out;
}
function vsInfo(beat) {
  const sec = secList().find((s) => beat >= s.start && beat < s.end);
  const ch = chordList().find((c) => beat >= c.start && beat < c.end && c.label !== "N");
  return { sec: sec ? (sec.name_ua || sec.name || sec.label || "") : "", ch: ch ? ch.label : "" };
}
function vsBg(g, W, H, beat) {
  const u = Math.min(W, H) / 1080;
  g.fillStyle = "#0b0c10";
  g.fillRect(0, 0, W, H);
  const t = beat * 0.15;
  let gr = g.createRadialGradient(W * (0.2 + 0.05 * Math.sin(t)), H * 0.12, 0, W * 0.2, H * 0.12, 900 * u);
  gr.addColorStop(0, "rgba(255,181,71,0.13)");
  gr.addColorStop(1, "rgba(255,181,71,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W * 0.85, H * (0.9 + 0.03 * Math.cos(t)), 0, W * 0.85, H * 0.9, 1000 * u);
  gr.addColorStop(0, "rgba(79,209,197,0.10)");
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
function vsHeader(g, W, H, beat, compact) {
  const u = Math.min(W, H) / 1080, pad = 60 * u;
  const title = VS.title || S.B.project.title, artist = VS.artist;
  const vertical = H > W;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#eef0f5";
  g.font = `800 ${(vertical ? 74 : 64) * u}px Inter, "Segoe UI", sans-serif`;
  let ty = pad + (vertical ? 120 : 70) * u;
  const maxW = W - pad * 2;
  let tt = title;
  while (g.measureText(tt).width > maxW && tt.length > 4) tt = tt.slice(0, -2);
  if (tt !== title) tt += "…";
  g.fillText(tt, pad, ty);
  if (artist) {
    g.fillStyle = "#ffb547";
    g.font = `600 ${(vertical ? 40 : 34) * u}px Inter, "Segoe UI", sans-serif`;
    ty += (vertical ? 62 : 50) * u;
    g.fillText(artist, pad, ty);
  }
  if (compact) return ty;
  const tm = S.B.timing, key = S.B.key;
  const chips = [`${Math.round(tm.bpm)} BPM`, `${NOTE_NAMES[key.tonic]} ${key.mode === "minor" ? "мінор" : "мажор"}`, `${tm.bpb}/4`];
  const info = vsInfo(beat);
  if (info.sec) chips.push(info.sec);
  g.font = `600 ${26 * u}px Inter, "Segoe UI", sans-serif`;
  let cx = pad;
  ty += 36 * u;
  for (const [i, c] of chips.entries()) {
    const w = g.measureText(c).width + 36 * u;
    if (cx + w > W - pad) break;
    g.fillStyle = i === 3 ? "rgba(255,181,71,0.16)" : "rgba(255,255,255,0.06)";
    vsRR(g, cx, ty, w, 46 * u, 23 * u);
    g.fill();
    g.fillStyle = i === 3 ? "#ffb547" : "#c9cdd8";
    g.fillText(c, cx + 18 * u, ty + 32 * u);
    cx += w + 12 * u;
  }
  return ty + 46 * u;
}
function vsFooter(g, W, H, beat, r0, r1) {
  const u = Math.min(W, H) / 1080, pad = 60 * u, P = period();
  const y = H - pad - (VS.wm ? 70 : 20) * u;
  const k = Math.max(0, Math.min(1, (beat - r0) / Math.max(1e-6, r1 - r0)));
  g.fillStyle = "rgba(255,255,255,0.08)";
  vsRR(g, pad, y, W - pad * 2, 8 * u, 4 * u);
  g.fill();
  const gr = g.createLinearGradient(pad, 0, W - pad, 0);
  gr.addColorStop(0, "#e0952a");
  gr.addColorStop(1, "#ffb547");
  g.fillStyle = gr;
  vsRR(g, pad, y, Math.max(8 * u, (W - pad * 2) * k), 8 * u, 4 * u);
  g.fill();
  g.font = `600 ${24 * u}px Inter, "Segoe UI", sans-serif`;
  g.fillStyle = "#8b91a3";
  g.textAlign = "left";
  g.fillText(vsFmtTime((beat - r0) * P), pad, y - 16 * u);
  g.textAlign = "right";
  g.fillText(vsFmtTime((r1 - r0) * P), W - pad, y - 16 * u);
  g.textAlign = "left";
  if (VS.wm) {
    const wy = H - pad - 34 * u;
    vsLogo(g, pad, wy - 4 * u, 40 * u);
    g.fillStyle = "#c9cdd8";
    g.font = `700 ${22 * u}px Inter, "Segoe UI", sans-serif`;
    g.fillText("Зроблено в INKBEAT", pad + 54 * u, wy + 24 * u);
  }
}
function vsStudio(g, W, H, beat, r0, r1) {
  vsBg(g, W, H, beat);
  const u = Math.min(W, H) / 1080, pad = 60 * u, P = period(), bpb = S.B.timing.bpb;
  const vertical = H > W;
  const top = vsHeader(g, W, H, beat) + 40 * u;
  const bottom = H - pad - (VS.wm ? 130 : 80) * u;
  const x0 = pad, x1 = W - pad, aw = x1 - x0;
  const bars = vertical ? 4 : W > H ? 8 : 6;
  const ppb = aw / (bars * bpb);
  const playX = x0 + aw * 0.32;
  const X = (b) => playX + (b - beat) * ppb;
  const rulerH = 92 * u;
  g.save();
  vsRR(g, x0, top, aw, bottom - top, 22 * u);
  g.clip();
  g.fillStyle = "rgba(20,22,29,0.85)";
  g.fillRect(x0, top, aw, bottom - top);
  const bLo = beat - (playX - x0) / ppb - 1, bHi = beat + (x1 - playX) / ppb + 1;
  for (const s of secList()) {
    if (s.end < bLo || s.start > bHi) continue;
    const a = X(s.start), b = X(s.end);
    g.fillStyle = vsAlpha(s.color || "#6b7280", 0.32);
    g.fillRect(a, top, b - a, 40 * u);
    g.fillStyle = "#eef0f5";
    g.font = `700 ${22 * u}px Inter, "Segoe UI", sans-serif`;
    g.fillText(s.name_ua || s.name || "", Math.max(a, x0) + 12 * u, top + 28 * u);
  }
  g.font = `600 ${20 * u}px Inter, "Segoe UI", sans-serif`;
  for (const c of chordList()) {
    if (c.end < bLo || c.start > bHi || c.label === "N") continue;
    const a = X(c.start), on = beat >= c.start && beat < c.end;
    g.fillStyle = on ? "#ffb547" : "#8b91a3";
    g.fillText(c.label, a + 8 * u, top + 72 * u);
  }
  for (let b = Math.floor(bLo / bpb) * bpb; b < bHi; b += 1) {
    const x = X(b), bar = b % bpb === 0;
    g.fillStyle = bar ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.035)";
    g.fillRect(x, top + rulerH, Math.max(1, u * (bar ? 2 : 1)), bottom - top - rulerH);
  }
  const list = tracksAll().filter((t) => !mt(t.id).mute);
  const n = Math.max(1, list.length), lanesH = bottom - top - rulerH - 10 * u;
  const lh = Math.min(vertical ? 190 * u : 150 * u, lanesH / n);
  let y = top + rulerH + 4 * u;
  const A = S.audio;
  for (const t of list) {
    const m = mt(t.id), col = t.color || "#888";
    const lvl = VS.lv[t.id] || 0;
    for (const c of m.clips) {
      if (c.mute) continue;
      const cb = c.start, ce = c.start + c.dur / P;
      if (ce < bLo || cb > bHi) continue;
      const a = X(cb), b = X(ce);
      g.fillStyle = vsAlpha(col, 0.16 + lvl * 0.12);
      vsRR(g, a, y + 3 * u, b - a, lh - 6 * u, 10 * u);
      g.fill();
      g.strokeStyle = vsAlpha(col, 0.55);
      g.lineWidth = 2 * u;
      g.stroke();
      const pk = t.has_audio && A && A.peaks ? A.peaks[srcKey(t)] : null;
      if (pk && (modeOf(t) !== "midi")) {
        g.fillStyle = vsAlpha(col, 0.55);
        const mid = y + lh / 2, amp = (lh - 18 * u) / 2;
        const xa = Math.max(a, x0), xb = Math.min(b, x1);
        for (let x = xa; x < xb; x += 3 * u) {
          const bb = beat + (x - playX) / ppb;
          const ts = c.src + (bb - cb) * P;
          const i = Math.floor(ts * 200);
          const v = i >= 0 && i < pk.length ? pk[i] : 0;
          const h = Math.max(1, Math.min(1, v * 1.6) * amp);
          g.fillRect(x, mid - h, 2 * u, h * 2);
        }
      }
    }
    const notes = arranged(t);
    if (notes.length) {
      let lo = 127, hi = 0;
      for (const nn of notes) { lo = Math.min(lo, nn[2]); hi = Math.max(hi, nn[2]); }
      const span = Math.max(12, hi - lo + 1), nh = Math.max(3 * u, (lh - 16 * u) / span);
      for (const nn of notes) {
        if (nn[0] + nn[1] < bLo || nn[0] > bHi) continue;
        const a = X(nn[0]), w = Math.max(3 * u, nn[1] * ppb - 2 * u);
        const ny = y + lh - 8 * u - (nn[2] - lo + 1) * ((lh - 16 * u) / span);
        const on = beat >= nn[0] && beat < nn[0] + nn[1];
        g.fillStyle = on ? "#ffffff" : vsAlpha(col, t.has_audio && modeOf(t) === "audio" ? 0.55 : 0.95);
        if (on) { g.shadowColor = col; g.shadowBlur = 18 * u; }
        vsRR(g, a, ny, w, nh, Math.min(3 * u, nh / 2));
        g.fill();
        g.shadowBlur = 0;
      }
    }
    g.fillStyle = "rgba(11,12,16,0.72)";
    g.font = `700 ${(vertical ? 26 : 22) * u}px Inter, "Segoe UI", sans-serif`;
    const tw = g.measureText(t.name).width;
    vsRR(g, x0 + 12 * u, y + 10 * u, tw + 44 * u, 38 * u, 10 * u);
    g.fill();
    g.fillStyle = col;
    vsRR(g, x0 + 22 * u, y + 20 * u, 8 * u, 18 * u, 3 * u);
    g.fill();
    g.fillStyle = "#eef0f5";
    g.fillText(t.name, x0 + 38 * u, y + 37 * u);
    if (lvl > 0.02) {
      g.fillStyle = vsAlpha(col, 0.9);
      g.fillRect(x0 + 12 * u, y + 52 * u, (tw + 44 * u) * lvl, 4 * u);
    }
    y += lh;
    if (y > bottom) break;
  }
  g.fillStyle = "#ffb547";
  g.shadowColor = "#ffb547";
  g.shadowBlur = 20 * u;
  g.fillRect(playX - 1.5 * u, top, 3 * u, bottom - top);
  g.shadowBlur = 0;
  g.restore();
  vsFooter(g, W, H, beat, r0, r1);
}
function vsKeys(lo, hi) {
  const white = [];
  for (let p = lo; p <= hi; p++) if (![1, 3, 6, 8, 10].includes(p % 12)) white.push(p);
  return white;
}
function vsNotes(g, W, H, beat, r0, r1) {
  vsBg(g, W, H, beat);
  const u = Math.min(W, H) / 1080, pad = 60 * u, bpb = S.B.timing.bpb;
  const vertical = H >= W;
  const top = vsHeader(g, W, H, beat, !vertical) + 30 * u;
  const bottom = H - pad - (VS.wm ? 130 : 80) * u;
  const list = tracksAll().filter((t) => !t.is_drums && !mt(t.id).mute);
  const all = [];
  for (const t of list) for (const n of arranged(t)) all.push([n[0], n[1], n[2], t]);
  let lo = 127, hi = 0;
  for (const n of all) { lo = Math.min(lo, n[2]); hi = Math.max(hi, n[2]); }
  if (lo > hi) { lo = 48; hi = 84; }
  lo = Math.max(21, lo - 2); hi = Math.min(108, hi + 2);
  while ([1, 3, 6, 8, 10].includes(lo % 12)) lo--;
  while ([1, 3, 6, 8, 10].includes(hi % 12)) hi++;
  const whites = vsKeys(lo, hi), nW = whites.length;
  const active = new Map();
  for (const n of all) if (beat >= n[0] && beat < n[0] + n[1]) active.set(n[2], n[3].color);
  if (vertical) {
    const kx0 = pad, kw = (W - pad * 2) / nW, keyH = Math.min(220 * u, kw * 6), keyY = bottom - keyH;
    const look = bpb * (H > W * 1.4 ? 4 : 2.5), ppb = (keyY - top) / look;
    const xOf = (p) => {
      const wi = whites.findIndex((w) => w >= p);
      const black = [1, 3, 6, 8, 10].includes(p % 12);
      return black ? kx0 + wi * kw - kw * 0.3 : kx0 + wi * kw;
    };
    g.save();
    g.beginPath();
    g.rect(0, top, W, keyY - top);
    g.clip();
    for (let b = Math.ceil(beat); b < beat + look + 1; b++) {
      const y = keyY - (b - beat) * ppb;
      g.fillStyle = b % bpb === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
      g.fillRect(kx0, y, W - pad * 2, Math.max(1, u * (b % bpb === 0 ? 2 : 1)));
    }
    for (const n of all) {
      if (n[0] > beat + look || n[0] + n[1] < beat - 0.1) continue;
      const black = [1, 3, 6, 8, 10].includes(n[2] % 12);
      const x = xOf(n[2]) + 2 * u, w = (black ? kw * 0.6 : kw) - 4 * u;
      const yb = keyY - (n[0] - beat) * ppb, yt = keyY - (n[0] + n[1] - beat) * ppb;
      const on = active.has(n[2]) && beat >= n[0];
      g.fillStyle = on ? "#ffffff" : n[3].color;
      if (on) { g.shadowColor = n[3].color; g.shadowBlur = 24 * u; }
      vsRR(g, x, yt, w, Math.max(6 * u, yb - yt - 2 * u), Math.min(10 * u, w / 2));
      g.fill();
      g.shadowBlur = 0;
    }
    g.restore();
    for (const [i, p] of whites.entries()) {
      const c = active.get(p);
      g.fillStyle = c || "#e9ebf1";
      vsRR(g, kx0 + i * kw + 1 * u, keyY, kw - 2 * u, keyH, 6 * u);
      g.fill();
      if (c) { g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(kx0 + i * kw + 1 * u, keyY, kw - 2 * u, 6 * u); }
    }
    for (let p = lo; p <= hi; p++) {
      if (![1, 3, 6, 8, 10].includes(p % 12)) continue;
      const c = active.get(p);
      g.fillStyle = c || "#15171d";
      vsRR(g, xOf(p), keyY, kw * 0.6, keyH * 0.62, 4 * u);
      g.fill();
    }
    g.fillStyle = "#ffb547";
    g.fillRect(kx0, keyY - 3 * u, W - pad * 2, 3 * u);
  } else {
    const ky0 = top, kh = (bottom - top) / nW, keyW = Math.min(200 * u, kh * 7), keyX = pad + keyW;
    const look = bpb * 3, ppb = (W - pad - keyX) / look;
    const yOf = (p) => {
      const wi = whites.findIndex((w) => w >= p);
      const black = [1, 3, 6, 8, 10].includes(p % 12);
      return black ? bottom - wi * kh - kh * 0.3 : bottom - (wi + 1) * kh;
    };
    g.save();
    g.beginPath();
    g.rect(keyX, 0, W - pad - keyX, H);
    g.clip();
    for (let b = Math.ceil(beat); b < beat + look + 1; b++) {
      const x = keyX + (b - beat) * ppb;
      g.fillStyle = b % bpb === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
      g.fillRect(x, top, Math.max(1, u * (b % bpb === 0 ? 2 : 1)), bottom - top);
    }
    for (const n of all) {
      if (n[0] > beat + look || n[0] + n[1] < beat - 0.1) continue;
      const black = [1, 3, 6, 8, 10].includes(n[2] % 12);
      const y = yOf(n[2]) + 2 * u, h = (black ? kh * 0.6 : kh) - 4 * u;
      const xa = keyX + (n[0] - beat) * ppb, xb = keyX + (n[0] + n[1] - beat) * ppb;
      const on = active.has(n[2]) && beat >= n[0];
      g.fillStyle = on ? "#ffffff" : n[3].color;
      if (on) { g.shadowColor = n[3].color; g.shadowBlur = 24 * u; }
      vsRR(g, xa, y, Math.max(6 * u, xb - xa - 2 * u), h, Math.min(8 * u, h / 2));
      g.fill();
      g.shadowBlur = 0;
    }
    g.restore();
    for (const [i, p] of whites.entries()) {
      const c = active.get(p);
      g.fillStyle = c || "#e9ebf1";
      vsRR(g, pad, bottom - (i + 1) * kh + 1 * u, keyW, kh - 2 * u, 5 * u);
      g.fill();
    }
    for (let p = lo; p <= hi; p++) {
      if (![1, 3, 6, 8, 10].includes(p % 12)) continue;
      const c = active.get(p);
      g.fillStyle = c || "#15171d";
      vsRR(g, pad, yOf(p), keyW * 0.62, kh * 0.6, 4 * u);
      g.fill();
    }
    g.fillStyle = "#ffb547";
    g.fillRect(keyX, top, 3 * u, bottom - top);
  }
  vsFooter(g, W, H, beat, r0, r1);
}
function vsWave(g, W, H, beat, r0, r1) {
  vsBg(g, W, H, beat);
  const u = Math.min(W, H) / 1080, vertical = H > W;
  const cx = W / 2, cy = vertical ? H * 0.42 : H * 0.5 - 20 * u, R = (vertical ? 250 : 210) * u;
  const sp = vsSpectrum(96);
  const pulse = S.playing ? 1 + 0.04 * Math.max(0, Math.cos((beat % 1) * Math.PI * 2)) : 1;
  for (let i = 0; i < 96; i++) {
    const a = -Math.PI / 2 + (i / 96) * Math.PI * 2, len = (14 + sp[i] * 190) * u;
    const c = i / 96;
    g.strokeStyle = `rgba(${Math.round(255 - 176 * c)},${Math.round(181 + 28 * c)},${Math.round(71 + 126 * c)},${0.55 + sp[i] * 0.45})`;
    g.lineWidth = 9 * u;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R + 16 * u), cy + Math.sin(a) * (R + 16 * u));
    g.lineTo(cx + Math.cos(a) * (R + 16 * u + len), cy + Math.sin(a) * (R + 16 * u + len));
    g.stroke();
  }
  g.fillStyle = "#14161d";
  g.beginPath();
  g.arc(cx, cy, R * pulse, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,181,71,0.35)";
  g.lineWidth = 3 * u;
  g.stroke();
  vsLogo(g, cx - 70 * u * pulse, cy - 70 * u * pulse, 140 * u * pulse);
  const title = VS.title || S.B.project.title, info = vsInfo(beat);
  g.textAlign = "center";
  const ty = vertical ? cy + R + 300 * u : 150 * u;
  g.fillStyle = "#eef0f5";
  g.font = `800 ${(vertical ? 76 : 62) * u}px Inter, "Segoe UI", sans-serif`;
  let tt = title;
  while (g.measureText(tt).width > W - 120 * u && tt.length > 4) tt = tt.slice(0, -2);
  g.fillText(tt === title ? tt : tt + "…", cx, ty);
  if (VS.artist) {
    g.fillStyle = "#ffb547";
    g.font = `600 ${(vertical ? 40 : 34) * u}px Inter, "Segoe UI", sans-serif`;
    g.fillText(VS.artist, cx, ty + 60 * u);
  }
  const line = [info.sec, info.ch].filter(Boolean).join("  ·  ");
  if (line) {
    g.fillStyle = "#c9cdd8";
    g.font = `600 ${30 * u}px Inter, "Segoe UI", sans-serif`;
    g.fillText(line, cx, vertical ? ty + 130 * u : H - 250 * u);
  }
  g.textAlign = "left";
  const list = tracksAll().filter((t) => !mt(t.id).mute).slice(0, 10);
  g.font = `700 ${22 * u}px Inter, "Segoe UI", sans-serif`;
  const ws = list.map((t) => g.measureText(t.name).width + 52 * u);
  const rows = [];
  let row = [], rw = 0;
  for (let i = 0; i < list.length; i++) {
    if (rw + ws[i] > W - 140 * u && row.length) { rows.push([row, rw]); row = []; rw = 0; }
    row.push(i);
    rw += ws[i] + 12 * u;
  }
  if (row.length) rows.push([row, rw]);
  let ry = vertical ? ty + (line ? 200 : 130) * u : cy + R + 140 * u;
  for (const [r, w] of rows) {
    let x = (W - w + 12 * u) / 2;
    for (const i of r) {
      const t = list[i], l = VS.lv[t.id] || 0;
      g.fillStyle = vsAlpha(t.color, 0.12 + l * 0.5);
      vsRR(g, x, ry, ws[i], 46 * u, 23 * u);
      g.fill();
      g.fillStyle = t.color;
      g.beginPath();
      g.arc(x + 22 * u, ry + 23 * u, (6 + l * 6) * u, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#eef0f5";
      g.fillText(t.name, x + 38 * u, ry + 31 * u);
      x += ws[i] + 12 * u;
    }
    ry += 58 * u;
  }
  vsFooter(g, W, H, beat, r0, r1);
}
function vsScreen(g, W, H, beat) {
  const v = VS.screen;
  g.fillStyle = "#0b0c10";
  g.fillRect(0, 0, W, H);
  const u = Math.min(W, H) / 1080;
  if (!v || !v.videoWidth) {
    vsBg(g, W, H, 0);
    g.fillStyle = "#c9cdd8";
    g.textAlign = "center";
    g.font = `700 ${46 * u}px Inter, "Segoe UI", sans-serif`;
    g.fillText("Запис екрана програми", W / 2, H / 2 - 30 * u);
    g.font = `500 ${28 * u}px Inter, "Segoe UI", sans-serif`;
    g.fillStyle = "#8b91a3";
    g.fillText("Натисніть «Записати» й оберіть вікно InkBeat", W / 2, H / 2 + 30 * u);
    g.textAlign = "left";
    return;
  }
  const vw = v.videoWidth, vh = v.videoHeight;
  const cover = Math.max(W / vw, H / vh), fit = Math.min(W / vw, H / vh);
  g.save();
  g.filter = `blur(${Math.round(40 * u)}px) brightness(0.45)`;
  g.drawImage(v, (W - vw * cover) / 2, (H - vh * cover) / 2, vw * cover, vh * cover);
  g.restore();
  const dw = vw * fit, dh = vh * fit;
  g.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  if (H > W * 1.2) {
    const tb = (H - dh) / 2;
    if (tb > 180 * u) {
      g.fillStyle = "#eef0f5";
      g.textAlign = "center";
      g.font = `800 ${64 * u}px Inter, "Segoe UI", sans-serif`;
      g.fillText(VS.title || S.B.project.title, W / 2, tb / 2 + 10 * u);
      if (VS.artist) {
        g.fillStyle = "#ffb547";
        g.font = `600 ${36 * u}px Inter, "Segoe UI", sans-serif`;
        g.fillText(VS.artist, W / 2, tb / 2 + 64 * u);
      }
      g.textAlign = "left";
    }
  }
  if (VS.wm) {
    const pad = 40 * u, wy = H - pad - 40 * u;
    g.fillStyle = "rgba(11,12,16,0.7)";
    vsRR(g, pad - 10 * u, wy - 10 * u, 330 * u, 60 * u, 14 * u);
    g.fill();
    vsLogo(g, pad, wy, 40 * u);
    g.fillStyle = "#e9ebf1";
    g.font = `700 ${22 * u}px Inter, "Segoe UI", sans-serif`;
    g.fillText("Зроблено в INKBEAT", pad + 54 * u, wy + 28 * u);
  }
}
function vsDraw(beat, r) {
  const g = VS.g, W = VS.canvas.width, H = VS.canvas.height;
  if (!r) r = vsRange();
  vsLevels();
  if (VS.style === "notes") vsNotes(g, W, H, beat, r[0], r[1]);
  else if (VS.style === "wave") vsWave(g, W, H, beat, r[0], r[1]);
  else if (VS.style === "screen") vsScreen(g, W, H, beat);
  else vsStudio(g, W, H, beat, r[0], r[1]);
}
function vsCanvas() {
  const [w, h] = vsSize();
  const c = VS.canvas;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const box = $("#vs-stage"), bw = box.clientWidth - 24, bh = box.clientHeight - 24;
  const k = Math.min(bw / w, bh / h);
  c.style.width = Math.floor(w * k) + "px";
  c.style.height = Math.floor(h * k) + "px";
}
function vsTap() {
  const A = ensureCtx();
  if (!A.master) rebuildStrips();
  if (!VS.an || VS.an.context !== A.ctx) {
    VS.an = A.ctx.createAnalyser();
    VS.an.fftSize = 2048;
    VS.an.smoothingTimeConstant = 0.75;
    VS.fbuf = null;
  }
  try { A.master.out.connect(VS.an); } catch (e) {}
  return A;
}
function vsLoop() {
  cancelAnimationFrame(VS.raf);
  const step = () => {
    if (!VS.canvas || $("#vs-modal").hidden && !VS.busy) return;
    const b = S.playing ? curBeat() : S.playBeat;
    vsDraw(b);
    VS.raf = requestAnimationFrame(step);
  };
  VS.raf = requestAnimationFrame(step);
}
function vsPanel() {
  const secs = secList();
  const opt = (v, l) => `<option value="${v}" ${VS.range === v ? "selected" : ""}>${escapeHtml(l)}</option>`;
  const bars = Math.ceil(arrEnd() / S.B.timing.bpb);
  return `
    <div class="vs-sec"><div class="vs-h">Формат</div><div class="vs-fmts">${Object.entries(VFMT).map(([k, f]) => `<button class="vs-fmt ${VS.fmt === k ? "on" : ""}" data-fmt="${k}"><i style="aspect-ratio:${f.w}/${f.h}"></i><b>${f.tag}</b><span>${f.name}</span></button>`).join("")}</div></div>
    <div class="vs-sec"><div class="vs-h">Стиль</div><div class="vs-styles">${Object.entries(VSTYLES).map(([k, s]) => `<button class="vs-style ${VS.style === k ? "on" : ""}" data-style="${k}"><b>${s[0]}</b><span>${s[1]}</span></button>`).join("")}</div></div>
    <div class="vs-sec" ${VS.style === "screen" ? "hidden" : ""}><div class="vs-h">Що записати</div>
      <select id="vs-range">${opt("all", "Усю пісню")}${opt("cursor", "Від курсору до кінця")}${opt("bars", "Такти від… до…")}${secs.map((s, i) => opt("sec:" + i, `Секція: ${s.name_ua || s.name || i + 1} (такти ${Math.round(s.start / S.B.timing.bpb) + 1}–${Math.round(s.end / S.B.timing.bpb)})`)).join("")}</select>
      <div class="vs-bars" ${VS.range === "bars" ? "" : "hidden"}>з такту <input type="number" id="vs-from" min="1" max="${bars}" value="1"> по <input type="number" id="vs-to" min="1" max="${bars}" value="${Math.min(bars, 8)}"></div>
      <div class="muted small" id="vs-dur"></div></div>
    <div class="vs-sec"><div class="vs-h">Текст на відео</div>
      <input type="text" id="vs-title" maxlength="60" placeholder="Назва треку" value="${escapeHtml(VS.title || S.B.project.title)}">
      <input type="text" id="vs-artist" maxlength="60" placeholder="Ваш нік або ім'я (необов'язково)" value="${escapeHtml(VS.artist || "")}">
      <label class="vs-chk"><input type="checkbox" id="vs-wm" ${VS.wm ? "checked" : ""}> Підпис «Зроблено в INKBEAT»</label></div>
    <div class="vs-sec"><div class="vs-h">Якість</div>
      <div class="np-seg"><button type="button" data-q="1080" class="${VS.q === 1080 ? "on" : ""}">1080p</button><button type="button" data-q="720" class="${VS.q === 720 ? "on" : ""}">720p — легше для слабкого ПК</button></div>
      <label class="vs-chk" ${VS.style === "screen" ? "hidden" : ""}><input type="checkbox" id="vs-hq" ${VS.hq ? "checked" : ""}> Якісний звук, як в експорті (довше, але чистіше)</label>
      <label class="vs-chk" ${VS.style === "screen" ? "" : "hidden"}><input type="checkbox" id="vs-mic" ${VS.mic ? "checked" : ""}> Додати мікрофон (ваш голос поверх)</label></div>
    <div class="vs-tip muted small">${VS.style === "screen" ? "Під час запису вікно відеостудії сховається, а вгорі з'явиться кнопка «Зупинити». Звук програми записується напряму, без шумів кімнати." : "Запис іде в реальному часі: пісня програється, а відео малюється разом з нею. Не згортайте вікно під час запису."}</div>`;
}
function vsUpdateDur() {
  const el = $("#vs-dur");
  if (!el) return;
  const r = vsRange(), d = (r[1] - r[0]) * period();
  el.textContent = `Тривалість: ${vsFmtTime(d)}${VS.fmt === "tiktok" && d > 180 ? " · для TikTok краще до 3 хвилин — оберіть секцію" : ""}`;
}
function vsBind() {
  const p = $("#vs-panel");
  p.querySelectorAll("[data-fmt]").forEach((b) => b.onclick = () => { VS.fmt = b.dataset.fmt; vsSave(); vsRender(); });
  p.querySelectorAll("[data-style]").forEach((b) => b.onclick = () => { VS.style = b.dataset.style; vsSave(); vsRender(); });
  p.querySelectorAll("[data-q]").forEach((b) => b.onclick = () => { VS.q = +b.dataset.q; vsSave(); vsRender(); });
  const rg = $("#vs-range");
  if (rg) rg.onchange = () => {
    VS.range = rg.value;
    $(".vs-bars").hidden = VS.range !== "bars";
    const r = vsRange();
    S.playBeat = r[0];
    vsUpdateDur();
  };
  ["#vs-from", "#vs-to"].forEach((id) => { if ($(id)) $(id).oninput = vsUpdateDur; });
  $("#vs-title").oninput = (e) => { VS.title = e.target.value; };
  $("#vs-artist").oninput = (e) => { VS.artist = e.target.value; vsSave(); };
  $("#vs-wm").onchange = (e) => { VS.wm = e.target.checked; vsSave(); };
  if ($("#vs-hq")) $("#vs-hq").onchange = (e) => { VS.hq = e.target.checked; vsSave(); };
  if ($("#vs-mic")) $("#vs-mic").onchange = (e) => { VS.mic = e.target.checked; vsSave(); };
  vsUpdateDur();
}
function vsRender() {
  $("#vs-panel").innerHTML = vsPanel();
  vsBind();
  vsCanvas();
  $("#vs-play").hidden = VS.style === "screen";
}
function openVideoStudio() {
  if (!S.B) return toast("Спершу відкрийте проєкт.", true);
  vsLoad();
  VS.title = VS.title && VS.pid === S.pid ? VS.title : S.B.project.title;
  VS.pid = S.pid;
  if (!tracksAll().length) toast("У проєкті ще немає доріжок — відео буде порожнім.", true);
  let m = $("#vs-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "vs-modal";
    m.innerHTML = `<div class="modal-card vs-card"><div class="modal-head"><h3>Відеостудія</h3><span class="muted small vs-sub">Відео вашого треку для соцмереж</span><button class="x" id="vs-x">&times;</button></div>
      <div class="vs-body"><div class="vs-stage" id="vs-stage"><canvas id="vs-canvas"></canvas></div>
      <div class="vs-side"><div class="vs-panel" id="vs-panel"></div>
      <div class="vs-actions" id="vs-actions"><button class="btn ghost" id="vs-play">▶ Переглянути</button><button class="btn primary" id="vs-rec"><i class="vs-dot"></i>Записати відео</button></div></div></div></div>`;
    document.body.appendChild(m);
    VS.canvas = $("#vs-canvas");
    VS.g = VS.canvas.getContext("2d");
    $("#vs-x").onclick = () => vsClose();
    m.addEventListener("click", (e) => { if (e.target === m && !VS.busy) vsClose(); });
    $("#vs-play").onclick = () => {
      if (VS.busy) return;
      vsTap();
      if (S.playing) stopPlay();
      else {
        const r = vsRange();
        if (S.playBeat < r[0] || S.playBeat >= r[1]) S.playBeat = r[0];
        play();
      }
    };
    $("#vs-rec").onclick = () => VS.busy ? (VS.stop = true) : vsRecord();
    window.addEventListener("resize", () => { if (!$("#vs-modal").hidden) vsCanvas(); });
  }
  m.hidden = false;
  vsRender();
  vsTap();
  vsLoop();
}
function vsClose() {
  if (VS.busy) return toast("Зачекайте, поки закінчиться запис, або натисніть «Зупинити».", true);
  if (S.playing) stopPlay();
  $("#vs-modal").hidden = true;
  cancelAnimationFrame(VS.raf);
}
function vsMime() {
  const list = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return list.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
}
function vsStatus(html) {
  $("#vs-actions").innerHTML = html;
}
function vsResetActions() {
  vsStatus(`<button class="btn ghost" id="vs-play">▶ Переглянути</button><button class="btn primary" id="vs-rec"><i class="vs-dot"></i>Записати відео</button>`);
  $("#vs-play").hidden = VS.style === "screen";
  $("#vs-play").onclick = () => {
    vsTap();
    if (S.playing) stopPlay();
    else { const r = vsRange(); if (S.playBeat < r[0] || S.playBeat >= r[1]) S.playBeat = r[0]; play(); }
  };
  $("#vs-rec").onclick = () => VS.busy ? (VS.stop = true) : vsRecord();
}
async function vsRecord() {
  if (!window.MediaRecorder || !VS.canvas.captureStream) return toast("Запис відео недоступний у цьому вікні.", true);
  if (VS.style === "screen") return vsScreenRecord();
  const r = vsRange(), P = period();
  if (r[1] - r[0] < 1) return toast("Діапазон занадто короткий.", true);
  VS.busy = true;
  VS.stop = false;
  vsCanvas();
  const A = vsTap();
  await A.ctx.resume();
  await loadInstrumentBuffers();
  if (S.playing) stopPlay();
  const fps = 30;
  const dest = A.ctx.createMediaStreamDestination();
  A.master.out.connect(dest);
  const stream = new MediaStream([...VS.canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = vsMime();
  const [w, h] = vsSize();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(w * h * fps * 0.14), audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => rec.onstop = res);
  S.playBeat = r[0];
  vsDraw(r[0], r);
  const started = new Promise((res) => rec.onstart = res);
  rec.start(500);
  await started;
  const recStart = performance.now();
  await new Promise((res) => setTimeout(res, 120));
  play();
  const audioStart = performance.now() + (S.startCtx - A.ctx.currentTime) * 1000;
  const lead = (audioStart - recStart) / 1000;
  vsStatus(`<div class="vs-prog"><div class="pbar"><div id="vs-pb"></div></div><span id="vs-pt">0:00</span></div><button class="btn ghost" id="vs-stop">Зупинити</button>`);
  $("#vs-stop").onclick = () => { VS.stop = true; };
  cancelAnimationFrame(VS.raf);
  let endBeat = r[1];
  await new Promise((res) => {
    const step = () => {
      const b = S.playing ? curBeat() : endBeat;
      vsDraw(Math.min(b, r[1]), r);
      const k = (b - r[0]) / (r[1] - r[0]);
      const pb = $("#vs-pb");
      if (pb) { pb.style.width = Math.min(100, k * 100) + "%"; $("#vs-pt").textContent = `${vsFmtTime((b - r[0]) * P)} / ${vsFmtTime((r[1] - r[0]) * P)}`; }
      if (b >= r[1] || VS.stop || !S.playing) { endBeat = Math.min(b, r[1]); res(); return; }
      VS.raf = requestAnimationFrame(step);
    };
    VS.raf = requestAnimationFrame(step);
  });
  stopPlay();
  vsDraw(endBeat, r);
  await new Promise((res) => setTimeout(res, 350));
  rec.stop();
  await stopped;
  try { A.master.out.disconnect(dest); } catch (e) {}
  const blob = new Blob(chunks, { type: (mime || "video/webm").split(";")[0] });
  const duration = (endBeat - r[0]) * P + lead + 0.3;
  await vsUpload(blob, { hq: VS.hq, audio_start: r[0] * P, lead, duration, fps });
}
async function vsUpload(blob, o) {
  try {
    if (o.hq) {
      vsStatus(`<div class="vs-prog"><div class="pbar"><div id="vs-pb" style="width:2%"></div></div><span id="vs-pt">Готую якісний звук…</span></div>`);
      await flushMix();
      await renderAll((msg, f) => {
        const pb = $("#vs-pb");
        if (pb) pb.style.width = Math.round((f || 0) * 100) + "%";
        if ($("#vs-pt")) $("#vs-pt").textContent = "Якісний звук: " + (msg || "");
      });
    }
    vsStatus(`<div class="vs-prog"><div class="pbar"><div id="vs-pb" style="width:2%"></div></div><span id="vs-pt">Збираю відео…</span></div>`);
    const f = VFMT[VS.fmt];
    const fd = new FormData();
    fd.append("file", blob, blob.type.includes("mp4") ? "video.mp4" : "video.webm");
    fd.append("title", VS.title || S.B.project.title);
    fd.append("label", `${f.file}${VS.style === "screen" ? " - екран" : ""}`);
    fd.append("hq", o.hq ? "1" : "0");
    fd.append("audio_start", String(o.audio_start || 0));
    fd.append("lead", String(o.lead || 0));
    fd.append("duration", String(o.duration || 0));
    fd.append("fps", String(o.fps || 30));
    const r = await fetch(`/api/project/${S.pid}/video`, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "помилка");
    const res = await careWait(j.job, (p) => {
      const pb = $("#vs-pb");
      if (pb) pb.style.width = Math.round(p * 100) + "%";
      if ($("#vs-pt")) $("#vs-pt").textContent = `Збираю відео… ${Math.round(p * 100)}%`;
    });
    VS.busy = false;
    vsResult(res);
  } catch (e) {
    VS.busy = false;
    vsStatus(`<div class="vs-err warn">Не вдалося зберегти відео: ${escapeHtml(e.message)}</div><button class="btn primary" id="vs-again">Спробувати ще</button>`);
    $("#vs-again").onclick = vsResetActions;
  }
}
function vsResult(res) {
  const url = `/api/project/${S.pid}/video/file/${encodeURIComponent(res.file)}`;
  $("#vs-stage").innerHTML = `<video id="vs-video" src="${url}" controls autoplay playsinline></video>`;
  const v = $("#vs-video"), [w, h] = vsSize(), box = $("#vs-stage");
  const k = Math.min((box.clientWidth - 24) / w, (box.clientHeight - 24) / h);
  v.style.width = Math.floor(w * k) + "px";
  v.style.height = Math.floor(h * k) + "px";
  vsStatus(`<div class="vs-done"><b>Відео готове</b><span class="muted small">${escapeHtml(res.file)}${res.size ? " · " + fmtSize(res.size) : ""}${res.note ? "<br>" + escapeHtml(res.note) : ""}</span></div>
    <button class="btn ghost" id="vs-new">Записати ще</button><button class="btn primary" id="vs-open">Відкрити папку</button>`);
  $("#vs-open").onclick = () => api.post(`/api/project/${S.pid}/video/open`, {});
  $("#vs-new").onclick = () => {
    $("#vs-stage").innerHTML = `<canvas id="vs-canvas"></canvas>`;
    VS.canvas = $("#vs-canvas");
    VS.g = VS.canvas.getContext("2d");
    vsResetActions();
    vsRender();
    vsLoop();
  };
  toast("Відео збережено в папку проєкту «video».");
}
async function vsScreenRecord() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return toast("Запис екрана недоступний у цьому вікні. Оберіть інший стиль відео.", true);
  let disp;
  try {
    disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
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
  let mic = null, micSrc = null;
  if (VS.mic) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micSrc = A.ctx.createMediaStreamSource(mic);
      micSrc.connect(dest);
    } catch (e) {
      toast("Мікрофон недоступний — записую лише звук програми.", true);
    }
  }
  const fps = 30, [w, h] = vsSize(), mime = vsMime();
  const stream = new MediaStream([...VS.canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(w * h * fps * 0.14), audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => rec.onstop = res);
  $("#vs-modal").hidden = true;
  const pill = document.createElement("div");
  pill.id = "vs-pill";
  pill.innerHTML = `<i class="vs-dot"></i><span id="vs-pill-t">0:00</span><button class="btn small" id="vs-pill-stop">Зупинити запис</button>`;
  document.body.appendChild(pill);
  $("#vs-pill-stop").onclick = () => { VS.stop = true; };
  disp.getVideoTracks()[0].addEventListener("ended", () => { VS.stop = true; });
  rec.start(500);
  const t0 = performance.now();
  cancelAnimationFrame(VS.raf);
  await new Promise((res) => {
    const step = () => {
      vsDraw(S.playing ? curBeat() : S.playBeat);
      $("#vs-pill-t").textContent = vsFmtTime((performance.now() - t0) / 1000);
      if (VS.stop) { res(); return; }
      VS.raf = requestAnimationFrame(step);
    };
    VS.raf = requestAnimationFrame(step);
  });
  const duration = (performance.now() - t0) / 1000;
  rec.stop();
  await stopped;
  disp.getTracks().forEach((t) => t.stop());
  if (mic) mic.getTracks().forEach((t) => t.stop());
  try { A.master.out.disconnect(dest); } catch (e) {}
  pill.remove();
  VS.screen = null;
  $("#vs-modal").hidden = false;
  const blob = new Blob(chunks, { type: (mime || "video/webm").split(";")[0] });
  await vsUpload(blob, { hq: false, duration, fps });
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
