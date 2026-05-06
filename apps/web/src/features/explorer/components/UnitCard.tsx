import type { BalValResult, BalValConfig, Tier } from '../utils/types';
import { UnitCardDetails } from './UnitCardDetails';

interface UnitCardProps {
  unit: any;
  army: any;
  isSelected: boolean;
  onSelect: (unit: any) => void;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
  isDoubled: boolean;
}

const TIER_STYLES: Record<Tier | 'none', { text: string; border: string; bg: string; icon: string }> = {
  S: { text: 'text-sky-400', border: 'border-sky-400/50', bg: 'bg-sky-500/10', icon: '✦' },
  A: { text: 'text-emerald-400', border: 'border-emerald-400/50', bg: 'bg-emerald-500/10', icon: '↑' },
  B: { text: 'text-slate-300', border: 'border-slate-600/50', bg: 'bg-slate-500/10', icon: '→' },
  C: { text: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-500/10', icon: '↓' },
  D: { text: 'text-rose-400', border: 'border-rose-500/50', bg: 'bg-rose-500/10', icon: '✕' },
  none: { text: 'text-slate-400', border: 'border-white/10', bg: 'bg-white/5', icon: '-' },
};

function tierStyle(t?: Tier) {
  return TIER_STYLES[t ?? 'none'];
}

export function UnitCard({ unit, army, isSelected, onSelect, balValScore, balValConfig, isDoubled }: UnitCardProps) {
  const dmg = tierStyle(balValScore?.damageTier);
  const surv = tierStyle(balValScore?.survivabilityTier);

  return (
    <div
      className={`group w-full text-left glass-card p-4 transition-all duration-200 ${
        isSelected
          ? `shadow-[0_0_20px_rgba(255,255,255,0.1)] border-white/40 ${dmg.bg}`
          : `hover:border-white/20 hover:shadow-[0_0_16px_rgba(255,255,255,0.05)] ${dmg.border}`
      }`}
    >
      <button onClick={() => onSelect(unit)} className="w-full flex flex-col gap-3 outline-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="flex items-center gap-2 min-w-0">
            {balValScore && (
              <div className="flex items-center gap-1 shrink-0">
                <span
                  title={`Damage tier (top ${(balValScore.damagePercentile * 100).toFixed(0)}%)`}
                  className={`flex items-center justify-center w-7 h-7 rounded text-sm font-black ${dmg.bg} ${dmg.text} ring-1 ring-rose-500/20`}
                >
                  {balValScore.damageTier}
                </span>
                <span
                  title={`Survivability tier (top ${(balValScore.survivabilityPercentile * 100).toFixed(0)}%)`}
                  className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${surv.bg} ${surv.text} ring-1 ring-emerald-500/20`}
                >
                  {balValScore.survivabilityTier}
                </span>
              </div>
            )}
            <h4 className="text-base font-bold text-white leading-snug truncate">{unit.name}</h4>
          </div>
          <div className="flex items-center gap-3">
            <span className={`shrink-0 font-bold text-sm ${dmg.text}`}>{unit.cost}pts</span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform duration-200 lg:hidden ${isSelected ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-300 w-full">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Size: {unit.size}</span>
            <span className="text-slate-600">•</span>
            <span>Q{unit.quality}+</span>
            <span className="text-slate-600">•</span>
            <span>D{unit.defense}+</span>
          </div>
          {balValScore && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono">
              <span className="text-rose-400" title="Expected damage / turn">
                ⚔ {balValScore.unitOffense.toFixed(1)}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400" title="Effective HP">
                ♥ {balValScore.effectiveHP.toFixed(0)}
              </span>
            </div>
          )}
        </div>
      </button>

      <div className="block lg:hidden">
        {isSelected && (
          <UnitCardDetails
            unit={unit}
            army={army}
            balValScore={balValScore}
            balValConfig={balValConfig}
            isDoubled={isDoubled}
          />
        )}
      </div>
    </div>
  );
}
