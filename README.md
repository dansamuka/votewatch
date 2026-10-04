# VoteWatch 2027

Scenario model for Kenya's 2027 presidential election. Put the candidates on
teams and the model re-runs 1,457 wards to show whether anyone wins outright,
who meets in a run-off, how each county votes, and how exposed the result is to
a court petition.

Live: https://dansamuka.github.io/votewatch/

## Using it

1. **Teams** (left, or the top panel on mobile): every candidate polling in
   2026 is listed with their polling average. Put each one on team A (Ruto's
   side), team B, an extra team (up to four), or Solo. Then adjust
   follow-through, swings, youth turnout, protest vote and turnout by region.

   **Default ("Fractured field")**, a testing baseline rather than a forecast:
   - A, Broad-based government: Ruto + Oburu Odinga (ODM's government wing)
   - B, Kalonzo bloc: Kalonzo Musyoka
   - C, Mt Kenya breakaway: Rigathi Gachagua
   - everyone else unaligned (solo), including Sifuna (Linda Mwananchi)
   - tickets: Ruto with Oburu Odinga as running mate; Kalonzo and Gachagua
     head their own teams
   - 72% of a running mate's supporters follow (ODM and UDA bases were rivals
     for a decade); the presidential candidate keeps all their supporters
   - turnout by region: Mt Kenya −12%, Rift Valley +2%, Nyanza −3%,
     Ukambani +4%, Coast −5%, Western −5% (relative to each region's base)
   - Research mode: 5,000 seeded runs. A quick 400-run estimate shows first
     ("refining…") and the full run finishes in the background.

   **Tickets.** Each team with two or more members has a presidential candidate
   and a running mate (Tickets, in the sidebar). Anyone else on the team is
   "off the ticket": by default 55% of their supporters follow, and of the rest
   30% stay home (lowering turnout where that candidate is strong), 40% cross
   to the other main side (team A, or team B for team A's own members) and
   30% vote for someone else. These splits are assumptions, adjustable under
   "Where the others go"; the cross-over share varies ±25% between simulations.

   Mudavadi, Wetang'ula, Eugene Wamalwa and Jeremiah Kioni have no published
   presidential polling, so they are not separate entries in the model.
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
css/tokens.css          all design tokens: surfaces, ink, team + lifecycle colours, map ramps,
                        8pt spacing, type scale, shadows, motion (light default; dark via
                        <html data-theme="dark">; print overrides)
css/app.css             component styles, one home per selector (base · shell · header · tabs ·
                        sidebar · surfaces · text · controls · tables · graphics · map · report)
js/viz.js               hero ribbon + Kenya dot map, outcome dots, margin strip, Article 138
                        gates, run-off flow, 25% threshold strip
js/app.js               engine (candidate field, teams, simulation, run-off) and rendering
js/enhance.js           tabs (ARIA, sliding indicator), docking header verdict, county band,
                        first-visit guide
docs/DESIGN-SPEC.md     v9 design audit and spec (colour contract, type scale, motion tokens)
js/map.js               county map and county panel
data/wards.js           ward-level dataset  (const WD)
data/counties.js        county dataset      (const CO)
data/transport.js       road links for live-event spillover (synthetic)
data/context.js         candidate polling averages and regional profiles, national polls, key facts
data/kenya-geo.js       Kenya + 47 county outlines + lakes, pre-projected (from the Projects Atlas; geoBoundaries / Natural Earth, public domain)
docs/AUDIT.md           engine and data audit, method and calibration notes
```

## Design rules

- **Colour contract.** Team hues identify sides (A orange, B blue, C teal,
  D violet, others slate) and never mean good or bad. Red, green and amber mean
  state (risk, passes, watch) and never identify a side. Blue accent marks
  interactive and selected things only.
- **Public vs analyst view.** Technical columns carry `class="opt"` and method
  notes `class="analyst-only"`; both are hidden in public view. A "More
  columns" button (`data-more`) reveals one table's extra columns.
- **Cascade layers.** tokens < base < components < utilities < overrides
  (reduced motion, touch targets, print). Add new component rules inside
  `@layer components`.
- **Touch.** On coarse pointers every control is at least 44px.
- **Spacing and type** come from tokens (`--sp-*`, `--t-*`); avoid raw px.

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
