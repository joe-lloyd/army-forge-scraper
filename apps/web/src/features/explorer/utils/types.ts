export interface BalValConfig {
  /** The baseline defense to score against (e.g. 4 for 4+) */
  targetDefense: number;
  /** The assumed size of the target unit for Blast calculations (1 = elite, 10 = horde) */
  targetSize: number;
  /** The assumed toughness of individual target models for Deadly calculations (1, 3, 6, 9...) */
  targetToughness: number;
  /** The weight given to offense vs defense (0.0 to 1.0, default 0.6) */
  offenseWeight: number;
  /** Whether the Assault advanced rule is active (-1 to hit in shooting/melee) */
  assault: boolean;
  /** Whether to automatically show the unit with its most efficient loadout */
  mostEffective: boolean;
}

export type Tier = "S" | "A" | "B" | "C" | "D";

export interface BalValResult {
  unitId: string;
  unitCost: number;

  unitOffense: number; // Max of melee and ranged
  unitMeleeOffense: number;
  unitRangedOffense: number;
  effectiveHP: number;

  offenseEfficiency: number;
  meleeEfficiency: number;
  rangedEfficiency: number;
  defenseEfficiency: number;

  rawBalVal: number;
  normalizedBalVal: number; // Percentile rank (0.0 to 1.0)

  tier: Tier;
}

export const TIER_THRESHOLDS = {
  S: 0.9, // Top 10%
  A: 0.7, // Top 30%
  B: 0.4, // Middle 30%
  C: 0.15, // Bottom 40%
  D: 0.0, // Bottom 15%
} as const;

export const DEFAULT_BALVAL_CONFIG: BalValConfig = {
  targetDefense: 4,
  targetSize: 5,
  targetToughness: 1,
  offenseWeight: 0.6,
  assault: false,
  mostEffective: false,
};
