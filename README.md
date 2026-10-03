# VoteWatch 2027

Scenario model for Kenya's 2027 presidential election. Set the political
context and a few assumptions; the model re-runs 1,457 wards and tells you
whether the result is an outright win or a run-off, which counties decide the
25% test, and how exposed the outcome is to a petition.

Live: https://dansamuka.github.io/votewatch/

## Using it

1. **Scenario settings** (left, or the top panel on mobile): four political-context
   switches and five assumption sliders. Every tab updates.
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
limitations, including the narrow Monte Carlo spread.
