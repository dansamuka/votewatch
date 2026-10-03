# Engine and data audit (v5.0–6.0, October 2026)

Scope: the scenario engine in `js/app.js` (`sim`, `mc`, `r2sim`, `disRisk`,
`tipPts`, shocks), the rendering that reports its numbers, and the data files.

Verification: a Node harness loads the data and `app.js` in a VM and compares
deterministic runs and a seeded 300-iteration Monte Carlo run before and after
the changes. With no shocks active, every national, county and ward figure
is **bit-for-bit identical** to v4.6. Only runs that include shocks differ,
because of fixes 1 and 2 below.

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

## 2027 alliance layer (v6.0)

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

- All 1,457 ward baselines are imputed from 2022 constituency aggregates
  (`dq`, `vl` and `dn` are model attributes, not observations).
- The transport network in `data/transport.js` is marked `source: "synthetic"`.
- County geometry has 38 source polygons and 9 proxy polygons (shown in the
  Map tab's diagnostics).
