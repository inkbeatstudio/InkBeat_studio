"use strict";
const LOUD_TARGETS = [
  ["spotify", "Spotify", -14, -1], ["youtube", "YouTube", -14, -1], ["apple", "Apple Music", -16, -1], ["tiktok", "TikTok / Instagram", -14, -1],
  ["soundcloud", "SoundCloud", -14, -1], ["deezer", "Deezer", -15, -1], ["club", "Клуб / діджей-сет", -8, -0.3], ["podcast", "Подкаст / голос", -16, -1.5],
];
function peakDb(buf) {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 2) { const v = Math.abs(d[i]); if (v > p) p = v; } }
  return 20 * Math.log10(p + 1e-9);
}
async function openLoudness() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const m = careModalBox("loud-modal", "Гучність для платформ", `<p class="muted">Стрімінги вирівнюють гучність: занадто гучний трек вони стишують (і він втрачає динаміку даремно), занадто тихий — звучить слабше за інші. Програма зведе весь мікс з ефектами Master і порівняє з вимогами платформ.</p>
    <div class="pbar"><div id="ld-bar" style="width:10%"></div></div><p class="muted small" id="ld-st">Зводжу мікс…</p><div id="ld-body"></div>`);
  try {
    const P = period(), L = arrEnd(), maxB = 75 / P, part = L > maxB;
    const a0 = part ? Math.max(0, L / 2 - maxB / 2) : 0;
    const buf = await renderMixQuick(S.mix.master.fx || [], a0, part ? a0 + maxB : null);
    $("#ld-bar", m).style.width = "100%";
    const lu = lufsOf(buf), pk = peakDb(buf);
    $("#ld-st", m).innerHTML = `Ваш мікс: <b>${lu.toFixed(1)} LUFS</b>, пік <b>${pk.toFixed(1)} дБ</b>${part ? " (оцінка за 75 секунд із середини пісні)" : ""}.`;
    $("#ld-body", m).innerHTML = `<table class="tm-table"><thead><tr><th>Платформа</th><th>Ціль</th><th>Що станеться</th><th></th></tr></thead><tbody>${LOUD_TARGETS.map(([k, n, t, c]) => {
      const d = t - lu, over = pk > c;
      const what = Math.abs(d) < 1 ? `<span class="ok">ідеально</span>` : d < 0 ? `стишить на ${(-d).toFixed(1)} дБ` : `тихіше за інших на ${d.toFixed(1)} дБ`;
      return `<tr><td>${escapeHtml(n)}</td><td>${t} LUFS · пік ${c} дБ</td><td>${what}${over ? ` <span class="warn">· пік вище ${c} дБ</span>` : ""}</td><td><button class="btn ghost sm" data-fit="${k}" data-hint="Налаштувати лімітер на Master під цю ціль">Підігнати</button></td></tr>`;
    }).join("")}</tbody></table><p class="muted small">«Підігнати» ставить або налаштовує лімітер на Master: посилення = різниця гучності, стеля = вимога до піку. Потім перевірте ще раз — лімітер не завжди дає точну цифру з першого разу.</p>`;
    $$("[data-fit]", m).forEach((b) => b.onclick = () => {
      const [, n, t, c] = LOUD_TARGETS.find((x) => x[0] === b.dataset.fit);
      pushUndo("гучність для платформи");
      let lim = (S.mix.master.fx || []).find((f) => f.type === "limiter");
      if (!lim) { lim = Plugins.newFx("limiter"); S.mix.master.fx = S.mix.master.fx || []; S.mix.master.fx.push(lim); }
      const cur = lim.params.gain || 0;
      lim.params.gain = Math.max(-12, Math.min(18, +(cur + (t - lu)).toFixed(1)));
      lim.params.ceiling = c;
      lim.on = true;
      afterEdit(true);
      if (typeof rebuildStrips === "function") rebuildStrips();
      toast(`Лімітер на Master налаштовано під ${n}: посилення ${lim.params.gain} дБ, стеля ${c} дБ. Натисніть «Перевірити ще раз».`);
      openLoudness();
    });
  } catch (e) {
    $("#ld-st", m).textContent = "Не вдалося звести мікс: " + e.message;
  }
}
const COVER = { seed: 1, style: "neon", title: "", artist: "" };
const COVER_STYLES = {
  neon: ["Неон (трап, дрилл)", ["#0b0614", "#2a0b4a", "#ff2bd6", "#00e5ff", "#ffe600"]],
  sunset: ["Захід сонця (синтвейв)", ["#120424", "#ff2e63", "#ff9a3c", "#ffd56b", "#3d1a78"]],
  pastel: ["Пастель (поп, R&B)", ["#fbe4e4", "#c9e4f7", "#ffd6a5", "#cdb4db", "#bde0fe"]],
  lofi: ["Лоу-фай (тепло, зерно)", ["#2b2420", "#c08552", "#f3e9dc", "#8c5e58", "#5e3023"]],
  mono: ["Мінімалізм (чорно-біле)", ["#0d0d0d", "#f2f2f2", "#7a7a7a", "#1f1f1f", "#bdbdbd"]],
  forest: ["Ліс (фолк, ембієнт)", ["#0f2a1d", "#3a7d44", "#9dc183", "#e9f5db", "#c9a227"]],
  fire: ["Вогонь (рок, фонк)", ["#120000", "#7a0b0b", "#e63946", "#ff8c42", "#f1faee"]],
};
function coverDraw(cv, size) {
  const g = cv.getContext("2d"), W = size, rng = hmRng(COVER.seed), pal = COVER_STYLES[COVER.style][1];
  cv.width = W; cv.height = W;
  const pick = () => pal[1 + Math.floor(rng() * (pal.length - 1))];
  const gr = g.createLinearGradient(0, 0, W * rng(), W);
  gr.addColorStop(0, pal[0]); gr.addColorStop(1, rng() < 0.5 ? pal[1] : pal[0]);
  g.fillStyle = gr; g.fillRect(0, 0, W, W);
  const mode = Math.floor(rng() * 4);
  g.globalCompositeOperation = COVER.style === "pastel" ? "multiply" : "screen";
  if (mode === 0) for (let i = 0; i < 9; i++) { const r = W * (0.08 + rng() * 0.35), x = rng() * W, y = rng() * W, rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, pick()); rg.addColorStop(1, "transparent"); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  else if (mode === 1) { g.lineWidth = W * 0.004; for (let i = 0; i < 26; i++) { g.strokeStyle = pick(); g.globalAlpha = 0.25 + rng() * 0.6; g.beginPath(); const y0 = W * (0.15 + i * 0.028), a = W * (0.02 + rng() * 0.06), f = 2 + rng() * 5, ph = rng() * 6; for (let x = 0; x <= W; x += W / 120) g.lineTo(x, y0 + Math.sin(x / W * f * Math.PI + ph) * a); g.stroke(); } g.globalAlpha = 1; }
  else if (mode === 2) { const hz = W * 0.62; const sg = g.createLinearGradient(0, W * 0.15, 0, hz); sg.addColorStop(0, pal[3] || pick()); sg.addColorStop(1, pal[1]); g.fillStyle = sg; g.beginPath(); g.arc(W / 2, hz, W * 0.28, Math.PI, 0); g.fill(); g.strokeStyle = pal[2]; g.lineWidth = W * 0.003; for (let i = 0; i < 16; i++) { const y = hz + Math.pow(i / 16, 2) * (W - hz); g.globalAlpha = 0.7; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(W / 2 + i * W * 0.02, hz); g.lineTo(W / 2 + i * W * 0.15, W); g.stroke(); } g.globalAlpha = 1; }
  else { for (let i = 0; i < 40; i++) { g.fillStyle = pick(); g.globalAlpha = 0.15 + rng() * 0.5; const s = W * (0.03 + rng() * 0.18); g.save(); g.translate(rng() * W, rng() * W); g.rotate(rng() * Math.PI); g.fillRect(-s / 2, -s / 2, s, s * (0.2 + rng())); g.restore(); } g.globalAlpha = 1; }
  g.globalCompositeOperation = "source-over";
  if (COVER.style === "lofi" || rng() < 0.4) { const id = g.getImageData(0, 0, W, W), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 28; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0); }
  const dark = ["neon", "sunset", "lofi", "mono", "forest", "fire"].includes(COVER.style);
  g.fillStyle = dark ? "#ffffff" : "#1b1b1b";
  g.textAlign = "center";
  g.shadowColor = dark ? "rgba(0,0,0,.6)" : "rgba(255,255,255,.5)"; g.shadowBlur = W * 0.02;
  const t = (COVER.title || "").toUpperCase();
  let fs = W * 0.11;
  g.font = `800 ${fs}px "Segoe UI", Arial, sans-serif`;
  while (g.measureText(t).width > W * 0.86 && fs > W * 0.04) { fs *= 0.92; g.font = `800 ${fs}px "Segoe UI", Arial, sans-serif`; }
  const ty = rng() < 0.5 ? W * 0.2 : W * 0.84;
  g.fillText(t, W / 2, ty);
  if (COVER.artist) { g.font = `500 ${W * 0.042}px "Segoe UI", Arial, sans-serif`; g.globalAlpha = 0.85; g.fillText(COVER.artist, W / 2, ty + (ty < W / 2 ? W * 0.07 : -fs * 1.05)); g.globalAlpha = 1; }
  g.shadowBlur = 0;
}
function openCover() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  COVER.title = COVER.title || S.B.project.title;
  COVER.artist = COVER.artist || (typeof VS !== "undefined" && VS.artist) || "";
  const m = careModalBox("cover-modal", "Обкладинка", `<div class="cov">
      <canvas id="cov-cv" data-hint="Попередній перегляд. Остаточна обкладинка — 3000×3000 пікселів, як вимагають стрімінги"></canvas>
      <div class="cov-ctl">
        <label>Назва <input id="cov-t" value="${escapeHtml(COVER.title)}"></label>
        <label>Виконавець <input id="cov-a" value="${escapeHtml(COVER.artist)}"></label>
        <label>Стиль <select id="cov-s">${Object.entries(COVER_STYLES).map(([k, v]) => `<option value="${k}" ${k === COVER.style ? "selected" : ""}>${escapeHtml(v[0])}</option>`).join("")}</select></label>
        <button class="btn ghost" id="cov-r" data-hint="Інша композиція з тими ж кольорами">🎲 Інший варіант</button>
        <p class="muted small">Обкладинка малюється з кольорів і форм — кожен варіант унікальний. Збережена обкладинка потрапляє в MP3 при експорті, у відеостудію та в альбом.</p>
        <button class="btn primary" id="cov-save">Зберегти в проєкт (3000×3000)</button>
      </div></div>`);
  m.querySelector(".modal-card").style.width = "min(860px,96vw)";
  const cv = $("#cov-cv", m), redraw = () => coverDraw(cv, 600);
  redraw();
  $("#cov-t", m).oninput = (e) => { COVER.title = e.target.value; redraw(); };
  $("#cov-a", m).oninput = (e) => { COVER.artist = e.target.value; redraw(); };
  $("#cov-s", m).onchange = (e) => { COVER.style = e.target.value; redraw(); };
  $("#cov-r", m).onclick = () => { COVER.seed = Math.floor(Math.random() * 1e6); redraw(); };
  $("#cov-save", m).onclick = async () => {
    const big = document.createElement("canvas");
    coverDraw(big, 3000);
    const blob = await new Promise((res) => big.toBlob(res, "image/jpeg", 0.92));
    const fd = new FormData();
    fd.append("file", blob, "cover.jpg");
    try {
      const r = await fetch(`/api/project/${S.pid}/cover`, { method: "POST", body: fd }), j = await r.json();
      if (!r.ok) throw new Error(j.error || "помилка");
      if (typeof vsLoadCover === "function") vsLoadCover();
      m.hidden = true;
      toast("Обкладинку збережено: вона буде в MP3, відео й альбомі.");
    } catch (e) { toast("Не вдалося зберегти: " + e.message, true); }
  };
}
function bestMoments(lenSec) {
  const P = period(), E = typeof secEnergy === "function" ? secEnergy() : [];
  const pri = { drop: 4, chorus: 3, hook: 3, prechorus: 1, build: 1, verse: 0.5 };
  const list = E.map((e) => ({ s: e.s, score: e.score + (pri[e.s.kind] || 0) })).sort((a, b) => b.score - a.score);
  const out = [];
  for (const x of list) {
    if (out.some((o) => Math.abs(o.a - x.s.start) < 4)) continue;
    const a = Math.max(0, x.s.start), b = Math.min(arrEnd(), a + lenSec / P);
    out.push({ a, b, name: x.s.name_ua });
    if (out.length >= 3) break;
  }
  if (!out.length) out.push({ a: 0, b: Math.min(arrEnd(), lenSec / P), name: "Початок" });
  return out;
}
function openAutoClip() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  const m = careModalBox("ac-modal", "Автокліп для соцмереж", `<p class="muted">Програма знаходить найсильніші моменти пісні (приспів, дроп) і готує вертикальне відео з потрібним фрагментом. Далі у відеостудії можна змінити стиль і натиснути «Записати».</p>
    <div class="arr-row"><label>Довжина <select id="ac-len"><option value="15">15 с</option><option value="30" selected>30 с</option><option value="60">60 с</option></select></label>
      <label>Формат <select id="ac-fmt">${Object.entries(VFMT).map(([k, v]) => `<option value="${k}">${escapeHtml(v.name)} (${v.tag})</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" id="ac-lyr" ${(S.mix.lyrics || "").trim() ? "checked" : ""}> текст пісні субтитрами</label></div>
    <div id="ac-list" class="genre-grid"></div>`);
  const fill = () => {
    const L = +$("#ac-len", m).value, P = period();
    $("#ac-list", m).innerHTML = bestMoments(L).map((x, i) => `<button class="hm-le" data-i="${i}" data-a="${x.a}" data-b="${x.b}"><b>${i === 0 ? "★ " : ""}${escapeHtml(x.name)}</b><span>${fmtTime(x.a * P - S.B.timing.pad)} – ${fmtTime(x.b * P - S.B.timing.pad)} · ▶ послухати / відкрити</span></button>`).join("");
    $$("[data-i]", m).forEach((b) => b.onclick = async () => {
      const a = +b.dataset.a, z = +b.dataset.b;
      try {
        const p = JSON.parse(localStorage.getItem("inkbeat.video." + S.pid) || "{}");
        p.r0 = a; p.r1 = z;
        localStorage.setItem("inkbeat.video." + S.pid, JSON.stringify(p));
        const g = JSON.parse(localStorage.getItem("inkbeat.video") || "{}");
        g.fmt = $("#ac-fmt", m).value; g.lyrics = $("#ac-lyr", m).checked; g.all = false;
        localStorage.setItem("inkbeat.video", JSON.stringify(g));
      } catch (e) {}
      m.hidden = true;
      await openVideoStudio();
      toast("Фрагмент вибрано. Перевірте вигляд і натисніть «Записати відео».");
    });
  };
  fill();
  $("#ac-len", m).onchange = fill;
}
const ALB = { pids: [], title: "Мій альбом", artist: "", year: String(new Date().getFullYear()), genre: "", target: -14, gap: 2 };
async function openAlbum() {
  const all = await api.get("/api/projects");
  const list = (all.projects || all).filter((p) => p.id);
  if (!ALB.pids.length && S.pid) ALB.pids = [S.pid];
  ALB.pids = ALB.pids.filter((id) => list.some((p) => p.id === id));
  const st = await api.post("/api/album/status", { pids: ALB.pids }).catch(() => []);
  const m = careModalBox("album-modal", "Альбом", `<p class="muted">Зберіть кілька пісень в альбом: порядок, паузи, однакова гучність і спільний лімітер, обкладинки й теги в MP3, повний файл альбому та CUE-розмітка. Для кожної пісні спершу зробіть «Експорт» з готовим міксом.</p>
    <div class="alb">
      <div><h5>Пісні альбому</h5><div class="alb-list">${ALB.pids.map((id, i) => { const p = list.find((x) => x.id === id), s = st.find((x) => x.pid === id); return `<div class="alb-row" data-i="${i}"><b>${i + 1}.</b><span>${escapeHtml(p ? p.title : id)}</span>${s && s.mix ? `<span class="ok small">мікс є</span>` : `<span class="warn small">немає міксу — зробіть експорт</span>`}<span class="spacer"></span><button data-up>▲</button><button data-dn>▼</button><button data-rm>✕</button></div>`; }).join("") || `<div class="dock-empty">Додайте пісні зі списку праворуч.</div>`}</div></div>
      <div><h5>Усі проєкти</h5><div class="alb-list">${list.filter((p) => !ALB.pids.includes(p.id)).map((p) => `<div class="alb-row"><span>${escapeHtml(p.title)}</span><span class="spacer"></span><button data-add="${escapeHtml(p.id)}">＋</button></div>`).join("")}</div></div>
    </div>
    <div class="mel-grid">
      <label>Назва альбому <input id="alb-t" value="${escapeHtml(ALB.title)}"></label><label>Виконавець <input id="alb-a" value="${escapeHtml(ALB.artist)}"></label><label>Рік <input id="alb-y" value="${escapeHtml(ALB.year)}"></label>
      <label>Жанр <input id="alb-g" value="${escapeHtml(ALB.genre)}"></label>
      <label data-hint="Однакова гучність усіх пісень. -14 LUFS — стандарт більшості стрімінгів">Гучність <select id="alb-l">${[[-16, "-16 LUFS (Apple, тихіше)"], [-14, "-14 LUFS (стрімінги)"], [-11, "-11 LUFS (гучно)"], [-9, "-9 LUFS (дуже гучно)"]].map(([v, l]) => `<option value="${v}" ${ALB.target === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label data-hint="Тиша між піснями в повному файлі альбому">Пауза між піснями, с <input type="number" id="alb-gap" min="0" max="10" step="0.5" value="${ALB.gap}"></label>
    </div>
    <div class="pbar"><div id="alb-bar" style="width:0%"></div></div><p class="muted small" id="alb-st"></p>
    <div class="modal-actions"><button class="btn ghost" data-k="x">Закрити</button><button class="btn primary" id="alb-go" ${ALB.pids.length ? "" : "disabled"}>Зібрати альбом</button></div>`);
  m.querySelector(".modal-card").style.width = "min(900px,96vw)";
  const keep = () => { ALB.title = $("#alb-t", m).value; ALB.artist = $("#alb-a", m).value; ALB.year = $("#alb-y", m).value; ALB.genre = $("#alb-g", m).value; ALB.target = +$("#alb-l", m).value; ALB.gap = +$("#alb-gap", m).value; };
  $$("[data-add]", m).forEach((b) => b.onclick = () => { keep(); ALB.pids.push(b.dataset.add); openAlbum(); });
  $$(".alb-row[data-i]", m).forEach((r) => {
    const i = +r.dataset.i;
    $("[data-up]", r).onclick = () => { keep(); if (i) { [ALB.pids[i - 1], ALB.pids[i]] = [ALB.pids[i], ALB.pids[i - 1]]; openAlbum(); } };
    $("[data-dn]", r).onclick = () => { keep(); if (i < ALB.pids.length - 1) { [ALB.pids[i + 1], ALB.pids[i]] = [ALB.pids[i], ALB.pids[i + 1]]; openAlbum(); } };
    $("[data-rm]", r).onclick = () => { keep(); ALB.pids.splice(i, 1); openAlbum(); };
  });
  $("#alb-go", m).onclick = async () => {
    keep();
    $("#alb-go", m).disabled = true;
    try {
      const r = await api.post("/api/album/build", { pids: ALB.pids, title: ALB.title, artist: ALB.artist, year: ALB.year, genre: ALB.genre, target: ALB.target, gap: ALB.gap, ceiling: -1 });
      let j;
      for (;;) { await new Promise((res) => setTimeout(res, 600)); j = await api.get(`/api/process/${r.job}`); $("#alb-bar", m).style.width = Math.round(j.progress * 100) + "%"; $("#alb-st", m).textContent = `Обробляю… ${Math.round(j.progress * 100)}%`; if (j.status !== "running") break; }
      if (j.status === "error") throw new Error(j.error);
      const res = j.result;
      $("#alb-st", m).innerHTML = `Готово: ${res.tracks.length} пісень${res.missing.length ? `, пропущено без міксу: ${escapeHtml(res.missing.join(", "))}` : ""}. ${res.tracks.map((t) => `${t.n}. ${escapeHtml(t.title)}: ${t.lufs_before} → ${t.lufs_after} LUFS`).join("; ")} <button class="btn ghost sm" id="alb-open">Відкрити папку</button>`;
      $("#alb-open", m).onclick = () => api.post("/api/album/open", { path: res.dir });
    } catch (e) { $("#alb-st", m).textContent = "Не вдалося: " + e.message; }
    $("#alb-go", m).disabled = false;
  };
}
(function releaseUI() {
  const file = MENUS["Файл"];
  if (file) MENUS["Файл"] = () => { const a = file(); const i = a.findIndex((x) => x && /Вийти/.test(x[0])); const add = [null, ["Альбом: кілька пісень разом…", openAlbum], ["Обкладинка…", needProject(openCover)], ["Автокліп для соцмереж…", needProject(openAutoClip)], ["Гучність для платформ…", needProject(openLoudness)]]; if (i > 0) a.splice(i, 0, ...add, null); else a.push(...add); return a; };
})();
