/* app.js — UI, opslag (localStorage) en PDF-import */
(function () {
  "use strict";

  const APP_VERSION = "1.4.0"; // ophogen bij elke release (houd gelijk met sw.js CACHE)
  const BUILD_DATE = "2026-06-09";

  const STORE_TRAININGS = "tp_trainings";
  const STORE_ACTIVE = "tp_active";
  const STORE_CHECKS = "tp_checks";
  const STORE_GISTID = "tp_gistid";
  const STORE_TOKEN = "tp_token";

  // ---- Opslag ----
  const load = (k, def) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let trainings = load(STORE_TRAININGS, []);
  let activeId = load(STORE_ACTIVE, null);
  let checks = load(STORE_CHECKS, {}); // { trainingId: { "si-ei": true } }
  let gistId = localStorage.getItem(STORE_GISTID) || "";
  let token = localStorage.getItem(STORE_TOKEN) || "";

  // Gist-ID kan via de gedeelde link binnenkomen: index.html#gist=<id>
  const hashMatch = location.hash.match(/gist=([^&]+)/);
  if (hashMatch) {
    gistId = GistSync.parseGistId(decodeURIComponent(hashMatch[1]));
    localStorage.setItem(STORE_GISTID, gistId);
  }

  // Cursist-modus (alleen lezen) via de deel-link: #gist=<id>&view=cursist
  const CURSIST = /view=cursist/i.test(location.hash);
  if (CURSIST) {
    document.body.classList.add("cursist");
    // Niet installeerbaar maken: manifest + app-meta weghalen → gedraagt zich
    // als een gewone webpagina, alleen te bekijken via de link.
    document.querySelectorAll('link[rel="manifest"], link[rel="apple-touch-icon"]').forEach((el) => el.remove());
    const cap = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    if (cap) cap.remove();
    const es = document.getElementById("emptyState");
    if (es) {
      const h = es.querySelector("h2");
      const p = es.querySelectorAll("p")[1];
      if (h) h.textContent = "Nog geen training";
      if (p) p.textContent = "Je trainer heeft nog geen training gedeeld, of deze wordt nog geladen.";
    }
  }

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
  // De meest recente training (hoogste 'created'); standaard de getoonde training
  function latestTrainingId() {
    if (!trainings.length) return null;
    let best = trainings[0];
    for (const t of trainings) if ((t.created || 0) > (best.created || 0)) best = t;
    return best.id;
  }
  // Niveau-namen van een training: expliciet (tabel-import) of standaard 1/2/3
  function trainingLevels(t) {
    if (t && Array.isArray(t.levelNames) && t.levelNames.length) return { names: t.levelNames, named: true };
    return { names: ["1", "2", "3"], named: false };
  }
  function levelLabel(name) { return /^[123]$/.test(name) ? "N" + name : name; }
  function levelClass(i) { return "lvl" + ((i % 4) + 1); }
  // Afstand per niveau van een oefening (named: per naam; legacy: 1/2/3 + allLevels)
  function levelValue(ex, name, named) {
    if (ex.levels && ex.levels[name] != null) return ex.levels[name];
    if (!named && ex.allLevels && /^[123]$/.test(name)) return ex.allLevels;
    return null;
  }
  function checksFor(id) {
    if (!checks[id]) checks[id] = {};
    return checks[id];
  }
  function fmtMeters(m) {
    return m >= 1000 ? (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + " km" : m + "m";
  }
  // Herken een rusttijd in seconden uit de oefeningtekst (bv. "15 seconden rust")
  function restSeconds(ex) {
    const text = (ex.title || "") + " " + (ex.notes || []).join(" ");
    const m = text.match(/(\d+)\s*(?:seconden|seconde|sec\.?|s)\b[^.]*?\brust\b/i) ||
              text.match(/\brust\b[^.]*?(\d+)\s*(?:seconden|seconde|sec\.?|s)\b/i);
    return m ? parseInt(m[1], 10) : 0;
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

  function levelBadges(ex, info) {
    const wrap = document.createElement("div");
    wrap.className = "levels";
    // Legacy: zelfde afstand voor alle niveaus → één "Alle"-badge
    if (!info.named && (!ex.levels || Object.keys(ex.levels).length === 0) && ex.allLevels) {
      const b = document.createElement("span");
      b.className = "badge all";
      b.innerHTML = `<span class="badge-tag">Alle</span>${esc(ex.allLevels)}`;
      wrap.appendChild(b);
      return wrap;
    }
    info.names.forEach((name, i) => {
      const val = levelValue(ex, name, info.named);
      if (val == null) return;
      const b = document.createElement("span");
      b.className = "badge " + levelClass(i);
      b.innerHTML = `<span class="badge-tag">${esc(levelLabel(name))}</span>${esc(val)}`;
      wrap.appendChild(b);
    });
    return wrap.children.length ? wrap : null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

    const sections = Array.isArray(t.sections) ? t.sections : [];
    if (sections.length === 0) {
      setNotice("⚠️ De training \"" + (t.name || "?") + "\" bevat geen oefeningen of heeft een onverwacht formaat. Controleer de bron-tekst en voeg 'm opnieuw toe.", "err");
    } else {
      setNotice("");
    }

    const info = trainingLevels(t);
    const tChecks = checksFor(t.id);
    let total = 0, done = 0;

    sections.forEach((section, si) => {
      const sec = document.createElement("section");
      sec.className = "block";
      const h = document.createElement("h2");
      h.className = "block-title";
      h.textContent = section.title || "";
      sec.appendChild(h);

      (Array.isArray(section.exercises) ? section.exercises : []).forEach((ex, ei) => {
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

        const badges = levelBadges(ex, info);
        if (badges) body.appendChild(badges);

        if (ex.tools) {
          const tools = document.createElement("div");
          tools.className = "tools";
          tools.textContent = "🧰 " + ex.tools;
          body.appendChild(tools);
        }

        if (ex.notes && ex.notes.length) {
          const notes = document.createElement("div");
          notes.className = "notes";
          notes.textContent = ex.notes.join(" · ");
          body.appendChild(notes);
        }

        const rest = restSeconds(ex);
        if (rest > 0 && window.SwimTimer) {
          const chip = document.createElement("button");
          chip.className = "rest-chip";
          chip.innerHTML = `⏱ ${rest}s rust`;
          chip.addEventListener("click", (e) => {
            e.stopPropagation(); // niet de kaart afvinken
            window.SwimTimer.openCountdown(rest);
          });
          body.appendChild(chip);
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

    // Totale afstand per niveau
    const totals = {};
    info.names.forEach((n) => (totals[n] = 0));
    sections.forEach((s) => (Array.isArray(s.exercises) ? s.exercises : []).forEach((ex) => {
      info.names.forEach((n) => {
        const v = levelValue(ex, n, info.named);
        if (v != null) totals[n] += TrainingParser.parseDistance(v);
      });
    }));
    totalsEl.innerHTML = "";
    info.names.forEach((n, i) => {
      if (!totals[n]) return;
      const d = document.createElement("div");
      d.className = "total " + levelClass(i);
      d.innerHTML = `<span class="total-tag">${esc(levelLabel(n) === "N" + n ? "Niveau " + n : n)}</span><span class="total-val">${fmtMeters(totals[n])}</span>`;
      totalsEl.appendChild(d);
    });
  }

  function toggle(trainingId, key, card, check) {
    if (CURSIST) return; // cursisten vinken niet af
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
    const sm = document.getElementById("settingsModal");
    if (sm) sm.classList.add("hidden");
    const tm = document.getElementById("timerModal");
    if (tm) tm.classList.add("hidden");
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
    const info = trainingLevels({ levelNames: parsed.levelNames });
    preview.innerHTML = "";
    if (parsed.levelNames && parsed.levelNames.length) {
      const lh = document.createElement("div");
      lh.className = "preview-levels";
      lh.textContent = "Niveaus: " + parsed.levelNames.join(" · ");
      preview.appendChild(lh);
    }
    parsed.sections.forEach((s) => {
      const h = document.createElement("div");
      h.className = "preview-section";
      h.textContent = s.title + ` (${s.exercises.length})`;
      preview.appendChild(h);
      s.exercises.forEach((ex) => {
        const row = document.createElement("div");
        row.className = "preview-row";
        let lvls = "";
        if (ex.allLevels && !info.named) {
          lvls = "Alle " + ex.allLevels;
        } else {
          lvls = info.names
            .map((nm) => { const v = levelValue(ex, nm, info.named); return v == null ? null : `${levelLabel(nm)} ${v}`; })
            .filter(Boolean).join(" · ");
        }
        const tools = ex.tools ? ` <span class="pv-tools">🧰 ${escapeHtml(ex.tools)}</span>` : "";
        row.innerHTML = `<span class="pv-title">${escapeHtml(ex.title)}</span>` +
          (lvls ? `<span class="pv-lvls">${escapeHtml(lvls)}${tools}</span>` : tools);
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
    if (Array.isArray(parsedDraft.levelNames) && parsedDraft.levelNames.length) {
      t.levelNames = parsedDraft.levelNames;
    }
    trainings.unshift(t);
    activeId = t.id;
    save(STORE_TRAININGS, trainings);
    save(STORE_ACTIVE, activeId);
    closeAll();
    render();
    pushToGist(); // upload naar gedeelde gist indien verbonden
  }

  // ---- PDF import ----
  async function importPdf(file) {
    $("pdfLabel").textContent = "⏳ Bezig met inlezen…";
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let allText = "";
      const tableItems = [];
      const PAGE = 100000;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        allText += reconstructLines(tc.items) + "\n";
        // geometrie voor de tabel-parser: y van boven naar beneden + pagina-offset
        for (const it of tc.items) {
          if (!it.str || !it.str.trim()) continue;
          const tr = it.transform || [1, 0, 0, 1, 0, 0];
          tableItems.push({ str: it.str, x: tr[4], y: -tr[5] + p * PAGE, w: it.width || 0 });
        }
      }
      $("pdfLabel").textContent = "✅ " + file.name;
      // Eerst proberen als kolommen-tabel (niveaus = kolommen); anders gewone tekst
      let parsed = null;
      try { parsed = window.PdfTable ? window.PdfTable.build(tableItems) : null; } catch (e) { parsed = null; }
      if (parsed && TrainingParser.countExercises(parsed) >= 3) {
        renderPreview(parsed);
      } else {
        renderPreview(TrainingParser.parse(allText));
      }
    } catch (e) {
      console.error(e);
      $("pdfLabel").textContent = "⚠️ Kon PDF niet lezen — probeer tekst plakken";
      previewWrap.classList.add("hidden");
      saveBtn.disabled = true;
    }
  }

  // Reconstrueer regels uit pdf.js tekstitems: groepeer op y-positie, herstel
  // inspringing uit de x-positie (zodat sub-onderdelen herkend blijven) en
  // voeg spaties toe waar tussen tekststukjes een gat zit.
  function reconstructLines(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const w = it.width || 0;
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, w, str: it.str });
    }
    rows.sort((a, b) => b.y - a.y);

    // linkermarge bepalen om inspringing te kunnen herkennen
    const lineXs = rows.map((r) => Math.min(...r.parts.map((p) => p.x)));
    const baseX = lineXs.length ? Math.min(...lineXs) : 0;

    return rows
      .map((r) => {
        const parts = r.parts.slice().sort((a, b) => a.x - b.x);
        let text = "";
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (i > 0) {
            const prev = parts[i - 1];
            const gap = p.x - (prev.x + prev.w);
            if (gap > 1 && !/\s$/.test(text) && !/^\s/.test(p.str)) text += " ";
          }
          text += p.str;
        }
        text = text.replace(/\s+/g, " ").trim();
        if (!text) return "";
        const indented = (parts[0].x - baseX) > 10; // verder naar rechts = sub-onderdeel
        return indented ? "\t" + text : text;
      })
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
    pushToGist();
  }

  // ---- Gist synchronisatie ----
  const settingsModal = $("settingsModal");
  const gistStatus = $("gistStatus");
  const gistMsg = $("gistMsg");
  const gistIdInput = $("gistIdInput");
  const tokenInput = $("tokenInput");

  function setMsg(text, kind) {
    gistMsg.textContent = text || "";
    gistMsg.className = "gist-msg" + (kind ? " " + kind : "");
  }

  function refreshGistStatus() {
    if (gistId) {
      gistStatus.textContent = "Verbonden met gist " + gistId.slice(0, 8) + "… " +
        (token ? "(uploaden mogelijk)" : "(alleen lezen — geen token)");
      gistStatus.classList.add("ok");
    } else {
      gistStatus.textContent = "Niet verbonden — trainingen staan alleen op dit toestel.";
      gistStatus.classList.remove("ok");
    }
  }

  function openSettings() {
    closeAll();
    settingsModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    gistIdInput.value = gistId;
    tokenInput.value = token;
    setMsg("");
    refreshGistStatus();
  }

  function setNotice(html, kind) {
    const el = $("gistNotice");
    if (!html) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.className = "gist-notice" + (kind ? " " + kind : "");
    el.innerHTML = html;
    const retry = el.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", () => pullFromGist(false));
  }

  async function pullFromGist(silent) {
    if (!gistId) return;
    if (!silent) setMsg("Trainingen ophalen…", "busy");
    setNotice("⏳ Gedeelde trainingen laden…", "busy");
    try {
      const data = await GistSync.fetchTrainings(gistId, token);
      trainings = data.trainings || [];
      save(STORE_TRAININGS, trainings);
      // Standaard de laatste training tonen; alleen een nog-geldige selectie behouden
      if (!trainings.find((t) => t.id === activeId)) activeId = latestTrainingId();
      save(STORE_ACTIVE, activeId);
      render();
      if (trainings.length === 0) {
        setNotice(CURSIST
          ? "☁️ Je trainer heeft nog geen training gedeeld. Kom later terug."
          : "☁️ Verbonden met de gedeelde gist, maar er staan <strong>nog geen trainingen</strong> in. Voeg er één toe via <strong>+ Nieuw</strong> (token nodig) om te delen.", "warn");
      } else {
        setNotice("");
      }
      if (!silent) setMsg("✓ " + trainings.length + " training(en) opgehaald.", "ok");
      return true;
    } catch (e) {
      setNotice("⚠️ Kon de gedeelde trainingen niet laden: " + e.message +
        " <button class=\"link-btn\" data-retry>Opnieuw proberen</button>", "err");
      if (!silent) setMsg("⚠️ " + e.message, "err");
      return false;
    }
  }

  async function pushToGist() {
    if (!gistId) return; // niet verbonden: alleen lokaal, prima
    if (!token) {
      setNotice("⚠️ Wijziging staat <strong>alleen op dit toestel</strong> — geen token, dus niet gedeeld (en kan bij synchroniseren terugkomen). Voeg het token toe via <strong>⋯ → ☁️ Gedeelde trainingen</strong> om te uploaden.", "warn");
      return;
    }
    setNotice("⏳ Wijziging uploaden naar de gedeelde gist…", "busy");
    try {
      // haal eerst de nieuwste versie zodat we niet per ongeluk werk van een
      // andere trainer overschrijven, en upload daarna onze volledige lijst
      await GistSync.saveTrainings(gistId, token, trainings);
      setNotice("✓ Gedeelde gist bijgewerkt. Andere toestellen zien dit na synchroniseren.", "ok");
      setTimeout(() => {
        const el = $("gistNotice");
        if (el && el.classList.contains("ok")) setNotice("");
      }, 4000);
    } catch (e) {
      setNotice("⚠️ Uploaden mislukt: " + e.message, "err");
    }
  }

  async function connectGist() {
    gistId = GistSync.parseGistId(gistIdInput.value);
    token = tokenInput.value.trim();
    if (!gistId) { setMsg("Vul een gist-ID of -link in.", "err"); return; }
    localStorage.setItem(STORE_GISTID, gistId);
    localStorage.setItem(STORE_TOKEN, token);
    refreshGistStatus();
    const ok = await pullFromGist(false);
    // Bij succes het venster sluiten, zodat de trainingen zichtbaar worden
    if (ok && trainings.length > 0) setTimeout(closeAll, 600);
  }

  async function createGist() {
    token = tokenInput.value.trim();
    if (!token) { setMsg("Een token (scope: gist) is nodig om een gist aan te maken.", "err"); return; }
    setMsg("Gist aanmaken…", "busy");
    try {
      const id = await GistSync.createGist(token, trainings, "Zwemtrainingen (gedeeld)");
      gistId = id;
      localStorage.setItem(STORE_GISTID, gistId);
      localStorage.setItem(STORE_TOKEN, token);
      gistIdInput.value = gistId;
      refreshGistStatus();
      setMsg("✓ Gist aangemaakt. Deel de link via het menu (🔗).", "ok");
    } catch (e) {
      setMsg("⚠️ " + e.message, "err");
    }
  }

  function disconnectGist() {
    gistId = ""; token = "";
    localStorage.removeItem(STORE_GISTID);
    localStorage.removeItem(STORE_TOKEN);
    gistIdInput.value = ""; tokenInput.value = "";
    refreshGistStatus();
    setMsg("Losgekoppeld. Trainingen blijven lokaal bewaard.", "ok");
  }

  function copyLink(url, message) {
    const done = () => alert(message + "\n\n" + url);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => prompt("Kopieer de link:", url));
    } else {
      prompt("Kopieer de link:", url);
    }
  }
  function noGistYet() {
    alert("Nog geen gedeelde gist. Open eerst ☁️ Gedeelde trainingen om te verbinden of een gist aan te maken.");
    openSettings();
  }
  function shareLink() {
    closeAll();
    if (!gistId) { noGistYet(); return; }
    const url = location.origin + location.pathname + "#gist=" + gistId;
    copyLink(url, "Trainers-link gekopieerd. Hiermee kunnen mede-trainers lezen én (met token) uploaden:");
  }
  function shareCursistLink() {
    closeAll();
    if (!gistId) { noGistYet(); return; }
    const url = location.origin + location.pathname + "#gist=" + gistId + "&view=cursist";
    copyLink(url, "Cursisten-link gekopieerd. Alleen-lezen, zonder menu/afvinken — ideaal om vooraf te bekijken:");
  }

  // ---- Events ----
  $("addBtn").addEventListener("click", openAdd);
  $("emptyAddBtn").addEventListener("click", openAdd);
  $("timerFab").addEventListener("click", () => { if (window.SwimTimer) window.SwimTimer.open(); });
  $("saveBtn").addEventListener("click", doSave);
  $("menuBtn").addEventListener("click", () => {
    // Vinkjes/Verwijderen alleen relevant met een actieve training
    const hasActive = !!activeTraining();
    $("resetBtn").classList.toggle("hidden", !hasActive);
    $("deleteBtn").classList.toggle("hidden", !hasActive);
    menuSheet.classList.remove("hidden");
    document.body.classList.add("no-scroll");
  });
  $("resetBtn").addEventListener("click", resetChecks);
  $("deleteBtn").addEventListener("click", deleteTraining);
  $("settingsBtn").addEventListener("click", openSettings);

  // ---- Installeren op startscherm ----
  let deferredPrompt = null;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) $("installBtn").classList.add("hidden");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  $("installBtn").addEventListener("click", async () => {
    closeAll();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      return;
    }
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (iOS) {
      alert("Installeren op iPhone/iPad:\n\n1. Tik op de deelknop (vierkant met pijltje) onderaan Safari.\n2. Kies \"Zet op beginscherm\".\n3. Tik op \"Voeg toe\".");
    } else {
      alert("Installeren:\n\nOpen het browsermenu (⋮) en kies \"App installeren\" of \"Toevoegen aan startscherm\".\n\n(Staat de app er al op? Dan is 'ie al geïnstalleerd.)");
    }
  });

  $("syncBtn").addEventListener("click", () => {
    closeAll();
    if (!gistId) { alert("Nog niet verbonden met een gedeelde gist. Open ⋯ → ☁️ Gedeelde trainingen."); openSettings(); return; }
    pullFromGist(false);
  });
  $("shareBtn").addEventListener("click", shareLink);
  $("shareCursistBtn").addEventListener("click", shareCursistLink);
  $("connectBtn").addEventListener("click", connectGist);
  $("createGistBtn").addEventListener("click", createGist);
  $("disconnectBtn").addEventListener("click", disconnectGist);

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

  // Versielabel tonen
  $("versionLabel").textContent = "versie " + APP_VERSION + " · " + BUILD_DATE;

  // Service worker + melding bij een nieuwe versie
  // (niet in cursist-modus: dan blijft de pagina een gewone, niet-installeerbare site)
  if ("serviceWorker" in navigator && !CURSIST) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // controleer direct op een update
        reg.update().catch(() => {});
        // én telkens als de app weer naar de voorgrond komt (PWA-heropening)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
        // en periodiek, voor langlopende sessies
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // nieuwe versie geïnstalleerd terwijl er al een actief is
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              const bar = $("updateBar");
              bar.classList.remove("hidden");
              $("updateBtn").onclick = () => {
                sw.postMessage("skip-waiting");
                location.reload();
              };
            }
          });
        });
      }).catch(() => {});

      // herlaad zodra de nieuwe service worker de controle overneemt
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    });
  }

  // Start — toon standaard de laatste (meest recente) training
  activeId = latestTrainingId();
  render();
  // Verbonden met een gedeelde gist? Haal de nieuwste trainingen op.
  if (gistId) pullFromGist(true);
})();
