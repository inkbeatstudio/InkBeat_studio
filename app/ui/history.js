"use strict";
const HX = { pre: null, pid: null, len: 0, label: "", timer: 0 };
function hxLabel(el) {
  const n = el && el.closest && el.closest("[data-hint],[title],button,label");
  const s = n ? (n.dataset?.hint || n.title || n.textContent || "") : "";
  const w = s.replace(/\s+/g, " ").trim().split(/[.:—(]/)[0].trim();
  return w ? (w.length > 40 ? w.slice(0, 40) + "…" : w) : "зміна налаштувань";
}
function hxSnap() {
  try {
    return JSON.stringify(S.mix);
  } catch (err) {
    return null;
  }
}
function hxCheck() {
  clearTimeout(HX.timer);
  HX.timer = 0;
  const pre = HX.pre;
  HX.pre = null;
  if (!pre || !S.mix || S.view !== "project" || HX.pid !== S.pid || S.undo.length !== HX.len) return;
  const now = hxSnap();
  if (!now || now === pre) return;
  S.undo.push({ label: HX.label, state: pre });
  if (S.undo.length > 80) S.undo.shift();
  S.redo = [];
}
function hxArm(e) {
  if (S.view !== "project" || !S.mix) return;
  if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && /^Key[ZY]$/.test(e.code)) {
    hxCheck();
    return;
  }
  if (HX.pre) {
    if (e.type === "wheel" || e.type === "focusin") return;
    hxCheck();
  }
  HX.pre = hxSnap();
  HX.pid = S.pid;
  HX.len = S.undo.length;
  HX.label = hxLabel(e.target);
}
function hxSettle() {
  if (!HX.pre) return;
  clearTimeout(HX.timer);
  HX.timer = setTimeout(hxCheck, 350);
}
for (const t of ["pointerdown", "keydown", "wheel", "focusin"]) window.addEventListener(t, hxArm, { capture: true, passive: true });
for (const t of ["pointerup", "keyup", "change", "wheel"]) window.addEventListener(t, hxSettle, { capture: true, passive: true });
