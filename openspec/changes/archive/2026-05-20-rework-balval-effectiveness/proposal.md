## Why

Current BalVal rating reduces unit strength to point-efficiency vs the single target picked by the page's existing Def/Size/Tough sliders. High-volume low-AP infantry (e.g. 20 Novice Sisters with 40 melee attacks) get inflated S-tier ranks despite needing many activations to kill armoured targets. Low-shot high-AP/Deadly units (e.g. Battle Tank with Heavy Fusion Rifles AP(4) Deadly(3)) get under-rated because their damage-per-point looks small even though they reliably remove the target in 1–2 activations.

The rating must reflect both **efficiency** (damage per point) and **effectiveness** (how likely the unit is to actually kill the configured target, broken down by round, given the 4-round game length).

We also need to verify the core math respects the OPR rule that a natural `1` always fails and a natural `6` always succeeds, on both hit and defense rolls, with the appropriate floors after modifiers.

## What Changes

- Keep the existing page-level Def/Size/Tough sliders as the single source of "what are we shooting at"; do NOT introduce a fixed archetype suite in the unit-rating math. (Archetype thinking stays in the analyze-page list view, where it already lives.)
- Add an **activations-to-kill (ATK)** metric per unit: `ceil(targetHP / expectedWoundsPerActivation)` where `targetHP = size × max(1, toughness)` from the slider config.
- Replace the categorical "cannot remove in game" flag with a **probabilistic per-round kill model**:
  - Compute a per-activation kill probability `p_kill` from expected wounds and target HP (model wounds as Poisson-distributed around the expected value, then `p_kill = P(wounds ≥ HP)`).
  - For each round `r ∈ {1, 2, 3, 4}`, surface `cumulativeKillProb(r) = 1 − (1 − p_kill)^r` — the chance the unit has removed the target by end of round `r`.
  - Surface a 4-round summary: `killProbByGameEnd = cumulativeKillProb(4)`.
- Add a **points-to-kill (PTK)** metric: `unit.cost × ATK` for the configured target — direct comparison of points spent per target removed.
- Replace the single `rawBalVal` with a composite combining:
  - `efficiency` — damage per point against the configured target (current model, retained).
  - `effectiveness` — function of `killProbByGameEnd` and `pointsToKill`. Units with low `killProbByGameEnd` get a smoothly scaled penalty (no hard cutoff), not a categorical flag.
- **BREAKING**: `BalValResult` shape changes — adds `activationsToKill`, `pointsToKill`, `killProbPerActivation`, `cumulativeKillProb` (length-4 array, one entry per round), `killProbByGameEnd`, `effectivenessScore`, `effectivenessTier`, `combinedTier`. `unitOffense`/`offenseEfficiency` retained against the configured target.
- **BREAKING**: Remove the **Assault** rule entirely from BalVal — `BalValConfig.assault` and all `assault`-conditional branches in `calculateWeaponOffense` / `calculateUnitOffense` / `scoreLoadout`. A forthcoming weapon-rule update will supersede the Assault concept; until then the calculation under that rule is invalid and the toggle misleads. Remove the corresponding UI control.
- Audit and fix core math edge cases:
  - Ensure `getHitChance` floors at `1/6` (natural 6) and caps at `5/6` (natural 1) after all modifiers.
  - Ensure `getBlockChance` keeps the `1/6` natural-6 save floor across all AP values (already present, add tests).
  - Ensure stacking modifiers (Thrust, Hazardous + AP, defender Shielded + Stealth) do not push effective rolls past these floors.
- Update Army Detail UI to surface per-unit `pointsToKill`, the per-round cumulative kill-probability breakdown, and the new combined tier; keep the existing damage/survivability percentile views but feed them from the new model.
- Add regression tests covering the user's worked examples (20 Novice Sisters vs Tough(12)/Def 2+ → low `killProbByGameEnd`; Battle Tank w/ HFR vs same → high `killProbByGameEnd`) so future changes can't silently regress the rating intent.

## Capabilities

### New Capabilities
- `unit-effectiveness-rating`: Probabilistic lethality model. Against the user-configured target, computes per-activation expected wounds, per-activation kill probability, a per-round cumulative kill-probability curve over the 4-round game, points-to-kill, and combines these into an effectiveness score and tier alongside the existing efficiency score.

### Modified Capabilities
<!-- No existing specs in openspec/specs/ — leaving empty. -->

## Impact

- `apps/web/src/features/explorer/utils/balval.ts` — core math, scoring, result aggregation, removal of Assault branches.
- `apps/web/src/features/explorer/utils/types.ts` — `BalValConfig` (drop `assault`), `BalValResult` shape (new effectiveness fields).
- `apps/web/src/features/explorer/utils/loadout.ts` — `scoreLoadout` / `findBestLoadout` adopt new effectiveness model; Assault branches removed.
- `apps/web/src/features/explorer/utils/balval.test.ts` — extended with math-floor tests, probabilistic-kill tests, and worked-example regressions.
- `apps/web/src/features/explorer/components/ArmyDetailView.tsx`, `UnitCard.tsx`, `UnitCardDetails.tsx`, `UnitDetailSidebar.tsx` — render `pointsToKill`, per-round kill-probability breakdown, effectiveness tier; remove the Assault toggle.
- `apps/web/src/pages/ArmyDetailPage.tsx` — passes through; no direct logic change.
- No backend / data-source impact; computations remain client-side derivatives of the existing `Unit`/`Weapon` shapes from `@opr-api/shared`.
- Downstream: `openspec/changes/rework-balval-effectiveness/design.md` and `specs/unit-effectiveness-rating/spec.md` reference the dropped archetype suite and Assault rule — they need re-sync to match this proposal before `/opsx:apply`.
