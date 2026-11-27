"use strict";
const SC = { m: null, ids: null, from: 1, to: 16, perLine: 4, loaded: false };
const DUR_TABLE = [[16, "w", 0], [12, "h", 1], [8, "h", 0], [6, "q", 1], [4, "q", 0], [3, "8", 1], [2, "8", 0], [1, "16", 0]];
const XML_TYPE = { w: "whole", h: "half", q: "quarter", "8": "eighth", "16": "16th" };
function scSplit(d) {
  const out = [];
  while (d > 0) {
    const e = DUR_TABLE.find((x) => x[0] <= d);
    out.push(e);
    d -= e[0];
  }
  return out;
}
function scKeyFifths() {
  const k = S.B.key || { tonic: 0, mode: "major" };
  const maj = k.mode === "minor" ? (k.tonic + 3) % 12 : k.tonic;
  return { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 5: -1, 10: -2, 3: -3, 8: -4 }[maj] || 0;
}
function scSpell(p, fifths) {
  const sharp = fifths >= 0;
  const names = sharp ? [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]] : [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];
  const [step, alter] = names[((p % 12) + 12) % 12];
  return { step, alter, octave: Math.floor(p / 12) - 1 };
}
function scMeasures(t, fromBar, toBar) {
  const bpb = S.B.timing.bpb, M = bpb * 4, a = (fromBar - 1) * bpb, b = toBar * bpb;
  const raw = arranged(t).map((n) => [tmM(n[0]), tmM(n[0] + n[1]) - tmM(n[0]), n[2]]).filter((n) => n[0] >= a - 1e-6 && n[0] < b).map((n) => [Math.round((n[0] - a) * 4), Math.max(1, Math.round(n[1] * 4)), n[2]]);
  const groups = new Map();
  for (const [q, d, p] of raw) {
    const g = groups.get(q) || { q, d: 0, ps: new Set() };
    g.d = Math.max(g.d, d);
    g.ps.add(p);
    groups.set(q, g);
  }
  const ev = [...groups.values()].sort((x, y) => x.q - y.q);
  const total = (toBar - fromBar + 1) * M;
  ev.forEach((e, i) => {
    const nx = ev[i + 1] ? ev[i + 1].q : total;
    e.d = Math.max(1, Math.min(e.d, nx - e.q, total - e.q));
  });
  const measures = Array.from({ length: toBar - fromBar + 1 }, () => []);
  let pos = 0;
  const place = (start, dur, ps) => {
    let s = start, left = dur, tieIn = false;
    while (left > 0) {
      const mi = Math.floor(s / M), inM = s - mi * M, room = M - inM, take = Math.min(left, room);
      const parts = scSplit(take);
      let o = inM;
      parts.forEach((pt, k) => {
        const last = k === parts.length - 1 && take === left;
        if (measures[mi]) measures[mi].push({ at: o, len: pt[0], type: pt[1], dot: pt[2], ps: ps ? [...ps].sort((x, y) => x - y) : null, tieStart: ps && !last, tieStop: ps && (tieIn || k > 0) });
        o += pt[0];
      });
      tieIn = true;
      left -= take;
      s += take;
    }
  };
  for (const e of ev) {
    if (e.q > pos) place(pos, e.q - pos, null);
    place(e.q, e.d, e.ps);
    pos = e.q + e.d;
  }
  if (pos < total) place(pos, total - pos, null);
  return measures;
}
function scClef(t) {
  const ps = trackNotes(t).map((n) => n[2]).sort((a, b) => a - b);
  return ps.length && ps[Math.floor(ps.length / 2)] < 57 ? "bass" : "treble";
}
function scMusicXML(ids, fromBar, toBar) {
  const bpb = S.B.timing.bpb, fifths = scKeyFifths();
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const parts = ids.map((id) => findT(id)).filter(Boolean);
  let x = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n  <work><work-title>${esc(S.B.project.title)}</work-title></work>\n  <identification><encoding><software>InkBeat</software></encoding></identification>\n  <part-list>\n`;
  parts.forEach((t, i) => { x += `    <score-part id="P${i + 1}"><part-name>${esc(t.name)}</part-name></score-part>\n`; });
  x += "  </part-list>\n";
  parts.forEach((t, i) => {
    const clef = scClef(t), ms = scMeasures(t, fromBar, toBar);
    x += `  <part id="P${i + 1}">\n`;
    const syl = (S.mix.syl && S.mix.syl[t.id] || []).map(([b2, tx]) => [tmM(b2), tx]);
    let prevHy = false;
    ms.forEach((evs, mi) => {
      let p16 = 0;
      x += `    <measure number="${fromBar + mi}">\n`;
      if (mi === 0) {
        x += `      <attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>${bpb}</beats><beat-type>4</beat-type></time><clef><sign>${clef === "bass" ? "F" : "G"}</sign><line>${clef === "bass" ? 4 : 2}</line></clef></attributes>\n`;
        if (i === 0) x += `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(S.B.timing.bpm)}</per-minute></metronome></direction-type><sound tempo="${S.B.timing.bpm.toFixed(2)}"/></direction>\n`;
      }
      for (const e of evs) {
        const dot = e.dot ? "<dot/>" : "";
        const mBeat = (fromBar - 1 + mi) * bpb + p16 / 4;
        p16 += e.len;
        if (!e.ps) { x += `      <note><rest/><duration>${e.len}</duration><type>${XML_TYPE[e.type]}</type>${dot}</note>\n`; continue; }
        const sy = !e.tieStop && syl.find((q) => Math.abs(q[0] - mBeat) < 0.13);
        let lyr = "";
        if (sy) {
          const hy = /-$/.test(sy[1]), txt = sy[1].replace(/-$/, "");
          lyr = `<lyric number="1"><syllabic>${hy ? (prevHy ? "middle" : "begin") : prevHy ? "end" : "single"}</syllabic><text>${esc(txt)}</text></lyric>`;
          prevHy = hy;
        }
        e.ps.forEach((p, k) => {
          const sp = scSpell(p, fifths);
          const ties = (e.tieStop ? '<tie type="stop"/>' : "") + (e.tieStart ? '<tie type="start"/>' : "");
          const tied = (e.tieStop ? '<tied type="stop"/>' : "") + (e.tieStart ? '<tied type="start"/>' : "");
          x += `      <note>${k ? "<chord/>" : ""}<pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ""}<octave>${sp.octave}</octave></pitch><duration>${e.len}</duration>${ties}<type>${XML_TYPE[e.type]}</type>${dot}${tied ? `<notations>${tied}</notations>` : ""}${k === 0 ? lyr : ""}</note>\n`;
        });
      }
      x += "    </measure>\n";
    });
    x += "  </part>\n";
  });
  return x + "</score-partwise>\n";
}
function scLoadVF() {
  if (window.Vex) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "/ui/vendor/vexflow.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Не вдалося завантажити модуль нот."));
    document.head.appendChild(s);
  });
}
function scRenderVF(el, ids, fromBar, toBar) {
  const VF = Vex.Flow, fifths = scKeyFifths(), bpb = S.B.timing.bpb;
  const keySig = { 0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", "-1": "F", "-2": "Bb", "-3": "Eb", "-4": "Ab", "-5": "Db", "-6": "Gb" }[fifths];
  const sigAlter = new Map();
  const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"], flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
  if (fifths > 0) sharpOrder.slice(0, fifths).forEach((s) => sigAlter.set(s, 1));
  if (fifths < 0) flatOrder.slice(0, -fifths).forEach((s) => sigAlter.set(s, -1));
  el.innerHTML = "";
  const W = Math.max(600, el.clientWidth - 10), per = SC.perLine, bars = toBar - fromBar + 1;
  const parts = ids.map((id) => findT(id)).filter(Boolean);
  const lines = Math.ceil(bars / per), staffH = 110, sysH = parts.length * staffH + 30;
  const div = document.createElement("div");
  el.appendChild(div);
  const r = new VF.Renderer(div, VF.Renderer.Backends.SVG);
  r.resize(W, lines * sysH + 60);
  const ctx = r.getContext();
  ctx.setFont("Arial", 10);
  ctx.save();
  ctx.setFont("Arial", 18, "bold");
  ctx.fillText(S.B.project.title, 10, 26);
  ctx.setFont("Arial", 11);
  ctx.fillText(`${Math.round(S.B.timing.bpm)} BPM · ${S.B.key ? S.B.key.name : ""}`, 10, 44);
  ctx.restore();
  const data = parts.map((t) => ({ t, clef: scClef(t), ms: scMeasures(t, fromBar, toBar) }));
  for (let L = 0; L < lines; L++) {
    const y0 = 60 + L * sysH;
    const firstBar = L * per, n = Math.min(per, bars - firstBar);
    const extra = 90, mw = (W - 20 - extra) / n;
    data.forEach((d, pi) => {
      const y = y0 + pi * staffH;
      for (let k = 0; k < n; k++) {
        const mi = firstBar + k, x = 10 + (k === 0 ? 0 : extra + k * mw), w = k === 0 ? mw + extra : mw;
        const st = new VF.Stave(x, y, w);
        if (k === 0) {
          st.addClef(d.clef).addKeySignature(keySig);
          if (L === 0) st.addTimeSignature(`${bpb}/4`);
          st.setText(d.t.name, VF.Modifier.Position.LEFT, { shift_x: 0, shift_y: -18 });
        }
        if (k === 0) st.setMeasure(fromBar + mi);
        st.setContext(ctx).draw();
        const evs = d.ms[mi] || [];
        const syl = (S.mix.syl && S.mix.syl[d.t.id] || []).map(([b2, tx]) => [tmM(b2), tx]);
        let p16 = 0;
        const notes = evs.map((e) => {
          const mBeat = (fromBar - 1 + mi) * bpb + p16 / 4;
          p16 += e.len;
          const keys = e.ps ? e.ps.map((p) => { const sp = scSpell(p, fifths); return `${sp.step.toLowerCase()}${sp.alter > 0 ? "#" : sp.alter < 0 ? "b" : ""}/${sp.octave}`; }) : [d.clef === "bass" ? "d/3" : "b/4"];
          const sn = new VF.StaveNote({ keys, duration: e.type + (e.dot ? "d" : "") + (e.ps ? "" : "r"), clef: d.clef, auto_stem: true });
          if (e.dot) VF.Dot.buildAndAttach([sn], { all: true });
          if (e.ps) e.ps.forEach((p, i) => {
            const sp = scSpell(p, fifths), want = sp.alter, sig = sigAlter.get(sp.step) || 0;
            if (want !== sig) sn.addModifier(new VF.Accidental(want > 0 ? "#" : want < 0 ? "b" : "n"), i);
          });
          const sy = e.ps && !e.tieStop && syl.find((q) => Math.abs(q[0] - mBeat) < 0.13);
          if (sy) sn.addModifier(new VF.Annotation(sy[1]).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM).setFont("Arial", 10), 0);
          sn._ev = e;
          return sn;
        });
        if (!notes.length) continue;
        try {
          const voice = new VF.Voice({ num_beats: bpb, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
          voice.addTickables(notes);
          const beams = VF.Beam.generateBeams(notes.filter((x) => !x.isRest()), { groups: [new VF.Fraction(1, 4)] });
          new VF.Formatter().joinVoices([voice]).format([voice], w - (k === 0 ? extra + 20 : 20));
          voice.draw(ctx, st);
          beams.forEach((b) => b.setContext(ctx).draw());
          notes.forEach((nt, i) => {
            if (nt._ev.tieStart && notes[i + 1] && notes[i + 1]._ev.tieStop) new VF.StaveTie({ first_note: nt, last_note: notes[i + 1], first_indices: nt._ev.ps.map((_, j) => j), last_indices: nt._ev.ps.map((_, j) => j) }).setContext(ctx).draw();
          });
        } catch (err) {
        }
      }
    });
  }
}
async function openScore() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const list = tracksAll().filter((t) => !t.is_drums && trackNotes(t).length);
  if (!SC.ids) SC.ids = [S.sel && list.some((t) => t.id === S.sel) ? S.sel : (list[0] || {}).id].filter(Boolean);
  if (S.loop && S.loop.on) { SC.from = Math.floor(tmM(S.loop.a) / S.B.timing.bpb) + 1; SC.to = Math.max(SC.from, Math.ceil(tmM(S.loop.b) / S.B.timing.bpb)); }
  else if (!SC.opened) { SC.from = Math.max(1, Math.floor(tmM(S.playBeat) / S.B.timing.bpb) + 1); SC.to = SC.from + 15; }
  SC.opened = true;
  let m = document.getElementById("score-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "score-modal";
    document.body.appendChild(m);
  }
  SC.m = m;
  m.innerHTML = `<div class="modal-card score-card"><div class="modal-head"><h3>Ноти (партитура)</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body">
      <div class="tc-top">
        <div class="sc-parts" data-hint="Які партії показати в партитурі">${list.map((t) => `<label class="chk"><input type="checkbox" value="${escapeHtml(t.id)}" ${SC.ids.includes(t.id) ? "checked" : ""}> ${escapeHtml(t.name)}</label>`).join("")}</div>
        <label>Такти <input type="number" id="sc-from" min="1" value="${SC.from}"> – <input type="number" id="sc-to" min="1" value="${SC.to}"></label>
        <label>У рядку <select id="sc-per">${[2, 3, 4, 5, 6].map((n) => `<option ${n === SC.perLine ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <span class="spacer"></span>
        <button class="btn ghost sm" id="sc-xml" data-hint="Зберегти MusicXML — його відкривають MuseScore, Sibelius, Finale, Dorico та більшість нотних редакторів">MusicXML ⤓</button>
        <button class="btn primary sm" id="sc-print" data-hint="Надрукувати або зберегти як PDF (у вікні друку виберіть «Зберегти як PDF»)">Друк / PDF</button>
      </div>
      <p class="muted small">Ноти округлено до шістнадцятих, щоб їх було легко читати. Для точнішого запису спершу квантуйте партію в піано-ролі. Барабани в партитуру не потрапляють.</p>
      <div id="sc-view" class="sc-view"><div class="dock-empty">Готую ноти…</div></div>
    </div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => m.hidden = true);
  const redraw = () => {
    SC.ids = $$(".sc-parts input:checked", m).map((x) => x.value);
    SC.from = Math.max(1, +$("#sc-from", m).value || 1);
    SC.to = Math.max(SC.from, Math.min(SC.from + 199, +$("#sc-to", m).value || SC.from));
    SC.perLine = +$("#sc-per", m).value;
    const v = $("#sc-view", m);
    if (!SC.ids.length) { v.innerHTML = `<div class="dock-empty">Позначте хоча б одну партію.</div>`; return; }
    try { scRenderVF(v, SC.ids, SC.from, SC.to); } catch (e) { v.innerHTML = `<div class="dock-empty">Не вдалося намалювати ноти: ${escapeHtml(e.message)}</div>`; }
  };
  $$(".sc-parts input, #sc-from, #sc-to, #sc-per", m).forEach((x) => x.onchange = redraw);
  $("#sc-xml", m).onclick = async () => {
    if (!SC.ids.length) return;
    const xml = scMusicXML(SC.ids, SC.from, SC.to);
    const name = `${S.B.project.title.replace(/[\\/:*?"<>|]+/g, "_")} - ноти.musicxml`;
    if (DESK.on) {
      const r = await api.post(`/api/project/${S.pid}/save_text`, { name, text: xml }).catch((e) => ({ error: e.message }));
      if (r.error) return toast(r.error, true);
      toast(`Збережено «${name}» у папці експорту проєкту → «Ноти».`, false, ["Відкрити папку", () => api.post(`/api/project/${S.pid}/open_path`, { path: r.path })]);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      api.post(`/api/project/${S.pid}/save_text`, { name, text: xml }).catch(() => {});
    }
  };
  $("#sc-print", m).onclick = () => {
    const svg = $("#sc-view", m).innerHTML;
    let pa = document.getElementById("print-area");
    if (!pa) { pa = document.createElement("div"); pa.id = "print-area"; document.body.appendChild(pa); }
    pa.innerHTML = svg;
    document.body.classList.add("printing");
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove("printing"), 500);
    }, 50);
  };
  m.hidden = false;
  try {
    await scLoadVF();
    redraw();
  } catch (e) {
    $("#sc-view", m).innerHTML = `<div class="dock-empty">${escapeHtml(e.message)}</div>`;
  }
}
(function scMenus() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Ноти: партитура, MusicXML, PDF…", needProject(openScore)]]);
})();
