import type { Weapon, Rule } from '@opr-api/shared';
import {
  calculateUnitOffense,
  calculateEffectiveHP,
  getWeaponAP,
} from '@/features/explorer/utils/balval';
import type { BalValConfig, Tier } from '@/features/explorer/utils/types';
import type { ParsedUnit } from './parseList';

export interface ThreatProfile {
  id: string;
  name: string;
  description: string;
  config: BalValConfig;
}

/**
 * "All-comers" threat suite. A balanced list should put out meaningful damage
 * across all profiles, not just one.
 */
export const THREAT_PROFILES: ThreatProfile[] = [
  {
    id: 'horde',
    name: 'Horde',
    description: 'D5+, size 10 — chaff & mass infantry. Blast shines here.',
    config: { targetDefense: 5, targetSize: 10, targetToughness: 1, offenseWeight: 0.6, assault: false, mostEffective: false },
  },
  {
    id: 'lightInfantry',
    name: 'Light Inf.',
    description: 'D4+, size 5 — generic line troops.',
    config: { targetDefense: 4, targetSize: 5, targetToughness: 1, offenseWeight: 0.6, assault: false, mostEffective: false },
  },
  {
    id: 'mediumInfantry',
    name: 'Medium Inf.',
    description: 'D3+, size 5 — power-armoured infantry. AP2+ matters.',
    config: { targetDefense: 3, targetSize: 5, targetToughness: 1, offenseWeight: 0.6, assault: false, mostEffective: false },
  },
  {
    id: 'elite',
    name: 'Elite',
    description: 'D2+, size 1 — terminator-tier. Need AP3+ or rending.',
    config: { targetDefense: 2, targetSize: 1, targetToughness: 1, offenseWeight: 0.6, assault: false, mostEffective: false },
  },
  {
    id: 'tough',
    name: 'Tough/Big',
    description: 'D3+, T(6) — vehicles & monsters. Deadly is king.',
    config: { targetDefense: 3, targetSize: 1, targetToughness: 6, offenseWeight: 0.6, assault: false, mostEffective: false },
  },
];

export type Tier5 = Tier;

export interface UnitProfileScore {
  profileId: string;
  totalOffense: number;
  meleeOffense: number;
  rangedOffense: number;
  efficiency: number; // damage per point
}

export interface UnitAnalysis {
  unitId: string;
  unitName: string;
  cost: number;
  size: number;
  isCombined: boolean;
  attachedToName?: string;
  attachedHeroNames?: string[];
  effectiveHP: number;
  perProfile: UnitProfileScore[];
  avgEfficiency: number;
  durabilityEfficiency: number; // EHP / cost
  outputTier: Tier5;
  durabilityTier: Tier5;
  /** lowest-scoring profile for this unit (its weakness) */
  worstProfileId: string;
  /** highest-scoring profile (its specialty) */
  bestProfileId: string;
  weaponSummary: WeaponSummary;
}

export interface WeaponSummary {
  totalShots: number;
  meleeShots: number;
  rangedShots: number;
  /** Max melee output once Blast and Deadly ratings are applied (stacked). */
  meleeShotsMax: number;
  /** Max ranged output once Blast and Deadly ratings are applied (stacked). */
  rangedShotsMax: number;
  apBuckets: { ap0: number; ap1: number; ap2: number; ap3plus: number };
  hasBlast: boolean;
  hasDeadly: boolean;
  hasRending: boolean;
  /** Blast — min vs size 1, max vs size ≥ rating. Split by melee/ranged. */
  meleeBlastShotsMin: number;
  meleeBlastShotsMax: number;
  rangedBlastShotsMin: number;
  rangedBlastShotsMax: number;
  /** Deadly — min vs Tough(1), max vs Tough(rating). Split by melee/ranged. */
  meleeDeadlyShotsMin: number;
  meleeDeadlyShotsMax: number;
  rangedDeadlyShotsMin: number;
  rangedDeadlyShotsMax: number;
  /** Distinct weapon entries with Blast / Deadly. */
  blastSources: number;
  deadlySources: number;
}

export interface ProfileSummary {
  profileId: string;
  totalDamage: number;
  damagePerPoint: number;
  tier: Tier5;
}

export interface AllComersBreakdown {
  apCoverage: { ap0: number; ap1: number; ap2: number; ap3plus: number; total: number };
  totalMeleeShots: number;
  totalRangedShots: number;
  totalMeleeShotsMax: number;
  totalRangedShotsMax: number;
  totalMeleeBlastMin: number;
  totalMeleeBlastMax: number;
  totalRangedBlastMin: number;
  totalRangedBlastMax: number;
  totalMeleeDeadlyMin: number;
  totalMeleeDeadlyMax: number;
  totalRangedDeadlyMin: number;
  totalRangedDeadlyMax: number;
  blastSourceCount: number;
  deadlySourceCount: number;
  rendingSourceCount: number;
  gaps: string[]; // human-readable warnings
  coverageScore: number; // 0..1
}

export interface ArmyAnalysis {
  listName: string;
  totalPoints: number;
  /** Canonical points from list metadata (Army Forge listPoints). */
  canonicalPoints?: number;
  pointsLimit?: number;
  unitCount: number;
  squadCount: number;
  heroCount: number;
  totalEffectiveHP: number;
  perProfile: ProfileSummary[];
  allComers: AllComersBreakdown;
  outputTier: Tier5;
  durabilityTier: Tier5;
  coverageTier: Tier5;
  overallTier: Tier5;
  outputScore: number;
  durabilityScore: number;
  coverageScoreNormalized: number;
  units: UnitAnalysis[];
}

// ---- Tier mapping ----
// Calibrated against typical OPR lists. Tune as data accumulates.
function tierForScore(score: number, thresholds: [number, number, number, number]): Tier5 {
  // thresholds = [D->C, C->B, B->A, A->S]
  if (score >= thresholds[3]) return 'S';
  if (score >= thresholds[2]) return 'A';
  if (score >= thresholds[1]) return 'B';
  if (score >= thresholds[0]) return 'C';
  return 'D';
}

// Calibrated against typical OPR damage-per-point output averaged across the 5
// threat profiles. A bog-standard infantry squad lands around 0.020–0.025; a
// well-built dedicated damage dealer tops 0.05; truly broken units exceed 0.07.
const OUTPUT_TIERS: [number, number, number, number] = [0.020, 0.030, 0.045, 0.065];
// EHP-per-point — D5+ size 10 chaff ~0.23, D2+ Tough(3) elite ~0.10–0.15.
const DURA_TIERS: [number, number, number, number] = [0.08, 0.12, 0.18, 0.26];
const COVERAGE_TIERS: [number, number, number, number] = [0.4, 0.55, 0.7, 0.85];

// ---- Weapon summary ----
function summarizeWeapons(weapons: Weapon[]): WeaponSummary {
  const apBuckets = { ap0: 0, ap1: 0, ap2: 0, ap3plus: 0 };
  let totalShots = 0;
  let meleeShots = 0;
  let rangedShots = 0;
  let meleeShotsMax = 0;
  let rangedShotsMax = 0;
  let hasBlast = false;
  let hasDeadly = false;
  let hasRending = false;
  let meleeBlastShotsMin = 0;
  let meleeBlastShotsMax = 0;
  let rangedBlastShotsMin = 0;
  let rangedBlastShotsMax = 0;
  let meleeDeadlyShotsMin = 0;
  let meleeDeadlyShotsMax = 0;
  let rangedDeadlyShotsMin = 0;
  let rangedDeadlyShotsMax = 0;
  let blastSources = 0;
  let deadlySources = 0;

  for (const w of weapons) {
    const shots = (w.count || 0) * (w.attacks || 0);
    totalShots += shots;
    const isMelee = (w.range || 0) === 0;
    if (isMelee) meleeShots += shots;
    else rangedShots += shots;

    const ap = getWeaponAP(w);
    if (ap === 0) apBuckets.ap0 += shots;
    else if (ap === 1) apBuckets.ap1 += shots;
    else if (ap === 2) apBuckets.ap2 += shots;
    else apBuckets.ap3plus += shots;

    const rules: Rule[] = w.specialRules || [];
    const blast = rules.find((r) => r.name === 'Blast');
    const deadly = rules.find((r) => r.name === 'Deadly');
    const blastR = blast ? Math.max(1, blast.rating ?? 1) : 1;
    const deadlyR = deadly ? Math.max(1, deadly.rating ?? 1) : 1;
    const stackedMax = shots * blastR * deadlyR;

    if (isMelee) meleeShotsMax += stackedMax;
    else rangedShotsMax += stackedMax;

    if (blast) {
      hasBlast = true;
      if (isMelee) {
        meleeBlastShotsMin += shots;
        meleeBlastShotsMax += shots * blastR;
      } else {
        rangedBlastShotsMin += shots;
        rangedBlastShotsMax += shots * blastR;
      }
      blastSources += 1;
    }
    if (deadly) {
      hasDeadly = true;
      if (isMelee) {
        meleeDeadlyShotsMin += shots;
        meleeDeadlyShotsMax += shots * deadlyR;
      } else {
        rangedDeadlyShotsMin += shots;
        rangedDeadlyShotsMax += shots * deadlyR;
      }
      deadlySources += 1;
    }
    if (rules.some((r) => r.name === 'Rending')) hasRending = true;
  }

  return {
    totalShots,
    meleeShots,
    rangedShots,
    meleeShotsMax,
    rangedShotsMax,
    apBuckets,
    hasBlast,
    hasDeadly,
    hasRending,
    meleeBlastShotsMin,
    meleeBlastShotsMax,
    rangedBlastShotsMin,
    rangedBlastShotsMax,
    meleeDeadlyShotsMin,
    meleeDeadlyShotsMax,
    rangedDeadlyShotsMin,
    rangedDeadlyShotsMax,
    blastSources,
    deadlySources,
  };
}

// ---- Unit analysis ----
function analyzeUnit(unit: ParsedUnit): UnitAnalysis {
  const perProfile: UnitProfileScore[] = THREAT_PROFILES.map((p) => {
    const o = calculateUnitOffense(unit, p.config);
    const efficiency = unit.cost > 0 ? o.totalOffense / unit.cost : 0;
    return {
      profileId: p.id,
      totalOffense: o.totalOffense,
      meleeOffense: o.meleeOffense,
      rangedOffense: o.rangedOffense,
      efficiency,
    };
  });

  const ehp = calculateEffectiveHP(unit);
  const durabilityEfficiency = unit.cost > 0 ? ehp / unit.cost : 0;
  const avgEfficiency = perProfile.reduce((s, p) => s + p.efficiency, 0) / perProfile.length;

  let worst = perProfile[0];
  let best = perProfile[0];
  for (const p of perProfile) {
    if (p.efficiency < worst.efficiency) worst = p;
    if (p.efficiency > best.efficiency) best = p;
  }

  return {
    unitId: unit.id,
    unitName: unit.name,
    cost: unit.cost,
    size: unit.size,
    isCombined: unit.isCombined,
    attachedToName: unit.attachedToName,
    attachedHeroNames: unit.attachedHeroNames,
    effectiveHP: ehp,
    perProfile,
    avgEfficiency,
    durabilityEfficiency,
    outputTier: tierForScore(avgEfficiency, OUTPUT_TIERS),
    durabilityTier: tierForScore(durabilityEfficiency, DURA_TIERS),
    worstProfileId: worst.profileId,
    bestProfileId: best.profileId,
    weaponSummary: summarizeWeapons(unit.weapons),
  };
}

// ---- Coverage / gaps ----
function buildCoverage(units: UnitAnalysis[], totalPoints: number): AllComersBreakdown {
  const apCoverage = { ap0: 0, ap1: 0, ap2: 0, ap3plus: 0, total: 0 };
  let totalMeleeShots = 0;
  let totalRangedShots = 0;
  let totalMeleeShotsMax = 0;
  let totalRangedShotsMax = 0;
  let totalMeleeBlastMin = 0;
  let totalMeleeBlastMax = 0;
  let totalRangedBlastMin = 0;
  let totalRangedBlastMax = 0;
  let totalMeleeDeadlyMin = 0;
  let totalMeleeDeadlyMax = 0;
  let totalRangedDeadlyMin = 0;
  let totalRangedDeadlyMax = 0;
  let blastSourceCount = 0;
  let deadlySourceCount = 0;
  let rendingSourceCount = 0;

  for (const u of units) {
    const w = u.weaponSummary;
    apCoverage.ap0 += w.apBuckets.ap0;
    apCoverage.ap1 += w.apBuckets.ap1;
    apCoverage.ap2 += w.apBuckets.ap2;
    apCoverage.ap3plus += w.apBuckets.ap3plus;
    apCoverage.total += w.totalShots;
    totalMeleeShots += w.meleeShots;
    totalRangedShots += w.rangedShots;
    totalMeleeShotsMax += w.meleeShotsMax;
    totalRangedShotsMax += w.rangedShotsMax;
    totalMeleeBlastMin += w.meleeBlastShotsMin;
    totalMeleeBlastMax += w.meleeBlastShotsMax;
    totalRangedBlastMin += w.rangedBlastShotsMin;
    totalRangedBlastMax += w.rangedBlastShotsMax;
    totalMeleeDeadlyMin += w.meleeDeadlyShotsMin;
    totalMeleeDeadlyMax += w.meleeDeadlyShotsMax;
    totalRangedDeadlyMin += w.rangedDeadlyShotsMin;
    totalRangedDeadlyMax += w.rangedDeadlyShotsMax;
    if (w.hasBlast) blastSourceCount += 1;
    if (w.hasDeadly) deadlySourceCount += 1;
    if (w.hasRending) rendingSourceCount += 1;
  }

  const gaps: string[] = [];
  const apShare = (n: number) =>
    apCoverage.total > 0 ? n / apCoverage.total : 0;
  const ap2Share = apShare(apCoverage.ap2 + apCoverage.ap3plus);
  const ap3Share = apShare(apCoverage.ap3plus);

  if (ap2Share < 0.15) gaps.push('Low AP2+ — will struggle vs power-armoured infantry.');
  if (ap3Share < 0.05) gaps.push('Almost no AP3+ — elite/terminator targets will tank hits.');
  if (blastSourceCount === 0) gaps.push('No Blast — hordes will be slow to chew through.');
  if (deadlySourceCount === 0) gaps.push('No Deadly — Tough(3+) targets cost-inefficient to kill.');

  // Coverage score — reward AP diversity + presence of blast/deadly/rending.
  // 4 axes, each 0..1, then averaged with weights.
  const apDiversity = (() => {
    if (apCoverage.total === 0) return 0;
    const shares = [apCoverage.ap0, apCoverage.ap1, apCoverage.ap2, apCoverage.ap3plus].map(
      (n) => n / apCoverage.total,
    );
    // High-AP ramp: reward presence of AP2+ and AP3+, but don't punish base shots.
    const ap2Plus = shares[2] + shares[3];
    return Math.min(1, 0.4 + ap2Plus * 1.4); // 0.4 floor when lacking AP, full score around 43% AP2+
  })();
  const blastPresence = blastSourceCount > 0 ? Math.min(1, blastSourceCount / 2) : 0;
  const deadlyPresence = deadlySourceCount > 0 ? Math.min(1, deadlySourceCount / 2) : 0;
  const rendingBonus = rendingSourceCount > 0 ? 0.1 : 0;

  const coverageScore = Math.min(
    1,
    apDiversity * 0.45 + blastPresence * 0.25 + deadlyPresence * 0.25 + rendingBonus,
  );

  // Bonus for cheap output (Blast/Deadly): if blast OR deadly contribute non-trivial
  // share of total output we don't penalize lower raw shot count.
  if (totalPoints > 0 && blastSourceCount === 0 && deadlySourceCount === 0) {
    gaps.push('Output relies entirely on raw shots — no cheap multiplier weapons.');
  }

  return {
    apCoverage,
    totalMeleeShots,
    totalRangedShots,
    totalMeleeShotsMax,
    totalRangedShotsMax,
    totalMeleeBlastMin,
    totalMeleeBlastMax,
    totalRangedBlastMin,
    totalRangedBlastMax,
    totalMeleeDeadlyMin,
    totalMeleeDeadlyMax,
    totalRangedDeadlyMin,
    totalRangedDeadlyMax,
    blastSourceCount,
    deadlySourceCount,
    rendingSourceCount,
    gaps,
    coverageScore,
  };
}

// ---- Main entry ----
export interface AnalyzeListOptions {
  canonicalPoints?: number;
  pointsLimit?: number;
  squadCount?: number;
  heroCount?: number;
}

export function analyzeList(
  listName: string,
  units: ParsedUnit[],
  options: AnalyzeListOptions = {},
): ArmyAnalysis {
  const unitAnalyses = units.map(analyzeUnit);
  const summedPoints = units.reduce((s, u) => s + u.cost, 0);
  // Prefer canonical points (Army Forge listPoints) for normalization — it's the
  // ground-truth total. Fall back to summed parsed costs.
  const totalPoints = options.canonicalPoints && options.canonicalPoints > 0
    ? options.canonicalPoints
    : summedPoints;
  const totalEffectiveHP = unitAnalyses.reduce((s, u) => s + u.effectiveHP, 0);

  // Per-profile army totals
  const perProfile: ProfileSummary[] = THREAT_PROFILES.map((p) => {
    const totalDamage = unitAnalyses.reduce((s, u) => {
      const x = u.perProfile.find((pp) => pp.profileId === p.id);
      return s + (x?.totalOffense ?? 0);
    }, 0);
    const damagePerPoint = totalPoints > 0 ? totalDamage / totalPoints : 0;
    return {
      profileId: p.id,
      totalDamage,
      damagePerPoint,
      tier: tierForScore(damagePerPoint, OUTPUT_TIERS),
    };
  });

  const avgOutput = perProfile.reduce((s, p) => s + p.damagePerPoint, 0) / perProfile.length;
  const durabilityScore = totalPoints > 0 ? totalEffectiveHP / totalPoints : 0;

  const allComers = buildCoverage(unitAnalyses, totalPoints);

  // Coverage tier — combines profile balance + ap/blast/deadly presence.
  // Profile balance = 1 - normalized stddev of damagePerPoint across profiles.
  const profileMean = avgOutput || 0.0001;
  const variance =
    perProfile.reduce((s, p) => s + (p.damagePerPoint - profileMean) ** 2, 0) / perProfile.length;
  const stddev = Math.sqrt(variance);
  const balance = Math.max(0, 1 - stddev / profileMean); // 1 = perfectly even; 0 = heavily skewed
  const coverageScoreNormalized = allComers.coverageScore * 0.6 + balance * 0.4;

  const outputTier = tierForScore(avgOutput, OUTPUT_TIERS);
  const durabilityTier = tierForScore(durabilityScore, DURA_TIERS);
  const coverageTier = tierForScore(coverageScoreNormalized, COVERAGE_TIERS);

  // Overall — weighted: coverage heaviest (the user's stated priority for all-comers),
  // then output (cheap output preferred), durability supporting.
  const overallScoreNorm =
    Math.min(1, avgOutput / OUTPUT_TIERS[3]) * 0.35 +
    Math.min(1, durabilityScore / DURA_TIERS[3]) * 0.2 +
    coverageScoreNormalized * 0.45;
  const overallTier = tierForScore(overallScoreNorm, [0.35, 0.5, 0.65, 0.82]);

  return {
    listName,
    totalPoints,
    canonicalPoints: options.canonicalPoints,
    pointsLimit: options.pointsLimit,
    unitCount: units.length,
    squadCount: options.squadCount ?? units.length,
    heroCount: options.heroCount ?? 0,
    totalEffectiveHP,
    perProfile,
    allComers,
    outputTier,
    durabilityTier,
    coverageTier,
    overallTier,
    outputScore: avgOutput,
    durabilityScore,
    coverageScoreNormalized,
    units: unitAnalyses,
  };
}

export function profileById(id: string): ThreatProfile | undefined {
  return THREAT_PROFILES.find((p) => p.id === id);
}
