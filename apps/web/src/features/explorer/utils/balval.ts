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

export function calculateWeaponOffense(
  weapon: Weapon,
  quality: number,
  targetDefense: number,
  targetSize: number,
  targetToughness: number,
  assault: boolean = false,
): number {
  const attacksMultiplier = (weapon as any).attacksMultiplier || 1;
  const baseAttacks = weapon.count * weapon.attacks * attacksMultiplier;
  if (baseAttacks === 0) return 0;

  const effectiveQuality = assault ? quality + 1 : quality;
  const hitChance = getHitChance(effectiveQuality);

  const ap = getWeaponAP(weapon);
  const blockChance = getBlockChance(targetDefense, ap);
  const woundChance = hitChance * (1 - blockChance);

  const damageMultiplier = getDamageMultiplier(weapon, targetDefense, targetSize, targetToughness, hitChance);
  return baseAttacks * woundChance * damageMultiplier;
}

// When assault is active, melee + ranged fire in the same activation (both
// suffer -1 to hit). Otherwise the unit picks one mode and totalOffense is the
// max of the two.
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
      config.assault,
    );
    if (weapon.range === 0) meleeOffense += wOffense;
    else rangedOffense += wOffense;
  }
  const totalOffense = config.assault
    ? meleeOffense + rangedOffense
    : Math.max(meleeOffense, rangedOffense);
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

export function calculateUnitRawBalVal(
  unit: Unit,
  config: BalValConfig = DEFAULT_BALVAL_CONFIG,
): Omit<
  BalValResult,
  'normalizedBalVal' | 'tier' | 'damageTier' | 'damagePercentile' | 'survivabilityTier' | 'survivabilityPercentile'
> {
  const { meleeOffense, rangedOffense, totalOffense } = calculateUnitOffense(unit, config);
  const effectiveHP = calculateEffectiveHP(unit);

  const offenseEfficiency = unit.cost > 0 ? totalOffense / unit.cost : 0;
  const meleeEfficiency = unit.cost > 0 ? meleeOffense / unit.cost : 0;
  const rangedEfficiency = unit.cost > 0 ? rangedOffense / unit.cost : 0;
  const defenseEfficiency = unit.cost > 0 ? effectiveHP / unit.cost : 0;

  const rawBalVal =
    offenseEfficiency * config.offenseWeight + defenseEfficiency * (1 - config.offenseWeight);

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
  };
}

function tierFor(percentile: number): Tier {
  if (percentile >= TIER_THRESHOLDS.S) return 'S';
  if (percentile >= TIER_THRESHOLDS.A) return 'A';
  if (percentile >= TIER_THRESHOLDS.B) return 'B';
  if (percentile >= TIER_THRESHOLDS.C) return 'C';
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

  const finalResults: Record<string, BalValResult> = {};
  for (const raw of rawResults) {
    const percentile = balValRank.get(raw.unitId) ?? 1.0;
    const damagePercentile = dmgRank.get(raw.unitId) ?? 1.0;
    const survivabilityPercentile = survRank.get(raw.unitId) ?? 1.0;

    finalResults[raw.unitId] = {
      ...raw,
      normalizedBalVal: percentile,
      tier: tierFor(percentile),
      damagePercentile,
      damageTier: tierFor(damagePercentile),
      survivabilityPercentile,
      survivabilityTier: tierFor(survivabilityPercentile),
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
