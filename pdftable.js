/* pdftable.js — herkent een "spreadsheet"-PDF waarin de niveaus kolommen zijn
   (bv. Sprint/Normal/Extra/Ultimate) met de afstanden als getallen per kolom.
   Input: items uit pdf.js, genormaliseerd naar { str, x, y, w } met y van boven
   naar beneden (groter = lager op de pagina) en een grote offset per pagina.
   Output: { levelNames:[...], sections:[{title, exercises:[...]}] } of null als
   het geen tabel lijkt (dan gebruikt de app de gewone tekst-parser).
*/
(function (global) {
  "use strict";

  const isInt = (s) => /^\d{1,4}$/.test(s);
  const SECTION = /^(inzwemmen|techniek|kern\b|kern\d|uitzwemmen|warming|cool|core)/i;
  const TOTAAL = /^totaal/i;

  function cluster(vals, tol) {
    vals = vals.slice().sort((a, b) => a - b);
    const cl = [];
    for (const v of vals) {
      const last = cl[cl.length - 1];
      if (last && v - last[last.length - 1] <= tol) last.push(v);
      else cl.push([v]);
    }
    return cl.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
  }

  function pickTitle(lines) {
    const isRep = (s) => /^\d+\s*x$/i.test(s) || /^\d+\s*m$/i.test(s) || /^\d+\s*x\s*\d+\s*m$/i.test(s);
    const isSub = (s) => /:\s*$/.test(s) || /^(heen|terug|eerste|eerst|tweede|derde|vierde|positie|start)\b/i.test(s) || /^\(/.test(s);
    for (const s of lines) if (!isRep(s) && !isSub(s) && s.length > 2) return s;
    return lines[0] || "Oefening";
  }

  function build(rawItems) {
    const items = (rawItems || [])
      .filter((it) => it.str && String(it.str).trim())
      .map((it) => ({ str: String(it.str).trim(), x: it.x, y: it.y, w: it.w || 0, cx: it.x + (it.w || 0) / 2 }));
    if (items.length < 12) return null;

    // 1) Niveau-kolommen: clusters van getal-cellen in de rechterhelft
    const maxCx = Math.max(...items.map((it) => it.cx));
    const ints = items.filter((it) => isInt(it.str) && it.cx > maxCx * 0.45);
    if (ints.length < 6) return null;
    const centers = cluster(ints.map((it) => it.cx), 16);
    const cols = centers
      .map((c) => ({ cx: c, n: ints.filter((it) => Math.abs(it.cx - c) <= 10).length }))
      .filter((c) => c.n >= 3)
      .sort((a, b) => a.cx - b.cx);
    if (cols.length < 2) return null;
    const levelcols = cols.map((c) => c.cx);
    const L = levelcols.length;

    // 2) Niveaunamen uit de kop-rij boven de kolommen
    const headerCands = items.filter((it) => !isInt(it.str) && it.cx >= levelcols[0] - 40);
    let topY = headerCands.length ? Math.min(...headerCands.map((it) => it.y)) : -1e9;
    const headRow = headerCands.filter((it) => it.y - topY < 14);
    let names = levelcols.map((lc) => {
      let best = null, bd = 1e9;
      for (const it of headRow) { const d = Math.abs(it.cx - lc); if (d < bd) { bd = d; best = it; } }
      return best ? best.str : null;
    });
    names = names.map((n, i) => (n && !isInt(n) && !/^tools$/i.test(n)) ? n : ("Niveau " + (i + 1)));
    const headerExclY = headerCands.length ? topY + 16 : -1e9;

    // 3) Tools-kolom
    let toolsX = levelcols[0] - 45;
    const th = items.find((it) => /^tools$/i.test(it.str));
    if (th) toolsX = th.cx;
    const descMax = toolsX - 12;

    // 4) Getal-rijen (per niveau-kolom)
    const numItems = items.filter((it) => isInt(it.str) && it.cx >= toolsX - 5);
    const rowsMap = {};
    for (const it of numItems) {
      let ci = 0, bd = 1e9;
      for (let i = 0; i < L; i++) { const d = Math.abs(it.cx - levelcols[i]); if (d < bd) { bd = d; ci = i; } }
      if (bd > 22) continue;
      const k = Math.round(it.y / 5);
      const row = (rowsMap[k] = rowsMap[k] || { y: it.y, vals: {} });
      row.vals[ci] = it.str; row.y = it.y;
    }
    let rows = Object.values(rowsMap).filter((r) => Object.keys(r.vals).length >= Math.max(2, L - 1));
    rows.sort((a, b) => a.y - b.y);
    if (rows.length < 2) return null;

    // 5) Sectiekoppen + totaal-rijen
    const secItems = items
      .filter((it) => it.cx < descMax && SECTION.test(it.str))
      .map((it) => ({ title: it.str, y: it.y }))
      .sort((a, b) => a.y - b.y);
    const totaalYs = items.filter((it) => TOTAAL.test(it.str)).map((it) => it.y);

    // 6) Banden: ken omschrijvingen toe aan getal-rijen
    const ys = rows.map((r) => r.y);
    const exRows = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const top = i === 0 ? -1e9 : (ys[i - 1] + ys[i]) / 2;
      const bot = i === rows.length - 1 ? 1e9 : (ys[i] + ys[i + 1]) / 2;
      if (secItems.some((s) => s.y >= top && s.y < bot)) continue;       // sectie-totaal
      if (totaalYs.some((ty) => Math.abs(ty - r.y) < 8)) continue;       // eindtotaal
      const desc = items
        .filter((it) => it.cx < descMax && it.y >= top && it.y < bot && it.y > headerExclY &&
          !SECTION.test(it.str) && !TOTAAL.test(it.str))
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const tools = items
        .filter((it) => it.cx >= descMax && it.cx < levelcols[0] - 12 && it.y >= top && it.y < bot &&
          !isInt(it.str) && !/^tools$/i.test(it.str))
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const lines = desc.map((d) => d.str);
      const title = pickTitle(lines);
      const notes = lines.filter((s) => s !== title);
      const levels = {};
      for (const ci in r.vals) levels[names[ci]] = r.vals[ci];
      exRows.push({ y: r.y, title, notes, tools: tools.map((t) => t.str).join(" ").trim(), levels });
    }
    if (!exRows.length) return null;

    // 7) Oefeningen aan secties koppelen
    function sectionFor(y) {
      let best = null;
      for (const s of secItems) if (s.y <= y) best = s;
      return best ? best.title : "Training";
    }
    const sections = [];
    let cur = null;
    for (const ex of exRows) {
      const title = sectionFor(ex.y);
      if (!cur || cur.title !== title) { cur = { title, exercises: [] }; sections.push(cur); }
      cur.exercises.push({ title: ex.title, levels: ex.levels, allLevels: null, notes: ex.notes, tools: ex.tools });
    }

    return { levelNames: names, sections: sections.filter((s) => s.exercises.length) };
  }

  global.PdfTable = { build };
})(typeof window !== "undefined" ? window : globalThis);
