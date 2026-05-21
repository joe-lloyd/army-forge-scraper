import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { BalValConfig, BalValResult, LoadoutOption } from '../utils/types';
import { getAllLoadouts } from '../utils/balval';
import { GAME_SYSTEMS } from '../hooks/useArmyList';
import { useCommonRules } from '../hooks/useCommonRules';
import { RuleList } from '@/components/ui/RuleText';

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

  // Resolve game system slug from the URL so we can load that system's
  // common-rules dict for weapon-rule tooltips (Rending, AP, Blast, ...).
  const { systemId } = useParams<{ systemId: string }>();
  const systemSlug = GAME_SYSTEMS.find((s) => s.id === Number(systemId))?.slug;
  const { dict } = useCommonRules(systemSlug);

  const visible = useMemo(() => {
    const base = loadouts.find((l) => l.isBase);
    const best = loadouts.find((l) => l.isBestCombo && !l.isBase);
    // Pin niche winners (most output / melee / ranged) so the markers are
    // always visible even if those loadouts wouldn't otherwise crack the
    // top-6 by combined delta (effectiveness + efficiency).
    const niche = loadouts.filter(
      (l) => !l.isBase && !l.isBestCombo && (l.isMostOutput || l.isMostMelee || l.isMostRanged),
    );
    const nicheIds = new Set(niche.map((l) => l.id));
    const others = loadouts
      .filter((l) => !l.isBase && !l.isBestCombo && !nicheIds.has(l.id))
      .sort((a, b) => b.combinedDelta - a.combinedDelta)
      .slice(0, Math.max(0, 6 - niche.length));
    return [base, best, ...niche, ...others].filter(Boolean) as LoadoutOption[];
  }, [loadouts]);

  return (
    <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-6 animate-in slide-in-from-top-2 fade-in duration-200">
      {balValScore && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Melee" value={balValScore.unitMeleeOffense} eff={balValScore.meleeEfficiency} bar="bg-rose-500" />
            <MiniStat label="Ranged" value={balValScore.unitRangedOffense} eff={balValScore.rangedEfficiency} bar="bg-amber-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="EHP" value={balValScore.effectiveHP} eff={balValScore.defenseEfficiency} bar="bg-emerald-500" />
            <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-3 flex flex-col justify-center">
              <div className="text-[9px] uppercase tracking-wider text-sky-400 font-bold">Best</div>
              <div className="text-lg font-black text-white mt-0.5">{balValScore.unitOffense.toFixed(2)}</div>
            </div>
          </div>
          <KillProbStrip balValScore={balValScore} />
        </section>
      )}

      <section>
        <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-sky-400">
          Weapon Loadouts ({visible.length})
        </span>
        <div className="space-y-3">
          {visible.map(l => (
            <LoadoutRow key={l.id} loadout={l} rulesDict={dict} />
          ))}
        </div>
      </section>
    </div>
  );
}

function KillProbStrip({ balValScore }: { balValScore: BalValResult }) {
  const atk = balValScore.activationsToKill;
  const ptk = balValScore.pointsToKill;
  const erk = balValScore.expectedRoundToKill;
  const erm = balValScore.expectedRoundToMorale;
  return (
    <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-purple-300 font-bold">
          Damage Outcome / Round
        </span>
        <span className="text-[10px] font-mono text-slate-400">
          {Number.isFinite(atk) ? `${atk} act` : '∞ act'}
          {' · '}
          {Number.isFinite(ptk) ? `${ptk.toFixed(0)}pts` : '∞ pts'}
        </span>
      </div>
      <CurveRow label="💀 Kill" curve={balValScore.cumulativeKillProb} expectedRound={erk} colour="kill" />
      <CurveRow label="⚠ Shaken" curve={balValScore.cumulativeMoraleProb} expectedRound={erm} colour="morale" />
      <div className="text-[9px] text-slate-500 italic leading-snug pt-1 border-t border-white/5">
        Kill = target removed. Shaken = at ≤ half HP, forces morale (denies one activation).
        Earlier rounds matter more — killing in R1 denies ~3 activations.
      </div>
    </div>
  );
}

function CurveRow({
  label,
  curve,
  expectedRound,
  colour,
}: {
  label: string;
  curve: [number, number, number, number];
  expectedRound: number;
  colour: 'kill' | 'morale';
}) {
  const captionColour = colour === 'kill' ? 'text-purple-300' : 'text-amber-300';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] uppercase tracking-wider font-bold ${captionColour}`}>{label}</span>
        <span className="text-[9px] font-mono text-slate-500">
          {Number.isFinite(expectedRound) ? `E[round] ≈ ${expectedRound.toFixed(1)}` : 'never in-game'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {curve.map((p, i) => {
          const pct = (p * 100).toFixed(0);
          const intensity = p < 0.1 ? 'text-rose-400' : p < 0.5 ? 'text-amber-300' : p < 0.85 ? 'text-emerald-300' : 'text-sky-300';
          return (
            <div key={i} className="bg-black/20 rounded px-1 py-1 text-center">
              <div className="text-[8px] text-slate-500 uppercase tracking-wide">R{i + 1}</div>
              <div className={`text-sm font-black ${intensity}`}>{pct}%</div>
            </div>
          );
        })}
      </div>
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

function LoadoutRow({
  loadout,
  rulesDict,
}: {
  loadout: LoadoutOption;
  rulesDict?: Record<string, string>;
}) {
  // Two-axis colouring:
  //   Dmg/pt up AND raw Dmg up   → green (strict win)
  //   Dmg/pt down AND raw Dmg down → red (strict loss)
  //   one up, one down             → blue (notable tradeoff — e.g. big damage gain at slightly worse $/dmg)
  //   both within ±2%              → neutral slate
  const baseDmg = loadout.offense - loadout.offenseDelta;
  const dmgRel = baseDmg > 0 ? loadout.offenseDelta / baseDmg : 0;
  const effUp = loadout.efficiencyDelta > 0.02;
  const effDown = loadout.efficiencyDelta < -0.02;
  const dmgUp = dmgRel > 0.02;
  const dmgDown = dmgRel < -0.02;
  const isStrictUp = effUp && dmgUp;
  const isStrictDown = effDown && dmgDown;
  const isTradeoff = !isStrictUp && !isStrictDown && (effUp || effDown || dmgUp || dmgDown);
  const isBest = loadout.isBestCombo;

  let containerClass = 'bg-slate-800/40 border-slate-700/50';
  if (loadout.isBase) containerClass = 'bg-sky-900/20 border-sky-500/30';
  else if (isBest) containerClass = 'bg-amber-500/10 border-amber-400/50';
  else if (isStrictUp) containerClass = 'bg-emerald-500/5 border-emerald-500/30';
  else if (isStrictDown) containerClass = 'bg-rose-500/5 border-rose-500/20';
  else if (isTradeoff) containerClass = 'bg-sky-500/5 border-sky-500/30';

  return (
    <div className={`rounded-xl border p-3 ${containerClass}`}>
      <div className="flex items-start justify-between mb-2 border-b border-white/5 pb-2">
        <div className="text-xs font-bold text-white flex items-center gap-1.5">
          {isBest && <span className="text-amber-400" title="Best combined score (effectiveness + efficiency)">★</span>}
          {loadout.isMostOutput && <span title="Most total attacks (AP wins ties)">💥</span>}
          {loadout.isMostMelee && <span title="Most melee attacks (AP wins ties)">⚔️</span>}
          {loadout.isMostRanged && <span title="Most ranged attacks (AP wins ties)">🎯</span>}
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
              <RuleList rules={w.specialRules || []} specialRulesDict={rulesDict} />
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 pt-1 border-t border-white/5 text-[10px]">
        <span className="font-semibold text-rose-400" title="Expected wounds per activation">
          {loadout.offense.toFixed(2)} Dmg
        </span>
        <span className="text-slate-600">•</span>
        <span className="font-semibold text-sky-400" title="Damage per point spent (efficiency)">
          {(loadout.offense / loadout.state.cost).toFixed(3)} Dmg/pt
        </span>
        <span className="text-slate-600">•</span>
        <span className="font-semibold text-purple-300" title="Chance the configured target is dead by end of round 4">
          💀 {(loadout.killProbByGameEnd * 100).toFixed(0)}% R4 kill
        </span>
        {!loadout.isBase && (
          <>
            <span className="text-slate-600">•</span>
            <span
              className={`font-semibold ${effUp ? 'text-emerald-400' : effDown ? 'text-rose-400' : 'text-slate-400'}`}
              title="Damage / point efficiency vs base"
            >
              {loadout.efficiencyDelta >= 0 ? '+' : ''}
              {(loadout.efficiencyDelta * 100).toFixed(0)}% eff
            </span>
            <span className="text-slate-600">•</span>
            <span
              className={`font-semibold ${dmgUp ? 'text-emerald-400' : dmgDown ? 'text-rose-400' : 'text-slate-400'}`}
              title="Raw expected damage vs base"
            >
              {dmgRel >= 0 ? '+' : ''}
              {(dmgRel * 100).toFixed(0)}% dmg
            </span>
            {isTradeoff && (
              <span className="text-sky-400 text-[9px] font-bold uppercase tracking-wider" title="Tradeoff vs base — one metric up, the other down">
                ⇅ Tradeoff
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
