"use strict";
const NEWP = { bpb: 4, bars: 64, mode: "minor" };
function openNewProject() {
  const keys = NOTE_NAMES.map((n, i) => `<option value="${i}" ${i === 9 ? "selected" : ""}>${n}</option>`).join("");
  careModal("Новий проєкт з нуля", `<p class="muted">Порожній проєкт без пісні: задайте темп і тональність, а далі додавайте MIDI-доріжки, свої аудіофайли або записуйте голос.</p>
    <div class="np-grid">
      <label class="full">Назва<input type="text" id="np-title" maxlength="60" placeholder="Наприклад: Новий біт"></label>
      <label>Темп, BPM<input type="number" id="np-bpm" min="40" max="260" step="1" value="${(UIP.newp && UIP.newp.bpm) || 120}"></label>
      <label>Тональність<div style="display:flex;gap:6px"><select id="np-tonic">${keys}</select><select id="np-mode"><option value="minor">мінор</option><option value="major">мажор</option></select></div></label>
      <label>Розмір<div class="np-seg" id="np-bpb">${[4, 3, 6].map((b) => `<button type="button" data-v="${b}" class="${b === NEWP.bpb ? "on" : ""}">${b}/4</button>`).join("")}</div></label>
      <label class="full" data-hint="Готовий старт у стилі жанру: структура, акорди, барабани, бас, акомпанемент і переходи. Темп і лад підставляються самі, їх можна змінити">Шаблон жанру<select id="np-genre"><option value="">— порожній проєкт —</option>${Object.entries(GENRES).map(([k, g]) => `<option value="${k}">${escapeHtml(g.name)} · ${g.bpm} BPM</option>`).join("")}</select></label>
      <label>Довжина<div class="np-seg" id="np-bars">${[16, 32, 64, 128].map((b) => `<button type="button" data-v="${b}" class="${b === NEWP.bars ? "on" : ""}">${b} тактів</button>`).join("")}</div></label>
    </div>
    <label class="chk" data-hint="Одразу після створення відкриється конструктор акордів: виберіть прогресію, і програма запише акорди, акомпанемент, бас і барабани"><input type="checkbox" id="np-harm" ${NEWP.harm !== false ? "checked" : ""}> Почати з акордів (відкрити «Гармонію»)</label>
    <p class="muted small">Довжину можна не вгадувати: якщо додати довший аудіофайл, проєкт подовжиться сам. Темп і тональність змінюються потім у панелі «Проєкт».</p>
    <div class="modal-actions"><button class="btn ghost" id="np-cancel">Скасувати</button><button class="btn primary" id="np-go">Створити проєкт</button></div>`);
  $("#np-mode").value = NEWP.mode;
  const seg = (id, key) => $(id).querySelectorAll("button").forEach((b) => b.onclick = () => {
    NEWP[key] = +b.dataset.v;
    $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  });
  seg("#np-bpb", "bpb");
  seg("#np-bars", "bars");
  $("#np-cancel").onclick = () => $("#care-modal").hidden = true;
  $("#np-genre").onchange = (e) => { const g = GENRES[e.target.value]; if (!g) return; $("#np-bpm").value = g.bpm; $("#np-mode").value = g.mode; $("#np-harm").checked = false; };
  $("#np-title").focus();
  $("#np-title").onkeydown = (e) => { if (e.key === "Enter") $("#np-go").click(); };
  $("#np-go").onclick = async () => {
    const bpm = parseFloat($("#np-bpm").value);
    if (!(bpm >= 40 && bpm <= 260)) return toast("Темп має бути від 40 до 260 BPM.", true);
    NEWP.mode = $("#np-mode").value;
    NEWP.harm = $("#np-harm").checked;
    $("#np-go").disabled = true;
    $("#np-go").textContent = "Створюю…";
    try {
      const genre = $("#np-genre").value, gbars = genre ? STRUCTS[GENRES[genre].struct][1].reduce((s, x) => s + x[1], 0) : 0;
      const r = await api.post("/api/projects/new", { title: $("#np-title").value.trim(), bpm, bpb: NEWP.bpb, bars: genre ? Math.max(gbars, 16) : NEWP.bars, tonic: +$("#np-tonic").value, mode: NEWP.mode });
      $("#care-modal").hidden = true;
      await openProject(r.pid);
      toast("Проєкт створено. Натисніть «+ Додати доріжку» ліворуч.");
      if (genre) setTimeout(() => applyGenre(genre), 300);
      else if (NEWP.harm) setTimeout(openHarmony, 300);
    } catch (e) {
      toast("Не вдалося створити проєкт: " + e.message, true);
      $("#np-go").disabled = false;
      $("#np-go").textContent = "Створити проєкт";
    }
  };
}
const NEW_TRACKS = {
  keys: { name: "Клавішні", role: "keys", color: "#3b82f6", program: 0 },
  bass: { name: "Бас", role: "bass", color: "#8b5cf6", program: 38 },
  lead: { name: "Мелодія", role: "lead", color: "#ec4899", program: 80 },
  pad: { name: "Пад", role: "pad", color: "#eab308", program: 89 },
  drums: { name: "Барабани", role: "drums", color: "#f59e0b", program: 0, is_drums: true }
};
function addMidiTrack(kind) {
  if (!S.B) return;
  const d = NEW_TRACKS[kind];
  pushUndo("нова доріжка");
  if (!S.mix.gens) S.mix.gens = [];
  const n = S.mix.gens.filter((g) => g.name.startsWith(d.name)).length;
  const id = uid("gen");
  const g = { id, name: n ? `${d.name} ${n + 1}` : d.name, color: d.color, role: d.role, is_drums: !!d.is_drums, program: d.program, notes: [], user: true };
  S.mix.gens.push(g);
  const P = period();
  const inst = d.is_drums ? { type: "drums", kit: S.B.tracks.some((t) => t.has_audio && t.is_drums) ? "song" : "acoustic", pads: {} } : Plugins.defaultInstrument({ role: d.role, kind: d.role === "pad" ? "chords" : "" });
  S.mix.tracks[id] = { vol: 0, pan: 0, mute: false, solo: false, mode: "midi", fx: [], inst, source: null, notes: null,
    clips: [{ id: uid("c"), start: 0, src: -S.B.timing.pad, dur: Math.max(arrEnd(), S.B.end_beat || 0, 16) * P + 8 * P, gain: 0, fi: 5e-3, fo: 5e-3, mute: false }] };
  _tracksKey = "";
  S.sel = id;
  S.dockTab = "notes";
  afterEdit(true);
  loadInstrumentBuffers();
  if (typeof showDock === "function") showDock(true);
  toast(`Доріжку «${g.name}» додано. Малюйте ноти олівцем на вкладці «Ноти», звук — на вкладці «Інструмент».`);
}
async function pickAudioFile() {
  return (await pickLocal("audio", false))[0] || null;
}
async function importAudioTrack(kind) {
  if (!S.pid) return;
  const f = await pickAudioFile();
  if (!f) return;
  const name = f.name.replace(/\.[^.]+$/, "").slice(0, 60);
  const start = Math.max(0, S.playBeat * period() - S.B.timing.pad);
  const fd = new FormData();
  fd.append("file", f, f.name);
  fd.append("start", String(start));
  fd.append("name", name);
  fd.append("kind", kind);
  fd.append("transcribe", kind === "drums" ? "0" : "1");
  careModal("Додаю аудіо", `<p>Додаю «${escapeHtml(name)}» з позиції курсору${kind !== "drums" ? " і розпізнаю ноти, щоб можна було експортувати MIDI" : ""}.</p><div class="pbar"><div id="ia-bar" style="width:5%"></div></div><p class="muted small" id="ia-st">Завантажую файл…</p>`);
  try {
    stopPlay();
    await flushMix();
    const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "помилка");
    const res = await careWait(j.job, (p) => {
      $("#ia-bar").style.width = Math.max(5, p * 100) + "%";
      $("#ia-st").textContent = p > 0 ? `Розпізнаю ноти… ${Math.round(p * 100)}%` : "Обробляю…";
    });
    $("#care-modal").hidden = true;
    await reloadProject();
    if (res && res.track && findT(res.track)) selectTrack(res.track);
    toast(`Доріжку «${name}» додано.`);
  } catch (e) {
    $("#care-body").innerHTML = `<p>Не вдалося додати файл:</p><p class="warn">${escapeHtml(e.message)}</p><div class="modal-actions"><button class="btn primary" data-close2>Закрити</button></div>`;
    $("#care-body [data-close2]").onclick = () => $("#care-modal").hidden = true;
  }
}
function addTrackMenu(e) {
  if (!S.B) return toast("Спершу відкрийте або створіть проєкт.", true);
  menu(e, [
    ["MIDI: клавішні / піаніно", () => addMidiTrack("keys")],
    ["MIDI: бас", () => addMidiTrack("bass")],
    ["MIDI: мелодія (лід)", () => addMidiTrack("lead")],
    ["MIDI: пад / акорди", () => addMidiTrack("pad")],
    ["MIDI: барабани", () => addMidiTrack("drums")],
    null,
    ["Аудіо з файлу (вокал, інструмент)…", () => importAudioTrack("other")],
    ["Аудіо з файлу: барабанний луп…", () => importAudioTrack("drums")],
    ["Записати з мікрофона…", () => openRecorder()],
    null,
    ["Згенерувати партію за акордами…", () => openGenerator()]
  ]);
}
(function scratchHooks() {
  $("#mode-new").addEventListener("click", openNewProject);
  const file = MENUS["Файл"];
  MENUS["Файл"] = () => {
    const items = file();
    const i = items.findIndex((x) => x && /Відкрити/.test(x[0]));
    items.splice(i >= 0 ? i : 1, 0, ["Новий проєкт з нуля…", openNewProject]);
    return items;
  };
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => [["Додати доріжку…", needProject((ev) => addTrackMenu(ev || { clientX: 260, clientY: 120 }))], null].concat(tools());
  const rh = renderHeads;
  renderHeads = function() {
    rh();
    const box = $("#heads");
    if (!box || !S.B) return;
    if (!tracksAll().length) {
      const h = document.createElement("div");
      h.className = "empty-hint";
      h.innerHTML = "<b>Порожній проєкт.</b> Додайте MIDI-доріжку й малюйте ноти олівцем, імпортуйте свій аудіофайл або запишіть голос.";
      box.appendChild(h);
    }
    const b = document.createElement("button");
    b.className = "add-track";
    b.textContent = "+ Додати доріжку";
    b.dataset.hint = "Нова MIDI-доріжка з інструментом, аудіо з файлу, запис з мікрофона або згенерована партія";
    b.onclick = (e) => {
      e.stopPropagation();
      addTrackMenu(e);
    };
    box.appendChild(b);
  };
})();
