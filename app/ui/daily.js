"use strict";
const _pushUndoD = pushUndo;
pushUndo = function(label) {
  _pushUndoD(label);
  const u = S.undo[S.undo.length - 1];
  if (u) u.at = Date.now();
  histRefresh();
};
const _undoD = undo, _redoD = redo;
undo = function() { _undoD(); histRefresh(); };
redo = function() { _redoD(); histRefresh(); };
function histJump(n) {
  if (n > 0) { for (let i = 0; i < n; i++) { const u = S.undo.pop(); if (!u) break; S.redo.push({ label: u.label, state: JSON.stringify(S.mix), at: u.at }); S.mix = JSON.parse(u.state); } }
  else for (let i = 0; i < -n; i++) { const r = S.redo.pop(); if (!r) break; S.undo.push({ label: r.label, state: JSON.stringify(S.mix), at: r.at }); S.mix = JSON.parse(r.state); }
  _tracksKey = "";
  _arrCache.clear();
  afterEdit(true);
  renderDock();
  histRefresh();
}
function histRefresh() {
  const m = document.getElementById("hist-modal");
  if (!m || m.hidden) return;
  const fmt = (t) => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const rows = [];
  rows.push(`<div class="hist-row base" data-n="${S.undo.length}"><span>●</span><b>${escapeHtml(tr("Початок (стан при відкритті)"))}</b></div>`);
  S.undo.forEach((u, i) => rows.push(`<div class="hist-row" data-n="${S.undo.length - 1 - i}"><span>${i + 1}</span><b>${escapeHtml(tr(u.label))}</b><small>${fmt(u.at)}</small></div>`));
  rows.push(`<div class="hist-row now"><span>▶</span><b>${escapeHtml(tr("Зараз"))}</b></div>`);
  S.redo.slice().reverse().forEach((r, i) => rows.push(`<div class="hist-row redo" data-n="${-(i + 1)}"><span>↻</span><b>${escapeHtml(tr(r.label))}</b><small>${fmt(r.at)}</small></div>`));
  $("#hist-list", m).innerHTML = rows.join("");
  $$(".hist-row[data-n]", m).forEach((r) => r.onclick = () => { const n = +r.dataset.n; if (n) histJump(n); });
  const now = $(".hist-row.now", m);
  if (now) now.scrollIntoView({ block: "nearest" });
}
function openHistory() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  let m = document.getElementById("hist-modal");
  if (!m) {
    m = document.createElement("div"); m.className = "modal"; m.id = "hist-modal"; document.body.appendChild(m);
    if (!UIP.mfloat["hist-modal"]) { UIP.mfloat["hist-modal"] = { on: true, rect: { x: innerWidth - 400, y: 120, w: 360, h: Math.min(560, innerHeight - 160) } }; saveUI(); }
  }
  m.innerHTML = `<div class="modal-card" style="width:360px"><div class="modal-head"><h3>Кроки змін</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body"><p class="muted small">Клацніть на будь-який крок — проєкт повернеться до стану після нього. Скасовані кроки (↻) можна повернути так само. Зберігаються останні 80 кроків цього сеансу; знімки на диску — у «Історії».</p><div id="hist-list" class="hist-list"></div></div></div>`;
  $("[data-close]", m).onclick = () => { m.hidden = true; };
  m.hidden = false;
  histRefresh();
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "h" && !typingIn(e.target)) { e.preventDefault(); openHistory(); }
});
async function saveAsTemplate() {
  if (!S.B) return;
  const name = await inkPrompt(tr("Назва шаблону:"), S.B.project.title);
  if (!name) return;
  const gens = S.mix.gens || [];
  const tracks = {};
  for (const g of gens) if (S.mix.tracks[g.id]) tracks[g.id] = S.mix.tracks[g.id];
  let thumb = "";
  try { const cv = $("#cv-body"), t = document.createElement("canvas"); t.width = 240; t.height = 120; t.getContext("2d").drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, 240, 120); thumb = t.toDataURL("image/jpeg", 0.7); } catch (e) {}
  const data = { v: 1, bpm: S.B.timing.bpm, bpb: S.B.timing.bpb, tonic: hmKey().tonic, mode: hmKey().minor ? "minor" : "major", bars: Math.ceil(tmM(arrEnd()) / S.B.timing.bpb), thumb,
    mix: JSON.parse(JSON.stringify({ gens, tracks, sections: S.mix.sections || null, chords: S.mix.chords || null, harmony: S.mix.harmony || null, master: S.mix.master, buses: S.mix.buses || null, tempo: S.mix.tempo || null, scenes: S.mix.scenes || null, lyrics: S.mix.lyrics || "" })) };
  await api.post("/api/library/preset", { kind: "template", name, data });
  toast(`Шаблон «${name}» збережено. Він з'явиться у вікні нового проєкту.`);
}
async function inkPrompt(title, def) {
  const p = inkConfirm(title, `<input id="ink-pr" style="width:100%" value="${escapeHtml(def || "")}">`, "OK");
  setTimeout(() => { const i = document.getElementById("ink-pr"); if (i) { i.focus(); i.select(); } }, 30);
  const ok = await p;
  const v = ok ? (document.getElementById("ink-pr") || {}).value : "";
  return (v || "").trim();
}
function applyTemplate(tpl) {
  const t = tpl.mix || {};
  pushUndo("шаблон проєкту");
  S.mix.gens = JSON.parse(JSON.stringify(t.gens || []));
  for (const id in t.tracks || {}) S.mix.tracks[id] = JSON.parse(JSON.stringify(t.tracks[id]));
  for (const k of ["sections", "chords", "harmony", "buses", "tempo", "scenes"]) if (t[k]) S.mix[k] = JSON.parse(JSON.stringify(t[k]));
  if (t.master) S.mix.master = JSON.parse(JSON.stringify(t.master));
  if (t.lyrics) S.mix.lyrics = t.lyrics;
  _tracksKey = "";
  _arrCache.clear();
  afterEdit(true);
  loadInstrumentBuffers();
  rebuildStrips && rebuildStrips();
}
const _openNewProjectD = openNewProject;
openNewProject = async function() {
  _openNewProjectD();
  let lib;
  try { lib = await api.get("/api/library"); } catch (e) { return; }
  const T = (lib.presets && lib.presets.template) || {};
  const names = Object.keys(T);
  if (!names.length) return;
  const grid = $(".np-grid");
  if (!grid) return;
  const box = document.createElement("div");
  box.className = "full np-tpl";
  box.innerHTML = `<b>Мої шаблони</b><div class="np-tpls">${names.map((n) => `<button type="button" class="np-tb" data-tpl="${escapeHtml(n)}" data-hint="${escapeHtml(n)}: ${Math.round(T[n].bpm)} BPM">${T[n].thumb ? `<img src="${T[n].thumb}">` : ""}<span>${escapeHtml(n)}</span></button>`).join("")}</div>`;
  grid.appendChild(box);
  $$("[data-tpl]", box).forEach((b) => b.onclick = () => {
    const on = !b.classList.contains("on");
    $$("[data-tpl]", box).forEach((x) => x.classList.remove("on"));
    NEWP.tpl = on ? b.dataset.tpl : null;
    if (on) { const t = T[b.dataset.tpl]; $("#np-bpm").value = Math.round(t.bpm); $("#np-mode").value = t.mode; $("#np-tonic").value = t.tonic; if ($("#np-genre")) $("#np-genre").value = ""; if ($("#np-harm")) $("#np-harm").checked = false; b.classList.add("on"); }
  });
  NEWP.tpl = null;
  NEWP.tplData = T;
  const go = $("#np-go"), orig = go.onclick;
  go.onclick = (e) => { NEWP.tplArm = NEWP.tpl; return orig(e); };
};
const _openProjectD = openProject;
openProject = async function(pid) {
  const r = await _openProjectD(pid);
  if (NEWP.tplArm && NEWP.tplData && NEWP.tplData[NEWP.tplArm] && S.B && !(S.mix.gens || []).length) {
    const t = NEWP.tplData[NEWP.tplArm];
    NEWP.tplArm = null;
    NEWP.tpl = null;
    applyTemplate(t);
    toast("Шаблон застосовано: доріжки, інструменти, ефекти, структура й акорди.");
  }
  return r;
};
const PH = { items: [], url: "", poll: 0, seen: new Set() };
async function phRefresh(m) {
  const r = await api.get("/api/phone/inbox").catch(() => ({ items: [], on: false }));
  PH.items = r.items || [];
  const box = $("#ph-list", m);
  if (!box) return;
  box.innerHTML = PH.items.length ? PH.items.map((it) => `<div class="sb-row" data-id="${escapeHtml(it.id)}"><b>${escapeHtml(it.name || (it.file ? tr("Аудіоідея") : tr("Текст")))}</b><span class="muted small">${new Date(it.time * 1000).toLocaleString()} · ${escapeHtml({ melody: tr("мелодія"), beat: tr("ритм"), idea: tr("ідея") }[it.kind] || "")}</span>
    ${it.text ? `<span class="small ph-text">${escapeHtml(it.text.slice(0, 120))}</span>` : ""}<span class="spacer"></span>
    ${it.file ? `<button class="btn ghost sm" data-play>▶</button><button class="btn primary sm" data-imp data-hint="Додати аудіодоріжкою з позиції курсору; для мелодії — ще й розпізнати ноти">У проєкт</button>` : `<button class="btn primary sm" data-txt data-hint="Додати текст у кінець тексту пісні">У текст пісні</button>`}
    <button class="btn ghost sm" data-del data-hint="Видалити з вхідних">✕</button></div>`).join("") : `<div class="dock-empty">${escapeHtml(tr("Поки порожньо. Запишіть щось на телефоні."))}</div>`;
  $$(".sb-row", box).forEach((row) => {
    const it = PH.items.find((x) => x.id === row.dataset.id);
    if ($("[data-play]", row)) $("[data-play]", row).onclick = () => sbPlay(`/api/phone/file/${encodeURIComponent(it.file)}`);
    if ($("[data-txt]", row)) $("[data-txt]", row).onclick = () => { pushUndo("текст з телефона"); S.mix.lyrics = ((S.mix.lyrics || "").trim() + "\n\n" + it.text).trim(); saveMix(); toast("Текст додано в кінець тексту пісні (Майстерня тексту)."); };
    if ($("[data-imp]", row)) $("[data-imp]", row).onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = "…";
      try {
        const ab = await (await fetch(`/api/phone/file/${encodeURIComponent(it.file)}`)).arrayBuffer();
        const buf = await ensureCtx().ctx.decodeAudioData(ab.slice(0));
        const wav = new Blob([DSP.encodeWav(buf)], { type: "audio/wav" });
        const fd = new FormData();
        fd.append("file", wav, "idea.wav");
        fd.append("start", String(Math.max(0, S.playBeat * period() - S.B.timing.pad)));
        fd.append("name", it.name || tr("Ідея з телефона"));
        fd.append("kind", it.kind === "beat" ? "drums" : it.kind === "melody" ? "vocals" : "other");
        fd.append("transcribe", it.kind === "melody" ? "1" : "0");
        stopPlay();
        await flushMix();
        const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd }), j = await r.json();
        if (!r.ok) throw new Error(j.error || "помилка");
        await careWait(j.job, () => {});
        await reloadProject();
        toast(it.kind === "melody" ? "Ідею додано, ноти розпізнано — їх можна перенести на будь-який інструмент." : "Ідею додано в проєкт.");
      } catch (er) { toast("Не вдалося: " + er.message, true); }
      btn.disabled = false; btn.textContent = tr("У проєкт");
    };
    $("[data-del]", row).onclick = async () => { await api.post(`/api/phone/delete/${encodeURIComponent(it.id)}`, {}); phRefresh(m); };
  });
}
async function openPhone() {
  const m = careModalBox("phone-modal", "Ідеї з телефона", `<p class="muted">Телефон і комп'ютер мають бути в одній Wi-Fi мережі. Увімкніть доступ, відкрийте адресу на телефоні — і записуйте ідеї голосом, вибирайте записи з диктофона або надсилайте рядки тексту. Вони з'являться тут.</p>
    <div class="arr-row"><button class="btn primary" id="ph-on">Увімкнути доступ з телефона</button><button class="btn ghost" id="ph-off">Вимкнути</button></div>
    <div id="ph-url" class="ph-url"></div>
    <h5>Вхідні</h5><div id="ph-list" class="sb-list"></div>
    <p class="muted small">Безпека: доступ працює лише поки увімкнений, адреса містить одноразовий код, приймаються тільки аудіо й текст. Якщо телефон не відкриває сторінку — дозвольте InkBeat у брандмауері Windows для приватних мереж.</p>`);
  m.querySelector(".modal-card").style.width = "min(820px,96vw)";
  const showUrl = (r) => { $("#ph-url", m).innerHTML = r && r.url ? `<span class="muted small">Відкрийте на телефоні:</span><b>${escapeHtml(r.url)}</b><span class="muted small">Код доступу: ${escapeHtml(r.token)}</span>` : `<span class="muted small">Доступ вимкнено.</span>`; };
  $("#ph-on", m).onclick = async () => { try { const r = await api.post("/api/phone/start", {}); PH.url = r.url; showUrl(r); } catch (e) { toast("Не вдалося: " + e.message, true); } };
  $("#ph-off", m).onclick = async () => { await api.post("/api/phone/stop", {}); PH.url = ""; showUrl(null); };
  showUrl(PH.url ? { url: PH.url, token: PH.url.split("k=")[1] } : null);
  await phRefresh(m);
  clearInterval(PH.poll);
  PH.poll = setInterval(() => { if (m.hidden) { clearInterval(PH.poll); return; } phRefresh(m); }, 3000);
}
setInterval(async () => {
  if (!PH.url) return;
  const r = await api.get("/api/phone/inbox").catch(() => null);
  if (!r) return;
  for (const it of r.items || []) if (!PH.seen.has(it.id)) { if (PH.seen.size) toast(`📱 ${tr("Нова ідея з телефона")}: ${it.name || it.kind}`); PH.seen.add(it.id); }
}, 5000);
(function dailyUI() {
  const edit = MENUS["Правка"];
  MENUS["Правка"] = () => edit().concat([null, ["Кроки змін (Ctrl+H)…", needProject(openHistory)]]);
  const file = MENUS["Файл"];
  MENUS["Файл"] = () => { const a = file(); const i = a.findIndex((x) => x && /Вийти/.test(x[0])); const add = [["Зберегти як мій шаблон…", needProject(saveAsTemplate)], ["Ідеї з телефона…", openPhone]]; if (i > 0) a.splice(i, 0, ...add, null); else a.push(...add); return a; };
})();
