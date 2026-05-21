## Context

`balval.ts` scores units by `offense per point` + `eHP per point` against the single target chosen by the page's existing Def/Size/Tough sliders. That target plumbing is fine — the bias is in the scoring, not the input. The metric treats `5 attacks × 0.1 expected wounds` and `1 attack × 0.5 expected wounds` as identical (both = 0.5 wounds/activation), but in a 4-round game the latter actually kills things and the former does not.

The user has validated the failure mode with a concrete example using the existing sliders set to Def 2+ / Size 1 / Tough 12:
- 20 Novice Sisters (Q5+, 40 melee attacks, AP 0): ~13 hits × ~1/6 unsaved × 1 wound ≈ 2 wounds/activation → realistic chance of killing the target in 4 rounds is near-zero.
- Battle Tank w/ Heavy Fusion Rifles (3 shots, Q4+, AP 4, Deadly 3) + Deadly(6) cannon: ~6–9 wounds/activation → realistic chance of killing in 1–2 activations is high.

Fix: keep efficiency, add **effectiveness** as a parallel score grounded in the probability of actually killing the configured target within the 4-round game. No fixed archetype suite — the sliders already let the user inspect per-target results, and the analyze page handles army-vs-army archetype thinking separately.

We also remove the **Assault** rule branches from BalVal. A forthcoming weapon-rule update will change how Assault is modelled; the current toggle produces misleading numbers and is being deleted now to avoid baking it into the new scoring.

The math primitives in `balval.ts` already honour the natural-1/natural-6 rules (block floor `1/6`, `getHitChance` clamps Quality to `[2, 6]`). We audit + add tests rather than rewrite.

## Goals / Non-Goals

**Goals:**
- Probabilistic per-round kill model against the slider-configured target.
- Per-unit `activationsToKill`, `pointsToKill`, `killProbPerActivation`, `cumulativeKillProb[1..4]`, `killProbByGameEnd`.
- Composite `effectivenessScore` + `effectivenessTier` alongside retained efficiency view.
- Remove Assault from BalVal config, math, loadout scoring, and UI.
- Regression tests pinning the user's worked examples.
- UI surfaces points-to-kill, per-round kill-probability strip, and the new combined tier.

**Non-Goals:**
- Fixed archetype suite. The slider config is the target.
- Modelling activation order, target selection AI, or list-vs-list matchup simulation.
- Modelling psychic/spell rules, command points, terrain, morale.
- Backend / API / shared-types changes — logic stays in `apps/web/src/features/explorer/utils`.
- Replacing the existing damage/survivability percentile views; they remain, fed from the new model.
- Modelling the future Assault-replacement weapon rule — out of scope; toggle is just removed.

## Decisions

### Target source: existing sliders, no archetype suite

Chosen: **reuse the page's Def/Size/Tough sliders**. The analyze page already handles archetype thinking for list analysis; the unit-rating math should respect the same single configurable target the user is already steering. Adding a separate archetype suite here would split the mental model and duplicate controls.

Alternative considered: parallel archetype-suite scoring on the same page. Rejected — duplicates controls, fragments the UI, and the user explicitly pushed back on it.

### Probabilistic kill model

Per activation, model wound count as `Poisson(λ = expectedWoundsPerActivation)`. Then:
- `pKill = P(wounds ≥ targetHP) = 1 − CDF_Poisson(targetHP − 1; λ)`
- `cumulativeKillProb[r] = 1 − (1 − pKill)^(r+1)` for `r ∈ 0..3` (rounds 1..4)
- `killProbByGameEnd = cumulativeKillProb[3]`

Why Poisson:
- Damage in OPR is the sum of many small Bernoulli trials; Poisson is the standard low-overhead approximation when `n` is large and individual probabilities are small.
- For high-Deadly low-shot weapons it slightly overstates variance vs the true Poisson-binomial distribution but the qualitative answer (low pKill for 20-infantry-vs-tank, high pKill for HFR-tank-vs-tank) is correct.
- No dependencies; CDF is a short loop.

`targetHP = config.targetSize × max(1, config.targetToughness)` — same definition used elsewhere in the file.

Alternative considered: exact Poisson-binomial. Rejected for v1 — adds a non-trivial computation per unit per render with no qualitative payoff at this scale. Could be revisited if variance bias shows up in test data.

Alternative considered: deterministic `ATK = ceil(HP/w)` only. Rejected — the user asked for "statistically they could remove the thing but the chance is insanely high (low?), break it down by round". A per-round probability strip is exactly that signal.

### ATK floor and Infinity handling

`activationsToKill = ceil(targetHP / expectedWoundsPerActivation)` when `expectedWoundsPerActivation ≥ 0.1`, else `Infinity`. Mirrors the previous design's "essentially can't damage it" categorical, but now it just propagates into `pointsToKill = Infinity` and `pKill ≈ 0` rather than gating a hard flag.

### Effectiveness aggregation

`effectivenessRaw = killProbByGameEnd × (1 / max(pointsToKill, ε))`

- Both factors point the right way: higher kill-probability and lower cost-to-kill = higher effectiveness.
- `Infinity` PTK → contribution `≈ 0`. Matches the "unkillable" intent without a categorical penalty.
- `ε` is a small floor (e.g. `1`) to avoid division blow-up on free / placeholder units.

Percentile-rank `effectivenessRaw` within the army → `effectivenessTier` via existing `TIER_THRESHOLDS`.

Alternative considered: weighted sum of `killProbByGameEnd` and `efficiency`. Rejected — multiplication enforces "must satisfy both"; a unit that's cheap but can't kill the target shouldn't score high on effectiveness.

### Final tier — three signals

- `damageTier` / `efficiencyTier`: percentile of `offenseEfficiency` (current behaviour).
- `effectivenessTier`: percentile of `effectivenessRaw` (new).
- `combinedTier`: percentile of `(efficiencyPercentile + effectivenessPercentile) / 2`. Headline tier on the card.

UI surfaces all three. Players who want pure points-per-shot sort by efficiency; players prepping for a specific target tune the sliders, then read effectiveness/combined.

Alternative considered: one fused score. Rejected — splitting the signal is the whole point of the user's complaint.

### Assault removal

The current `assault` flag forces `melee + ranged` to fire simultaneously with `-1 to hit`. A future weapon-rule update will replace the Assault concept (per the user). Until that lands the toggle produces values that don't reflect any actual rule the player will use. Approach:

- Drop `assault` from `BalValConfig` and `DEFAULT_BALVAL_CONFIG`.
- Drop the `assault` parameter from `calculateWeaponOffense` (remove `if (assault) q += 1`).
- `calculateUnitOffense` reverts to `max(meleeOffense, rangedOffense)` unconditionally.
- `loadout.ts` callers updated to match.
- UI toggle removed.

When the new weapon rule lands, it will be modelled on the weapon (special rule on the weapon definition), not as a global config toggle — so the scoring path then changes once, in `calculateWeaponOffense`.

### Math audit

Add explicit tests, no behaviour change expected:
- `getHitChance` at Quality `[0, 1, 2, 6, 7]` → confirm clamps and `1/6`..`5/6` bounds.
- `getBlockChance` for `(def, ap)` in `{(2,0), (2,4), (5,0), (5,4), (6,4)}` → confirm `1/6` floor.
- `blockChanceWithReroll` for Bane vs `(def 2+, ap 4)` → confirm `max(0, …)` floor.
- Combined: Q2 unit firing Reliable + Hazardous → verify final hit chance `5/6` and AP `+4`.

If any test fails, fix the primitive; otherwise the existing implementation stays.

### Loadout scoring integration

`scoreLoadout` returns `{ meleeOffense, rangedOffense, offense, efficiency, killProbByGameEnd, pointsToKill, effectivenessScore, combinedScore }`. `findBestLoadout` picks max `combinedScore`. `isMostOutput` / `isMostMelee` / `isMostRanged` continue to use raw attack counts (unchanged) so "swing volume" semantics stay intact.

### UI changes

- Remove the Assault toggle from `ArmyDetailView` / sidebar.
- `UnitCard`: add a `killProbByGameEnd` percentage badge and the combined tier badge.
- `UnitCardDetails`: add ATK, PTK, and a 4-cell per-round cumulative kill-probability strip (e.g. `R1 12% · R2 23% · R3 32% · R4 40%`).
- `UnitDetailSidebar`: full breakdown — expected wounds, per-activation `pKill`, round-by-round curve, ATK, PTK, three tier signals.
- No new sliders; the existing target sliders drive everything.

## Risks / Trade-offs

- **Risk**: Poisson approximation overstates variance for low-shot high-Deadly weapons. → **Mitigation**: still gives the correct qualitative ordering on the worked examples; document the assumption in the README; revisit with exact Poisson-binomial if a regression shows up.
- **Risk**: `pointsToKill` penalises low-cost utility units (transports, screens) that aren't supposed to kill anything. → **Mitigation**: surface efficiency and effectiveness separately; combined tier averages, so a cheap survivable transport still benefits from its `defenseEfficiency` contribution. Document the limitation.
- **Risk**: Loadout selection changes reshuffle existing "best combo" stars and confuse returning users. → **Mitigation**: regression tests pin a few canonical units; release-note the change.
- **Risk**: Removing Assault now breaks any saved app state that includes `assault: true`. → **Mitigation**: ignore the field on load (defensive parse); no migration needed because the toggle had no persisted effect beyond session state.
- **Risk**: The 4-round cap is a simplification (some units can shoot multiple times per round via Fast / banner rules). → **Mitigation**: model `roundsToKill = activationsToKill` for v1; document the simplification; leave a TODO in code for per-unit activation-rate.
- **Risk**: Wider `BalValResult` shape breaks downstream UI components. → **Mitigation**: this is the BREAKING change called out in the proposal; tasks include updating each consumer site.

## Migration Plan

1. Land the Assault removal first as a focused change inside this branch (math, types, loadout, UI) so subsequent diffs are clean.
2. Add new effectiveness fields in `types.ts` alongside the existing fields.
3. Implement Poisson kill model + ATK/PTK helpers in `balval.ts` behind new exports.
4. Wire `calculateUnitRawBalVal` / `calculateArmyBalVal` to populate the new fields and tiers.
5. Switch `loadout.ts` to consume the new model.
6. Switch UI components to read the new fields.
7. Delete any now-unused legacy fields once UI is green.

Rollback: each step is independently revertable; legacy code paths stay until the final cleanup.

## Open Questions

- Naming: keep `damageTier` for efficiency or rename to `efficiencyTier`? Renaming is cleaner; keeping is one less UI diff. Default: rename, since the result shape is BREAKING anyway.
- Final value of the `ε` floor in `effectivenessRaw` denominator — start at `ε = 1` (1 point), revisit if any unit has `unit.cost = 0` in real data.
- Should `effectivenessTier` rank within the army (current behaviour) or against a global benchmark? Within-army keeps the existing UX; default to within-army for v1.
