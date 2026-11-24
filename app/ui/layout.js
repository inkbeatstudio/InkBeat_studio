"use strict";
const DESK = { on: false, api: null };
window.addEventListener("pywebviewready", () => {
  DESK.on = true;
  DESK.api = window.pywebview && window.pywebview.api;
  document.body.classList.add("desktop");
});
const LAYOUT_DEF = { side: true, sidew: 312, headw: 236, dock: true, dockh: 340 };
const LAYOUTS = {
  "Стандарт": { side: true, sidew: 312, headw: 236, dock: true, dockh: 340 },
  "Аранжування": { side: false, headw: 236, dock: false },
  "Зведення": { side: false, headw: 210, dock: true, dockh: 0.55, tab: "fx" },
  "Редагування нот": { side: false, headw: 210, dock: true, dockh: 0.6, tab: "notes" },
  "Запис вокалу": { side: false, headw: 236, dock: false, rec: true },
  "Мінімум": { side: false, headw: 170, dock: false }
};
const THEMES = { graphite: "Графіт", night: "Ніч", warm: "Тепла", contrast: "Контраст" };
const ACCENTS = { amber: ["#ffb547", "#e0952a", "Бурштин"], teal: ["#4fd1c5", "#2fb3a7", "Бірюза"], violet: ["#a78bfa", "#8b6cf0", "Фіалка"], rose: ["#fb7185", "#e85a6f", "Троянда"], lime: ["#a3e635", "#86c51c", "Лайм"], sky: ["#60a5fa", "#3b8cf0", "Небо"] };
const UIP = (() => {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem("inkbeat.ui") || "{}");
  } catch (e) {
  }
  return Object.assign({ theme: "graphite", accent: "amber", compact: false, hints: true, motion: true, layout: Object.assign({}, LAYOUT_DEF), mine: {} }, s);
})();
function saveUI() {
  try {
    localStorage.setItem("inkbeat.ui", JSON.stringify(UIP));
  } catch (e) {
  }
}
function applyLook() {
  const b = document.body, root = document.documentElement;
  for (const k of Object.keys(THEMES)) b.classList.toggle("theme-" + k, UIP.theme === k);
  const a = ACCENTS[UIP.accent] || ACCENTS.amber;
  root.style.setProperty("--amber", a[0]);
  root.style.setProperty("--amber-d", a[1]);
  b.classList.toggle("compact", !!UIP.compact);
  b.classList.toggle("no-hints", !UIP.hints);
  b.classList.toggle("no-motion", !UIP.motion);
}
function applyLayout(L, opts = {}) {
  L = Object.assign({}, LAYOUT_DEF, L);
  const root = document.documentElement, side = $("#side"), dock = $("#dock");
  root.style.setProperty("--headw", Math.round(Math.max(150, Math.min(420, L.headw))) + "px");
  root.style.setProperty("--sidew", Math.round(Math.max(240, Math.min(560, L.sidew || 312))) + "px");
  if (side) side.hidden = !L.side;
  if (typeof S !== "undefined") {
    S.dockOpen = L.dock !== false;
    if (dock) {
      const h = L.dockh <= 1 ? innerHeight * L.dockh : L.dockh;
      dock.style.height = Math.max(180, Math.min(innerHeight * 0.75, innerHeight - 400, h || 340)) + "px";
    }
    if (L.tab && S.B) S.dockTab = L.tab;
    if (S.B && typeof renderDock === "function") renderDock();
  }
  UIP.layout = { side: L.side, sidew: L.sidew, headw: L.headw, dock: L.dock !== false, dockh: dock ? dock.offsetHeight || L.dockh : L.dockh };
  if (!opts.silent) saveUI();
  $$(".lay-side").forEach((x) => x.classList.toggle("on", !!L.side));
  setTimeout(() => {
    if (typeof layout === "function" && S.B) {
      layout();
      draw();
    }
  }, 30);
  if (L.rec && S.B && !REC.open) openRecorder();
}
function storeLayout() {
  const dock = $("#dock"), side = $("#side");
  const cs = getComputedStyle(document.documentElement);
  UIP.layout = { side: side ? !side.hidden : true, sidew: parseInt(cs.getPropertyValue("--sidew")) || 312, headw: parseInt(cs.getPropertyValue("--headw")) || 236, dock: !!S.dockOpen, dockh: dock && dock.offsetHeight ? dock.offsetHeight : UIP.layout.dockh };
  saveUI();
}
function splitter(el, axis, onMove) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const x0 = e.clientX, y0 = e.clientY, st = onMove(null);
    el.onpointermove = (ev) => {
      onMove(st, ev.clientX - x0, ev.clientY - y0);
      if (typeof layout === "function" && S.B) {
        layout();
        draw();
      }
    };
    el.onpointerup = () => {
      el.onpointermove = null;
      document.body.classList.remove("resizing");
      storeLayout();
    };
  });
  el.addEventListener("dblclick", () => onMove("reset"));
}
(function initSplitters() {
  const side = $("#side");
  if (side) {
    const r = document.createElement("div");
    r.className = "side-resize";
    r.dataset.hint = "Потягніть, щоб змінити ширину бічної панелі. Подвійний клік — стандартна ширина";
    side.prepend(r);
    splitter(r, "x", (st, dx) => {
      if (st === "reset") return applyLayout(Object.assign({}, UIP.layout, { sidew: 312 }));
      if (st === null) return side.offsetWidth;
      document.documentElement.style.setProperty("--sidew", Math.max(240, Math.min(560, st - dx)) + "px");
    });
  }
  const corner = $(".tl-corner");
  if (corner) {
    const r = document.createElement("div");
    r.className = "heads-resize";
    r.dataset.hint = "Потягніть, щоб змінити ширину колонки з назвами доріжок";
    corner.appendChild(r);
    splitter(r, "x", (st, dx) => {
      if (st === "reset") return applyLayout(Object.assign({}, UIP.layout, { headw: 236 }));
      if (st === null) return corner.offsetWidth;
      document.documentElement.style.setProperty("--headw", Math.max(150, Math.min(420, st + dx)) + "px");
    });
  }
  const dr = $("#dock-resize");
  if (dr) dr.addEventListener("pointerup", () => setTimeout(storeLayout, 50));
})();
function needProject(fn) {
  return () => {
    if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
    fn();
  };
}
async function openFromDisk(kind) {
  if (!DESK.on) {
    show("home");
    if (kind === "stems") setMode("stems");
    else if (kind === "mix") setMode("mix");
    ($(kind === "mix" ? "#file-input" : "#files-input")).click();
    return;
  }
  const paths = await DESK.api.open_audio(kind !== "mix");
  if (!paths || !paths.length) return;
  try {
    if (kind === "batch" && paths.length > 1) {
      const j = await api.post("/api/analyze_path", { paths, batch: true, model: S.model });
      show("home");
      openBatch(j.batch);
      return;
    }
    const mode = kind === "mix" || paths.length === 1 ? "auto" : "stems";
    const title = paths.length === 1 ? paths[0].split(/[\\/]/).pop().replace(/\.[^.]+$/, "") : "";
    const j = await api.post("/api/analyze_path", { paths, mode, model: S.model, title });
    S.mode = mode === "stems" ? "stems" : "mix";
    startJob(j.job_id, title || "Пісня");
  } catch (e) {
    toast(e.message, true);
  }
}
function openFolderFromDisk() {
  if (!DESK.on) return openFromDisk("stems");
  DESK.api.open_folder().then(async (p) => {
    if (!p || !p.length) return;
    try {
      const j = await api.post("/api/analyze_path", { paths: [p[0]], mode: "stems", model: S.model, title: p[0].split(/[\\/]/).pop() });
      S.mode = "stems";
      startJob(j.job_id, p[0].split(/[\\/]/).pop());
    } catch (e) {
      toast(e.message, true);
    }
  });
}
function layoutItems() {
  const mine = Object.keys(UIP.mine || {});
  return Object.keys(LAYOUTS).map((n) => ["Розкладка: " + n, needProject(() => applyLayout(LAYOUTS[n]))]).concat(mine.map((n) => ["Моя розкладка: " + n, needProject(() => applyLayout(UIP.mine[n]))])).concat([["Зберегти поточну розкладку…", needProject(() => {
    const n = (prompt("Назва розкладки:", "Моя") || "").trim();
    if (!n) return;
    storeLayout();
    UIP.mine[n] = Object.assign({}, UIP.layout);
    saveUI();
    toast(`Розкладку «${n}» збережено — вона в меню «Вигляд».`);
  })]]).concat(mine.length ? [["Видалити свої розкладки", () => {
    if (!confirm("Видалити всі свої розкладки?")) return;
    UIP.mine = {};
    saveUI();
  }]] : []);
}
const MENUS = {
  "Файл": () => [
    ["Новий розбір", () => show("home")],
    ["Відкрити пісню з диска…", () => openFromDisk("mix")],
    ["Відкрити стеми з диска…", () => openFromDisk("stems")],
    ["Відкрити папку зі стемами…", openFolderFromDisk],
    ["Пакетна обробка: кілька пісень…", () => DESK.on ? openFromDisk("batch") : (show("home"), toast("Виберіть кілька пісень і поставте галочку «Це різні пісні»."))],
    null,
    ["Проєкти", () => show("projects")],
    ["Експорт у FL Studio…", needProject(() => $("#export-btn").click())],
    ["Зберегти знімок / Історія…", needProject(openHistory)],
    ["Бібліотека семплів і пресетів…", () => openLibrary()],
    null,
    DESK.on ? ["Вийти", () => window.close()] : null
  ].filter((x, i, a) => x !== null || a[i - 1] !== null),
  "Правка": () => [
    ["Скасувати  (Ctrl+Z)", needProject(() => undo())],
    ["Повторити  (Ctrl+Y)", needProject(() => redo())],
    null,
    ["Розрізати по курсору  (S)", needProject(() => splitAtPlayhead())],
    ["Дублювати кліпи  (Ctrl+D)", needProject(() => duplicateClips())],
    ["Видалити кліпи  (Delete)", needProject(() => deleteClips())]
  ],
  "Вигляд": () => [
    ["Мікшер і ефекти  (F9)", needProject(() => $("#t-dock").click())],
    ["Бічна панель", needProject(() => {
      $("#side").hidden = !$("#side").hidden;
      storeLayout();
      layout();
      draw();
    })],
    ["Аналізатор", needProject(() => openAnalyzer())],
    ["Вокальна студія", needProject(() => openRecorder())],
    null
  ].concat(layoutItems(), [null, ["Тема, кольори, щільність…", openLookSettings], DESK.on ? ["На весь екран  (F11)", () => DESK.api.fullscreen()] : ["Масштаб: Ctrl + / Ctrl − / Ctrl 0", () => toast("Збільшити: Ctrl +, зменшити: Ctrl −, звичайний розмір: Ctrl 0.")]]),
  "Інструменти": () => [
    ["Генератор партій…", needProject(() => openGenerator())],
    ["Темп і тональність…", needProject(openTempoKey)],
    ["Мастеринг одним кліком…", needProject(() => openMastering())],
    ["Запис вокалу…", needProject(() => openRecorder())]
  ],
  "Довідка": () => [
    ["Довідка  (F1)", () => $("#help-btn").click()],
    ["Про InkBeat", openAbout]
  ]
};
(function initMenubar() {
  const bar = document.createElement("nav");
  bar.className = "menubar";
  bar.innerHTML = Object.keys(MENUS).map((k) => `<button data-menu="${k}">${k}</button>`).join("");
  const brand = $(".brand");
  brand.after(bar);
  let openName = null;
  const openMenu = (b) => {
    const r = b.getBoundingClientRect();
    menu({ clientX: r.left, clientY: r.bottom + 4 }, MENUS[b.dataset.menu]());
    const m = $("#ctxmenu");
    if (m) m.classList.add("menubar-drop");
    openName = b.dataset.menu;
    $$("[data-menu]", bar).forEach((x) => x.classList.toggle("open", x === b));
  };
  $$("[data-menu]", bar).forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      if (openName === b.dataset.menu && $("#ctxmenu")) {
        closeMenu();
        openName = null;
        b.classList.remove("open");
        return;
      }
      openMenu(b);
    };
    b.onmouseenter = () => {
      if (openName && $("#ctxmenu") && openName !== b.dataset.menu) openMenu(b);
    };
  });
  document.addEventListener("mousedown", () => setTimeout(() => {
    if (!$("#ctxmenu")) {
      openName = null;
      $$("[data-menu]", bar).forEach((x) => x.classList.remove("open"));
    }
  }, 0));
})();
function openLookSettings() {
  const modal = $("#look-modal"), box = $("#look-body");
  box.innerHTML = `<div class="look-sec"><h5>Тема</h5><div class="look-themes">${Object.entries(THEMES).map(([k, l]) => `<button class="look-theme t-${k} ${UIP.theme === k ? "active" : ""}" data-th="${k}"><i></i><span>${l}</span></button>`).join("")}</div></div>
    <div class="look-sec"><h5>Колір акценту</h5><div class="look-acc">${Object.entries(ACCENTS).map(([k, a]) => `<button class="${UIP.accent === k ? "active" : ""}" data-ac="${k}" style="--c:${a[0]}" title="${a[2]}"><i></i>${a[2]}</button>`).join("")}</div></div>
    <div class="look-sec"><h5>Інтерфейс</h5>
      <label class="chk"><input type="checkbox" id="lk-compact" ${UIP.compact ? "checked" : ""}> Компактний режим — більше місця для доріжок на невеликому екрані</label>
      <label class="chk"><input type="checkbox" id="lk-hints" ${UIP.hints ? "checked" : ""}> Рядок підказок унизу екрана</label>
      <label class="chk"><input type="checkbox" id="lk-motion" ${UIP.motion ? "checked" : ""}> Анімації</label>
      <p class="muted small">Масштаб усього інтерфейсу: <span class="kbd">Ctrl +</span> / <span class="kbd">Ctrl −</span>, звичайний — <span class="kbd">Ctrl 0</span>.</p></div>
    <div class="look-sec"><h5>Розкладка панелей</h5><p class="muted small">Межі між панелями можна перетягувати: таймлайн і мікшер, колонку доріжок, бічну панель. Подвійний клік по межі повертає стандартний розмір. Готові розкладки і збереження своїх — у меню «Вигляд».</p>
      <div class="look-lay">${Object.keys(LAYOUTS).map((n) => `<button class="btn ghost sm" data-lay="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("")}</div></div>`;
  $$("[data-th]", box).forEach((b) => b.onclick = () => {
    UIP.theme = b.dataset.th;
    saveUI();
    applyLook();
    openLookSettings();
    if (S.B) draw();
  });
  $$("[data-ac]", box).forEach((b) => b.onclick = () => {
    UIP.accent = b.dataset.ac;
    saveUI();
    applyLook();
    openLookSettings();
  });
  $("#lk-compact").onchange = (e) => {
    UIP.compact = e.target.checked;
    saveUI();
    applyLook();
    if (S.B) setTimeout(() => {
      layout();
      draw();
    }, 50);
  };
  $("#lk-hints").onchange = (e) => {
    UIP.hints = e.target.checked;
    saveUI();
    applyLook();
  };
  $("#lk-motion").onchange = (e) => {
    UIP.motion = e.target.checked;
    saveUI();
    applyLook();
  };
  $$("[data-lay]", box).forEach((b) => b.onclick = needProject(() => {
    applyLayout(LAYOUTS[b.dataset.lay]);
    modal.hidden = true;
  }));
  modal.hidden = false;
}
async function openAbout() {
  const sys = await api.get("/api/system").catch(() => ({}));
  const modal = $("#look-modal");
  $("#look-modal h3").textContent = "Про InkBeat";
  $("#look-body").innerHTML = `<div class="about"><svg viewBox="0 0 32 32" width="56" height="56"><rect width="32" height="32" rx="7" fill="#1b1e26"/><g fill="var(--amber)"><rect x="6" y="12" width="3" height="8" rx="1.5"/><rect x="11" y="7" width="3" height="18" rx="1.5"/><rect x="16" y="10" width="3" height="12" rx="1.5"/></g><g fill="#4fd1c5"><rect x="21" y="9" width="6" height="3" rx="1"/><rect x="21" y="15" width="4" height="3" rx="1"/><rect x="21" y="21" width="6" height="3" rx="1"/></g></svg>
    <div><h4>InkBeat ${escapeHtml(sys.version || "")}</h4><p class="muted">Пісня → редаговані доріжки й MIDI для FL Studio. Вокальна студія, зведення, мастеринг.</p>
    <p class="muted small">Обчислення: ${sys.device === "cuda" ? "відеокарта " + escapeHtml(sys.gpu || "") : "процесор"} · Python ${escapeHtml(sys.python || "")} · ${DESK.on ? "застосунок" : "вікно браузера"}</p>
    <p class="muted small">Проєкти: ${escapeHtml(sys.workspace || "")}</p><p class="muted small">Ліцензії сторонніх компонентів — у файлі THIRD_PARTY_NOTICES.txt у папці програми.</p></div></div>`;
  modal.hidden = false;
  const restore = () => $("#look-modal h3").textContent = "Вигляд";
  modal.querySelector("[data-close]").addEventListener("click", restore, { once: true });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "F11" && DESK.on) {
    e.preventDefault();
    DESK.api.fullscreen();
  }
});
const _openProjectL = openProject;
openProject = async function(pid) {
  await _openProjectL(pid);
  applyLayout(UIP.layout, { silent: true });
};
applyLook();
applyLayout(UIP.layout, { silent: true });
