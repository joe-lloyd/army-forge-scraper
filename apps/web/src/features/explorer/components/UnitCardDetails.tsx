import { useMemo } from 'react';
import type { BalValConfig, BalValResult, LoadoutOption } from '../utils/types';
import { getAllLoadouts } from '../utils/balval';

interface UnitCardDetailsProps {
  unit: any;
  army: any;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
  isDoubled: boolean;
}

export function UnitCardDetails({
  unit,
  army,
  balValScore,
  balValConfig,
  isDoubled,
}: UnitCardDetailsProps) {
  const loadouts = useMemo<LoadoutOption[]>(
    () => getAllLoadouts(unit, army, balValConfig, { isDoubled }),
    [unit, army, balValConfig, isDoubled],
  );

  const visible = useMemo(() => {
    const base = loadouts.find(l => l.isBase);
    const best = loadouts.find(l => l.isBestCombo && !l.isBase);
    const others = loadouts
      .filter(l => !l.isBase && !l.isBestCombo)
      .sort((a, b) => b.efficiencyDelta - a.efficiencyDelta)
      .slice(0, 6);
    return [base, best, ...others].filter(Boolean) as LoadoutOption[];
  }, [loadouts]);

  return (
    <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-6 animate-in slide-in-from-top-2 fade-in duration-200">
      {balValScore && (
        <section className="space-y-3">
          {balValConfig.assault && balValScore.unitMeleeOffense > 0 && balValScore.unitRangedOffense > 0 && (
            <div className="rounded-lg border border-purple-400/40 bg-gradient-to-br from-purple-600/15 via-rose-500/10 to-amber-500/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 rounded bg-purple-400/20 text-purple-200 text-[9px] font-black uppercase tracking-widest border border-purple-400/40">
                  ⚔+🔫 Assault
                </span>
                <span className="text-[9px] text-purple-200/70 italic">
                  Combined activation
                </span>
              </div>
              <div className="text-2xl font-black text-white">{balValScore.unitOffense.toFixed(2)}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                <span className="text-rose-400">{balValScore.unitMeleeOffense.toFixed(1)} melee</span>
                {' + '}
                <span className="text-amber-400">{balValScore.unitRangedOffense.toFixed(1)} ranged</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Melee" value={balValScore.unitMeleeOffense} eff={balValScore.meleeEfficiency} bar="bg-rose-500" />
            <MiniStat label="Ranged" value={balValScore.unitRangedOffense} eff={balValScore.rangedEfficiency} bar="bg-amber-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="EHP" value={balValScore.effectiveHP} eff={balValScore.defenseEfficiency} bar="bg-emerald-500" />
            <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-3 flex flex-col justify-center">
              <div className="text-[9px] uppercase tracking-wider text-sky-400 font-bold">
                {balValConfig.assault ? 'Combined' : 'Best'}
              </div>
              <div className="text-lg font-black text-white mt-0.5">{balValScore.unitOffense.toFixed(2)}</div>
            </div>
          </div>
        </section>
      )}

      <section>
        <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">
          Weapon Loadouts ({visible.length})
        </span>
        <div className="space-y-3">
          {visible.map(l => (
            <LoadoutRow key={l.id} loadout={l} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  eff,
  bar,
}: {
  label: string;
  value: number;
  eff: number;
  bar: string;
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3 relative overflow-hidden">
      <div className={`absolute top-0 left-0 h-1 ${bar}`} style={{ width: `${Math.min(100, eff * 1000)}%` }} />
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-extrabold text-white mt-0.5">{value.toFixed(2)}</div>
    </div>
  );
}

function LoadoutRow({ loadout }: { loadout: LoadoutOption }) {
  const isUp = loadout.efficiencyDelta > 0.02;
  const isDown = loadout.efficiencyDelta < -0.02;
  const isBest = loadout.isBestCombo;

  let containerClass = 'bg-slate-800/40 border-slate-700/50';
  if (loadout.isBase) containerClass = 'bg-sky-900/20 border-sky-500/30';
  else if (isBest) containerClass = 'bg-amber-500/10 border-amber-400/50';
  else if (isUp) containerClass = 'bg-emerald-500/5 border-emerald-500/30';
  else if (isDown) containerClass = 'bg-rose-500/5 border-rose-500/20';

  return (
    <div className={`rounded-xl border p-3 ${containerClass}`}>
      <div className="flex items-start justify-between mb-2 border-b border-white/5 pb-2">
        <div className="text-xs font-bold text-white flex items-center gap-1.5">
          {isBest && <span className="text-amber-400">★</span>}
          {loadout.label}
        </div>
        <div className="text-xs font-black text-sky-400">{loadout.state.cost}pts</div>
      </div>

      <div className="space-y-1 mb-2">
        {loadout.state.weapons.map((w: any, idx: number) => (
          <div key={idx} className="text-[11px] text-slate-300 flex justify-between gap-4">
            <span className="truncate">
              {w.count}x {w.name} (A{w.attacks})
            </span>
            <span className="text-slate-500 shrink-0 text-right">
              {w.specialRules?.map((r: any) => r.label).join(', ')}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[10px]">
        <span className="font-semibold text-rose-400">{loadout.offense.toFixed(2)} Dmg</span>
        <span className="text-slate-600 px-1">•</span>
        <span className="font-semibold text-sky-400">
          {(loadout.offense / loadout.state.cost).toFixed(3)} Eff
        </span>
        {!loadout.isBase && (
          <>
            <span className="text-slate-600 px-1">•</span>
            <span
              className={`font-semibold ${
                isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {loadout.efficiencyDelta >= 0 ? '+' : ''}
              {(loadout.efficiencyDelta * 100).toFixed(0)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}
