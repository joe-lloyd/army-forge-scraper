# unit-effectiveness-rating

Probabilistic per-target lethality model layered on top of BalVal's existing efficiency view. Computes whether a unit can actually kill (or force a morale check on) the configured target inside the 4-round game, anchored against absolute thresholds rather than army-relative ranking.

## Requirements

### Requirement: Hit-roll floor and ceiling

The system SHALL compute hit probability such that, after all modifiers (Thrust, Reliable, etc.), the chance to hit is never less than `1/6` (natural 6 always hits) and never greater than `5/6` (natural 1 always misses).

#### Scenario: Modifiers push effective Quality below 2

- **WHEN** a melee weapon with Thrust is wielded by a Quality 2+ unit
- **THEN** effective Quality SHALL be clamped at 2 and hit chance SHALL equal `5/6`

#### Scenario: Modifiers push effective Quality above 6

- **WHEN** a Quality 6+ unit's effective Quality would exceed 6 due to to-hit modifiers
- **THEN** effective Quality SHALL be clamped at 6 and hit chance SHALL equal `1/6`

#### Scenario: Reliable applied

- **WHEN** a weapon has the Reliable rule
- **THEN** hit chance SHALL equal `getHitChance(2)` (`5/6`) regardless of the unit's own Quality

### Requirement: Defense-roll floor

The system SHALL compute block probability such that, regardless of AP and defender modifiers, the defender retains at least a `1/6` chance to block (natural 6 always saves).

#### Scenario: AP exceeds defense

- **WHEN** AP + defense ≥ 7 (e.g. Def 5+ vs AP 4)
- **THEN** block chance SHALL equal `1/6`

#### Scenario: Bane/Lacerate re-roll of natural 6 saves

- **WHEN** the attacker has Bane or Lacerate and the defender's pre-reroll block chance is `b`
- **THEN** post-reroll block chance SHALL equal `max(0, b * 7/6 - 1/6)` (re-rolling the natural-6 sixth of saves)

### Requirement: Target configuration via existing sliders

The system SHALL drive all per-target metrics (expected wounds, kill probability, activations-to-kill, points-to-kill, morale probability) from `BalValConfig.targetDefense`, `BalValConfig.targetSize`, and `BalValConfig.targetToughness` — the values set by the page's existing target sliders — and SHALL NOT introduce a parallel fixed archetype suite in the unit-rating math.

#### Scenario: Slider changes propagate

- **WHEN** the user changes `targetToughness` from 1 to 12
- **THEN** every unit's `expectedWounds`, `cumulativeKillProb`, `cumulativeMoraleProb`, `activationsToKill`, `pointsToKill`, and `effectivenessTier` SHALL recompute against the new target

#### Scenario: Slider recompute deferred to release

- **WHEN** the user is actively dragging a target slider
- **THEN** the displayed slider value SHALL update live, but the full BalVal recompute SHALL only fire on slider release (mouseup / touchend / keyup)

#### Scenario: No archetype API surface

- **WHEN** consumers read `BalValConfig`
- **THEN** there SHALL be no `archetypeSuite` or `archetypeWeights` field on `BalValConfig`

### Requirement: Assault rule removed from BalVal

The system SHALL NOT model the Assault rule. `BalValConfig` SHALL NOT carry an `assault` field, `calculateWeaponOffense` SHALL NOT accept an `assault` parameter, `calculateUnitOffense` SHALL compute total offense as `max(meleeOffense, rangedOffense)` unconditionally, and the Assault toggle SHALL be removed from the UI.

#### Scenario: Config has no assault field

- **WHEN** a consumer reads `BalValConfig` or `DEFAULT_BALVAL_CONFIG`
- **THEN** there SHALL be no `assault` property

#### Scenario: Unit offense uses max of melee and ranged

- **WHEN** a unit has both melee and ranged weapons
- **THEN** `totalOffense` SHALL equal `max(meleeOffense, rangedOffense)`

#### Scenario: Loadout scoring ignores Assault

- **WHEN** `scoreLoadout` or `findBestLoadout` runs
- **THEN** no Assault-conditional branch SHALL be evaluated and the result SHALL be identical regardless of any legacy `assault` value passed in

### Requirement: Per-activation kill probability

The system SHALL compute, for each unit, a per-activation kill probability against the configured target using a Poisson approximation of the wound distribution.

#### Scenario: Standard kill probability

- **WHEN** expected wounds per activation is `λ` and target HP is `H = targetSize × max(1, targetToughness)`
- **THEN** `killProbPerActivation` SHALL equal `1 − CDF_Poisson(H − 1; λ)` clamped to `[0, 1]`

#### Scenario: Effectively zero damage

- **WHEN** expected wounds per activation are below `0.1` or non-positive
- **THEN** `killProbPerActivation` SHALL equal `0`

### Requirement: Per-round cumulative kill probability (wounds accumulate)

The system SHALL surface a length-4 array `cumulativeKillProb` modelling total wounds across R rounds as `Poisson(R × λ)`, where entry `r` (`r ∈ 0..3`) equals `P(totalWounds ≥ targetHP; (r+1) × λ)`. `killProbByGameEnd` SHALL equal `cumulativeKillProb[3]`. This is intentionally NOT a Bernoulli `1 − (1−p)^(r+1)` model — wounds carry over between activations, so 6 wounds in R1 + 6 wounds in R2 kills a Tough(12) target even though neither round alone would.

#### Scenario: Cumulative curve from accumulating wounds

- **WHEN** `expectedWoundsPerActivation = λ`
- **THEN** `cumulativeKillProb[r] = 1 − CDF_Poisson(targetHP − 1; (r+1) × λ)` for `r ∈ {0, 1, 2, 3}`

#### Scenario: Monotonic non-decreasing

- **WHEN** the curve is computed for any positive `λ`
- **THEN** `cumulativeKillProb[r+1] ≥ cumulativeKillProb[r]` for `r ∈ {0, 1, 2}`

#### Scenario: Game-end probability

- **WHEN** the curve is computed
- **THEN** `killProbByGameEnd` SHALL equal `cumulativeKillProb[3]`

### Requirement: Morale / Shaken threshold

The system SHALL surface a parallel `cumulativeMoraleProb` curve computed against the half-HP threshold `ceil(targetHP / 2)` and a `moraleProbByGameEnd` value equal to `cumulativeMoraleProb[3]`. Crossing this threshold forces an OPR morale test (target becomes Shaken on failure, denying one activation).

#### Scenario: Morale curve uses half-HP threshold

- **WHEN** `targetHP = 12`
- **THEN** `cumulativeMoraleProb[r] = 1 − CDF_Poisson(5; (r+1) × λ)` (half-HP = 6, so crossing ≥ 6 triggers morale)

#### Scenario: Morale dominates kill

- **WHEN** `λ` is held constant
- **THEN** `cumulativeMoraleProb[r] ≥ cumulativeKillProb[r]` for every `r` (anything that kills also forced morale earlier in the same path)

### Requirement: Expected round of first event

The system SHALL surface `expectedRoundToKill` and `expectedRoundToMorale` — the expected round of the first kill / morale event respectively. When the total cumulative probability over 4 rounds is below 5%, the expectation SHALL be reported as `Infinity` ("essentially never in-game").

#### Scenario: Expectation formula

- **WHEN** the cumulative curve is `c = [c0, c1, c2, c3]`
- **THEN** the expected round SHALL equal `Σ r × marginal(r) + (1 − c3) × 5` where `marginal(r) = c[r-1] - c[r-2]` with `c[-1] = 0` (the `× 5` tail term pushes the expectation past 4 when much of the probability mass lies outside the game)

#### Scenario: Too-rare event

- **WHEN** `c3 < 0.05`
- **THEN** the expected round SHALL be `Infinity`

### Requirement: Activations-to-kill and points-to-kill

The system SHALL compute `activationsToKill = ceil(targetHP / expectedWoundsPerActivation)` when expected wounds per activation are at least `0.1`, else `Infinity`; and `pointsToKill = unit.cost × activationsToKill` with `Infinity` propagating.

#### Scenario: Standard ATK

- **WHEN** expected wounds = 4 and targetHP = 12
- **THEN** `activationsToKill = 3` and `pointsToKill = unit.cost × 3`

#### Scenario: Below-floor damage

- **WHEN** expected wounds < `0.1`
- **THEN** `activationsToKill = Infinity` and `pointsToKill = Infinity`

### Requirement: Round-weighted effectiveness score

The system SHALL compute `effectivenessScore` as a round-weighted value-per-point, rewarding kills and morale events that happen early in the game (since early events deny more of the target's future activations).

#### Scenario: Score formula

- **WHEN** the kill and morale curves are known
- **THEN** `effectivenessScore = (Σ ROUND_WEIGHTS[r] × (kill_marginal[r] + MORALE_VALUE_FRACTION × shake_only_marginal[r])) / max(unit.cost, 1)` where `ROUND_WEIGHTS = [4, 3, 2, 1]`, `MORALE_VALUE_FRACTION = 0.5`, and `shake_only_marginal[r] = max(0, morale_marginal[r] − kill_marginal[r])`

#### Scenario: R1 kill beats R4 kill

- **WHEN** unit A has 100% chance to kill in R1 and unit B has 100% chance to kill in R4 (same cost)
- **THEN** unit A's `effectivenessScore` SHALL be roughly 4× unit B's

### Requirement: Absolute effectiveness tier

The system SHALL assign `effectivenessTier` using ABSOLUTE thresholds against the configured target — NOT a percentile rank within the army. A unit that cannot reliably damage the target SHALL receive D regardless of how the rest of the roster scores.

#### Scenario: Tier bands

- **WHEN** the kill and morale curves are computed
- **THEN** `effectivenessTier` SHALL be assigned in priority order:
  - `S` when `killProbByGameEnd ≥ 0.85` AND `expectedRoundToKill ≤ 2`
  - `A` when `killProbByGameEnd ≥ 0.6` AND `expectedRoundToKill ≤ 3`
  - `B` when `killProbByGameEnd ≥ 0.3` AND `expectedRoundToKill ≤ 4`
  - `C` when `moraleProbByGameEnd ≥ 0.8` AND `expectedRoundToMorale ≤ 2.5`
  - `D` otherwise

#### Scenario: Sisters vs heavy vehicle

- **WHEN** a 20-strong Quality 5+ infantry unit (no AP, no Deadly) is evaluated against `(Def 2+, Size 1, Tough 12)`
- **THEN** `effectivenessTier` SHALL be `D` (kill probability too low, shake event arrives too late) regardless of what else is in the army

#### Scenario: Tank vs heavy vehicle

- **WHEN** a Quality 4+ vehicle with AP(4) Deadly(3) ranged weapons is evaluated against `(Def 2+, Size 1, Tough 12)`
- **THEN** `effectivenessTier` SHALL be `A` or `S`

### Requirement: Combined tier

The system SHALL assign `combinedTier` from the average of (a) `damagePercentile` (army-relative rank of `offenseEfficiency`) and (b) the `effectivenessTier` mapped to a value (`S=1, A=0.75, B=0.5, C=0.25, D=0`), then bucketed against `TIER_THRESHOLDS`.

#### Scenario: Anchored by effectiveness

- **WHEN** an army's best anti-tank unit still scores `effectivenessTier = D` against the configured target
- **THEN** that unit's `combinedTier` SHALL NOT be `S` purely because it is the best in the army — the absolute D contribution caps the average

### Requirement: BalValResult shape

The system SHALL expose per-unit results containing both the existing efficiency fields and the new effectiveness fields.

#### Scenario: Result fields

- **WHEN** `calculateArmyBalVal` is called
- **THEN** each result SHALL include: `unitId`, `unitCost`, `unitOffense`, `unitMeleeOffense`, `unitRangedOffense`, `offenseEfficiency`, `effectiveHP`, `defenseEfficiency`, `damageTier`, `damagePercentile`, `survivabilityTier`, `survivabilityPercentile`, `activationsToKill`, `pointsToKill`, `killProbPerActivation`, `cumulativeKillProb` (length 4), `killProbByGameEnd`, `cumulativeMoraleProb` (length 4), `moraleProbByGameEnd`, `expectedRoundToKill`, `expectedRoundToMorale`, `effectivenessScore`, `effectivenessTier`, `effectivenessPercentile`, `combinedTier`, `combinedPercentile`

### Requirement: Loadout scoring uses effectiveness

The system SHALL feed `scoreLoadout` and `findBestLoadout` (and the derived `isBestCombo` flag) from the combined effectiveness + efficiency model; volume-based flags (`isMostOutput`, `isMostMelee`, `isMostRanged`) SHALL continue to be driven by raw attack counts.

#### Scenario: Loadout score includes effectiveness fields

- **WHEN** `scoreLoadout` is called on a loadout
- **THEN** the returned `LoadoutScore` SHALL include `killProbByGameEnd`, `moraleProbByGameEnd`, `cumulativeKillProb`, `cumulativeMoraleProb`, `expectedRoundToKill`, `expectedRoundToMorale`, `activationsToKill`, `pointsToKill`, `effectivenessScore`, and `combinedScore`

#### Scenario: Best-combo selection prefers in-game lethality

- **WHEN** two loadouts are scored — one with high anti-soft volume, one with AP/Deadly anti-tank output — against a Tough(12) Def 2+ target
- **THEN** `isBestCombo` SHALL be assigned to the loadout with the higher `combinedScore`, which against an armoured target SHALL be the AP/Deadly loadout

#### Scenario: Volume flags unchanged

- **WHEN** two loadouts have identical effectiveness but differing raw attack counts
- **THEN** `isMostOutput` SHALL still be assigned to the loadout with the higher total attack count

### Requirement: Header tier badges follow active loadout

The Army Detail sidebar SHALL recompute `Dmg/pt`, `Kill%`, and `Overall` tier badges from the currently selected loadout, NOT only from the unit's base/default loadout. Survivability tier SHALL stay unit-level (eHP doesn't change with weapon selection).

#### Scenario: Selecting a loadout updates effectiveness tier

- **WHEN** the user selects a different loadout in the sidebar
- **THEN** the `Kill%` (effectiveness) badge SHALL be recomputed using the active loadout's `killProbByGameEnd`, `moraleProbByGameEnd`, `expectedRoundToKill`, and `expectedRoundToMorale`

#### Scenario: Selecting a loadout updates damage tier

- **WHEN** the user selects a different loadout in the sidebar
- **THEN** the `Dmg/pt` badge SHALL be recomputed from the active loadout's `offense / cost` projected onto the army's damage percentile space
