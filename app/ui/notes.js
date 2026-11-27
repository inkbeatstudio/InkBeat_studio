"use strict";
function trackNotes(t) {
  const m = S.mix && S.mix.tracks && S.mix.tracks[t.id];
  return m && m.notes || t.notes || [];
}
function editableNotes(t) {
  const m = mt(t.id);
  if (!m.notes) m.notes = Plugins.clone(trackNotes(t));
  return m.notes;
}
function notesChanged() {
  _arrCache.clear();
  _tracksKey = "";
  saveMix();
  renderHeads();
  draw();
}
const PR = { ppb: 48, x0: 0, top: 84, rowH: 11, tool: "draw", snap: 0.25, sel: new Set(), lastLen: 0.5, tid: null, lane: "vel" };
const CC_LANES = { vel: ["Гучність нот", "Сила (гучність) кожної ноти"], "64": ["Педаль сустейну", "Педаль: поки натиснута — ноти звучать далі. Малюйте вгорі — натиснута, внизу — відпущена"], "1": ["Модуляція (вібрато)", "Колесо модуляції: глибина вібрато"], pb: ["Pitch bend", "Плавне підтягування висоти: вгору — вище, вниз — нижче (±2 півтони)"] };
function renderNotesTab(el, T) {
  const t = T.t;
  if (PR.tid !== t.id) {
    PR.tid = t.id; PR.sel = new Set();
    const ns = trackNotes(t);
    if (ns.length) {
      const ps = ns.map((n) => n[2]).sort((a, b) => a - b);
      PR.top = t.is_drums ? 52 : Math.min(127, ps[Math.floor(ps.length / 2)] + 14);
      PR.x0 = Math.max(0, Math.min(S.playBeat, ns[0][0]) - 1);
    } else { PR.top = 84; PR.x0 = Math.max(0, S.playBeat - 1); }
  }
  const drums = t.is_drums;
  el.innerHTML = `${stripHTML(T)}<div class="pr">
    <div class="pr-tools">
      <div class="seg small"><button data-prt="draw" class="${PR.tool === "draw" ? "active" : ""}" data-hint="Олівець: клік по порожньому місцю — нова нота (тягніть, щоб задати довжину)">Олівець</button><button data-prt="select" class="${PR.tool === "select" ? "active" : ""}" data-hint="Виділення: обведіть рамкою кілька нот">Виділення</button></div>
      <select id="pr-snap" data-hint="Сітка для нових нот і переміщення (Alt — без сітки)">${[["1", "1/4"], ["0.5", "1/8"], ["0.25", "1/16"], ["0.125", "1/32"], ["0.3333333", "1/8T"], ["0", "вільно"]].map(([v, l]) => `<option value="${v}" ${Math.abs(+v - PR.snap) < 1e-4 ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn ghost sm" id="pr-q" data-hint="Вирівняти початок виділених нот (або всіх) до сітки">Квантувати</button>
      <button class="btn ghost sm" id="pr-up" data-hint="Виділені ноти на півтон вище (стрілка вгору)">+1</button>
      <button class="btn ghost sm" id="pr-down" data-hint="Виділені ноти на півтон нижче (стрілка вниз)">−1</button>
      <button class="btn ghost sm" id="pr-oup" data-hint="На октаву вище (Shift+стрілка вгору)">+12</button>
      <button class="btn ghost sm" id="pr-odown" data-hint="На октаву нижче (Shift+стрілка вниз)">−12</button>
      <button class="btn ghost sm" id="pr-short" data-hint="Видалити дуже короткі ноти (коротші за 1/32)">Прибрати короткі</button>
      <button class="btn ghost sm" id="pr-legato" data-hint="Подовжити виділені ноти до початку наступних">Легато</button>
      <button class="btn ghost sm ${HM_UI.scaleOn ? "on" : ""}" id="pr-scale" data-hint="Підсвітити ноти гами: світлі рядки — ноти тональності, зеленуватий — тоніка. Гама й лад задаються в «Гармонії»">Гама</button>
      <button class="btn ghost sm ${HM_UI.lock ? "on" : ""}" id="pr-lock" data-hint="Нові й переміщені ноти стають лише на ноти гами — фальшивих нот не буде">Лише гама</button>
      <button class="btn ghost sm" id="pr-tf" data-hint="Перетворення виділених нот (або всіх): по гамі вгору/вниз, дзеркально, задом наперед, швидше/повільніше, другий голос, варіація">Перетворити ▾</button>
      <button class="btn ghost sm" id="pr-mel" data-hint="Скласти мелодію за акордами пісні: ритм, рух, форма, контрмелодія">Мелодія…</button>
      <button class="btn ghost sm" id="pr-step" data-hint="Покрокове введення: кожна зіграна нота (MIDI-клавіатура або клавіші комп'ютера у вікні «Клавіатура») стає на червону лінію, і лінія рухається на крок сітки. Пробіл — пауза, Backspace — назад">Покроково</button>
      <button class="btn ghost sm" id="pr-del" data-hint="Видалити виділені ноти (Delete)">Видалити</button>
      <select id="pr-lane" data-hint="Що показує нижня смуга: гучність нот, педаль сустейну, модуляція чи pitch bend">${Object.entries(CC_LANES).map(([k, v]) => `<option value="${k}" ${PR.lane === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select>
      ${PR.lane !== "vel" ? `<button class="btn ghost sm" id="pr-ccclr" data-hint="Прибрати всю лінію «${CC_LANES[PR.lane][0]}» з цієї доріжки">Очистити лінію</button>` : ""}
      <span class="spacer"></span>
      <span class="muted small" id="pr-info"></span>
      <button class="btn ghost sm" id="pr-reset" data-hint="Скасувати всі ручні зміни нот і повернути розпізнані">Скинути</button>
    </div>
    <canvas id="pr-cv" tabindex="0"></canvas>
    <div class="muted small pr-help">Клік — нота · тягніть — посунути · правий край — довжина · правий клік — видалити · низ — гучність (тягніть) · коліщатко — вгору/вниз, Shift — вліво/вправо, Ctrl — масштаб · клавіатура зліва — послухати${drums ? " · рядки — звуки барабанів (General MIDI)" : ""}</div>
  </div>`;
  bindStrip(T);
  const cv = $("#pr-cv");
  const KB = 46, VEL = PR.lane === "vel" ? 46 : 78, RUL = 16;
  const lane = PR.lane;
  const ccEv = (make) => { const m = mt(t.id); if (!m.cc && make) m.cc = {}; return m.cc ? (m.cc[lane] || (make ? (m.cc[lane] = []) : null)) : null; };
  const DRUM_NAMES = { 35: "Бочка 2", 36: "Бочка", 37: "Rim", 38: "Малий", 39: "Клеп", 40: "Малий 2", 41: "Том низ.", 42: "Хет закр.", 43: "Том", 44: "Хет пед.", 45: "Том", 46: "Хет відкр.", 47: "Том сер.", 48: "Том", 49: "Тарілка", 50: "Том вис.", 51: "Райд", 57: "Тарілка 2" };
  const notes = () => trackNotes(t);
  const P2 = period();
  let drag = null;
  const geo = () => ({ w: cv.clientWidth, h: cv.clientHeight, gh: cv.clientHeight - VEL - RUL });
  const bx = (b) => KB + (b - PR.x0) * PR.ppb;
  const xb = (x) => PR.x0 + (x - KB) / PR.ppb;
  const py = (p) => RUL + (PR.top - p) * PR.rowH;
  const yp = (y) => Math.round(PR.top - (y - RUL) / PR.rowH + 0.5 - 0.5);
  const ypl = (y) => hmLockP(yp(y), drums);
  const snapv = (b, alt) => !PR.snap || alt ? b : tmU(Math.round(tmM(b) / PR.snap) * PR.snap);
  function info() {
    const el = $("#pr-info"); if (!el) return;
    el.textContent = `${notes().length} нот${PR.sel.size ? ` · виділено ${PR.sel.size}` : ""}${mt(t.id).notes ? " · змінено вручну" : ""}`;
  }
  function paint() {
    if (!cv.isConnected) return;
    const dpr = devicePixelRatio || 1, { w, h, gh } = geo();
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#0e1014"; c.fillRect(0, 0, w, h);
    const rows = Math.ceil(gh / PR.rowH) + 1;
    for (let r = 0; r < rows; r++) {
      const p = PR.top - r, y = RUL + r * PR.rowH;
      const black = [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12);
      c.fillStyle = hmRowColor(p, black, drums); c.fillRect(KB, y, w - KB, PR.rowH);
      if (((p % 12) + 12) % 12 === 0) { c.fillStyle = "#262a34"; c.fillRect(KB, y + PR.rowH - 1, w - KB, 1); }
    }
    const bpb = S.B.timing.bpb, b0 = PR.x0, b1 = xb(w);
    const step = PR.ppb > 120 ? 0.25 : PR.ppb > 50 ? 0.5 : 1;
    for (let b = Math.floor(tmM(b0) / step) * step, mE = tmM(b1); b <= mE; b += step) {
      const x = Math.round(bx(tmU(b))), bar = Math.abs(b / bpb - Math.round(b / bpb)) < 1e-6, beat = Math.abs(b - Math.round(b)) < 1e-6;
      c.fillStyle = bar ? "#2c313d" : beat ? "#1d2028" : "#171a20"; c.fillRect(x, RUL, 1, gh + VEL);
      if (bar) { c.fillStyle = "#8b91a3"; c.font = "10px ui-monospace,Consolas"; c.fillText(String(Math.round(b / bpb) + 1), x + 3, 11); }
    }
    c.fillStyle = "#0a0b0e"; c.fillRect(0, 0, w, RUL); c.fillRect(0, RUL + gh, w, 1);
    for (const s of secList()) { const x0 = bx(s.start), x1 = bx(s.end); if (x1 < KB || x0 > w) continue; c.fillStyle = s.color + "55"; c.fillRect(Math.max(KB, x0), 0, x1 - Math.max(KB, x0), 3); }
    if (!drums) hmPaintRollChords(c, bx, w, KB, RUL + 1);
    const ns = notes(), col = t.color;
    ns.forEach((n, i) => {
      const x = bx(n[0]), ww = Math.max(3, n[1] * PR.ppb - 1), y = py(n[2]);
      if (x + ww < KB || x > w || y < RUL - PR.rowH || y > RUL + gh) return;
      const sel = PR.sel.has(i);
      c.globalAlpha = 0.55 + 0.45 * (n[3] / 127);
      c.fillStyle = sel ? "#ffb547" : col; c.fillRect(Math.max(KB, x), y + 1, ww - Math.max(0, KB - x), PR.rowH - 2);
      c.globalAlpha = 1;
      if (sel) { c.strokeStyle = "#fff"; c.strokeRect(Math.max(KB, x) + 0.5, y + 1.5, ww - Math.max(0, KB - x) - 1, PR.rowH - 3); }
      if (lane === "vel") { const vx = Math.max(KB, x), vh = (n[3] / 127) * (VEL - 8); c.fillStyle = sel ? "#ffb547" : col; c.fillRect(vx, RUL + gh + VEL - 3 - vh, 3, vh); }
    });
    if (typeof prExtra === "function") prExtra(c, t, { bx, py, KB, RUL, w, gh, ns });
    if (lane !== "vel") {
      const y0 = RUL + gh + 4, H = VEL - 8, ev = ccEv(false) || [];
      const vy = (v) => lane === "pb" ? y0 + H / 2 - v * H / 2 : y0 + H - v * H;
      if (lane === "pb") { c.fillStyle = "#262a34"; c.fillRect(KB, y0 + H / 2, w - KB, 1); }
      c.fillStyle = lane === "64" ? "rgba(79,209,197,.35)" : "rgba(255,181,71,.3)";
      c.strokeStyle = lane === "64" ? "#4fd1c5" : "#ffb547";
      c.lineWidth = 1.5;
      c.beginPath();
      let prevV = 0;
      const xs = ev.map((e) => [bx(e[0]), e[1]]);
      c.moveTo(KB, vy(prevV));
      for (const [x, v] of xs) {
        if (x < KB) { prevV = v; c.moveTo(KB, vy(v)); continue; }
        if (x > w) break;
        if (lane === "64") c.lineTo(x, vy(prevV));
        c.lineTo(x, vy(v));
        prevV = v;
      }
      c.lineTo(w, vy(prevV));
      c.stroke();
      c.lineWidth = 1;
      for (const [x, v] of xs) if (x >= KB && x <= w) { c.fillStyle = c.strokeStyle; c.fillRect(x - 1.5, vy(v) - 1.5, 3, 3); }
    }
    c.fillStyle = "#4b5160"; c.font = "10px sans-serif"; c.fillText(CC_LANES[lane][0].toLowerCase(), KB + 4, RUL + gh + 12);
    for (let r = 0; r < rows; r++) {
      const p = PR.top - r, y = RUL + r * PR.rowH, pc = ((p % 12) + 12) % 12, black = [1, 3, 6, 8, 10].includes(pc);
      c.fillStyle = drums ? "#1b1e26" : black ? "#1b1e26" : "#d9dce3"; c.fillRect(0, y, KB - 2, PR.rowH - 1);
      if (drums) { if (DRUM_NAMES[p]) { c.fillStyle = "#c7cbd6"; c.font = "9px sans-serif"; c.fillText(DRUM_NAMES[p], 3, y + PR.rowH - 2); } }
      else if (pc === 0) { c.fillStyle = "#333"; c.font = "9px ui-monospace,Consolas"; c.fillText("C" + (Math.floor(p / 12) - 1), 3, y + PR.rowH - 2); }
    }
    c.fillStyle = "#0e1014"; c.fillRect(0, RUL + gh, KB, VEL);
    const px = bx(S.playBeat); if (px > KB && px < w) { c.fillStyle = "#4fd1c5"; c.fillRect(px, 0, 1.5, h); }
    if (drag && drag.kind === "rect") { c.strokeStyle = "#ffb547"; c.setLineDash([4, 3]); c.strokeRect(drag.x0, drag.y0, drag.x - drag.x0, drag.y - drag.y0); c.setLineDash([]); }
    info();
  }
  function hit(x, y) {
    const ns = notes();
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i], nx = bx(n[0]), ww = Math.max(3, n[1] * PR.ppb), ny = py(n[2]);
      if (x >= nx && x <= nx + ww && y >= ny && y < ny + PR.rowH) return { i, edge: x > nx + ww - 6 && ww > 10 };
    }
    return null;
  }
  function audit(p, v = 0.8) { audition(T, p, v); }
  function commitUndo(label) { pushUndo(label); }
  const sortKeep = () => {
    const ns = editableNotes(t), selN = [...PR.sel].map((i) => ns[i]);
    ns.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    PR.sel = new Set(selN.map((n) => ns.indexOf(n)).filter((i) => i >= 0));
  };
  cv.onmousedown = (e) => {
    cv.focus();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, { gh } = geo();
    if (x < KB && y > RUL && y < RUL + gh) { audit(yp(y)); return; }
    if (y < RUL) { seek(Math.max(0, xb(x))); return; }
    if (y > RUL + gh && lane !== "vel") {
      commitUndo(CC_LANES[lane][0].toLowerCase());
      const ev = ccEv(true), y0 = RUL + gh + 4, H = VEL - 8, step = PR.snap || 0.125;
      const valAt = (yy) => {
        const f = lane === "pb" ? Math.max(-1, Math.min(1, (y0 + H / 2 - yy) / (H / 2))) : Math.max(0, Math.min(1, (y0 + H - yy) / H));
        return lane === "64" ? (f >= 0.5 ? 1 : 0) : lane === "pb" && Math.abs(f) < 0.06 ? 0 : Math.round(f * 1000) / 1000;
      };
      const pts = new Map();
      const put = (ev2) => {
        const xx = ev2.clientX - r.left, yy = ev2.clientY - r.top, b = Math.max(0, Math.round(xb(xx) / step) * step);
        pts.set(b.toFixed(4), [b, valAt(yy)]);
        const keys = [...pts.values()].map((p) => p[0]), lo = Math.min(...keys), hi = Math.max(...keys);
        const keep = ev.filter((e) => e[0] < lo - 1e-6 || e[0] > hi + 1e-6);
        ev.length = 0;
        ev.push(...keep, ...pts.values());
        ev.sort((a, b2) => a[0] - b2[0]);
        paint();
      };
      put(e);
      const up = () => {
        window.removeEventListener("mousemove", put); window.removeEventListener("mouseup", up);
        if (lane === "64" && pts.size) {
          const hi = Math.max(...[...pts.values()].map((p) => p[0])), last = [...pts.values()].sort((a, b2) => a[0] - b2[0]).pop();
          if (last[1] === 1 && !ev.some((e2) => e2[0] > hi + 1e-6 && e2[0] <= hi + step + 1e-6)) { ev.push([hi + step, 0]); ev.sort((a, b2) => a[0] - b2[0]); }
        }
        for (let i = ev.length - 1; i > 0; i--) if (ev[i][1] === ev[i - 1][1]) ev.splice(i, 1);
        saveMix();
        paint();
      };
      window.addEventListener("mousemove", put); window.addEventListener("mouseup", up);
      return;
    }
    if (y > RUL + gh) {
      commitUndo("гучність нот");
      const ns = editableNotes(t);
      drag = { kind: "vel" };
      const setVel = (ev) => {
        const xx = ev.clientX - r.left, yy = ev.clientY - r.top, v = Math.max(1, Math.min(127, Math.round((RUL + gh + VEL - 3 - yy) / (VEL - 8) * 127)));
        ns.forEach((n, i) => { const nx = bx(n[0]); if ((PR.sel.size ? PR.sel.has(i) : true) && Math.abs(nx - xx) < 4) n[3] = v; });
        paint();
      };
      setVel(e);
      const up = () => { window.removeEventListener("mousemove", setVel); window.removeEventListener("mouseup", up); drag = null; notesChanged(); };
      window.addEventListener("mousemove", setVel); window.addEventListener("mouseup", up);
      return;
    }
    const h = hit(x, y);
    if (e.button === 2) return;
    if (h) {
      if (e.shiftKey) { PR.sel.has(h.i) ? PR.sel.delete(h.i) : PR.sel.add(h.i); paint(); return; }
      if (!PR.sel.has(h.i)) { PR.sel = new Set([h.i]); }
      commitUndo(h.edge ? "довжина нот" : "переміщення нот");
      const ns = editableNotes(t), start = [...PR.sel].map((i) => ({ i, n: [...ns[i]] })), b0 = xb(x), p0 = yp(y);
      audit(ns[h.i][2], ns[h.i][3] / 127);
      drag = { kind: h.edge ? "len" : "move" };
      let lastP = 0;
      const mv = (ev) => {
        const xx = ev.clientX - r.left, yy = ev.clientY - r.top, db = xb(xx) - b0, dp = yp(yy) - p0;
        for (const s0 of start) {
          const n = ns[s0.i];
          if (drag.kind === "len") n[1] = Math.max(PR.snap && !ev.altKey ? PR.snap : 0.03, snapv(s0.n[0] + s0.n[1] + db, ev.altKey) - s0.n[0]);
          else { n[0] = Math.max(0, snapv(s0.n[0] + db, ev.altKey)); n[2] = hmLockP(Math.max(0, Math.min(127, s0.n[2] + dp)), drums); }
        }
        if (drag.kind === "move" && dp !== lastP) { lastP = dp; audit(ns[h.i][2], 0.6); }
        PR.lastLen = ns[h.i][1];
        paint();
      };
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); drag = null; sortKeep(); notesChanged(); paint(); };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
      return;
    }
    if (PR.tool === "draw") {
      commitUndo("нова нота");
      const ns = editableNotes(t), b = Math.max(0, snapv(xb(x), e.altKey)), p = ypl(y);
      const n = [b, drums ? 0.25 : PR.lastLen || PR.snap || 0.5, p, 100];
      ns.push(n);
      PR.sel = new Set([ns.length - 1]);
      audit(p);
      drag = { kind: "len" };
      const mv = (ev) => { const xx = ev.clientX - r.left; n[1] = Math.max(PR.snap && !ev.altKey ? PR.snap : 0.03, snapv(xb(xx), ev.altKey) - n[0]); PR.lastLen = n[1]; paint(); };
      const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); drag = null; sortKeep(); notesChanged(); paint(); };
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
      paint();
      return;
    }
    if (!e.shiftKey) PR.sel = new Set();
    drag = { kind: "rect", x0: x, y0: y, x, y };
    const mv = (ev) => { drag.x = ev.clientX - r.left; drag.y = ev.clientY - r.top; paint(); };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
      const xa = Math.min(drag.x0, drag.x), xb2 = Math.max(drag.x0, drag.x), ya = Math.min(drag.y0, drag.y), yb = Math.max(drag.y0, drag.y);
      notes().forEach((n, i) => { const nx = bx(n[0]), ny = py(n[2]) + PR.rowH / 2; if (nx + n[1] * PR.ppb >= xa && nx <= xb2 && ny >= ya && ny <= yb) PR.sel.add(i); });
      drag = null; paint();
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  cv.oncontextmenu = (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    commitUndo("видалення ноти");
    const ns = editableNotes(t);
    const del = PR.sel.has(h.i) ? [...PR.sel] : [h.i];
    del.sort((a, b) => b - a).forEach((i) => ns.splice(i, 1));
    PR.sel = new Set(); notesChanged(); paint();
  };
  cv.onwheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, b = xb(x); PR.ppb = Math.max(8, Math.min(400, PR.ppb * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); PR.x0 = Math.max(0, b - (x - KB) / PR.ppb); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) PR.x0 = Math.max(0, PR.x0 + (e.deltaX || e.deltaY) / PR.ppb);
    else PR.top = Math.max(20, Math.min(127, PR.top - Math.sign(e.deltaY) * 3));
    paint();
  };
  const transpose = (d) => {
    const ns = editableNotes(t), idx = PR.sel.size ? [...PR.sel] : ns.map((_, i) => i);
    if (!idx.length) return;
    commitUndo("транспонування");
    idx.forEach((i) => ns[i][2] = Math.max(0, Math.min(127, ns[i][2] + d)));
    notesChanged(); paint();
  };
  const delSel = () => {
    if (!PR.sel.size) return;
    commitUndo("видалення нот");
    const ns = editableNotes(t);
    [...PR.sel].sort((a, b) => b - a).forEach((i) => ns.splice(i, 1));
    PR.sel = new Set(); notesChanged(); paint();
  };
  cv.onkeydown = (e) => {
    const k = e.key;
    if (k === "Delete" || k === "Backspace") { delSel(); }
    else if (k === "ArrowUp") transpose(e.shiftKey ? 12 : 1);
    else if (k === "ArrowDown") transpose(e.shiftKey ? -12 : -1);
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "a") { PR.sel = new Set(notes().map((_, i) => i)); paint(); }
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") { undo(); }
    else if (k === "Escape") { PR.sel = new Set(); paint(); }
    else if (k === " ") { S.playing ? stopPlay() : play(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  $$("[data-prt]", el).forEach((b) => b.onclick = () => { PR.tool = b.dataset.prt; $$("[data-prt]", el).forEach((x) => x.classList.toggle("active", x === b)); });
  $("#pr-snap").onchange = (e) => { PR.snap = +e.target.value; };
  $("#pr-lane").onchange = (e) => { PR.lane = e.target.value; renderDock(); };
  const clr = $("#pr-ccclr");
  if (clr) clr.onclick = () => { const m = mt(t.id); if (!m.cc || !m.cc[lane]) return; commitUndo("очистити лінію"); delete m.cc[lane]; saveMix(); paint(); };
  hmRollBind(t, { paint });
  $("#pr-q").onclick = () => {
    const ns = editableNotes(t), idx = PR.sel.size ? [...PR.sel] : ns.map((_, i) => i), g = PR.snap || 0.25;
    commitUndo("квантизація нот");
    idx.forEach((i) => { const m0 = Math.round(tmM(ns[i][0]) / g) * g, ml = Math.max(g / 2, Math.round((tmM(ns[i][0] + ns[i][1]) - tmM(ns[i][0])) / g) * g || g); ns[i][0] = tmU(m0); ns[i][1] = tmU(m0 + ml) - ns[i][0]; });
    sortKeep(); notesChanged(); paint();
  };
  $("#pr-up").onclick = () => transpose(1);
  $("#pr-down").onclick = () => transpose(-1);
  $("#pr-oup").onclick = () => transpose(12);
  $("#pr-odown").onclick = () => transpose(-12);
  $("#pr-del").onclick = delSel;
  $("#pr-short").onclick = () => {
    commitUndo("прибрати короткі ноти");
    const ns = editableNotes(t), before = ns.length;
    for (let i = ns.length - 1; i >= 0; i--) if (ns[i][1] < 0.125 && !drums) ns.splice(i, 1);
    PR.sel = new Set(); notesChanged(); paint(); toast(`Видалено нот: ${before - ns.length}`);
  };
  $("#pr-legato").onclick = () => {
    commitUndo("легато");
    const ns = editableNotes(t), idx = PR.sel.size ? [...PR.sel].sort((a, b) => a - b) : ns.map((_, i) => i);
    for (const i of idx) { const nx = ns.find((m, j) => j > i && m[0] > ns[i][0] + 1e-3); if (nx) ns[i][1] = nx[0] - ns[i][0]; }
    notesChanged(); paint();
  };
  $("#pr-reset").onclick = () => {
    if (!mt(t.id).notes) return toast("Ручних змін немає.");
    if (t.gen) return toast("Це згенерована доріжка: щоб почати заново, видаліть її і згенеруйте ще раз.");
    commitUndo("скинути ноти"); mt(t.id).notes = null; PR.sel = new Set(); notesChanged(); paint();
  };
  new ResizeObserver(() => paint()).observe(cv);
  S.liveVis = paint;
  paint();
}
