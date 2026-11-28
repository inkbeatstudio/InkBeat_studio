"use strict";
const VSTS = { list: [], loaded: false, available: true, folders: [], defaults: [] };
async function vstLoad() {
  try {
    const j = await api.get("/api/vst");
    VSTS.list = j.plugins || [];
    VSTS.available = j.available;
    VSTS.folders = j.folders || [];
    VSTS.defaults = j.default || [];
    VSTS.loaded = true;
  } catch (e) {
  }
  return VSTS;
}
vstLoad();
const vstKey = (p) => `${p.path}::${p.name || ""}`;
const vstFx = () => VSTS.list.filter((p) => !p.error && !p.instrument);
const vstInst = () => VSTS.list.filter((p) => !p.error && p.instrument);
function vstByKey(k) {
  return VSTS.list.find((p) => vstKey(p) === k);
}
async function vstWait(jid, onProg) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 600));
    const j = await api.get(`/api/process/${jid}`);
    if (onProg) onProg(j.progress || 0);
    if (j.status !== "running") {
      if (j.status !== "done") throw new Error(j.error || "помилка");
      return j.result;
    }
  }
}
async function vstEdit(key, state) {
  const p = vstByKey(key);
  if (!p) throw new Error("Виберіть плагін.");
  toast(`Відкриваю вікно «${p.name}». Налаштуйте звук і закрийте вікно плагіна — налаштування збережуться.`);
  const r = await api.post("/api/vst/edit", { path: p.path, name: p.name || null, state: state || null });
  const res = await vstWait(r.job);
  return res.state;
}
async function openVstManager() {
  await vstLoad();
  const modal = $("#vst-modal"), box = $("#vst-body");
  const fx = vstFx(), inst = vstInst(), bad = VSTS.list.filter((p) => p.error);
  const row = (p) => `<div class="lib-row"><b>${escapeHtml(p.name)}</b><span class="muted small">${escapeHtml(p.vendor || "")}</span><span class="tag">${p.instrument ? "інструмент" : "ефект"}</span></div>`;
  box.innerHTML = !VSTS.available ? `<p class="warn">Модуль VST ще не встановлено. Оновіть програму з архіву або запустіть інсталятор InkBeat-Setup ще раз (проєкти залишаться).</p>` : `
    <p class="muted">InkBeat працює з плагінами формату <b>VST3</b>: ефекти (FabFilter, Waves, Valhalla, iZotope…) і інструменти (Serum, Vital, Kontakt, Spitfire…). Старі плагіни лише у форматі VST2 (.dll) не підтримуються, але більшість виробників ставлять VST3 разом із VST2.</p>
    <div class="vst-top"><button class="btn primary sm" id="vst-scan">Знайти плагіни</button><button class="btn ghost sm" id="vst-rescan" data-hint="Перевірити всі плагіни заново, навіть знайомі">Пересканувати все</button><button class="btn ghost sm" id="vst-add">Додати папку…</button><span class="muted small" id="vst-st">${VSTS.list.length ? `Знайдено: ${fx.length} ефектів, ${inst.length} інструментів` : "Ще не шукали"}</span></div>
    <div class="pbar" id="vst-pb" hidden><div id="vst-bar"></div></div>
    <div class="muted small">Папки пошуку: ${VSTS.defaults.concat(VSTS.folders).map((f) => `<span class="kbd">${escapeHtml(f)}</span>${VSTS.folders.includes(f) ? ` <button class="link" data-rmf="${escapeHtml(f)}">прибрати</button>` : ""}`).join(" ")}</div>
    <div class="vst-cols"><div><h4 class="br-cat">Ефекти (${fx.length})</h4><div class="lib-list">${fx.map(row).join("") || '<div class="empty small">Немає</div>'}</div></div>
    <div><h4 class="br-cat">Інструменти (${inst.length})</h4><div class="lib-list">${inst.map(row).join("") || '<div class="empty small">Немає</div>'}</div></div></div>
    ${bad.length ? `<details class="muted small"><summary>Не вдалося завантажити: ${bad.length}</summary>${bad.map((p) => `<div>${escapeHtml(p.name)} — ${escapeHtml(p.error)}</div>`).join("")}</details>` : ""}
    <p class="muted small">Як користуватися: <b>ефект</b> — вкладка «Обробка звуку» → «VST-плагін»; <b>інструмент</b> — вкладка «Інструмент (MIDI)» → «VST-інструмент».</p>`;
  const scan = async (force) => {
    $("#vst-pb").hidden = false;
    $("#vst-st").textContent = "Шукаю й перевіряю плагіни… Кожен відкривається окремо, тож перший раз це може зайняти кілька хвилин.";
    try {
      const r = await api.post("/api/vst/scan", { force });
      await vstWait(r.job, (p) => $("#vst-bar").style.width = p * 100 + "%");
      toast("Пошук плагінів завершено.");
    } catch (e) {
      toast("Помилка пошуку: " + e.message, true);
    }
    openVstManager();
  };
  if ($("#vst-scan")) {
    $("#vst-scan").onclick = () => scan(false);
    $("#vst-rescan").onclick = () => scan(true);
    $("#vst-add").onclick = async () => {
      let f = null;
      if (DESK.on) {
        const p = await DESK.api.open_folder();
        f = p && p[0];
      } else f = (prompt("Шлях до папки з VST3-плагінами:", "C:\\\\Program Files\\\\Common Files\\\\VST3") || "").trim();
      if (!f) return;
      try {
        await api.post("/api/vst/folders", { folder: f });
        scan(false);
      } catch (e) {
        toast(e.message, true);
      }
    };
    $$("[data-rmf]", box).forEach((b) => b.onclick = async () => {
      await api.post("/api/vst/folders", { folder: b.dataset.rmf, remove: true });
      openVstManager();
    });
  }
  modal.hidden = false;
}
PROC.vst = {
  name: "VST-плагін",
  icon: "⧉",
  desc: "Обробити запис будь-яким вашим VST3-ефектом (FabFilter, Waves, Valhalla, iZotope…). Виберіть плагін, натисніть «Вікно плагіна», налаштуйте звук і закрийте вікно — далі прослухайте фрагмент і застосуйте.",
  params: () => [{ k: "plugin", label: "Плагін", options: [["", vstFx().length ? "— виберіть —" : "— немає (Інструменти → VST-плагіни) —"]].concat(vstFx().map((p) => [vstKey(p), `${p.name}${p.vendor ? " · " + p.vendor : ""}`])) }, { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Скільки обробленого звуку (паралельна обробка)" }],
  defaults: () => window.__vstP = { plugin: S.lastVst || "", mix: 1, state: null, stateKey: null },
  presets: {}
};
const _openProcessV = openProcess;
openProcess = function(op, opts) {
  _openProcessV(op, opts);
  if (op !== "vst") return;
  const ctls = $("#proc-ctls");
  if (!ctls) return;
  if (!vstFx().length) {
    ctls.insertAdjacentHTML("beforebegin", `<p class="warn">Плагіни ще не знайдено. <button class="link" id="vst-find">Знайти VST-плагіни</button></p>`);
    $("#vst-find").onclick = () => {
      $("#proc-modal").hidden = true;
      openVstManager();
    };
    return;
  }
  const btn = document.createElement("button");
  btn.className = "btn ghost";
  btn.id = "vst-open-ed";
  btn.textContent = "Вікно плагіна…";
  btn.dataset.hint = "Відкрити рідне вікно плагіна: крутіть ручки, вибирайте пресети, потім закрийте вікно";
  ctls.after(btn);
  const st = document.createElement("span");
  st.className = "muted small";
  st.id = "vst-ed-st";
  btn.after(st);
  const P = window.__vstP;
  const sel = ctls.querySelector("select");
  if (sel) sel.addEventListener("change", () => {
    if (P.stateKey !== sel.value) {
      P.state = null;
      st.textContent = "";
    }
    S.lastVst = sel.value;
  });
  btn.onclick = async () => {
    const key = sel ? sel.value : "";
    if (!key) return toast("Виберіть плагін.", true);
    btn.disabled = true;
    st.textContent = " Вікно плагіна відкрито — після налаштування закрийте його.";
    try {
      const state = await vstEdit(key, P.stateKey === key ? P.state : null);
      P.state = state;
      P.stateKey = key;
      P.label = (vstByKey(key) || {}).name;
      st.textContent = " Налаштування збережено. Натисніть «Прослухати».";
      sel.dispatchEvent(new Event("change"));
    } catch (e) {
      toast("Плагін: " + e.message, true);
      st.textContent = "";
    }
    btn.disabled = false;
  };
};
const _renderInstTabV = renderInstTab;
renderInstTab = function(el, T) {
  _renderInstTabV(el, T);
  if (!T || !T.t || T.master) return;
  const m = T.m, cur = m.vst || {};
  const box = document.createElement("div");
  box.className = "vst-inst";
  const list = vstInst();
  box.innerHTML = `<h4 class="br-cat">VST-інструмент</h4>
    ${list.length ? `<div class="vst-row"><select id="vi-sel"><option value="">— виберіть інструмент —</option>${list.map((p) => `<option value="${escapeHtml(vstKey(p))}" ${cur.plugin === vstKey(p) ? "selected" : ""}>${escapeHtml(p.name)}${p.vendor ? " · " + escapeHtml(p.vendor) : ""}</option>`).join("")}</select>
      <button class="btn ghost sm" id="vi-ed" data-hint="Відкрити вікно інструмента: вибрати пресет, налаштувати звук">Налаштувати звук…</button>
      <button class="btn primary sm" id="vi-render" data-hint="Зіграти всі ноти цієї доріжки вибраним VST-інструментом і додати результат новою аудіодоріжкою">Записати партію</button></div>
      <p class="muted small" id="vi-st">${cur.state ? "Звук налаштовано." : "Виберіть інструмент і налаштуйте звук у його вікні."} Ноти доріжки зіграє ваш інструмент (Serum, Vital, Kontakt…), а результат з'явиться новою аудіодоріжкою.</p>` : `<p class="muted small">VST-інструментів не знайдено. <button class="link" id="vi-find">Знайти VST-плагіни</button></p>`}`;
  el.appendChild(box);
  if (!list.length) {
    $("#vi-find", box).onclick = openVstManager;
    return;
  }
  $("#vi-sel", box).onchange = (e) => {
    m.vst = { plugin: e.target.value, state: null };
    saveMix();
  };
  $("#vi-ed", box).onclick = async () => {
    const key = $("#vi-sel", box).value;
    if (!key) return toast("Виберіть інструмент.", true);
    try {
      $("#vi-st", box).textContent = "Вікно інструмента відкрито — налаштуйте звук і закрийте його.";
      const state = await vstEdit(key, m.vst && m.vst.plugin === key ? m.vst.state : null);
      m.vst = { plugin: key, state };
      saveMix();
      $("#vi-st", box).textContent = "Звук налаштовано. Тепер «Записати партію».";
    } catch (e) {
      toast("Плагін: " + e.message, true);
    }
  };
  $("#vi-render", box).onclick = async () => {
    const key = $("#vi-sel", box).value, p = vstByKey(key);
    if (!p) return toast("Виберіть інструмент.", true);
    const P = period(), pad = S.B.timing.pad;
    const notes = arranged(T.t).map((n) => [n[0] * P - pad, n[1] * P, n[2], n[3]]);
    if (!notes.length) return toast("На доріжці немає нот.", true);
    const btn = $("#vi-render", box);
    btn.disabled = true;
    btn.textContent = "Граю…";
    try {
      await flushMix();
      const r = await api.post(`/api/project/${S.pid}/vstrender`, { path: p.path, name: p.name || null, state: m.vst && m.vst.plugin === key ? m.vst.state : null, notes, duration: arrEnd() * P - pad + 3, track_name: `${p.name} · ${T.t.name}` });
      await vstWait(r.job, (f) => btn.textContent = `Граю… ${Math.round(f * 100)}%`);
      m.mute = true;
      await flushMix();
      await reloadProject();
      toast(`Партію зіграно інструментом «${p.name}» — нова доріжка внизу. MIDI-доріжку вимкнено (M), щоб не дублювалась.`);
    } catch (e) {
      toast("Не вдалося: " + e.message, true);
      btn.disabled = false;
      btn.textContent = "Записати партію";
    }
  };
};
(function vstMenus() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["VST-плагіни…", openVstManager]]);
})();
const VST_FREE = [
  ["Vital", "Синтезатор з хвильовими таблицями: сучасні баси, ліди й пади", "https://vital.audio"],
  ["Surge XT", "Гібридний синтезатор з тисячами пресетів і власними ефектами", "https://surge-synthesizer.github.io"],
  ["TAL-NoiseMaker", "Аналоговий синт у стилі 80-х: прості, теплі звуки", "https://tal-software.com/products/tal-noisemaker"],
  ["Dexed", "FM-синтезатор у стилі Yamaha DX7: електропіаніно, дзвони, баси", "https://asb2m10.github.io/dexed/"],
  ["OB-Xd", "Віртуальний аналоговий синт у стилі Oberheim", "https://www.discodsp.com/obxd/"],
  ["Odin 2", "Напівмодульний синтезатор з великою бібліотекою пресетів", "https://thewavewarden.com/odin2"],
];
const _openVstManagerF = openVstManager;
openVstManager = async function() {
  await _openVstManagerF();
  const box = $("#vst-body");
  if (!box || $("#vst-free", box)) return;
  const have = (n) => VSTS.list.some((p) => !p.error && (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(n.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const j = await api.get("/api/vst").catch(() => ({}));
  const d = document.createElement("div");
  d.id = "vst-free";
  d.className = "vst-free";
  d.innerHTML = `${j.vst2 ? `<p class="warn small">${tr("Знайдено")} ${j.vst2} ${tr("файлів старого формату VST2. InkBeat працює з VST3 — більшість виробників дають безкоштовно й VST3-версію: перевстановіть плагін і поставте галочку VST3.")}</p>` : ""}
    <h4 class="br-cat">${tr("Популярні безкоштовні синтезатори у форматі VST3")}</h4>
    <div class="vst-free-list">${VST_FREE.map(([n, dsc, url]) => `<div class="lib-row"><b>${escapeHtml(n)}</b><span class="muted small">${escapeHtml(tr(dsc))}</span><span class="spacer"></span>${have(n) ? `<span class="ok small">${tr("встановлено")}</span>` : `<a class="btn ghost sm" href="${url}" target="_blank" rel="noopener" data-hint="${escapeHtml(tr("Відкрити офіційний сайт. Після встановлення натисніть «Знайти плагіни»"))}">${tr("Завантажити")}</a>`}</div>`).join("")}</div>
    <p class="muted small">${tr("Порада: під час встановлення залишайте стандартну папку VST3 — тоді InkBeat знайде плагін сам. Якщо плагін зависає чи падає, програма продовжить працювати: кожен плагін запускається окремо.")}</p>`;
  box.appendChild(d);
};
