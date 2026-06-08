# 🏊 Zwemtraining — afvink-app voor trainers

Een telefoon-vriendelijke web-app waarmee je tijdens het trainen je programma
**per oefening afvinkt**, met de **3 niveaus naast elkaar**. Bedoeld voor een
groep waarin de oefeningen hetzelfde zijn maar de afstanden/intensiteit per
niveau verschillen.

Geen installatie, geen account, geen server nodig — alles draait in de browser
en wordt lokaal op je toestel bewaard.

## Wat kan het?

- **Afvinken aan de badrand** — grote tikvlakken per oefening; tik de hele kaart
  om af te vinken (handig met natte handen).
- **3 niveaus in één oogopslag** — elke oefening toont `N1 · N2 · N3` met de
  juiste afstand/intensiteit.
- **Voortgang & meters** — een balk ("12 van 16 afgevinkt") en de automatisch
  berekende **totale afstand per niveau**.
- **Wekelijks nieuwe training toevoegen**:
  - **Tekst plakken** (aanbevolen, 100% betrouwbaar) in het format hieronder.
  - **PDF uploaden** — de tekst wordt automatisch uitgelezen. Controleer altijd
    even het voorbeeld; PDF-opmaak kan soms rommelig overkomen.
- **Meerdere trainingen bewaren** en bovenaan wisselen via het keuzemenu.
- **Werkt offline** (PWA) en kan op je beginscherm als app gezet worden.

## Het tekstformaat

```
Inzwemmen:
- Borstcrawl 60% (niveau 1: 100m, niveau 2: 150m, niveau 3: 200m)
- Benen met plankje (50m voor ieder niveau)
- Armen met pull buoy (niveau 1: 50m, niveau 2: 50m, niveau 3: 100m)

---

Techniek:
- Oefening 1: Heen Wet Noodle, terug tall en proud
	- Niveau 1: 2x 50m
	- Niveau 2: 3x 50m
	- Niveau 3: 3x 50m
```

Regels:
- Een regel die eindigt op `:` is een **blok** (bv. `Inzwemmen:`, `Conditie:`).
- Een `-` regel is een **oefening**.
- Niveaus kunnen op twee manieren:
  - **inline** tussen haakjes: `(niveau 1: 100m, niveau 2: 150m, niveau 3: 200m)`
  - of als **ingesprongen sub-regels** met `- Niveau 1: …`
- `(50m voor ieder niveau)` geldt voor alle 3 de niveaus.
- `2x 50m`, `3x 150m` enz. worden meegerekend in de totale afstand. Tekst tussen
  haakjes (bv. `(eerste 100m snorkel)`) telt **niet** mee als extra afstand maar
  blijft als notitie zichtbaar.
- `---` is een optionele scheidingslijn tussen blokken.

Zie [`voorbeeld-training.txt`](voorbeeld-training.txt) voor een complete training.

## Online zetten (GitHub Pages)

1. Push deze map naar GitHub (branch `main` of `master`).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → kies de branch
   en map `/ (root)` → **Save**.
3. Na ~1 minuut staat de app op `https://<gebruiker>.github.io/TrainingProgramma/`.
4. Open op je telefoon → browsermenu → **Toevoegen aan beginscherm**.

## Lokaal testen

Open `index.html` via een mini-webserver (nodig voor de service worker / PDF):

```bash
python3 -m http.server 8000
# open daarna http://localhost:8000
```

## Bestanden

| Bestand | Functie |
|---|---|
| `index.html` | Opbouw van de pagina |
| `styles.css` | Vormgeving (mobiel-eerst) |
| `parser.js` | Zet tekst/PDF om naar gestructureerde training |
| `app.js` | UI, opslag (localStorage), PDF-import |
| `manifest.json`, `sw.js` | PWA: installeerbaar + offline |
| `voorbeeld-training.txt` | Voorbeeld in het juiste format |
