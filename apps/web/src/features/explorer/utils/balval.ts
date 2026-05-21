import type { Unit, Weapon, Rule } from '@opr-api/shared';
import { DEFAULT_BALVAL_CONFIG, TIER_THRESHOLDS } from './types';
import type { BalValConfig, BalValResult, Tier } from './types';

// ---- Core math ----

export function getHitChance(quality: number): number {
  const q = Math.max(2, Math.min(6, quality));
  return (7 - q) / 6;
}

// OPR rule: a natural 6 always succeeds on any roll, regardless of modifiers.
// So even with high AP, the unit still blocks 1/6 of the time. Without this
// floor the EHP for high-AP scenarios would be undercounted.
export function getBlockChance(defense: number, ap: number = 0): number {
  const effectiveDefense = Math.max(2, defense + ap);
  if (effectiveDefense >= 7) return 1 / 6;
  return (7 - effectiveDefense) / 6;
}

export function getDamageMultiplier(
  weapon: Weapon,
  targetDefense: number,
  targetSize: number,
  targetToughness: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hitChance: number,
): number {
  let multiplier = 1;

  for (const rule of weapon.specialRules || []) {
    const name = rule.name;
    const rating = rule.rating || 1;

    switch (name) {
      case 'Deadly':
        multiplier *= Math.min(rating, targetToughness);
        break;
      case 'Blast':
        multiplier *= Math.min(rating, targetSize);
        break;
      case 'Rending': {
        const baseBlock = getBlockChance(targetDefense);
        if (baseBlock < 1) multiplier *= 1 / (1 - baseBlock);
        break;
      }
      case 'Reliable':
        multiplier *= 1 + 1 / 6;
        break;
    }
  }
  return multiplier;
}

export function getWeaponAP(weapon: Weapon): number {
  const apRule = (weapon.specialRules || []).find((r: Rule) => r.name === 'AP');
  return apRule?.rating || 0;
}

// ---- Defense w/ optional re-roll-defender-6s rule (Bane / Lacerate) ----
//
// Original block chance = max((7 - effDef) / 6, 1/6).
// Re-rolling natural 6s (1/6 of all rolls) means those saves are replaced.
// The replacement roll has the same block probability. Net:
//   newBlock = (block - 1/6) + (1/6) * block = block * 7/6 - 1/6
// Floored at 0 (heavy AP + reroll can effectively eliminate saves).
export function blockChanceWithReroll(defense: number, ap: number, defenderRerollSixes: boolean): number {
  const block = getBlockChance(defense, ap);
  if (!defenderRerollSixes) return block;
  return Math.max(0, (block * 7) / 6 - 1 / 6);
}

// ---- Weapon offense ----
//
// Computes expected wounds inflicted on a single target unit. Models the OPR
// special-rule suite: Blast/Deadly caps, Reliable hit override, Rending and
// Destructive AP+4 procs, Bane/Lacerate defense re-rolls, Furious/Surge bonus
// hits, Shred bonus wounds, Hazardous flat AP, Thrust/Impact charge effects.
//
// Floor-based triggers: rules that key off "natural 6 to hit" or "natural 1 to
// block" use floor(shots / 6) or floor(hits / 6) — i.e. you only get the bonus
// once you have enough dice in flight to expect it on average. Matches how a
// table player thinks ("5 dice probably won't roll a 1; 6 dice probably will").
export function calculateWeaponOffense(
  weapon: Weapon,
  quality: number,
  targetDefense: number,
  targetSize: number,
  targetToughness: number,
): number {
  const attacksMultiplier = (weapon as { attacksMultiplier?: number }).attacksMultiplier ?? 1;
  const shots = weapon.count * weapon.attacks * attacksMultiplier;
  if (shots === 0) return 0;

  const isMelee = (weapon.range || 0) === 0;
  const rules: Rule[] = weapon.specialRules || [];
  const has = (n: string) => rules.some((r) => r.name === n);
  const ratingOf = (n: string) => rules.find((r) => r.name === n)?.rating ?? 0;

  // ---- Hit-roll modifiers ----
  let q = quality;
  let apBonus = 0;
  // Thrust (charging melee): +1 to hit, AP+1.
  if (isMelee && has('Thrust')) {
    q -= 1;
    apBonus += 1;
  }
  // Hazardous: flat AP+4 (we ignore the self-wound side effect).
  if (has('Hazardous')) apBonus += 4;

  // Reliable overrides hit roll to Quality 2+.
  const hitChance = has('Reliable') ? getHitChance(2) : getHitChance(q);

  // ---- AP + defender-side modifiers ----
  const baseAp = getWeaponAP(weapon) + apBonus;
  const defenderReroll = has('Bane') || has('Lacerate');
  const block = blockChanceWithReroll(targetDefense, baseAp, defenderReroll);

  // ---- Damage multipliers (Blast / Deadly capped at target size / tough) ----
  let dmgMult = 1;
  const blastR = ratingOf('Blast');
  const deadlyR = ratingOf('Deadly');
  if (blastR) dmgMult *= Math.min(blastR, targetSize);
  if (deadlyR) dmgMult *= Math.min(deadlyR, targetToughness);

  // ---- Base expected wounds ----
  let damage = shots * hitChance * (1 - block) * dmgMult;

  // ---- Floor-based 1-in-6 procs ----
  // floor(shots / 6) = "every full set of 6 dice expects one natural 6 hit".
  const sixHits = Math.floor(shots / 6);

  // Furious (charging melee only): each natural-6-to-hit deals 1 extra hit.
  if (sixHits > 0 && has('Furious') && isMelee) {
    damage += sixHits * (1 - block) * dmgMult;
  }
  // Surge: same as Furious but no charge requirement.
  if (sixHits > 0 && has('Surge')) {
    damage += sixHits * (1 - block) * dmgMult;
  }
  // Rending / Destructive: natural 6 hits get AP+4.
  // Compute the delta in wound-prob from the higher AP for those hits only.
  if (sixHits > 0 && (has('Rending') || has('Destructive'))) {
    const ap4Block = blockChanceWithReroll(targetDefense, baseAp + 4, defenderReroll);
    const delta = sixHits * ((1 - ap4Block) - (1 - block)) * dmgMult;
    if (delta > 0) damage += delta;
  }

  // Shred: natural 1 on defense roll = 1 extra wound. Trigger once per 6 hits.
  if (has('Shred')) {
    const expectedHits = Math.floor(shots * hitChance);
    const extraWounds = Math.floor(expectedHits / 6);
    if (extraWounds > 0) damage += extraWounds * dmgMult;
  }

  // Impact (charging melee): roll X dice, hits on 2+. Extra independent attack
  // bundle, base AP only (no Thrust/Hazardous bonus on impact dice).
  if (has('Impact') && isMelee) {
    const x = ratingOf('Impact') || 1;
    const impactBlock = blockChanceWithReroll(targetDefense, getWeaponAP(weapon), defenderReroll);
    damage += x * (5 / 6) * (1 - impactBlock);
  }

  return damage;
}

// Total offense = max(melee, ranged) — the unit fires one mode per activation.
export function calculateUnitOffense(
  unit: Unit,
  config: BalValConfig = DEFAULT_BALVAL_CONFIG,
): { meleeOffense: number; rangedOffense: number; totalOffense: number } {
  if (!unit.weapons || unit.weapons.length === 0) {
    return { meleeOffense: 0, rangedOffense: 0, totalOffense: 0 };
  }
  let meleeOffense = 0;
  let rangedOffense = 0;
  for (const weapon of unit.weapons) {
    const wOffense = calculateWeaponOffense(
      weapon,
      unit.quality,
      config.targetDefense,
      config.targetSize,
      config.targetToughness,
    );
    // Missing range on a gain (OPR omits it for melee, e.g. Dual Sword-Flails)
    // → treat as melee. Same fix as in scoreLoadout.
    if (!weapon.range) meleeOffense += wOffense;
    else rangedOffense += wOffense;
  }
  const totalOffense = Math.max(meleeOffense, rangedOffense);
  return { meleeOffense, rangedOffense, totalOffense };
}

export function calculateEffectiveHP(unit: Unit): number {
  let toughValue = 1;
  let hasRegen = false;
  let hasStealth = false;
  let defenseMod = 0;

  for (const rule of unit.rules || []) {
    if (rule.name === 'Tough') toughValue = rule.rating || 1;
    if (rule.name === 'Regeneration') hasRegen = true;
    if (rule.name === 'Stealth') hasStealth = true;
    if (rule.name === 'Shielded') defenseMod -= 1;
  }

  const effectiveDefense = Math.max(2, Math.min(6, unit.defense + defenseMod));
  const blockChance = getBlockChance(effectiveDefense, 0);
  let ehp = (unit.size * toughValue) / (1 - blockChance);
  if (hasRegen) ehp *= 1.33;
  if (hasStealth) ehp *= 1.17;
  return ehp;
}

// ---- Effectiveness helpers ----
//
// "Effectiveness" measures whether a unit can realistically remove the
// configured target within the 4-round game, and at what cost. Distinct from
// "efficiency" (damage per point) which can rank a 20-shot pillow-fist unit
// above a Deadly(3) AP(4) tank against an armoured target even though only
// one of them actually kills it.

const KILL_FLOOR_WOUNDS_PER_ACTIVATION = 0.1;
const EFFECTIVENESS_COST_EPSILON = 1;

export function targetHP(config: BalValConfig): number {
  return config.targetSize * Math.max(1, config.targetToughness);
}

// Poisson CDF: P(X <= k; λ). Direct sum; targetHP rarely exceeds 30 so this
// stays cheap. Numerically stable for typical λ ∈ [0, 50].
function poissonCDF(k: number, lambda: number): number {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  if (k < 0) return 0;
  // term_i = e^-λ × λ^i / i!  computed iteratively to avoid overflow.
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, Math.max(0, sum));
}

export function killProbabilityPerActivation(expectedWounds: number, hp: number): number {
  if (expectedWounds < KILL_FLOOR_WOUNDS_PER_ACTIVATION) return 0;
  if (hp <= 0) return 1;
  // P(X >= hp) = 1 - P(X <= hp - 1).
  return Math.min(1, Math.max(0, 1 - poissonCDF(hp - 1, expectedWounds)));
}

// Cumulative kill probability across the 4 game rounds. Wounds accumulate
// across activations, so total wounds after R rounds ~ Poisson(R × λ); we ask
// P(totalWounds ≥ HP). This is materially different from "each round is an
// independent Bernoulli kill attempt" — the latter understates the chance
// because it ignores that 6 wounds in R1 plus 6 in R2 kills a Tough(12)
// target even though neither round alone would.
export function cumulativeKillCurve(
  expectedWoundsPerActivation: number,
  hp: number,
): [number, number, number, number] {
  if (expectedWoundsPerActivation < KILL_FLOOR_WOUNDS_PER_ACTIVATION) return [0, 0, 0, 0];
  if (hp <= 0) return [1, 1, 1, 1];
  const out: number[] = [];
  for (let r = 0; r < 4; r++) {
    const lambda = expectedWoundsPerActivation * (r + 1);
    out.push(Math.min(1, Math.max(0, 1 - poissonCDF(hp - 1, lambda))));
  }
  return out as [number, number, number, number];
}

export function activationsToKill(expectedWounds: number, hp: number): number {
  if (expectedWounds < KILL_FLOOR_WOUNDS_PER_ACTIVATION) return Infinity;
  if (hp <= 0) return 1;
  return Math.ceil(hp / expectedWounds);
}

export function pointsToKill(unitCost: number, atk: number): number {
  if (!Number.isFinite(atk)) return Infinity;
  return unitCost * atk;
}

// OPR: a unit at ≤ half starting strength must take a morale test; failing it
// makes the unit Shaken (can't act, sits in cover). Shaking a unit denies one
// activation, so it's worth roughly half a kill — the unit comes back next
// round but you bought time.
export function moraleHP(hp: number): number {
  return Math.max(1, Math.ceil(hp / 2));
}

// Cumulative P(target taken to ≤ half HP by end of round r+1). Same Poisson
// accumulation model as `cumulativeKillCurve` but against the half-HP threshold.
export function cumulativeMoraleCurve(
  expectedWoundsPerActivation: number,
  hp: number,
): [number, number, number, number] {
  return cumulativeKillCurve(expectedWoundsPerActivation, moraleHP(hp));
}

// Expected round of first occurrence (1..4). E[R] = Σ r × P(first event at r),
// plus a tail term that pushes the expectation past 4 when much of the
// probability mass lies outside the game. Returns Infinity when total prob
// over 4 rounds is below 5% — "essentially never happens in-game".
export function expectedRoundOfEvent(curve: [number, number, number, number]): number {
  const total = curve[3];
  if (total < 0.05) return Infinity;
  let e = 0;
  let prev = 0;
  for (let r = 0; r < 4; r++) {
    const marginal = Math.max(0, curve[r] - prev);
    e += marginal * (r + 1);
    prev = curve[r];
  }
  // Tail: anything not happening in 4 rounds gets imputed to round 5+. We use
  // round 5 as a sentinel — past the game, so it pulls the expectation toward
  // "too late" without going to Infinity for borderline cases.
  e += (1 - total) * 5;
  return e;
}

// Round weights = remaining-rounds-of-denial value. Killing in R1 denies ~3
// activations of the target; killing in R4 denies ~0. Same idea for morale.
const ROUND_WEIGHTS = [4, 3, 2, 1] as const;
// Morale (Shaken) = roughly half a kill in value: target comes back next
// round, but you bought one activation of denial and forced the opponent's
// plan.
const MORALE_VALUE_FRACTION = 0.5;

// Round-weighted effectiveness raw score. Counts:
//   + R-weighted P(first kill at round r)
//   + R-weighted P(first morale-only at round r) × MORALE_VALUE_FRACTION
// then divides by cost (effectiveness PER POINT). PTK = Infinity (no damage)
// collapses to 0.
function effectivenessRaw(
  killCurve: [number, number, number, number],
  moraleCurve: [number, number, number, number],
  unitCost: number,
  ptk: number,
): number {
  if (!Number.isFinite(ptk)) return 0;
  let value = 0;
  let killPrev = 0;
  let moralePrev = 0;
  for (let r = 0; r < 4; r++) {
    const killMarg = Math.max(0, killCurve[r] - killPrev);
    const moraleMarg = Math.max(0, moraleCurve[r] - moralePrev);
    // morale-only marginal: shaken-but-still-alive new cases this round.
    const moraleOnlyMarg = Math.max(0, moraleMarg - killMarg);
    value += ROUND_WEIGHTS[r] * (killMarg + MORALE_VALUE_FRACTION * moraleOnlyMarg);
    killPrev = killCurve[r];
    moralePrev = moraleCurve[r];
  }
  return value / Math.max(unitCost, EFFECTIVENESS_COST_EPSILON);
}

export function calculateUnitRawBalVal(
  unit: Unit,
  config: BalValConfig = DEFAULT_BALVAL_CONFIG,
): Omit<
  BalValResult,
  | 'normalizedBalVal'
  | 'tier'
  | 'damageTier'
  | 'damagePercentile'
  | 'survivabilityTier'
  | 'survivabilityPercentile'
  | 'effectivenessPercentile'
  | 'effectivenessTier'
  | 'combinedPercentile'
  | 'combinedTier'
> {
  const { meleeOffense, rangedOffense, totalOffense } = calculateUnitOffense(unit, config);
  const effectiveHP = calculateEffectiveHP(unit);

  const offenseEfficiency = unit.cost > 0 ? totalOffense / unit.cost : 0;
  const meleeEfficiency = unit.cost > 0 ? meleeOffense / unit.cost : 0;
  const rangedEfficiency = unit.cost > 0 ? rangedOffense / unit.cost : 0;
  const defenseEfficiency = unit.cost > 0 ? effectiveHP / unit.cost : 0;

  const rawBalVal =
    offenseEfficiency * config.offenseWeight + defenseEfficiency * (1 - config.offenseWeight);

  const hp = targetHP(config);
  const atk = activationsToKill(totalOffense, hp);
  const ptk = pointsToKill(unit.cost, atk);
  const pKill = killProbabilityPerActivation(totalOffense, hp);
  const killCurve = cumulativeKillCurve(totalOffense, hp);
  const moraleCurve = cumulativeMoraleCurve(totalOffense, hp);
  const killProbByGameEnd = killCurve[3];
  const moraleProbByGameEnd = moraleCurve[3];
  const expectedRoundToKill = expectedRoundOfEvent(killCurve);
  const expectedRoundToMorale = expectedRoundOfEvent(moraleCurve);
  const effectivenessScore = effectivenessRaw(killCurve, moraleCurve, unit.cost, ptk);

  return {
    unitId: unit.id,
    unitCost: unit.cost,
    unitOffense: totalOffense,
    unitMeleeOffense: meleeOffense,
    unitRangedOffense: rangedOffense,
    effectiveHP,
    offenseEfficiency,
    meleeEfficiency,
    rangedEfficiency,
    defenseEfficiency,
    rawBalVal,
    activationsToKill: atk,
    pointsToKill: ptk,
    killProbPerActivation: pKill,
    cumulativeKillProb: killCurve,
    killProbByGameEnd,
    cumulativeMoraleProb: moraleCurve,
    moraleProbByGameEnd,
    expectedRoundToKill,
    expectedRoundToMorale,
    effectivenessScore,
  };
}

function tierFor(percentile: number): Tier {
  if (percentile >= TIER_THRESHOLDS.S) return 'S';
  if (percentile >= TIER_THRESHOLDS.A) return 'A';
  if (percentile >= TIER_THRESHOLDS.B) return 'B';
  if (percentile >= TIER_THRESHOLDS.C) return 'C';
  return 'D';
}

// ABSOLUTE effectiveness tier (NOT percentile-ranked within army). Whether a
// unit can kill THIS target is a property of the unit + target, not of how
// they compare to the rest of the roster. Percentile-ranking it means the
// "least bad" unit in an army that can't damage the target still gets S — a
// 20-strong Novice Sister blob vs a Tough(12) Def 2+ tank should read D, not
// A, regardless of what else is in the army.
const TIER_VALUE: Record<Tier, number> = { S: 1, A: 0.75, B: 0.5, C: 0.25, D: 0 };

export function effectivenessTierAbsolute(
  killByR4: number,
  moraleByR4: number,
  expectedRoundToKill: number,
  expectedRoundToMorale: number,
): Tier {
  // Tiers gate on BOTH probability and SPEED. A unit that "eventually" shakes
  // the target on R4 is nearly worthless — it bought you zero activations of
  // denial. We want kills early and shakes early.
  //
  // S: reliably kills early — denies most of the target's game (kill≥85%, ≤R2).
  if (killByR4 >= 0.85 && expectedRoundToKill <= 2) return 'S';
  // A: reliably kills by R3.
  if (killByR4 >= 0.6 && expectedRoundToKill <= 3) return 'A';
  // B: meaningful kill chance arriving within the game.
  if (killByR4 >= 0.3 && expectedRoundToKill <= 4) return 'B';
  // C: chip damage that produces an early morale check (shake by R2-ish).
  if (moraleByR4 >= 0.8 && expectedRoundToMorale <= 2.5) return 'C';
  // D: cannot meaningfully threaten this target — kills are rare, shakes too
  // late to deny activations.
  return 'D';
}

// Computes percentile rank for each unit on a metric (0 = worst, 1 = best).
// Uses average rank to keep ties fair.
function percentileMap<T extends { unitId: string }>(rows: T[], pick: (r: T) => number): Map<string, number> {
  const total = rows.length;
  const sorted = [...rows].sort((a, b) => pick(a) - pick(b));
  const map = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const p = total > 1 ? i / (total - 1) : 1.0;
    map.set(sorted[i].unitId, p);
  }
  return map;
}

export function calculateArmyBalVal(
  units: Unit[],
  config: BalValConfig = DEFAULT_BALVAL_CONFIG,
): Record<string, BalValResult> {
  const rawResults = units.map(u => calculateUnitRawBalVal(u, config));

  const balValRank = percentileMap(rawResults, r => r.rawBalVal);
  const dmgRank = percentileMap(rawResults, r => r.offenseEfficiency);
  const survRank = percentileMap(rawResults, r => r.defenseEfficiency);

  // Effectiveness tier is ABSOLUTE — based on actual kill/shake probabilities
  // against the configured target, not on how the unit ranks within the army.
  // A 20-strong Sister blob vs a Tough(12) Def 2+ tank gets D regardless of
  // what else is in the army. We still expose `effectivenessPercentile` as a
  // 0-1 "tier value" (S=1, A=0.75, …, D=0) so downstream UI / sorting can
  // treat it numerically.
  const absEffTiers = new Map<string, Tier>();
  for (const r of rawResults) {
    absEffTiers.set(
      r.unitId,
      effectivenessTierAbsolute(r.killProbByGameEnd, r.moraleProbByGameEnd, r.expectedRoundToKill, r.expectedRoundToMorale),
    );
  }

  // Combined = average of damage percentile (army-relative) and absolute
  // effectiveness tier value, then bucketed on TIER_THRESHOLDS. This means an
  // army of bad anti-tank units no longer artificially produces a "best
  // anti-tank" S unit — combined inherits effectiveness's absolute anchor.
  const finalResults: Record<string, BalValResult> = {};
  for (const raw of rawResults) {
    const percentile = balValRank.get(raw.unitId) ?? 1.0;
    const damagePercentile = dmgRank.get(raw.unitId) ?? 1.0;
    const survivabilityPercentile = survRank.get(raw.unitId) ?? 1.0;
    const effectivenessTier = absEffTiers.get(raw.unitId) ?? 'D';
    const effectivenessPercentile = TIER_VALUE[effectivenessTier];
    const combinedPercentile = (damagePercentile + effectivenessPercentile) / 2;
    const combinedTier = tierFor(combinedPercentile);

    finalResults[raw.unitId] = {
      ...raw,
      normalizedBalVal: percentile,
      // Legacy `tier` mirrors the new combinedTier so existing consumers keep
      // working until they migrate.
      tier: combinedTier,
      damagePercentile,
      damageTier: tierFor(damagePercentile),
      survivabilityPercentile,
      survivabilityTier: tierFor(survivabilityPercentile),
      effectivenessPercentile,
      effectivenessTier,
      combinedPercentile,
      combinedTier,
    };
  }
  return finalResults;
}

// ---- Loadout helpers re-exported for callers ----
export {
  parseSectionLabel,
  findReplacedWeapons,
  buildBaseLoadout,
  applyOption,
  scoreLoadout,
  findBestLoadout,
  enumerateOptionLoadouts,
  getAllLoadouts,
  getOptionCost,
} from './loadout';
