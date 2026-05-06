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

        {/* The BalVal Score */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-700 pb-2">
            <Calculator className="h-6 w-6 text-purple-400" />
            <h2 className="text-2xl font-semibold text-white">3. The Final BalVal Score</h2>
          </div>
          <p className="text-slate-400">
            Finally, we calculate how efficient the unit is relative to its point cost.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 font-mono text-sm text-slate-300">
              Offense Efficiency = Total Offense / Cost
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 font-mono text-sm text-slate-300">
              Defense Efficiency = Effective HP / Cost
            </div>
          </div>

          <div className="rounded-xl border border-purple-900/30 bg-purple-950/20 p-5">
            <h3 className="mb-2 text-lg font-medium text-purple-200">Raw BalVal Score</h3>
            <p className="mb-3 text-sm text-purple-200/70">
              The Raw BalVal Score is a weighted average of these two efficiencies (default 50/50 split). Units are then ranked by this raw score to place them into Percentiles and Tiers (S, A, B, C, D).
            </p>
            <div className="rounded bg-slate-900/80 p-4 font-mono text-sm text-purple-300">
              BalVal = (Offense Eff. × W_offense) + (Defense Eff. × W_defense)
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
