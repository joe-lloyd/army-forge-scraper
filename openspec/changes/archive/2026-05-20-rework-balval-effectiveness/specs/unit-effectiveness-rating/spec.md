## ADDED Requirements

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

The system SHALL drive all per-target metrics (expected wounds, kill probability, activations-to-kill, points-to-kill) from `BalValConfig.targetDefense`, `BalValConfig.targetSize`, and `BalValConfig.targetToughness` — the values set by the page's existing target sliders — and SHALL NOT introduce a parallel fixed archetype suite in the unit-rating math.

#### Scenario: Slider changes propagate

- **WHEN** the user changes `targetToughness` from 1 to 12
- **THEN** every unit's `expectedWounds`, `pKill`, `cumulativeKillProb`, `activationsToKill`, `pointsToKill`, and `effectivenessTier` SHALL recompute against the new target

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

### Requirement: Per-round cumulative kill probability

The system SHALL surface a length-4 array `cumulativeKillProb` whose `r`-th entry is the probability the unit has removed the target by the end of round `r+1` (assuming one activation per round), and a `killProbByGameEnd` value equal to `cumulativeKillProb[3]`.

#### Scenario: Curve values

- **WHEN** `killProbPerActivation = p`
- **THEN** `cumulativeKillProb[r] = 1 − (1 − p)^(r+1)` for `r ∈ {0, 1, 2, 3}`

#### Scenario: Game-end probability

- **WHEN** the curve is computed
- **THEN** `killProbByGameEnd` SHALL equal `cumulativeKillProb[3]`

### Requirement: Activations-to-kill and points-to-kill

The system SHALL compute `activationsToKill = ceil(targetHP / expectedWoundsPerActivation)` when expected wounds per activation are at least `0.1`, else `Infinity`; and `pointsToKill = unit.cost × activationsToKill` with `Infinity` propagating.

#### Scenario: Standard ATK

- **WHEN** expected wounds = 4 and targetHP = 12
- **THEN** `activationsToKill = 3` and `pointsToKill = unit.cost × 3`

#### Scenario: Below-floor damage

- **WHEN** expected wounds < `0.1`
- **THEN** `activationsToKill = Infinity` and `pointsToKill = Infinity`

### Requirement: Effectiveness score and tier

The system SHALL produce, per unit, an `effectivenessScore` that combines `killProbByGameEnd` and the inverse of `pointsToKill`, and assign an `effectivenessTier` (S/A/B/C/D) by percentile-ranking the score within the army using the existing `TIER_THRESHOLDS`.

#### Scenario: High-volume low-AP unit vs armoured target

- **WHEN** a 20-strong Quality 5+ infantry unit with no AP/Deadly is evaluated against target (Def 2+, Size 1, Tough 12)
- **THEN** `killProbByGameEnd` SHALL be low (≤ 0.15) and the unit's `effectivenessScore` SHALL reflect that, irrespective of its raw `offenseEfficiency`

#### Scenario: AP/Deadly vehicle vs same target

- **WHEN** a Quality 4+ vehicle with AP(4) Deadly(3) weapons is evaluated against the same target
- **THEN** `killProbByGameEnd` SHALL be high (≥ 0.85) and the unit's `effectivenessScore` SHALL be substantially higher than the infantry's in the same army

#### Scenario: Score formula

- **WHEN** `pointsToKill` is finite
- **THEN** `effectivenessRaw = killProbByGameEnd × (1 / max(pointsToKill, ε))` for a small positive `ε`

#### Scenario: Unkillable propagation

- **WHEN** `pointsToKill = Infinity`
- **THEN** `effectivenessRaw` SHALL evaluate to `0`

### Requirement: BalValResult shape

The system SHALL expose per-unit results containing both the existing efficiency fields and the new effectiveness fields.

#### Scenario: Result fields

- **WHEN** `calculateArmyBalVal` is called
- **THEN** each result SHALL include: `unitId`, `unitCost`, `unitOffense`, `unitMeleeOffense`, `unitRangedOffense`, `offenseEfficiency`, `effectiveHP`, `defenseEfficiency`, `activationsToKill`, `pointsToKill`, `killProbPerActivation`, `cumulativeKillProb` (length 4), `killProbByGameEnd`, `damageTier`, `damagePercentile`, `survivabilityTier`, `survivabilityPercentile`, `effectivenessScore`, `effectivenessTier`, `combinedTier`

### Requirement: Loadout scoring uses effectiveness

The system SHALL feed `scoreLoadout` and `findBestLoadout` (and derived flag `isBestCombo`) from the combined effectiveness + efficiency model; the volume-based flags (`isMostOutput`, `isMostMelee`, `isMostRanged`) SHALL continue to be driven by raw attack counts.

#### Scenario: Best-combo selection prefers in-game lethality

- **WHEN** two loadouts are scored — one with high anti-soft volume, one with AP/Deadly anti-tank output — against a Tough(12) Def 2+ target
- **THEN** `isBestCombo` SHALL be assigned to the loadout with the higher combined score, which against an armoured target SHALL be the AP/Deadly loadout

#### Scenario: Volume flags unchanged

- **WHEN** two loadouts have identical effectiveness but differing raw attack counts
- **THEN** `isMostOutput` SHALL still be assigned to the loadout with the higher total attack count
