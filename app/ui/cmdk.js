"use strict";
const CK = { el: null, items: [], shown: [], idx: 0, rec: null };
if (!UIP.keys) UIP.keys = {};
function ckFlatten(prefix, items, out) {
  for (const it of items || []) {
    if (!it || !it[0] || typeof it[1] !== "function") continue;
    const label = it[0].replace(/\s{2,}\(.*\)$/, "").replace(/…$/, "").trim();
    out.push({ id: "m:" + prefix + "›" + label, label, group: prefix, run: it[1] });
  }
}
function ckCollect() {
  const out = [];
  for (const k of Object.keys(MENUS)) {
    try { ckFlatten(k, MENUS[k](), out); } catch (e) {}
  }
  const proj = S.B && S.view === "project";
  $$("#view-project button[id^='t-'], #view-project #export-btn, #view-project #mode-new").forEach((b) => {
    if (!proj || b.closest("[hidden]")) return;
    const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
    const hint = (b.dataset.hint || b.title || "").split(/[.:(—]/)[0].trim();
    const label = txt && txt.length > 1 ? txt : hint;
    if (!label) return;
    out.push({ id: "b:" + b.id, label, group: "Панель", desc: b.dataset.hint || b.title || "", run: () => b.click() });
  });
  if (proj) {
    for (const [k, d] of Object.entries(PROC)) out.push({ id: "p:" + k, label: d.name, group: "Обробка звуку", desc: d.desc, run: () => {
      const T = dockTarget();
      if (!T || !T.t || !T.t.has_audio) return toast("Спершу виберіть доріжку із записом (клацніть на її назву ліворуч).", true);
      openProcess(k);
    } });
    for (const t of tracksAll()) out.push({ id: "t:" + t.id, label: t.name, group: "Перейти до доріжки", run: () => selectTrack(t.id), noKey: true });
    for (const k of Object.keys(TABS)) out.push({ id: "w:" + k, label: "Вкладка «" + TABS[k][0] + "» у нижній панелі", group: "Панель каналу", run: () => {
      const p = occupied(k);
      if (p) return wmFocus(p);
      S.dockOpen = true;
      S.dockTab = k;
      renderDock();
      layout();
    } });
    out.push({ id: "x:hum", label: "Наспівав → ноти (з вибраної доріжки)", group: "Створити", run: () => audioToNotes(dockTarget(), "melody") });
    out.push({ id: "x:bb", label: "Бітбокс → барабани (з вибраної доріжки)", group: "Створити", run: () => audioToNotes(dockTarget(), "drums") });
    if (typeof addMidiTrack === "function") for (const [k, d] of Object.entries(NEW_TRACKS)) out.push({ id: "n:" + k, label: "Нова MIDI-доріжка: " + d.name, group: "Створити", run: () => addMidiTrack(k) });
    if (typeof openStepSeq === "function") out.push({ id: "x:seq", label: "Покроковий секвенсор барабанів", group: "Створити", run: () => openStepSeq() });
  }
  out.push({ id: "x:keys", label: "Гарячі клавіші: переглянути й налаштувати", group: "Довідка", run: () => openKeysEditor() });
  out.push({ id: "x:help", label: "Довідка", group: "Довідка", run: () => $("#help-btn").click() });
  const seen = new Set(), seenL = new Set();
  return out.filter((x) => {
    const l = ckNorm(x.label);
    if (seen.has(x.id) || (x.id.startsWith("b:") && seenL.has(l))) return false;
    seen.add(x.id);
    seenL.add(l);
    return true;
  });
}
function ckNorm(s) {
  return (s || "").toLowerCase().replace(/[ʼ'’`]/g, "").replace(/ё/g, "е");
}
function ckScore(it, q) {
  if (!q) return 1;
  const hay = ckNorm(it.label + " " + it.group + " " + (it.desc || ""));
  const lab = ckNorm(it.label);
  let s = 0;
  for (const w of q.split(/\s+/).filter(Boolean)) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    s += lab.startsWith(w) ? 6 : lab.includes(" " + w) ? 4 : lab.includes(w) ? 3 : 1;
  }
  return s;
}
function comboOf(e) {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return "";
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (k === " ") k = "Space";
  parts.push(k);
  return parts.join("+");
}
const RESERVED = new Set(["Ctrl+Z", "Ctrl+Y", "Ctrl+Shift+Z", "Ctrl+C", "Ctrl+V", "Ctrl+D", "Ctrl+A", "Ctrl+K", "Space", "Delete", "Backspace", "Escape", "F1", "F9", "F10", "F11", "Ctrl+R", "Ctrl+Shift+I"]);
function keyFor(id) {
  return Object.keys(UIP.keys).find((c) => UIP.keys[c] === id) || "";
}
function openCmdk(q = "") {
  if (!CK.el) {
    CK.el = document.createElement("div");
    CK.el.className = "cmdk-wrap";
    CK.el.innerHTML = `<div class="cmdk" role="dialog"><div class="cmdk-in"><span>⌕</span><input id="ck-q" placeholder="Що зробити? Наприклад: «ревер», «шум», «мікшер», «експорт», «нова доріжка»…" autocomplete="off"><span class="kbd">Esc</span></div>
      <div class="cmdk-list" id="ck-list"></div>
      <div class="cmdk-foot muted small">↑ ↓ — вибір · Enter — виконати · ⌨ — призначити свою клавішу · Ctrl+K — відкрити цей пошук будь-коли</div></div>`;
    document.body.appendChild(CK.el);
    CK.el.addEventListener("mousedown", (e) => { if (e.target === CK.el) closeCmdk(); });
    const inp = CK.el.querySelector("#ck-q");
    inp.addEventListener("input", () => { CK.idx = 0; ckRender(); });
    inp.addEventListener("keydown", (e) => {
      if (CK.rec) return;
      if (e.key === "ArrowDown") { e.preventDefault(); CK.idx = Math.min(CK.shown.length - 1, CK.idx + 1); ckRender(true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); CK.idx = Math.max(0, CK.idx - 1); ckRender(true); }
      else if (e.key === "Enter") { e.preventDefault(); ckRun(CK.shown[CK.idx]); }
      else if (e.key === "Escape") { e.preventDefault(); closeCmdk(); }
    });
  }
  CK.items = ckCollect();
  CK.idx = 0;
  CK.el.hidden = false;
  const inp = CK.el.querySelector("#ck-q");
  inp.value = q;
  ckRender();
  setTimeout(() => inp.focus(), 0);
}
function closeCmdk() {
  if (CK.el) CK.el.hidden = true;
  CK.rec = null;
}
function ckRun(it) {
  if (!it) return;
  closeCmdk();
  UIP.ckRecent = [it.id].concat((UIP.ckRecent || []).filter((x) => x !== it.id)).slice(0, 8);
  saveUI();
  try { it.run(); } catch (e) { toast("Не вдалося виконати: " + e.message, true); }
}
function ckRender(scrollOnly) {
  const q = ckNorm(CK.el.querySelector("#ck-q").value.trim());
  const list = CK.el.querySelector("#ck-list");
  if (!scrollOnly) {
    let arr = CK.items.map((it) => [it, ckScore(it, q)]).filter((x) => x[1] > 0);
    if (!q) {
      const rec = UIP.ckRecent || [];
      arr.sort((a, b) => ((rec.indexOf(a[0].id) + 1 || 99) - (rec.indexOf(b[0].id) + 1 || 99)));
    } else arr.sort((a, b) => b[1] - a[1]);
    CK.shown = arr.slice(0, 60).map((x) => x[0]);
    const rec = new Set(UIP.ckRecent || []);
    list.innerHTML = CK.shown.length ? CK.shown.map((it, i) => `<div class="ck-row" data-i="${i}"><span class="ck-g">${escapeHtml(!q && rec.has(it.id) ? "Нещодавні" : it.group)}</span><b>${escapeHtml(it.label)}</b>${it.desc ? `<span class="ck-d">${escapeHtml(it.desc.split(".")[0])}</span>` : ""}<span class="sp"></span>${keyFor(it.id) ? `<span class="kbd">${escapeHtml(keyFor(it.id))}</span>` : ""}${it.noKey ? "" : `<button class="ck-k" data-k="${i}" title="Призначити свою комбінацію клавіш">⌨</button>`}</div>`).join("") : `<div class="dock-empty">Нічого не знайдено. Спробуйте інше слово: «ефект», «вокал», «ноти», «відео», «експорт».</div>`;
    $$(".ck-row", list).forEach((r) => {
      r.onmousemove = () => { if (CK.idx !== +r.dataset.i) { CK.idx = +r.dataset.i; ckRender(true); } };
      r.onclick = (e) => {
        const kb = e.target.closest("[data-k]");
        if (kb) return ckRecord(CK.shown[+kb.dataset.k], kb);
        ckRun(CK.shown[+r.dataset.i]);
      };
    });
  }
  $$(".ck-row", list).forEach((r) => r.classList.toggle("on", +r.dataset.i === CK.idx));
  const cur = list.querySelector(".ck-row.on");
  if (cur) cur.scrollIntoView({ block: "nearest" });
}
function ckRecord(it, btn) {
  CK.rec = it;
  btn.textContent = "натисніть клавіші…";
  btn.classList.add("rec");
  const h = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return done();
    if (e.key === "Backspace" || e.key === "Delete") {
      const c = keyFor(it.id);
      if (c) delete UIP.keys[c];
      saveUI();
      toast(`Клавішу для «${it.label}» прибрано.`);
      return done();
    }
    const c = comboOf(e);
    if (!c) return;
    if (RESERVED.has(c)) { toast(`${c} уже зайнята стандартною дією програми. Виберіть іншу комбінацію.`, true); return; }
    if (!/^(Ctrl|Alt|F\d)/.test(c) && !/^F\d+$/.test(c)) { toast("Додайте Ctrl або Alt (наприклад, Ctrl+Shift+M), або виберіть F2–F8, F12 — щоб клавіша не заважала друку й піаніно.", true); return; }
    const old = keyFor(it.id);
    if (old) delete UIP.keys[old];
    const prev = UIP.keys[c];
    UIP.keys[c] = it.id;
    saveUI();
    toast(`${c} → «${it.label}»${prev ? " (стара прив'язка цієї клавіші замінена)" : ""}.`);
    done();
  };
  const done = () => {
    removeEventListener("keydown", h, true);
    CK.rec = null;
    ckRender();
    CK.el.querySelector("#ck-q").focus();
  };
  addEventListener("keydown", h, true);
}
function openKeysEditor() {
  let m = document.getElementById("keys-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "keys-modal";
    document.body.appendChild(m);
  }
  const all = ckCollect();
  const mine = Object.entries(UIP.keys).map(([c, id]) => [c, (all.find((x) => x.id === id) || { label: id.replace(/^.:/, "") }).label]);
  const std = [["Пробіл", "Відтворення / пауза"], ["Ctrl+Z", "Скасувати"], ["Ctrl+Y / Ctrl+Shift+Z", "Повторити"], ["Ctrl+C / Ctrl+V", "Копіювати / вставити кліпи"], ["Ctrl+D", "Дублювати кліпи"], ["Ctrl+A", "Виділити все"], ["Delete", "Видалити"], ["S", "Розрізати по курсору"], ["M", "Mute вибраної доріжки"], ["Esc", "Зняти виділення"], ["Ctrl+K", "Пошук будь-якої дії"], ["Ctrl+,", "Налаштування"], ["F1", "Довідка"], ["F9", "Мікшер і ефекти"], ["F10", "Сховати / показати окремі вікна"], ["F11", "На весь екран"], ["Ctrl + / Ctrl − / Ctrl 0", "Масштаб інтерфейсу"]];
  m.innerHTML = `<div class="modal-card" style="width:min(640px,94vw)"><div class="modal-head"><h3>Гарячі клавіші</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body"><p class="muted">Стандартні клавіші працюють за будь-якої розкладки (українська, англійська). Свою клавішу можна призначити на будь-яку дію: відкрийте пошук <span class="kbd">Ctrl+K</span>, знайдіть дію й натисніть ⌨ праворуч.</p>
    <h5 class="kh">Стандартні</h5><div class="keys-grid">${std.map(([k, l]) => `<span class="kbd">${k}</span><span>${l}</span>`).join("")}</div>
    <h5 class="kh">Мої</h5>${mine.length ? `<div class="keys-grid">${mine.map(([k, l]) => `<span class="kbd">${escapeHtml(k)}</span><span>${escapeHtml(l)} <button class="link" data-del="${escapeHtml(k)}">прибрати</button></span>`).join("")}</div>` : `<p class="muted small">Поки що немає. Наприклад: Ctrl+Shift+N — «Нова MIDI-доріжка: Клавішні», F2 — «Шум», F3 — «Окреме вікно: Мікшер».</p>`}
    <div class="modal-actions"><button class="btn ghost" id="keys-add">Призначити нову…</button>${mine.length ? `<button class="btn ghost" id="keys-reset">Прибрати всі мої</button>` : ""}<button class="btn primary" data-close>Готово</button></div></div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => m.hidden = true);
  $$("[data-del]", m).forEach((b) => b.onclick = () => { delete UIP.keys[b.dataset.del]; saveUI(); openKeysEditor(); });
  $("#keys-add", m).onclick = () => { m.hidden = true; openCmdk(); };
  const rs = $("#keys-reset", m);
  if (rs) rs.onclick = () => { UIP.keys = {}; saveUI(); openKeysEditor(); };
  m.hidden = false;
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyK" || (e.shiftKey && e.code === "KeyP"))) {
    e.preventDefault();
    if (CK.el && !CK.el.hidden) closeCmdk();
    else openCmdk();
    return;
  }
  if (CK.rec || (CK.el && !CK.el.hidden)) return;
  if (typeof typingIn === "function" && typingIn(e.target)) return;
  const c = comboOf(e);
  const id = c && UIP.keys[c];
  if (!id) return;
  const it = ckCollect().find((x) => x.id === id);
  if (!it) return toast(`Дія для ${c} зараз недоступна (можливо, спершу треба відкрити проєкт).`, true);
  e.preventDefault();
  e.stopPropagation();
  try { it.run(); } catch (err) { toast(err.message, true); }
}, true);
(function ckButton() {
  const b = document.createElement("button");
  b.className = "ck-open";
  b.innerHTML = `<span>⌕</span> Пошук дій <span class="kbd">Ctrl K</span>`;
  b.dataset.hint = "Знайдіть будь-яку дію програми за назвою: «ревер», «шум», «нова доріжка», «мікшер у вікні»… Тут же можна призначити свою клавішу";
  b.onclick = () => openCmdk();
  const mb = $(".menubar");
  if (mb) mb.after(b);
  const help = MENUS["Довідка"];
  MENUS["Довідка"] = () => [["Пошук дій  (Ctrl+K)", () => openCmdk()], ["Гарячі клавіші…", () => openKeysEditor()]].concat(help());
})();
