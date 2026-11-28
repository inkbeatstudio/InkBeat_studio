"use strict";
const WIZ = { genre: "trap", mood: "dark" };
const WIZ_GENRES = ["trap", "drill", "lofi", "pop", "rnb", "house", "afro", "dnb", "phonk", "synthwave", "rock", "ballad"];
function wizBox(html, wide) {
  const m = careModalBox("wiz-modal", "Почнімо", html);
  m.querySelector(".modal-card").style.width = wide ? "min(980px,96vw)" : "min(760px,96vw)";
  m.classList.add("wiz");
  return m;
}
function wizDone() {
  UIP.wizDone = true;
  saveUI();
}
function openWizard() {
  const m = wizBox(`<p class="wiz-lead">${tr("Що хочеш зробити зараз? Вибери — і за кілька кліків буде результат, який можна послухати й показати друзям.")}</p>
    <div class="wiz-cards four">
      <button class="wiz-card" data-w="beat"><i>🥁</i><b>${tr("Зробити біт з нуля")}</b><span>${tr("Вибери жанр і настрій — програма збере барабани, бас, акорди й структуру. Далі змінюй що хочеш.")}</span></button>
      <button class="wiz-card" data-w="split"><i>🎧</i><b>${tr("Розібрати пісню на доріжки")}</b><span>${tr("Додай MP3 чи WAV — отримаєш окремо вокал, барабани, бас та інше, а також ноти й акорди.")}</span></button>
      <button class="wiz-card" data-w="voice"><i>🎤</i><b>${tr("Записати голос")}</b><span>${tr("Під свій мінус або під метроном: дублі, відлік, чистка шуму й ефекти для вокалу.")}</span></button>
      <button class="wiz-card" data-w="explore"><i>✨</i><b>${tr("Просто подивитися")}</b><span>${tr("Відкрити готовий демо-біт і покрутити все самому. Підказки внизу екрана пояснюють кожну кнопку.")}</span></button>
    </div>
    <div class="wiz-foot"><label class="chk small"><input type="checkbox" id="wiz-hide" ${UIP.wizDone ? "checked" : ""}> ${tr("Не показувати під час запуску")}</label><span class="muted small">${tr("Майстер завжди можна відкрити: «Довідка» → «Майстер: з чого почати».")}</span></div>`, true);
  $("#wiz-hide", m).onchange = (e) => { UIP.wizDone = e.target.checked; saveUI(); };
  $$("[data-w]", m).forEach((b) => b.onclick = () => {
    const w = b.dataset.w;
    if (w === "beat") wizBeat();
    else if (w === "split") wizSplit();
    else if (w === "voice") wizVoice();
    else wizExplore();
  });
}
function wizBeat() {
  const m = wizBox(`<p class="wiz-lead">${tr("Який жанр?")}</p>
    <div class="wiz-genres">${WIZ_GENRES.filter((k) => GENRES[k]).map((k) => `<button class="wiz-chip ${WIZ.genre === k ? "on" : ""}" data-g="${k}"><b>${escapeHtml(GENRES[k].name)}</b><span>${GENRES[k].bpm} BPM</span></button>`).join("")}</div>
    <p class="wiz-lead">${tr("Настрій")}</p>
    <div class="wiz-moods">${[["dark", "Темний, напружений"], ["warm", "Теплий, мрійливий"], ["bright", "Світлий, позитивний"]].map(([k, l]) => `<button class="wiz-chip ${WIZ.mood === k ? "on" : ""}" data-m="${k}"><b>${tr(l)}</b></button>`).join("")}</div>
    <div class="modal-actions"><button class="btn ghost" id="wiz-back">${tr("Назад")}</button><button class="btn primary" id="wiz-go">${tr("Зробити біт")}</button></div>`, true);
  $$("[data-g]", m).forEach((b) => b.onclick = () => { WIZ.genre = b.dataset.g; $$("[data-g]", m).forEach((x) => x.classList.toggle("on", x === b)); });
  $$("[data-m]", m).forEach((b) => b.onclick = () => { WIZ.mood = b.dataset.m; $$("[data-m]", m).forEach((x) => x.classList.toggle("on", x === b)); });
  $("#wiz-back", m).onclick = openWizard;
  $("#wiz-go", m).onclick = async () => {
    const G = GENRES[WIZ.genre];
    const btn = $("#wiz-go", m);
    btn.disabled = true;
    btn.textContent = tr("Збираю біт…");
    try {
      const mode = WIZ.mood === "bright" ? "major" : WIZ.mood === "dark" ? "minor" : G.mode;
      const tonics = mode === "minor" ? [9, 4, 2, 7, 0, 5] : [0, 7, 2, 5, 9];
      const tonic = tonics[Math.floor(Math.random() * tonics.length)];
      const gbars = STRUCTS[G.struct][1].reduce((s, x) => s + x[1], 0);
      const r = await api.post("/api/projects/new", { title: `${tr("Мій біт")} · ${tr(G.name)}`, bpm: G.bpm, bpb: 4, bars: Math.max(gbars, 16), tonic, mode });
      m.hidden = true;
      await openProject(r.pid);
      await new Promise((res) => setTimeout(res, 400));
      applyGenre(WIZ.genre);
      wizDone();
      setTimeout(() => wizAfterBeat(G), 700);
    } catch (e) {
      toast(tr("Не вдалося") + ": " + e.message, true);
      btn.disabled = false;
      btn.textContent = tr("Зробити біт");
    }
  };
}
function wizAfterBeat(G) {
  if (typeof seek === "function") { seek(0); play(); }
  const m = wizBox(`<p class="wiz-lead">${tr("Біт готовий і вже грає")} 🎉</p>
    <p class="muted">${tr("Барабани, бас, акорди, акомпанемент і структура пісні — все окремими доріжками. Кожну можна змінити: ноти на вкладці «Ноти», звук на вкладці «Інструмент», гучність і ефекти в мікшері.")}</p>
    <div class="wiz-next">
      <button data-n="melody"><b>${tr("Додати мелодію")}</b><span>${tr("Програма запропонує мелодію під ці акорди")}</span></button>
      <button data-n="sound"><b>${tr("Змінити звук")}</b><span>${tr("Рояль, струнні, 808, синти — у браузері звуків")}</span></button>
      <button data-n="voice"><b>${tr("Записати голос")}</b><span>${tr("Проспівай або зачитай поверх біта")}</span></button>
      <button data-n="clip"><b>${tr("Кліп для соцмереж")}</b><span>${tr("Відео для TikTok, Reels чи Shorts з цього біта")}</span></button>
      <button data-n="export"><b>${tr("Зберегти MP3")}</b><span>${tr("Готовий файл, щоб надіслати друзям")}</span></button>
    </div>
    <div class="modal-actions"><button class="btn primary" data-n="close">${tr("Далі сам")}</button></div>`);
  $$("[data-n]", m).forEach((b) => b.onclick = () => {
    const n = b.dataset.n;
    m.hidden = true;
    if (n === "melody") openMelody();
    else if (n === "sound") openSoundBrowser({ mode: "new" });
    else if (n === "voice") { stopPlay(); openRecorder(); }
    else if (n === "clip") { stopPlay(); openAutoClip(); }
    else if (n === "export") { stopPlay(); $("#export-btn").click(); }
  });
}
function wizSplit() {
  const m = wizBox(`<p class="wiz-lead">${tr("Вибери пісню")}</p>
    <p class="muted">${tr("Підійде MP3, WAV, FLAC чи M4A. Програма розділить її на вокал, барабани, бас, гітару, клавішні й інше, визначить темп, тональність, акорди та структуру, а мелодії перетворить на ноти. Пісня 3–4 хвилини обробляється від 1 до 6 хвилин.")}</p>
    <div class="modal-actions"><button class="btn ghost" id="wiz-back">${tr("Назад")}</button><button class="btn primary" id="wiz-pick">${tr("Вибрати файл…")}</button></div>`);
  $("#wiz-back", m).onclick = openWizard;
  $("#wiz-pick", m).onclick = async () => {
    m.hidden = true;
    wizDone();
    show("home");
    if (typeof setMode === "function") setMode("mix");
    if (typeof openFromDisk === "function" && DESK.on) openFromDisk("mix");
    else $("#file-input").click();
    toast(tr("Після вибору файлу натисніть «Розібрати»."));
  };
}
function wizVoice() {
  const m = wizBox(`<p class="wiz-lead">${tr("Під що записуємо?")}</p>
    <div class="wiz-cards">
      <button class="wiz-card" data-v="minus"><i>💿</i><b>${tr("Під свій мінус")}</b><span>${tr("Вибери файл з мінусом — програма визначить його темп, і можна одразу записувати.")}</span></button>
      <button class="wiz-card" data-v="beat"><i>🥁</i><b>${tr("Під новий біт")}</b><span>${tr("Спершу програма збере біт у вибраному жанрі, потім відкриється запис.")}</span></button>
      <button class="wiz-card" data-v="click"><i>⏱</i><b>${tr("Під метроном")}</b><span>${tr("Порожній проєкт: тільки голос і клік метронома.")}</span></button>
    </div>
    <div class="modal-actions"><button class="btn ghost" id="wiz-back">${tr("Назад")}</button></div>`, true);
  $("#wiz-back", m).onclick = openWizard;
  $$("[data-v]", m).forEach((b) => b.onclick = async () => {
    const v = b.dataset.v;
    if (v === "beat") return wizBeat();
    m.hidden = true;
    wizDone();
    try {
      const r = await api.post("/api/projects/new", { title: tr("Мій запис"), bpm: 100, bpb: 4, bars: 64, tonic: 9, mode: "minor" });
      await openProject(r.pid);
      if (v === "minus") {
        await importAudioTrack("other");
        setTimeout(() => openRecorder(), 400);
      } else {
        openRecorder();
      }
    } catch (e) {
      toast(tr("Не вдалося") + ": " + e.message, true);
    }
  });
}
async function wizExplore() {
  const m = $("#wiz-modal");
  if (m) m.hidden = true;
  wizDone();
  try {
    const r = await api.post("/api/projects/new", { title: tr("Демо-біт"), bpm: 82, bpb: 4, bars: 32, tonic: 2, mode: "minor" });
    await openProject(r.pid);
    await new Promise((res) => setTimeout(res, 400));
    applyGenre("lofi");
    setTimeout(() => { if (typeof seek === "function") { seek(0); play(); } toast(tr("Демо-біт грає. Наведіть мишку на будь-яку кнопку — унизу з'явиться підказка, а значок «?» відкриває детальне пояснення.")); }, 700);
  } catch (e) {
    toast(tr("Не вдалося") + ": " + e.message, true);
  }
}
(function wizardUI() {
  const help = MENUS["Довідка"];
  MENUS["Довідка"] = () => { const a = help(); a.splice(1, 0, ["Майстер: з чого почати…", openWizard]); return a; };
  setTimeout(() => { if (!UIP.wizDone && S.view === "home" && !document.querySelector(".modal:not([hidden])")) openWizard(); }, 1200);
})();
