"use strict";
const HM_SCALES = {
  major: ["Мажор", [0, 2, 4, 5, 7, 9, 11]],
  minor: ["Мінор (натуральний)", [0, 2, 3, 5, 7, 8, 10]],
  harmonic: ["Гармонічний мінор", [0, 2, 3, 5, 7, 8, 11]],
  melodic: ["Мелодичний мінор", [0, 2, 3, 5, 7, 9, 11]],
  dorian: ["Дорійський лад", [0, 2, 3, 5, 7, 9, 10]],
  phrygian: ["Фригійський лад", [0, 1, 3, 5, 7, 8, 10]],
  lydian: ["Лідійський лад", [0, 2, 4, 6, 7, 9, 11]],
  mixolydian: ["Міксолідійський лад", [0, 2, 4, 5, 7, 9, 10]],
  pentaMaj: ["Мажорна пентатоніка", [0, 2, 4, 7, 9]],
  pentaMin: ["Мінорна пентатоніка", [0, 3, 5, 7, 10]],
  blues: ["Блюзова гама", [0, 3, 5, 6, 7, 10]],
};
Object.assign(CH_IV, { "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], "9": [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], aug: [0, 4, 8], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], "7sus4": [0, 5, 7, 10], mMaj7: [0, 3, 7, 11] });
const HM_KIND_ORDER = ["", "m", "dim", "aug", "sus2", "sus4", "7", "maj7", "m7", "m7b5", "dim7", "mMaj7", "6", "m6", "add9", "madd9", "9", "maj9", "m9", "7sus4"];
const HM_KIND_UA = { "": "мажор", m: "мінор", dim: "зменшений", aug: "збільшений", sus2: "sus2 — без терції, ніжно", sus4: "sus4 — без терції, з напругою", "7": "домінантсептакорд", maj7: "великий мажорний септакорд — мрійливо", m7: "мінорний септакорд — м'яко", m7b5: "напівзменшений", dim7: "зменшений септакорд", mMaj7: "мінорний з великою септимою", "6": "секстакорд — тепло", m6: "мінорний секстакорд", add9: "з доданою ноною — світло", madd9: "мінорний з ноною", "9": "нонакорд — джазово", maj9: "мажорний нонакорд", m9: "мінорний нонакорд", "7sus4": "септакорд sus4" };
const HM_PRESETS = ["Піаніно (FM)", "E-Piano (Rhodes)", "Теплий пад", "Струнні", "Орган", "Гітарний щип", "Плак"];
const HM_LIB = [
  ["Поп", "major", "Поп-хіт", "I V vi IV"],
  ["Поп", "major", "Класика 50-х", "I vi IV V"],
  ["Поп", "major", "Сентиментально", "vi IV I V"],
  ["Поп", "major", "Мрійливо", "I iii vi IV"],
  ["Поп", "major", "Канон", "I V vi iii IV I IV V"],
  ["Поп", "major", "Підйом до приспіву", "IV V iii vi ii V I I"],
  ["Поп", "major", "Солодкий спуск", "I V vi iii IV I ii V"],
  ["Поп", "major", "J-pop «королівська дорога»", "IVmaj7 V7 iii7 vi"],
  ["Поп", "major", "Ностальгія", "I III7 IV iv"],
  ["Поп", "major", "Біттлз (запозичений iv)", "I IV iv I"],
  ["Рок", "major", "Рок-гімн", "I bVII IV I"],
  ["Рок", "major", "Кантрі / фолк", "I IV I V"],
  ["Рок", "major", "Блюз 12 тактів", "I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7"],
  ["Рок", "minor", "Гранж", "i bVI bIII bVII"],
  ["Рок", "major", "Міксолідійський драйв", "I bVII I bVII"],
  ["Сумно", "minor", "Сумна балада", "i bVI bIII bVII"],
  ["Сумно", "minor", "Пісня дощу", "i bIII bVII iv"],
  ["Сумно", "minor", "Самотність", "i iv bVII bIII"],
  ["Сумно", "minor", "Розлука", "i bVII bVI bVII"],
  ["Сумно", "major", "Тиха туга", "vi IV I V"],
  ["Епічно", "minor", "Кіно-епік", "i bVI bVII i"],
  ["Епічно", "major", "Тріумф", "I bVI bVII I"],
  ["Епічно", "minor", "Героїчний мінор", "i bVI bIII bVII"],
  ["Епічно", "minor", "Гармонічний мінор", "i iv V i"],
  ["Темно / трап", "minor", "Темний трап", "i iv bVI V"],
  ["Темно / трап", "minor", "Дрилл", "i bVI i bII"],
  ["Темно / трап", "minor", "Фригійська напруга", "i bII i bII"],
  ["Темно / трап", "minor", "Андалузька каденція", "i bVII bVI V"],
  ["Темно / трап", "minor", "Хіп-хоп петля", "i v bVI bVII"],
  ["Лоу-фай і соул", "minor", "Лоу-фай", "i7 iv7 bVII7 bIIImaj7"],
  ["Лоу-фай і соул", "major", "Соул", "Imaj7 vi7 ii7 V7"],
  ["Лоу-фай і соул", "major", "Нео-соул", "IVmaj7 iii7 ii7 Imaj7"],
  ["Лоу-фай і соул", "major", "Джаз ii–V–I", "ii7 V7 Imaj7 Imaj7"],
  ["Лоу-фай і соул", "minor", "Мінорний джаз", "ii7b5 V7 i7 i7"],
  ["Лоу-фай і соул", "major", "Чілхоп", "IVmaj7 iii7 vi7 V7sus4"],
  ["Танцювальна", "minor", "Хаус-підйом", "i bVI bIII bVII"],
  ["Танцювальна", "major", "Клубний поп", "vi IV I V"],
  ["Танцювальна", "minor", "Синтвейв", "i bVII bVI bVII"],
  ["Танцювальна", "minor", "Драм-н-бейс", "i bIII bVII iv"],
  ["Танцювальна", "major", "Регі / офбіт", "I IV I V"],
  ["Ладова музика", "minor", "Дорійський грув", "i IV i IV"],
  ["Ладова музика", "major", "Лідійська казка", "I II I II"],
  ["Ладова музика", "minor", "Фламенко", "i bVII bVI V"],
  ["Ладова музика", "minor", "Східна", "i bII bIII bII"],
];
const HM_NEXT = {
  major: { 0: [[3, 4, 5], [1]], 1: [[4], [6, 3]], 2: [[5, 3], [1]], 3: [[4, 0], [1, 2]], 4: [[0, 5], [3]], 5: [[3, 1], [4, 2]], 6: [[0], [2, 5]] },
  minor: { 0: [[5, 3, 6], [4, 2]], 1: [[4], [6]], 2: [[5, 6], [3]], 3: [[4, 6, 0], [2]], 4: [[0, 5], [3]], 5: [[6, 2, 3], [4]], 6: [[2, 0], [5]] },
};
const HM = { prog: [], sel: -1, sevenths: false, preset: "Піаніно (FM)", playG: null, playT: [], loop: true, group: "Усі", m: null };
const HM_UI = { scaleOn: true, lock: false };
const HM_ROM = ["I", "II", "III", "IV", "V", "VI", "VII"];
const HM_MAJ = [0, 2, 4, 5, 7, 9, 11];

function hmHarm() {
  if (!S.mix.harmony) S.mix.harmony = {};
  return S.mix.harmony;
}
function hmKey() {
  const k = S.B && S.B.key || { tonic: 0, mode: "major" }, h = S.mix && S.mix.harmony || {};
  const scale = h.scale && HM_SCALES[h.scale] ? h.scale : k.mode === "minor" ? "minor" : "major";
  const sc = HM_SCALES[scale][1];
  return { tonic: h.tonic != null ? h.tonic : k.tonic, scale, sc, minor: sc[2] === 3 };
}
function hmChordScale() {
  const k = hmKey();
  return k.sc.length === 7 ? k.sc : HM_SCALES[k.minor ? "minor" : "major"][1];
}
function hmPcs() {
  const k = hmKey();
  return k.sc.map((i) => (k.tonic + i) % 12);
}
function hmInScale(p) {
  return hmPcs().includes(((p % 12) + 12) % 12);
}
function hmSnapP(p) {
  if (hmInScale(p)) return p;
  for (let d = 1; d < 7; d++) {
    if (hmInScale(p - d)) return p - d;
    if (hmInScale(p + d)) return p + d;
  }
  return p;
}
function hmDeg(p, sc, tonic) {
  const n = sc.length, rel = p - tonic, oct = Math.floor(rel / 12), pc = rel - 12 * oct;
  let i = 0;
  for (let k = 0; k < n; k++) if (sc[k] <= pc) i = k;
  return oct * n + i;
}
function hmP(d, sc, tonic) {
  const n = sc.length, oct = Math.floor(d / n), i = d - oct * n;
  return tonic + 12 * oct + sc[i];
}
function hmKindOf(iv) {
  const norm = (a) => [...new Set(a.map((x) => ((x % 12) + 12) % 12))].sort((x, y) => x - y).join(",");
  const want = norm(iv);
  for (const k of HM_KIND_ORDER) if (CH_IV[k] && norm(CH_IV[k]) === want) return k;
  return iv[1] === 3 ? "m" : "";
}
function hmDiatonic(seventh) {
  const k = hmKey(), sc = hmChordScale(), out = [];
  for (let d = 0; d < 7; d++) {
    const root = (k.tonic + sc[d]) % 12, st = seventh ? [0, 2, 4, 6] : [0, 2, 4];
    const iv = st.map((s) => { const x = sc[(d + s) % 7] + (d + s >= 7 ? 12 : 0) - sc[d]; return x; });
    out.push({ root, kind: hmKindOf(iv), deg: d });
  }
  return out;
}
function hmRoman(root, kind) {
  const k = hmKey(), semi = (root - k.tonic + 12) % 12;
  const map = { 0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV", 6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII" };
  let r = map[semi];
  const iv = CH_IV[kind] || CH_IV[""];
  const minor = iv[1] === 3, dim = kind === "dim" || kind === "dim7" || kind === "m7b5";
  if (minor || dim) r = r.replace(/[IV]+/, (x) => x.toLowerCase());
  const suf = { dim: "°", dim7: "°7", m7b5: "ø7", aug: "+", "7": "7", m7: "7", maj7: "maj7", mMaj7: "maj7", "6": "6", m6: "6", "9": "9", m9: "9", maj9: "maj9", add9: "add9", madd9: "add9", sus2: "sus2", sus4: "sus4", "7sus4": "7sus4" }[kind] || "";
  return r + suf;
}
function hmFunc(root) {
  const k = hmKey(), semi = (root - k.tonic + 12) % 12;
  const T = k.minor ? [0, 3] : [0, 4, 9], Sd = k.minor ? [5, 2, 8] : [2, 5], D = k.minor ? [7, 10, 11] : [7, 11];
  if (T.includes(semi)) return ["T", "Тоніка — спокій, «дім»", "#4ade80"];
  if (Sd.includes(semi)) return ["S", "Субдомінанта — рух від дому", "#60a5fa"];
  if (D.includes(semi)) return ["D", "Домінанта — напруга, хоче повернутися додому", "#f6ad55"];
  return ["±", "Барва поза тональністю — яскравий колір", "#c084fc"];
}
function hmTok(tok, tonic) {
  const [body, len] = tok.split(":");
  const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/.exec(body);
  if (!m) return null;
  const deg = HM_ROM.indexOf(m[2].toUpperCase());
  const root = (tonic + HM_MAJ[deg] + (m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0) + 24) % 12;
  const minor = m[2] === m[2].toLowerCase(), s = m[3];
  const map = { "": minor ? "m" : "", "7": minor ? "m7" : "7", maj7: minor ? "mMaj7" : "maj7", "°": "dim", dim: "dim", "°7": "dim7", "ø7": "m7b5", "7b5": "m7b5", sus4: "sus4", sus2: "sus2", add9: minor ? "madd9" : "add9", "9": minor ? "m9" : "9", maj9: "maj9", "6": minor ? "m6" : "6", "+": "aug", "7sus4": "7sus4" };
  return { root, kind: map[s] != null ? map[s] : minor ? "m" : "", bars: len ? +len : 1 };
}
function hmLibRef(mode) {
  const k = hmKey();
  if (mode === "major" && k.minor) return (k.tonic + 3) % 12;
  if (mode === "minor" && !k.minor) return (k.tonic + 9) % 12;
  return k.tonic;
}
function hmLibProg(entry) {
  const ref = hmLibRef(entry[1]);
  return entry[3].split(/\s+/).map((t) => hmTok(t, ref)).filter(Boolean);
}
function hmName(c) {
  return chordName(c.root, c.kind);
}
function hmCombos(pcs, lo, hi) {
  const opts = pcs.map((pc) => { const a = []; for (let p = lo; p <= hi; p++) if (((p % 12) + 12) % 12 === pc) a.push(p); return a; });
  let out = [[]];
  for (const o of opts) { const nx = []; for (const a of out) for (const p of o) nx.push(a.concat(p)); out = nx; }
  return out.map((a) => a.sort((x, y) => x - y));
}
function hmVoiceLead(chords, opt = {}) {
  const center = opt.center || 60, lo = center - 9, hi = center + 12, res = [];
  let prev = null;
  for (const c of chords) {
    const iv = CH_IV[c.kind] || CH_IV[""];
    let pcs = [...new Set(iv.map((i) => (c.root + i) % 12))];
    if (pcs.length > 4) pcs = pcs.filter((p) => p !== (c.root + 7) % 12);
    const span = pcs.length > 3 ? 14 : 12;
    const cands = hmCombos(pcs, lo, hi).filter((a) => a[a.length - 1] - a[0] <= span);
    let best = null, bc = 1e9;
    for (const a of cands) {
      const mean = a.reduce((s, x) => s + x, 0) / a.length;
      let cost;
      if (!prev) cost = Math.abs(mean - center) + (a[0] % 12 !== c.root ? 1.5 : 0);
      else {
        cost = 0;
        for (const p of a) cost += Math.min(...prev.map((q) => Math.abs(p - q)));
        for (const q of prev) cost += Math.min(...a.map((p) => Math.abs(p - q))) * 0.5;
        cost += Math.abs(mean - center) * 0.25;
      }
      if (cost < bc) { bc = cost; best = a; }
    }
    if (!best) best = iv.map((i) => center - 5 + ((c.root + i - center + 5) % 12 + 12) % 12).sort((x, y) => x - y);
    res.push(best);
    prev = best;
  }
  return res;
}
function hmInst(name) {
  const n = name || HM.preset;
  return { type: "synth", preset: n, params: Plugins.presetByName(n) };
}
function hmPlayNotes(list, inst) {
  const A = ensureCtx();
  A.ctx.resume();
  const g = A.ctx.createGain();
  g.gain.value = 0.85;
  g.connect(A.master ? A.master.input : A.out);
  const t0 = A.ctx.currentTime + 0.04;
  let end = 0;
  for (const [at, dur, p, v] of list) { DSP.playNote(A.ctx, g, inst || hmInst(), p, (v || 90) / 127, t0 + at, dur, A.ibuf); end = Math.max(end, at + dur); }
  setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (end + 3) * 1000);
  return g;
}
function hmAudition(c) {
  const v = hmVoiceLead([c])[0];
  hmPlayNotes([[0, 1.3, 36 + c.root + (c.root < 4 ? 12 : 0), 80]].concat(v.map((p) => [0.0, 1.3, p, 86])));
}
function hmStop() {
  HM.playT.forEach(clearTimeout);
  HM.playT = [];
  if (HM.playG) { try { HM.playG.gain.setTargetAtTime(0, S.audio.ctx.currentTime, 0.05); } catch (e) {} const g = HM.playG; setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 400); }
  HM.playG = null;
  if (HM.m) { $$(".hm-card.now", HM.m).forEach((x) => x.classList.remove("now")); const b = $("#hm-play", HM.m); if (b) b.textContent = "▶ Слухати"; }
}
function hmPlayProg() {
  if (HM.playG) return hmStop();
  if (!HM.prog.length) return toast("Спершу додайте акорди: клацніть на будь-який акорд ліворуч.", true);
  if (S.playing) stopPlay();
  const bar = S.B.timing.bpb * period(), V = hmVoiceLead(HM.prog), list = [], marks = [];
  let at = 0;
  HM.prog.forEach((c, i) => {
    const d = c.bars * bar;
    marks.push([at, i]);
    list.push([at, d * 0.98, 36 + c.root + (c.root < 4 ? 12 : 0), 84]);
    for (const p of V[i]) list.push([at, d * 0.98, p, 84]);
    at += d;
  });
  HM.playG = hmPlayNotes(list);
  const b = $("#hm-play", HM.m);
  if (b) b.textContent = "■ Стоп";
  for (const [t, i] of marks) HM.playT.push(setTimeout(() => { if (!HM.m) return; $$(".hm-card", HM.m).forEach((x, k) => x.classList.toggle("now", k === i)); }, t * 1000 + 40));
  HM.playT.push(setTimeout(() => { HM.playG = null; HM.playT = []; if (HM.loop && HM.m && !HM.m.hidden) hmPlayProg(); else hmStop(); }, at * 1000 + 30));
}
function hmSuggest(after) {
  const k = hmKey(), dia = hmDiatonic(HM.sevenths), table = HM_NEXT[k.minor ? "minor" : "major"];
  const last = after || { root: k.tonic, kind: k.minor ? "m" : "" };
  const di = dia.findIndex((c) => c.root === last.root);
  const nat = [], spice = [], tense = [];
  if (di >= 0) {
    table[di][0].forEach((d) => nat.push(dia[d]));
    table[di][1].forEach((d) => spice.push(dia[d]));
  } else nat.push(dia[0], dia[3], dia[4]);
  const t = k.tonic;
  const borrowed = k.minor ? [{ root: (t + 7) % 12, kind: HM.sevenths ? "7" : "" }, { root: (t + 5) % 12, kind: "" }, { root: (t + 1) % 12, kind: HM.sevenths ? "maj7" : "" }] : [{ root: (t + 5) % 12, kind: "m" }, { root: (t + 10) % 12, kind: "" }, { root: (t + 8) % 12, kind: HM.sevenths ? "maj7" : "" }];
  spice.push(...borrowed);
  for (const c of nat.slice(0, 3)) tense.push({ root: (c.root + 7) % 12, kind: "7", to: hmName(c) });
  tense.push({ root: (t + 7) % 12, kind: "7sus4" });
  const uniq = (a) => a.filter((c, i) => a.findIndex((x) => x.root === c.root && x.kind === c.kind) === i && !(c.root === last.root && c.kind === last.kind));
  return { nat: uniq(nat), spice: uniq(spice).slice(0, 4), tense: uniq(tense).slice(0, 4) };
}
function hmRandom() {
  const k = hmKey(), dia = hmDiatonic(HM.sevenths), table = HM_NEXT[k.minor ? "minor" : "major"];
  let d = Math.random() < 0.7 ? 0 : 5;
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push({ root: dia[d].root, kind: dia[d].kind, bars: 1 });
    const opts = table[d][0].concat(Math.random() < 0.3 ? table[d][1] : []);
    d = opts[Math.floor(Math.random() * opts.length)];
    if (i === 2 && Math.random() < 0.6) d = k.minor ? [4, 6][Math.floor(Math.random() * 2)] : [4, 3][Math.floor(Math.random() * 2)];
  }
  if (Math.random() < 0.35) { const j = 1 + Math.floor(Math.random() * 3); out[j].kind = hmSpiceKind(out[j].kind); }
  return out;
}
function hmSpiceKind(kind) {
  const m = (CH_IV[kind] || CH_IV[""])[1] === 3;
  const opts = m ? ["m7", "m9", "madd9"] : ["maj7", "add9", "6", "sus2"];
  return kind === "dim" ? "m7b5" : opts[Math.floor(Math.random() * opts.length)];
}
function hmVariants(c) {
  const minor = (CH_IV[c.kind] || CH_IV[""])[1] === 3;
  const list = minor ? ["m", "m7", "m9", "madd9", "m6", "mMaj7", "", "sus2", "sus4", "m7b5", "dim"] : ["", "maj7", "7", "add9", "6", "9", "maj9", "sus2", "sus4", "7sus4", "m", "aug"];
  return list.map((k) => ({ root: c.root, kind: k }));
}
function hmSave() {
  hmHarm().draft = HM.prog.map((c) => ({ root: c.root, kind: c.kind, bars: c.bars }));
  hmHarm().preset = HM.preset;
  saveMix();
}
function hmAdd(c, at) {
  const x = { root: c.root, kind: c.kind, bars: c.bars || 1 };
  if (at == null) { HM.prog.push(x); HM.sel = HM.prog.length - 1; }
  else { HM.prog.splice(at, 0, x); HM.sel = at; }
  hmSave();
  hmRender();
}
function hmBarAt(b) {
  return Math.floor(tmM(b) / S.B.timing.bpb + 1e-6) + 1;
}
function hmWriteChords(prog, startBeat, endBeat) {
  ownArrangement();
  const bpb = S.B.timing.bpb, m0 = tmM(startBeat), items = [];
  const total = prog.reduce((s, c) => s + c.bars, 0) * bpb;
  const mEnd = endBeat != null ? tmM(endBeat) : m0 + total;
  let m = m0;
  while (m < mEnd - 1e-6) {
    for (const c of prog) {
      if (m >= mEnd - 1e-6) break;
      const e = Math.min(mEnd, m + c.bars * bpb);
      items.push({ start: +tmU(m).toFixed(5), end: +tmU(e).toFixed(5), root: c.root, kind: c.kind, label: chordName(c.root, c.kind), user: true });
      m = e;
    }
    if (!total) break;
  }
  const a = tmU(m0), b = tmU(mEnd), keep = [];
  for (const c of S.mix.chords) {
    if (c.end <= a + 1e-4 || c.start >= b - 1e-4) { keep.push(c); continue; }
    if (c.start < a - 1e-4) keep.push({ ...c, end: a });
    if (c.end > b + 1e-4) keep.push({ ...c, start: b });
  }
  S.mix.chords = keep.concat(items).sort((x, y) => x.start - y.start);
  return { a, b, n: items.length };
}
function genAddTrack(type, style, opt, range, label, preset, all) {
  const notes = genNotes(type, style, opt, range);
  if (!notes.length) return null;
  if (!S.mix.gens) S.mix.gens = [];
  const g = GEN[type], id = uid("gen");
  const name = label || `${g.name} · ${g.styles[style]}`;
  S.mix.gens.push({ id, name, color: g.color, role: g.role, is_drums: !!g.is_drums, program: g.program || 0, notes, spec: { type, style, opt: { ...opt }, range: [...range], all: !!all } });
  const P = period();
  const inst = type === "drums" ? { type: "drums", kit: DRUM_STYLE_KIT[style] || "808", pads: {} } : hmInst(preset || (type === "bass" && /808/.test(style) ? "808" : g.preset));
  S.mix.tracks[id] = { vol: 0, pan: 0, mute: false, solo: false, mode: "midi", fx: [], inst, mfx: style === "slide808" ? [{ type: "glide", on: true, time: 0.08 }] : undefined, source: null, notes: null,
    clips: [{ id: uid("c"), start: 0, src: -S.B.timing.pad, dur: (Math.max(arrEnd(), S.B.end_beat || 0) + 16) * P, gain: 0, fi: 5e-3, fo: 5e-3, mute: false }] };
  _tracksKey = "";
  return id;
}
function hmRebuild(force) {
  let n = 0, skip = 0;
  for (const g of S.mix.gens || []) {
    if (!g.spec) continue;
    const m = mt(g.id);
    if (m.notes && !force) { skip++; continue; }
    const range = g.spec.all ? [0, Math.max(arrEnd(), g.spec.range[1])] : g.spec.range;
    const ns = genNotes(g.spec.type, g.spec.style, g.spec.opt, range);
    g.notes = ns;
    m.notes = null;
    n++;
  }
  if (n) { _tracksKey = ""; _arrCache.clear(); }
  return { n, skip };
}
function hmAfterChords(msg) {
  const specs = (S.mix.gens || []).filter((g) => g.spec && g.spec.type !== "drums");
  if (!specs.length) { afterEdit(true); if (msg) toast(msg); return; }
  if (hmHarm().autoRebuild !== false) {
    const r = hmRebuild(false);
    afterEdit(true);
    toast((msg ? msg + " " : "") + `Перебудовано партій: ${r.n}.` + (r.skip ? ` ${r.skip} змінених вручну не чіпав.` : ""), false, r.skip ? ["Перебудувати й їх", () => { pushUndo("перебудова партій"); hmRebuild(true); afterEdit(true); }] : null);
  } else {
    afterEdit(true);
    toast(msg || "Акорди змінено.", false, ["Перебудувати партії", () => { pushUndo("перебудова партій"); hmRebuild(false); afterEdit(true); }]);
  }
}
function hmApply() {
  const m = HM.m;
  if (!HM.prog.length) return toast("Прогресія порожня — додайте акорди.", true);
  const bpb = S.B.timing.bpb, from = Math.max(1, Math.round(+$("#hm-from", m).value || 1));
  const fill = $("#hm-fill", m).value, start = tmU((from - 1) * bpb);
  let end = null;
  if (fill === "song") end = Math.max(arrEnd(), tmU(from * bpb));
  else if (fill === "bars") end = tmU((from - 1 + Math.max(1, +$("#hm-bars", m).value || 8)) * bpb);
  else if (fill === "sec") {
    const s = secList().find((x) => start >= x.start - 1e-3 && start < x.end - 1e-3);
    end = s ? s.end : null;
  }
  pushUndo("акорди з конструктора");
  const r = hmWriteChords(HM.prog, start, end);
  const made = [];
  const vl = $("#hm-vl", m).checked, all = fill === "song";
  const range = [r.a, r.b];
  if ($("#hm-acc", m).checked) {
    const st = $("#hm-accst", m).value, gt = st.startsWith("g:") ? "guitar" : "pad", style = st.replace(/^[gp]:/, "");
    const pre = $("#hm-accpre", m).value;
    const id = genAddTrack(gt, style, { octave: 1, human: 0.3, bassNote: false, vl }, range, `${gt === "guitar" ? "Гітара" : "Акорди"} · ${GEN[gt].styles[style]}`, gt === "guitar" ? null : pre, all);
    if (id) made.push(id);
  }
  if ($("#hm-bass", m).checked) {
    const st = $("#hm-bassst", m).value;
    const id = genAddTrack("bass", st, { octave: 1, human: 0.3 }, range, `Бас · ${GEN.bass.styles[st]}`, null, all);
    if (id) made.push(id);
  }
  if ($("#hm-drums", m).checked) {
    const st = $("#hm-drst", m).value;
    const id = genAddTrack("drums", st, { human: 0.3, fills: true, crash: true, swing: 0 }, range, `Барабани · ${GEN.drums.styles[st]}`, null, all);
    if (id) made.push(id);
  }
  if (made.length) { S.sel = made[0]; loadInstrumentBuffers(); }
  const bars = Math.round((tmM(r.b) - tmM(r.a)) / bpb);
  const others = (S.mix.gens || []).filter((g) => g.spec && !made.includes(g.id) && g.spec.type !== "drums");
  if (others.length && $("#hm-rebuild", m).checked) {
    const rr = hmRebuild(false);
    afterEdit(true);
    toast(`Записано ${r.n} акордів у такти ${from}–${from + bars - 1}. Нових доріжок: ${made.length}. Перебудовано партій: ${rr.n}.`);
  } else {
    afterEdit(true);
    toast(`Записано ${r.n} акордів у такти ${from}–${from + bars - 1}.` + (made.length ? ` Нових доріжок: ${made.length}.` : ""));
  }
}
function hmLoadFromSong() {
  const bpb = S.B.timing.bpb, from = Math.max(1, Math.round(+$("#hm-from", HM.m).value || 1));
  const a = tmU((from - 1) * bpb), b = tmU((from + 7) * bpb);
  const list = chordList().filter((c) => c.label !== "N" && c.root != null && c.end > a && c.start < b);
  if (!list.length) return toast("У цих тактах акордів немає.", true);
  HM.prog = list.map((c) => ({ root: c.root, kind: CH_IV[c.kind] ? c.kind : "", bars: Math.max(0.5, Math.round((tmM(Math.min(b, c.end)) - tmM(Math.max(a, c.start))) / bpb * 2) / 2) }));
  HM.sel = 0;
  hmSave();
  hmRender();
  toast(`Узято ${HM.prog.length} акордів з тактів ${from}–${from + 7}.`);
}
function hmChip(c, extra = "", hint = "") {
  const f = hmFunc(c.root);
  return `<button class="hm-chip" data-r="${c.root}" data-k="${c.kind}" ${extra} data-hint="${escapeHtml(hint || `${hmRoman(c.root, c.kind)} · ${HM_KIND_UA[c.kind] || ""} · ${f[1]}. Клік — послухати й додати, Shift+клік — лише послухати`)}" style="--fc:${f[2]}"><b>${escapeHtml(hmName(c))}</b><small>${escapeHtml(hmRoman(c.root, c.kind))}</small></button>`;
}
function hmCircle() {
  const k = hmKey(), maj = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5], R1 = 92, R2 = 62, cx = 110, cy = 110;
  const dia = hmDiatonic(false), inKey = (r, kind) => dia.some((c) => c.root === r && c.kind === kind);
  let s = `<svg viewBox="0 0 220 220" class="hm-circle">`;
  maj.forEach((r, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(a) * R1, y1 = cy + Math.sin(a) * R1, mr = (r + 9) % 12;
    const x2 = cx + Math.cos(a) * R2, y2 = cy + Math.sin(a) * R2;
    const on1 = inKey(r, ""), on2 = inKey(mr, "m"), home1 = r === k.tonic && !k.minor, home2 = mr === k.tonic && k.minor;
    s += `<g class="hm-cf ${on1 ? "in" : ""} ${home1 ? "home" : ""}" data-r="${r}" data-k=""><circle cx="${x1}" cy="${y1}" r="15"/><text x="${x1}" y="${y1 + 4}">${NOTE_NAMES[r]}</text></g>`;
    s += `<g class="hm-cf sm ${on2 ? "in" : ""} ${home2 ? "home" : ""}" data-r="${mr}" data-k="m"><circle cx="${x2}" cy="${y2}" r="12"/><text x="${x2}" y="${y2 + 3.5}">${NOTE_NAMES[mr]}m</text></g>`;
  });
  return s + `<text x="110" y="114" class="hm-cc">${escapeHtml(NOTE_NAMES[k.tonic])}</text></svg>`;
}
function hmRender() {
  const m = HM.m;
  if (!m || m.hidden && m.innerHTML) return;
  const k = hmKey(), dia = hmDiatonic(HM.sevenths), bpb = S.B.timing.bpb;
  const cur = HM.prog[HM.sel] || HM.prog[HM.prog.length - 1];
  const sug = hmSuggest(cur);
  const groups = ["Усі", ...new Set(HM_LIB.map((e) => e[0]))];
  const lib = HM_LIB.filter((e) => HM.group === "Усі" || e[0] === HM.group);
  const curBar = hmBarAt(S.playBeat);
  const prevFrom = $("#hm-from", m) ? $("#hm-from", m).value : curBar;
  const keep = (id, def) => { const el = $("#" + id, m); return el ? (el.type === "checkbox" ? el.checked : el.value) : def; };
  const st = { fill: keep("hm-fill", "song"), bars: keep("hm-bars", 8), acc: keep("hm-acc", true), accst: keep("hm-accst", "p:hold"), accpre: keep("hm-accpre", "Теплий пад"), bass: keep("hm-bass", true), bassst: keep("hm-bassst", "roots"), drums: keep("hm-drums", false), drst: keep("hm-drst", "pop"), vl: keep("hm-vl", true), rebuild: keep("hm-rebuild", true) };
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([a, b]) => `<option value="${a}" ${String(a) === String(v) ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}</select>`;
  const accOpts = Object.entries(GEN.pad.styles).map(([a, b]) => ["p:" + a, b]).concat(Object.entries(GEN.guitar.styles).map(([a, b]) => ["g:" + a, "Гітара: " + b]));
  m.innerHTML = `<div class="modal-card hm-card-wrap"><div class="modal-head"><h3>Гармонія: конструктор акордів</h3><button class="x" data-close>&times;</button></div>
  <div class="modal-body hm">
    <div class="hm-top">
      <label data-hint="Тональність для підказок, підсвітки гами в нотах і нових партій. Звук уже записаних доріжок не змінюється">Тональність ${sel("hm-tonic", NOTE_NAMES.map((n, i) => [i, n]), k.tonic)}</label>
      <label data-hint="Лад або гама: від нього залежить, які акорди «свої» і які ноти підсвічуються в піано-ролі">Лад ${sel("hm-scale", Object.entries(HM_SCALES).map(([a, b]) => [a, b[0]]), k.scale)}</label>
      <div class="seg small" data-hint="Тризвуки — прості акорди з трьох нот. Септакорди — з чотирьох, звучать м'якше й джазовіше"><button data-sev="0" class="${HM.sevenths ? "" : "active"}">Тризвуки</button><button data-sev="1" class="${HM.sevenths ? "active" : ""}">Септакорди</button></div>
      <label data-hint="Яким звуком слухати акорди в конструкторі">Звук ${sel("hm-pre", HM_PRESETS.map((p) => [p, p]), HM.preset)}</label>
      <span class="spacer"></span>
      <span class="hm-legend"><i style="--fc:#4ade80"></i>T — спокій <i style="--fc:#60a5fa"></i>S — рух <i style="--fc:#f6ad55"></i>D — напруга <i style="--fc:#c084fc"></i>барва</span>
    </div>
    <div class="hm-cols">
      <div class="hm-left">
        <h5>Акорди тональності ${escapeHtml(NOTE_NAMES[k.tonic])} ${escapeHtml(HM_SCALES[k.scale][0].toLowerCase())}</h5>
        <div class="hm-dia">${dia.map((c) => hmChip(c, 'data-add="1"')).join("")}</div>
        <h5>Що далі${cur ? ` після <b>${escapeHtml(hmName(cur))}</b>` : ""}?</h5>
        <div class="hm-sug"><span class="hm-sl" data-hint="Звичні переходи, які завжди звучать природно">Природно</span>${sug.nat.map((c) => hmChip(c, 'data-ins="1"')).join("")}</div>
        <div class="hm-sug"><span class="hm-sl" data-hint="Акорди з сусідньої тональності — додають несподіваного кольору">Барвисто</span>${sug.spice.map((c) => hmChip(c, 'data-ins="1"')).join("")}</div>
        <div class="hm-sug"><span class="hm-sl" data-hint="Домінанта до наступного акорду — створює сильне тяжіння">Напруга</span>${sug.tense.map((c) => hmChip(c, 'data-ins="1"', `${hmName(c)}${c.to ? ` — веде до ${c.to}` : ""}. Клік — вставити після вибраного`)).join("")}</div>
        ${cur ? `<h5>Барва акорду ${escapeHtml(hmName(cur))}</h5><div class="hm-var">${hmVariants(cur).map((c) => `<button class="hm-v ${c.kind === cur.kind ? "on" : ""}" data-vk="${c.kind}" data-hint="${escapeHtml(HM_KIND_UA[c.kind] || "")}">${escapeHtml(hmName(c))}</button>`).join("")}</div>` : ""}
        <div class="hm-circ-wrap"><div data-hint="Коло квінт: сусідні акорди звучать споріднено. Підсвічені — акорди вашої тональності. Клік — послухати й додати">${hmCircle()}</div>
          <div class="muted small hm-tip">Як будувати: почніть з тоніки (T), відійдіть у S, створіть напругу D і поверніться в T. Чотири акорди по такту — найчастіша форма куплету й приспіву.</div></div>
      </div>
      <div class="hm-right">
        <div class="hm-ph"><h5>Ваша прогресія</h5><span class="spacer"></span>
          <button class="btn ghost sm" id="hm-play" data-hint="Програти прогресію по колу вибраним звуком">${HM.playG ? "■ Стоп" : "▶ Слухати"}</button>
          <label class="chk small" data-hint="Повторювати по колу"><input type="checkbox" id="hm-loop" ${HM.loop ? "checked" : ""}> по колу</label>
          <button class="btn ghost sm" id="hm-rnd" data-hint="Випадкова, але правильна прогресія з чотирьох акордів у вашій тональності">🎲 Випадкова</button>
          <button class="btn ghost sm" id="hm-clr" data-hint="Очистити прогресію">Очистити</button></div>
        <div class="hm-prog">${HM.prog.length ? HM.prog.map((c, i) => `<div class="hm-card ${i === HM.sel ? "sel" : ""}" data-i="${i}" style="--fc:${hmFunc(c.root)[2]}">
            <b>${escapeHtml(hmName(c))}</b><small>${escapeHtml(hmRoman(c.root, c.kind))}</small>
            <select data-len="${i}" data-hint="Скільки тактів звучить акорд">${[[0.5, "½ такту"], [1, "1 такт"], [2, "2 такти"], [4, "4 такти"]].map(([v, l]) => `<option value="${v}" ${c.bars === v ? "selected" : ""}>${l}</option>`).join("")}</select>
            <div class="hm-cb"><button data-mv="-1" data-hint="Посунути ліворуч">◀</button><button data-mv="1" data-hint="Посунути праворуч">▶</button><button data-rm data-hint="Прибрати акорд">✕</button></div></div>`).join("") : `<div class="dock-empty">Клацніть на акорд ліворуч, виберіть готову прогресію нижче або натисніть «🎲 Випадкова».</div>`}</div>
        <div class="muted small">${HM.prog.length ? `Разом: ${HM.prog.reduce((s, c) => s + c.bars, 0)} такт(ів). Клік по картці — вибрати, далі підказки «Що далі?» і «Барва» стосуються її.` : ""}</div>
        <div class="hm-ph"><h5>Готові прогресії</h5><span class="spacer"></span>${sel("hm-group", groups.map((g) => [g, g]), HM.group)}</div>
        <div class="hm-lib">${lib.map((e) => { const p = hmLibProg(e); return `<button class="hm-le" data-lib="${HM_LIB.indexOf(e)}" data-hint="${escapeHtml(e[3])} — клік: завантажити й послухати"><b>${escapeHtml(e[2])}</b><span>${escapeHtml(p.map(hmName).join(" – "))}</span></button>`; }).join("")}</div>
        <div class="hm-apply">
          <h5>Записати в пісню</h5>
          <div class="hm-ar">
            <label data-hint="З якого такту почати">Від такту <input type="number" id="hm-from" min="1" value="${escapeHtml(String(prevFrom))}"></label>
            <label data-hint="Прогресія повторюється, поки не заповнить вибране місце">Заповнити ${sel("hm-fill", [["once", "один раз"], ["sec", "до кінця секції"], ["bars", "N тактів"], ["song", "до кінця пісні"]], st.fill)}</label>
            <label ${st.fill === "bars" ? "" : "hidden"} id="hm-barsl">тактів <input type="number" id="hm-bars" min="1" value="${st.bars}"></label>
            <button class="btn ghost sm" id="hm-take" data-hint="Узяти в конструктор акорди пісні з 8 тактів, починаючи з указаного">Узяти з пісні</button>
          </div>
          <div class="hm-ar"><label class="chk"><input type="checkbox" id="hm-acc" ${st.acc ? "checked" : ""}> Акомпанемент</label>${sel("hm-accst", accOpts, st.accst)}${sel("hm-accpre", HM_PRESETS.map((p) => [p, p]), st.accpre)}</div>
          <div class="hm-ar"><label class="chk"><input type="checkbox" id="hm-bass" ${st.bass ? "checked" : ""}> Бас</label>${sel("hm-bassst", Object.entries(GEN.bass.styles), st.bassst)}</div>
          <div class="hm-ar"><label class="chk"><input type="checkbox" id="hm-drums" ${st.drums ? "checked" : ""}> Барабани</label>${sel("hm-drst", Object.entries(GEN.drums.styles), st.drst)}</div>
          <div class="hm-ar"><label class="chk" data-hint="Акорди переходять плавно: кожен голос рухається на найближчу ноту, як у живого піаніста"><input type="checkbox" id="hm-vl" ${st.vl ? "checked" : ""}> плавне голосоведення</label>
            <label class="chk" data-hint="Уже створені генератором партії (бас, пади, арпеджіо, гітара) перебудуються під нові акорди. Змінені вручну не чіпаються"><input type="checkbox" id="hm-rebuild" ${st.rebuild ? "checked" : ""}> перебудувати наявні партії</label>
            <label class="chk" data-hint="Коли ви міняєте акорд правим кліком на рядку акордів, згенеровані партії одразу підлаштовуються"><input type="checkbox" id="hm-auto" ${hmHarm().autoRebuild !== false ? "checked" : ""}> завжди підлаштовувати партії під акорди</label></div>
          <div class="modal-actions"><button class="btn primary" id="hm-go" data-hint="Записати прогресію в рядок акордів пісні й створити вибрані доріжки. Скасувати — Ctrl+Z">Записати в пісню</button></div>
        </div>
      </div>
    </div>
  </div></div>`;
  hmBind();
}
function hmBind() {
  const m = HM.m;
  $("[data-close]", m).onclick = () => { hmStop(); m.hidden = true; };
  $("#hm-tonic", m).onchange = async (e) => {
    const old = hmKey().tonic, nt = +e.target.value;
    let d = ((nt - old) % 12 + 12) % 12;
    if (d > 6) d -= 12;
    const hasCh = chordList().some((c) => c.label !== "N" && c.root != null), user = tracksAll().filter((t) => !t.is_drums && !(S.mix.gens || []).some((g) => g.id === t.id && g.spec) && trackNotes(t).length);
    if (d && (hasCh || HM.prog.length)) {
      const p = inkConfirm("Перенести в нову тональність?", `<p>Тональність змінюється з <b>${NOTE_NAMES[old]}</b> на <b>${NOTE_NAMES[nt]}</b> (${d > 0 ? "+" : ""}${d} півтонів).</p>
        <label class="chk"><input type="checkbox" id="hk-ch" checked> перенести акорди пісні й прогресію конструктора, а згенеровані партії перебудувати</label>
        ${user.length ? `<label class="chk"><input type="checkbox" id="hk-notes"> також транспонувати ноти власних MIDI-доріжок (${user.length})</label>` : ""}
        <p class="muted small">Записане аудіо не змінюється — для нього є «Темп / тон». Скасувати — Ctrl+Z.</p>`, "Перенести");
      const ok = await p;
      const doCh = ok && ($("#hk-ch") || {}).checked, doN = ok && ($("#hk-notes") || {}).checked;
      if (ok) pushUndo("нова тональність");
      hmHarm().tonic = nt;
      if (doCh) {
        ownArrangement();
        for (const c of S.mix.chords) if (c.root != null && c.label !== "N") { c.root = ((c.root + d) % 12 + 12) % 12; c.label = chordName(c.root, CH_IV[c.kind] ? c.kind : ""); }
        HM.prog.forEach((c) => { c.root = ((c.root + d) % 12 + 12) % 12; });
        hmSave();
        for (const g of S.mix.gens || []) if (g.spec && g.spec.type !== "drums" && mt(g.id).notes) mt(g.id).notes.forEach((n) => { n[2] = clamp(n[2] + d, 0, 127); });
        hmRebuild(false);
      }
      if (doN) for (const t of user) { const ns = editableNotes(t); ns.forEach((n) => { n[2] = clamp(n[2] + d, 0, 127); }); }
      afterEdit(true);
      if (doN) notesChanged();
      if (ok) toast(`Тональність ${NOTE_NAMES[nt]}: ${doCh ? "акорди й партії перенесено" : "лише нова тональність для підказок"}${doN ? ", ноти транспоновано" : ""}.`);
    } else { hmHarm().tonic = nt; saveMix(); }
    hmRender(); draw();
  };
  $("#hm-scale", m).onchange = (e) => { hmHarm().scale = e.target.value; saveMix(); hmRender(); draw(); if (S.dockTab === "notes") renderDock(); };
  $$("[data-sev]", m).forEach((b) => b.onclick = () => { HM.sevenths = b.dataset.sev === "1"; hmRender(); });
  $("#hm-pre", m).onchange = (e) => { HM.preset = e.target.value; hmSave(); };
  $("#hm-group", m).onchange = (e) => { HM.group = e.target.value; hmRender(); };
  $("#hm-loop", m).onchange = (e) => { HM.loop = e.target.checked; };
  $("#hm-play", m).onclick = hmPlayProg;
  $("#hm-rnd", m).onclick = () => { HM.prog = hmRandom(); HM.sel = 0; hmSave(); hmRender(); hmStop(); hmPlayProg(); };
  $("#hm-clr", m).onclick = () => { hmStop(); HM.prog = []; HM.sel = -1; hmSave(); hmRender(); };
  $("#hm-go", m).onclick = hmApply;
  $("#hm-take", m).onclick = hmLoadFromSong;
  $("#hm-fill", m).onchange = (e) => { $("#hm-barsl", m).hidden = e.target.value !== "bars"; };
  $("#hm-auto", m).onchange = (e) => { hmHarm().autoRebuild = e.target.checked; saveMix(); };
  $$(".hm-chip", m).forEach((b) => b.onclick = (e) => {
    const c = { root: +b.dataset.r, kind: b.dataset.k, bars: 1 };
    hmAudition(c);
    if (e.shiftKey) return;
    if (b.dataset.ins && HM.sel >= 0) hmAdd(c, HM.sel + 1);
    else hmAdd(c);
  });
  $$(".hm-cf", m).forEach((g) => g.onclick = (e) => {
    const c = { root: +g.dataset.r, kind: g.dataset.k, bars: 1 };
    hmAudition(c);
    if (!e.shiftKey) hmAdd(c);
  });
  $$(".hm-v", m).forEach((b) => b.onclick = () => {
    const c = HM.prog[HM.sel] || HM.prog[HM.prog.length - 1];
    if (!c) return;
    c.kind = b.dataset.vk;
    hmAudition(c);
    hmSave();
    hmRender();
  });
  $$(".hm-card", m).forEach((el) => {
    const i = +el.dataset.i;
    el.onclick = (e) => {
      if (e.target.closest("select,button")) return;
      HM.sel = i;
      hmAudition(HM.prog[i]);
      hmRender();
    };
    $("select", el).onchange = (e) => { HM.prog[i].bars = +e.target.value; hmSave(); hmRender(); };
    $$("[data-mv]", el).forEach((b) => b.onclick = () => {
      const j = i + +b.dataset.mv;
      if (j < 0 || j >= HM.prog.length) return;
      [HM.prog[i], HM.prog[j]] = [HM.prog[j], HM.prog[i]];
      HM.sel = j;
      hmSave();
      hmRender();
    });
    $("[data-rm]", el).onclick = () => { HM.prog.splice(i, 1); HM.sel = Math.min(HM.sel, HM.prog.length - 1); hmSave(); hmRender(); };
  });
  $$("[data-lib]", m).forEach((b) => b.onclick = () => {
    const e = HM_LIB[+b.dataset.lib];
    HM.prog = hmLibProg(e);
    HM.sel = 0;
    hmSave();
    hmRender();
    hmStop();
    hmPlayProg();
  });
}
function openHarmony() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  let m = document.getElementById("harm-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "harm-modal";
    document.body.appendChild(m);
    if (!UIP.mfloat["harm-modal"]) { UIP.mfloat["harm-modal"] = { on: true, rect: { x: Math.max(20, innerWidth / 2 - 560), y: 90, w: 1120, h: Math.min(820, innerHeight - 120) } }; saveUI(); }
  }
  HM.m = m;
  const h = S.mix.harmony || {};
  if (HM.pid !== S.pid) {
    HM.pid = S.pid;
    HM.prog = (h.draft || []).map((c) => ({ ...c }));
    HM.sel = HM.prog.length - 1;
    HM.preset = h.preset || HM.preset;
  }
  m.hidden = false;
  hmRender();
}
function hmRowColor(p, black, drums) {
  if (!HM_UI.scaleOn || drums || !S.B) return black ? "#121419" : "#16181e";
  const pc = ((p % 12) + 12) % 12, k = hmKey();
  if (pc === k.tonic) return "#1b2620";
  if (hmInScale(p)) return black ? "#161a20" : "#1a1e25";
  return "#0f1013";
}
function hmChordAt(b) {
  return chordList().find((c) => c.label !== "N" && c.root != null && b >= c.start - 1e-4 && b < c.end - 1e-4) || null;
}
function hmPaintRollChords(c, bx, w, KB, top) {
  const list = chordList().filter((x) => x.label !== "N");
  if (!list.length) return;
  c.save();
  c.font = "600 10px " + getComputedStyle(document.body).fontFamily;
  for (const ch of list) {
    const x0 = Math.max(KB, bx(ch.start)), x1 = bx(ch.end);
    if (x1 < KB || x0 > w) continue;
    c.fillStyle = "rgba(255,181,71,.12)";
    c.fillRect(x0 + 1, top, Math.max(1, x1 - x0 - 2), 12);
    c.fillStyle = "#ffb547";
    if (x1 - x0 > 18) c.fillText(ch.label, x0 + 4, top + 9.5);
  }
  c.restore();
}
function hmLockP(p, drums) {
  return HM_UI.lock && !drums ? hmSnapP(p) : p;
}
function hmSelIdx(t) {
  const ns = editableNotes(t);
  return PR.sel.size ? [...PR.sel].filter((i) => ns[i]) : ns.map((_, i) => i);
}
function hmTransform(t, kind) {
  const ns = editableNotes(t), idx = hmSelIdx(t);
  if (!idx.length) return toast("Немає нот для перетворення.", true);
  const k = hmKey(), sc = k.sc, ton = k.tonic;
  const step = (p, d) => { const sp = hmSnapP(p); return hmP(hmDeg(sp, sc, ton) + d, sc, ton) + (p - sp); };
  const sel = idx.map((i) => ns[i]);
  const s0 = Math.min(...sel.map((n) => n[0])), e0 = Math.max(...sel.map((n) => n[0] + n[1]));
  const label = { up1: "по гамі вище", dn1: "по гамі нижче", up2: "на терцію вище", dn2: "на терцію нижче", inv: "інверсія", retro: "ретроград", slow: "удвічі повільніше", fast: "удвічі швидше", snap: "до гами", human: "олюднення", h3u: "голос терцією вище", h3d: "голос терцією нижче", h6d: "голос сикстою нижче", h8u: "голос октавою вище", h5d: "квінта нижче", vari: "варіація" }[kind];
  pushUndo("ноти: " + label);
  const add = [];
  if (kind === "up1" || kind === "dn1" || kind === "up2" || kind === "dn2") { const d = { up1: 1, dn1: -1, up2: 2, dn2: -2 }[kind]; sel.forEach((n) => n[2] = clamp(step(n[2], d), 0, 127)); }
  else if (kind === "inv") { const axis = hmDeg(hmSnapP(sel[0][2]), sc, ton); sel.forEach((n) => n[2] = clamp(hmP(2 * axis - hmDeg(hmSnapP(n[2]), sc, ton), sc, ton), 0, 127)); }
  else if (kind === "retro") sel.forEach((n) => n[0] = +(s0 + e0 - n[0] - n[1]).toFixed(4));
  else if (kind === "slow") sel.forEach((n) => { n[0] = +(s0 + (n[0] - s0) * 2).toFixed(4); n[1] *= 2; });
  else if (kind === "fast") sel.forEach((n) => { n[0] = +(s0 + (n[0] - s0) / 2).toFixed(4); n[1] = Math.max(0.05, n[1] / 2); });
  else if (kind === "snap") sel.forEach((n) => n[2] = hmSnapP(n[2]));
  else if (kind === "human") sel.forEach((n) => { n[0] = Math.max(0, +(n[0] + (Math.random() * 2 - 1) * 0.02).toFixed(4)); n[3] = clamp(Math.round(n[3] + (Math.random() * 2 - 1) * 12), 20, 127); });
  else if (kind[0] === "h") {
    const d = { h3u: 2, h3d: -2, h6d: -5 }[kind];
    for (const n of sel) {
      const p = kind === "h8u" ? n[2] + 12 : kind === "h5d" ? n[2] - 7 : step(n[2], d);
      add.push([n[0], n[1], clamp(p, 0, 127), Math.max(20, n[3] - 12)]);
    }
  } else if (kind === "vari") {
    const sorted = [...sel].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i], nx = sorted[i + 1];
      if (n[1] >= 0.99 && Math.random() < 0.45) { const h = Math.round(n[1] / 2 * 4) / 4; add.push([n[0] + h, n[1] - h, clamp(step(n[2], Math.random() < 0.5 ? 1 : -1), 0, 127), n[3] - 6]); n[1] = h; }
      else if (nx && Math.abs(hmDeg(hmSnapP(nx[2]), sc, ton) - hmDeg(hmSnapP(n[2]), sc, ton)) === 2 && nx[0] - n[0] >= 0.5 && Math.random() < 0.5) {
        const mid = n[0] + (nx[0] - n[0]) / 2;
        add.push([mid, nx[0] - mid, clamp(step(n[2], nx[2] > n[2] ? 1 : -1), 0, 127), n[3] - 10]);
        n[1] = Math.min(n[1], mid - n[0]);
      } else if (n[0] % 1 > 0.4 && Math.random() < 0.2) n[0] = +(n[0] - 0.25).toFixed(4);
      else if (Math.random() < 0.15) n[2] = clamp(step(n[2], Math.random() < 0.5 ? 1 : -1), 0, 127);
    }
  }
  ns.push(...add);
  ns.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  PR.sel = new Set();
  if (add.length) add.forEach((n) => PR.sel.add(ns.indexOf(n)));
  notesChanged();
  renderDock();
  toast(`Готово: ${label}${add.length ? `, додано нот ${add.length}` : ""}. Скасувати — Ctrl+Z.`);
}
function hmTransformMenu(e, t) {
  const f = (k) => () => hmTransform(t, k);
  menu(e, [
    ["По гамі: на ступінь вище", f("up1")], ["По гамі: на ступінь нижче", f("dn1")], ["По гамі: на терцію вище", f("up2")], ["По гамі: на терцію нижче", f("dn2")],
    ["Підтягнути до гами", f("snap")],
    null,
    ["Дзеркально (інверсія)", f("inv")], ["Задом наперед (ретроград)", f("retro")], ["Удвічі повільніше", f("slow")], ["Удвічі швидше", f("fast")],
    ["Олюднити: час і сила", f("human")], ["Варіація мелодії", f("vari")],
    null,
    ["Додати голос: терція вище", f("h3u")], ["Додати голос: терція нижче", f("h3d")], ["Додати голос: секста нижче", f("h6d")], ["Додати голос: октава вище", f("h8u")], ["Додати квінту нижче (пауер-акорд)", f("h5d")],
    null,
    ["Грув і свінг…", () => openGroove(t.id)],
  ]);
}
function hmRollBind(t, api) {
  const drums = t.is_drums;
  const b1 = $("#pr-scale"), b2 = $("#pr-lock"), b3 = $("#pr-tf"), b4 = $("#pr-mel");
  if (b1) b1.onclick = () => { HM_UI.scaleOn = !HM_UI.scaleOn; b1.classList.toggle("on", HM_UI.scaleOn); api.paint(); };
  if (b2) b2.onclick = () => { HM_UI.lock = !HM_UI.lock; b2.classList.toggle("on", HM_UI.lock); toast(HM_UI.lock ? `Лише ноти гами ${NOTE_NAMES[hmKey().tonic]} ${HM_SCALES[hmKey().scale][0].toLowerCase()}: нові й переміщені ноти стають на ноти гами.` : "Можна ставити будь-які ноти."); };
  if (b3) b3.onclick = (e) => hmTransformMenu(e, t);
  if (b4) b4.onclick = () => openMelody(t.id);
  if (drums) [b1, b2, b3, b4].forEach((b) => b && (b.hidden = true));
}
function hmRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const HM_RHY = {
  eighths: ["Рівні восьмі", [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]]],
  quarters: ["Четверті — спокійно", [[0, 1], [1, 1], [2, 1], [3, 1]]],
  pop: ["Поп-синкопа", [[0, 0.75], [0.75, 0.75], [1.5, 1], [2.5, 0.5], [3, 1]]],
  longshort: ["Довга — коротка", [[0, 1.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5]]],
  flow: ["Реп-флоу (шістнадцяті)", [[0, 0.25], [0.25, 0.25], [0.5, 0.5], [1, 0.25], [1.25, 0.5], [1.75, 0.25], [2, 0.5], [2.5, 0.25], [2.75, 0.25], [3, 0.75]]],
  triplet: ["Тріолі", [[0, 0.333], [0.333, 0.333], [0.667, 0.333], [1, 1], [2, 0.333], [2.333, 0.333], [2.667, 0.333], [3, 1]]],
  sing: ["Розспівна — довгі ноти", [[0, 2], [2, 1], [3, 1]]],
  hook: ["Хук — коротко й чіпко", [[0, 0.5], [0.5, 0.25], [0.75, 0.75], [2, 0.5], [2.5, 0.5], [3, 0.5]]],
};
const HM_CONT = { arch: "Арка (вгору й назад)", up: "Підйом", down: "Спуск", wave: "Хвиля", valley: "Долина", leap: "Стрибок і спуск", walk: "Вільно (випадково)" };
const HM_FORM = { aaaa: "Повтор мотиву (A A A A)", aaba: "A A B A — класика", ab: "Питання — відповідь", free: "Без повторів" };
function hmCont(kind, x, r) {
  switch (kind) {
    case "up": return -3 + 6 * x;
    case "down": return 3 - 6 * x;
    case "wave": return 3 * Math.sin(2 * Math.PI * x);
    case "valley": return 2 - 5 * Math.sin(Math.PI * x);
    case "leap": return x < 0.15 ? -2 : 4 - 6 * (x - 0.15) / 0.85;
    case "walk": return 0;
    default: return -2 + 5 * Math.sin(Math.PI * x);
  }
}
function hmChordTones(b) {
  const c = hmChordAt(b);
  if (c) return (CH_IV[c.kind] || CH_IV[""]).map((i) => (c.root + i) % 12);
  const k = hmKey(), sc = hmChordScale();
  return [0, 2, 4].map((d) => (k.tonic + sc[d]) % 12);
}
function hmMelody(o) {
  const rng = hmRng(o.seed), k = hmKey(), sc = k.sc, ton = k.tonic, bpb = S.B.timing.bpb;
  const center = { low: 57, mid: 67, high: 74 }[o.register] || 67;
  let baseDeg = hmDeg(hmSnapP(center), sc, ton);
  const avoid = o.avoid || [];
  if (avoid.length) {
    const av = avoid.reduce((s, n) => s + n[2], 0) / avoid.length;
    baseDeg = hmDeg(hmSnapP(Math.round(av + (o.counterUp ? 7 : -8))), sc, ton);
  }
  const pat = HM_RHY[o.rhythm][1].filter((e) => e[0] < bpb - 1e-6);
  const mkBar = () => {
    let ev = [];
    for (const [on, len] of pat) {
      if (on > 0 && o.density < 0.5 && rng() < (0.5 - o.density) * 1.6) { if (ev.length) ev[ev.length - 1][1] += len; continue; }
      if (len >= 0.99 && o.density > 0.5 && rng() < (o.density - 0.5) * 1.4) { ev.push([on, len / 2], [on + len / 2, len / 2]); continue; }
      ev.push([on, len]);
    }
    if (rng() < 0.25 && ev.length > 2) ev = ev.slice(0, -1);
    return ev;
  };
  const motifLen = o.form === "ab" ? Math.max(1, Math.floor(o.bars / 2)) : o.form === "free" ? o.bars : 1;
  const motif = [];
  for (let b = 0; b < motifLen; b++) for (const [on, len] of mkBar()) motif.push([b * bpb + on, len]);
  const span = motifLen * bpb;
  let walk = 0;
  const offs = motif.map(([on]) => {
    if (o.contour === "walk") { walk = clamp(walk + Math.round((rng() * 2 - 1) * 2), -4, 4); return walk; }
    return Math.round(hmCont(o.contour, on / span) + (rng() < 0.3 ? (rng() < 0.5 ? 1 : -1) : 0));
  });
  const blocks = [];
  if (o.form === "aaaa") for (let i = 0; i < o.bars; i++) blocks.push(["A", i]);
  else if (o.form === "aaba") for (let i = 0; i < o.bars; i++) blocks.push([i % 4 === 2 ? "B" : i % 4 === 1 ? "A2" : "A", i]);
  else if (o.form === "ab") for (let i = 0; i * motifLen < o.bars; i++) blocks.push([i % 2 ? "B" : "A", i * motifLen]);
  else blocks.push(["A", 0]);
  const out = [];
  let prev = null;
  for (const [type, barOff] of blocks) {
    motif.forEach(([on, len], i) => {
      const mBeat = tmM(o.start) + barOff * bpb + on;
      if (mBeat >= tmM(o.start) + o.bars * bpb - 1e-6) return;
      const b = tmU(mBeat), bEnd = tmU(mBeat + len);
      if (avoid.some((n) => n[0] < bEnd - 0.05 && n[0] + n[1] > b + 0.05)) return;
      let off = offs[i];
      if (type === "B") off = -off + 2;
      if (type === "A2" && i >= motif.length - 2) off += i === motif.length - 1 ? 1 : -1;
      let p = hmP(baseDeg + off, sc, ton);
      const strong = Math.abs(on % 1) < 1e-6;
      if (strong && rng() < o.pull) {
        const ct = hmChordTones(b);
        let best = p, bd = 99;
        for (let d = -4; d <= 4; d++) if (ct.includes(((p + d) % 12 + 12) % 12) && Math.abs(d) < bd) { bd = Math.abs(d); best = p + d; }
        p = best;
      }
      if (prev != null) { while (p - prev > 9) p -= 12; while (prev - p > 9) p += 12; }
      prev = p;
      out.push([+b.toFixed(4), +(Math.max(0.1, bEnd - b) * 0.95).toFixed(4), clamp(p, 0, 127), Math.round(clamp((strong ? 100 : 84) + (rng() * 2 - 1) * 10, 30, 127))]);
    });
  }
  if (o.end && out.length) {
    const last = out[out.length - 1], c = hmChordAt(last[0]), root = c && o.endOn === "chord" ? c.root : ton;
    let best = last[2], bd = 99;
    for (let d = -6; d <= 6; d++) if (((last[2] + d) % 12 + 12) % 12 === root && Math.abs(d) < bd) { bd = Math.abs(d); best = last[2] + d; }
    last[2] = best;
    const endB = tmU(tmM(o.start) + o.bars * bpb);
    last[1] = +Math.max(last[1], (endB - last[0]) * 0.95).toFixed(4);
  }
  return out;
}
const MEL = { tid: null, seed: 1, rhythm: "pop", contour: "arch", form: "aaba", register: "mid", density: 0.5, pull: 0.75, bars: 4, end: true, replace: true, counter: "", counterUp: false };
function openMelody(tid) {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const list = tracksAll().filter((t) => !t.is_drums);
  const st = S.sel && list.find((t) => t.id === S.sel);
  MEL.tid = tid || (st && st.role === "lead" ? st.id : MEL.tid && findT(MEL.tid) ? MEL.tid : null);
  if (!MEL.from) MEL.from = hmBarAt(S.playBeat);
  let m = document.getElementById("mel-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "mel-modal";
    document.body.appendChild(m);
  }
  const sel = (id, obj, v) => `<select id="${id}">${Object.entries(obj).map(([a, b]) => `<option value="${a}" ${a === String(v) ? "selected" : ""}>${escapeHtml(Array.isArray(b) ? b[0] : b)}</option>`).join("")}</select>`;
  m.innerHTML = `<div class="modal-card" style="width:min(720px,95vw)"><div class="modal-head"><h3>Мелодія з нуля</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body">
      <p class="muted">Програма складає мелодію за акордами пісні й гамою ${escapeHtml(NOTE_NAMES[hmKey().tonic] + " " + HM_SCALES[hmKey().scale][0].toLowerCase())}: на сильних долях — ноти акорду, між ними — ноти гами. Не сподобалось — «Інший варіант». Потім ноти можна правити олівцем.</p>
      <div class="mel-grid">
        <label data-hint="Куди записати мелодію">Доріжка <select id="mel-t">${list.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === MEL.tid ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}<option value="@new" ${!MEL.tid ? "selected" : ""}>＋ Нова доріжка «Мелодія»</option></select></label>
        <label data-hint="З якого такту">Від такту <input type="number" id="mel-from" min="1" value="${MEL.from}"></label>
        <label data-hint="Довжина мелодії в тактах">Тактів ${sel("mel-bars", { 1: "1", 2: "2", 4: "4", 8: "8", 16: "16" }, MEL.bars)}</label>
        <label data-hint="Ритм нот у кожному такті">Ритм ${sel("mel-rhy", HM_RHY, MEL.rhythm)}</label>
        <label data-hint="Форма руху мелодії вгору-вниз">Рух ${sel("mel-cont", HM_CONT, MEL.contour)}</label>
        <label data-hint="Як повторюється мотив: повтори роблять мелодію запам'ятовуваною">Форма ${sel("mel-form", HM_FORM, MEL.form)}</label>
        <label data-hint="Висота мелодії">Регістр ${sel("mel-reg", { low: "низько", mid: "середньо", high: "високо" }, MEL.register)}</label>
        <label data-hint="Менше — більше пауз і довгих нот, більше — частіші ноти">Щільність <input type="range" id="mel-den" min="0" max="1" step="0.05" value="${MEL.density}"></label>
        <label data-hint="Наскільки часто сильні долі потрапляють у ноти акорду. Більше — стабільніше, менше — сміливіше">Опора на акорди <input type="range" id="mel-pull" min="0" max="1" step="0.05" value="${MEL.pull}"></label>
        <label data-hint="Контрмелодія: нові ноти ставляться в паузах вибраної доріжки, тож голоси не заважають одне одному">Контрмелодія до <select id="mel-ctr"><option value="">— ні —</option>${list.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === MEL.counter ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label>
        <label class="chk" data-hint="Контрмелодія звучить вище основної, інакше — нижче"><input type="checkbox" id="mel-cup" ${MEL.counterUp ? "checked" : ""}> контрмелодія вище</label>
        <label class="chk" data-hint="Остання нота — тоніка, мелодія звучить завершено"><input type="checkbox" id="mel-end" ${MEL.end ? "checked" : ""}> закінчити на тоніці</label>
        <label class="chk" data-hint="Прибрати старі ноти доріжки в цих тактах"><input type="checkbox" id="mel-rep" ${MEL.replace ? "checked" : ""}> замінити ноти в цих тактах</label>
      </div>
      <div class="gen-run"><button class="btn ghost" id="mel-prev" data-hint="Послухати мелодію разом з акордами">▶ Прослухати</button><button class="btn ghost" id="mel-new" data-hint="Скласти інший варіант з тими ж налаштуваннями">🎲 Інший варіант</button><button class="btn primary" id="mel-go">Записати в доріжку</button><span class="muted small" id="mel-info"></span></div>
      <canvas id="mel-cv" height="90"></canvas>
    </div></div>`;
  m.hidden = false;
  const read = () => {
    MEL.tid = $("#mel-t", m).value === "@new" ? null : $("#mel-t", m).value;
    MEL.from = Math.max(1, +$("#mel-from", m).value || 1);
    MEL.bars = +$("#mel-bars", m).value;
    MEL.rhythm = $("#mel-rhy", m).value;
    MEL.contour = $("#mel-cont", m).value;
    MEL.form = $("#mel-form", m).value;
    MEL.register = $("#mel-reg", m).value;
    MEL.density = +$("#mel-den", m).value;
    MEL.pull = +$("#mel-pull", m).value;
    MEL.counter = $("#mel-ctr", m).value;
    MEL.counterUp = $("#mel-cup", m).checked;
    MEL.end = $("#mel-end", m).checked;
    MEL.replace = $("#mel-rep", m).checked;
    const bpb = S.B.timing.bpb, start = tmU((MEL.from - 1) * bpb), end = tmU((MEL.from - 1 + MEL.bars) * bpb);
    const ct = MEL.counter && findT(MEL.counter);
    const avoid = ct ? arranged(ct).filter((n) => n[0] < end && n[0] + n[1] > start) : [];
    return { start, end, notes: hmMelody({ start, bars: MEL.bars, rhythm: MEL.rhythm, contour: MEL.contour, form: MEL.form, register: MEL.register, density: MEL.density, pull: MEL.pull, end: MEL.end, seed: MEL.seed, avoid, counterUp: MEL.counterUp }) };
  };
  const paintPrev = () => {
    const r = read(), cv = $("#mel-cv", m), dpr = devicePixelRatio || 1, w = cv.clientWidth, h = 90;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#0e1014"; c.fillRect(0, 0, w, h);
    if (!r.notes.length) return;
    const lo = Math.min(...r.notes.map((n) => n[2])) - 2, hi = Math.max(...r.notes.map((n) => n[2])) + 2, L = r.end - r.start;
    const bpb = S.B.timing.bpb;
    for (let b = 0; b <= MEL.bars; b++) { const x = (tmU(tmM(r.start) + b * bpb) - r.start) / L * w; c.fillStyle = "#262a34"; c.fillRect(x, 0, 1, h); }
    c.fillStyle = "#ec4899";
    for (const n of r.notes) { const x = (n[0] - r.start) / L * w, y = h - 6 - (n[2] - lo) / (hi - lo) * (h - 12); c.fillRect(x, y - 3, Math.max(2, n[1] / L * w - 1), 6); }
    $("#mel-info", m).textContent = `${r.notes.length} нот · варіант ${MEL.seed}`;
  };
  $("[data-close]", m).onclick = () => { m.hidden = true; };
  $$("select,input", m).forEach((x) => x.onchange = paintPrev);
  $("#mel-new", m).onclick = () => { MEL.seed = Math.floor(Math.random() * 1e6); paintPrev(); $("#mel-prev", m).click(); };
  $("#mel-prev", m).onclick = () => {
    const r = read();
    if (!r.notes.length) return;
    if (S.playing) stopPlay();
    const P = period(), t = MEL.tid && findT(MEL.tid);
    const inst = t ? mt(t.id).inst : hmInst("Вокальний синт");
    const list = r.notes.map((n) => [(n[0] - r.start) * P, n[1] * P, n[2], n[3]]);
    hmPlayNotes(list, inst && inst.type !== "drums" ? inst : hmInst("Вокальний синт"));
    const ch = chordList().filter((c) => c.label !== "N" && c.end > r.start && c.start < r.end);
    const V = hmVoiceLead(ch, { center: 55 });
    const pad = [];
    ch.forEach((c, i) => { const a = Math.max(c.start, r.start), b = Math.min(c.end, r.end); for (const p of V[i]) pad.push([(a - r.start) * P, (b - a) * P * 0.98, p, 54]); });
    if (pad.length) hmPlayNotes(pad, hmInst("Теплий пад"));
  };
  $("#mel-go", m).onclick = () => {
    const r = read();
    if (!r.notes.length) return toast("Не вийшло скласти ноти — змініть налаштування.", true);
    pushUndo("мелодія з нуля");
    if (!MEL.tid) { addMidiTrack("lead"); MEL.tid = S.sel; }
    const t = findT(MEL.tid);
    if (!t) return;
    const ns = editableNotes(t);
    if (MEL.replace) for (let i = ns.length - 1; i >= 0; i--) if (ns[i][0] >= r.start - 1e-3 && ns[i][0] < r.end - 1e-3) ns.splice(i, 1);
    ns.push(...r.notes);
    ns.sort((a, b) => a[0] - b[0]);
    const mm = mt(t.id);
    if (t.has_audio && modeOf(t) === "audio") { mm.mode = "both"; applyGains(); }
    S.sel = t.id;
    S.dockTab = "notes";
    m.hidden = true;
    notesChanged();
    renderDock();
    toast(`Мелодію записано в «${t.name}»: ${r.notes.length} нот. Правте олівцем, «Перетворити ▾» — варіації й другий голос.`);
  };
  requestAnimationFrame(paintPrev);
}
function hmAddChordAt(b, e) {
  const bpb = S.B.timing.bpb, bar = hmBarAt(b), a = tmU((bar - 1) * bpb), z = tmU(bar * bpb);
  const dia = hmDiatonic(false)[0];
  pushUndo("новий акорд");
  hmWriteChords([{ root: dia.root, kind: dia.kind, bars: 1 }], a, z);
  afterEdit(true);
  const idx = S.mix.chords.findIndex((c) => Math.abs(c.start - a) < 1e-3);
  if (idx >= 0) setTimeout(() => chordPicker(e, idx), 0);
}
const KBH = { on: false, sev: false, held: new Map() };
function hmChordFor(note) {
  const k = hmKey(), sc = hmChordScale();
  const pc = ((note - k.tonic) % 12 + 12) % 12, d = sc.indexOf(pc);
  if (d < 0) return null;
  const st = KBH.sev ? [0, 2, 4, 6] : [0, 2, 4];
  return st.map((s) => note + sc[(d + s) % 7] + (d + s >= 7 ? 12 : 0) - sc[d]);
}
const _kbOnH = kbOn, _kbOffH = kbOff;
kbOn = function(note, vel) {
  const t = kbTarget();
  if (KBH.on && t && !t.is_drums) {
    const ch = hmChordFor(note);
    if (ch) {
      KBH.held.set(note, ch);
      ch.forEach((p) => _kbOnH(p, vel));
      const el = document.getElementById("kb-chord");
      if (el) { const iv = ch.map((p) => p - ch[0]); el.textContent = chordName(ch[0] % 12, hmKindOf(iv)); }
      return;
    }
  }
  _kbOnH(note, vel);
};
kbOff = function(note) {
  const ch = KBH.held.get(note);
  if (ch) { KBH.held.delete(note); ch.forEach((p) => _kbOffH(p)); return; }
  _kbOffH(note);
};
const _openKbH = openKeyboard;
openKeyboard = function() {
  _openKbH();
  const pnl = $("#kbp");
  if (!pnl || pnl.hidden) return;
  const row = $(".kb-row", pnl);
  if (!row) return;
  const box = document.createElement("span");
  box.className = "kb-chords";
  box.innerHTML = `<button class="btn ghost sm ${KBH.on ? "on" : ""}" id="kb-ch" data-hint="Кожна клавіша гами грає цілий акорд тональності — гармонію можна грати одним пальцем, навіть без знання теорії">Акорди однією клавішею</button>
    <button class="btn ghost sm ${KBH.sev ? "on" : ""}" id="kb-ch7" data-hint="Септакорди замість тризвуків">7</button><b id="kb-chord" class="kb-chname"></b>`;
  row.insertBefore(box, row.firstChild);
  $("#kb-ch", pnl).onclick = (e) => { KBH.on = !KBH.on; e.currentTarget.classList.toggle("on", KBH.on); if (KBH.on) toast(`Акорди однією клавішею: білі клавіші гами ${NOTE_NAMES[hmKey().tonic]} грають акорди тональності.`); };
  $("#kb-ch7", pnl).onclick = (e) => { KBH.sev = !KBH.sev; e.currentTarget.classList.toggle("on", KBH.sev); };
  if (HM_UI.scaleOn) $$("[data-kn]", pnl).forEach((k) => { const n = 12 * (KB.oct + 1) + +k.dataset.kn; k.classList.toggle("insc", hmInScale(n)); });
};
const _drawTopHm = drawTop;
drawTop = function() {
  _drawTopHm();
  if (!S.B || chordList().some((c) => c.label !== "N")) return;
  const ctx = cvTop.getContext("2d"), dpr = devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = "#6b7280";
  ctx.fillText(tr("Акордів ще немає — правий клік тут: «Акорд на цей такт», або кнопка «Гармонія» вгорі"), 12, 72);
  ctx.restore();
};
(function hmUI() {
  const top = $(".tl-top");
  top.addEventListener("contextmenu", (e) => {
    if (!S.B) return;
    const r = top.getBoundingClientRect(), y = e.clientY - r.top;
    if (y < 54) return;
    const b = scrollBeat() + (e.clientX - r.left) / S.ppb;
    if (hmChordAt(b)) return;
    e.preventDefault();
    setTimeout(() => {
      if (document.getElementById("ctxmenu")) return;
      menu(e, [[`Акорд на цей такт (${hmBarAt(b)})…`, () => hmAddChordAt(b, e)], ["Конструктор акордів…", openHarmony]]);
    }, 0);
  });
  const btn = $("#t-harm");
  if (btn) btn.onclick = () => openHarmony();
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["Гармонія: конструктор акордів…", needProject(openHarmony)], ["Мелодія з нуля…", needProject(() => openMelody())]]);
  const _rc = replaceChord;
  replaceChord = function(idx, root, kind, melody) {
    const specIds = new Set((S.mix.gens || []).filter((g) => g.spec && g.spec.type !== "drums").map((g) => g.id));
    const saved = new Map();
    for (const id of specIds) { const g = S.mix.gens.find((x) => x.id === id); saved.set(id, { gn: g.notes, mn: mt(id).notes }); }
    _rc(idx, root, kind, melody);
    if (!specIds.size || hmHarm().autoRebuild === false) return;
    for (const [id, v] of saved) { const g = S.mix.gens.find((x) => x.id === id); if (!v.mn) { g.notes = v.gn; mt(id).notes = null; } }
    const rr = hmRebuild(false);
    afterEdit(true);
    if (rr.n) toast(`Партії підлаштовано під новий акорд: ${rr.n}.`);
  };
})();
