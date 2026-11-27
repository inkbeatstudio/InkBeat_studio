"use strict";
const KA = { m: null, tid: null, minus: true, lat: 0.12, stream: null, an: null, buf: null, raf: 0, run: false, trail: [], pts: 0, frames: 0, hits: 0, wasMuted: null, best: 0 };
function kaTracks() {
  return tracksAll().filter((t) => !t.is_drums && trackNotes(t).length);
}
function kaPitch(buf, sr) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return 0;
  const n = buf.length, minLag = Math.floor(sr / 1000), maxLag = Math.floor(sr / 70);
  let best = 0, bestLag = 0;
  const c0 = buf.reduce((s, x) => s + x * x, 0);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    s /= c0;
    if (s > best) { best = s; bestLag = lag; }
  }
  if (best < 0.55 || !bestLag) return 0;
  const y1 = (() => { let s = 0; for (let i = 0; i < n - bestLag + 1; i++) s += buf[i] * buf[i + bestLag - 1]; return s; })();
  const y3 = (() => { let s = 0; for (let i = 0; i < n - bestLag - 1; i++) s += buf[i] * buf[i + bestLag + 1]; return s; })();
  const y2 = best * c0, den = y1 - 2 * y2 + y3;
  const shift = den ? 0.5 * (y1 - y3) / den : 0;
  return sr / (bestLag + (Math.abs(shift) < 1 ? shift : 0));
}
function openKaraoke() {
  if (!S.B || S.view !== "project") return toast("Спершу відкрийте проєкт.", true);
  if (!KA.tid || !findT(KA.tid)) {
    const l = kaTracks();
    KA.tid = (l.find((t) => t.kind === "vocals" || /vocal|вокал|голос/i.test(t.name)) || l[0] || {}).id;
  }
  let m = document.getElementById("kara-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "kara-modal";
    document.body.appendChild(m);
    if (!UIP.mfloat["kara-modal"]) { UIP.mfloat["kara-modal"] = { on: true, rect: { x: Math.max(10, innerWidth / 2 - 520), y: 110, w: 1040, h: Math.min(640, innerHeight - 140) } }; saveUI(); }
  }
  KA.m = m;
  kaRender();
  m.hidden = false;
  kaLoop();
}
function kaRender() {
  const m = KA.m;
  m.innerHTML = `<div class="modal-card kara-card"><div class="modal-head"><h3>Караоке</h3><button class="x" data-close>&times;</button></div>
    <div class="modal-body teach-body">
      <div class="tc-top">
        <label>Мелодія для співу <select id="ka-t">${kaTracks().map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === KA.tid ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label>
        <label class="chk" data-hint="Вимкнути цю доріжку під час співу — звучатиме мінусовка"><input type="checkbox" id="ka-minus" ${KA.minus ? "checked" : ""}> Мінусовка (без цього голосу)</label>
        <label data-hint="Компенсація затримки мікрофона. Якщо ваша лінія завжди трохи запізнюється — збільште">Затримка <input type="range" id="ka-lat" min="0" max="0.4" step="0.01" value="${KA.lat}"> <span id="ka-latv">${Math.round(KA.lat * 1000)} мс</span></label>
        <span class="spacer"></span>
        <button class="btn primary sm" id="ka-go">${KA.run ? "■ Стоп" : "🎤 Співати"}</button>
      </div>
      <div class="ka-score"><div><span>Влучання</span><b id="ka-acc">—</b></div><div><span>Бали</span><b id="ka-pts">0</b></div><div><span>Найкраще</span><b id="ka-best">${KA.best || "—"}</b></div><div class="ka-msg" id="ka-msg">Натисніть «Співати»: пісня заграє з поточного місця (або в межах циклу), а програма слухатиме мікрофон.</div></div>
      <canvas id="ka-cv"></canvas>
      <div class="ka-lyr"><div id="ka-l1"></div><div id="ka-l2" class="muted"></div></div>
    </div></div>`;
  $$("[data-close]", m).forEach((b) => b.onclick = () => { kaStop(); m.hidden = true; cancelAnimationFrame(KA.raf); KA.raf = 0; });
  $("#ka-t", m).onchange = (e) => { KA.tid = e.target.value; };
  $("#ka-minus", m).onchange = (e) => { KA.minus = e.target.checked; };
  $("#ka-lat", m).oninput = (e) => { KA.lat = +e.target.value; $("#ka-latv", m).textContent = Math.round(KA.lat * 1000) + " мс"; };
  $("#ka-go", m).onclick = () => (KA.run ? kaStop(true) : kaStart());
}
async function kaStart() {
  try {
    if (!KA.stream) KA.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    return toast("Немає доступу до мікрофона. Дозвольте його в налаштуваннях системи й спробуйте ще раз.", true);
  }
  const A = ensureCtx();
  A.ctx.resume();
  const src = A.ctx.createMediaStreamSource(KA.stream);
  KA.an = A.ctx.createAnalyser();
  KA.an.fftSize = 2048;
  src.connect(KA.an);
  KA.buf = new Float32Array(KA.an.fftSize);
  KA.trail = [];
  KA.pts = 0; KA.frames = 0; KA.hits = 0;
  const t = findT(KA.tid);
  if (KA.minus && t) {
    KA.wasMuted = { id: t.id, v: !!mt(t.id).mute };
    mt(t.id).mute = true;
    applyGains();
    renderHeads();
  }
  KA.run = true;
  if (!S.playing) play();
  const g = $("#ka-go");
  if (g) g.textContent = "■ Стоп";
  $("#ka-msg").textContent = "Співайте! Помаранчева лінія — ваш голос, смуги — ноти мелодії.";
}
function kaStop(showResult) {
  if (!KA.run) return;
  KA.run = false;
  if (S.playing) stopPlay();
  if (KA.wasMuted) {
    const m = mt(KA.wasMuted.id);
    if (m) m.mute = KA.wasMuted.v;
    KA.wasMuted = null;
    applyGains();
    renderHeads();
  }
  const g = $("#ka-go");
  if (g) g.textContent = "🎤 Співати";
  if (showResult && KA.frames > 20) {
    const acc = Math.round(100 * KA.hits / KA.frames);
    const score = Math.round(KA.pts);
    KA.best = Math.max(KA.best, score);
    const msg = acc >= 85 ? "Чудово! Майже ідеально в ноти." : acc >= 65 ? "Добре! Кілька місць можна підтягнути." : acc >= 40 ? "Непогано. Спробуйте повільніше — у «Вчителі» є повільне програвання." : "Почніть з короткого фрагмента в циклі й прислухайтеся до мелодії.";
    $("#ka-msg").textContent = `Результат: ${acc}% влучань, ${score} балів. ${msg}`;
    $("#ka-best").textContent = KA.best;
  }
}
function kaLoop() {
  cancelAnimationFrame(KA.raf);
  const step = () => {
    if (!KA.m || KA.m.hidden) { KA.raf = 0; return; }
    if (KA.run && !S.playing) kaStop(true);
    kaFrame();
    KA.raf = requestAnimationFrame(step);
  };
  KA.raf = requestAnimationFrame(step);
}
function kaFrame() {
  const cv = $("#ka-cv");
  if (!cv || !cv.isConnected) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#0e1014";
  c.fillRect(0, 0, w, h);
  const t = findT(KA.tid);
  if (!t) return;
  const P = period(), now = S.playBeat, span = 8, nowX = w * 0.3, ppb = w / span;
  const notes = arranged(t).filter((n) => n[0] + n[1] > now - span * 0.3 && n[0] < now + span);
  const near = arranged(t).filter((n) => n[0] + n[1] > now - 16 && n[0] < now + 16);
  let lo = 55, hi = 79;
  if (near.length) { lo = Math.min(...near.map((n) => n[2])) - 4; hi = Math.max(...near.map((n) => n[2])) + 4; }
  if (hi - lo < 14) { const mid = (hi + lo) / 2; lo = mid - 7; hi = mid + 7; }
  const yOf = (p) => h - 10 - (p - lo) / (hi - lo) * (h - 20);
  for (let p = Math.ceil(lo); p <= hi; p++) { c.fillStyle = p % 12 === 0 ? "#262a34" : "#15171d"; c.fillRect(0, yOf(p), w, 1); }
  let target = null;
  for (const n of notes) {
    const x = nowX + (n[0] - now) * ppb, ww = Math.max(4, n[1] * ppb - 2), y = yOf(n[2]);
    const on = now >= n[0] && now < n[0] + n[1];
    if (on) target = n;
    c.fillStyle = on ? "rgba(255,181,71,.85)" : "rgba(96,165,250,.55)";
    c.beginPath();
    c.roundRect(x, y - 6, ww, 12, 6);
    c.fill();
  }
  c.fillStyle = "#4fd1c5";
  c.fillRect(nowX, 0, 2, h);
  if (KA.run && KA.an) {
    KA.an.getFloatTimeDomainData(KA.buf);
    const half = new Float32Array(KA.buf.length >> 1);
    for (let k = 0; k < half.length; k++) half[k] = (KA.buf[2 * k] + KA.buf[2 * k + 1]) * 0.5;
    const f = kaPitch(half, KA.an.context.sampleRate / 2);
    const beatAt = now - KA.lat / P;
    let tgt = null;
    for (const n of arranged(t)) { if (n[0] > beatAt) break; if (beatAt < n[0] + n[1]) tgt = n; }
    let midi = 0;
    if (f > 0) {
      midi = 69 + 12 * Math.log2(f / 440);
      if (tgt) { while (midi - tgt[2] > 6) midi -= 12; while (tgt[2] - midi > 6) midi += 12; }
    }
    if (tgt) {
      KA.frames++;
      if (midi) {
        const d = Math.abs(midi - tgt[2]);
        if (d < 0.6) { KA.hits++; KA.pts += 10; } else if (d < 1.2) { KA.hits += 0.5; KA.pts += 4; }
      }
    }
    KA.trail.push([beatAt, midi]);
    while (KA.trail.length && KA.trail[0][0] < now - span * 0.35) KA.trail.shift();
    if (KA.frames) {
      $("#ka-acc").textContent = Math.round(100 * KA.hits / KA.frames) + "%";
      $("#ka-pts").textContent = Math.round(KA.pts);
    }
  }
  c.strokeStyle = "#ffb547";
  c.lineWidth = 3;
  c.beginPath();
  let pen = false;
  for (const [b, mm] of KA.trail) {
    if (!mm) { pen = false; continue; }
    const x = nowX + (b - now) * ppb, y = yOf(mm);
    if (pen) c.lineTo(x, y); else c.moveTo(x, y);
    pen = true;
  }
  c.stroke();
  c.lineWidth = 1;
  if (target) { c.fillStyle = "#e6e8ee"; c.font = "bold 13px sans-serif"; c.fillText(NN[target[2] % 12] + (Math.floor(target[2] / 12) - 1), 8, 18); }
  const ph = typeof vsPhrases === "function" ? vsPhrases() : [];
  const i = ph.findIndex((p) => now >= p.start - 0.5 && now < p.end);
  const nx = i >= 0 ? i : ph.findIndex((p) => p.start > now);
  const l1 = $("#ka-l1"), l2 = $("#ka-l2");
  if (l1) {
    const cur = i >= 0 ? ph[i] : null, nxt = ph[(nx >= 0 ? nx : ph.length) + (i >= 0 ? 1 : 0)] || null;
    const tx1 = cur ? cur.text : (ph.length ? "" : "Додайте текст пісні у вокальній студії (вкладка «Текст») — він з'явиться тут під час співу."), tx2 = nxt ? nxt.text : "";
    if (l1.textContent !== tx1) l1.textContent = tx1;
    if (l2.textContent !== tx2) l2.textContent = tx2;
  }
}
(function kaMenus() {
  const tools = MENUS["Інструменти"];
  MENUS["Інструменти"] = () => tools().concat([["Караоке з оцінкою…", needProject(openKaraoke)]]);
})();
