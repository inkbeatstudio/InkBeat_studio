"use strict";
const HB = { drag: null, raf: 0 };
function hbDraw() {
  const box = $("#tl-hbar"), c = $("#cv-hbar");
  if (!box || !c || !S.B || S.view !== "project") return;
  const dpr = devicePixelRatio || 1, w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + "px";
    c.style.height = h + "px";
  }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const total = Math.max(1, body.scrollWidth / S.ppb), X = (b) => b / total * w;
  for (const s of secList()) {
    g.fillStyle = (s.color || "#6b7280") + "55";
    g.fillRect(X(s.start), 3, Math.max(1, X(s.end) - X(s.start) - 1), h - 6);
  }
  const list = tracksAll(), lh = Math.max(1, (h - 8) / Math.max(1, list.length));
  list.forEach((t, i) => {
    const m = mt(t.id);
    if (!m || m.mute) return;
    g.fillStyle = (t.color || "#888") + "aa";
    for (const cl of m.clips) {
      if (cl.mute) continue;
      g.fillRect(X(cl.start), 4 + i * lh, Math.max(1, X(cl.start + cl.dur / period()) - X(cl.start)), Math.max(1, lh - 1));
    }
  });
  const x0 = body.scrollLeft / body.scrollWidth * w, vw = Math.max(14, body.clientWidth / body.scrollWidth * w);
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(0, 0, x0, h);
  g.fillRect(x0 + vw, 0, w - x0 - vw, h);
  g.strokeStyle = "rgba(255,181,71,0.95)";
  g.lineWidth = 1.5;
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.beginPath();
  g.roundRect ? g.roundRect(x0 + 0.75, 1.75, vw - 1.5, h - 3.5, 4) : g.rect(x0 + 0.75, 1.75, vw - 1.5, h - 3.5);
  g.fill();
  g.stroke();
  g.fillStyle = "#ffffff";
  g.fillRect(Math.round(X(S.playBeat)), 0, 1.5, h);
}
function hbSoon() {
  if (HB.raf) return;
  HB.raf = requestAnimationFrame(() => { HB.raf = 0; hbDraw(); });
}
function hbScrollTo(px, grab) {
  const box = $("#tl-hbar"), w = box.clientWidth;
  const vw = body.clientWidth / body.scrollWidth * w;
  const x = px - (grab != null ? grab : vw / 2);
  body.scrollLeft = Math.max(0, Math.min(body.scrollWidth - body.clientWidth, x / w * body.scrollWidth));
}
(function navHooks() {
  const box = $("#tl-hbar");
  box.addEventListener("pointerdown", (e) => {
    const r = box.getBoundingClientRect(), px = e.clientX - r.left, w = box.clientWidth;
    const x0 = body.scrollLeft / body.scrollWidth * w, vw = Math.max(14, body.clientWidth / body.scrollWidth * w);
    HB.drag = px >= x0 && px <= x0 + vw ? px - x0 : vw / 2;
    box.setPointerCapture(e.pointerId);
    hbScrollTo(px, HB.drag);
  });
  box.addEventListener("pointermove", (e) => {
    if (HB.drag == null) return;
    const r = box.getBoundingClientRect();
    hbScrollTo(e.clientX - r.left, HB.drag);
  });
  box.addEventListener("pointerup", () => { HB.drag = null; });
  box.addEventListener("dblclick", (e) => {
    const r = box.getBoundingClientRect(), total = body.scrollWidth / S.ppb;
    seek((e.clientX - r.left) / box.clientWidth * total);
  });
  box.addEventListener("wheel", (e) => {
    e.preventDefault();
    body.scrollLeft += (e.deltaY || e.deltaX) * 1.5;
  }, { passive: false });
  $("#hb-fit").onclick = () => {
    const end = Math.max(8, arrEnd() + 4);
    setZoom(Math.max(4, Math.min(160, (body.clientWidth - 20) / end)));
    body.scrollLeft = 0;
  };
  body.addEventListener("scroll", hbSoon);
  window.addEventListener("resize", hbSoon);
  const d = draw;
  draw = function() {
    d();
    hbSoon();
  };
})();
