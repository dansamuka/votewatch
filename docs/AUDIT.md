# Engine and data audit (v5.0–5.1, October 2026)

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

## Open: needs a modelling decision (not changed)

1. **Run-off turnout.** Round two reuses round-one turnout and fixed cluster transfer
   rates (`R2T`).
2. **Reproducibility.** Seeded Research mode covers `mc()` only. The scenario
   matrix (60 runs per preset) and shocks use `Math.random`, so they vary
   between runs even with a fixed seed.
3. **Errors are swallowed.** `mc()` still wraps each iteration in an empty
   `catch`. A failing run is silently dropped but still counted in the
   denominator.

## Data notes

- All 1,457 ward baselines are imputed from 2022 constituency aggregates
  (`dq`, `vl` and `dn` are model attributes, not observations).
- The transport network in `data/transport.js` is marked `source: "synthetic"`.
- County geometry has 38 source polygons and 9 proxy polygons (shown in the
  Map tab's diagnostics).
