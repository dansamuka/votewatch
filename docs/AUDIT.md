# Engine and data audit (v5.0, October 2026)

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

## Open: needs a modelling decision (not changed)

These affect outputs, so they need your decision; they were left as they are.

1. **Monte Carlo spread is very narrow.** `rng()` is `(sum of 4 uniforms − 2)/2`, so its
   standard deviation is about 0.29, not 1. Ward noise is independent per ward,
   so it averages out nationally. The only shared term is a ±1pp cluster
   shock. The 10–90% band for the incumbent comes out at about ±0.4pp, so
   probabilities snap to 0% or 100% (the default shows "Run-off 100%").
   *Suggested:* scale noise to unit variance and add a national swing term
   (for example σ≈2pp) shared by all wards in a draw.
2. **Run-off win rule.** `r2sim` declares a winner only with >50% *and* 25% in
   24 counties. Under Article 138(5), a run-off is decided by the most votes,
   with no county-spread test. Check against the Constitution before relying on
   "misses county test" outcomes.
3. **Run-off turnout.** Round two reuses round-one turnout and fixed cluster transfer
   rates (`R2T`).
4. **Reproducibility.** Seeded Research mode covers `mc()` only. The scenario
   matrix (60 runs per preset) and shocks use `Math.random`, so they vary
   between runs even with a fixed seed.
5. **Errors are swallowed.** `mc()` still wraps each iteration in an empty
   `catch`. A failing run is silently dropped but still counted in the
   denominator.

## Data notes

- All 1,457 ward baselines are imputed from 2022 constituency aggregates
  (`dq`, `vl` and `dn` are model attributes, not observations).
- The transport network in `data/transport.js` is marked `source: "synthetic"`.
- County geometry has 38 source polygons and 9 proxy polygons (shown in the
  Map tab's diagnostics).
