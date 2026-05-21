import { useState, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import type {
  BalValConfig,
  BalValResult,
  LoadoutOption,
  Tier,
} from "../utils/types";
import {
  getAllLoadouts,
  calculateEffectiveHP,
  getHitChance,
  getBlockChance,
  getWeaponAP,
  getDamageMultiplier,
  effectivenessTierAbsolute,
} from "../utils/balval";
import { TIER_THRESHOLDS } from "../utils/types";

// Absolute tier → display value mapping; mirrors balval's TIER_VALUE.
const TIER_VALUE_DISPLAY: Record<Tier, number> = { S: 1, A: 0.75, B: 0.5, C: 0.25, D: 0 };

function tierForPercentile(p: number): Tier {
  if (p >= TIER_THRESHOLDS.S) return 'S';
  if (p >= TIER_THRESHOLDS.A) return 'A';
  if (p >= TIER_THRESHOLDS.B) return 'B';
  if (p >= TIER_THRESHOLDS.C) return 'C';
  return 'D';
}
import { GAME_SYSTEMS } from "../hooks/useArmyList";
import { useCommonRules } from "../hooks/useCommonRules";
import { RuleList } from "@/components/ui/RuleText";

interface UnitDetailSidebarProps {
  selectedUnit: any | null;
  army: any;
  balValScore?: BalValResult;
  balValConfig: BalValConfig;
  isDoubled: boolean;
  onToggleDouble: () => void;
}

const TIER_COLOR: Record<Tier, string> = {
  S: "text-sky-400",
  A: "text-emerald-400",
  B: "text-slate-300",
  C: "text-amber-400",
  D: "text-rose-400",
};

// ---- Tooltip ----
// Hover on desktop, tap-to-toggle on touch.
function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative inline-block w-full"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {children}
      {open && (
        <div className="absolute z-50 right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] max-w-[22rem] bg-slate-950/98 border border-sky-500/40 rounded-lg shadow-2xl shadow-sky-500/10 p-4 text-[11px] text-slate-200 leading-relaxed backdrop-blur-md">
          {content}
        </div>
      )}
    </div>
  );
}

function fmt(n: number, dp = 2): string {
  return n.toFixed(dp);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

// ---- Tooltip content builders ----

function tierTooltip(args: {
  metricName: string;
  formulaLabel: string;
  numerator: { label: string; value: number };
  denominator: { label: string; value: number };
  efficiency: number;
  percentile: number;
  tier: Tier;
}) {
  const {
    metricName,
    formulaLabel,
    numerator,
    denominator,
    efficiency,
    percentile,
    tier,
  } = args;
  const tiers: Array<{ t: Tier; label: string; threshold: number }> = [
    { t: "S", label: "top 10%", threshold: TIER_THRESHOLDS.S },
    { t: "A", label: "top 30%", threshold: TIER_THRESHOLDS.A },
    { t: "B", label: "mid 30%", threshold: TIER_THRESHOLDS.B },
    { t: "C", label: "bot 25%", threshold: TIER_THRESHOLDS.C },
    { t: "D", label: "bot 15%", threshold: TIER_THRESHOLDS.D },
  ];
  return (
    <div className="space-y-2">
      <div className="font-bold text-white">
        {metricName}: <span className={TIER_COLOR[tier]}>{tier}</span>{" "}
        <span className="text-slate-500 font-normal">
          · {pct(percentile)} percentile within army
        </span>
      </div>
      <div className="font-mono text-slate-300 space-y-0.5">
        <div>{formulaLabel}</div>
        <div className="text-slate-400">
          = {numerator.label} / {denominator.label}
        </div>
        <div className="text-slate-400">
          = {fmt(numerator.value)} / {fmt(denominator.value, 0)} ={" "}
          {fmt(efficiency, 4)}
        </div>
      </div>
      <div className="space-y-0.5 pt-2 border-t border-slate-800">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
          Tier thresholds
        </div>
        {tiers.map(({ t, label, threshold }) => (
          <div
            key={t}
            className={`flex justify-between font-mono ${
              t === tier ? `font-bold ${TIER_COLOR[t]}` : "text-slate-500"
            }`}
          >
            <span>
              {t} ({label})
            </span>
            <span>
              ≥ {fmt(threshold * 100, 0)}%{t === tier ? " ← you" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function weaponDmgRows(
  weapons: any[],
  unit: any,
  config: BalValConfig,
  mode: "melee" | "ranged",
) {
  const filtered = weapons.filter((w) =>
    mode === "melee" ? w.range === 0 : w.range > 0,
  );
  const effQual = unit.quality;
  const hit = getHitChance(effQual);
  return filtered.map((w) => {
    const ap = getWeaponAP(w);
    const block = getBlockChance(config.targetDefense, ap);
    const mult = getDamageMultiplier(
      w,
      config.targetDefense,
      config.targetSize,
      config.targetToughness,
      hit,
    );
    const dmg = w.count * w.attacks * hit * (1 - block) * mult;
    return { w, ap, hit, block, mult, dmg, effQual };
  });
}

function dmgPerTurnTooltip(
  mode: "melee" | "ranged",
  weapons: any[],
  unit: any,
  config: BalValConfig,
  total: number,
  efficiency: number,
  cost: number,
) {
  const rows = weaponDmgRows(weapons, unit, config, mode);
  return (
    <div className="space-y-2">
      <div className="font-bold text-white">
        {mode === "melee" ? "Melee" : "Ranged"} Damage / Turn
      </div>
      <div className="font-mono text-slate-300">
        per weapon = count × attacks × hit × (1 − block) × multipliers
      </div>
      {rows.length === 0 ? (
        <div className="text-slate-500 italic">No {mode} weapons.</div>
      ) : (
        <div className="space-y-1 font-mono">
          {rows.map((r, i) => (
            <div key={i} className="border-t border-slate-800/60 pt-1">
              <div className="text-sky-400">
                {r.w.count}× {r.w.name} (A{r.w.attacks}
                {r.ap > 0 && `, AP${r.ap}`})
              </div>
              <div className="text-slate-400 text-[10px] pl-2">
                {r.w.count} × {r.w.attacks} × {fmt(r.hit, 2)} × (1 −{" "}
                {fmt(r.block, 2)}){r.mult !== 1 && ` × ${fmt(r.mult, 2)}`}
              </div>
              <div className="text-emerald-400 text-[10px] pl-2">
                = {fmt(r.dmg)} dmg
              </div>
            </div>
          ))}
          <div className="border-t border-slate-700 pt-1 flex justify-between text-white font-bold">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
          <div className="text-slate-500 text-[10px]">
            Eff = {fmt(total)} / {cost} = {fmt(efficiency, 3)}
          </div>
        </div>
      )}
    </div>
  );
}

interface EHPVariant {
  label: string;
  ap: number;
  deadly: number;
  ehp: number;
  block: number;
  effDef: number;
  damageMult: number;
}

function ehpVariants(unit: any): {
  variants: EHPVariant[];
  tough: number;
  regen: boolean;
  stealth: boolean;
  shielded: boolean;
} {
  let tough = 1;
  let regen = false;
  let stealth = false;
  let shielded = false;
  for (const r of unit.rules || []) {
    if (r.name === "Tough") tough = r.rating || 1;
    if (r.name === "Regeneration") regen = true;
    if (r.name === "Stealth") stealth = true;
    if (r.name === "Shielded") shielded = true;
  }

  function compute(ap: number, deadly: number): EHPVariant {
    // Natural-6-always-succeeds floor lives in getBlockChance.
    const baseDef = unit.defense + (shielded ? -1 : 0);
    const effDef = Math.max(2, baseDef + ap);
    const block = getBlockChance(baseDef, ap);
    let ehp = (unit.size * tough) / Math.max(0.0001, 1 - block);
    if (regen) ehp *= 1.33;
    if (stealth) ehp *= 1.17;
    const damageMult = Math.min(deadly, tough);
    ehp /= damageMult;
    return { label: "", ap, deadly, ehp, block, effDef, damageMult };
  }

  const variants: EHPVariant[] = [
    { ...compute(0, 1), label: "vs AP(0)" },
    { ...compute(4, 1), label: "vs AP(4)" },
    { ...compute(0, 3), label: "vs Deadly(3)" },
    { ...compute(4, 3), label: "vs AP(4)+D(3)" },
  ];

  return { variants, tough, regen, stealth, shielded };
}

function ehpTooltip(unit: any, defEff: number, cost: number) {
  const { variants, tough, regen, stealth, shielded } = ehpVariants(unit);
  const baseEhp = variants[0].ehp;
  return (
    <div className="space-y-2">
      <div className="font-bold text-white">
        Effective HP — by attacker profile
      </div>
      <div className="font-mono text-[10px] text-slate-300">
        EHP = (size × tough) / (1 − block) × modifiers / min(deadly, tough)
      </div>
      <div className="font-mono text-[10px] space-y-0.5">
        <div className="text-slate-400">
          size = {unit.size} · tough = {tough} · defense = {unit.defense}+
          {shielded && " (Shielded)"}
        </div>
        {regen && <div className="text-emerald-400/80">×1.33 Regeneration</div>}
        {stealth && <div className="text-emerald-400/80">×1.17 Stealth</div>}
      </div>
      <div className="space-y-1 pt-1 border-t border-slate-800">
        {variants.map((v) => (
          <div key={v.label} className="font-mono text-[10px]">
            <div className="flex justify-between text-white font-bold">
              <span>{v.label}</span>
              <span>{fmt(v.ehp)}</span>
            </div>
            <div className="text-slate-500 pl-2 text-[9px]">
              block = {pct(v.block)} ({v.effDef}+)
              {v.damageMult > 1 && ` · ÷${v.damageMult} (Deadly cap by Tough)`}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
        Eff = base EHP ({fmt(baseEhp)}) / cost ({cost}) = {fmt(defEff, 3)}
      </div>
    </div>
  );
}

function bestActivationTooltip(
  melee: number,
  ranged: number,
  offense: number,
  cost: number,
) {
  return (
    <div className="space-y-2">
      <div className="font-bold text-white">Best Activation = max(Melee, Ranged)</div>
      <div className="font-mono space-y-0.5">
        <div className="flex justify-between">
          <span className="text-rose-400">Melee</span>
          <span className="text-slate-300">{fmt(melee)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-400">Ranged</span>
          <span className="text-slate-300">{fmt(ranged)}</span>
        </div>
        <div className="border-t border-slate-700 pt-1 flex justify-between text-white font-bold">
          <span>Max</span>
          <span>{fmt(offense)}</span>
        </div>
      </div>
      <div className="text-[10px] text-slate-500">
        cost = {cost}pts · {fmt((offense / cost) * 100, 2)} dmg / 100pts
      </div>
    </div>
  );
}

function dmgCostTooltip(offense: number, cost: number) {
  const value = (offense / cost) * 100;
  return (
    <div className="space-y-2">
      <div className="font-bold text-white">Damage per 100pts</div>
      <div className="font-mono text-slate-300">= (offense / cost) × 100</div>
      <div className="font-mono text-[10px] space-y-0.5">
        <div className="text-slate-400">
          = ({fmt(offense)} / {cost}) × 100
        </div>
        <div className="text-white font-bold flex justify-between pt-1 border-t border-slate-700">
          <span>= {fmt(value, 2)}</span>
        </div>
      </div>
      <div className="text-[10px] text-slate-500 italic">
        How many expected wounds the unit puts out for every 100 points spent on
        it.
      </div>
    </div>
  );
}

export function UnitDetailSidebar({
  selectedUnit,
  army,
  balValScore,
  balValConfig,
  isDoubled,
  onToggleDouble,
}: UnitDetailSidebarProps) {
  // Selection state. Two-piece:
  //   - userSelection: the pill the user explicitly clicked, or null if they
  //     haven't picked one (then we show "base").
  //   - lastUnitId: remembers which unit `userSelection` belongs to so we can
  //     auto-clear it when the unit changes, without an effect.
  // We DON'T sync the selection from `loadouts` changes — sliders for defense
  // / size / tough rebuild loadouts but should never change the user's pill.
  const [userSelection, setUserSelection] = useState<string | null>(null);
  const [lastUnitId, setLastUnitId] = useState<string | undefined>(selectedUnit?.id);
  if (selectedUnit?.id !== lastUnitId) {
    // Render-time reset (the React-19 pattern for "reset state when a prop
    // changes" — sets-during-render are deduped before commit). No useEffect.
    setLastUnitId(selectedUnit?.id);
    setUserSelection(null);
  }

  const { systemId } = useParams<{ systemId: string }>();
  const systemSlug = GAME_SYSTEMS.find((s) => s.id === Number(systemId))?.slug;
  const { dict: commonRulesDict } = useCommonRules(systemSlug);

  // Merge army-book-specific rules (faction rules) over the common-rules dict
  // so book-level rules take precedence if any names collide.
  const rulesDict = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = { ...commonRulesDict };
    for (const r of army?.specialRules || []) {
      if (r?.name && r?.description) out[r.name] = r.description;
    }
    return out;
  }, [commonRulesDict, army?.specialRules]);

  const loadouts = useMemo<LoadoutOption[]>(() => {
    if (!selectedUnit || !army) return [];
    return getAllLoadouts(selectedUnit, army, balValConfig, { isDoubled });
  }, [selectedUnit, army, balValConfig, isDoubled]);

  // The displayed selection is derived, never stored:
  //   - "Most Effective" mode → always the current best-efficiency pill
  //   - Otherwise → the user's explicit pick, fallback "base"
  // Because this is computed each render, slider changes that shift `loadouts`
  // simply re-derive — they can't reset `userSelection`.
  const bestId = loadouts.find((l) => l.isBestCombo)?.id;
  const selectedLoadoutId =
    balValConfig.mostEffective && bestId
      ? bestId
      : (userSelection ?? "base");

  if (!selectedUnit) {
    return (
      <div className="glass-card flex flex-col items-center justify-center p-8 text-center text-slate-400 italic">
        Select a unit to view its armory and mathematical breakdown
      </div>
    );
  }

  const active =
    loadouts.find((l) => l.id === selectedLoadoutId) || loadouts[0];
  const ehp = balValScore?.effectiveHP ?? calculateEffectiveHP(selectedUnit);
  const activeMelee = active?.meleeOffense ?? 0;
  const activeRanged = active?.rangedOffense ?? 0;
  const activeOffense = active?.offense ?? 0;
  const activeCost = active?.state.cost ?? selectedUnit.cost;
  const activeMeleeEff = activeCost > 0 ? activeMelee / activeCost : 0;
  const activeRangedEff = activeCost > 0 ? activeRanged / activeCost : 0;
  const activeDefEff = activeCost > 0 ? ehp / activeCost : 0;

  const baseOffense = loadouts[0]?.offense ?? 0;
  const baseCost = loadouts[0]?.state.cost ?? selectedUnit.cost;

  // Live tier values derived from the ACTIVE loadout, so switching loadout
  // updates the header badges (not just the inline stats).
  //   - Effectiveness: absolute (kill/morale probability + speed). Doesn't
  //     depend on army roster — only on this loadout vs the configured target.
  //   - Damage: percentile-rank ACTIVE efficiency vs the army's roster of
  //     base offenseEfficiency values. Falls back to balValScore tier when
  //     scores can't be derived.
  //   - Survivability: unit-level (eHP), unaffected by loadout choice — keep
  //     balValScore's tier.
  const activeEffEff = activeCost > 0 ? activeOffense / activeCost : 0;
  const liveEffTier: Tier = active
    ? effectivenessTierAbsolute(
        active.killProbByGameEnd,
        active.moraleProbByGameEnd,
        active.expectedRoundToKill,
        active.expectedRoundToMorale,
      )
    : (balValScore?.effectivenessTier ?? 'D');
  const liveEffPct = TIER_VALUE_DISPLAY[liveEffTier];
  const liveDmgPct = balValScore && balValScore.offenseEfficiency > 0
    ? Math.min(1, Math.max(0, activeEffEff / balValScore.offenseEfficiency * balValScore.damagePercentile))
    : (balValScore?.damagePercentile ?? 0);
  const liveDmgTier: Tier = tierForPercentile(liveDmgPct);
  const liveCombinedPct = (liveDmgPct + liveEffPct) / 2;
  const liveCombinedTier: Tier = tierForPercentile(liveCombinedPct);

  return (
    <div className="glass-card flex flex-col sticky top-21 max-h-[calc(100vh-6rem)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-700/50 px-4 py-3 flex flex-col gap-3 bg-slate-900/90 backdrop-blur-md z-10 rounded-t-2xl">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-extrabold text-white truncate">
                {selectedUnit.name}
              </h2>
              {selectedUnit.isOptimized && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/30 shrink-0">
                  Optimized
                </span>
              )}
            </div>
            {(selectedUnit.genericName || isDoubled || selectedUnit.size > 1) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {selectedUnit.genericName && (
                  <span className="text-sm text-slate-400">
                    {selectedUnit.genericName}
                  </span>
                )}
                {(isDoubled || selectedUnit.size > 1) && (
                  <button
                    type="button"
                    onClick={onToggleDouble}
                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 cursor-pointer hover:bg-sky-500/20 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isDoubled}
                      readOnly
                      className="w-3 h-3 rounded border-sky-600 bg-slate-800 text-sky-500 pointer-events-none"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-sky-400 select-none">
                      2x Unit
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {balValScore && (
            <div className="flex flex-col items-end gap-2 shrink-0 ml-3">
              <div className="flex items-center gap-2">
                <Tooltip
                  content={
                    <div className="space-y-2">
                      <div className="font-bold text-white">
                        Overall Rating <span className="text-[9px] text-slate-500 font-normal">(active loadout)</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-300 leading-snug">
                        avg(Dmg/pt percentile within army, Kill% tier value)
                      </div>
                      <div className="font-mono text-[9px] text-slate-500 leading-snug">
                        Kill% is absolute (S=1, A=0.75, B=0.5, C=0.25, D=0) — a unit that can't kill the target stays low regardless of army.
                      </div>
                      <div className="font-mono text-[10px] space-y-0.5 pt-1 border-t border-slate-800">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Dmg/pt percentile</span>
                          <span className="text-white">{(liveDmgPct * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Kill% tier value</span>
                          <span className="text-white">{(liveEffPct * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-700">
                          <span>Combined</span>
                          <span>{(liveCombinedPct * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <TierBadge
                    label="Overall"
                    tier={liveCombinedTier}
                    pct={liveCombinedPct}
                    size="lg"
                    primary
                  />
                </Tooltip>
                <Tooltip
                  content={tierTooltip({
                    metricName: "Damage / Point (active loadout)",
                    formulaLabel: "Dmg/pt = activeOffense / activeCost",
                    numerator: {
                      label: "offense",
                      value: activeOffense,
                    },
                    denominator: { label: "cost", value: activeCost },
                    efficiency: activeEffEff,
                    percentile: liveDmgPct,
                    tier: liveDmgTier,
                  })}
                >
                  <TierBadge
                    label="Dmg/pt"
                    tier={liveDmgTier}
                    pct={liveDmgPct}
                    size="md"
                  />
                </Tooltip>
                <Tooltip
                  content={tierTooltip({
                    metricName: "Survivability Tier",
                    formulaLabel: "Defense Eff = effectiveHP / cost",
                    numerator: { label: "EHP", value: balValScore.effectiveHP },
                    denominator: { label: "cost", value: balValScore.unitCost },
                    efficiency: balValScore.defenseEfficiency,
                    percentile: balValScore.survivabilityPercentile,
                    tier: balValScore.survivabilityTier,
                  })}
                >
                  <TierBadge
                    label="Tough"
                    tier={balValScore.survivabilityTier}
                    pct={balValScore.survivabilityPercentile}
                    size="md"
                  />
                </Tooltip>
                <Tooltip
                  content={
                    <div className="space-y-2">
                      <div className="font-bold text-white">
                        Effectiveness Tier <span className="text-[9px] text-slate-500 font-normal">(active loadout)</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-300 leading-snug">
                        score = Σ round_weight × (kill_marginal + 0.5 × shake_only_marginal) / cost
                      </div>
                      <div className="font-mono text-[9px] text-slate-500 leading-snug">
                        round weights = [4, 3, 2, 1] — R1 kill ≫ R4 kill (denies more activations).
                        Shaken (≤ half HP) ≈ half a kill (denies one activation).
                      </div>
                      <div className="font-mono text-[10px] space-y-0.5 pt-1 border-t border-slate-800">
                        <div className="flex justify-between">
                          <span className="text-purple-300">Kill by R4</span>
                          <span className="text-white">{((active?.killProbByGameEnd ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-amber-300">Shaken by R4</span>
                          <span className="text-white">{((active?.moraleProbByGameEnd ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">E[round to kill]</span>
                          <span className="text-white">{active && Number.isFinite(active.expectedRoundToKill) ? active.expectedRoundToKill.toFixed(1) : '∞'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">E[round to shake]</span>
                          <span className="text-white">{active && Number.isFinite(active.expectedRoundToMorale) ? active.expectedRoundToMorale.toFixed(1) : '∞'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Activations to kill</span>
                          <span className="text-white">{active && Number.isFinite(active.activationsToKill) ? active.activationsToKill : '∞'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Points to kill</span>
                          <span className="text-white">{active && Number.isFinite(active.pointsToKill) ? active.pointsToKill.toFixed(0) : '∞'}</span>
                        </div>
                        <div className="border-t border-slate-700 pt-1 flex justify-between text-white font-bold">
                          <span>Tier value</span>
                          <span>{(liveEffPct * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <TierBadge
                    label="Kill%"
                    tier={liveEffTier}
                    pct={liveEffPct}
                    size="md"
                  />
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Hero damage card */}
        <section>
          <Tooltip
            content={bestActivationTooltip(
              activeMelee,
              activeRanged,
              activeOffense,
              activeCost,
            )}
          >
            <HeroDamageCard
              melee={activeMelee}
              ranged={activeRanged}
              offense={activeOffense}
              cost={activeCost}
            />
          </Tooltip>
        </section>

        {/* Detail stats */}
        {balValScore && active && (
          <section className="grid grid-cols-2 gap-3">
            <Tooltip
              content={dmgPerTurnTooltip(
                "melee",
                active.state.weapons,
                selectedUnit,
                balValConfig,
                activeMelee,
                activeMeleeEff,
                activeCost,
              )}
            >
              <StatCard
                label="Melee Dmg / Turn"
                value={activeMelee}
                eff={activeMeleeEff}
                barColor="bg-rose-500"
                dim={activeMelee < activeRanged}
              />
            </Tooltip>
            <Tooltip
              content={dmgPerTurnTooltip(
                "ranged",
                active.state.weapons,
                selectedUnit,
                balValConfig,
                activeRanged,
                activeRangedEff,
                activeCost,
              )}
            >
              <StatCard
                label="Ranged Dmg / Turn"
                value={activeRanged}
                eff={activeRangedEff}
                barColor="bg-amber-500"
                dim={activeRanged < activeMelee}
              />
            </Tooltip>
            <Tooltip
              content={ehpTooltip(selectedUnit, activeDefEff, activeCost)}
            >
              <EHPMatrixCard unit={selectedUnit} eff={activeDefEff} />
            </Tooltip>
            <Tooltip content={dmgCostTooltip(activeOffense, activeCost)}>
              <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-4 flex flex-col justify-center cursor-help">
                <div className="text-[10px] uppercase tracking-wider text-sky-400 font-bold">
                  Damage / Cost
                </div>
                <div className="text-xl font-black text-white mt-1">
                  {((activeOffense / activeCost) * 100).toFixed(2)}
                </div>
                <div className="text-[10px] text-sky-500/70">
                  per 100pts spent
                </div>
              </div>
            </Tooltip>
          </section>
        )}

        {/* Active loadout description (what's been applied) */}
        {active && (
          <section className="animate-in fade-in duration-300">
            <ApplicationsBlock active={active} />
          </section>
        )}

        {/* Loadout selector */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">
              Loadout Comparison ({loadouts.length})
            </span>
            <span className="text-[10px] text-slate-500">
              Δ vs base · {baseOffense.toFixed(1)}dmg / {baseCost}pts
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <span><span className="text-amber-400">★</span> best dmg/pt</span>
            <span>💥 most attacks</span>
            <span>⚔️ most melee</span>
            <span>🎯 most ranged</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {loadouts.map((l) => (
              <LoadoutPill
                key={l.id}
                loadout={l}
                selected={selectedLoadoutId === l.id}
                onClick={() => setUserSelection(l.id)}
              />
            ))}
          </div>
        </section>

        {/* Armory: full weapon detail for the active loadout */}
        {active && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <ArmoryBreakdown
              active={active}
              unit={selectedUnit}
              balValConfig={balValConfig}
              rulesDict={rulesDict}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function TierBadge({
  label,
  tier,
  pct,
  size = "md",
  primary = false,
}: {
  label: string;
  tier: Tier;
  pct: number;
  size?: "sm" | "md" | "lg";
  primary?: boolean;
}) {
  const color = TIER_COLOR[tier] || "text-slate-400";
  const sizeCls =
    size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-base";
  return (
    <div
      className={`flex flex-col items-center gap-0.5 ${primary ? "" : "opacity-90"}`}
    >
      <span className={`font-black ${color} ${sizeCls} leading-none`}>
        {tier}
      </span>
      <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
        {label} · {(pct * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function HeroDamageCard({
  melee,
  ranged,
  offense,
  cost,
}: {
  melee: number;
  ranged: number;
  offense: number;
  cost: number;
}) {
  const isMelee = melee >= ranged;
  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">
          Best Activation · {isMelee ? "Melee" : "Ranged"}
        </span>
        <span className="text-[10px] text-sky-200/60 italic">max(melee, ranged)</span>
      </div>
      <div className="flex items-end gap-3 mt-2">
        <div className="text-5xl font-black text-white leading-none">
          {offense.toFixed(2)}
        </div>
        <div className="text-xs text-slate-400 pb-1.5">
          expected wounds / turn
        </div>
      </div>
      <div className="mt-3 text-[10px] text-sky-200/70 font-mono">
        {((offense / cost) * 100).toFixed(2)} dmg / 100pts · {cost}pts total
      </div>
    </div>
  );
}

function EHPMatrixCard({ unit, eff }: { unit: any; eff: number }) {
  const { variants } = ehpVariants(unit);
  return (
    <div className="rounded-lg bg-white/5 border border-white/5 p-3 relative overflow-hidden cursor-help h-full">
      <div
        className="absolute top-0 left-0 h-1 bg-emerald-500"
        style={{ width: `${Math.min(100, eff * 1000)}%` }}
      />
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
        Effective HP
      </div>
      <div className="grid grid-cols-2 gap-1">
        {variants.map((v) => (
          <div key={v.label} className="bg-black/20 rounded px-1.5 py-1">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide leading-tight">
              {v.label}
            </div>
            <div className="text-sm font-bold text-white leading-tight">
              {v.ehp.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  eff,
  barColor,
  dim,
}: {
  label: string;
  value: number;
  eff: number;
  barColor: string;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-white/5 border border-white/5 p-4 relative overflow-hidden cursor-help ${dim ? "opacity-50" : ""}`}
    >
      <div
        className={`absolute top-0 left-0 h-1 ${barColor}`}
        style={{ width: `${Math.min(100, eff * 1000)}%` }}
      />
      <div className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-xl font-extrabold text-white mt-1">
        {value.toFixed(2)}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        Eff: {eff.toFixed(3)}
      </div>
    </div>
  );
}

function LoadoutPill({
  loadout,
  selected,
  onClick,
}: {
  loadout: LoadoutOption;
  selected: boolean;
  onClick: () => void;
}) {
  // Two-axis classification vs base:
  //   Dmg/pt better AND raw Dmg better                → green (strict win)
  //   Dmg/pt worse  AND raw Dmg worse                 → red   (strict loss)
  //   one up, one down                                → blue  (notable tradeoff)
  //   both within ±2% of base                         → neutral
  // The combined delta the optimizer uses to pick "best" is still its own thing
  // (★ flag); this colouring is about what the player sees changing.
  const effThr = 0.02;
  const dmgThr = 0.02;
  const baseDmg = loadout.baseEfficiency > 0
    ? loadout.offense - loadout.offenseDelta // = base offense
    : loadout.offense;
  const dmgRel = baseDmg > 0 ? loadout.offenseDelta / baseDmg : 0;
  const effUp = loadout.efficiencyDelta > effThr;
  const effDown = loadout.efficiencyDelta < -effThr;
  const dmgUp = dmgRel > dmgThr;
  const dmgDown = dmgRel < -dmgThr;
  const isStrictUp = effUp && dmgUp;
  const isStrictDown = effDown && dmgDown;
  const isTradeoff = !isStrictUp && !isStrictDown && (effUp || effDown || dmgUp || dmgDown);
  const isBest = loadout.isBestCombo;

  let ringClass = "border-slate-700 bg-slate-800/50 text-slate-300";
  let badgeClass = "text-slate-500";

  if (loadout.isBase) {
    ringClass = "border-slate-600 bg-slate-800/60 text-slate-200";
    badgeClass = "text-slate-400";
  } else if (isStrictUp) {
    ringClass =
      "border-emerald-500/40 bg-emerald-500/5 text-emerald-200 hover:border-emerald-400";
    badgeClass = "text-emerald-400";
  } else if (isStrictDown) {
    ringClass =
      "border-rose-500/30 bg-rose-500/5 text-rose-200/80 hover:border-rose-400";
    badgeClass = "text-rose-400";
  } else if (isTradeoff) {
    ringClass =
      "border-sky-500/40 bg-sky-500/5 text-sky-200 hover:border-sky-400";
    badgeClass = "text-sky-400";
  } else {
    ringClass =
      "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-500";
    badgeClass = "text-slate-400";
  }

  if (selected) {
    ringClass =
      "border-sky-400 bg-sky-500/15 text-white shadow-[0_0_12px_rgba(14,165,233,0.25)]";
  }
  if (isBest) {
    ringClass +=
      " ring-2 ring-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]";
  }

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${ringClass}`}
    >
      <span className="flex items-center gap-1.5 max-w-[180px]">
        {isBest && <span className="text-amber-400" title="Best efficiency (dmg per point)">★</span>}
        {loadout.isMostOutput && <span title="Most total attacks (AP wins ties)">💥</span>}
        {loadout.isMostMelee && <span title="Most melee attacks (AP wins ties)">⚔️</span>}
        {loadout.isMostRanged && <span title="Most ranged attacks (AP wins ties)">🎯</span>}
        <span className="truncate">{loadout.label}</span>
      </span>
      <span
        className={`flex items-center gap-2 text-[10px] font-mono ${badgeClass}`}
      >
        <span>{loadout.state.cost}pt</span>
        <span className="opacity-50">·</span>
        <span>{loadout.offense.toFixed(1)}d</span>
        {!loadout.isBase && (
          <>
            <span className="opacity-50">·</span>
            <span title="Damage / point efficiency vs base">
              {loadout.efficiencyDelta >= 0 ? "+" : ""}
              {(loadout.efficiencyDelta * 100).toFixed(0)}% eff
            </span>
            <span className="opacity-50">·</span>
            <span title="Raw expected damage vs base">
              {dmgRel >= 0 ? "+" : ""}
              {(dmgRel * 100).toFixed(0)}% dmg
            </span>
          </>
        )}
      </span>
    </button>
  );
}

function ApplicationsBlock({ active }: { active: LoadoutOption }) {
  const isDefault = active.applications.length === 0;
  const headingColor = isDefault ? "text-sky-400" : "text-amber-400";
  const containerColor = isDefault
    ? "border-sky-500/20 bg-sky-500/5"
    : "border-amber-500/20 bg-amber-500/5";

  return (
    <div className={`rounded-xl border p-4 ${containerColor}`}>
      <div
        className={`text-[10px] font-bold uppercase tracking-widest ${headingColor} mb-2 flex items-center justify-between`}
      >
        <span>{isDefault ? "Default Loadout" : "Upgrades Applied"}</span>
        <span className="font-mono text-slate-400">
          {active.state.cost}pt total
        </span>
      </div>

      {isDefault ? (
        <ul className="space-y-1">
          {active.state.weapons.map((w: any, i: number) => (
            <li
              key={i}
              className="text-xs text-slate-200 flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {w.count}× {w.name}
              </span>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                A{w.attacks}
                {w.range ? ` · ${w.range}"` : " · melee"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {active.applications.map((a, i) => (
            <li key={i} className="text-xs text-slate-200">
              <div className="font-semibold flex items-center justify-between gap-2">
                <span className="truncate">{a.optionLabel}</span>
                <span className="font-mono text-amber-400 shrink-0">
                  +{a.costApplied}pt
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {a.sectionLabel} · ×{a.quantity}
              </div>
              {a.weaponsRemoved.length > 0 && (
                <div className="text-[10px] text-rose-400/70 mt-0.5">
                  −{" "}
                  {a.weaponsRemoved
                    .map((r) => `${r.count}× ${r.weapon.name}`)
                    .join(", ")}
                </div>
              )}
              {a.weaponsAdded.length > 0 && (
                <div className="text-[10px] text-emerald-400/80 mt-0.5">
                  +{" "}
                  {a.weaponsAdded
                    .map((w) => `${w.count}× ${w.name}`)
                    .join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArmoryBreakdown({
  active,
  unit,
  balValConfig,
  rulesDict,
}: {
  active: LoadoutOption;
  unit: any;
  balValConfig: BalValConfig;
  rulesDict?: Record<string, string>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="bg-white/5 p-4 border-b border-white/5">
        <h4 className="text-sm font-bold text-white mb-3 flex justify-between items-center">
          <span>Armory Breakdown</span>
          <span className="text-[10px] uppercase text-slate-500 tracking-widest">
            {active.label}
          </span>
        </h4>

        <div className="space-y-3">
          {active.state.weapons.map((w: any, idx: number) => {
            const quality = unit.quality;
            const effQual = quality;
            const hitChance = Math.min(
              5 / 6,
              Math.max(1 / 6, (7 - effQual) / 6),
            );

            let ap = 0;
            (w.specialRules || []).forEach((r: any) => {
              if (r.name === "AP") ap = r.rating || 0;
            });
            const effDef = Math.max(
              2,
              Math.min(7, balValConfig.targetDefense + ap),
            );
            const blockChance = Math.max(0, (7 - effDef) / 6);
            const woundChance = hitChance * (1 - blockChance);

            const attacks = w.count * w.attacks;
            const wounds = attacks * woundChance;

            return (
              <div
                key={idx}
                className="p-3 rounded bg-black/20 border border-white/5"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-sky-400">
                    {w.count}x {w.name} (A{w.attacks}
                    {w.range ? `, ${w.range}"` : ""})
                  </span>
                  <span className="text-[10px] font-mono text-rose-400">
                    {wounds.toFixed(2)} Exp Wounds
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[9px] text-slate-500 font-medium uppercase tracking-tight">
                  <div className="flex flex-col">
                    <span>Hit Chance</span>
                    <span className="text-white">
                      {(hitChance * 100).toFixed(0)}%{" "}
                      <span className="opacity-50">({effQual}+)</span>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span>Block Chance</span>
                    <span className="text-white">
                      {(blockChance * 100).toFixed(0)}%{" "}
                      <span className="opacity-50">({effDef}+)</span>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span>Special Rules</span>
                    <span className="text-white truncate">
                      {w.specialRules?.length > 0 ? (
                        <RuleList
                          rules={w.specialRules}
                          specialRulesDict={rulesDict}
                        />
                      ) : (
                        "None"
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 bg-sky-500/5 text-[10px] text-slate-400 italic leading-relaxed">
        * Expected wounds vs target with Defense {balValConfig.targetDefense}+ /
        Toughness {balValConfig.targetToughness} / Size{" "}
        {balValConfig.targetSize}.
      </div>
    </div>
  );
}
