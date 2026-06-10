/* parser.js — zet platte tekst (of uit PDF gehaalde tekst) om in een gestructureerde
   training: secties -> oefeningen -> niveaus + notities.

   Datamodel:
   {
     sections: [
       {
         title: "Inzwemmen",
         exercises: [
           {
             title: "Borstcrawl 60%",
             levels: { "1": "100m", "2": "150m", "3": "200m" }, // per niveau
             allLevels: null,        // of "50m" als het voor ieder niveau geldt
             notes: ["recovery"]     // extra info
           }
         ]
       }
     ]
   }
*/

(function (global) {
  "use strict";

  // Regex helpers
  // Haal een afstand in meters uit een stuk tekst.
  // "2x 50m" -> 100, "3x 150m" -> 450, "150m (eerste 100m snorkel)" -> 150
  function parseDistance(str) {
    if (!str) return 0;
    const clean = String(str).replace(/\([^)]*\)/g, " "); // negeer tekst tussen haakjes
    let m = clean.match(/(\d+)\s*[x×*]\s*(\d+)\s*m\b/i);
    if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
    m = clean.match(/(\d+)\s*m\b/i);
    if (m) return parseInt(m[1], 10);
    // kaal getal (bv. tabel-cel "100") = meters
    m = clean.match(/^\s*(\d+)\s*$/);
    if (m) return parseInt(m[1], 10);
    return 0;
  }

  function newExercise(rawContent) {
    const ex = { title: rawContent, levels: {}, allLevels: null, notes: [] };

    // Verwerk informatie tussen haakjes: niveau-specificaties of "voor ieder niveau".
    const parens = [];
    ex.title = ex.title.replace(/\(([^)]*)\)/g, (full, inner) => {
      const text = inner.trim();
      if (/niveau\s*[123]/i.test(text)) {
        // bv. "niveau 1: 100m, niveau 2: 150m, niveau 3: 200m"
        const re = /niveau\s*([123])\s*[:.\-]?\s*([^,;]+)/gi;
        let mm;
        while ((mm = re.exec(text)) !== null) {
          ex.levels[mm[1]] = mm[2].trim();
        }
        return ""; // uit titel verwijderen
      }
      if (/(ieder|elk|alle|per)\s+niveau/i.test(text) || /voor\s+iedereen/i.test(text)) {
        // bv. "50m voor ieder niveau"
        const val = text.replace(/voor\s+(ieder|elk|alle|per)\s+niveau/i, "")
                        .replace(/(ieder|elk|alle|per)\s+niveau/i, "")
                        .replace(/voor\s+iedereen/i, "")
                        .trim();
        ex.allLevels = val || text;
        return "";
      }
      parens.push(text); // beschrijvende info, laat in titel staan
      return "(" + inner + ")";
    });

    ex.title = ex.title.replace(/\s{2,}/g, " ").trim();
    return ex;
  }

  // ---- Inhoud-gestuurde parser ----
  // Werkt zonder op inspringing te leunen, zodat PDF (waar tabs/bullets soms
  // verloren gaan) en plaktekst hetzelfde resultaat geven. We herkennen
  // oefeningen aan signalen in de tekst: "Oefening N", set-patronen ("3x"),
  // bullets, "Niveau N" voor niveaus, "Definities" en "60% = ..." voor notities.

  const NIVEAU_LINE = /^niveau\s*([123])\b\s*[:.\-]?\s*(.*)$/i;
  const SECTION_LINE = /^[A-Za-zÀ-ÿ'’\- ]{2,24}:$/;      // bv. "Inzwemmen:", "Techniek:"
  const DEFS_LINE = /^defin\w*\s*:?$/i;                   // "Definities" / "Definities:"
  const DEFINITION = /^\d{1,3}\s*%?\s*=/;                 // "60% = recovery"
  const NEW_BY_NUMBER = /^oefening\b/i;                   // "Oefening 2: ..."
  const NEW_BY_SETS = /^\d+\s*[x×]\b/i;                   // "3x ...", "1x ..."
  const BULLET_PREFIX = /^[-*•·]\s+/;

  function exHasLevels(ex) {
    return ex && (Object.keys(ex.levels).length > 0 || ex.allLevels);
  }

  function parse(text) {
    const lines = String(text || "").split(/\r?\n/);
    const sections = [];
    let section = null;
    let exercise = null;
    let inDefs = false;

    function ensureSection() {
      if (!section) { section = { title: "Training", exercises: [] }; sections.push(section); }
    }
    function addExercise(content) {
      ensureSection();
      exercise = newExercise(content);
      section.exercises.push(exercise);
      inDefs = false;
    }

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed === "") continue;
      if (/^[-=_*•·]{3,}$/.test(trimmed)) continue; // scheidingslijn ---

      const hadBullet = BULLET_PREFIX.test(trimmed);
      const content = trimmed.replace(BULLET_PREFIX, "").trim();
      if (!content) continue;

      // 1) Sectiekop: korte regel met alleen letters/spaties die op ':' eindigt
      if (SECTION_LINE.test(content) && !DEFS_LINE.test(content)) {
        section = { title: content.replace(/:\s*$/, "").trim(), exercises: [] };
        sections.push(section);
        exercise = null; inDefs = false;
        continue;
      }

      // 2) Definitieblok-kop ("Definities:")
      if (DEFS_LINE.test(content)) {
        addExercise(content.replace(/:\s*$/, ""));
        inDefs = true;
        continue;
      }

      // 3) Niveau-regel hoort altijd bij de huidige oefening
      const mLvl = content.match(NIVEAU_LINE);
      if (mLvl && exercise) {
        exercise.levels[mLvl[1]] = (mLvl[2] || "").trim();
        continue;
      }

      // 4) Definitie-regel (bv. "60% = recovery") -> notitie
      if (exercise && DEFINITION.test(content)) {
        exercise.notes.push(content);
        continue;
      }
      // 4b) Binnen het definitieblok: een regel zonder oefening-signaal is een
      //     (omgebroken) vervolg van de vorige definitie -> aan die notitie plakken
      if (inDefs && exercise && !mLvl &&
          !NEW_BY_NUMBER.test(content) && !NEW_BY_SETS.test(content) && !hadBullet) {
        if (exercise.notes.length) {
          exercise.notes[exercise.notes.length - 1] += " " + content;
        } else {
          exercise.notes.push(content);
        }
        continue;
      }

      // 5) Sterke nieuwe-oefening signalen
      if (NEW_BY_NUMBER.test(content) || NEW_BY_SETS.test(content) || hadBullet) {
        addExercise(content);
        continue;
      }

      // 6) Geen duidelijk signaal:
      //    - had de vorige oefening al niveaus, dan is dit een nieuwe oefening
      //    - anders is het waarschijnlijk een omgebroken vervolgregel -> aan titel plakken
      if (exercise && !exHasLevels(exercise) && !inDefs) {
        exercise.title = (exercise.title + " " + content).replace(/\s{2,}/g, " ").trim();
        continue;
      }
      addExercise(content);
    }

    return { sections: sections.filter((s) => s.exercises.length > 0) };
  }

  // Totale afstand per niveau berekenen
  function totalsPerLevel(training) {
    const totals = { 1: 0, 2: 0, 3: 0 };
    for (const s of training.sections) {
      for (const ex of s.exercises) {
        for (const lvl of [1, 2, 3]) {
          if (ex.levels && ex.levels[lvl]) {
            totals[lvl] += parseDistance(ex.levels[lvl]);
          } else if (ex.allLevels) {
            totals[lvl] += parseDistance(ex.allLevels);
          }
        }
      }
    }
    return totals;
  }

  function countExercises(training) {
    return training.sections.reduce((n, s) => n + s.exercises.length, 0);
  }

  global.TrainingParser = { parse, parseDistance, totalsPerLevel, countExercises };
})(window);
