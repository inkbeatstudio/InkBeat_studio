"use strict";
const ML = { access: null, learn: null, map: null, timers: new Map(), last: "" };
if (!UIP.midimap) UIP.midimap = {};
ML.map = UIP.midimap;
const ML_ACTIONS = {
  play: ["Відтворення / пауза", () => $("#t-play").click()],
  start: ["На початок", () => $("#t-start").click()],
  rec: ["Запис", () => $("#t-rec").click()],
  metro: ["Метроном", () => $("#t-metro").click()],
  undo: ["Скасувати", () => undo()],
  redo: ["Повторити", () => redo()],
  split: ["Розрізати по курсору", () => splitAtPlayhead()],
  next: ["Наступна доріжка", () => mlStepTrack(1)],
  prev: ["Попередня доріжка", () => mlStepTrack(-1)],
  mute: ["Mute вибраної доріжки", () => mlToggle("mute")],
  solo: ["Solo вибраної доріжки", () => mlToggle("solo")],
  mixer: ["Мікшер і ефекти", () => $("#t-dock").click()]
};
function mlStepTrack(d) {
  const ts = tracksAll();
  if (!ts.length) return;
  const i = Math.max(0, ts.findIndex((t) => t.id === S.sel));
  selectTrack(ts[(i + d + ts.length) % ts.length].id);
}
function mlToggle(k) {
  if (!S.sel) return;
  const m = mt(S.sel);
  pushUndo(k);
  m[k] = !m[k];
  afterEdit();
  applyGains();
  renderHeads();
  renderDock();
}
async function mlInit() {
  if (ML.access || !navigator.requestMIDIAccess) return !!ML.access;
  try {
    ML.access = await navigator.requestMIDIAccess();
  } catch (e) {
    return false;
  }
  const bind = () => {
    for (const inp of ML.access.inputs.values()) {
      if (inp._mlBound) continue;
      inp._mlBound = true;
      inp.addEventListener("midimessage", mlMsg);
    }
  };
  ML.access.addEventListener("statechange", bind);
  bind();
  return true;
}
function mlDesc(el) {
  if (el.id) return { anc: "#" + CSS.escape(el.id), idx: -1 };
  let a = el.parentElement;
  while (a && a !== document.body) {
    if (a.id || [...a.attributes].some((x) => x.name.startsWith("data-") && x.name !== "data-hint" && x.value)) break;
    a = a.parentElement;
  }
  if (!a || a === document.body) return null;
  let sel = a.id ? "#" + CSS.escape(a.id) : "";
  if (!sel) {
    const at = [...a.attributes].find((x) => x.name.startsWith("data-") && x.name !== "data-hint" && x.value);
    sel = `[${at.name}="${CSS.escape(at.value)}"]`;
  }
  const list = [...a.querySelectorAll("input[type=range]")];
  return { anc: sel, idx: list.indexOf(el) };
}
function mlResolve(d) {
  if (d.action) return null;
  const roots = [...document.querySelectorAll(d.anc)].filter((r) => r.offsetParent !== null || r.getClientRects().length);
  for (const r of roots) {
    if (d.idx < 0) return r;
    const el = r.querySelectorAll("input[type=range]")[d.idx];
    if (el) return el;
  }
  return null;
}
function mlLabel(el) {
  const row = el.closest("label,.row,.knob,.kn,.prm,.fx-p,.param,.mx-ch,.dk-strip,.fader") || el.parentElement;
  const t = (el.dataset.hint || el.title || (row && row.textContent) || "").replace(/\s+/g, " ").trim();
  return t.split(/[.(:—]/)[0].slice(0, 48) || "повзунок";
}
function mlMsg(e) {
  const [st, d1, d2] = e.data;
  const cmd = st & 240, ch = (st & 15) + 1;
  let key = null, val = 0, press = false;
  if (cmd === 176) { key = `cc:${ch}:${d1}`; val = d2 / 127; press = d2 > 63; }
  else if (cmd === 144 && d2 > 0) { key = `n:${ch}:${d1}`; val = 1; press = true; }
  else if (cmd === 224) { key = `pb:${ch}`; val = (d1 + d2 * 128) / 16383; }
  if (!key) return;
  if (ML.learn) {
    if (key.startsWith("n:") && ML.learn.kind === "range") return;
    const L = ML.learn;
    ML.learn = null;
    for (const k of Object.keys(ML.map)) if (JSON.stringify(ML.map[k]) === JSON.stringify(L.desc)) delete ML.map[k];
    ML.map[key] = L.desc;
    saveUI();
    document.body.classList.remove("ml-learning");
    $$(".ml-target").forEach((x) => x.classList.remove("ml-target"));
    toast(`Прив'язано: ${mlKeyName(key)} → «${L.desc.label}». Відв'язати — правий клік по елементу або «Інструменти» → «MIDI-контролер».`);
    if (ML.onLearn) ML.onLearn();
    return;
  }
  const d = ML.map[key];
  if (!d) return;
  if (d.action) {
    if (!press) return;
    const now = performance.now();
    if (ML.last === key && now - (ML.lastT || 0) < 120) return;
    ML.last = key;
    ML.lastT = now;
    const a = ML_ACTIONS[d.action];
    if (a && S.view === "project") try { a[1](); } catch (err) {}
    return;
  }
  const el = mlResolve(d);
  if (!el) return;
  const min = +el.min || 0, max = el.max === "" ? 100 : +el.max, step = +el.step || 0;
  let v = min + val * (max - min);
  if (step) v = Math.round(v / step) * step;
  if (+el.value === v) return;
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  clearTimeout(ML.timers.get(el));
  ML.timers.set(el, setTimeout(() => el.dispatchEvent(new Event("change", { bubbles: true })), 250));
}
function mlKeyName(k) {
  const [t, ch, n] = k.split(":");
  return t === "cc" ? `ручка CC${n} (канал ${ch})` : t === "n" ? `пед/клавіша ${NOTE_NAMES ? NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1) : n} (канал ${ch})` : `колесо pitch bend (канал ${ch})`;
}
async function mlStartLearn(desc, kind, el) {
  if (!(await mlInit())) return toast("MIDI-контролер недоступний: підключіть його до комп'ютера й перезапустіть InkBeat.", true);
  if (!ML.access.inputs.size) toast("MIDI-пристроїв не знайдено. Підключіть контролер — прив'язка спрацює, щойно він з'явиться.", true);
  ML.learn = { desc, kind };
  document.body.classList.add("ml-learning");
  if (el) el.classList.add("ml-target");
  toast(kind === "range" ? `Покрутіть ручку чи фейдер на контролері — він керуватиме «${desc.label}». Esc — скасувати.` : `Натисніть кнопку чи пед на контролері для дії «${desc.label}». Esc — скасувати.`);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ML.learn) {
    ML.learn = null;
    document.body.classList.remove("ml-learning");
    $$(".ml-target").forEach((x) => x.classList.remove("ml-target"));
    toast("Прив'язку скасовано.");
  }
});
document.addEventListener("contextmenu", (e) => {
  const el = e.target.closest && e.target.closest("input[type=range]");
  if (!el || S.view !== "project") return;
  const desc = mlDesc(el);
  if (!desc) return;
  e.preventDefault();
  desc.label = mlLabel(el);
  const bound = Object.keys(ML.map).find((k) => ML.map[k].anc === desc.anc && ML.map[k].idx === desc.idx);
  const items = [[bound ? `Перепризначити MIDI (зараз: ${mlKeyName(bound)})` : "Керувати з MIDI-контролера…", () => mlStartLearn(desc, "range", el)]];
  if (bound) items.push(["Відв'язати від контролера", () => { delete ML.map[bound]; saveUI(); toast("Відв'язано."); }]);
  items.push(null, ["Усі прив'язки контролера…", openMidiMap]);
  menu(e, items);
}, true);
function openMidiMap() {
  let m = document.getElementById("midimap-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "midimap-modal";
    document.body.appendChild(m);
  }
  const rows = Object.entries(ML.map);
  const devs = ML.access ? [...ML.access.inputs.values()].map((i) => i.name) : [];
  m.innerHTML = `<div class="modal-card" style="width:min(680px,94vw)"><div class="modal-head"><h3>MIDI-контролер</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body">
      <p class="muted">Будь-яку ручку, фейдер чи повзунок у програмі можна крутити ручкою контролера: <b>правий клік по повзунку → «Керувати з MIDI-контролера…»</b> → покрутіть ручку. Так само можна призначити кнопки контролера на дії нижче.</p>
      <div class="ml-dev">${ML.access ? (devs.length ? "Підключено: " + devs.map(escapeHtml).join(", ") : "Контролер не знайдено — підключіть його") : `<button class="btn ghost sm" id="ml-conn">Знайти контролер</button>`}</div>
      <h5 class="kh">Кнопки контролера → дії</h5>
      <div class="ml-acts">${Object.entries(ML_ACTIONS).map(([k, a]) => {
        const b = Object.keys(ML.map).find((x) => ML.map[x].action === k);
        return `<div class="ml-act"><span>${escapeHtml(a[0])}</span><span class="muted small">${b ? escapeHtml(mlKeyName(b)) : "—"}</span><button class="btn ghost sm" data-la="${k}">${b ? "Змінити" : "Призначити"}</button>${b ? `<button class="link" data-ua="${escapeHtml(b)}">прибрати</button>` : ""}</div>`;
      }).join("")}</div>
      <h5 class="kh">Ручки й повзунки</h5>
      ${rows.filter(([, d]) => !d.action).length ? `<div class="keys-grid">${rows.filter(([, d]) => !d.action).map(([k, d]) => `<span class="kbd">${escapeHtml(mlKeyName(k))}</span><span>${escapeHtml(d.label || d.anc)} <button class="link" data-ua="${escapeHtml(k)}">прибрати</button></span>`).join("")}</div>` : `<p class="muted small">Поки немає. Порада: прив'яжіть фейдер контролера до гучності вибраної доріжки (повзунок ліворуч у панелі каналу) — тоді, перемикаючи доріжки, ви керуєте гучністю будь-якої з них.</p>`}
      <div class="modal-actions">${rows.length ? `<button class="btn ghost" id="ml-clear">Прибрати всі прив'язки</button>` : ""}<button class="btn primary" data-close>Готово</button></div>
    </div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => { m.hidden = true; ML.onLearn = null; });
  const c = $("#ml-conn", m);
  if (c) c.onclick = async () => { await mlInit(); openMidiMap(); };
  $$("[data-la]", m).forEach((b) => b.onclick = () => {
    ML.onLearn = () => openMidiMap();
    mlStartLearn({ action: b.dataset.la, label: ML_ACTIONS[b.dataset.la][0] }, "action");
    b.textContent = "натисніть на контролері…";
  });
  $$("[data-ua]", m).forEach((b) => b.onclick = () => { delete ML.map[b.dataset.ua]; saveUI(); openMidiMap(); });
  const cl = $("#ml-clear", m);
  if (cl) cl.onclick = () => { for (const k of Object.keys(ML.map)) delete ML.map[k]; saveUI(); openMidiMap(); };
  m.hidden = false;
}
if (Object.keys(ML.map).length) mlInit();
(function mlMenus() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["MIDI-контролер: прив'язки ручок і кнопок…", openMidiMap]]);
})();
