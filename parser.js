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
  const BULLET = /^[\s\t]*[-*•·]\s+/;
  const LEADING_WS = /^[\t ]*/;
  const NIVEAU_LINE = /^niveau\s*([123])\b\s*[:.\-]?\s*(.*)$/i;

  function stripBullet(line) {
    return line.replace(/^[\s\t]*[-*•·]\s+/, "").trim();
  }

  // Haal een afstand in meters uit een stuk tekst.
  // "2x 50m" -> 100, "3x 150m" -> 450, "150m (eerste 100m snorkel)" -> 150
  function parseDistance(str) {
    if (!str) return 0;
    const clean = String(str).replace(/\([^)]*\)/g, " "); // negeer tekst tussen haakjes
    let m = clean.match(/(\d+)\s*[x×*]\s*(\d+)\s*m\b/i);
    if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
    m = clean.match(/(\d+)\s*m\b/i);
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

  function addSubItem(ex, content) {
    const m = content.match(NIVEAU_LINE);
    if (m) {
      ex.levels[m[1]] = (m[2] || "").trim();
      return true;
    }
    ex.notes.push(content);
    return false;
  }

  function isLevelLine(content) {
    return NIVEAU_LINE.test(content);
  }

  function parse(text) {
    const lines = String(text || "").split(/\r?\n/);
    const sections = [];
    let section = null;
    let exercise = null;

    function ensureSection() {
      if (!section) {
        section = { title: "Training", exercises: [] };
        sections.push(section);
      }
    }

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed === "") continue;
      if (/^[-=_*]{3,}$/.test(trimmed)) continue; // scheidingslijn ---

      const isBullet = BULLET.test(raw);
      const indentLen = (raw.match(LEADING_WS) || [""])[0].replace(/\t/g, "  ").length;
      const isIndented = indentLen > 0;

      // Sectiekop: geen bullet, eindigt op ':' en niet ingesprongen
      if (!isBullet && trimmed.endsWith(":") && !isIndented) {
        section = { title: trimmed.replace(/:\s*$/, "").trim(), exercises: [] };
        sections.push(section);
        exercise = null;
        continue;
      }

      if (isBullet) {
        const content = stripBullet(raw);

        // Een "Niveau X" regel hoort altijd bij de huidige oefening
        if (isLevelLine(content) && exercise) {
          addSubItem(exercise, content);
          continue;
        }
        // Ingesprongen bullet = sub-item (notitie) van de huidige oefening
        if (isIndented && exercise) {
          addSubItem(exercise, content);
          continue;
        }
        // Anders: nieuwe oefening op het hoogste niveau
        ensureSection();
        exercise = newExercise(content);
        section.exercises.push(exercise);
        continue;
      }

      // Niet-bullet regel die geen kop is -> notitie bij huidige oefening of sectie
      if (exercise) {
        if (isLevelLine(trimmed)) addSubItem(exercise, trimmed);
        else exercise.notes.push(trimmed);
      } else {
        ensureSection();
        exercise = newExercise(trimmed);
        section.exercises.push(exercise);
      }
    }

    // Lege secties opruimen
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
