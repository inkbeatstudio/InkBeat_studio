"use strict";
const VE_BLENDS = [["source-over", "Звичайне"], ["screen", "Освітлення"], ["lighter", "Додавання"], ["multiply", "Множення"], ["overlay", "Перекриття"], ["soft-light", "М'яке світло"], ["difference", "Різниця"], ["color-dodge", "Висвітлення"]];
function viNum(label, path, min, max, step, unit, hint) {
  return `<div class="vi-row"${hint ? ` data-hint="${escapeHtml(hint)}"` : ""}><span>${label}</span><div class="vi-num"><input type="range" data-p="${path}" min="${min}" max="${max}" step="${step}"><input type="number" data-pn="${path}" min="${min}" max="${max}" step="${step}"><em>${unit || ""}</em></div></div>`;
}
function viColor(label, path, alphaPath) {
  return `<div class="vi-row"><span>${label}</span><div class="vi-col"><input type="color" data-pc="${path}">${alphaPath ? `<input type="range" data-p="${alphaPath}" min="0" max="1" step="0.01" data-hint="Непрозорість">` : ""}</div></div>`;
}
function viSel(label, path, opts, hint) {
  return `<div class="vi-row"${hint ? ` data-hint="${escapeHtml(hint)}"` : ""}><span>${label}</span><div><select data-ps="${path}">${opts.map(([v, n]) => `<option value="${escapeHtml(String(v))}">${escapeHtml(n)}</option>`).join("")}</select></div></div>`;
}
function viChk(label, path, hint) {
  return `<label class="vi-chk"${hint ? ` data-hint="${escapeHtml(hint)}"` : ""}><input type="checkbox" data-pk="${path}"> ${label}</label>`;
}
function viSeg(label, path, opts) {
  return `<div class="vi-row"><span>${label}</span><div class="np-seg vi-seg">${opts.map(([v, n, h]) => `<button type="button" data-pg="${path}" data-v="${escapeHtml(String(v))}"${h ? ` data-hint="${escapeHtml(h)}"` : ""}>${n}</button>`).join("")}</div></div>`;
}
const viGroup = (title, body, open = true) => `<details class="vi-grp" ${open ? "open" : ""}><summary>${title}</summary><div class="vi-body">${body}</div></details>`;
function veFontOptions() {
  const user = (VE.doc.fonts || []).map((f) => [f.family, f.family + " (ваш)"]);
  return [...VE_FONTS.map(([f]) => [f, f]), ...user, ...VE_SYS_FONTS.map((f) => [f, f + " (системний)"]), ["Segoe UI Emoji", "Емодзі"]];
}
function viTextStyle(l) {
  const lyr = l.type === "lyrics";
  return (l.type === "text" ? `<textarea id="vi-text" rows="3" placeholder="Введіть текст" ${l.dyn ? "disabled" : ""}>${escapeHtml(l.text || "")}</textarea>` +
      viSel("Зміст", "dyn", [["", "Свій текст"], ["title", "Назва треку"], ["artist", "Виконавець"], ["bpm", "Темп"], ["key", "Тональність"], ["section", "Частина пісні"], ["chord", "Поточний акорд"]], "Текст може підставлятися з проєкту й змінюватися сам") : "") +
    (l.type === "timer" ? viSel("Формат", "fmtT", [["elapsed", "Минуло"], ["both", "Минуло / усього"], ["left", "Залишилось"]]) : "") +
    viGroup("Шрифт", `<div class="vi-row"><span>Шрифт</span><div class="vi-font"><select data-ps="font">${veFontOptions().map(([v, n]) => `<option value="${escapeHtml(v)}" style="font-family:'${escapeHtml(v)}'">${escapeHtml(n)}</option>`).join("")}</select><button class="btn ghost sm" id="vi-fontup" data-hint="Додати свій шрифт: TTF, OTF, WOFF">＋</button></div></div>` +
      viNum("Розмір", "size", 12, 300, 1, "px") +
      viSel("Насиченість", "weight", [[100, "Тонкий"], [300, "Світлий"], [400, "Звичайний"], [500, "Середній"], [600, "Напівжирний"], [700, "Жирний"], [800, "Дуже жирний"], [900, "Чорний"]]) +
      `<div class="vi-row"><span>Вигляд</span><div class="np-seg vi-seg"><button type="button" data-tog="italic" data-hint="Курсив"><i>I</i></button><button type="button" data-tog="upper" data-hint="Великі літери">AA</button></div></div>` +
      viSeg("Вирівнювання", "align", [["left", "⇤", "Ліворуч"], ["center", "≡", "По центру"], ["right", "⇥", "Праворуч"]]) +
      viNum("Між літерами", "ls", -0.1, 0.6, 0.01, "em") + viNum("Між рядками", "lh", 0.7, 2.5, 0.05, "×") +
      viNum("Ширина рядка", "maxW", 100, 3000, 10, "px", "Довші рядки переносяться. Також можна тягнути бічні маркери рамки"))
    + viGroup("Колір", viColor(lyr ? "Колір тексту" : "Колір", "color") +
      (lyr ? viColor("Підсвітка (караоке)", "hl") + viNum("Наступний рядок", "dim", 0, 1, 0.05, "", "Яскравість другого рядка в режимі «Два рядки»") : "") +
      viChk("Градієнт", "grad.on") + `<div class="vi-sub" data-show="grad.on">${viColor("Від", "grad.c1")}${viColor("До", "grad.c2")}${viNum("Кут", "grad.angle", 0, 360, 1, "°")}</div>`)
    + viGroup("Контур", viNum("Товщина", "stroke.w", 0, 30, 0.5, "px") + viColor("Колір", "stroke.c"), !!(l.stroke && l.stroke.w))
    + viGroup("Тінь і сяйво", viChk("Увімкнути", "shadow.on") + `<div class="vi-sub" data-show="shadow.on">${viColor("Колір", "shadow.c", "shadow.a")}${viNum("Розмиття", "shadow.blur", 0, 100, 1, "px")}${viNum("Зсув X", "shadow.x", -60, 60, 1, "px")}${viNum("Зсув Y", "shadow.y", -60, 60, 1, "px")}</div>`, !!(l.shadow && l.shadow.on))
    + viGroup("Підкладка", viChk("Увімкнути", "box.on") + `<div class="vi-sub" data-show="box.on">${viSeg("Форма", "box.mode", [["block", "Блок"], ["line", "По рядках"]])}${viColor("Колір", "box.c", "box.a")}${viNum("Заокруглення", "box.r", 0, 80, 1, "px")}${viNum("Відступ", "box.pad", 0, 80, 1, "px")}</div>`, !!(l.box && l.box.on));
}
function viImageStyle(l) {
  const vid = l.type === "video";
  return `<div class="vi-media"><button class="btn ghost sm" id="vi-replace">Замінити файл…</button>${l.media === "@cover" ? '<span class="muted small">Обкладинка проєкту</span>' : ""}</div>` +
    viNum("Ширина", "w", 20, 4000, 1, "px") +
    viSeg("Форма", "mask", [["rect", "▭", "Прямокутник"], ["square", "□", "Квадрат"], ["circle", "◯", "Коло"]]) +
    viNum("Заокруглення", "radius", 0, 600, 1, "px") +
    viGroup("Рамка й тінь", viNum("Рамка", "border.w", 0, 40, 1, "px") + viColor("Колір рамки", "border.c") + viChk("Тінь", "shadow.on") + `<div class="vi-sub" data-show="shadow.on">${viColor("Колір", "shadow.c", "shadow.a")}${viNum("Розмиття", "shadow.blur", 0, 120, 1, "px")}${viNum("Зсув Y", "shadow.y", -60, 60, 1, "px")}</div>`, false) +
    viGroup("Корекція", viNum("Яскравість", "f.b", 0, 200, 1, "%") + viNum("Контраст", "f.c", 0, 200, 1, "%") + viNum("Насиченість", "f.s", 0, 300, 1, "%") + viNum("Відтінок", "f.hue", -180, 180, 1, "°") + viNum("Чорно-біле", "f.gray", 0, 100, 1, "%") + viNum("Розмиття", "f.blur", 0, 40, 0.5, "px") +
      `<div class="vi-row"><span>Віддзеркалити</span><div class="np-seg vi-seg"><button type="button" data-tog="flipX">⇋</button><button type="button" data-tog="flipY">⇵</button></div></div>`, false) +
    viNum("Повільне наближення", "kb", 0, 3, 0.1, "", "Ефект Кена Бернса: зображення плавно наближається за час показу") +
    (vid ? viGroup("Відео", viNum("Почати з секунди", "trim", 0, 600, 0.1, "с") + viNum("Швидкість", "speed", 0.25, 4, 0.05, "×") + viChk("Повторювати по колу", "loop"), true) :
      (/\.gif$/i.test(l.media || "") ? viNum("Швидкість GIF", "speed", 0.25, 4, 0.05, "×") : ""));
}
function viShapeStyle(l) {
  return viSel("Фігура", "shape", [["rect", "Прямокутник"], ["circle", "Коло / еліпс"], ["line", "Лінія"], ["triangle", "Трикутник"], ["star", "Зірка"], ["heart", "Серце"]]) +
    viNum("Ширина", "w", 2, 4000, 1, "px") + viNum("Висота", "h", 2, 4000, 1, "px") + viNum("Заокруглення", "radius", 0, 600, 1, "px") +
    viColor("Заливка", "fill", "fa") + viChk("Градієнт", "grad.on") + `<div class="vi-sub" data-show="grad.on">${viColor("Від", "grad.c1")}${viColor("До", "grad.c2")}${viNum("Кут", "grad.angle", 0, 360, 1, "°")}</div>` +
    viNum("Контур", "stroke.w", 0, 40, 1, "px") + viColor("Колір контуру", "stroke.c");
}
function viVizStyle(l) {
  return viSel("Вигляд", "kind", [["bars", "Стовпчики"], ["mirror", "Дзеркальні стовпчики"], ["circle", "Коло"], ["wave", "Хвиля"], ["line", "Лінія"], ["dots", "Крапки"]]) +
    viNum("Ширина", "w", 50, 4000, 1, "px") + viNum("Висота", "h", 20, 4000, 1, "px") + viNum("Смуг", "bands", 8, 128, 1, "") + viNum("Проміжок", "gap", 0, 0.9, 0.05, "") +
    viNum("Чутливість", "sens", 0.2, 4, 0.05, "×") + viColor("Колір", "color") + viColor("Другий колір", "color2") + viChk("Заокруглені", "round") + viChk("Дзеркальна хвиля", "mirror");
}
function viProgressStyle(l) {
  return viSeg("Вигляд", "style", [["bar", "Смуга"], ["knob", "З повзунком"], ["dots", "Крапки"]]) + viNum("Ширина", "w", 50, 4000, 1, "px") + viNum("Товщина", "h", 2, 80, 1, "px") +
    viNum("Заокруглення", "radius", 0, 40, 1, "px") + viColor("Колір", "color") + viColor("Доріжка", "track", "ta") + viChk("Показувати час", "time");
}
function viAnim(l) {
  const lyr = l.type === "lyrics";
  return (lyr ? `<div class="muted small vi-note">Для субтитрів анімація застосовується до кожного рядка.</div>` : "") +
    viGroup("Поява", viSel("Ефект", "anim.in", Object.entries(VE_IN)) + viNum("Тривалість", "anim.inDur", 0.05, 4, 0.05, "с")) +
    viGroup("Зникнення", viSel("Ефект", "anim.out", Object.entries(VE_OUT)) + viNum("Тривалість", "anim.outDur", 0.05, 4, 0.05, "с")) +
    (lyr ? "" : viGroup("Постійний рух", viSel("Ефект", "anim.loop", Object.entries(VE_LOOP)) + viNum("Сила", "anim.loopAmt", 0, 1.5, 0.05, ""))) +
    `<button class="btn ghost sm ve-wide" id="vi-animprev">▶ Переглянути з початку елемента</button>`;
}
function viPos(l) {
  const p = vePos(l), t = veNowT(), at = p.kf.find((k) => Math.abs(k.t - t) < 0.04);
  const tmeta = l.type === "lyrics" ? "" : `<div class="vi-row"><span>Показувати</span><div class="vi-times"><input data-tt="t0" value="${vsFmtTime(veT0(l), true)}" data-hint="Початок показу (хв:сек від початку відео)"><span>—</span><input data-tt="t1" value="${l.t1 == null && !l.tail ? "кінець" : vsFmtTime(veT1(l), true)}" data-hint="Кінець показу. Порожньо або «кінець» — до кінця відео"></div></div>
    <div class="vi-row"><span></span><div class="vi-btns"><button class="btn ghost sm" data-tnow="t0">Старт тут</button><button class="btn ghost sm" data-tnow="t1">Кінець тут</button><button class="btn ghost sm" data-tnow="all">Усе відео</button></div></div>`;
  return viGroup("Час", tmeta + viNum("Прозорість", "opacity", 0, 1, 0.01, "") + viSel("Накладання", "blend", VE_BLENDS, "Як елемент змішується з тим, що під ним")) +
    viGroup("Розташування", `<div class="muted small vi-note">Окремо для кожного формату. Зараз: <b>${VFMT[VS.fmt].tag}</b>.</div>
      <div class="vi-row"><span>X / Y</span><div class="vi-xy"><input type="number" data-pp="x" step="1"><input type="number" data-pp="y" step="1"><em>px</em></div></div>
      <div class="vi-row"><span>Масштаб</span><div class="vi-num"><input type="range" data-pr="s" min="5" max="400" step="1"><input type="number" data-prn="s" min="1" max="2000" step="1"><em>%</em></div></div>
      <div class="vi-row"><span>Поворот</span><div class="vi-num"><input type="range" data-pr="r" min="-180" max="180" step="1"><input type="number" data-prn="r" min="-360" max="360" step="1"><em>°</em></div></div>
      <div class="vi-row"><span>Вирівняти</span><div class="vi-align">${[["l", "⇤", "До лівого краю"], ["cx", "↔", "По центру горизонтально"], ["r", "⇥", "До правого краю"], ["t", "⤒", "До верху"], ["cy", "↕", "По центру вертикально"], ["b", "⤓", "До низу"]].map(([k, i, h]) => `<button type="button" data-al="${k}" data-hint="${h}">${i}</button>`).join("")}</div></div>
      <div class="vi-btns"><button class="btn ghost sm" id="vi-copypos" data-hint="Скопіювати розташування цього елемента в інші формати відео">У всі формати</button><button class="btn ghost sm" id="vi-resetpos">Скинути</button></div>`) +
    viGroup("Ключові кадри", `<div class="muted small vi-note">Задайте розташування, розмір, поворот і прозорість у різні моменти — між ними елемент рухатиметься плавно.</div>
      <div class="vi-btns"><button class="btn ${at ? "danger" : "primary"} sm" id="vi-kf">${at ? "◇ Прибрати кадр" : "◆ Ключовий кадр тут"}</button>
      <button class="btn ghost sm" id="vi-kfprev" data-hint="Попередній ключовий кадр">◀◆</button><button class="btn ghost sm" id="vi-kfnext" data-hint="Наступний ключовий кадр">◆▶</button>
      ${p.kf.length ? `<button class="btn ghost sm" id="vi-kfclear">Прибрати всі (${p.kf.length})</button>` : ""}</div>`, true);
}
function veInspector() {
  const box = $("#ve-insp");
  if (!box || !VE.doc) return;
  const l = veSel();
  if (!l) {
    box.innerHTML = `<div class="vi-empty"><b>Нічого не вибрано</b><p class="muted small">Клікніть елемент на відео або на таймлайні, щоб змінити його. Додати новий — на панелі ліворуч.</p>
      <div class="vi-keys"><div><kbd>Пробіл</kbd>програти / пауза</div><div><kbd>Ctrl Z</kbd>скасувати</div><div><kbd>Ctrl D</kbd>дублювати</div><div><kbd>Ctrl C / V</kbd>копіювати / вставити</div><div><kbd>Delete</kbd>видалити</div><div><kbd>← ↑ → ↓</kbd>посунути (Shift — більше)</div><div><kbd>Ctrl + коліщатко</kbd>масштаб</div><div><kbd>Shift</kbd>поворот кроком 15°</div><div><kbd>Alt</kbd>без прилипання</div><div><kbd>Подвійний клік</kbd>редагувати текст</div></div></div>`;
    return;
  }
  const tabs = [["style", "Стиль"], ["anim", "Анімація"], ["pos", "Розташування"]];
  if (l.type === "scene" || l.type === "wm") tabs.splice(0, 1);
  if (!tabs.find((t) => t[0] === VE.itab)) VE.itab = tabs[0][0];
  let body = "";
  if (VE.itab === "style") {
    body = l.type === "text" || l.type === "lyrics" || l.type === "timer" ? viTextStyle(l) : l.type === "image" || l.type === "video" ? viImageStyle(l)
      : l.type === "shape" ? viShapeStyle(l) : l.type === "viz" ? viVizStyle(l) : l.type === "progress" ? viProgressStyle(l) : "";
    if (l.type === "lyrics") body = `<div class="vi-btns"><button class="btn ghost sm" id="vi-lyrpanel">Рядки й час субтитрів…</button></div>` + body;
  } else if (VE.itab === "anim") body = viAnim(l);
  else body = viPos(l);
  box.innerHTML = `<div class="vi-head"><i class="ve-lic">${(VE_TYPES[l.type] || ["", "?"])[1]}</i><input id="vi-name" value="${escapeHtml(veLabel(l))}" data-hint="Назва шару — лише для вас, у відео її не видно">
      <button class="btn ghost sm" id="vi-dup" data-hint="Дублювати (Ctrl+D)">⧉</button><button class="btn ghost sm" id="vi-del" data-hint="Видалити (Delete)">🗑</button></div>
    <div class="np-seg vi-tabs">${tabs.map(([k, n]) => `<button data-it="${k}" class="${VE.itab === k ? "on" : ""}">${n}</button>`).join("")}</div>
    <div class="vi-scroll">${body}</div>`;
  viBind(box, l);
  veInspSync();
}
function viVal(l, path) {
  if (path.startsWith("anim.") && !l.anim) l.anim = {};
  return veGet(l, path);
}
function veInspSync() {
  const box = $("#ve-insp"), l = veSel();
  if (!box || !l) return;
  const act = document.activeElement;
  box.querySelectorAll("[data-p]").forEach((i) => { const v = viVal(l, i.dataset.p); if (i !== act && v != null) i.value = v; });
  box.querySelectorAll("[data-pn]").forEach((i) => { const v = viVal(l, i.dataset.pn); if (i !== act && v != null) i.value = +(+v).toFixed(3); });
  box.querySelectorAll("[data-pc]").forEach((i) => { const v = viVal(l, i.dataset.pc); if (i !== act && typeof v === "string") i.value = v.slice(0, 7); });
  box.querySelectorAll("[data-ps]").forEach((i) => { const v = viVal(l, i.dataset.ps); if (i !== act) i.value = v == null ? "" : String(v); });
  box.querySelectorAll("[data-pk]").forEach((i) => { i.checked = !!viVal(l, i.dataset.pk); });
  box.querySelectorAll("[data-pg]").forEach((b) => b.classList.toggle("on", String(viVal(l, b.dataset.pg) ?? (b.dataset.pg === "box.mode" ? "block" : "")) === b.dataset.v));
  box.querySelectorAll("[data-tog]").forEach((b) => b.classList.toggle("on", !!l[b.dataset.tog]));
  box.querySelectorAll("[data-show]").forEach((d) => d.hidden = !viVal(l, d.dataset.show));
  const c = VS.canvas, tr = veTransform(l, veNowT());
  box.querySelectorAll("[data-pp]").forEach((i) => { if (i !== act) i.value = Math.round(tr[i.dataset.pp] * (i.dataset.pp === "x" ? c.width : c.height)); });
  box.querySelectorAll("[data-pr]").forEach((i) => { if (i !== act) i.value = i.dataset.pr === "s" ? Math.round(tr.s * 100) : Math.round(tr.r); });
  box.querySelectorAll("[data-prn]").forEach((i) => { if (i !== act) i.value = i.dataset.prn === "s" ? Math.round(tr.s * 100) : Math.round(tr.r); });
}
function viBind(box, l) {
  const ch = (now) => { veChanged(now); veInspSync(); };
  $$("[data-it]", box).forEach((b) => b.onclick = () => { VE.itab = b.dataset.it; veInspector(); });
  $("#vi-name", box).oninput = (e) => { l.name = e.target.value; veChanged(); veTimeline(); };
  $("#vi-dup", box).onclick = () => veDuplicate(l.id);
  $("#vi-del", box).onclick = () => veRemove(l.id);
  $$("input, textarea, select", box).forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
  const ta = $("#vi-text", box);
  if (ta) ta.oninput = () => { l.text = ta.value; if (!l.name || l.name.startsWith(tr("Ваш текст")) || l.name === "Текст") l.name = ta.value.split("\n")[0].slice(0, 24); veChanged(); };
  $$("[data-p]", box).forEach((i) => i.oninput = () => { veSet(l, i.dataset.p, +i.value); ch(); });
  $$("[data-pn]", box).forEach((i) => i.oninput = () => { if (i.value !== "" && isFinite(+i.value)) { veSet(l, i.dataset.pn, +i.value); ch(); } });
  $$("[data-pc]", box).forEach((i) => i.oninput = () => { veSet(l, i.dataset.pc, i.value); ch(); });
  $$("[data-ps]", box).forEach((i) => i.onchange = () => {
    const v = i.value, num = ["weight"].includes(i.dataset.ps);
    veSet(l, i.dataset.ps, num ? +v : v);
    if (i.dataset.ps === "dyn") { if (v) l.name = i.options[i.selectedIndex].text; veInspector(); }
    if (i.dataset.ps === "font" && VE.fontsReady[v]) VE.fontsReady[v].load().catch(() => {});
    ch(true);
  });
  $$("[data-pk]", box).forEach((i) => i.onchange = () => {
    const path = i.dataset.pk;
    if (path === "grad.on" && i.checked && !l.grad) l.grad = { on: true, c1: l.color || l.fill || "#ffb547", c2: "#f472b6", angle: 0 };
    else veSet(l, path, i.checked);
    ch(true);
  });
  $$("[data-pg]", box).forEach((b) => b.onclick = () => { veSet(l, b.dataset.pg, b.dataset.v); ch(true); });
  $$("[data-tog]", box).forEach((b) => b.onclick = () => { l[b.dataset.tog] = !l[b.dataset.tog]; ch(true); });
  const fu = $("#vi-fontup", box);
  if (fu) fu.onclick = async () => {
    const r = await veUpload("font");
    if (!r[0]) return;
    const fam = r[0].orig.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 40) || "Мій шрифт";
    const had = VE.doc.fonts.find((f) => f.file === r[0].name);
    if (had) { l.font = had.family; veChanged(true); veInspector(); return; }
    VE.doc.fonts.push({ family: fam, file: r[0].name });
    veUserFonts();
    if (VE.fontsReady[fam]) await VE.fontsReady[fam].load().catch(() => toast("Шрифт не вдалося відкрити.", true));
    l.font = fam;
    veChanged(true);
    veInspector();
  };
  const rp = $("#vi-replace", box);
  if (rp) rp.onclick = async () => {
    const r = await veUpload("media");
    if (!r[0]) return;
    if (!VE.doc.media.find((m) => m.name === r[0].name)) VE.doc.media.push({ name: r[0].name, orig: r[0].orig });
    l.media = r[0].name;
    l.type = veIsVideo(r[0].name) ? "video" : "image";
    veChanged(true);
    veInspector();
  };
  const lp = $("#vi-lyrpanel", box);
  if (lp) lp.onclick = () => { VE.tab = "lyrics"; vePanel(); };
  const ap = $("#vi-animprev", box);
  if (ap) ap.onclick = () => { veSeekT(l.type === "lyrics" ? Math.max(0, veNowT() - 1) : veT0(l)); vePlayToggle(); };
  const tparse = (v) => /^\s*(кінець|end)?\s*$/i.test(v) ? null : vsParseTime(v);
  $$("[data-tt]", box).forEach((i) => i.onchange = () => {
    const v = tparse(i.value);
    if (i.dataset.tt === "t0") { if (v == null) return veInspector(); l.t0 = +veClamp(v, 0, veDur() - 0.05).toFixed(2); delete l.tail; if (l.t1 != null && l.t1 <= l.t0) l.t1 = null; }
    else { delete l.tail; l.t1 = v == null ? null : +veClamp(v, veT0(l) + 0.05, veDur()).toFixed(2); }
    veChanged(true);
    veInspector();
    veTimeline();
  });
  $$("[data-tnow]", box).forEach((b) => b.onclick = () => {
    const t = +veNowT().toFixed(2), k = b.dataset.tnow;
    delete l.tail;
    if (k === "t0") { l.t0 = t; if (l.t1 != null && l.t1 <= t) l.t1 = null; }
    else if (k === "t1") { if (t > veT0(l)) l.t1 = t; }
    else { l.t0 = 0; l.t1 = null; }
    veChanged(true);
    veInspector();
    veTimeline();
  });
  const c = VS.canvas;
  $$("[data-pp]", box).forEach((i) => i.onchange = () => { const p = veEditPos(l, veNowT()); p[i.dataset.pp] = +i.value / (i.dataset.pp === "x" ? c.width : c.height); ch(true); });
  const setPR = (k, v) => { const p = veEditPos(l, veNowT()); if (k === "s") p.s = veClamp(v / 100, 0.01, 20); else p.r = v; ch(); };
  $$("[data-pr]", box).forEach((i) => i.oninput = () => setPR(i.dataset.pr, +i.value));
  $$("[data-prn]", box).forEach((i) => i.onchange = () => setPR(i.dataset.prn, +i.value));
  $$("[data-al]", box).forEach((b) => b.onclick = () => {
    const W = c.width, H = c.height, t = veNowT(), bx = veLayerBox(l, W, H, t), p = veEditPos(l, t), ins = vsInsets(W, H);
    const safe = VS.fmt === "tiktok" && VS.safe, ml = (safe ? ins.l : W * 0.05), mr = (safe ? ins.r : W * 0.05), mt = (safe ? ins.t : H * 0.05), mb = (safe ? ins.b : H * 0.05);
    const k = b.dataset.al;
    if (k === "cx") p.x = 0.5; else if (k === "cy") p.y = 0.5;
    else if (k === "l") p.x = (ml + bx.w / 2) / W; else if (k === "r") p.x = (W - mr - bx.w / 2) / W;
    else if (k === "t") p.y = (mt + bx.h / 2) / H; else p.y = (H - mb - bx.h / 2) / H;
    ch(true);
  });
  const cp = $("#vi-copypos", box);
  if (cp) cp.onclick = () => { const p = vePos(l); for (const f of VE_FMTS) if (f !== VS.fmt) l.pos[f] = JSON.parse(JSON.stringify(p)); veChanged(true); toast("Розташування скопійовано в усі формати."); };
  const rs = $("#vi-resetpos", box);
  if (rs) rs.onclick = () => { const p = vePos(l); Object.assign(p, { x: 0.5, y: 0.5, s: 1, r: 0, kf: [] }); veChanged(true); veInspector(); };
  const kf = $("#vi-kf", box);
  if (kf) kf.onclick = () => {
    const p = vePos(l), t = veNowT(), i = p.kf.findIndex((k) => Math.abs(k.t - t) < 0.04);
    if (i >= 0) p.kf.splice(i, 1);
    else {
      const cur = veTransform(l, t);
      if (!p.kf.length) Object.assign(p, { x: cur.x, y: cur.y, s: cur.s, r: cur.r });
      p.kf.push({ t: +t.toFixed(3), x: cur.x, y: cur.y, s: cur.s, r: cur.r, o: cur.o ?? 1 });
      p.kf.sort((a, b) => a.t - b.t);
      if (p.kf.length === 1) toast("Ключовий кадр додано. Перейдіть в інший момент і змініть розташування — з'явиться наступний.");
    }
    veChanged(true);
    veInspector();
    veTimeline();
  };
  const jump = (dir) => {
    const p = vePos(l), t = veNowT();
    const k = dir > 0 ? p.kf.find((x) => x.t > t + 0.04) : p.kf.slice().reverse().find((x) => x.t < t - 0.04);
    if (k) { veSeekT(k.t); setTimeout(veInspector, 30); }
  };
  if ($("#vi-kfprev", box)) $("#vi-kfprev", box).onclick = () => jump(-1);
  if ($("#vi-kfnext", box)) $("#vi-kfnext", box).onclick = () => jump(1);
  const kc = $("#vi-kfclear", box);
  if (kc) kc.onclick = () => { vePos(l).kf = []; veChanged(true); veInspector(); veTimeline(); };
}

function veTimeline() {
  const box = $("#ve-tl");
  if (!box || !VE.doc) return;
  const dur = veDur(), L = VE.doc.layers.slice().reverse(), P = period(), r0 = vsRange()[0];
  const sc = box.querySelector(".ve-tl-scroll");
  const keep = sc ? sc.scrollLeft : 0;
  const ticks = [];
  const step = dur > 240 ? 30 : dur > 90 ? 10 : dur > 30 ? 5 : dur > 10 ? 2 : 1;
  for (let s = 0; s <= dur + 1e-6; s += step) ticks.push(s);
  const pct = (t) => veClamp(t / dur, 0, 1) * 100;
  const row = (l) => {
    const kf = (vePos(l).kf || []).map((k) => `<i class="ve-kf" style="left:${pct(k.t)}%" data-kft="${k.t}" title="Ключовий кадр ${vsFmtTime(k.t, true)}"></i>`).join("");
    let inner;
    if (l.type === "lyrics") {
      inner = veLyricsLines(l).map((x, i) => {
        const a = (x.b0 - r0) * P, b = (x.b1 - r0) * P;
        if (b < 0 || a > dur) return "";
        return `<div class="ve-bar lyr" data-notr data-ln="${i}" style="left:${pct(a)}%;width:${Math.max(0.3, pct(b) - pct(a))}%"><i class="ve-e l" data-edge="l"></i><span>${escapeHtml(x.text)}</span><i class="ve-e r" data-edge="r"></i></div>`;
      }).join("");
    } else {
      const a = veT0(l), b = veT1(l);
      inner = `<div class="ve-bar t-${l.type}" data-bar="1" style="left:${pct(a)}%;width:${Math.max(0.5, pct(b) - pct(a))}%"><i class="ve-e l" data-edge="l"></i><span>${escapeHtml(veLabel(l))}</span><i class="ve-e r" data-edge="r"></i></div>`;
    }
    return `<div class="ve-tr ${VE.sel === l.id ? "on" : ""} ${l.hidden ? "off" : ""}" data-row="${l.id}">${inner}${kf}</div>`;
  };
  box.innerHTML = `<div class="ve-tl-head"><b>Таймлайн</b><span class="muted small">Тягніть смуги, щоб змінити час показу. Краї — початок і кінець. Ctrl + коліщатко — масштаб.</span><span class="ve-grow"></span>
      <button class="btn ghost sm" id="ve-tlc" data-hint="${VE.tlCollapsed ? "Показати таймлайн" : "Згорнути таймлайн — більше місця для перегляду"}">${VE.tlCollapsed ? "▴" : "▾"}</button>
      <button class="btn ghost sm" id="ve-tlzo" data-hint="Зменшити масштаб">−</button><button class="btn ghost sm" id="ve-tlzi" data-hint="Збільшити масштаб">＋</button></div>
    <div class="ve-tl-wrap"><div class="ve-tl-labels"><div class="ve-tl-rh"></div>${L.map((l) => `<div class="ve-tl-lab ${VE.sel === l.id ? "on" : ""} ${l.hidden ? "off" : ""}" data-lab="${l.id}"><i class="ve-lic">${(VE_TYPES[l.type] || ["", "?"])[1]}</i><span>${escapeHtml(veLabel(l))}</span><button data-eye="${l.id}" data-hint="Показати / сховати">${l.hidden ? "◌" : "◉"}</button></div>`).join("")}</div>
    <div class="ve-tl-scroll"><div class="ve-tl-inner" style="width:${VE.tlZoom * 100}%"><div class="ve-ruler" id="ve-ruler">${ticks.map((s) => `<span style="left:${pct(s)}%">${vsFmtTime(s)}</span>`).join("")}</div>${L.map(row).join("")}<div class="ve-ph" id="ve-ph"></div></div></div></div>`;
  box.classList.toggle("collapsed", !!VE.tlCollapsed);
  $("#ve-tlc", box).onclick = () => { VE.tlCollapsed = !VE.tlCollapsed; try { UIP.veTl = VE.tlCollapsed; saveUI(); } catch (e) {} veTimeline(); setTimeout(vsCanvas, 30); };
  const scr = box.querySelector(".ve-tl-scroll");
  scr.scrollLeft = keep;
  const lab = box.querySelector(".ve-tl-labels");
  scr.addEventListener("scroll", () => { lab.scrollTop = scr.scrollTop; });
  $("#ve-tlzo", box).onclick = () => { VE.tlZoom = Math.max(1, VE.tlZoom / 1.5); veTimeline(); };
  $("#ve-tlzi", box).onclick = () => { VE.tlZoom = Math.min(40, VE.tlZoom * 1.5); veTimeline(); };
  scr.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); VE.tlZoom = veClamp(VE.tlZoom * (e.deltaY < 0 ? 1.25 : 0.8), 1, 40); veTimeline(); } }, { passive: false });
  $$("[data-lab]", box).forEach((d) => {
    d.onclick = (e) => { if (e.target.closest("button")) return; VE.sel = d.dataset.lab; veRefreshSel(); };
    d.oncontextmenu = (e) => { e.preventDefault(); const l = VE.doc.layers.find((x) => x.id === d.dataset.lab); if (l) { VE.sel = l.id; veRefreshSel(); veLayerMenu(e, l); } };
  });
  $$("[data-eye]", box).forEach((b) => b.onclick = () => { const l = VE.doc.layers.find((x) => x.id === b.dataset.eye); l.hidden = !l.hidden; veChanged(true); veRefresh(); });
  const inner = box.querySelector(".ve-tl-inner");
  const tAt = (e) => { const rc = inner.getBoundingClientRect(); return veClamp((e.clientX - rc.left) / rc.width, 0, 1) * dur; };
  const ruler = $("#ve-ruler", box);
  ruler.onpointerdown = (e) => {
    ruler.setPointerCapture(e.pointerId);
    veSeekT(tAt(e));
    ruler.onpointermove = (ev) => veSeekT(tAt(ev));
    ruler.onpointerup = () => { ruler.onpointermove = null; };
  };
  $$("[data-kft]", box).forEach((k) => k.onpointerdown = (e) => { e.stopPropagation(); veSeekT(+k.dataset.kft); setTimeout(veInspector, 30); });
  $$("[data-row]", box).forEach((rw) => {
    rw.oncontextmenu = (e) => { e.preventDefault(); const l = VE.doc.layers.find((x) => x.id === rw.dataset.row); if (l) { VE.sel = l.id; veRefreshSel(); veLayerMenu(e, l); } };
    rw.onpointerdown = (e) => {
      const l = VE.doc.layers.find((x) => x.id === rw.dataset.row);
      if (!l) return;
      const bar = e.target.closest(".ve-bar");
      if (VE.sel !== l.id) { VE.sel = l.id; veInspector(); vePanel(); rw.parentElement.querySelectorAll(".ve-tr").forEach((x) => x.classList.toggle("on", x === rw)); box.querySelectorAll(".ve-tl-lab").forEach((x) => x.classList.toggle("on", x.dataset.lab === l.id)); }
      if (!bar) { veSeekT(tAt(e)); return; }
      if (l.locked) return;
      e.preventDefault();
      const edge = e.target.dataset.edge, t0m = tAt(e), snapPts = veSnapTimes(l);
      const snapT = (t) => { if (e.altKey) return t; const th = dur / inner.clientWidth * 8; let best = t; for (const s of snapPts) if (Math.abs(s - t) < th && Math.abs(s - t) < Math.abs(best - t) + 1e-9) best = s; return best; };
      let lnI = bar.dataset.ln != null ? +bar.dataset.ln : -1, L0 = null;
      if (lnI >= 0) { L0 = veLyrMaterialize(l).map((x) => ({ ...x })); }
      const a0 = veT0(l), b0 = veT1(l);
      rw.setPointerCapture(e.pointerId);
      let moved = false;
      rw.onpointermove = (ev) => {
        const dt = tAt(ev) - t0m;
        if (Math.abs(dt) * inner.clientWidth / dur < 2 && !moved) return;
        moved = true;
        if (lnI >= 0) {
          const x = l.lines[lnI], o = L0[lnI], d = dt / P;
          if (edge === "l") x.b0 = Math.min(o.b1 - 0.1 / P, r0 + snapT((o.b0 - r0) * P + dt) / P);
          else if (edge === "r") x.b1 = Math.max(o.b0 + 0.1 / P, r0 + snapT((o.b1 - r0) * P + dt) / P);
          else { const len = o.b1 - o.b0; x.b0 = r0 + snapT((o.b0 - r0) * P + dt) / P; x.b1 = x.b0 + len; }
        } else {
          delete l.tail;
          if (edge === "l") l.t0 = +veClamp(snapT(a0 + dt), 0, b0 - 0.05).toFixed(3);
          else if (edge === "r") { const v = veClamp(snapT(b0 + dt), a0 + 0.05, dur); l.t1 = v >= dur - 0.02 ? null : +v.toFixed(3); }
          else { const len = b0 - a0; let na = veClamp(snapT(a0 + dt), 0, Math.max(0, dur - len)); l.t0 = +na.toFixed(3); l.t1 = b0 >= dur - 0.02 && l.t1 == null && na === 0 ? null : +(na + len).toFixed(3); if (l.t1 != null && l.t1 >= dur - 0.02) l.t1 = null; }
        }
        veTlBarsUpdate(rw, l);
      };
      rw.onpointerup = () => {
        rw.onpointermove = null;
        rw.onpointerup = null;
        if (moved) { if (lnI >= 0) l.lines.sort((a, c) => a.b0 - c.b0); veChanged(true); veTimeline(); if (VE.tab === "lyrics") vePanel(); veInspSync(); }
        else if (lnI >= 0) veSeekT((veLyricsLines(l)[lnI].b0 - r0) * P + 0.01);
      };
    };
  });
  veTlPlayhead(veNowT());
}
function veSnapTimes(self) {
  const out = [0, veDur(), veNowT()];
  for (const l of VE.doc.layers) {
    if (l === self || l.type === "lyrics") continue;
    out.push(veT0(l), veT1(l));
  }
  return out;
}
function veTlBarsUpdate(rw, l) {
  const dur = veDur(), pct = (t) => veClamp(t / dur, 0, 1) * 100, P = period(), r0 = vsRange()[0];
  if (l.type === "lyrics") {
    rw.querySelectorAll(".ve-bar.lyr").forEach((b) => {
      const x = l.lines[+b.dataset.ln];
      if (!x) return;
      const a = (x.b0 - r0) * P, c = (x.b1 - r0) * P;
      b.style.left = pct(a) + "%";
      b.style.width = Math.max(0.3, pct(c) - pct(a)) + "%";
    });
  } else {
    const b = rw.querySelector(".ve-bar");
    b.style.left = pct(veT0(l)) + "%";
    b.style.width = Math.max(0.5, pct(veT1(l)) - pct(veT0(l))) + "%";
  }
}
function veTlPlayhead(t) {
  const ph = $("#ve-ph");
  if (!ph) return;
  ph.style.left = veClamp(t / veDur(), 0, 1) * 100 + "%";
  if (S.playing) {
    const sc = ph.closest(".ve-tl-scroll");
    if (sc && VE.tlZoom > 1) {
      const x = ph.offsetLeft;
      if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 60;
    }
  }
}
function veRefreshSel() {
  veInspector();
  veTimeline();
  if (VE.tab === "layers" || VE.tab === "text") vePanel();
}
(function veBoot() {
  const openBase = openVideoStudio;
  openVideoStudio = async function () {
    if (!S.B) return toast("Спершу відкрийте проєкт.", true);
    veLoadFonts();
    veBuildModal();
    vsLoad();
    if (VE.tlCollapsed == null) VE.tlCollapsed = !!UIP.veTl;
    if (VE.pid !== S.pid || !VE.doc) {
      VE.doc = null;
      VE.media = {};
      await veLoadDoc();
      VE.pid = S.pid;
    }
    await openBase();
    veFmtBtns();
    vePanel();
    veInspector();
    veTimeline();
    veUndoBtns();
  };
  const renderBase = vsRender;
  vsRender = function () {
    renderBase();
    if (VE.doc && veActive()) { veFmtBtns(); veInspector(); veTimeline(); }
  };
  const rangeBase = vsRangeChanged;
  vsRangeChanged = function (heavy) {
    rangeBase(heavy);
    if (VE.doc && veActive()) veTimeline();
  };
  const closeBase = vsClose;
  vsClose = function () {
    if (VE.syncMode) veSyncKey("Escape");
    closeBase();
    if (!VS.busy && VE.doc) { veChanged(true); veSaveNow(); for (const k in VE.media) { const m = VE.media[k]; if (m.el && m.el.pause) m.el.pause(); } }
  };
})();
