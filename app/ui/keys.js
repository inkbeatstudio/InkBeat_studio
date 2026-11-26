"use strict";
window.addEventListener("keydown", (e) => {
  const m = /^Key([A-Z])$/.exec(e.code || "");
  if (!m || !e.key || e.key.length !== 1 || /[a-z]/i.test(e.key)) return;
  const latin = e.shiftKey ? m[1] : m[1].toLowerCase();
  try {
    Object.defineProperty(e, "key", { get: () => latin, configurable: true });
  } catch (err) {
  }
}, true);
