import { describe, it, expect } from 'vitest';
import {
  getHitChance,
  getBlockChance,
  blockChanceWithReroll,
  getDamageMultiplier,
  getWeaponAP,
  calculateWeaponOffense,
  calculateUnitOffense,
  calculateEffectiveHP,
  calculateArmyBalVal,
  targetHP,
  killProbabilityPerActivation,
  cumulativeKillCurve,
  activationsToKill,
  pointsToKill,
} from './balval';
import {
  parseSectionLabel,
  findReplacedWeapons,
  buildBaseLoadout,
  applyOption,
  findBestLoadout,
  enumerateOptionLoadouts,
  getAllLoadouts,
  getOptionCost,
} from './loadout';
import type { Unit, Weapon, Rule } from '@opr-api/shared';
import { DEFAULT_BALVAL_CONFIG } from './types';

describe('Math-Hammer BalVal Engine', () => {
  describe('getHitChance', () => {
    it('calculates hit chance based on quality (2+ to 6+)', () => {
      expect(getHitChance(2)).toBeCloseTo(5 / 6);
      expect(getHitChance(3)).toBeCloseTo(4 / 6);
      expect(getHitChance(4)).toBeCloseTo(0.5);
      expect(getHitChance(5)).toBeCloseTo(2 / 6);
      expect(getHitChance(6)).toBeCloseTo(1 / 6);
    });

    it('caps quality bounds to 2+ and 6+', () => {
      expect(getHitChance(1)).toBeCloseTo(5 / 6);
      expect(getHitChance(7)).toBeCloseTo(1 / 6);
    });

    it('floors at 1/6 (natural 6 always hits) and caps at 5/6 (natural 1 always misses)', () => {
      expect(getHitChance(0)).toBeCloseTo(5 / 6);
      expect(getHitChance(1)).toBeCloseTo(5 / 6);
      expect(getHitChance(2)).toBeCloseTo(5 / 6);
      expect(getHitChance(6)).toBeCloseTo(1 / 6);
      expect(getHitChance(7)).toBeCloseTo(1 / 6);
    });
  });

  describe('getBlockChance', () => {
    it('calculates block chance without AP', () => {
      expect(getBlockChance(2, 0)).toBeCloseTo(5 / 6);
      expect(getBlockChance(4, 0)).toBeCloseTo(0.5);
      expect(getBlockChance(6, 0)).toBeCloseTo(1 / 6);
    });

    it('reduces block chance based on AP', () => {
      expect(getBlockChance(3, 1)).toBeCloseTo(0.5);
      expect(getBlockChance(2, 4)).toBeCloseTo(1 / 6);
    });

    it('floors block chance at 1/6 even when AP exceeds defense (natural 6 always succeeds)', () => {
      expect(getBlockChance(4, 3)).toBeCloseTo(1 / 6);
      expect(getBlockChance(5, 4)).toBeCloseTo(1 / 6);
      expect(getBlockChance(2, 10)).toBeCloseTo(1 / 6);
    });

    it('keeps the 1/6 natural-6 save floor across the audited (def, ap) suite', () => {
      expect(getBlockChance(2, 0)).toBeCloseTo(5 / 6);
      expect(getBlockChance(2, 4)).toBeCloseTo(1 / 6);
      expect(getBlockChance(5, 0)).toBeCloseTo(2 / 6);
      expect(getBlockChance(5, 4)).toBeCloseTo(1 / 6);
      expect(getBlockChance(6, 4)).toBeCloseTo(1 / 6);
    });
  });

  describe('blockChanceWithReroll', () => {
    it('returns base block chance when reroll flag is off', () => {
      expect(blockChanceWithReroll(4, 0, false)).toBeCloseTo(0.5);
    });

    it('cuts the natural-6 saves with Bane/Lacerate reroll (Def 2+ vs AP 4)', () => {
      // base block = 1/6 (floor); rerolling that 1/6 of saves at the same
      // block prob: (1/6) * 7/6 - 1/6 = 7/36 - 6/36 = 1/36.
      expect(blockChanceWithReroll(2, 4, true)).toBeCloseTo(1 / 36);
    });

    it('shaves the natural-6 saves cleanly when block prob is finite', () => {
      // Def 4+, AP 0 → block = 0.5. Reroll: 0.5 * 7/6 - 1/6 = 7/12 - 2/12 = 5/12.
      expect(blockChanceWithReroll(4, 0, true)).toBeCloseTo(5 / 12);
    });
  });

  describe('getWeaponAP', () => {
    it('extracts AP rating from weapon rules', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Plasma Rifle', name: 'Plasma Rifle', attacks: 1, count: 1, range: 24,
        specialRules: [{ id: 'r1', name: 'AP', rating: 2 } as Rule],
      };
      expect(getWeaponAP(weapon)).toBe(2);
    });

    it('returns 0 if no AP rule exists', () => {
      const weapon: Weapon = { id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 1, range: 24, specialRules: [] };
      expect(getWeaponAP(weapon)).toBe(0);
    });
  });

  describe('getDamageMultiplier', () => {
    it('returns 1x multiplier for normal weapons', () => {
      const weapon: Weapon = { id: 'w1', label: 'Sword', name: 'Sword', attacks: 1, count: 1, range: 0, specialRules: [] };
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(1);
    });

    it('applies Deadly multiplier correctly', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Sniper', name: 'Sniper', attacks: 1, count: 1, range: 30,
        specialRules: [{ id: 'r1', name: 'Deadly', rating: 3 } as Rule],
      };
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(1);
      expect(getDamageMultiplier(weapon, 4, 1, 3, 0.5)).toBe(3);
      expect(getDamageMultiplier(weapon, 4, 1, 5, 0.5)).toBe(3);
    });

    it('applies Blast multiplier correctly', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Rocket', name: 'Rocket', attacks: 1, count: 1, range: 24,
        specialRules: [{ id: 'r1', name: 'Blast', rating: 3 } as Rule],
      };
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(1);
      expect(getDamageMultiplier(weapon, 4, 5, 1, 0.5)).toBe(3);
    });

    it('applies Reliable multiplier correctly (reroll 1s)', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Spear', name: 'Spear', attacks: 1, count: 1, range: 0,
        specialRules: [{ id: 'r1', name: 'Reliable' } as Rule],
      };
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBeCloseTo(1 + 1 / 6);
    });

    it('applies Rending multiplier correctly (divide by armor failure rate)', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Claws', name: 'Claws', attacks: 1, count: 1, range: 0,
        specialRules: [{ id: 'r1', name: 'Rending' } as Rule],
      };
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(2.0);
      expect(getDamageMultiplier(weapon, 2, 1, 1, 0.5)).toBeCloseTo(6.0);
    });
  });

  describe('calculateWeaponOffense', () => {
    it('calculates expected damage against target profile', () => {
      const weapon: Weapon = { id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 5, range: 24, specialRules: [] };
      expect(calculateWeaponOffense(weapon, 4, 4, 1, 1)).toBeCloseTo(1.25);
    });

    it('incorporates AP into expected damage', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Plasma', name: 'Plasma', attacks: 1, count: 5, range: 24,
        specialRules: [{ id: 'r1', name: 'AP', rating: 2 } as Rule],
      };
      expect(calculateWeaponOffense(weapon, 4, 4, 1, 1)).toBeCloseTo(2.0833);
    });

    it('applies Reliable + Hazardous together: Q2 unit, hit chance 5/6 and effective AP +4', () => {
      // Reliable forces hit to getHitChance(2) = 5/6. Hazardous adds AP+4 on top
      // of the weapon's own AP. Against Def 4+ that pushes block to the 1/6 floor.
      const weapon: Weapon = {
        id: 'w1', label: 'Haz Rifle', name: 'Haz Rifle', attacks: 1, count: 6, range: 24,
        specialRules: [
          { id: 'r1', name: 'Reliable' } as Rule,
          { id: 'r2', name: 'Hazardous' } as Rule,
        ],
      };
      // 6 shots × 5/6 hit × (1 − 1/6 block) × 1 = 6 × 5/6 × 5/6 = 25/6 ≈ 4.1667.
      expect(calculateWeaponOffense(weapon, 2, 4, 1, 1)).toBeCloseTo(25 / 6);
    });
  });

  describe('calculateUnitOffense', () => {
    it('splits melee and ranged damage correctly (total = max of the two)', () => {
      const rangedWeapon = { id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 5, range: 24, specialRules: [] } as Weapon;
      const meleeWeapon = { id: 'w2', label: 'Sword', name: 'Sword', attacks: 2, count: 5, range: 0, specialRules: [] } as Weapon;
      const unit = { weapons: [rangedWeapon, meleeWeapon], quality: 4 } as unknown as Unit;
      const config = { targetDefense: 4, targetSize: 1, targetToughness: 1, offenseWeight: 0.5, mostEffective: false };
      const { meleeOffense, rangedOffense, totalOffense } = calculateUnitOffense(unit, config);
      expect(rangedOffense).toBeCloseTo(1.25);
      expect(meleeOffense).toBeCloseTo(2.5);
      expect(totalOffense).toBeCloseTo(2.5);
    });
  });

  describe('calculateArmyBalVal — split tiers', () => {
    it('ranks damage and survivability independently', () => {
      const glass = {
        id: 'glass', name: 'Glass Cannon', cost: 50, size: 1, quality: 3, defense: 5,
        weapons: [{
          id: 'plas', name: 'Plasma', label: 'Plasma', count: 3, attacks: 3, range: 24,
          specialRules: [{ id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' }],
        }],
        rules: [],
      } as unknown as Unit;
      const tank = {
        id: 'tank', name: 'Tank', cost: 100, size: 5, defense: 2, quality: 5,
        weapons: [{ id: 's', name: 'Stick', label: 'Stick', count: 5, attacks: 1, range: 0, specialRules: [] }],
        rules: [{ id: 't', name: 'Tough', rating: 3, label: 'Tough(3)' }],
      } as unknown as Unit;
      const balanced = {
        id: 'bal', name: 'Balanced', cost: 100, size: 5, defense: 4, quality: 4,
        weapons: [{ id: 'r', name: 'Rifle', label: 'Rifle', count: 5, attacks: 1, range: 24, specialRules: [] }],
        rules: [],
      } as unknown as Unit;

      const results = calculateArmyBalVal([glass, tank, balanced]);
      expect(results.glass.damagePercentile).toBeGreaterThanOrEqual(results.tank.damagePercentile);
      expect(results.tank.survivabilityPercentile).toBeGreaterThan(results.glass.survivabilityPercentile);
      // Each unit gets both tier grades.
      expect(['S', 'A', 'B', 'C', 'D']).toContain(results.glass.damageTier);
      expect(['S', 'A', 'B', 'C', 'D']).toContain(results.tank.survivabilityTier);
    });
  });

  describe('calculateEffectiveHP', () => {
    it('calculates EHP for standard infantry', () => {
      const unit = { id: 'u1', name: 'Troops', size: 5, defense: 4, cost: 100, quality: 4, rules: [] } as unknown as Unit;
      expect(calculateEffectiveHP(unit)).toBe(10);
    });

    it('incorporates Tough rule into EHP', () => {
      const unit = {
        id: 'u1', name: 'Monster', size: 1, defense: 2, cost: 200, quality: 3,
        rules: [{ id: 'r1', name: 'Tough', rating: 6 } as Rule],
      } as unknown as Unit;
      expect(calculateEffectiveHP(unit)).toBeCloseTo(36);
    });

    it('incorporates Regeneration (+33%)', () => {
      const unit = {
        id: 'u1', name: 'Regen Troops', size: 5, defense: 4, cost: 100, quality: 4,
        rules: [{ id: 'r1', name: 'Regeneration' } as Rule],
      } as unknown as Unit;
      expect(calculateEffectiveHP(unit)).toBeCloseTo(13.3);
    });

    it('incorporates Stealth (+17%)', () => {
      const unit = {
        id: 'u1', name: 'Stealth Troops', size: 5, defense: 4, cost: 100, quality: 4,
        rules: [{ id: 'r1', name: 'Stealth' } as Rule],
      } as unknown as Unit;
      expect(calculateEffectiveHP(unit)).toBeCloseTo(11.7);
    });

    it('incorporates Shielded (-1 to Enemy AP / +1 to Defense)', () => {
      const unit = {
        id: 'u1', name: 'Shield Troops', size: 5, defense: 4, cost: 100, quality: 4,
        rules: [{ id: 'r1', name: 'Shielded' } as Rule],
      } as unknown as Unit;
      expect(calculateEffectiveHP(unit)).toBeCloseTo(15);
    });
  });
});

describe('Effectiveness helpers', () => {
  it('targetHP = size × max(1, toughness)', () => {
    expect(targetHP({ targetDefense: 4, targetSize: 5, targetToughness: 1, offenseWeight: 0.6, mostEffective: false })).toBe(5);
    expect(targetHP({ targetDefense: 2, targetSize: 1, targetToughness: 12, offenseWeight: 0.6, mostEffective: false })).toBe(12);
  });

  it('killProbabilityPerActivation: λ=2, HP=12 → near zero', () => {
    // Poisson(2) virtually never produces ≥12 events.
    expect(killProbabilityPerActivation(2, 12)).toBeLessThan(0.001);
  });

  it('killProbabilityPerActivation: λ=8, HP=12 → meaningful chance', () => {
    const p = killProbabilityPerActivation(8, 12);
    expect(p).toBeGreaterThan(0.05);
    expect(p).toBeLessThan(0.5);
  });

  it('killProbabilityPerActivation returns 0 when expected wounds below floor', () => {
    expect(killProbabilityPerActivation(0.05, 5)).toBe(0);
    expect(killProbabilityPerActivation(0, 5)).toBe(0);
  });

  it('cumulativeKillCurve: wounds accumulate across rounds (Poisson(R × λ))', () => {
    // λ=4 wounds/activation vs HP=12. By R3 expected total = 12, ≈ 50/50 kill.
    // By R4 expected total = 16, strongly favoured.
    const curve = cumulativeKillCurve(4, 12);
    expect(curve[0]).toBeLessThan(0.05);   // 1 round of λ=4 → P(X≥12) tiny
    expect(curve[2]).toBeGreaterThan(0.3); // 3 rounds → roughly coin-flip
    expect(curve[2]).toBeLessThan(0.7);
    expect(curve[3]).toBeGreaterThan(0.7); // 4 rounds → likely
  });

  it('cumulativeKillCurve is monotonic non-decreasing', () => {
    const curve = cumulativeKillCurve(3, 12);
    expect(curve[1]).toBeGreaterThanOrEqual(curve[0]);
    expect(curve[2]).toBeGreaterThanOrEqual(curve[1]);
    expect(curve[3]).toBeGreaterThanOrEqual(curve[2]);
  });

  it('activationsToKill: ceil(HP / w) when wounds ≥ 0.1; Infinity otherwise', () => {
    expect(activationsToKill(4, 12)).toBe(3);
    expect(activationsToKill(2, 12)).toBe(6);
    expect(activationsToKill(0.05, 12)).toBe(Infinity);
    expect(activationsToKill(0, 12)).toBe(Infinity);
  });

  it('pointsToKill: cost × ATK with Infinity propagation', () => {
    expect(pointsToKill(100, 3)).toBe(300);
    expect(pointsToKill(100, Infinity)).toBe(Infinity);
  });
});

describe('Worked-example regressions (proposal acceptance criteria)', () => {
  // 20-strong Q5+ infantry, 40 melee attacks, AP 0, vs Def 2+ Size 1 Tough 12.
  // Numbers should reproduce the user's hand-calculation: ~13 hits, ~2 unsaved
  // wounds per activation → realistic ATK ≥ 6 → low killProbByGameEnd.
  const sisters: any = {
    id: 'sisters', name: 'Novice Sisters', cost: 150, size: 20, quality: 5, defense: 5,
    weapons: [
      { id: 'ccw', name: 'Dual CCWs', label: 'Dual CCWs', count: 20, attacks: 2, range: 0, specialRules: [] },
    ],
    rules: [],
  };
  // Battle Tank w/ 3× Heavy Fusion Rifle (Q4+, AP 4, Deadly 3) + Deadly(6) cannon.
  const tank: any = {
    id: 'tank', name: 'Battle Tank', cost: 320, size: 1, quality: 4, defense: 2,
    weapons: [
      {
        id: 'hfr', name: 'Heavy Fusion Rifle', label: 'Heavy Fusion Rifle',
        count: 3, attacks: 1, range: 18,
        specialRules: [
          { id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' },
          { id: 'd3', name: 'Deadly', rating: 3, label: 'Deadly(3)' },
        ],
      },
      {
        id: 'cannon', name: 'Tank Cannon', label: 'Tank Cannon',
        count: 1, attacks: 2, range: 36,
        specialRules: [
          { id: 'ap2', name: 'AP', rating: 2, label: 'AP(2)' },
          { id: 'd6', name: 'Deadly', rating: 6, label: 'Deadly(6)' },
        ],
      },
    ],
    rules: [{ id: 'tough', name: 'Tough', rating: 12, label: 'Tough(12)' }],
  };

  const armouredTarget = {
    targetDefense: 2, targetSize: 1, targetToughness: 12, offenseWeight: 0.6, mostEffective: false,
  };

  it('20 Sisters vs Tough(12) Def 2+: ~2 wounds/activation, ATK ≥ 6, low killProbByGameEnd', () => {
    const res = calculateArmyBalVal([sisters, tank], armouredTarget)['sisters'];
    expect(res.unitOffense).toBeGreaterThan(1.5);
    expect(res.unitOffense).toBeLessThan(3);
    expect(res.activationsToKill).toBeGreaterThanOrEqual(6);
    // ~2 wounds/round × 4 rounds = 8 expected wounds vs HP 12. Poisson tail
    // gives a non-trivial but small chance; bound it at 0.3 (the qualitative
    // intent is "this unit cannot reliably kill the target in the game").
    expect(res.killProbByGameEnd).toBeLessThanOrEqual(0.3);
  });

  it('Battle Tank w/ HFR vs same target: ~6–9 wounds/activation, ATK ≤ 2, killProbByGameEnd ≥ 0.85', () => {
    const res = calculateArmyBalVal([sisters, tank], armouredTarget)['tank'];
    expect(res.unitOffense).toBeGreaterThan(5);
    expect(res.unitOffense).toBeLessThan(12);
    expect(res.activationsToKill).toBeLessThanOrEqual(2);
    expect(res.killProbByGameEnd).toBeGreaterThanOrEqual(0.85);
  });

  it('Tank effectivenessTier ≥ Sisters effectivenessTier against armoured target', () => {
    const results = calculateArmyBalVal([sisters, tank], armouredTarget);
    const tierOrder: Record<string, number> = { D: 0, C: 1, B: 2, A: 3, S: 4 };
    expect(tierOrder[results.tank.effectivenessTier]).toBeGreaterThan(tierOrder[results.sisters.effectivenessTier]);
  });

  it('Sisters get absolute D against armoured target — no percentile-rescue from a 2-unit roster', () => {
    // Regression for the "least-bad-in-army gets S" bug. Tier is now absolute:
    // if you can't reliably damage the target, you're D regardless of what
    // else is in the roster.
    const results = calculateArmyBalVal([sisters, tank], armouredTarget);
    expect(results.sisters.effectivenessTier).toBe('D');
  });

  it('Tank gets A or S against armoured target — absolute thresholds, not relative', () => {
    const results = calculateArmyBalVal([sisters, tank], armouredTarget);
    expect(['A', 'S']).toContain(results.tank.effectivenessTier);
  });

  it('Sweeping tough 1 → 12: sisters killProbByGameEnd collapses; tank stays high', () => {
    const softTarget = { targetDefense: 5, targetSize: 5, targetToughness: 1, offenseWeight: 0.6, mostEffective: false };
    const soft = calculateArmyBalVal([sisters, tank], softTarget);
    const hard = calculateArmyBalVal([sisters, tank], armouredTarget);
    expect(soft.sisters.killProbByGameEnd).toBeGreaterThan(hard.sisters.killProbByGameEnd);
    expect(hard.tank.killProbByGameEnd).toBeGreaterThan(0.5);
  });
});

// ---- Loadout tests ----

const RULE_AP1: Rule = { id: 'r-ap1', name: 'AP', rating: 1, label: 'AP(1)' };
const RULE_RENDING: Rule = { id: 'r-rend', name: 'Rending', label: 'Rending' };

function w(o: Partial<Weapon>): Weapon {
  return {
    id: o.id || 'w',
    name: o.name || 'W',
    label: o.label || (o.name || 'W'),
    count: o.count ?? 1,
    attacks: o.attacks ?? 1,
    range: o.range ?? 0,
    specialRules: o.specialRules || [],
  } as Weapon;
}

describe('parseSectionLabel', () => {
  it('detects replace + numeric quantity', () => {
    expect(parseSectionLabel('Replace one Barb Pistol')).toMatchObject({ isReplace: true, quantity: 1 });
    expect(parseSectionLabel('Replace two Heavy Rifles')).toMatchObject({ isReplace: true, quantity: 2 });
  });
  it('detects "all" as mandatory whole-stack', () => {
    expect(parseSectionLabel('Replace all CCWs')).toMatchObject({ isReplace: true, quantity: 'all' });
  });
  it('detects "any" as per-model elective (encoded as 1)', () => {
    expect(parseSectionLabel('Replace any Razor Claws')).toMatchObject({ isReplace: true, quantity: 1 });
  });
  it('handles non-replace upgrades', () => {
    expect(parseSectionLabel('Upgrade with one')).toMatchObject({ isReplace: false, quantity: 1 });
    expect(parseSectionLabel('Upgrade all models with')).toMatchObject({ isReplace: false, quantity: 'all' });
  });
});

describe('findReplacedWeapons', () => {
  it('matches single weapon name', () => {
    const pool = [w({ id: 'a', name: 'CCW' }), w({ id: 'b', name: 'Rifle' })];
    const matched = findReplacedWeapons('Replace one CCW', pool);
    expect(matched.map(m => m.id)).toEqual(['a']);
  });

  it('matches multiple weapons in compound label', () => {
    const pool = [w({ id: 'a', name: 'Barb Pistol' }), w({ id: 'b', name: 'CCW' })];
    const matched = findReplacedWeapons('Replace one Barb Pistol and CCW', pool);
    expect(matched.map(m => m.id).sort()).toEqual(['a', 'b']);
  });

  it('prefers longest weapon name when overlap exists', () => {
    const pool = [w({ id: 'a', name: 'Barb Pistol' }), w({ id: 'b', name: 'Sgt. Barb Pistol' })];
    const matched = findReplacedWeapons('Replace Sgt. Barb Pistol', pool);
    expect(matched.map(m => m.id)).toEqual(['b']);
  });

  it('returns empty when a compound label name is missing from pool', () => {
    const pool = [w({ id: 'ccw', name: 'CCW' })];
    expect(findReplacedWeapons('Replace one Barb Rifle and CCW', pool)).toEqual([]);
  });

  it('handles plural form (CCWs) in label vs CCW in pool', () => {
    const pool = [w({ id: 'ccw', name: 'CCW' })];
    const matched = findReplacedWeapons('Replace all CCWs', pool);
    expect(matched.map(m => m.id)).toEqual(['ccw']);
  });

  it('singularizes irregular plurals: pool "Custodian Axes" ↔ fragment "Custodian Axe"', () => {
    const pool = [w({ id: 'ax', name: 'Custodian Axes' })];
    const matched = findReplacedWeapons('Replace one Custodian Axe', pool);
    expect(matched.map(m => m.id)).toEqual(['ax']);
  });

  it('singularizes -ies plurals: "Forward Sentries" ↔ "Forward Sentry"', () => {
    const pool = [w({ id: 's', name: 'Forward Sentry' })];
    const matched = findReplacedWeapons('Replace one Forward Sentries', pool);
    expect(matched.map(m => m.id)).toEqual(['s']);
  });
});

describe('parseSectionTargets / Nx prefix', () => {
  it('parses "Nx " prefix into a per-application count', () => {
    // Direct test of findTargetedWeapons via applyOption — using a pool with 4
    // CCWs and a target "2x CCW", k=1 should remove 2 CCWs.
    const pool = [w({ id: 'p', name: 'Lord Gauss Pistol', count: 1 }), w({ id: 'c', name: 'CCW', count: 4 })];
    const unit = {
      id: 'u', name: 'Lord', cost: 100, size: 1, quality: 3, defense: 3,
      weapons: pool, rules: [],
    } as unknown as Unit;
    const section = { id: 's', label: 'Replace Lord Gauss Pistol and 2x CCW', variant: 'replace', targets: ['Lord Gauss Pistol', '2x CCW'] };
    const option = {
      id: 'o', label: 'Twin Heat Claws', cost: 10,
      gains: [{ type: 'ArmyBookWeapon', id: 'thc', name: 'Twin Heat Claws', label: 'Twin Heat Claws', count: 1, attacks: 4, range: 0, specialRules: [] }],
    };
    const base = buildBaseLoadout(unit);
    const next = applyOption(base, 'pkg', section, option, unit, DEFAULT_BALVAL_CONFIG, { applicationCount: 1 })!;
    expect(next).not.toBeNull();
    expect(next.weapons.find(w => w.id === 'p')).toBeUndefined();
    expect(next.weapons.find(w => w.id === 'c')!.count).toBe(2); // 4 - 2 = 2
    expect(next.weapons.find(w => w.id === 'thc')!.count).toBe(1);
  });

  it('applies affects:all to every model even when option gains share a name with a later section target (Novice Sisters regression)', () => {
    // Real-world bug: section 0 "Replace all Dual CCWs" has a Pistol+CCW
    // option that gains a generic "Pistol". Section 2 "Replace up to two
    // Pistols" then targets "Pistols". The sgt heuristic used to substring-
    // match "pistol" in section 2's label and misclassify section 0 as a
    // sergeant section, forcing k=1 (only one model gets the upgrade)
    // instead of k=10 (all 10 models — the affects:all contract).
    const novice: any = {
      id: 'novice', name: 'Novice Sisters', cost: 100, size: 10, quality: 4, defense: 5,
      weapons: [{ id: 'd', name: 'Dual CCWs', label: 'Dual CCWs', count: 10, attacks: 2, range: 0, specialRules: [] }],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [
          {
            id: 's0', label: 'Replace all Dual CCWs', variant: 'replace',
            affects: { type: 'all' },
            targets: ['Dual CCWs'],
            options: [
              {
                id: 'gw', label: 'Great Weapon', cost: 2,
                gains: [{ type: 'ArmyBookWeapon', id: 'gw', name: 'Great Weapon', label: 'Great Weapon', count: 1, attacks: 2, range: 0, specialRules: [{ id: 'ap1', name: 'AP', rating: 1, label: 'AP(1)' }] }],
              },
              {
                id: 'pc', label: 'Pistol + CCW', cost: 3,
                gains: [
                  { type: 'ArmyBookWeapon', id: 'pist', name: 'Pistol', label: 'Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
                  { type: 'ArmyBookWeapon', id: 'ccw', name: 'CCW', label: 'CCW', count: 1, attacks: 1, range: 0, specialRules: [] },
                ],
              },
            ],
          },
          {
            id: 's2', label: 'Replace up to two Pistols', variant: 'replace',
            affects: { type: 'up to', value: 2 },
            targets: ['Pistols'],
            options: [{
              id: 'fr', label: 'Fusion Rifle', cost: 5,
              gains: [{ type: 'ArmyBookWeapon', id: 'fr', name: 'Fusion Rifle', label: 'Fusion Rifle', count: 1, attacks: 1, range: 12, specialRules: [{ id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' }] }],
            }],
          },
        ],
      }],
    };

    // The Great Weapon option should be enumerable AT k=10 (all 10 swap),
    // even though section 0's Pistol+CCW option's gained "Pistol" appears
    // in section 2's label.
    const list = enumerateOptionLoadouts(novice, army, DEFAULT_BALVAL_CONFIG);
    const gw = list.find(l => l.label === 'Great Weapon');
    expect(gw).toBeDefined();
    const gwWeapon = gw!.state.weapons.find(w => w.name === 'Great Weapon');
    expect(gwWeapon).toBeDefined();
    expect(gwWeapon!.count).toBe(10); // all 10 models, not 1
    expect(gw!.state.weapons.find(w => w.id === 'd')).toBeUndefined(); // Dual CCWs all consumed
    // Cost charge: `affects:all` is ONE selection at the listed price — 2pts
    // total for the whole-unit swap, NOT 2 × 10 models. (Same fix that
    // caused the real-world 300pts overcharge on Novice Sisters' 30pt Great
    // Weapon upgrade.)
    expect(gw!.state.cost).toBe(novice.cost + 2);
    expect(gw!.applications[0].costApplied).toBe(2);
  });

  it('does not multiply cost by k for affects:exactly (single selection covering N models)', () => {
    const unit: any = {
      id: 'u', name: 'U', cost: 100, size: 5, quality: 4, defense: 4,
      weapons: [{ id: 'r', name: 'Rifle', label: 'Rifle', count: 5, attacks: 1, range: 24, specialRules: [] }],
      rules: [],
      upgrades: ['p'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p',
        sections: [{
          id: 's', label: 'Replace exactly two Rifles', variant: 'replace',
          affects: { type: 'exactly', value: 2 },
          targets: ['Rifles'],
          options: [{
            id: 'pr', label: 'Plasma Rifle', cost: 12,
            gains: [{ type: 'ArmyBookWeapon', id: 'pr', name: 'Plasma Rifle', label: 'Plasma Rifle', count: 1, attacks: 2, range: 24, specialRules: [{ id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' }] }],
          }],
        }],
      }],
    };
    const list = enumerateOptionLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    const pill = list.find(l => l.label === 'Plasma Rifle');
    expect(pill).toBeDefined();
    expect(pill!.state.weapons.find(w => w.id === 'r')!.count).toBe(3); // 5 - 2
    expect(pill!.state.weapons.find(w => w.id === 'pr')!.count).toBe(2);
    // 12 pts ONCE, not 12 × 2 = 24.
    expect(pill!.state.cost).toBe(unit.cost + 12);
  });

  it('classifies a gain with no `range` field as melee, not ranged (Dual Sword-Flails regression)', () => {
    // OPR ships melee gains with the `range` key omitted entirely. The engine
    // used to do `weapon.range === 0` which is false for `undefined`, so the
    // resulting weapon was scored as ranged — leading to "0 melee damage, 5
    // ranged" for a melee-only loadout.
    const unit: any = {
      id: 'tw', name: 'True Witches', cost: 75, size: 3, quality: 3, defense: 5,
      weapons: [
        { id: 'bp', name: 'Barb Pistol', label: 'Barb Pistol', count: 3, attacks: 1, range: 12, specialRules: [] },
        { id: 'ccw', name: 'CCW', label: 'CCW', count: 3, attacks: 2, range: 0, specialRules: [] },
      ],
      rules: [], upgrades: ['p'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p',
        sections: [{
          id: 's', label: 'Replace any Barb Pistol and CCW', variant: 'replace',
          affects: { type: 'any' },
          targets: ['Barb Pistol', 'CCW'],
          options: [{
            id: 'flail', label: 'Dual Sword-Flails', cost: 5,
            // Note: NO `range` key on the gain — mirrors real OPR data shape.
            gains: [{
              type: 'ArmyBookWeapon', id: 'flail', name: 'Dual Sword-Flails',
              label: 'Dual Sword-Flails', count: 1, attacks: 1,
              specialRules: [
                { id: 'ap2', name: 'AP', rating: 2, label: 'AP(2)' },
                { id: 'b3', name: 'Blast', rating: 3, label: 'Blast(3)' },
              ],
            }],
          }],
        }],
      }],
    };
    const list = enumerateOptionLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    const flailLoadout = list.find((l) => l.label.includes('Dual Sword-Flails'));
    expect(flailLoadout).toBeDefined();
    // 3× Dual Sword-Flails should be classified as MELEE output.
    expect(flailLoadout!.meleeOffense).toBeGreaterThan(0);
    expect(flailLoadout!.meleeAttacks).toBeGreaterThan(0);
    // No ranged from the Flails themselves (the 3 Barb Pistols were consumed).
    expect(flailLoadout!.rangedOffense).toBe(0);
    expect(flailLoadout!.rangedAttacks).toBe(0);
    // And the stored weapon should now have a normalized numeric range of 0.
    const flailWeapon = flailLoadout!.state.weapons.find((w) => w.name === 'Dual Sword-Flails');
    expect(flailWeapon!.range).toBe(0);
  });

  it('does not leave a model on the default loadout when the reserved sgt chain is unprofitable (True Witches regression)', () => {
    // Real-world bug: True Witches (3 models, 3× Barb Pistol + 3× CCW) had
    // section 0 "Replace any Barb Pistol and CCW" with Dual Sword-Flails as
    // an option (A1, AP(2), Blast(3) — a melee mass-killer). Section 1 is
    // a sgt that needs one (Barb Pistol + CCW) pair; section 2 upgrades the
    // sgt's pistol with EMP / Plas-Blaster. With unconditional reservation,
    // section 0 was capped at k=2 (one pair held back for the sgt). The sgt
    // chain then evaluated as unprofitable and was skipped — leaving the
    // reserved pair untouched, ending with 2× Flails + 1× default pair.
    //
    // The two-path search must pick the unreserved path here (3× Flails)
    // because the sgt chain isn't worth its slot.
    const trueWitches: any = {
      id: 'tw', name: 'True Witches', cost: 75, size: 3, quality: 3, defense: 5,
      weapons: [
        { id: 'bp', name: 'Barb Pistol', label: 'Barb Pistol', count: 3, attacks: 1, range: 12, specialRules: [{ id: 'lac', name: 'Lacerate', label: 'Lacerate' }] },
        { id: 'ccw', name: 'CCW', label: 'CCW', count: 3, attacks: 2, range: 0, specialRules: [] },
      ],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [
          {
            id: 's0', label: 'Replace any Barb Pistol and CCW', variant: 'replace',
            affects: { type: 'any' },
            targets: ['Barb Pistol', 'CCW'],
            options: [{
              id: 'flail', label: 'Dual Sword-Flails', cost: 5,
              gains: [{ type: 'ArmyBookWeapon', id: 'flail', name: 'Dual Sword-Flails', label: 'Dual Sword-Flails', count: 1, attacks: 1, range: 0, specialRules: [
                { id: 'ap2', name: 'AP', rating: 2, label: 'AP(2)' },
                { id: 'b3', name: 'Blast', rating: 3, label: 'Blast(3)' },
              ] }],
            }],
          },
          {
            id: 's1', label: 'Replace one Barb Pistol and CCW', variant: 'replace',
            affects: { type: 'exactly', value: 1 },
            targets: ['Barb Pistol', 'CCW'],
            options: [{
              id: 'sgt', label: 'Sgt loadout', cost: 10,
              gains: [
                { type: 'ArmyBookWeapon', id: 'sbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [{ id: 'lac', name: 'Lacerate', label: 'Lacerate' }] },
                { type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [
                  { id: 'ap1', name: 'AP', rating: 1, label: 'AP(1)' },
                  { id: 'rend', name: 'Rending', label: 'Rending' },
                ] },
              ],
            }],
          },
          {
            id: 's2', label: 'Replace Sgt. Barb Pistol', variant: 'replace',
            targets: ['Sgt. Barb Pistol'],
            options: [{
              id: 'emp', label: 'EMP Pistol', cost: 5,
              gains: [{ type: 'ArmyBookWeapon', id: 'emp', name: 'EMP Pistol', label: 'EMP Pistol', count: 1, attacks: 2, range: 9, specialRules: [{ id: 'rend', name: 'Rending', label: 'Rending' }] }],
            }],
          },
        ],
      }],
    };

    const best = findBestLoadout(trueWitches, army, DEFAULT_BALVAL_CONFIG);
    // Expected: 3 Dual Sword-Flails consume all 3 (Barb Pistol + CCW) pairs.
    // No model left with the default Barb Pistol + CCW.
    const flails = best.weapons.find(w => w.id === 'flail');
    expect(flails).toBeDefined();
    expect(flails!.count).toBe(3);
    expect(best.weapons.find(w => w.id === 'bp')).toBeUndefined();
    expect(best.weapons.find(w => w.id === 'ccw')).toBeUndefined();
    // Sgt chain should NOT have fired (no reserved slot was profitable).
    expect(best.applications.find(a => a.optionLabel === 'Sgt loadout')).toBeUndefined();
    expect(best.applications.find(a => a.optionLabel === 'EMP Pistol')).toBeUndefined();
  });

  it('DOES multiply cost by k for affects:up to (per-model selections)', () => {
    const unit: any = {
      id: 'u', name: 'U', cost: 100, size: 5, quality: 4, defense: 4,
      weapons: [{ id: 'p', name: 'Pistol', label: 'Pistol', count: 5, attacks: 1, range: 12, specialRules: [] }],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [{
          id: 's', label: 'Replace up to two Pistols', variant: 'replace',
          affects: { type: 'up to', value: 2 },
          targets: ['Pistols'],
          options: [{
            id: 'fr', label: 'Fusion Rifle', cost: 15,
            gains: [{ type: 'ArmyBookWeapon', id: 'fr', name: 'Fusion Rifle', label: 'Fusion Rifle', count: 1, attacks: 1, range: 12, specialRules: [{ id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' }] }],
          }],
        }],
      }],
    };
    const list = enumerateOptionLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    const k1 = list.find(l => l.label.includes('×1'));
    const k2 = list.find(l => l.label.includes('×2'));
    expect(k1).toBeDefined();
    expect(k2).toBeDefined();
    // affects:up to is per-model elective — each selection costs 15.
    expect(k1!.state.cost).toBe(unit.cost + 15);
    expect(k2!.state.cost).toBe(unit.cost + 30);
  });

  it('returns null when "Nx " target exceeds pool', () => {
    const pool = [w({ id: 'c', name: 'CCW', count: 1 })];
    const unit = {
      id: 'u', name: 'U', cost: 50, size: 1, quality: 3, defense: 3,
      weapons: pool, rules: [],
    } as unknown as Unit;
    const section = { id: 's', label: 'Replace 2x CCW', variant: 'replace', targets: ['2x CCW'] };
    const option = {
      id: 'o', label: 'Big', cost: 5,
      gains: [{ type: 'ArmyBookWeapon', id: 'b', name: 'Big', label: 'Big', count: 1, attacks: 2, range: 0, specialRules: [] }],
    };
    const base = buildBaseLoadout(unit);
    expect(applyOption(base, 'pkg', section, option, unit, DEFAULT_BALVAL_CONFIG, { applicationCount: 1 })).toBeNull();
  });
});

describe('getOptionCost', () => {
  const unit = { id: 'u1' } as unknown as Unit;
  const other = { id: 'u2' } as unknown as Unit;

  it('uses per-unit override from costs[]', () => {
    const opt = { cost: 0, costs: [{ unitId: 'u1', cost: 10 }] };
    expect(getOptionCost(opt, unit)).toBe(10);
  });

  it('falls back to top-level cost when no override matches the unit', () => {
    const opt = { cost: 7, costs: [{ unitId: 'u3', cost: 99 }] };
    expect(getOptionCost(opt, unit)).toBe(7);
  });

  it('uses top-level cost when costs[] is absent', () => {
    expect(getOptionCost({ cost: 5 }, unit)).toBe(5);
    expect(getOptionCost({ cost: 5 }, other)).toBe(5);
  });

  it('returns 0 when both costs[] miss and top-level cost is missing', () => {
    expect(getOptionCost({}, unit)).toBe(0);
  });
});

describe('applyOption', () => {
  const witches: any = {
    id: 'witch', name: 'Witches', cost: 105, size: 5, quality: 3, defense: 5,
    weapons: [
      w({ id: 'bp', name: 'Barb Pistol', count: 5, attacks: 1, range: 12 }),
      w({ id: 'ccw', name: 'CCW', count: 5, attacks: 2, range: 0 }),
    ],
    rules: [],
  };

  it('handles compound replace (Barb Pistol AND CCW) by removing one of each', () => {
    const section = { id: 's1', label: 'Replace one Barb Pistol and CCW', variant: 'replace' };
    const option = {
      id: 'opt1', label: 'Sgt loadout', cost: 0,
      gains: [
        { type: 'ArmyBookWeapon', id: 'sgtbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
        { type: 'ArmyBookWeapon', id: 'esword', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [RULE_AP1, RULE_RENDING] },
      ],
    };
    const base = buildBaseLoadout(witches);
    const next = applyOption(base, 'pkg', section, option, witches, DEFAULT_BALVAL_CONFIG);
    expect(next).not.toBeNull();
    const pool = next!.weapons;
    expect(pool.find(x => x.id === 'bp')!.count).toBe(4);
    expect(pool.find(x => x.id === 'ccw')!.count).toBe(4);
    expect(pool.find(x => x.id === 'sgtbp')!.count).toBe(1);
    expect(pool.find(x => x.id === 'esword')!.count).toBe(1);
  });

  it('honors per-unit cost override for sgt loadout (witches: top cost 0, real 10)', () => {
    const sec = { id: 's', label: 'Replace one Barb Pistol and CCW', variant: 'replace' };
    // Mirrors army-forge data: top-level cost 0, but for THIS unit the cost is 10.
    const opt = {
      id: 'sgt', label: 'Sgt loadout', cost: 0,
      costs: [{ unitId: witches.id, cost: 10 }],
      gains: [
        { type: 'ArmyBookWeapon', id: 'sbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
        { type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] },
      ],
    };
    const base = buildBaseLoadout(witches);
    const next = applyOption(base, 'pkg', sec, opt, witches, DEFAULT_BALVAL_CONFIG)!;
    expect(next.cost).toBe(witches.cost + 10);
    expect(next.applications[0].costApplied).toBe(10);
  });

  it('chains: Sgt. Barb Pistol added by step 1 can be replaced by step 2', () => {
    const sec1 = { id: 's1', label: 'Replace one Barb Pistol and CCW', variant: 'replace' };
    const opt1 = {
      id: 'sgt', label: 'Sgt', cost: 0,
      gains: [
        { type: 'ArmyBookWeapon', id: 'sgtbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
        { type: 'ArmyBookWeapon', id: 'esword', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] },
      ],
    };
    const sec2 = { id: 's2', label: 'Replace Sgt. Barb Pistol', variant: 'replace' };
    const opt2 = {
      id: 'plas', label: 'Plas-Blaster Pistol', cost: 5,
      gains: [{ type: 'ArmyBookWeapon', id: 'plas', name: 'Plas-Blaster Pistol', label: 'Plas-Blaster Pistol', count: 1, attacks: 2, range: 6, specialRules: [{ id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' }] }],
    };

    const base = buildBaseLoadout(witches);
    const after1 = applyOption(base, 'pkg', sec1, opt1, witches, DEFAULT_BALVAL_CONFIG)!;
    const after2 = applyOption(after1, 'pkg', sec2, opt2, witches, DEFAULT_BALVAL_CONFIG)!;

    expect(after2).not.toBeNull();
    expect(after2.weapons.find(x => x.id === 'sgtbp')).toBeUndefined(); // replaced
    expect(after2.weapons.find(x => x.id === 'plas')!.count).toBe(1);
    expect(after2.cost).toBe(witches.cost + 0 + 5);
  });

  it('returns null when replace target is missing from pool', () => {
    const base = buildBaseLoadout(witches);
    const sec = { id: 'x', label: 'Replace Sgt. Barb Pistol', variant: 'replace' };
    const opt = { id: 'p', label: 'Plas', cost: 5, gains: [{ type: 'ArmyBookWeapon', id: 'p', name: 'Plas', label: 'Plas', count: 1, attacks: 1, range: 12, specialRules: [] }] };
    expect(applyOption(base, 'pkg', sec, opt, witches, DEFAULT_BALVAL_CONFIG)).toBeNull();
  });

  it('honors explicit applicationCount of 5 ("all" semantics) consuming entire stack', () => {
    // Caller (optimizer) is responsible for resolving affects.type='all' to a
    // numeric k. applyOption itself is now affects-agnostic — caller passes k.
    const sec = { id: 'x', label: 'Replace all CCWs', variant: 'replace' };
    const opt = {
      id: 'es', label: 'Energy Sword', cost: 5,
      gains: [{ type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] }],
    };
    const base = buildBaseLoadout(witches);
    const next = applyOption(base, 'pkg', sec, opt, witches, DEFAULT_BALVAL_CONFIG, { applicationCount: 5 })!;
    expect(next.weapons.find(w => w.id === 'ccw')).toBeUndefined();
    expect(next.weapons.find(w => w.id === 'es')!.count).toBe(5);
    expect(next.cost).toBe(witches.cost + 5 * 5);
  });

  it('applies k times when applicationCount > 1', () => {
    const sec = { id: 'x', label: 'Replace one Barb Pistol and CCW', variant: 'replace' };
    const opt = {
      id: 'rf', label: 'Razor Flails', cost: 5,
      gains: [{ type: 'ArmyBookWeapon', id: 'rf', name: 'Razor Flails', label: 'Razor Flails', count: 1, attacks: 4, range: 0, specialRules: [] }],
    };
    const base = buildBaseLoadout(witches);
    const next = applyOption(base, 'pkg', sec, opt, witches, DEFAULT_BALVAL_CONFIG, { applicationCount: 4 })!;
    expect(next.weapons.find(w => w.id === 'bp')!.count).toBe(1); // 5 - 4
    expect(next.weapons.find(w => w.id === 'ccw')!.count).toBe(1);
    expect(next.weapons.find(w => w.id === 'rf')!.count).toBe(4);
    expect(next.cost).toBe(witches.cost + 5 * 4);
  });

  it('returns null when applicationCount exceeds available pool', () => {
    const sec = { id: 'x', label: 'Replace one Barb Pistol and CCW', variant: 'replace' };
    const opt = {
      id: 'rf', label: 'Razor Flails', cost: 5,
      gains: [{ type: 'ArmyBookWeapon', id: 'rf', name: 'Razor Flails', label: 'Razor Flails', count: 1, attacks: 4, range: 0, specialRules: [] }],
    };
    const base = buildBaseLoadout(witches);
    expect(applyOption(base, 'pkg', sec, opt, witches, DEFAULT_BALVAL_CONFIG, { applicationCount: 6 })).toBeNull();
  });

  it('applies k swaps to a doubled unit (k passed by caller)', () => {
    // Caller scales k by `instances` for stacked units; applyOption no longer
    // auto-multiplies on isDoubled.
    const sec = { id: 'x', label: 'Replace one CCW', variant: 'replace' };
    const opt = {
      id: 'es', label: 'Energy Sword', cost: 5,
      gains: [{ type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] }],
    };
    const doubled = { ...witches, weapons: witches.weapons.map((x: any) => ({ ...x, count: x.count * 2 })) };
    const base = buildBaseLoadout(doubled);
    const next = applyOption(base, 'pkg', sec, opt, doubled, DEFAULT_BALVAL_CONFIG, { isDoubled: true, applicationCount: 2 })!;
    expect(next.weapons.find(w => w.id === 'es')!.count).toBe(2);
    expect(next.cost).toBe(doubled.cost + 5 * 2);
  });
});

describe('findBestLoadout', () => {
  it('skips upgrades when none improve efficiency', () => {
    const unit: any = {
      id: 'u', name: 'Unit', cost: 100, size: 5, quality: 4, defense: 4,
      weapons: [w({ id: 'r', name: 'Rifle', count: 5, attacks: 1, range: 24 })],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [{
          id: 's', label: 'Replace one Rifle', variant: 'replace',
          options: [{
            id: 'bad', label: 'Tiny Pistol', cost: 999,
            gains: [{ type: 'ArmyBookWeapon', id: 'tp', name: 'Tiny Pistol', label: 'Tiny Pistol', count: 1, attacks: 1, range: 6, specialRules: [] }],
          }],
        }],
      }],
    };
    const best = findBestLoadout(unit, army, DEFAULT_BALVAL_CONFIG);
    expect(best.applications.length).toBe(0);
    expect(best.cost).toBe(100);
  });

  it('picks 4 Razor Flails + Sgt + EMP over 5 Razor Flails when the sgt chain unlocks a Blast(5) ranged source (witches scenario)', () => {
    // Sec0: per-model "Replace any Barb Pistol and CCW" with razor flails (free, big damage gain).
    // Sec1: "Replace one Barb Pistol and CCW" with sgt loadout (Sgt. Barb Pistol + Energy Sword).
    // Sec2: "Replace Sgt. Barb Pistol" → EMP Pistol (Blast(5), AP(4)).
    // The search enumerates every (k, option, skip) combination across all three
    // sections and ranks by efficiency. No reservation logic — the chain wins
    // because its EMP ranged output beats the marginal 5th flail.
    const witchUnit: any = {
      id: 'witch', name: 'Witches', cost: 105, size: 5, quality: 3, defense: 5,
      weapons: [
        { id: 'bp', name: 'Barb Pistol', label: 'Barb Pistol', count: 5, attacks: 1, range: 12, specialRules: [] },
        { id: 'ccw', name: 'CCW', label: 'CCW', count: 5, attacks: 2, range: 0, specialRules: [] },
      ],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [
          {
            // Per-model elective ("any") so the optimizer can sweep k. This
            // is the section that should be capped at 4 (1 reserved for sgt).
            id: 's1', label: 'Replace any Barb Pistol and CCW', variant: 'replace',
            affects: { type: 'any' },
            targets: ['Barb Pistol', 'CCW'],
            options: [{
              id: 'rf', label: 'Razor Flails', cost: 0,
              gains: [{ type: 'ArmyBookWeapon', id: 'rf', name: 'Razor Flails', label: 'Razor Flails', count: 1, attacks: 4, range: 0, specialRules: [{ id: 'ap2', name: 'AP', rating: 2, label: 'AP(2)' }] }],
            }],
          },
          {
            id: 's2', label: 'Replace one Barb Pistol and CCW', variant: 'replace',
            affects: { type: 'exactly', value: 1 },
            targets: ['Barb Pistol', 'CCW'],
            options: [{
              id: 'sgt', label: 'Sgt loadout', cost: 0,
              gains: [
                { type: 'ArmyBookWeapon', id: 'sbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
                { type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] },
              ],
            }],
          },
          {
            id: 's3', label: 'Replace Sgt. Barb Pistol', variant: 'replace',
            targets: ['Sgt. Barb Pistol'],
            options: [{
              // Tuned to be strongly profitable so chain-aware optimizer picks
              // sgt + EMP even though the sgt step alone is roughly neutral.
              id: 'emp', label: 'EMP Pistol', cost: 0,
              gains: [{
                type: 'ArmyBookWeapon', id: 'emp', name: 'EMP Pistol', label: 'EMP Pistol',
                count: 1, attacks: 5, range: 9,
                specialRules: [
                  { id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' },
                  { id: 'b5', name: 'Blast', rating: 5, label: 'Blast(5)' },
                ],
              }],
            }],
          },
        ],
      }],
    };

    const best = findBestLoadout(witchUnit, army, DEFAULT_BALVAL_CONFIG);
    // Should apply: 4 razor flails (sec1) + 1 sgt (sec2) + 1 EMP (sec3).
    const flailApp = best.applications.find(a => a.optionLabel === 'Razor Flails');
    expect(flailApp?.quantity).toBe(4);
    const sgtApp = best.applications.find(a => a.optionLabel === 'Sgt loadout');
    expect(sgtApp?.quantity).toBe(1);
    const empApp = best.applications.find(a => a.optionLabel === 'EMP Pistol');
    expect(empApp?.quantity).toBe(1);

    // Final pool: 0 barb pistol, 0 ccw, 4 razor flails, 1 energy sword, 1 EMP pistol.
    expect(best.weapons.find(w => w.id === 'bp')).toBeUndefined();
    expect(best.weapons.find(w => w.id === 'ccw')).toBeUndefined();
    expect(best.weapons.find(w => w.id === 'rf')!.count).toBe(4);
    expect(best.weapons.find(w => w.id === 'es')!.count).toBe(1);
    expect(best.weapons.find(w => w.id === 'emp')!.count).toBe(1);
  });

  it('handles "up to N" affects: sweeps k=1..N for the optimizer', () => {
    // Gene-Warriors style: sec0 swaps up to 2 Dual CCWs for Barb Pistol+CCW;
    // optimizer should pick k=2 (or lower) based on efficiency.
    const unit: any = {
      id: 'gw', name: 'Gene-Warriors', cost: 80, size: 5, quality: 4, defense: 4,
      weapons: [{ id: 'dccw', name: 'Dual CCWs', label: 'Dual CCWs', count: 5, attacks: 2, range: 0, specialRules: [] }],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [{
          id: 's', label: 'Replace up to two Dual CCWs', variant: 'replace',
          affects: { type: 'up to', value: 2 },
          targets: ['Dual CCWs'],
          options: [{
            id: 'bpccw', label: 'Barb Pistol + CCW', cost: 5,
            gains: [
              { type: 'ArmyBookWeapon', id: 'bp', name: 'Barb Pistol', label: 'Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [{ id: 'lac', name: 'Lacerate', label: 'Lacerate' }] },
              { type: 'ArmyBookWeapon', id: 'ccw', name: 'CCW', label: 'CCW', count: 1, attacks: 2, range: 0, specialRules: [] },
            ],
          }],
        }],
      }],
    };

    const list = enumerateOptionLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    // Expect base + ×1 pill + ×2 pill.
    const k1 = list.find(l => l.label.includes('×1'));
    const k2 = list.find(l => l.label.includes('×2'));
    expect(k1).toBeDefined();
    expect(k2).toBeDefined();
    expect(k1!.state.cost).toBe(unit.cost + 5 * 1);
    expect(k2!.state.cost).toBe(unit.cost + 5 * 2);
  });

  it('respects "sgt chain implies at most poolMax-1 in the producer section" via search, not reservation (raider scenario)', () => {
    // Sec0 sweeps barb rifles → Scrappers. Sec1 sgt needs 1 BR+CCW pair.
    // Sec2 upgrades the sgt's pistol to EMP. The search will naturally try
    // k=3 (sgt fails, no pair left), k=2 (sgt+EMP apply, 2 Scrappers), k=1,
    // and k=0; it picks whichever scores highest. The invariant we assert is
    // structural: EMP can only appear with Sgt, and Sgt can only appear when
    // sec0 left at least one BR+CCW pair behind.
    const raider: any = {
      id: 'raider', name: 'Raiders', cost: 105, size: 3, quality: 4, defense: 5,
      weapons: [
        { id: 'br', name: 'Barb Rifle', label: 'Barb Rifle', count: 3, attacks: 1, range: 18, specialRules: [] },
        { id: 'ccw', name: 'CCW', label: 'CCW', count: 3, attacks: 1, range: 0, specialRules: [] },
      ],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [
          {
            id: 's0', label: 'Replace any Barb Rifle', variant: 'replace',
            affects: { type: 'any' },
            targets: ['Barb Rifle'],
            options: [{
              id: 'scrap', label: 'Scrapper', cost: 0,
              gains: [{ type: 'ArmyBookWeapon', id: 'scrap', name: 'Scrapper', label: 'Scrapper', count: 1, attacks: 1, range: 12, specialRules: [{ id: 'b3', name: 'Blast', rating: 3, label: 'Blast(3)' }] }],
            }],
          },
          {
            id: 's1', label: 'Replace one Barb Rifle and CCW', variant: 'replace',
            affects: { type: 'exactly', value: 1 },
            targets: ['Barb Rifle', 'CCW'],
            options: [{
              id: 'sgt', label: 'Sgt loadout', cost: 0,
              gains: [
                { type: 'ArmyBookWeapon', id: 'sbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
                { type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] },
              ],
            }],
          },
          {
            id: 's2', label: 'Replace Sgt. Barb Pistol', variant: 'replace',
            targets: ['Sgt. Barb Pistol'],
            options: [{
              id: 'emp', label: 'EMP Pistol', cost: 0,
              gains: [{
                type: 'ArmyBookWeapon', id: 'emp', name: 'EMP Pistol', label: 'EMP Pistol',
                count: 1, attacks: 4, range: 9,
                specialRules: [
                  { id: 'ap4', name: 'AP', rating: 4, label: 'AP(4)' },
                  { id: 'b5', name: 'Blast', rating: 5, label: 'Blast(5)' },
                ],
              }],
            }],
          },
        ],
      }],
    };

    const best = findBestLoadout(raider, army, DEFAULT_BALVAL_CONFIG);

    // Either the sgt chain applied (1 rifle reserved) — k_scrappers ≤ 2 —
    // or the chain wasn't profitable and no rifle was reserved. Both are
    // legal; assert the rule that's always required: no partial sgt application
    // (sgt+EMP either both present, or both absent — never EMP without sgt).
    const sgt = best.applications.find(a => a.optionLabel === 'Sgt loadout');
    const emp = best.applications.find(a => a.optionLabel === 'EMP Pistol');
    if (emp) expect(sgt).toBeDefined();

    // If sgt applied, pool must have had a rifle for it (compound match strict).
    if (sgt) {
      // Means sec0 picked at most 2 scrappers — leaving 1 rifle for sgt.
      const scrap = best.applications.find(a => a.optionLabel === 'Scrapper');
      expect((scrap?.quantity ?? 0)).toBeLessThanOrEqual(2);
    }
  });

  it('refuses to apply compound replace when one named weapon is already gone', () => {
    // sec0 wipes all Barb Rifles; sec1 (sgt) compound-replaces both Barb Rifle
    // AND CCW. sec1 must NOT partially apply (no CCW-only removal).
    const raider: any = {
      id: 'raider2', name: 'Raiders', cost: 100, size: 3, quality: 4, defense: 5,
      weapons: [
        { id: 'br', name: 'Barb Rifle', label: 'Barb Rifle', count: 3, attacks: 1, range: 18, specialRules: [] },
        { id: 'ccw', name: 'CCW', label: 'CCW', count: 3, attacks: 1, range: 0, specialRules: [] },
      ],
      rules: [],
      upgrades: ['p'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p',
        sections: [
          // No future sgt section → sec0 doesn't reserve, consumes all 3 rifles.
          {
            id: 's0', label: 'Replace all Barb Rifles', variant: 'replace',
            affects: { type: 'all' },
            targets: ['Barb Rifles'],
            options: [{
              id: 'scrap', label: 'Scrapper', cost: 0,
              gains: [{ type: 'ArmyBookWeapon', id: 'scrap', name: 'Scrapper', label: 'Scrapper', count: 1, attacks: 1, range: 12, specialRules: [{ id: 'b3', name: 'Blast', rating: 3, label: 'Blast(3)' }] }],
            }],
          },
          {
            id: 's1', label: 'Replace one Barb Rifle and CCW', variant: 'replace',
            affects: { type: 'exactly', value: 1 },
            targets: ['Barb Rifle', 'CCW'],
            options: [{
              id: 'sgt', label: 'Sgt', cost: 0,
              gains: [
                { type: 'ArmyBookWeapon', id: 'sbp', name: 'Sgt. Barb Pistol', label: 'Sgt. Barb Pistol', count: 1, attacks: 1, range: 12, specialRules: [] },
                { type: 'ArmyBookWeapon', id: 'es', name: 'Energy Sword', label: 'Energy Sword', count: 1, attacks: 2, range: 0, specialRules: [] },
              ],
            }],
          },
        ],
      }],
    };

    const best = findBestLoadout(raider, army, DEFAULT_BALVAL_CONFIG);
    const sgt = best.applications.find(a => a.optionLabel === 'Sgt');
    expect(sgt).toBeUndefined(); // sgt cannot apply without a Barb Rifle in pool
    // No CCW should have been removed by a phantom sgt application.
    const ccwInPool = best.weapons.find(w => w.id === 'ccw');
    expect(ccwInPool?.count).toBe(3);
  });

  it('chooses upgrade when it improves efficiency', () => {
    const unit: any = {
      id: 'u', name: 'Unit', cost: 100, size: 5, quality: 4, defense: 4,
      weapons: [w({ id: 'r', name: 'Rifle', count: 5, attacks: 1, range: 24 })],
      rules: [],
      upgrades: ['p1'],
    };
    const army: any = {
      upgradePackages: [{
        uid: 'p1',
        sections: [{
          id: 's', label: 'Replace one Rifle', variant: 'replace',
          options: [{
            // Free swap with massive damage boost — must be picked.
            id: 'good', label: 'Plasma Rifle', cost: 0,
            gains: [{
              type: 'ArmyBookWeapon', id: 'pr', name: 'Plasma Rifle', label: 'Plasma Rifle',
              count: 1, attacks: 4, range: 24,
              specialRules: [{ id: 'ap', name: 'AP', rating: 4, label: 'AP(4)' }],
            }],
          }],
        }],
      }],
    };
    const best = findBestLoadout(unit, army, DEFAULT_BALVAL_CONFIG);
    expect(best.applications.length).toBe(1);
    expect(best.applications[0].optionLabel).toBe('Plasma Rifle');
  });
});

describe('enumerateOptionLoadouts + getAllLoadouts', () => {
  const unit: any = {
    id: 'u', name: 'U', cost: 100, size: 5, quality: 4, defense: 4,
    weapons: [w({ id: 'r', name: 'Rifle', count: 5, attacks: 1, range: 24 })],
    rules: [],
    upgrades: ['p1'],
  };
  const army: any = {
    upgradePackages: [{
      uid: 'p1',
      sections: [{
        id: 's', label: 'Replace one Rifle', variant: 'replace',
        options: [
          { id: 'A', label: 'Better Rifle', cost: 0, gains: [{ type: 'ArmyBookWeapon', id: 'br', name: 'Better Rifle', label: 'Better Rifle', count: 1, attacks: 4, range: 24, specialRules: [{ id: 'ap2', name: 'AP', rating: 2, label: 'AP(2)' }] }] },
          { id: 'B', label: 'Worse Pistol', cost: 50, gains: [{ type: 'ArmyBookWeapon', id: 'wp', name: 'Worse Pistol', label: 'Worse Pistol', count: 1, attacks: 1, range: 6, specialRules: [] }] },
        ],
      }],
    }],
  };

  it('enumerates one loadout per option plus base', () => {
    const list = enumerateOptionLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    expect(list).toHaveLength(3);
    expect(list[0].isBase).toBe(true);
  });

  it('marks the best-combo correctly', () => {
    const list = getAllLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    const best = list.find(l => l.isBestCombo);
    expect(best).toBeDefined();
  });

  it('computes deltas vs base', () => {
    const list = enumerateOptionLoadouts(unit, army, DEFAULT_BALVAL_CONFIG);
    const better = list.find(l => l.label === 'Better Rifle')!;
    const worse = list.find(l => l.label === 'Worse Pistol')!;
    expect(better.efficiencyDelta).toBeGreaterThan(0);
    expect(worse.efficiencyDelta).toBeLessThan(0);
  });
});
