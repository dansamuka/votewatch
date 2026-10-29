# VoteWatch 2027

Scenario model for Kenya's 2027 presidential election. Put the candidates on
teams and the model re-runs Kenya's 1,450 IEBC wards to show whether anyone wins outright,
who meets in a run-off, how each county votes, and how exposed the result is to
a court petition.

Live: https://dansamuka.github.io/votewatch/

## Using it

1. **Teams** (left, or the top panel on mobile): every candidate polling in
   2026 is listed with their weighted average across validated polls (* one
   poll, pulled toward a small prior; † no validated poll yet). Put each one on team A (Ruto's
   side), team B, an extra team (up to four), or Solo. Then adjust
   follow-through, swings, youth turnout, protest vote and turnout by region.

   **Default ("Three-way split")**, a testing baseline rather than a forecast:
   - A, Broad-based government: Ruto for president, Kithure Kindiki as running
     mate; Oburu Odinga (ODM's government wing) on the team, off the ticket
   - B, United opposition: Kalonzo Musyoka for president, Edwin Sifuna as
     running mate; Babu Owino, Gachagua, Maraga, Karua, Orengo and Omtata on
     the team, off the ticket
   - C, Third force: Fred Matiang'i for president, Ndindi Nyoro as running
     mate (their bases split the opposition vote instead of only leaking)
   - running alone: Wajackoyah and Wanjigi
   - 65% of a running mate's supporters follow (a judgement that bases of
     former rivals transfer poorly; no published Kenyan study measures it),
     and the presidential candidate is assumed to keep all their supporters
   - preset "No third force" keeps Matiang'i and Nyoro with the opposition
     for comparison
   - turnout by region: Mt Kenya −12%, Rift Valley +2%, Nyanza −3%,
     Ukambani +4%, Coast −5%, Western −5% (relative to each region's base)
   - Research mode: 5,000 seeded runs. A quick 400-run estimate shows first
     ("refining…") and the full run finishes in the background.

   **Tickets.** Each team with two or more members has a presidential candidate
   and a running mate (Tickets, in the sidebar). Anyone else on the team is
   "off the ticket": how many of their supporters follow, and how the rest
   split between staying home, crossing to the other main side and voting for
   someone else, are set per candidate and region (`TRANSFER_PRIORS` in
   `data/context.js`; e.g. Kalonzo keeps 86% in Ukambani, 70% elsewhere).
   Crossing rises where the other side is locally strong. The sliders under
   "Where the others go" scale these priors; the cross-over share varies ±25%
   between simulations.

   **Ruto's running mate** can also be someone outside the presidential polls,
   with a small assumed regional pull for team A: Kithure Kindiki (+3 Meru &
   Embu, +1 Mt Kenya, +2 more in Tharaka-Nithi), Anne Waiguru (+2 Mt Kenya,
   +1 Meru & Embu, +2 more in Kirinyaga), John Mbadi (+2 Luo Nyanza, +2 more in
   Homa Bay), Gladys Wanga (+2.5 Luo Nyanza, +2.5 more in Homa Bay), Musalia
   Mudavadi (+2 Western, +2.5 more in Vihiga) or Moses Wetang'ula (+1.5 Western,
   +3 more in Bungoma). With
   Mbadi or Wanga, Oburu Odinga's supporters follow as if he were on the
   ticket. Or pick an opposition defector: they join team A, and because they
   are crossing sides only the off-ticket share of their supporters (55%)
   follows. Edit `RM_PICKS` in `js/app.js` to add names or change effects.

   Eugene Wamalwa and Jeremiah Kioni have no published presidential polling,
   so they are not separate entries in the model.
   **How the model treats polls and voters** (details in `docs/AUDIT.md`):
   - **Evidence** (sidebar): the voter register (current proxy 25.04m by
     default, the 2022 certified register, or IEBC's 28.5m target scenario)
     the polls (validated only by default, or all published as a
     sensitivity) and past poll bias (off by default; on adds the +4.1-point
     average miss of the final polls in 2013–2022 to team A's two-way share)
   - polls are weighted by recency, sample size and pollster quality; one to
     three polls are pulled toward a small prior; each team gets its own poll
     error per run
   - the simulations' national error is calibrated to Kenya's record: team A's
     two-way share varies by 4.1 points, the RMS miss of the final polls in
     2013, 2017 and 2022 (`data/history.js`, `scripts/calibrate-error.mjs`)
   - undecided voters (20% nationally, 26% in Mt Kenya) split like decided
     voters by default; separate sensitivities test the A/B break, movement to
     other candidates and participation of the undecided cohort. The A/B break
     also varies in simulations, most where more voters are undecided
   - in a run-off, each eliminated candidate's voters split by
     candidate-by-region priors (`RUNOFF_INC_PRIORS`), with a separate shock
     for each candidate in every simulation; protest votes split evenly. Because
     Kenya has no observed presidential run-off under the current constitution,
     deterministic views keep turnout neutral while simulations add zero-mean
     finalist/transfer-voter remobilisation uncertainty
   - young voters back team A 10 points less than older voters (adjustable);
     this matters when youth turnout changes
   - home counties get ×1.25
   - events such as development tours are listed in Signals but never added
     as vote points; "Test events" in the header is a hypothetical sandbox
     whose effects are made-up sizes for sensitivity testing
   - "What this means" gives two ranges: the 80% simulation range for this
     line-up, and the spread across the preset line-ups (who runs together).
     County ranges include county-level error calibrated on the 2022 back-test,
     where 81% of counties then fell inside their 80% range. This is in-sample
     calibration, not independent proof of 80% future coverage (Signals tab,
     `docs/AUDIT.md`)
2. **Result** in the header: the most likely outcome and the run-off pairing,
   as a share of simulations **if this line-up runs** (not the chance that the
   line-up forms).
3. **Tabs**: Overview, Run-off, Swing counties, Scenarios (ready-made
   line-ups), Article 138, Map (click a county for its result and wards),
   Dispute risk, Signals (latest polls and key facts), Report.
4. **Report** (and Export): a dashboard. Teams first (each ticket, first-round
   share and votes, 25%-county meter, chance of winning, who else is on the
   team), then four headline figures, round one, the run-off with vote counts,
   what it means and where it is decided, then running-mate options and
   assumptions. Prints as three A4 landscape pages: at a glance, the race,
   the detail. CSVs from Export.

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
data/wards.js           1,450 IEBC wards (const WD), generated by scripts/build-wards.mjs
data/counties.js        county dataset      (const CO)
data/transport.js       road links for test-event spillover (synthetic)
data/history.js         final polls vs results 2013–2022, poll-error calibration, undecided rates
data/backtest2022.js    2022 back-test results (generated by scripts/backtest-2022.mjs)
data/context.js         candidate polling averages and regional profiles, national polls, key facts
data/kenya-geo.js       Kenya + 47 county outlines + lakes, pre-projected (from the Projects Atlas; geoBoundaries / Natural Earth, public domain)
docs/AUDIT.md           engine and data audit, method and calibration notes
docs/DISCREPANCIES.md   known data gaps (unchecked rows, held wards, out-of-county votes, register)
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

## Validation

`scripts/validate-model.mjs` (run by the Pages workflow before every build; a
failure blocks deployment) reports:

- **integrity checks** (187): geography 47 / 290 / 1,450; the 2022 register;
  register scenarios reconcile exactly to every county; 2022 results against the
  IEBC declaration and the county figures; 2017 history; the poll-error record;
  poll separation; undecided rates and A/B/other/turnout sensitivities; shares
  sum to 100%; deterministic run-off vote conservation plus stochastic
  remobilisation bounds; the bias correction; simulated error matches the 4.1-point
  record; no failed draws; seeded reproducibility; sandbox labels; the back-test
  file matches the current history; candidate splits agree with independent
  county compilations in all 47 counties; the county error comes from the back-test
- **sanity bounds** (6): judgement bounds such as Kisii's third force at 45–65%.
  Passing them is not validation.

`scripts/backtest-2022.mjs` reruns the 2022 back-test (including the regional
layer, from TIFA's 29 Jul 2022 zone poll) and calibrates county error,
`scripts/check-2022.mjs` reruns the county check of the 2022 candidate splits, and
`scripts/calibrate-error.mjs` refits the error scale; both use
`scripts/model-harness.mjs`, which loads the browser model in Node.

```bash
node scripts/validate-model.mjs
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

## Ward data

`data/wards.js` is generated from the Kenya Data Atlas:

```bash
node scripts/build-wards.mjs <path-to-kenya-data-atlas>
```

- **Wards:** the official 1,450 wards and 290 constituencies (IEBC, 2012
  boundaries).
- **Registered voters:** 2022 figures per ward from IEBC Gazette Notice 7290
  (total 22,102,532), scaled in the app to the selected register scenario by
  county: the current proxy adds IEBC's 2,936,516 new registrations to 20 Aug
  2026, shared out by the 2,345,476 county figures of the April 2026 enhanced
  registration drive. 1,440 wards come straight
  from the gazette; the 10 Mandera East and Lafey wards are on a boundary hold
  in the atlas and share their constituency's official total equally.
- **Turnout:** each county's turnout base, varied by constituency using 2022
  presidential Form 34B turnout (186 of 290 constituencies published;
  the rest keep the county base).
- **2022 presidential results:** votes for all 290 constituencies from a
  public tally of IEBC Forms 34B (`data/source/pres2022-constituency-tally.csv`),
  checked against the atlas's official Form 34B reads: 224 match, 15 were
  rescaled to the official total, 2 take the official total with the split
  re-derived from county Forms 34C, 4 had been recorded under the wrong
  constituency and are swapped back, 45 have no official read to check
  against (see `docs/DISCREPANCIES.md`). National total: Ruto 50.45% (IEBC declared 50.49% with diaspora
  and prisons). Written to `data/results2022.js`; they also replace the
  county 2022 shares in `data/counties.js`, which were wrong (e.g. Mandera
  had Ruto at 74%; he won 21%).
- **Wards** share their constituency's 2022 result: IEBC publishes no
  ward-level presidential totals. The county panel lists constituencies with
  the actual 2022 result beside the 2027 estimate; Export has the 2022
  results as a CSV.

## Caveats

Constituency patterns come from the 2022 presidential results and assumed regional profiles; national
levels come from published polls, some with undisclosed methods. Treat output
as scenario analysis, not a forecast. See `docs/AUDIT.md`.
