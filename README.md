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
css/tokens.css          all design tokens (light default; dark via <html data-theme="dark">)
css/app.css             all component styles
js/viz.js               race strip, outcome dots, margin strip, Article 138 gates, run-off flow
js/app.js               engine (candidate field, teams, simulation, run-off) and rendering
js/enhance.js           accessibility, cartogram, first-visit guide
js/map.js               county map and county panel
data/wards.js           ward-level dataset  (const WD)
data/counties.js        county dataset      (const CO)
data/transport.js       road links for live-event spillover (synthetic)
data/context.js         candidate polling averages and regional profiles, national polls, key facts
data/kenya-geo.js       Kenya + 47 county outlines + lakes, pre-projected (from the Projects Atlas; geoBoundaries / Natural Earth, public domain)
docs/AUDIT.md           engine and data audit, method and calibration notes
```

## Run locally

No build step needed for development. Serve the folder:

```bash
python -m http.server 8000
```

## Deploy

GitHub Pages runs `.github/workflows/static.yml` on every push to `main`. It
runs `node scripts/build.mjs`, which bundles and minifies the stylesheets and
scripts listed in `index.html` into two content-hashed files in `_site/`
(1 CSS + 1 JS instead of 11 requests) and publishes that folder. To preview
the production build locally, run the same command and serve `_site/`.

## Updating

- **New polls / candidates:** edit `CANDIDATES` (averages from the
  kenya-election-intelligence-engine `polling_average_all.json`) and `POLLS` in
  `data/context.js`.
- **Preset line-ups:** `SCENS` near the top of `js/app.js`.

## Caveats

Ward patterns come from 2022 results and assumed regional profiles; national
levels come from published polls, some with undisclosed methods. Treat output
as scenario analysis, not a forecast. See `docs/AUDIT.md`.
