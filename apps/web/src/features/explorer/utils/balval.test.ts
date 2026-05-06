import { describe, it, expect } from 'vitest';
import {
  getHitChance,
  getBlockChance,
  getDamageMultiplier,
  getWeaponAP,
  calculateWeaponOffense,
  calculateUnitOffense,
  calculateEffectiveHP,
} from './balval';
import type { Unit, Weapon, Rule } from '@opr-api/shared';

describe('Math-Hammer BalVal Engine', () => {
  describe('getHitChance', () => {
    it('calculates hit chance based on quality (2+ to 6+)', () => {
      // 2+ -> 5/6 = 0.833
      expect(getHitChance(2)).toBeCloseTo(5 / 6);
      // 3+ -> 4/6 = 0.666
      expect(getHitChance(3)).toBeCloseTo(4 / 6);
      // 4+ -> 3/6 = 0.5
      expect(getHitChance(4)).toBeCloseTo(0.5);
      // 5+ -> 2/6 = 0.333
      expect(getHitChance(5)).toBeCloseTo(2 / 6);
      // 6+ -> 1/6 = 0.166
      expect(getHitChance(6)).toBeCloseTo(1 / 6);
    });

    it('caps quality bounds to 2+ and 6+', () => {
      expect(getHitChance(1)).toBeCloseTo(5 / 6); // Cap at 2+
      expect(getHitChance(7)).toBeCloseTo(1 / 6); // Cap at 6+
    });
  });

  describe('getBlockChance', () => {
    it('calculates block chance without AP', () => {
      // 2+ -> 5/6 = 0.833 block
      expect(getBlockChance(2, 0)).toBeCloseTo(5 / 6);
      // 4+ -> 3/6 = 0.5 block
      expect(getBlockChance(4, 0)).toBeCloseTo(0.5);
      // 6+ -> 1/6 = 0.166 block
      expect(getBlockChance(6, 0)).toBeCloseTo(1 / 6);
    });

    it('reduces block chance based on AP', () => {
      // Defense 3+ vs AP(1) -> effectively 4+ -> 3/6 block
      expect(getBlockChance(3, 1)).toBeCloseTo(0.5);
      // Defense 2+ vs AP(4) -> effectively 6+ -> 1/6 block
      expect(getBlockChance(2, 4)).toBeCloseTo(1 / 6);
    });

    it('caps block chance at 0 (cannot block) if effective defense goes to 7+', () => {
      // Defense 4+ vs AP(3) -> 7+ -> 0% block
      expect(getBlockChance(4, 3)).toBe(0);
      // Defense 5+ vs AP(4) -> 9+ -> capped at 7+ -> 0% block
      expect(getBlockChance(5, 4)).toBe(0);
    });
  });

  describe('getWeaponAP', () => {
    it('extracts AP rating from weapon rules', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Plasma Rifle', name: 'Plasma Rifle', attacks: 1, count: 1, range: 24,
        specialRules: [{ id: 'r1', name: 'AP', rating: 2 } as Rule]
      };
      expect(getWeaponAP(weapon)).toBe(2);
    });

    it('returns 0 if no AP rule exists', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 1, range: 24, specialRules: []
      };
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
        specialRules: [{ id: 'r1', name: 'Deadly', rating: 3 } as Rule]
      };
      // Target toughness 1 -> cap at 1
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(1);
      // Target toughness 3 -> use 3
      expect(getDamageMultiplier(weapon, 4, 1, 3, 0.5)).toBe(3);
      // Target toughness 5 -> use 3 (rating cap)
      expect(getDamageMultiplier(weapon, 4, 1, 5, 0.5)).toBe(3);
    });

    it('applies Blast multiplier correctly', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Rocket', name: 'Rocket', attacks: 1, count: 1, range: 24,
        specialRules: [{ id: 'r1', name: 'Blast', rating: 3 } as Rule]
      };
      // Target size 1 -> cap at 1
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(1);
      // Target size 5 -> use 3
      expect(getDamageMultiplier(weapon, 4, 5, 1, 0.5)).toBe(3);
    });

    it('applies Reliable multiplier correctly (reroll 1s)', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Spear', name: 'Spear', attacks: 1, count: 1, range: 0,
        specialRules: [{ id: 'r1', name: 'Reliable' } as Rule]
      };
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBeCloseTo(1 + 1/6);
    });

    it('applies Rending multiplier correctly (divide by armor failure rate)', () => {
      const weapon: Weapon = {
        id: 'w1', label: 'Claws', name: 'Claws', attacks: 1, count: 1, range: 0,
        specialRules: [{ id: 'r1', name: 'Rending' } as Rule]
      };
      // Base block chance for Def 4+ is 3/6 = 0.5. Failure rate is 0.5.
      // Rending multiplier simulates ignoring armor = 1 / 0.5 = 2.0
      expect(getDamageMultiplier(weapon, 4, 1, 1, 0.5)).toBe(2.0);
      
      // Base block chance for Def 2+ is 5/6. Failure rate is 1/6.
      // Rending multiplier = 1 / (1/6) = 6.0
      expect(getDamageMultiplier(weapon, 2, 1, 1, 0.5)).toBeCloseTo(6.0);
    });
  });

  describe('calculateWeaponOffense', () => {
    it('calculates expected damage against target profile', () => {
      const weapon: Weapon = { id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 5, range: 24, specialRules: [] };
      // 5 attacks, Quality 4+ (0.5 hit), Defense 4+ (0.5 block)
      // Hits = 2.5
      // Wounds = 2.5 * (1 - 0.5) = 1.25
      expect(calculateWeaponOffense(weapon, 4, 4, 1, 1)).toBeCloseTo(1.25);
    });

    it('incorporates AP into expected damage', () => {
      const weapon: Weapon = { 
        id: 'w1', label: 'Plasma', name: 'Plasma', attacks: 1, count: 5, range: 24, 
        specialRules: [{ id: 'r1', name: 'AP', rating: 2 } as Rule] 
      };
      // 5 attacks, Quality 4+ (0.5 hit), Defense 4+ vs AP(2) = 6+ (1/6 block)
      // Hits = 2.5
      // Wounds = 2.5 * (1 - 1/6) = 2.5 * 5/6 = 2.0833
      expect(calculateWeaponOffense(weapon, 4, 4, 1, 1)).toBeCloseTo(2.0833);
    });

    it('applies the Assault penalty (-1 to hit)', () => {
      const weapon: Weapon = { id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 5, range: 24, specialRules: [] };
      // Normal: Quality 4+ -> hit 0.5. With assault -> Quality 5+ -> hit 0.333
      // Hits = 5 * 0.333 = 1.666
      // Wounds = 1.666 * 0.5 = 0.833
      expect(calculateWeaponOffense(weapon, 4, 4, 1, 1, true)).toBeCloseTo(0.8333);
    });
  });

  describe('calculateUnitOffense', () => {
    it('splits melee and ranged damage correctly', () => {
      const rangedWeapon = { id: 'w1', label: 'Rifle', name: 'Rifle', attacks: 1, count: 5, range: 24, specialRules: [] } as Weapon;
      const meleeWeapon = { id: 'w2', label: 'Sword', name: 'Sword', attacks: 2, count: 5, range: 0, specialRules: [] } as Weapon;
      const unit = { weapons: [rangedWeapon, meleeWeapon], quality: 4 } as unknown as Unit;
      
      const config = { targetDefense: 4, targetSize: 1, targetToughness: 1, offenseWeight: 0.5, assault: false, mostEffective: false };
      
      const { meleeOffense, rangedOffense, totalOffense } = calculateUnitOffense(unit, config);
      
      // Ranged: 5 attacks, 0.5 hit, 0.5 wound = 1.25
      // Melee: 10 attacks, 0.5 hit, 0.5 wound = 2.50
      expect(rangedOffense).toBeCloseTo(1.25);
      expect(meleeOffense).toBeCloseTo(2.50);
      expect(totalOffense).toBeCloseTo(2.50); // Math.max(1.25, 2.50)
    });
  });

  describe('calculateEffectiveHP', () => {
    it('calculates EHP for standard infantry', () => {
      const unit = { id: 'u1', name: 'Troops', size: 5, defense: 4, cost: 100, quality: 4, rules: [] } as unknown as Unit;
      // Size 5, Tough 1 (implicit), Defense 4+ (0.5 block chance)
      // EHP = 5 * 1 / (1 - 0.5) = 10
      expect(calculateEffectiveHP(unit)).toBe(10);
    });

    it('incorporates Tough rule into EHP', () => {
      const unit = { 
        id: 'u1', name: 'Monster', size: 1, defense: 2, cost: 200, quality: 3, 
        rules: [{ id: 'r1', name: 'Tough', rating: 6 } as Rule] 
      } as unknown as Unit;
      // Size 1, Tough 6, Defense 2+ (5/6 block chance, 1/6 damage chance)
      // EHP = 1 * 6 / (1/6) = 36
      expect(calculateEffectiveHP(unit)).toBeCloseTo(36);
    });

    it('incorporates Regeneration (+33%)', () => {
      const unit = { 
        id: 'u1', name: 'Regen Troops', size: 5, defense: 4, cost: 100, quality: 4, 
        rules: [{ id: 'r1', name: 'Regeneration' } as Rule] 
      } as unknown as Unit;
      // Base EHP = 10. Regen EHP = 10 * 1.33 = 13.3
      expect(calculateEffectiveHP(unit)).toBeCloseTo(13.3);
    });

    it('incorporates Stealth (+17%)', () => {
      const unit = { 
        id: 'u1', name: 'Stealth Troops', size: 5, defense: 4, cost: 100, quality: 4, 
        rules: [{ id: 'r1', name: 'Stealth' } as Rule] 
      } as unknown as Unit;
      // Base EHP = 10. Stealth EHP = 10 * 1.17 = 11.7
      expect(calculateEffectiveHP(unit)).toBeCloseTo(11.7);
    });

    it('incorporates Shielded (-1 to Enemy AP / +1 to Defense)', () => {
      const unit = { 
        id: 'u1', name: 'Shield Troops', size: 5, defense: 4, cost: 100, quality: 4, 
        rules: [{ id: 'r1', name: 'Shielded' } as Rule] 
      } as unknown as Unit;
      // Base EHP without Shielded = 10
      // With Shielded, defense counts as 3+ (4/6 block, 2/6 fail)
      // EHP = 5 / (2/6) = 15
      expect(calculateEffectiveHP(unit)).toBeCloseTo(15);
    });
  });
});
