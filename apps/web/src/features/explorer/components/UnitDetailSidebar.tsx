import type { BalValConfig, BalValResult } from '../utils/types';
import { calculateWeaponOffense, getHitChance, getBlockChance, getDamageMultiplier, getWeaponAP } from '../utils/balval';

interface UnitDetailSidebarProps {
  selectedUnit: any | null;
  army: any;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
  setBalValConfig: (config: BalValConfig) => void;
}

export function UnitDetailSidebar({ selectedUnit, army, balValScore, balValConfig, setBalValConfig }: UnitDetailSidebarProps) {
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
  const baseOffense = balValScore?.unitOffense || 0;
  const loadouts = [
    {
      id: 'base',
      label: 'Default Loadout',
      weapons: selectedUnit.weapons || [],
      offense: baseOffense,
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

          let offenseDelta = 0;
          let replaceCount = 1;
          let replacedWeapon: any = null;

          // If it's a replace variant, find what we are replacing to swap them all
          if (section.variant === 'replace' && sectionLabel.includes('replace')) {
            for (const w of selectedUnit.weapons || []) {
              if (sectionLabel.includes(w.name.toLowerCase())) {
                replacedWeapon = w;
                replaceCount = w.count; // "Make all 3 pick the same weapon"
                
                const singleReplacedOffense = calculateWeaponOffense(
                  { ...w, count: 1 }, 
                  selectedUnit.quality, 
                  balValConfig.targetDefense, 
                  balValConfig.targetSize,
                  balValConfig.targetToughness
                );
                offenseDelta -= (singleReplacedOffense * replaceCount);
                break;
              }
            }
          } else {
             // If it's just an upgrade (e.g. giving a sergeant a pistol), it applies to 1 model usually
             replaceCount = 1; 
          }

          // Add new weapons
          const newWeaponsForDisplay: any[] = [];
          weaponGains.forEach((gain: any) => {
            const singleGainedOffense = calculateWeaponOffense(
              { ...gain, count: 1 },
              selectedUnit.quality,
              balValConfig.targetDefense,
              balValConfig.targetSize,
              balValConfig.targetToughness
            );
            offenseDelta += (singleGainedOffense * replaceCount);
            newWeaponsForDisplay.push({ ...gain, count: gain.count * replaceCount });
          });

          // Build the final display weapon list for this loadout
          const finalWeapons = [];
          for (const w of selectedUnit.weapons || []) {
             if (replacedWeapon && w.id === replacedWeapon.id) {
               // We replaced all of this weapon, so skip it
               continue; 
             }
             finalWeapons.push(w);
          }
          finalWeapons.push(...newWeaponsForDisplay);

          const finalOffense = baseOffense + offenseDelta;
          const finalCost = selectedUnit.cost + (option.cost * replaceCount);

          loadouts.push({
            id: option.id,
            label: `All take ${option.label}`,
            weapons: finalWeapons,
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


  return (
    <div className="glass-card flex flex-col sticky top-28 max-h-[calc(100vh-8rem)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-700/50 p-6 flex flex-col gap-6 bg-slate-900/90 backdrop-blur-md z-10 rounded-t-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-white">{selectedUnit.name}</h2>
            {selectedUnit.genericName && (
              <div className="mt-1 text-sm text-slate-400">{selectedUnit.genericName}</div>
            )}
          </div>
          {balValScore && (
            <div className="text-right">
              <div className={`text-4xl font-black ${tierColor}`}>
                {balValScore.tier}
              </div>
              <div className="text-xs text-slate-400 font-bold tracking-wider mt-1">
                TOP {(balValScore.normalizedBalVal * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* BalVal Breakdown */}
        {balValScore && (
          <section>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-white/5 border border-white/5 p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-1 bg-rose-500" style={{ width: `${Math.min(100, balValScore.offenseEfficiency * 1000)}%` }}></div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Expected Dmg / Turn</div>
                <div className="text-2xl font-extrabold text-white mt-1">{balValScore.unitOffense.toFixed(2)}</div>
                <div className="text-xs text-slate-500 mt-1">Offense Eff: {balValScore.offenseEfficiency.toFixed(3)}</div>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/5 p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-1 bg-emerald-500" style={{ width: `${Math.min(100, balValScore.defenseEfficiency * 1000)}%` }}></div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Effective HP</div>
                <div className="text-2xl font-extrabold text-white mt-1">{balValScore.effectiveHP.toFixed(2)}</div>
                <div className="text-xs text-slate-500 mt-1">Defense Eff: {balValScore.defenseEfficiency.toFixed(3)}</div>
              </div>
            </div>
          </section>
        )}

        {/* Loadouts List */}
        <section>
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-sky-400">
            Weapon Loadouts ({finalLoadoutList.length})
          </span>
          <div className="space-y-4">
            {finalLoadoutList.map((loadout) => (
              <div key={loadout.id} className={`rounded-xl border p-4 ${loadout.isBase ? 'bg-sky-900/20 border-sky-500/50' : 'bg-slate-800/40 border-slate-700/50'}`}>
                <div className="flex items-start justify-between mb-3 border-b border-white/10 pb-2">
                  <div className="text-sm font-bold text-white">
                    {loadout.label}
                  </div>
                  <div className="text-sm font-black text-sky-400">
                    {loadout.cost}pts
                  </div>
                </div>
                
                <div className="space-y-1 mb-3">
                  {loadout.weapons.map((w: any, idx: number) => (
                    <div key={idx} className="text-xs text-slate-300 flex justify-between">
                      <span>{w.count}x {w.name} (A{w.attacks})</span>
                      <span className="text-slate-500">{w.specialRules?.map((r:any) => r.label).join(', ')}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/5 text-xs">
                  <span className="font-semibold text-rose-400">
                    {loadout.offense.toFixed(2)} Dmg
                  </span>
                  <span className="text-slate-500 px-1">•</span>
                  <span className="font-semibold text-sky-400">
                    {(loadout.offense / loadout.cost).toFixed(3)} Eff
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
