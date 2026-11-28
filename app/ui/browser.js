"use strict";
const GM_UA = ["Акустичний рояль", "Яскравий рояль", "Електророяль", "Хонкі-тонк", "Електропіаніно 1", "Електропіаніно 2", "Клавесин", "Клавінет", "Челеста", "Дзвіночки", "Музична скринька", "Вібрафон", "Маримба", "Ксилофон", "Трубчасті дзвони", "Цимбали",
  "Органний синт", "Перкусійний орган", "Рок-орган", "Церковний орган", "Язичковий орган", "Акордеон", "Губна гармоніка", "Бандонеон", "Гітара (нейлон)", "Гітара (сталь)", "Джаз-гітара", "Чиста електрогітара", "Приглушена гітара", "Овердрайв-гітара", "Дисторшн-гітара", "Гітарні флажолети",
  "Акустичний бас", "Бас пальцями", "Бас медіатором", "Безладовий бас", "Слеп-бас 1", "Слеп-бас 2", "Синт-бас 1", "Синт-бас 2", "Скрипка", "Альт", "Віолончель", "Контрабас", "Струнні тремоло", "Струнні піцикато", "Арфа", "Литаври",
  "Струнний ансамбль 1", "Струнний ансамбль 2", "Синт-струнні 1", "Синт-струнні 2", "Хор «а»", "Голос «у»", "Синт-хор", "Оркестровий удар", "Труба", "Тромбон", "Туба", "Труба з сурдиною", "Валторна", "Мідна секція", "Синт-мідь 1", "Синт-мідь 2",
  "Сопрано-сакс", "Альт-сакс", "Тенор-сакс", "Баритон-сакс", "Гобой", "Англійський ріжок", "Фагот", "Кларнет", "Флейта-пікколо", "Флейта", "Блок-флейта", "Пан-флейта", "Пляшка", "Сякухаті", "Свист", "Окарина",
  "Лід: квадрат", "Лід: пила", "Лід: каліопа", "Лід: чіф", "Лід: чаранг", "Лід: голос", "Лід: квінти", "Лід: бас + лід", "Пад: нью-ейдж", "Пад: теплий", "Пад: полісинт", "Пад: хор", "Пад: смичковий", "Пад: металевий", "Пад: німб", "Пад: свіп",
  "Ефект: дощ", "Ефект: саундтрек", "Ефект: кристал", "Ефект: атмосфера", "Ефект: яскравість", "Ефект: гобліни", "Ефект: відлуння", "Ефект: фантастика", "Ситар", "Банджо", "Сямісен", "Кото", "Калімба", "Волинка", "Фідл", "Шехнай",
  "Дзвоник", "Агого", "Стілдрам", "Вудблок", "Тайко", "Мелодичний том", "Синт-барабан", "Реверс тарілки", "Шум ладів", "Подих", "Прибій", "Пташка", "Телефон", "Гелікоптер", "Оплески", "Постріл"];
const SBR = { tab: "all", cat: "", q: "", items: [], packs: [], cache: new Map(), mode: "assign", tid: null, prev: null, job: null, busy: false };
const SB_TABS = [["all", "Усе"], ["fav", "★ Обране"], ["recent", "Нещодавні"], ["builtin", "Записані інструменти"], ["synth", "Синтезатори"], ["drums", "Ударні"], ["samples", "Семпли й лупи"], ["packs", "Мої пакети"], ["store", "Магазин пакетів"]];
const SBR_SYN = [["piano", "рояль", "піаніно", "фортепіано"], ["violin", "скрип"], ["viola", "альт"], ["cello", "віолонч"], ["bass", "бас"], ["guitar", "гітар"], ["strings", "струнн"], ["drum", "ударн", "барабан", "kit"], ["sax", "сакс"], ["brass", "мідн", "труба", "trumpet"], ["horn", "валторн"], ["flute", "флейт"], ["organ", "орган"], ["choir", "хор", "voice", "голос"], ["pad", "пад"], ["synth", "синт"], ["lead", "лід"], ["harp", "арф"], ["bell", "дзвін", "дзвон"], ["marimba", "марімб", "маримб"], ["orchestra", "оркестр"], ["pizz", "піцикато"], ["trombone", "тромбон"], ["tuba", "туба"], ["epiano", "електропіаніно", "rhodes"], ["808", "трап"]];
function sbxTerms(q) {
  const out = [q];
  for (const g of SBR_SYN) if (g.some((w) => q.includes(w) || w.includes(q) && q.length >= 3)) out.push(...g);
  return [...new Set(out)];
}
const sbxMB = (b) => b >= 1e9 ? (b / 1073741824).toFixed(1) + (LANG === "en" ? " GB" : " ГБ") : Math.max(1, Math.round(b / 1048576)) + (LANG === "en" ? " MB" : " МБ");
function sbxFavs() { return new Set(UIP.favSounds || []); }
async function sbxLoad(force) {
  if (!SBR.items.length || force) {
    const [b, p] = await Promise.all([api.get("/api/content/builtin").catch(() => ({ items: [] })), api.get("/api/content/packs").catch(() => ({ packs: [] }))]);
    SBR.packs = p.packs || [];
    const items = [];
    for (const x of b.items || []) {
      const ua = LANG !== "en" && !x.drums && !x.variation ? GM_UA[x.program] : "";
      items.push({ id: x.id, kind: "gs", index: x.index, name: x.name, sub: ua && ua.toLowerCase() !== x.name.toLowerCase() ? ua : "", kw: (window.GM_NAMES && !x.drums ? GM_NAMES[x.program] : "") + " " + x.tag, cat: x.category, tag: x.tag, drums: x.drums, group: x.drums ? "drums" : "builtin", variation: x.variation });
    }
    for (const [cat, list] of Object.entries(Plugins.SYNTH_PRESETS)) for (const name of Object.keys(list)) items.push({ id: "syn:" + name, kind: "synth", name, sub: "синтезатор InkBeat", cat: "Синтезатори: " + cat, tag: /бас/i.test(cat) ? "bass" : /пад/i.test(cat) ? "pad" : "synth", group: "synth" });
    for (const [k, n] of DRUM_KITS) if (k !== "song" || (S.B && S.B.tracks.some((t) => t.has_audio && t.is_drums))) items.push({ id: "kit:" + k, kind: "kit", key: k, name: n, sub: k === "song" ? "удари з цієї пісні" : "синтезований набір", cat: "Набори ударних", tag: "drums", drums: true, group: "drums" });
    for (const p of SBR.packs) for (const i of p.instruments) items.push({ id: `pack:${p.id}/${i.id}`, kind: "pack", pack: p.id, inst: i.id, name: i.name, sub: p.name, cat: p.category, tag: i.drums ? "drums" : p.tag, drums: i.drums, group: "packs", kw: p.tag + " " + p.id + " " + i.id, installed: i.installed, size: i.size, license: p.license, author: p.author });
    SBR.items = items;
  }
  return SBR.items;
}
function sbxFilter() {
  const favs = sbxFavs(), rec = UIP.recentSounds || [], q = SBR.q.trim().toLowerCase();
  let list = SBR.items;
  if (SBR.tab === "fav") list = list.filter((x) => favs.has(x.id));
  else if (SBR.tab === "recent") list = rec.map((id) => list.find((x) => x.id === id)).filter(Boolean);
  else if (SBR.tab === "builtin") list = list.filter((x) => x.group === "builtin");
  else if (SBR.tab === "synth") list = list.filter((x) => x.group === "synth");
  else if (SBR.tab === "drums") list = list.filter((x) => x.drums);
  else if (SBR.tab === "packs") list = list.filter((x) => x.kind === "pack");
  if (q) {
    const terms = sbxTerms(q);
    list = list.filter((x) => { const hay = (x.name + " " + (x.sub || "") + " " + x.cat + " " + tr(x.cat) + " " + tr(x.sub || "") + " " + (x.kw || "")).toLowerCase(); return terms.some((w) => hay.includes(w)); });
  }
  return list;
}
function sbxCats(list) {
  const m = new Map();
  for (const x of list) m.set(x.cat, (m.get(x.cat) || 0) + 1);
  return [...m.entries()];
}
async function sbxBuffers(inst) {
  const A = ensureCtx();
  const files = [...new Set((inst.zones || []).map((z) => z.file))].filter((f) => !A.ibuf.has("multi:" + f));
  let k = 0;
  await Promise.all(files.map(async (f) => {
    try { A.ibuf.set("multi:" + f, await fetchBuffer(A.ctx, `/api/project/${S.pid}/sample?f=${encodeURIComponent(f)}`)); } catch (e) { console.warn(e); }
    k++;
  }));
}
async function sbxInst(item) {
  if (item.kind === "synth") return { type: "synth", preset: item.name, params: Plugins.presetByName(item.name) };
  if (item.kind === "kit") return { type: "drums", kit: item.key, pads: {} };
  let r = SBR.cache.get(item.id);
  if (!r) {
    if (item.kind === "gs") r = await api.post(`/api/project/${S.pid}/content/builtin`, { index: item.index });
    else {
      if (!item.installed) throw new Error(tr("Спершу встановіть цей інструмент у «Магазині пакетів»."));
      r = await api.get(`/api/content/pack/${item.pack}/${item.inst}`);
    }
    if (r.error) throw new Error(r.error);
    SBR.cache.set(item.id, r);
  }
  const inst = { type: "multi", name: item.sub && item.kind === "pack" ? `${item.sub} — ${item.name}` : item.name, zones: r.zones, drums: !!r.drums, src: r.src, params: { gain: 1, attack: 1, release: 1, vel: 0.7, tune: 0 } };
  await sbxBuffers(inst);
  return inst;
}
function sbxStopPreview() {
  if (SBR.prev) { try { SBR.prev.gain.setTargetAtTime(0, SBR.prev.context.currentTime, 0.03); const g = SBR.prev; setTimeout(() => g.disconnect(), 300); } catch (e) {} SBR.prev = null; }
}
async function sbxPreview(item, btn) {
  sbxStopPreview();
  if (btn) btn.classList.add("busy");
  try {
    const inst = await sbxInst(item);
    const A = ensureCtx();
    await A.ctx.resume();
    const g = A.ctx.createGain();
    g.gain.value = 0.85;
    g.connect(A.out);
    SBR.prev = g;
    const t0 = A.ctx.currentTime + 0.06, b = 60 / 104;
    if (item.drums) {
      const pat = [[0, 36], [0, 42], [0.5, 42], [1, 38], [1, 42], [1.5, 42], [1.75, 36], [2, 36], [2, 42], [2.5, 42], [3, 38], [3, 46], [3.5, 42], [4, 49], [4, 36]];
      for (const [at, p] of pat) DSP.playNote(A.ctx, g, inst, p, p === 42 ? 0.55 : 0.85, t0 + at * b, 0.2, A.ibuf);
    } else {
      const base = item.tag === "bass" ? 36 : item.tag === "pad" || /пад|pad/i.test(item.cat) ? 55 : 60;
      const seq = [0, 4, 7, 12, 7, 4];
      seq.forEach((iv, i) => DSP.playNote(A.ctx, g, inst, base + iv, 0.8, t0 + i * b * 0.5, b * 0.45, A.ibuf));
      for (const iv of item.tag === "bass" ? [0] : [0, 4, 7, 12]) DSP.playNote(A.ctx, g, inst, base + iv, 0.75, t0 + 3.2 * b, b * 2.6, A.ibuf);
    }
  } catch (e) {
    toast(e.message, true);
  }
  if (btn) btn.classList.remove("busy");
}
function sbxRecent(id) {
  UIP.recentSounds = [id].concat((UIP.recentSounds || []).filter((x) => x !== id)).slice(0, 30);
  saveUI();
}
async function sbxAssign(item, tid, rename) {
  const t = findT(tid);
  if (!t) return toast("Спершу виберіть доріжку.", true);
  const inst = await sbxInst(item);
  pushUndo("інструмент з браузера звуків");
  const m = mt(tid);
  m.inst = JSON.parse(JSON.stringify(inst));
  if (t.has_audio && modeOf(t) === "audio") m.mode = "midi";
  const g = (S.mix.gens || []).find((x) => x.id === tid);
  if (g && g.user) {
    g.is_drums = !!item.drums;
    if (rename) g.name = item.name;
  }
  sbxRecent(item.id);
  _tracksKey = "";
  afterEdit(true);
  await loadInstrumentBuffers();
  if (typeof renderDock === "function") renderDock();
  toast(`«${item.name}» → ${t.name}`);
}
async function sbxNewTrack(item) {
  const kind = item.drums ? "drums" : item.tag === "bass" ? "bass" : item.tag === "pad" || item.tag === "strings" ? "pad" : item.tag === "synth" ? "lead" : "keys";
  addMidiTrack(kind);
  await sbxAssign(item, S.sel, true);
}
function sbxRow(x, favs) {
  const dis = x.kind === "pack" && !x.installed;
  const act = SBR.mode === "new" ? `<button class="btn primary sm" data-new data-hint="Створити нову MIDI-доріжку з цим звуком">＋ Доріжка</button>` : `<button class="btn ghost sm sb2-use" data-use data-hint="Поставити цей звук на вибрану доріжку">На доріжку</button><button class="btn ghost sm" data-new data-hint="Створити нову MIDI-доріжку з цим звуком">＋</button>`;
  return `<div class="sb2-row${dis ? " dis" : ""}" data-id="${escapeHtml(x.id)}" draggable="${dis ? "false" : "true"}" data-hint="${escapeHtml(tr("Перетягніть на доріжку, щоб поставити цей звук, або на порожнє місце під доріжками — для нової доріжки"))}">
    <button class="sb2-fav${favs.has(x.id) ? " on" : ""}" data-fav data-hint="Додати в обране або прибрати з нього">★</button>
    <button class="sb2-play" data-play data-hint="Послухати">${dis ? "⤓" : "▶"}</button>
    <div class="sb2-name"><b>${escapeHtml(x.name)}</b><span class="muted small">${escapeHtml(x.sub || "")}${x.kind === "pack" ? ` · ${escapeHtml(x.license)}` : ""}${dis ? ` · ${tr("не встановлено")}, ${sbxMB(x.size)}` : ""}</span></div>
    <span class="sb2-tag">${escapeHtml(x.cat)}</span>
    ${dis ? `<button class="btn ghost sm" data-inst data-hint="Завантажити цей інструмент з інтернету (одноразово)">Встановити</button>` : act}
  </div>`;
}
function sbxRender() {
  const m = document.getElementById("sb2-modal");
  if (!m || m.hidden) return;
  const body = $("#sb2-body", m);
  $$("[data-tab]", m).forEach((b) => b.classList.toggle("active", b.dataset.tab === SBR.tab));
  const help = $(".sb2-help", m);
  if (help) help.textContent = SBR.tab === "samples" ? tr("▶ — послухати як є, ▶♪ — у темпі й тональності проєкту. «＋ Доріжка» вставляє звук з позиції курсору (лупи підганяються під проєкт), «Семплер» — інструмент з цього звуку, «На пад» — на пад вибраної доріжки ударних. Подвійний клік — вставити.") : tr("▶ — послухати, ★ — в обране. «На доріжку» ставить звук на вибрану доріжку, «＋» створює нову MIDI-доріжку з цим звуком. Записані інструменти вбудовані в програму й працюють без інтернету; більші пакети справжніх інструментів — у «Магазині пакетів».");
  if (SBR.tab === "store") return sbxStore(body);
  if (SBR.tab === "samples") return smpRender(body);
  const list = sbxFilter(), cats = sbxCats(list), favs = sbxFavs();
  const shown = SBR.cat ? list.filter((x) => x.cat === SBR.cat) : list;
  body.innerHTML = `<div class="sb2-main"><div class="sb2-cats"><button data-cat="" class="${SBR.cat ? "" : "active"}">${tr("Усі категорії")} <span>${list.length}</span></button>${cats.map(([c, n]) => `<button data-cat="${escapeHtml(c)}" class="${SBR.cat === c ? "active" : ""}">${escapeHtml(c)} <span>${n}</span></button>`).join("")}</div>
    <div class="sb2-list">${shown.slice(0, 400).map((x) => sbxRow(x, favs)).join("") || `<div class="dock-empty">${SBR.tab === "fav" ? tr("Тут будуть звуки, позначені зірочкою ★.") : SBR.tab === "recent" ? tr("Тут з'являться звуки, які ви ставили на доріжки.") : tr("Нічого не знайдено. Спробуйте інше слово.")}</div>`}</div></div>`;
  $$("[data-cat]", body).forEach((b) => b.onclick = () => { SBR.cat = b.dataset.cat; sbxRender(); });
  $$(".sb2-row", body).forEach((r) => {
    const x = SBR.items.find((i) => i.id === r.dataset.id);
    if (!x) return;
    const fav = $("[data-fav]", r);
    fav.onclick = () => { const f = sbxFavs(); f.has(x.id) ? f.delete(x.id) : f.add(x.id); UIP.favSounds = [...f]; saveUI(); fav.classList.toggle("on", f.has(x.id)); };
    const play = $("[data-play]", r);
    play.onclick = () => (x.kind === "pack" && !x.installed ? sbxInstall(x.pack, [x.inst]) : sbxPreview(x, play));
    const use = $("[data-use]", r), nw = $("[data-new]", r), ins = $("[data-inst]", r);
    if (use) use.onclick = () => sbxAssign(x, SBR.tid || S.sel).catch((e) => toast(e.message, true));
    if (nw) nw.onclick = () => sbxNewTrack(x).catch((e) => toast(e.message, true));
    if (ins) ins.onclick = () => sbxInstall(x.pack, [x.inst]);
    r.ondblclick = () => { if (x.kind === "pack" && !x.installed) return; (SBR.mode === "new" ? sbxNewTrack(x) : sbxAssign(x, SBR.tid || S.sel)).catch((e) => toast(e.message, true)); };
  });
}
function sbxStore(body) {
  const tot = SBR.packs.reduce((a, p) => a + p.size, 0);
  body.innerHTML = `<div class="sb2-store"><p class="muted">${tr("Пакети справжніх записаних інструментів від музикантів і студій. Усі безкоштовні, з ліцензіями, що дозволяють використовувати їх у вашій музиці, зокрема комерційно. Завантажуються один раз із GitHub і доступні в усіх проєктах. Розмір — обсяг завантаження; на диску після підготовки займає приблизно стільки ж або трохи більше.")}</p>
    <div class="sb2-pack"><div class="sb2-ph"><div><b>${tr("Семпли Sonic Pi")}</b> <span class="muted small">${tr("Семпли й лупи")} · freesound.org, Arovane · CC0 · <a href="https://github.com/sonic-pi-net/sonic-pi/tree/main/etc/samples" target="_blank" rel="noopener">${tr("джерело")}</a></span><p class="small">${tr("Понад 200 справжніх записаних звуків: бочки, малі, хети, тарілки, томи, табла, брейки й ритм-лупи (зокрема Amen), басові звуки, гітарні фрази, атмосфери, вініл і гліч.")}</p></div>
      <div class="sb2-pa">${SMP.sonicpi ? `<span class="ok small">${tr("встановлено")}</span><button class="btn ghost sm" id="sp-rm">${tr("Видалити")}</button>` : `<button class="btn primary sm" id="sp-get">${tr("Встановити все")} · ${sbxMB(33300000)}</button>`}</div></div></div>
    <div id="sb2-job" class="sb2-job" hidden><div class="pbar"><div id="sb2-bar" style="width:0%"></div></div><span class="muted small" id="sb2-jst"></span><button class="btn ghost sm" id="sb2-cancel">Скасувати</button></div>
    ${SBR.packs.map((p) => `<div class="sb2-pack" data-p="${escapeHtml(p.id)}"><div class="sb2-ph"><div><b>${escapeHtml(p.name)}</b> <span class="muted small">${escapeHtml(p.category)} · ${escapeHtml(p.author)} · ${escapeHtml(p.license)} · <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${tr("джерело")}</a></span><p class="small">${escapeHtml(p.desc)}</p></div>
      <div class="sb2-pa">${p.installed ? `<span class="ok small">${tr("встановлено")}</span><button class="btn ghost sm" data-rm-all>${tr("Видалити")}</button>` : `<button class="btn primary sm" data-all>${tr("Встановити все")} · ${sbxMB(p.instruments.filter((i) => !i.installed).reduce((a, i) => a + i.size, 0))}</button>`}</div></div>
      <div class="sb2-insts">${p.instruments.map((i) => `<span class="sb2-i${i.installed ? " on" : ""}" data-i="${escapeHtml(i.id)}">${escapeHtml(i.name)} <em>${sbxMB(i.size)}</em>${i.installed ? `<button data-rm data-hint="Видалити з диска">✕</button>` : `<button data-get data-hint="Встановити лише цей інструмент">⤓</button>`}</span>`).join("")}</div></div>`).join("")}
    <p class="muted small">${tr("Усього в магазині")}: ${SBR.packs.reduce((a, p) => a + p.instruments.length, 0)} ${tr("інструментів")}, ${sbxMB(tot)}.</p></div>`;
  const spg = $("#sp-get", body), spr = $("#sp-rm", body);
  if (spg) spg.onclick = () => smpInstallSP();
  if (spr) spr.onclick = async () => { await api.post("/api/soundbank/sonicpi/remove", {}); await smpLoad(true); sbxRender(); };
  $$(".sb2-pack[data-p]", body).forEach((el) => {
    const pid = el.dataset.p, p = SBR.packs.find((x) => x.id === pid);
    const all = $("[data-all]", el), rmAll = $("[data-rm-all]", el);
    if (all) all.onclick = () => sbxInstall(pid, p.instruments.filter((i) => !i.installed).map((i) => i.id));
    if (rmAll) rmAll.onclick = async () => { if (!await inkConfirm("Видалити пакет", `<p>${escapeHtml(tr("Видалити з диска пакет") + " «" + p.name + "»?")}</p><p class="muted small">${tr("Доріжки, які вже грають цими звуками, замовкнуть, доки пакет не встановите знову.")}</p>`, "Видалити", true)) return; await api.post("/api/content/uninstall", { pack: pid }); await sbxRefresh(); };
    $$(".sb2-i", el).forEach((s) => {
      const iid = s.dataset.i, get = $("[data-get]", s), rm = $("[data-rm]", s);
      if (get) get.onclick = () => sbxInstall(pid, [iid]);
      if (rm) rm.onclick = async () => { await api.post("/api/content/uninstall", { pack: pid, inst: iid }); await sbxRefresh(); };
    });
  });
  if (SBR.job) sbxJobUI();
}
async function sbxRefresh() {
  SBR.cache.clear();
  await sbxLoad(true);
  sbxRender();
}
function sbxJobUI() {
  const box = document.getElementById("sb2-job");
  if (!box) return;
  box.hidden = !SBR.job;
  if (!SBR.job) return;
  $("#sb2-bar").style.width = Math.round(SBR.job.p * 100) + "%";
  $("#sb2-jst").textContent = `${tr("Встановлюю")} «${SBR.job.name}»… ${Math.round(SBR.job.p * 100)}%`;
  $("#sb2-cancel").onclick = () => api.post(`/api/content/cancel/${SBR.job.id}`, {});
}
async function sbxInstall(pid, only) {
  if (SBR.job) return toast("Зачекайте, поки завершиться поточне встановлення.", true);
  const p = SBR.packs.find((x) => x.id === pid);
  if (!p) return;
  const names = p.instruments.filter((i) => only.includes(i.id)).map((i) => i.name);
  try {
    const r = await api.post("/api/content/install", { pack: pid, only });
    SBR.job = { id: r.job, p: 0, name: names.length === 1 ? names[0] : p.name };
    if (SBR.tab !== "store") { SBR.tab = "store"; sbxRender(); }
    sbxJobUI();
    let j;
    for (;;) {
      await new Promise((res) => setTimeout(res, 700));
      j = await api.get(`/api/process/${r.job}`);
      SBR.job.p = j.progress || 0;
      sbxJobUI();
      if (j.status !== "running") break;
    }
    SBR.job = null;
    if (j.status === "error") throw new Error(j.error);
    toast(`${tr("Встановлено")}: ${names.join(", ")}. ${tr("Тепер ці звуки є в розділі «Мої пакети».")}`);
  } catch (e) {
    SBR.job = null;
    toast(tr("Не вдалося встановити") + ": " + e.message, true);
  }
  await sbxRefresh();
}
async function openSoundBrowser(opts) {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  opts = opts || {};
  SBR.mode = opts.mode || "assign";
  SBR.tid = opts.tid || S.sel || null;
  if (SBR.mode === "assign" && !findT(SBR.tid)) SBR.mode = "new";
  if (opts.tab) SBR.tab = opts.tab;
  let m = document.getElementById("sb2-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "sb2-modal";
    document.body.appendChild(m);
  }
  const t = findT(SBR.tid);
  m.innerHTML = `<div class="modal-card sb2-card"><div class="modal-head"><h3>Браузер звуків</h3><span class="muted small sb2-target">${SBR.mode === "new" ? tr("Подвійний клік — нова доріжка з цим звуком") : `${tr("Доріжка")}: <b>${escapeHtml(t ? t.name : "")}</b> · ${tr("подвійний клік — поставити звук")}`}</span><button class="x" data-close>&times;</button></div>
    <div class="modal-body sb2">
      <div class="sb2-top"><input id="sb2-q" placeholder="Пошук: рояль, бас, струнні, 808, сакс…" value="${escapeHtml(SBR.q)}" data-hint="Пошук за назвою, категорією чи описом"><div class="sb2-tabs">${SB_TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("")}</div></div>
      <div id="sb2-body"><p class="muted">Завантаження…</p></div>
      <p class="muted small sb2-help">▶ — послухати, ★ — в обране. «На доріжку» ставить звук на вибрану доріжку, «＋» створює нову MIDI-доріжку з цим звуком. Записані інструменти вбудовані в програму й працюють без інтернету; більші пакети справжніх інструментів — у «Магазині пакетів».</p>
    </div></div>`;
  m.hidden = false;
  if (typeof mfDecorate === "function") mfDecorate(m, true);
  $("[data-close]", m).onclick = () => { sbxStopPreview(); m.hidden = true; };
  $$("[data-tab]", m).forEach((b) => b.onclick = () => { SBR.tab = b.dataset.tab; SBR.cat = ""; sbxRender(); });
  let qt = 0;
  $("#sb2-q", m).oninput = (e) => { SBR.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => { if (SBR.tab === "store") SBR.tab = "all"; SBR.cat = ""; sbxRender(); }, 150); };
  await sbxLoad(true);
  await smpLoad(true);
  sbxRender();
  setTimeout(() => $("#sb2-q", m) && $("#sb2-q", m).focus(), 50);
}
(function soundBrowserUI() {
  const atm = addTrackMenu;
  addTrackMenu = function(e) {
    if (!S.B) return atm(e);
    menu(e, [
      ["Інструмент з браузера звуків…", () => openSoundBrowser({ mode: "new" })],
      null,
      ["MIDI: клавішні / піаніно", () => addMidiTrack("keys")],
      ["MIDI: бас", () => addMidiTrack("bass")],
      ["MIDI: мелодія (лід)", () => addMidiTrack("lead")],
      ["MIDI: пад / акорди", () => addMidiTrack("pad")],
      ["MIDI: барабани", () => addMidiTrack("drums")],
      null,
      ["Аудіо з файлу (вокал, інструмент)…", () => importAudioTrack("other")],
      ["Аудіо з файлу: барабанний луп…", () => importAudioTrack("drums")],
      ["Записати з мікрофона…", () => openRecorder()],
      null,
      ["Згенерувати партію за акордами…", () => openGenerator()]
    ]);
  };
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => { const a = tools(); a.splice(1, 0, ["Браузер звуків…", needProject(() => openSoundBrowser({}))], ["Магазин пакетів звуків…", needProject(() => openSoundBrowser({ tab: "store" }))]); return a; };
  const rit = renderInstTab;
  renderInstTab = function(...args) {
    const r = rit.apply(this, args);
    const el = args[0], T = args[1];
    const row = el && el.querySelector ? el.querySelector(".inst-type") : null;
    if (row && !row.querySelector(".sb2-open")) {
      const b = document.createElement("button");
      b.className = "sb2-open";
      b.textContent = tr("🎹 Браузер звуків…");
      b.dataset.hint = tr("Сотні записаних інструментів, синтезаторів і наборів ударних: послухати й поставити на цю доріжку одним кліком");
      b.onclick = () => openSoundBrowser({ mode: "assign", tid: T && T.t ? T.t.id : S.sel });
      row.appendChild(b);
    }
    return r;
  };
})();

const SMP = { items: [], loaded: false, building: false, sonicpi: false, cat: "", audio: null };
const SMP_PAD = { "Бочки": "kick", "Малі барабани": "snare", "Клепи": "snare", "Хети": "hat", "Тарілки": "crash", "Томи": "tom", "Перкусія": "perc", "Табла": "perc", "Електронні звуки": "perc", "Гліч": "perc" };
async function smpLoad(force) {
  if (SMP.loaded && !force) return;
  const r = await api.get("/api/soundbank").catch(() => ({ items: [] }));
  SMP.items = r.items || [];
  SMP.sonicpi = !!r.sonicpi;
  SMP.loaded = true;
  SMP.ready = !!r.essentials;
}
async function smpBuild(body) {
  if (SMP.building) return;
  SMP.building = true;
  try {
    const r = await api.post("/api/soundbank/build", {});
    for (;;) {
      await new Promise((res) => setTimeout(res, 500));
      const j = await api.get(`/api/process/${r.job}`);
      const bar = document.getElementById("smp-bar");
      if (bar) bar.style.width = Math.round((j.progress || 0) * 100) + "%";
      if (j.status !== "running") { if (j.status === "error") throw new Error(j.error); break; }
    }
    await smpLoad(true);
  } catch (e) {
    toast(e.message, true);
  }
  SMP.building = false;
  sbxRender();
}
async function smpInstallSP() {
  if (SBR.job) return toast("Зачекайте, поки завершиться поточне встановлення.", true);
  try {
    const r = await api.post("/api/soundbank/sonicpi/install", {});
    SBR.job = { id: r.job, p: 0, name: tr("Семпли Sonic Pi") };
    sbxJobUI();
    let j;
    for (;;) {
      await new Promise((res) => setTimeout(res, 700));
      j = await api.get(`/api/process/${r.job}`);
      SBR.job.p = j.progress || 0;
      sbxJobUI();
      if (j.status !== "running") break;
    }
    SBR.job = null;
    if (j.status === "error") throw new Error(j.error);
    toast(tr("Семпли Sonic Pi встановлено. Вони у вкладці «Семпли й лупи»."));
  } catch (e) {
    SBR.job = null;
    toast(tr("Не вдалося встановити") + ": " + e.message, true);
  }
  await smpLoad(true);
  sbxRender();
}
function smpInfo(s) {
  const f = sbFit(s);
  const parts = [s.dur ? s.dur.toFixed(1) + (LANG === "en" ? " s" : " с") : ""];
  if (s.bpm && s.kind === "loop") parts.push(Math.round(s.bpm) + " BPM");
  if (s.key) parts.push(`${NOTE_NAMES[s.key.tonic]} ${s.key.mode === "minor" ? tr("мінор") : tr("мажор")}`);
  else if (s.root_name) parts.push(s.root_name);
  if ((s.kind === "loop" || s.kind === "note") && (f.factor !== 1 || f.semis)) parts.push(`${tr("у проєкті")}: ${f.factor !== 1 ? "×" + (1 / f.factor).toFixed(2) : ""}${f.semis ? " " + (f.semis > 0 ? "+" : "") + f.semis + (LANG === "en" ? " st" : " пт") : ""}`);
  return parts.filter(Boolean).join(" · ");
}
function smpUrl(s, fitted) {
  if (!fitted) return `/api/soundbank/file?f=${encodeURIComponent(s.id)}`;
  const f = sbFit(s);
  return `/api/soundbank/fit?f=${encodeURIComponent(s.id)}&factor=${f.factor}&semis=${f.semis}`;
}
function smpPlay(url) {
  if (SMP.audio) { SMP.audio.pause(); SMP.audio = null; }
  SMP.audio = new Audio(url);
  SMP.audio.play().catch(() => {});
}
async function smpAddTrack(s, btn, atBeat) {
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    const fitted = s.kind === "loop" || s.kind === "note";
    const blob = await (await fetch(smpUrl(s, fitted))).blob();
    const fd = new FormData();
    fd.append("file", blob, s.name + ".wav");
    const at = atBeat != null ? atBeat : S.playBeat;
    fd.append("start", String(Math.max(0, at * period() - S.B.timing.pad)));
    fd.append("name", s.name);
    fd.append("kind", /ударн|бочк|мал|хет|перкус|брейк|ритм/i.test(s.cat) ? "drums" : "other");
    fd.append("transcribe", "0");
    stopPlay();
    await flushMix();
    const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd }), j = await r.json();
    if (!r.ok) throw new Error(j.error || "помилка");
    await careWait(j.job, () => {});
    await reloadProject();
    sbxRecent("smp:" + s.id);
    toast(`«${s.name}» ${tr("додано з такту")} ${hmBarAt(at)}.`);
  } catch (e) {
    toast(tr("Не вдалося") + ": " + e.message, true);
  }
  if (btn) { btn.disabled = false; btn.textContent = tr("＋ Доріжка"); }
}
async function smpToSampler(s) {
  addMidiTrack(s.kind === "note" && s.root && s.root < 48 ? "bass" : "keys");
  const g = (S.mix.gens || []).find((x) => x.id === S.sel);
  if (g) g.name = s.name;
  mt(S.sel).inst = { type: "sampler", sample: s.id, params: { root: s.root || 60, tune: 0, gain: 0.8, amp: { a: 2e-3, d: 0.2, s: 1, r: 0.3 }, oneshot: s.kind !== "note" } };
  _tracksKey = "";
  afterEdit(true);
  await loadInstrumentBuffers();
  sbxRecent("smp:" + s.id);
  toast(`${tr("Семплер з")} «${s.name}» ${tr("готовий: грайте нотами на доріжці.")}`);
}
async function smpToPad(s, grp) {
  const tid = SBR.tid || S.sel, t = findT(tid);
  if (!t) return;
  const m = mt(tid);
  pushUndo("семпл на пад");
  if (!m.inst || m.inst.type !== "drums") m.inst = { type: "drums", kit: "acoustic", pads: {} };
  m.inst.pads = m.inst.pads || {};
  m.inst.pads[grp] = Object.assign({ vol: 1, tune: 0, decay: 1, pan: 0, mute: false }, m.inst.pads[grp] || {}, { sample: s.id });
  afterEdit(true);
  await loadInstrumentBuffers();
  if (typeof renderDock === "function") renderDock();
  sbxRecent("smp:" + s.id);
  toast(`«${s.name}» → ${t.name}: ${tr("пад")} ${grp}`);
}
function smpRender(body) {
  if (!SMP.loaded) { body.innerHTML = `<p class="muted">${tr("Завантаження…")}</p>`; smpLoad().then(sbxRender); return; }
  if (!SMP.ready) {
    body.innerHTML = `<div class="sb2-store"><p>${tr("Готую стартову бібліотеку InkBeat: ударні, 808, ефекти, а також лупи ударних, акордів, арпеджіо й басу з відомим темпом і тональністю. Це робиться один раз і займає кілька секунд.")}</p><div class="pbar"><div id="smp-bar" style="width:3%"></div></div></div>`;
    smpBuild(body);
    return;
  }
  const q = SBR.q.trim().toLowerCase(), favs = sbxFavs();
  let list = SMP.items;
  if (q) { const terms = sbxTerms(q); list = list.filter((s) => terms.some((w) => (s.name + " " + s.cat + " " + tr(s.cat) + " " + (s.tags || "")).toLowerCase().includes(w))); }
  const favList = list.filter((s) => favs.has("smp:" + s.id));
  const mine = list.filter((s) => s.pack === "user");
  const MINE = "📁 " + tr("Мої семпли");
  const cats = (favList.length ? [["★", favList.length]] : []).concat(mine.length ? [[MINE, mine.length]] : [], sbxCats(list));
  const shown = SMP.cat === "★" ? favList : SMP.cat === MINE ? mine : SMP.cat ? list.filter((s) => s.cat === SMP.cat) : list;
  const t = findT(SBR.tid || S.sel), drumsSel = t && mt(t.id).inst && (mt(t.id).inst.type === "drums" || t.is_drums);
  body.innerHTML = `<div class="sb2-main"><div class="sb2-cats"><button class="btn ghost sm smp-imp" id="smp-imp" data-hint="Додати свої семпли: виберіть папку — програма сама розкладе звуки за категоріями, знайде темп і тональність лупів">＋ ${tr("Імпорт папки…")}</button><div class="muted small" id="smp-imp-st"></div><button data-cat="" class="${SMP.cat ? "" : "active"}">${tr("Усі категорії")} <span>${list.length}</span></button>${cats.map(([c, n]) => `<button data-cat="${escapeHtml(c)}" class="${SMP.cat === c ? "active" : ""}">${escapeHtml(c)} <span>${n}</span></button>`).join("")}
      ${SMP.sonicpi ? "" : `<p class="muted small sb2-hintbox">${tr("Більше справжніх записаних семплів — «Семпли Sonic Pi» у «Магазині пакетів».")}</p>`}</div>
    <div class="sb2-list">${shown.slice(0, 400).map((s) => {
      const loopish = s.kind === "loop" || s.kind === "note", pad = SMP_PAD[s.cat] && s.kind !== "loop";
      return `<div class="sb2-row" data-sid="${escapeHtml(s.id)}" draggable="true" data-hint="${escapeHtml(tr("Перетягніть на таймлайн — звук стане з того місця, куди відпустите; на пад ударних — стане цим ударом"))}"><button class="sb2-fav${favs.has("smp:" + s.id) ? " on" : ""}" data-fav data-hint="Додати в обране або прибрати з нього">★</button>
        <button class="sb2-play" data-pl="0" data-hint="Послухати як є">▶</button>${loopish ? `<button class="sb2-play sb2-fit" data-pl="1" data-hint="Послухати в темпі й тональності проєкту">▶♪</button>` : ""}
        <div class="sb2-name"><b>${escapeHtml(s.name)}</b><span class="muted small">${escapeHtml(smpInfo(s))}</span></div><span class="sb2-tag">${escapeHtml(s.cat)}</span>
        ${pad && drumsSel ? `<button class="btn ghost sm" data-pad data-hint="Поставити цей звук на відповідний пад ударних вибраної доріжки">${tr("На пад")}</button>` : ""}
        ${s.kind === "loop" ? `<button class="btn ghost sm" data-slice data-hint="Нарізати луп на удари: кожен удар стане окремою клавішею, ритм можна переставляти й грати в будь-якому темпі">${tr("Нарізати")}</button>` : ""}
        ${s.kind !== "loop" ? `<button class="btn ghost sm" data-smp data-hint="Нова доріжка-семплер: цей звук грає нотами">${tr("Семплер")}</button>` : ""}
        ${s.pack === "user" ? `<button class="sb2-fav" data-rm data-hint="Прибрати з бібліотеки">✕</button>` : ""}
        <button class="btn ghost sm sb2-use" data-add data-hint="Вставити звук аудіодоріжкою з позиції курсору; лупи підганяються під темп і тональність проєкту">${tr("＋ Доріжка")}</button></div>`;
    }).join("") || `<div class="dock-empty">${tr("Нічого не знайдено. Спробуйте інше слово.")}</div>`}</div></div>`;
  $$("[data-cat]", body).forEach((b) => b.onclick = () => { SMP.cat = b.dataset.cat; sbxRender(); });
  $("#smp-imp", body).onclick = () => smpImport();
  $$(".sb2-row", body).forEach((r) => {
    const s = SMP.items.find((x) => x.id === r.dataset.sid);
    const rm = s && $("[data-rm]", r);
    if (rm) rm.onclick = async () => { await api.post("/api/soundbank/user/remove", { id: s.id }); await smpLoad(true); sbxRender(); };
    if (!s) return;
    $$("[data-pl]", r).forEach((b) => b.onclick = () => smpPlay(smpUrl(s, b.dataset.pl === "1")));
    const fav = $("[data-fav]", r);
    fav.onclick = () => { const f = sbxFavs(), k = "smp:" + s.id; f.has(k) ? f.delete(k) : f.add(k); UIP.favSounds = [...f]; saveUI(); fav.classList.toggle("on", f.has(k)); };
    const add = $("[data-add]", r), smp = $("[data-smp]", r), pad = $("[data-pad]", r), slc = $("[data-slice]", r);
    if (slc) slc.onclick = () => { const mm = document.getElementById("sb2-modal"); if (mm) mm.hidden = true; openSlicer({ spec: s.id, name: s.name, bpm: s.bpm }); };
    add.onclick = () => smpAddTrack(s, add);
    if (smp) smp.onclick = () => smpToSampler(s).catch((e) => toast(e.message, true));
    if (pad) pad.onclick = () => smpToPad(s, SMP_PAD[s.cat] === "hat" && /відкрит|open/i.test(s.name) ? "openhat" : SMP_PAD[s.cat]);
    r.ondblclick = () => smpAddTrack(s, add);
  });
}

const DND = { item: null, kind: null, mark: null };
function dndStart(e, kind, item) {
  DND.item = item;
  DND.kind = kind;
  try { e.dataTransfer.setData("text/plain", item.name); e.dataTransfer.effectAllowed = "copy"; } catch (er) {}
  const m = document.getElementById("sb2-modal");
  setTimeout(() => { if (m) m.classList.add("sb2-dragging"); document.body.classList.add("dnd-on"); }, 0);
}
function dndEnd() {
  const m = document.getElementById("sb2-modal");
  if (m) m.classList.remove("sb2-dragging");
  document.body.classList.remove("dnd-on");
  dndMark(null);
  DND.item = null;
  DND.kind = null;
}
function dndMark(info) {
  if (!DND.mark) {
    DND.mark = document.createElement("div");
    DND.mark.className = "dnd-mark";
    document.body.appendChild(DND.mark);
  }
  const mk = DND.mark;
  if (!info) { mk.hidden = true; return; }
  mk.hidden = false;
  Object.assign(mk.style, { left: info.x + "px", top: info.y + "px", width: info.w + "px", height: info.h + "px" });
  mk.dataset.label = info.label || "";
}
function dndTarget(e) {
  const r = body.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  const h = hitClip(e);
  const snap = (b) => Math.max(0, typeof snapB === "function" ? snapB(b, e.altKey) : b);
  const beat = snap(h ? h.beat : scrollBeat() + (e.clientX - r.left) / S.ppb);
  let top = r.top, height = 0;
  if (h) {
    let acc = 0;
    for (const t of tracksAll()) { const lh = laneHeight(t); if (t.id === h.t.id) { top = r.top + acc; height = lh; break; } acc += lh; }
  }
  return { t: h ? h.t : null, beat, x: r.left + (beat - scrollBeat()) * S.ppb, top, height, r };
}
function dndLabel(tg) {
  const it = DND.item;
  if (!it) return "";
  if (DND.kind === "smp") {
    if (tg.t && SMP_PAD[it.cat] && it.kind !== "loop" && mt(tg.t.id).inst && mt(tg.t.id).inst.type === "drums") return `${tr("На пад")}: ${tg.t.name}`;
    return `${tr("Нова аудіодоріжка з такту")} ${hmBarAt(tg.beat)}`;
  }
  return tg.t ? `${tr("Звук для")}: ${tg.t.name}` : tr("Нова доріжка з цим звуком");
}
(function dndHooks() {
  document.addEventListener("dragstart", (e) => {
    const row = e.target.closest && e.target.closest(".sb2-row[draggable=true]");
    if (!row) return;
    if (row.dataset.sid) { const s = SMP.items.find((x) => x.id === row.dataset.sid); if (s) dndStart(e, "smp", s); }
    else if (row.dataset.id) { const x = SBR.items.find((i) => i.id === row.dataset.id); if (x) dndStart(e, "inst", x); }
  });
  document.addEventListener("dragend", dndEnd);
  body.addEventListener("dragover", (e) => {
    if (!DND.item) return;
    e.preventDefault();
    const tg = dndTarget(e);
    if (!tg) return dndMark(null);
    if (DND.kind === "smp" && !(tg.t && SMP_PAD[DND.item.cat] && DND.item.kind !== "loop" && mt(tg.t.id).inst && mt(tg.t.id).inst.type === "drums")) dndMark({ x: tg.x, y: tg.r.top, w: 2, h: tg.r.height, label: dndLabel(tg) });
    else if (tg.t) dndMark({ x: tg.r.left, y: tg.top, w: tg.r.width, h: tg.height, label: dndLabel(tg) });
    else dndMark({ x: tg.r.left, y: Math.max(tg.r.top, e.clientY - 18), w: tg.r.width, h: 36, label: dndLabel(tg) });
  });
  body.addEventListener("dragleave", (e) => { if (!body.contains(e.relatedTarget)) dndMark(null); });
  body.addEventListener("drop", async (e) => {
    if (!DND.item) return;
    e.preventDefault();
    const tg = dndTarget(e), it = DND.item, kind = DND.kind;
    dndEnd();
    if (!tg) return;
    try {
      if (kind === "smp") {
        const drumT = tg.t && mt(tg.t.id).inst && mt(tg.t.id).inst.type === "drums";
        if (drumT && SMP_PAD[it.cat] && it.kind !== "loop") { SBR.tid = tg.t.id; await smpToPad(it, SMP_PAD[it.cat] === "hat" && /відкрит|open/i.test(it.name) ? "openhat" : SMP_PAD[it.cat]); }
        else await smpAddTrack(it, null, tg.beat);
      } else if (tg.t) await sbxAssign(it, tg.t.id);
      else await sbxNewTrack(it);
    } catch (er) { toast(er.message, true); }
  });
  const heads = $("#heads");
  if (heads) {
    heads.addEventListener("dragover", (e) => { if (DND.item && DND.kind === "inst") { e.preventDefault(); const h = e.target.closest(".lane-head"); $$(".lane-head", heads).forEach((x) => x.classList.toggle("dnd-over", x === h)); } });
    heads.addEventListener("dragleave", () => $$(".lane-head.dnd-over", heads).forEach((x) => x.classList.remove("dnd-over")));
    heads.addEventListener("drop", async (e) => {
      if (!DND.item || DND.kind !== "inst") return;
      e.preventDefault();
      const it = DND.item, hd = e.target.closest(".lane-head");
      dndEnd();
      $$(".lane-head.dnd-over", heads).forEach((x) => x.classList.remove("dnd-over"));
      const idx = hd ? [...heads.querySelectorAll(".lane-head")].indexOf(hd) : -1;
      const t = idx >= 0 ? tracksAll()[idx] : null;
      try { t ? await sbxAssign(it, t.id) : await sbxNewTrack(it); } catch (er) { toast(er.message, true); }
    });
  }
  document.addEventListener("dragover", (e) => {
    if (!DND.item || DND.kind !== "smp") return;
    const pad = e.target.closest && e.target.closest(".pad[data-pad]");
    if (pad) { e.preventDefault(); pad.classList.add("dnd-over"); }
  });
  document.addEventListener("dragleave", (e) => { const pad = e.target.closest && e.target.closest(".pad[data-pad]"); if (pad) pad.classList.remove("dnd-over"); });
  document.addEventListener("drop", async (e) => {
    const pad = e.target.closest && e.target.closest(".pad[data-pad]");
    if (!pad || !DND.item || DND.kind !== "smp") return;
    e.preventDefault();
    const it = DND.item;
    dndEnd();
    pad.classList.remove("dnd-over");
    SBR.tid = S.sel;
    await smpToPad(it, pad.dataset.pad);
  });
})();

async function smpImport() {
  let job;
  try {
    if (DESK.on && DESK.api && DESK.api.open_folder) {
      const r = await DESK.api.open_folder().catch(() => null);
      const paths = Array.isArray(r) ? r : r ? [r] : [];
      if (!paths.length) return;
      job = await api.post("/api/soundbank/import", { paths });
    } else {
      const files = await new Promise((res) => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.multiple = true;
        inp.webkitdirectory = true;
        inp.onchange = () => res([...inp.files]);
        inp.click();
      });
      const aud = files.filter((f) => /\.(wav|mp3|flac|ogg|aiff?|m4a|opus)$/i.test(f.name));
      if (!aud.length) return toast(tr("У вибраній папці немає аудіофайлів."), true);
      const fd = new FormData();
      aud.slice(0, 3000).forEach((f) => fd.append("files", f, f.webkitRelativePath || f.name));
      const st = document.getElementById("smp-imp-st");
      if (st) st.textContent = tr("Завантажую файли…");
      const r = await fetch("/api/soundbank/import", { method: "POST", body: fd });
      job = await r.json();
      if (!r.ok) throw new Error(job.error || "помилка");
    }
    if (job.error) throw new Error(job.error);
    let j;
    for (;;) {
      await new Promise((res) => setTimeout(res, 600));
      j = await api.get(`/api/process/${job.job}`);
      const st = document.getElementById("smp-imp-st");
      if (st) st.textContent = `${tr("Розкладаю за категоріями…")} ${Math.round((j.progress || 0) * 100)}%`;
      if (j.status !== "running") break;
    }
    if (j.status === "error") throw new Error(j.error);
    const res = j.result || {};
    await smpLoad(true);
    SMP.cat = "📁 " + tr("Мої семпли");
    sbxRender();
    toast(`${tr("Додано")}: ${res.added}${res.skipped ? `, ${tr("пропущено (вже є або тиша)")}: ${res.skipped}` : ""}${res.failed ? `, ${tr("не вдалося прочитати")}: ${res.failed}` : ""}.`);
  } catch (e) {
    toast(tr("Не вдалося імпортувати") + ": " + e.message, true);
    const st = document.getElementById("smp-imp-st");
    if (st) st.textContent = "";
  }
}
