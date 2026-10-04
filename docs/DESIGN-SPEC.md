# VoteWatch 2027: Design Audit and Production Spec (v9)

**Audited build:** `77fea78` (live at dansamuka.github.io/votewatch), 4 Oct 2026.
**Method:** I measured the source statically and inspected the running site.
- **Static analysis:**
  - parsed `css/app.css` (738 lines, 608 top-level rules) and the 4 UI scripts;
  - tallied every spacing, type, radius, shadow and motion value;
  - computed WCAG contrast for every token pair.
- **Live inspection:**
  - all 9 tabs at 1440, 768 and 375px, in light and dark;
  - DOM measurements of grids, rendered font sizes, touch targets, headings and focus rules.

**What already meets the bar:**
- the tokenised light/dark theme;
- the Atlas palette;
- data graphics that animate only `transform`;
- the lazy pane rendering;
- the hashed single-bundle build;
- the county-band and map interactions.

The debt is below that layer. **`app.css` is four design eras stacked on each other**, and the cascade, not the system, decides what renders. Most findings below trace back to that.

---

## Findings at a glance (severity ordered)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | Cascade layering: 75 selectors are defined more than once | `.pan` ×7, `.kpi` ×6, `.btn` ×6, `.hdr` ×5, `.tabs` ×5, `.kpi-v` ×5. `.hdr` still carries a dead `#03050d→#08101e` gradient and a `0 12px 45px rgba(0,0,0,.28)` shadow; `.pan` radius is 12 in one rule and 16 in a later one | High: every change risks regressions |
| F2 | The weight hierarchy collapses | Inter is loaded at `400;500;600` only, but CSS asks for 650 (×3) and 700 (×3), so both render as 600 | High |
| F3 | Overview card row leaves a hole | `#kpiRow` is a 3-column grid (332px each) with 2 children, so 332px is empty at 1440 | High |
| F4 | The header breaks below 1024px | At 768 the verdict wraps to 3 lines beside the buttons. At 375 the header plus tabs take 176px (22% of the first screen) | High |
| F5 | Colour semantics contradict each other | Verdict dot: Ruto's side (team A) wins in blue `--accent`, the opposition wins in `--c-red`, while team A is orange and team B blue everywhere else. Scenario cards use red/green/orange titles and stripes. The tornado uses green for "raises A" | High |
| F6 | The Report tab is off-system | Separate visual language (all-caps blue title, grey mono tiles). Old vocabulary ("Incumbent", "Opposition", "Third Force", "Run-off forcing signal: true"). Seed, iteration count and "TECHNICAL QA · PASS" shown in Public view. Heat colours `#8B2020 #8B5010 #8B7010 #1a6535` hard-coded in JS | High |
| F7 | Light-mode contrast misses on sunken wells | On `--canvas-sunken`: `--team-a-ink` 4.43, `--team-c` 4.38, `--c-green` 4.28, `--c-amber` 4.29, `--ink-subtle` 4.50 (borderline). Guide step numbers are `#111` on accent: **2.90:1** | High (AA) |
| F8 | Touch targets fall short | 106 controls under 44px at 375. Header buttons are 32px; team-name inputs 20px and chip remove buttons 24×22 fail **WCAG 2.2 AA 2.5.8** (24px) | High (AA) |
| F9 | The spacing grid drifts | 129 spacing declarations use tokens, but 165 are raw px. 82 sit off the 4pt grid (2, 3, 5, 6, 7, 9, 10, 11, 14, 18, 22px) and 124 off the 8pt grid | Medium |
| F10 | Type values drift | 19 declared font sizes, 17 line-heights, 15 letter-spacings. 9 distinct sizes render on Overview alone, including 13.33px (UA form default), 17px and 19.5px | Medium |
| F11 | Motion is heavy | `tabReveal` takes 420ms and animates `filter: blur(5px)`. `metricPop` animates `letter-spacing` (forces layout). `auroraDrift` animates a fixed `inset:-35%` layer forever, which costs GPU time and battery. 3 transitions run on `width`/`left`/`flex`. 4 parallel timing systems (.12/.15/.18/.24s plus tokens) | Medium |
| F12 | Reduced motion is too blunt | A global `transition:none !important` also removes colour and opacity feedback on hover, press and select | Medium |
| F13 | Information repeats | Verdict shown in the header and again in the race header. National shares appear 3× on Overview (race strip, region tiles, "What this means" #5) | Medium |
| F14 | Technical detail leaks into Public view | Dispute tab: a mono methodology paragraph and the DQ and Volatility columns. Swing table: DQ chips. Report: QA tables | Medium |
| F15 | The dark-mode choropleth goes muddy | Weak-lead steps mix the team colour into the dark surface, so orange turns brown (Turkana) and blue turns slate. The lake label is near-invisible on dark water | Medium |
| F16 | Every panel is a scroll container | `.pan{overflow-x:auto}` clips focus rings and shadows of children and blocks `position:sticky` inside panels. The map's ward table is clipped ("Vot…") | Medium |
| F17 | Headings are flat | Only 1 h1, 9 h2 (tab names) and 2 h3. The 35 panel titles are `div.pan-t`, so screen-reader heading navigation is useless | Medium |
| F18 | Focus is weak on county squares | `.cb-c:focus-visible` only scales (no ring), which is borderline under 2.4.11 | Low |
| F19 | Breakpoints are fragmented | 12 different media widths (680, 720, 760, 768, 900, 1023, 1100, 1200, 1360, 1500…) plus 10 different container widths | Low |
| F20 | Run-off labels don't match | The three lean cards (to opposition / to Ruto / even) and the flow toggle (to leader / even / to runner-up) use different names and a different order | Low |
| F21 | Surface tiers are indistinct | Light `--surface #FFFEFB` vs `--surface-raised #FFFFFF` is a 1-unit difference, and `--overlay` equals raised, so tiers come from shadow alone | Low |

---

## 1. Structural layout and typographic cadence

### 1.1 Spatial system: 8pt, with a 4pt half-step inside components only

**Rule:**
- Layout spacing between and around containers is a multiple of 8.
- Spacing inside a component (icon-to-label, legend swatch, chip padding) may use 4 or 12.
- Nothing else is allowed.

| Token | px | Use |
|---|---|---|
| `--sp-1` | 4 | swatch-to-label, icon gap in chips |
| `--sp-2` | 8 | control internal gap, table cell inline padding |
| `--sp-3` | 12 | chip/button inline padding, list row padding |
| `--sp-4` | 16 | card padding on phones, gap between cards, mobile gutter |
| `--sp-6` | 24 | card padding on desktop and tablet, section gap inside a pane |
| `--sp-8` | 32 | gap between pane sections, desktop gutter |
| `--sp-12` | 48 | top of pane to first section on desktop |

**Migration map for the 82 off-grid values:**
- 2 and 3 → 4
- 5, 6 and 7 → 8 (or 4 for icon gaps)
- 9, 10 and 11 → 12
- 14 → 16
- 18 and 22 → 24

There are two exceptions:
- 1px hairlines;
- the `top:-2px` overhang of the 50% line.

**Bounding containers.** There are three container classes and nothing else:
- `.pan`: card, `padding: var(--card-pad)`, where `--card-pad` is 24 above 720px of container width and 16 below;
- `.well`: sunken inset, padding 12/16, radius `--r-md`;
- `.row`: unpadded list row, 12px block padding with a hairline.

Remove the per-component paddings on `.race`, `.ro-card`, `.sqc`, `.impl-box` and `.kpi`; they inherit the card.

### 1.2 Type scale

Use one ratio for display sizes (≈1.25) with a fixed 13/15 text pair. Line heights snap to 4px. Tracking tightens as size grows, which is optical sizing for Inter.

| Token | Size / line-height | Tracking | Weight | Font | Role |
|---|---|---|---|---|---|
| `--t-micro` | 11 / 16 | +.08em, caps | 500 | JetBrains Mono | axis ticks, eyebrows (only) |
| `--t-xs` | 12 / 16 | 0 | 400/500 | Inter (Mono for codes) | meta, table footnotes |
| `--t-sm` | 13 / 20 | 0 | 400/500 | Inter | table body, secondary copy |
| `--t-md` | 15 / 24 | −.006em | 400/600 | Inter | body, card titles (600) |
| `--t-lg` | 18 / 28 | −.012em | 600 | Inter | pane section titles |
| `--t-xl` | 24 / 32 | −.018em | 600 | Inter, `tnum` | figures in cards and legends |
| `--t-2xl` | 30 / 36 | −.022em | 600 | Inter, `tnum` | tile figures |
| `--t-kpi` | 44 / 48 | −.03em | 600 | Inter, `tnum` | hero figure (one per screen) |

**Weights.** Load `Inter:wght@400..700` as a variable font, which is one file, with `display=swap`. Then 650 (title emphasis) is real, or remove 650 and 700 entirely. The recommended set is **400 / 500 / 600**: 600 for titles and figures, 500 for labels and tabs, 400 for everything else.

**Numerals.** Every figure gets `font-variant-numeric: tabular-nums`, so columns and animated values don't jitter. Turn on `font-feature-settings:"cv11"` (single-storey a) for a more geometric, Linear-like voice.

**Mono discipline.** JetBrains Mono is currently on 37 declarations, including whole paragraphs (Dispute method note, Report). Restrict it to:
- ≤12px labels,
- axis ticks,
- vote counts in tables,
- codes and dates.

Never use it for prose.

### 1.3 Scanability and monotony

| Area | Problem | Fix |
|---|---|---|
| Overview | Shares appear 3 times. The "What this means" list repeats figures from the cards directly above it | One figure per fact. Keep the race strip as the source and turn "What this means" into 3 sentences of *consequence*, not restated numbers |
| Overview card row | 2 cards in 3 tracks (F3) | `grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))` |
| Swing counties | Five consecutive boxed blocks with equal weight. Two tiles say the same thing ("Already <50%") | Collapse "Vote needed to force a run-off" into one sentence under the beeswarm. The 24-county test keeps its tiles |
| Dispute, Swing and Map tables | 9–10 columns, mono everywhere, DQ jargon | Public view gets 5 columns (County · Lead · Margin · A · B). The rest sits behind "More columns" |
| Article 138 | "Past results" is text triplets; "Western and Coast counties" is a long plain list | Sparklines (2.3); a two-column dense list with an inline 25% bullet |
| Report | A different product | Re-skin on system components (component matrix) |

**Container constraints:**

| Viewport | Layout |
|---|---|
| **≥1280** | Sidebar 320px, sticky with internal scroll. Main column `max-width: 1120px`, centred in the remaining space. Prose `max-width: 68ch` |
| **768–1279** | No sidebar. "Scenario settings" becomes the existing collapsible card, pinned under the tabs as a sticky 48px bar showing the current teams ("Ruto's side vs United opposition · 85% follow") that expands on tap. Card grid 2-up |
| **<768** | Single column, `--gutter: 16px`, card padding 16. Header collapses to one 56px row (6.1). Tabs become a scroll-snap row with edge fades. Race legend 2×2, not 1×5 (it is about 420px tall today) |

---

## 2. Graphic direction and visual storytelling

The domain is elections, not civil engineering, so the "technical schematic" brief translates into constitutional and electoral instruments. These are graphics that draw the rule (50%+1, 25%×24), not decoration.

### 2.1 Hero visual anchor: "The Path to State House" ribbon

**Concept.** Fuse the three things a visitor needs into a single SVG ribbon at the top of Overview, about 9 KB of markup with no library:
- Who leads: first-round shares;
- How far from winning: the gap to 50%+1, annotated as "+3.4 pts to win outright";
- Whether the 24-county rule passes: a 47-tick county comb under it, in the same coordinate system.

**Layout at 1120px:**

```
┌───────────────────────────────────────────────────────────────────────────┐
│ RUN-OFF LIKELY · 94% of 1,000 simulations             15,214,240 votes    │  ← eyebrow + figure
│ United opposition vs Ruto's side                                          │  ← t-lg, team-coloured names
│                                                                           │
│  ███████████████████████████████│██████████████████▌▓▓▓▓░░░░░░░           │  ← shares ribbon, 28px
│  46.6% United opposition  ←3.4→ │ 50%+1   38.2% Ruto's side   6.0%  9.1%  │  ← labels below, never inside
│                                 ┆                                         │
│  A ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮┆▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯   34 of 47 ≥25%      │  ← 47-tick comb,
│  B ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮┆▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯   35 of 47           │    24th tick marked
│                                                     [Kenya dot-map ◦]     │  ← 47 centroid dots,
└───────────────────────────────────────────────────────────────────────────┘    120×136, leader colour
```

**Narrative authority** comes from three things:
- the rule lines (50%+1 and the 24th tick) are the only black marks;
- the gap annotation tells the story in one glance;
- a 120px **Kenya centroid dot-map** (47 circles at county centroids, coloured by leader, sized by registered voters) anchors it geographically.

The dot-map costs 47 `<circle>` elements placed at the centroids `KE_GEO` already ships (`c.c`); tapping it opens the Map tab.

**Performance:**
- the ribbon and comb are the existing `.rs` and `.ctyband` DOM, restyled;
- the dot-map is built after first paint in `requestIdleCallback`;
- there is no canvas and no font or image download, so LCP is unchanged.

**The header verdict docks.** The hero is the single source of the verdict. The header pill appears only once the hero scrolls out of view (`IntersectionObserver`, code in 6.3). That removes F13 and gives the header a reason to exist.

### 2.2 Bespoke instruments to replace generic glyphs

| Where | Today | Instrument |
|---|---|---|
| Article 138 | Two gate tracks (good) | **Constitutional gate schematic.** Two stacked tracks share a left edge. Each has a "door" at its threshold, drawn as an open or closed bracket glyph. Each team's marker passes through or stops at the door. "Passes both" lights a bracket that joins the two doors. Same SVG, roughly 30 lines added |
| Run-off | Sankey (good) | Keep it. Put the R1 and run-off axis labels *above* the columns, which clears the clipped bottom labels. Ribbons fill at 35% and darken to 60% on hover |
| Scenario cards | Text list of who joins whom, plus three bars | **Coalition composition bar.** One 8px bar per team, segmented by each member's polling share (Ruto 33.7 · Kindiki…). It shows *why* a coalition is big. Names on hover; segments are hairline-separated in the team hue at 100/80/65/50% |
| County card (Map) | Bars plus stats | **Margin gauge.** A diverging bar centred on "level" with the ±5pt petition zone hatched and the county's margin as a pin. The same encoding as the Dispute margin strip, so it reads as a family |
| Tab icons | Generic 16px line icons | Keep them for wayfinding, but draw each at 1.5px stroke on the 16px grid. Run-off = two converging arcs, Article 138 = two doors, Dispute = gavel-free scale glyph |

### 2.3 Data-density graphics

| Graphic | Spec | Replaces |
|---|---|---|
| **Sparkline: incumbent-side share** 2013 → 2017 → 2022 → 2027 model | 96×24 SVG, 1.5px stroke `--ink-muted`; 2027 point is a 5px dot in team-A colour with a dashed final segment (a projection, not a result); min and max dots on hover | "Past results" text triplets (Article 138) |
| **Bullet gauge: 25% test by region** | 6px track; fill = counties passing ÷ total in `--team-a`; tick at 24/47-equivalent share; label "16/16" right-aligned in tnum | All-green bars (green = "ok" is wrong here; this is team A's coverage) |
| **Poll trend** (Signals) | Under the small multiples, a 2-line sparkline (A, B) across the 8 polls by date; held-out polls hollow | Nothing; adds the time dimension that is missing today |
| **Inline delta chips** | `▲ 0.7` / `▼ 0.6` in 12px tnum; colour is team-neutral (`--ink-muted`) with direction shown by the glyph | Red and green deltas (red/green are reserved for risk and ok) |
| **Tornado (What moves the result)** | Bars in `--ink-subtle`; the bar that *crosses* 50% or 25% outlines in `--accent`; values tnum | Green/orange bars (F5) |
| **Margin histogram** (Dispute) | 2pt bins from −20 to +20; petition zone hatched | The current beeswarm, at ≥40 dots per cluster only |

**Data-ink rules:**
- one hue per team, everywhere;
- grids at `--line`;
- labels outside marks, never inside segments (the 50%+1 chip currently sits *on* the bar);
- every number in a graphic is also in the accessible label.

---

## 3. Colour architecture, surfaces and depth

### 3.1 Surface system

Four tiers with perceptible steps. The light theme gets warm paper (Atlas lineage); dark gets blue-black.

| Tier | Light | Dark |
|---|---|---|
| `--canvas` | `#F6F5F1` · hsl(48 22% 95.5%) | `#0B0D10` · hsl(216 19% 5.3%) |
| `--canvas-sunken` (wells, tracks) | `#EEECE6` · hsl(45 19% 91.8%) | `#07080A` · hsl(220 18% 3.3%) |
| `--surface` (cards) | `#FFFFFF` · hsl(0 0% 100%) | `#12151A` · hsl(218 18% 8.6%) |
| `--surface-raised` (menus, hovered card, sheet) | `#FFFFFF` with `--shadow-2` | `#191D23` · hsl(216 17% 11.8%) |
| `--overlay` (glass header, popovers) | `color-mix(in oklab, #FFFFFF 82%, transparent)` + blur | `color-mix(in oklab, #20252C 82%, transparent)` + blur |

**Light depth.** In light mode, depth comes from **shadow**, not from fill. That is why `surface` and `raised` are both white and `#FFFEFB` is dropped: it read as a dirty white next to true-white popovers. **Dark depth.** In dark mode, depth comes from **lightness steps of +3.3% L** per tier.

### 3.2 Hairlines and ambient depth

Replace `border:1px solid` everywhere with **ring shadows**. They don't affect layout, they compose with elevation, and they render at 0.5px on 2× screens.

```css
--ring:        0 0 0 1px var(--line);
--hi:          inset 0 1px 0 rgb(255 255 255 / .7);           /* dark: / .05 */
--shadow-1:    var(--ring), 0 1px 1px rgb(20 22 26 / .03), 0 2px 4px -2px rgb(20 22 26 / .06);
--shadow-2:    var(--ring), 0 1px 2px rgb(20 22 26 / .04), 0 6px 12px -4px rgb(20 22 26 / .08), 0 16px 32px -12px rgb(20 22 26 / .12);
--shadow-3:    var(--ring), 0 2px 4px rgb(20 22 26 / .05), 0 12px 24px -6px rgb(20 22 26 / .12), 0 32px 64px -16px rgb(20 22 26 / .18);
@media (min-resolution: 2dppx) { :root { --ring: 0 0 0 .5px var(--line-2); } }
```

These are three ambient-occlusion layers (contact, near, far) at low alpha with negative spread, so they never haze the canvas. Delete the 13 hard-coded `rgba(0,0,0,…)` shadows. Dark mode keeps a single 1px ring at 12% white plus one far shadow at 50% black, because shadows are invisible on near-black.

### 3.3 Semantic accents and contrast (WCAG 2.2)

Values marked ★ are corrected so they meet ≥4.5:1 on **both** `--surface` and `--canvas-sunken` (computed):

| Role | Light | on surface / sunken | Dark | on surface |
|---|---|---|---|---|
| `--ink` (body) | `#14161A` | 17.96 / 15.46 | `#ECEEF1` | 15.45 |
| `--ink-muted` (secondary, ≥7:1) | `#4B4F57` | 8.15 / 7.02 | `#AEB4BE` | 8.62 |
| `--ink-subtle` ★ (meta only) | `#656971` | 5.51 / 4.66 | `#8E95A0` | 5.95 |
| `--accent` | `#1558C4` | 6.51 / 5.51 | `#8AB6FF` | 8.74 |
| `--team-a` (fills only) | `#D97706` | 3.16 (non-text ≥3 ✓) | `#F5A623` | 8.86 |
| `--team-a-ink` ★ | `#9B5805` | 5.54 / 4.69 | `#F7B955` | 10.29 |
| `--team-b` | `#1558C4` | 6.51 / 5.51 | `#8AB6FF` | 8.74 |
| `--team-c` ★ | `#017862` | 5.43 / 4.60 | `#3CC9A8` | 8.65 |
| `--team-d` | `#6D28D9` | 7.04 / 6.07 | `#C4A7F5` | 8.72 |
| `--c-red` (risk) | `#B42318` | 6.57 / 5.57 | `#F87171` | 6.49 |
| `--c-green` ★ (ok) | `#077A37` | 5.46 / 4.62 | `#4ADE80` | 10.31 |
| `--c-amber` ★ (watch) | `#AC4E03` | 5.46 / 4.62 | `#F0A93B` | 8.93 |
| Guide step number | **white** on accent (was `#111`, 2.90) | 6.51 | `--accent-ink` on accent | 9.40 |

**Semantic contract.** Write this into `tokens.css` as a comment and enforce it in review:
- **Team hues identify sides:** A = amber-orange, B = blue, C = teal, D = violet, others = slate. They never mean good or bad.
- **Lifecycle hues mean state:** red = risk, contested or blocked; green = passes or ok; amber = watch. They never identify a side.
- **Accent** is interactive or selected only: links, focus, selected tab.

That contract fixes three things:
- the verdict dot (use the winning team's hue, and `--c-amber` for "run-off");
- the scenario-card titles and stripes (outcome chip in a lifecycle hue, title in `--ink`);
- the tornado colours.

### 3.4 Choropleth ramps (OKLCH, computed)

Five steps by lead strength. Dark ramps go **from desaturated mid-grey to full hue**, never toward black, which fixes F15.

| | weak → strong |
|---|---|
| Light A | `#FBD6BB` `#ECB890` `#DD9A65` `#CD7C34` `#AC5D01` |
| Light B | `#CCDFFF` `#9BBFFA` `#6B98E3` `#3C71CC` `#094FBA` |
| Dark A | `#71604A` `#94744B` `#B78849` `#DC9D42` `#FEB344` |
| Dark B | `#545E6E` `#637593` `#738DB8` `#82A6E0` `#98BFFF` |

Counties get a 0.75px `--surface` stroke, so adjacent weak steps (1.1–1.5:1 to each other) still separate. Lake labels in dark use `--ink-muted` with a 3px `paint-order: stroke` halo in `--water`.

### 3.5 Ambient light and glass

- **Replace `auroraDrift`.** Keep one static radial wash at the top of `body`: `radial-gradient(1200px 480px at 20% -10%, color-mix(in oklab, var(--accent) 6%, transparent), transparent)`. Do not animate it. It costs nothing after first paint.
- **Header glass:** `background: color-mix(in oklab, var(--canvas) 80%, transparent); backdrop-filter: saturate(1.6) blur(16px);`.
- **Fallback:** `@supports not (backdrop-filter: blur(1px)) { background: var(--canvas) }`.
- **Where glass is allowed:** only on the sticky header, the mobile bottom sheet and popovers. Cards are never glass, because data must sit on a stable ground.

---

## 4. Kinematics and tactile micro-interactions

### 4.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 80ms | press-down, toggle thumb |
| `--dur-fast` | 140ms | hover colour or shadow, focus ring, tab underline |
| `--dur-base` | 220ms | popover/menu enter, card lift, chip add/remove |
| `--dur-slow` | 320ms | bottom sheet, sidebar drawer |
| `--dur-data` | 480ms | data morphs (race segments, flow ribbons, dots) |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | anything entering or responding (expo-out) |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | data morphs and position changes |
| `--ease-in` | `cubic-bezier(.7, 0, .84, 0)` | exits, at about 0.6× the enter duration |

Remove the 4 ad-hoc systems (`.12s`, `.15s`, `.18s ease`, `.24s`, `.35s`, `.5s`, `.55s`, `.65s`).

### 4.2 Choreography

| Element | Enter | Exit | Channels |
|---|---|---|---|
| Tab pane switch | `opacity 0→1` over 140ms `--ease-out` (drop the 10px translate and the `blur(5px)`) | instant | opacity |
| Card hover (clickable cards only: scenario, county band, KPI) | `translateY(-1px)` plus shadow-1 → shadow-2. Animate the *opacity* of a `::after` that carries shadow-2, not `box-shadow` itself | reverse at 140ms | transform, opacity |
| Export menu / popover | `opacity 0→1; scale(.98)→1`, origin top-right, 220ms `--ease-out` | 120ms `--ease-in` | transform, opacity |
| Mobile bottom sheet | `translateY(calc(100% - 72px))` → `0`, 320ms `--ease-out`. Drag follows the finger 1:1; release snaps with velocity | 200ms `--ease-in` | transform |
| Race segments, gates, flow ribbons | 480ms `--ease-in-out` (already transform-based; keep) | n/a | transform |
| Slider scrub | Thumb `scale(1.15)` on `:active` at 80ms. The value label tracks the thumb. Model re-runs are rAF-throttled, and figures *don't* re-animate while scrubbing (`metricPop` off during input) | n/a | transform |
| KPI figure change | 140ms opacity cross-fade between old and new value (no `letter-spacing`, no scale) | n/a | opacity |
| Live-events dot | `scale` pulse 1→1.6 with opacity 1→0 on a `::after` ring, 1.6s | n/a | transform, opacity |

**Remove** the transitions on `width` (×1), `left` (×2) and `flex` (×1). They are progress fills and a marker; use `transform: scaleX()` and `translateX()` instead.

### 4.3 Tactile states (every interactive control)

| State | Spec |
|---|---|
| Rest | `--shadow-1` on raised controls; text `--ink-muted` for secondary buttons |
| Hover | background `color-mix(in oklab, var(--ink) 4%, var(--surface-raised))`; text → `--ink`; 140ms |
| Pressed (`:active`) | `transform: translateY(1px)` (buttons) or `scale(.97)` (chips, segmented items); shadow → ring only; 80ms |
| Selected | Segmented: raised white pill with `--shadow-1`. Tab: 2px underline in `--accent` that slides between tabs (one shared `::after`, `translateX` + `scaleX` from the active tab's rect) |
| Focus-visible | `box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent)` (ring with a surface gap, never clipped). County squares and map counties get the same ring, not just `scale` |
| Disabled | `opacity:.45; pointer-events:none`; the reason goes in the `title` |
| Loading | Panes not yet rendered show skeleton blocks at final size (no layout shift). The skeleton is a `linear-gradient` highlight swept with `translateX` on `::after`, 1.4s linear. The pane gets `aria-busy="true"` |

### 4.4 Reduced motion that keeps feedback

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
  /* movement off; colour/opacity feedback stays, but short */
  .rs-segs i, .mark, .flow .rib, .cty-card, .tpane, .menu-pop, .vm-c { transition-property: opacity, background-color, color, box-shadow !important; transition-duration: 80ms !important; }
}
```

---

## 5. Component-by-component upgrade matrix

| Section / Component | Current implementation | Flaws and anti-patterns | High-craft alternative | Expected impact |
|---|---|---|---|---|
| **App header** | Flex row: brand · centred verdict · 5 buttons; glass background | 5 stacked `.hdr` definitions. Verdict wraps to 3 lines at 768. 22% of the first phone screen is chrome. Buttons 32px | Container-query grid (6.3). One 56px row on phones with icon-only actions at 44px. The verdict docks only after the hero scrolls out | Calmer first screen; +120px of content on phones |
| **Verdict pill** | Dot + title + "% of simulations" | Repeats the hero. Dot tone: team A in blue, opposition in red (F5) | The winning team's hue, or amber for run-off. Only shown when the hero is off-screen | Removes a contradiction and a duplicate |
| **Tab bar** | 9 buttons with icons; overflow scroll | No overflow cue at 768 ("Dispute" cut). Active state was redefined 4× | Scroll-snap row, 24px edge fade masks, a sliding shared underline, `scrollIntoView({inline:'nearest'})` on select | Discoverable tabs; one active-state rule |
| **Scenario settings: Teams** | Team chips + "Add a team" | Team-name inputs 20px tall; chip remove 24×22 (fails 2.5.8) | 32px chip with a 24px remove target inside a 44px hit area (`::before` inset −10px); rename on double-click with a 32px input | AA touch compliance |
| **Who joins which team** | A/B/Solo segmented control per candidate | 8 rows × 3 tiny segments; share % in mono at the far left | 28px segmented control in team hues (selected = team-tinted pill). Share as a 40px micro-bar plus tnum | Faster scanning of coalitions |
| **Sliders (Adjust)** | Native range + datalist default tick | Thumb 16px; no live value bubble; re-animates figures while dragging | 20px thumb (44px hit area), value chip follows the thumb, figures cross-fade only on release | Tactile, precise scrubbing |
| **First-visit guide** | 4 numbered steps | Step numbers `#111` on accent = 2.90:1 | White numerals; dismiss button 44px | AA |
| **Race strip (hero)** | Div segments, 50%+1 chip on the bar, legend, 47-tick meters | Chip overlaps segments. Legend collapses to 1×5 on phones (about 420px). "Votes cast" orphaned at 768 | Ribbon spec 2.1: labels below the bar, gap-to-win annotation, 2×2 legend via container query, total moved into the header row | One-glance answer; −300px on phones |
| **KPI row** (outcome dots, dispute) | 3-track grid, 2 cards | 332px hole (F3); unequal card heights | `auto-fit minmax(min(100%,320px),1fr)` with `align-items:stretch` | No dead space |
| **Who leads each county** (band) | 47 squares by region | Region groups wrap irregularly at 768. Focus is only a scale | Region groups as a CSS grid with `grid-auto-flow:dense`; focus ring; legend "strong / lean" | Tidy, accessible |
| **What this means** | Numbered list of 5 | Restates numbers already shown | 3 consequence sentences ("Ruto's side needs about 1.8M more votes to force…") | Narrative instead of repetition |
| **National result by region** | 3 tiles + region table with split bars | Tiles repeat the hero; mono uppercase eyebrows on every tile | Drop the tiles; the table keeps split bars, sorted by margin, with a regional sparkline column | Density, no duplication |
| **What moves the result** (tornado) | Centre-anchored bars, green/orange, technical labels | Colour semantics (F5); "Incumbent swing +6pp" wording | Neutral bars; the bar that flips the outcome is outlined in accent; plain labels ("If Ruto's side gains 6 points") | Correct reading |
| **Technical detail** fold | `<details>` | Fine | Keep; analyst view opens it by default | n/a |
| **Run-off pairing** | Card with names + paragraph | Long paragraph | Two team-coloured names, then one line: "comes up in 100% of simulations" | Faster |
| **Run-off lean cards** | 3 cards with figure + bar + outcome chip | Header wraps misalign the figures. Order and names differ from the flow toggle (F20) | `grid-template-rows: subgrid` so titles, figures, bars and chips align. One vocabulary: "Others lean to opposition / split evenly / lean to Ruto's side", in the same order everywhere | Comparable at a glance |
| **Run-off flow (Sankey)** | SVG ribbons | Axis labels collide at the bottom | Labels above the columns; ribbon hover isolates a source | Legible |
| **Swing beeswarm** | 47 dots vs the 25% line, ±8 band | Good; dots at 95% stack tall | Cap the stack at 6 then "+n" | n/a |
| **Force-a-run-off tiles** | 2 grey tiles with big green text | Same message twice; grey + green clash | One sentence under the beeswarm | Less noise |
| **24-county test tiles** | Red / green tiles | Fine after the `tile` refactor; numbers wrap at narrow widths | `--t-2xl` figure + 12px label; `text-wrap: balance` | n/a |
| **Swing / Dispute / Ward tables** | 9–10 columns, mono, DQ chips | Jargon in Public view; horizontal scroll inside `.pan` | 5 public columns, "More columns" toggle, sticky first column, numerals right-aligned tnum | Readable on phones |
| **Scenario cards** | 4 cards, coloured stripe + coloured title | Red/green/orange titles (F5); stripe meaning unexplained | Title in ink; outcome as a lifecycle chip; coalition composition bar (2.2); subgrid-aligned footers | Colour means one thing |
| **Compare scenarios table** | Plain table | Fine | Add a run-off chance micro-bar column | Scan speed |
| **Article 138 gates** | Two tracks, A labels above, B below | Good | Door schematic (2.2) | Explains the rule |
| **25% test by region** | Green progress bars | Green = ok is the wrong meaning | Bullet gauge in team A hue (2.3) | Correct encoding |
| **Western & Coast list** | Long single-column list | Low density | 2-column list with an inline threshold dot | Half the height |
| **Past results** | "2013: 37.5% 2017: 40.9%…" text | Unscannable | Sparkline per region (2.3) | Trend visible |
| **Map** | SVG choropleth, measure segmented control | Dark ramps go muddy (F15); lake labels invisible in dark | OKLCH ramps (3.4); halo labels; legend shows the 5 steps | Faithful hues |
| **County card** | Outline, bars, stats, basis | Ward table clipped by the side card (`overflow` on `.pan`) | Margin gauge (2.2); the ward table opens in the bottom sheet / full-width row | No clipping |
| **Dispute KPIs** | 3 big-number cards | "28% of close counties in Mt Kenya · 7/25" is convoluted | "7 of 25 close counties are in Mt Kenya" as the figure plus caption | Plain language |
| **Dispute method note** | Mono paragraph | Technical, in Public view (F14) | Move to "How this is scored" (analyst only) | Public-view promise kept |
| **Signals: polls** | Small multiples, faded held-out polls | Good | Add the trend sparkline (2.3); dates in `--ink-subtle` 12px | Time dimension |
| **Key facts** | Dated list + "source" links | "source" repeated 10× | Make the date the link; source domain in `--ink-subtle` | Cleaner |
| **Report** | Separate design: big caps title, grey mono tiles, QA tables | Off-system, old vocabulary, hard-coded heat colours (F6) | Rebuild from system components: hero ribbon (static SVG), 4 tiles in team hues, a 3-sentence summary, a county table. QA and seed only in analyst view; heat colours become tokens | One product, print-perfect |
| **Export menu** | `<details>` popover | Fine; items 36px tall | 40px items, 220ms pop, `Esc` and outside-click close | Polish |
| **Headings** | `div.pan-t` × 35 | Flat outline (F17) | `<h3 class="pan-t">` (style unchanged) | Screen-reader navigation |

---

## 6. Production engineering and drop-in code

### 6.1 Unified `:root` (replaces `css/tokens.css`)

```css
/* VoteWatch tokens v9. Team hues identify sides; lifecycle hues (red, green, amber) mean state;
   accent means interactive. Never mix the three roles. */
:root{
  color-scheme:light;
  /* surfaces: light depth comes from shadow, dark depth from lightness */
  --canvas:#F6F5F1; --canvas-sunken:#EEECE6; --surface:#FFFFFF; --surface-raised:#FFFFFF;
  --overlay:color-mix(in oklab,#FFFFFF 82%,transparent);
  /* ink: ink and ink-muted ≥7:1 (body); ink-subtle ≥4.5:1 on every surface (meta only) */
  --ink:#14161A; --ink-2:#30343B; --ink-muted:#4B4F57; --ink-subtle:#656971;
  --line:rgb(20 22 26 / .10); --line-2:rgb(20 22 26 / .18); --line-strong:#8A8D93;
  /* interactive */
  --accent:#1558C4; --accent-ink:#FFFFFF; --accent-strong:#0F4AA8; --accent-dim:rgb(21 88 196 / .35);
  /* lifecycle */
  --c-red:#B42318; --c-green:#077A37; --c-amber:#AC4E03;
  --red-soft:#FBE9E7; --green-soft:#E7F4EC; --amber-soft:#FDF0E1;
  /* teams: fill ≥3:1, -ink ≥4.5:1 on sunken */
  --team-a:#D97706; --team-a-ink:#9B5805; --team-b:#1558C4; --team-c:#017862; --team-d:#6D28D9; --others:#5B6470;
  /* map */
  --land:#EEEBE3; --water:#D3E2F1; --waterline:#9DBAD6;
  --ramp-a-1:#FBD6BB; --ramp-a-2:#ECB890; --ramp-a-3:#DD9A65; --ramp-a-4:#CD7C34; --ramp-a-5:#AC5D01;
  --ramp-b-1:#CCDFFF; --ramp-b-2:#9BBFFA; --ramp-b-3:#6B98E3; --ramp-b-4:#3C71CC; --ramp-b-5:#094FBA;
  /* space: 8pt grid with a 4pt half-step inside components */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-6:24px; --sp-8:32px; --sp-12:48px;
  --gutter:clamp(16px, 3vw, 32px); --card-pad:24px; --page-max:1120px; --side-w:320px;
  /* radius: control · well · card */
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-pill:999px;
  /* type */
  --font-sans:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --t-micro:500 11px/16px var(--font-mono);
  --t-xs:400 12px/16px var(--font-sans);
  --t-sm:400 13px/20px var(--font-sans);
  --t-md:400 15px/24px var(--font-sans);
  --t-lg:600 18px/28px var(--font-sans);
  --t-xl:600 24px/32px var(--font-sans);
  --t-2xl:600 30px/36px var(--font-sans);
  --t-kpi:600 44px/48px var(--font-sans);
  --track-micro:.08em; --track-lg:-.012em; --track-xl:-.018em; --track-2xl:-.022em; --track-kpi:-.03em;
  /* depth */
  --ring:0 0 0 1px var(--line);
  --hi:inset 0 1px 0 rgb(255 255 255 / .7);
  --shadow-1:var(--ring),0 1px 1px rgb(20 22 26 / .03),0 2px 4px -2px rgb(20 22 26 / .06);
  --shadow-2:var(--ring),0 1px 2px rgb(20 22 26 / .04),0 6px 12px -4px rgb(20 22 26 / .08),0 16px 32px -12px rgb(20 22 26 / .12);
  --shadow-3:var(--ring),0 2px 4px rgb(20 22 26 / .05),0 12px 24px -6px rgb(20 22 26 / .12),0 32px 64px -16px rgb(20 22 26 / .18);
  --focus-ring:0 0 0 2px var(--surface),0 0 0 4px var(--accent);
  /* motion */
  --dur-instant:80ms; --dur-fast:140ms; --dur-base:220ms; --dur-slow:320ms; --dur-data:480ms;
  --ease-out:cubic-bezier(.16,1,.3,1); --ease-in-out:cubic-bezier(.65,0,.35,1); --ease-in:cubic-bezier(.7,0,.84,0);
  /* layers */
  --z-sticky:100; --z-header:200; --z-popover:300; --z-sheet:400; --z-toast:500;
}
@media (min-resolution:2dppx){:root{--ring:0 0 0 .5px var(--line-2)}}
:root[data-theme="dark"]{
  color-scheme:dark;
  --canvas:#0B0D10; --canvas-sunken:#07080A; --surface:#12151A; --surface-raised:#191D23;
  --overlay:color-mix(in oklab,#20252C 82%,transparent);
  --ink:#ECEEF1; --ink-2:#C9CED6; --ink-muted:#AEB4BE; --ink-subtle:#8E95A0;
  --line:rgb(255 255 255 / .08); --line-2:rgb(255 255 255 / .16); --line-strong:#6B7380;
  --accent:#8AB6FF; --accent-ink:#0B0D10; --accent-strong:#B3CEFF; --accent-dim:rgb(138 182 255 / .35);
  --c-red:#F87171; --c-green:#4ADE80; --c-amber:#F0A93B;
  --red-soft:#3A1214; --green-soft:#0B3520; --amber-soft:#3D2008;
  --team-a:#F5A623; --team-a-ink:#F7B955; --team-b:#8AB6FF; --team-c:#3CC9A8; --team-d:#C4A7F5; --others:#9AA4B2;
  --land:#181C22; --water:#12263B; --waterline:#2E4D6E;
  --ramp-a-1:#71604A; --ramp-a-2:#94744B; --ramp-a-3:#B78849; --ramp-a-4:#DC9D42; --ramp-a-5:#FEB344;
  --ramp-b-1:#545E6E; --ramp-b-2:#637593; --ramp-b-3:#738DB8; --ramp-b-4:#82A6E0; --ramp-b-5:#98BFFF;
  --hi:inset 0 1px 0 rgb(255 255 255 / .05);
  --ring:0 0 0 1px rgb(255 255 255 / .10);
  --shadow-1:var(--ring);
  --shadow-2:var(--ring),0 8px 24px -8px rgb(0 0 0 / .5);
  --shadow-3:var(--ring),0 24px 48px -12px rgb(0 0 0 / .6);
}
```

Load fonts as variable files with one request: `family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..500`.

### 6.2 Container queries and subgrid

Use three viewport breakpoints for the page shell only (768 / 1024 / 1280). Everything inside a pane responds to **its container**, which replaces the 12 media widths and 10 container widths.

```css
/* shell */
.app{display:grid;grid-template-columns:1fr;gap:var(--sp-6)}
@media (min-width:1280px){.app{grid-template-columns:var(--side-w) minmax(0,1fr)}}
.tpane{container:pane/inline-size;max-width:var(--page-max);margin-inline:auto}

/* one card grid for every pane: never leaves an empty track */
.cards{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));align-items:stretch}
@container pane (min-width:720px){.cards{gap:var(--sp-6)}}

/* card padding follows the card's own width */
.pan{container:card/inline-size;padding:var(--card-pad);border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--shadow-1),var(--hi)}
@container pane (max-width:719px){.pan{--card-pad:var(--sp-4)}}

/* aligned card internals: titles, figures, bars and chips line up across siblings */
.cards--aligned{grid-template-rows:auto}
.cards--aligned>.pan{display:grid;grid-row:span 4;grid-template-rows:subgrid;row-gap:var(--sp-2)}
/* use on .ro-cards (run-off lean cards) and .scen-grid (scenario cards) */

/* wide tables: scroll inside a dedicated wrapper, not the card (fixes clipped focus and sticky) */
.pan{overflow:visible}
.tscroll{overflow-x:auto;overscroll-behavior-x:contain;scrollbar-gutter:stable}
.tscroll th:first-child,.tscroll td:first-child{position:sticky;left:0;background:var(--surface)}
@container card (max-width:520px){.tbl .opt{display:none}}   /* .opt = analyst-only columns */

/* race legend: 2×2 on phones instead of 1×5 */
.race-legend{grid-template-columns:repeat(4,minmax(0,1fr)) auto}
@container card (max-width:720px){.race-legend{grid-template-columns:repeat(2,minmax(0,1fr))}.race-total{grid-column:1/-1}}
```

### 6.3 Drop-in refactor 1: App header with docking verdict

It keeps every existing ID and handler, so `rHeadline`, `setTheme`, `setViewMode`, `setLive` and the export menu work unchanged.

```html
<header class="hdr" data-docked="false">
  <div class="hdr-in">
    <a class="brand" href="#main" aria-label="VoteWatch 2027, home">
      <svg class="brand-mark" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <rect x="1" y="11" width="4" height="8" rx="1" fill="var(--team-a)"/>
        <rect x="8" y="5" width="4" height="14" rx="1" fill="var(--team-b)"/>
        <path d="M0 9.5h20" stroke="var(--ink)" stroke-width="1.25" stroke-dasharray="2 2"/>
        <rect x="15" y="14" width="4" height="5" rx="1" fill="var(--others)"/>
      </svg>
      <span class="logo">VoteWatch <span>2027</span></span>
    </a>
    <div class="verdict" id="verdict" role="status" aria-live="polite"><span class="v-title">Running the model…</span></div>
    <div class="hdr-actions">
      <button type="button" class="hbtn hbtn-icon" id="helpBtn" aria-label="How to use this page">?</button>
      <button type="button" class="hbtn" id="viewBtn" onclick="setViewMode(S.viewMode==='public'?'internal':'public')"><span class="lbl">Public view</span></button>
      <button type="button" class="hbtn hbtn-icon" id="themeBtn" onclick="setTheme(S.theme==='light'?'dark':'light')" aria-label="Switch to dark theme">☾</button>
      <button type="button" class="hbtn hbtn-icon" id="liveBtn" aria-pressed="false" onclick="setLive(!S.live)" aria-label="Live events"><span class="live-dot" aria-hidden="true"></span><span class="lbl live-txt">Live</span><span class="lbl live-timer" id="hTimer">paused</span></button>
      <details class="menu">
        <summary class="hbtn" aria-label="Export"><svg class="ico" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11"/></svg><span class="lbl">Export</span></summary>
        <div class="menu-pop" role="menu"><!-- unchanged items --></div>
      </details>
    </div>
  </div>
</header>
```

```css
.hdr{position:sticky;top:0;z-index:var(--z-header);container:hdr/inline-size;
  background:var(--overlay);-webkit-backdrop-filter:saturate(1.6) blur(16px);backdrop-filter:saturate(1.6) blur(16px);
  box-shadow:0 1px 0 var(--line)}
@supports not (backdrop-filter:blur(1px)){.hdr{background:var(--canvas)}}
.hdr-in{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:var(--sp-4);
  min-height:56px;max-width:calc(var(--page-max) + var(--side-w) + var(--sp-6));margin-inline:auto;padding-inline:var(--gutter)}
.brand{display:inline-flex;align-items:center;gap:var(--sp-2);color:var(--ink);text-decoration:none;font:var(--t-md);font-weight:600;letter-spacing:-.01em}
.brand .logo span{color:var(--accent)}
.verdict{justify-self:center;min-width:0;display:flex;align-items:center;gap:var(--sp-2);
  opacity:0;transform:translateY(-4px);pointer-events:none;
  transition:opacity var(--dur-fast) var(--ease-out),transform var(--dur-base) var(--ease-out)}
.hdr[data-docked="true"] .verdict{opacity:1;transform:none;pointer-events:auto}
.v-title{font:var(--t-sm);font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v-p{font:var(--t-xs);color:var(--ink-subtle);white-space:nowrap}
.v-dot{width:8px;height:8px;border-radius:50%;background:var(--tone,var(--c-amber));box-shadow:0 0 0 4px color-mix(in oklab,var(--tone,var(--c-amber)) 20%,transparent)}
.verdict[data-tone=inc]{--tone:var(--team-a)} .verdict[data-tone=opp]{--tone:var(--team-b)}
.hdr-actions{display:flex;gap:var(--sp-2)}
.hbtn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2);min-height:36px;padding:0 var(--sp-3);
  border:0;border-radius:var(--r-sm);background:var(--surface-raised);color:var(--ink-muted);font:var(--t-sm);font-weight:500;
  box-shadow:var(--shadow-1);cursor:pointer;
  transition:background-color var(--dur-fast) var(--ease-out),color var(--dur-fast) var(--ease-out),transform var(--dur-instant) var(--ease-out)}
.hbtn:hover{color:var(--ink);background:color-mix(in oklab,var(--ink) 4%,var(--surface-raised))}
.hbtn:active{transform:translateY(1px);box-shadow:var(--ring)}
.hbtn:focus-visible{outline:0;box-shadow:var(--focus-ring)}
.hbtn-icon{width:36px;padding:0}
/* tablet: verdict takes its own line once docked */
@container hdr (max-width:1023px){
  .hdr-in{grid-template-columns:auto 1fr;row-gap:0}
  .verdict{grid-column:1/-1;grid-row:2;justify-self:start;max-height:0;transition:max-height 0s,opacity var(--dur-fast)}
  .hdr[data-docked="true"] .verdict{max-height:32px;padding-bottom:var(--sp-2)}
  .hdr-actions{justify-self:end}
}
/* phone: one 56px row, icon-only, 44px targets */
@container hdr (max-width:599px){
  .hbtn .lbl{display:none}
  .hbtn{min-width:44px;min-height:44px;padding:0}
  .hdr-actions{gap:var(--sp-1)}
  #viewBtn::before{content:"Aa";font-weight:600}   /* compact view switch */
}
```

```js
// Dock the header verdict only when the hero ribbon is off-screen (one observer, no scroll handler).
(()=>{const hdr=document.querySelector('.hdr'),hero=document.querySelector('#raceStrip');
  if(!hdr||!hero||!('IntersectionObserver'in window)){hdr&&(hdr.dataset.docked='true');return;}
  new IntersectionObserver(([e])=>{hdr.dataset.docked=String(!e.isIntersecting||document.querySelector('.tbtn.act')?.dataset.t!=='cmd');},
    {rootMargin:'-56px 0px 0px 0px'}).observe(hero);
  document.addEventListener('click',e=>{if(e.target.closest('.tbtn'))requestAnimationFrame(()=>{hdr.dataset.docked=String(e.target.closest('.tbtn').dataset.t!=='cmd'||hero.getBoundingClientRect().bottom<56);});});
})();
```

In `rHeadline`, set `el.dataset.tone` to `inc` or `opp` for an outright win by that side and to `runoff` otherwise. With the CSS above, the dot becomes orange, blue or amber, which fixes F5.

### 6.4 Drop-in refactor 2: Hero "Path to State House" ribbon

This is a restyle of the existing `VZ.race` DOM plus a gap annotation and the Kenya centroid signature. Only the template in `js/viz.js` (`race()`) changes; the segments, legend and comb logic stay.

```js
// js/viz.js — inside race(), replace the template once-built block
el.innerHTML=`
  <header class="race-hd">
    <p class="eyebrow" id="raceT">First round · decided voters</p>
    <p class="race-verdict" id="raceV"></p>
    <p class="race-total"><span>Votes cast</span><b id="raceTot"></b></p>
  </header>
  <div class="rs-wrap">
    <div class="rs" role="img" id="raceBar"><div class="rs-segs"></div></div>
    <div class="rs-rule" aria-hidden="true"><i>50% + 1</i></div>
    <div class="rs-gap" id="raceGap" aria-hidden="true"></div>
  </div>
  <ol class="race-legend" id="raceLg"></ol>
  <div class="ctyband"><span class="eyebrow">25%+ in counties</span><div class="cb-rows" id="raceCb"></div><span class="need">needs 24</span></div>
  <svg class="ke-sig" id="keSig" viewBox="-44 -40 560 636" role="img" aria-label="Who leads each county"></svg>`;

// after shares are known (lead = top bloc share 0–1):
const gap=Math.max(0,.5-lead);
const g=el.querySelector('#raceGap');
g.style.setProperty('--from',lead);g.textContent=gap>0?`+${(gap*100).toFixed(1)} pts to win outright`:'Above 50% + 1';

// Kenya signature, built when idle: KE_GEO already ships each county's centroid as c.c=[x,y]
(window.requestIdleCallback||setTimeout)(()=>{
  const svg=el.querySelector('#keSig');if(!svg||typeof KE_GEO==='undefined')return;
  svg.innerHTML=`<path d="${KE_GEO.kenya}" fill="var(--canvas-sunken)"/>`+KE_GEO.counties.map(c=>{
    const name=(typeof GEO_NAME!=='undefined'&&GEO_NAME[c.n])||c.n,r=S.res.ctyRes.find(x=>x.name===name);
    const k=r?(r.i>r.o?'inc':'opp'):'rest';
    return `<circle cx="${c.c[0]}" cy="${c.c[1]}" r="${r?6+Math.sqrt(r.tv/2e4):5}" fill="${col(k)}"><title>${esc(name)}</title></circle>`;
  }).join('');
});
```

```css
.race{display:grid;grid-template-columns:minmax(0,1fr) 120px;column-gap:var(--sp-8);row-gap:var(--sp-4);padding:var(--card-pad)}
.race>*{grid-column:1}
.race-hd{display:grid;grid-template-columns:1fr auto;align-items:end;gap:var(--sp-1) var(--sp-6)}
.race-hd .eyebrow{grid-column:1/-1;font:var(--t-micro);letter-spacing:var(--track-micro);text-transform:uppercase;color:var(--ink-subtle)}
.race-verdict{font:var(--t-lg);letter-spacing:var(--track-lg);color:var(--ink);margin:0}
.race-verdict span{font:var(--t-sm);color:var(--ink-subtle);margin-left:var(--sp-2)}
.race-total{margin:0;text-align:right;display:grid}
.race-total span{font:var(--t-xs);color:var(--ink-subtle)}
.race-total b{font:var(--t-xl);letter-spacing:var(--track-xl);font-variant-numeric:tabular-nums}
.rs-wrap{position:relative;padding-bottom:var(--sp-6)}               /* room for rule + gap labels below */
.rs{height:28px;border-radius:var(--r-sm);overflow:hidden;background:var(--canvas-sunken);position:relative}
.rs-rule{position:absolute;left:50%;top:-4px;height:calc(28px + 8px);border-left:1.5px solid var(--ink)}
.rs-rule i{position:absolute;top:calc(100% + 4px);left:0;transform:translateX(-50%);font:var(--t-micro);font-style:normal;color:var(--ink);white-space:nowrap}
.rs-gap{position:absolute;top:calc(28px + 8px);left:calc(var(--from)*100%);right:50%;height:16px;
  border-top:1px dashed var(--ink-subtle);font:var(--t-xs);color:var(--ink-muted);text-align:center;padding-top:2px;white-space:nowrap}
.ke-sig{grid-column:2;grid-row:1/span 4;align-self:center;width:120px;height:auto;cursor:pointer}
.ke-sig circle{stroke:var(--surface);stroke-width:2;opacity:.9;transition:opacity var(--dur-fast) var(--ease-out)}
.ke-sig:hover circle{opacity:1}
@container card (max-width:720px){
  .race{grid-template-columns:1fr}
  .ke-sig{display:none}                                 /* the county band below does this job on phones */
  .race-hd{grid-template-columns:1fr}
  .race-total{text-align:left}
}
```

Wire `#keSig` to the Map tab: `el.querySelector('#keSig').onclick=()=>document.querySelector('.tbtn[data-t=map]').click()`.

---

## Recommended order of work

1. **Cascade consolidation (F1).** Rewrite `app.css` as one layer per component, using `@layer tokens, base, components, utilities`. Every later fix is cheaper once each selector has one home. This is the largest task, with no visual change intended.
2. **Correctness and accessibility:**
   - F5 colour contract;
   - F7 token fixes (5 values);
   - F8 targets;
   - F17 headings;
   - F18 focus;
   - F2 font weights;
   - F16 overflow.
3. **Layout:**
   - F3 card grid;
   - F4 header with docking verdict (6.3);
   - mobile race legend;
   - F19 breakpoint consolidation.
4. **Narrative:**
   - F13 de-duplication;
   - F14 Public-view clean-up;
   - F20 run-off vocabulary;
   - F6 Report rebuild.
5. **Elevation:**
   - hero ribbon (6.4);
   - sparklines, bullet gauges, coalition bars, margin gauge;
   - OKLCH map ramps (F15);
   - motion tokens and choreography (F11, F12).
