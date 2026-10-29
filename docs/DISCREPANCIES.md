# Data discrepancy log

Known gaps between VoteWatch's data and the official record, and how the model handles
each one. Counts are taken from the data files at the commit that last edited this log;
`scripts/validate-model.mjs` checks the totals that are marked *validated*.

## 2022 presidential results by constituency (`data/results2022.js`)

Votes come from a public tally of IEBC Forms 34B, checked against official Form 34B
valid-vote totals where a read exists. Each row has a `src` status:

| Status | Rows | Meaning |
|---|---|---|
| `v` | 224 | Matches the official valid-vote total within 0.5% |
| `r` | 15 | Total rescaled to the official figure (candidate split kept) |
| `c` | 2 | Official total; candidate split re-derived from the county's Form 34C (Wajir West, Juja) |
| `s` | 4 | Row had been recorded under another constituency and was swapped back (Maara, Chuka/Igambang'om, Kajiado East, Kajiado West) |
| `u` | 45 | **No official total read to check against.** The county-level candidate split is checked against independent compilations in all 47 counties, but constituency totals in these rows are unverified |

Rescaled (`r`): Garissa Township, Fafi, Igembe South, Igembe North, Kangundo, Makueni,
Othaya, Kandara, Turkana West, Rongai, Narok West, Luanda, Sirisia, Kitutu Chache South,
Embakasi West. The 45 unchecked rows are listed in the `Check` column of the
"2022 results by constituency" CSV export.

*Validated:* Ruto and Odinga totals within 0.2% of IEBC's declared figures; candidate
splits agree with independent county compilations in all 47 counties.

## Votes cast outside the counties (diaspora and prisons)

IEBC declared Ruto 7,176,141 and Odinga 6,942,930. The constituency tally gives
7,170,304 and 6,936,396, so at least **12,371** valid votes were cast outside any county.
The two minor candidates' out-of-county votes are not in the source, so the true total
is slightly higher. The model adds out-of-county votes to the national denominator at
the 2022 rate and splits them in proportion to the national result (an assumption). They
count toward no county's 25% test.

## Rejected ballots

The tally records 111,906 rejected presidential ballots (0.78% of ballots cast). Two rows
have no rejected figure and count as zero. The model uses each county's 2022 rejection
rate to convert ballots cast into valid votes.

## Ward register and ward results (`data/wards.js`)

- **Register:** IEBC Gazette Notice 7290, 22,102,532 by ward (*validated*). The **10
  Mandera East and Lafey wards** were on a boundary hold, so the gazette gives only
  their constituency totals. The model splits each constituency total equally across
  its held wards. This is a reconciliation rule, not a measurement.
- **Results:** IEBC publishes no ward-level presidential totals. **Every ward inherits
  its constituency's 2022 result.** Ward figures in the app and the ward CSV
  (`Resolution = constituency-inherited`, `ModelledNotOfficial = yes`) are modelled, and
  constituency is the finest level the results data supports.
- **Turnout:** 186 constituencies use official 2022 Form 34B turnout. The other 104 use
  (valid + rejected) / registered from the tally.

## Register scenarios

| Scenario | Total | Status |
|---|---|---|
| 2022 certified | 22,102,532 | Gazetted (*validated*) |
| Gross-additions proxy, Aug 2026 | 25,039,048 | 2022 register + 2,936,516 gross new registrations, allocated by IEBC's April 2026 county figures. **Removals since 2022 (deaths, transfers) are not netted out**, so it overstates the register. Not gazetted |
| IEBC 2027 planning target | 28,500,000 | A target, not a register |

## History

- **2013 county shares removed.** The shares on file contradicted the 2013 county winner
  in 9 counties, so they were taken out rather than corrected by guesswork.
- 2017 county history is present for all 47 counties (*validated*).
