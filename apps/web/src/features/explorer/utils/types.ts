export interface BalValConfig {
  /** The baseline defense to score against (e.g. 4 for 4+) */
  targetDefense: number;
  /** The assumed size of the target unit for Blast calculations (1 = elite, 10 = horde) */
  targetSize: number;
  /** The assumed toughness of individual target models for Deadly calculations (1, 3, 6, 9...) */
  targetToughness: number;
  /** The weight given to offense vs defense (0.0 to 1.0, default 0.6) */
  offenseWeight: number;
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface BalValResult {
  unitId: string;
  unitCost: number;
  
  unitOffense: number;
  effectiveHP: number;
  
  offenseEfficiency: number;
  defenseEfficiency: number;
  
  rawBalVal: number;
  normalizedBalVal: number; // Percentile rank (0.0 to 1.0)
  
  tier: Tier;
}

export const TIER_THRESHOLDS = {
  S: 0.90, // Top 10%
  A: 0.70, // Top 30%
  B: 0.40, // Middle 30%
  C: 0.15, // Bottom 40%
  D: 0.00, // Bottom 15%
} as const;

export const DEFAULT_BALVAL_CONFIG: BalValConfig = {
  targetDefense: 4,
  targetSize: 5,
  targetToughness: 3,
  offenseWeight: 0.6,
};
