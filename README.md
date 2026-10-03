# VoteWatch 2027

Scenario model for Kenya's 2027 presidential election. Put the candidates on
teams and the model re-runs 1,457 wards to show whether anyone wins outright,
who meets in a run-off, how each county votes, and how exposed the result is to
a court petition.

Live: https://dansamuka.github.io/votewatch/

## Using it

1. **Teams** (left, or the top panel on mobile): every candidate polling in
   2026 is listed with their polling average. Put each one on team A (Ruto's
   side), team B, an extra team (up to four), or Solo. Defaults: Ruto vs the
   four highest-polling challengers. Then adjust follow-through, swings, youth
   turnout and protest vote.
2. **Result** in the header: the most likely outcome and the run-off pairing.
3. **Tabs**: Overview, Run-off, Swing counties, Scenarios (ready-made
   line-ups), Article 138, Map (click a county for its result and wards),
   Dispute risk, Signals (latest polls and key facts), Report.
4. **Export**: print or save a PDF, report HTML, and CSVs.

Header buttons switch between public and analyst wording and between the light
and dark themes (light and public are the defaults; the choice is remembered).
Technical tables sit in "Technical detail" sections, closed by default.

## Structure

```
index.html              markup: header, Teams sidebar, tab panels
css/tokens.css          base tokens
css/styles.css          component and print styles
css/enhance.css         depth, motion, container-query grids
css/layout.css          app shell, Teams panel, sliders, switches
css/atlas.css           Kenya Projects Atlas colours/theme + map styles (loaded last)
js/app.js               engine (candidate field, teams, simulation, run-off) and rendering
js/enhance.js           accessibility, cartogram, KPI sparklines/gauge
js/map.js               county map and county panel
data/wards.js           ward-level dataset  (const WD)
data/counties.js        county dataset      (const CO)
data/transport.js       road links for live-event spillover (synthetic)
data/context.js         candidate polling averages and regional profiles, national polls, key facts
data/kenya-geo.js       Kenya + 47 county outlines + lakes, pre-projected (from the Projects Atlas; geoBoundaries / Natural Earth, public domain)
docs/AUDIT.md           engine and data audit, method and calibration notes
```

## Run locally

No build step. Serve the folder:

```bash
python -m http.server 8000
```

html2canvas loads from a CDN. Asset URLs carry `?v=` stamps; bump them in
`index.html` when you change a CSS or JS file, so visitors don't mix cached old
files with new ones.

Deployed by GitHub Pages (`.github/workflows/static.yml`) on every push to `main`.

## Updating

- **New polls / candidates:** edit `CANDIDATES` (averages from the
  kenya-election-intelligence-engine `polling_average_all.json`) and `POLLS` in
  `data/context.js`.
- **Preset line-ups:** `SCENS` near the top of `js/app.js`.

## Caveats

Ward patterns come from 2022 results and assumed regional profiles; national
levels come from published polls, some with undisclosed methods. Treat output
as scenario analysis, not a forecast. See `docs/AUDIT.md`.
