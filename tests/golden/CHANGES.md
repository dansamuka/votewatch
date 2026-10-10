# Golden-master change log

`scripts/golden-master.mjs` fails on any difference between the engine and
`tests/golden/golden.json`. When a change to the numbers is intended, regenerate the
snapshot with `node scripts/golden-master.mjs --update` and add an entry here explaining
what moved and why, so every published number change is traceable to a reviewed commit.

## Baseline — captured at a49f66f (deployed main, 10 Oct 2026)

28 deterministic cases (6 preset line-ups, 2 extra register scenarios, 20 fixed random
settings) and 3 seeded Monte Carlo cases (300 Research-mode runs each).
