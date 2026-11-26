"use strict";
function secList() { return S.mix && S.mix.sections || (S.B ? S.B.sections : []); }
function chordList() { return S.mix && S.mix.chords || (S.B ? S.B.chords : []); }
function ownArrangement() {
  if (!S.mix.sections) S.mix.sections = Plugins.clone(S.B.sections);
  if (!S.mix.chords) S.mix.chords = Plugins.clone(S.B.chords);
}
const CH_IV = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6] };
const chordName = (root, kind) => NOTE_NAMES[root] + kind;

function allClipsEach(fn) { for (const t of tracksAll()) { const m = mt(t.id); fn(t, m); } }
function splitAllAt(beat) {
  const P = period();
  allClipsEach((t, m) => {
    for (const c of [...m.clips]) {
      const end = c.start + c.dur / P;
      if (beat > c.start + 1e-4 && beat < end - 1e-4) {
        const left = (beat - c.start) * P;
        const right = { ...c, id: uid("c"), start: beat, src: c.src + left, dur: c.dur - left, fi: 5e-3 };
        c.dur = left; c.fo = 5e-3;
        m.clips.splice(m.clips.indexOf(c) + 1, 0, right);
      }
    }
  });
}
function shiftAllFrom(beat, delta) {
  allClipsEach((t, m) => { for (const c of m.clips) if (c.start >= beat - 1e-4) c.start = Math.max(0, c.start + delta); });
  for (const s of S.mix.sections) if (s.start >= beat - 1e-4) { s.start += delta; s.end += delta; }
  for (const c of S.mix.chords) if (c.start >= beat - 1e-4) { c.start += delta; c.end += delta; }
}
function clipsInRange(m, a, b) { const P = period(); return m.clips.filter((c) => c.start >= a - 1e-4 && c.start + c.dur / P <= b + 1e-4); }
function sectionOp(op, idx) {
  ownArrangement();
  const secs = S.mix.sections, s = secs[idx];
  if (!s) return;
  const a = s.start, b = s.end, L = b - a;
  pushUndo({ dup: "дублювання секції", del: "видалення секції", left: "переміщення секції", right: "переміщення секції", gap: "вставка такту", repeat: "повтор секції" }[op] || "секція");
  splitAllAt(a); splitAllAt(b);
  if (op === "dup" || op === "repeat") {
    const times = op === "repeat" ? 2 : 1;
    const copies = [];
    allClipsEach((t, m) => { for (const c of clipsInRange(m, a, b)) copies.push([m, c]); });
    const chs = S.mix.chords.filter((c) => c.start >= a - 1e-4 && c.end <= b + 1e-4).map((c) => ({ ...c }));
    shiftAllFrom(b, L * times);
    for (let k = 1; k <= times; k++) {
      for (const [m, c] of copies) m.clips.push({ ...c, id: uid("c"), start: c.start + L * k });
      secs.splice(idx + k, 0, { ...s, start: a + L * k, end: b + L * k, name: s.name, name_ua: s.name_ua });
      for (const c of chs) S.mix.chords.push({ ...c, start: c.start + L * k, end: c.end + L * k });
    }
  } else if (op === "del") {
    allClipsEach((t, m) => { for (const c of clipsInRange(m, a, b)) m.clips.splice(m.clips.indexOf(c), 1); });
    S.mix.chords = S.mix.chords.filter((c) => !(c.start >= a - 1e-4 && c.end <= b + 1e-4));
    secs.splice(idx, 1);
    shiftAllFrom(b, -L);
  } else if (op === "gap") {
    const bar = S.B.timing.bpb;
    shiftAllFrom(a, bar);
  } else if (op === "left" || op === "right") {
    const j = op === "left" ? idx - 1 : idx + 1, o = secs[j];
    if (!o) return toast("Немає сусідньої секції.");
    const A1 = op === "left" ? o : s, B1 = op === "left" ? s : o;
    splitAllAt(A1.start); splitAllAt(A1.end); splitAllAt(B1.end);
    const la = A1.end - A1.start, lb = B1.end - B1.start;
    allClipsEach((t, m) => {
      const inA = clipsInRange(m, A1.start, A1.end), inB = clipsInRange(m, B1.start, B1.end);
      inA.forEach((c) => c.start += lb); inB.forEach((c) => c.start -= la);
    });
    for (const c of S.mix.chords) { if (c.start >= A1.start - 1e-4 && c.end <= A1.end + 1e-4) { c.start += lb; c.end += lb; } else if (c.start >= B1.start - 1e-4 && c.end <= B1.end + 1e-4) { c.start -= la; c.end -= la; } }
    const aStart = A1.start;
    B1.start = aStart; B1.end = aStart + lb; A1.start = aStart + lb; A1.end = aStart + lb + la;
    secs.sort((x, y) => x.start - y.start);
  }
  S.mix.chords.sort((x, y) => x.start - y.start);
  renumberSections();
  afterEdit(true);
  toast("Готово. Усі доріжки й ноти змінено синхронно. Ctrl+Z — скасувати.");
}
function renumberSections() {
  const tot = {}, cnt = {};
  for (const s of S.mix.sections) tot[s.kind] = (tot[s.kind] || 0) + 1;
  const UA = { intro: "Інтро", verse: "Куплет", prechorus: "Пре-приспів", chorus: "Приспів", bridge: "Бридж", inst: "Програш", outro: "Аутро" };
  const EN = { intro: "Intro", verse: "Verse", prechorus: "Pre-Chorus", chorus: "Chorus", bridge: "Bridge", inst: "Instrumental", outro: "Outro" };
  for (const s of S.mix.sections) {
    if (s.custom) continue;
    cnt[s.kind] = (cnt[s.kind] || 0) + 1;
    const suf = tot[s.kind] > 1 ? " " + cnt[s.kind] : "";
    s.name_ua = (UA[s.kind] || s.name_ua.replace(/ \d+$/, "")) + suf; s.name = (EN[s.kind] || s.name.replace(/ \d+$/, "")) + suf;
  }
}
function topHit(e) {
  const r = $(".tl-top").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, b = scrollBeat() + x / S.ppb;
  if (y >= 24 && y < 52) { const i = secList().findIndex((s) => b >= s.start && b < s.end); return i >= 0 ? { kind: "sec", i, b } : null; }
  if (y >= 54) { const i = chordList().findIndex((c) => b >= c.start && b < c.end && c.label !== "N"); return i >= 0 ? { kind: "chord", i, b } : null; }
  return null;
}
$(".tl-top").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const h = topHit(e);
  if (!h) return;
  if (h.kind === "chord") return chordPicker(e, h.i);
  const s = secList()[h.i];
  menu(e, [
    [`Дублювати «${s.name_ua}» (копія одразу після)`, () => sectionOp("dup", h.i)],
    [`Повторити «${s.name_ua}» ще 2 рази`, () => sectionOp("repeat", h.i)],
    ["Поміняти місцями з попередньою", () => sectionOp("left", h.i)],
    ["Поміняти місцями з наступною", () => sectionOp("right", h.i)],
    ["Вставити такт тиші перед секцією", () => sectionOp("gap", h.i)],
    ["Перейменувати секцію…", () => { const n = prompt("Назва секції:", s.name_ua); if (!n) return; ownArrangement(); pushUndo("назва секції"); const ss = S.mix.sections[h.i]; ss.name_ua = n.trim(); ss.name = n.trim(); ss.custom = true; afterEdit(); }],
    ["Генерувати партію для цієї секції…", () => openGenerator(h.i)],
    null,
    [`Видалити «${s.name_ua}»`, () => sectionOp("del", h.i), "danger"],
  ]);
});
$(".tl-top").addEventListener("dblclick", (e) => { const h = topHit(e); if (h && h.kind === "chord") chordPicker(e, h.i); });

function chordPicker(e, idx) {
  closeMenu();
  const ch = chordList()[idx], key = S.B.key;
  const scale = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const qual = key.mode === "major" ? ["", "m", "m", "", "", "m", "dim"] : ["m", "dim", "", "m", "m", "", ""];
  const diat = scale.map((iv, i) => [(key.tonic + iv) % 12, qual[i]]);
  const box = document.createElement("div");
  box.className = "ctxmenu chordpick"; box.id = "ctxmenu";
  box.innerHTML = `<div class="cp-head">Замінити акорд <b>${escapeHtml(ch.label)}</b></div>
    <div class="cp-sub">У тональності ${escapeHtml(NOTE_NAMES[key.tonic] + " " + (key.mode === "major" ? "мажор" : "мінор"))}:</div>
    <div class="cp-grid">${diat.map(([r, k]) => `<button data-r="${r}" data-k="${k}" class="${r === ch.root && k === ch.kind ? "cur" : ""}">${chordName(r, k)}</button>`).join("")}</div>
    <div class="cp-sub">Будь-який:</div>
    <div class="cp-any"><select id="cp-root">${NOTE_NAMES.map((n, i) => `<option value="${i}" ${i === ch.root ? "selected" : ""}>${n}</option>`).join("")}</select>
      <select id="cp-kind">${Object.keys(CH_IV).map((k) => `<option value="${k}" ${k === ch.kind ? "selected" : ""}>${k || "мажор"}${k === "m" ? " (мінор)" : ""}</option>`).join("")}</select>
      <button class="btn primary sm" id="cp-go">Замінити</button></div>
    <label class="cp-opt"><input type="checkbox" id="cp-mel"> змінити й мелодію (вокал, соло)</label>
    <div class="cp-note">Змінюються MIDI-ноти баса, клавішних, гітари, пад, акордів і згенерованих партій у межах цього акорду. Аудіозапис не змінюється — слухайте в режимі MIDI.</div>`;
  document.body.appendChild(box);
  const r = box.getBoundingClientRect();
  box.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + "px";
  box.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + "px";
  setTimeout(() => document.addEventListener("mousedown", closeMenuOutside), 0);
  const apply = (root, kind) => { closeMenu(); replaceChord(idx, root, kind, $("#cp-mel") ? $("#cp-mel").checked : false); };
  box.querySelectorAll(".cp-grid button").forEach((b) => b.onclick = () => apply(+b.dataset.r, b.dataset.k));
  box.querySelector("#cp-go").onclick = () => apply(+box.querySelector("#cp-root").value, box.querySelector("#cp-kind").value);
}
function noteTimeline(t, n) {
  const P = period(), ts = n[0] * P - S.B.timing.pad;
  for (const c of mt(t.id).clips) if (!c.mute && ts >= c.src && ts < c.src + c.dur) return c.start + (ts - c.src) / P;
  return null;
}
function replaceChord(idx, root, kind, melody) {
  ownArrangement();
  const ch = S.mix.chords[idx];
  if (!ch || ch.root == null) return;
  pushUndo("заміна акорду");
  const q0 = CH_IV[ch.kind] || CH_IV[""], q1 = CH_IV[kind] || CH_IV[""], d = ((root - ch.root + 18) % 12) - 6;
  let changed = 0;
  for (const t of tracksAll()) {
    if (t.is_drums) continue;
    const harmonic = ["bass", "keys", "guitar", "pad", "poly", "mono_inst"].includes(t.role) || t.kind === "chords" || t.gen;
    if (!harmonic && !(melody && t.role === "lead")) continue;
    const src = trackNotes(t);
    const hits = src.map((n, i) => [i, noteTimeline(t, n)]).filter(([, b]) => b != null && b >= ch.start - 1e-3 && b < ch.end - 1e-3);
    if (!hits.length) continue;
    const ns = editableNotes(t);
    for (const [i] of hits) {
      const n = ns[i], rel = (((n[2] - ch.root) % 12) + 12) % 12, deg = q0.indexOf(rel);
      let p = n[2] + d;
      if (deg >= 0) p += q1[Math.min(deg, q1.length - 1)] - q0[deg];
      n[2] = Math.max(0, Math.min(127, p)); changed++;
    }
  }
  ch.root = root; ch.kind = kind; ch.label = chordName(root, kind);
  notesChanged();
  if (S.dockTab === "notes") renderDock();
  toast(`Акорд замінено на ${ch.label}: змінено нот ${changed}. Слухайте доріжки в режимі MIDI.`);
}

const GEN = {
  bass: { name: "Басова лінія", role: "bass", color: "#8b5cf6", program: 38, preset: "Синт-бас",
    styles: { roots: "Корені (довгі ноти)", eighths: "Восьмі (рівний драйв)", octaves: "Октави (диско)", synco: "Синкопа (фанк / поп)", walking: "Walking (джаз)", sub808: "808 (трап)" } },
  drums: { name: "Барабани", role: "drums", color: "#f59e0b", is_drums: true,
    styles: { pop: "Поп 4/4", hiphop: "Хіп-хоп (бум-бап)", trap: "Трап", house: "Хаус", rock: "Рок", lofi: "Лоу-фай", reggaeton: "Регетон", halftime: "Половинний темп" } },
  arp: { name: "Арпеджіо", role: "poly", color: "#06b6d4", program: 81, preset: "Плак",
    styles: { up: "Вгору", down: "Вниз", updown: "Вгору-вниз", random: "Випадково", pulse: "Пульс (повтор акорду)" } },
  pad: { name: "Пад / акорди", role: "pad", color: "#6366f1", program: 89, preset: "Теплий пад",
    styles: { hold: "Тягнуті акорди", stabs: "Удари на 1 і 3", offbeat: "Офбіт (реггі / хаус)", pump: "Пульсація 1/8", piano: "Піаністичний ритм" } },
};
const DRUMS = {
  pop: { k: [0, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
  hiphop: { k: [0, 3, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.12 },
  trap: { k: [0, 6, 10], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], oh: [] },
  house: { k: [0, 4, 8, 12], s: [4, 12], h: [], oh: [2, 6, 10, 14] },
  rock: { k: [0, 6, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
  lofi: { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.2, soft: true },
  reggaeton: { k: [0, 4, 8, 12], s: [3, 6, 11, 14], h: [0, 2, 4, 6, 8, 10, 12, 14] },
  halftime: { k: [0, 10], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 14] },
};
function genNotes(type, style, opt, range) {
  const out = [], bpb = S.B.timing.bpb, rnd = (a) => (Math.random() * 2 - 1) * a;
  const vel = (v) => Math.max(20, Math.min(127, Math.round(v + rnd(opt.human * 14))));
  const tim = (b) => b + rnd(opt.human * 0.015);
  const chords = chordList().filter((c) => c.label !== "N" && c.end > range[0] && c.start < range[1]).map((c) => ({ ...c, start: Math.max(c.start, range[0]), end: Math.min(c.end, range[1]) }));
  if (type === "drums") {
    const pat = DRUMS[style] || DRUMS.pop, sw = opt.swing || pat.swing || 0;
    const first = Math.ceil(range[0] / bpb - 1e-6) * bpb;
    for (let bar = first; bar + bpb <= range[1] + 1e-6; bar += bpb) {
      const barIdx = Math.round((bar - first) / bpb), fill = opt.fills && barIdx % 8 === 7;
      const at = (st) => bar + st / 4 * (bpb / 4) + (st % 2 === 1 ? sw / 4 : 0);
      const soft = pat.soft ? 0.8 : 1;
      for (const st of pat.k) out.push([tim(at(st)), 0.25, 36, vel((st === 0 ? 112 : 96) * soft)]);
      for (const st of pat.s) if (!(fill && st >= 12)) out.push([tim(at(st)), 0.25, style === "house" ? 39 : 38, vel(106 * soft)]);
      for (const st of pat.h) if (!(fill && st >= 12)) out.push([tim(at(st)), 0.25, 42, vel((st % 4 === 0 ? 92 : 72) * soft)]);
      for (const st of pat.oh || []) out.push([tim(at(st)), 0.25, 46, vel(84 * soft)]);
      if (style === "trap" && barIdx % 2 === 1) for (let r = 0; r < 4; r++) out.push([tim(bar + 3.5 + r * 0.125), 0.1, 42, vel(60 + r * 8)]);
      if (fill) for (let r = 0; r < 4; r++) out.push([tim(bar + 3 + r * 0.25), 0.25, r < 2 ? 38 : 45, vel(90 + r * 6)]);
      if (opt.crash && secList().some((s) => Math.abs(s.start - bar) < 1e-3)) out.push([bar, 1, 49, vel(100)]);
    }
    return out;
  }
  for (const c of chords) {
    const iv = CH_IV[c.kind] || CH_IV[""];
    if (type === "bass") {
      const base = 24 + 12 * opt.octave + c.root, r0 = base > 48 ? base - 12 : base;
      if (style === "roots") for (let b = c.start; b < c.end - 1e-3; b += bpb) out.push([tim(b), Math.min(bpb, c.end - b) * 0.95, r0, vel(100)]);
      else if (style === "eighths") for (let b = c.start; b < c.end - 1e-3; b += 0.5) out.push([tim(b), 0.45, r0, vel(b % 1 < 1e-3 ? 104 : 86)]);
      else if (style === "octaves") for (let b = c.start, k = 0; b < c.end - 1e-3; b += 0.5, k++) out.push([tim(b), 0.4, r0 + (k % 2 ? 12 : 0), vel(k % 2 ? 90 : 104)]);
      else if (style === "synco") for (let b = c.start; b < c.end - 1e-3; b += bpb) for (const [o, l, add] of [[0, 0.7, 0], [0.75, 0.25, 0], [1.5, 0.5, 7], [2.5, 0.5, 0], [3, 0.4, 12], [3.5, 0.4, 7]]) { if (b + o < c.end - 1e-3) out.push([tim(b + o), l, r0 + add, vel(o === 0 ? 108 : 88)]); }
      else if (style === "walking") {
        const nxt = chords[chords.indexOf(c) + 1], tgt = nxt ? 24 + 12 * opt.octave + nxt.root : r0;
        const seq = [0, iv[1], iv[2], null];
        for (let b = c.start, k = 0; b < c.end - 1e-3; b += 1, k++) { const st = seq[k % 4]; out.push([tim(b), 0.9, st == null ? tgt + (tgt > r0 ? -1 : 1) : r0 + st, vel(96)]); }
      } else if (style === "sub808") for (let b = c.start; b < c.end - 1e-3; b += bpb) { out.push([tim(b), 1.4, r0, vel(110)]); if (b + 2.5 < c.end) out.push([tim(b + 2.5), 1, r0, vel(100)]); }
    } else if (type === "arp") {
      const tones = [];
      for (let o = 0; o < opt.range; o++) for (const i of iv) tones.push(48 + 12 * (opt.octave - 1) + c.root + i + 12 * o);
      const seq = style === "down" ? [...tones].reverse() : style === "updown" ? [...tones, ...tones.slice(1, -1).reverse()] : tones;
      const rate = opt.rate;
      for (let b = c.start, k = 0; b < c.end - 1e-3; b += rate, k++) {
        if (style === "pulse") { for (const p of tones.slice(0, iv.length)) out.push([tim(b), rate * 0.8, p, vel(k % 2 ? 76 : 96)]); continue; }
        const p = style === "random" ? tones[Math.floor(Math.random() * tones.length)] : seq[k % seq.length];
        out.push([tim(b), rate * 0.9, p, vel(k % 4 === 0 ? 100 : 80)]);
      }
    } else if (type === "pad") {
      const center = 48 + 12 * opt.octave;
      let vo = iv.map((i) => center - 6 + ((c.root + i - (center - 6)) % 12 + 12) % 12).sort((a, b) => a - b);
      if (opt.bassNote) vo = [36 + 12 * (opt.octave - 1) + c.root, ...vo];
      const hitAt = (b, l, v) => { for (const p of vo) out.push([tim(b), l, p, vel(v)]); };
      if (style === "hold") hitAt(c.start, (c.end - c.start) * 0.98, 88);
      else if (style === "stabs") for (let b = c.start; b < c.end - 1e-3; b += 2) hitAt(b, 0.4, 96);
      else if (style === "offbeat") for (let b = c.start + 0.5; b < c.end - 1e-3; b += 1) hitAt(b, 0.3, 90);
      else if (style === "pump") for (let b = c.start; b < c.end - 1e-3; b += 0.5) hitAt(b, 0.4, b % 1 < 1e-3 ? 70 : 96);
      else if (style === "piano") for (let b = c.start; b < c.end - 1e-3; b += bpb) for (const [o, l] of [[0, 1.4], [1.5, 0.4], [2, 1], [3.5, 0.4]]) if (b + o < c.end - 1e-3) hitAt(b + o, l, o === 0 ? 100 : 84);
    }
  }
  return out.filter((n) => n[0] >= range[0] - 0.02 && n[0] < range[1]).map((n) => [Math.max(0, +n[0].toFixed(4)), +n[1].toFixed(4), n[2], n[3]]);
}
function openGenerator(secIdx = null) {
  const modal = $("#gen-modal");
  const secs = secList();
  let type = "bass", tmp = null, prevStop = null;
  const opt = { octave: 1, human: 0.4, swing: 0, fills: true, crash: true, rate: 0.25, range: 2, bassNote: false };
  const draw = () => {
    const g = GEN[type];
    $("#gen-body").innerHTML = `<p class="muted">Нова MIDI-доріжка з'явиться під іншими. Партія будується за акордами й тактами пісні${type === "drums" ? "" : " (змінені вами акорди теж враховуються)"}.</p>
      <div class="gen-types">${Object.entries(GEN).map(([k, v]) => `<button data-gt="${k}" class="${k === type ? "active" : ""}">${v.name}</button>`).join("")}</div>
      <div class="gen-grid">
        <label>Стиль<select id="gen-style">${Object.entries(g.styles).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label>Де<select id="gen-scope"><option value="all">уся пісня</option>${secs.map((s, i) => `<option value="${i}" ${secIdx === i ? "selected" : ""}>${escapeHtml(s.name_ua)} (такт ${Math.round(s.start / S.B.timing.bpb) + 1})</option>`).join("")}</select></label>
        ${type !== "drums" ? `<label>Октава<select id="gen-oct">${[0, 1, 2].map((o) => `<option value="${o}" ${o === opt.octave ? "selected" : ""}>${["нижче", "звичайна", "вище"][o]}</option>`).join("")}</select></label>` : ""}
        ${type === "arp" ? `<label>Швидкість<select id="gen-rate"><option value="0.5">1/8</option><option value="0.25" selected>1/16</option><option value="0.3333333">1/8 тріоль</option></select></label><label>Діапазон<select id="gen-range"><option value="1">1 октава</option><option value="2" selected>2 октави</option><option value="3">3 октави</option></select></label>` : ""}
        ${type === "pad" ? `<label class="chk"><input type="checkbox" id="gen-bn"> + басова нота</label>` : ""}
        ${type === "drums" ? `<label class="chk"><input type="checkbox" id="gen-fill" checked> збивки кожні 8 тактів</label><label class="chk"><input type="checkbox" id="gen-crash" checked> тарілка на початку секцій</label><label>Свінг<input type="range" id="gen-swing" min="0" max="0.33" step="0.01" value="0"></label>` : ""}
        <label>Живість<input type="range" id="gen-human" min="0" max="1" step="0.05" value="${opt.human}" data-hint="Невеликі випадкові відхилення гучності й часу, щоб звучало не «машинно»"></label>
      </div>
      <div class="gen-run"><button class="btn ghost" id="gen-prev">▶ Прослухати 4 такти</button><button class="btn primary" id="gen-go">Створити доріжку</button><span class="muted small" id="gen-info"></span></div>`;
    $$("[data-gt]").forEach((b) => b.onclick = () => { stopPrev(); type = b.dataset.gt; draw(); });
    $("#gen-prev").onclick = preview;
    $("#gen-go").onclick = create;
  };
  const read = () => {
    const sc = $("#gen-scope").value, tm = S.B.timing;
    const range = sc === "all" ? [0, arrEnd()] : [secs[+sc].start, secs[+sc].end];
    opt.octave = $("#gen-oct") ? +$("#gen-oct").value : opt.octave;
    opt.human = +$("#gen-human").value;
    if ($("#gen-rate")) { opt.rate = +$("#gen-rate").value; opt.range = +$("#gen-range").value; }
    if ($("#gen-bn")) opt.bassNote = $("#gen-bn").checked;
    if ($("#gen-fill")) { opt.fills = $("#gen-fill").checked; opt.crash = $("#gen-crash").checked; opt.swing = +$("#gen-swing").value; }
    return { style: $("#gen-style").value, range, scopeName: sc === "all" ? "" : " · " + secs[+sc].name_ua, tm };
  };
  const instFor = () => type === "drums" ? { type: "drums", kit: "808", pads: {} } : { type: "synth", preset: GEN[type].preset, params: Plugins.presetByName(GEN[type].preset) };
  function stopPrev() { if (prevStop) prevStop(); prevStop = null; }
  function preview() {
    stopPrev();
    const r = read(), notes = genNotes(type, r.style, opt, r.range);
    if (!notes.length) return $("#gen-info").textContent = "Тут немає акордів для побудови партії.";
    const A = ensureCtx(), ctx = A.ctx; ctx.resume();
    if (S.playing) stopPlay();
    const b0 = notes[0][0] - (notes[0][0] % S.B.timing.bpb), b1 = b0 + 4 * S.B.timing.bpb, P = period();
    const g = ctx.createGain(); g.connect(A.master ? A.master.input : A.out);
    const t0 = ctx.currentTime + 0.1, inst = instFor();
    if (inst.type === "drums") loadInstrumentBuffers();
    for (const n of notes) if (n[0] >= b0 && n[0] < b1) DSP.playNote(ctx, g, inst, n[2], n[3] / 127, t0 + (n[0] - b0) * P, n[1] * P, A.ibuf);
    const others = [];
    for (const t of tracksAll()) {
      if (!t.has_audio || !audible(t) || !A.buffers[srcKey(t)]) continue;
      const st = A.strips[t.id]; if (!st) continue;
      scheduleClips(ctx, t, A.buffers[srcKey(t)], st.aIn, b0, t0, others);
      st.aIn.gain.value = 0.55;
    }
    const tid = setTimeout(() => stopPrev(), (b1 - b0) * P * 1000 + 300);
    prevStop = () => { clearTimeout(tid); g.disconnect(); others.forEach((s) => { try { s.stop(); } catch (e) {} }); applyGains(); };
    $("#gen-info").textContent = `${notes.length} нот · грає разом з піснею (такт ${Math.round(b0 / S.B.timing.bpb) + 1}–${Math.round(b1 / S.B.timing.bpb)})`;
  }
  function create() {
    stopPrev();
    const r = read(), notes = genNotes(type, r.style, opt, r.range);
    if (!notes.length) return $("#gen-info").textContent = "Тут немає акордів для побудови партії.";
    pushUndo("генерація партії");
    if (!S.mix.gens) S.mix.gens = [];
    const g = GEN[type], id = uid("gen");
    const name = `${g.name} · ${g.styles[r.style]}${r.scopeName}`;
    S.mix.gens.push({ id, name, color: g.color, role: g.role, is_drums: !!g.is_drums, program: g.program || 0, notes });
    const P = period();
    S.mix.tracks[id] = { vol: 0, pan: 0, mute: false, solo: false, mode: "midi", fx: [], inst: instFor(), source: null, notes: null,
      clips: [{ id: uid("c"), start: 0, src: -S.B.timing.pad, dur: (arrEnd() + 16) * P, gain: 0, fi: 5e-3, fo: 5e-3, mute: false }] };
    _tracksKey = ""; S.sel = id; S.dockTab = "notes";
    modal.hidden = true;
    afterEdit(true);
    loadInstrumentBuffers();
    toast(`Створено «${name}». Ноти можна правити на вкладці «Ноти», звук — на «Інструмент».`);
  }
  modal.querySelector("[data-close]").onclick = () => { stopPrev(); modal.hidden = true; };
  draw();
  modal.hidden = false;
}
$("#t-gen").onclick = () => openGenerator();
