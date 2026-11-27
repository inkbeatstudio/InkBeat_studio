"use strict";
const Plugins = (() => {
  const E = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DIVS = ["1/1", "1/2", "1/4.", "1/4", "1/4T", "1/8.", "1/8", "1/8T", "1/16.", "1/16", "1/32"];
  const FX = {
    eq: {
      name: "Еквалайзер",
      cat: "Тон",
      color: "#4fd1c5",
      desc: "Підсилює або прибирає частоти: бас, «бубніння», яскравість, повітря.",
      when: "Майже на кожній доріжці першим у ланцюжку: прибрати зайвий низ (HP), каламуть 200–400 Гц, додати чіткість 2–5 кГц.",
      tips: "Перетягуйте точки на графіку: вліво-вправо — частота, вгору-вниз — гучність смуги. Коліщатко миші над точкою — ширина (Q). Подвійний клік по точці — вимкнути/увімкнути смугу.",
      defaults: () => ({ out: 0, bands: [
        { type: "highpass", f: 40, g: 0, q: 0.71, on: false },
        { type: "lowshelf", f: 120, g: 0, q: 0.7, on: true },
        { type: "peaking", f: 400, g: 0, q: 1, on: true },
        { type: "peaking", f: 2500, g: 0, q: 1, on: true },
        { type: "highshelf", f: 8e3, g: 0, q: 0.7, on: true },
        { type: "lowpass", f: 18e3, g: 0, q: 0.71, on: false }
      ] }),
      params: [{ k: "out", label: "Вихід", min: -24, max: 12, step: 0.1, unit: "дБ", hint: "Загальна гучність після еквалайзера" }],
      presets: {
        "Чистий вокал": (p) => {
          p.bands[0] = { ...p.bands[0], on: true, f: 100 };
          p.bands[2].g = -3;
          p.bands[2].f = 300;
          p.bands[3].g = 3;
          p.bands[3].f = 3e3;
          p.bands[4].g = 2.5;
        },
        "Телефон": (p) => {
          p.bands[0] = { ...p.bands[0], on: true, f: 450, q: 1.2 };
          p.bands[5] = { ...p.bands[5], on: true, f: 2800, q: 1.2 };
          p.bands[3].g = 6;
          p.bands[3].f = 1500;
        },
        "Тепліше": (p) => {
          p.bands[1].g = 3;
          p.bands[4].g = -3;
        },
        "Яскравіше": (p) => {
          p.bands[4].g = 4;
          p.bands[3].g = 2;
        },
        "Прибрати каламуть": (p) => {
          p.bands[2].g = -5;
          p.bands[2].f = 300;
          p.bands[2].q = 1.4;
        },
        "Бас: щільний низ": (p) => {
          p.bands[0] = { ...p.bands[0], on: true, f: 30 };
          p.bands[1].g = 3;
          p.bands[1].f = 80;
          p.bands[2].g = -3;
          p.bands[2].f = 250;
        }
      }
    },
    comp: {
      name: "Компресор",
      cat: "Динаміка",
      color: "#ffb547",
      desc: "Вирівнює гучність: тихе стає ближчим до гучного, звук щільнішає.",
      when: "Вокал (3:1, ~5 дБ зниження), барабани (повільна атака — більше удару), бас (рівний низ).",
      tips: "Поріг — з якого рівня починається стиснення. Ratio — наскільки сильно. Атака — як швидко реагує (повільна лишає удар). Індикатор GR показує, на скільки дБ зараз зменшується гучність.",
      defaults: () => ({ threshold: -20, ratio: 3, knee: 6, attack: 10, release: 120, makeup: 4 }),
      params: [
        { k: "threshold", label: "Поріг", min: -60, max: 0, step: 0.5, unit: "дБ", hint: "Рівень, вище якого вмикається стиснення" },
        { k: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, unit: ":1", hint: "Сила стиснення: 2 — м'яко, 4 — помітно, 10+ — лімітування" },
        { k: "knee", label: "Коліно", min: 0, max: 30, step: 1, unit: "дБ", hint: "Плавність переходу біля порогу" },
        { k: "attack", label: "Атака", min: 0.1, max: 200, step: 0.1, unit: "мс", log: true, hint: "Як швидко компресор реагує. Більше — лишається удар/атака звуку" },
        { k: "release", label: "Відпуск", min: 10, max: 1e3, step: 1, unit: "мс", log: true, hint: "Як швидко компресор відпускає" },
        { k: "makeup", label: "Підсилення", min: 0, max: 24, step: 0.1, unit: "дБ", hint: "Повертає гучність після стиснення" }
      ],
      presets: {
        "Вокал: м'яко": { threshold: -18, ratio: 2.5, knee: 8, attack: 8, release: 120, makeup: 3 },
        "Вокал: щільно (реп)": { threshold: -24, ratio: 5, knee: 4, attack: 3, release: 80, makeup: 7 },
        "Барабани: удар": { threshold: -18, ratio: 4, knee: 2, attack: 25, release: 80, makeup: 4 },
        "Бас: рівний": { threshold: -22, ratio: 4, knee: 6, attack: 15, release: 150, makeup: 5 },
        "Мікс-клей": { threshold: -12, ratio: 2, knee: 10, attack: 30, release: 200, makeup: 2 }
      }
    },
    gate: {
      name: "Гейт",
      cat: "Динаміка",
      color: "#ffb547",
      desc: "Глушить звук, коли він тихіший за поріг: прибирає шум і протікання між фразами.",
      when: "Вокал між рядками, барабани (прибрати дзвін між ударами), будь-яка доріжка з шумом у паузах.",
      tips: "Поставте поріг трохи вище рівня шуму в паузах. Утримання не дає обрізати хвости слів. Діапазон — наскільки сильно глушити (60 дБ = майже тиша).",
      defaults: () => ({ threshold: -45, attack: 2, hold: 50, release: 150, range: 60 }),
      params: [
        { k: "threshold", label: "Поріг", min: -90, max: 0, step: 0.5, unit: "дБ", hint: "Тихіше за цей рівень — гейт закривається" },
        { k: "attack", label: "Атака", min: 0.1, max: 50, step: 0.1, unit: "мс", hint: "Як швидко відкривається" },
        { k: "hold", label: "Утримання", min: 0, max: 500, step: 1, unit: "мс", hint: "Скільки тримати відкритим після спаду" },
        { k: "release", label: "Відпуск", min: 5, max: 1e3, step: 1, unit: "мс", log: true, hint: "Як плавно закривається" },
        { k: "range", label: "Діапазон", min: 3, max: 90, step: 1, unit: "дБ", hint: "Наскільки глушити в закритому стані" }
      ],
      presets: { "Вокал: паузи": { threshold: -42, attack: 2, hold: 80, release: 180, range: 30 }, "Барабани: сухо": { threshold: -30, attack: 0.5, hold: 20, release: 60, range: 50 } }
    },
    limiter: {
      name: "Лімітер",
      cat: "Динаміка",
      color: "#ffb547",
      desc: "Не дає звуку перевищити стелю і піднімає загальну гучність.",
      when: "Останнім на Master або на доріжці, яка «стрибає» по гучності.",
      tips: "Піднімайте «Вхід», поки індикатор GR не показує 2–4 дБ на найгучніших місцях. Стеля −1 дБ — безпечно для стрімінгу.",
      defaults: () => ({ gain: 3, ceiling: -1, release: 80 }),
      params: [
        { k: "gain", label: "Вхід", min: 0, max: 24, step: 0.1, unit: "дБ", hint: "Наскільки підняти гучність перед лімітуванням" },
        { k: "ceiling", label: "Стеля", min: -12, max: 0, step: 0.1, unit: "дБ", hint: "Максимальний рівень на виході" },
        { k: "release", label: "Відпуск", min: 5, max: 500, step: 1, unit: "мс", log: true, hint: "Швидкість відновлення" }
      ],
      presets: { "Master: гучно": { gain: 6, ceiling: -1, release: 60 }, "Master: делікатно": { gain: 2, ceiling: -1, release: 120 } }
    },
    drive: {
      name: "Сатурація / Дисторшн",
      cat: "Колір",
      color: "#f43f5e",
      desc: "Додає гармоніки: від теплої «лампової» щільності до жорсткого перевантаження.",
      when: "Бас (щоб чути на телефоні), вокал (легкий тепло-ефект), гітари, барабани (агресія).",
      tips: "Для тепла: Tube, 3–8 дБ, Mix 30–50%. Для жорсткості: Hard. Тон зрізає різкі верхи після перевантаження.",
      defaults: () => ({ type: "tube", drive: 6, tone: 9e3, output: -3, mix: 0.5 }),
      params: [
        { k: "type", label: "Тип", options: [["soft", "М'яка"], ["tube", "Лампа"], ["hard", "Жорстка"], ["fold", "Фолд"]], hint: "Характер перевантаження" },
        { k: "drive", label: "Драйв", min: 0, max: 36, step: 0.1, unit: "дБ", hint: "Сила перевантаження" },
        { k: "tone", label: "Тон", min: 500, max: 2e4, step: 1, unit: "Гц", log: true, hint: "Зріз верхів після перевантаження" },
        { k: "output", label: "Вихід", min: -24, max: 6, step: 0.1, unit: "дБ", hint: "Компенсація гучності" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Суміш обробленого й чистого звуку" }
      ],
      presets: {
        "Теплий бас": { type: "tube", drive: 8, tone: 6e3, output: -4, mix: 0.45 },
        "Вокал: тепло": { type: "soft", drive: 4, tone: 12e3, output: -2, mix: 0.3 },
        "Гітара: кранч": { type: "hard", drive: 18, tone: 5e3, output: -10, mix: 1 },
        "Барабани: агресія": { type: "tube", drive: 12, tone: 1e4, output: -6, mix: 0.4 }
      }
    },
    filter: {
      name: "Фільтр",
      cat: "Тон",
      color: "#4fd1c5",
      desc: "Зрізає низ або верх, з рухом (LFO) — для переходів, «підводного» звуку, вау-ефекту.",
      when: "Інтро та переходи (звук «з-за стіни»), рух на синтах, телефонний ефект.",
      tips: "Low-pass + низька частота = приглушено. LFO рухає частоту з темпом пісні (Sync).",
      defaults: () => ({ type: "lowpass", cutoff: 2e3, q: 1, rate: 1, sync: true, rate_div: "1/2", depth: 0, mix: 1 }),
      params: [
        { k: "type", label: "Тип", options: [["lowpass", "Low-pass"], ["highpass", "High-pass"], ["bandpass", "Band-pass"], ["notch", "Notch"]], hint: "Що пропускати" },
        { k: "cutoff", label: "Частота", min: 20, max: 2e4, step: 1, unit: "Гц", log: true, hint: "Частота зрізу" },
        { k: "q", label: "Резонанс", min: 0.1, max: 20, step: 0.01, unit: "", log: true, hint: "Підсилення біля частоти зрізу" },
        { k: "sync", label: "Sync", toggle: true, hint: "LFO в темпі пісні" },
        { k: "rate_div", label: "Ноти", options: DIVS.map((d) => [d, d]), hint: "Швидкість LFO у нотах" },
        { k: "rate", label: "Швидк.", min: 0.05, max: 20, step: 0.01, unit: "Гц", log: true, hint: "Швидкість LFO (без Sync)" },
        { k: "depth", label: "Глибина", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Наскільки LFO рухає частоту" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Суміш" }
      ],
      presets: {
        "З-за стіни": { type: "lowpass", cutoff: 600, q: 0.8, sync: true, rate_div: "1/2", rate: 1, depth: 0, mix: 1 },
        "Рух 1/4": { type: "lowpass", cutoff: 1500, q: 4, sync: true, rate_div: "1/4", rate: 1, depth: 0.8, mix: 1 },
        "Тонкий (HP)": { type: "highpass", cutoff: 700, q: 0.7, sync: true, rate_div: "1/2", rate: 1, depth: 0, mix: 1 }
      }
    },
    chorus: {
      name: "Хорус / Розширення",
      cat: "Простір",
      color: "#a78bfa",
      desc: "Робить звук ширшим і «товстішим», ніби грає кілька інструментів.",
      when: "Синти, пади, клавішні, бек-вокал. На бас — обережно.",
      tips: "Більша глибина — сильніше «плавання». Mix 30–50% — природне розширення.",
      defaults: () => ({ rate: 0.8, depth: 3, delay: 12, mix: 0.4 }),
      params: [
        { k: "rate", label: "Швидк.", min: 0.05, max: 8, step: 0.01, unit: "Гц", log: true, hint: "Швидкість модуляції" },
        { k: "depth", label: "Глибина", min: 0, max: 10, step: 0.1, unit: "мс", hint: "Сила модуляції" },
        { k: "delay", label: "Затримка", min: 3, max: 35, step: 0.1, unit: "мс", hint: "Базова затримка копій" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Суміш" }
      ],
      presets: { "Широкий пад": { rate: 0.4, depth: 4, delay: 15, mix: 0.5 }, "Легкий": { rate: 1.2, depth: 1.5, delay: 9, mix: 0.25 } }
    },
    tune: {
      name: "Автотюн",
      cat: "Голос",
      color: "#ec4899",
      desc: "Визначає висоту голосу в реальному часі й підтягує кожну ноту до найближчої ноти тональності. Від ледь помітної корекції до роботизованого ефекту Hard-tune.",
      when: "Будь-який вокал: щоб прибрати фальш, вирівняти бек-вокал або отримати сучасний «автотюн-звук» у реп, поп, трап.",
      tips: "Тональність «з пісні» береться автоматично. Швидкість 40–80 мс — природно; 0–10 мс — ефект Hard-tune. «Природність» не чіпає відхилення, менші за вказану кількість центів (зберігає вібрато). «Зсув тону» ±12 — хелій або демонічний голос. Ставте першим у ланцюжку.",
      defaults: () => ({ key: "auto", scale: "auto", speed: 40, amount: 1, human: 10, shift: 0, mix: 1, gate: -55 }),
      params: [
        { k: "key", label: "Тоніка", options: [["auto", "з пісні"]].concat(["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map((n, i) => [String(i), n])), hint: "Тоніка тональності, до якої підтягується голос" },
        { k: "scale", label: "Лад", options: [["auto", "з пісні"], ["major", "мажор"], ["minor", "мінор"], ["harmonic", "гармонічний мінор"], ["pmaj", "пентатоніка мажор"], ["pmin", "пентатоніка мінор"], ["blues", "блюз"], ["chromatic", "хроматика (усі ноти)"]], hint: "Які ноти дозволені" },
        { k: "speed", label: "Швидкість", min: 0, max: 200, step: 1, unit: "мс", hint: "Як швидко голос підтягується до ноти: 0 — миттєво (Hard-tune), 50+ — природно" },
        { k: "amount", label: "Сила", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Наскільки сильно виправляти: 100% — точно в ноту" },
        { k: "human", label: "Природність", min: 0, max: 50, step: 1, unit: "ц", hint: "Відхилення, менші за це (у центах), не виправляються — зберігається жива інтонація й вібрато" },
        { k: "shift", label: "Зсув тону", min: -12, max: 12, step: 1, unit: "пт", hint: "Зсунути весь голос на півтони: +12 — хелій, −12 — демон" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Скільки обробленого голосу" }
      ],
      presets: {
        "Природний": { speed: 70, amount: 0.8, human: 18, shift: 0, mix: 1 },
        "Поп: щільно": { speed: 25, amount: 1, human: 6, shift: 0, mix: 1 },
        "Hard-tune (T-Pain)": { speed: 0, amount: 1, human: 0, shift: 0, mix: 1 },
        "Робот": { speed: 0, amount: 1, human: 0, shift: 0, mix: 1, scale: "pmin" },
        "Хелій": { speed: 40, amount: 0.6, human: 10, shift: 12, mix: 1 },
        "Демон": { speed: 40, amount: 0.6, human: 10, shift: -12, mix: 1 },
        "Октава вниз (дабл)": { speed: 30, amount: 1, human: 5, shift: -12, mix: 0.45 }
      }
    },
    harm: {
      name: "Гармонайзер",
      cat: "Голос",
      color: "#d946ef",
      desc: "Додає до голосу голоси-гармонії: терцію, квінту, октаву — точно в тональності пісні. Один голос звучить як хор чи бек-вокал.",
      when: "Приспіви, хуки, ад-ліби, бек-вокал; щоб швидко отримати «дорогий» багатоголосий звук без перезаписів.",
      tips: "Інтервали рахуються за ступенями ладу: «терція вгору» завжди звучить у тональності. Рівень 50–70%, ширина 60%+ розводить голоси ліворуч і праворуч. Найкраще звучить на чистому, витягнутому вокалі.",
      defaults: () => ({ key: "auto", scale: "auto", v1: 2, v2: 0, v3: 0, level: 0.6, spread: 0.6, gate: -55 }),
      params: [
        { k: "v1", label: "Голос 1", options: [["0", "вимк."], ["2", "терція вгору"], ["4", "квінта вгору"], ["7", "октава вгору"], ["-2", "терція вниз"], ["-3", "кварта вниз"], ["-5", "секста вниз"], ["-7", "октава вниз"]], hint: "Перший голос-гармонія" },
        { k: "v2", label: "Голос 2", options: [["0", "вимк."], ["2", "терція вгору"], ["4", "квінта вгору"], ["7", "октава вгору"], ["-2", "терція вниз"], ["-3", "кварта вниз"], ["-5", "секста вниз"], ["-7", "октава вниз"]], hint: "Другий голос" },
        { k: "v3", label: "Голос 3", options: [["0", "вимк."], ["2", "терція вгору"], ["4", "квінта вгору"], ["7", "октава вгору"], ["-2", "терція вниз"], ["-3", "кварта вниз"], ["-5", "секста вниз"], ["-7", "октава вниз"]], hint: "Третій голос" },
        { k: "level", label: "Рівень", min: 0, max: 1.2, step: 0.01, unit: "%", pct: true, hint: "Гучність гармоній відносно основного голосу" },
        { k: "spread", label: "Ширина", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Розведення голосів по стерео" },
        { k: "key", label: "Тоніка", options: [["auto", "з пісні"]].concat(["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map((n, i) => [String(i), n])) },
        { k: "scale", label: "Лад", options: [["auto", "з пісні"], ["major", "мажор"], ["minor", "мінор"], ["harmonic", "гармонічний мінор"], ["pmaj", "пентатоніка мажор"], ["pmin", "пентатоніка мінор"]] }
      ],
      presets: {
        "Терція вгору": { v1: 2, v2: 0, v3: 0, level: 0.6, spread: 0.5 },
        "Хор: терція + квінта": { v1: 2, v2: 4, v3: 0, level: 0.55, spread: 0.8 },
        "Октави": { v1: 7, v2: -7, v3: 0, level: 0.5, spread: 0.6 },
        "Бек-вокал знизу": { v1: -2, v2: -5, v3: 0, level: 0.5, spread: 0.7 },
        "Повний хор": { v1: 2, v2: 4, v3: -3, level: 0.5, spread: 0.9 }
      }
    },
    deess: {
      name: "Де-есер",
      cat: "Голос",
      color: "#f9a8d4",
      desc: "Приглушує різкі «с», «ш», «ц» тільки в ту мить, коли вони звучать, решта голосу не змінюється.",
      when: "Вокал після компресора та яскравого еквалайзера, коли шиплячі ріжуть вухо.",
      tips: "Частота 5–8 кГц (жіночий голос вище, чоловічий нижче). Опускайте поріг, поки індикатор не показує 3–6 дБ на шиплячих.",
      defaults: () => ({ freq: 6500, threshold: -30, amount: 0.6 }),
      params: [
        { k: "freq", label: "Частота", min: 2500, max: 12e3, step: 10, unit: "Гц", log: true, hint: "Звідки починаються шиплячі" },
        { k: "threshold", label: "Поріг", min: -60, max: 0, step: 0.5, unit: "дБ", hint: "Нижче — спрацьовує частіше" },
        { k: "amount", label: "Глибина", min: 0, max: 0.9, step: 0.01, unit: "%", pct: true, hint: "Максимальне приглушення" }
      ],
      presets: { "Чоловічий вокал": { freq: 5500, threshold: -32, amount: 0.6 }, "Жіночий вокал": { freq: 7500, threshold: -32, amount: 0.6 }, "Сильно": { freq: 6000, threshold: -40, amount: 0.8 } }
    },
    pitchfx: {
      name: "Дабл (подвоєння)",
      cat: "Голос",
      color: "#f472b6",
      desc: "Імітує другий дубль: дві злегка розстроєні копії ліворуч і праворуч.",
      when: "Приспів, бек-вокал, щоб голос звучав ширше й «дорожче».",
      tips: "Розстройка 10–20 — природно, 30+ — помітний ефект. Mix 30–40% для основного вокалу.",
      defaults: () => ({ time: 18, detune: 12, mix: 0.35 }),
      params: [
        { k: "time", label: "Затримка", min: 5, max: 40, step: 0.1, unit: "мс", hint: "Відставання дубля" },
        { k: "detune", label: "Розстройка", min: 0, max: 50, step: 0.1, unit: "", hint: "Різниця висоти між копіями" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Гучність дублів" }
      ],
      presets: { "Природний дабл": { time: 18, detune: 10, mix: 0.3 }, "Широкий приспів": { time: 24, detune: 22, mix: 0.45 } }
    },
    delay: {
      name: "Дилей (ехо)",
      cat: "Простір",
      color: "#a78bfa",
      desc: "Повтори звуку в темпі пісні; пінг-понг кидає їх ліворуч-праворуч.",
      when: "Вокал (кінці фраз), соло-синти, гітари. Зазвичай Mix 10–25%.",
      tips: "1/8. (з крапкою) і 1/4 — найпопулярніші. Фільтри HP/LP роблять ехо м'якшим, щоб не заважало голосу.",
      defaults: () => ({ sync: true, div: "1/8.", ms: 300, feedback: 0.3, pingpong: true, hp: 300, lp: 6e3, mix: 0.18 }),
      params: [
        { k: "sync", label: "Sync", toggle: true, hint: "Час ехо в нотах темпу" },
        { k: "div", label: "Ноти", options: DIVS.map((d) => [d, d]), hint: "Тривалість між повторами" },
        { k: "ms", label: "Час", min: 10, max: 2e3, step: 1, unit: "мс", log: true, hint: "Час у мілісекундах (без Sync)" },
        { k: "feedback", label: "Повтори", min: 0, max: 0.95, step: 0.01, unit: "%", pct: true, hint: "Скільки разів повторюється" },
        { k: "pingpong", label: "Пінг-понг", toggle: true, hint: "Ліво-право" },
        { k: "hp", label: "HP", min: 20, max: 2e3, step: 1, unit: "Гц", log: true, hint: "Прибрати низ з ехо" },
        { k: "lp", label: "LP", min: 1e3, max: 2e4, step: 1, unit: "Гц", log: true, hint: "Прибрати верх з ехо" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Гучність ехо" }
      ],
      presets: {
        "Вокал 1/8.": { sync: true, div: "1/8.", ms: 300, feedback: 0.28, pingpong: true, hp: 350, lp: 5500, mix: 0.15 },
        "Слеп-бек": { sync: false, div: "1/8", ms: 110, feedback: 0.05, pingpong: false, hp: 200, lp: 8e3, mix: 0.2 },
        "Ефірний": { sync: true, div: "1/4", ms: 500, feedback: 0.55, pingpong: true, hp: 400, lp: 4e3, mix: 0.3 }
      }
    },
    reverb: {
      name: "Ревербератор",
      cat: "Простір",
      color: "#a78bfa",
      desc: "Простір: від маленької кімнати до величезного залу.",
      when: "Майже на всьому, крім баса й бочки. Вокал 10–25%, пади більше.",
      tips: "Розмір (час) — довжина хвоста. Pre-delay відділяє голос від ревербу (чіткість). Low cut прибирає каламуть з ревербу.",
      defaults: () => ({ decay: 1.8, predelay: 20, damping: 0.5, width: 1, lowcut: 250, mix: 0.2 }),
      params: [
        { k: "decay", label: "Розмір", min: 0.2, max: 8, step: 0.01, unit: "с", log: true, hint: "Тривалість хвоста ревербу" },
        { k: "predelay", label: "Pre-delay", min: 0, max: 200, step: 1, unit: "мс", hint: "Пауза перед ревербом" },
        { k: "damping", label: "Темність", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Наскільки швидко гаснуть верхи" },
        { k: "width", label: "Ширина", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Стерео ширина хвоста" },
        { k: "lowcut", label: "Low cut", min: 20, max: 1e3, step: 1, unit: "Гц", log: true, hint: "Прибрати низ з ревербу" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Гучність ревербу" }
      ],
      presets: {
        "Кімната": { decay: 0.7, predelay: 8, damping: 0.6, width: 0.8, lowcut: 200, mix: 0.15 },
        "Плейт (вокал)": { decay: 1.6, predelay: 30, damping: 0.35, width: 1, lowcut: 300, mix: 0.18 },
        "Зал": { decay: 3.2, predelay: 25, damping: 0.5, width: 1, lowcut: 250, mix: 0.25 },
        "Собор": { decay: 6, predelay: 40, damping: 0.4, width: 1, lowcut: 300, mix: 0.35 }
      }
    },
    stereo: {
      name: "Стерео / Панорама",
      cat: "Простір",
      color: "#a78bfa",
      desc: "Ширина стерео (від моно до дуже широкого), панорама і гучність.",
      when: "Бас і бочку — у моно (ширина 0). Пади, бек-вокал — ширше.",
      tips: "Ширина 0% — моно, 100% — як є, 200% — розширено. Попередній перегляд моно, тож ширину найкраще чути в експорті.",
      defaults: () => ({ width: 1, pan: 0, gain: 0 }),
      params: [
        { k: "width", label: "Ширина", min: 0, max: 2, step: 0.01, unit: "%", pct: true, hint: "0 — моно, 1 — оригінал, 2 — широко" },
        { k: "pan", label: "Панорама", min: -1, max: 1, step: 0.01, unit: "", hint: "Ліво / право" },
        { k: "gain", label: "Гучність", min: -24, max: 12, step: 0.1, unit: "дБ", hint: "Гучність" }
      ],
      presets: { "Моно": { width: 0, pan: 0, gain: 0 }, "Широко": { width: 1.6, pan: 0, gain: 0 } }
    },
    tremolo: {
      name: "Тремоло / Автопан",
      cat: "Рух",
      color: "#22c55e",
      desc: "Пульсація гучності або рух ліво-право в темпі пісні.",
      when: "Клавішні (Rhodes), гітари, пади — щоб додати руху.",
      tips: "Режим «Панорама» — звук гуляє між колонками. Форма «square» — різкі «чоп»-пульсації.",
      defaults: () => ({ mode: "volume", shape: "sine", sync: true, div: "1/8", rate: 5, depth: 0.5 }),
      params: [
        { k: "mode", label: "Режим", options: [["volume", "Гучність"], ["pan", "Панорама"]], hint: "Що пульсує" },
        { k: "shape", label: "Форма", options: [["sine", "Синус"], ["triangle", "Трикутник"], ["square", "Квадрат"], ["sawtooth", "Пила"]], hint: "Форма LFO" },
        { k: "sync", label: "Sync", toggle: true, hint: "У темпі" },
        { k: "div", label: "Ноти", options: DIVS.map((d) => [d, d]), hint: "Швидкість у нотах" },
        { k: "rate", label: "Швидк.", min: 0.1, max: 20, step: 0.01, unit: "Гц", log: true, hint: "Швидкість (без Sync)" },
        { k: "depth", label: "Глибина", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Сила ефекту" }
      ],
      presets: { "Rhodes": { mode: "pan", shape: "sine", sync: true, div: "1/4", rate: 3, depth: 0.6 }, "Чоп 1/16": { mode: "volume", shape: "square", sync: true, div: "1/16", rate: 8, depth: 0.9 } }
    },
    lofi: {
      name: "Lo-Fi / Вініл",
      cat: "Колір",
      color: "#f43f5e",
      desc: "Зменшує розрядність і частоту, додає тріск вінілу та «пливучу» плівку.",
      when: "Лоу-фай біти, ретро-звук, вокальні вставки, інтро.",
      tips: "Біти 8–10 і пониження 2–4 — класичний лоу-фай. Тріск 0.3 — ледь чутний вініл.",
      defaults: () => ({ bits: 10, down: 2, tone: 7e3, noise: 0.3, wow: 0.3, mix: 0.7 }),
      params: [
        { k: "bits", label: "Біти", min: 3, max: 16, step: 1, unit: "", hint: "Розрядність (менше — грубіше)" },
        { k: "down", label: "Пониження", min: 1, max: 16, step: 1, unit: "×", hint: "Пониження частоти дискретизації" },
        { k: "tone", label: "Тон", min: 800, max: 2e4, step: 1, unit: "Гц", log: true, hint: "Приглушити верхи" },
        { k: "noise", label: "Тріск", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Вініловий тріск і шипіння" },
        { k: "wow", label: "Плівка", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "«Пливуча» висота як на старій плівці" },
        { k: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "%", pct: true, hint: "Суміш" }
      ],
      presets: { "Касета": { bits: 12, down: 1, tone: 9e3, noise: 0.2, wow: 0.6, mix: 0.8 }, "Старий вініл": { bits: 10, down: 2, tone: 6e3, noise: 0.6, wow: 0.3, mix: 0.9 }, "8-біт": { bits: 6, down: 6, tone: 12e3, noise: 0, wow: 0, mix: 1 } }
    }
  };
  const CHAINS = {
    "Автотюн: поп": [["tune", "Поп: щільно"], ["eq", "Чистий вокал"], ["deess", "Чоловічий вокал"], ["comp", "Вокал: м'яко"], ["delay", "Вокал 1/8."], ["reverb", "Плейт (вокал)"]],
    "Природний живий вокал": [["gate", "Вокал: паузи"], ["tune", "Природний"], ["eq", "Чистий вокал"], ["deess", "Чоловічий вокал"], ["comp", "Вокал: м'яко"], ["reverb", "Кімната"]],
    "Hard-tune (T-Pain)": [["tune", "Hard-tune (T-Pain)"], ["eq", "Чистий вокал"], ["comp", "Вокал: щільно (реп)"], ["pitchfx", "Природний дабл"], ["delay", "Вокал 1/8."], ["reverb", "Плейт (вокал)"]],
    "Реп з автотюном": [["tune", "Поп: щільно"], ["eq", "Чистий вокал"], ["deess", "Чоловічий вокал"], ["comp", "Вокал: щільно (реп)"], ["drive", "Вокал: тепло"], ["delay", "Слеп-бек"], ["reverb", "Кімната"]],
    "Бек-вокал: хор": [["tune", "Природний"], ["harm", "Хор: терція + квінта"], ["eq", "Чистий вокал"], ["comp", "Вокал: м'яко"], ["pitchfx", "Широкий приспів"], ["reverb", "Зал"]],
    "Хелій": [["tune", "Хелій"], ["eq", "Чистий вокал"], ["reverb", "Плейт (вокал)"]],
    "Демон": [["tune", "Демон"], ["drive", "Вокал: тепло"], ["reverb", "Зал"]],
    "Робот": [["tune", "Робот"], ["lofi", "Касета"], ["delay", "Слеп-бек"]],
    "Поп-вокал": [["eq", "Чистий вокал"], ["comp", "Вокал: м'яко"], ["pitchfx", "Природний дабл"], ["delay", "Вокал 1/8."], ["reverb", "Плейт (вокал)"]],
    "Реп-вокал": [["eq", "Чистий вокал"], ["comp", "Вокал: щільно (реп)"], ["drive", "Вокал: тепло"], ["delay", "Слеп-бек"], ["reverb", "Кімната"]],
    "Ефірний вокал": [["eq", "Чистий вокал"], ["comp", "Вокал: м'яко"], ["pitchfx", "Широкий приспів"], ["delay", "Ефірний"], ["reverb", "Зал"]],
    "Телефон / рація": [["eq", "Телефон"], ["drive", "Гітара: кранч"], ["comp", "Вокал: щільно (реп)"]],
    "Лоу-фай вокал": [["eq", "Тепліше"], ["lofi", "Касета"], ["reverb", "Кімната"]],
    "Барабани: панч": [["eq", "Яскравіше"], ["comp", "Барабани: удар"], ["drive", "Барабани: агресія"]],
    "Бас: щільний": [["eq", "Бас: щільний низ"], ["comp", "Бас: рівний"], ["drive", "Теплий бас"], ["stereo", "Моно"]],
    "Клавішні: широкі": [["eq", "Прибрати каламуть"], ["chorus", "Легкий"], ["tremolo", "Rhodes"], ["reverb", "Зал"]],
    "Master: готовий мікс": [["eq", "Тепліше"], ["comp", "Мікс-клей"], ["limiter", "Master: гучно"]]
  };
  function newFx(type, presetName) {
    const def = FX[type];
    const params = def.defaults();
    if (presetName && def.presets[presetName]) {
      const pr = def.presets[presetName];
      if (typeof pr === "function") pr(params);
      else Object.assign(params, clone(pr));
    }
    return { id: "fx" + Math.random().toString(36).slice(2, 8), type, on: true, params, preset: presetName || null };
  }
  const A = (a, d, s, r) => ({ a, d, s, r });
  const base = (o) => Object.assign({
    osc: [{ type: "sawtooth", oct: 0, detune: 0, gain: 0.6 }],
    unison: 1,
    spread: 0,
    sub: 0,
    noise: 0,
    fm: { ratio: 1, index: 0, decay: 0.3, sustain: 0 },
    filter: { type: "lowpass", cutoff: 4e3, q: 0.8, env: 0, keytrack: 0.3 },
    amp: A(5e-3, 0.3, 0.7, 0.2),
    fenv: A(5e-3, 0.3, 0.3, 0.2),
    pitchEnv: { semi: 0, decay: 0.05 },
    drive: 0,
    gain: 0.3,
    mono: false
  }, o);
  const SYNTH_PRESETS = {
    "Клавішні": {
      "Піаніно (FM)": base({ osc: [{ type: "sine", oct: 0, gain: 0.8 }, { type: "triangle", oct: 1, gain: 0.15 }], fm: { ratio: 1, index: 1.6, decay: 0.6, sustain: 0.1 }, filter: { type: "lowpass", cutoff: 5e3, q: 0.5, env: 0, keytrack: 0.5 }, amp: A(2e-3, 1.6, 0, 0.3), gain: 0.35 }),
      "E-Piano (Rhodes)": base({ osc: [{ type: "sine", oct: 0, gain: 0.8 }], fm: { ratio: 14, index: 0.35, decay: 0.25, sustain: 0.05 }, filter: { type: "lowpass", cutoff: 6e3, q: 0.5, env: 0, keytrack: 0 }, amp: A(2e-3, 2.2, 0.15, 0.4), gain: 0.38 }),
      "Орган": base({ osc: [{ type: "sine", oct: 0, gain: 0.5 }, { type: "sine", oct: 1, gain: 0.35 }, { type: "sine", oct: -1, gain: 0.35 }, { type: "sine", oct: 2, gain: 0.15 }], filter: { type: "lowpass", cutoff: 8e3, q: 0.4, env: 0, keytrack: 0 }, amp: A(0.01, 0.1, 1, 0.08), gain: 0.22 }),
      "Клавінет": base({ osc: [{ type: "square", oct: 0, gain: 0.5 }], filter: { type: "bandpass", cutoff: 1500, q: 2, env: 1.5, keytrack: 0.5 }, fenv: A(1e-3, 0.2, 0.1, 0.1), amp: A(1e-3, 0.5, 0.2, 0.08), gain: 0.35 })
    },
    "Бас": {
      "Синт-бас": base({ osc: [{ type: "sawtooth", oct: 0, gain: 0.6 }, { type: "square", oct: -1, gain: 0.3 }], filter: { type: "lowpass", cutoff: 500, q: 3, env: 2, keytrack: 0.2 }, fenv: A(2e-3, 0.25, 0.2, 0.1), amp: A(3e-3, 0.3, 0.8, 0.08), gain: 0.4, mono: true }),
      "808": base({ osc: [{ type: "sine", oct: 0, gain: 1 }], filter: { type: "lowpass", cutoff: 3e3, q: 0.5, env: 0, keytrack: 0 }, pitchEnv: { semi: 12, decay: 0.06 }, amp: A(2e-3, 1.2, 0.5, 0.3), drive: 0.35, gain: 0.5, mono: true }),
      "Саб-бас": base({ osc: [{ type: "sine", oct: 0, gain: 1 }, { type: "triangle", oct: 0, gain: 0.15 }], filter: { type: "lowpass", cutoff: 400, q: 0.5, env: 0, keytrack: 0 }, amp: A(5e-3, 0.2, 1, 0.1), gain: 0.5, mono: true }),
      "Reese": base({ osc: [{ type: "sawtooth", oct: 0, detune: -12, gain: 0.5 }, { type: "sawtooth", oct: 0, detune: 12, gain: 0.5 }], unison: 2, spread: 20, filter: { type: "lowpass", cutoff: 700, q: 1.5, env: 0.5, keytrack: 0.2 }, amp: A(0.01, 0.3, 0.9, 0.1), gain: 0.32, mono: true }),
      "Бас-гітара": base({ osc: [{ type: "triangle", oct: 0, gain: 0.7 }, { type: "sawtooth", oct: 0, gain: 0.2 }], filter: { type: "lowpass", cutoff: 900, q: 1, env: 1.2, keytrack: 0.3 }, fenv: A(1e-3, 0.15, 0.1, 0.1), amp: A(2e-3, 0.8, 0.4, 0.08), gain: 0.42, mono: true })
    },
    "Пади і струнні": {
      "Теплий пад": base({ osc: [{ type: "sawtooth", oct: 0, detune: -8, gain: 0.4 }, { type: "sawtooth", oct: 0, detune: 8, gain: 0.4 }], unison: 2, spread: 14, filter: { type: "lowpass", cutoff: 1400, q: 0.7, env: 0.6, keytrack: 0.2 }, fenv: A(0.6, 1, 0.5, 1), amp: A(0.5, 1, 0.85, 1.2), gain: 0.2 }),
      "Струнні": base({ osc: [{ type: "sawtooth", oct: 0, detune: -5, gain: 0.4 }, { type: "sawtooth", oct: 0, detune: 5, gain: 0.4 }], unison: 3, spread: 18, filter: { type: "lowpass", cutoff: 3500, q: 0.5, env: 0, keytrack: 0.4 }, amp: A(0.25, 0.5, 0.9, 0.6), gain: 0.18 }),
      "Темний пад": base({ osc: [{ type: "triangle", oct: 0, gain: 0.5 }, { type: "sawtooth", oct: -1, gain: 0.25 }], noise: 0.02, filter: { type: "lowpass", cutoff: 700, q: 2, env: 0.8, keytrack: 0 }, fenv: A(1.2, 2, 0.4, 1.5), amp: A(1, 1, 0.9, 2), gain: 0.22 }),
      "Хор (ааа)": base({ osc: [{ type: "sawtooth", oct: 0, detune: -6, gain: 0.35 }, { type: "sawtooth", oct: 0, detune: 6, gain: 0.35 }], unison: 3, spread: 12, filter: { type: "bandpass", cutoff: 900, q: 1.2, env: 0, keytrack: 0.2 }, amp: A(0.35, 0.5, 0.9, 0.8), gain: 0.3 })
    },
    "Ліди": {
      "Пила-лід": base({ osc: [{ type: "sawtooth", oct: 0, gain: 0.5 }, { type: "sawtooth", oct: 0, detune: 9, gain: 0.4 }], filter: { type: "lowpass", cutoff: 4500, q: 1, env: 0.8, keytrack: 0.3 }, amp: A(5e-3, 0.2, 0.8, 0.15), gain: 0.25, mono: true }),
      "Квадрат-лід": base({ osc: [{ type: "square", oct: 0, gain: 0.5 }], filter: { type: "lowpass", cutoff: 3e3, q: 1, env: 0.5, keytrack: 0.3 }, amp: A(5e-3, 0.2, 0.8, 0.12), gain: 0.25, mono: true }),
      "Флейта / м'який": base({ osc: [{ type: "sine", oct: 0, gain: 0.8 }, { type: "triangle", oct: 1, gain: 0.1 }], noise: 0.03, filter: { type: "lowpass", cutoff: 3500, q: 0.5, env: 0, keytrack: 0.3 }, amp: A(0.06, 0.2, 0.85, 0.15), gain: 0.32, mono: true }),
      "Вокальний синт": base({ osc: [{ type: "sawtooth", oct: 0, gain: 0.5 }], filter: { type: "bandpass", cutoff: 1100, q: 3, env: 0.3, keytrack: 0.5 }, amp: A(0.04, 0.2, 0.9, 0.2), gain: 0.42, mono: true })
    },
    "Плаки і дзвони": {
      "Плак": base({ osc: [{ type: "sawtooth", oct: 0, gain: 0.5 }, { type: "square", oct: 1, gain: 0.15 }], filter: { type: "lowpass", cutoff: 600, q: 2, env: 3, keytrack: 0.4 }, fenv: A(1e-3, 0.18, 0, 0.1), amp: A(1e-3, 0.45, 0, 0.2), gain: 0.32 }),
      "Дзвіночок (FM)": base({ osc: [{ type: "sine", oct: 0, gain: 0.8 }], fm: { ratio: 3.5, index: 3, decay: 1.2, sustain: 0.05 }, filter: { type: "lowpass", cutoff: 12e3, q: 0.5, env: 0, keytrack: 0 }, amp: A(1e-3, 2.5, 0, 1), gain: 0.25 }),
      "Маримба": base({ osc: [{ type: "sine", oct: 0, gain: 0.9 }, { type: "sine", oct: 2, gain: 0.12 }], fm: { ratio: 4, index: 1, decay: 0.08, sustain: 0 }, filter: { type: "lowpass", cutoff: 8e3, q: 0.5, env: 0, keytrack: 0 }, amp: A(1e-3, 0.6, 0, 0.2), gain: 0.4 }),
      "Гітарний щип": base({ osc: [{ type: "sawtooth", oct: 0, gain: 0.5 }, { type: "triangle", oct: 0, detune: 5, gain: 0.4 }], filter: { type: "lowpass", cutoff: 1200, q: 1, env: 1.5, keytrack: 0.5 }, fenv: A(1e-3, 0.3, 0.1, 0.2), amp: A(1e-3, 1.2, 0, 0.3), gain: 0.3 })
    },
    "Духові": {
      "Брас": base({ osc: [{ type: "sawtooth", oct: 0, gain: 0.5 }, { type: "sawtooth", oct: 0, detune: 6, gain: 0.4 }], filter: { type: "lowpass", cutoff: 900, q: 1, env: 1.8, keytrack: 0.4 }, fenv: A(0.06, 0.3, 0.6, 0.2), amp: A(0.04, 0.2, 0.85, 0.15), gain: 0.25 })
    }
  };
  const O = (type, oct, gain, detune) => ({ type, oct: oct || 0, gain, detune: detune || 0 });
  const F = (type, cutoff, q, env, keytrack) => ({ type, cutoff, q, env, keytrack });
  Object.assign(SYNTH_PRESETS["Клавішні"], {
    "Wurli": base({ osc: [O("triangle", 0, 0.7), O("sine", 1, 0.2)], fm: { ratio: 7, index: 0.5, decay: 0.2, sustain: 0.02 }, filter: F("lowpass", 3800, 0.7, 0.4, 0.3), fenv: A(1e-3, 0.4, 0.2, 0.3), amp: A(2e-3, 1.6, 0.2, 0.3), drive: 0.15, gain: 0.34 }),
    "Лоу-фай піаніно": base({ osc: [O("sine", 0, 0.7), O("triangle", 1, 0.2)], fm: { ratio: 2, index: 0.9, decay: 0.4, sustain: 0.05 }, noise: 0.01, filter: F("lowpass", 2200, 0.6, 0, 0.3), amp: A(3e-3, 1.4, 0.05, 0.4), gain: 0.36 }),
    "Іграшкове піаніно": base({ osc: [O("sine", 0, 0.6), O("sine", 2, 0.25)], fm: { ratio: 5.2, index: 1.5, decay: 0.15, sustain: 0 }, filter: F("lowpass", 9000, 0.5, 0, 0), amp: A(1e-3, 0.7, 0, 0.2), gain: 0.32 }),
    "Хаус-орган": base({ osc: [O("sine", 0, 0.5), O("square", 1, 0.15), O("sine", 2, 0.2)], filter: F("lowpass", 2600, 1.2, 1, 0.2), fenv: A(2e-3, 0.18, 0.4, 0.1), amp: A(2e-3, 0.25, 0.6, 0.1), gain: 0.28 }),
    "Акорд-стаб": base({ osc: [O("sawtooth", 0, 0.45, -7), O("sawtooth", 0, 0.45, 7)], unison: 2, spread: 10, filter: F("lowpass", 1800, 1.4, 1.8, 0.3), fenv: A(1e-3, 0.22, 0.1, 0.15), amp: A(1e-3, 0.35, 0.1, 0.2), gain: 0.26 }),
    "FM-рояль": base({ osc: [O("sine", 0, 0.8), O("sine", 1, 0.1)], fm: { ratio: 1, index: 2.4, decay: 0.9, sustain: 0.08 }, filter: F("lowpass", 7000, 0.5, 0, 0.5), amp: A(2e-3, 2.4, 0, 0.5), gain: 0.32 })
  });
  Object.assign(SYNTH_PRESETS["Бас"], {
    "Ейсід (303)": base({ osc: [O("sawtooth", 0, 0.8)], filter: F("lowpass", 380, 9, 4, 0.2), fenv: A(1e-3, 0.18, 0.05, 0.1), amp: A(2e-3, 0.25, 0.7, 0.06), drive: 0.3, gain: 0.32, mono: true }),
    "Дисторшн 808": base({ osc: [O("sine", 0, 1)], filter: F("lowpass", 2400, 0.7, 0, 0), pitchEnv: { semi: 14, decay: 0.05 }, amp: A(2e-3, 1.4, 0.55, 0.3), drive: 0.8, gain: 0.42, mono: true }),
    "808 з глайдом": base({ osc: [O("sine", 0, 1), O("triangle", 1, 0.08)], filter: F("lowpass", 3000, 0.5, 0, 0), pitchEnv: { semi: 24, decay: 0.09 }, amp: A(2e-3, 1.6, 0.6, 0.35), drive: 0.45, gain: 0.48, mono: true }),
    "Плак-бас": base({ osc: [O("sawtooth", 0, 0.6), O("square", -1, 0.35)], filter: F("lowpass", 300, 2, 3, 0.2), fenv: A(1e-3, 0.12, 0.05, 0.08), amp: A(1e-3, 0.35, 0.3, 0.08), gain: 0.4, mono: true }),
    "FM-бас": base({ osc: [O("sine", 0, 0.9)], fm: { ratio: 1, index: 3, decay: 0.15, sustain: 0.2 }, filter: F("lowpass", 2000, 0.7, 0, 0), amp: A(2e-3, 0.4, 0.75, 0.08), gain: 0.42, mono: true }),
    "Аналоговий бас": base({ osc: [O("sawtooth", 0, 0.55), O("sawtooth", 0, 0.45, 9)], sub: 0.4, filter: F("lowpass", 650, 2.2, 1.6, 0.25), fenv: A(2e-3, 0.3, 0.25, 0.1), amp: A(2e-3, 0.3, 0.85, 0.08), drive: 0.15, gain: 0.36, mono: true }),
    "Хаус-бас (орган)": base({ osc: [O("sine", 0, 0.7), O("sine", 1, 0.3)], filter: F("lowpass", 1200, 1, 0.5, 0), amp: A(2e-3, 0.25, 0.5, 0.06), gain: 0.42, mono: true }),
    "Вобл-бас": base({ osc: [O("sawtooth", 0, 0.5, -10), O("square", 0, 0.4, 10)], unison: 2, spread: 16, filter: F("lowpass", 450, 6, 2.5, 0.2), fenv: A(0.12, 0.25, 0.4, 0.15), amp: A(5e-3, 0.3, 0.9, 0.1), drive: 0.4, gain: 0.3, mono: true }),
    "Контрабас (синт)": base({ osc: [O("triangle", 0, 0.8), O("sine", 0, 0.3)], noise: 0.01, filter: F("lowpass", 700, 0.8, 0.8, 0.3), fenv: A(2e-3, 0.2, 0.2, 0.2), amp: A(4e-3, 1.2, 0.2, 0.15), gain: 0.46, mono: true })
  });
  Object.assign(SYNTH_PRESETS["Пади і струнні"], {
    "Суперсо-пад": base({ osc: [O("sawtooth", 0, 0.35, -12), O("sawtooth", 0, 0.35, 12), O("sawtooth", 1, 0.15)], unison: 4, spread: 24, filter: F("lowpass", 3200, 0.6, 0.3, 0.2), fenv: A(0.4, 1, 0.7, 1), amp: A(0.35, 1, 0.9, 1.4), gain: 0.15 }),
    "Скляний пад": base({ osc: [O("sine", 0, 0.5), O("triangle", 1, 0.25)], fm: { ratio: 3, index: 0.8, decay: 1.5, sustain: 0.3 }, filter: F("lowpass", 6000, 0.5, 0, 0), amp: A(0.4, 1, 0.8, 1.5), gain: 0.24 }),
    "Лоу-фай пад": base({ osc: [O("triangle", 0, 0.5, -6), O("triangle", 0, 0.5, 6)], noise: 0.02, filter: F("lowpass", 1100, 0.6, 0, 0.1), amp: A(0.6, 1, 0.85, 1.6), drive: 0.1, gain: 0.26 }),
    "Свіп-пад": base({ osc: [O("sawtooth", 0, 0.4, -9), O("sawtooth", 0, 0.4, 9)], unison: 3, spread: 18, filter: F("lowpass", 400, 4, 3, 0.1), fenv: A(2.5, 2, 0.6, 2), amp: A(0.8, 1, 0.9, 2), gain: 0.18 }),
    "Аналогові струнні": base({ osc: [O("sawtooth", 0, 0.4, -4), O("sawtooth", 0, 0.4, 4), O("sawtooth", 1, 0.12)], unison: 3, spread: 14, filter: F("lowpass", 2600, 0.5, 0.3, 0.4), fenv: A(0.3, 0.6, 0.6, 0.6), amp: A(0.3, 0.5, 0.9, 0.7), gain: 0.17 }),
    "Ембієнт": base({ osc: [O("sine", 0, 0.5), O("sine", 1, 0.3, 4), O("triangle", -1, 0.2)], noise: 0.015, filter: F("lowpass", 2000, 0.8, 0.4, 0), fenv: A(2, 3, 0.5, 3), amp: A(1.5, 2, 0.9, 3), gain: 0.24 }),
    "Смичкові (синт)": base({ osc: [O("sawtooth", 0, 0.45, -3), O("sawtooth", 0, 0.45, 3)], unison: 2, spread: 8, filter: F("lowpass", 1900, 0.9, 0.6, 0.5), fenv: A(0.15, 0.4, 0.7, 0.4), amp: A(0.18, 0.4, 0.9, 0.5), gain: 0.2 })
  });
  Object.assign(SYNTH_PRESETS["Ліди"], {
    "Суперсо-лід": base({ osc: [O("sawtooth", 0, 0.4, -15), O("sawtooth", 0, 0.4, 15)], unison: 4, spread: 28, filter: F("lowpass", 6500, 0.8, 0.3, 0.3), amp: A(5e-3, 0.3, 0.85, 0.25), gain: 0.18 }),
    "Чіптюн (8-біт)": base({ osc: [O("square", 0, 0.6)], filter: F("lowpass", 12000, 0.5, 0, 0), amp: A(1e-3, 0.1, 0.8, 0.05), gain: 0.22, mono: true }),
    "Гувер": base({ osc: [O("sawtooth", 0, 0.45, -20), O("sawtooth", -1, 0.4, 20)], unison: 3, spread: 30, filter: F("lowpass", 1800, 1.5, 1, 0.2), pitchEnv: { semi: -5, decay: 0.12 }, amp: A(0.02, 0.3, 0.9, 0.2), drive: 0.3, gain: 0.2, mono: true }),
    "Транс-лід": base({ osc: [O("sawtooth", 0, 0.45, -8), O("sawtooth", 0, 0.45, 8), O("square", 1, 0.1)], unison: 2, spread: 14, filter: F("lowpass", 3800, 1.2, 1.2, 0.3), fenv: A(3e-3, 0.25, 0.4, 0.2), amp: A(3e-3, 0.3, 0.8, 0.3), gain: 0.2 }),
    "Свисток": base({ osc: [O("sine", 0, 0.9)], noise: 0.02, filter: F("bandpass", 2500, 1, 0, 0.8), amp: A(0.05, 0.2, 0.9, 0.15), gain: 0.4, mono: true }),
    "Синк-лід": base({ osc: [O("sawtooth", 0, 0.5), O("square", 1, 0.3, 7)], filter: F("lowpass", 2500, 3, 2, 0.4), fenv: A(2e-3, 0.4, 0.3, 0.2), amp: A(3e-3, 0.3, 0.85, 0.15), drive: 0.25, gain: 0.22, mono: true }),
    "Мелодика": base({ osc: [O("square", 0, 0.4), O("sawtooth", 0, 0.3, 5)], filter: F("lowpass", 2600, 0.8, 0.2, 0.4), amp: A(0.03, 0.2, 0.9, 0.12), gain: 0.28 }),
    "Ріджент (синт-гітара)": base({ osc: [O("sawtooth", 0, 0.5), O("sawtooth", 0, 0.4, 12)], filter: F("lowpass", 2200, 1.2, 0.8, 0.3), amp: A(3e-3, 0.4, 0.75, 0.25), drive: 0.6, gain: 0.2, mono: true })
  });
  Object.assign(SYNTH_PRESETS["Плаки і дзвони"], {
    "Фьюче-плак": base({ osc: [O("sawtooth", 0, 0.45, -10), O("sawtooth", 0, 0.45, 10)], unison: 3, spread: 18, filter: F("lowpass", 700, 1.5, 4, 0.3), fenv: A(1e-3, 0.25, 0, 0.2), amp: A(1e-3, 0.6, 0, 0.3), gain: 0.25 }),
    "Калімба": base({ osc: [O("sine", 0, 0.9)], fm: { ratio: 6, index: 1.2, decay: 0.05, sustain: 0 }, filter: F("lowpass", 6000, 0.5, 0, 0), amp: A(1e-3, 0.9, 0, 0.3), gain: 0.42 }),
    "Арфа (синт)": base({ osc: [O("triangle", 0, 0.7), O("sine", 1, 0.2)], filter: F("lowpass", 3000, 0.8, 1, 0.4), fenv: A(1e-3, 0.4, 0.1, 0.4), amp: A(1e-3, 1.8, 0, 0.6), gain: 0.36 }),
    "Музична скринька": base({ osc: [O("sine", 0, 0.7), O("sine", 2, 0.2)], fm: { ratio: 8, index: 1, decay: 0.3, sustain: 0 }, filter: F("lowpass", 10000, 0.5, 0, 0), amp: A(1e-3, 1.4, 0, 0.6), gain: 0.32 }),
    "Стілдрам": base({ osc: [O("sine", 0, 0.8), O("sine", 1, 0.25)], fm: { ratio: 2.76, index: 1.4, decay: 0.3, sustain: 0.05 }, filter: F("lowpass", 7000, 0.5, 0, 0), amp: A(1e-3, 1.1, 0, 0.4), gain: 0.32 }),
    "Вібрафон": base({ osc: [O("sine", 0, 0.85), O("sine", 2, 0.1)], fm: { ratio: 4, index: 0.6, decay: 0.4, sustain: 0.05 }, filter: F("lowpass", 8000, 0.5, 0, 0), amp: A(1e-3, 3, 0.05, 1.2), gain: 0.32 }),
    "Дзвін-пад": base({ osc: [O("sine", 0, 0.6), O("triangle", 1, 0.2)], fm: { ratio: 3.5, index: 2, decay: 2, sustain: 0.2 }, filter: F("lowpass", 9000, 0.5, 0, 0), amp: A(0.01, 3, 0.4, 2), gain: 0.22 }),
    "Ксилофон (синт)": base({ osc: [O("sine", 0, 0.9), O("sine", 2, 0.15)], fm: { ratio: 3, index: 1.6, decay: 0.04, sustain: 0 }, filter: F("lowpass", 9000, 0.5, 0, 0), amp: A(1e-3, 0.35, 0, 0.15), gain: 0.42 })
  });
  Object.assign(SYNTH_PRESETS["Духові"], {
    "Брас-стаб": base({ osc: [O("sawtooth", 0, 0.45, -5), O("sawtooth", 0, 0.45, 5)], unison: 2, spread: 10, filter: F("lowpass", 1200, 1, 2.2, 0.4), fenv: A(0.02, 0.2, 0.3, 0.15), amp: A(0.01, 0.3, 0.4, 0.15), gain: 0.25 }),
    "М'яка валторна": base({ osc: [O("sawtooth", 0, 0.4), O("triangle", 0, 0.4)], filter: F("lowpass", 800, 0.8, 0.8, 0.4), fenv: A(0.12, 0.4, 0.6, 0.3), amp: A(0.1, 0.3, 0.9, 0.3), gain: 0.3 }),
    "Сакс (синт)": base({ osc: [O("sawtooth", 0, 0.5), O("square", 0, 0.25, 4)], noise: 0.02, filter: F("bandpass", 1300, 1.5, 0.6, 0.6), fenv: A(0.03, 0.3, 0.6, 0.2), amp: A(0.04, 0.2, 0.9, 0.15), gain: 0.42, mono: true }),
    "Флейта пан": base({ osc: [O("sine", 0, 0.8)], noise: 0.06, filter: F("lowpass", 3000, 0.6, 0, 0.4), amp: A(0.08, 0.2, 0.85, 0.2), gain: 0.34, mono: true })
  });
  SYNTH_PRESETS["Ефекти й переходи"] = {
    "Райзер (шум)": base({ osc: [O("sawtooth", 0, 0.2)], noise: 0.4, filter: F("bandpass", 600, 2, 4, 0), fenv: A(3, 1, 1, 0.5), amp: A(2.5, 0.5, 1, 0.6), gain: 0.2 }),
    "Лазер": base({ osc: [O("square", 0, 0.5)], pitchEnv: { semi: 36, decay: 0.12 }, filter: F("lowpass", 6000, 2, 0, 0), amp: A(1e-3, 0.25, 0, 0.1), gain: 0.25 }),
    "Падіння (даунліфтер)": base({ osc: [O("sawtooth", 0, 0.4)], noise: 0.2, pitchEnv: { semi: -24, decay: 1.2 }, filter: F("lowpass", 5000, 1, -1, 0), fenv: A(0.01, 2, 0.1, 0.5), amp: A(0.01, 2, 0.2, 0.8), gain: 0.2 }),
    "Вітер": base({ osc: [O("sine", 0, 0)], noise: 0.5, filter: F("bandpass", 900, 4, 1, 0.5), fenv: A(1.5, 2, 0.6, 2), amp: A(1.2, 1, 0.9, 2), gain: 0.25 }),
    "Космос": base({ osc: [O("sine", 0, 0.5), O("sine", 1, 0.4, 7)], fm: { ratio: 1.41, index: 3, decay: 3, sustain: 0.4 }, filter: F("lowpass", 4000, 2, 0.5, 0), amp: A(1, 2, 0.8, 3), gain: 0.22 }),
    "Удар (імпакт)": base({ osc: [O("sine", -1, 1)], noise: 0.25, pitchEnv: { semi: 18, decay: 0.15 }, filter: F("lowpass", 2500, 0.7, 0, 0), amp: A(1e-3, 1.5, 0, 0.8), drive: 0.5, gain: 0.45 })
  };
  const presetByName = (name) => {
    for (const g in SYNTH_PRESETS) if (SYNTH_PRESETS[g][name]) return clone(SYNTH_PRESETS[g][name]);
    return null;
  };
  function defaultInstrument(track) {
    if (track.is_drums) return { type: "drums", kit: "song", pads: {} };
    const pick = { bass: "Синт-бас", lead: "Вокальний синт", keys: "Піаніно (FM)", guitar: "Гітарний щип", pad: "Теплий пад", mono_inst: "Флейта / м'який", poly: "Плак" };
    const name = track.kind === "chords" ? "Теплий пад" : pick[track.role] || "Плак";
    return { type: "synth", preset: name, params: presetByName(name) };
  }
  const DRUM_PADS = [["kick", "Бочка", 36], ["snare", "Малий", 38], ["hat", "Закр. хет", 42], ["openhat", "Відкр. хет", 46], ["crash", "Тарілка", 49], ["ride", "Райд", 51], ["tom", "Томи", 45], ["perc", "Перкусія", 39]];
  function fmtVal(spec, v) {
    if (spec.pct) return Math.round(v * 100) + "%";
    if (spec.unit === "Гц") return v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 1 : 2) + " кГц" : Math.round(v) + " Гц";
    const dec = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2;
    return (+v).toFixed(dec) + (spec.unit ? " " + spec.unit : "");
  }
  const toNorm = (s, v) => s.log ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min);
  const fromNorm = (s, n) => {
    n = Math.min(1, Math.max(0, n));
    let v = s.log ? s.min * Math.pow(s.max / s.min, n) : s.min + n * (s.max - s.min);
    return Math.round(v / s.step) * s.step;
  };
  function controls(box, specs, P, onChange, defaults) {
    box.innerHTML = "";
    for (const s of specs) {
      const w = document.createElement("div");
      w.className = "ctl";
      w.dataset.hint = `${s.label}: ${s.hint || ""}`;
      if (s.options) {
        w.innerHTML = `<label>${E(s.label)}</label><select>${s.options.map(([v, l]) => `<option value="${E(v)}">${E(l)}</option>`).join("")}</select>`;
        const sel = w.querySelector("select");
        sel.value = P[s.k];
        sel.onchange = () => onChange(s.k, sel.value);
      } else if (s.toggle) {
        w.innerHTML = `<label>${E(s.label)}</label><input type="checkbox" class="switch">`;
        const cb = w.querySelector("input");
        cb.checked = !!P[s.k];
        cb.onchange = () => onChange(s.k, cb.checked);
      } else {
        w.classList.add("knob-wrap");
        w.innerHTML = `<div class="knob"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" class="kb-bg"/><path class="kb-arc"/><line x1="24" y1="24" x2="24" y2="8" class="kb-ptr"/></svg></div><div class="kv"></div><label>${E(s.label)}</label>`;
        const knob = w.querySelector(".knob"), kv = w.querySelector(".kv"), arc = w.querySelector(".kb-arc"), ptr = w.querySelector(".kb-ptr");
        const draw = (v2) => {
          const n = toNorm(s, v2), ang = -135 + 270 * n, rad = (a) => (a - 90) * Math.PI / 180;
          const x0 = 24 + 19 * Math.cos(rad(-135)), y0 = 24 + 19 * Math.sin(rad(-135)), x1 = 24 + 19 * Math.cos(rad(ang)), y1 = 24 + 19 * Math.sin(rad(ang));
          arc.setAttribute("d", `M ${x0} ${y0} A 19 19 0 ${ang + 135 > 180 ? 1 : 0} 1 ${x1} ${y1}`);
          ptr.setAttribute("transform", `rotate(${ang} 24 24)`);
          kv.textContent = fmtVal(s, v2);
        };
        let v = P[s.k];
        if (v === void 0 || v === null || Number.isNaN(+v)) {
          v = defaults && defaults[s.k] !== void 0 ? defaults[s.k] : Math.min(s.max, Math.max(s.min, 0));
          P[s.k] = v;
        }
        draw(v);
        knob.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          knob.setPointerCapture(e.pointerId);
          const y0 = e.clientY, n0 = toNorm(s, v);
          const mv = (ev) => {
            v = fromNorm(s, n0 + (y0 - ev.clientY) / (ev.shiftKey ? 600 : 160));
            draw(v);
            onChange(s.k, v, true);
          };
          const up = () => {
            knob.removeEventListener("pointermove", mv);
            knob.removeEventListener("pointerup", up);
            onChange(s.k, v);
          };
          knob.addEventListener("pointermove", mv);
          knob.addEventListener("pointerup", up);
        });
        knob.addEventListener("wheel", (e) => {
          e.preventDefault();
          v = fromNorm(s, toNorm(s, v) - Math.sign(e.deltaY) * 0.02);
          draw(v);
          onChange(s.k, v);
        }, { passive: false });
        knob.addEventListener("dblclick", () => {
          if (defaults && defaults[s.k] !== void 0) {
            v = defaults[s.k];
            draw(v);
            onChange(s.k, v);
          }
        });
      }
      box.appendChild(w);
    }
  }
  let respCtx = null;
  const getRespCtx = () => respCtx || (respCtx = new OfflineAudioContext(1, 1, 44100));
  function setupCanvas(cv) {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return [c, w, h];
  }
  const fx2x = (f, w) => Math.log(f / 20) / Math.log(2e4 / 20) * w;
  const x2f = (x, w) => 20 * Math.pow(1e3, x / w);
  function gridFreq(c, w, h, dbRange = 18) {
    c.strokeStyle = "#1f232c";
    c.lineWidth = 1;
    c.fillStyle = "#4b5160";
    c.font = "10px ui-monospace,Consolas,monospace";
    for (const f of [50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4]) {
      const x = fx2x(f, w);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
      c.fillText(f >= 1e3 ? f / 1e3 + "k" : f, x + 2, h - 3);
    }
    for (let d = -dbRange; d <= dbRange; d += 6) {
      const y = h / 2 - d / dbRange * (h / 2 - 8);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  }
  function responseCurve(bands, w) {
    const ctx = getRespCtx(), N = Math.max(64, w | 0), freqs = new Float32Array(N), mag = new Float32Array(N), ph = new Float32Array(N), total = new Float32Array(N).fill(1);
    for (let i = 0; i < N; i++) freqs[i] = x2f(i * w / (N - 1), w);
    for (const b of bands) {
      if (!b.on) continue;
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.f;
      f.Q.value = b.q;
      f.gain.value = b.g;
      f.getFrequencyResponse(freqs, mag, ph);
      for (let i = 0; i < N; i++) total[i] *= mag[i];
    }
    return { freqs, total };
  }
  const VIS = {};
  VIS.eq = (cv, P, onChange) => {
    let drag = -1;
    const pos = (b, w, h) => [fx2x(b.f, w), ["highpass", "lowpass"].includes(b.type) ? h / 2 : h / 2 - b.g / 18 * (h / 2 - 8)];
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      gridFreq(c, w, h);
      const { total } = responseCurve(P.bands, w), N = total.length;
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const x = i * w / (N - 1), db = 20 * Math.log10(total[i] + 1e-9), y = h / 2 - Math.max(-18, Math.min(18, db)) / 18 * (h / 2 - 8);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = "#4fd1c5";
      c.lineWidth = 2;
      c.stroke();
      c.lineTo(w, h / 2);
      c.lineTo(0, h / 2);
      c.fillStyle = "rgba(79,209,197,.08)";
      c.fill();
      P.bands.forEach((b, i) => {
        const [x, y] = pos(b, w, h);
        c.beginPath();
        c.arc(x, y, 7, 0, 7);
        c.fillStyle = b.on ? "#ffb547" : "#3a3f4f";
        c.fill();
        c.fillStyle = "#1a1205";
        c.font = "bold 9px sans-serif";
        c.fillText(i + 1, x - 2.5, y + 3);
      });
    };
    const hit = (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = -1, bd = 14;
      P.bands.forEach((b, i) => {
        const [bx, by] = pos(b, r.width, r.height);
        const d = Math.hypot(bx - x, by - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };
    cv.onpointerdown = (e) => {
      drag = hit(e);
      if (drag >= 0) cv.setPointerCapture(e.pointerId);
    };
    cv.onpointermove = (e) => {
      if (drag < 0) {
        cv.style.cursor = hit(e) >= 0 ? "grab" : "default";
        return;
      }
      const r = cv.getBoundingClientRect(), b = P.bands[drag];
      b.f = Math.round(Math.min(2e4, Math.max(20, x2f(e.clientX - r.left, r.width))));
      if (!["highpass", "lowpass"].includes(b.type)) b.g = Math.round(Math.max(-18, Math.min(18, (r.height / 2 - (e.clientY - r.top)) / (r.height / 2 - 8) * 18)) * 10) / 10;
      b.on = true;
      draw();
      onChange(true);
    };
    cv.onpointerup = () => {
      if (drag >= 0) onChange(false);
      drag = -1;
    };
    cv.ondblclick = (e) => {
      const i = hit(e);
      if (i >= 0) {
        P.bands[i].on = !P.bands[i].on;
        draw();
        onChange(false);
      }
    };
    cv.onwheel = (e) => {
      const i = hit(e);
      if (i < 0) return;
      e.preventDefault();
      const b = P.bands[i];
      b.q = Math.max(0.1, Math.min(18, b.q * (e.deltaY < 0 ? 1.15 : 0.87)));
      draw();
      onChange(false);
    };
    draw();
    return draw;
  };
  VIS.comp = (cv, P, node, lim) => {
    const limiter = lim === true;
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const thr = limiter ? P.ceiling - 0.5 : P.threshold, ratio = limiter ? 20 : P.ratio, knee = limiter ? 0 : P.knee, mk = limiter ? P.gain : P.makeup;
      const m = 8, X = (db) => m + (db + 60) / 60 * (w - 2 * m), Y = (db) => h - m - (db + 60) / 60 * (h - 2 * m);
      c.strokeStyle = "#1f232c";
      for (let d = -60; d <= 0; d += 12) {
        c.beginPath();
        c.moveTo(X(d), m);
        c.lineTo(X(d), h - m);
        c.moveTo(m, Y(d));
        c.lineTo(w - m, Y(d));
        c.stroke();
      }
      c.strokeStyle = "#2f3442";
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(X(-60), Y(-60));
      c.lineTo(X(0), Y(0));
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      for (let i = -60; i <= 0; i += 0.5) {
        let o;
        const lo = thr - knee / 2, hi = thr + knee / 2;
        if (i < lo) o = i;
        else if (i > hi) o = thr + (i - thr) / ratio;
        else {
          const x = i - lo;
          o = i + (1 / ratio - 1) * x * x / (2 * knee || 1);
        }
        const yv = Math.max(-60, Math.min(0, limiter ? Math.min(i + mk, P.ceiling) : o));
        if (i === -60) c.moveTo(X(i), Y(yv));
        else c.lineTo(X(i), Y(yv));
      }
      c.strokeStyle = "#ffb547";
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
      c.fillStyle = "#ffb547";
      c.font = "10px ui-monospace,Consolas";
      c.fillText(limiter ? `стеля ${P.ceiling} дБ` : `поріг ${P.threshold} дБ · ${P.ratio}:1`, m + 4, m + 10);
      const gr = node && node.reduction ? -node.reduction() : 0;
      c.fillStyle = "#1b1e26";
      c.fillRect(w - 18, m, 8, h - 2 * m);
      c.fillStyle = "#f43f5e";
      const gh = Math.min(1, gr / 24) * (h - 2 * m);
      c.fillRect(w - 18, m, 8, gh);
      c.fillStyle = "#8b91a3";
      c.fillText(`GR ${gr.toFixed(1)}`, w - 70, h - m - 2);
    };
    draw();
    return draw;
  };
  VIS.limiter = (cv, P, node) => VIS.comp(cv, P, node, true);
  VIS.gate = (cv, P, node) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const y = (db) => h - 8 - (db + 90) / 90 * (h - 16);
      c.fillStyle = "#14161b";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(255,181,71,.12)";
      c.fillRect(0, 0, w, y(P.threshold));
      c.strokeStyle = "#ffb547";
      c.beginPath();
      c.moveTo(0, y(P.threshold));
      c.lineTo(w, y(P.threshold));
      c.stroke();
      const lvl = node && node.level ? node.level() : 1;
      c.fillStyle = lvl > 0.5 ? "#4ade80" : "#f43f5e";
      c.beginPath();
      c.arc(w - 18, 18, 7, 0, 7);
      c.fill();
      c.fillStyle = "#8b91a3";
      c.font = "11px sans-serif";
      c.fillText(lvl > 0.5 ? "відкрито" : "закрито", w - 75, 22);
      c.fillText(`поріг ${P.threshold} дБ — тихіше глушиться на ${P.range} дБ`, 10, y(P.threshold) - 6);
    };
    draw();
    return draw;
  };
  const NN = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const noteName = (m) => NN[(Math.round(m) % 12 + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
  VIS.tune = (cv, P, node) => {
    const draw = () => {
      if (!cv || !cv.isConnected) return;
      const [c, w, h] = setupCanvas(cv);
      c.fillStyle = "#14161b";
      c.fillRect(0, 0, w, h);
      const info = node && node.info ? node.info() : {};
      const hist = node && node.hist ? node.hist : [];
      if (node && node.hist) {
        hist.push(info.f != null ? [info.f, info.t, info.c] : null);
        if (hist.length > 160) hist.shift();
      }
      const vals = hist.filter(Boolean);
      const mid = vals.length ? vals[vals.length - 1][1] : 60, lo = mid - 4, hi = mid + 4;
      const gx = 150, gw = w - gx - 10, y = (m) => h - 10 - (m - lo) / (hi - lo) * (h - 20);
      c.strokeStyle = "#242833";
      c.fillStyle = "#5d6374";
      c.font = "10px sans-serif";
      for (let m = Math.ceil(lo); m <= hi; m++) {
        c.beginPath();
        c.moveTo(gx, y(m));
        c.lineTo(gx + gw, y(m));
        c.stroke();
        c.fillText(noteName(m), gx + gw - 26, y(m) - 2);
      }
      const step = gw / 160;
      ["#5d6374", "#ec4899"].forEach((col, k) => {
        c.strokeStyle = col;
        c.lineWidth = k ? 2 : 1.2;
        c.beginPath();
        let pen = false;
        hist.forEach((v, i) => {
          if (!v) {
            pen = false;
            return;
          }
          const m = k ? v[0] + v[2] + (P.shift || 0) : v[0], xx = gx + i * step;
          if (!pen) c.moveTo(xx, y(m));
          else c.lineTo(xx, y(m));
          pen = true;
        });
        c.stroke();
      });
      c.lineWidth = 1;
      const cur = vals.length && hist[hist.length - 1];
      c.fillStyle = cur ? "#e9ebf1" : "#5d6374";
      c.font = "600 30px sans-serif";
      c.fillText(cur ? noteName(cur[1] + (P.shift || 0)) : "—", 16, 44);
      c.font = "11px sans-serif";
      c.fillStyle = "#8b91a3";
      if (cur) {
        const cents = Math.round((cur[0] - cur[1]) * 100);
        c.fillText(`ви співаєте ${cents > 0 ? "+" : ""}${cents} ц`, 16, 64);
        const bx = 16, bw = 118, cx = bx + bw / 2;
        c.fillStyle = "#242833";
        c.fillRect(bx, 74, bw, 6);
        c.fillStyle = Math.abs(cents) < 15 ? "#4ade80" : Math.abs(cents) < 35 ? "#ffb547" : "#ff5d6c";
        c.fillRect(cx, 74, Math.max(-bw / 2, Math.min(bw / 2, cents / 50 * bw / 2)), 6);
        c.fillStyle = "#e9ebf1";
        c.fillRect(cx - 1, 71, 2, 12);
      } else c.fillText("заспівайте ноту — побачите висоту", 16, 64);
      c.fillStyle = "#5d6374";
      c.fillText("сіра — ваш голос, рожева — після автотюну", 16, h - 12);
    };
    draw();
    return draw;
  };
  VIS.harm = (cv, P, node) => VIS.tune(cv, Object.assign({}, P, { shift: 0 }), node);
  VIS.deess = (cv, P, node) => {
    const draw = () => {
      if (!cv || !cv.isConnected) return;
      const [c, w, h] = setupCanvas(cv);
      c.fillStyle = "#14161b";
      c.fillRect(0, 0, w, h);
      const x = (f) => Math.log(f / 100) / Math.log(200) * w;
      c.fillStyle = "rgba(249,168,212,.15)";
      c.fillRect(x(P.freq), 0, w - x(P.freq), h);
      c.strokeStyle = "#f9a8d4";
      c.beginPath();
      c.moveTo(x(P.freq), 0);
      c.lineTo(x(P.freq), h);
      c.stroke();
      const r = node && node.reduction ? node.reduction() : 0;
      c.fillStyle = "#242833";
      c.fillRect(w - 40, 10, 14, h - 20);
      c.fillStyle = "#f9a8d4";
      const rh = Math.min(1, -r / 12) * (h - 20);
      c.fillRect(w - 40, 10, 14, rh);
      c.fillStyle = "#8b91a3";
      c.font = "11px sans-serif";
      c.fillText(`шиплячі від ${(P.freq / 1e3).toFixed(1)} кГц`, Math.min(x(P.freq) + 6, w - 190), 18);
      c.fillText(`${r.toFixed(1)} дБ`, w - 86, h - 12);
      [200, 1e3, 5e3, 1e4].forEach((f) => c.fillText(f >= 1e3 ? f / 1e3 + "к" : f, x(f) + 2, h - 4));
    };
    draw();
    return draw;
  };
  VIS.drive = (cv, P) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const cur = DSP.shaperCurve(P.type, DSP.dbToGain(P.drive));
      c.strokeStyle = "#1f232c";
      c.beginPath();
      c.moveTo(w / 2, 0);
      c.lineTo(w / 2, h);
      c.moveTo(0, h / 2);
      c.lineTo(w, h / 2);
      c.stroke();
      c.beginPath();
      for (let i = 0; i < cur.length; i += 8) {
        const x = i / (cur.length - 1) * w, y = h / 2 - cur[i] * (h / 2 - 6);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = "#f43f5e";
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
      c.fillStyle = "#8b91a3";
      c.font = "10px sans-serif";
      c.fillText("вхід → вихід", 8, 14);
    };
    draw();
    return draw;
  };
  VIS.filter = (cv, P) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      gridFreq(c, w, h, 24);
      const { total } = responseCurve([{ type: P.type, f: P.cutoff, q: P.q, g: 0, on: true }], w);
      c.beginPath();
      total.forEach((m, i) => {
        const x = i * w / (total.length - 1), y = h / 2 - Math.max(-24, Math.min(24, 20 * Math.log10(m + 1e-9))) / 24 * (h / 2 - 8);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.strokeStyle = "#4fd1c5";
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
      if (P.depth > 0) {
        c.fillStyle = "rgba(79,209,197,.12)";
        const x0 = fx2x(Math.max(20, P.cutoff * (1 - P.depth * 0.9)), w), x1 = fx2x(Math.min(2e4, P.cutoff * (1 + P.depth * 0.9)), w);
        c.fillRect(x0, 0, x1 - x0, h);
      }
    };
    draw();
    return draw;
  };
  VIS.reverb = (cv, P) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const T = Math.max(8, P.decay * 1.2 + P.predelay / 1e3);
      c.fillStyle = "#4b5160";
      c.font = "10px sans-serif";
      for (let s = 0; s <= T; s += T > 4 ? 1 : 0.5) {
        const x = s / T * w;
        c.fillRect(x, h - 12, 1, 4);
        c.fillText(s + "с", x + 2, h - 2);
      }
      const x0 = P.predelay / 1e3 / T * w;
      c.beginPath();
      c.moveTo(x0, h - 16);
      for (let x = x0; x < w; x += 2) {
        const t = (x - x0) / w * T;
        const a = Math.exp(-3 * t / P.decay) * Math.pow(Math.max(0, 1 - t / P.decay), 0.5);
        c.lineTo(x, h - 16 - a * (h - 26) * (0.85 + 0.15 * Math.random()));
      }
      c.lineTo(w, h - 16);
      c.closePath();
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, `rgba(167,139,250,${0.25 + (1 - P.damping) * 0.4})`);
      gr.addColorStop(1, "rgba(167,139,250,.05)");
      c.fillStyle = gr;
      c.fill();
      c.fillStyle = "#c4b5fd";
      c.fillText(P.decay < 1 ? "кімната" : P.decay < 2.2 ? "плейт / студія" : P.decay < 4 ? "зал" : "собор", 8, 14);
    };
    draw();
    return draw;
  };
  VIS.delay = (cv, P, node, env) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const t = P.sync ? DSP.syncTime(P.div, env.bpm) : P.ms / 1e3, T = Math.max(2, t * 8);
      c.fillStyle = "#ffb547";
      c.fillRect(4, 10, 6, h - 20);
      for (let k = 1, a = P.mix * 2; k < 16 && a > 0.02; k++, a *= P.feedback) {
        const x = 4 + k * t / T * (w - 10);
        if (x > w) break;
        c.fillStyle = (P.pingpong ? k % 2 : 1) ? "#a78bfa" : "#4fd1c5";
        const hh = Math.min(1, a) * (h - 20);
        c.fillRect(x, h - 10 - hh, 6, hh);
      }
      c.fillStyle = "#8b91a3";
      c.font = "10px sans-serif";
      c.fillText(`${(t * 1e3).toFixed(0)} мс між повторами${P.pingpong ? " · пінг-понг" : ""}`, 16, 14);
    };
    draw();
    return draw;
  };
  const lfoVis = (color) => (cv, P, node, env) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const rate = P.sync ? 1 / DSP.syncTime(P.div || P.rate_div, env.bpm) : P.rate || 1, sec = 2, shape = P.shape || "sine", dep = P.depth ?? (P.depth === 0 ? 0 : 0.5);
      c.beginPath();
      for (let x = 0; x < w; x++) {
        const ph = x / w * sec * rate % 1;
        let v = shape === "square" ? ph < 0.5 ? 1 : -1 : shape === "sawtooth" ? ph * 2 - 1 : shape === "triangle" ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(ph * 2 * Math.PI);
        const y = h / 2 - v * dep * (h / 2 - 8);
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
      c.fillStyle = "#8b91a3";
      c.font = "10px sans-serif";
      c.fillText(`${rate.toFixed(2)} Гц · 2 секунди`, 8, 14);
    };
    draw();
    return draw;
  };
  VIS.tremolo = lfoVis("#22c55e");
  VIS.chorus = (cv, P) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      for (let k = 0; k < 2; k++) {
        c.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h / 2 + (k ? 10 : -10) + Math.sin(x / w * 4 * Math.PI * P.rate * (k ? 1.13 : 1)) * P.depth * 3;
          x ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.strokeStyle = k ? "#4fd1c5" : "#a78bfa";
        c.lineWidth = 2;
        c.stroke();
      }
      c.lineWidth = 1;
      c.fillStyle = "#8b91a3";
      c.font = "10px sans-serif";
      c.fillText("дві «пливучі» копії: L і R", 8, 14);
    };
    draw();
    return draw;
  };
  VIS.pitchfx = VIS.chorus;
  VIS.stereo = (cv, P) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const cx = w / 2 + P.pan * w * 0.3, cy = h / 2;
      c.strokeStyle = "#2f3442";
      c.beginPath();
      c.moveTo(w / 2, 6);
      c.lineTo(w / 2, h - 6);
      c.stroke();
      c.fillStyle = "#4b5160";
      c.font = "10px sans-serif";
      c.fillText("L", 8, cy + 3);
      c.fillText("R", w - 14, cy + 3);
      c.beginPath();
      c.ellipse(cx, cy, 4 + P.width * w * 0.18, h * 0.32, 0, 0, 7);
      c.fillStyle = "rgba(167,139,250,.25)";
      c.fill();
      c.strokeStyle = "#a78bfa";
      c.stroke();
      c.fillStyle = "#c4b5fd";
      c.fillText(P.width < 0.05 ? "моно" : `ширина ${Math.round(P.width * 100)}%`, 8, 14);
    };
    draw();
    return draw;
  };
  VIS.lofi = (cv, P) => {
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const steps = Math.pow(2, Math.min(P.bits, 8) - 1);
      c.beginPath();
      for (let x = 0; x < w; x++) {
        const xs = Math.floor(x / (P.down * 3)) * P.down * 3;
        const v = Math.round(Math.sin(xs / w * 4 * Math.PI) * steps) / steps;
        const y = h / 2 - v * (h / 2 - 10);
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = "#f43f5e";
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
      c.fillStyle = "#8b91a3";
      c.font = "10px sans-serif";
      c.fillText(`${P.bits} біт · ÷${P.down}`, 8, 14);
    };
    draw();
    return draw;
  };
  function adsrVis(cv, env, onChange, color = "#ffb547") {
    let drag = null;
    const geo = (w, h) => {
      const tot = env.a + env.d + 0.6 + env.r, sx = (w - 16) / Math.max(1.2, tot);
      const p0 = [8, h - 8], p1 = [8 + env.a * sx, 10], p2 = [p1[0] + env.d * sx, 10 + (1 - env.s) * (h - 18)], p3 = [p2[0] + 0.6 * sx, p2[1]], p4 = [p3[0] + env.r * sx, h - 8];
      return { pts: [p0, p1, p2, p3, p4], sx };
    };
    const draw = () => {
      const [c, w, h] = setupCanvas(cv);
      const { pts } = geo(w, h);
      c.beginPath();
      pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.stroke();
      c.lineWidth = 1;
      c.lineTo(pts[4][0], h - 8);
      c.fillStyle = color + "18";
      c.fill();
      [1, 2, 4].forEach((i) => {
        c.beginPath();
        c.arc(...pts[i], 5, 0, 7);
        c.fillStyle = color;
        c.fill();
      });
      c.fillStyle = "#8b91a3";
      c.font = "10px ui-monospace,Consolas";
      c.fillText(`A ${env.a.toFixed(3)}  D ${env.d.toFixed(2)}  S ${Math.round(env.s * 100)}%  R ${env.r.toFixed(2)}`, 8, h - 12 > 20 ? 12 : h - 2);
    };
    cv.onpointerdown = (e) => {
      const r = cv.getBoundingClientRect(), { pts } = geo(r.width, r.height);
      const x = e.clientX - r.left, y = e.clientY - r.top;
      drag = [1, 2, 4].find((i) => Math.hypot(pts[i][0] - x, pts[i][1] - y) < 12) ?? null;
      if (drag) cv.setPointerCapture(e.pointerId);
    };
    cv.onpointermove = (e) => {
      if (!drag) return;
      const r = cv.getBoundingClientRect(), { pts, sx } = geo(r.width, r.height);
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (drag === 1) env.a = Math.max(1e-3, Math.min(4, (x - 8) / sx));
      if (drag === 2) {
        env.d = Math.max(0.01, Math.min(6, (x - pts[1][0]) / sx));
        env.s = Math.max(0, Math.min(1, 1 - (y - 10) / (r.height - 18)));
      }
      if (drag === 4) env.r = Math.max(0.01, Math.min(8, (x - pts[3][0]) / sx));
      draw();
      onChange(true);
    };
    cv.onpointerup = () => {
      if (drag) onChange(false);
      drag = null;
    };
    draw();
    return draw;
  }
  return { FX, CHAINS, newFx, SYNTH_PRESETS, presetByName, defaultInstrument, DRUM_PADS, controls, VIS, adsrVis, fmtVal, clone, E };
})();
