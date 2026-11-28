"use strict";
const LANG = (() => {
  try {
    return localStorage.getItem("inkbeat.lang") || "uk";
  } catch (e) {
    return "uk";
  }
})();
const I18N = { on: LANG === "en", cache: new Map(), rx: null, orig: new WeakMap() };
const CYR = /[А-Яа-яІіЇїЄєҐґ]/;
const UNITS = { "мс": "ms", "Гц": "Hz", "кГц": "kHz", "дБ": "dB", "пт": "st", "ц": "c", "с": "s", "хв": "min", "тактів": "bars", "такти": "bars", "такт": "bar", "нот": "notes", "ударів": "hits", "доріжок": "tracks", "дор.": "tr." };
const UNIT_RX = /(\d[\d.,]*)\s*(мс|кГц|Гц|дБ|пт|хв|тактів|такти|такт|нот|ударів|доріжок|дор\.|ц|с)(?![\p{L}])/gu;
function setLang(l) {
  try {
    localStorage.setItem("inkbeat.lang", l);
  } catch (e) {
  }
  location.reload();
}
function trCore(s) {
  const norm = s.replace(/\s+/g, " ").trim();
  if (!norm) return s;
  let hit = I18N_EN[norm];
  if (hit === undefined) {
    if (!I18N.rx) {
      const keys = Object.keys(I18N_EN).filter((k) => k.length >= 3 && CYR.test(k)).sort((a, b) => b.length - a.length);
      const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const isL = (ch) => /\p{L}/u.test(ch);
      I18N.rx = new RegExp(keys.map((k) => (isL(k[0]) ? "(?<!\\p{L})" : "") + esc(k) + (isL(k[k.length - 1]) ? "(?!\\p{L})" : "")).join("|"), "gu");
    }
    hit = norm.replace(I18N.rx, (m) => I18N_EN[m]);
  }
  if (CYR.test(hit)) hit = hit.replace(UNIT_RX, (m, n, u) => n + " " + UNITS[u]);
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0];
  return lead + hit + tail;
}
function tr(s) {
  if (!I18N.on || typeof s !== "string" || !CYR.test(s)) return s;
  let r = I18N.cache.get(s);
  if (r === undefined) {
    r = trCore(s);
    if (I18N.cache.size > 20000) I18N.cache.clear();
    I18N.cache.set(s, r);
  }
  return r;
}
if (I18N.on) {
  document.documentElement.lang = "en";
  const ATTRS = ["title", "placeholder", "data-hint", "aria-label", "alt"];
  const doText = (n) => {
    if (n.parentElement && n.parentElement.closest("[data-notr]")) return;
    const v = n.data;
    if (v && CYR.test(v)) {
      const t = tr(v);
      if (t !== v) n.data = t;
    }
  };
  const doEl = (el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && CYR.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
    if (el.tagName === "INPUT" && el.type === "button" && CYR.test(el.value || "")) { const t = tr(el.value); if (t !== el.value) el.value = t; }
  };
  const walk = (root) => {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    if (root.tagName === "SCRIPT" || root.tagName === "STYLE" || root.isContentEditable || root.hasAttribute("data-notr")) return;
    doEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (n.hasAttribute("data-notr")) return NodeFilter.FILTER_REJECT;
        if (n.tagName === "TEXTAREA") { doEl(n); return NodeFilter.FILTER_REJECT; }
        return n.tagName === "SCRIPT" || n.tagName === "STYLE" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doEl(n);
    }
  };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doEl(m.target);
      else for (const n of m.addedNodes) {
        if (n.parentElement && n.parentElement.tagName === "TEXTAREA") continue;
        walk(n);
      }
    }
  });
  const start = () => {
    walk(document.documentElement);
    document.title = tr(document.title);
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  const C2 = CanvasRenderingContext2D.prototype;
  const fT = C2.fillText, sT = C2.strokeText, mT = C2.measureText;
  C2.fillText = function (t, ...a) { return fT.call(this, I18N.raw ? String(t) : tr(String(t)), ...a); };
  C2.strokeText = function (t, ...a) { return sT.call(this, I18N.raw ? String(t) : tr(String(t)), ...a); };
  C2.measureText = function (t) { return mT.call(this, I18N.raw ? String(t) : tr(String(t))); };
  const pr = window.prompt, cf = window.confirm, al = window.alert;
  window.prompt = (m, d) => pr.call(window, tr(m), typeof d === "string" && I18N_EN[d] ? I18N_EN[d] : d);
  window.confirm = (m) => cf.call(window, tr(m));
  window.alert = (m) => al.call(window, tr(m));
}
