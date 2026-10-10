# Golden-master change log

`scripts/golden-master.mjs` fails on any difference between the engine and
`tests/golden/golden.json`. When a change to the numbers is intended, regenerate the
snapshot with `node scripts/golden-master.mjs --update` and add an entry here explaining
what moved and why, so every published number change is traceable to a reviewed commit.

## Baseline — captured at a49f66f (deployed main, 10 Oct 2026)

28 deterministic cases (6 preset line-ups, 2 extra register scenarios, 20 fixed random
settings) and 3 seeded Monte Carlo cases (300 Research-mode runs each).

## Valid votes: rejected ballots and out-of-county votes (Phase 0, item 4)

Ward turnout bases count ballots cast, and the engine used to treat every ballot cast as
a vote for someone. Valid votes are now ballots cast × (1 − the county's 2022 rejection
rate from Forms 34B; 0.78% nationally), and 12,371 out-of-county votes per 14.2m (2022
diaspora and prisons) are added to the national denominator only.

- County shares: unchanged (rejection applies equally to every contestant in a county).
- National shares: move by at most 0.023 points (counties with higher rejection rates
  carry slightly less weight). Validator default stays 38.4 / 37.6 / 24.0.
- County vote totals: about 0.8% lower (valid, not cast).
- Monte Carlo outcome frequencies: unchanged; county 25%-pass frequencies move by at
  most 2 of 300 draws, from integer rounding at the line.
