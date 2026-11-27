"use strict";
const SEC_KINDS = {
  intro: ["Інтро", "Intro", "#6b7280"], verse: ["Куплет", "Verse", "#3b82f6"], prechorus: ["Пре-приспів", "Pre-Chorus", "#8b5cf6"], chorus: ["Приспів", "Chorus", "#ef4444"],
  hook: ["Хук", "Hook", "#e11d48"], bridge: ["Бридж", "Bridge", "#f59e0b"], inst: ["Програш", "Instrumental", "#14b8a6"], build: ["Білд", "Build", "#f97316"], drop: ["Дроп", "Drop", "#ec4899"], break: ["Брейк", "Break", "#0ea5e9"], outro: ["Аутро", "Outro", "#6b7280"],
};
const STRUCTS = {
  pop: ["Поп-пісня", [["intro", 4], ["verse", 8], ["prechorus", 4], ["chorus", 8], ["verse", 8], ["prechorus", 4], ["chorus", 8], ["bridge", 8], ["chorus", 8], ["outro", 4]]],
  trap: ["Трап / реп", [["intro", 4], ["hook", 8], ["verse", 16], ["hook", 8], ["verse", 16], ["hook", 8], ["outro", 4]]],
  edm: ["EDM / хаус", [["intro", 8], ["build", 8], ["drop", 16], ["break", 8], ["build", 8], ["drop", 16], ["outro", 8]]],
  rock: ["Рок", [["intro", 4], ["verse", 8], ["chorus", 8], ["verse", 8], ["chorus", 8], ["inst", 8], ["chorus", 8], ["outro", 4]]],
  lofi: ["Лоу-фай біт", [["intro", 4], ["verse", 8], ["chorus", 8], ["verse", 8], ["chorus", 8], ["outro", 4]]],
  ballad: ["Балада", [["intro", 4], ["verse", 8], ["verse", 8], ["chorus", 8], ["verse", 8], ["chorus", 8], ["bridge", 4], ["chorus", 8], ["outro", 4]]],
  short: ["Короткий трек (соцмережі)", [["intro", 2], ["hook", 8], ["verse", 8], ["hook", 8]]],
};
const SEC_RULES = {
  intro: { drums: 0, bass: 0, lead: 0, other: 1 }, outro: { drums: 0, bass: 0, lead: 0, other: 1 }, break: { drums: 0, bass: 0, lead: 1, other: 1 }, bridge: { drums: 0, bass: 1, lead: 1, other: 1 },
  build: { drums: 1, bass: 0, lead: 0, other: 1 }, verse: { drums: 1, bass: 1, lead: 0, other: 1 }, prechorus: { drums: 1, bass: 1, lead: 0, other: 1 },
  chorus: { drums: 1, bass: 1, lead: 1, other: 1 }, hook: { drums: 1, bass: 1, lead: 1, other: 1 }, drop: { drums: 1, bass: 1, lead: 1, other: 1 }, inst: { drums: 1, bass: 1, lead: 1, other: 1 },
};
function roleGroup(t) {
  if (t.is_drums || t.role === "drums") return "drums";
  if (t.role === "bass") return "bass";
  if (["lead", "vocals", "melody"].includes(t.role) || t.kind === "vocals") return "lead";
  if (["pad", "poly", "strings"].includes(t.role)) return "pad";
  return "other";
}
function secAllowed(kind, t) {
  const r = SEC_RULES[kind] || SEC_RULES.chorus, g = roleGroup(t);
  if (g === "pad") return kind !== "verse";
  return !!r[g];
}
function mkSection(kind, a, b, idx) {
  const k = SEC_KINDS[kind] || SEC_KINDS.verse;
  return { kind, start: +a.toFixed(5), end: +b.toFixed(5), name_ua: k[0], name: k[1], color: k[2], group: String.fromCharCode(65 + (idx % 26)), energy: 0.5, custom: false };
}
function writeStructure(list, fromBar) {
  ownArrangement();
  const bpb = S.B.timing.bpb, out = [];
  let bar = fromBar - 1;
  list.forEach(([kind, bars], i) => { out.push(mkSection(kind, tmU(bar * bpb), tmU((bar + bars) * bpb), i)); bar += bars; });
  const a = out[0].start, b = out[out.length - 1].end;
  S.mix.sections = S.mix.sections.filter((s) => s.end <= a + 1e-3 || s.start >= b - 1e-3).concat(out).sort((x, y) => x.start - y.start);
  const cnt = {}, tot = {};
  for (const s of S.mix.sections) tot[s.kind] = (tot[s.kind] || 0) + 1;
  for (const s of S.mix.sections) { if (!SEC_KINDS[s.kind]) continue; cnt[s.kind] = (cnt[s.kind] || 0) + 1; const suf = tot[s.kind] > 1 ? " " + cnt[s.kind] : ""; s.name_ua = SEC_KINDS[s.kind][0] + suf; s.name = SEC_KINDS[s.kind][1] + suf; }
  return { a, b, bars: bar - fromBar + 1 };
}
const TRFX = { 36: "Удар (імпакт)", 37: "Райзер (підйом)", 38: "Даунліфтер (спад)", 39: "Зворотна тарілка", 40: "Свіп шуму", 41: "Саб-дроп", 42: "Барабанний рол" };
function trNoise(ctx, len) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * Math.min(12, len)), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = b;
  return s;
}
function trfxNote(ctx, out, inst, pitch, vel, t0, dur) {
  const v = (0.3 + 0.7 * vel) * (inst.gain ?? 0.8), D = Math.max(0.2, dur);
  const G = (at, peak) => { const g = ctx.createGain(); g.gain.setValueAtTime(at, t0); g.connect(out); return g; };
  if (pitch === 37 || pitch === 40) {
    const n = trNoise(ctx, D + 0.1), f = ctx.createBiquadFilter(), g = G(1e-3);
    f.type = pitch === 40 ? "bandpass" : "highpass"; f.Q.value = pitch === 40 ? 3 : 0.7;
    f.frequency.setValueAtTime(pitch === 40 ? 300 : 400, t0); f.frequency.exponentialRampToValueAtTime(9000, t0 + D);
    g.gain.exponentialRampToValueAtTime(v * 0.5, t0 + D); g.gain.linearRampToValueAtTime(0, t0 + D + 0.05);
    n.connect(f); f.connect(g); n.start(t0); n.stop(t0 + D + 0.1);
    if (pitch === 37) {
      const o = ctx.createOscillator(), og = G(1e-3);
      o.type = "sawtooth"; o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(1400, t0 + D);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
      og.gain.exponentialRampToValueAtTime(v * 0.18, t0 + D); og.gain.linearRampToValueAtTime(0, t0 + D + 0.05);
      o.connect(lp); lp.connect(og); o.start(t0); o.stop(t0 + D + 0.1);
    }
  } else if (pitch === 38) {
    const n = trNoise(ctx, D + 0.1), f = ctx.createBiquadFilter(), g = G(v * 0.5);
    f.type = "lowpass"; f.frequency.setValueAtTime(9000, t0); f.frequency.exponentialRampToValueAtTime(150, t0 + D);
    g.gain.exponentialRampToValueAtTime(1e-3, t0 + D);
    n.connect(f); f.connect(g); n.start(t0); n.stop(t0 + D + 0.1);
    const o = ctx.createOscillator(), og = G(v * 0.3);
    o.frequency.setValueAtTime(500, t0); o.frequency.exponentialRampToValueAtTime(50, t0 + D); og.gain.exponentialRampToValueAtTime(1e-3, t0 + D);
    o.connect(og); o.start(t0); o.stop(t0 + D + 0.1);
  } else if (pitch === 39) {
    const n = trNoise(ctx, D + 0.1), f = ctx.createBiquadFilter(), g = G(1e-4);
    f.type = "highpass"; f.frequency.value = 4500;
    g.gain.exponentialRampToValueAtTime(v * 0.45, t0 + D); g.gain.linearRampToValueAtTime(0, t0 + D + 0.02);
    n.connect(f); f.connect(g); n.start(t0); n.stop(t0 + D + 0.05);
  } else if (pitch === 41) {
    const o = ctx.createOscillator(), g = G(v * 0.9), L = Math.max(1, D);
    o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + L);
    g.gain.setValueAtTime(v * 0.9, t0 + L * 0.6); g.gain.exponentialRampToValueAtTime(1e-3, t0 + L);
    o.connect(g); o.start(t0); o.stop(t0 + L + 0.05);
  } else if (pitch === 42) {
    let t = t0, k = 0;
    while (t < t0 + D - 0.01 && k < 200) {
      const prog = (t - t0) / D, step = prog < 0.5 ? D / 16 : prog < 0.8 ? D / 32 : D / 64;
      const hv = v * (0.35 + 0.65 * prog);
      const n = trNoise(ctx, 0.2), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 0.8;
      g.gain.setValueAtTime(hv * 0.6, t); g.gain.exponentialRampToValueAtTime(1e-3, t + 0.12);
      n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.15);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
      og.gain.setValueAtTime(hv * 0.3, t); og.gain.exponentialRampToValueAtTime(1e-3, t + 0.09);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.1);
      t += step; k++;
    }
  } else {
    const o = ctx.createOscillator(), g = G(v);
    o.frequency.setValueAtTime(80, t0); o.frequency.exponentialRampToValueAtTime(32, t0 + 1.2);
    g.gain.exponentialRampToValueAtTime(1e-3, t0 + 2.2);
    o.connect(g); o.start(t0); o.stop(t0 + 2.3);
    const n = trNoise(ctx, 2.5), f = ctx.createBiquadFilter(), ng = G(v * 0.6);
    f.type = "lowpass"; f.frequency.setValueAtTime(5000, t0); f.frequency.exponentialRampToValueAtTime(200, t0 + 2);
    ng.gain.exponentialRampToValueAtTime(1e-3, t0 + 2.4);
    n.connect(f); f.connect(ng); n.start(t0); n.stop(t0 + 2.5);
  }
}
const _dspPlayT = DSP.playNote;
DSP.playNote = function(ctx, out, inst, pitch, vel, t0, dur, buffers, mods) {
  if (mods && mods.mute) return;
  if (inst && inst.type === "trfx") return trfxNote(ctx, out, inst, pitch, vel, t0, dur);
  return _dspPlayT(ctx, out, inst, pitch, vel, t0, dur, buffers, mods);
};
function trTrack() {
  let g = (S.mix.gens || []).find((x) => x.role === "fx" && x.trfx);
  if (g) return g;
  if (!S.mix.gens) S.mix.gens = [];
  const id = uid("gen");
  g = { id, name: "FX переходів", color: "#94a3b8", role: "fx", trfx: true, is_drums: false, program: 0, notes: [], user: true };
  S.mix.gens.push(g);
  const P = period();
  S.mix.tracks[id] = { vol: -3, pan: 0, mute: false, solo: false, mode: "midi", fx: [], inst: { type: "trfx", gain: 0.8 }, source: null, notes: null,
    clips: [{ id: uid("c"), start: 0, src: -S.B.timing.pad, dur: (Math.max(arrEnd(), S.B.end_beat || 0) + 16) * P, gain: 0, fi: 5e-3, fo: 5e-3, mute: false }] };
  _tracksKey = "";
  return g;
}
function trAdd(kind, at, bars) {
  const g = trTrack(), bpb = S.B.timing.bpb, m = tmM(at), add = [];
  const L = (n) => tmU(m + n * bpb) - at, B = (n) => tmU(m - n * bpb);
  if (kind === "riser") add.push([B(bars), at - B(bars), 37, 100]);
  else if (kind === "sweep") add.push([B(bars), at - B(bars), 40, 96]);
  else if (kind === "rev") add.push([B(1), at - B(1), 39, 100]);
  else if (kind === "roll") add.push([B(1), at - B(1), 42, 100]);
  else if (kind === "impact") add.push([at, 2, 36, 110]);
  else if (kind === "down") add.push([at, L(bars), 38, 100]);
  else if (kind === "sub") add.push([at, L(1), 41, 110]);
  for (const n of add) if (n[0] >= 0 && n[1] > 0.05) g.notes.push(n.map((x, i) => i < 2 ? +x.toFixed(4) : x));
  g.notes.sort((a, b) => a[0] - b[0]);
  if (mt(g.id).notes) mt(g.id).notes = null;
  _tracksKey = "";
  _arrCache.clear();
  return add.length;
}
function autoTransitions(opts = {}) {
  const secs = secList();
  let n = 0;
  for (let i = 1; i < secs.length; i++) {
    const s = secs[i], prev = secs[i - 1], at = s.start;
    if (["chorus", "hook", "drop"].includes(s.kind)) {
      n += trAdd(prev.kind === "build" ? "riser" : "rev", at, prev.kind === "build" ? 4 : 2);
      n += trAdd("impact", at);
      if (s.kind === "drop") n += trAdd("sub", at);
      if (prev.kind === "build" || prev.kind === "prechorus") n += trAdd("roll", at);
    } else if (["chorus", "hook", "drop"].includes(prev.kind)) n += trAdd("down", at, 2);
    else if (s.kind === "build") n += trAdd("sweep", s.end, Math.max(1, Math.round((tmM(s.end) - tmM(s.start)) / S.B.timing.bpb)));
    else if (opts.all) n += trAdd("rev", at, 1);
  }
  return n;
}
function secEnergy() {
  const secs = secList(), bpb = S.B.timing.bpb, tracks = tracksAll().filter((t) => audible(t));
  return secs.map((s) => {
    let notes = 0, active = 0, audio = 0;
    const bars = Math.max(1, (tmM(s.end) - tmM(s.start)) / bpb);
    for (const t of tracks) {
      const m = mt(t.id), md = modeOf(t);
      let hit = false;
      if (md !== "audio") { const k = arranged(t).filter((n) => n[0] >= s.start && n[0] < s.end).length; if (k) { notes += k; hit = true; } }
      if (t.has_audio && md !== "midi" && m.clips.some((c) => !c.mute && c.start < s.end && c.start + c.dur / period() > s.start)) { audio++; hit = true; }
      if (hit) active++;
    }
    return { s, density: notes / bars, active, audio, score: active * 1.5 + Math.log2(1 + notes / bars) };
  });
}
function energyHints(E) {
  const out = [];
  if (!E.length) return ["Немає секцій. Виберіть структуру й натисніть «Записати структуру»."];
  const by = (k) => E.filter((e) => e.s.kind === k);
  const avg = (a) => a.length ? a.reduce((x, e) => x + e.score, 0) / a.length : null;
  const v = avg(by("verse")), c = avg([...by("chorus"), ...by("hook"), ...by("drop")]), i = avg(by("intro"));
  if (v != null && c != null && c <= v + 0.3) out.push("Приспів не енергійніший за куплет. Додайте в приспів партію (пад, гітару, другий голос), барабани щільніше або приберіть щось із куплету.");
  if (i != null && v != null && i >= v) out.push("Інтро таке ж щільне, як куплет. Почніть тихіше: без барабанів або баса — тоді вступ куплету прозвучить яскравіше.");
  const scores = E.map((e) => e.score), mx = Math.max(...scores), mn = Math.min(...scores);
  if (E.length > 3 && mx - mn < 0.8) out.push("Усі секції мають майже однакову енергію — пісні бракує контрасту. Зробіть брейк або бридж розрідженим.");
  E.forEach((e) => { if (e.active === 0) out.push(`«${e.s.name_ua}» порожня — у ній нічого не звучить.`); if (["chorus", "drop", "hook"].includes(e.s.kind) && e.active && !tracksAll().some((t) => roleGroup(t) === "drums" && arranged(t).some((n) => n[0] >= e.s.start && n[0] < e.s.end))) out.push(`У «${e.s.name_ua}» немає барабанів — приспіву часто бракує удару.`); });
  for (let k = 1; k < E.length; k++) if (["chorus", "drop", "hook"].includes(E[k].s.kind) && !(S.mix.gens || []).some((g) => g.trfx && g.notes.some((n) => Math.abs(n[0] + n[1] - E[k].s.start) < 0.1 || Math.abs(n[0] - E[k].s.start) < 0.1))) { out.push(`Перед «${E[k].s.name_ua}» немає переходу. Кнопка «Додати переходи» поставить райзер і удар.`); break; }
  return out.length ? out : ["Енергія пісні наростає правильно. Так тримати!"];
}
function expandLoop(a, b, list, fromBar, withTr) {
  const P = period(), secs = writeStructure(list, fromBar), bpb = S.B.timing.bpb;
  const loopM = tmM(b) - tmM(a);
  const loopChords = chordList().filter((c) => c.label !== "N" && c.end > a + 1e-3 && c.start < b - 1e-3).map((c) => ({ ...c, start: Math.max(c.start, a), end: Math.min(c.end, b) }));
  const newChords = [];
  for (const t of tracksAll()) {
    const m = mt(t.id), c = m.clips.find((x) => !x.mute && x.start <= a + 1e-4 && x.start + x.dur / P > a + 1e-3);
    if (!c) { m.clips = []; continue; }
    const srcA = c.src + (a - c.start) * P, avail = Math.min((b - a) * P, c.dur - (a - c.start) * P);
    const clips = [];
    for (const s of S.mix.sections.filter((x) => x.start >= secs.a - 1e-3 && x.end <= secs.b + 1e-3)) {
      if (!secAllowed(s.kind, t)) continue;
      for (let mm = tmM(s.start); mm < tmM(s.end) - 1e-3; mm += loopM) {
        const st = tmU(mm), en = Math.min(s.end, tmU(mm + loopM));
        clips.push({ id: uid("c"), start: +st.toFixed(5), src: srcA, dur: Math.min(avail, (en - st) * P), gain: c.gain || 0, fi: 5e-3, fo: 5e-3, mute: false });
      }
    }
    m.clips = clips;
  }
  for (const s of S.mix.sections.filter((x) => x.start >= secs.a - 1e-3 && x.end <= secs.b + 1e-3)) {
    for (let mm = tmM(s.start); mm < tmM(s.end) - 1e-3; mm += loopM) {
      const off = tmU(mm) - a;
      for (const ch of loopChords) { const st = ch.start + off, en = Math.min(ch.end + off, s.end); if (st < s.end - 1e-3) newChords.push({ ...ch, start: +st.toFixed(5), end: +en.toFixed(5) }); }
    }
  }
  if (loopChords.length) S.mix.chords = S.mix.chords.filter((c) => c.end <= secs.a + 1e-3 || c.start >= secs.b - 1e-3).concat(newChords).sort((x, y) => x.start - y.start);
  for (const g of S.mix.gens || []) if (g.trfx) g.notes = g.notes.filter((n) => n[0] < secs.a || n[0] >= secs.b);
  let tr = 0;
  if (withTr) tr = autoTransitions();
  _tracksKey = "";
  _arrCache.clear();
  return { secs, tr };
}
const ARR = { struct: "pop", list: null, from: 1, tr: true };
function openArranger() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  if (!ARR.list) ARR.list = STRUCTS[ARR.struct][1].map((x) => x.slice());
  let m = document.getElementById("arr-modal");
  if (!m) {
    m = document.createElement("div"); m.className = "modal"; m.id = "arr-modal"; document.body.appendChild(m);
    if (!UIP.mfloat["arr-modal"]) { UIP.mfloat["arr-modal"] = { on: true, rect: { x: Math.max(20, innerWidth / 2 - 520), y: 100, w: 1040, h: Math.min(780, innerHeight - 120) } }; saveUI(); }
  }
  const E = secEnergy(), hints = energyHints(E);
  const hasLoop = !!(S.loop && S.loop.b > S.loop.a + 0.5);
  const total = ARR.list.reduce((s, x) => s + x[1], 0);
  m.innerHTML = `<div class="modal-card" style="width:min(1040px,96vw)"><div class="modal-head"><h3>Аранжувальник: структура, енергія, переходи</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body arr">
      <div class="arr-cols">
        <div>
          <h5>Енергія пісні по секціях</h5>
          <canvas id="arr-cv" height="150" data-hint="Висота стовпчика — енергія секції: скільки інструментів звучить і наскільки щільно. Добра пісня має хвилі: тихіше в куплеті, найвище в приспіві"></canvas>
          <ul class="arr-hints">${hints.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
          <h5>Переходи між секціями</h5>
          <p class="muted small">Переходи — короткі звуки на межах секцій: райзер перед приспівом, удар на його початку, спад після. Вони пишуться в доріжку «FX переходів» як ноти, тож їх можна посунути чи видалити.</p>
          <div class="arr-row"><button class="btn primary sm" id="arr-tr" data-hint="Розставити райзери, удари, роли й спади на всіх межах секцій за правилами жанру">Додати переходи на всі межі</button><button class="btn ghost sm" id="arr-trclr" data-hint="Прибрати всі переходи">Прибрати переходи</button></div>
          <div class="arr-row"><label>Вручну, на початку такту <input type="number" id="arr-trbar" min="1" value="${hmBarAt(S.playBeat)}"></label><select id="arr-trk">${[["riser", "Райзер (2 такти до)"], ["sweep", "Свіп шуму (4 такти до)"], ["rev", "Зворотна тарілка (такт до)"], ["roll", "Барабанний рол (такт до)"], ["impact", "Удар"], ["sub", "Саб-дроп"], ["down", "Даунліфтер (2 такти після)"]].map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select><button class="btn ghost sm" id="arr-tradd">Додати</button></div>
        </div>
        <div>
          <h5>Структура</h5>
          <div class="arr-row"><select id="arr-st" data-hint="Готові структури за жанром — потім їх можна правити">${Object.entries(STRUCTS).map(([k, v]) => `<option value="${k}" ${k === ARR.struct ? "selected" : ""}>${escapeHtml(v[0])}</option>`).join("")}</select><span class="muted small">разом ${total} тактів</span></div>
          <div class="arr-list">${ARR.list.map(([k, bars], i) => `<div class="arr-sec" data-i="${i}" style="--sc:${(SEC_KINDS[k] || SEC_KINDS.verse)[2]}"><select data-sk>${Object.entries(SEC_KINDS).map(([kk, v]) => `<option value="${kk}" ${kk === k ? "selected" : ""}>${escapeHtml(v[0])}</option>`).join("")}</select><input type="number" data-sb min="1" max="64" value="${bars}"><span class="muted small">тактів</span><button data-up data-hint="Вище">▲</button><button data-dn data-hint="Нижче">▼</button><button data-del data-hint="Прибрати секцію">✕</button></div>`).join("")}</div>
          <div class="arr-row"><button class="btn ghost sm" id="arr-add">＋ Секція</button><label>з такту <input type="number" id="arr-from" min="1" value="${ARR.from}"></label></div>
          <div class="arr-row"><button class="btn ghost" id="arr-write" data-hint="Записати лише розмітку секцій (назви й кольори на лінійці). Звук не змінюється">Записати структуру</button></div>
          <div class="arr-box"><h5>Луп → повна пісня</h5>
            <p class="muted small">Зробили 4–8 тактів, які подобаються? Виділіть їх циклом на лінійці — програма розставить луп за структурою: в інтро й аутро без барабанів і баса, у брейку без барабанів, у приспіві все разом, плюс переходи.</p>
            <div class="arr-row"><span class="${hasLoop ? "" : "warn"}">${hasLoop ? `Луп: такти ${hmBarAt(S.loop.a)}–${hmBarAt(S.loop.b - 0.01)}` : "Цикл не виділено — потягніть по лінійці тактів."}</span><label class="chk"><input type="checkbox" id="arr-wtr" ${ARR.tr ? "checked" : ""}> з переходами</label></div>
            <button class="btn primary" id="arr-exp" ${hasLoop ? "" : "disabled"} data-hint="Замінює кліпи всіх доріжок розстановкою лупа за структурою. Скасувати — Ctrl+Z">Розгорнути луп у пісню</button></div>
        </div>
      </div>
    </div></div>`;
  m.hidden = false;
  const cv = $("#arr-cv", m);
  requestAnimationFrame(() => {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = 150;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#0e1014"; c.fillRect(0, 0, w, h);
    if (!E.length) return;
    const tot = E.reduce((s, e) => s + (e.s.end - e.s.start), 0), mx = Math.max(1, ...E.map((e) => e.score));
    let x = 0;
    c.font = "10px " + getComputedStyle(document.body).fontFamily;
    for (const e of E) {
      const ww = (e.s.end - e.s.start) / tot * w, hh = e.score / mx * (h - 30);
      c.fillStyle = e.s.color || "#3b82f6"; c.globalAlpha = 0.85; c.fillRect(x + 1, h - 16 - hh, ww - 2, hh); c.globalAlpha = 1;
      c.fillStyle = "#8b91a3"; if (ww > 30) c.fillText(e.s.name_ua.slice(0, Math.floor(ww / 6)), x + 3, h - 4);
      x += ww;
    }
  });
  const rerender = () => openArranger();
  $("[data-close]", m).onclick = () => { m.hidden = true; };
  $("#arr-st", m).onchange = (e) => { ARR.struct = e.target.value; ARR.list = STRUCTS[ARR.struct][1].map((x) => x.slice()); rerender(); };
  $("#arr-from", m).onchange = (e) => { ARR.from = Math.max(1, +e.target.value || 1); };
  $("#arr-wtr", m).onchange = (e) => { ARR.tr = e.target.checked; };
  $$(".arr-sec", m).forEach((row) => {
    const i = +row.dataset.i;
    $("[data-sk]", row).onchange = (e) => { ARR.list[i][0] = e.target.value; rerender(); };
    $("[data-sb]", row).onchange = (e) => { ARR.list[i][1] = clamp(+e.target.value || 4, 1, 64); rerender(); };
    $("[data-up]", row).onclick = () => { if (i) { [ARR.list[i - 1], ARR.list[i]] = [ARR.list[i], ARR.list[i - 1]]; rerender(); } };
    $("[data-dn]", row).onclick = () => { if (i < ARR.list.length - 1) { [ARR.list[i + 1], ARR.list[i]] = [ARR.list[i], ARR.list[i + 1]]; rerender(); } };
    $("[data-del]", row).onclick = () => { ARR.list.splice(i, 1); rerender(); };
  });
  $("#arr-add", m).onclick = () => { ARR.list.push(["verse", 8]); rerender(); };
  $("#arr-write", m).onclick = () => {
    if (!ARR.list.length) return;
    pushUndo("структура");
    const r = writeStructure(ARR.list, ARR.from);
    afterEdit(true);
    toast(`Структуру записано: ${ARR.list.length} секцій, ${r.bars} тактів.`);
    rerender();
  };
  $("#arr-tr", m).onclick = () => { pushUndo("переходи"); const n = autoTransitions(); afterEdit(true); loadInstrumentBuffers(); toast(n ? `Додано переходів: ${n}. Вони в доріжці «FX переходів».` : "Немає меж секцій для переходів.", !n); rerender(); };
  $("#arr-trclr", m).onclick = () => { const g = (S.mix.gens || []).find((x) => x.trfx); if (!g) return; pushUndo("прибрати переходи"); g.notes = []; mt(g.id).notes = null; _tracksKey = ""; _arrCache.clear(); afterEdit(true); rerender(); };
  $("#arr-tradd", m).onclick = () => { pushUndo("перехід"); const at = tmU((Math.max(1, +$("#arr-trbar", m).value || 1) - 1) * S.B.timing.bpb); trAdd($("#arr-trk", m).value, at, $("#arr-trk", m).value === "sweep" ? 4 : 2); afterEdit(true); toast("Перехід додано в доріжку «FX переходів»."); };
  $("#arr-exp", m).onclick = () => {
    if (!hasLoop || !ARR.list.length) return;
    pushUndo("луп у пісню");
    const r = expandLoop(S.loop.a, S.loop.b, ARR.list, ARR.from, ARR.tr);
    S.loop = null;
    afterEdit(true);
    if (typeof hmRebuild === "function") hmRebuild(false);
    toast(`Готово: ${ARR.list.length} секцій, ${r.secs.bars} тактів${r.tr ? `, переходів ${r.tr}` : ""}. Послухайте з початку; Ctrl+Z — скасувати.`);
    rerender();
  };
}
const GENRES = {
  trap: { name: "Трап", bpm: 140, mode: "minor", prog: "Темний трап", drums: "trap", bass: "slide808", acc: ["pad", "hold", "Теплий пад"], struct: "trap" },
  drill: { name: "Дрилл", bpm: 142, mode: "minor", prog: "Дрилл", drums: "drill", bass: "slide808", acc: ["pad", "stabs", "Струнні"], struct: "trap" },
  phonk: { name: "Фонк", bpm: 130, mode: "minor", prog: "Хіп-хоп петля", drums: "phonk", bass: "sub808", acc: ["arp", "up", "Плак"], struct: "trap" },
  pop: { name: "Поп", bpm: 110, mode: "major", prog: "Поп-хіт", drums: "pop", bass: "synco", acc: ["pad", "piano", "Піаніно (FM)"], struct: "pop" },
  rnb: { name: "R&B / соул", bpm: 90, mode: "major", prog: "Нео-соул", drums: "hiphop", bass: "synco", acc: ["pad", "piano", "E-Piano (Rhodes)"], struct: "pop" },
  house: { name: "Хаус", bpm: 124, mode: "minor", prog: "Хаус-підйом", drums: "house", bass: "octaves", acc: ["pad", "offbeat", "Плак"], struct: "edm" },
  dnb: { name: "Драм-н-бейс", bpm: 172, mode: "minor", prog: "Драм-н-бейс", drums: "dnb", bass: "roots", acc: ["pad", "hold", "Теплий пад"], struct: "edm" },
  synthwave: { name: "Синтвейв", bpm: 100, mode: "minor", prog: "Синтвейв", drums: "disco", bass: "eighths", acc: ["arp", "updown", "Плак"], struct: "pop" },
  lofi: { name: "Лоу-фай", bpm: 82, mode: "minor", prog: "Лоу-фай", drums: "lofi", bass: "roots", acc: ["pad", "ballad", "E-Piano (Rhodes)"], struct: "lofi" },
  rock: { name: "Рок", bpm: 120, mode: "major", prog: "Рок-гімн", drums: "rock", bass: "eighths", acc: ["guitar", "rock", null], struct: "rock" },
  afro: { name: "Афробіт", bpm: 105, mode: "major", prog: "Сентиментально", drums: "afro", bass: "synco", acc: ["guitar", "pick", null], struct: "pop" },
  ballad: { name: "Балада", bpm: 72, mode: "major", prog: "Канон", drums: "halftime", bass: "roots", acc: ["pad", "ballad", "Піаніно (FM)"], struct: "ballad" },
};
function genSectioned(type, style, opt, label, preset) {
  const secs = secList();
  const fake = { is_drums: type === "drums", role: type === "drums" ? "drums" : type === "bass" ? "bass" : GEN[type].role };
  const notes = [];
  for (const s of secs) if (secAllowed(s.kind, fake)) notes.push(...genNotes(type, style, opt, [s.start, s.end]));
  const id = genAddTrack(type, style, opt, [0, arrEnd()], label, preset, true);
  if (!id) return null;
  const g = S.mix.gens.find((x) => x.id === id);
  g.notes = notes.sort((a, b) => a[0] - b[0]);
  g.spec.sections = true;
  return id;
}
function applyGenre(key) {
  const G = GENRES[key];
  if (!G || !S.B) return;
  pushUndo("шаблон жанру");
  const st = STRUCTS[G.struct][1];
  writeStructure(st, 1);
  const lib = HM_LIB.find((e) => e[2] === G.prog);
  if (lib) { const prog = hmLibProg(lib); const end = S.mix.sections[S.mix.sections.length - 1].end; hmWriteChords(prog, 0, end); }
  genSectioned("drums", G.drums, { human: 0.3, fills: true, crash: true, swing: 0 }, `Барабани · ${GEN.drums.styles[G.drums]}`);
  genSectioned("bass", G.bass, { octave: 1, human: 0.3 }, `Бас · ${GEN.bass.styles[G.bass]}`);
  const [at, as, ap] = G.acc;
  genSectioned(at, as, { octave: 1, human: 0.3, vl: true, rate: 0.25, range: 2 }, `${GEN[at].name} · ${GEN[at].styles[as]}`, ap);
  autoTransitions();
  _tracksKey = "";
  _arrCache.clear();
  afterEdit(true);
  loadInstrumentBuffers();
  toast(`Шаблон «${G.name}» готовий: структура, акорди, барабани, бас, акомпанемент і переходи. Додайте мелодію: «Інструменти» → «Мелодія з нуля».`);
}
const _hmRebuildA = hmRebuild;
hmRebuild = function(force) {
  const r = _hmRebuildA(force);
  for (const g of S.mix.gens || []) {
    if (!g.spec || !g.spec.sections || (mt(g.id).notes && !force)) continue;
    const fake = { is_drums: g.spec.type === "drums", role: g.spec.type === "drums" ? "drums" : g.spec.type === "bass" ? "bass" : GEN[g.spec.type].role };
    const notes = [];
    for (const s of secList()) if (secAllowed(s.kind, fake)) notes.push(...genNotes(g.spec.type, g.spec.style, g.spec.opt, [s.start, s.end]));
    g.notes = notes.sort((a, b) => a[0] - b[0]);
  }
  _tracksKey = "";
  _arrCache.clear();
  return r;
};
(function arrangeUI() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["Аранжувальник: структура, енергія, переходи…", needProject(openArranger)], ["Шаблон жанру…", needProject(openGenrePicker)]]);
})();
function openGenrePicker() {
  const m = careModalBox("genre-modal", "Шаблон жанру", `<p class="muted">Програма запише структуру пісні, акорди, барабани, бас, акомпанемент і переходи в стилі жанру. Темп проєкту не змінюється — для точного звучання виберіть шаблон із темпом, близьким до вашого (вказано в дужках). Скасувати — Ctrl+Z.</p>
    <div class="genre-grid">${Object.entries(GENRES).map(([k, g]) => `<button class="hm-le" data-g="${k}"><b>${escapeHtml(g.name)}</b><span>${g.bpm} BPM · ${g.mode === "minor" ? "мінор" : "мажор"} · ${escapeHtml(STRUCTS[g.struct][0])}</span></button>`).join("")}</div>`);
  $$("[data-g]", m).forEach((b) => b.onclick = () => { m.hidden = true; applyGenre(b.dataset.g); });
}
const _renderDrumsA = renderDrums;
renderDrums = async function(box, T) {
  if (T.m.inst && T.m.inst.type === "trfx") {
    box.innerHTML = `<div class="trfx-info"><h6>FX переходів</h6><p class="muted">Ця доріжка грає звуки переходів. Кожна нота — окремий звук, довжина ноти — тривалість ефекту:</p><ul>${Object.entries(TRFX).map(([n, l]) => `<li><b>${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}</b> — ${escapeHtml(l)}</li>`).join("")}</ul><p class="muted small">Ноти можна посувати й подовжувати у вкладці «Ноти». Швидко розставити переходи — «Інструменти» → «Аранжувальник».</p></div>`;
    return;
  }
  return _renderDrumsA(box, T);
};
