# VoteWatch 2027

Scenario model for Kenya's 2027 presidential election. Set the political
context and a few assumptions; the model re-runs 1,457 wards and tells you
whether the result is an outright win or a run-off, which counties decide the
25% test, and how exposed the outcome is to a petition.

Live: https://dansamuka.github.io/votewatch/

## Using it

1. **Scenario settings** (left, or the top panel on mobile): start from one of
   four real 2027 paths, then adjust. Political context: Gachagua runs
   separately · ODM (Oburu) backs Ruto · Sifuna runs on his own ticket · Ruto
   holds the Rift Valley · anchor to latest polls. Assumptions: Mt Kenya shift
   away from Ruto, swings, youth turnout, minor candidates, ally delivery.
   Every tab updates.
2. **Verdict** in the header: the most likely outcome and how often it happens
   across simulations.
3. **Tabs** explain why: Run-off, Swing counties, Scenarios, Article 138, Map,
   Dispute risk, County data, Signals, Report.
4. **Export** (header): print or save a PDF, report HTML, county, ward and
   swing-county CSVs.

Live events (synthetic shocks every 30 s) are off by default; turn them on in
the header.

## Structure

```
index.html              markup: header verdict, settings sidebar, tab panels
css/tokens.css          design tokens (surfaces, type, spacing, motion)
css/styles.css          component and print styles
css/enhance.css         depth, motion, container-query grids
css/layout.css          app shell, sidebar, switches, sliders, plain-language components
js/app.js               scenario engine and rendering
js/enhance.js           a11y wiring, county cartogram, KPI sparklines/gauge, lazy geometry
data/wards.js           ward-level dataset  (const WD)
data/counties.js        county dataset      (const CO)
data/transport.js       transfer/road data  (const TR, synthetic)
data/context.js         2025–26 national polls, bloc mapping, dated alliance facts (as of 3 Oct 2026)
data/county-geojson.js  county boundaries (~1 MB, loaded lazily)
docs/AUDIT.md           engine and data audit: what was fixed, what's still open
```

## Run locally

No build step. Serve the folder:

```bash
python -m http.server 8000
```

Leaflet and html2canvas load from CDNs. Asset URLs carry `?v=` stamps; bump
them in `index.html` (and the geometry loader in `js/enhance.js`) when you
change a CSS or JS file, so visitors don't mix cached old files with new ones.

Deployed by GitHub Pages (`.github/workflows/static.yml`) on every push to `main`.

## Caveats

Ward baselines are imputed from 2022 constituency aggregates. Treat output as
scenario analysis, not a forecast. See `docs/AUDIT.md` for known modelling
limitations, the v5.1 Monte Carlo fix and the v6 alliance layer.

## Updating the political context

Polls and alliance facts live in `data/context.js`. Add new polls at the top of
`POLLS` (from the kenya-election-intelligence-engine repo), and the poll-anchor
defaults update automatically. The realignment rules and preset scenarios are
at the top of `js/app.js` (`DEFAULTS`, `SCENS`, `ODM_TO_INC`, `SIFUNA_TF`).
Method and calibration are in `docs/AUDIT.md`.
