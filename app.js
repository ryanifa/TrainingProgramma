/* app.js — UI, opslag (localStorage) en PDF-import */
(function () {
  "use strict";

  const STORE_TRAININGS = "tp_trainings";
  const STORE_ACTIVE = "tp_active";
  const STORE_CHECKS = "tp_checks";

  // ---- Opslag ----
  const load = (k, def) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let trainings = load(STORE_TRAININGS, []);
  let activeId = load(STORE_ACTIVE, null);
  let checks = load(STORE_CHECKS, {}); // { trainingId: { "si-ei": true } }

  // ---- Elementen ----
  const $ = (id) => document.getElementById(id);
  const trainingSelect = $("trainingSelect");
  const content = $("content");
  const summary = $("summary");
  const emptyState = $("emptyState");
  const progressText = $("progressText");
  const progressFill = $("progressFill");
  const totalsEl = $("totals");

  // ---- Helpers ----
  function activeTraining() {
    return trainings.find((t) => t.id === activeId) || null;
  }
  function checksFor(id) {
    if (!checks[id]) checks[id] = {};
    return checks[id];
  }
  function fmtMeters(m) {
    return m >= 1000 ? (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + " km" : m + "m";
  }

  // ---- Render ----
  function renderSelect() {
    trainingSelect.innerHTML = "";
    if (trainings.length === 0) {
      trainingSelect.classList.add("hidden");
      return;
    }
    trainingSelect.classList.remove("hidden");
    for (const t of trainings) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === activeId) opt.selected = true;
      trainingSelect.appendChild(opt);
    }
  }

  function levelBadges(ex) {
    const wrap = document.createElement("div");
    wrap.className = "levels";
    const hasPer = ex.levels && Object.keys(ex.levels).length > 0;
    if (hasPer) {
      for (const lvl of [1, 2, 3]) {
        if (!ex.levels[lvl]) continue;
        const b = document.createElement("span");
        b.className = "badge lvl" + lvl;
        b.innerHTML = `<span class="badge-tag">N${lvl}</span>${ex.levels[lvl]}`;
        wrap.appendChild(b);
      }
    } else if (ex.allLevels) {
      const b = document.createElement("span");
      b.className = "badge all";
      b.innerHTML = `<span class="badge-tag">Alle</span>${ex.allLevels}`;
      wrap.appendChild(b);
    }
    return wrap.children.length ? wrap : null;
  }

  function render() {
    const t = activeTraining();
    renderSelect();

    if (!t) {
      summary.classList.add("hidden");
      content.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");
    summary.classList.remove("hidden");
    content.innerHTML = "";

    const tChecks = checksFor(t.id);
    let total = 0, done = 0;

    t.sections.forEach((section, si) => {
      const sec = document.createElement("section");
      sec.className = "block";
      const h = document.createElement("h2");
      h.className = "block-title";
      h.textContent = section.title;
      sec.appendChild(h);

      section.exercises.forEach((ex, ei) => {
        total++;
        const key = `${si}-${ei}`;
        const isDone = !!tChecks[key];
        if (isDone) done++;

        const card = document.createElement("div");
        card.className = "card" + (isDone ? " done" : "");
        card.dataset.key = key;

        const check = document.createElement("div");
        check.className = "check";
        check.textContent = isDone ? "✓" : "";

        const body = document.createElement("div");
        body.className = "card-body";

        const title = document.createElement("div");
        title.className = "card-title";
        title.textContent = ex.title;
        body.appendChild(title);

        const badges = levelBadges(ex);
        if (badges) body.appendChild(badges);

        if (ex.notes && ex.notes.length) {
          const notes = document.createElement("div");
          notes.className = "notes";
          notes.textContent = ex.notes.join(" · ");
          body.appendChild(notes);
        }

        card.appendChild(check);
        card.appendChild(body);
        card.addEventListener("click", () => toggle(t.id, key, card, check));
        sec.appendChild(card);
      });

      content.appendChild(sec);
    });

    progressText.textContent = `${done} van ${total} afgevinkt`;
    progressFill.style.width = total ? (done / total) * 100 + "%" : "0%";

    const totals = TrainingParser.totalsPerLevel(t);
    totalsEl.innerHTML = "";
    for (const lvl of [1, 2, 3]) {
      if (!totals[lvl]) continue;
      const d = document.createElement("div");
      d.className = "total lvl" + lvl;
      d.innerHTML = `<span class="total-tag">Niveau ${lvl}</span><span class="total-val">${fmtMeters(totals[lvl])}</span>`;
      totalsEl.appendChild(d);
    }
  }

  function toggle(trainingId, key, card, check) {
    const c = checksFor(trainingId);
    if (c[key]) { delete c[key]; card.classList.remove("done"); check.textContent = ""; }
    else { c[key] = true; card.classList.add("done"); check.textContent = "✓"; }
    save(STORE_CHECKS, checks);
    updateProgress();
  }

  function updateProgress() {
    const t = activeTraining();
    if (!t) return;
    const c = checksFor(t.id);
    const total = TrainingParser.countExercises(t);
    const done = Object.keys(c).filter((k) => c[k]).length;
    progressText.textContent = `${done} van ${total} afgevinkt`;
    progressFill.style.width = total ? (done / total) * 100 + "%" : "0%";
  }

  // ---- Toevoegen / modal ----
  const addModal = $("addModal");
  const menuSheet = $("menuSheet");
  const textInput = $("textInput");
  const nameInput = $("nameInput");
  const previewWrap = $("previewWrap");
  const preview = $("preview");
  const saveBtn = $("saveBtn");
  let parsedDraft = null;

  function openAdd() {
    addModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    setTab("text");
    textInput.value = "";
    nameInput.value = "";
    $("pdfLabel").textContent = "📄 Tik om een PDF te kiezen";
    previewWrap.classList.add("hidden");
    parsedDraft = null;
    saveBtn.disabled = true;
  }
  function closeAll() {
    addModal.classList.add("hidden");
    menuSheet.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }

  function setTab(name) {
    document.querySelectorAll(".tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === name));
    $("tabText").classList.toggle("hidden", name !== "text");
    $("tabPdf").classList.toggle("hidden", name !== "pdf");
  }

  function renderPreview(parsed) {
    parsedDraft = parsed;
    const n = TrainingParser.countExercises(parsed);
    if (!parsed || n === 0) {
      previewWrap.classList.add("hidden");
      saveBtn.disabled = true;
      return;
    }
    preview.innerHTML = "";
    parsed.sections.forEach((s) => {
      const h = document.createElement("div");
      h.className = "preview-section";
      h.textContent = s.title + ` (${s.exercises.length})`;
      preview.appendChild(h);
      s.exercises.forEach((ex) => {
        const row = document.createElement("div");
        row.className = "preview-row";
        let lvls = "";
        if (Object.keys(ex.levels).length)
          lvls = [1, 2, 3].filter((l) => ex.levels[l]).map((l) => `N${l} ${ex.levels[l]}`).join(" · ");
        else if (ex.allLevels) lvls = "Alle " + ex.allLevels;
        row.innerHTML = `<span class="pv-title">${escapeHtml(ex.title)}</span>` +
          (lvls ? `<span class="pv-lvls">${escapeHtml(lvls)}</span>` : "");
        preview.appendChild(row);
      });
    });
    previewWrap.classList.remove("hidden");
    saveBtn.disabled = false;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function defaultName() {
    const d = new Date();
    return "Training " + d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  }

  function doSave() {
    if (!parsedDraft || TrainingParser.countExercises(parsedDraft) === 0) return;
    const t = {
      id: "t_" + Date.now(),
      name: (nameInput.value.trim() || defaultName()),
      created: Date.now(),
      sections: parsedDraft.sections,
    };
    trainings.unshift(t);
    activeId = t.id;
    save(STORE_TRAININGS, trainings);
    save(STORE_ACTIVE, activeId);
    closeAll();
    render();
  }

  // ---- PDF import ----
  async function importPdf(file) {
    $("pdfLabel").textContent = "⏳ Bezig met inlezen…";
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let allText = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        allText += reconstructLines(tc.items) + "\n";
      }
      $("pdfLabel").textContent = "✅ " + file.name;
      renderPreview(TrainingParser.parse(allText));
    } catch (e) {
      console.error(e);
      $("pdfLabel").textContent = "⚠️ Kon PDF niet lezen — probeer tekst plakken";
      previewWrap.classList.add("hidden");
      saveBtn.disabled = true;
    }
  }

  // Reconstrueer regels uit pdf.js tekstitems op basis van hun y-positie
  function reconstructLines(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, str: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows
      .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join("").replace(/\s+/g, " ").trim())
      .filter((l) => l.length)
      .join("\n");
  }

  // ---- Menu acties ----
  function resetChecks() {
    const t = activeTraining();
    if (!t) return;
    checks[t.id] = {};
    save(STORE_CHECKS, checks);
    closeAll();
    render();
  }
  function deleteTraining() {
    const t = activeTraining();
    if (!t) return;
    if (!confirm(`"${t.name}" verwijderen?`)) return;
    trainings = trainings.filter((x) => x.id !== t.id);
    delete checks[t.id];
    activeId = trainings[0] ? trainings[0].id : null;
    save(STORE_TRAININGS, trainings);
    save(STORE_ACTIVE, activeId);
    save(STORE_CHECKS, checks);
    closeAll();
    render();
  }

  // ---- Events ----
  $("addBtn").addEventListener("click", openAdd);
  $("emptyAddBtn").addEventListener("click", openAdd);
  $("saveBtn").addEventListener("click", doSave);
  $("menuBtn").addEventListener("click", () => {
    if (!activeTraining()) { openAdd(); return; }
    menuSheet.classList.remove("hidden");
    document.body.classList.add("no-scroll");
  });
  $("resetBtn").addEventListener("click", resetChecks);
  $("deleteBtn").addEventListener("click", deleteTraining);

  trainingSelect.addEventListener("change", (e) => {
    activeId = e.target.value;
    save(STORE_ACTIVE, activeId);
    render();
  });

  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => setTab(b.dataset.tab)));

  document.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", closeAll));

  textInput.addEventListener("input", () => {
    const val = textInput.value.trim();
    if (!val) { previewWrap.classList.add("hidden"); saveBtn.disabled = true; parsedDraft = null; return; }
    renderPreview(TrainingParser.parse(val));
  });

  $("pdfInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) importPdf(f);
  });

  // pdf.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // Service worker voor offline gebruik
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // Start
  if (activeId && !activeTraining()) activeId = trainings[0] ? trainings[0].id : null;
  render();
})();
