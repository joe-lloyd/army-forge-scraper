import type { Weapon, Rule } from '@opr-api/shared';
import { calculateUnitOffense, calculateEffectiveHP, getWeaponAP } from '@/features/explorer/utils/balval';
import type { Tier } from '@/features/explorer/utils/types';
import type { ParsedUnit } from './parseList';

export type Tier5 = Tier;

// ---- Opponent army profiles ----
//
// Each profile is a hypothetical 2000-pt skew opponent. We measure:
//   "Can our list put out enough damage to crush this army?"
//
// modelsPerUnit drives Blast (Blast(R) caps at min(R, modelsPerUnit) per attack).
// tough drives Deadly (Deadly(R) caps at min(R, tough)).
// totalWounds = unitCount * modelsPerUnit * tough — the entire army's HP pool.

export interface OpponentProfile {
  id: string;
  name: string;
  short: string;
  description: string;
  defense: number;
  modelsPerUnit: number;
  unitCount: number;
  tough: number;
  /** Derived: full army wounds at 2000pts. */
  totalWounds: number;
}

function mkProfile(p: Omit<OpponentProfile, 'totalWounds'>): OpponentProfile {
  return { ...p, totalWounds: p.unitCount * p.modelsPerUnit * p.tough };
}

export const OPPONENT_PROFILES: OpponentProfile[] = [
  mkProfile({
    id: 'horde',
    name: 'Horde Army',
    short: 'Horde',
    description: '~144 D6+ Tough(1) chaff. Volume + Blast wins; AP is wasted.',
    defense: 6,
    modelsPerUnit: 12,
    unitCount: 12,
    tough: 1,
  }),
  mkProfile({
    id: 'infantry',
    name: 'Infantry Army',
    short: 'Infantry',
    description: '~72 D4+ Tough(1) line troops. Standard battle target.',
    defense: 4,
    modelsPerUnit: 6,
    unitCount: 12,
    tough: 1,
  }),
  mkProfile({
    id: 'elite',
    name: 'Elite Army',
    short: 'Elite',
    description: '~40 D3+ Tough(3) power-armoured. Need AP2+ and durability.',
    defense: 3,
    modelsPerUnit: 4,
    unitCount: 10,
    tough: 3,
  }),
  mkProfile({
    id: 'monsters',
    name: 'Tanks & Monsters',
    short: 'Monsters',
    description: '7 D2+ Tough(12) walkers/tanks. Need Deadly + AP4. Blast wasted.',
    defense: 2,
    modelsPerUnit: 1,
    unitCount: 7,
    tough: 12,
  }),
];

// Backwards-compat alias used by older UI code paths (kept as deprecated).
export const THREAT_PROFILES = OPPONENT_PROFILES;
export type ThreatProfile = OpponentProfile;

// ---- Public types ----

export interface UnitVsProfile {
  profileId: string;
  /** Expected wounds dealt to a single squad of this profile per activation. */
  expectedWoundsPerSquad: number;
  /** Expected wounds dealt to the army (capped by total wounds). */
  expectedWoundsTotal: number;
  /** Fraction of opponent army wiped (0..1, capped). */
  killShare: number;
  /** Unit cost / army cost. */
  pointsShare: number;
  /** killShare / pointsShare — values >1 mean better-than-fair-share output. */
  efficiency: number;
  tier: Tier5;
  /** Detected overkill warnings (AP, Blast, Deadly) for this profile. */
  overkillNotes: string[];
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
  perProfile: UnitVsProfile[];
  /** Mean efficiency across profiles (1.0 = perfectly average all-rounder). */
  avgEfficiency: number;
  /** Min efficiency across profiles (the unit's worst matchup). */
  worstEfficiency: number;
  durabilityEfficiency: number; // EHP / cost
  outputTier: Tier5;
  durabilityTier: Tier5;
  worstProfileId: string;
  bestProfileId: string;
  weaponSummary: WeaponSummary;
}

export interface WeaponSummary {
  totalShots: number;
  meleeShots: number;
  rangedShots: number;
  meleeShotsMax: number;
  rangedShotsMax: number;
  apBuckets: { ap0: number; ap1: number; ap2: number; ap3plus: number };
  hasBlast: boolean;
  hasDeadly: boolean;
  hasRending: boolean;
  meleeBlastShotsMin: number;
  meleeBlastShotsMax: number;
  rangedBlastShotsMin: number;
  rangedBlastShotsMax: number;
  meleeDeadlyShotsMin: number;
  meleeDeadlyShotsMax: number;
  rangedDeadlyShotsMin: number;
  rangedDeadlyShotsMax: number;
  blastSources: number;
  deadlySources: number;
}

export interface ArmyVsProfile {
  profileId: string;
  /** Sum of expectedWoundsTotal across all units (raw, uncapped). */
  totalExpectedWounds: number;
  /** Capped at opponent.totalWounds. */
  effectiveKillWounds: number;
  /** effectiveKillWounds / opponent.totalWounds (0..1). */
  killPercent: number;
  tier: Tier5;
}

export interface OutputMixSummary {
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
}

export interface ArmyAnalysis {
  listName: string;
  totalPoints: number;
  canonicalPoints?: number;
  pointsLimit?: number;
  unitCount: number;
  squadCount: number;
  heroCount: number;
  totalEffectiveHP: number;
  /** Per-opponent-army results. */
  perProfile: ArmyVsProfile[];
  outputMix: OutputMixSummary;
  /** Aggregated overkill warnings (de-duped, top units flagged). */
  overkillWarnings: string[];
  /** Per-profile gaps + general all-comers gaps. */
  gaps: string[];
  /** Avg killPercent across profiles. */
  avgKillPercent: number;
  /** Worst killPercent — limits all-comers viability. */
  worstKillPercent: number;
  outputTier: Tier5;
  durabilityTier: Tier5;
  coverageTier: Tier5;
  overallTier: Tier5;
  durabilityScore: number;
  units: UnitAnalysis[];
}

// ---- Tier mapping ----
function tierForScore(score: number, thresholds: [number, number, number, number]): Tier5 {
  if (score >= thresholds[3]) return 'S';
  if (score >= thresholds[2]) return 'A';
  if (score >= thresholds[1]) return 'B';
  if (score >= thresholds[0]) return 'C';
  return 'D';
}

// Unit efficiency = killShare / pointsShare. 1.0 = pulls own weight; <0.5 = dead weight.
const UNIT_EFFICIENCY_TIERS: [number, number, number, number] = [0.5, 0.85, 1.2, 1.7];
// Army-vs-profile kill % thresholds. Calibrated so a focused anti-horde list (e.g.
// Sisters w/ 18 Blessed Flamers, Q3+ Reliable Blast(3)) hits A vs Horde and
// S vs Infantry, while still landing D vs Monsters when no Deadly is brought.
const ARMY_KILL_TIERS: [number, number, number, number] = [0.25, 0.4, 0.6, 0.8];
// Durability EHP/pt — unchanged from before.
const DURA_TIERS: [number, number, number, number] = [0.08, 0.12, 0.18, 0.26];

// ---- Weapon summary (unchanged) ----
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

// ---- Overkill detection ----
//
// AP overkill: a save floors at 1/6 once effective defense ≥ 7 (natural-6 always
// saves). Min-useful-AP = max(0, 6 - defense). Anything above is wasted shots-
// equivalent. We surface waste only when it's substantial (≥2 wasted AP) AND the
// weapon contributes ≥4 weighted shots-AP — keeps noise out for small sidearms.
//
// Blast(R) overkill: caps at min(R, modelsPerUnit). Excess R is wasted.
// Deadly(R) overkill: caps at min(R, tough). Excess R is wasted.

function overkillNotesForUnit(unit: ParsedUnit, profile: OpponentProfile): string[] {
  const notes: string[] = [];
  const apFloor = Math.max(0, 6 - profile.defense);

  for (const w of unit.weapons) {
    const shots = (w.count || 0) * (w.attacks || 0);
    if (shots <= 0) continue;
    const ap = getWeaponAP(w);
    const apWasted = Math.max(0, ap - apFloor);
    if (apWasted >= 2 && apWasted * shots >= 4) {
      notes.push(`${w.name}: AP${ap} overkill vs D${profile.defense}+ (only AP${apFloor} useful)`);
    }

    const rules: Rule[] = w.specialRules || [];
    const blast = rules.find((r) => r.name === 'Blast');
    if (blast) {
      const r = Math.max(1, blast.rating ?? 1);
      const wasted = Math.max(0, r - profile.modelsPerUnit);
      if (wasted >= 2 && shots >= 1) {
        notes.push(
          `${w.name}: Blast(${r}) wasted vs ${profile.modelsPerUnit}-model targets (caps at ${profile.modelsPerUnit})`,
        );
      }
    }
    const deadly = rules.find((r) => r.name === 'Deadly');
    if (deadly) {
      const r = Math.max(1, deadly.rating ?? 1);
      const wasted = Math.max(0, r - profile.tough);
      if (wasted >= 2 && shots >= 1) {
        notes.push(
          `${w.name}: Deadly(${r}) wasted vs Tough(${profile.tough}) (caps at ${profile.tough})`,
        );
      }
    }
  }
  return notes;
}

// ---- Per-unit analysis ----

function analyzeUnit(unit: ParsedUnit, totalArmyPoints: number): UnitAnalysis {
  const perProfile: UnitVsProfile[] = OPPONENT_PROFILES.map((p) => {
    const offense = calculateUnitOffense(unit, {
      targetDefense: p.defense,
      targetSize: p.modelsPerUnit,
      targetToughness: p.tough,
      offenseWeight: 0.6,
      assault: false,
      mostEffective: false,
    });
    // expected wounds the unit deals in a single activation against ONE squad of
    // this profile. That's also the army-wide damage potential per turn (each
    // unit fires once), but we compare it against the army's total wound pool.
    const expectedWoundsPerSquad = offense.totalOffense;
    const expectedWoundsTotal = expectedWoundsPerSquad; // single-activation snapshot
    const killShare = p.totalWounds > 0 ? Math.min(1, expectedWoundsTotal / p.totalWounds) : 0;
    const pointsShare = totalArmyPoints > 0 ? unit.cost / totalArmyPoints : 0;
    const efficiency = pointsShare > 0 ? killShare / pointsShare : 0;
    return {
      profileId: p.id,
      expectedWoundsPerSquad,
      expectedWoundsTotal,
      killShare,
      pointsShare,
      efficiency,
      tier: tierForScore(efficiency, UNIT_EFFICIENCY_TIERS),
      overkillNotes: overkillNotesForUnit(unit, p),
    };
  });

  const ehp = calculateEffectiveHP(unit);
  const durabilityEfficiency = unit.cost > 0 ? ehp / unit.cost : 0;
  const avgEfficiency = perProfile.reduce((s, p) => s + p.efficiency, 0) / perProfile.length;
  const worstEfficiency = perProfile.reduce(
    (m, p) => Math.min(m, p.efficiency),
    Number.POSITIVE_INFINITY,
  );

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
    worstEfficiency: Number.isFinite(worstEfficiency) ? worstEfficiency : 0,
    durabilityEfficiency,
    outputTier: tierForScore(avgEfficiency, UNIT_EFFICIENCY_TIERS),
    durabilityTier: tierForScore(durabilityEfficiency, DURA_TIERS),
    worstProfileId: worst.profileId,
    bestProfileId: best.profileId,
    weaponSummary: summarizeWeapons(unit.weapons),
  };
}

// ---- Output mix (unchanged shape) ----
function buildOutputMix(units: UnitAnalysis[]): OutputMixSummary {
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
  const summedPoints = units.reduce((s, u) => s + u.cost, 0);
  const totalPoints =
    options.canonicalPoints && options.canonicalPoints > 0
      ? options.canonicalPoints
      : summedPoints;

  const unitAnalyses = units.map((u) => analyzeUnit(u, totalPoints));
  const totalEffectiveHP = unitAnalyses.reduce((s, u) => s + u.effectiveHP, 0);

  // Per-opponent army totals
  const perProfile: ArmyVsProfile[] = OPPONENT_PROFILES.map((p) => {
    const totalExpectedWounds = unitAnalyses.reduce((s, u) => {
      const x = u.perProfile.find((pp) => pp.profileId === p.id);
      return s + (x?.expectedWoundsTotal ?? 0);
    }, 0);
    const effectiveKillWounds = Math.min(p.totalWounds, totalExpectedWounds);
    const killPercent = p.totalWounds > 0 ? effectiveKillWounds / p.totalWounds : 0;
    return {
      profileId: p.id,
      totalExpectedWounds,
      effectiveKillWounds,
      killPercent,
      tier: tierForScore(killPercent, ARMY_KILL_TIERS),
    };
  });

  const outputMix = buildOutputMix(unitAnalyses);

  // Gaps — generated from per-profile shortcomings.
  const gaps: string[] = [];
  for (const ap of perProfile) {
    const profile = OPPONENT_PROFILES.find((x) => x.id === ap.profileId)!;
    if (ap.killPercent < 0.3) {
      gaps.push(`${profile.name}: only ${Math.round(ap.killPercent * 100)}% kill — heavily under-equipped.`);
    } else if (ap.killPercent < 0.5) {
      gaps.push(`${profile.name}: ${Math.round(ap.killPercent * 100)}% kill — likely lose this matchup.`);
    }
  }

  // Top overkill warnings — surface top 5 most-impactful from per-unit notes.
  const overkillCounts = new Map<string, number>();
  for (const u of unitAnalyses) {
    for (const p of u.perProfile) {
      for (const note of p.overkillNotes) {
        const key = `${u.unitName} → ${note}`;
        overkillCounts.set(key, (overkillCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const overkillWarnings = [...overkillCounts.keys()].slice(0, 8);

  const avgKillPercent = perProfile.reduce((s, p) => s + p.killPercent, 0) / perProfile.length;
  const worstKillPercent = perProfile.reduce((m, p) => Math.min(m, p.killPercent), 1);

  const durabilityScore = totalPoints > 0 ? totalEffectiveHP / totalPoints : 0;

  // Tier composition:
  // - outputTier: from average kill% across opponents (overall punching power).
  // - coverageTier: from worst kill% (the all-comers bottleneck).
  // - durabilityTier: EHP/pt as before.
  // - overallTier: weighted combo. Coverage carries most weight per the user's
  //   stated all-comers priority; output supports it; durability backstop.
  const outputTier = tierForScore(avgKillPercent, ARMY_KILL_TIERS);
  const coverageTier = tierForScore(worstKillPercent, ARMY_KILL_TIERS);
  const durabilityTier = tierForScore(durabilityScore, DURA_TIERS);

  const overallScoreNorm =
    Math.min(1, avgKillPercent / ARMY_KILL_TIERS[3]) * 0.35 +
    Math.min(1, durabilityScore / DURA_TIERS[3]) * 0.2 +
    Math.min(1, worstKillPercent / ARMY_KILL_TIERS[3]) * 0.45;
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
    outputMix,
    overkillWarnings,
    gaps,
    avgKillPercent,
    worstKillPercent,
    outputTier,
    durabilityTier,
    coverageTier,
    overallTier,
    durabilityScore,
    units: unitAnalyses,
  };
}

export function profileById(id: string): OpponentProfile | undefined {
  return OPPONENT_PROFILES.find((p) => p.id === id);
}
