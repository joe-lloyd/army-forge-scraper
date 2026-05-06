import { useState, useEffect } from 'react';
import type { BalValConfig, BalValResult } from '../utils/types';
import { calculateWeaponOffense, parseUpgradeQuantity } from '../utils/balval';

interface UnitDetailSidebarProps {
  selectedUnit: any | null;
  army: any;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
  isDoubled: boolean;
  onToggleDouble: () => void;
}

export function UnitDetailSidebar({ selectedUnit, army, balValScore, balValConfig, isDoubled, onToggleDouble }: UnitDetailSidebarProps) {
  const [selectedLoadoutId, setSelectedLoadoutId] = useState('base');
  
  // Sync selected loadout if "Most Effective" is toggled on
  useEffect(() => {
    if (balValConfig.mostEffective && selectedUnit?.isOptimized && selectedUnit.optimizedId) {
      setSelectedLoadoutId(selectedUnit.optimizedId);
    }
  }, [balValConfig.mostEffective, selectedUnit?.id, selectedUnit?.isOptimized, selectedUnit?.optimizedId]);
  if (!selectedUnit) {
    return (
      <div className="glass-card flex flex-col items-center justify-center p-8 text-center text-slate-400 italic">
        Select a unit to view its armory and mathematical breakdown
      </div>
    );
  }

  const getTierColor = (tier: string | undefined) => {
    switch (tier) {
      case 'S': return 'text-sky-400';
      case 'A': return 'text-emerald-400';
      case 'B': return 'text-slate-300';
      case 'C': return 'text-amber-400';
      case 'D': return 'text-rose-400';
      default: return 'text-slate-400';
    }
  };

  const tierColor = getTierColor(balValScore?.tier);

  // -- Loadout Generation Logic --
  // 1. Base Loadout
  const loadouts: any[] = [
    {
      id: 'base',
      label: selectedUnit.isOptimized ? `Optimized: ${selectedUnit.optimizedLabel}` : 'Default Loadout',
      weapons: selectedUnit.weapons || [],
      meleeOffense: balValScore?.unitMeleeOffense || 0,
      rangedOffense: balValScore?.unitRangedOffense || 0,
      offense: balValScore?.unitOffense || 0,
      cost: selectedUnit.cost,
      isBase: true,
    }
  ];

  // 2. Simplified Option Loadouts (All-in on one weapon replacement)
  if (selectedUnit.upgrades?.length > 0) {
    selectedUnit.upgrades.forEach((pkgUid: string) => {
      const pkg = army.upgradePackages?.find((p: any) => p.uid === pkgUid);
      if (!pkg) return;

      pkg.sections.forEach((section: any) => {
        const sectionLabel = section.label?.toLowerCase() || '';
        
        section.options.forEach((option: any) => {
          // Only care about options that give weapons
          const weaponGains = option.gains?.filter((g: any) => g.type === 'ArmyBookWeapon') || [];
          if (weaponGains.length === 0) return;

          let meleeDelta = 0;
          let rangedDelta = 0;
          const quantity = parseUpgradeQuantity(section.label || '', selectedUnit.size, isDoubled);
          const replacedWeapons: any[] = [];
          // If it's a replace variant, find what we are replacing
          if (section.variant === 'replace' && sectionLabel.includes('replace')) {
            const matches = (selectedUnit.weapons || []).filter((w: any) => sectionLabel.includes(w.name.toLowerCase()));
            
            matches.forEach((w: any) => {
              replacedWeapons.push(w);
              const singleReplacedOffense = calculateWeaponOffense(
                { ...w, count: 1 }, 
                selectedUnit.quality, 
                balValConfig.targetDefense, 
                balValConfig.targetSize,
                balValConfig.targetToughness,
                balValConfig.assault
              );
              
              if (w.range === 0) {
                meleeDelta -= (singleReplacedOffense * quantity);
              } else {
                rangedDelta -= (singleReplacedOffense * quantity);
              }
            });
          }

          // Add new weapons
          const newWeaponsForDisplay: any[] = [];
          weaponGains.forEach((gain: any) => {
            const singleGainedOffense = calculateWeaponOffense(
              { ...gain, count: 1 },
              selectedUnit.quality,
              balValConfig.targetDefense,
              balValConfig.targetSize,
              balValConfig.targetToughness,
              balValConfig.assault
            );
            
            if (gain.range === 0) {
              meleeDelta += (singleGainedOffense * quantity);
            } else {
              rangedDelta += (singleGainedOffense * quantity);
            }
            
            newWeaponsForDisplay.push({ ...gain, count: gain.count * quantity });
          });

          // Build the final display weapon list for this loadout
          const finalWeapons = [];
          for (const w of selectedUnit.weapons || []) {
             const isReplaced = replacedWeapons.some(rw => rw.id === w.id);
             if (isReplaced) {
               // We replaced all of this weapon, so skip it
               continue; 
             }
             finalWeapons.push(w);
          }
          finalWeapons.push(...newWeaponsForDisplay);

          const finalMelee = (balValScore?.unitMeleeOffense || 0) + meleeDelta;
          const finalRanged = (balValScore?.unitRangedOffense || 0) + rangedDelta;
          const finalOffense = Math.max(finalMelee, finalRanged);
          const actualCost = option.cost * (sectionLabel.includes('all') || sectionLabel.includes('any') ? 1 : (section.variant === 'replace' ? 1 : quantity));
          const finalCost = selectedUnit.cost + actualCost;

          loadouts.push({
            id: option.id,
            label: option.label,
            weapons: finalWeapons,
            meleeOffense: finalMelee,
            rangedOffense: finalRanged,
            offense: finalOffense,
            cost: finalCost,
            isBase: false,
          });
        });
      });
    });
  }

  // Sort loadouts: lowest output to highest, but base loadout always on top
  const baseLoadout = loadouts.find(l => l.isBase);
  const otherLoadouts = loadouts
    .filter(l => !l.isBase)
    .sort((a, b) => a.offense - b.offense)
    .slice(0, 7); // Limit to 7 as requested
    
  const finalLoadoutList = baseLoadout ? [baseLoadout, ...otherLoadouts] : otherLoadouts;

  const activeLoadout = finalLoadoutList.find(l => l.id === selectedLoadoutId) || baseLoadout || finalLoadoutList[0];

  const activeMelee = activeLoadout?.meleeOffense || 0;
  const activeRanged = activeLoadout?.rangedOffense || 0;
  const activeOffense = activeLoadout?.offense || 0;
  const activeCost = activeLoadout?.cost || selectedUnit.cost;
  const activeMeleeEff = activeCost > 0 ? activeMelee / activeCost : 0;
  const activeRangedEff = activeCost > 0 ? activeRanged / activeCost : 0;
  const activeDefEff = activeCost > 0 ? (balValScore?.effectiveHP || 0) / activeCost : 0;


  return (
    <div className="glass-card flex flex-col sticky top-28 max-h-[calc(100vh-8rem)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-700/50 p-6 flex flex-col gap-6 bg-slate-900/90 backdrop-blur-md z-10 rounded-t-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-extrabold text-white">{selectedUnit.name}</h2>
              {selectedUnit.isOptimized && (
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px] font-black uppercase tracking-widest border border-sky-500/30">
                  Optimized
                </span>
              )}
            </div>
            {selectedUnit.genericName && (
              <div className="mt-1 text-sm text-slate-400">{selectedUnit.genericName}</div>
            )}
          </div>
          {balValScore && (
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <div className={`text-4xl font-black ${tierColor}`}>
                  {balValScore.tier}
                </div>
                <div className="text-xs text-slate-400 font-bold tracking-wider mt-1">
                  TOP {(balValScore.normalizedBalVal * 100).toFixed(0)}%
                </div>
              </div>
              
              {/* Double Unit Toggle */}
              {(isDoubled || selectedUnit.size > 1) && (
                <div 
                  className="flex items-center gap-2 px-2 py-1 rounded bg-sky-500/10 border border-sky-500/30 cursor-pointer hover:bg-sky-500/20 transition-colors"
                  onClick={onToggleDouble}
                >
                  <input
                    type="checkbox"
                    id="sidebar-double"
                    checked={isDoubled}
                    readOnly
                    className="w-3 h-3 rounded border-sky-600 bg-slate-800 text-sky-500 pointer-events-none"
                  />
                  <label htmlFor="sidebar-double" className="text-[10px] font-bold uppercase tracking-wide text-sky-400 cursor-pointer select-none">
                    2x Unit
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* BalVal Breakdown */}
        {balValScore && (
          <section>
            <div className="grid grid-cols-1 gap-3">
              {/* Offense Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/5 border border-white/5 p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 bg-rose-500" style={{ width: `${Math.min(100, activeMeleeEff * 1000)}%` }}></div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Melee Dmg / Turn</div>
                  <div className="text-xl font-extrabold text-white mt-1">{activeMelee.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Eff: {activeMeleeEff.toFixed(3)}</div>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/5 p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 bg-amber-500" style={{ width: `${Math.min(100, activeRangedEff * 1000)}%` }}></div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Ranged Dmg / Turn</div>
                  <div className="text-xl font-extrabold text-white mt-1">{activeRanged.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Eff: {activeRangedEff.toFixed(3)}</div>
                </div>
              </div>

              {/* Defense & Total Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/5 border border-white/5 p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 bg-emerald-500" style={{ width: `${Math.min(100, activeDefEff * 1000)}%` }}></div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Effective HP</div>
                  <div className="text-xl font-extrabold text-white mt-1">{balValScore.effectiveHP.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Eff: {activeDefEff.toFixed(3)}</div>
                </div>
                <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-4 flex flex-col justify-center">
                  <div className="text-[10px] uppercase tracking-wider text-sky-400 font-bold">Best Activation</div>
                  <div className="text-xl font-black text-white mt-1">{activeOffense.toFixed(2)} Dmg</div>
                  <div className="text-[10px] text-sky-500/70">Using Max(Melee, Ranged)</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Loadouts Selector */}
        <section>
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-sky-400">
            Select Loadout
          </span>
          <div className="flex flex-wrap gap-2">
            {finalLoadoutList.map((loadout) => {
              const isSelected = selectedLoadoutId === loadout.id;
              return (
                <button
                  key={loadout.id}
                  onClick={() => setSelectedLoadoutId(loadout.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                    isSelected 
                      ? 'bg-sky-500 border-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]' 
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[120px]">{loadout.label}</span>
                    <span className={`text-[10px] opacity-70 ${isSelected ? 'text-sky-100' : 'text-sky-400'}`}>
                      {loadout.cost}pt
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Selected Loadout Details & Math Breakdown */}
        {activeLoadout && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="bg-white/5 p-4 border-b border-white/5">
                <h4 className="text-sm font-bold text-white mb-3 flex justify-between items-center">
                  <span>Armory Breakdown</span>
                  <span className="text-[10px] uppercase text-slate-500 tracking-widest">Selected: {activeLoadout.label}</span>
                </h4>
                
                <div className="space-y-3">
                  {activeLoadout.weapons.map((w: any, idx: number) => {
                    // Re-calculate math details for the breakdown display
                    const quality = selectedUnit.quality;
                    const effQual = balValConfig.assault ? quality + 1 : quality;
                    const hitChance = Math.min(5/6, Math.max(1/6, (7 - effQual) / 6));
                    
                    let ap = 0;
                    w.specialRules?.forEach((r: any) => { if (r.name === 'AP') ap = r.rating || 0; });
                    const effDef = Math.max(2, Math.min(7, balValConfig.targetDefense + ap));
                    const blockChance = Math.max(0, (7 - effDef) / 6);
                    const woundChance = hitChance * (1 - blockChance);
                    
                    const attacks = w.count * w.attacks;
                    const wounds = attacks * woundChance; // simplified for display

                    return (
                      <div key={idx} className="p-3 rounded bg-black/20 border border-white/5">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-sky-400">{w.count}x {w.name} (A{w.attacks})</span>
                          <span className="text-[10px] font-mono text-rose-400">{(wounds).toFixed(2)} Exp Wounds</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-[9px] text-slate-500 font-medium uppercase tracking-tight">
                          <div className="flex flex-col">
                            <span>Hit Chance</span>
                            <span className="text-white">{(hitChance * 100).toFixed(0)}% <span className="opacity-50">({effQual}+)</span></span>
                          </div>
                          <div className="flex flex-col">
                            <span>Block Chance</span>
                            <span className="text-white">{(blockChance * 100).toFixed(0)}% <span className="opacity-50">({effDef}+)</span></span>
                          </div>
                          <div className="flex flex-col">
                            <span>Special Rules</span>
                            <span className="text-white truncate">{w.specialRules?.length > 0 ? w.specialRules.map((r:any) => r.label).join(', ') : 'None'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="p-4 bg-sky-500/5 text-[10px] text-slate-400 italic leading-relaxed">
                * Expected wounds are calculated against a Target with Defense {balValConfig.targetDefense}+ and Toughness {balValConfig.targetToughness}.
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
