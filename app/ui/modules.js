"use strict";
const SEP = { st: null, poll: 0, waiters: [] };
async function sepStatus() {
  SEP.st = await api.get("/api/modules/separation").catch(() => null);
  return SEP.st;
}
function sepBanner() {
  const home = $("#view-home");
  if (!home) return;
  let b = $("#sep-banner");
  const st = SEP.st;
  if (!st || (st.ready && !st.running)) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement("div");
    b.id = "sep-banner";
    b.className = "sep-banner";
    const setup = $(".setup", home);
    (setup || home).before(b);
  }
  if (st.running) {
    b.innerHTML = `<div><b>${tr("Встановлюю модуль розбору пісні")}</b><span class="muted small">${escapeHtml(tr(st.stage || ""))} · ${Math.round((st.progress || 0) * 100)}%. ${tr("Тим часом можна працювати: створювати біти, записувати, зводити.")}</span><div class="pbar"><div style="width:${Math.round((st.progress || 0) * 100)}%"></div></div></div>`;
  } else {
    b.innerHTML = `<div><b>${tr("Модуль розбору пісні на доріжки ще не встановлено")}</b><span class="muted small">${st.error ? `<span class="warn">${tr("Минула спроба не вдалася")}: ${escapeHtml(st.error.split("\n").pop().slice(0, 140))}</span> ` : ""}${tr("Без нього працює все, крім розділення готової пісні: проєкти з нуля, стеми, запис, біти, зведення. Модуль займає близько")} ${st.gpu ? tr("2,5 ГБ (з прискоренням відеокартою)") : tr("250 МБ")} ${tr("і встановлюється у фоні.")}</span></div>
      <div class="sep-act">${st.gpu ? `<label class="chk small" data-hint="Розділення на відеокарті NVIDIA у 5–10 разів швидше, але завантаження більше"><input type="checkbox" id="sep-gpu" checked> ${tr("відеокарта NVIDIA")}</label>` : ""}<button class="btn primary" id="sep-go">${tr("Встановити зараз")}</button></div>`;
    $("#sep-go", b).onclick = () => sepInstall($("#sep-gpu", b) ? $("#sep-gpu", b).checked : null);
  }
}
async function sepInstall(gpu) {
  await api.post("/api/modules/separation/install", { gpu });
  sepWatch();
}
function sepWatch() {
  clearInterval(SEP.poll);
  SEP.poll = setInterval(async () => {
    const st = await sepStatus();
    if (!st) return;
    sepBanner();
    const m = document.getElementById("sep-modal");
    if (m && !m.hidden) sepModalPaint(m);
    if (!st.running) {
      clearInterval(SEP.poll);
      if (st.ready) {
        await loadSystem();
        toast(tr("Модуль розбору пісні встановлено. Тепер можна розділяти готові пісні на доріжки."));
        SEP.waiters.splice(0).forEach((f) => f(true));
      } else if (st.error) {
        SEP.waiters.splice(0).forEach((f) => f(false));
      }
    }
  }, 1000);
}
function sepModalPaint(m) {
  const st = SEP.st || {};
  const body = $("#sep-body", m);
  if (!body) return;
  if (st.running) body.innerHTML = `<p>${escapeHtml(tr(st.stage || ""))}</p><div class="pbar"><div style="width:${Math.round((st.progress || 0) * 100)}%"></div></div><p class="muted small">${Math.round((st.progress || 0) * 100)}% · ${tr("Розбір почнеться сам, щойно модуль буде готовий. Вікно можна закрити — встановлення триватиме у фоні.")}</p>`;
  else if (st.error) body.innerHTML = `<p class="warn">${tr("Не вдалося встановити")}: ${escapeHtml(st.error.split("\n").slice(-2).join(" ").slice(0, 300))}</p><p class="muted small">${tr("Перевірте інтернет і спробуйте ще раз.")}</p><div class="modal-actions"><button class="btn primary" id="sep-retry">${tr("Спробувати ще раз")}</button></div>`;
  const rt = $("#sep-retry", m);
  if (rt) rt.onclick = () => sepInstall(null);
}
async function sepEnsure() {
  const st = await sepStatus();
  if (!st || st.ready) return true;
  return new Promise((resolve) => {
    SEP.waiters.push(resolve);
    const m = careModalBox("sep-modal", "Модуль розбору пісні", `<p>${tr("Щоб розділити готову пісню на вокал, барабани, бас та інші доріжки, потрібен модуль розділення. Він встановлюється один раз.")}</p>
      <div id="sep-body"><p class="muted small">${tr("Розмір")}: ${st.gpu ? tr("близько 2,5 ГБ з прискоренням відеокартою NVIDIA або 250 МБ без нього") : tr("близько 250 МБ")}.</p>
      ${st.gpu ? `<label class="chk"><input type="checkbox" id="sep-gpu2" checked> ${tr("Використовувати відеокарту NVIDIA (у 5–10 разів швидше)")}</label>` : ""}
      <div class="modal-actions"><button class="btn ghost" data-k="x">${tr("Скасувати")}</button><button class="btn primary" id="sep-go2">${tr("Встановити й розібрати")}</button></div></div>`);
    const go = $("#sep-go2", m);
    if (st.running) sepModalPaint(m);
    if (go) go.onclick = () => { sepInstall($("#sep-gpu2", m) ? $("#sep-gpu2", m).checked : null); sepModalPaint(m); };
    const x = $("[data-k=x]", m);
    if (x) x.addEventListener("click", () => { const i = SEP.waiters.indexOf(resolve); if (i >= 0) SEP.waiters.splice(i, 1); resolve(false); });
    if (st.running) sepWatch();
  });
}
(function sepHooks() {
  const guard = (btn, needs, run) => {
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      if (btn.dataset.sepOk === "1") { delete btn.dataset.sepOk; return; }
      if (!needs()) return;
      const st = SEP.st || await sepStatus();
      if (!st || st.ready) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (await sepEnsure()) { btn.dataset.sepOk = "1"; run(); }
    }, true);
  };
  guard($("#go-btn"), () => S.mode === "mix" && S.files.length === 1, () => $("#go-btn").click());
  guard($("#path-go"), () => S.mode === "mix" && !/[\\/]$/.test($("#path-input").value.trim()), () => $("#path-go").click());
  sepStatus().then((st) => { sepBanner(); if (st && st.running) sepWatch(); });
})();
