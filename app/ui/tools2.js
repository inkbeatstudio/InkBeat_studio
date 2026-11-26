"use strict";
const drumOpts = () => [["off", "— не чіпати —"], ["synth:kick", "Бочка (щільна)"], ["synth:punch", "Бочка (панчева)"], ["synth:808", "808 (довга)"], ["synth:snare", "Малий"], ["synth:clap", "Клап"], ["synth:hat", "Хет"]].concat((LIB.samples || []).map((s) => [s.file, "Мій: " + s.name]));
Object.assign(PROC, {
  deshimmer: {
    name: "Цифрові артефакти",
    icon: "✧",
    desc: "Прибирає «металеве шипіння», «булькання» й мерехтливі писки на верхах, що часто бувають у згенерованих і сильно стиснених треках та після розділення на доріжки. Звичайні верхи (тарілки, повітря голосу) майже не зачіпаються.",
    params: () => [{ k: "amount", label: "Сила", min: 0.1, max: 1, step: 0.01, pct: true, unit: "%" }, { k: "freq", label: "Від частоти", min: 3000, max: 12000, step: 100, unit: "Гц", log: true, hint: "Нижче цієї частоти нічого не змінюється" }],
    defaults: () => ({ amount: 0.6, freq: 6000 }),
    presets: { "Обережно": { amount: 0.4, freq: 7000 }, "Стандарт": { amount: 0.6, freq: 6000 }, "Сильно": { amount: 0.9, freq: 5000 } }
  },
  dereverb: {
    name: "Прибрати реверберацію",
    icon: "◌",
    desc: "Зменшує «кімнату» й хвости ревербу, вшиті в запис: голос стає ближчим і сухим, і ви можете поставити власний ревер. Найкраще працює на вокалі й соло-інструментах.",
    params: () => [{ k: "amount", label: "Сила", min: 0.1, max: 1, step: 0.01, pct: true, unit: "%" }, { k: "rt", label: "Довжина ревербу", min: 0.2, max: 3, step: 0.05, unit: "с", hint: "Приблизна довжина хвоста в записі: кімната 0.3–0.6 с, зал 1–2 с" }, { k: "floor_db", label: "Межа", min: -30, max: -3, step: 0.5, unit: "дБ", hint: "Наскільки глибоко можна приглушувати — менше значить сильніше, але можуть з'явитись артефакти" }],
    defaults: () => ({ amount: 0.6, rt: 0.6, floor_db: -14 }),
    presets: { "Кімната": { amount: 0.6, rt: 0.45, floor_db: -12 }, "Зал": { amount: 0.75, rt: 1.4, floor_db: -16 }, "Максимально сухо": { amount: 0.95, rt: 1.0, floor_db: -22 } }
  },
  highs: {
    name: "Відновити верхи",
    icon: "◠",
    desc: "Знаходить, де в записі «обрізані» високі частоти (стиснення, розділення), і делікатно відтворює верхні гармоніки: звук стає яскравішим і «дорожчим».",
    params: () => [{ k: "amount", label: "Сила", min: 0.1, max: 1, step: 0.01, pct: true, unit: "%" }, { k: "cutoff", label: "Межа (0 — авто)", min: 0, max: 18000, step: 100, unit: "Гц", hint: "0 — програма знайде межу сама" }],
    defaults: () => ({ amount: 0.5, cutoff: 0 }),
    presets: { "Легко": { amount: 0.3 }, "Стандарт": { amount: 0.5 }, "Яскраво": { amount: 0.85 } }
  },
  drumreplace: {
    name: "Заміна барабанів",
    icon: "◉",
    desc: "Знаходить кожен удар бочки, малого й хетів і точно під ним ставить чистий семпл — підкладкою до оригіналу або замість нього. Сила семпла повторює силу удару. Глухі барабани одразу звучать по-студійному.",
    params: () => [{ k: "kick", label: "Бочка", options: drumOpts() }, { k: "snare", label: "Малий", options: drumOpts() }, { k: "hat", label: "Хети", options: drumOpts() }, { k: "mode", label: "Режим", options: [["layer", "підкласти під оригінал"], ["only", "лише семпли (без оригіналу)"]] }, { k: "level_db", label: "Гучність семплів", min: -24, max: 6, step: 0.5, unit: "дБ" }, { k: "follow", label: "Сила за ударом", toggle: true, hint: "Гучність кожного семпла повторює силу оригінального удару" }, { k: "sensitivity", label: "Чутливість", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "Більше — знаходить і тихі удари (ґост-ноти)" }],
    defaults: () => ({ kick: "synth:kick", snare: "synth:snare", hat: "off", mode: "layer", level_db: -3, follow: true, sensitivity: 0.5 }),
    presets: { "Підсилити бочку й малий": { kick: "synth:punch", snare: "synth:snare", hat: "off", mode: "layer", level_db: -4 }, "Трап (808 + клап)": { kick: "synth:808", snare: "synth:clap", hat: "synth:hat", mode: "only", level_db: 0 }, "Лише бочка": { kick: "synth:kick", snare: "off", hat: "off", mode: "layer", level_db: -2 } }
  },
  quantize: {
    name: "Квантування аудіо",
    icon: "▦",
    desc: "Підтягує удари й атаки запису до сітки темпу, не змінюючи висоту: барабани, бас чи гітара грають рівно в долю. Сила 50–80% лишає живий ґрув.",
    params: () => [{ k: "grid_beats", label: "Сітка", options: [[1, "1/4"], [0.5, "1/8"], [0.25, "1/16"], [1 / 3, "1/8 тріоль"]] }, { k: "strength", label: "Сила", min: 0, max: 1, step: 0.01, pct: true, unit: "%" }],
    defaults: () => ({ grid_beats: 0.25, strength: 0.7, period: period(), pad: S.B.timing.pad }),
    presets: { "Живо": { strength: 0.5 }, "Рівно": { strength: 0.8 }, "Жорстко": { strength: 1 } }
  }
});
function autoCrossfade() {
  if (!S.mix) return false;
  const P = period();
  let changed = false;
  for (const t of tracksAll()) {
    const clips = mt(t.id).clips.filter((c) => !c.mute).slice().sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < clips.length; i++) {
      const a = clips[i], b = clips[i + 1], aEnd = a.start + a.dur / P;
      const ov = (aEnd - b.start) * P;
      if (ov > 0.005 && ov < Math.min(a.dur, b.dur) * 0.9) {
        if (Math.abs((a.fo || 0) - ov) > 1e-3 || Math.abs((b.fi || 0) - ov) > 1e-3) {
          a.fo = ov;
          b.fi = ov;
          a.xf = b.xf = true;
          changed = true;
        }
      }
    }
  }
  return changed;
}
const _afterEditX = afterEdit;
afterEdit = function(...args) {
  autoCrossfade();
  return _afterEditX.apply(this, args);
};
S.loop = { a: 0, b: 0, on: false };
function setLoop(a, b, on = true) {
  S.loop = { a: Math.max(0, Math.min(a, b)), b: Math.max(a, b), on: on && Math.abs(b - a) > 0.05 };
  draw();
  const lb = $("#t-loop");
  if (lb) lb.classList.toggle("on", S.loop.on);
}
function toggleLoop() {
  if (!S.loop.on && S.loop.b - S.loop.a < 0.05) {
    const sel = selectedClips();
    if (sel.length) {
      const P = period();
      setLoop(Math.min(...sel.map((x) => x.c.start)), Math.max(...sel.map((x) => x.c.start + x.c.dur / P)));
    } else {
      const s = secList().find((x) => S.playBeat >= x.start && S.playBeat < x.end);
      const bpb = S.B.timing.bpb, st = Math.floor(S.playBeat / bpb) * bpb;
      s ? setLoop(s.start, s.end) : setLoop(st, st + 4 * bpb);
    }
    toast("Цикл увімкнено. Змінити межі — Shift + тягнути по лінійці тактів. Вимкнути — L.");
    return;
  }
  setLoop(S.loop.a, S.loop.b, !S.loop.on);
}
const _scheduleL = schedule;
schedule = function() {
  _scheduleL();
  if (S.loop && S.loop.on && S.playing && !S.loopJumping) {
    const b = curBeat();
    if (b >= S.loop.b - 0.01) {
      S.loopJumping = true;
      setTimeout(() => {
        if (REC && REC.cur) {
          S.loopJumping = false;
          return;
        }
        stopPlay();
        S.playBeat = S.loop.a;
        play();
        S.loopJumping = false;
      }, 0);
    }
  }
};
const _drawTopL = drawTop;
drawTop = function() {
  _drawTopL();
  if (!S.loop || S.loop.b - S.loop.a < 0.05) return;
  const ctx = cvTop.getContext("2d"), dpr = devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const x0 = beatToX(S.loop.a), x1 = beatToX(S.loop.b);
  ctx.fillStyle = S.loop.on ? "rgba(79,209,197,.22)" : "rgba(139,145,163,.12)";
  ctx.fillRect(x0, 0, x1 - x0, 22);
  ctx.fillStyle = S.loop.on ? "#4fd1c5" : "#5d6374";
  ctx.fillRect(x0, 0, 2, 22);
  ctx.fillRect(x1 - 2, 0, 2, 22);
  ctx.restore();
};
(function loopUI() {
  const top = $(".tl-top");
  if (top) top.addEventListener("mousedown", (e) => {
    if (!e.shiftKey || e.button !== 0) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const r = top.getBoundingClientRect();
    const b0 = snapB(scrollBeat() + (e.clientX - r.left) / S.ppb);
    const mv = (ev) => setLoop(b0, snapB(scrollBeat() + (ev.clientX - r.left) / S.ppb));
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, true);
  const play = $("#t-play");
  if (play) {
    const b = document.createElement("button");
    b.className = "tbtn sm";
    b.id = "t-loop";
    b.dataset.hint = "Цикл (L): програвати фрагмент по колу. Межі — Shift + тягнути по лінійці тактів. Запис у вокальній студії при увімкненому циклі пише лише в межах циклу (панч), кожне коло — дубль";
    b.innerHTML = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6.5A4.5 4.5 0 0 1 12.2 5M13 9.5A4.5 4.5 0 0 1 3.8 11"/><path d="M12.5 2v3.2H9.3M3.5 14v-3.2h3.2"/></svg>`;
    b.onclick = toggleLoop;
    play.after(b);
  }
  document.addEventListener("keydown", (e) => {
    if (S.view !== "project" || typingIn(e.target) || e.ctrlKey || e.metaKey || e.altKey || KB.typing) return;
    if (e.key.toLowerCase() === "l") {
      e.preventDefault();
      toggleLoop();
    }
  });
  const edit = MENUS["Правка"];
  MENUS["Правка"] = () => edit().concat([null, ["Цикл увімк./вимк.  (L)", needProject(toggleLoop)], ["Цикл по вибраних кліпах", needProject(() => {
    S.loop = { a: 0, b: 0, on: false };
    toggleLoop();
  })]]);
})();
