"use strict";
Object.assign(PROC, {
  breath: {
    name: "Вдихи й клацання",
    icon: "⌇",
    desc: "Знаходить вдихи між фразами та клацання в роті й приглушує їх. Голос не чіпається. Чутливість вище — знаходить більше, але може зачепити тихі «х», «ф».",
    params: () => [{ k: "breath_db", label: "Вдихи тихіше на", min: 0, max: 40, step: 1, unit: "дБ", hint: "0 — не чіпати вдихи; 40 — прибрати майже повністю" }, { k: "clicks", label: "Прибирати клацання", toggle: true }, { k: "sensitivity", label: "Чутливість", min: 0, max: 1, step: 0.01, pct: true, unit: "%" }],
    defaults: () => ({ breath_db: 14, clicks: true, sensitivity: 0.5 }),
    presets: { "Природно (вдихи тихіше)": { breath_db: 10, clicks: true, sensitivity: 0.45 }, "Чисто (поп)": { breath_db: 20, clicks: true, sensitivity: 0.55 }, "Прибрати повністю": { breath_db: 40, clicks: true, sensitivity: 0.6 }, "Лише клацання": { breath_db: 0, clicks: true, sensitivity: 0.5 } }
  },
  rider: {
    name: "Вокал-райдер",
    icon: "≈",
    desc: "Автоматично вирівнює гучність голосу: підтягує тихі слова й стишує гучні — ще до компресора. Вокал звучить рівно й розбірливо, а компресор працює м'якше.",
    params: () => [{ k: "amount", label: "Сила", min: 0, max: 1, step: 0.01, pct: true, unit: "%" }, { k: "range_db", label: "Межа", min: 1, max: 12, step: 0.5, unit: "дБ", hint: "Максимальна зміна гучності в будь-який бік" }],
    defaults: () => ({ amount: 0.7, range_db: 6 }),
    presets: { "Легко": { amount: 0.4, range_db: 3 }, "Стандарт": { amount: 0.7, range_db: 6 }, "Сильно (реп, дикторський)": { amount: 0.95, range_db: 9 } }
  },
  align: {
    name: "Вирівняти за часом",
    icon: "⇉",
    desc: "Підганяє доріжку за часом під доріжку-орієнтир: дабли й бек-вокал починають і закінчують слова разом з головним вокалом. Висота й тембр не змінюються.",
    params: () => {
      const cur = dockTarget();
      const opts = tracksAll().filter((t) => t.has_audio && (!cur || t.id !== cur.t.id)).map((t) => [mt(t.id).source || baseId(t), t.name]);
      return [{ k: "guide", label: "Орієнтир", options: opts, hint: "Під яку доріжку підганяти (зазвичай головний вокал)" }, { k: "strength", label: "Сила", min: 0, max: 1, step: 0.01, pct: true, unit: "%", hint: "100% — точно як орієнтир; 60–80% — щільно, але живо" }, { k: "max_ms", label: "Макс. зсув", min: 30, max: 300, step: 5, unit: "мс" }];
    },
    defaults: () => {
      const cur = dockTarget();
      const lead = tracksAll().find((t) => t.has_audio && t.kind === "vocals" && (!cur || t.id !== cur.t.id)) || tracksAll().find((t) => t.has_audio && (!cur || t.id !== cur.t.id));
      return { guide: lead ? mt(lead.id).source || baseId(lead) : "", strength: 0.9, max_ms: 150 };
    },
    presets: { "Щільно": { strength: 1, max_ms: 150 }, "Живо": { strength: 0.7, max_ms: 120 }, "Лише великі розбіжності": { strength: 0.6, max_ms: 250 } }
  }
});
const PE = { key: null, map: null, sel: new Set(), edits: {}, view: null, busy: false, scale: true, hist: [] };
function peKey(T) {
  return baseId(T.t) + ":" + (T.m.source || "");
}
function peScale() {
  const k = S.B.key;
  const sc = k.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return sc.map((x) => (x + k.tonic) % 12);
}
function peEdit(i) {
  return PE.edits[i] || (PE.edits[i] = { shift: 0, drift: 0, vib: 0 });
}
function pePush() {
  PE.hist.push(JSON.stringify(PE.edits));
  if (PE.hist.length > 60) PE.hist.shift();
}
async function peLoad(T, force) {
  const key = peKey(T);
  if (PE.key === key && PE.map && !force) return;
  PE.busy = true;
  PE.key = key;
  PE.map = null;
  PE.sel.clear();
  PE.edits = {};
  PE.hist = [];
  renderDock();
  try {
    const r = await api.post(`/api/project/${S.pid}/pitchmap`, { base: baseId(T.t), source: T.m.source || null });
    let j;
    for (;;) {
      await new Promise((res) => setTimeout(res, 400));
      j = await api.get(`/api/process/${r.job}`);
      const st = $("#pe-status");
      if (st) st.textContent = `Аналізую висоту голосу… ${Math.round(j.progress * 100)}%`;
      if (j.status !== "running") break;
    }
    if (j.status !== "done") throw new Error(j.error || "помилка");
    if (PE.key !== key) return;
    PE.map = j.result;
    const bl = PE.map.blobs;
    if (bl.length) {
      const cs = bl.map((b) => b.c).sort((a, b) => a - b);
      const mid = cs[cs.length >> 1];
      PE.view = { t0: Math.max(0, bl[0].a - 1), pps: 90, top: Math.round(mid + 9) };
    } else PE.view = { t0: 0, pps: 90, top: 72 };
  } catch (e) {
    toast("Не вдалося проаналізувати висоту: " + e.message, true);
  }
  PE.busy = false;
  renderDock();
}
function renderPitchTab(el, T) {
  if (!T.t.has_audio) {
    el.innerHTML = `<div class="dock-empty">Редактор висоти працює з доріжками, де є запис (вокал, соло-інструмент).</div>`;
    return;
  }
  if (PE.key !== peKey(T) && !PE.busy) {
    peLoad(T);
    return;
  }
  const nsel = PE.sel.size, nedit = Object.keys(PE.edits).filter((k) => {
    const e = PE.edits[k];
    return e.shift || e.drift || e.vib;
  }).length;
  el.innerHTML = `<div class="pe">
    <div class="pe-bar">
      <span class="pe-info" id="pe-status">${PE.busy ? "Аналізую висоту голосу…" : PE.map ? `${PE.map.blobs.length} нот · виділено ${nsel} · змінено ${nedit}` : ""}</span>
      <div class="pe-tools">
        <button class="btn ghost sm" id="pe-all" data-hint="Виділити всі ноти (Ctrl+A)">Усі</button>
        <button class="btn ghost sm" id="pe-snap" data-hint="Поставити виділені ноти (або всі) точно на найближчі ноти тональності ${escapeHtml(S.B.key.name)}">До нот тональності</button>
        <label class="pe-sl" data-hint="Вирівняти «пливучу» висоту всередині ноти: 100% — рівно по центру ноти"><span>Рівність</span><input type="range" id="pe-drift" min="0" max="100" step="1"></label>
        <label class="pe-sl" data-hint="Прибрати вібрато (коливання голосу): 0% — як є, 100% — рівна нота"><span>Вібрато −</span><input type="range" id="pe-vib" min="0" max="100" step="1"></label>
        <button class="btn ghost sm" id="pe-dn" data-hint="Виділені ноти на півтону вниз (↓). З Alt — на 10 центів">−½</button>
        <button class="btn ghost sm" id="pe-up" data-hint="Виділені ноти на півтону вгору (↑). З Alt — на 10 центів">+½</button>
        <button class="btn ghost sm" id="pe-undo" data-hint="Скасувати останню зміну нот">↶</button>
        <button class="btn ghost sm" id="pe-reset" data-hint="Скинути всі зміни висоти">Скинути</button>
        <button class="btn primary sm" id="pe-apply" ${nedit ? "" : "disabled"} data-hint="Застосувати зміни до запису (створить нову версію — оригінал лишається у «Версіях»)">Застосувати</button>
      </div>
    </div>
    <div class="pe-wrap"><canvas id="pe-cv"></canvas></div>
    <p class="muted small pe-tip">Клік — виділити ноту (Shift — кілька), рамка — кілька нот, тягніть вгору-вниз — змінити висоту (Alt — плавно, без прив'язки до півтонів). Подвійний клік — поставити ноту на найближчу ноту тональності. Колесо — прокрутка, Ctrl+колесо — масштаб. Сірі лінії — ноти тональності.</p>
  </div>`;
  if (!PE.map) return;
  const sel = [...PE.sel];
  const avg = (k) => sel.length ? Math.round(sel.reduce((a, i) => a + (PE.edits[i] ? PE.edits[i][k] : 0), 0) / sel.length * 100) : 0;
  $("#pe-drift").value = avg("drift");
  $("#pe-vib").value = avg("vib");
  const targets = () => PE.sel.size ? [...PE.sel] : PE.map.blobs.map((_, i) => i);
  const setAll = (k, v) => {
    for (const i of targets()) peEdit(i)[k] = v;
  };
  $("#pe-drift").onpointerdown = $("#pe-vib").onpointerdown = pePush;
  $("#pe-drift").oninput = (e) => {
    setAll("drift", e.target.value / 100);
    peDraw();
  };
  $("#pe-vib").oninput = (e) => {
    setAll("vib", e.target.value / 100);
    peDraw();
  };
  $("#pe-drift").onchange = $("#pe-vib").onchange = () => renderDock();
  $("#pe-all").onclick = () => {
    PE.map.blobs.forEach((_, i) => PE.sel.add(i));
    renderDock();
  };
  $("#pe-snap").onclick = () => {
    pePush();
    peSnap(targets());
    renderDock();
  };
  const nudge = (d) => {
    if (!PE.sel.size) return toast("Виділіть ноти.");
    pePush();
    for (const i of PE.sel) peEdit(i).shift = Math.round((peEdit(i).shift + d) * 100) / 100;
    renderDock();
  };
  $("#pe-up").onclick = (e) => nudge(e.altKey ? 0.1 : 0.5);
  $("#pe-dn").onclick = (e) => nudge(e.altKey ? -0.1 : -0.5);
  $("#pe-undo").onclick = () => {
    if (!PE.hist.length) return;
    PE.edits = JSON.parse(PE.hist.pop());
    renderDock();
  };
  $("#pe-reset").onclick = () => {
    pePush();
    PE.edits = {};
    renderDock();
  };
  $("#pe-apply").onclick = () => peApply(T);
  peBind(T);
  peDraw();
}
function peSnap(idx) {
  const sc = peScale();
  for (const i of idx) {
    const b = PE.map.blobs[i], e = peEdit(i);
    const cur = b.c + e.shift;
    let best = Math.round(cur), bd = 99;
    for (let n = Math.floor(cur) - 2; n <= Math.ceil(cur) + 2; n++) if (sc.includes((n % 12 + 12) % 12) && Math.abs(n - cur) < bd) {
      bd = Math.abs(n - cur);
      best = n;
    }
    e.shift = Math.round((best - b.c) * 1000) / 1000;
    e.drift = Math.max(e.drift, 0.5);
  }
}
function peGeom() {
  const cv = $("#pe-cv");
  if (!cv) return null;
  const w = cv.clientWidth, h = cv.clientHeight, V = PE.view, rows = Math.max(12, Math.round(h / 14)), rh = h / rows;
  return { cv, w, h, V, rows, rh, X: (t) => 46 + (t - V.t0) * V.pps, T: (x) => V.t0 + (x - 46) / V.pps, Y: (m) => (V.top - m) * rh + rh / 2, M: (y) => V.top - (y - rh / 2) / rh };
}
function peDraw() {
  const g = peGeom();
  if (!g || !PE.map) return;
  const { cv, w, h, V, rows, rh, X, Y } = g, dpr = devicePixelRatio || 1;
  if (cv.width !== w * dpr || cv.height !== h * dpr) {
    cv.width = w * dpr;
    cv.height = h * dpr;
  }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#0e1015";
  c.fillRect(0, 0, w, h);
  const sc = peScale();
  for (let r = 0; r <= rows; r++) {
    const m = V.top - r, pc = (m % 12 + 12) % 12, y = Y(m);
    c.fillStyle = sc.includes(pc) ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.25)";
    c.fillRect(46, y - rh / 2, w - 46, rh);
    if (sc.includes(pc)) {
      c.strokeStyle = "#232733";
      c.beginPath();
      c.moveTo(46, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.fillStyle = pc === S.B.key.tonic ? "#e9ebf1" : sc.includes(pc) ? "#8b91a3" : "#454b5a";
    c.font = "10px var(--mono, monospace)";
    c.fillText(NOTE_NAMES[pc] + (Math.floor(m / 12) - 1), 4, y + 3);
  }
  const P = period(), now = S.playing && S.audio ? curBeat() : S.playBeat, nowT = now * P - S.B.timing.pad;
  for (let s = Math.ceil(V.t0); X(s) < w; s++) {
    c.fillStyle = "#3a3f4c";
    c.fillRect(X(s), 0, 1, 6);
    if (s % 5 === 0) {
      c.fillStyle = "#5d6374";
      c.fillText(mmss(s), X(s) + 2, 14);
    }
  }
  const curve = PE.map.curve, dt = PE.map.dt;
  const i0 = Math.max(0, Math.floor(V.t0 / dt)), i1 = Math.min(curve.length, Math.ceil(g.T(w) / dt));
  PE.map.blobs.forEach((b, i) => {
    if (X(b.b) < 46 || X(b.a) > w) return;
    const e = PE.edits[i] || { shift: 0, drift: 0, vib: 0 }, sel = PE.sel.has(i), changed = e.shift || e.drift || e.vib;
    const yc = Y(b.c + e.shift), hh = Math.max(6, Math.min(rh * 0.9, (b.amp + 60) / 45 * rh));
    c.fillStyle = sel ? "rgba(255,181,71,.55)" : changed ? "rgba(236,72,153,.45)" : "rgba(79,209,197,.32)";
    c.strokeStyle = sel ? "#ffb547" : changed ? "#ec4899" : "#4fd1c5";
    const x0 = X(b.a), x1 = X(b.b);
    c.beginPath();
    c.roundRect(x0, yc - hh / 2, Math.max(3, x1 - x0), hh, Math.min(6, hh / 2));
    c.fill();
    c.stroke();
    if (Math.abs(e.shift) > 0.01) {
      c.strokeStyle = "rgba(255,255,255,.18)";
      c.setLineDash([3, 3]);
      c.strokeRect(x0, Y(b.c) - hh / 2, Math.max(3, x1 - x0), hh);
      c.setLineDash([]);
    }
    const a0 = Math.max(i0, Math.floor(b.a / dt)), a1 = Math.min(i1, Math.ceil(b.b / dt));
    const k = 15;
    c.strokeStyle = sel ? "#1a1205" : "rgba(233,235,241,.85)";
    c.lineWidth = 1.4;
    c.beginPath();
    let pen = false;
    for (let j = a0; j < a1; j++) {
      const m = curve[j];
      if (!m) {
        pen = false;
        continue;
      }
      let sm = 0, n = 0;
      for (let q = Math.max(a0, j - k); q <= Math.min(a1 - 1, j + k); q++) if (curve[q]) {
        sm += curve[q];
        n++;
      }
      const slow = n ? sm / n : m;
      const tgt = b.c + e.shift + (slow - b.c) * (1 - e.drift) + (m - slow) * (1 - e.vib);
      const x = X(j * dt), y = Y(tgt);
      if (!pen) c.moveTo(x, y);
      else c.lineTo(x, y);
      pen = true;
    }
    c.stroke();
    c.lineWidth = 1;
    if (sel && x1 - x0 > 34) {
      c.fillStyle = "#1a1205";
      c.font = "600 10px sans-serif";
      const cents = Math.round(e.shift * 100);
      c.fillText(cents ? `${cents > 0 ? "+" : ""}${cents}ц` : "", x0 + 4, yc - hh / 2 - 3 < 10 ? yc + hh / 2 + 10 : yc - hh / 2 - 3);
    }
  });
  if (PE.box) {
    c.strokeStyle = "#ffb547";
    c.fillStyle = "rgba(255,181,71,.08)";
    const { x0, y0, x1, y1 } = PE.box;
    c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
  if (X(nowT) > 46 && X(nowT) < w) {
    c.fillStyle = "#ffb547";
    c.fillRect(X(nowT), 0, 1.5, h);
  }
}
function peHit(x, y) {
  const g = peGeom();
  if (!g) return -1;
  for (let i = PE.map.blobs.length - 1; i >= 0; i--) {
    const b = PE.map.blobs[i], e = PE.edits[i] || { shift: 0 }, yc = g.Y(b.c + e.shift);
    if (x >= g.X(b.a) - 2 && x <= g.X(b.b) + 2 && Math.abs(y - yc) < Math.max(8, g.rh * 0.6)) return i;
  }
  return -1;
}
function peAudition(b, shift) {
  const T = dockTarget();
  if (!T || S.playing) return;
  const A = ensureCtx(), buf = A.buffers[srcKey(T.t)];
  if (!buf) return;
  const s = A.ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = Math.pow(2, (shift || 0) / 12);
  const g = A.ctx.createGain();
  g.gain.value = 0.9;
  s.connect(g).connect(A.out);
  const d = Math.min(1.5, b.b - b.a);
  s.start(A.ctx.currentTime + 0.01, b.a, d);
  g.gain.setValueAtTime(0.9, A.ctx.currentTime + d - 0.03);
  g.gain.linearRampToValueAtTime(0, A.ctx.currentTime + d + 0.01);
}
function peBind(T) {
  const cv = $("#pe-cv");
  if (!cv) return;
  cv.onwheel = (e) => {
    e.preventDefault();
    const g = peGeom();
    if (e.ctrlKey) {
      const t = g.T(e.offsetX);
      PE.view.pps = Math.max(15, Math.min(600, PE.view.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      PE.view.t0 = Math.max(0, t - (e.offsetX - 46) / PE.view.pps);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) PE.view.t0 = Math.max(0, PE.view.t0 + (e.deltaX || e.deltaY) / PE.view.pps);
    else PE.view.top = Math.max(36, Math.min(96, PE.view.top + (e.deltaY > 0 ? -1 : 1)));
    peDraw();
  };
  cv.ondblclick = (e) => {
    const i = peHit(e.offsetX, e.offsetY);
    if (i < 0) return;
    pePush();
    peSnap([i]);
    renderDock();
  };
  cv.onpointerdown = (e) => {
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    const g = peGeom(), i = peHit(e.offsetX, e.offsetY);
    if (i < 0) {
      if (!e.shiftKey) PE.sel.clear();
      PE.box = { x0: e.offsetX, y0: e.offsetY, x1: e.offsetX, y1: e.offsetY };
      cv.onpointermove = (ev) => {
        PE.box.x1 = ev.offsetX;
        PE.box.y1 = ev.offsetY;
        peDraw();
      };
      cv.onpointerup = () => {
        const bx = PE.box;
        PE.box = null;
        cv.onpointermove = null;
        if (Math.abs(bx.x1 - bx.x0) > 4) {
          const ta = g.T(Math.min(bx.x0, bx.x1)), tb = g.T(Math.max(bx.x0, bx.x1)), ma = g.M(Math.max(bx.y0, bx.y1)), mb = g.M(Math.min(bx.y0, bx.y1));
          PE.map.blobs.forEach((b, k) => {
            const m = b.c + (PE.edits[k] ? PE.edits[k].shift : 0);
            if (b.b >= ta && b.a <= tb && m >= ma - 0.5 && m <= mb + 0.5) PE.sel.add(k);
          });
        } else seek(Math.max(0, (g.T(bx.x0) + S.B.timing.pad) / period()));
        renderDock();
      };
      return;
    }
    if (e.shiftKey) PE.sel.has(i) ? PE.sel.delete(i) : PE.sel.add(i);
    else if (!PE.sel.has(i)) {
      PE.sel.clear();
      PE.sel.add(i);
    }
    const b0 = PE.map.blobs[i];
    peAudition(b0, peEdit(i).shift);
    const start = {};
    for (const k of PE.sel) start[k] = peEdit(k).shift;
    const y0 = e.offsetY;
    let moved = false;
    cv.onpointermove = (ev) => {
      const dm = (y0 - ev.offsetY) / g.rh;
      if (!moved && Math.abs(dm) < 0.2) return;
      if (!moved) pePush();
      moved = true;
      for (const k of PE.sel) {
        const b = PE.map.blobs[k];
        let ns = start[k] + dm;
        if (!ev.altKey) ns = Math.round(b.c + ns) - b.c;
        peEdit(k).shift = Math.round(ns * 1000) / 1000;
      }
      peDraw();
    };
    cv.onpointerup = () => {
      cv.onpointermove = null;
      if (moved) peAudition(b0, peEdit(i).shift);
      renderDock();
    };
  };
  if (!PE.raf) {
    const loop = () => {
      if (S.dockTab === "pitch" && $("#pe-cv") && S.playing) peDraw();
      PE.raf = requestAnimationFrame(loop);
    };
    loop();
  }
}
document.addEventListener("keydown", (e) => {
  if (S.view !== "project" || S.dockTab !== "pitch" || !PE.map || typingIn(e.target)) return;
  if (!$("#pe-cv")) return;
  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && PE.sel.size) {
    e.preventDefault();
    e.stopImmediatePropagation();
    $(e.key === "ArrowUp" ? "#pe-up" : "#pe-dn").dispatchEvent(new MouseEvent("click", { altKey: e.altKey }));
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    e.stopImmediatePropagation();
    $("#pe-all").click();
  }
}, true);
async function peApply(T) {
  const edits = Object.entries(PE.edits).filter(([, e]) => e.shift || e.drift || e.vib).map(([i, e]) => {
    const b = PE.map.blobs[+i];
    return { a: b.a, b: b.b, c: b.c, shift: e.shift, drift: e.drift, vib: e.vib };
  });
  if (!edits.length) return;
  const btn = $("#pe-apply");
  btn.disabled = true;
  btn.textContent = "Обробка…";
  try {
    const r = await api.post(`/api/project/${S.pid}/process`, { base: baseId(T.t), source: T.m.source, op: "pitchedit", params: { edits } });
    let j;
    for (;;) {
      await new Promise((res) => setTimeout(res, 400));
      j = await api.get(`/api/process/${r.job}`);
      btn.textContent = `Обробка… ${Math.round(j.progress * 100)}%`;
      if (j.status !== "running") break;
    }
    if (j.status !== "done") throw new Error(j.error || "помилка");
    pushUndo("редактор висоти");
    S.versions = await api.get(`/api/project/${S.pid}/versions`);
    T.m.source = j.result.vid;
    await loadAudio();
    afterEdit(true);
    toast(`Висоту змінено: ${edits.length} нот (у середньому ${j.result.stats.avg_shift_cents} центів). Оригінал — у вкладці «Версії».`);
    PE.key = null;
    renderDock();
  } catch (e) {
    toast("Помилка: " + e.message, true);
    btn.disabled = false;
    btn.textContent = "Застосувати";
  }
}
const COMP = { drag: null };
function compGroup() {
  return (S.mix.comp || []).filter((id) => findT(id));
}
function compRawSplit(id, c, b) {
  const P = period(), leftDur = (b - c.start) * P;
  const right = { ...c, id: uid("c"), start: b, src: c.src + leftDur, dur: c.dur - leftDur, fi: 0.012 };
  c.dur = leftDur;
  c.fo = 0.012;
  const clips = mt(id).clips;
  clips.splice(clips.indexOf(c) + 1, 0, right);
}
function compSelect(takeId, b0, b1) {
  const P = period(), g = compGroup();
  if (b1 - b0 < 0.02) return;
  pushUndo("збірка дублів");
  for (const id of g) {
    for (const b of [b0, b1]) for (const c of mt(id).clips.slice()) if (b > c.start + 1e-3 && b < c.start + c.dur / P - 1e-3) compRawSplit(id, c, b);
    for (const c of mt(id).clips) {
      const mid = c.start + c.dur / P / 2;
      if (mid > b0 && mid < b1) {
        c.mute = id !== takeId;
        if (id === takeId) {
          c.fi = Math.max(c.fi || 0, 0.012);
          c.fo = Math.max(c.fo || 0, 0.012);
        }
      }
    }
  }
  afterEdit();
}
function compInit(ids, first) {
  S.mix.comp = ids.slice();
  pushUndo("збірка дублів");
  for (const id of ids) for (const c of mt(id).clips) c.mute = id !== first;
  afterEdit();
}
function openCompSetup() {
  const modal = $("#comp-modal"), box = $("#comp-body");
  const cand = tracksAll().filter((t) => t.has_audio);
  const cur = new Set(compGroup());
  const pre = cur.size ? cur : new Set(cand.filter((t) => t.recorded).map((t) => t.id));
  box.innerHTML = `<p class="muted">Збірка дублів — це як у професійних студіях: з кількох записів однієї партії складається один ідеальний. Виберіть доріжки-дублі (один і той самий фрагмент, записаний кілька разів).</p>
    <div class="comp-list">${cand.map((t) => `<label class="chk comp-row"><input type="checkbox" value="${t.id}" ${pre.has(t.id) ? "checked" : ""}><i style="background:${t.color}"></i>${escapeHtml(t.name)}${t.recorded ? ' <span class="tag">запис</span>' : ""}</label>`).join("")}</div>
    <label class="comp-first"><span class="muted small">Почати з дубля</span><select id="comp-first"></select></label>
    <p class="muted small">Далі виберіть інструмент <b>«Збірка»</b> (клавіша B) і просто проведіть мишкою по кращому шматку будь-якого дубля — він стане звучати, а в інших дублях це місце вимкнеться. Переходи між шматками плавні. Скасування — Ctrl+Z.</p>
    <div class="modal-actions">${cur.size ? '<button class="btn ghost" id="comp-off">Розпустити збірку</button>' : ""}<button class="btn primary" id="comp-ok">Почати збірку</button></div>`;
  const fill = () => {
    const ids = $$(".comp-list input", box).filter((x) => x.checked).map((x) => x.value);
    $("#comp-first").innerHTML = ids.map((id) => `<option value="${id}">${escapeHtml(findT(id).name)}</option>`).join("");
  };
  $$(".comp-list input", box).forEach((x) => x.onchange = fill);
  fill();
  $("#comp-ok").onclick = () => {
    const ids = $$(".comp-list input", box).filter((x) => x.checked).map((x) => x.value);
    if (ids.length < 2) return toast("Виберіть щонайменше два дублі.", true);
    compInit(ids, $("#comp-first").value || ids[0]);
    modal.hidden = true;
    setTool("comp");
    toast("Збірку створено. Проведіть мишкою по кращому шматку будь-якого дубля.");
  };
  if ($("#comp-off")) $("#comp-off").onclick = () => {
    S.mix.comp = [];
    saveMix();
    modal.hidden = true;
    setTool("select");
    draw();
    toast("Збірку розпущено. Кліпи лишилися як є — вмикайте й вимикайте їх клавішею M.");
  };
  modal.hidden = false;
}
(function compTool() {
  const knife = document.querySelector('[data-tool="knife"]');
  if (knife) {
    const b = document.createElement("button");
    b.className = "tbtn sm";
    b.dataset.tool = "comp";
    b.dataset.hint = "Збірка дублів (B): проведіть мишкою по кращому шматку дубля — він стане звучати замість інших. Спершу виберіть дублі";
    b.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.5" y="2" width="13" height="3" rx="1"/><rect x="1.5" y="6.5" width="13" height="3" rx="1"/><rect x="1.5" y="11" width="13" height="3" rx="1"/><path d="M5 2v12M11 2v12" stroke-dasharray="1.5 1.5"/></svg>`;
    knife.after(b);
    b.onclick = () => {
      if (compGroup().length < 2) return openCompSetup();
      setTool("comp");
    };
  }
  const tl = $("#tl-body") || document.querySelector(".tl-body");
  const host = typeof body !== "undefined" ? body : tl;
  if (!host) return;
  host.addEventListener("mousedown", (e) => {
    if (S.tool !== "comp" || e.button !== 0) return;
    const h = hitClip(e);
    if (!h) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const g = compGroup();
    if (!g.includes(h.t.id)) return toast(g.length < 2 ? "Спершу виберіть дублі: натисніть кнопку «Збірка» ще раз." : "Ця доріжка не входить у збірку дублів.", true);
    const r = host.getBoundingClientRect();
    const ov = document.createElement("div");
    ov.className = "comp-sel";
    host.appendChild(ov);
    const b0 = snapB(h.beat, e.altKey);
    const upd = (ev) => {
      const b = snapB(scrollBeat() + (ev.clientX - r.left) / S.ppb, ev.altKey);
      COMP.drag = [Math.min(b0, b), Math.max(b0, b)];
      ov.style.left = beatToX(COMP.drag[0]) + host.scrollLeft + "px";
      ov.style.width = Math.max(2, beatToX(COMP.drag[1]) - beatToX(COMP.drag[0])) + "px";
      ov.style.top = host.scrollTop + "px";
      ov.style.height = host.clientHeight + "px";
    };
    upd(e);
    const up = () => {
      window.removeEventListener("mousemove", upd);
      window.removeEventListener("mouseup", up);
      ov.remove();
      if (COMP.drag && COMP.drag[1] - COMP.drag[0] > 0.02) compSelect(h.t.id, COMP.drag[0], COMP.drag[1]);
      else {
        const P = period();
        const c = h.c;
        if (c) compSelect(h.t.id, c.start, c.start + c.dur / P);
      }
      COMP.drag = null;
    };
    window.addEventListener("mousemove", upd);
    window.addEventListener("mouseup", up);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (S.view !== "project" || typingIn(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "b" && !REC.open) {
      e.preventDefault();
      compGroup().length < 2 ? openCompSetup() : setTool("comp");
    }
  });
})();
async function saveAllTakes() {
  const takes = REC.takes.slice();
  if (takes.length < 2) return;
  recStopTake();
  const btn = $("#rec-all");
  if (btn) btn.disabled = true;
  await flushMix();
  const ids = [];
  try {
    for (const [k, tk] of takes.entries()) {
      if (btn) btn.textContent = `Зберігаю ${k + 1} з ${takes.length}…`;
      const wav = DSP.encodeWav({ numberOfChannels: 1, sampleRate: tk.sr, length: tk.data.length, getChannelData: () => tk.data });
      const fd = new FormData();
      fd.append("file", new Blob([wav], { type: "audio/wav" }), "take.wav");
      fd.append("start", String(tk.start));
      fd.append("name", `Дубль ${tk.n}`);
      fd.append("kind", tk.kind);
      fd.append("transcribe", "0");
      const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "помилка");
      let st;
      for (;;) {
        await new Promise((res) => setTimeout(res, 500));
        st = await api.get(`/api/process/${j.job}`);
        if (st.status !== "running") break;
      }
      if (st.status !== "done") throw new Error(st.error || "помилка");
      ids.push(st.result.track);
    }
    REC.takes = [];
    await reloadProject();
    const chain = recChain();
    for (const id of ids) if (S.mix.tracks[id] && recOpts().keepChain && chain.length) S.mix.tracks[id].fx = chain.map((f) => Object.assign(Plugins.newFx(f.type, null), { params: JSON.parse(JSON.stringify(f.params)), on: f.on, preset: f.preset }));
    rebuildStrips();
    const best = takes.reduce((a, t, i) => t.acc != null && (a.acc == null || t.acc > a.acc) ? { acc: t.acc, i } : a, { acc: null, i: 0 });
    compInit(ids, ids[best.i]);
    setTool("comp");
    toast(`Збережено ${ids.length} дублів як збірку${best.acc != null ? `, звучить найточніший (дубль ${takes[best.i].n})` : ""}. Проведіть мишкою по кращому шматку будь-якого дубля.`);
    if (REC.open) renderRecorder();
  } catch (e) {
    toast("Не вдалося зберегти дублі: " + e.message, true);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Усі дублі → збірка";
    }
  }
}
const _renderTakesV = renderTakes;
renderTakes = function() {
  _renderTakesV();
  const box = $("#rec-takes");
  if (!box || REC.takes.length < 2) return;
  const b = document.createElement("button");
  b.className = "btn ghost sm rec-all";
  b.id = "rec-all";
  b.textContent = "Усі дублі → збірка";
  b.dataset.hint = "Зберегти всі дублі як окремі доріжки й одразу перейти до збірки ідеального дубля з кращих шматків";
  b.onclick = saveAllTakes;
  box.appendChild(b);
};
