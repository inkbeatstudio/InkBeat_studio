"use strict";
const CR = { seen: new Set(), last: 0, sending: false, settings: {}, shown: false, recent: [] };
async function crSettings(force) {
  if (force || !CR.loaded) {
    CR.settings = await api.get("/api/settings").catch(() => ({})) || {};
    CR.loaded = true;
  }
  return CR.settings;
}
function crMode() {
  return CR.settings.crash_reports || "ask";
}
function crLog(message, stack, extra) {
  const key = String(message).slice(0, 160);
  const now = Date.now();
  CR.recent = CR.recent.filter((r) => now - r.t < 60000);
  if (CR.recent.some((r) => r.k === key) || CR.recent.length > 8) return;
  CR.recent.push({ k: key, t: now });
  fetch("/api/reports/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, stack, context: Object.assign({ view: S.view, lang: LANG, tab: S.dockTab || "" }, extra || {}) }) }).catch(() => {});
  setTimeout(crCheck, 400);
}
addEventListener("error", (e) => {
  const msg = e.message || (e.error && e.error.message) || "";
  if (!msg || /ResizeObserver|Script error\.?$/i.test(msg)) return;
  crLog(msg, (e.error && e.error.stack) || `${e.filename || ""}:${e.lineno || 0}:${e.colno || 0}`);
});
addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  const msg = (r && (r.message || String(r))) || "";
  if (!msg || /AbortError|NotAllowedError|Failed to fetch|NetworkError|play\(\) request/i.test(msg)) return;
  crLog("Promise: " + msg, (r && r.stack) || "");
});
async function crCheck() {
  if (CR.sending) return;
  await crSettings();
  if (crMode() === "never") return;
  const r = await api.get("/api/reports").catch(() => null);
  if (!r) return;
  const dismissed = new Set(UIP.crDismissed || []);
  const fresh = (r.items || []).filter((i) => !i.sent && !CR.seen.has(i.id) && !dismissed.has(i.id));
  if (!fresh.length) return;
  fresh.forEach((i) => CR.seen.add(i.id));
  if (crMode() === "auto" && r.report_url) {
    CR.sending = true;
    await api.post("/api/reports/send", { ids: fresh.map((i) => i.id) }).catch(() => null);
    CR.sending = false;
    return;
  }
  crCard(fresh);
}
function crCard(fresh) {
  let c = document.getElementById("cr-card");
  if (!c) {
    c = document.createElement("div");
    c.id = "cr-card";
    c.className = "cr-card";
    document.body.appendChild(c);
  }
  c.dataset.ids = fresh.map((i) => i.id).join(",");
  c.innerHTML = `<b>${tr("Щось пішло не так")}</b><span class="muted small">${escapeHtml(fresh[0].message.slice(0, 140))}</span><span class="small">${tr("Надішліть звіт розробнику — це допоможе швидко виправити помилку. Ви побачите весь текст перед відправкою; особистих даних і назв файлів у ньому немає.")}</span>
    <div class="cr-act"><button class="btn primary sm" data-c="send">${tr("Переглянути й надіслати")}</button><button class="btn ghost sm" data-c="later">${tr("Не зараз")}</button><button class="btn ghost sm" data-c="never">${tr("Не питати")}</button></div>`;
  c.hidden = false;
  $$("[data-c]", c).forEach((b) => b.onclick = async () => {
    const k = b.dataset.c;
    c.hidden = true;
    if (k !== "send") { UIP.crDismissed = (UIP.crDismissed || []).concat(c.dataset.ids.split(",")).slice(-200); saveUI(); }
    if (k === "send") crReview(c.dataset.ids.split(","));
    if (k === "never") { await api.post("/api/settings", { crash_reports: "never" }); await crSettings(true); toast(tr("Звіти більше не пропонуватимуться. Увімкнути знову: «Налаштування» → «Звіти про помилки».")); }
  });
}
async function crReview(ids) {
  const p = await api.post("/api/reports/preview", { ids: ids || [] }).catch(() => null);
  const st = await api.get("/api/reports").catch(() => ({}));
  const m = careModalBox("cr-modal", "Звіт про помилку", `<p class="muted small">${tr("Ось точний текст, який піде розробнику. Домашню папку, імена файлів користувача й адреси пошти замінено на позначки.")}</p>
    <label class="small">${tr("Що ви робили перед помилкою? (необов'язково)")}<textarea id="cr-note" rows="2" placeholder="${escapeHtml(tr("Наприклад: розділяв пісню й натиснув «Експорт»"))}"></textarea></label>
    <pre class="cr-pre" id="cr-pre">${escapeHtml(p ? p.text : "")}</pre>
    <label class="chk small"><input type="checkbox" id="cr-auto" ${crMode() === "auto" ? "checked" : ""}> ${tr("Надалі надсилати звіти автоматично, не питаючи")}</label>
    <div class="modal-actions"><button class="btn ghost" id="cr-copy">${tr("Скопіювати")}</button><button class="btn ghost" data-k="x">${tr("Скасувати")}</button><button class="btn primary" id="cr-send">${st.report_url ? tr("Надіслати") : tr("Надіслати через GitHub")}</button></div>`);
  m.querySelector(".modal-card").style.width = "min(820px,96vw)";
  const note = $("#cr-note", m);
  let t = 0;
  note.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const q = await api.post("/api/reports/preview", { ids, note: note.value }).catch(() => null); if (q) $("#cr-pre", m).textContent = q.text; }, 300); };
  $("#cr-copy", m).onclick = () => { navigator.clipboard.writeText($("#cr-pre", m).textContent).then(() => toast(tr("Текст звіту скопійовано."))); };
  $("#cr-send", m).onclick = async () => {
    const auto = $("#cr-auto", m).checked;
    await api.post("/api/settings", { crash_reports: auto ? "auto" : "ask" }).catch(() => {});
    await crSettings(true);
    CR.sending = true;
    const r = await api.post("/api/reports/send", { ids, note: note.value }).catch((e) => ({ error: e.message }));
    CR.sending = false;
    m.hidden = true;
    if (r && r.sent) return toast(tr("Дякуємо! Звіт надіслано."));
    if (r && r.manual) {
      navigator.clipboard.writeText(r.manual.text).catch(() => {});
      const api2 = window.pywebview && window.pywebview.api;
      if (api2 && api2.open_url) api2.open_url(r.manual.issue_url); else window.open(r.manual.issue_url, "_blank");
      toast(tr("Відкрито сторінку звіту на GitHub — натисніть там «Submit new issue». Текст також скопійовано."));
    } else toast(tr("Не вдалося надіслати") + (r && r.error ? ": " + r.error : ""), true);
  };
}
function openReports() {
  crSettings(true).then(async () => {
    const r = await api.get("/api/reports").catch(() => ({ items: [] }));
    const its = r.items || [];
    const m = careModalBox("crl-modal", "Журнал помилок", `<p class="muted small">${tr("Помилки, які програма зафіксувала на цьому комп'ютері. Нічого не надсилається без вашої згоди.")}</p>
      <div class="sb-list">${its.map((i) => `<div class="sb-row"><span class="muted small">${escapeHtml(i.at)}</span><b>${escapeHtml(i.message.slice(0, 110))}</b><span class="spacer"></span>${i.sent ? `<span class="ok small">${tr("надіслано")}</span>` : `<button class="btn ghost sm" data-id="${escapeHtml(i.id)}">${tr("Надіслати")}</button>`}</div>`).join("") || `<div class="dock-empty">${tr("Помилок немає.")}</div>`}</div>
      <div class="modal-actions"><button class="btn ghost" id="crl-clear">${tr("Очистити журнал")}</button><button class="btn primary" data-k="x">${tr("Закрити")}</button></div>`);
    $$("[data-id]", m).forEach((b) => b.onclick = () => { m.hidden = true; crReview([b.dataset.id]); });
    $("#crl-clear", m).onclick = async () => { await api.post("/api/reports/clear", {}); m.hidden = true; toast(tr("Журнал очищено.")); };
  });
}
(function crashUI() {
  const help = MENUS["Довідка"];
  MENUS["Довідка"] = () => help().concat([["Повідомити про проблему…", () => crReview([])], ["Журнал помилок…", openReports]]);
  setTimeout(crCheck, 4000);
  setInterval(() => { if (!document.hidden) crCheck(); }, 20000);
})();
