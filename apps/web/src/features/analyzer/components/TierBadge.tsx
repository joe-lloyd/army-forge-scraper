import type { Tier } from '@/features/explorer/utils/types';

const STYLES: Record<Tier, { text: string; bg: string; ring: string }> = {
  S: { text: 'text-sky-300', bg: 'bg-sky-500/15', ring: 'ring-sky-400/40' },
  A: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-400/40' },
  B: { text: 'text-slate-200', bg: 'bg-slate-500/15', ring: 'ring-slate-400/40' },
  C: { text: 'text-amber-300', bg: 'bg-amber-500/15', ring: 'ring-amber-400/40' },
  D: { text: 'text-rose-300', bg: 'bg-rose-500/15', ring: 'ring-rose-400/40' },
};

interface Props {
  tier: Tier;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZES = {
  sm: 'w-7 h-7 text-sm',
  md: 'w-10 h-10 text-lg',
  lg: 'w-16 h-16 text-3xl',
};

export function TierBadge({ tier, size = 'md', label }: Props) {
  const s = STYLES[tier];
  const sz = SIZES[size];
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span
        className={`flex items-center justify-center font-black rounded-lg ring-1 ${s.bg} ${s.text} ${s.ring} ${sz}`}
      >
        {tier}
      </span>
      {label && (
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</span>
      )}
    </div>
  );
}
