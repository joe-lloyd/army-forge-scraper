import { THREAT_PROFILES, type UnitAnalysis } from '../utils/aggregate';
import { TierBadge } from './TierBadge';

interface Props {
  unit: UnitAnalysis;
}

function fmtRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

export function UnitAnalysisCard({ unit }: Props) {
  const best = THREAT_PROFILES.find((p) => p.id === unit.bestProfileId)?.name ?? '-';
  const worst = THREAT_PROFILES.find((p) => p.id === unit.worstProfileId)?.name ?? '-';
  const w = unit.weaponSummary;

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

      <div className="grid grid-cols-5 gap-1">
        {unit.perProfile.map((p) => {
          const profile = THREAT_PROFILES.find((tp) => tp.id === p.profileId);
          const intensity = Math.min(1, p.efficiency / 0.6);
          return (
            <div
              key={p.profileId}
              className="rounded border border-slate-700/40 p-1.5 text-center"
              title={`${profile?.name}: ${p.totalOffense.toFixed(2)} dmg, ${p.efficiency.toFixed(3)} dmg/pt`}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-tight truncate"
                style={{ color: `rgba(56, 189, 248, ${0.4 + intensity * 0.6})` }}
              >
                {profile?.name.replace('.', '')}
              </div>
              <div className="text-sm font-extrabold text-white">{p.totalOffense.toFixed(1)}</div>
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
    </div>
  );
}

function Tag({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'sky' | 'rose' }) {
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
