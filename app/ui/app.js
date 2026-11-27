"use strict";
const DK = { root: null, cur: null };
const $ = (s, el) => el ? el.querySelector(s) : (DK.root && DK.root.querySelector(s)) || document.querySelector(s);
const $$ = (s, el) => {
  if (el) return [...el.querySelectorAll(s)];
  if (DK.root) {
    const r = DK.root.querySelectorAll(s);
    if (r.length) return [...r];
  }
  return [...document.querySelectorAll(s)];
};
const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const DRUM_ROWS = [[49, 51, 57], [42, 44, 46], [45, 47, 48, 50], [38, 39, 40], [36]];
const DRUM_LABELS = ["Тар.", "Хет", "Томи", "Малий", "Бочка"];
const STAGES = [
  "Завантаження аудіо",
  "Розділення на доріжки",
  "Темп, сітка і сильні долі",
  "Тональність і акорди",
  "Структура пісні",
  "Переведення доріжок у ноти",
  "Збирання MIDI-проєкту"
];
const ROLE_UA = {
  lead: "мелодія, моно",
  bass: "бас, моно",
  keys: "клавішні",
  guitar: "гітара",
  pad: "пед / акорди",
  mono_inst: "соло-інструмент",
  poly: "поліфонія",
  drums: "барабани",
  skip: "лише аудіо"
};
const api = {
  async get(u) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(u, body2) {
    const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body2 || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
  async del(u) {
    const r = await fetch(u, { method: "DELETE" });
    return r.json();
  }
};
function toast(msg, err = false, action = null) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.className = "toast-act";
    b.textContent = action[0];
    b.onclick = () => {
      t.remove();
      action[1]();
    };
    t.appendChild(b);
  }
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), action ? 9e3 : err ? 7e3 : 3500);
}
function inkConfirm(title, html, okLabel = "Так", danger = false) {
  return new Promise((resolve) => {
    let m = document.getElementById("ink-confirm");
    if (!m) {
      m = document.createElement("div");
      m.className = "modal";
      m.id = "ink-confirm";
      document.body.appendChild(m);
    }
    m.innerHTML = `<div class="modal-card" style="width:min(480px,92vw)"><div class="modal-head"><h3></h3><button class="x" data-k="no">&times;</button></div>
      <div class="modal-body"><div class="ic-text"></div><div class="modal-actions"><button class="btn ghost" data-k="no">Скасувати</button><button class="btn ${danger ? "danger" : "primary"}" data-k="yes"></button></div></div></div>`;
    m.querySelector("h3").textContent = title;
    m.querySelector(".ic-text").innerHTML = html;
    m.querySelector('[data-k="yes"]').textContent = okLabel;
    const done = (v) => {
      m.hidden = true;
      document.removeEventListener("keydown", key, true);
      resolve(v);
    };
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(false); }
      if (e.key === "Enter") { e.stopPropagation(); done(true); }
    };
    m.onclick = (e) => {
      const k = e.target.dataset.k || (e.target === m ? "no" : "");
      if (k) done(k === "yes");
    };
    document.addEventListener("keydown", key, true);
    m.hidden = false;
    m.querySelector('[data-k="yes"]').focus();
  });
}
const fmtTime = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const fmtSize = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(0) + " KB";
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const S = {
  view: "home",
  mode: "mix",
  model: "6",
  files: [],
  system: null,
  job: null,
  pid: null,
  B: null,
  sel: null,
  ppb: 22,
  laneH: {},
  ui: {},
  listen: "audio",
  audio: null,
  playing: false,
  playBeat: 0,
  startCtx: 0,
  startBeat: 0,
  metro: false,
  vol: 0.8
};
function show(view) {
  S.view = view;
  for (const v of ["home", "job", "projects", "project"]) $("#view-" + v).hidden = v !== view;
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
  if (view !== "project" && typeof stopPlay === "function") stopPlay();
  if (view === "projects") loadProjects();
}
$$("[data-go]").forEach((el) => el.addEventListener("click", () => show(el.dataset.go)));
async function loadSystem() {
  try {
    const s = await api.get("/api/system");
    S.system = s;
    const chip = $("#sys-chip");
    chip.textContent = s.device === "cuda" ? `GPU · ${s.gpu || "CUDA"}` : s.device === "mps" ? "GPU · Apple" : "CPU";
    chip.className = "sys " + (s.device === "cuda" || s.device === "mps" ? "gpu" : "cpu");
    chip.title = s.device === "cuda" || s.device === "mps" ? "Розділення працює на відеокарті — швидко" : "Розділення працює на процесорі. Пісня 3–4 хв займе приблизно 2–6 хвилин.";
    if (!s.separator) {
      chip.classList.add("bad");
      chip.title = "Модуль розділення не встановлено — працює лише режим стемів";
    }
    $("#ws-path").textContent = s.workspace;
  } catch (e) {
    $("#sys-chip").textContent = "offline";
  }
}
const STEM_RULES = [
  [/back(ing)?[\s_-]*vo|bvox|bgv|бек|бэк/i, "Бек-вокал", "#fb7185"],
  [/vocal|vox|voice|sing|вокал|голос/i, "Вокал", "#f43f5e"],
  [/perc|shaker|conga|bongo|tamb|перкус/i, "Перкусія", "#fbbf24"],
  [/drum|kick|snare|hat|beat|барабан|ударн/i, "Барабани", "#f59e0b"],
  [/bass|808|бас/i, "Бас", "#8b5cf6"],
  [/guitar|gtr|гітар|гитар/i, "Гітара", "#22c55e"],
  [/piano|keys|keyboard|rhodes|organ|клавіш|клавиш|піаніно|пианино/i, "Клавішні", "#3b82f6"],
  [/synth|lead|arp|pluck|синт/i, "Синт", "#06b6d4"],
  [/string|violin|cello|viola|orchestr|струн|скрип/i, "Струнні", "#14b8a6"],
  [/brass|trumpet|horn|trombone|sax|труб/i, "Духові", "#eab308"],
  [/wood|flute|clarinet|oboe|флейт/i, "Дерев'яні дух.", "#84cc16"],
  [/\bpad\b|atmos|ambient/i, "Пед", "#6366f1"],
  [/\bfx\b|sfx|effect|noise|riser/i, "FX (лише аудіо)", "#64748b"]
];
const roleOf = (n) => {
  for (const [re, l, c] of STEM_RULES) if (re.test(n)) return [l, c];
  return ["Інше / мелодія", "#06b6d4"];
};
const isAudio = (f) => /\.(wav|mp3|flac|ogg|m4a|aac|aif|aiff|opus)$/i.test(f.name);
function setMode(m) {
  S.mode = m;
  $$(".mode-card").forEach((c) => c.classList.toggle("active", c.dataset.mode === m));
  $("#model-field").style.visibility = m === "mix" ? "visible" : "hidden";
  $("#drop-title").textContent = m === "mix" ? "Перетягніть пісню сюди" : "Перетягніть стеми або папку зі стемами";
  $("#drop-sub").innerHTML = m === "mix" ? "або <u>оберіть файл</u> · WAV, MP3, FLAC, OGG, M4A" : "Vocals, Drums, Bass, Guitar, Keys… — ролі визначаються за назвою файлу";
  $("#drop-actions").hidden = m !== "stems";
  if (m === "mix" && S.files.length > 1) S.files = S.files.slice(0, 1);
  renderFiles();
}
$$(".mode-card[data-mode]").forEach((c) => c.addEventListener("click", () => setMode(c.dataset.mode)));
$$("#model-seg button").forEach((b) => b.addEventListener("click", () => {
  S.model = b.dataset.model;
  $$("#model-seg button").forEach((x) => x.classList.toggle("active", x === b));
}));
function addFiles(list) {
  const arr = [...list].filter(isAudio);
  if (!arr.length) {
    toast("Не знайшов аудіофайлів у виборі.", true);
    return;
  }
  if (S.mode === "mix") {
    if (arr.length > 1) {
      setMode("stems");
      S.files = arr;
      toast("Кілька файлів — перемкнув на режим стемів.");
    } else S.files = arr;
  } else {
    const names = new Set(S.files.map((f) => f.name + f.size));
    S.files = S.files.concat(arr.filter((f) => !names.has(f.name + f.size)));
  }
  renderFiles();
}
function renderFiles() {
  const box = $("#filelist");
  box.hidden = !S.files.length;
  box.innerHTML = "";
  S.files.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "file-row";
    let chip = "";
    if (S.mode === "stems") {
      const [l, c] = roleOf(f.name);
      chip = `<span class="role-chip" style="color:${c};border-color:${c}55">${l}</span>`;
    }
    row.innerHTML = `<span class="fn">${escapeHtml(f.webkitRelativePath || f.name)}</span>${chip}<span class="sz">${fmtSize(f.size)}</span><button class="rm" title="Прибрати">&times;</button>`;
    row.querySelector(".rm").onclick = (e) => {
      e.preventDefault();
      S.files.splice(i, 1);
      renderFiles();
    };
    box.appendChild(row);
  });
  $("#go-btn").disabled = !S.files.length;
  if (S.files.length && !$("#title-input").value) {
    const f = S.files[0];
    $("#title-input").placeholder = S.mode === "stems" && f.webkitRelativePath ? f.webkitRelativePath.split("/")[0] : f.name.replace(/\.[^.]+$/, "");
  }
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const drop = $("#drop");
drop.addEventListener("click", (e) => {
  if (e.target.closest("button") || e.target.tagName === "INPUT") return;
  e.preventDefault();
  if (DESK.on) return homePick(S.mode === "mix" ? "mix" : "files");
  (S.mode === "mix" ? $("#file-input") : $("#files-input")).click();
});
$("#pick-files").onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (DESK.on) return homePick("files");
  $("#files-input").click();
};
$("#pick-folder").onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (DESK.on) return homePick("folder");
  $("#folder-input").click();
};
async function homePick(kind) {
  const p = await deskPaths(() => kind === "folder" ? DESK.api.open_folder() : DESK.api.open_audio(kind !== "mix"));
  if (p === null) return $(kind === "folder" ? "#folder-input" : kind === "mix" ? "#file-input" : "#files-input").click();
  if (!p.length) return;
  let paths = p;
  if (kind === "folder") {
    const j = await api.get("/api/localdir?path=" + encodeURIComponent(p[0])).catch(() => ({ files: [] }));
    paths = j.files || [];
    if (!paths.length) return toast("У цій папці немає аудіофайлів.", true);
    setMode("stems");
  }
  const files = [];
  toast(paths.length > 1 ? `Додаю ${paths.length} файлів…` : "Додаю файл…");
  for (const x of paths) {
    const r = await fetch("/api/localfile?path=" + encodeURIComponent(x));
    if (!r.ok) continue;
    files.push(new File([await r.blob()], x.split(/[\\/]/).pop()));
  }
  addFiles(files);
}
for (const id of ["#file-input", "#files-input", "#folder-input"]) $(id).addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault();
  drop.classList.add("over");
}));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault();
  drop.classList.remove("over");
}));
drop.addEventListener("drop", async (e) => {
  const items = [...e.dataTransfer.items || []];
  const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.some((en) => en.isDirectory)) {
    const files = [];
    const walk = (en) => new Promise((res) => {
      if (en.isFile) en.file((f) => {
        files.push(f);
        res();
      });
      else en.createReader().readEntries(async (ents) => {
        for (const x of ents) await walk(x);
        res();
      });
    });
    for (const en of entries) await walk(en);
    if (S.mode === "mix" && files.filter(isAudio).length > 1) setMode("stems");
    addFiles(files);
  } else addFiles(e.dataTransfer.files);
});
(function dropWave() {
  const cv = $("#drop-wave"), ctx = cv.getContext("2d");
  let t = 0;
  function frame() {
    if (S.view === "home") {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const n = Math.floor(w / 6);
      for (let i = 0; i < n; i++) {
        const x = i * 6 + 3;
        const a = Math.abs(Math.sin(i * 0.21 + t) * Math.sin(i * 0.047 - t * 0.6)) * 0.8 + 0.05;
        const hh = a * h * 0.42;
        ctx.fillStyle = i % 9 === 0 ? "rgba(79,209,197,.35)" : "rgba(255,181,71,.16)";
        ctx.fillRect(x - 1, h / 2 - hh, 2, hh * 2);
      }
      t += 0.012;
    }
    requestAnimationFrame(frame);
  }
  frame();
})();
$("#go-btn").addEventListener("click", startUpload);
function startUpload() {
  if (!S.files.length) return;
  const fd = new FormData();
  S.files.forEach((f) => fd.append("files", f, f.webkitRelativePath || f.name));
  fd.append("mode", S.mode);
  fd.append("model", S.model);
  fd.append("title", $("#title-input").value.trim());
  const bar = $("#upload-bar");
  bar.hidden = false;
  $("#go-btn").disabled = true;
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const p = e.loaded / e.total;
      bar.firstElementChild.style.width = p * 100 + "%";
      bar.lastElementChild.textContent = `Завантаження ${(p * 100).toFixed(0)}%`;
    }
  };
  xhr.onload = () => {
    bar.hidden = true;
    $("#go-btn").disabled = false;
    if (xhr.status !== 200) {
      toast("Помилка завантаження: " + xhr.responseText.slice(0, 200), true);
      return;
    }
    const j = JSON.parse(xhr.responseText);
    startJob(j.job_id, $("#title-input").value.trim() || $("#title-input").placeholder);
  };
  xhr.onerror = () => {
    bar.hidden = true;
    $("#go-btn").disabled = false;
    toast("Не вдалося зв'язатися з програмою.", true);
  };
  xhr.send(fd);
}
$("#path-go").addEventListener("click", async () => {
  const p = $("#path-input").value.trim();
  if (!p) return;
  try {
    const j = await api.post("/api/analyze_path", { paths: [p], mode: S.mode === "mix" ? "auto" : "stems", model: S.model, title: $("#title-input").value.trim() });
    startJob(j.job_id, $("#title-input").value.trim() || p.split(/[\\/]/).pop());
  } catch (e) {
    toast(e.message, true);
  }
});
function startJob(id, title) {
  S.job = id;
  $("#job-title").textContent = title || "Пісня";
  $("#stages").innerHTML = STAGES.filter((s) => S.mode === "mix" || !s.includes("Розділення")).map((s) => `<li data-s="${s}"><i></i><span>${s}</span></li>`).join("");
  $("#job-log").textContent = "";
  setRing(0);
  show("job");
  pollJob();
}
function setRing(p) {
  $("#ring-fg").style.strokeDashoffset = String(326.7 * (1 - p));
  $("#job-pct").textContent = Math.floor(p * 100) + "%";
}
async function pollJob() {
  if (S.view !== "job" || !S.job) return;
  let j;
  try {
    j = await api.get("/api/job/" + S.job);
  } catch (e) {
    setTimeout(pollJob, 1500);
    return;
  }
  setRing(j.progress);
  const lis = $$("#stages li");
  const idx = lis.findIndex((li) => li.dataset.s === j.stage);
  lis.forEach((li, i) => {
    li.className = j.status === "done" ? "done" : i < idx ? "done" : i === idx ? "now" : "";
  });
  const eta = j.progress > 0.04 && j.status === "running" ? j.elapsed / j.progress * (1 - j.progress) : null;
  $("#job-eta").textContent = j.status === "queued" ? "у черзі" : eta != null ? `≈ ${fmtTime(eta)} залишилось` : fmtTime(j.elapsed);
  const log = $("#job-log");
  log.textContent = j.log.join("\n");
  log.scrollTop = log.scrollHeight;
  if (j.status === "done") {
    toast("Готово! Відкриваю проєкт.");
    setTimeout(() => openProject(j.project_id), 500);
    return;
  }
  if (j.status === "error") {
    toast(j.error || "Помилка", true);
    $("#job-eta").textContent = "помилка";
    return;
  }
  if (j.status === "cancelled") {
    toast("Скасовано.");
    show("home");
    return;
  }
  setTimeout(pollJob, 600);
}
$("#job-cancel").addEventListener("click", async () => {
  if (S.job) await api.post(`/api/job/${S.job}/cancel`);
});
async function loadProjects() {
  const box = $("#project-cards");
  const list = await api.get("/api/projects").catch(() => []);
  if (!list.length) {
    box.innerHTML = `<div class="empty">Ще немає проєктів. Почніть з «Новий розбір».</div>`;
    return;
  }
  box.innerHTML = "";
  for (const p of list) {
    const c = document.createElement("div");
    c.className = "pcard";
    c.innerHTML = `<h4>${escapeHtml(p.title)}</h4><div class="meta">${p.created} · ${fmtTime(p.duration)}</div>
      <div class="stats"><span>${p.bpm.toFixed(1)} BPM</span><span>${escapeHtml(p.key)}</span><span>${p.tracks} дор.</span></div>
      <button class="del" title="Видалити"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    c.onclick = () => openProject(p.id);
    c.querySelector(".del").onclick = async (e) => {
      e.stopPropagation();
      if (!await inkConfirm("Підтвердження", "<p>" + escapeHtml(`Видалити проєкт «${p.title}» разом зі стемами?`) + "</p>", "Видалити", true)) return;
      await api.del("/api/project/" + p.id);
      loadProjects();
    };
    box.appendChild(c);
  }
}
async function openProject(pid) {
  stopPlay();
  S.pid = pid;
  S.sel = null;
  S.ui = {};
  S.laneH = {};
  S.kit = null;
  if (S.audio) {
    S.audio.buffers = {};
    S.audio.peaks = {};
    S.audio.ibuf = new Map();
  }
  const B = await api.get(`/api/project/${pid}`);
  S.mix = await api.get(`/api/project/${pid}/mix`).catch(() => null);
  S.undo = [];
  S.redo = [];
  S.selClips = new Set();
  S.B = B;
  S.playBeat = 0;
  show("project");
  $("#dl-midi").href = `/api/project/${pid}/midi`;
  fillKeySelect();
  renderEditor();
  loadAudio();
}
function fillKeySelect() {
  const sel = $("#s-key");
  if (sel.options.length) return;
  for (const mode of ["major", "minor"]) for (let t = 0; t < 12; t++) {
    const o = document.createElement("option");
    o.value = `${t}|${mode}`;
    o.textContent = `${NOTE_NAMES[t]} ${mode === "major" ? "мажор" : "мінор"}`;
    sel.appendChild(o);
  }
  const ps = $("#tf-prog");
  GM_NAMES.forEach((n, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${i + 1}. ${n}`;
    ps.appendChild(o);
  });
}
const keyUa = (k) => `${NOTE_NAMES[k.tonic]} ${k.mode === "major" ? "maj" : "min"}`;
function renderEditor() {
  const B = S.B, tm = B.timing, st = B.settings;
  $("#ed-title").textContent = B.project.title;
  $("#ro-bpm").textContent = tm.bpm.toFixed(tm.bpm % 1 ? 2 : 0);
  $("#ro-key").textContent = keyUa(B.key);
  $("#ro-sig").textContent = tm.bpb === 6 ? "6/8" : `${tm.bpb}/4`;
  $("#ro-len").textContent = fmtTime(B.project.duration);
  $("#s-bpm").value = tm.bpm.toFixed(2);
  $("#s-bpm-hint").textContent = `визначено: ${tm.detected_bpm.toFixed(2)} BPM · впевненість ${Math.round(B.confidence.tempo * 100)}%`;
  $$("#s-sig button").forEach((b) => b.classList.toggle("active", +b.dataset.sig === tm.bpb));
  $("#s-db").textContent = String(tm.downbeat_phase + 1);
  $("#s-off").value = st.beat_offset_ms || 0;
  $("#s-off-val").textContent = `${Math.round(st.beat_offset_ms || 0)} мс`;
  $("#s-align").checked = st.align_to_bar !== false;
  $("#s-grid").value = st.grid;
  $("#s-q").value = Math.round(st.quantize * 100);
  $("#s-q-val").textContent = Math.round(st.quantize * 100) + "%";
  $("#s-qends").checked = !!st.quantize_ends;
  $("#s-key").value = `${B.key.tonic}|${B.key.mode}`;
  $("#s-key-hint").textContent = B.key.manual ? `визначено: ${B.detected_key.name}` : B.detected_key.alternatives ? `інші варіанти: ${B.detected_key.alternatives.join(", ")}` : "";
  $("#s-snap").checked = !!st.scale_snap;
  $("#s-chords").checked = st.chords_track === true;
  $("#s-split").checked = st.split_drums !== false;
  for (const t of B.tracks) if (!S.ui[t.id]) S.ui[t.id] = { mute: false, solo: false, src: t.has_audio ? null : "midi" };
  syncMix();
  renderHeads();
  renderTrackForm();
  renderDock();
  layout();
  draw();
}
function selectTrack(id) {
  S.sel = id || null;
  onSelectTrack();
  if (S.sel && $("#tab-sound").hidden) switchTab("track");
  else if (!$("#tab-sound").hidden) renderSound();
  renderHeads();
  renderTrackForm();
  layout();
  draw();
}
const cvTop = $("#cv-top"), cvBody = $("#cv-body"), body = $("#tl-body"), lanesBox = $("#tl-lanes");
function layout() {
  if (!S.B) return;
  const dpr = devicePixelRatio || 1;
  const totalH = tracksAll().reduce((a, t) => a + laneHeight(t), 0);
  const w = body.clientWidth, endB = arrEnd() + 8;
  $("#tl-spacer").style.width = endB * S.ppb + "px";
  body.style.height = totalH + "px";
  cvBody.style.width = w + "px";
  cvBody.style.height = totalH + "px";
  cvBody.width = w * dpr;
  cvBody.height = totalH * dpr;
  cvBody.style.marginBottom = -totalH + "px";
  const tw = $(".tl-top").clientWidth, th = $(".tl-top").clientHeight;
  cvTop.style.width = tw + "px";
  cvTop.style.height = th + "px";
  cvTop.width = tw * dpr;
  cvTop.height = th * dpr;
}
window.addEventListener("resize", () => {
  layout();
  draw();
});
body.addEventListener("scroll", () => draw());
const scrollBeat = () => body.scrollLeft / S.ppb;
const beatToX = (b) => (b - scrollBeat()) * S.ppb;
function gridStep() {
  if (S.ppb > 90) return 0.25;
  if (S.ppb > 40) return 0.5;
  if (S.ppb > 14) return 1;
  return S.B.timing.bpb;
}
function draw() {
  if (!S.B || S.view !== "project") return;
  drawTop();
  drawBody();
}
function drawTop() {
  const B = S.B, tm = B.timing, ctx = cvTop.getContext("2d"), dpr = devicePixelRatio || 1;
  const w = cvTop.width / dpr, h = cvTop.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0e1014";
  ctx.fillRect(0, 0, w, h);
  const b0 = scrollBeat(), b1 = b0 + w / S.ppb, bpb = tm.bpb;
  ctx.font = "11px " + getComputedStyle(document.body).getPropertyValue("--mono");
  const barEvery = S.ppb * bpb < 26 ? 8 : S.ppb * bpb < 50 ? 4 : S.ppb * bpb < 90 ? 2 : 1;
  const mb0 = tmM(b0), mb1 = tmM(b1);
  for (let bar = Math.floor(mb0 / bpb); bar * bpb <= mb1; bar++) {
    const x = beatToX(tmU(bar * bpb));
    const major = bar % barEvery === 0;
    ctx.fillStyle = major ? "#3a4050" : "#23272f";
    ctx.fillRect(Math.round(x), major ? 0 : 12, 1, major ? 22 : 10);
    if (major) {
      ctx.fillStyle = "#8b91a3";
      ctx.fillText(String(bar + 1), x + 4, 13);
    }
  }
  const ySec = 24, hSec = 26;
  for (const s of secList()) {
    const x0 = beatToX(s.start), x1 = beatToX(s.end);
    if (x1 < 0 || x0 > w) continue;
    ctx.fillStyle = s.color + "33";
    roundRect(ctx, x0 + 1, ySec, Math.max(2, x1 - x0 - 2), hSec, 6);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.fillRect(x0 + 1, ySec, 3, hSec);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, ySec, x1 - x0 - 4, hSec);
    ctx.clip();
    ctx.fillStyle = "#e9ebf1";
    ctx.font = "600 12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(s.name_ua, Math.max(x0 + 10, 8), ySec + 17);
    ctx.restore();
  }
  const yC = 56, hC = 24;
  for (const c of chordList()) {
    if (c.label === "N") continue;
    const x0 = beatToX(c.start), x1 = beatToX(c.end);
    if (x1 < 0 || x0 > w) continue;
    ctx.fillStyle = "#1b1e26";
    roundRect(ctx, x0 + 1, yC, Math.max(2, x1 - x0 - 2), hC, 5);
    ctx.fill();
    ctx.strokeStyle = "#2c313d";
    ctx.stroke();
    if (x1 - x0 > 22) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, yC, x1 - x0 - 3, hC);
      ctx.clip();
      ctx.fillStyle = "#ffcf85";
      ctx.font = "600 12px " + getComputedStyle(document.body).getPropertyValue("--mono");
      ctx.fillText(c.label, x0 + 6, yC + 16);
      ctx.restore();
    }
  }
  const px = beatToX(S.playBeat);
  ctx.fillStyle = "#4fd1c5";
  ctx.fillRect(Math.round(px), 0, 1.5, h);
  ctx.beginPath();
  ctx.moveTo(px - 5, 0);
  ctx.lineTo(px + 6, 0);
  ctx.lineTo(px + 0.5, 7);
  ctx.fill();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function seekFromEvent(e, el) {
  const r = el.getBoundingClientRect();
  const b = clamp(scrollBeat() + (e.clientX - r.left) / S.ppb, 0, arrEnd());
  seek(b);
}
$(".tl-top").addEventListener("mousedown", (e) => {
  seekFromEvent(e, $(".tl-top"));
  const mv = (ev) => seekFromEvent(ev, $(".tl-top"));
  const up = () => {
    window.removeEventListener("mousemove", mv);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", mv);
  window.addEventListener("mouseup", up);
});
function setZoom(ppb, anchorX = null) {
  const old = S.ppb;
  ppb = clamp(ppb, 4, 160);
  const ax = anchorX ?? body.clientWidth / 2;
  const beatAtAnchor = scrollBeat() + ax / old;
  S.ppb = ppb;
  $("#z-range").value = ppb;
  layout();
  body.scrollLeft = Math.max(0, beatAtAnchor * ppb - ax);
  draw();
}
$("#z-range").addEventListener("input", (e) => setZoom(+e.target.value));
$("#z-in").onclick = () => setZoom(S.ppb * 1.3);
$("#z-out").onclick = () => setZoom(S.ppb / 1.3);
lanesBox.addEventListener("wheel", (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const r = body.getBoundingClientRect();
    setZoom(S.ppb * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left);
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    body.scrollLeft += e.deltaX || e.deltaY;
  }
}, { passive: false });
$(".tl-top").addEventListener("wheel", (e) => {
  e.preventDefault();
  body.scrollLeft += e.deltaX || e.deltaY;
}, { passive: false });
$("#t-play").onclick = () => S.playing ? stopPlay() : play();
$("#ed-title").addEventListener("click", async () => {
  const n = prompt("Назва проєкту (так називатимуться файли експорту):", S.B.project.title);
  if (!n || !n.trim()) return;
  S.B = await api.post(`/api/project/${S.pid}/rename`, { title: n.trim() });
  renderEditor();
  toast("Проєкт перейменовано.");
});
$("#t-start").onclick = () => {
  seek(0);
  body.scrollLeft = 0;
};
$("#t-metro").onclick = () => {
  S.metro = !S.metro;
  $("#t-metro").classList.toggle("on", S.metro);
};
$("#t-vol").addEventListener("input", (e) => {
  S.vol = +e.target.value;
  if (S.audio && S.audio.out) S.audio.out.gain.value = S.vol;
});
$$("#listen-seg button").forEach((b) => b.addEventListener("click", () => {
  S.listen = b.dataset.listen;
  $$("#listen-seg button").forEach((x) => x.classList.toggle("active", x === b));
  for (const id in S.ui) S.ui[id].src = null;
  if (S.B) {
    for (const t of S.B.tracks) if (!t.has_audio) S.ui[t.id].src = "midi";
  }
  applyGains();
  renderHeads();
}));
let rebuildTimer = null, pendingPatch = {};
function rebuild(patch, now = false) {
  pendingPatch = mergePatch(pendingPatch, patch);
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(doRebuild, now ? 0 : 280);
}
function mergePatch(a, b) {
  const out = { ...a, ...b };
  if (a.tracks || b.tracks) {
    out.tracks = { ...a.tracks || {} };
    for (const k in b.tracks || {}) out.tracks[k] = { ...out.tracks[k] || {}, ...b.tracks[k] };
  }
  return out;
}
async function doRebuild() {
  const patch = pendingPatch;
  pendingPatch = {};
  const was = S.playing, pos = S.playBeat;
  try {
    $("#audio-status").textContent = "перерахунок…";
    const B = await api.post(`/api/project/${S.pid}/build`, patch);
    if (was) stopPlay();
    const oldPad = S.B.timing.pad, oldPeriod = S.B.timing.period;
    S.B = B;
    const tSong = pos * oldPeriod - oldPad;
    S.playBeat = Math.max(0, (tSong + B.timing.pad) / B.timing.period);
    renderEditor();
    if (was) play();
  } catch (e) {
    toast("Помилка перерахунку: " + e.message, true);
  }
  $("#audio-status").textContent = "";
}
function patchTrack(id, obj) {
  rebuild({ tracks: { [id]: obj } }, true);
}
$("#s-bpm").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (v >= 40 && v <= 260) rebuild({ bpm: v }, true);
});
$$("[data-bpm]").forEach((b) => b.addEventListener("click", () => {
  const cur = S.B.timing.bpm;
  const v = b.dataset.bpm === "half" ? cur / 2 : cur * 2;
  if (v >= 40 && v <= 260) rebuild({ bpm: +v.toFixed(3) }, true);
  else toast("Темп вийде за межі 40–260 BPM.", true);
}));
$("#s-bpm-reset").onclick = () => rebuild({ bpm: null, beat_offset_ms: 0, downbeat: null }, true);
$$("#s-sig button").forEach((b) => b.addEventListener("click", () => rebuild({ beats_per_bar: +b.dataset.sig, downbeat: null }, true)));
$("#s-db-prev").onclick = () => {
  const tm = S.B.timing;
  rebuild({ downbeat: (tm.downbeat_phase + tm.bpb - 1) % tm.bpb }, true);
};
$("#s-db-next").onclick = () => {
  const tm = S.B.timing;
  rebuild({ downbeat: (tm.downbeat_phase + 1) % tm.bpb }, true);
};
$("#s-off").addEventListener("input", (e) => {
  $("#s-off-val").textContent = `${e.target.value} мс`;
  rebuild({ beat_offset_ms: +e.target.value });
});
$("#s-align").addEventListener("change", (e) => rebuild({ align_to_bar: e.target.checked }, true));
$("#s-grid").addEventListener("change", (e) => rebuild({ grid: e.target.value }, true));
$("#s-q").addEventListener("input", (e) => {
  $("#s-q-val").textContent = e.target.value + "%";
  rebuild({ quantize: +e.target.value / 100 });
});
$("#s-qends").addEventListener("change", (e) => rebuild({ quantize_ends: e.target.checked }, true));
$("#s-key").addEventListener("change", (e) => {
  const [t, m] = e.target.value.split("|");
  rebuild({ key_override: { tonic: +t, mode: m } }, true);
});
$("#s-snap").addEventListener("change", (e) => rebuild({ scale_snap: e.target.checked }, true));
$("#s-chords").addEventListener("change", (e) => rebuild({ chords_track: e.target.checked }, true));
$("#s-split").addEventListener("change", (e) => rebuild({ split_drums: e.target.checked }, true));
$("#s-reset").onclick = async () => {
  if (!await inkConfirm("Підтвердження", "<p>" + escapeHtml("Повернути всі налаштування до автоматично визначених?") + "</p>", "Так", false)) return;
  S.B = await api.post(`/api/project/${S.pid}/reset`);
  renderEditor();
};
function switchTab(name) {
  $$(".side-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $("#tab-project").hidden = name !== "project";
  $("#tab-track").hidden = name !== "track";
  $("#tab-sound").hidden = name !== "sound";
  if (name === "sound") renderSound();
}
async function loadKit() {
  if (S.kit && S.kit._pid === S.pid) return S.kit;
  $("#sound-body").innerHTML = '<div class="empty-track">Аналізую звук і вирізаю семпли…</div>';
  try {
    S.kit = await api.get(`/api/project/${S.pid}/kit`);
    S.kit._pid = S.pid;
  } catch (e) {
    $("#sound-body").innerHTML = `<div class="empty-track">${escapeHtml(e.message)}</div>`;
    return null;
  }
  return S.kit;
}
async function renderSound() {
  const kit = await loadKit();
  if (!kit || !S.B) return;
  const box = $("#sound-body");
  const fx = (c) => `<div class="snd-fx"><b>${escapeHtml(c.plugin)}</b>${c.send ? ` <span class="muted">→ ${escapeHtml(c.send)}</span>` : ""}<ul>${c.settings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`;
  const card = (name, color, ins, rec, smps, id) => {
    const i = rec.instrument || {};
    return `<div class="snd-card ${S.sel === id ? "snd-sel" : ""}" style="border-left-color:${color}" data-id="${id}">
      <h4>${escapeHtml(name)}<span>інсерт ${ins}</span></h4>
      <div class="snd-chars">${(rec.character || []).map((c) => `<span>${escapeHtml(c)}</span>`).join("")}</div>
      ${i.plugin ? `<div class="snd-inst"><b>${escapeHtml(i.plugin)}</b> — ${escapeHtml(i.preset || "")}<div class="muted">або: ${escapeHtml(i.alt || "—")}</div>${i.how ? `<div class="muted">${escapeHtml(i.how)}</div>` : ""}</div>` : ""}
      ${(rec.chain || []).map(fx).join("")}
      ${smps && smps.length ? `<div class="smp-list">${smps.map((sm) => `<button class="smp-btn" data-f="${escapeHtml(sm.file)}"><i>▶</i>${escapeHtml(sm.name)}<em>${sm.root_name ? "root " + sm.root_name : sm.fpc_pad ? "пад " + sm.fpc_pad : ""}</em></button>`).join("")}</div>` : ""}
    </div>`;
  };
  const live = new Set(S.B.tracks.map((x) => x.id));
  const tracks = kit.tracks.filter((x) => live.has(x.id)).sort((a, b) => (b.id === S.sel) - (a.id === S.sel));
  box.innerHTML = `<p class="muted small">Рекомендації інструментів і ефектів, підібрані за аналізом оригіналу (назви плагінів наведено для FL Studio — в інших програмах беріть схожі за типом), і семпли, вирізані з цієї пісні. Усе це також потрапляє в експорт (папка Samples + «Звуковий гід FL Studio.html»).</p>
    <button class="btn ghost wide" id="open-guide" style="margin-bottom:12px">Відкрити повний звуковий гід</button>` + tracks.map((t) => card(t.name, t.color, t.insert, t.rec, t.samples, t.id)).join("") + (live.has("_chords") ? card("Chords (harmony)", "#eab308", kit.chords.insert, kit.chords.rec, [], "_chords") : "") + kit.buses.map((b) => `<div class="snd-card" style="border-left-color:#4fd1c5"><h4>Шина ${escapeHtml(b.name)}<span>інсерт ${b.insert}</span></h4>${b.chain.map(fx).join("")}</div>`).join("") + `<div class="snd-card" style="border-left-color:#4fd1c5"><h4>Master</h4>${kit.master.map(fx).join("")}</div>`;
  $("#open-guide").onclick = () => window.open(`/api/project/${S.pid}/guide`, "_blank");
  $$(".smp-btn", box).forEach((b) => b.onclick = () => playSample(b.dataset.f, b));
}
let sampleAudio = null;
function playSample(f, btn) {
  if (sampleAudio) {
    sampleAudio.pause();
    $$(".smp-btn i").forEach((i) => i.textContent = "▶");
  }
  if (sampleAudio && sampleAudio._f === f) {
    sampleAudio = null;
    return;
  }
  sampleAudio = new Audio(`/api/project/${S.pid}/sample?f=${encodeURIComponent(f)}`);
  sampleAudio._f = f;
  sampleAudio.volume = S.vol;
  btn.querySelector("i").textContent = "■";
  sampleAudio.onended = () => {
    btn.querySelector("i").textContent = "▶";
    sampleAudio = null;
  };
  sampleAudio.play();
}
$$(".side-tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
function renderTrackForm() {
  const selBase = S.sel && typeof findT === "function" && findT(S.sel) ? findT(S.sel).of || S.sel : S.sel;
  const t = S.B && S.B.tracks.find((x) => x.id === selBase);
  $("#track-empty").hidden = !!t;
  $("#track-form").hidden = !t;
  if (!t) return;
  const s = t.settings || {};
  $("#tf-color").style.background = t.color;
  $("#tf-name").value = t.name;
  const lvl = t.level_db != null ? ` · рівень ${t.level_db} дБ` : "";
  const cl = typeof findT === "function" && findT(S.sel) && findT(S.sel).clone;
  $("#tf-info").textContent = cl ? "Копія доріжки: налаштування розпізнавання нот спільні з оригіналом «" + t.name + "». Ефекти, обробка й кліпи копії — окремі (панель знизу)." : t.virtual ? "Згенеровано з визначених акордів" : `${t.is_drums ? t.notes.length + " ударів" : t.notes.length + " нот"} · ${ROLE_UA[t.role] || t.role}${lvl}`;
  $("#tf-enabled").checked = !!t.enabled;
  const isMel = !t.is_drums && !t.virtual && t.role !== "skip";
  for (const id of ["#tf-minlen-row", "#tf-mono-row", "#tf-oct-row"]) $(id).hidden = !isMel;
  $("#tf-prog-row").hidden = t.is_drums;
  $("#tf-sens").parentElement.hidden = t.virtual || t.role === "skip";
  $("#tf-vel").parentElement.hidden = t.virtual;
  $("#tf-sens").value = Math.round((s.sensitivity ?? 0.5) * 100);
  $("#tf-sens-val").textContent = $("#tf-sens").value + "%";
  $("#tf-minlen").value = s.min_ms ?? 60;
  $("#tf-minlen-val").textContent = (s.min_ms ?? 60) + " мс";
  $("#tf-mono").checked = !!s.mono;
  $("#tf-oct").textContent = (s.octave > 0 ? "+" : "") + (s.octave || 0);
  $$("#tf-vel button").forEach((b) => b.classList.toggle("active", b.dataset.vel === (s.velocity || "dynamic")));
  $("#tf-prog").value = t.program ?? 0;
  $("#tf-name").disabled = !!t.virtual;
  $("#tf-enabled").disabled = false;
}
const selT = () => {
  const c = typeof findT === "function" && findT(S.sel);
  return S.B.tracks.find((x) => x.id === (c && c.of || S.sel));
};
$("#tf-name").addEventListener("change", (e) => {
  const t = selT();
  if (t && !t.virtual) patchTrack(t.id, { name: e.target.value.trim() || t.name });
});
$("#tf-enabled").addEventListener("change", (e) => {
  const t = selT();
  if (!t) return;
  if (t.virtual) rebuild({ chords_track: e.target.checked }, true);
  else patchTrack(t.id, { enabled: e.target.checked });
});
$("#tf-sens").addEventListener("input", (e) => {
  $("#tf-sens-val").textContent = e.target.value + "%";
  const t = selT();
  if (t) rebuild({ tracks: { [t.id]: { sensitivity: +e.target.value / 100 } } });
});
$("#tf-minlen").addEventListener("input", (e) => {
  $("#tf-minlen-val").textContent = e.target.value + " мс";
  const t = selT();
  if (t) rebuild({ tracks: { [t.id]: { min_ms: +e.target.value } } });
});
$("#tf-mono").addEventListener("change", (e) => {
  const t = selT();
  if (t) patchTrack(t.id, { mono: e.target.checked });
});
$("#tf-oct-down").onclick = () => {
  const t = selT();
  if (t) patchTrack(t.id, { octave: clamp((t.settings.octave || 0) - 1, -3, 3) });
};
$("#tf-oct-up").onclick = () => {
  const t = selT();
  if (t) patchTrack(t.id, { octave: clamp((t.settings.octave || 0) + 1, -3, 3) });
};
$$("#tf-vel button").forEach((b) => b.addEventListener("click", () => {
  const t = selT();
  if (t && !t.virtual) patchTrack(t.id, { velocity: b.dataset.vel });
}));
$("#tf-prog").addEventListener("change", (e) => {
  const t = selT();
  if (t && !t.virtual) patchTrack(t.id, { program: +e.target.value });
});
$$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal").hidden = true));
$("#export-modal").addEventListener("click", (e) => {
  if (e.target.id === "export-modal") e.currentTarget.hidden = true;
});
setMode("mix");
loadSystem();
show("home");
