# Engine and data audit (v5.0–7.0, October 2026)

Scope: the scenario engine in `js/app.js` (`sim`, `mc`, `r2sim`, `disRisk`,
`tipPts`, shocks), the rendering that reports its numbers, and the data files.

Verification: a Node harness loads the data and `app.js` in a VM and compares
deterministic runs and a seeded 300-iteration Monte Carlo run before and after
the changes. With no shocks active, every national, county and ward figure
is **bit-for-bit identical** to v4.6. Only runs that include shocks differ,
because of fixes 1 and 2 below.

## 2022 presidential results by constituency (v10.8, 4 Oct 2026)

**Source.** No official machine-readable table exists: IEBC publishes Forms 34B
(one scanned PDF per constituency) and Form 34C, and the forms portal was not
reachable. The Kenya Data Atlas read the official Form 34B TOTAL rows for 245
constituencies but recorded only registered, valid and rejected votes. Candidate
votes for all 290 come from a public tally of the Forms 34B published on ArcGIS
by MapsBySifa (`Constituency_Results_gdb`), saved as
`data/source/pres2022-constituency-tally.csv`.

**Checks.**
- Against the atlas's 245 official valid-vote totals: 224 within 0.5%. Two
  pairs had been entered under each other's constituency (Kajiado East/West,
  Maara/Chuka-Igambang'ombe) and are swapped back; 17 others differ by more
  (e.g. Juja +10%) and are rescaled to the official total, keeping their
  shares. 45 constituencies have no official read to check against.
- Against Wikipedia's county table (Form 34C): 41 of 47 counties within one
  point. In 5 of the other 6, Wikipedia's own candidate columns don't add up
  to its valid-vote total while the tally does; Narok's Wikipedia row has more
  valid votes than registered voters.
- National: Ruto 7,164,119 (50.45%), Odinga 6,942,662; IEBC declared
  7,176,141 (50.49%) and 6,942,930, which include diaspora and prisons.

**What changed in the model.**
- Each ward's 2022 lean (`bi` Ruto, `bo` Odinga) is now its constituency's
  actual result instead of a county value. Within a region, candidates are
  spread across counties and constituencies by these results.
- Constituency turnout uses the tally where the atlas has no official figure
  (290 of 290 covered, up from 186).
- `baseIncumbent2022` / `baseOpposition2022` in `data/counties.js` were
  wrong for most counties (Mandera Ruto 74% vs 21% actual; Kitui 11% vs 27%;
  Garissa 72% vs 25%) and are replaced from the same totals. They feed the
  "Past results" chart and the 2017→2022 column; `hist13` and `hist17` were
  not re-checked.
- The county panel shows each constituency's 2022 result beside the 2027
  estimate; Export adds "2022 results by constituency (CSV)".

## External review fixes (v10.7, 4 Oct 2026)

All ten points from the external model review that were confirmed against the
code are addressed:

| # | Issue | Fix |
|---|---|---|
| 1 | Same register growth everywhere | 2022→2027 growth by county: half the national rate, half in proportion to 2009→2019 census growth (KNBS via the Kenya Data Atlas; floored at zero because the 2009 north-east counts were inflated). Range 2.6% (Mandera) to 10.8% (Isiolo); national total unchanged. |
| 2 | Ward results looked more precise than they are | (Superseded in v10.8: constituencies now carry their actual 2022 results.) Vote shares were only estimated per county. The county panel lists constituencies (IEBC register, estimated turnout, estimated votes) and states the county's shares once; "Most influential wards" became constituencies; ward CSV columns are labelled `_county_est` and include the IEBC 2022 register. |
| 3 | Probabilities read as forecasts | Wording is now "if this line-up runs" or "of simulations of this line-up", with a note that this is not the chance the line-up forms. |
| 4 | No range around county results | The Monte Carlo keeps every county's result in every run: the county card shows the 80% range for teams A and B and how often A reaches 25%; the swing-counties table adds "25%+ in" and the range. |
| 5 | Polls: validated and held-out mixed | Model levels use validated polls only (`polling_average.json`); Mizani and Politrack stay visible but are held out. The all-polls figure is in each candidate's tooltip. |
| 6 | One-poll candidates at full weight | Shrinkage: level = (n × poll + 1 × 1%) / (n + 1), n = effective validated polls (unvalidated-only candidates count half). Each team also gets its own poll error per simulation (members' 95% margins, half attributed to the candidate, half to the national swing already drawn). |
| 7 | Run-off split 50/50 in the simulations | Each eliminated contestant's voters follow an assumed run-off loyalty (`gov` in `data/context.js`: share who would back Ruto's side), with a ±8-point national shift drawn per simulation. The lean-to-A / even / lean-to-B views remain for comparison. |
| 8 | Same leak split for every candidate and region | The cross-over share is scaled per candidate by their loyalty to the side they would cross to (×0.2–1.8) and per ward by that side's local strength (×0.5–1.6, square root of local vs national). The rest goes to "someone else". |
| 9 | Home boost ×1.5, untested | Tempered to ×1.25 (`HOME_BOOST`): regional strength already carries most of the home pull. |
| 10 | No youth preference | Young voters back team A by `yg` points less than older voters (default 10; Infotrak, Jun 2026: Sifuna leads 18–26s at 20% while Ruto polls 32% overall). Polls already include the youth mix, so only a change in youth turnout moves the vote. |

**Effect on the default line-up.** Round one: Broad-based government 37.7%,
United opposition 36.1%, Third force 22.6% (was 44.5 / 36.0 / 19.5). The drop
for team A comes mainly from item 5: Ruto's validated average is 28.7% against
33.7% when the two held-out pollsters (45% and 39%) are included. Run-off:
United opposition wins 95% of simulated run-offs (was 4%), because Third force
voters mostly follow their opposition loyalty; with an even split team A would
still edge it, 50.8%.

Still not observed: an IEBC register update after 2022. (2022 results by
constituency were added in v10.8, above.)

## Fixed

| # | Problem | Effect before | Fix |
|---|---|---|---|
| 1 | Shock definitions use `cl`, the engine read `cluster` | 6 of the 8 synthetic events (every cluster-wide one) had no effect on results | Engine accepts either key |
| 2 | Third-force shock value (`stf`) computed but never used | "Third Force youth rally" did nothing | Added to the ward third-force share |
| 3 | Sensitivity tornado used hard-coded offsets (`base-0.080` etc.) | Chart showed fixed numbers regardless of the scenario | Each bar is now a real deterministic re-run |
| 4 | "Nearest county to 25%" picked the nearest nationally, not in the cluster named, and called a county below 25% "0.2% from threshold" | Implication #2 named Kwale (Coast) under Urban/Protest | Uses the closest county inside that cluster |
| 5 | `minM=margs[0]\|\|0.15` | A real 0.0 margin was treated as "no close counties" | Length check instead of falsy check |
| 6 | Reset left `ITERS` at the old value, and didn't reset political context, polls or theme | After Research → Reset, 5,000 iterations ran while the label said Preview 400 | Full reset that re-syncs every control |
| 7 | Poll Anchor markup showed ON highlighted while the anchor was off | Contradicted the "INACTIVE" badge | Replaced with real switches bound to state |
| 8 | Lever text `(<KSh 2B)` inserted as raw HTML | Browser parsed it as a tag and nested the rest of the Signals list | Escaped |
| 9 | Seed text inserted raw into the report and downloaded HTML | HTML injection via the seed field | Escaped |
| 10 | Poll inputs: `Number(v)\|\|48` | Typing 0 silently became 48; no range limits | Clamped to each field's min/max |
| 11 | Live events every 30s by default | Numbers changed while being read | Off by default; toggle in the header |

## Performance

`sim()` rebuilt ten lookup tables and array literals for every ward on every
iteration. These are now computed once per ward (`WK`), and county totals use an
array instead of a Map. The results are identical (see Verification). A full re-render
dropped from about 950 ms to about 210 ms in Preview mode, and Research mode is
correspondingly faster. Slider labels update instantly; the model re-run is
debounced.

## Model changes (v5.1, approved)

These change outputs on purpose.

1. **Monte Carlo spread widened.** `rng()` was `(sum of 4 uniforms − 2)/2`,
   giving a standard deviation of about 0.29 rather than 1. It is now scaled by √3
   to unit variance, so the cluster (σ 3.6pp), ward and turnout noise terms have
   the sizes their constants imply. A national swing (`NAT_SWING_SD` = 2pp) is
   now drawn once per simulated election and applied to every ward, moving
   support between incumbent and opposition. Previously all error was local
   and averaged away.

   | Default settings, Research mode | v5.0 | v5.1 |
   |---|---|---|
   | Incumbent 10–90% range | 46.4–47.2% | 44.0–49.5% |
   | Outright incumbent win | 0% | 6% |
   | Run-off | 100% | 94% |

   With an incumbent swing of +8pp: outright win 54%, run-off 46%. Deterministic
   (no-noise) results are unchanged.
2. **Run-off rule follows Article 138(7).** In the fresh election, the candidate
   with the most votes is elected. `r2sim` no longer also requires 25% in 24
   counties. The Run-off tab now shows how many counties each side leads,
   instead of the 25% count.

## County sense check (v7.3, 4 Oct 2026)

Each county was checked against the July 2026 regional cuts (TIFA 24 Jul;
Infotrak 13 Jul). Problems found under v7.0 and fixed:

| County / region | v7.0 | Problem | v7.3 |
|---|---|---|---|
| Busia | Ruto 51% | Western/ODM county, not a Ruto stronghold | Ruto 20%, Sifuna 41% |
| Kisii, Nyamira | Ruto 45%, Matiang'i 21% | Matiang'i's home; TIFA has him leading Nyanza at 29% | Matiang'i 54%, Ruto 20% |
| Kajiado, Isiolo, Taita Taveta | Kalonzo 46–54% | Non-Kamba counties inherited Ukambani strength | Ruto 52% / 67% / 38% |
| Ukambani | Ruto 7–9% | TIFA/Infotrak Ruto 15–19% | Ruto 12–18%, Kalonzo 64–74% |
| Mt Kenya | Ruto 21–27% | TIFA Ruto 8% (≈11% of decided) | Ruto 12–14%; Gachagua 18–32%, Matiang'i 17–22% |
| Western | Sifuna 44–48% | TIFA Sifuna 28% of all (≈35% decided) | Sifuna 38–47% (home Bungoma highest) |
| Coast | Ruto 25–28% | TIFA 21%, Infotrak 33% | Ruto 27–30% (Lamu, Tana River higher) |
| Nairobi | Sifuna 43%, Ruto 21% | TIFA Sifuna 22%; split field | Ruto 24, Sifuna 24, Owino 14, Kalonzo 15, Matiang'i 11, Gachagua 6 |
| Luo Nyanza | Ruto 24–32% | ODM pact; Nyanza Ruto 30–40% | Ruto 30–39%, Owino 26–29% |

**Method change.** Strength is now set per county group (North, Kalenjin Rift,
Mixed Rift, Luo Nyanza, Gusii, Western, Nairobi, Coast, Ukambani, Mt Kenya,
Meru & Embu), calibrated to those regional figures, with home counties ×1.5 (×1.25 since v10.7). 2022
results (square-rooted) only spread support between counties and wards within a
group. National averages are unchanged, so headline results barely move
(default: team A 38.2%, team B 46.6%).

Each county card on the Map tab now has a **Basis** note giving the regional poll
evidence and any home-county effect behind its result.

## Teams model (v7.0) — replaces the v6 alliance layer below

**Candidate field.** 14 candidates with their average across all published
national polls (engine repo `polling_average_all.json`, 1 Oct 2026; Ruto 33.7,
Kalonzo 15.1, Sifuna 13.8, Matiang'i 11.1 …), normalised to decided voters.
Each candidate's share in every ward is fitted by iterative proportional fitting:
the starting pattern is a regional profile × home-county boost (×1.6) × the
square root of the ward's 2022 lean, and the fit makes every ward sum to 100% and
every candidate's national share match their polling average. The profiles are
assumptions; Ruto's uses TIFA Jul 2026 regional ratios (Nyanza and the Rift above
his national share).

**Teams.** Team A is Ruto's side (Ruto is fixed there), team B the main
challenger slot, up to two more teams, and Solo. Teams with two or more members
keep the follow-through share (default 85%) of their members' support; the rest
scatters across the field. The run-off pairs the top two contestants (any team or
solo candidate). Everyone else's voters split 70/30 toward the finalist they lean
to, or 50/50. The old regional transfer table (`R2T`) is removed: its
"lean to the opposition" still sent 78% of Mt Kenya votes to Ruto.

**Removed with v7:** the Mt Kenya / ODM / Sifuna realignment rules, poll anchor,
leakage rule and background third-force table (polls now set national levels
directly); the Leaflet map and the 1 MB boundary file (9 of 47 counties were
proxies). These are replaced by the 47 geoBoundaries outlines (32 KB) from the
Kenya Projects Atlas.

**Default (Ruto vs the top four):** team A 38.2%, team B 46.7%, others 15.0%;
run-off in ~91% of simulations, which team B wins.

## 2027 alliance layer (v6.0, superseded)

The v5 options described a 2025 world: "Gachagua runs" as a Mt Kenya third
force, an "ODM–Linda Ground" coast deal, and a sentiment item about Raila
Odinga's travel. After Raila's death (Oct 2025) the live questions are
different. Sources and polls are in `data/context.js`, taken from the
kenya-election-intelligence-engine repo plus dated press reports.

**Blocs.** inc = Ruto and allies; opp = the United Opposition candidate
(Kalonzo, Gachagua, Matiang'i, Karua); tf = everyone else, chiefly Sifuna.

**Realignment rules** (applied to each ward's 2022 Ruto/Raila baseline, before swings):

| Option | Rule | Basis |
|---|---|---|
| Mt Kenya shift (slider, default 55%) | That share of Ruto's 2022 Mt Kenya vote moves to the opposition | Engine repo regional assumption: GEMA transfer 60% (40–80) |
| Gachagua runs separately | 75% of that moved vote goes to him as third force instead | Assumption |
| ODM (Oburu) backs Ruto | 30% of the 2022 Raila vote in Nyanza, 20% Coast, 10% Western/Nairobi, 5% Rift moves to Ruto; 10% in Kisii/Nyamira | TIFA Jul 2026: Ruto ~40% in Nyanza (14% in 2022) |
| Sifuna runs on his own ticket | Of the remaining opposition vote, 45% Western/Nairobi, 30% Coast, 20% Nyanza, 5% elsewhere goes to him | TIFA Jul 2026: Sifuna 28% Western, 27% Coast, 22% Nairobi |

The realigned third-force vote is added after the leakage rule so it isn't amplified.
The old `TF_GACH` table is removed.

**Calibration check** (deterministic, default "Current trajectory"): Ruto 44.5,
opposition 40.4, third force 15.0, against the anchor default of 43.5 / 39 / 17
(average of the two latest model-eligible polls, Swiss Poll Aug and Infotrak Jul 2026).
Regional: Ruto 34% in Nyanza, Sifuna 33% in Western/Nairobi and 23% at the Coast.

**Presets** (seeded 200-draw Monte Carlo each):

| Scenario | Ruto | Opposition | Third force | Most likely |
|---|---|---|---|---|
| Current trajectory | 44.5 | 40.4 | 15.0 | Run-off (~99%) |
| Grand opposition (Sifuna joins) | 44.0 | 49.4 | 6.6 | Run-off (~60%), opposition outright ~40% |
| Fragmented field (Gachagua and Sifuna run) | 45.0 | 33.3 | 21.7 | Run-off (~99%) |
| ODM walks out | 38.1 | 53.7 | 8.2 | Opposition outright (~96%) |

**Poll anchor** now measures the gap from the model's own result at the same
settings, rather than from the fixed 2022 national result, which would have
double-counted the realignment.

These transfer rates are judgement calls, not measurements. The first item on
the data roadmap is to replace them with regional cuts from published polls.

## Open: needs a modelling decision (not changed)

1. **Run-off turnout.** Round two reuses round-one turnout and fixed cluster transfer
   rates (`R2T`). It also assumes the run-off is Ruto vs the opposition bloc,
   even when the third force (e.g. Sifuna) out-polls the opposition in round one.
2. **Reproducibility.** Seeded Research mode covers `mc()` and, since v6, the
   scenario cards. Live-event shocks still use `Math.random`.
3. **Errors are swallowed.** `mc()` still wraps each iteration in an empty
   `catch`. A failing run is silently dropped but still counted in the
   denominator.

## Data notes

- Wards: the official 1,450 IEBC wards. Registered voters are observed (2022,
  IEBC Gazette Notice 7290; 10 Mandera wards split from their constituency
  total) and scaled to 2027 by county. Turnout bases vary by constituency where
  2022 Form 34B turnout is published (186/290). Vote leanings (`bi`, `bo`)
  and `dq`, `vl`, `yr` are county values; `dn` is a model attribute.
  Built by `scripts/build-wards.mjs` from the Kenya Data Atlas.
- The transport network in `data/transport.js` is marked `source: "synthetic"`.
- County geometry has 38 source polygons and 9 proxy polygons (shown in the
  Map tab's diagnostics).
