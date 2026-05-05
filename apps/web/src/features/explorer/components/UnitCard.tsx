import type { BalValResult, BalValConfig } from '../utils/types';
import { UnitCardDetails } from './UnitCardDetails';

interface UnitCardProps {
  unit: any;
  army: any;
  isSelected: boolean;
  onSelect: (unit: any) => void;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
}

export function UnitCard({ unit, army, isSelected, onSelect, balValScore, balValConfig }: UnitCardProps) {

  const getTierStyles = (tier: string | undefined) => {
    switch (tier) {
      case 'S': return { text: 'text-sky-400', border: 'border-sky-400/50', icon: '✦', bg: 'bg-sky-500/10' };
      case 'A': return { text: 'text-emerald-400', border: 'border-emerald-400/50', icon: '↑', bg: 'bg-emerald-500/10' };
      case 'B': return { text: 'text-slate-300', border: 'border-slate-600/50', icon: '→', bg: 'bg-slate-500/10' };
      case 'C': return { text: 'text-amber-400', border: 'border-amber-500/50', icon: '↓', bg: 'bg-amber-500/10' };
      case 'D': return { text: 'text-rose-400', border: 'border-rose-500/50', icon: '✕', bg: 'bg-rose-500/10' };
      default: return { text: 'text-slate-400', border: 'border-white/10', icon: '-', bg: 'bg-white/5' };
    }
  };

  const tierStyle = getTierStyles(balValScore?.tier);

  return (
    <div
      className={`group w-full text-left glass-card p-4 transition-all duration-200 ${
        isSelected
          ? `shadow-[0_0_20px_rgba(255,255,255,0.1)] border-white/40 ${tierStyle.bg}`
          : `hover:border-white/20 hover:shadow-[0_0_16px_rgba(255,255,255,0.05)] ${tierStyle.border}`
      }`}
    >
      <button 
        onClick={() => onSelect(unit)}
        className="w-full flex flex-col gap-3 outline-none"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="flex items-center gap-2">
            {balValScore && (
              <span className={`shrink-0 flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${tierStyle.bg} ${tierStyle.text}`}>
                {balValScore.tier} {tierStyle.icon}
              </span>
            )}
            <h4 className="text-base font-bold text-white leading-snug">
              {unit.name}
            </h4>
          </div>
          <div className="flex items-center gap-3">
            <span className={`shrink-0 font-bold text-sm ${tierStyle.text}`}>{unit.cost}pts</span>
            {/* Arrow indicator for mobile accordion */}
            <svg 
              className={`w-5 h-5 text-slate-400 transition-transform duration-200 lg:hidden ${isSelected ? 'rotate-180' : ''}`} 
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 text-xs text-slate-300 w-full">
          <span className="font-semibold text-white">Size: {unit.size}</span>
          <span className="text-slate-600">•</span>
          <span>Qua: {unit.quality}+</span>
          <span className="text-slate-600">•</span>
          <span>Def: {unit.defense}+</span>
        </div>
      </button>

      {/* Accordion Content - Only visible on mobile when selected */}
      <div className="block lg:hidden">
        {isSelected && (
          <UnitCardDetails 
            unit={unit} 
            army={army} 
            balValScore={balValScore} 
            balValConfig={balValConfig} 
          />
        )}
      </div>
    </div>
  );
}
