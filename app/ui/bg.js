"use strict";
const BG = (() => { const q = new URLSearchParams(location.search); return { mode: q.get("bg"), pid: q.get("pid") }; })();
if (BG.mode) {
  document.documentElement.classList.add("bg-mode");
  try {
    Storage.prototype.setItem = function() {};
    Storage.prototype.removeItem = function() {};
  } catch (e) {}
  saveUI = function() {};
  saveMix = function() {};
}
async function mixdownCurrent(progress) {
  await renderAll(progress);
  progress(tr("Збираю файли пісні…"), 0.98);
  const r = await api.post(`/api/project/${S.pid}/export`, { use_render: true, mixdown: true, edited: editedMidi(), tempo: tmExport(), daw: { rpp: false, dawproject: false }, meta: null, lang: LANG });
  return r;
}
async function bgRun() {
  const say = (o) => { try { parent.postMessage(Object.assign({ type: "inkbeat-bg", pid: BG.pid }, o), location.origin); } catch (e) {} };
  try {
    await openProject(BG.pid);
    if (!S.B || !S.mix) throw new Error(tr("Проєкт не відкрився"));
    await mixdownCurrent((msg, f) => say({ msg: tr(msg), f }));
    say({ done: true });
  } catch (e) {
    say({ error: String(e && e.message || e) });
  }
}
if (BG.mode === "mix" && BG.pid) setTimeout(bgRun, 300);
function bgMixdown(pid, onProgress) {
  return new Promise((resolve, reject) => {
    const fr = document.createElement("iframe");
    fr.className = "bg-frame";
    fr.setAttribute("aria-hidden", "true");
    fr.src = `/?bg=mix&pid=${encodeURIComponent(pid)}`;
    const done = (fn, v) => { window.removeEventListener("message", on); clearTimeout(guard); fr.remove(); fn(v); };
    const on = (e) => {
      const d = e.data;
      if (e.origin !== location.origin || !d || d.type !== "inkbeat-bg" || d.pid !== pid) return;
      if (d.error) done(reject, new Error(d.error));
      else if (d.done) done(resolve, true);
      else if (onProgress) onProgress(d.msg, d.f || 0);
    };
    const guard = setTimeout(() => done(reject, new Error(tr("Зведення триває задовго"))), 30 * 60 * 1000);
    window.addEventListener("message", on);
    document.body.appendChild(fr);
  });
}
async function ensureMixes(pids, onProgress) {
  const st = await api.post("/api/album/status", { pids }).catch(() => []);
  const need = pids.filter((id) => !(st.find((x) => x.pid === id) || {}).mix);
  const failed = [];
  for (let i = 0; i < need.length; i++) {
    const pid = need[i];
    const head = (msg, f) => onProgress(pid, i, need.length, msg, f);
    try {
      if (pid === S.pid && S.B) {
        if (typeof _saveT !== "undefined") clearTimeout(_saveT);
        await fetch(`/api/project/${S.pid}/mix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S.mix) });
        await mixdownCurrent((m, f) => head(tr(m), f));
      } else await bgMixdown(pid, head);
    } catch (e) {
      failed.push([pid, e.message]);
    }
  }
  return { rendered: need.length - failed.length, failed };
}
