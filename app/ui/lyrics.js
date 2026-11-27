"use strict";
const LY_UA_WORDS = "мене тебе себе небо серце душа життя любов кров вогонь огонь сонце вітер вода земля зорі зоря ночі ніч день дні сни сон весна осінь зима літо дощ сніг мрія мрії світло тінь пісня пісні слова очі руки губи голос тиша крик час вічність разом поруч далеко близько знову назавжди ніколи завжди тепло холод біль радість щастя сльози сміх дорога дім місто вікно море хвилі гори поле квіти вишня калина воля доля сила правда віра надія свобода мить світ край рай страх сором шлях крила птах політ вгору вниз горить летить болить мовчить кричить стоїть біжить дзвенить тремтить кохаю чекаю знаю шукаю тримаю співаю мрію вірю живу дихаю падаю літаю горю тону люблю звучить зове живе тече росте цвіте пливе веде несе мовчу кричу лечу хочу плачу бачу чую стою іду знайду прийду зможу вернусь проснусь назад вперед навколо одна один твоя моя твій мій наш ваш весь вся ясно красно вільно сильно тихо лихо навіки вогні тумани обійми поцілунок танець ритм бас біт мікрофон сцена зал вечір ранок північ світанок схід захід зірка місяць хмари громи блискавка вулиця кава вино хліб сіль кінець початок мета таємниця відповідь питання".split(" ");
const LY_EN_WORDS = "love above heart apart start night light fight right tonight bright sight high sky fly cry why try die lie eyes skies rise lies fire higher desire wire fall call all wall small tall alone home stone phone known own gone on strong long song wrong belong time mine fine line shine sign divine mind find kind behind blind rain pain again gain chain same name flame game shame blame day way stay say play away pray okay gray stray feel real deal steal heal wheel free me see be sea believe leave breathe dream seem team cream scream know go show slow glow flow grow snow so low hold cold gold told old soul whole control roll goal touch much such rush crush run sun done one fun gun everyone true you through do new blue knew too youth world girl dance chance more door floor before war shore sure your mind word heard hurt dirt alive drive survive five ride side hide wide inside try burn learn turn return wait late great fate break make take wake shake fake mistake heart part tears years fears hear near clear dear here baby maybe crazy lady money honey funny beat street feet heat meet sweet bass place space face race grace chase hands stand understand land plan again friend end send bend".split(" ");
function lyLang(w) {
  return /[а-яіїєґ]/i.test(w) ? "ua" : "en";
}
function lySyl(word) {
  const w = word.toLowerCase().replace(/[^a-zа-яіїєґ]/g, "");
  if (!w) return 0;
  if (lyLang(w) === "ua") return (w.match(/[аеєиіїоуюя]/g) || []).length || 1;
  let s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (s.match(/[aeiouy]{1,2}/g) || []).length);
}
function lyLineSyl(line) {
  return line.split(/\s+/).reduce((s, w) => s + lySyl(w), 0);
}
function lyStress(word) {
  const raw = word.replace(/[^a-zа-яіїєґA-ZА-ЯІЇЄҐ+']/g, "");
  const plus = raw.indexOf("+");
  if (plus > 0) return raw.slice(0, plus).replace(/\+/g, "").length - 1;
  const body = raw.replace(/\+/g, "");
  if (body.length > 1 && body !== body.toUpperCase()) {
    for (let i = 1; i < body.length; i++) if (/[AEIOUYАЕЄИІЇОУЮЯ]/.test(body[i])) return i;
  }
  return -1;
}
function lyNorm(word) {
  const w = word.toLowerCase().replace(/[^a-zа-яіїєґ]/g, "");
  if (lyLang(w) === "ua") return { ua: true, w: w.replace(/є/g, "е").replace(/ї/g, "і").replace(/ю/g, "у").replace(/я/g, "а").replace(/и/g, "і").replace(/[ьй]$/, "") };
  return { ua: false, w: w.replace(/e$/, "").replace(/y$/, "i") };
}
function lyRhymeKey(word) {
  const { ua, w } = lyNorm(word), V = ua ? "аеіоу" : "aeiou";
  if (!w) return "";
  const st = lyStress(word);
  if (st >= 0 && st < w.length) return "'" + w.slice(st);
  const m = w.match(new RegExp(`[${V}]+[^${V}]*$`));
  if (!m) return w.slice(-2);
  if (m[0].length > 1 && !V.includes(m[0][m[0].length - 1])) return m[0];
  const pm = w.match(new RegExp(`[^${V}]?[${V}]+$`));
  return pm ? pm[0] : m[0];
}
function lyVowels(word) {
  const { ua, w } = lyNorm(word);
  return (w.match(ua ? /[аеіоу]/g : /[aeiou]+/g) || []).slice(-2).join("");
}
function lyRhymes(a, b) {
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return false;
  const ka = lyRhymeKey(a), kb = lyRhymeKey(b);
  if (ka && ka === kb) return true;
  const { ua, w: wa } = lyNorm(a), wb = lyNorm(b).w, V = ua ? "аеіоу" : "aeiou";
  const openA = V.includes(wa[wa.length - 1]), openB = V.includes(wb[wb.length - 1]);
  return openA && openB && wa.length > 2 && wb.length > 2 && wa[wa.length - 1] === wb[wb.length - 1] && lyVowels(a) === lyVowels(b);
}
function lyIsHeader(l) {
  return /^(\[.*\]|\(.*\)|(куплет|приспів|бридж|інтро|аутро|програш|пре-?приспів|хук|verse|chorus|bridge|intro|outro|hook|pre-?chorus)(\s*\d+)?\s*:?)$/iu.test(l.trim());
}
function lyAnalyze(text) {
  const lines = text.split(/\r?\n/), out = [];
  let block = [];
  const flush = () => {
    const letters = [], keys = [];
    block.forEach((it) => {
      const lw = (it.text.match(/[a-zа-яіїєґ']+(?=[^a-zа-яіїєґ']*$)/i) || [""])[0];
      it.last = lw;
      const j = keys.findIndex((k) => lyRhymes(k, lw));
      if (j >= 0) it.rh = letters[j];
      else { it.rh = String.fromCharCode(65 + new Set(letters).size); }
      keys.push(lw); letters.push(it.rh);
    });
    block = [];
  };
  lines.forEach((l, i) => {
    const t = l.trim();
    if (!t || lyIsHeader(t)) { flush(); out.push({ i, text: l, header: !!t, empty: !t }); return; }
    const it = { i, text: t, syl: lyLineSyl(t) };
    out.push(it);
    block.push(it);
  });
  flush();
  return out;
}
function lySuggest(word) {
  const k = lyRhymeKey(word), lang = lyLang(word);
  const learned = (UIP.lyWords || []).filter((x) => lyLang(x) === lang);
  const pool = new Set([...(lang === "ua" ? LY_UA_WORDS : LY_EN_WORDS), ...learned, ...((S.mix && S.mix.lyrics) || "").toLowerCase().match(/[a-zа-яіїєґ']{3,}/gi) || []]);
  const strong = [], weak = [];
  for (const w of pool) {
    if (w === word.toLowerCase()) continue;
    if (lyRhymes(word, w)) strong.push(w);
    else if (lyRhymeKey(w).slice(-2) === k.slice(-2) || lyVowels(w) === lyVowels(word) && lyNorm(w).w.slice(-1) === lyNorm(word).w.slice(-1)) weak.push(w);
  }
  return { strong: strong.slice(0, 40), weak: weak.slice(0, 24) };
}
function openLyricsLab() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  let m = document.getElementById("ly-modal");
  if (!m) {
    m = document.createElement("div"); m.className = "modal"; m.id = "ly-modal"; document.body.appendChild(m);
    if (!UIP.mfloat["ly-modal"]) { UIP.mfloat["ly-modal"] = { on: true, rect: { x: Math.max(20, innerWidth / 2 - 520), y: 90, w: 1040, h: Math.min(800, innerHeight - 110) } }; saveUI(); }
  }
  const tl = tracksAll().filter((t) => !t.is_drums);
  m.innerHTML = `<div class="modal-card" style="width:min(1040px,96vw)"><div class="modal-head"><h3>Майстерня тексту</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body ly">
      <p class="muted small">Пишіть текст ліворуч — праворуч одразу видно склади в кожному рядку й схему рим (однакові літери римуються). Заголовки на зразок «Куплет 1» чи «[Приспів]» ділять текст на частини. Текст спільний з вокальною студією й караоке.</p>
      <div class="ly-cols">
        <textarea id="ly-text" spellcheck="false" placeholder="Куплет 1&#10;Перший рядок пісні&#10;Другий рядок пісні&#10;&#10;Приспів&#10;…">${escapeHtml(S.mix.lyrics || "")}</textarea>
        <div class="ly-an" id="ly-an"></div>
      </div>
      <div class="ly-bottom">
        <div class="ly-rh"><h5>Пошук рим</h5>
          <div class="arr-row"><input id="ly-word" placeholder="слово, напр. «серце» або «night»" data-hint="Слово, до якого шукати риму. Подвійний клік по слову в тексті теж підставить його сюди"><button class="btn ghost sm" id="ly-find">Знайти</button></div>
          <div id="ly-res" class="ly-res muted small">Рими беруться з вбудованого словника, з вашого тексту й зі слів, які ви вже писали в інших піснях. Без позначки наголосу склад рими визначається за останнім голосним. Наголос можна позначити плюсом після голосної (се+рце) або великою літерою (сЕрце) — тоді рима рахується від наголошеного складу.</div></div>
        <div class="ly-notes"><h5>Текст на ноти</h5>
          <p class="muted small">Склади тексту розкладаються по нотах мелодії — по одному складу на ноту. Їх видно в піано-ролі, нотному записі й MIDI-експорті. Поставте курсор у рядок, з якого почати.</p>
          <div class="arr-row"><label>Доріжка <select id="ly-t">${tl.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === S.sel ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label><label>від такту <input type="number" id="ly-bar" min="1" value="${hmBarAt(S.playBeat)}"></label></div>
          <div class="arr-row"><button class="btn primary sm" id="ly-place" data-hint="Розкласти склади від рядка з курсором по нотах доріжки з указаного такту">Розкласти склади</button><button class="btn ghost sm" id="ly-clear" data-hint="Прибрати склади з нот доріжки">Прибрати склади</button></div>
          <div id="ly-pinfo" class="muted small"></div></div>
      </div>
    </div></div>`;
  m.hidden = false;
  const ta = $("#ly-text", m);
  const render = () => {
    const A = lyAnalyze(ta.value);
    const html = A.map((it) => {
      if (it.empty) return `<div class="ly-l empty"></div>`;
      if (it.header) return `<div class="ly-l hd">${escapeHtml(it.text.trim())}</div>`;
      return `<div class="ly-l"><span class="ly-syl" data-hint="Складів у рядку">${it.syl}</span><span class="ly-rhl rh-${(it.rh.charCodeAt(0) - 65) % 8}" data-hint="Літера схеми рим: однакові літери римуються">${it.rh}</span><span class="ly-tx">${escapeHtml(it.text)}</span></div>`;
    }).join("");
    const tips = [];
    const lines = A.filter((x) => !x.header && !x.empty);
    for (let k = 1; k < lines.length - 1; k++) { const a = lines[k - 1].syl, b = lines[k].syl, c2 = lines[k + 1].syl; if (Math.abs(b - (a + c2) / 2) >= 4 && Math.abs(a - c2) <= 2) tips.push(`Рядок «${lines[k].text.slice(0, 30)}…» має ${b} складів, а сусідні — ${a} і ${c2}. Співати буде незручно.`); }
    if (lines.length >= 4 && !lines.some((x, k) => k && x.rh === lines[k - 1].rh) && !lines.some((x, k) => k > 1 && x.rh === lines[k - 2].rh)) tips.push("Рим майже немає. Для пісні зручні схеми AABB (сусідні рядки) або ABAB (через рядок).");
    $("#ly-an", m).innerHTML = html + (tips.length ? `<div class="ly-tips">${tips.slice(0, 4).map((x) => `<p>💡 ${escapeHtml(x)}</p>`).join("")}</div>` : "");
  };
  render();
  let st = 0;
  ta.oninput = () => { S.mix.lyrics = ta.value; clearTimeout(st); st = setTimeout(() => { saveMix(); render(); lyLearn(ta.value); }, 250); };
  ta.ondblclick = () => { const s = ta.value.slice(0, ta.selectionEnd), w = (s.match(/[a-zа-яіїєґ']+$/i) || [""])[0] + (ta.value.slice(ta.selectionEnd).match(/^[a-zа-яіїєґ']+/i) || [""])[0]; if (w) { $("#ly-word", m).value = w; $("#ly-find", m).click(); } };
  $("[data-close]", m).onclick = () => { m.hidden = true; };
  const find = () => {
    const w = $("#ly-word", m).value.trim();
    if (!w) return;
    const r = lySuggest(w);
    $("#ly-res", m).innerHTML = (r.strong.length ? `<b>Рими:</b> ${r.strong.map((x) => `<button class="ly-w">${escapeHtml(x)}</button>`).join("")}` : "Точних рим у словнику немає.") + (r.weak.length ? `<br><b>Співзвучні:</b> ${r.weak.map((x) => `<button class="ly-w">${escapeHtml(x)}</button>`).join("")}` : "");
    $$(".ly-w", m).forEach((b) => b.onclick = () => { const p = ta.selectionStart; ta.setRangeText(b.textContent, p, ta.selectionEnd, "end"); ta.focus(); ta.oninput(); });
  };
  $("#ly-find", m).onclick = find;
  $("#ly-word", m).onkeydown = (e) => { if (e.key === "Enter") find(); };
  $("#ly-place", m).onclick = () => {
    const t = findT($("#ly-t", m).value);
    if (!t) return;
    const from = ta.value.slice(0, ta.selectionStart).split(/\r?\n/).length - 1;
    const lines = ta.value.split(/\r?\n/).slice(from).filter((l) => l.trim() && !lyIsHeader(l));
    const syls = lines.flatMap((l) => lySplit(l));
    const a = tmU((Math.max(1, +$("#ly-bar", m).value || 1) - 1) * S.B.timing.bpb);
    const ns = trackNotes(t).filter((n) => n[0] >= a - 1e-3).sort((x, y) => x[0] - y[0]);
    const mono = [];
    for (const n of ns) if (!mono.length || n[0] > mono[mono.length - 1][0] + 0.02) mono.push(n);
    if (!mono.length) return toast("На доріжці після цього такту немає нот. Спершу намалюйте або складіть мелодію.", true);
    pushUndo("текст на ноти");
    if (!S.mix.syl) S.mix.syl = {};
    const map = (S.mix.syl[t.id] || []).filter((x) => x[0] < a - 1e-3);
    const k = Math.min(mono.length, syls.length);
    for (let i = 0; i < k; i++) map.push([+mono[i][0].toFixed(4), syls[i]]);
    S.mix.syl[t.id] = map;
    saveMix();
    if (S.dockTab === "notes") renderDock();
    $("#ly-pinfo", m).textContent = syls.length > mono.length ? `Розкладено ${k} складів. Ще ${syls.length - mono.length} не вистачило нот — додайте нот або скоротіть текст.` : syls.length < mono.length ? `Розкладено ${k} складів, ${mono.length - syls.length} нот лишилися без тексту (можна розспівати склад на кілька нот).` : `Розкладено ${k} складів — ідеально, кожна нота має склад.`;
  };
  $("#ly-clear", m).onclick = () => { const t = findT($("#ly-t", m).value); if (!t || !S.mix.syl) return; pushUndo("прибрати склади"); delete S.mix.syl[t.id]; saveMix(); if (S.dockTab === "notes") renderDock(); $("#ly-pinfo", m).textContent = "Склади прибрано."; };
}
function lySplit(line) {
  const out = [];
  for (const raw of line.split(/\s+/).filter(Boolean)) {
    const w = raw;
    if (lyLang(w) === "ua") {
      const V = /[аеєиіїоуюяАЕЄИІЇОУЮЯ]/;
      const idx = [...w].map((ch, i) => V.test(ch) ? i : -1).filter((i) => i >= 0);
      if (idx.length <= 1) { out.push(w); continue; }
      let start = 0;
      for (let j = 0; j < idx.length - 1; j++) {
        const gap = idx[j + 1] - idx[j] - 1;
        const cut = idx[j] + 1 + (gap >= 2 ? 1 : 0);
        out.push(w.slice(start, cut) + "-");
        start = cut;
      }
      out.push(w.slice(start));
    } else {
      const n = lySyl(w);
      if (n <= 1) { out.push(w); continue; }
      const parts = w.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi) || [w];
      if (parts.length === n) parts.forEach((p, i) => out.push(i < parts.length - 1 ? p + "-" : p));
      else out.push(w);
    }
  }
  return out;
}
function lySylFor(tid) {
  return S.mix && S.mix.syl && S.mix.syl[tid] || null;
}
const STEP = { on: false, pos: 0, tid: null };
function prExtra(c, t, g) {
  const syl = lySylFor(t.id);
  if (syl && syl.length) {
    c.save();
    c.font = "600 10px " + getComputedStyle(document.body).fontFamily;
    for (const [b, s] of syl) {
      const n = g.ns.find((x) => Math.abs(x[0] - b) < 0.02);
      if (!n) continue;
      const x = g.bx(b), y = g.py(n[2]);
      if (x < g.KB || x > g.w) continue;
      c.fillStyle = "rgba(0,0,0,.55)";
      const tw = c.measureText(s).width + 6;
      c.fillRect(x, y - 12, tw, 12);
      c.fillStyle = "#fde68a";
      c.fillText(s, x + 3, y - 3);
    }
    c.restore();
  }
  if (STEP.on && STEP.tid === t.id) {
    const x = g.bx(STEP.pos);
    c.fillStyle = "#f43f5e";
    c.fillRect(x, g.RUL, 2, g.gh);
    c.fillText("▼", x - 4, g.RUL + 9);
  }
}
function stepLen() {
  return PR.snap || 0.25;
}
function stepToggle(t) {
  STEP.on = !STEP.on;
  STEP.tid = t.id;
  if (STEP.on) {
    STEP.pos = Math.round(S.playBeat / stepLen()) * stepLen();
    if (!KB.typing && typeof openKeyboard === "function" && ($("#kbp") || {}).hidden !== false) toast(`Покрокове введення: грайте ноти з MIDI-клавіатури або клавішами A W S E D F T G Y H U J (вікно «Клавіатура»). Кожна нота стає на червону лінію, крок — ${stepLen()} долі. Пробіл — пауза, Backspace — назад, ← → — посунути.`);
    else toast("Покрокове введення увімкнено. Пробіл — пауза, Backspace — назад, ← → — посунути.");
  }
  renderDock();
}
const _kbOnStep = kbOn;
kbOn = function(note, vel) {
  if (STEP.on && STEP.tid) {
    const t = findT(STEP.tid);
    if (t) {
      const ns = editableNotes(t), L = stepLen();
      const key = Math.round(STEP.pos * 1000);
      if (!STEP.chordAt || STEP.chordAt !== key) { pushUndo("покроковий ввід"); STEP.chordAt = key; }
      ns.push([+STEP.pos.toFixed(4), L * 0.95, note, vel || 100]);
      ns.sort((a, b) => a[0] - b[0]);
      notesChanged();
      clearTimeout(STEP.tm);
      STEP.tm = setTimeout(() => { STEP.pos += L; STEP.chordAt = null; if (S.dockTab === "notes") renderDock(); }, 120);
    }
  }
  return _kbOnStep(note, vel);
};
document.addEventListener("keydown", (e) => {
  if (!STEP.on || typingIn(e.target) || e.ctrlKey || e.metaKey) return;
  const t = findT(STEP.tid), L = stepLen();
  if (!t) return;
  if (e.key === " ") { STEP.pos += L; e.preventDefault(); e.stopImmediatePropagation(); renderDock(); }
  else if (e.key === "ArrowRight") { STEP.pos += L; e.preventDefault(); e.stopImmediatePropagation(); renderDock(); }
  else if (e.key === "ArrowLeft") { STEP.pos = Math.max(0, STEP.pos - L); e.preventDefault(); e.stopImmediatePropagation(); renderDock(); }
  else if (e.key === "Backspace") {
    const ns = editableNotes(t), prev = STEP.pos - L;
    const idx = ns.map((n, i) => [n, i]).filter(([n]) => Math.abs(n[0] - prev) < 1e-3).map(([, i]) => i);
    pushUndo("покроковий ввід");
    for (const i of idx.reverse()) ns.splice(i, 1);
    STEP.pos = Math.max(0, prev);
    notesChanged();
    renderDock();
    e.preventDefault(); e.stopImmediatePropagation();
  } else if (e.key === "Escape") { STEP.on = false; renderDock(); }
}, true);
const KBQ = { q: "snap", mode: "add", pass: [], last: -1 };
const _kbToggleRecL = kbToggleRec;
kbToggleRec = function() {
  if (KB.rec) {
    const rec = KB.rec;
    if (KBQ.mode === "replace" && KBQ.pass.length && !rec.notes.length) rec.notes = KBQ.pass;
    if (KBQ.q !== "snap") { const s0 = S.snap; S.snap = KBQ.q === "off" ? 0 : +KBQ.q * 2; _kbToggleRecL(); S.snap = s0; } else _kbToggleRecL();
    KBQ.pass = [];
    return;
  }
  KBQ.pass = [];
  KBQ.last = -1;
  _kbToggleRecL();
};
setInterval(() => {
  if (!KB.rec || !S.playing || KBQ.mode !== "replace") { KBQ.last = S.playing ? S.playBeat : -1; return; }
  if (KBQ.last >= 0 && S.playBeat < KBQ.last - 0.5) {
    if (KB.rec.notes.length) { KBQ.pass = KB.rec.notes; KB.rec.notes = []; toast(`Дубль готовий (${KBQ.pass.length} нот). Грайте ще раз — новий дубль замінить попередній, або зупиніть запис.`); }
  }
  KBQ.last = S.playBeat;
}, 60);
const _openKbL = openKeyboard;
openKeyboard = function() {
  _openKbL();
  const pnl = $("#kbp");
  if (!pnl || pnl.hidden) return;
  const row = $(".kb-row", pnl);
  if (!row || $("#kb-q", pnl)) return;
  const box = document.createElement("span");
  box.className = "kb-chords";
  box.innerHTML = `<select id="kb-q" data-hint="Квантування під час запису: ноти стають на найближчу долю сітки">${[["snap", "квант: як сітка"], ["off", "без квантування"], ["0.5", "квант 1/8"], ["0.25", "квант 1/16"], ["0.3333333", "квант 1/8T"]].map(([v, l]) => `<option value="${v}" ${KBQ.q === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <select id="kb-rm" data-hint="Накладати — лупер: кожне коло циклу додає нові ноти поверх. Замінювати — кожне коло це новий дубль, зберігається останній">${[["add", "накладати (лупер)"], ["replace", "дублі в циклі"]].map(([v, l]) => `<option value="${v}" ${KBQ.mode === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  row.appendChild(box);
  $("#kb-q", pnl).onchange = (e) => { KBQ.q = e.target.value; };
  $("#kb-rm", pnl).onchange = (e) => { KBQ.mode = e.target.value; if (KBQ.mode === "add" || KBQ.mode === "replace") toast(KBQ.mode === "add" ? "Лупер: виділіть цикл на лінійці — кожне коло накладає нові ноти." : "Дублі: виділіть цикл — кожне коло новий дубль, лишиться останній зіграний."); };
};
const AREC = { on: false, last: {}, t: 0 };
function autoRecToggle() {
  AREC.on = !AREC.on;
  AREC.last = {};
  const b = $("#t-arec");
  if (b) b.classList.toggle("on", AREC.on);
  toast(AREC.on ? "Запис автоматизації: під час відтворення рухи фейдерів гучності й панорами (мишкою або MIDI-контролером) записуються в лінії автоматизації доріжок." : "Запис автоматизації вимкнено.");
}
setInterval(() => {
  if (!AREC.on || !S.playing || !S.B) { AREC.last = {}; return; }
  const b = curBeat();
  for (const t of tracksAll()) {
    const m = mt(t.id);
    for (const p of ["vol", "pan"]) {
      const v = +(m[p] || 0), key = t.id + p, prev = AREC.last[key];
      if (prev == null) { AREC.last[key] = { v, b }; continue; }
      if (Math.abs(v - prev.v) < (p === "vol" ? 0.05 : 0.005)) { prev.b = b; continue; }
      if (!m.auto) m.auto = {};
      const pts = (m.auto[p] || []).filter((q) => q[0] < prev.b - 1e-3 || q[0] > b + 1e-3);
      if (!AREC.dirty) { pushUndo("запис автоматизації"); AREC.dirty = true; }
      pts.push([+prev.b.toFixed(3), +prev.v.toFixed(3)], [+b.toFixed(3), +v.toFixed(3)]);
      m.auto[p] = pts.sort((x, y) => x[0] - y[0]);
      if (!S.autoView) S.autoView = {};
      AREC.last[key] = { v, b };
      AREC.changed = true;
    }
  }
  if (AREC.changed) { AREC.changed = false; saveMix(); draw(); }
}, 80);
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#t-play,#t-stop")) AREC.dirty = false; });
(function lyricsUI() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([null, ["Майстерня тексту: склади, рими, текст на ноти…", needProject(openLyricsLab)], [AREC.on ? "Запис автоматизації: вимкнути" : "Запис автоматизації (рухи фейдерів)…", needProject(autoRecToggle)]]);
})();
const _hmRollBindL = hmRollBind;
hmRollBind = function(t, api) {
  _hmRollBindL(t, api);
  const b = $("#pr-step");
  if (!b) return;
  b.classList.toggle("on", STEP.on && STEP.tid === t.id);
  b.onclick = () => stepToggle(t);
  if (t.is_drums) b.hidden = false;
};
function lyLearn(text) {
  const words = (text.toLowerCase().match(/[a-zа-яіїєґ']{3,}/gi) || []).map((w) => w.replace(/'/g, ""));
  const set = new Set(UIP.lyWords || []);
  let added = 0;
  for (const w of words) if (!set.has(w) && set.size < 5000) { set.add(w); added++; }
  if (added) { UIP.lyWords = [...set]; saveUI(); }
}
