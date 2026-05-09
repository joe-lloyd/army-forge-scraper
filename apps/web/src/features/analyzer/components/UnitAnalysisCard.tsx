import { OPPONENT_PROFILES, type UnitAnalysis, type Tier5 } from '../utils/aggregate';
import { TierBadge } from './TierBadge';

interface Props {
  unit: UnitAnalysis;
}

function fmtRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

const TIER_BG: Record<Tier5, string> = {
  S: 'bg-sky-500/20 ring-sky-400/40',
  A: 'bg-emerald-500/20 ring-emerald-400/40',
  B: 'bg-slate-500/15 ring-slate-400/30',
  C: 'bg-amber-500/15 ring-amber-400/30',
  D: 'bg-rose-500/15 ring-rose-400/30',
};

const TIER_TEXT: Record<Tier5, string> = {
  S: 'text-sky-300',
  A: 'text-emerald-300',
  B: 'text-slate-200',
  C: 'text-amber-300',
  D: 'text-rose-300',
};

export function UnitAnalysisCard({ unit }: Props) {
  const best = OPPONENT_PROFILES.find((p) => p.id === unit.bestProfileId)?.short ?? '-';
  const worst = OPPONENT_PROFILES.find((p) => p.id === unit.worstProfileId)?.short ?? '-';
  const w = unit.weaponSummary;

  // Aggregate overkill notes across profiles, dedupe.
  const overkillSet = new Set<string>();
  for (const p of unit.perProfile) for (const note of p.overkillNotes) overkillSet.add(note);
  const overkillNotes = [...overkillSet].slice(0, 3);

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-base font-bold text-white truncate">{unit.unitName}</h4>
            {unit.isCombined && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40">
                Combined
              </span>
            )}
            {unit.attachedToName && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40">
                Joined → {unit.attachedToName}
              </span>
            )}
            {unit.attachedHeroNames && unit.attachedHeroNames.length > 0 && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/40">
                + {unit.attachedHeroNames.join(', ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
            <span>{unit.cost}pts</span>
            <span className="text-slate-600">·</span>
            <span>Size {unit.size}</span>
            <span className="text-slate-600">·</span>
            <span>EHP {Math.round(unit.effectiveHP)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TierBadge tier={unit.outputTier} size="sm" />
          <TierBadge tier={unit.durabilityTier} size="sm" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {unit.perProfile.map((p) => {
          const profile = OPPONENT_PROFILES.find((tp) => tp.id === p.profileId)!;
          const killPct = Math.round(p.killShare * 100);
          return (
            <div
              key={p.profileId}
              className={`rounded ring-1 p-1.5 text-center ${TIER_BG[p.tier]}`}
              title={`vs ${profile.name}: ${p.expectedWoundsTotal.toFixed(1)}w (${killPct}%) · efficiency ${p.efficiency.toFixed(2)}× fair share`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300 truncate">
                  {profile.short}
                </span>
                <span className={`text-xs font-black ${TIER_TEXT[p.tier]}`}>{p.tier}</span>
              </div>
              <div className="text-sm font-extrabold text-white leading-tight mt-0.5">
                {p.expectedWoundsTotal.toFixed(1)}w
              </div>
              <div className="text-[9px] text-slate-400 font-mono">{p.efficiency.toFixed(2)}×</div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[10px] flex-wrap">
        <Tag label="Melee" value={w.meleeShots.toFixed(0)} />
        <Tag label="Ranged" value={w.rangedShots.toFixed(0)} />
        {w.meleeBlastShotsMax > 0 && (
          <Tag label="Blast(M)" value={fmtRange(w.meleeBlastShotsMin, w.meleeBlastShotsMax)} tone="emerald" />
        )}
        {w.rangedBlastShotsMax > 0 && (
          <Tag label="Blast(R)" value={fmtRange(w.rangedBlastShotsMin, w.rangedBlastShotsMax)} tone="emerald" />
        )}
        {w.meleeDeadlyShotsMax > 0 && (
          <Tag label="Deadly(M)" value={fmtRange(w.meleeDeadlyShotsMin, w.meleeDeadlyShotsMax)} tone="emerald" />
        )}
        {w.rangedDeadlyShotsMax > 0 && (
          <Tag label="Deadly(R)" value={fmtRange(w.rangedDeadlyShotsMin, w.rangedDeadlyShotsMax)} tone="emerald" />
        )}
        {w.hasRending && <Tag label="Rending" value="✓" tone="emerald" />}
        <Tag label="Best" value={best} tone="sky" />
        <Tag label="Worst" value={worst} tone="rose" />
      </div>

      {overkillNotes.length > 0 && (
        <div className="border-t border-slate-700/40 pt-2 -mx-1 px-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mb-1">
            Overkill notes
          </p>
          <ul className="space-y-0.5">
            {overkillNotes.map((n, i) => (
              <li key={i} className="text-[10px] text-rose-200/80 font-mono leading-tight">
                ↯ {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tag({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'sky' | 'rose';
}) {
  const tones = {
    slate: 'border-slate-700/50 text-slate-300',
    emerald: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/5',
    sky: 'border-sky-500/30 text-sky-300 bg-sky-500/5',
    rose: 'border-rose-500/30 text-rose-300 bg-rose-500/5',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 border font-mono ${tones[tone]}`}>
      <span className="opacity-60 mr-1">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
