"use strict";
const TC = { tid: null, view: "guitar", from: 1, to: 4, speed: 0.75, minus: false, audio: null, raf: 0, m: null, seg: null, loop: true };
const GUITAR = [64, 59, 55, 50, 45, 40], BASS = [43, 38, 33, 28];
const NN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OPEN_CHORDS = {
  "C": [-1, 3, 2, 0, 1, 0], "D": [-1, -1, 0, 2, 3, 2], "E": [0, 2, 2, 1, 0, 0], "G": [3, 2, 0, 0, 0, 3], "A": [-1, 0, 2, 2, 2, 0],
  "Am": [-1, 0, 2, 2, 1, 0], "Em": [0, 2, 2, 0, 0, 0], "Dm": [-1, -1, 0, 2, 3, 1],
  "E7": [0, 2, 0, 1, 0, 0], "A7": [-1, 0, 2, 0, 2, 0], "D7": [-1, -1, 0, 2, 1, 2], "G7": [3, 2, 0, 0, 0, 1], "C7": [-1, 3, 2, 3, 1, 0], "B7": [-1, 2, 1, 2, 0, 2],
  "Am7": [-1, 0, 2, 0, 1, 0], "Em7": [0, 2, 0, 0, 0, 0], "Dm7": [-1, -1, 0, 2, 1, 1], "Cmaj7": [-1, 3, 2, 0, 0, 0], "Fmaj7": [-1, -1, 3, 2, 1, 0], "Amaj7": [-1, 0, 2, 1, 2, 0], "Dmaj7": [-1, -1, 0, 2, 2, 2],
  "Asus4": [-1, 0, 2, 2, 3, 0], "Dsus4": [-1, -1, 0, 2, 3, 3], "Esus4": [0, 2, 2, 2, 0, 0], "Asus2": [-1, 0, 2, 2, 0, 0], "Dsus2": [-1, -1, 0, 2, 3, 0]
};
function chordParse(label) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(label || "");
  if (!m) return null;
  let pc = NN.indexOf(m[1]) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  pc = (pc + 12) % 12;
  const q = m[3].replace(/^:/, "");
  const qual = /^(min|m)(?!aj)/.test(q) ? (/7/.test(q) ? "m7" : "m") : /maj7|M7/.test(q) ? "maj7" : /sus4/.test(q) ? "sus4" : /sus2/.test(q) ? "sus2" : /dim/.test(q) ? "dim" : /7/.test(q) ? "7" : "";
  return { pc, qual, name: NN[pc] + qual };
}
function chordShape(label) {
  const c = chordParse(label);
  if (!c) return null;
  if (OPEN_CHORDS[c.name]) return { frets: OPEN_CHORDS[c.name], name: c.name };
  const E = { "": [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, -1, 1, 1, 0, -1], sus4: [0, 2, 2, 2, 0, 0], sus2: [0, 2, 4, 4, 0, 0], dim: [0, 1, 2, 0, -1, -1] };
  const A = { "": [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], 7: [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0], dim: [-1, 0, 1, 2, 1, -1] };
  const rE = (c.pc - 4 + 12) % 12, rA = (c.pc - 9 + 12) % 12;
  const useE = rE <= rA || !A[c.qual];
  const base = useE ? E[c.qual] || E[""] : A[c.qual] || A[""], r = useE ? rE : rA;
  return { frets: base.map((f) => (f < 0 ? -1 : f + r)), name: c.name, barre: r };
}
function chordNotes(label) {
  const c = chordParse(label);
  if (!c) return [];
  const iv = { "": [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6] }[c.qual] || [0, 4, 7];
  return iv.map((x) => 60 + ((c.pc + x) % 12));
}
function tabFinger(notes, strings, maxFret = 17) {
  const out = [];
  let hand = 3;
  const groups = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.t - n[0]) < 0.04) g.ns.push(n);
    else groups.push({ t: n[0], ns: [n] });
  }
  for (const g of groups) {
    const used = new Set();
    const ns = g.ns.slice().sort((a, b) => b[2] - a[2]);
    for (const n of ns) {
      let best = null;
      strings.forEach((open, si) => {
        if (used.has(si)) return;
        const f = n[2] - open;
        if (f < 0 || f > maxFret) return;
        const cost = Math.abs(f - hand) + (f === 0 ? -0.5 : 0) + f * 0.08;
        if (!best || cost < best.cost) best = { si, f, cost };
      });
      if (!best) continue;
      used.add(best.si);
      out.push({ t: n[0], d: n[1], s: best.si, f: best.f, p: n[2] });
      if (best.f > 0) hand = hand * 0.4 + best.f * 0.6;
    }
  }
  return out;
}
function tcTracks() {
  return tracksAll().filter((t) => !t.is_drums && trackNotes(t).length);
}
function tcRange() {
  const bpb = S.B.timing.bpb;
  return { a: tmU((TC.from - 1) * bpb), b: tmU(TC.to * bpb) };
}
function tcBeatNow() {
  if (TC.audio && !TC.audio.paused && TC.seg) return TC.seg.a + TC.audio.currentTime * TC.seg.speed / period();
  return S.playBeat;
}
function openTeacher() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const list = tcTracks();
  if (!TC.tid || !findT(TC.tid)) {
    const sel = S.sel && findT(S.sel);
    TC.tid = sel && !sel.is_drums && trackNotes(sel).length ? sel.id : (list.find((t) => /guitar|гітар/i.test(t.name)) || list.find((t) => /bass|бас/i.test(t.name)) || list[0] || {}).id;
    const t = TC.tid && findT(TC.tid);
    if (t) TC.view = /bass|бас/i.test(t.name) ? "bass" : /piano|keys|клав|піан/i.test(t.name) ? "piano" : "guitar";
  }
  const cur = Math.max(1, Math.floor(tmM(S.playBeat) / S.B.timing.bpb) + 1);
  if (S.loop && S.loop.on) { TC.from = Math.floor(tmM(S.loop.a) / S.B.timing.bpb) + 1; TC.to = Math.max(TC.from, Math.ceil(tmM(S.loop.b) / S.B.timing.bpb)); }
  else if (!TC.opened) { TC.from = cur; TC.to = cur + 3; }
  TC.opened = true;
  let m = document.getElementById("teach-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "teach-modal";
    document.body.appendChild(m);
    if (!UIP.mfloat["teach-modal"]) { UIP.mfloat["teach-modal"] = { on: true, rect: { x: Math.max(10, innerWidth / 2 - 560), y: 110, w: 1120, h: Math.min(700, innerHeight - 140) } }; saveUI(); }
  }
  TC.m = m;
  tcRender();
  m.hidden = false;
  tcLoop();
}
function tcRender() {
  const m = TC.m, list = tcTracks(), speeds = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1];
  m.innerHTML = `<div class="modal-card teach-card"><div class="modal-head"><h3>Вчитель</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body teach-body">
      <div class="tc-top">
        <label>Партія <select id="tc-t">${list.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === TC.tid ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label>
        <div class="seg small" id="tc-view">${[["guitar", "Гітара"], ["bass", "Бас"], ["piano", "Піаніно"], ["chords", "Акорди"]].map(([k, l]) => `<button data-v="${k}" class="${TC.view === k ? "active" : ""}">${l}</button>`).join("")}</div>
        <label data-hint="Які такти вчити">Такти <input type="number" id="tc-from" min="1" value="${TC.from}"> – <input type="number" id="tc-to" min="1" value="${TC.to}"></label>
      </div>
      <div class="tc-practice">
        <button class="btn primary sm" id="tc-play" data-hint="Грати вибрані такти повільніше — тон не змінюється">▶ Грати</button>
        <label data-hint="Швидкість для практики. Тон пісні залишається тим самим">Швидкість <select id="tc-speed">${speeds.map((s) => `<option value="${s}" ${Math.abs(s - TC.speed) < 1e-3 ? "selected" : ""}>${Math.round(s * 100)}%</option>`).join("")}</select></label>
        <label class="chk" data-hint="Прибрати цю партію з фонограми — грайте її самі"><input type="checkbox" id="tc-minus" ${TC.minus ? "checked" : ""}> Без цієї партії (граю сам)</label>
        <label class="chk"><input type="checkbox" id="tc-loop" ${TC.loop ? "checked" : ""}> По колу</label>
        <span class="muted small" id="tc-status"></span>
      </div>
      <canvas id="tc-cv"></canvas>
      <div class="muted small tc-help" id="tc-help"></div>
    </div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => { m.hidden = true; tcStop(); cancelAnimationFrame(TC.raf); TC.raf = 0; });
  $("#tc-t", m).onchange = (e) => { TC.tid = e.target.value; tcStop(); tcRender(); };
  $$("[data-v]", m).forEach((b) => b.onclick = () => { TC.view = b.dataset.v; tcRender(); });
  const rng = () => { TC.from = Math.max(1, +$("#tc-from", m).value || 1); TC.to = Math.max(TC.from, +$("#tc-to", m).value || TC.from); tcStop(); };
  $("#tc-from", m).onchange = rng;
  $("#tc-to", m).onchange = rng;
  $("#tc-speed", m).onchange = (e) => { TC.speed = +e.target.value; tcStop(); };
  $("#tc-minus", m).onchange = (e) => { TC.minus = e.target.checked; tcStop(); };
  $("#tc-loop", m).onchange = (e) => { TC.loop = e.target.checked; if (TC.audio) TC.audio.loop = TC.loop; };
  $("#tc-play", m).onclick = () => (TC.audio && !TC.audio.paused ? tcStop() : tcPlay());
  const help = { guitar: "Табулатура: шість ліній — струни (вгорі тонка ми, внизу товста ми), цифра — лад. Аплікатуру підібрано так, щоб рука рухалась якнайменше.", bass: "Табулатура бас-гітари: чотири струни (вгорі соль, внизу ми), цифра — лад.", piano: "Ноти падають згори на клавіші — натискайте, коли нота торкається клавіатури. Підсвічено ноти, що звучать зараз.", chords: "Акорди фрагмента: зверху — послідовність, під нею — як узяти поточний акорд на гітарі та які клавіші на піаніно." };
  $("#tc-help", m).textContent = help[TC.view];
}
async function tcPlay() {
  const t = findT(TC.tid);
  const { a, b } = tcRange();
  const P = period(), pad = S.B.timing.pad;
  const st = $("#tc-status");
  st.textContent = "Готую фонограму…";
  const sources = {};
  for (const x of S.B.tracks) if (mt(x.id) && mt(x.id).source) sources[x.id] = mt(x.id).source;
  const exclude = TC.minus && t ? [baseId(t)] : [];
  const r = await api.post(`/api/project/${S.pid}/practice`, { from: a * P - pad, to: b * P - pad, speed: TC.speed, exclude, sources }).catch((e) => ({ error: e.message }));
  if (r.error) { st.textContent = ""; return toast(r.error, true); }
  if (S.playing) stopPlay();
  tcStop();
  const au = new Audio(r.url);
  au.loop = TC.loop;
  TC.audio = au;
  TC.seg = { a, b, speed: TC.speed };
  if (TC.minus && t && !t.has_audio) toast("Ця партія — MIDI: у фонограмі її і так немає, грає лише оригінальний запис.");
  await au.play().catch(() => {});
  $("#tc-play").textContent = "■ Стоп";
  st.textContent = `${Math.round(TC.speed * 100)}% · такти ${TC.from}–${TC.to}${TC.minus ? " · без партії" : ""}`;
}
function tcStop() {
  if (TC.audio) { TC.audio.pause(); TC.audio = null; }
  const b = $("#tc-play");
  if (b) b.textContent = "▶ Грати";
}
function tcLoop() {
  cancelAnimationFrame(TC.raf);
  const step = () => {
    if (!TC.m || TC.m.hidden) { TC.raf = 0; return; }
    tcDraw();
    TC.raf = requestAnimationFrame(step);
  };
  TC.raf = requestAnimationFrame(step);
}
function tcDraw() {
  const cv = $("#tc-cv");
  if (!cv || !cv.isConnected) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#0e1014";
  c.fillRect(0, 0, w, h);
  const t = findT(TC.tid);
  const { a, b } = tcRange();
  const now = tcBeatNow();
  if (TC.view === "piano") return tcPiano(c, w, h, t, a, b, now);
  if (TC.view === "chords") return tcChords(c, w, h, a, b, now);
  if (!t) return;
  const strings = TC.view === "bass" ? BASS : GUITAR;
  const names = TC.view === "bass" ? ["G", "D", "A", "E"] : ["e", "B", "G", "D", "A", "E"];
  const notes = arranged(t).filter((n) => n[0] >= a - 1e-6 && n[0] < b);
  const fing = tabFinger(notes, strings);
  const bpb = S.B.timing.bpb, bars = TC.to - TC.from + 1;
  const perRow = Math.max(1, Math.min(bars, Math.floor((w - 40) / 260)));
  const rows = Math.ceil(bars / perRow), rowH = Math.min(150, (h - 10) / rows), gap = rowH / (strings.length + 1);
  const x0 = 34, bw = (w - x0 - 12) / perRow;
  for (let r = 0; r < rows; r++) {
    const top = 6 + r * rowH;
    c.fillStyle = "#6b7280";
    c.font = "11px ui-monospace,Consolas";
    names.forEach((nm, i) => c.fillText(nm, 12, top + gap * (i + 1) + 4));
    c.strokeStyle = "#3a3f4b";
    c.lineWidth = 1;
    for (let i = 0; i < strings.length; i++) { c.beginPath(); c.moveTo(x0, top + gap * (i + 1)); c.lineTo(x0 + bw * perRow, top + gap * (i + 1)); c.stroke(); }
    for (let k = 0; k <= perRow; k++) {
      const bar = r * perRow + k;
      if (bar > bars) break;
      const x = x0 + k * bw;
      c.strokeStyle = "#565c6b";
      c.beginPath(); c.moveTo(x, top + gap); c.lineTo(x, top + gap * strings.length); c.stroke();
      if (k < perRow && bar < bars) { c.fillStyle = "#8b91a3"; c.font = "10px sans-serif"; c.fillText(String(TC.from + bar), x + 3, top + gap - 5); }
    }
  }
  const pos = (beat) => {
    const rel = (tmM(beat) - tmM(a)) / bpb, bar = Math.floor(rel), r = Math.floor(bar / perRow), k = bar % perRow;
    return { x: x0 + k * bw + (rel - bar) * bw * 0.92 + bw * 0.04, top: 6 + r * rowH };
  };
  for (const f of fing) {
    const p = pos(f.t), y = p.top + gap * (f.s + 1);
    const on = now >= f.t && now < f.t + Math.max(0.15, f.d);
    const txt = String(f.f);
    c.font = `${on ? "bold " : ""}12px ui-monospace,Consolas`;
    const tw = c.measureText(txt).width + 6;
    c.fillStyle = on ? "#ffb547" : "#0e1014";
    c.fillRect(p.x - tw / 2, y - 8, tw, 16);
    c.fillStyle = on ? "#0e1014" : "#e6e8ee";
    c.fillText(txt, p.x - tw / 2 + 3, y + 4);
  }
  if (now >= a && now < b) {
    const p = pos(now);
    c.fillStyle = "#4fd1c5";
    c.fillRect(p.x, p.top + gap * 0.6, 2, gap * strings.length);
  }
  if (!fing.length) { c.fillStyle = "#8b91a3"; c.font = "13px sans-serif"; c.fillText("У цих тактах у партії немає нот.", x0, h / 2); }
}
function tcPiano(c, w, h, t, a, b, now) {
  const notes = t ? arranged(t).filter((n) => n[0] + n[1] >= a - 4 && n[0] < b + 4) : [];
  let lo = 48, hi = 84;
  if (notes.length) {
    lo = Math.min(...notes.map((n) => n[2])) - 2; hi = Math.max(...notes.map((n) => n[2])) + 2;
    lo = Math.min(lo, 48); hi = Math.max(hi, lo + 24);
    lo -= ((lo % 12) + 12) % 12; hi += 11 - (((hi % 12) + 12) % 12);
  }
  const whites = [];
  for (let p = lo; p <= hi; p++) if (![1, 3, 6, 8, 10].includes(p % 12)) whites.push(p);
  const kw = w / whites.length, kh = Math.min(120, h * 0.32), ky = h - kh, look = 4, fallH = ky;
  const xOf = (p) => {
    const black = [1, 3, 6, 8, 10].includes(p % 12);
    const wi = whites.indexOf(black ? p - 1 : p);
    return black ? { x: (wi + 1) * kw - kw * 0.3, w: kw * 0.6, black } : { x: wi * kw, w: kw, black };
  };
  const active = new Set(notes.filter((n) => now >= n[0] && now < n[0] + n[1]).map((n) => n[2]));
  for (const n of notes) {
    const y1 = ky - (n[0] - now) / look * fallH, y0 = ky - (n[0] + n[1] - now) / look * fallH;
    if (y1 < 0 || y0 > ky) continue;
    const k = xOf(n[2]);
    c.fillStyle = active.has(n[2]) && now >= n[0] && now < n[0] + n[1] ? "#ffb547" : (t ? t.color : "#60a5fa");
    c.globalAlpha = 0.85;
    c.fillRect(k.x + 1, Math.max(0, y0), k.w - 2, Math.min(ky, y1) - Math.max(0, y0));
    c.globalAlpha = 1;
    if (y1 - y0 > 14 && k.w > 14) { c.fillStyle = "#0e1014"; c.font = "9px sans-serif"; c.fillText(NN[n[2] % 12], k.x + 3, Math.min(ky, y1) - 4); }
  }
  for (const p of whites) {
    const k = xOf(p);
    c.fillStyle = active.has(p) ? "#ffb547" : "#e9ebf1";
    c.fillRect(k.x + 0.5, ky, k.w - 1, kh);
    if (p % 12 === 0) { c.fillStyle = "#555"; c.font = "10px sans-serif"; c.fillText("C" + (Math.floor(p / 12) - 1), k.x + 3, h - 6); }
  }
  for (let p = lo; p <= hi; p++) {
    const k = xOf(p);
    if (!k.black) continue;
    c.fillStyle = active.has(p) ? "#ffb547" : "#1b1e26";
    c.fillRect(k.x, ky, k.w, kh * 0.62);
  }
  c.fillStyle = "#4fd1c5";
  c.fillRect(0, ky - 2, w, 2);
}
function tcChordsAt(a, b) {
  return (S.B.chords || []).filter((ch) => ch.label !== "N" && ch.end > a && ch.start < b);
}
function tcChords(c, w, h, a, b, now) {
  const chs = tcChordsAt(a, b);
  if (!chs.length) { c.fillStyle = "#8b91a3"; c.font = "13px sans-serif"; c.fillText("У цих тактах акордів не знайдено.", 20, 40); return; }
  const cw = Math.max(70, Math.min(140, (w - 20) / chs.length));
  let cur = chs.find((ch) => now >= ch.start && now < ch.end) || chs[0];
  chs.forEach((ch, i) => {
    const x = 10 + i * cw, on = ch === cur;
    c.fillStyle = on ? "#ffb547" : "#1b1e26";
    c.fillRect(x, 10, cw - 6, 40);
    c.fillStyle = on ? "#0e1014" : "#e6e8ee";
    c.font = "bold 16px sans-serif";
    c.fillText((chordParse(ch.label) || { name: ch.label }).name, x + 8, 36);
  });
  const sh = chordShape(cur.label);
  if (sh) {
    const gx = 40, gy = 90, sw = 26, fh = 30, minF = Math.max(1, Math.min(...sh.frets.filter((f) => f > 0)) || 1), base = minF > 3 ? minF : 1;
    c.fillStyle = "#e6e8ee"; c.font = "bold 22px sans-serif"; c.fillText(sh.name, gx, gy - 20);
    c.strokeStyle = "#8b91a3"; c.lineWidth = 1;
    for (let s = 0; s < 6; s++) { c.beginPath(); c.moveTo(gx + s * sw, gy); c.lineTo(gx + s * sw, gy + fh * 5); c.stroke(); }
    for (let f = 0; f <= 5; f++) { c.lineWidth = f === 0 && base === 1 ? 4 : 1; c.beginPath(); c.moveTo(gx, gy + f * fh); c.lineTo(gx + sw * 5, gy + f * fh); c.stroke(); }
    if (base > 1) { c.fillStyle = "#8b91a3"; c.font = "12px sans-serif"; c.fillText(base + " лад", gx + sw * 5 + 8, gy + fh * 0.6); }
    for (let i = 0; i < 6; i++) {
      const fv = sh.frets[i], sx = gx + i * sw;
      if (fv < 0) { c.fillStyle = "#f87171"; c.font = "14px sans-serif"; c.fillText("×", sx - 4, gy - 6); }
      else if (fv === 0) { c.strokeStyle = "#e6e8ee"; c.lineWidth = 1.5; c.beginPath(); c.arc(sx, gy - 10, 5, 0, Math.PI * 2); c.stroke(); }
      else { c.fillStyle = "#ffb547"; c.beginPath(); c.arc(sx, gy + (fv - base + 0.5) * fh, 9, 0, Math.PI * 2); c.fill(); }
    }
    c.fillStyle = "#6b7280"; c.font = "11px ui-monospace,Consolas";
    ["E", "A", "D", "G", "B", "e"].forEach((n, i) => c.fillText(n, gx + i * sw - 3, gy + fh * 5 + 16));
  }
  const pn = chordNotes(cur.label), kx = 300, ky = 70, kw = 22, kh = 120;
  const whites = [];
  for (let p = 60; p < 84; p++) if (![1, 3, 6, 8, 10].includes(p % 12)) whites.push(p);
  const first = new Set(pn);
  whites.forEach((p, i) => { c.fillStyle = first.has(p) ? "#ffb547" : "#e9ebf1"; c.fillRect(kx + i * kw, ky, kw - 1, kh); });
  for (let p = 60; p < 84; p++) {
    if (![1, 3, 6, 8, 10].includes(p % 12)) continue;
    const wi = whites.indexOf(p - 1);
    c.fillStyle = first.has(p) ? "#ffb547" : "#1b1e26";
    c.fillRect(kx + (wi + 1) * kw - kw * 0.3, ky, kw * 0.6, kh * 0.62);
  }
  c.fillStyle = "#8b91a3"; c.font = "12px sans-serif";
  c.fillText("Піаніно: " + pn.map((p) => NN[p % 12]).join(" – "), kx, ky + kh + 20);
}
(function tcMenus() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["Вчитель: таби, акорди, піаніно, повільне програвання…", needProject(openTeacher)]]);
})();
