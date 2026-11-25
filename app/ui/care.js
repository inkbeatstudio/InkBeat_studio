"use strict";
const ERRLOG = (() => {
  let a = [];
  try {
    a = JSON.parse(localStorage.getItem("inkbeat.errors") || "[]");
  } catch (e) {
  }
  return a;
})();
function logErr(kind, msg, stack) {
  ERRLOG.push({ t: new Date().toISOString(), kind, msg: String(msg).slice(0, 500), stack: String(stack || "").slice(0, 1500), view: S.view, pid: S.pid || null });
  if (ERRLOG.length > 60) ERRLOG.splice(0, ERRLOG.length - 60);
  try {
    localStorage.setItem("inkbeat.errors", JSON.stringify(ERRLOG));
  } catch (e) {
  }
}
window.addEventListener("error", (e) => logErr("error", e.message, e.error && e.error.stack));
window.addEventListener("unhandledrejection", (e) => logErr("promise", e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));
const _consoleError = console.error.bind(console);
console.error = (...a) => {
  logErr("console", a.map((x) => x && x.message || String(x)).join(" "), a[0] && a[0].stack);
  _consoleError(...a);
};
function careModal(title, html) {
  const m = $("#care-modal");
  $("#care-title").textContent = title;
  $("#care-body").innerHTML = html;
  m.hidden = false;
  return m;
}
async function careWait(jid, onProg) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const j = await api.get(`/api/process/${jid}`);
    if (onProg) onProg(j.progress || 0);
    if (j.status !== "running") {
      if (j.status !== "done") throw new Error(j.error || "помилка");
      return j.result;
    }
  }
}
function openReport() {
  careModal("Звіт про проблему", `<p>Програма збере в один файл журнали роботи, відомості про систему та останні помилки й покладе його на робочий стіл. Аудіо й проєкти в звіт <b>не потрапляють</b>.</p>
    <label class="muted small">Що сталося? (необов'язково)</label>
    <textarea id="rep-note" class="lyr-text" style="min-height:110px" placeholder="Наприклад: натиснув «Розібрати» на пісні 6 хвилин, на 40% усе зупинилось"></textarea>
    <div class="modal-actions"><span class="muted small">Помилок інтерфейсу зафіксовано: ${ERRLOG.length}</span><button class="btn primary" id="rep-go">Створити звіт</button></div>`);
  $("#rep-go").onclick = async () => {
    $("#rep-go").disabled = true;
    $("#rep-go").textContent = "Збираю…";
    try {
      const r = await api.post("/api/report", { ui_errors: ERRLOG, note: $("#rep-note").value });
      $("#care-body").innerHTML = `<p>Готово. Файл звіту:</p><div class="ex-path">${escapeHtml(r.path)}</div><p class="muted">Папка відкрилась автоматично. Надішліть цей файл разом з описом проблеми — за ним видно, що саме пішло не так.</p><div class="modal-actions"><button class="btn primary" data-close2>Добре</button></div>`;
      $("#care-body [data-close2]").onclick = () => $("#care-modal").hidden = true;
    } catch (e) {
      toast("Не вдалося створити звіт: " + e.message, true);
      $("#rep-go").disabled = false;
      $("#rep-go").textContent = "Створити звіт";
    }
  };
}
function pickZip() {
  return new Promise((res) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".zip";
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
}
async function zipSource() {
  if (DESK.on && DESK.api.open_zip) {
    const p = await DESK.api.open_zip();
    return p && p[0] ? { path: p[0] } : null;
  }
  const f = await pickZip();
  return f ? { file: f } : null;
}
async function sendZip(url, src) {
  if (src.path) return api.post(url, { path: src.path });
  const fd = new FormData();
  fd.append("file", src.file, src.file.name);
  const r = await fetch(url, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "помилка");
  return j;
}
async function updateFromZip() {
  const src = await zipSource();
  if (!src) return;
  careModal("Оновлення програми", `<p>Оновлюю InkBeat з архіву. Ваші проєкти, бібліотека й налаштування не зачіпаються. Попередня версія файлів зберігається в папці <span class="kbd">.backup</span>.</p><div class="pbar"><div id="upd-bar"></div></div><p class="muted small" id="upd-st">Розпаковую…</p>`);
  try {
    const r = await sendZip("/api/update", src);
    const res = await careWait(r.job, (p) => {
      $("#upd-bar").style.width = p * 100 + "%";
      $("#upd-st").textContent = p > 0.72 && p < 1 ? "Доставляю нові бібліотеки (може зайняти кілька хвилин)…" : "Оновлюю файли…";
    });
    $("#care-body").innerHTML = `<p>Готово: версія <b>${escapeHtml(res.old)}</b> → <b>${escapeHtml(res.new)}</b>, оновлено файлів: ${res.files}${res.deps ? ", бібліотеки доставлено" : ""}.</p><p>Щоб зміни запрацювали, програму треба перезапустити.</p>
      <div class="modal-actions">${DESK.on ? '<button class="btn primary" id="upd-restart">Перезапустити зараз</button>' : '<span class="muted">Закрийте вікно й запустіть InkBeat знову.</span>'}</div>`;
    if ($("#upd-restart")) $("#upd-restart").onclick = () => DESK.api.restart();
  } catch (e) {
    $("#care-body").innerHTML = `<p>Не вдалося оновити:</p><p class="warn">${escapeHtml(e.message)}</p><div class="modal-actions"><button class="btn primary" data-close2>Закрити</button></div>`;
    $("#care-body [data-close2]").onclick = () => $("#care-modal").hidden = true;
  }
}
async function duplicateProject() {
  if (!S.pid) return;
  const t = (prompt("Назва копії проєкту:", `${S.B.project.title} (копія)`) || "").trim();
  if (!t) return;
  await flushMix();
  try {
    const r = await api.post(`/api/project/${S.pid}/duplicate`, { title: t });
    toast(`Створено копію «${t}». Відкриваю…`);
    openProject(r.pid);
  } catch (e) {
    toast("Не вдалося: " + e.message, true);
  }
}
async function archiveProject() {
  if (!S.pid) return;
  await flushMix();
  toast("Пакую проєкт в архів… Для великої пісні це може зайняти хвилину.");
  const a = document.createElement("a");
  a.href = `/api/project/${S.pid}/archive`;
  a.download = `${S.B.project.title}.inkbeat.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function importProject() {
  const src = await zipSource();
  if (!src) return;
  careModal("Імпорт проєкту", `<p>Розпаковую проєкт…</p><div class="pbar"><div id="imp-bar" style="width:40%"></div></div>`);
  try {
    const r = await sendZip("/api/projects/import", src);
    const res = await careWait(r.job);
    $("#care-modal").hidden = true;
    toast("Проєкт імпортовано.");
    openProject(res.pid);
  } catch (e) {
    $("#care-body").innerHTML = `<p class="warn">${escapeHtml(e.message)}</p><div class="modal-actions"><button class="btn primary" data-close2>Закрити</button></div>`;
    $("#care-body [data-close2]").onclick = () => $("#care-modal").hidden = true;
  }
}
(function careMenus() {
  const file = MENUS["Файл"], help = MENUS["Довідка"];
  MENUS["Файл"] = () => {
    const items = file();
    const tail = items[items.length - 1] && items[items.length - 1][0] === "Вийти" ? items.pop() : null;
    return items.concat([null, ["Зберегти копію проєкту…", needProject(duplicateProject)], ["Експортувати проєкт в архів (.zip)", needProject(archiveProject)], ["Імпортувати проєкт з архіву…", importProject], null, ["Оновити програму з архіву…", updateFromZip]], tail ? [null, tail] : []);
  };
  MENUS["Довідка"] = () => help().concat([null, ["Звіт про проблему…", openReport]]);
})();
