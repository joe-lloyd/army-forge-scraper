import { Link } from "react-router-dom";
import { ArrowLeft, Calculator, Shield, Target, Crosshair } from "lucide-react";

export default function BalValExplanationPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="sticky top-0 z-20 border-b border-slate-700 bg-slate-900/80 p-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Math-Hammer (BalVal) System
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-12 p-4 py-8 sm:p-8">
        <section className="space-y-4">
          <p className="text-lg leading-relaxed text-slate-300">
            The BalVal (Balance Validation) system is a mathematical engine designed to estimate the real-world efficiency of One Page Rules (OPR) units by simulating combat probabilities. It calculates two main metrics: <strong className="text-white">Offensive Efficiency</strong> and <strong className="text-white">Defensive Efficiency</strong>, which are combined into a single <strong className="text-white">BalVal Score</strong>.
          </p>
        </section>

        {/* Offensive Calculations */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-700 pb-2">
            <Target className="h-6 w-6 text-red-400" />
            <h2 className="text-2xl font-semibold text-white">1. Offensive Calculations</h2>
          </div>
          <p className="text-slate-400">
            Offensive efficiency measures how much raw damage a unit is expected to output per turn, adjusted for the targets it is shooting at or hitting.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-medium text-white">
                <Crosshair className="h-5 w-5 text-red-400" />
                Hit Chance
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                Hit chance is purely based on the attacker's Quality rating. OPR uses D6 dice.
              </p>
              <div className="rounded bg-slate-900 p-3 font-mono text-sm text-slate-300">
                Hit Chance = (7 - Quality) / 6
              </div>
              <p className="mt-3 text-xs italic text-slate-500">
                Example: Quality 4+ means rolling 4, 5, or 6. (7 - 4) / 6 = 50%
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-medium text-white">
                <Shield className="h-5 w-5 text-blue-400" />
                Block Chance
              </h3>
              <p className="mb-4 text-sm text-slate-400">
                Depends on the defender's Defense minus the attacker's AP (capped between 2+ and 7+).
              </p>
              <div className="rounded bg-slate-900 p-3 font-mono text-sm text-slate-300">
                Eff. Def = min(7, max(2, Def + AP))<br/>
                Block = (7 - Eff. Def) / 6
              </div>
              <p className="mt-3 text-xs italic text-slate-500">
                Example: Def 3+ vs AP(2) = Eff Def 5+. Block = 33%
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
            <h3 className="mb-3 text-lg font-medium text-white">Damage Multipliers (Special Rules)</h3>
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-400">
              <li><strong className="text-slate-300">Deadly(X):</strong> Multiplies damage by <code className="text-xs text-amber-400">min(X, Target Toughness)</code>.</li>
              <li><strong className="text-slate-300">Blast(X):</strong> Multiplies damage by <code className="text-xs text-amber-400">min(X, Target Size)</code>.</li>
              <li><strong className="text-slate-300">Reliable:</strong> Re-roll 1s. Mathematically adds <code className="text-xs text-amber-400">~16.7%</code> to total hits.</li>
              <li><strong className="text-slate-300">Rending:</strong> Ignores armor on a 6. Treated analytically as ignoring the target's block chance entirely.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-5">
            <h3 className="mb-2 text-lg font-medium text-red-200">Total Weapon Offense</h3>
            <p className="mb-3 text-sm text-red-200/70">The total expected damage of a weapon is calculated as:</p>
            <div className="rounded bg-slate-900/80 p-4 font-mono text-sm text-red-300">
              Attacks × Hit Chance × (1 - Block Chance) × Multipliers
            </div>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 via-rose-900/10 to-amber-900/10 p-5">
            <h3 className="mb-2 text-lg font-medium text-purple-200">Assault Action — Combined Attack</h3>
            <p className="mb-3 text-sm text-purple-200/80">
              By default a unit's <strong>Total Offense</strong> is <code className="text-amber-300">max(melee, ranged)</code> — it can only do one in a turn.
              When the <strong>Assault</strong> action is toggled on, the unit moves into engagement and fires <em>both</em> melee and ranged in the same activation, but takes a <strong className="text-rose-300">-1 to hit</strong> penalty on every attack.
            </p>
            <div className="rounded bg-slate-900/80 p-4 font-mono text-sm text-purple-300">
              Total Offense (Assault) = Melee + Ranged · all hits at Quality + 1
            </div>
            <p className="mt-3 text-xs italic text-purple-300/70">
              Hybrid units (e.g. Witches with pistol + CCW) gain a lot from Assault; pure-shooting units with no melee usually lose damage.
            </p>
          </div>
        </section>

        {/* Defensive Calculations */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-700 pb-2">
            <Shield className="h-6 w-6 text-blue-400" />
            <h2 className="text-2xl font-semibold text-white">2. Defensive Calculations</h2>
          </div>
          <p className="text-slate-400">
            Defensive efficiency is measured as <strong className="text-white">Effective Health Points (EHP)</strong>. This is how many "raw hits" from an AP(0) weapon it takes to completely destroy the unit.
          </p>

          <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
            <h3 className="mb-3 text-lg font-medium text-white">Base EHP</h3>
            <p className="mb-4 text-sm text-slate-400">
              Base EHP combines the unit's model count (Size), its wounds per model (Tough), and its armor (Defense).
            </p>
            <div className="rounded bg-slate-900 p-3 font-mono text-sm text-slate-300">
              Base EHP = (Size × Tough) / (1 - Block Chance)
            </div>
            <p className="mt-3 text-xs italic text-slate-500">
              Example: A unit of 5 models, Tough 1, Defense 4+ (50% block). EHP = (5 × 1) / (1 - 0.5) = 10 raw hits to kill.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
            <h3 className="mb-3 text-lg font-medium text-white">Defensive Special Rules</h3>
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-400">
              <li><strong className="text-slate-300">Regeneration:</strong> Ignore wounds on 5+. Increases EHP by roughly <code className="text-xs text-blue-400">33%</code>.</li>
              <li><strong className="text-slate-300">Stealth:</strong> Enemies get -1 to hit. Increases EHP by roughly <code className="text-xs text-blue-400">17%</code>.</li>
              <li><strong className="text-slate-300">Shielded:</strong> Enemies get -1 to AP, mathematically treated as +1 Defense in the base EHP calculation.</li>
            </ul>
          </div>
        </section>

        {/* Tiers */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-700 pb-2">
            <Calculator className="h-6 w-6 text-purple-400" />
            <h2 className="text-2xl font-semibold text-white">3. Tiers — Damage & Survivability</h2>
          </div>
          <p className="text-slate-400">
            Each unit gets two tier grades, ranked separately within the army:
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-rose-700/40 bg-rose-950/20 p-5">
              <h3 className="mb-2 text-lg font-medium text-rose-200">Damage Tier</h3>
              <div className="rounded bg-slate-900/80 p-3 font-mono text-xs text-rose-300 mb-3">
                Damage Eff = Total Offense / Cost
              </div>
              <p className="text-sm text-rose-200/70">
                Percentile rank of <em>damage-per-point</em> across every unit in the army. Units that kill the most for their cost climb to <strong className="text-sky-300">S</strong>.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-5">
              <h3 className="mb-2 text-lg font-medium text-emerald-200">Survivability Tier</h3>
              <div className="rounded bg-slate-900/80 p-3 font-mono text-xs text-emerald-300 mb-3">
                Defense Eff = Effective HP / Cost
              </div>
              <p className="text-sm text-emerald-200/70">
                Percentile rank of <em>EHP-per-point</em>. A small Tough(6) hero and a 10-strong horde can both grade highly here.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5">
            <h3 className="mb-2 text-lg font-medium text-white">Tier thresholds</h3>
            <p className="mb-3 text-sm text-slate-400">
              Tiers are assigned by percentile within the current army (so an "A" in one army is not the same as an "A" in another):
            </p>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <Cell tier="S" pct="Top 10%" color="text-sky-400" />
              <Cell tier="A" pct="Top 30%" color="text-emerald-400" />
              <Cell tier="B" pct="Mid 30%" color="text-slate-300" />
              <Cell tier="C" pct="Bottom 25%" color="text-amber-400" />
              <Cell tier="D" pct="Bottom 15%" color="text-rose-400" />
            </div>
          </div>
        </section>

        {/* Loadout semantics */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-700 pb-2">
            <h2 className="text-2xl font-semibold text-white">4. Loadout Semantics</h2>
          </div>
          <p className="text-slate-400">
            Each upgrade section in army-forge data carries an{' '}
            <code className="text-amber-300 text-xs">affects</code> field that
            authoritatively dictates how many model swaps are legal. The optimizer and the loadout
            preview both drive off this field — never off the human-readable label — so the
            calculations match the rulebook exactly.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-800/40">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">affects.type</th>
                  <th className="px-4 py-3 text-left">Meaning</th>
                  <th className="px-4 py-3 text-left">Optimizer sweep (k)</th>
                  <th className="px-4 py-3 text-left">Example</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <SemRow
                  type="exactly N"
                  meaning="Exactly N model-swaps. Forced count, no choice."
                  sweep="[N × instances]"
                  example="Replace one Barb Pistol and CCW (sgt loadout)"
                />
                <SemRow
                  type="up to N"
                  meaning="0..N model-swaps. Each step is a meaningful choice — preview emits one pill per k."
                  sweep="[1, 2, ..., N]"
                  example="Replace up to two Dual CCWs (Gene-Warriors)"
                />
                <SemRow
                  type="any"
                  meaning="Any number of models can elect this swap. Per-model elective."
                  sweep="[1, 2, ..., pool]"
                  example="Replace any Barb Rifle (Raider)"
                />
                <SemRow
                  type="all"
                  meaning="Mandatory whole-stack swap. Single application consumes every matching weapon."
                  sweep="[pool]"
                  example="Replace all Rifles (Heavy Squad)"
                />
                <SemRow
                  type="null"
                  meaning="No constraint info — singleton replacement. Used for sgt-pistol-replace style sections."
                  sweep="[1]"
                  example="Replace Sgt. Barb Pistol"
                />
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-5">
            <h3 className="mb-2 text-lg font-medium text-amber-200">Sergeant chains</h3>
            <p className="text-sm text-amber-200/80">
              A section is treated as <em>sergeant-creating</em> when one of the weapons it adds
              is referenced by a later section's label. Those sections are forced to{' '}
              <code className="text-amber-300 text-xs">k = 1 × instances</code> regardless of what{' '}
              <code className="text-amber-300 text-xs">affects</code> says, because OPR has only
              one sergeant per unit. Per-model upgrades earlier in the package are also restricted
              to leave one model in the pool for the upcoming sergeant — that's the{' '}
              <em>reservation</em> step you'll see in chain previews.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Cell({ tier, pct, color }: { tier: string; pct: string; color: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 py-3 px-2">
      <div className={`text-2xl font-black ${color}`}>{tier}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">{pct}</div>
    </div>
  );
}

function SemRow({
  type,
  meaning,
  sweep,
  example,
}: {
  type: string;
  meaning: string;
  sweep: string;
  example: string;
}) {
  return (
    <tr className="border-t border-slate-800">
      <td className="px-4 py-3 align-top">
        <code className="text-amber-300 text-xs whitespace-nowrap">{type}</code>
      </td>
      <td className="px-4 py-3 align-top text-slate-300">{meaning}</td>
      <td className="px-4 py-3 align-top">
        <code className="text-sky-300 text-xs whitespace-nowrap">{sweep}</code>
      </td>
      <td className="px-4 py-3 align-top text-slate-400 italic text-xs">{example}</td>
    </tr>
  );
}
