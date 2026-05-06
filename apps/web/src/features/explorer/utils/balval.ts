import type { Unit, Weapon, Rule } from '@opr-api/shared';
import { DEFAULT_BALVAL_CONFIG, TIER_THRESHOLDS } from './types';
import type { BalValConfig, BalValResult, Tier } from './types';

/**
 * Calculates hit chance based on quality (2+ to 6+)
 * 3+ -> 4/6, 4+ -> 3/6, 5+ -> 2/6
 */
export function getHitChance(quality: number): number {
  // Cap quality between 2 and 6
  const q = Math.max(2, Math.min(6, quality));
  return (7 - q) / 6;
}

/**
 * Calculates block chance based on defense and AP
 */
export function getBlockChance(defense: number, ap: number = 0): number {
  // e.g. Def 4+ with AP(1) -> effective def 5+ -> 2/6 chance to block
  const effectiveDefense = Math.max(2, Math.min(7, defense + ap));
  if (effectiveDefense >= 7) return 0;
  return (7 - effectiveDefense) / 6;
}

/**
 * Calculates the damage multiplier for a weapon based on its special rules
 */
export function getDamageMultiplier(
  weapon: Weapon,
  targetDefense: number,
  targetSize: number,
  targetToughness: number,
  _hitChance: number
): number {
  let multiplier = 1;

  for (const rule of weapon.specialRules || []) {
    const name = rule.name;
    const rating = rule.rating || 1;

    switch (name) {
      case 'Deadly':
        // Multiply by min(X, targetToughness)
        multiplier *= Math.min(rating, targetToughness);
        break;
      
      case 'Blast':
        // Multiply by min(X, targetSize)
        multiplier *= Math.min(rating, targetSize);
        break;
      
      case 'Rending':
        // Ignores armor. To simulate this as a multiplier, we divide by the normal failure rate of the armor
        // If we hit, normally they block B. So wound chance is W = H * (1-B).
        // With rending, W_rending = H * 1 = H.
        // Multiplier = W_rending / W = H / (H * (1-B)) = 1 / (1-B)
        // Note: AP is calculated separately. Rending basically means target Defense = 7 (block chance = 0).
        // Since the base formula multiplies by (1 - blockChance), we can return a multiplier that cancels it out.
        // But Rending in OPR only applies on a roll of 6 (which is 1/6 of attacks).
        // For simplicity in the BalVal base model, the user asked to "treat as target BlockChance = 0".
        // Let's implement what they asked, applying it to ALL hits for the simplified model.
        const baseBlock = getBlockChance(targetDefense);
        if (baseBlock < 1) {
          multiplier *= (1 / (1 - baseBlock));
        }
        break;

      case 'Reliable':
        // Re-roll 1s to hit
        // If normally we hit H times, we roll a 1 on 1/6 of total rolls.
        // We reroll those and hit H of them.
        // Effective HitChance = H + (1/6) * H = H * (1 + 1/6)
        multiplier *= (1 + 1/6);
        break;
      
      // Poison, Furious, Linked skipped as they aren't in standard v3.5.3 schema.
      // We also handle AP separately inside calculateWeaponOffense to directly affect BlockChance.
    }
  }

  return multiplier;
}

/**
 * Extracts the AP rating from a weapon's rules
 */
export function getWeaponAP(weapon: Weapon): number {
  const apRule = (weapon.specialRules || []).find((r: Rule) => r.name === 'AP');
  return apRule?.rating || 0;
}

/**
 * Calculates the offense score for a single weapon
 */
export function calculateWeaponOffense(
  weapon: Weapon,
  quality: number,
  targetDefense: number,
  targetSize: number,
  targetToughness: number,
  assault: boolean = false
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

/**
 * Calculates total offense score for a unit (sum of all weapons * unit size)
 */
export function calculateUnitOffense(unit: Unit, config: BalValConfig = DEFAULT_BALVAL_CONFIG): { meleeOffense: number, rangedOffense: number, totalOffense: number } {
  if (!unit.weapons || unit.weapons.length === 0) {
    return { meleeOffense: 0, rangedOffense: 0, totalOffense: 0 };
  }

  let meleeOffense = 0;
  let rangedOffense = 0;
  for (const weapon of unit.weapons) {
    const wOffense = calculateWeaponOffense(weapon, unit.quality, config.targetDefense, config.targetSize, config.targetToughness, config.assault);
    if (weapon.range === 0) {
      meleeOffense += wOffense;
    } else {
      rangedOffense += wOffense;
    }
  }

  return { meleeOffense, rangedOffense, totalOffense: Math.max(meleeOffense, rangedOffense) };
}

/**
 * Calculates effective HP for a unit
 */
export function calculateEffectiveHP(unit: Unit): number {
  let toughValue = 1;
  let hasRegen = false;
  let hasStealth = false;
  let defenseMod = 0;

  for (const rule of unit.rules || []) {
    if (rule.name === 'Tough') toughValue = rule.rating || 1;
    if (rule.name === 'Regeneration') hasRegen = true;
    if (rule.name === 'Stealth') hasStealth = true;
    if (rule.name === 'Shielded') defenseMod -= 1; // improves def
  }

  const effectiveDefense = Math.max(2, Math.min(6, unit.defense + defenseMod));
  const blockChance = getBlockChance(effectiveDefense, 0);
  
  // Base HP to wipe the unit
  // EHP = size * Tough / (1 - BlockChance)
  let ehp = (unit.size * toughValue) / (1 - blockChance);

  // Apply modifiers
  if (hasRegen) ehp *= 1.33; // roughly 1/3 more HP
  if (hasStealth) ehp *= 1.17; // roughly 1/6 less hits taken

  return ehp;
}

/**
 * Calculates raw BalVal metrics for a single unit
 */
export function calculateUnitRawBalVal(unit: Unit, config: BalValConfig = DEFAULT_BALVAL_CONFIG): Omit<BalValResult, 'normalizedBalVal' | 'tier'> {
  const { meleeOffense, rangedOffense, totalOffense } = calculateUnitOffense(unit, config);
  const effectiveHP = calculateEffectiveHP(unit);

  const offenseEfficiency = unit.cost > 0 ? totalOffense / unit.cost : 0;
  const meleeEfficiency = unit.cost > 0 ? meleeOffense / unit.cost : 0;
  const rangedEfficiency = unit.cost > 0 ? rangedOffense / unit.cost : 0;
  const defenseEfficiency = unit.cost > 0 ? effectiveHP / unit.cost : 0;

  const rawBalVal = (offenseEfficiency * config.offenseWeight) + (defenseEfficiency * (1 - config.offenseWeight));

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

/**
 * Calculates BalVal for all units in an army and normalizes them into percentiles
 */
export function calculateArmyBalVal(units: Unit[], config: BalValConfig = DEFAULT_BALVAL_CONFIG): Record<string, BalValResult> {
  const rawResults = units.map(u => calculateUnitRawBalVal(u, config));
  
  // Sort by rawBalVal to calculate percentiles
  rawResults.sort((a, b) => a.rawBalVal - b.rawBalVal);
  
  const totalUnits = rawResults.length;
  const finalResults: Record<string, BalValResult> = {};

  for (let i = 0; i < totalUnits; i++) {
    const raw = rawResults[i];
    // Percentile: 0.0 is worst, 1.0 is best. If 1 unit, it's 1.0.
    const percentile = totalUnits > 1 ? i / (totalUnits - 1) : 1.0;
    
    let tier: Tier = 'D';
    if (percentile >= TIER_THRESHOLDS.S) tier = 'S';
    else if (percentile >= TIER_THRESHOLDS.A) tier = 'A';
    else if (percentile >= TIER_THRESHOLDS.B) tier = 'B';
    else if (percentile >= TIER_THRESHOLDS.C) tier = 'C';

    finalResults[raw.unitId] = {
      ...raw,
      normalizedBalVal: percentile,
      tier,
    };
  }

  return finalResults;
}

/**
 * Calculates the raw BalVal score impact of a specific upgrade option
 */
export function calculateUpgradeBalValDelta(
  option: any,
  section: any,
  unit: Unit,
  config: any = DEFAULT_BALVAL_CONFIG
): { offenseDelta: number; ehpDelta: number } {
  let offenseDelta = 0;
  let ehpDelta = 0;

  // 1. Add value of all gains
  if (option.gains && option.gains.length > 0) {
    for (const gain of option.gains) {
      if (gain.type === 'ArmyBookWeapon') {
        offenseDelta += calculateWeaponOffense(gain, unit.quality, config.targetDefense, config.targetSize, config.targetToughness, config.assault);
      } else if (gain.type === 'ArmyBookRule' || gain.type === 'ArmyBookDefense') {
        // Simple heuristic for rules (since EHP formula requires a full unit context, we approximate the delta)
        // For accurate delta, we should calculate base EHP, calculate new EHP with rule, and diff.
        if (gain.name === 'Tough') {
          // Tough adds raw HP
          const addedTough = gain.rating || 1;
          const blockChance = getBlockChance(Math.max(2, Math.min(6, unit.defense)));
          ehpDelta += addedTough / (1 - blockChance);
        } else if (gain.name === 'Shielded') {
          // Calculate EHP with and without shielded
          const oldEhp = calculateEffectiveHP(unit);
          const mockUnit = { ...unit, rules: [...(unit.rules || []), gain] };
          ehpDelta += (calculateEffectiveHP(mockUnit) - oldEhp);
        }
      }
    }
  }

  // 2. Subtract value of replaced items if variant is 'replace'
  if (section.variant === 'replace') {
    // Determine what is being replaced by looking at the label: "Replace one Heavy Rifle"
    const sectionLabel = section.label || '';
    if (sectionLabel.toLowerCase().includes('replace')) {
      // Find a matching weapon in the unit's base weapons
      // OPR's labels are like "Replace any Razor Claws" or "Replace one Heavy Rifle"
      for (const w of unit.weapons || []) {
        // Basic heuristic: does the section label contain the weapon name?
        if (sectionLabel.toLowerCase().includes(w.name.toLowerCase())) {
          // Subtract exactly one instance of this weapon's offense
          const singleWeaponScore = calculateWeaponOffense(
            { ...w, count: 1 },
            unit.quality,
            config.targetDefense,
            config.targetSize,
            config.targetToughness,
            config.assault
          );
          
          // OPR "Replace all X" vs "Replace one X" vs "Replace up to two X"
          // Without complex grammar parsing, we assume it's replacing exactly what's gained in count
          // Or we default to replacing 1.
          let replaceCount = 1;
          if (sectionLabel.toLowerCase().includes('replace all') || sectionLabel.toLowerCase().includes('replace any')) {
             // Let's assume it replaces 1 for the delta per-option calculation, 
             // as options are usually "cost per replacement" or "replace the whole block".
             // If option costs N, it represents 1 upgrade.
          }
          offenseDelta -= (singleWeaponScore * replaceCount);
          break; // only replace one matched weapon to prevent double subtraction
        }
      }
    }
  }

  return { offenseDelta, ehpDelta };
}

/**
 * Parses the quantity of models affected by an upgrade section label.
 */
export function parseUpgradeQuantity(label: string, unitSize: number, isDoubled: boolean): number {
  const l = label.toLowerCase();
  const baseFactor = isDoubled ? 2 : 1;
  
  if (l.includes('all ') || l.includes('any ')) return unitSize;
  if (l.includes('one ')) return 1 * baseFactor;
  if (l.includes('two ')) return 2 * baseFactor;
  if (l.includes('three ')) return 3 * baseFactor;
  
  // Default to 1 for specific model upgrades (like sergeants)
  return 1 * baseFactor;
}

/**
 * Finds the mathematically most efficient loadout for a unit given the current config.
 * Optimizes by selecting the best option from each upgrade section if it improves efficiency.
 * Handles dependencies by tracking a dynamic weapon pool.
 */
export function calculateBestLoadout(
  unit: any,
  army: any,
  config: BalValConfig = DEFAULT_BALVAL_CONFIG,
  isDoubled: boolean = false
): { offense: number; meleeOffense: number; rangedOffense: number; cost: number; id: string; label: string, weapons: any[] } {
  const baseResult = calculateUnitRawBalVal(unit, config);
  
  let currentMelee = baseResult.unitMeleeOffense;
  let currentRanged = baseResult.unitRangedOffense;
  let currentCost = unit.cost;
  let currentWeapons = [...(unit.weapons || [])].map(w => ({ ...w }));
  let compositeLabel = 'Default Loadout';
  let isModified = false;

  if (!unit.upgrades || unit.upgrades.length === 0) {
    return { 
      offense: baseResult.unitOffense, 
      meleeOffense: baseResult.unitMeleeOffense, 
      rangedOffense: baseResult.unitRangedOffense, 
      cost: unit.cost, 
      id: 'base', 
      label: 'Default Loadout',
      weapons: currentWeapons
    };
  }

  // Iterate through each section and pick the BEST option that improves efficiency
  unit.upgrades.forEach((pkgUid: string) => {
    const pkg = army.upgradePackages?.find((p: any) => p.uid === pkgUid);
    if (!pkg) return;

    pkg.sections.forEach((section: any) => {
      const sectionLabel = (section.label || '').toLowerCase();
      
      let bestOption: any = null;
      let bestOptionDeltas = { melee: 0, ranged: 0, cost: 0, weapons: [] as any[], replacedWeapons: [] as any[], quantity: 0 };
      let bestOptionEfficiency = 0;

      // Current efficiency baseline for this section
      const currentEff = currentCost > 0 ? (Math.max(currentMelee, currentRanged) * config.offenseWeight + baseResult.effectiveHP * (1 - config.offenseWeight)) / currentCost : 0;

      section.options.forEach((option: any) => {
        const weaponGains = option.gains?.filter((g: any) => g.type === 'ArmyBookWeapon') || [];
        const ruleGains = option.gains?.filter((g: any) => g.type === 'ArmyBookRule') || [];
        
        if (weaponGains.length === 0 && ruleGains.length === 0) return;

        let meleeDelta = 0;
        let rangedDelta = 0;
        let quantity = 0;

        // 1. Identify which weapons we are replacing from the pool
        const replacedWeapons: any[] = [];
        if (section.variant === 'replace' && sectionLabel.includes('replace')) {
          // Find ALL matches in the pool
          const matches = currentWeapons.filter(w => sectionLabel.includes(w.name.toLowerCase()));
          
          if (matches.length > 0) {
            // Determine quantity limit
            if (sectionLabel.includes('all ') || sectionLabel.includes('any ')) {
              // Replace as many as are available for each type
              quantity = Math.max(...matches.map(w => w.count));
            } else {
              const labelNum = sectionLabel.includes('one ') ? 1 : sectionLabel.includes('two ') ? 2 : sectionLabel.includes('three ') ? 3 : 1;
              quantity = labelNum * (isDoubled ? 2 : 1);
            }

            matches.forEach(w => {
              const q = Math.min(w.count, quantity);
              replacedWeapons.push({ weapon: w, quantity: q });

              const singleReplacedOffense = calculateWeaponOffense(
                { ...w, count: 1 }, 
                unit.quality, 
                config.targetDefense, 
                config.targetSize,
                config.targetToughness,
                config.assault
              );
              
              if (w.range === 0) meleeDelta -= (singleReplacedOffense * q);
              else rangedDelta -= (singleReplacedOffense * q);
            });
          } else {
            // No matching weapon to replace
            return;
          }
        } else {
          // It's an upgrade (adding gear)
          const baseFactor = isDoubled ? 2 : 1;
          if (sectionLabel.includes('all ') || sectionLabel.includes('any ')) {
            quantity = unit.size;
          } else {
            const labelNum = sectionLabel.includes('one ') ? 1 : sectionLabel.includes('two ') ? 2 : 1;
            quantity = labelNum * baseFactor;
          }
        }

        // 2. Add gained weapons value
        weaponGains.forEach((gain: any) => {
          const singleGainedOffense = calculateWeaponOffense(
            { ...gain, count: 1 },
            unit.quality,
            config.targetDefense,
            config.targetSize,
            config.targetToughness,
            config.assault
          );
          
          if (gain.range === 0) meleeDelta += (singleGainedOffense * quantity);
          else rangedDelta += (singleGainedOffense * quantity);
        });

        // OPR cost logic
        let actualCost = option.cost;
        if (!(sectionLabel.includes('all ') || sectionLabel.includes('any '))) {
           if (sectionLabel.includes('one ') || sectionLabel.includes('two ') || sectionLabel.includes('three ')) {
              actualCost = option.cost * (quantity / (sectionLabel.includes('two ') ? 2 : sectionLabel.includes('three ') ? 3 : 1));
           }
        }
        
        const finalTestCost = currentCost + actualCost;
        const testEff = finalTestCost > 0 ? (Math.max(currentMelee + meleeDelta, currentRanged + rangedDelta) * config.offenseWeight + baseResult.effectiveHP * (1 - config.offenseWeight)) / finalTestCost : 0;

        if (testEff > currentEff && testEff > bestOptionEfficiency) {
          bestOption = option;
          bestOptionEfficiency = testEff;
          bestOptionDeltas = { 
            melee: meleeDelta, 
            ranged: rangedDelta, 
            cost: actualCost,
            weapons: weaponGains.map((g: any) => ({ ...g, count: g.count * (section.variant === 'replace' ? (quantity || 1) : quantity) })),
            replacedWeapons: replacedWeapons,
            quantity: quantity
          };
        }
      });

      // If we found a beneficial option in this section, apply it to the state
      if (bestOption) {
        currentMelee += bestOptionDeltas.melee;
        currentRanged += bestOptionDeltas.ranged;
        currentCost += bestOptionDeltas.cost;
        
        if (bestOptionDeltas.replacedWeapons && bestOptionDeltas.replacedWeapons.length > 0) {
          bestOptionDeltas.replacedWeapons.forEach((rw: any) => {
            currentWeapons = currentWeapons.map(w => {
              if (w.id === rw.weapon.id) {
                 const newCount = Math.max(0, w.count - rw.quantity);
                 return newCount > 0 ? { ...w, count: newCount } : null;
              }
              return w;
            }).filter(Boolean) as any[];
          });
        }
        currentWeapons.push(...bestOptionDeltas.weapons);
        
        if (!isModified) {
          compositeLabel = bestOption.label;
          isModified = true;
        } else {
          compositeLabel += ` + ${bestOption.label}`;
        }
      }
    });
  });

  return {
    offense: Math.max(currentMelee, currentRanged),
    meleeOffense: currentMelee,
    rangedOffense: currentRanged,
    cost: currentCost,
    id: isModified ? 'composite' : 'base',
    label: compositeLabel,
    weapons: currentWeapons
  };
}

