import type { Weapon } from '@opr-api/shared';

export interface BalValConfig {
  /** Baseline target defense (e.g. 4 for 4+) */
  targetDefense: number;
  /** Assumed target unit size for Blast (1 elite → 10+ horde) */
  targetSize: number;
  /** Assumed target toughness for Deadly (1, 3, 6, 9, ...) */
  targetToughness: number;
  /** Offense vs defense weight (0–1, default 0.6) */
  offenseWeight: number;
  /** Auto-apply most efficient loadout per unit */
  mostEffective: boolean;
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface BalValResult {
  unitId: string;
  unitCost: number;

  unitOffense: number;
  unitMeleeOffense: number;
  unitRangedOffense: number;
  effectiveHP: number;

  offenseEfficiency: number;
  meleeEfficiency: number;
  rangedEfficiency: number;
  defenseEfficiency: number;

  rawBalVal: number;
  normalizedBalVal: number;
  /** Combined tier (kept for compatibility). Damage-tier is the new primary. */
  tier: Tier;

  /** Damage tier — percentile rank of offense efficiency within the army. */
  damageTier: Tier;
  damagePercentile: number;
  /** Survivability tier — percentile rank of defense efficiency within the army. */
  survivabilityTier: Tier;
  survivabilityPercentile: number;

  // ---- Effectiveness model (probabilistic kill against the configured target).
  /** ceil(targetHP / expectedWounds); Infinity when expectedWounds < 0.1. */
  activationsToKill: number;
  /** unit.cost × activationsToKill; Infinity when ATK is Infinity. */
  pointsToKill: number;
  /** P(wounds >= targetHP) per activation, via Poisson(λ = expectedWounds). */
  killProbPerActivation: number;
  /** Per-round cumulative kill probability across the 4-round game. */
  cumulativeKillProb: [number, number, number, number];
  /** cumulativeKillProb[3] — chance the target is removed by end of round 4. */
  killProbByGameEnd: number;
  /** Per-round cumulative P(target taken to ≤ half HP → must take morale / be shaken). */
  cumulativeMoraleProb: [number, number, number, number];
  /** cumulativeMoraleProb[3] — chance the target was at least shaken by end of round 4. */
  moraleProbByGameEnd: number;
  /** Expected round of first kill (1..4). Infinity if game-end kill prob < 5%. */
  expectedRoundToKill: number;
  /** Expected round of first morale trigger (1..4). Infinity if game-end morale prob < 5%. */
  expectedRoundToMorale: number;
  /** Raw effectiveness — round-weighted kill + morale value per point. */
  effectivenessScore: number;
  /** Percentile rank of effectivenessScore within the army. */
  effectivenessPercentile: number;
  effectivenessTier: Tier;
  /** Percentile rank of (damagePercentile + effectivenessPercentile) / 2. */
  combinedPercentile: number;
  combinedTier: Tier;
}

export const TIER_THRESHOLDS = {
  S: 0.9,
  A: 0.7,
  B: 0.4,
  C: 0.15,
  D: 0.0,
} as const;

export const DEFAULT_BALVAL_CONFIG: BalValConfig = {
  targetDefense: 4,
  targetSize: 5,
  targetToughness: 1,
  offenseWeight: 0.6,
  mostEffective: false,
};

// ---- Loadout types ----

export interface ParsedSectionLabel {
  quantity: number | 'all';
  isReplace: boolean;
  raw: string;
}

export interface UpgradeApplication {
  packageUid: string;
  sectionId: string;
  sectionLabel: string;
  optionId: string;
  optionLabel: string;
  variant: string;
  quantity: number;
  costApplied: number;
  weaponsAdded: Weapon[];
  weaponsRemoved: { weapon: Weapon; count: number }[];
}

export interface LoadoutState {
  weapons: Weapon[];
  cost: number;
  applications: UpgradeApplication[];
}

export interface LoadoutScore {
  meleeOffense: number;
  rangedOffense: number;
  offense: number;
  efficiency: number;
  killProbByGameEnd: number;
  moraleProbByGameEnd: number;
  cumulativeKillProb: [number, number, number, number];
  cumulativeMoraleProb: [number, number, number, number];
  expectedRoundToKill: number;
  expectedRoundToMorale: number;
  activationsToKill: number;
  pointsToKill: number;
  effectivenessScore: number;
  combinedScore: number;
}

export interface LoadoutOption {
  id: string;
  label: string;
  state: LoadoutState;

  meleeOffense: number;
  rangedOffense: number;
  offense: number;
  efficiency: number;

  killProbByGameEnd: number;
  moraleProbByGameEnd: number;
  cumulativeKillProb: [number, number, number, number];
  cumulativeMoraleProb: [number, number, number, number];
  expectedRoundToKill: number;
  expectedRoundToMorale: number;
  activationsToKill: number;
  pointsToKill: number;
  effectivenessScore: number;
  combinedScore: number;

  // Raw shot volume (count × attacks) summed across the loadout's weapons.
  // Damage already factors in AP via blockChance; these counts ignore AP so
  // they capture "swing volume" — useful when a player wants to flood targets
  // rather than maximize per-hit lethality.
  meleeAttacks: number;
  rangedAttacks: number;
  totalAttacks: number;

  baseEfficiency: number;
  efficiencyDelta: number;
  /** Base combined score (efficiency + effectiveness average) for delta math. */
  baseCombinedScore: number;
  /** Combined-score delta vs base — used for loadout up/down colouring. */
  combinedDelta: number;
  offenseDelta: number;
  costDelta: number;

  isBase: boolean;
  // Highest combined effectiveness+efficiency score — the current ⭐ flag.
  isBestCombo: boolean;
  // Highest total attack count, with expected damage as tiebreaker. AP wins
  // via the damage tiebreaker (3 attacks AP(3) > 3 attacks AP(0)).
  isMostOutput: boolean;
  // Highest melee attack count, melee damage tiebreaker.
  isMostMelee: boolean;
  // Highest ranged attack count, ranged damage tiebreaker.
  isMostRanged: boolean;
  applications: UpgradeApplication[];
}
