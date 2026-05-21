import type { Unit, Weapon } from '@opr-api/shared';
import {
  calculateWeaponOffense,
  calculateEffectiveHP,
  targetHP,
  cumulativeKillCurve,
  cumulativeMoraleCurve,
  expectedRoundOfEvent,
  activationsToKill,
  pointsToKill,
} from './balval';
import {
  compareEquipmentToTarget,
  parseSectionTargets,
  type ParsedTarget,
} from './weaponNames';
import type {
  BalValConfig,
  LoadoutState,
  LoadoutOption,
  LoadoutScore,
  ParsedSectionLabel,
  UpgradeApplication,
} from './types';

// This module is the shared OPR upgrade engine — imported by both the army
// detail view (preview / best-loadout suggestions) and the analyzer (when a
// list's selectedUpgrades need to be re-applied against the source army book).
// All target-name matching goes through `weaponNames.ts` so we stay aligned
// with how Army Forge's own production bundle resolves replaces.

const NUM_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const WORD_RE = /\b(one|two|three|four|five|six)\b/;

export function parseSectionLabel(label: string): ParsedSectionLabel {
  const raw = (label || '').toLowerCase();
  const isReplace = /^replace\b/.test(raw);

  // OPR convention:
  //   "Replace one X"  → exactly 1 model (sgt-only sections also use "one").
  //   "Replace any X"  → per-model elective, sweep k = 1..pool. Encoded as 1.
  //   "Replace all X"  → mandatory, single application consuming whole stack.
  let quantity: number | 'all' = 1;
  if (/\bany\b/.test(raw)) {
    quantity = 1;
  } else if (/\ball\b/.test(raw)) {
    quantity = 'all';
  } else {
    const m = raw.match(WORD_RE);
    if (m) quantity = NUM_WORDS[m[1]];
  }

  return { quantity, isReplace, raw };
}

// Extract individual weapon-name fragments from a section label.
// "Replace one Barb Rifle and CCW" → ["barb rifle", "ccw"].
// "Replace any Razor Claws"        → ["razor claws"].
// "Replace Sgt. Barb Pistol"       → ["sgt. barb pistol"].
function extractWeaponFragments(label: string): string[] {
  let s = (label || '').toLowerCase();
  s = s.replace(/^replace\s+/, '');
  s = s.replace(/^up\s+to\s+(one|two|three|four|five|six)\s+/, '');
  s = s.replace(/^(one|two|three|four|five|six|all|any)\s+/, '');
  return s
    .split(/\s+and\s+/)
    .map(x => x.trim())
    .filter(Boolean);
}


// Strict pool matcher driven by `section.targets` — Army Forge's own engine
// reads this same field. Each returned entry carries a `perApplicationCount`
// extracted from a leading "Nx " prefix (e.g. "2x CCW" → 2 swaps per
// application). Matching is singularized on both sides so "Heavy Pistols" in a
// label finds "Heavy Pistol" in the pool and vice versa.
//
// Returns [] if any target is missing from the pool (compound replaces must
// match all named targets — partial application is not allowed).
export interface MatchedTarget {
  weapon: Weapon;
  perApplicationCount: number;
}

export function findTargetedWeapons(section: any, pool: Weapon[]): MatchedTarget[] {
  const parsed: ParsedTarget[] = parseSectionTargets(section);
  if (parsed.length === 0) {
    const fallback = findReplacedWeapons(section?.label || '', pool);
    return fallback.map((w) => ({ weapon: w, perApplicationCount: 1 }));
  }

  // Sort longest-first so "Sgt. Barb Pistol" is preferred over "Barb Pistol"
  // when both appear in the pool.
  const sortedPool = [...pool].sort((a, b) => (b.name || '').length - (a.name || '').length);
  const consumed = new Set<string>();
  const matched: MatchedTarget[] = [];
  for (const t of parsed) {
    let found: Weapon | null = null;
    for (const w of sortedPool) {
      if (consumed.has(w.id) || w.count <= 0 || !w.name) continue;
      if (compareEquipmentToTarget(w, t.name)) {
        found = w;
        break;
      }
    }
    if (!found) return [];
    matched.push({ weapon: found, perApplicationCount: t.count });
    consumed.add(found.id);
  }
  return matched;
}

// Legacy label-only matcher kept for the small number of callers without a
// section object (and the existing tests). Mirrors the targets logic but
// extracts target names from the label text.
export function findReplacedWeapons(label: string, pool: Weapon[]): Weapon[] {
  const fragments = extractWeaponFragments(label);
  if (fragments.length === 0) return [];

  const sortedPool = [...pool].sort((a, b) => (b.name || '').length - (a.name || '').length);
  const consumedIds = new Set<string>();
  const matched: Weapon[] = [];

  for (const frag of fragments) {
    let found: Weapon | null = null;
    for (const w of sortedPool) {
      if (consumedIds.has(w.id) || w.count <= 0 || !w.name) continue;
      // Singularize both sides so "barb pistols" matches pool "Barb Pistol"
      // and pool "Custodian Axes" matches fragment "custodian axe".
      if (compareEquipmentToTarget(w, frag)) {
        found = w;
        break;
      }
    }
    if (!found) return []; // required weapon missing — refuse to partially apply
    matched.push(found);
    consumedIds.add(found.id);
  }
  return matched;
}

function cloneWeapons(ws: Weapon[]): Weapon[] {
  return ws.map(w => ({ ...w, specialRules: [...(w.specialRules || [])] }));
}

// Resolve the points cost of an option for a specific unit.
// army-forge data stores a top-level `cost` (generic fallback) plus a `costs[]`
// array of per-unit overrides (`{ unitId, cost }`). The override always wins
// when present — using the top-level cost alone would mis-price options like
// the Witches sgt loadout (top cost 0, real per-unit cost 10).
export function getOptionCost(option: any, unit: Unit): number {
  const overrides = Array.isArray(option?.costs) ? option.costs : [];
  const match = overrides.find((c: any) => c?.unitId === unit.id);
  if (match && typeof match.cost === 'number') return match.cost;
  return typeof option?.cost === 'number' ? option.cost : 0;
}

export function buildBaseLoadout(unit: Unit): LoadoutState {
  return {
    weapons: cloneWeapons(unit.weapons || []),
    cost: unit.cost,
    applications: [],
  };
}

export interface ApplyOpts {
  isDoubled?: boolean;
  /**
   * Number of times to apply this option. OPR sections like "Replace one X" can
   * be taken once per model; the optimizer sweeps k = 1..N. Default 1.
   * Ignored when the section uses "Replace any/all" — that always consumes the
   * full matching stack in a single application.
   */
  applicationCount?: number;
}

// Apply one upgrade option to a loadout.
//
// `applicationCount` is the literal number of model-swaps to perform. Each swap
// removes one copy of every target weapon and adds gainCount of every gained
// weapon. Cost = optionCost × k. The caller (optimizer / preview) is
// responsible for choosing a k that respects the section's `affects`
// constraints (exactly N, up to N, any, all). Returns null if the pool can't
// satisfy k swaps — no partial applications.
export function applyOption(
  state: LoadoutState,
  pkgUid: string,
  section: any,
  option: any,
  unit: Unit,
  _config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutState | null {
  const variant: string = section.variant || 'replace';
  const isReplace = variant === 'replace';
  const k = Math.max(1, opts.applicationCount ?? 1);

  const gains: any[] = option.gains || [];
  const weaponGains = gains.filter(g => g?.type === 'ArmyBookWeapon');
  if (gains.length === 0) return null;

  const removed: { weapon: Weapon; count: number }[] = [];
  if (isReplace) {
    const matches = findTargetedWeapons(section, state.weapons);
    if (matches.length === 0) return null;
    for (const m of matches) {
      // Per-target "Nx " multiplier scales the per-application removal count.
      // e.g. "Replace Lord Gauss Pistol and 2x CCW" with k=1 removes 1 pistol
      // and 2 CCWs.
      const needed = k * m.perApplicationCount;
      if (m.weapon.count < needed) return null;
      removed.push({ weapon: m.weapon, count: needed });
    }
  }
  const perInstance = k;
  if (perInstance === 0) return null;

  // 3. New pool.
  let newWeapons = cloneWeapons(state.weapons);
  for (const { weapon, count } of removed) {
    newWeapons = newWeapons
      .map(w => {
        if (w.id !== weapon.id) return w;
        const remaining = w.count - count;
        return remaining > 0 ? { ...w, count: remaining } : null;
      })
      .filter((w): w is Weapon => w !== null);
  }

  const added: Weapon[] = [];
  for (const gain of weaponGains) {
    // OPR ships melee gains without a `range` field at all (Dual Sword-Flails,
    // Energy Sword, etc.). Normalize to 0 so downstream code sees a proper
    // numeric range and doesn't have to defensively `?? 0` everywhere.
    const w = {
      ...gain,
      range: typeof gain.range === 'number' ? gain.range : 0,
      count: (gain.count || 1) * perInstance,
    } as Weapon;
    newWeapons.push(w);
    added.push(w);
  }

  // 4. Cost. `option.cost` is the price PER SELECTION, not per model affected.
  //   - affects:all     → one selection covers every matching model     → cost × 1
  //   - affects:exactly → one selection covers N models at the listed price → cost × 1
  //   - affects:any     → each selection swaps one model, k selections   → cost × k
  //   - affects:up to   → up to N selections, each swaps one model       → cost × k
  // The Novice Sisters "Replace all Dual CCWs → Great Weapon" case (30pts,
  // affects:all) used to charge 30 × 10 = 300 because we multiplied every
  // case by k. Now it correctly charges 30 once.
  const affectsType = section?.affects?.type;
  const isSingleSelection = affectsType === 'all' || affectsType === 'exactly';
  const costPer = getOptionCost(option, unit);
  const costApplied = isSingleSelection ? costPer : costPer * perInstance;

  const application: UpgradeApplication = {
    packageUid: pkgUid,
    sectionId: section.id || section.label || '',
    sectionLabel: section.label || '',
    optionId: option.id,
    optionLabel: option.label,
    variant,
    quantity: perInstance,
    costApplied,
    weaponsAdded: added,
    weaponsRemoved: removed.map(r => ({ weapon: r.weapon, count: r.count })),
  };

  return {
    weapons: newWeapons,
    cost: state.cost + costApplied,
    applications: [...state.applications, application],
  };
}

export function scoreLoadout(state: LoadoutState, unit: Unit, config: BalValConfig): LoadoutScore {
  let melee = 0;
  let ranged = 0;
  for (const w of state.weapons) {
    const o = calculateWeaponOffense(
      w,
      unit.quality,
      config.targetDefense,
      config.targetSize,
      config.targetToughness,
    );
    // OPR omits `range` entirely on melee gains (e.g. Dual Sword-Flails),
    // so a strict `=== 0` check falsely classifies them as ranged. Treat
    // missing/0/undefined as melee.
    if (!w.range) melee += o;
    else ranged += o;
  }
  const offense = Math.max(melee, ranged);
  const ehp = calculateEffectiveHP(unit);
  const efficiency = state.cost > 0
    ? (offense / state.cost) * config.offenseWeight + (ehp / state.cost) * (1 - config.offenseWeight)
    : 0;

  // Effectiveness: round-weighted (R1 kill > R4 kill) sum of kill + half-value
  // morale (shaken) probabilities, per point spent. A loadout that kills early
  // or reliably forces a morale check scores high; one that "eventually kills
  // by R4 if you're lucky" scores low. Combined score averages with classic
  // efficiency so neither dominates — used by findBestLoadout.
  const hp = targetHP(config);
  const killCurve = cumulativeKillCurve(offense, hp);
  const moraleCurve = cumulativeMoraleCurve(offense, hp);
  const killProbByGameEnd = killCurve[3];
  const moraleProbByGameEnd = moraleCurve[3];
  const expectedRoundToKill = expectedRoundOfEvent(killCurve);
  const expectedRoundToMorale = expectedRoundOfEvent(moraleCurve);
  const atk = activationsToKill(offense, hp);
  const ptk = pointsToKill(state.cost, atk);
  const ROUND_WEIGHTS = [4, 3, 2, 1] as const;
  const MORALE_VALUE_FRACTION = 0.5;
  let value = 0;
  let killPrev = 0;
  let moralePrev = 0;
  for (let r = 0; r < 4; r++) {
    const killMarg = Math.max(0, killCurve[r] - killPrev);
    const moraleMarg = Math.max(0, moraleCurve[r] - moralePrev);
    const moraleOnlyMarg = Math.max(0, moraleMarg - killMarg);
    value += ROUND_WEIGHTS[r] * (killMarg + MORALE_VALUE_FRACTION * moraleOnlyMarg);
    killPrev = killCurve[r];
    moralePrev = moraleCurve[r];
  }
  const effectivenessScore = Number.isFinite(ptk) ? value / Math.max(state.cost, 1) : 0;
  const combinedScore = (efficiency + effectivenessScore) / 2;

  return {
    meleeOffense: melee,
    rangedOffense: ranged,
    offense,
    efficiency,
    killProbByGameEnd,
    moraleProbByGameEnd,
    cumulativeKillProb: killCurve,
    cumulativeMoraleProb: moraleCurve,
    expectedRoundToKill,
    expectedRoundToMorale,
    activationsToKill: atk,
    pointsToKill: ptk,
    effectivenessScore,
    combinedScore,
  };
}

interface OrderedSection {
  pkgUid: string;
  section: any;
}

// Minimal shape for the army-book payload — we only read `upgradePackages` in
// this file.
interface ArmyBookLike {
  upgradePackages?: { uid: string; sections?: unknown[] }[];
}

function collectSections(unit: Unit, army: ArmyBookLike): OrderedSection[] {
  const out: OrderedSection[] = [];
  for (const pkgUid of unit.upgrades || []) {
    const pkg = army.upgradePackages?.find((p) => p.uid === pkgUid);
    if (!pkg) continue;
    for (const section of pkg.sections || []) out.push({ pkgUid, section });
  }
  return out;
}

// Candidate `k` values for a single section against the current pool. Pure
// function of `(section, state, unit, opts)` — no heuristics, no reservation,
// no awareness of other sections. The optimizer's search loop trials every
// returned k value, so any "leave a model behind for a future section" decision
// falls out of the search structure rather than being baked in here.
//
// k = number of times the option is applied to this section in one go. For
// per-model elective ("any") and capped ("up to") sections, k is the number
// of separate selections by the player. For mass replaces ("all") and forced
// counts ("exactly"), one selection covers the full count.
function candidateCounts(
  section: { variant?: string; affects?: { type?: string; value?: number }; select?: { type?: string; value?: number }; targets?: string[] },
  state: LoadoutState,
  unit: Unit,
  opts: ApplyOpts,
): number[] {
  const a = section.affects;
  const instances = opts.isDoubled ? 2 : 1;
  const isReplace = section.variant === 'replace';

  // Pool floor. For replaces, the floor is the number of complete target sets
  // we can take from the pool. With a "Nx " target prefix each application
  // consumes N of that weapon, so the cap is floor(count / N).
  let poolFloor = unit.size * instances;
  if (isReplace) {
    const matches = findTargetedWeapons(section, state.weapons);
    if (matches.length === 0) return [];
    poolFloor = Math.min(
      ...matches.map((m) => Math.floor(m.weapon.count / Math.max(1, m.perApplicationCount))),
    );
  }
  let usableMax = Math.max(0, poolFloor);

  // `section.select` caps how many copies of the option can land per model.
  //   affects: any        × select: exactly|up-to N → up to (size × N) total
  //   affects: exactly M  × select: exactly|up-to N → up to (M × N) total
  // For non-replace variants where there's no pool to consume, `select` is the
  // primary cap. We intersect the select cap into usableMax.
  const sel = section.select;
  if (sel && typeof sel === 'object') {
    let selectCap = Infinity;
    const v = typeof sel.value === 'number' ? sel.value : 1;
    if (sel.type === 'exactly' || sel.type === 'up to') {
      if (a?.type === 'any') selectCap = unit.size * instances * v;
      else if (a?.type === 'exactly' || a?.type === 'up to') selectCap = (a.value || 1) * instances * v;
      else selectCap = v * instances;
    }
    if (Number.isFinite(selectCap)) usableMax = Math.min(usableMax, selectCap);
  }

  if (a) {
    if (a.type === 'all') return usableMax > 0 ? [usableMax] : [];
    if (a.type === 'exactly') {
      const k = Math.max(1, (a.value || 1) * instances);
      return usableMax >= k ? [k] : [];
    }
    if (a.type === 'up to') {
      const top = Math.min((a.value || 0) * instances, usableMax);
      return top >= 1 ? Array.from({ length: top }, (_, i) => i + 1) : [];
    }
    if (a.type === 'any') {
      if (usableMax < 1) return [];
      // For "any" we'd otherwise sweep 1..usableMax exhaustively. For a size-N
      // unit with three "any" sections that's 41^3 paths — too many. The only
      // reason to take fewer than max is to leave pool room for downstream
      // sections; in OPR data those downstream needs are typically small (one
      // sgt swap, occasionally two). So we sample the boundary: 1, max-2,
      // max-1, max. Covers the realistic reservation amounts without an
      // explicit reservation step.
      const ks = new Set<number>([1, usableMax]);
      if (usableMax >= 2) ks.add(usableMax - 1);
      if (usableMax >= 3) ks.add(usableMax - 2);
      return [...ks].sort((x, y) => x - y);
    }
  }

  // No `affects`: fall back to `select` when present, otherwise a single swap.
  if (sel?.type === 'up to' && typeof sel.value === 'number') {
    const top = Math.min(sel.value * instances, usableMax);
    return top >= 1 ? Array.from({ length: top }, (_, i) => i + 1) : [];
  }
  if (sel?.type === 'exactly' && typeof sel.value === 'number') {
    const k = Math.max(1, sel.value * instances);
    return usableMax >= k ? [k] : [];
  }
  return usableMax >= 1 ? [1] : [];
}

function applicationsSignature(apps: UpgradeApplication[]): string {
  return apps.map((a) => `${a.sectionId}:${a.optionId}:${a.quantity}`).join('|') || 'base';
}

// Pure DFS through the unit's upgrade sections. At each section we branch on
// "skip" plus every (option, k) the section permits given the current pool.
// Returns every unique terminal state — the caller scores and ranks. No
// reservation, no sgt heuristics, no producer/consumer detection: a chain
// like "sec0 leaves a pair → sec1 sgt swap → sec2 sgt upgrade" emerges as
// one path among many, scored on its own merits.
//
// Path count is bounded by candidateCounts using sparse k sampling for "any"
// sections (1, max-2, max-1, max). For typical OPR units this stays under
// a few thousand paths — fast enough for interactive use.
export function searchLoadouts(
  unit: Unit,
  army: ArmyBookLike,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutState[] {
  const sections = collectSections(unit, army);
  const results: LoadoutState[] = [];
  const seen = new Set<string>();

  function recurse(state: LoadoutState, idx: number): void {
    if (idx >= sections.length) {
      const sig = applicationsSignature(state.applications);
      if (seen.has(sig)) return;
      seen.add(sig);
      results.push(state);
      return;
    }

    const { pkgUid, section } = sections[idx];

    // Branch 1: skip this section entirely.
    recurse(state, idx + 1);

    // Branch 2: every (option, k) that's legal against the current pool.
    const ks = candidateCounts(section, state, unit, opts);
    if (ks.length === 0) return;
    for (const option of section.options || []) {
      for (const k of ks) {
        const next = applyOption(state, pkgUid, section, option, unit, config, {
          ...opts,
          applicationCount: k,
        });
        if (next) recurse(next, idx + 1);
      }
    }
  }

  recurse(buildBaseLoadout(unit), 0);

  // Sort by combined effectiveness+efficiency descending — caller picks [0]
  // for best, slices for alternatives. Combined score balances "kills the
  // target within the 4-round game" with classic damage-per-point.
  return results.sort(
    (a, b) =>
      scoreLoadout(b, unit, config).combinedScore - scoreLoadout(a, unit, config).combinedScore,
  );
}

// Best loadout = top of the search results. The search already enumerated and
// scored every legal path, so this is just a tip-of-the-iceberg accessor.
export function findBestLoadout(
  unit: Unit,
  army: ArmyBookLike,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutState {
  const all = searchLoadouts(unit, army, config, opts);
  return all[0] || buildBaseLoadout(unit);
}

function makeOption(
  id: string,
  label: string,
  state: LoadoutState,
  unit: Unit,
  config: BalValConfig,
  baseScore: LoadoutScore,
  baseCost: number,
  isBase: boolean,
  isBestCombo: boolean,
): LoadoutOption {
  const score = scoreLoadout(state, unit, config);
  const efficiencyDelta = baseScore.efficiency > 0
    ? (score.efficiency - baseScore.efficiency) / baseScore.efficiency
    : 0;
  // Combined delta = relative change in (efficiency + effectiveness) avg vs
  // the base loadout. Drives the row up/down colouring so a swap that buys
  // damage at slightly worse efficiency-per-point still reads "green" when
  // its kill-probability gain outweighs the cost bump.
  const combinedDelta = baseScore.combinedScore > 0
    ? (score.combinedScore - baseScore.combinedScore) / baseScore.combinedScore
    : score.combinedScore > 0 ? 1 : 0;
  let meleeAttacks = 0;
  let rangedAttacks = 0;
  for (const w of state.weapons) {
    const shots = (w.count || 0) * (w.attacks || 0);
    if ((w.range || 0) === 0) meleeAttacks += shots;
    else rangedAttacks += shots;
  }
  return {
    id,
    label,
    state,
    meleeOffense: score.meleeOffense,
    rangedOffense: score.rangedOffense,
    offense: score.offense,
    efficiency: score.efficiency,
    killProbByGameEnd: score.killProbByGameEnd,
    moraleProbByGameEnd: score.moraleProbByGameEnd,
    cumulativeKillProb: score.cumulativeKillProb,
    cumulativeMoraleProb: score.cumulativeMoraleProb,
    expectedRoundToKill: score.expectedRoundToKill,
    expectedRoundToMorale: score.expectedRoundToMorale,
    activationsToKill: score.activationsToKill,
    pointsToKill: score.pointsToKill,
    effectivenessScore: score.effectivenessScore,
    combinedScore: score.combinedScore,
    meleeAttacks,
    rangedAttacks,
    totalAttacks: meleeAttacks + rangedAttacks,
    baseEfficiency: baseScore.efficiency,
    efficiencyDelta,
    baseCombinedScore: baseScore.combinedScore,
    combinedDelta,
    offenseDelta: score.offense - baseScore.offense,
    costDelta: state.cost - baseCost,
    isBase,
    isBestCombo,
    isMostOutput: false,
    isMostMelee: false,
    isMostRanged: false,
    applications: state.applications,
  };
}

// Turn an applied UpgradeApplication list into a human-readable pill label.
//   no apps          → "Default Loadout"
//   one app          → option.label
//   chained apps     → "OptA + OptB" (joined by " + ")
function labelForApplications(apps: UpgradeApplication[]): string {
  if (apps.length === 0) return 'Default Loadout';
  return apps
    .map((a) => (a.quantity > 1 ? `${a.optionLabel} (×${a.quantity})` : a.optionLabel))
    .join(' + ');
}

function idForApplications(apps: UpgradeApplication[]): string {
  if (apps.length === 0) return 'base';
  return apps.map((a) => `${a.sectionId}:${a.optionId}:${a.quantity}`).join('__');
}

// Every legal loadout the search found, returned as pills. The first entry is
// always the base (default) loadout — if it doesn't naturally appear in the
// search results (it should, via the all-skip path), it's prepended. The
// highest-efficiency result is flagged isBestCombo. Otherwise no curation:
// the UI can sort/filter however it likes.
export function enumerateOptionLoadouts(
  unit: Unit,
  army: ArmyBookLike,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutOption[] {
  const base = buildBaseLoadout(unit);
  const baseScore = scoreLoadout(base, unit, config);
  const all = searchLoadouts(unit, army, config, opts);

  const out: LoadoutOption[] = all.map((state, i) => {
    const isBase = state.applications.length === 0;
    return makeOption(
      idForApplications(state.applications),
      labelForApplications(state.applications),
      state,
      unit,
      config,
      baseScore,
      base.cost,
      isBase,
      i === 0,
    );
  });

  // Guarantee a base pill at the top even if the all-skip path somehow
  // didn't surface (defensive — searchLoadouts always includes it).
  if (!out.some((o) => o.isBase)) {
    out.unshift(
      makeOption('base', 'Default Loadout', base, unit, config, baseScore, base.cost, true, all.length === 0),
    );
  }

  // Niche markers. Each one tags exactly one loadout — the winner by raw
  // attack volume in that category, with expected damage as the tiebreaker
  // (so e.g. 3 attacks AP(3) beats 3 attacks AP(0)). A single loadout can
  // win multiple categories. Skips loadouts with 0 attacks in the relevant
  // bucket so a melee-only build doesn't get falsely flagged as "best ranged".
  pickWinner(out, (o) => o.totalAttacks, (o) => o.offense, 'isMostOutput');
  pickWinner(out, (o) => o.meleeAttacks, (o) => o.meleeOffense, 'isMostMelee');
  pickWinner(out, (o) => o.rangedAttacks, (o) => o.rangedOffense, 'isMostRanged');

  return out;
}

// Pick the loadout that maxes `primary` (with `tiebreak` resolving ties) and
// stamp the named flag on it. No-op when no loadout has any output in the
// category (e.g. all-melee unit → no ranged winner).
function pickWinner(
  options: LoadoutOption[],
  primary: (o: LoadoutOption) => number,
  tiebreak: (o: LoadoutOption) => number,
  flag: 'isMostOutput' | 'isMostMelee' | 'isMostRanged',
): void {
  let winner: LoadoutOption | null = null;
  for (const o of options) {
    if (primary(o) <= 0) continue;
    if (!winner) { winner = o; continue; }
    const pCur = primary(o), pBest = primary(winner);
    if (pCur > pBest) { winner = o; continue; }
    if (pCur === pBest && tiebreak(o) > tiebreak(winner)) winner = o;
  }
  if (winner) winner[flag] = true;
}

// Currently identical to enumerateOptionLoadouts — both expose the full search
// space. Kept as a separate export for callers that want a semantic hook (e.g.
// "give me everything plus the best, with best flagged") if we need to tweak
// either later.
export function getAllLoadouts(
  unit: Unit,
  army: ArmyBookLike,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutOption[] {
  return enumerateOptionLoadouts(unit, army, config, opts);
}
