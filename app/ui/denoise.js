"use strict";
const NZ = { busy: false };
function nzTracks() {
  return tracksAll().filter((t) => t.has_audio && mt(t.id));
}
function nzClipOf(t) {
  const sc = selectedClips().find((x) => x.t.id === t.id);
  return sc ? sc.c : null;
}
function openNoiseRoom() {
  if (S.view !== "project" || !S.B) return toast("Спершу відкрийте проєкт.");
  let m = document.getElementById("nz-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "nz-modal";
    document.body.appendChild(m);
  }
  const list = nzTracks();
  const pre = Object.keys(PROC.denoise.presets);
  m.innerHTML = `<div class="modal-card nz-card">
    <div class="modal-head"><h3>Шумоприбирання</h3><button class="x" data-nz="close">&times;</button></div>
    <div class="modal-body">
      <p class="muted">Виберіть доріжку, яку треба очистити від шипіння, гулу кондиціонера, фону кімнати чи шуму мікрофона. Для однієї доріжки відкриється вікно з ручками й прослуховуванням «До / Після». Кнопка внизу очистить одразу всі вибрані доріжки однаковим рівнем.</p>
      <div class="nz-tip">Порада: найчистіший результат буде, якщо виділити на доріжці кліп у місці, де звучить лише шум (пауза між фразами), — тоді цей шматок стане «відбитком» шуму. Без виділення шум визначиться автоматично.</div>
      ${list.length ? `<div class="nz-list">${list.map((t) => {
        const clip = nzClipOf(t);
        return `<div class="nz-row${t.id === S.sel ? " cur" : ""}" data-id="${escapeHtml(t.id)}">
          <label class="nz-check" data-hint="Позначте, щоб очистити цю доріжку кнопкою «Очистити вибрані»"><input type="checkbox" data-nzc="${escapeHtml(t.id)}"${t.id === S.sel ? " checked" : ""}></label>
          <i class="nz-dot" style="background:${t.color}"></i>
          <div class="nz-name"><b>${escapeHtml(t.name)}</b><span class="muted small">${clip ? "є виділений кліп — буде зразком шуму" : "зразок шуму: автоматично"}</span></div>
          <button class="btn primary sm" data-nzo="${escapeHtml(t.id)}" data-hint="Відкрити налаштування шумоприбирання саме для цієї доріжки, з прослуховуванням">Налаштувати…</button>
        </div>`;
      }).join("")}</div>` : `<div class="dock-empty">У проєкті немає доріжок із записом. Шумоприбирання працює з аудіо (вокал, гітара, стеми), а не з MIDI-доріжками.</div>`}
      ${list.length ? `<div class="nz-batch">
        <span>Рівень для пакетної обробки:</span>
        <div class="seg small" id="nz-pre">${pre.map((p, i) => `<button data-p="${escapeHtml(p)}"${i === 1 ? ' class="active"' : ""}>${escapeHtml(p)}</button>`).join("")}</div>
        <button class="btn ghost sm" data-nz="all" data-hint="Позначити всі доріжки зі списку">Позначити всі</button>
      </div>
      <div class="proc-run"><button class="btn primary" data-nz="run">Очистити вибрані</button><span class="muted" id="nz-status"></span><div class="pbar"><div id="nz-bar"></div></div></div>` : ""}
    </div></div>`;
  const close = () => { if (!NZ.busy) m.hidden = true; };
  m.onclick = (e) => {
    const b = e.target.closest("[data-nz],[data-nzo],[data-p]");
    if (e.target === m) return close();
    if (!b) return;
    if (b.dataset.nz === "close") return close();
    if (b.dataset.nz === "all") return m.querySelectorAll("[data-nzc]").forEach((c) => c.checked = true);
    if (b.dataset.p) {
      m.querySelectorAll("#nz-pre button").forEach((x) => x.classList.toggle("active", x === b));
      return;
    }
    if (b.dataset.nzo) {
      const t = findT(b.dataset.nzo);
      if (!t) return;
      m.hidden = true;
      S.sel = t.id;
      onSelectTrack();
      renderHeads();
      renderTrackForm();
      renderDock();
      openProcess("denoise", { target: { t, m: mt(t.id) }, useClip: nzClipOf(t) || undefined });
      return;
    }
    if (b.dataset.nz === "run") nzRunBatch(m);
  };
  m.hidden = false;
}
async function nzRunBatch(m) {
  if (NZ.busy) return;
  const ids = [...m.querySelectorAll("[data-nzc]:checked")].map((c) => c.dataset.nzc);
  if (!ids.length) return toast("Позначте хоча б одну доріжку галочкою.");
  const level = m.querySelector("#nz-pre .active")?.dataset.p || "Середньо";
  const P0 = Object.assign(PROC.denoise.defaults(), PROC.denoise.presets[level] || {});
  const st = m.querySelector("#nz-status"), bar = m.querySelector("#nz-bar"), btn = m.querySelector('[data-nz="run"]');
  NZ.busy = true;
  btn.disabled = true;
  let undoPushed = false, done = 0;
  try {
    for (let i = 0; i < ids.length; i++) {
      const t = findT(ids[i]);
      if (!t) continue;
      const tm = mt(t.id), P = Object.assign({}, P0), clip = nzClipOf(t);
      if (clip) P.region = [Math.max(0, clip.src), Math.max(0, clip.src) + Math.min(clip.dur, 4)];
      st.textContent = `${t.name}: обробка (${i + 1} з ${ids.length})…`;
      const r = await api.post(`/api/project/${S.pid}/process`, { base: baseId(t), source: tm.source, op: "denoise", params: P });
      let j;
      for (;;) {
        await new Promise((res) => setTimeout(res, 600));
        j = await api.get(`/api/process/${r.job}`);
        bar.style.width = ((i + (j.progress || 0)) / ids.length) * 100 + "%";
        if (j.status !== "running") break;
      }
      if (j.status === "error") throw new Error(`${t.name}: ${j.error}`);
      if (!undoPushed) { pushUndo("Шумоприбирання"); undoPushed = true; }
      tm.source = j.result.vid;
      done++;
    }
    S.versions = await api.get(`/api/project/${S.pid}/versions`);
    await loadAudio();
    afterEdit(true);
    bar.style.width = "100%";
    st.textContent = "";
    NZ.busy = false;
    m.hidden = true;
    toast(`Шумоприбирання: очищено доріжок — ${done}. Скасувати можна через Ctrl+Z, а порівняти з оригіналом — у вкладці «Версії».`);
  } catch (e) {
    if (done) {
      S.versions = await api.get(`/api/project/${S.pid}/versions`).catch(() => S.versions);
      await loadAudio();
      afterEdit(true);
    }
    toast("Помилка шумоприбирання: " + e.message, true);
    st.textContent = "";
  } finally {
    NZ.busy = false;
    btn.disabled = false;
  }
}
$("#t-noise").onclick = () => openNoiseRoom();
