/* gist.js — synchronisatie van trainingen via een gedeelde GitHub Gist.

   Model: één gist (eigendom van een gedeeld clubaccount) bevat het bestand
   `trainingen.json` met { trainings: [...] }.
   - Lezen kan iedereen met de gist-ID, zonder token (ook voor secret gists).
   - Uploaden/wijzigen vereist het gedeelde token (scope: gist) van de eigenaar.
*/
(function (global) {
  "use strict";

  const API = "https://api.github.com/gists";
  const FILE = "trainingen.json";

  function parseGistId(input) {
    if (!input) return "";
    const s = String(input).trim();
    // accepteer een volledige URL of losse ID
    const m = s.match(/[0-9a-f]{20,}/i);
    return m ? m[0] : s;
  }

  function headers(token) {
    const h = { Accept: "application/vnd.github+json" };
    if (token) h.Authorization = "token " + token;
    return h;
  }

  async function fetchTrainings(gistId, token) {
    const id = parseGistId(gistId);
    const res = await fetch(API + "/" + id, { headers: headers(token) });
    if (!res.ok) throw new Error("Gist lezen mislukt (" + res.status + ")");
    const gist = await res.json();
    const file = gist.files && gist.files[FILE];
    if (!file) return { trainings: [] };
    let content = file.content;
    if (file.truncated && file.raw_url) {
      content = await (await fetch(file.raw_url)).text();
    }
    try {
      const data = JSON.parse(content || "{}");
      return { trainings: Array.isArray(data.trainings) ? data.trainings : [] };
    } catch {
      return { trainings: [] };
    }
  }

  async function saveTrainings(gistId, token, trainings) {
    const id = parseGistId(gistId);
    const body = JSON.stringify({
      files: { [FILE]: { content: JSON.stringify({ trainings }, null, 2) } },
    });
    const res = await fetch(API + "/" + id, {
      method: "PATCH",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("Geen schrijfrechten — controleer het token (scope: gist).");
      if (res.status === 404)
        throw new Error("Gist niet gevonden, of dit token bezit deze gist niet.");
      throw new Error("Uploaden mislukt (" + res.status + ")");
    }
    return true;
  }

  async function createGist(token, trainings, description) {
    const body = JSON.stringify({
      description: description || "Zwemtrainingen (gedeeld)",
      public: false,
      files: { [FILE]: { content: JSON.stringify({ trainings: trainings || [] }, null, 2) } },
    });
    const res = await fetch(API, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      if (res.status === 401)
        throw new Error("Token ongeldig — controleer het token (scope: gist).");
      throw new Error("Gist aanmaken mislukt (" + res.status + ")");
    }
    const gist = await res.json();
    return gist.id;
  }

  global.GistSync = { parseGistId, fetchTrainings, saveTrainings, createGist };
})(window);
