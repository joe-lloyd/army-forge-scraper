# Explorer BalVal — Effectiveness Model

Math behind the Army Detail rating system. Lives in [balval.ts](./balval.ts) and [loadout.ts](./loadout.ts).

## Inputs

All metrics are computed against the target configured by the page sliders:

- `targetDefense` — defender's save (2–6).
- `targetSize` — number of models in the target unit (Blast cap).
- `targetToughness` — Tough(N) value of each model (Deadly cap).

Derived: `targetHP = targetSize × max(1, targetToughness)`.

## Per-activation offense

`calculateWeaponOffense` returns expected wounds per activation for one weapon against the configured target. Handles AP, Deadly, Blast, Rending, Destructive, Bane/Lacerate, Reliable, Hazardous, Furious, Surge, Shred, Impact, Thrust.

`calculateUnitOffense` sums per-weapon results, classifying by melee/ranged, and reports `totalOffense = max(meleeOffense, rangedOffense)`. (Assault is no longer modelled — a future weapon-rule update will supersede it.)
Natural-roll floors are enforced in the primitives:

- `getHitChance` clamps to `[1/6, 5/6]` — natural 6 always hits, natural 1 always misses.
- `getBlockChance` retains a `1/6` floor regardless of AP — natural 6 always saves.
- `blockChanceWithReroll` models Bane/Lacerate: `max(0, block × 7/6 − 1/6)`.

## Probabilistic kill model

Wounds per round are modelled as `Poisson(λ = expectedWoundsPerActivation)`. Total wounds after R rounds ~ `Poisson(R × λ)` because activations accumulate damage.

- `killProbabilityPerActivation(λ, hp)` — `P(X ≥ hp; λ) = 1 − CDF_Poisson(hp − 1, λ)`. Returns 0 when `λ < 0.1`.
- `cumulativeKillCurve(λ, hp)` — length-4 array, entry `r` = `P(totalWounds ≥ hp; R × λ)` for round `r+1`.
- `cumulativeMoraleCurve(λ, hp)` — same shape, against the half-HP threshold `ceil(hp / 2)`. Crossing it forces a morale test (Shaken in OPR: the unit can't activate next round).
- `activationsToKill(λ, hp)` — deterministic `ceil(hp / λ)` summary; `Infinity` when `λ < 0.1`.
- `pointsToKill(cost, atk)` — `cost × atk`, with `Infinity` propagation.
- `expectedRoundOfEvent(curve)` — `Σ r × marginal_prob(r)` plus a tail term that maps "never in-game" to a sentinel ≥5; `Infinity` when total < 5%.

## Effectiveness scoring

Round-weighted value-per-point. Killing in R1 denies the target ~3 future activations; killing in R4 denies almost none. Shaking the target is worth roughly half a kill (one denied activation but the target recovers).

```
ROUND_WEIGHTS = [4, 3, 2, 1]  // value of an event in R1..R4
MORALE_VALUE_FRACTION = 0.5   // shake ≈ half a kill

value = Σ ROUND_WEIGHTS[r] × (kill_marginal[r] + 0.5 × shake_only_marginal[r])
effectivenessScore = value / cost
```

`shake_only_marginal[r] = max(0, morale_marginal[r] − kill_marginal[r])` — shaken-but-still-alive cases this round, avoiding double-counting paths that die the same round.

## Tier assignment

**Damage** and **Survivability** tiers are army-relative (percentile-rank of `offenseEfficiency` / `defenseEfficiency` within the army roster).

**Effectiveness** (`Kill%`) tier is **absolute** — based on whether the unit can actually kill the configured target, regardless of what else is in the army:

| Tier | Gate |
| --- | --- |
| S | `kill ≥ 85%` AND `E[round to kill] ≤ 2` |
| A | `kill ≥ 60%` AND `E[round to kill] ≤ 3` |
| B | `kill ≥ 30%` AND `E[round to kill] ≤ 4` |
| C | `morale ≥ 80%` AND `E[round to shake] ≤ 2.5` |
| D | anything weaker |

This anchors **Overall** (combined) tier against absolute lethality: combined = average of (damage percentile, effectiveness tier value `{S:1, A:0.75, B:0.5, C:0.25, D:0}`), bucketed on `TIER_THRESHOLDS`. An army of bad anti-tank units no longer manufactures an "S anti-tank" unit by relative ranking.

## Loadout scoring

`scoreLoadout` returns the same effectiveness + efficiency fields per loadout. `findBestLoadout` picks the highest `combinedScore = (efficiency + effectivenessScore) / 2`. `isMostOutput` / `isMostMelee` / `isMostRanged` remain driven by raw attack counts (swing-volume semantics unchanged).

`scoreLoadout` deliberately does **not** reuse `calculateUnitOffense`'s `max(melee, ranged)`. That form assumes one mode for the whole unit, which only holds for a homogeneous pool. A model attacks with a single weapon per activation, so `scoreLoadout` instead gives each model its best available weapon — weapons ranked by per-model offense, greedily placed into `unit.size` slots — and sums the placements. A sgt holding a Blast(5) EMP Pistol next to four models with melee Flails now keeps its blast output instead of having it discarded because the melee sum is larger. For a homogeneous loadout (every base weapon has `count === unit.size`) the two agree exactly, so unchanged units score identically; `meleeOffense` / `rangedOffense` are still reported as raw per-weapon sums for the UI split.

### Pill labels and ordering

`enumerateOptionLoadouts` returns the base (default) loadout first — consumers read `loadouts[0]` as the baseline for deltas — then the rest in score order, with the top result flagged `isBestCombo`.

A pill's `(×N)` suffix means "N separate selections", so it is shown only when the count is a selection count:

| Section `affects` | `quantity` means | Label |
| --- | --- | --- |
| `any`, `up to` | selections taken | always suffixed (`Fusion Rifle (×1)`) |
| `all`, `exactly` | models covered by one selection | never suffixed (`Great Weapon`) |
| absent | models swapped | suffixed only when `> 1` |

Chained applications join with `" + "`, mirroring the cost rule in `applyOption`.

UI loadout rows colour on a two-axis test of `(efficiencyDelta, offenseDelta)`:

- both up → green (strict win)
- both down → red (strict loss)
- one up, one down → blue (notable tradeoff)
- both within ±2% → neutral
