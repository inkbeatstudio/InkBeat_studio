"use strict";
(function heartbeat() {
  const ping = () => fetch("/api/ping", { method: "POST" }).catch(() => {});
  ping();
  setInterval(ping, 15e3);
})();
const mmss = (s) => {
  s = Math.max(0, s || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const LIB = { samples: [], presets: { synth: {}, fx: {}, chain: {} } };
async function loadLib() {
  try {
    const j = await api.get("/api/library");
    LIB.samples = j.samples || [];
    LIB.presets = Object.assign({ synth: {}, fx: {}, chain: {} }, j.presets || {});
  } catch (e) {
  }
  return LIB;
}
loadLib();
function setLib(j) {
  LIB.samples = j.samples || LIB.samples;
  LIB.presets = Object.assign({ synth: {}, fx: {}, chain: {} }, j.presets || {});
}
async function uploadSamples(files) {
  const arr = [...files];
  if (!arr.length) return [];
  const fd = new FormData();
  arr.forEach((f) => fd.append("files", f, f.name));
  toast(`Додаю ${arr.length} ${arr.length === 1 ? "семпл" : "семпли"} до бібліотеки…`);
  const r = await fetch("/api/library/sample", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (j.library) setLib(j.library);
  if (j.errors && j.errors.length) toast("Не вдалося додати: " + j.errors.join("; "), true);
  if (j.added && j.added.length) toast(`Додано: ${j.added.map((a) => a.name).join(", ")}. Семпли доступні в семплері та драм-кіті будь-якого проєкту.`);
  return j.added || [];
}
function pickSamples() {
  return new Promise((res) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.accept = "audio/*,.wav,.mp3,.flac,.ogg,.aif,.aiff,.m4a";
    inp.onchange = async () => res(await uploadSamples(inp.files));
    inp.click();
  });
}
async function savePreset(kind, data, suggested) {
  const name = (prompt("Назва пресету:", suggested || "") || "").trim();
  if (!name) return null;
  if (LIB.presets[kind] && LIB.presets[kind][name] && !confirm(`Пресет «${name}» вже є. Замінити?`)) return null;
  try {
    setLib(await api.post("/api/library/preset", { kind, name, data }));
    toast(`Пресет «${name}» збережено. Він з'явиться в усіх ваших проєктах.`);
    return name;
  } catch (e) {
    toast(e.message, true);
    return null;
  }
}
async function deletePreset(kind, name) {
  setLib(await api.post("/api/library/preset/delete", { kind, name }));
}
const _renderSynth = renderSynth;
renderSynth = function(box, T) {
  _renderSynth(box, T);
  const inst = T.m.inst, own = LIB.presets.synth || {};
  const grp = document.createElement("div");
  grp.className = "sp-group own";
  grp.innerHTML = `<span>Мої</span>${Object.keys(own).map((n) => `<button class="chip ${inst.preset === "★ " + n ? "active" : ""}" data-upr="${escapeHtml(n)}" data-hint="Ваш пресет. Правий клік — видалити">${escapeHtml(n)}</button>`).join("")}<button class="chip add" id="syn-save" data-hint="Зберегти поточний звук синтезатора у свою бібліотеку">＋ Зберегти звук</button>`;
  const host = box.querySelector(".syn-presets");
  if (host) host.prepend(grp);
  $$("[data-upr]", grp).forEach((b) => {
    b.onclick = () => {
      pushUndo("мій пресет");
      inst.preset = "★ " + b.dataset.upr;
      inst.params = JSON.parse(JSON.stringify(own[b.dataset.upr]));
      saveMix();
      renderDock();
      audition(T, T.t.role === "bass" ? 40 : 60);
    };
    b.oncontextmenu = async (e) => {
      e.preventDefault();
      if (!confirm(`Видалити пресет «${b.dataset.upr}» з бібліотеки?`)) return;
      await deletePreset("synth", b.dataset.upr);
      renderDock();
    };
  });
  $("#syn-save", grp).onclick = async () => {
    const base = (inst.preset || "Мій звук").replace(/^★ /, "");
    const n = await savePreset("synth", JSON.parse(JSON.stringify(inst.params)), base + (inst.preset && !inst.preset.startsWith("★") ? " (мій)" : ""));
    if (n) {
      inst.preset = "★ " + n;
      saveMix();
      renderDock();
    }
  };
};
const _renderSampler = renderSampler;
renderSampler = async function(box, T) {
  await _renderSampler(box, T);
  if (!box.isConnected) return;
  const inst = T.m.inst, P = inst.params, sel = $("#sm-file", box);
  if (!sel) return;
  if (LIB.samples.length) {
    const og = document.createElement("optgroup");
    og.label = "Мої семпли";
    og.innerHTML = LIB.samples.map((s) => `<option value="${escapeHtml(s.file)}">${escapeHtml(s.name)}${s.root_name ? " (root " + s.root_name + ")" : ""}</option>`).join("");
    sel.prepend(og);
    sel.prepend(sel.querySelector('option[value=""]'));
    if (inst.sample) sel.value = inst.sample;
  }
  sel.addEventListener("change", () => {
    const s = LIB.samples.find((x) => x.file === sel.value);
    if (s && s.root != null) P.root = s.root;
  });
  const btn = document.createElement("button");
  btn.className = "btn ghost sm";
  btn.textContent = "Завантажити свій семпл…";
  btn.dataset.hint = "Будь-який звук з диска: нота, вокальна фраза, удар. Висота визначиться автоматично";
  btn.onclick = async () => {
    const added = await pickSamples();
    if (!added.length) return;
    pushUndo("свій семпл");
    inst.sample = added[0].id;
    if (added[0].root != null) P.root = added[0].root;
    saveMix();
    await loadInstrumentBuffers();
    renderDock();
    audition(T, P.root);
  };
  sel.after(btn);
};
const _renderDrums = renderDrums;
renderDrums = async function(box, T) {
  await _renderDrums(box, T);
  if (!box.isConnected) return;
  const inst = T.m.inst, pad = inst.pads[S.selPad];
  const host = $("#pad-ctls", box);
  if (!host || !pad) return;
  const wrap = document.createElement("div");
  wrap.className = "pad-own";
  wrap.innerHTML = `<label class="muted small">Свій звук на цей пад</label><div class="row"><select id="pad-lib" data-hint="Замінити звук пада своїм семплом (працює в будь-якому наборі)"><option value="">— звук набору —</option>${LIB.samples.map((s) => `<option value="${escapeHtml(s.file)}" ${pad.sample === s.file ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select><button class="btn ghost sm" id="pad-up" data-hint="Завантажити семпл з диска і поставити на цей пад">Завантажити…</button></div>`;
  host.after(wrap);
  const apply = async (v) => {
    pushUndo("свій звук пада");
    pad.sample = v || null;
    saveMix();
    await loadInstrumentBuffers();
    renderDock();
    const b = $(`[data-pad="${S.selPad}"]`);
    if (b) audition(T, +b.dataset.n, 0.9);
  };
  $("#pad-lib", wrap).onchange = (e) => apply(e.target.value);
  $("#pad-up", wrap).onclick = async () => {
    const added = await pickSamples();
    if (added.length) apply(added[0].id);
  };
};
const _renderFxTab = renderFxTab;
renderFxTab = function(el, T) {
  _renderFxTab(el, T);
  const rack = $(".rack", el);
  if (!rack) return;
  const row = document.createElement("div");
  row.className = "rack-own";
  row.innerHTML = `<button class="btn ghost sm" id="ch-save" data-hint="Зберегти весь ланцюжок цієї доріжки як свій пресет">Зберегти ланцюжок</button><button class="btn ghost sm" id="ch-mine" data-hint="Ваші збережені ланцюжки — додаються в кінець">Мої ланцюжки…</button>`;
  rack.appendChild(row);
  $("#ch-save", row).onclick = () => {
    if (!T.m.fx.length) return toast("Ланцюжок порожній — спершу додайте ефекти.", true);
    savePreset("chain", T.m.fx.map((f) => ({ type: f.type, on: f.on, preset: f.preset, params: JSON.parse(JSON.stringify(f.params)) })), T.name + " — мій ланцюжок");
  };
  $("#ch-mine", row).onclick = (e) => {
    const own = LIB.presets.chain || {};
    const names = Object.keys(own);
    if (!names.length) return toast("Ще немає своїх ланцюжків. Налаштуйте ефекти і натисніть «Зберегти ланцюжок».");
    menu(e, names.map((n) => [n, () => {
      pushUndo("мій ланцюжок");
      for (const f of own[n]) {
        if (!Plugins.FX[f.type]) continue;
        const nf = Plugins.newFx(f.type, null);
        nf.params = JSON.parse(JSON.stringify(f.params));
        nf.on = f.on !== false;
        nf.preset = f.preset || null;
        T.m.fx.push(nf);
      }
      S.selFx = T.m.fx.length ? T.m.fx[T.m.fx.length - 1].id : null;
      afterEdit(true);
      toast(`Додано ланцюжок «${n}».`);
    }]).concat([null, ["Керувати пресетами…", () => openLibrary("presets")]]));
  };
};
const _renderPlugin = renderPlugin;
renderPlugin = function(el, T, f) {
  _renderPlugin(el, T, f);
  const sel = $("#pl-preset", el);
  if (!sel) return;
  const own = Object.entries(LIB.presets.fx || {}).filter(([, v]) => v && v.type === f.type);
  if (own.length) {
    const og = document.createElement("optgroup");
    og.label = "Мої";
    og.innerHTML = own.map(([n]) => `<option value="u:${escapeHtml(n)}" ${f.preset === "★ " + n ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");
    sel.appendChild(og);
  }
  const orig = sel.onchange;
  sel.onchange = (e) => {
    const v = e.target.value;
    if (!v.startsWith("u:")) return orig && orig(e);
    const p = (LIB.presets.fx || {})[v.slice(2)];
    if (!p) return;
    pushUndo("мій пресет");
    f.params = JSON.parse(JSON.stringify(p.params));
    f.preset = "★ " + v.slice(2);
    afterEdit(true);
  };
  const b = document.createElement("button");
  b.className = "lh-btn";
  b.textContent = "Зберегти";
  b.dataset.hint = "Зберегти поточні налаштування цього ефекту як свій пресет";
  b.onclick = () => savePreset("fx", { type: f.type, params: JSON.parse(JSON.stringify(f.params)) }, Plugins.FX[f.type].name + " — мій").then((n) => {
    if (n) {
      f.preset = "★ " + n;
      saveMix();
      renderDock();
    }
  });
  sel.after(b);
};
function libPlay(file, btn) {
  if (libPlay.a) {
    libPlay.a.pause();
    if (libPlay.btn) libPlay.btn.classList.remove("on");
    if (libPlay.btn === btn) {
      libPlay.a = libPlay.btn = null;
      return;
    }
  }
  const a = new Audio(`/api/library/sample/${encodeURIComponent(file.replace(/^lib:/, ""))}`);
  a.volume = 0.9;
  a.play();
  a.onended = () => btn.classList.remove("on");
  btn.classList.add("on");
  libPlay.a = a;
  libPlay.btn = btn;
}
async function openLibrary(tab) {
  await loadLib();
  const modal = $("#lib-modal");
  S.libTab = tab || S.libTab || "samples";
  const body = $("#lib-body");
  const P = LIB.presets;
  const kinds = [["synth", "Звуки синтезатора"], ["fx", "Пресети ефектів"], ["chain", "Ланцюжки ефектів"]];
  body.innerHTML = `<div class="seg small lib-tabs"><button data-lt="samples" class="${S.libTab === "samples" ? "active" : ""}">Семпли (${LIB.samples.length})</button><button data-lt="presets" class="${S.libTab === "presets" ? "active" : ""}">Пресети (${kinds.reduce((a, [k]) => a + Object.keys(P[k] || {}).length, 0)})</button></div>
    ${S.libTab === "samples" ? `
      <div class="lib-drop" id="lib-drop"><b>Перетягніть сюди свої звуки</b><span>або <u>оберіть файли</u> · WAV, MP3, FLAC, OGG, AIFF</span></div>
      <p class="muted small">Бібліотека спільна для всіх проєктів. Тиша на початку обрізається, гучність вирівнюється, висота ноти визначається автоматично (root) — тож семпл одразу грає правильними нотами в семплері. Удари (бочка, клап, перкусія) ставте на пади драм-кіта.</p>
      <div class="lib-list">${LIB.samples.map((s) => `<div class="lib-row"><button class="lib-play" data-play="${escapeHtml(s.file)}" title="Послухати">▶</button><b>${escapeHtml(s.name)}</b><span class="tag">${s.kind === "note" ? "нота " + (s.root_name || "") : "удар / звук"}</span><span class="muted small">${s.dur ? s.dur.toFixed(2) + " с" : ""}</span><button class="x" data-dels="${escapeHtml(s.file)}" title="Видалити з бібліотеки">&times;</button></div>`).join("") || `<div class="empty small">Поки порожньо.</div>`}</div>` : `
      ${kinds.map(([k, l]) => `<h4 class="br-cat">${l}</h4><div class="lib-list">${Object.entries(P[k] || {}).map(([n, v]) => `<div class="lib-row"><b>${escapeHtml(n)}</b><span class="tag">${k === "fx" && v && Plugins.FX[v.type] ? escapeHtml(Plugins.FX[v.type].name) : k === "chain" ? (v || []).length + " ефект(ів)" : "синтезатор"}</span><span class="spacer"></span><button class="x" data-delp="${k}" data-n="${escapeHtml(n)}" title="Видалити">&times;</button></div>`).join("") || `<div class="empty small">Немає. ${k === "synth" ? "Зберігайте звук кнопкою «＋ Зберегти звук» у вкладці «Інструмент»." : k === "fx" ? "Кнопка «Зберегти» у заголовку будь-якого ефекту." : "Кнопка «Зберегти ланцюжок» під списком ефектів."}</div>`}</div>`).join("")}`}`;
  $$("[data-lt]", body).forEach((b) => b.onclick = () => openLibrary(b.dataset.lt));
  const dropEl = $("#lib-drop", body);
  if (dropEl) {
    dropEl.onclick = async () => {
      if (await pickSamples().then((a) => a.length)) openLibrary("samples");
    };
    dropEl.ondragover = (e) => {
      e.preventDefault();
      dropEl.classList.add("over");
    };
    dropEl.ondragleave = () => dropEl.classList.remove("over");
    dropEl.ondrop = async (e) => {
      e.preventDefault();
      dropEl.classList.remove("over");
      await uploadSamples([...e.dataTransfer.files].filter(isAudio));
      openLibrary("samples");
    };
  }
  $$("[data-play]", body).forEach((b) => b.onclick = () => libPlay(b.dataset.play, b));
  $$("[data-dels]", body).forEach((b) => b.onclick = async () => {
    const n = b.dataset.dels.replace(/^lib:/, "");
    if (!confirm(`Видалити «${n}» з бібліотеки? Доріжки, що його використовують, замовкнуть.`)) return;
    setLib(await api.del("/api/library/sample/" + encodeURIComponent(n)));
    openLibrary("samples");
  });
  $$("[data-delp]", body).forEach((b) => b.onclick = async () => {
    if (!confirm(`Видалити пресет «${b.dataset.n}»?`)) return;
    await deletePreset(b.dataset.delp, b.dataset.n);
    openLibrary("presets");
  });
  modal.hidden = false;
}
async function flushMix() {
  if (!S.pid || !S.mix) return;
  clearTimeout(_saveT);
  await fetch(`/api/project/${S.pid}/mix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S.mix) });
}
async function reloadProject() {
  const beat = S.playBeat, sel = S.sel, scroll = typeof body !== "undefined" ? body.scrollLeft : 0;
  await openProject(S.pid);
  S.playBeat = beat;
  if (sel && findT(sel)) selectTrack(sel);
  if (typeof body !== "undefined") body.scrollLeft = scroll;
  updatePos();
  draw();
}
async function openHistory() {
  const modal = $("#hist-modal"), box = $("#hist-body");
  await flushMix();
  const list = await api.get(`/api/project/${S.pid}/snapshots`).catch(() => []);
  box.innerHTML = `<div class="hist-new"><input id="hist-label" type="text" maxlength="60" placeholder="Назва знімка, напр. «Перед зведенням» або «Версія з новим басом»"><button class="btn primary sm" id="hist-save">Зберегти знімок</button></div>
    <p class="muted small">Знімок запам'ятовує весь стан редактора: кліпи, ефекти, інструменти, автоматизацію, згенеровані партії, ноти, секції й налаштування розбору. Програма також робить автозбереження кожні 10 хвилин роботи. Відновлення завжди спершу зберігає поточний стан — нічого не загубиться.</p>
    <div class="hist-list">${list.map((s) => `<div class="hist-row ${s.auto ? "auto" : ""}"><div><b>${escapeHtml(s.label)}</b><span class="muted small">${escapeHtml(s.time)}${s.auto ? " · авто" : ""}</span></div>
      <span class="muted small">${s.stats.tracks} дор. · ${s.stats.clips} кліп. · ${s.stats.fx} ефект.${s.stats.gens ? " · " + s.stats.gens + " згенер." : ""}</span>
      <button class="btn ghost sm" data-rs="${s.id}">Відновити</button><button class="x" data-ds="${s.id}" title="Видалити знімок">&times;</button></div>`).join("") || `<div class="empty small">Знімків ще немає.</div>`}</div>`;
  $("#hist-save").onclick = async () => {
    try {
      await flushMix();
      await api.post(`/api/project/${S.pid}/snapshots`, { label: $("#hist-label").value });
      toast("Знімок збережено.");
      openHistory();
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#hist-label").onkeydown = (e) => {
    if (e.key === "Enter") $("#hist-save").click();
  };
  $$("[data-rs]", box).forEach((b) => b.onclick = async () => {
    if (!confirm("Відновити цей знімок? Поточний стан збережеться як «Перед відновленням».")) return;
    stopPlay();
    await flushMix();
    await api.post(`/api/project/${S.pid}/snapshots/${b.dataset.rs}/restore`);
    modal.hidden = true;
    await reloadProject();
    toast("Знімок відновлено.");
  });
  $$("[data-ds]", box).forEach((b) => b.onclick = async () => {
    await api.del(`/api/project/${S.pid}/snapshots/${b.dataset.ds}`);
    openHistory();
  });
  modal.hidden = false;
}
async function deleteRecording(t) {
  if (!confirm(`Видалити запис «${t.name}» назавжди? Аудіо цього дубля буде стерто.`)) return;
  stopPlay();
  await flushMix();
  const r = await fetch(`/api/project/${S.pid}/track/${t.id}`, { method: "DELETE" });
  if (!r.ok) return toast("Не вдалося видалити запис.", true);
  S.B.tracks = S.B.tracks.filter((x) => x.id !== t.id);
  _tracksKey = "";
  for (const c of (S.mix.clones || []).filter((c2) => c2.of === t.id)) delete S.mix.tracks[c.id];
  S.mix.clones = (S.mix.clones || []).filter((c2) => c2.of !== t.id);
  delete S.mix.tracks[t.id];
  await flushMix();
  if (S.sel === t.id) S.sel = null;
  await reloadProject();
  toast("Запис видалено.");
}
const REC = { open: false, ctx: null, stream: null, node: null, src: null, inGain: null, an: null, det: null, monDry: null, monWet: null, strip: null, takes: [], cur: null, devices: [], opts: null, tab: "rec", sel: 0, pitch: null, trace: [], chain: null };
const REC_WORKLET = `class InkRec extends AudioWorkletProcessor{constructor(){super();this.on=false;this.port.onmessage=(e)=>{this.on=e.data}}process(i){const c=i[0];if(this.on&&c&&c.length){const L=c[0],R=c[1]||c[0],m=new Float32Array(L.length);for(let k=0;k<L.length;k++)m[k]=(L[k]+R[k])*0.5;this.port.postMessage({f:currentFrame,d:m},[m.buffer])}return true}}registerProcessor("ink-rec",InkRec);`;
const VOCAL_CHAINS = ["Автотюн: поп", "Природний живий вокал", "Hard-tune (T-Pain)", "Реп з автотюном", "Поп-вокал", "Реп-вокал", "Ефірний вокал", "Бек-вокал: хор", "Хелій", "Демон", "Робот", "Телефон / рація", "Лоу-фай вокал"];
function recOpts() {
  if (!REC.opts) {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem("inkbeat.rec") || "{}");
    } catch (e) {
    }
    REC.opts = Object.assign({ device: "", countIn: 1, metro: true, karaoke: true, monitor: "off", kind: "vocals", midi: true, latency: null, gain: 0, loop: 0, keepChain: true, chainName: "Автотюн: поп", lyricSize: 22 }, saved);
    if (REC.opts.monitor === true) REC.opts.monitor = "dry";
    if (REC.opts.monitor === false) REC.opts.monitor = "off";
  }
  return REC.opts;
}
function recSaveOpts() {
  try {
    localStorage.setItem("inkbeat.rec", JSON.stringify(REC.opts));
    localStorage.setItem("inkbeat.recchain", JSON.stringify(REC.chain || []));
  } catch (e) {
  }
}
function chainFromPreset(name) {
  const own = LIB.presets.chain || {};
  if (own[name]) return own[name].filter((f) => Plugins.FX[f.type]).map((f) => Object.assign(Plugins.newFx(f.type, null), { params: JSON.parse(JSON.stringify(f.params)), on: f.on !== false, preset: f.preset || null }));
  return (Plugins.CHAINS[name] || []).map(([t, p]) => Plugins.newFx(t, p));
}
function recChain() {
  if (!REC.chain) {
    try {
      REC.chain = JSON.parse(localStorage.getItem("inkbeat.recchain") || "null");
    } catch (e) {
      REC.chain = null;
    }
    if (!Array.isArray(REC.chain)) REC.chain = chainFromPreset(recOpts().chainName);
    REC.chain = REC.chain.filter((f) => f && Plugins.FX[f.type]);
  }
  return REC.chain;
}
function recApplyMonitor() {
  const o = recOpts();
  if (!REC.monDry) return;
  const t = REC.ctx.currentTime;
  REC.monDry.gain.setTargetAtTime(o.monitor === "dry" ? 1 : 0, t, 0.02);
  REC.monWet.gain.setTargetAtTime(o.monitor === "fx" ? 1 : 0, t, 0.02);
  REC.inGain.gain.setTargetAtTime(Math.pow(10, (o.gain || 0) / 20), t, 0.02);
}
function recRebuildChain() {
  if (REC.strip) REC.strip.setFx(recChain());
}
function recEnv() {
  return S.B ? fxEnv() : { bpm: 120, tonic: 0, mode: "major" };
}
async function recInit() {
  const o = recOpts();
  if (REC.stream) REC.stream.getTracks().forEach((t) => t.stop());
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Браузер не дає доступу до мікрофона.");
  REC.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.device ? { exact: o.device } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
  if (!REC.ctx || REC.ctx.state === "closed") {
    REC.ctx = new AudioContext({ latencyHint: "interactive" });
    await REC.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([REC_WORKLET], { type: "application/javascript" })));
    await DSP.ensureWorklets(REC.ctx);
    REC.node = null;
  }
  await REC.ctx.resume();
  if (REC.src) REC.src.disconnect();
  REC.src = REC.ctx.createMediaStreamSource(REC.stream);
  if (!REC.node) {
    const ctx = REC.ctx, sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    REC.inGain = ctx.createGain();
    REC.node = new AudioWorkletNode(ctx, "ink-rec", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    REC.node.connect(sink);
    REC.node.port.onmessage = (e) => {
      if (REC.cur) REC.cur.chunks.push(e.data);
    };
    REC.an = ctx.createAnalyser();
    REC.an.fftSize = 2048;
    const env = recEnv();
    REC.det = new AudioWorkletNode(ctx, "ink-tune", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { mode: "detect", tonic: env.tonic || 0, mask: DSP.SCALES[env.mode === "minor" ? "minor" : "major"], gate: -50 } });
    REC.det.connect(sink);
    REC.det.port.onmessage = (e) => recOnPitch(e.data);
    REC.monDry = ctx.createGain();
    REC.monWet = ctx.createGain();
    REC.monDry.connect(ctx.destination);
    REC.monWet.connect(ctx.destination);
    REC.strip = new DSP.Strip(ctx, REC.monWet, env);
    REC.strip.setVol(0, false);
    REC.inGain.connect(REC.node);
    REC.inGain.connect(REC.an);
    REC.inGain.connect(REC.det);
    REC.inGain.connect(REC.monDry);
    REC.inGain.connect(REC.strip.input);
    recRebuildChain();
  }
  REC.src.connect(REC.inGain);
  recApplyMonitor();
  REC.devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
}
function recAutoLatency() {
  const A = ensureCtx();
  const out = (A.ctx.outputLatency || 0) + (A.ctx.baseLatency || 0);
  const inp = REC.ctx ? (REC.ctx.baseLatency || 0) + 0.01 : 0.02;
  return Math.round((out + inp) * 1e3);
}
function guideTrack() {
  return tracksAll().find((t) => t.kind === "vocals" && !t.recorded && !t.clone && t.notes && t.notes.length) || null;
}
function guideNoteAt(b) {
  const t = guideTrack();
  if (!t) return null;
  const notes = arranged(t);
  let i = lowerBound(notes, b + 1e-6) - 1;
  for (let k = 0; k < 4 && i >= 0; k++, i--) if (notes[i][0] <= b && notes[i][0] + notes[i][1] >= b) return notes[i];
  return null;
}
function recOnPitch(d) {
  REC.pitch = d;
  if (!S.B || !S.playing || !S.audio) return;
  const P = period(), lag = ((recOpts().latency || 0) + 35) / 1e3;
  const b = curBeat() - lag / P;
  REC.trace.push([b, d.f]);
  if (REC.trace.length > 4e3) REC.trace.splice(0, 1e3);
  const cur = REC.cur;
  if (cur && d.f != null && b >= cur.punch) {
    const n = guideNoteAt(b);
    if (n) {
      cur.total++;
      const dd = ((d.f - n[2]) % 12 + 18) % 12 - 6;
      if (Math.abs(dd) < 0.5) cur.hits++;
    }
  }
}
async function openRecorder() {
  const pnl = $("#rec");
  if (REC.open) return closeRecorder();
  REC.open = true;
  pnl.hidden = false;
  $("#t-rec").classList.add("on");
  pnl.innerHTML = `<div class="ana-head" id="rec-drag"><b>Вокальна студія</b><span class="spacer"></span><button class="x" id="rec-x">&times;</button></div><div class="rec-wait">Підключаю мікрофон… Якщо з'явиться запит доступу — натисніть «Дозволити».</div>`;
  dragPanel(pnl, $("#rec-drag"));
  $("#rec-x").onclick = closeRecorder;
  try {
    recChain();
    await recInit();
  } catch (e) {
    pnl.querySelector(".rec-wait").innerHTML = `Мікрофон недоступний: ${escapeHtml(e.message || e.name)}.<br>Перевірте, що мікрофон підключено і в Windows дозволено доступ: Параметри → Конфіденційність → Мікрофон.`;
    return;
  }
  renderRecorder();
}
function closeRecorder() {
  if (REC.cur) recStop();
  REC.open = false;
  $("#rec").hidden = true;
  $("#t-rec").classList.remove("on");
  if (REC.stream) REC.stream.getTracks().forEach((t) => t.stop());
  REC.stream = null;
  if (REC.src) REC.src.disconnect();
  REC.src = null;
  if (REC.ctx) REC.ctx.suspend();
  recStopTake();
}
function renderRecorder() {
  const o = recOpts(), pnl = $("#rec");
  if (o.latency == null) o.latency = recAutoLatency();
  if (REC.ctx && REC.ctx.state === "suspended") REC.ctx.resume();
  const tabs = [["rec", "Запис"], ["voice", "Голос і ефекти"], ["lyr", "Текст"]];
  pnl.innerHTML = `<div class="ana-head" id="rec-drag"><b>Вокальна студія</b><div class="seg small rec-tabs">${tabs.map(([k, l]) => `<button data-rt="${k}" class="${REC.tab === k ? "active" : ""}">${l}</button>`).join("")}</div><span class="spacer"></span><button class="x" id="rec-x">&times;</button></div>
    <div class="rec-row"><select id="rec-dev" data-hint="Мікрофон або звукова карта">${REC.devices.map((d, i) => `<option value="${escapeHtml(d.deviceId)}" ${o.device === d.deviceId ? "selected" : ""}>${escapeHtml(d.label || "Мікрофон " + (i + 1))}</option>`).join("")}</select><canvas id="rec-meter" data-hint="Рівень входу. Співайте найгучнішу фразу: смужка має доходити до жовтої зони, але не до червоної"></canvas></div>
    <div class="rec-mon"><span class="muted small">Чути в навушниках:</span><div class="seg small" id="rec-mon">${[["off", "нічого"], ["dry", "чистий голос"], ["fx", "голос з ефектами"]].map(([k, l]) => `<button data-mon="${k}" class="${o.monitor === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <label class="rec-gain" data-hint="Підсилення входу. Якщо мікрофон тихий — додайте; якщо смужка червона — зменште (а краще рівень мікрофона в Windows)"><span>Вхід</span><input type="range" id="rec-gain" min="-12" max="24" step="0.5" value="${o.gain}"><b id="rec-gain-v">${o.gain > 0 ? "+" : ""}${o.gain} дБ</b></label></div>
    <div id="rec-tab"></div>`;
  dragPanel(pnl, $("#rec-drag"));
  $("#rec-x").onclick = closeRecorder;
  $$("[data-rt]", pnl).forEach((b) => b.onclick = () => {
    REC.tab = b.dataset.rt;
    renderRecorder();
  });
  $$("[data-mon]", pnl).forEach((b) => b.onclick = () => {
    o.monitor = b.dataset.mon;
    recSaveOpts();
    recApplyMonitor();
    $$("[data-mon]", pnl).forEach((x) => x.classList.toggle("active", x === b));
    if (o.monitor !== "off") toast("Тільки в навушниках! Через колонки звук потрапить у мікрофон і буде фон.");
  });
  $("#rec-gain").oninput = (e) => {
    o.gain = +e.target.value;
    $("#rec-gain-v").textContent = `${o.gain > 0 ? "+" : ""}${o.gain} дБ`;
    recApplyMonitor();
  };
  $("#rec-gain").onchange = recSaveOpts;
  $("#rec-dev").onchange = async (e) => {
    o.device = e.target.value;
    recSaveOpts();
    await recInit();
    renderRecorder();
  };
  const box = $("#rec-tab");
  if (REC.tab === "voice") renderVoiceTab(box);
  else if (REC.tab === "lyr") renderLyricsTab(box);
  else renderRecTab(box);
  if (!REC.loopOn) {
    REC.loopOn = true;
    recLoop();
  }
}
function renderRecTab(box) {
  const o = recOpts(), P = period(), bpb = S.B.timing.bpb, startBeat = S.playBeat;
  const lyr = (S.mix && S.mix.lyrics || "").trim();
  box.innerHTML = `<div class="rec-big"><button class="rec-btn ${REC.cur ? "on" : ""}" id="rec-go" data-hint="Почати запис з позиції курсору (R). Ще раз — зупинити"><i></i></button>
      <div class="rec-st"><b id="rec-state">${REC.cur ? "Іде запис" : "Готово до запису"}</b><span class="muted small" id="rec-pos">з такту ${Math.floor(startBeat / bpb) + 1} · ${mmss(startBeat * P - S.B.timing.pad)}</span><span class="muted small">Поставте курсор на таймлайні там, де почнете співати.</span></div>
      <div class="rec-tuner"><b id="rec-note">—</b><span id="rec-cents" class="muted small">тюнер</span><div class="rt-bar"><i id="rec-needle"></i></div></div></div>
    <div class="rec-guide-wrap"><canvas id="rec-guide" data-hint="Ваш голос (рожева лінія) поверх мелодії оригінального вокалу (смужки). Видно, де ви потрапляєте в ноти"></canvas><span class="rec-acc" id="rec-acc"></span></div>
    ${lyr ? `<div class="rec-lyrics" style="font-size:${o.lyricSize}px">${escapeHtml(lyr).replace(/\n/g, "<br>")}</div>` : ""}
    <div class="rec-opts">
      <label data-hint="Скільки тактів метронома прозвучить перед записом"><span>Відлік</span><select id="rec-ci">${[0, 1, 2].map((n) => `<option value="${n}" ${o.countIn === n ? "selected" : ""}>${n ? n + " такт" + (n > 1 ? "и" : "") : "без відліку"}</option>`).join("")}</select></label>
      <label data-hint="Запис по колу: фрагмент повторюється, кожне коло — окремий дубль. Зупиніть, коли вийде ідеально"><span>По колу</span><select id="rec-loop">${[0, 1, 2, 4, 8, 16].map((n) => `<option value="${n}" ${o.loop === n ? "selected" : ""}>${n ? n + " такт" + (n === 1 ? "" : n < 5 ? "и" : "ів") : "вимк."}</option>`).join("")}</select></label>
      <label data-hint="Що записуєте: від цього залежить, як програма переведе запис у ноти"><span>Що пишемо</span><select id="rec-kind"><option value="vocals" ${o.kind === "vocals" ? "selected" : ""}>Голос</option><option value="backing" ${o.kind === "backing" ? "selected" : ""}>Бек-вокал</option><option value="guitar" ${o.kind === "guitar" ? "selected" : ""}>Гітара</option><option value="piano" ${o.kind === "piano" ? "selected" : ""}>Клавішні</option><option value="bass" ${o.kind === "bass" ? "selected" : ""}>Бас</option><option value="other" ${o.kind === "other" ? "selected" : ""}>Інше</option></select></label>
      <label data-hint="Компенсація затримки звукової карти. Якщо дубль звучить пізніше за музику — збільште, якщо раніше — зменште"><span>Затримка</span><input type="number" id="rec-lat" min="0" max="500" step="1" value="${o.latency}"> мс <button class="link" id="rec-lat-auto">авто</button></label>
      <label class="chk" data-hint="Клік на кожну долю під час запису (у запис не потрапляє)"><input type="checkbox" id="rec-metro" ${o.metro ? "checked" : ""}> Метроном</label>
      <label class="chk" data-hint="Караоке: під час запису оригінальний вокал пісні вимикається"><input type="checkbox" id="rec-kar" ${o.karaoke ? "checked" : ""}> Без оригінального вокалу</label>
      <label class="chk" data-hint="Після запису перевести партію в MIDI-ноти, як інші доріжки"><input type="checkbox" id="rec-midi" ${o.midi ? "checked" : ""}> Ноти з запису</label>
      <label class="chk" data-hint="Ланцюжок з вкладки «Голос і ефекти» стане ефектами нової доріжки — їх можна далі крутити"><input type="checkbox" id="rec-keep" ${o.keepChain ? "checked" : ""}> Ефекти голосу — на доріжку</label>
    </div>
    <div class="rec-takes" id="rec-takes"></div>
    <p class="muted small rec-tip">Голос записується чистим, а автотюн та інші ефекти лишаються на доріжці як налаштування: їх можна змінити будь-коли після запису.</p>`;
  const bind = (id, key, conv) => {
    $(id).onchange = (e) => {
      o[key] = conv(e.target);
      recSaveOpts();
    };
  };
  bind("#rec-ci", "countIn", (t) => +t.value);
  bind("#rec-loop", "loop", (t) => +t.value);
  bind("#rec-kind", "kind", (t) => t.value);
  bind("#rec-metro", "metro", (t) => t.checked);
  bind("#rec-kar", "karaoke", (t) => t.checked);
  bind("#rec-midi", "midi", (t) => t.checked);
  bind("#rec-keep", "keepChain", (t) => t.checked);
  bind("#rec-lat", "latency", (t) => Math.max(0, Math.min(500, +t.value || 0)));
  $("#rec-lat-auto").onclick = () => {
    o.latency = recAutoLatency();
    recSaveOpts();
    $("#rec-lat").value = o.latency;
  };
  $("#rec-go").onclick = () => REC.cur ? recStop() : recStart();
  renderTakes();
}
function renderVoiceTab(box) {
  const o = recOpts(), chain = recChain();
  if (REC.sel >= chain.length) REC.sel = Math.max(0, chain.length - 1);
  const own = Object.keys(LIB.presets.chain || {});
  box.innerHTML = `<div class="vc-top"><label><span class="muted small">Готовий звук голосу</span><select id="vc-preset" data-hint="Готові вокальні ланцюжки: автотюн, компресія, ревер…"><option value="">— виберіть —</option><optgroup label="Вокал">${VOCAL_CHAINS.filter((n) => Plugins.CHAINS[n]).map((n) => `<option ${o.chainName === n ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}</optgroup>${own.length ? `<optgroup label="Мої">${own.map((n) => `<option value="${escapeHtml(n)}" ${o.chainName === n ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}</optgroup>` : ""}</select></label>
      <button class="btn ghost sm" id="vc-save" data-hint="Зберегти цей ланцюжок у свою бібліотеку">Зберегти</button><button class="btn ghost sm" id="vc-clear" data-hint="Прибрати всі ефекти — чистий голос">Очистити</button></div>
    <div class="vc-grid"><div class="vc-list">${chain.map((f, i) => `<div class="slot ${REC.sel === i ? "sel" : ""} ${f.on ? "" : "bypass"}" data-vi="${i}"><button class="pwr ${f.on ? "on" : ""}" data-vp="${i}" title="Увімк./вимк.">⏻</button><i style="background:${Plugins.FX[f.type].color}"></i><span>${i + 1}. ${escapeHtml(Plugins.FX[f.type].name)}</span><em>${escapeHtml(f.preset || "")}</em><button class="x" data-vx="${i}" title="Прибрати">×</button></div>`).join("") || `<div class="rack-empty">Ефектів немає — голос звучить чисто.</div>`}
      <button class="btn primary sm wide" id="vc-add">＋ Додати ефект</button></div>
      <div class="vc-edit" id="vc-edit"></div></div>
    <p class="muted small">Перемкніть «Чути в навушниках» на <b>голос з ефектами</b>, щоб співати вже з автотюном і ревером. Браузер додає 20–60 мс затримки: якщо заважає, співайте з чистим голосом, а ефекти почуєте після запису.</p>`;
  $("#vc-preset").onchange = (e) => {
    if (!e.target.value) return;
    o.chainName = e.target.value;
    REC.chain = chainFromPreset(o.chainName);
    REC.sel = 0;
    recSaveOpts();
    recRebuildChain();
    renderRecorder();
  };
  $("#vc-save").onclick = async () => {
    if (!chain.length) return toast("Ланцюжок порожній.", true);
    const n = await savePreset("chain", chain.map((f) => ({ type: f.type, on: f.on, preset: f.preset, params: JSON.parse(JSON.stringify(f.params)) })), "Мій вокал");
    if (n) {
      o.chainName = n;
      recSaveOpts();
      renderRecorder();
    }
  };
  $("#vc-clear").onclick = () => {
    REC.chain = [];
    recSaveOpts();
    recRebuildChain();
    renderRecorder();
  };
  $$("[data-vi]", box).forEach((el) => el.onclick = (e) => {
    const i = +el.dataset.vi;
    if (e.target.dataset.vp != null) {
      chain[i].on = !chain[i].on;
      recRebuildChain();
    } else if (e.target.dataset.vx != null) {
      chain.splice(i, 1);
      recRebuildChain();
    } else REC.sel = i;
    recSaveOpts();
    renderRecorder();
  });
  $("#vc-add").onclick = (e) => {
    const voice = ["tune", "harm", "deess", "pitchfx", "eq", "comp", "gate", "drive", "delay", "reverb", "chorus", "filter", "lofi", "stereo", "tremolo", "limiter"].filter((k) => Plugins.FX[k]);
    menu(e, voice.map((k) => [Plugins.FX[k].name, () => {
      chain.push(Plugins.newFx(k, Object.keys(Plugins.FX[k].presets)[0] || null));
      REC.sel = chain.length - 1;
      recRebuildChain();
      recSaveOpts();
      renderRecorder();
    }]));
  };
  const f = chain[REC.sel], ed = $("#vc-edit");
  if (!f) {
    ed.innerHTML = `<div class="plug-empty"><h4>Звук голосу під час запису</h4><p>Виберіть готовий звук угорі або додайте ефекти. Найважливіший для вокалу — <b>Автотюн</b>: він тримає голос у нотах тональності пісні.</p></div>`;
    return;
  }
  const def = Plugins.FX[f.type];
  ed.innerHTML = `<div class="plug-head"><i style="background:${def.color}"></i><b>${escapeHtml(def.name)}</b><select id="vc-fxp"><option value="">Пресет…</option>${Object.keys(def.presets).map((p) => `<option ${f.preset === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}</select></div>
    <p class="muted small">${escapeHtml(def.tips)}</p><canvas class="vis" id="vc-vis"></canvas><div class="ctls" id="vc-ctls"></div>`;
  $("#vc-fxp").onchange = (e) => {
    if (!e.target.value) return;
    const n = Plugins.newFx(f.type, e.target.value);
    f.params = n.params;
    f.preset = e.target.value;
    recRebuildChain();
    recSaveOpts();
    renderRecorder();
  };
  const idx = REC.sel;
  const visFn = Plugins.VIS[f.type];
  const node = () => REC.strip && REC.strip.nodes[idx];
  REC.vis = visFn ? () => {
    const cv = $("#vc-vis");
    if (cv) visFn(cv, f.params, f.type === "eq" ? () => {} : node(), recEnv());
  } : null;
  if (REC.vis) REC.vis();
  else $("#vc-vis").remove();
  Plugins.controls($("#vc-ctls"), def.params, f.params, (k, v, live) => {
    f.params[k] = v;
    f.preset = null;
    if (REC.strip) REC.strip.updateFx(idx, f.params);
    if (!live) recSaveOpts();
  }, def.defaults());
}
function renderLyricsTab(box) {
  const o = recOpts();
  box.innerHTML = `<p class="muted small">Вставте текст пісні — він з'явиться великим шрифтом у вкладці «Запис», як суфлер. Текст зберігається в проєкті.</p>
    <textarea id="lyr-text" class="lyr-text" placeholder="Куплет 1&#10;Перший рядок…&#10;Другий рядок…&#10;&#10;Приспів&#10;…">${escapeHtml(S.mix && S.mix.lyrics || "")}</textarea>
    <label class="rec-gain"><span>Розмір шрифту</span><input type="range" id="lyr-size" min="14" max="40" step="1" value="${o.lyricSize}"><b id="lyr-size-v">${o.lyricSize}px</b></label>`;
  let t = null;
  $("#lyr-text").oninput = (e) => {
    S.mix.lyrics = e.target.value;
    clearTimeout(t);
    t = setTimeout(saveMix, 600);
  };
  $("#lyr-size").oninput = (e) => {
    o.lyricSize = +e.target.value;
    $("#lyr-size-v").textContent = o.lyricSize + "px";
    recSaveOpts();
  };
}
function recLoop() {
  if (!REC.open) {
    REC.loopOn = false;
    return;
  }
  const cv = $("#rec-meter");
  if (cv && REC.an) {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const d = new Float32Array(REC.an.fftSize);
    REC.an.getFloatTimeDomainData(d);
    let pk = 0;
    for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    REC.peakHold = Math.max(pk, (REC.peakHold || 0) * 0.96);
    const db = 20 * Math.log10(REC.peakHold + 1e-9), x = Math.max(0, Math.min(1, (db + 60) / 60)) * w;
    c.fillStyle = "#0a0b0e";
    c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#4ade80");
    g.addColorStop(0.75, "#4ade80");
    g.addColorStop(0.85, "#ffb547");
    g.addColorStop(0.97, "#ff5d6c");
    c.fillStyle = g;
    c.fillRect(0, 2, x, h - 4);
    if (pk > 0.98) REC.clipT = performance.now();
    if (REC.clipT && performance.now() - REC.clipT < 1500) {
      c.fillStyle = "#ff5d6c";
      c.fillRect(w - 6, 0, 6, h);
    }
  }
  const nEl = $("#rec-note");
  if (nEl) {
    const p = REC.pitch;
    if (p && p.f != null) {
      const cents = Math.round((p.f - p.t) * 100);
      nEl.textContent = NOTE_NAMES[(p.t % 12 + 12) % 12] + (Math.floor(p.t / 12) - 1);
      $("#rec-cents").textContent = `${cents > 0 ? "+" : ""}${cents} ц`;
      const nd = $("#rec-needle");
      nd.style.left = 50 + Math.max(-50, Math.min(50, cents)) + "%";
      nd.style.background = Math.abs(cents) < 15 ? "#4ade80" : Math.abs(cents) < 35 ? "#ffb547" : "#ff5d6c";
    } else {
      nEl.textContent = "—";
      $("#rec-cents").textContent = "тюнер";
    }
  }
  drawGuide();
  if (REC.vis && REC.tab === "voice") REC.vis();
  requestAnimationFrame(recLoop);
}
function drawGuide() {
  const cv = $("#rec-guide");
  if (!cv || !S.B) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== w * dpr) {
    cv.width = w * dpr;
    cv.height = h * dpr;
  }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = "#0e1015";
  c.fillRect(0, 0, w, h);
  const P = period(), now = S.playing && S.audio ? curBeat() : S.playBeat, span = 6 / P, b0 = now - span * 0.4, b1 = b0 + span;
  const gt = guideTrack(), notes = gt ? arranged(gt).filter((n) => n[0] + n[1] >= b0 && n[0] <= b1) : [];
  const tr = REC.trace.filter((q) => q[0] >= b0 && q[0] <= b1 && q[1] != null);
  const ref = notes.length ? notes.map((n) => n[2]) : tr.map((q) => q[1]);
  let mid = ref.length ? ref.slice().sort((a, b) => a - b)[ref.length >> 1] : REC.pitch && REC.pitch.f != null ? REC.pitch.f : 60;
  REC.gMid = REC.gMid == null ? mid : REC.gMid + (mid - REC.gMid) * 0.05;
  const lo = REC.gMid - 8, hi = REC.gMid + 8;
  const X = (b) => (b - b0) / (b1 - b0) * w, Y = (m) => h - 6 - (m - lo) / (hi - lo) * (h - 12);
  c.strokeStyle = "#1c1f27";
  for (let m = Math.ceil(lo); m <= hi; m++) {
    c.beginPath();
    c.moveTo(0, Y(m));
    c.lineTo(w, Y(m));
    c.stroke();
    if (m % 12 === 0) {
      c.fillStyle = "#5d6374";
      c.font = "10px sans-serif";
      c.fillText("C" + (m / 12 - 1), 4, Y(m) - 2);
    }
  }
  c.fillStyle = "rgba(79,209,197,.35)";
  for (const n of notes) {
    let p = n[2];
    while (p > hi) p -= 12;
    while (p < lo) p += 12;
    c.fillRect(X(n[0]), Y(p) - 4, Math.max(3, X(n[0] + n[1]) - X(n[0])), 8);
  }
  c.strokeStyle = "#ec4899";
  c.lineWidth = 2;
  c.beginPath();
  let prev = null;
  for (const q of tr) {
    let m = q[1];
    if (gt) {
      while (m > hi + 2) m -= 12;
      while (m < lo - 2) m += 12;
    }
    const x = X(q[0]), y = Y(m);
    if (prev && q[0] - prev[0] < 0.25 && Math.abs(y - prev[1]) < h * 0.4) c.lineTo(x, y);
    else c.moveTo(x, y);
    prev = [q[0], y];
  }
  c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = "#ffb547";
  c.beginPath();
  c.moveTo(X(now), 0);
  c.lineTo(X(now), h);
  c.stroke();
  if (!gt) {
    c.fillStyle = "#5d6374";
    c.font = "11px sans-serif";
    c.fillText("Мелодії оригінального вокалу немає — показується лише ваш голос", 10, 14);
  }
  const acc = $("#rec-acc");
  if (acc) acc.textContent = REC.cur && REC.cur.total > 20 ? `влучання в ноти: ${Math.round(REC.cur.hits / REC.cur.total * 100)}%` : "";
}
async function recStart() {
  const o = recOpts();
  if (!REC.ctx || !REC.stream) await recInit();
  recStopTake();
  stopPlay();
  const A = ensureCtx();
  await A.ctx.resume();
  await REC.ctx.resume();
  const bpb = S.B.timing.bpb, punch = S.playBeat;
  const from = Math.max(0, punch - o.countIn * bpb);
  REC.saved = { metro: S.metro, mutes: {} };
  S.metro = o.metro;
  if (o.karaoke) for (const t of tracksAll()) if (t.has_audio && (t.kind === "vocals" || t.kind === "backing") && !t.recorded) {
    REC.saved.mutes[t.id] = mt(t.id).mute;
    mt(t.id).mute = true;
  }
  REC.trace = [];
  REC.cur = { chunks: [], punch, from, sr: REC.ctx.sampleRate, lat: o.latency / 1e3, hits: 0, total: 0, pass: 1 };
  REC.node.port.postMessage(true);
  recPlayFrom(REC.cur);
  const go = $("#rec-go");
  if (go) go.classList.add("on");
  $("#rec").classList.add("recording");
  recTick();
}
function recPlayFrom(cur) {
  const A = ensureCtx();
  S.playBeat = cur.from;
  play();
  cur.cA = A.ctx.currentTime;
  cur.cM = REC.ctx.currentTime;
  cur.startCtx = S.startCtx;
  cur.startBeat = S.startBeat;
}
function recTick() {
  const cur = REC.cur;
  if (!cur) return;
  const o = recOpts(), P = period(), bpb = S.B.timing.bpb, b = S.playBeat;
  if (o.loop && b >= cur.punch + o.loop * bpb) return recLoopWrap();
  const st = $("#rec-state");
  if (st) st.textContent = b < cur.punch ? `Відлік… ${Math.ceil(cur.punch - b)}` : `Іде запис${o.loop ? ` · коло ${cur.pass}` : ""} · ${mmss((b - cur.punch) * P)}`;
  requestAnimationFrame(recTick);
}
function recLoopWrap() {
  const old = REC.cur, o = recOpts(), bpb = S.B.timing.bpb;
  const nxt = { chunks: [], punch: old.punch, from: old.from, sr: old.sr, lat: old.lat, hits: 0, total: 0, pass: old.pass + 1 };
  REC.cur = nxt;
  makeTake(old, old.punch + o.loop * bpb);
  stopPlay();
  recPlayFrom(nxt);
  renderTakes();
  requestAnimationFrame(recTick);
}
function makeTake(cur, endBeat) {
  const P = period(), pad = S.B.timing.pad;
  if (!cur.chunks.length) return null;
  const f0 = cur.chunks[0].f, total = cur.chunks.reduce((a, c) => a + c.d.length, 0);
  const all = new Float32Array(total);
  let off = 0;
  for (const c of cur.chunks) {
    all.set(c.d, off);
    off += c.d.length;
  }
  const s0 = f0 / cur.sr - cur.cM + cur.cA - cur.startCtx + cur.startBeat * P - pad - cur.lat;
  const punchSec = Math.max(cur.punch * P - pad, -pad);
  const cut = Math.max(0, Math.round((punchSec - s0) * cur.sr));
  let end = all.length;
  if (endBeat != null) end = Math.min(end, Math.max(cut, Math.round((endBeat * P - pad - s0) * cur.sr)));
  const data = all.slice(Math.min(cut, all.length), end);
  if (data.length < cur.sr * 0.3) return null;
  let pk = 0;
  for (let i = 0; i < data.length; i += 4) pk = Math.max(pk, Math.abs(data[i]));
  const tk = { id: uid("tk"), n: REC.takes.length + 1, data, sr: cur.sr, start: s0 + cut / cur.sr, dur: data.length / cur.sr, peak: pk, kind: recOpts().kind, acc: cur.total > 20 ? Math.round(cur.hits / cur.total * 100) : null };
  REC.takes.push(tk);
  return tk;
}
function recStop() {
  const cur = REC.cur;
  if (!cur) return;
  REC.node.port.postMessage(false);
  REC.cur = null;
  stopPlay();
  S.metro = REC.saved.metro;
  for (const [id, m] of Object.entries(REC.saved.mutes)) if (S.mix.tracks[id]) S.mix.tracks[id].mute = m;
  applyGains();
  renderHeads();
  $("#rec").classList.remove("recording");
  const tk = makeTake(cur, recOpts().loop ? cur.punch + recOpts().loop * S.B.timing.bpb : null);
  if (!tk && !(recOpts().loop && REC.takes.length)) toast("Запис занадто короткий.", true);
  else if (tk && tk.peak < 0.03) toast("Дуже тихий запис — перевірте мікрофон або додайте «Вхід».", true);
  else if (tk && tk.peak > 0.99) toast("Запис перевантажений (кліпінг). Відсуньтесь від мікрофона або зменшіть «Вхід».", true);
  renderRecorder();
}
function takeBuffer(tk) {
  const A = ensureCtx();
  if (!tk.buf) {
    tk.buf = A.ctx.createBuffer(1, tk.data.length, tk.sr);
    tk.buf.copyToChannel(tk.data, 0);
  }
  return tk.buf;
}
function recStopTake() {
  if (REC.playing) {
    try {
      REC.playing.src.stop();
    } catch (e) {
    }
    REC.playing = null;
    if (S.playing) stopPlay();
    if (REC.savedMutes) {
      for (const [id, m] of Object.entries(REC.savedMutes)) if (S.mix.tracks[id]) S.mix.tracks[id].mute = m;
      REC.savedMutes = null;
      applyGains();
    }
  }
}
function playTake(tk, withSong) {
  const was = REC.playing && REC.playing.id === tk.id && REC.playing.song === withSong;
  recStopTake();
  if (was) return renderTakes();
  const A = ensureCtx();
  A.ctx.resume();
  const P = period(), pad = S.B.timing.pad, beat = Math.max(0, (tk.start + pad) / P - 0.5);
  stopPlay();
  S.playBeat = beat;
  let when;
  if (withSong) {
    if (recOpts().karaoke) {
      REC.savedMutes = {};
      for (const t of tracksAll()) if (t.has_audio && (t.kind === "vocals" || t.kind === "backing") && !t.recorded) {
        REC.savedMutes[t.id] = mt(t.id).mute;
        mt(t.id).mute = true;
      }
    }
    play();
    when = S.startCtx + (tk.start - (beat * P - pad));
  } else when = A.ctx.currentTime + 0.05;
  const src = A.ctx.createBufferSource();
  src.buffer = takeBuffer(tk);
  const g = A.ctx.createGain();
  g.gain.value = Math.min(4, 0.7 / Math.max(tk.peak, 0.05));
  src.connect(g).connect(A.out);
  src.start(Math.max(when, A.ctx.currentTime));
  src.onended = () => {
    if (REC.playing && REC.playing.src === src) {
      recStopTake();
      renderTakes();
    }
  };
  REC.playing = { id: tk.id, src, song: withSong };
  renderTakes();
}
function renderTakes() {
  const box = $("#rec-takes");
  if (!box) return;
  const P = period(), pad = S.B.timing.pad, bpb = S.B.timing.bpb;
  box.innerHTML = REC.takes.length ? REC.takes.map((tk) => {
    const on = REC.playing && REC.playing.id === tk.id;
    return `<div class="take"><b>Дубль ${tk.n}</b><span class="muted small">такт ${Math.floor((tk.start + pad) / P / bpb) + 1} · ${tk.dur.toFixed(1)} с${tk.acc != null ? ` · <b class="${tk.acc >= 80 ? "ok" : tk.acc >= 60 ? "mid" : "low"}">${tk.acc}% у нотах</b>` : ""}</span><canvas data-wv="${tk.id}"></canvas>
      <button class="btn ghost sm ${on && REC.playing.song ? "on" : ""}" data-pt="${tk.id}" data-s="1" data-hint="Послухати дубль разом з піснею">З піснею</button>
      <button class="btn ghost sm ${on && !REC.playing.song ? "on" : ""}" data-pt="${tk.id}" data-hint="Послухати тільки запис">Соло</button>
      <button class="btn primary sm" data-sv="${tk.id}" data-hint="Додати дубль у проєкт окремою доріжкою: її можна різати, обробляти (автотюн, шумодав), накладати ефекти й експортувати">Зберегти доріжкою</button>
      <button class="x" data-dt="${tk.id}" title="Видалити дубль">&times;</button></div>`;
  }).join("") : "";
  for (const tk of REC.takes) {
    const cv = box.querySelector(`[data-wv="${tk.id}"]`);
    if (!cv) continue;
    const dpr = devicePixelRatio || 1, w = cv.clientWidth || 120, h = cv.clientHeight || 24;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const c = cv.getContext("2d");
    c.scale(dpr, dpr);
    c.fillStyle = "#ec4899";
    const st = Math.max(1, Math.floor(tk.data.length / w)), norm = 1 / Math.max(tk.peak, 0.05);
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let j = x * st; j < (x + 1) * st && j < tk.data.length; j += 8) m = Math.max(m, Math.abs(tk.data[j]));
      const v = Math.min(1, m * norm) * h / 2;
      c.fillRect(x, h / 2 - v, 1, Math.max(1, v * 2));
    }
  }
  $$("[data-pt]", box).forEach((b) => b.onclick = () => playTake(REC.takes.find((t) => t.id === b.dataset.pt), !!b.dataset.s));
  $$("[data-dt]", box).forEach((b) => b.onclick = () => {
    recStopTake();
    REC.takes = REC.takes.filter((t) => t.id !== b.dataset.dt);
    renderTakes();
  });
  $$("[data-sv]", box).forEach((b) => b.onclick = () => saveTake(REC.takes.find((t) => t.id === b.dataset.sv), b));
}
async function saveTake(tk, btn) {
  recStopTake();
  const name = (prompt("Назва доріжки:", `${recOpts().kind === "vocals" ? "Мій вокал" : "Мій запис"} ${tk.n}`) || "").trim();
  if (!name) return;
  btn.disabled = true;
  btn.textContent = "Зберігаю…";
  const wav = DSP.encodeWav({ numberOfChannels: 1, sampleRate: tk.sr, length: tk.data.length, getChannelData: () => tk.data });
  const fd = new FormData();
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "take.wav");
  fd.append("start", String(tk.start));
  fd.append("name", name);
  fd.append("kind", tk.kind);
  fd.append("transcribe", recOpts().midi ? "1" : "0");
  try {
    await flushMix();
    const r = await fetch(`/api/project/${S.pid}/record`, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "помилка");
    let st;
    for (;;) {
      await new Promise((res) => setTimeout(res, 700));
      st = await api.get(`/api/process/${j.job}`);
      btn.textContent = recOpts().midi ? `Ноти… ${Math.round(st.progress * 100)}%` : "Зберігаю…";
      if (st.status !== "running") break;
    }
    if (st.status !== "done") throw new Error(st.error || "помилка");
    REC.takes = REC.takes.filter((t) => t.id !== tk.id);
    await reloadProject();
    const tid = st.result && st.result.track;
    const chain = recChain();
    if (tid && S.mix.tracks[tid] && recOpts().keepChain && chain.length) {
      S.mix.tracks[tid].fx = chain.map((f) => Object.assign(Plugins.newFx(f.type, null), { params: JSON.parse(JSON.stringify(f.params)), on: f.on, preset: f.preset }));
      saveMix();
      rebuildStrips();
    }
    if (tid && findT(tid)) {
      selectTrack(tid);
      S.dockTab = "fx";
      renderDock();
    }
    toast(`Доріжку «${name}» додано${recOpts().keepChain && chain.length ? " разом з ефектами голосу" : ""}. Для максимальної якості автотюну: вкладка «Обробка звуку» → Автотюн.`);
    if (REC.open) renderRecorder();
  } catch (e) {
    toast("Не вдалося зберегти: " + e.message, true);
    btn.disabled = false;
    btn.textContent = "Зберегти доріжкою";
  }
}
document.addEventListener("keydown", (e) => {
  if (S.view !== "project" || e.target.matches("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === "r" && REC.open) {
    e.preventDefault();
    e.stopImmediatePropagation();
    REC.cur ? recStop() : recStart();
  }
}, true);
function keyNameOf(tonic, mode) {
  return `${NOTE_NAMES[(tonic % 12 + 12) % 12]} ${mode === "minor" ? "minor" : "major"}`;
}
function openTempoKey() {
  const modal = $("#tk-modal"), box = $("#tk-body");
  const bpm = S.B.timing.bpm, key = S.B.key;
  const st = { bpm: Math.round(bpm * 100) / 100, semis: 0, edits: true };
  const render = () => {
    const ratio = st.bpm / bpm, nk = keyNameOf(key.tonic + st.semis, key.mode);
    const warnV = Math.abs(st.semis) > 3, warnT = ratio < 0.8 || ratio > 1.25;
    box.innerHTML = `<p class="muted">Створюється <b>новий проєкт</b> — поточний залишиться без змін. Усі доріжки перераховуються у високій якості, після чого заново визначаються ноти, акорди і сітка під новий темп.</p>
      <div class="tk-grid">
        <div class="tk-card"><h5>Темп</h5><div class="tk-now">зараз <b>${bpm.toFixed(2)} BPM</b></div>
          <div class="tk-ctl"><button class="btn ghost sm" data-b="-5">−5</button><button class="btn ghost sm" data-b="-1">−1</button><input type="number" id="tk-bpm" step="0.1" min="${(bpm * 0.6).toFixed(1)}" max="${(bpm * 1.6).toFixed(1)}" value="${st.bpm}"><button class="btn ghost sm" data-b="1">+1</button><button class="btn ghost sm" data-b="5">+5</button></div>
          <input type="range" id="tk-bpm-r" min="${Math.round(bpm * 0.6)}" max="${Math.round(bpm * 1.6)}" step="0.1" value="${st.bpm}">
          <div class="tk-res">${ratio === 1 ? "без змін" : `${ratio > 1 ? "швидше" : "повільніше"} на ${Math.abs((ratio - 1) * 100).toFixed(1)}% · довжина ${mmss(S.B.project.duration / ratio)}`}</div>
          <div class="tk-quick">${[["½ (half-time)", bpm / 2], ["×2 (double)", bpm * 2]].filter(([, v]) => v >= bpm * 0.6 && v <= bpm * 1.6).map(([l, v]) => `<button class="chip" data-set="${v.toFixed(2)}">${l}</button>`).join("")}${[90, 100, 120, 128, 140].filter((v) => v >= bpm * 0.6 && v <= bpm * 1.6).map((v) => `<button class="chip" data-set="${v}">${v}</button>`).join("")}</div>
          ${warnT ? `<p class="warn small">Зміна більш як на 20–25% помітно змінює характер звуку барабанів і вокалу.</p>` : ""}</div>
        <div class="tk-card"><h5>Тональність</h5><div class="tk-now">зараз <b>${escapeHtml(key.name)}</b></div>
          <div class="tk-keys">${Array.from({ length: 12 }, (_, i) => i - 5).map((s) => `<button class="chip ${st.semis === s ? "active" : ""} ${s === 0 ? "cur" : ""}" data-s="${s}" title="${s > 0 ? "+" : ""}${s} пт">${escapeHtml(keyNameOf(key.tonic + s, key.mode).replace(" major", "").replace(" minor", "m"))}</button>`).join("")}</div>
          <div class="tk-res">${st.semis ? `${st.semis > 0 ? "вище" : "нижче"} на ${Math.abs(st.semis)} пт → <b>${escapeHtml(nk)}</b>` : "без змін"}</div>
          <p class="muted small">Барабани висоту не змінюють — тільки мелодичні доріжки й вокал. Типова задача: підігнати пісню під свій голос (зазвичай ±1–3 півтони).</p>
          ${warnV ? `<p class="warn small">Більше ніж ±3 півтони — голос може звучати неприродно («мультяшно» або глухо).</p>` : ""}</div>
      </div>
      <label class="chk"><input type="checkbox" id="tk-edits" ${st.edits ? "checked" : ""}> Брати оброблені версії доріжок (шумодав, автотюн тощо), якщо є</label>
      <div class="modal-actions"><span class="muted small">Займе кілька хвилин — приблизно як звичайний розбір без розділення.</span><button class="btn ghost" data-close2>Скасувати</button><button class="btn primary" id="tk-go" ${ratio === 1 && !st.semis ? "disabled" : ""}>Створити версію</button></div>`;
    const setBpm = (v) => {
      st.bpm = Math.max(bpm * 0.6, Math.min(bpm * 1.6, Math.round(v * 100) / 100));
      render();
    };
    $$("[data-b]", box).forEach((b) => b.onclick = () => setBpm(st.bpm + +b.dataset.b));
    $$("[data-set]", box).forEach((b) => b.onclick = () => setBpm(+b.dataset.set));
    $("#tk-bpm").onchange = (e) => setBpm(+e.target.value || bpm);
    $("#tk-bpm-r").oninput = (e) => {
      st.bpm = +e.target.value;
      $("#tk-bpm").value = st.bpm;
    };
    $("#tk-bpm-r").onchange = () => render();
    $$("[data-s]", box).forEach((b) => b.onclick = () => {
      st.semis = +b.dataset.s;
      render();
    });
    $("#tk-edits").onchange = (e) => st.edits = e.target.checked;
    box.querySelector("[data-close2]").onclick = () => modal.hidden = true;
    $("#tk-go").onclick = async () => {
      try {
        await flushMix();
        const j = await api.post(`/api/project/${S.pid}/transform`, { bpm: st.bpm, semis: st.semis, key_name: st.semis ? nk : "", use_edits: st.edits });
        modal.hidden = true;
        const title = [S.B.project.title, Math.abs(st.bpm - bpm) > 0.05 ? st.bpm + " BPM" : "", st.semis ? nk : ""].filter(Boolean).join(" - ");
        const prevMode = S.mode;
        S.mode = "stems";
        startJob(j.job_id, title);
        S.mode = prevMode;
        const li = document.createElement("li");
        li.dataset.s = "Зміна темпу і тональності";
        li.innerHTML = "<i></i><span>Зміна темпу і тональності</span>";
        $("#stages").prepend(li);
      } catch (e) {
        toast(e.message, true);
      }
    };
  };
  render();
  modal.hidden = false;
}
(function batchUI() {
  const go = $("#go-btn");
  if (!go) return;
  const lab = document.createElement("label");
  lab.className = "batch-opt";
  lab.hidden = true;
  lab.dataset.hint = "Кожен файл розбирається як окрема пісня і стає окремим проєктом. Файли обробляються по черзі — можна піти пити чай";
  lab.innerHTML = `<input type="checkbox" id="batch-chk"> Це різні пісні — розібрати кожну окремо`;
  $("#filelist").after(lab);
  const _rf = renderFiles;
  renderFiles = function() {
    _rf();
    lab.hidden = S.files.length < 2;
    go.lastChild.textContent = $("#batch-chk").checked && S.files.length > 1 ? ` Розібрати ${S.files.length} пісні` : " Розібрати";
  };
  $("#batch-chk").onchange = () => renderFiles();
  $(".options").addEventListener("click", (e) => {
    if (!e.target.closest("#go-btn") || !$("#batch-chk").checked || S.files.length < 2) return;
    e.stopPropagation();
    e.preventDefault();
    batchUpload();
  }, true);
})();
function batchUpload() {
  const fd = new FormData();
  S.files.forEach((f) => fd.append("files", f, f.name));
  fd.append("mode", "mix");
  fd.append("batch", "1");
  fd.append("model", S.model);
  const bar = $("#upload-bar");
  bar.hidden = false;
  $("#go-btn").disabled = true;
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const p = e.loaded / e.total;
    bar.firstElementChild.style.width = p * 100 + "%";
    bar.lastElementChild.textContent = `Завантаження ${(p * 100).toFixed(0)}%`;
  };
  xhr.onload = () => {
    bar.hidden = true;
    $("#go-btn").disabled = false;
    if (xhr.status !== 200) return toast("Помилка завантаження: " + xhr.responseText.slice(0, 200), true);
    const j = JSON.parse(xhr.responseText);
    S.files = [];
    $("#batch-chk").checked = false;
    renderFiles();
    openBatch(j.batch);
  };
  xhr.onerror = () => {
    bar.hidden = true;
    $("#go-btn").disabled = false;
    toast("Не вдалося зв'язатися з програмою.", true);
  };
  xhr.send(fd);
}
async function openBatch(bid) {
  const modal = $("#batch-modal"), box = $("#batch-body");
  S.batch = bid;
  modal.hidden = false;
  const poll = async () => {
    if (modal.hidden || S.batch !== bid) return;
    const list = await api.get("/api/jobs?batch=" + bid).catch(() => null);
    if (!list) return setTimeout(poll, 1500);
    const done = list.filter((j) => j.status === "done").length;
    const pct = list.reduce((a, j) => a + (j.status === "done" ? 1 : j.progress || 0), 0) / Math.max(1, list.length);
    box.innerHTML = `<div class="batch-sum"><b>${done} з ${list.length} готово</b><div class="bar"><div style="width:${pct * 100}%"></div></div></div>
      <p class="muted small">Пісні обробляються по черзі. Вікно можна закрити — робота триває, готові проєкти з'являться в розділі «Проєкти».</p>
      <div class="batch-list">${list.map((j) => `<div class="batch-row ${j.status}"><div><b>${escapeHtml(j.title || "Пісня")}</b><span class="muted small">${j.status === "queued" ? "у черзі" : j.status === "running" ? escapeHtml(j.stage || "…") : j.status === "done" ? "готово" : j.status === "cancelled" ? "скасовано" : "помилка: " + escapeHtml(j.error || "")}</span></div>
        <div class="bar"><div style="width:${(j.status === "done" ? 1 : j.progress || 0) * 100}%"></div></div>
        ${j.status === "done" ? `<button class="btn primary sm" data-op="${j.project_id}">Відкрити</button>` : j.status === "queued" || j.status === "running" ? `<button class="btn ghost sm" data-cj="${j.id}">Скасувати</button>` : "<span></span>"}</div>`).join("")}</div>
      <div class="modal-actions"><button class="btn ghost" id="batch-projects">Усі проєкти</button></div>`;
    $$("[data-op]", box).forEach((b) => b.onclick = () => {
      modal.hidden = true;
      openProject(b.dataset.op);
    });
    $$("[data-cj]", box).forEach((b) => b.onclick = () => api.post(`/api/job/${b.dataset.cj}/cancel`));
    $("#batch-projects").onclick = () => {
      modal.hidden = true;
      show("projects");
    };
    if (list.some((j) => j.status === "queued" || j.status === "running")) setTimeout(poll, 1200);
    else toast(`Пакетна обробка завершена: ${done} з ${list.length}.`);
  };
  poll();
}
$("#t-rec").onclick = () => openRecorder();
$("#t-tk").onclick = () => openTempoKey();
$("#t-lib").onclick = () => openLibrary();
$("#t-hist").onclick = () => openHistory();
