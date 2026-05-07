import { THREAT_PROFILES, type ArmyAnalysis } from '../utils/aggregate';
import { TierBadge } from './TierBadge';

interface Props {
  analysis: ArmyAnalysis;
}

export function ArmyStatsCard({ analysis }: Props) {
  const { allComers, perProfile } = analysis;
  const apTotal = allComers.apCoverage.total || 1;
  const pct = (n: number) => `${Math.round((n / apTotal) * 100)}%`;

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-2">
              All-Comers Rating
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-1">{analysis.listName}</h2>
            <p className="text-sm text-slate-400">
              {analysis.squadCount} squads
              {analysis.heroCount > 0 && ` (incl. ${analysis.heroCount} hero${analysis.heroCount === 1 ? '' : 'es'})`}
              {' · '}
              {analysis.totalPoints} / {analysis.pointsLimit ?? analysis.totalPoints} pts
              {' · '}
              EHP {Math.round(analysis.totalEffectiveHP)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <TierBadge tier={analysis.outputTier} size="md" label="Output" />
            <TierBadge tier={analysis.durabilityTier} size="md" label="Durability" />
            <TierBadge tier={analysis.coverageTier} size="md" label="Coverage" />
            <div className="w-px h-12 bg-slate-700/50 mx-2" />
            <TierBadge tier={analysis.overallTier} size="lg" label="Overall" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-4">
          Output vs Threat Profile
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {perProfile.map((p) => {
            const profile = THREAT_PROFILES.find((tp) => tp.id === p.profileId);
            return (
              <div key={p.profileId} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    {profile?.name}
                  </span>
                  <TierBadge tier={p.tier} size="sm" />
                </div>
                <div className="text-xl font-extrabold text-white">{p.totalDamage.toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">
                  {p.damagePerPoint.toFixed(3)} dmg/pt
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-tight">{profile?.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-4">
          Output Mix
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Melee + Ranged totals = full army attack output. Blast / Deadly are subsets within each
          mode (min vs hardest target · max vs softest).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <OutputColumn
            label="Melee"
            tone="rose"
            totalMin={allComers.totalMeleeShots}
            totalMax={allComers.totalMeleeShotsMax}
            blastMin={allComers.totalMeleeBlastMin}
            blastMax={allComers.totalMeleeBlastMax}
            deadlyMin={allComers.totalMeleeDeadlyMin}
            deadlyMax={allComers.totalMeleeDeadlyMax}
          />
          <OutputColumn
            label="Ranged"
            tone="sky"
            totalMin={allComers.totalRangedShots}
            totalMax={allComers.totalRangedShotsMax}
            blastMin={allComers.totalRangedBlastMin}
            blastMax={allComers.totalRangedBlastMax}
            deadlyMin={allComers.totalRangedDeadlyMin}
            deadlyMax={allComers.totalRangedDeadlyMax}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-4">
            AP Coverage
          </h3>
          <div className="space-y-2">
            {[
              { k: 'AP 0', v: allComers.apCoverage.ap0, color: 'bg-slate-500' },
              { k: 'AP 1', v: allComers.apCoverage.ap1, color: 'bg-amber-500' },
              { k: 'AP 2', v: allComers.apCoverage.ap2, color: 'bg-orange-500' },
              { k: 'AP 3+', v: allComers.apCoverage.ap3plus, color: 'bg-rose-500' },
            ].map((row) => (
              <div key={row.k} className="flex items-center gap-3 text-xs">
                <span className="w-12 font-mono font-bold text-slate-300">{row.k}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${row.color}`}
                    style={{ width: `${(row.v / apTotal) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-slate-400">
                  {row.v.toFixed(0)} ({pct(row.v)})
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-700/50">
            <Stat label="Blast" value={allComers.blastSourceCount} ok={allComers.blastSourceCount > 0} />
            <Stat label="Deadly" value={allComers.deadlySourceCount} ok={allComers.deadlySourceCount > 0} />
            <Stat label="Rending" value={allComers.rendingSourceCount} ok={allComers.rendingSourceCount > 0} />
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-4">
            Gaps & Notes
          </h3>
          {allComers.gaps.length === 0 ? (
            <p className="text-sm text-emerald-300 flex items-center gap-2">
              <span className="text-lg">✓</span> No major gaps detected — this list is well-rounded.
            </p>
          ) : (
            <ul className="space-y-2">
              {allComers.gaps.map((g, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2"
                >
                  <span className="text-amber-400 mt-0.5">⚠</span>
                  <span className="leading-snug">{g}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: number; ok: boolean }) {
  return (
    <div className={`rounded-lg border p-2 text-center ${ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/50 bg-slate-900/40'}`}>
      <div className={`text-lg font-extrabold ${ok ? 'text-emerald-300' : 'text-slate-500'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</div>
    </div>
  );
}

const TONE_STYLES: Record<'rose' | 'sky' | 'emerald', { text: string; ring: string; bg: string; bar: string }> = {
  rose: { text: 'text-rose-300', ring: 'ring-rose-400/40', bg: 'bg-rose-500/10', bar: 'bg-rose-500' },
  sky: { text: 'text-sky-300', ring: 'ring-sky-400/40', bg: 'bg-sky-500/10', bar: 'bg-sky-500' },
  emerald: { text: 'text-emerald-300', ring: 'ring-emerald-400/40', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
};

function fmtRange(min: number, max: number): string {
  if (max === 0) return '0';
  return min === max ? `${min}` : `${min}–${max}`;
}

function OutputColumn({
  label,
  tone,
  totalMin,
  totalMax,
  blastMin,
  blastMax,
  deadlyMin,
  deadlyMax,
}: {
  label: string;
  tone: 'rose' | 'sky';
  totalMin: number;
  totalMax: number;
  blastMin: number;
  blastMax: number;
  deadlyMin: number;
  deadlyMax: number;
}) {
  const t = TONE_STYLES[tone];
  const blastShare = totalMax > 0 ? Math.round((blastMax / totalMax) * 100) : 0;
  const deadlyShare = totalMax > 0 ? Math.round((deadlyMax / totalMax) * 100) : 0;
  const isRange = totalMax > totalMin;
  return (
    <div className={`rounded-lg ring-1 ${t.ring} ${t.bg} p-4`}>
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <span className={`text-xs uppercase tracking-widest font-bold ${t.text} shrink-0`}>{label}</span>
        <div className="text-right leading-none">
          <div className="text-3xl font-extrabold text-white">
            {isRange ? `${totalMin}–${totalMax}` : totalMin}
          </div>
          {isRange && (
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
              raw → max
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <SubStat label="Blast" min={blastMin} max={blastMax} share={blastShare} barColor={t.bar} />
        <SubStat label="Deadly" min={deadlyMin} max={deadlyMax} share={deadlyShare} barColor={t.bar} />
      </div>
    </div>
  );
}

function SubStat({
  label,
  min,
  max,
  share,
  barColor,
}: {
  label: string;
  min: number;
  max: number;
  share: number;
  barColor: string;
}) {
  const empty = max === 0;
  return (
    <div className={`flex items-center gap-2 text-xs ${empty ? 'opacity-40' : ''}`}>
      <span className="w-14 font-bold text-slate-300">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${share}%` }} />
      </div>
      <span className="w-20 text-right font-mono text-slate-200">{fmtRange(min, max)}</span>
      <span className="w-10 text-right font-mono text-slate-500 text-[10px]">{empty ? '—' : `≤${share}%`}</span>
    </div>
  );
}
