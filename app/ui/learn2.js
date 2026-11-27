"use strict";
const PACKS = {
  "808": { name: "808 класика", kit: "808", pads: [["kick", 36, 4], ["snare", 38, 3], ["hat", 42, 3], ["openhat", 46, 2], ["clap", 39, 2], ["tom", 45, 2]] },
  "909": { name: "909 хаус", kit: "909", pads: [["kick", 36, 4], ["snare", 38, 3], ["clap", 39, 3], ["hat", 42, 3], ["openhat", 46, 2], ["ride", 51, 2]] },
  trap: { name: "Трап", kit: "trap", pads: [["kick", 36, 4], ["snare", 38, 3], ["clap", 39, 3], ["hat", 42, 4], ["openhat", 46, 2], ["perc", 37, 2]] },
  lofi: { name: "Лоу-фай", kit: "lofi", pads: [["kick", 36, 3], ["snare", 38, 3], ["hat", 42, 3], ["rim", 37, 2], ["perc", 63, 2]] },
  rock: { name: "Рок", kit: "rock", pads: [["kick", 36, 3], ["snare", 38, 3], ["hat", 42, 2], ["crash", 49, 2], ["tom", 47, 3]] },
  perc: { name: "Перкусія світу", kit: "perc", pads: [["kick", 36, 2], ["rim", 37, 2], ["bell", 56, 3], ["perc", 60, 3], ["perc", 64, 3], ["tom", 48, 3]] },
};
async function genPack(key, onp) {
  const P = PACKS[key], A = ensureCtx(), SR = A.ctx.sampleRate, fd = new FormData();
  let n = 0, total = P.pads.reduce((s, x) => s + x[2], 0);
  for (const [name, note, count] of P.pads) {
    for (let i = 0; i < count; i++) {
      const pad = { tune: i === 0 ? 0 : (Math.random() * 2 - 1) * 3, decay: i === 0 ? 1 : 0.7 + Math.random() * 0.8, vol: 1 };
      const len = Math.ceil(SR * (name === "crash" || name === "ride" ? 2.2 : name === "kick" && key === "trap" ? 2 : 1.2));
      const ctx = new OfflineAudioContext(2, len, SR);
      DSP.playNote(ctx, ctx.destination, { type: "drums", kit: P.kit, pads: { [DSP_DRUM_GROUP(note)]: pad } }, note, 0.9, 0.005, 0.3, new Map());
      const buf = await ctx.startRendering();
      fd.append("files", new Blob([DSP.encodeWav(buf)], { type: "audio/wav" }), `${P.name} ${name} ${i + 1}.wav`);
      n++;
      if (onp) onp(n / total);
    }
  }
  const r = await fetch("/api/library/sample", { method: "POST", body: fd }), j = await r.json();
  if (!r.ok) throw new Error(j.error || "помилка");
  return j.added.length;
}
function openPacks() {
  const m = careModalBox("packs-modal", "Вбудовані паки звуків", `<p class="muted">Програма синтезує набір барабанних звуків (з кількома варіантами кожного) і кладе їх у вашу бібліотеку — без завантажень з інтернету. Потім їх можна поставити на пади драм-кіта (вкладка «Інструмент» → пад → свій семпл) або грати семплером.</p>
    <div class="genre-grid">${Object.entries(PACKS).map(([k, p]) => `<button class="hm-le" data-pk="${k}"><b>${escapeHtml(p.name)}</b><span>${p.pads.reduce((s, x) => s + x[2], 0)} звуків · ${p.pads.map((x) => x[0]).filter((x, i, a) => a.indexOf(x) === i).join(", ")}</span></button>`).join("")}</div>
    <div class="pbar" style="margin-top:12px"><div id="pk-bar" style="width:0%"></div></div><p class="muted small" id="pk-st"></p>`);
  $$("[data-pk]", m).forEach((b) => b.onclick = async () => {
    $$("[data-pk]", m).forEach((x) => x.disabled = true);
    try {
      const n = await genPack(b.dataset.pk, (p) => { $("#pk-bar", m).style.width = Math.round(p * 100) + "%"; $("#pk-st", m).textContent = `Синтезую… ${Math.round(p * 100)}%`; });
      $("#pk-st", m).textContent = `Готово: ${n} звуків у бібліотеці («Файл» → «Бібліотека семплів і пресетів»).`;
      toast(`Пак «${PACKS[b.dataset.pk].name}» додано в бібліотеку: ${n} звуків.`);
    } catch (e) { $("#pk-st", m).textContent = "Не вдалося: " + e.message; }
    $$("[data-pk]", m).forEach((x) => x.disabled = false);
  });
}
const LESSONS = [
  { id: "beat", title: "Біт за 10 хвилин", desc: "Барабани в секвенсорі: бочка, малий, хети, свінг і живість.", steps: [
    { t: "Відкрийте покроковий секвенсор: меню «Інструменти» → «Покроковий секвенсор барабанів…». Якщо барабанної доріжки немає — виберіть «＋ Нова барабанна доріжка».", ok: () => !!SQ.m && !SQ.m.hidden && !!SQ.tid },
    { t: "Поставте бочку (нижній рядок) на кроки 1 і 9 — це дві сильні долі такту.", sel: "#seq-modal .seq-grid", ok: () => SQ.cells && SQ.cells["36:0"] && SQ.cells["36:8"] },
    { t: "Додайте малий барабан на кроки 5 і 13 — він дає «удар» на 2 і 4.", sel: "#seq-modal .seq-grid", ok: () => SQ.cells && SQ.cells["38:4"] && SQ.cells["38:12"] },
    { t: "Заповніть закриті хети кожен другий крок (1, 3, 5…) — це пульс восьмими.", sel: "#seq-modal .seq-grid", ok: () => SQ.cells && [0, 2, 4, 6, 8, 10, 12, 14].filter((s) => SQ.cells["42:" + s]).length >= 6 },
    { t: "Натисніть «▶ Слухати». Подобається? Підкрутіть «Свінг» і «Живість» — біт почне «качати».", sel: "#sq-play", ok: () => S.playing },
    { t: "Супер! Спробуйте режим «Ретригер» на хетах і «Збивки кожні 4 такти». Біт готовий — далі урок «Бас під бочку».", final: true },
  ] },
  { id: "chords", title: "Перша прогресія", desc: "Конструктор акордів: тоніка, рух і напруга.", steps: [
    { t: "Натисніть кнопку «Гармонія» на верхній панелі.", sel: "#t-harm", ok: () => HM.m && !HM.m.hidden },
    { t: "Клацніть на перший акорд тональності (позначка I або i) — це тоніка, «дім» пісні.", sel: "#harm-modal .hm-dia", ok: () => HM.prog.length >= 1 },
    { t: "Додайте ще три акорди, користуючись підказками «Що далі?». Зелені — спокій, сині — рух, помаранчеві — напруга.", sel: "#harm-modal .hm-sug", ok: () => HM.prog.length >= 4 },
    { t: "Натисніть «▶ Слухати» над прогресією.", sel: "#hm-play", ok: () => !!HM.playG },
    { t: "Тепер «Записати в пісню» — програма запише акорди й створить акомпанемент і бас.", sel: "#hm-go", ok: () => chordList().some((c) => c.user) },
    { t: "Готово! Правий клік по акорду на рядку акордів — замінити його, і партії підлаштуються.", final: true },
  ] },
  { id: "bass", title: "Бас під бочку", desc: "Генератор баса за акордами й ритмом.", steps: [
    { t: "Відкрийте «Генератор» на верхній панелі.", sel: "#t-gen", ok: () => { const g = document.getElementById("gen-modal"); return g && !g.hidden; } },
    { t: "Виберіть «Басова лінія» і стиль, наприклад «Синкопа» або «808 зі слайдами». Натисніть прослухати, потім створіть доріжку.", ok: () => (S.mix.gens || []).some((g) => g.role === "bass") },
    { t: "Відкрийте вкладку «Ноти» басової доріжки: бас найкраще звучить, коли його ноти збігаються з бочкою. Пересуньте одну-дві ноти на удари бочки.", ok: () => S.dockTab === "notes" },
    { t: "Чудово! Додайте на бас MIDI-ефект «Глайд», якщо хочете трапові слайди (вкладка «Інструмент»).", final: true },
  ] },
  { id: "melody", title: "Мелодія з нуля", desc: "Гама, мотив, повтор і варіація.", steps: [
    { t: "Меню «Інструменти» → «Мелодія з нуля…».", ok: () => { const m = document.getElementById("mel-modal"); return m && !m.hidden; } },
    { t: "Виберіть ритм «Хук — коротко й чіпко» і форму «A A B A». Натисніть «▶ Прослухати», а якщо не подобається — «🎲 Інший варіант».", sel: "#mel-modal .mel-grid" },
    { t: "Запишіть мелодію в доріжку.", sel: "#mel-go", ok: () => tracksAll().some((t) => t.role === "lead" && trackNotes(t).length) },
    { t: "У піано-ролі увімкніть «Лише гама» і спробуйте «Перетворити ▾» → «Додати голос: терція вище».", sel: "#pr-tf" },
    { t: "Ваша перша мелодія готова. Майстерня тексту допоможе підписати під неї слова.", final: true },
  ] },
  { id: "drop", title: "Як зробити дроп", desc: "Структура, енергія, білд і переходи.", steps: [
    { t: "Меню «Інструменти» → «Аранжувальник…».", ok: () => { const m = document.getElementById("arr-modal"); return m && !m.hidden; } },
    { t: "Виберіть структуру «EDM / хаус» — у ній є «Білд» і «Дроп».", sel: "#arr-st", ok: () => ARR.struct === "edm" },
    { t: "Виділіть на лінійці 4–8 тактів з вашим лупом (потягніть мишкою по номерах тактів), потім відкрийте аранжувальник знову.", ok: () => S.loop && S.loop.b > S.loop.a },
    { t: "Натисніть «Розгорнути луп у пісню» з переходами.", sel: "#arr-exp", ok: () => secList().some((s) => s.kind === "drop") },
    { t: "Послухайте перехід у дроп: райзер, рол і удар. Графік енергії покаже, чи дроп найсильніший.", final: true },
  ] },
];
const LES = { cur: null, i: 0, timer: 0 };
function lesHighlight(sel) {
  $$(".les-hl").forEach((x) => x.classList.remove("les-hl"));
  if (!sel) return;
  const el = document.querySelector(sel);
  if (el) { el.classList.add("les-hl"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}
function lesRender() {
  let p = document.getElementById("les-pnl");
  if (!LES.cur) { if (p) p.remove(); lesHighlight(null); clearInterval(LES.timer); return; }
  if (!p) { p = document.createElement("div"); p.id = "les-pnl"; p.className = "les-pnl"; document.body.appendChild(p); }
  const L = LESSONS.find((x) => x.id === LES.cur), st = L.steps[LES.i];
  p.innerHTML = `<div class="les-h"><b>${escapeHtml(L.title)}</b><span class="muted small">крок ${LES.i + 1} з ${L.steps.length}</span><button class="x" id="les-x" data-hint="Завершити урок">&times;</button></div>
    <div class="les-bar"><i style="width:${Math.round(LES.i / (L.steps.length - 1) * 100)}%"></i></div>
    <p>${escapeHtml(st.t)}</p>
    <div class="les-a">${LES.i ? `<button class="btn ghost sm" id="les-b">← Назад</button>` : ""}${st.final ? `<button class="btn primary sm" id="les-done">Завершити</button>` : `<button class="btn ${st.ok ? "ghost" : "primary"} sm" id="les-n">${st.ok ? "Пропустити →" : "Далі →"}</button>`}</div>`;
  $("#les-x", p).onclick = () => { LES.cur = null; lesRender(); };
  if ($("#les-b", p)) $("#les-b", p).onclick = () => { LES.i--; lesRender(); };
  if ($("#les-n", p)) $("#les-n", p).onclick = () => { LES.i++; lesRender(); };
  if ($("#les-done", p)) $("#les-done", p).onclick = () => { const d = UIP.lessonsDone || (UIP.lessonsDone = []); if (!d.includes(L.id)) d.push(L.id); saveUI(); LES.cur = null; lesRender(); toast(`Урок «${L.title}» пройдено!`); };
  lesHighlight(st.sel);
  clearInterval(LES.timer);
  if (st.ok) LES.timer = setInterval(() => { let ok = false; try { ok = st.ok(); } catch (e) {} if (ok) { clearInterval(LES.timer); LES.i++; lesRender(); } else if (st.sel) lesHighlight(st.sel); }, 500);
}
function startLesson(id) {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте або створіть проєкт — уроки проходять у ньому.", true);
  LES.cur = id; LES.i = 0;
  lesRender();
}
const EAR = { mode: "int", score: 0, total: 0, q: null, level: 1 };
const EAR_INT = [[1, "мала секунда"], [2, "велика секунда"], [3, "мала терція"], [4, "велика терція"], [5, "чиста кварта"], [6, "тритон"], [7, "чиста квінта"], [8, "мала секста"], [9, "велика секста"], [10, "мала септима"], [11, "велика септима"], [12, "октава"]];
const EAR_CH = [["", "мажор"], ["m", "мінор"], ["dim", "зменшений"], ["aug", "збільшений"], ["7", "домінантсептакорд"], ["maj7", "великий мажорний септакорд"], ["m7", "мінорний септакорд"], ["sus4", "sus4"]];
function earNew() {
  const root = 52 + Math.floor(Math.random() * 12), lvl = EAR.level;
  if (EAR.mode === "int") {
    const pool = lvl === 1 ? [3, 4, 5, 7, 12] : lvl === 2 ? [2, 3, 4, 5, 7, 9, 12] : EAR_INT.map((x) => x[0]);
    const iv = pool[Math.floor(Math.random() * pool.length)];
    EAR.q = { notes: [[0, 0.8, root, 90], [0.85, 0.9, root + iv, 90]], ans: iv, opts: EAR_INT.filter((x) => pool.includes(x[0])) };
  } else if (EAR.mode === "chord") {
    const pool = lvl === 1 ? ["", "m"] : lvl === 2 ? ["", "m", "dim", "aug"] : EAR_CH.map((x) => x[0]);
    const k = pool[Math.floor(Math.random() * pool.length)];
    EAR.q = { notes: CH_IV[k].map((i) => [0, 1.6, root + i, 86]), ans: k, opts: EAR_CH.filter((x) => pool.includes(x[0])) };
  } else {
    const sc = [0, 2, 4, 5, 7, 9, 11], pool = lvl === 1 ? [0, 2, 4] : lvl === 2 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];
    const d = pool[Math.floor(Math.random() * pool.length)], ton = 60;
    EAR.q = { notes: [[0, 0.35, ton, 80], [0.38, 0.35, ton + 4, 80], [0.76, 0.35, ton + 7, 80], [1.14, 0.6, ton + 12, 80], [1.9, 1, ton + sc[d], 95]], ans: d, opts: pool.map((x) => [x, ["I (до)", "II (ре)", "III (мі)", "IV (фа)", "V (соль)", "VI (ля)", "VII (сі)"][x]]) };
  }
}
function earPlay() {
  if (EAR.q) hmPlayNotes(EAR.q.notes, hmInst("Піаніно (FM)"));
}
function openEar() {
  const m = careModalBox("ear-modal", "Тренування слуху", `<p class="muted">Слухайте й відповідайте. Почніть з рівня 1 — коли вгадуєте 8 з 10, переходьте вище. 10 хвилин на день помітно покращують слух уже за кілька тижнів.</p>
    <div class="arr-row"><div class="seg small">${[["int", "Інтервали"], ["chord", "Акорди"], ["deg", "Ступені гами"]].map(([k, l]) => `<button data-em="${k}" class="${EAR.mode === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <label>Рівень <select id="ear-l">${[1, 2, 3].map((l) => `<option ${EAR.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label><span class="spacer"></span><b id="ear-sc">${EAR.score} / ${EAR.total}</b></div>
    <div class="ear-q"><button class="btn primary" id="ear-play">▶ Слухати ще раз</button><span id="ear-fb" class="muted"></span></div>
    <div class="ear-opts" id="ear-opts"></div>
    <p class="muted small" id="ear-tip"></p>`);
  const tips = { int: "Підказка: велика терція — початок «мажорного» настрою; чиста квінта — «порожнє», сильне звучання; октава — та сама нота вище.", chord: "Підказка: мажор звучить світло, мінор — сумно, зменшений — тривожно, збільшений — «зависає».", deg: "Спершу звучить мажорний акорд-орієнтир, потім нота. Відчуйте, наскільки вона далеко від «дому» (I)." };
  const ask = () => {
    earNew();
    $("#ear-opts", m).innerHTML = EAR.q.opts.map(([v, l]) => `<button class="btn ghost" data-a="${v}">${escapeHtml(l)}</button>`).join("");
    $("#ear-fb", m).textContent = "";
    $("#ear-tip", m).textContent = tips[EAR.mode];
    $$("[data-a]", m).forEach((b) => b.onclick = () => {
      const ok = String(b.dataset.a) === String(EAR.q.ans);
      EAR.total++; if (ok) EAR.score++;
      $("#ear-sc", m).textContent = `${EAR.score} / ${EAR.total}`;
      const right = EAR.q.opts.find((x) => String(x[0]) === String(EAR.q.ans))[1];
      $("#ear-fb", m).innerHTML = ok ? `<span class="ok">Правильно — ${escapeHtml(right)}!</span>` : `<span class="warn">Ні, це ${escapeHtml(right)}.</span>`;
      b.classList.add(ok ? "ear-ok" : "ear-bad");
      setTimeout(() => { ask(); earPlay(); }, ok ? 900 : 1800);
    });
  };
  $$("[data-em]", m).forEach((b) => b.onclick = () => { EAR.mode = b.dataset.em; EAR.score = 0; EAR.total = 0; openEar(); });
  $("#ear-l", m).onchange = (e) => { EAR.level = +e.target.value; EAR.score = 0; EAR.total = 0; ask(); earPlay(); $("#ear-sc", m).textContent = "0 / 0"; };
  $("#ear-play", m).onclick = earPlay;
  ask();
  setTimeout(earPlay, 200);
}
const CHAL_PARTS = {
  limit: ["лише 4 доріжки", "без барабанів — тільки ритм інших інструментів", "лише один синтезатор на всі партії", "тільки звуки, які ви зробили ресемплінгом", "бас грає одну ноту всю пісню", "лише ноти пентатоніки", "кожна партія — не довше 2 тактів, далі повтори"],
  mood: ["нічне місто", "перше кохання", "дощовий ранок", "погоня", "літо біля моря", "космос", "старий фільм", "ностальгія за дитинством"],
  time: [15, 20, 30, 45],
};
function openChallenge() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const bpm = pick([70, 85, 90, 100, 120, 128, 140, 160]), mode = pick(["minor", "major"]), tonic = Math.floor(Math.random() * 12), lim = pick(CHAL_PARTS.limit), mood = pick(CHAL_PARTS.mood), mins = pick(CHAL_PARTS.time);
  const m = careModalBox("chal-modal", "Челендж", `<p class="muted">Обмеження змушують мислити творчо. Ось ваше завдання:</p>
    <div class="chal"><div><b>${bpm} BPM</b><span>темп</span></div><div><b>${NOTE_NAMES[tonic]} ${mode === "minor" ? "мінор" : "мажор"}</b><span>тональність</span></div><div><b>${mins} хв</b><span>на все</span></div></div>
    <p>Настрій: <b>${escapeHtml(mood)}</b><br>Обмеження: <b>${escapeHtml(lim)}</b></p>
    <div class="modal-actions"><button class="btn ghost" id="ch-again">🎲 Інше завдання</button><button class="btn primary" id="ch-go">Почати: створити проєкт</button></div>`);
  $("#ch-again", m).onclick = openChallenge;
  $("#ch-go", m).onclick = async () => {
    m.hidden = true;
    const r = await api.post("/api/projects/new", { title: `Челендж — ${mood}`, bpm, bpb: 4, bars: 32, tonic, mode });
    await openProject(r.pid);
    S.mix.lyrics = `Челендж: ${mood}. ${lim}. ${mins} хвилин.`;
    saveMix();
    const end = Date.now() + mins * 60000;
    clearInterval(LES.chal);
    LES.chal = setInterval(() => {
      const left = Math.max(0, end - Date.now()), el = document.getElementById("chal-timer") || Object.assign(document.body.appendChild(document.createElement("div")), { id: "chal-timer", className: "chal-timer" });
      el.textContent = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")} · ${lim}`;
      if (!left) { clearInterval(LES.chal); el.remove(); toast("Час челенджу вийшов! Послухайте, що вийшло, і експортуйте трек.", false); }
    }, 1000);
    toast(`Челендж почався: ${mins} хвилин. Таймер — у кутку екрана.`);
  };
}
function openLearnHub() {
  const done = UIP.lessonsDone || [];
  const m = careModalBox("learn-modal", "Навчання і натхнення", `<h5>Інтерактивні уроки</h5><p class="muted small">Урок підсвічує потрібні кнопки й сам переходить далі, коли крок виконано.</p>
    <div class="genre-grid">${LESSONS.map((l) => `<button class="hm-le" data-les="${l.id}"><b>${done.includes(l.id) ? "✓ " : ""}${escapeHtml(l.title)}</b><span>${escapeHtml(l.desc)}</span></button>`).join("")}</div>
    <h5>Практика</h5><div class="genre-grid">
      <button class="hm-le" id="lh-ear"><b>Тренування слуху</b><span>Інтервали, акорди, ступені гами</span></button>
      <button class="hm-le" id="lh-chal"><b>Челендж</b><span>Випадкові обмеження й таймер</span></button>
      <button class="hm-le" id="lh-packs"><b>Паки звуків</b><span>Синтезувати набір барабанів у бібліотеку</span></button>
      <button class="hm-le" id="lh-genre"><b>Шаблон жанру</b><span>Готовий старт у вибраному стилі</span></button></div>`);
  $$("[data-les]", m).forEach((b) => b.onclick = () => { m.hidden = true; startLesson(b.dataset.les); });
  $("#lh-ear", m).onclick = () => { m.hidden = true; openEar(); };
  $("#lh-chal", m).onclick = () => { m.hidden = true; openChallenge(); };
  $("#lh-packs", m).onclick = () => { m.hidden = true; openPacks(); };
  $("#lh-genre", m).onclick = () => { m.hidden = true; if (!S.B) return toast("Спершу відкрийте або створіть проєкт.", true); openGenrePicker(); };
}
(function learnUI() {
  const help = MENUS["Довідка"];
  if (help) MENUS["Довідка"] = () => [["Навчання: уроки, слух, челенджі…", openLearnHub], null].concat(help());
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Тренування слуху…", openEar], ["Паки звуків (синтез у бібліотеку)…", openPacks]]);
})();
