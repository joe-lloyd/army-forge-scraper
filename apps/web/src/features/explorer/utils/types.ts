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
  /** Assault advanced rule active (-1 to hit) */
  assault: boolean;
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
  assault: false,
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
}

export interface LoadoutOption {
  id: string;
  label: string;
  state: LoadoutState;

  meleeOffense: number;
  rangedOffense: number;
  offense: number;
  efficiency: number;

  baseEfficiency: number;
  efficiencyDelta: number;
  offenseDelta: number;
  costDelta: number;

  isBase: boolean;
  isBestCombo: boolean;
  applications: UpgradeApplication[];
}
