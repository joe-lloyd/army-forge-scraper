import type { BalValConfig, BalValResult } from '../utils/types';
import { calculateWeaponOffense } from '../utils/balval';

interface UnitCardDetailsProps {
  unit: any;
  army: any;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
}

export function UnitCardDetails({ unit, army, balValScore, balValConfig }: UnitCardDetailsProps) {
  // -- Loadout Generation Logic --
  // 1. Base Loadout
  const baseOffense = balValScore?.unitOffense || 0;
  const loadouts = [
    {
      id: 'base',
      label: 'Default Loadout',
      weapons: unit.weapons || [],
      offense: baseOffense,
      cost: unit.cost,
      isBase: true,
    }
  ];

  // 2. Simplified Option Loadouts (All-in on one weapon replacement)
  if (unit.upgrades?.length > 0) {
    unit.upgrades.forEach((pkgUid: string) => {
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
            for (const w of unit.weapons || []) {
              if (sectionLabel.includes(w.name.toLowerCase())) {
                replacedWeapon = w;
                replaceCount = w.count; // "Make all X pick the same weapon"
                
                const singleReplacedOffense = calculateWeaponOffense(
                  { ...w, count: 1 }, 
                  unit.quality, 
                  balValConfig.targetDefense, 
                  balValConfig.targetSize,
                  balValConfig.targetToughness
                );
                offenseDelta -= (singleReplacedOffense * replaceCount);
                break;
              }
            }
          } else {
             // If it's just an upgrade, it usually applies to 1 model
             replaceCount = 1; 
          }

          // Add new weapons
          const newWeaponsForDisplay: any[] = [];
          weaponGains.forEach((gain: any) => {
            const singleGainedOffense = calculateWeaponOffense(
              { ...gain, count: 1 },
              unit.quality,
              balValConfig.targetDefense,
              balValConfig.targetSize,
              balValConfig.targetToughness
            );
            offenseDelta += (singleGainedOffense * replaceCount);
            newWeaponsForDisplay.push({ ...gain, count: gain.count * replaceCount });
          });

          // Build the final display weapon list for this loadout
          const finalWeapons = [];
          for (const w of unit.weapons || []) {
             if (replacedWeapon && w.id === replacedWeapon.id) {
               // We replaced all of this weapon, so skip it
               continue; 
             }
             finalWeapons.push(w);
          }
          finalWeapons.push(...newWeaponsForDisplay);

          const finalOffense = baseOffense + offenseDelta;
          const finalCost = unit.cost + (option.cost * replaceCount);

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
    .slice(0, 7); // Limit to 7
    
  const finalLoadoutList = baseLoadout ? [baseLoadout, ...otherLoadouts] : otherLoadouts;


  return (
    <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-6 animate-in slide-in-from-top-2 fade-in duration-200">
      
      {/* BalVal Breakdown */}
      {balValScore && (
        <section>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 bg-rose-500" style={{ width: `${Math.min(100, balValScore.offenseEfficiency * 1000)}%` }}></div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Expected Dmg / Turn</div>
              <div className="text-xl font-extrabold text-white mt-1">{balValScore.unitOffense.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Offense Eff: {balValScore.offenseEfficiency.toFixed(3)}</div>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 bg-emerald-500" style={{ width: `${Math.min(100, balValScore.defenseEfficiency * 1000)}%` }}></div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Effective HP</div>
              <div className="text-xl font-extrabold text-white mt-1">{balValScore.effectiveHP.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Defense Eff: {balValScore.defenseEfficiency.toFixed(3)}</div>
            </div>
          </div>
        </section>
      )}

      {/* Loadouts List */}
      <section>
        <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">
          Weapon Loadouts ({finalLoadoutList.length})
        </span>
        <div className="space-y-3">
          {finalLoadoutList.map((loadout) => (
            <div key={loadout.id} className={`rounded-xl border p-3 ${loadout.isBase ? 'bg-sky-900/20 border-sky-500/30' : 'bg-slate-800/40 border-slate-700/50'}`}>
              <div className="flex items-start justify-between mb-2 border-b border-white/5 pb-2">
                <div className="text-xs font-bold text-white">
                  {loadout.label}
                </div>
                <div className="text-xs font-black text-sky-400">
                  {loadout.cost}pts
                </div>
              </div>
              
              <div className="space-y-1 mb-2">
                {loadout.weapons.map((w: any, idx: number) => (
                  <div key={idx} className="text-[11px] text-slate-300 flex justify-between gap-4">
                    <span className="truncate">{w.count}x {w.name} (A{w.attacks})</span>
                    <span className="text-slate-500 shrink-0 text-right">{w.specialRules?.map((r:any) => r.label).join(', ')}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[10px]">
                <span className="font-semibold text-rose-400">
                  {loadout.offense.toFixed(2)} Dmg
                </span>
                <span className="text-slate-600 px-1">•</span>
                <span className="font-semibold text-sky-400">
                  {(loadout.offense / loadout.cost).toFixed(3)} Eff
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
