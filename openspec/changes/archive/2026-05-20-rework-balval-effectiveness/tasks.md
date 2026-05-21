## 1. Math audit & regression tests

- [x] 1.1 Add tests in `balval.test.ts` pinning `getHitChance` clamps at Q ∈ {0, 1, 2, 6, 7} → `5/6` and `1/6` floors
- [x] 1.2 Add tests for `getBlockChance` over `(def, ap)` ∈ {(2,0), (2,4), (5,0), (5,4), (6,4)} → confirm `1/6` natural-6 save floor
- [x] 1.3 Add tests for `blockChanceWithReroll` with Bane/Lacerate vs (Def 2+, AP 4) → confirms `max(0, …)` floor
- [x] 1.4 Add test for Reliable + Hazardous stack on a Q2 unit → expected hit chance `5/6` and AP `+4`
- [x] 1.5 Fix any primitive whose test fails (do not modify primitives whose tests pass)

## 2. Remove Assault rule from BalVal

- [x] 2.1 Remove `assault: boolean` from `BalValConfig` in `types.ts`
- [x] 2.2 Remove the `assault` parameter from `calculateWeaponOffense` and all `if (assault)` / `config.assault` branches in `balval.ts`
- [x] 2.3 Remove `assault` consumption in `calculateUnitOffense` (drop the `assault ? melee+ranged : max(melee, ranged)` branch; pick the existing default — `max(melee, ranged)`)
- [x] 2.4 Remove `assault` references in `loadout.ts` (`scoreLoadout`, `findBestLoadout`, any callers)
- [x] 2.5 Remove the Assault toggle from `ArmyDetailView.tsx` / sidebar UI and any state plumbing
- [x] 2.6 Update existing tests in `balval.test.ts` that exercise Assault — delete or rewrite without it
- [x] 2.7 Update `DEFAULT_BALVAL_CONFIG` accordingly

## 3. Types: new effectiveness fields

- [x] 3.1 Extend `BalValResult` with: `activationsToKill: number` (`Infinity` if expected wounds < 0.1), `pointsToKill: number`, `killProbPerActivation: number` (0–1), `cumulativeKillProb: [number, number, number, number]` (one entry per round 1..4), `killProbByGameEnd: number`, `effectivenessScore: number`, `effectivenessTier: Tier`, `combinedTier: Tier`
- [x] 3.2 Keep `unitOffense`, `offenseEfficiency`, `damageTier`, `damagePercentile`, `survivabilityTier`, `survivabilityPercentile` as-is (efficiency view retained)
- [x] 3.3 `BalValConfig` keeps `targetDefense`, `targetSize`, `targetToughness`, `offenseWeight`, `mostEffective`; no archetype types added

## 4. Probabilistic kill model

- [x] 4.1 Add helper `targetHP(config)` → `config.targetSize × max(1, config.targetToughness)`
- [x] 4.2 Add `killProbabilityPerActivation(expectedWounds, targetHP)` — model wounds as Poisson(λ = expectedWounds); return `P(wounds ≥ targetHP) = 1 − CDF_Poisson(targetHP − 1; λ)`. Implement Poisson CDF directly (small `targetHP`, no external deps)
- [x] 4.3 Add `cumulativeKillCurve(pKill)` → length-4 array where `entry[r] = 1 − (1 − pKill)^(r+1)` for `r ∈ 0..3`
- [x] 4.4 Add `activationsToKill(expectedWounds, targetHP)` → `ceil(targetHP / expectedWounds)` when `expectedWounds ≥ 0.1`, else `Infinity`
- [x] 4.5 Add `pointsToKill(unitCost, atk)` → `unitCost × atk` (propagate `Infinity`)
- [x] 4.6 Unit-test each helper with hand-computed values (e.g. λ=2, HP=12 → very low `p_kill`; λ=8, HP=12 → high `p_kill`)

## 5. Effectiveness scoring & tier assignment

- [x] 5.1 In `calculateUnitRawBalVal`, compute `expectedWounds` (already there via `totalOffense`), then `pKill`, `cumulativeKillProb`, `killProbByGameEnd`, `ATK`, `PTK`
- [x] 5.2 Define `effectivenessRaw` per unit: combine `killProbByGameEnd` (lethality within game) with `1 / max(PTK, ε)` (cost-to-kill). Suggested formula: `effectivenessRaw = killProbByGameEnd × (1 / max(PTK, ε))`; document the rationale in code
- [x] 5.3 In `calculateArmyBalVal`, percentile-rank `effectivenessRaw` within the army and assign `effectivenessTier` via `TIER_THRESHOLDS`
- [x] 5.4 Compute `combinedTier` from the percentile rank of `(efficiencyPercentile + effectivenessPercentile) / 2`
- [x] 5.5 Keep the legacy `tier` field populated from `combinedTier` during the swap

## 6. Loadout scoring integration

- [x] 6.1 Update `scoreLoadout` to return `{ meleeOffense, rangedOffense, offense, efficiency, killProbByGameEnd, pointsToKill, effectivenessScore, combinedScore }`
- [x] 6.2 Update `findBestLoadout` to maximise `combinedScore` (not raw efficiency)
- [x] 6.3 Leave `isMostOutput` / `isMostMelee` / `isMostRanged` driven by raw attack counts (unchanged)
- [x] 6.4 Update `LoadoutOption` / `LoadoutScore` types and any consumers

## 7. Regression tests for worked examples

- [x] 7.1 Test: 20-strong Q5+ infantry, 40 melee attacks, AP 0, cost ~ army-typical vs target (Def 2+, Size 1, Tough 12) → `expectedWounds ≈ 2`, `ATK ≥ 6`, `killProbByGameEnd ≤ 0.15`
- [x] 7.2 Test: Battle Tank w/ 3× HFR (Q4+, AP 4, Deadly 3) + Deadly(6) cannon vs same target → `expectedWounds ≈ 6–9`, `ATK ≤ 2`, `killProbByGameEnd ≥ 0.85`
- [x] 7.3 Test: in a 2-unit army (infantry + tank) the tank's `effectivenessTier` > the infantry's, while infantry may still hold higher `damageTier` (efficiency) vs a soft target — sanity check that the two tiers diverge correctly
- [x] 7.4 Test: sweeping the target-tough slider from 1 → 12, infantry `killProbByGameEnd` collapses while tank's stays high

## 8. UI updates

- [x] 8.1 Remove the Assault toggle and any associated copy from the page
- [x] 8.2 `UnitCard.tsx`: add a small `killProbByGameEnd` indicator (e.g. percentage badge) and the new combined tier badge
- [x] 8.3 `UnitCardDetails.tsx`: show ATK, PTK, and a 4-cell per-round cumulative kill-probability strip (e.g. R1: 12% · R2: 23% · R3: 32% · R4: 40%)
- [x] 8.4 `UnitDetailSidebar.tsx`: full breakdown — expected wounds, per-activation `pKill`, the round-by-round curve, ATK, PTK, all three tier signals
- [x] 8.5 Confirm the existing Def/Size/Tough sliders drive the new metrics (no new controls beyond removal of Assault)
- [x] 8.6 Smoke-test in dev: load an army, slide tough from 1 → 12, confirm infantry effectiveness drops and tank effectiveness holds (manual — verified by user)

## 9. Cleanup & docs

- [x] 9.1 Remove any dead Assault-related code paths and types after step 2 is verified
- [x] 9.2 Decide whether to keep `damageTier`/`survivabilityTier`/`combinedTier` as the three surfaced signals, OR fold `damageTier` into `efficiencyTier` for naming consistency; document the choice in a code comment
- [x] 9.3 Add a short README section in `apps/web/src/features/explorer/utils/` describing: ATK/PTK definitions, the Poisson-based `pKill`, the per-round cumulative curve, and how `effectivenessTier` combines them
- [x] 9.4 Re-sync `design.md` and `specs/unit-effectiveness-rating/spec.md` to match this proposal (drop archetype-suite language, drop Assault, add probabilistic per-round model) — required before `/opsx:apply` if those artifacts are referenced during implementation
- [x] 9.5 Run `pnpm --filter web test` and `pnpm --filter web build`; fix anything that breaks
