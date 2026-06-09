/* timer.js — rust-aftelklok + digitale pace clock.
   Wordt aangestuurd vanuit app.js (zwevende knop en de ⏱-chips op oefeningen).
   Blootgesteld als window.SwimTimer = { open, openCountdown }.
*/
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- Geluid & trilling ----
  let actx = null;
  function ensureAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (e) { /* geen audio beschikbaar */ }
  }
  // Ontgrendel audio bij de eerste aanraking (nodig op mobiel/iOS)
  function unlockAudio() {
    ensureAudio();
    try {
      if (actx) {
        const b = actx.createBuffer(1, 1, 22050);
        const s = actx.createBufferSource();
        s.buffer = b; s.connect(actx.destination); s.start(0);
      }
    } catch (e) {}
  }
  function beep(times = 1, freq = 880, dur = 0.15) {
    if (!actx) return;
    let t = actx.currentTime;
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.12;
    }
  }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  function fmt(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }
  function ringStyle(el, frac, color) {
    const deg = Math.max(0, Math.min(1, frac)) * 360;
    el.style.background = `conic-gradient(${color} ${deg}deg, var(--line) ${deg}deg)`;
  }

  // ---- Aftelklok (rust) ----
  const cd = { total: 15, remaining: 15, endAt: 0, running: false, timer: 0 };

  function cdRender(done) {
    $("cdNum").textContent = fmt(cd.remaining);
    ringStyle($("cdRing"), cd.total ? cd.remaining / cd.total : 0,
      done ? "var(--done-line)" : "var(--brand)");
    $("cdRing").classList.toggle("flash", !!done);
    $("cdStart").textContent = cd.running ? "Pauze" : "Start";
  }
  function cdSet(sec) {
    cd.total = sec; cd.remaining = sec; cd.running = false;
    clearTimeout(cd.timer);
    [...$("cdPresets").children].forEach((b) =>
      b.classList.toggle("active", +b.dataset.sec === sec));
    cdRender(false);
  }
  function cdTick() {
    if (!cd.running) return;
    const left = Math.max(0, cd.endAt - Date.now()) / 1000;
    cd.remaining = left;
    if (left <= 0) { cd.running = false; cd.remaining = 0; cdRender(true); beep(4, 920, 0.18); vibrate([250, 120, 250, 120, 250]); return; }
    cdRender(false);
    cd.timer = setTimeout(cdTick, 100);
  }
  function cdStartPause() {
    ensureAudio();
    if (cd.running) { // pauzeren
      cd.running = false; clearTimeout(cd.timer); cdRender(false); return;
    }
    if (cd.remaining <= 0) cd.remaining = cd.total;
    cd.endAt = Date.now() + cd.remaining * 1000;
    cd.running = true;
    $("cdRing").classList.remove("flash");
    cdTick();
  }
  function cdReset() {
    cd.running = false; clearTimeout(cd.timer);
    cd.remaining = cd.total; cdRender(false);
  }

  // ---- Pace clock ----
  const pace = { startAt: 0, running: false, timer: 0, interval: 90, lastIdx: 0 };

  function parseInterval() {
    const v = ($("paceInterval").value || "").trim();
    if (!v) return 0;
    if (v.includes(":")) {
      const [m, s] = v.split(":");
      return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
    }
    return parseInt(v, 10) || 0;
  }
  function paceRender(sec) {
    $("paceNum").textContent = fmt(sec);
    ringStyle($("paceRing"), (sec % 60) / 60, "var(--brand)");
    $("paceStart").textContent = pace.running ? "Stop" : "Start";
  }
  function paceTick() {
    if (!pace.running) return;
    const sec = (Date.now() - pace.startAt) / 1000;
    paceRender(sec);
    if (pace.interval > 0) {
      const idx = Math.floor(sec / pace.interval);
      if (idx > pace.lastIdx) { pace.lastIdx = idx; paceFlash(); vibrate([160, 80, 160]); }
    }
    pace.timer = setTimeout(paceTick, 100);
  }
  function paceFlash() {
    const r = $("paceRing");
    r.classList.remove("interval");
    void r.offsetWidth; // forceer herstart van de animatie
    r.classList.add("interval");
  }
  function paceStartStop() {
    ensureAudio();
    if (pace.running) { pace.running = false; clearTimeout(pace.timer); paceRender((Date.now() - pace.startAt) / 1000); return; }
    pace.interval = parseInterval();
    pace.startAt = Date.now();
    pace.lastIdx = 0;
    pace.running = true;
    paceTick();
  }
  function paceReset() {
    pace.running = false; clearTimeout(pace.timer);
    $("paceRing").classList.remove("interval");
    paceRender(0);
  }

  // ---- Paneel openen/sluiten ----
  function open() {
    $("timerModal").classList.remove("hidden");
    document.body.classList.add("no-scroll");
  }
  function openCountdown(sec) {
    open();
    cdSet(sec);
    cdStartPause(); // meteen starten
  }

  function init() {
    // presets opbouwen
    const presets = [10, 15, 20, 30, 60, 90];
    const wrap = $("cdPresets");
    presets.forEach((sec) => {
      const b = document.createElement("button");
      b.dataset.sec = sec;
      b.textContent = sec < 60 ? sec + "s" : (sec % 60 === 0 ? (sec / 60) + "m" : fmt(sec));
      b.addEventListener("click", () => cdSet(sec));
      wrap.appendChild(b);
    });
    cdSet(15);
    paceRender(0);

    $("cdStart").addEventListener("click", cdStartPause);
    $("cdReset").addEventListener("click", cdReset);
    $("paceStart").addEventListener("click", paceStartStop);
    $("paceReset").addEventListener("click", paceReset);
    $("paceInterval").addEventListener("change", () => { if (pace.running) pace.interval = parseInterval(); });

    // audio ontgrendelen bij de eerste aanraking ergens in de app
    document.addEventListener("pointerdown", unlockAudio, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.SwimTimer = { open, openCountdown };
})(window);
