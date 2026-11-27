"use strict";
async function tmWarpAll() {
  if (!tmActive()) return toast("Спершу додайте зміни темпу.", true);
  const P = period(), pad = S.B.timing.pad, base = tmBase();
  const segs = tmSegs();
  const W = (ts) => tmU((ts + pad) / P) * P - pad;
  const audio = tracksAll().filter((t) => t.has_audio && mt(t.id).clips.length);
  const clipSegs = (c) => {
    const t0 = c.start * P, out = [];
    segs.forEach((sg, i) => {
      const a = sg.m * P - t0, b = i + 1 < segs.length ? segs[i + 1].m * P - t0 : 1e9;
      if (b <= 0 || a >= c.dur) return;
      out.push([+Math.max(0, a).toFixed(5), +Math.min(b, 1e7).toFixed(5), +(sg.bpm / base).toFixed(6)]);
    });
    return out.length ? out : [[0, 1e7, 1]];
  };
  const ok = await inkConfirm("Підігнати аудіо й ноти під темп", `<p>Зараз доріжка темпу змінює лише сітку. Ця дія один раз перебудує саму музику під неї:</p>
    <ul><li>аудіо ${audio.length} доріжок розтягнеться чи стиснеться по частинах (висота не зміниться);</li><li>ноти MIDI-доріжок, акорди, секції й автоматизація стануть на свої такти в новому темпі.</li></ul>
    <p class="muted small">Кожен кліп підганяється окремо — під темп того місця, де він стоїть, тож пересунуті й скопійовані кліпи теж звучатимуть рівно.</p>
    <p class="muted small">Обробка аудіо створює нові версії доріжок (оригінал лишається у «Версіях»). Ноти й розмітку скасовує Ctrl+Z.</p>`, "Підігнати");
  if (!ok) return;
  pushUndo("підгонка під темп");
  const mapB = (b) => tmU(b);
  for (const t of tracksAll()) {
    const ns = trackNotes(t);
    if (!ns.length) continue;
    const ed = editableNotes(t);
    ed.forEach((n) => { const a = mapB(n[0]), e = mapB(n[0] + n[1]); n[0] = +a.toFixed(5); n[1] = +Math.max(0.02, e - a).toFixed(5); });
  }
  ownArrangement();
  for (const arr of [S.mix.sections, S.mix.chords]) for (const x of arr || []) { x.start = +mapB(x.start).toFixed(5); x.end = +mapB(x.end).toFixed(5); }
  for (const id in S.mix.tracks) { const m = S.mix.tracks[id]; if (m.auto) for (const k in m.auto) m.auto[k] = (m.auto[k] || []).map((q) => [+mapB(q[0]).toFixed(4), q[1]]); }
  if (S.mix.syl) for (const k in S.mix.syl) S.mix.syl[k] = S.mix.syl[k].map((q) => [+mapB(q[0]).toFixed(4), q[1]]);
  const m = careModalBox("warp-modal", "Підгонка під темп", `<div class="pbar"><div id="wp-bar" style="width:3%"></div></div><p class="muted small" id="wp-st">Готую…</p>`);
  let k = 0;
  try {
    for (const t of audio) {
      k++;
      $("#wp-st", m).textContent = `Аудіо «${t.name}» (${k} з ${audio.length})…`;
      const T = mt(t.id);
      const pieces = T.clips.map((c) => { const lead = Math.max(0, -c.src); return [+Math.max(0, c.src).toFixed(5), +Math.max(0, c.src + c.dur).toFixed(5), clipSegs(c).map(([x, y, r]) => [+Math.max(0, x - lead).toFixed(5), +Math.max(0, y - lead).toFixed(5), r])]; });
      const r = await api.post(`/api/project/${S.pid}/process`, { base: baseId(t), source: T.source, op: "tempoclips", params: { pieces } });
      let j;
      for (;;) { await new Promise((res) => setTimeout(res, 400)); j = await api.get(`/api/process/${r.job}`); $("#wp-bar", m).style.width = Math.round(((k - 1) + j.progress) / audio.length * 100) + "%"; if (j.status !== "running") break; }
      if (j.status === "error") throw new Error(j.error);
      const offs = (j.result.stats || {}).pieces || [];
      T.source = j.result.vid;
      T.clips.forEach((c, i) => {
        const o = offs[i];
        if (!o) return;
        const lead = Math.max(0, -c.src), st = mapB(c.start), newLead = lead ? (tmU(c.start + lead / P) - st) * P : 0;
        const e = mapB(c.start + c.dur / P);
        c.src = +(o[0] - newLead).toFixed(5);
        c.dur = +Math.max(0.01, (e - st) * P).toFixed(5);
        c.start = +st.toFixed(5);
      });
    }
    for (const t of tracksAll()) { if (t.has_audio) continue; for (const c of mt(t.id).clips) { const a = W(c.src), b = W(c.src + c.dur); c.dur = +Math.max(c.dur, b - a).toFixed(5); } }
    S.versions = await api.get(`/api/project/${S.pid}/versions`);
    _arrCache.clear();
    _tracksKey = "";
    await loadAudio();
    afterEdit(true);
    m.hidden = true;
    toast(`Готово: музика тепер іде за доріжкою темпу (${audio.length} аудіо, ноти, акорди, секції).`);
  } catch (e) {
    afterEdit(true);
    $("#wp-st", m).textContent = "Не вдалося: " + e.message;
  }
}
const _openTempoP = openTempo;
openTempo = function() {
  _openTempoP();
  const m = document.getElementById("tempo-modal");
  if (!m || $("#tm-warp", m)) return;
  const act = $(".modal-actions", m);
  const b = document.createElement("button");
  b.className = "btn ghost";
  b.id = "tm-warp";
  b.textContent = tr("Підігнати аудіо й ноти під темп…");
  b.dataset.hint = tr("Один раз перебудувати саму музику під зміни темпу: аудіо розтягується по частинах, ноти й акорди стають на нові такти");
  b.onclick = () => { m.hidden = true; tmWarpAll(); };
  act.insertBefore(b, act.firstChild.nextSibling);
};
async function recLayersAll(btn) {
  const takes = REC.takes.slice();
  if (!takes.length) return;
  btn.disabled = true;
  let k = 0;
  try {
    await flushMix();
    for (const tk of takes) {
      k++;
      btn.textContent = `Шар ${k} з ${takes.length}…`;
      const wav = DSP.encodeWav({ numberOfChannels: 1, sampleRate: tk.sr, length: tk.data.length, getChannelData: () => tk.data });
      const fd = new FormData();
      fd.append("file", new Blob([wav], { type: "audio/wav" }), "take.wav");
      fd.append("start", String(tk.start));
      fd.append("name", `${tr("Шар")} ${tk.n}`);
      fd.append("kind", tk.kind);
      fd.append("transcribe", "0");
      const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd }), j = await r.json();
      if (!r.ok) throw new Error(j.error || "помилка");
      await careWait(j.job, () => {});
      REC.takes = REC.takes.filter((t) => t.id !== tk.id);
    }
    await reloadProject();
    toast(`Збережено шарів: ${takes.length}. Тепер вони звучать разом — запишіть наступне коло поверх.`);
  } catch (e) {
    toast("Не вдалося: " + e.message, true);
  }
  renderTakes();
}
const _renderTakesP = renderTakes;
renderTakes = function() {
  _renderTakesP();
  const box = $("#rec-takes");
  if (!box || REC.takes.length < 2) return;
  const b = document.createElement("button");
  b.className = "btn ghost sm rec-layers";
  b.textContent = tr("Усі дублі → шари (лупер)");
  b.dataset.hint = tr("Зберегти кожен дубль окремою доріжкою, щоб усі кола звучали разом — як у лупер-педалі. Потім можна записати ще кола поверх");
  b.onclick = () => recLayersAll(b);
  box.insertBefore(b, box.firstChild);
};
