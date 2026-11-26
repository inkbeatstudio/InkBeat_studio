"use strict";
const UPD = { info: null, last: null, busy: false, installed: null };
function updNotes(md) {
  const lines = String(md || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 40);
  if (!lines.length) return '<p class="muted">Опис змін не додано.</p>';
  let html = "", list = false;
  for (const l of lines) {
    const li = l.match(/^[-*•]\s+(.*)/);
    const h = l.match(/^#{1,4}\s+(.*)/);
    if (li) {
      if (!list) { html += "<ul>"; list = true; }
      html += `<li>${escapeHtml(li[1]).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`;
      continue;
    }
    if (list) { html += "</ul>"; list = false; }
    html += h ? `<h4>${escapeHtml(h[1])}</h4>` : `<p>${escapeHtml(l).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`;
  }
  return html + (list ? "</ul>" : "");
}
function updRestartBtn() {
  return DESK.on ? '<button class="btn primary" data-upd="restart">Перезапустити зараз</button>' : '<span class="muted">Закрийте InkBeat і запустіть знову.</span>';
}
function updCard(html, sticky = true) {
  let c = document.getElementById("upd-card");
  if (!c) {
    c = document.createElement("div");
    c.id = "upd-card";
    document.body.appendChild(c);
    c.addEventListener("click", updClick);
  }
  c.innerHTML = `<button class="x" data-upd="hide">&times;</button>${html}`;
  c.hidden = false;
  c.classList.toggle("sticky", sticky);
}
function updHide() {
  const c = document.getElementById("upd-card");
  if (c) c.hidden = true;
}
async function updClick(e) {
  const k = e.target.dataset && e.target.dataset.upd;
  if (!k) return;
  if (k === "hide") updHide();
  if (k === "later") {
    updHide();
    if (UPD.last) await api.post("/api/update/prefs", { skip: UPD.last.latest }).catch(() => {});
  }
  if (k === "notes") openUpdates();
  if (k === "whatsnew") {
    updHide();
    careModal(`Що нового у версії ${escapeHtml(UPD.last.latest)}`, `<div class="upd-notes" style="max-height:60vh">${updNotes(UPD.last.notes)}</div><div class="modal-actions"><button class="btn primary" id="upd-ok">Добре</button></div>`);
    $("#upd-ok").onclick = () => { $("#care-modal").hidden = true; };
  }
  if (k === "install") updInstall(true);
  if (k === "restart") DESK.api.restart();
}
async function updInstall(show) {
  if (UPD.busy) return;
  UPD.busy = true;
  const v = UPD.last && UPD.last.latest;
  if (show) updCard(`<div class="upd-t">Оновлюю InkBeat до ${escapeHtml(v || "")}</div><div class="pbar"><div id="upd-p"></div></div><div class="upd-s muted small" id="upd-s">Завантажую…</div>`);
  try {
    const r = await api.post("/api/update/install", {});
    const res = await careWait(r.job, (p) => {
      const b = document.getElementById("upd-p"), s = document.getElementById("upd-s");
      if (b) b.style.width = Math.round(p * 100) + "%";
      if (s) s.textContent = p < 0.5 ? `Завантажую… ${Math.round(p * 200)}%` : p > 0.72 && p < 1 ? "Доставляю нові бібліотеки — це може зайняти кілька хвилин…" : "Встановлюю файли…";
    });
    UPD.installed = res;
    updCard(`<div class="upd-t">InkBeat оновлено до ${escapeHtml(res.new)}</div><div class="upd-s">Зміни запрацюють після перезапуску. Проєкти й налаштування збережено.</div><div class="upd-a"><button class="btn ghost" data-upd="notes">Що нового</button>${updRestartBtn()}</div>`);
  } catch (e) {
    updCard(`<div class="upd-t">Не вдалося оновити</div><div class="upd-s warn">${escapeHtml(e.message)}</div><div class="upd-a"><button class="btn ghost" data-upd="hide">Закрити</button><button class="btn primary" data-upd="install">Спробувати ще</button></div>`);
  }
  UPD.busy = false;
}
async function updAuto() {
  try {
    UPD.info = await api.get("/api/update/info");
    const p = UPD.info.prefs;
    if (p.just_updated && p.just_updated.version) {
      const j = p.just_updated;
      UPD.last = { latest: j.version, notes: j.notes, current: j.version };
      updCard(`<div class="upd-t">InkBeat оновлено до версії ${escapeHtml(j.version)}</div><div class="upd-s">Оновлення завантажилося з GitHub і встановилося під час запуску. Проєкти й налаштування на місці.</div><div class="upd-a"><button class="btn ghost" data-upd="hide">Добре</button><button class="btn primary" data-upd="whatsnew">Що нового</button></div>`);
      api.post("/api/update/prefs", { just_updated: null }).catch(() => {});
      return;
    }
    if (!p.auto_check) return;
    const r = await api.post("/api/update/check", {});
    UPD.last = r;
    if (!r.available) return;
    if (p.auto_install) {
      const busy = await api.get("/api/busy").catch(() => ({ busy: false }));
      if (busy.busy) {
        setTimeout(updAuto, 10 * 60e3);
        return;
      }
      updInstall(false).then(() => {});
      return;
    }
    if (p.skip === r.latest) return;
    updCard(`<div class="upd-t">Доступна нова версія ${escapeHtml(r.latest)}</div><div class="upd-s">У вас ${escapeHtml(r.current)}. Оновлення займе хвилину, проєкти не зачіпаються.</div><div class="upd-a"><button class="btn ghost" data-upd="later">Пізніше</button><button class="btn ghost" data-upd="notes">Що нового</button><button class="btn primary" data-upd="install">Оновити</button></div>`);
  } catch (e) {
  }
}
async function openUpdates() {
  updHide();
  careModal("Оновлення InkBeat", `<p class="muted">Перевіряю…</p>`);
  let info, r;
  try {
    info = UPD.info = await api.get("/api/update/info");
    r = UPD.last = await api.post("/api/update/check", { force: true });
  } catch (e) {
    $("#care-body").innerHTML = `<p class="warn">${escapeHtml(e.message)}</p>`;
    return;
  }
  const p = info.prefs;
  const state = UPD.installed ? `<div class="upd-box ok"><b>Оновлення ${escapeHtml(UPD.installed.new)} встановлено.</b> Перезапустіть програму, щоб воно запрацювало.</div>`
    : r.error ? `<div class="upd-box warn">${escapeHtml(r.error)}</div>`
    : r.available ? `<div class="upd-box new"><b>Доступна версія ${escapeHtml(r.latest)}</b> · у вас ${escapeHtml(r.current)}</div>`
    : `<div class="upd-box ok">У вас найновіша версія — <b>${escapeHtml(r.current)}</b>.</div>`;
  $("#care-body").innerHTML = `${state}
    ${r.latest ? `<div class="upd-notes"><div class="upd-nh">Що нового у версії ${escapeHtml(r.latest)}</div>${updNotes(r.notes)}</div>` : ""}
    <label class="upd-opt"><input type="checkbox" id="upd-ac" ${p.auto_check ? "checked" : ""}> <span><b>Перевіряти оновлення автоматично</b><br><span class="muted small">Під час кожного запуску програми.</span></span></label>
    <label class="upd-opt"><input type="checkbox" id="upd-auto" ${p.auto_install ? "checked" : ""}> <span><b>Встановлювати оновлення самостійно</b><br><span class="muted small">Нова версія завантажується з GitHub і встановлюється сама — під час запуску програми або у фоні, коли немає розбору.</span></span></label>
    <details class="upd-dev"><summary>Для розробника: звідки брати оновлення</summary>
      <div class="muted small" style="margin:8px 0">Репозиторій GitHub у форматі <b>власник/назва</b>. Програма бере найновіше: реліз із файлом <b>InkBeat-update.zip</b> або просто код з гілки <b>main</b>, якщо номер версії в ньому більший.</div>
      <div style="display:flex;gap:8px"><input id="upd-repo" type="text" class="inp" style="flex:1" value="${escapeHtml(info.repo)}"><button class="btn ghost" id="upd-repo-save">Зберегти</button></div></details>
    <div class="modal-actions"><a class="btn ghost" href="#" id="upd-page">Сторінка релізів</a>${UPD.installed ? updRestartBtn() : r.available ? '<button class="btn primary" data-upd="install">Оновити зараз</button>' : '<button class="btn primary" id="upd-again">Перевірити ще раз</button>'}</div>`;
  const body = $("#care-body");
  body.onclick = updClick;
  $("#upd-ac").onchange = (e) => api.post("/api/update/prefs", { auto_check: e.target.checked });
  $("#upd-auto").onchange = (e) => api.post("/api/update/prefs", { auto_install: e.target.checked });
  $("#upd-repo-save").onclick = async () => {
    const j = await api.post("/api/update/prefs", { repo: $("#upd-repo").value });
    toast(`Джерело оновлень: ${j.repo}`);
    openUpdates();
  };
  $("#upd-page").onclick = (e) => {
    e.preventDefault();
    const url = r.page || `https://github.com/${info.repo}/releases`;
    if (DESK.on && DESK.api.open_url) DESK.api.open_url(url);
    else window.open(url, "_blank");
  };
  if ($("#upd-again")) $("#upd-again").onclick = openUpdates;
  if (body.querySelector('[data-upd="install"]')) body.querySelector('[data-upd="install"]').addEventListener("click", () => { $("#care-modal").hidden = true; });
}
(function updMenus() {
  const help = MENUS["Довідка"];
  MENUS["Довідка"] = () => help().concat([["Перевірити оновлення…", openUpdates]]);
  setTimeout(updAuto, 6000);
})();
