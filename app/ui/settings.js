"use strict";
const SET = { tab: "ui", st: null, sys: null, devs: { out: [], inp: [] }, meter: 0 };
const SET_TABS = [
  ["ui", "Інтерфейс", "M4 5h16v11H4zM9 20h6M12 16v4"],
  ["audio", "Аудіо і затримка", "M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2"],
  ["midi", "MIDI і клавіші", "M3 6h18v12H3zM7 6v7M11 6v7M15 6v7M19 6v7"],
  ["projects", "Проєкти й експорт", "M3 7h7l2 2h9v10H3z"],
  ["sep", "Розбір пісні", "M4 12h3l2-6 3 12 2-6h6"],
  ["sounds", "Звуки і місце на диску", "M4 6h16M4 12h16M4 18h10"],
  ["vst", "VST-плагіни", "M5 4v16M12 4v16M19 4v16M3 9h4M10 15h4M17 7h4"],
  ["updates", "Оновлення", "M12 4v10m-4-4 4 4 4-4M5 19h14"],
  ["reports", "Звіти про помилки", "M12 3 2 20h20zM12 10v4M12 17v.5"],
  ["phone", "Телефон", "M8 3h8v18H8zM11 18h2"],
  ["reset", "Скидання", "M4 12a8 8 0 1 0 3-6.2M4 4v4h4"]
];
function setFmt(n) {
  const [kb, mb, gb] = LANG === "en" ? ["KB", "MB", "GB"] : ["КБ", "МБ", "ГБ"];
  const f = (v, d) => LANG === "en" ? v.toFixed(d) : v.toFixed(d).replace(".", ",");
  if (!n) return `0 ${mb}`;
  if (n < 1048576) return `${Math.max(1, Math.round(n / 1024))} ${kb}`;
  if (n < 1073741824) return `${f(n / 1048576, n < 104857600 ? 1 : 0)} ${mb}`;
  return `${f(n / 1073741824, 1)} ${gb}`;
}
function setRow(title, desc, ctl, topic) {
  return `<div class="set-row"><div class="set-l"><b>${title}${topic ? qhBtn(topic) : ""}</b>${desc ? `<span class="muted small">${desc}</span>` : ""}</div><div class="set-c">${ctl}</div></div>`;
}
function setSeg(id, opts, cur) {
  return `<div class="seg set-seg" id="${id}">${opts.map(([v, l, h]) => `<button data-v="${v}" class="${String(cur) === String(v) ? "active" : ""}"${h ? ` data-hint="${escapeHtml(h)}"` : ""}>${l}</button>`).join("")}</div>`;
}
function setSw(id, on, hint) {
  return `<label class="sw"${hint ? ` data-hint="${escapeHtml(hint)}"` : ""}><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i></label>`;
}
function setSegBind(box, id, fn) {
  $$(`#${id} button`, box).forEach((b) => b.onclick = () => {
    $$(`#${id} button`, box).forEach((x) => x.classList.toggle("active", x === b));
    fn(b.dataset.v);
  });
}
function openSettings(tab) {
  if (tab) SET.tab = tab;
  let m = $("#set-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "set-modal";
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="modal-card set-card"><div class="modal-head"><h3>Налаштування</h3><button class="x" data-k="x">&times;</button></div>
    <div class="set-wrap"><nav class="set-nav">${SET_TABS.map(([k, l, d]) => `<button data-st="${k}" class="${SET.tab === k ? "active" : ""}"><svg viewBox="0 0 24 24" width="16" height="16"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${l}</span></button>`).join("")}</nav>
    <div class="set-pane" id="set-pane"></div></div></div>`;
  m.onclick = (e) => {
    if (e.target === m || e.target.dataset.k === "x") setClose();
  };
  $$("[data-st]", m).forEach((b) => b.onclick = () => {
    SET.tab = b.dataset.st;
    $$("[data-st]", m).forEach((x) => x.classList.toggle("active", x === b));
    setPaint();
  });
  m.hidden = false;
  setPaint();
}
function setClose() {
  const m = $("#set-modal");
  if (m) m.hidden = true;
  cancelAnimationFrame(SET.meter);
}
function setPaint() {
  cancelAnimationFrame(SET.meter);
  const box = $("#set-pane");
  if (!box) return;
  box.scrollTop = 0;
  const f = { ui: setUi, audio: setAudio, midi: setMidi, projects: setProjects, sep: setSep, sounds: setSounds, vst: setVst, updates: setUpdates, reports: setReports, phone: setPhone, reset: setReset }[SET.tab] || setUi;
  f(box);
}
function setHead(title, sub) {
  return `<div class="set-h"><h4>${title}</h4>${sub ? `<p class="muted small">${sub}</p>` : ""}</div>`;
}
function setUi(box) {
  box.innerHTML = setHead("Інтерфейс", "Вигляд програми, мова та підказки. Усе застосовується одразу.")
    + setRow("Мова", "Мова меню, підказок і довідки.", setSeg("su-lang", [["uk", "Українська"], ["en", "English"]], LANG))
    + setRow("Тема", "Кольорова схема всього вікна.", `<div class="look-themes">${Object.entries(THEMES).map(([k, l]) => `<button class="look-theme t-${k} ${UIP.theme === k ? "active" : ""}" data-th="${k}"><i></i>${l}</button>`).join("")}</div>`, "theme")
    + setRow("Колір акценту", "Колір кнопок, курсора відтворення і виділення.", `<div class="look-acc set-acc">${Object.entries(ACCENTS).map(([k, a]) => `<button class="${UIP.accent === k ? "active" : ""}" data-ac="${k}" style="--c:${a[0]}" title="${a[2]}"><i></i>${a[2]}</button>`).join("")}</div>`)
    + setRow("Компактний режим", "Менші відступи — більше доріжок на екрані ноутбука.", setSw("su-compact", UIP.compact))
    + setRow("Рядок підказок унизу", "Наведіть мишку на будь-яку кнопку — унизу з'явиться пояснення, що вона робить.", setSw("su-hints", UIP.hints), "hints")
    + setRow("Кнопки «?» біля функцій", "Маленькі знаки питання біля заголовків вікон і панелей. Натисніть — відкриється докладне пояснення.", setSw("su-qh", UIP.qh !== false), "qh")
    + setRow("Анімації", "Плавні переходи вікон і панелей. Вимкніть на слабкому комп'ютері.", setSw("su-motion", UIP.motion))
    + setRow("Масштаб інтерфейсу", `Збільшити: <span class="kbd">Ctrl +</span>, зменшити: <span class="kbd">Ctrl −</span>, звичайний: <span class="kbd">Ctrl 0</span>.`, `<button class="btn ghost sm" id="su-look">Розкладка панелей…</button>`)
    + setRow("Майстер «З чого почати» на старті", "Показувати вікно з чотирма швидкими сценаріями після запуску програми.", setSw("su-wiz", !UIP.wizDone) + `<button class="btn ghost sm" id="su-wiz-now">Відкрити зараз</button>`, "wizard")
    + setRow("Навчальні підказки", "Підказки, які з'являються один раз при першому знайомстві з функцією. Можна показати їх знову.", `<button class="btn ghost sm" id="su-tips">Показати знову</button>`);
  setSegBind(box, "su-lang", (v) => { if (v !== LANG) setLang(v); });
  $$("[data-th]", box).forEach((b) => b.onclick = () => {
    UIP.theme = b.dataset.th;
    saveUI();
    applyLook();
    setUi(box);
    if (S.B) draw();
  });
  $$("[data-ac]", box).forEach((b) => b.onclick = () => {
    UIP.accent = b.dataset.ac;
    saveUI();
    applyLook();
    setUi(box);
  });
  const sw = (id, key, after) => $(`#${id}`, box).onchange = (e) => {
    UIP[key] = e.target.checked;
    saveUI();
    applyLook();
    if (after) after(e.target.checked);
  };
  sw("su-compact", "compact", () => { if (S.B) setTimeout(() => { layout(); draw(); }, 50); });
  sw("su-hints", "hints");
  sw("su-motion", "motion");
  sw("su-qh", "qh", () => qhApply());
  $("#su-wiz", box).onchange = (e) => {
    UIP.wizDone = !e.target.checked;
    saveUI();
  };
  $("#su-wiz-now", box).onclick = () => {
    setClose();
    openWizard();
  };
  $("#su-look", box).onclick = () => {
    setClose();
    openLookSettings();
  };
  $("#su-tips", box).onclick = () => {
    UIP.wmTipShown = false;
    UIP.crDismissed = [];
    UIP.lessonsDone = {};
    saveUI();
    toast("Навчальні підказки з'являтимуться знову.");
  };
}
async function setDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    SET.devs.out = all.filter((d) => d.kind === "audiooutput");
    SET.devs.inp = all.filter((d) => d.kind === "audioinput");
  } catch (e) {
    SET.devs = { out: [], inp: [] };
  }
  return SET.devs;
}
function setAudioNumbers() {
  const A = S.audio && S.audio.ctx ? S.audio.ctx : null;
  if (!A) return null;
  const base = (A.baseLatency || 0) * 1000, out = (A.outputLatency || 0) * 1000;
  return { rate: A.sampleRate, base, out, total: base + out, state: A.state };
}
async function audioRestart() {
  const was = S.playing;
  if (S.playing) stopPlay();
  const A = S.audio;
  S.audio = null;
  if (A && A.ctx) {
    try {
      await A.ctx.close();
    } catch (e) {
    }
  }
  if (S.B && S.pid) {
    await loadAudio();
    if (was) play();
  } else ensureCtx();
}
function setBeep() {
  const A = ensureCtx(), c = A.ctx;
  if (c.state === "suspended") c.resume();
  const t = c.currentTime + 0.03;
  [0, 0.18, 0.36].forEach((d, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = [523.25, 659.25, 783.99][i];
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.25, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.25);
    o.connect(g).connect(A.out);
    o.start(t + d);
    o.stop(t + d + 0.3);
  });
}
async function setAudio(box) {
  const AU = UIP.audio || (UIP.audio = {});
  const ro = recOpts();
  await setDevices();
  const sinkOk = typeof (window.AudioContext && AudioContext.prototype.setSinkId) === "function";
  const outSel = `<select id="sa-sink" ${sinkOk ? "" : "disabled"}><option value="">Системний за замовчуванням</option>${SET.devs.out.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => `<option value="${escapeHtml(d.deviceId)}" ${AU.sink === d.deviceId ? "selected" : ""}>${escapeHtml(d.label || "Пристрій виводу " + (i + 1))}</option>`).join("")}</select>`;
  const inSel = `<select id="sa-mic"><option value="">Системний за замовчуванням</option>${SET.devs.inp.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => `<option value="${escapeHtml(d.deviceId)}" ${ro.device === d.deviceId ? "selected" : ""}>${escapeHtml(d.label || "Мікрофон " + (i + 1))}</option>`).join("")}</select>`;
  const noLabels = SET.devs.inp.length && !SET.devs.inp.some((d) => d.label);
  box.innerHTML = setHead("Аудіо і затримка", "Як швидко звук виходить з колонок після натискання клавіші чи пада. Менша затримка — відчуття «живої» гри, але на слабкому комп'ютері можливі тріски.")
    + `<div class="set-meter" id="sa-meter"><div><span class="muted small">Затримка виводу</span><b id="sa-lat">—</b></div><div><span class="muted small">Частота</span><b id="sa-rate">—</b></div><div><span class="muted small">MIDI-клавіатура</span><b id="sa-midi">—</b></div><div><span class="muted small">Стан</span><b id="sa-state">—</b></div></div>`
    + setRow("Режим затримки", "Мінімальна — для гри на MIDI-клавіатурі та падах. Збалансована — підходить більшості. Стабільна — якщо чути тріски й заїкання.", setSeg("sa-mode", [["low", "Мінімальна", "Найшвидший відгук. Якщо чуєте тріски — оберіть «Збалансована»"], ["normal", "Збалансована", "Добрий відгук і стабільний звук на більшості комп'ютерів"], ["safe", "Стабільна", "Найбільший запас: без трісків навіть на слабкому ноутбуці, але відгук повільніший"]], AU.latency || "normal"), "latency")
    + setRow("Частота дискретизації", "«Авто» дає найменше навантаження. 44,1 або 48 кГц — якщо звукова карта працює лише на цій частоті або ви чуєте зміну тону.", `<select id="sa-rate-sel">${[["auto", "Авто"], ["44100", "44,1 кГц"], ["48000", "48 кГц"], ["32000", "32 кГц (економно)"]].map(([v, l]) => `<option value="${v}" ${(AU.rate || "auto") === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)
    + setRow("Пристрій виводу", sinkOk ? "Куди йде звук програми: колонки, навушники, звукова карта." : "Вибір пристрою недоступний у цій версії системного переглядача — звук іде на системний пристрій. Змініть його в налаштуваннях звуку Windows.", outSel)
    + `<div class="set-acts"><button class="btn primary" id="sa-apply" data-hint="Перезапускає звуковий рушій з новими параметрами. Проєкт не закривається">Застосувати</button><button class="btn ghost" id="sa-test" data-hint="Три короткі ноти — перевірка, що звук іде на правильний пристрій">Перевірити звук</button></div>`
    + setHead("Запис", "Параметри вокальної студії за замовчуванням.")
    + setRow("Мікрофон", noLabels ? "Назви пристроїв з'являться після першого дозволу на мікрофон у вокальній студії." : "Пристрій, з якого записується вокал чи інструмент.", inSel)
    + setRow("Відлік перед записом", "Скільки тактів метронома прозвучить перед початком запису.", setSeg("sa-count", [["0", "Без відліку"], ["1", "1 такт"], ["2", "2 такти"]], ro.countIn))
    + setRow("Метроном під час запису", "Клік у навушниках, щоб тримати темп.", setSw("sa-metro", ro.metro))
    + setRow("Компенсація затримки запису", ro.latency != null ? `Виміряно: ${Math.round(ro.latency)} мс. Записане зсувається на цю величину, щоб потрапити в такт.` : "Ще не вимірювалася. Виміряти можна у вокальній студії → «Налаштування» → «Виміряти затримку».", `<button class="btn ghost sm" id="sa-recopen" ${S.B ? "" : "disabled"}>Вокальна студія…</button>`, "reclatency");
  const paint = () => {
    const n = setAudioNumbers();
    if (!$("#sa-lat")) return;
    $("#sa-lat").textContent = n ? `${n.total.toFixed(1)} мс` : "—";
    $("#sa-lat").className = n ? (n.total < 15 ? "ok" : n.total < 40 ? "" : "warn") : "";
    $("#sa-rate").textContent = n ? `${(n.rate / 1000).toFixed(1)} кГц` : "—";
    $("#sa-state").textContent = n ? (n.state === "running" ? "працює" : n.state === "suspended" ? "чекає на звук" : n.state) : "не запущено";
    $("#sa-midi").textContent = KB.lag != null ? `${Math.round(KB.lag)} мс` : "не підключено";
    SET.meter = requestAnimationFrame(() => setTimeout(paint, 400));
  };
  paint();
  const mark = () => {
    $("#sa-apply", box).classList.add("pulse-btn");
  };
  setSegBind(box, "sa-mode", (v) => { AU.latency = v; saveUI(); mark(); });
  $("#sa-rate-sel", box).onchange = (e) => { AU.rate = e.target.value; saveUI(); mark(); };
  $("#sa-sink", box).onchange = (e) => {
    AU.sink = e.target.value;
    saveUI();
    const c = S.audio && S.audio.ctx;
    if (c && typeof c.setSinkId === "function") c.setSinkId(AU.sink).then(() => toast("Пристрій виводу змінено.")).catch(() => toast("Цей пристрій зараз недоступний.", true));
  };
  $("#sa-apply", box).onclick = async () => {
    await audioRestart();
    $("#sa-apply", box).classList.remove("pulse-btn");
    const n = setAudioNumbers();
    toast(n ? `Звуковий рушій перезапущено: затримка ${n.total.toFixed(1)} мс, ${(n.rate / 1000).toFixed(1)} кГц.` : "Налаштування збережено.");
  };
  $("#sa-test", box).onclick = () => setBeep();
  $("#sa-mic", box).onchange = (e) => { ro.device = e.target.value; recSaveOpts(); };
  setSegBind(box, "sa-count", (v) => { ro.countIn = +v; recSaveOpts(); });
  $("#sa-metro", box).onchange = (e) => { ro.metro = e.target.checked; recSaveOpts(); };
  $("#sa-recopen", box).onclick = () => { setClose(); openRecorder(); };
}
async function setMidi(box) {
  let inputs = [], err = "";
  if (navigator.requestMIDIAccess) {
    try {
      const acc = KB.access || await navigator.requestMIDIAccess();
      inputs = [...acc.inputs.values()];
    } catch (e) {
      err = "Доступ до MIDI заборонено системою.";
    }
  } else err = "Системний переглядач не підтримує MIDI. Оновіть Microsoft Edge WebView2.";
  const maps = Object.keys(UIP.midimap || {}).length;
  box.innerHTML = setHead("MIDI і клавіші", "MIDI-клавіатури, контролери з ручками та гарячі клавіші програми.")
    + setRow("Підключені MIDI-пристрої", err || (inputs.length ? "Програма слухає всі пристрої одночасно. Нові з'являються самі — нічого перезапускати не треба." : "Нічого не підключено. Під'єднайте клавіатуру через USB — вона з'явиться тут."), `<div class="set-list">${inputs.length ? inputs.map((i) => `<span class="chip ok">${escapeHtml(i.name || "MIDI")}</span>`).join("") : `<span class="muted small">—</span>`}</div>`, "midi")
    + setRow("Затримка MIDI-клавіатури", "Час від натискання клавіші до звуку. Залежить від режиму в розділі «Аудіо і затримка».", `<b id="sm-lag">${KB.lag != null ? Math.round(KB.lag) + " мс" : "—"}</b>`)
    + setRow("Екранна клавіатура", "Грати мишкою або клавіатурою комп'ютера: ряди A–L і Q–P — це клавіші піаніно, Z / X — октава.", `<button class="btn ghost sm" id="sm-kb" ${S.B ? "" : "disabled"}>Відкрити…</button>`)
    + setRow("Прив'язки ручок (MIDI learn)", maps ? `Прив'язано параметрів: ${maps}. Права кнопка на будь-якій ручці → «Прив'язати до MIDI».` : "Права кнопка на будь-якій ручці мікшера чи ефекту → «Прив'язати до MIDI», потім покрутіть ручку на контролері.", `<button class="btn ghost sm" id="sm-unmap" ${maps ? "" : "disabled"}>Скинути всі</button>`, "midilearn")
    + setRow("Гарячі клавіші", "Перегляд і зміна поєднань клавіш для будь-якої дії.", `<button class="btn ghost sm" id="sm-keys">Налаштувати…</button>`)
    + setRow("Пошук будь-якої дії", `<span class="kbd">Ctrl K</span> — введіть кілька літер назви, і дія знайдеться, навіть якщо ви не пам'ятаєте, в якому вона меню.`, `<button class="btn ghost sm" id="sm-cmdk">Спробувати</button>`);
  $("#sm-kb", box).onclick = () => { setClose(); openKeyboard(); };
  $("#sm-keys", box).onclick = () => { setClose(); openKeysEditor(); };
  $("#sm-cmdk", box).onclick = () => { setClose(); openCmdk(); };
  $("#sm-unmap", box).onclick = async () => {
    if (!await inkConfirm("Скинути прив'язки", "<p>Видалити всі прив'язки ручок до MIDI-контролера?</p>", "Скинути", true)) return;
    for (const k of Object.keys(UIP.midimap || {})) delete UIP.midimap[k];
    saveUI();
    setMidi(box);
  };
}
async function setProjects(box) {
  const st = await api.get("/api/storage").catch(() => null);
  const NP = Object.assign({ bpm: 120, bars: 64, mode: "minor", bpb: 4 }, UIP.newp || {});
  box.innerHTML = setHead("Проєкти й експорт", "Де зберігаються пісні та що підставляється за замовчуванням.")
    + setRow("Папка проєктів", st ? `<span class="set-path">${escapeHtml(st.workspace)}</span><br>Проєктів: ${st.projects.count} · ${setFmt(st.projects.bytes)}. Кожна зміна зберігається автоматично.` : "", `<button class="btn ghost sm" id="sp-open">Відкрити папку</button>`, "workspace")
    + setHead("Новий проєкт", "Значення, з якими відкривається вікно «Новий проєкт з нуля».")
    + setRow("Темп", "Удари на хвилину.", `<input type="number" id="sp-bpm" class="inp sm" min="40" max="260" value="${NP.bpm}">`)
    + setRow("Довжина", "Кількість тактів на таймлайні.", setSeg("sp-bars", [["32", "32"], ["64", "64"], ["128", "128"]], NP.bars))
    + setRow("Лад", "Мінор звучить темніше, мажор — світліше.", setSeg("sp-mode", [["minor", "Мінор"], ["major", "Мажор"]], NP.mode))
    + setRow("Розмір", "4/4 — більшість сучасної музики, 3/4 — вальс, 6/8 — балади.", setSeg("sp-bpb", [["4", "4/4"], ["3", "3/4"], ["6", "6/8"]], NP.bpb))
    + setHead("Експорт", "Що додається до експорту за замовчуванням.")
    + setRow("Виконавець", "Підставляється в теги MP3/WAV та обкладинку.", `<input type="text" id="sp-artist" class="inp" placeholder="Ваше ім'я або псевдонім" value="${escapeHtml(UIP.exArtist || "")}">`)
    + setRow("Проєкт для Reaper (.rpp)", "Усі доріжки на своїх місцях — відкривається одним кліком.", setSw("sp-rpp", UIP.exRpp !== false))
    + setRow("DAWproject", "Відкритий формат для Bitwig Studio, Studio One, Cubase.", setSw("sp-dawp", !!UIP.exDawp), "export");
  $("#sp-open", box).onclick = () => api.post("/api/storage/open", { what: "workspace" }).then((j) => toast(`Відкрито: ${j.path}`));
  const save = () => { UIP.newp = NP; saveUI(); Object.assign(NEWP, { bars: +NP.bars, mode: NP.mode, bpb: +NP.bpb }); };
  $("#sp-bpm", box).onchange = (e) => { const v = Math.round(+e.target.value); if (v >= 40 && v <= 260) { NP.bpm = v; save(); } else { e.target.value = NP.bpm; toast("Темп має бути від 40 до 260 BPM.", true); } };
  setSegBind(box, "sp-bars", (v) => { NP.bars = +v; save(); });
  setSegBind(box, "sp-mode", (v) => { NP.mode = v; save(); });
  setSegBind(box, "sp-bpb", (v) => { NP.bpb = +v; save(); });
  $("#sp-artist", box).onchange = (e) => { UIP.exArtist = e.target.value.trim(); saveUI(); };
  $("#sp-rpp", box).onchange = (e) => { UIP.exRpp = e.target.checked; saveUI(); };
  $("#sp-dawp", box).onchange = (e) => { UIP.exDawp = e.target.checked; saveUI(); };
}
async function setSep(box) {
  const [st, sys] = await Promise.all([sepStatus(), api.get("/api/system").catch(() => ({}))]);
  const ok = st && st.ready;
  const dev = sys.device === "cuda" ? `Відеокарта NVIDIA${sys.gpu ? " · " + escapeHtml(sys.gpu) : ""}` : sys.device === "mps" ? "Apple Silicon (GPU)" : "Процесор";
  box.innerHTML = setHead("Розбір пісні на доріжки", "Нейромережа розділяє готову пісню на вокал, барабани, бас, гітару, клавішні та інше.")
    + setRow("Модуль", ok ? `<span class="ok">Встановлено.</span> Можна розділяти пісні.` : st && st.running ? `Встановлюється: ${escapeHtml(st.stage || "")} · ${Math.round((st.progress || 0) * 100)}%` : "Не встановлено. Потрібно один раз завантажити близько 250 МБ або 2,5 ГБ з прискоренням відеокартою NVIDIA.", ok ? "" : `<button class="btn primary sm" id="ss-inst" ${st && st.running ? "disabled" : ""}>Встановити</button>`, "separation")
    + setRow("На чому рахується", sys.device === "cuda" ? "Розділення на відеокарті — у 5–10 разів швидше." : "Пісня на 3 хвилини розділяється приблизно 2–6 хвилин.", `<b>${ok ? dev : "—"}</b>`)
    + setRow("Якість за замовчуванням", "Що буде вибрано на головному екрані.", setSeg("ss-model", [["6", "6 доріжок", "Вокал, барабани, бас, гітара, клавішні, інше"], ["4", "4 · макс. якість", "Найчистіше розділення, повільніше"], ["4fast", "4 · швидко", "Найшвидше"]], UIP.sepModel || "6"));
  const ib = $("#ss-inst", box);
  if (ib) ib.onclick = async () => { await sepInstall(st && st.gpu ? true : null); setTimeout(() => setSep(box), 600); };
  setSegBind(box, "ss-model", (v) => {
    UIP.sepModel = v;
    saveUI();
    setModelDefault();
  });
}
function setModelDefault() {
  const v = UIP.sepModel;
  if (!v) return;
  const b = $(`#model-seg button[data-model="${v}"]`);
  if (!b) return;
  S.model = v;
  $$("#model-seg button").forEach((x) => x.classList.toggle("active", x === b));
}
async function setSounds(box) {
  box.innerHTML = setHead("Звуки і місце на диску", "") + `<p class="muted">Рахую розміри…</p>`;
  const st = await api.get("/api/storage").catch(() => null);
  if (!st || SET.tab !== "sounds") return;
  const bar = (n, all) => `<div class="set-bar"><i style="width:${all ? Math.max(1, n / all * 100) : 0}%"></i></div>`;
  const all = st.projects.bytes + st.uploads + st.soundbank + st.packs + st.library + st.models;
  const line = (t, d, n, act) => `<div class="set-row"><div class="set-l"><b>${t}</b><span class="muted small">${d}</span>${bar(n, all)}</div><div class="set-c"><b class="set-num">${setFmt(n)}</b>${act || ""}</div></div>`;
  box.innerHTML = setHead("Звуки і місце на диску", `Разом: <b>${setFmt(all)}</b>.`)
    + line("Проєкти", `${st.projects.count} пісень і бітів`, st.projects.bytes, `<button class="btn ghost sm" data-open="workspace">Папка</button>`)
    + line("Вбудовані звуки", "Ударні, басові та мелодичні семпли, свої імпортовані семпли", st.soundbank, `<button class="btn ghost sm" data-open="soundbank">Папка</button>`)
    + line("Завантажені пакети", "Пакети звуків із магазину", st.packs, `<button class="btn ghost sm" id="ss-store">Магазин…</button>`)
    + line("Бібліотека", "Ваші семпли та пресети", st.library, `<button class="btn ghost sm" data-open="library">Папка</button>`)
    + line("Тимчасові файли", "Копії файлів, відкритих для розбору. Їх можна безпечно видалити", st.uploads, `<button class="btn ghost sm" id="ss-clean" ${st.uploads ? "" : "disabled"}>Очистити</button>`)
    + line("Модель розбору", "Нейромережа для розділення пісень", st.models, "")
    + setHead("Бібліотека звуків", "")
    + setRow("Браузер звуків", "Тисячі інструментів і семплів. Перетягніть звук мишкою на доріжку, на порожнє місце під доріжками або на пад.", `<button class="btn ghost sm" id="ss-br" ${S.B ? "" : "disabled"}>Відкрити…</button>`, "browser")
    + setRow("Свої семпли", "Імпорт цілої папки: програма сама розкладе звуки по категоріях (кік, снейр, хет, 808, луп…) і визначить темп і тональність.", `<button class="btn ghost sm" id="ss-imp" ${S.B ? "" : "disabled"}>Імпорт папки…</button>`, "import");
  $$("[data-open]", box).forEach((b) => b.onclick = () => api.post("/api/storage/open", { what: b.dataset.open }));
  $("#ss-store", box).onclick = () => { if (!S.B) return toast("Спочатку відкрийте проєкт.", true); setClose(); openSoundBrowser({ tab: "store" }); };
  $("#ss-br", box).onclick = () => { setClose(); openSoundBrowser({}); };
  $("#ss-imp", box).onclick = () => { setClose(); openSoundBrowser({ tab: "samples" }); };
  $("#ss-clean", box).onclick = async () => {
    try {
      const j = await api.post("/api/storage/clean", { what: "uploads" });
      toast(`Звільнено ${setFmt(j.freed)}.`);
    } catch (e) {
      toast(e.message, true);
    }
    setSounds(box);
  };
}
async function setVst(box) {
  const v = await api.get("/api/vst").catch(() => null);
  const n = v && v.plugins ? v.plugins.length : 0;
  box.innerHTML = setHead("VST-плагіни", "Сторонні синтезатори та ефекти у форматі VST3.")
    + setRow("Знайдено плагінів", n ? `Інструментів: ${v.plugins.filter((p) => p.instrument).length}, ефектів: ${v.plugins.filter((p) => !p.instrument).length}.` : "Ще не сканувалося або плагінів немає.", `<b class="set-num">${n}</b>`, "vst")
    + setRow("Менеджер плагінів", "Сканування, папки пошуку, популярні безкоштовні синтезатори (Vital, Surge XT, TAL-NoiseMaker) з посиланнями на офіційні сайти.", `<button class="btn primary sm" id="sv-open">Відкрити…</button>`);
  $("#sv-open", box).onclick = () => { setClose(); openVstManager(); };
}
async function setUpdates(box) {
  const info = await api.get("/api/update/info").catch(() => null);
  const p = (info && info.prefs) || {};
  box.innerHTML = setHead("Оновлення", info ? `Встановлена версія: <b>${escapeHtml(info.version || (S.system && S.system.version) || "")}</b>` : "")
    + setRow("Перевіряти автоматично", "Раз на день програма тихо дивиться, чи вийшла нова версія, і показує повідомлення.", setSw("su-ac", !!p.auto_check))
    + setRow("Встановлювати самостійно", "Оновлення завантажується у фоні й застосовується при наступному запуску. Проєкти не зачіпаються.", setSw("su-ai", !!p.auto_install))
    + `<div class="set-acts"><button class="btn primary" id="su-check">Перевірити зараз…</button></div>`;
  $("#su-ac", box).onchange = (e) => api.post("/api/update/prefs", { auto_check: e.target.checked });
  $("#su-ai", box).onchange = (e) => api.post("/api/update/prefs", { auto_install: e.target.checked });
  $("#su-check", box).onclick = () => { setClose(); openUpdates(); };
}
async function setReports(box) {
  const s = await crSettings(true);
  const items = await api.get("/api/reports").catch(() => ({ items: [] }));
  const n = (items.items || []).length;
  box.innerHTML = setHead("Звіти про помилки", "Якщо щось пішло не так, програма може надіслати розробнику технічний опис помилки. Без імен файлів, шляхів і особистих даних — перед надсиланням ви бачите точний текст.")
    + setRow("Коли сталася помилка", "", setSeg("sr-mode", [["ask", "Питати мене", "Показувати картку з пропозицією надіслати"], ["auto", "Надсилати самостійно", "Без питань — тільки технічний опис"], ["never", "Ніколи", "Нічого не пропонувати й не надсилати"]], s.crash_reports || "ask"), "reports")
    + setRow("Журнал помилок", n ? `Записано помилок: ${n}.` : "Помилок не було.", `<button class="btn ghost sm" id="sr-log">Відкрити…</button><button class="btn ghost sm" id="sr-send">Повідомити про проблему…</button>`)
    + `<details class="set-adv"><summary>Для розробника: куди надсилати</summary><p class="muted small">Адреса вебхука (наприклад, Discord) або сервера, що приймає JSON. Якщо порожньо — звіт відкривається як issue на GitHub.</p><div class="set-inl"><input type="text" id="sr-url" class="inp" placeholder="https://…" value="${escapeHtml(s.report_url || "")}"><button class="btn ghost sm" id="sr-save">Зберегти</button></div></details>`;
  setSegBind(box, "sr-mode", async (v) => { await api.post("/api/settings", { crash_reports: v }); await crSettings(true); });
  $("#sr-log", box).onclick = () => { setClose(); openReports(); };
  $("#sr-send", box).onclick = () => { setClose(); crReview([]); };
  $("#sr-save", box).onclick = async () => {
    const u = $("#sr-url", box).value.trim();
    if (u && !/^https:\/\//.test(u)) return toast("Адреса має починатися з https://", true);
    await api.post("/api/settings", { report_url: u });
    await crSettings(true);
    toast(u ? "Адресу збережено." : "Звіти відкриватимуться через GitHub.");
  };
}
function setPhone(box) {
  box.innerHTML = setHead("Телефон", "Записуйте ідеї на телефон — мелодію, наспівану фразу, біт голосом — і вони з'являться в програмі.")
    + setRow("Ідеї з телефона", "Телефон і комп'ютер мають бути в одній мережі Wi-Fi. Відскануйте QR-код камерою телефона — відкриється сторінка запису, нічого встановлювати не треба.", `<button class="btn primary sm" id="sph-open">Підключити…</button>`, "phone");
  $("#sph-open", box).onclick = () => { setClose(); openPhone(); };
}
function setReset(box) {
  box.innerHTML = setHead("Скидання", "Повернення налаштувань до початкових. Проєкти, семпли й пакети звуків не видаляються ніколи.")
    + setRow("Вигляд і розкладка", "Тема, колір, розташування панелей і окремих вікон.", `<button class="btn ghost sm" id="sx-look">Скинути</button>`)
    + setRow("Аудіо і запис", "Режим затримки, пристрої, відлік, ланцюжок ефектів вокалу.", `<button class="btn ghost sm" id="sx-audio">Скинути</button>`)
    + setRow("Усі налаштування інтерфейсу", "Усе, крім проєктів. Програма перезавантажить вікно.", `<button class="btn danger sm" id="sx-all">Скинути все</button>`);
  $("#sx-look", box).onclick = async () => {
    if (!await inkConfirm("Скинути вигляд", "<p>Повернути стандартну тему, колір і розкладку панелей?</p>", "Скинути")) return;
    Object.assign(UIP, { theme: "graphite", accent: "amber", compact: false, layout: Object.assign({}, LAYOUT_DEF), wins: {}, mfloat: {} });
    saveUI();
    applyLook();
    if (S.B) { layout(); draw(); }
    toast("Вигляд скинуто.");
  };
  $("#sx-audio", box).onclick = async () => {
    if (!await inkConfirm("Скинути аудіо", "<p>Повернути стандартні параметри звуку й запису?</p>", "Скинути")) return;
    UIP.audio = {};
    saveUI();
    try { localStorage.removeItem("inkbeat.rec"); localStorage.removeItem("inkbeat.recchain"); } catch (e) { }
    REC.opts = null;
    await audioRestart();
    toast("Налаштування звуку скинуто.");
    setReset(box);
  };
  $("#sx-all", box).onclick = async () => {
    if (!await inkConfirm("Скинути все", "<p>Скинути всі налаштування інтерфейсу? Проєкти, семпли й пакети залишаться.</p>", "Скинути все", true)) return;
    try {
      ["inkbeat.ui", "inkbeat.rec", "inkbeat.recchain"].forEach((k) => localStorage.removeItem(k));
    } catch (e) {
    }
    location.reload();
  };
}
(function settingsUI() {
  if (UIP.newp) Object.assign(NEWP, { bars: +UIP.newp.bars || NEWP.bars, mode: UIP.newp.mode || NEWP.mode, bpb: +UIP.newp.bpb || NEWP.bpb });
  setModelDefault();
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      openSettings();
    }
  });
})();
