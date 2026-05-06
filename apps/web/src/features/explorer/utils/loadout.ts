import type { Unit, Weapon } from '@opr-api/shared';
import { calculateWeaponOffense, calculateEffectiveHP } from './balval';
import type {
  BalValConfig,
  LoadoutState,
  LoadoutOption,
  LoadoutScore,
  ParsedSectionLabel,
  UpgradeApplication,
} from './types';

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


// Strict pool matcher driven by an explicit list of target weapon names. army-
// forge stores `section.targets` (array of weapon names) authoritatively — way
// more reliable than parsing labels. Optional plural-s tolerance both ways.
// Returns [] if any target is missing from the pool.
export function findTargetedWeapons(section: any, pool: Weapon[]): Weapon[] {
  const targets: string[] = Array.isArray(section?.targets) ? section.targets : [];
  if (targets.length === 0) return findReplacedWeapons(section?.label || '', pool);

  const sortedPool = [...pool].sort((a, b) => (b.name || '').length - (a.name || '').length);
  const consumed = new Set<string>();
  const matched: Weapon[] = [];
  for (const t of targets) {
    const tn = (t || '').toLowerCase();
    let found: Weapon | null = null;
    for (const w of sortedPool) {
      if (consumed.has(w.id) || w.count <= 0 || !w.name) continue;
      const wn = w.name.toLowerCase();
      if (wn === tn || wn === `${tn}s` || `${wn}s` === tn) {
        found = w;
        break;
      }
    }
    if (!found) return [];
    matched.push(found);
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
      const nm = w.name.toLowerCase();
      // Exact-fragment match (with optional plural "s") so "barb pistol" from
      // pool only matches a fragment of "barb pistol", never the longer
      // "sgt. barb pistol".
      if (frag === nm || frag === nm + 's') {
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
    for (const w of matches) {
      if (w.count < k) return null;
      removed.push({ weapon: w, count: k });
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
    const w = { ...gain, count: (gain.count || 1) * perInstance } as Weapon;
    newWeapons.push(w);
    added.push(w);
  }

  // 4. Cost.
  const costPer = getOptionCost(option, unit);
  const costApplied = costPer * perInstance;

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
      config.assault,
    );
    if (w.range === 0) melee += o;
    else ranged += o;
  }
  // Assault → combined activation; otherwise pick the bigger mode.
  const offense = config.assault ? melee + ranged : Math.max(melee, ranged);
  const ehp = calculateEffectiveHP(unit);
  const efficiency = state.cost > 0
    ? (offense / state.cost) * config.offenseWeight + (ehp / state.cost) * (1 - config.offenseWeight)
    : 0;
  return { meleeOffense: melee, rangedOffense: ranged, offense, efficiency };
}

interface OrderedSection {
  pkgUid: string;
  section: any;
}

function collectSections(unit: Unit, army: any): OrderedSection[] {
  const out: OrderedSection[] = [];
  for (const pkgUid of unit.upgrades || []) {
    const pkg = army.upgradePackages?.find((p: any) => p.uid === pkgUid);
    if (!pkg) continue;
    for (const section of pkg.sections || []) out.push({ pkgUid, section });
  }
  return out;
}

// A "sgt-creating" section is one whose gained weapons are referenced by a later
// section's label — meaning that later section depends on this one having been
// applied. By OPR convention only one sergeant exists per unit, so these
// sections are restricted to a single application.
function isSgtCreatingSection(idx: number, sections: OrderedSection[]): boolean {
  const section = sections[idx].section;
  const gainNames = new Set<string>();
  for (const opt of section.options || []) {
    for (const g of opt.gains || []) {
      if (g?.type === 'ArmyBookWeapon' && g.name) gainNames.add(g.name.toLowerCase());
    }
  }
  if (gainNames.size === 0) return false;
  for (let j = idx + 1; j < sections.length; j++) {
    const lbl = (sections[j].section.label || '').toLowerCase();
    for (const nm of gainNames) {
      if (lbl.includes(nm)) return true;
    }
  }
  return false;
}

// Number of models a future sgt section needs to reserve from the current pool —
// based on which of OUR matched weapons appear in that future section's label.
function reservedForFutureSgts(
  idx: number,
  sections: OrderedSection[],
  matchedNames: string[],
): number {
  let reserved = 0;
  for (let j = idx + 1; j < sections.length; j++) {
    if (!isSgtCreatingSection(j, sections)) continue;
    const futLbl = (sections[j].section.label || '').toLowerCase();
    if (matchedNames.some(n => futLbl.includes(n))) reserved += 1;
  }
  return reserved;
}

// Determine the candidate application counts (k values) to try for one section.
// Driven by army-forge's `affects` field which is the authoritative source:
//   exactly N → [N × instances]                (forced count)
//   up to N  → [1 .. min(N × instances, pool)]
//   any      → [1 .. pool]                     (per-model elective)
//   all      → [pool]                          (whole stack)
//   null     → [1]                             (fallback: singleton)
// Sgt-creating sections always force a single application (per stacked
// instance). Reservation for downstream sgt sections is applied uniformly.
function candidateCounts(
  idx: number,
  sections: OrderedSection[],
  state: LoadoutState,
  unit: Unit,
  isSgt: boolean,
  opts: ApplyOpts,
): number[] {
  const { section } = sections[idx];
  const a = section.affects;
  const instances = opts.isDoubled ? 2 : 1;
  const isReplace = section.variant === 'replace';

  // Pool floor + reserved seats for downstream sgt sections.
  let poolFloor = unit.size * instances;
  let matchedNames: string[] = [];
  if (isReplace) {
    const matches = findTargetedWeapons(section, state.weapons);
    if (matches.length === 0) return [];
    poolFloor = Math.min(...matches.map(w => w.count));
    matchedNames = matches.map(m => (m.name || '').toLowerCase());
  }
  const reserved = isReplace ? reservedForFutureSgts(idx, sections, matchedNames) : 0;
  const usableMax = Math.max(0, poolFloor - reserved);

  if (isSgt) {
    return usableMax >= instances ? [instances] : [];
  }

  if (a) {
    if (a.type === 'all') {
      return usableMax > 0 ? [usableMax] : [];
    }
    if (a.type === 'exactly') {
      const k = Math.max(1, (a.value || 1) * instances);
      return usableMax >= k ? [k] : [];
    }
    if (a.type === 'up to') {
      const top = Math.min((a.value || 0) * instances, usableMax);
      return top >= 1 ? Array.from({ length: top }, (_, i) => i + 1) : [];
    }
    if (a.type === 'any') {
      return usableMax >= 1 ? Array.from({ length: usableMax }, (_, i) => i + 1) : [];
    }
  }

  // Fallback: when affects is null, default to a single swap (matches the
  // singleton sgt-replace pattern, e.g. "Replace Sgt. Barb Pistol").
  return usableMax >= 1 ? [1] : [];
}

// Indices of sections whose label references a weapon that THIS sgt section
// adds — they form the sergeant chain (e.g. "Replace Sgt. Barb Pistol" depends
// on the sgt section adding a Sgt. Barb Pistol).
function findDependentIndices(sgtIdx: number, sections: OrderedSection[]): number[] {
  const gainNames = new Set<string>();
  for (const opt of sections[sgtIdx].section.options || []) {
    for (const g of opt.gains || []) {
      if (g?.type === 'ArmyBookWeapon' && g.name) gainNames.add(g.name.toLowerCase());
    }
  }
  const deps: number[] = [];
  for (let j = sgtIdx + 1; j < sections.length; j++) {
    const lbl = (sections[j].section.label || '').toLowerCase();
    for (const nm of gainNames) {
      if (lbl.includes(nm)) {
        deps.push(j);
        break;
      }
    }
  }
  return deps;
}

// Evaluate a sgt section together with all its dependent sections as a single
// compound choice. Required because sgt loadouts often have neutral standalone
// efficiency but unlock a profitable downstream upgrade (e.g. Sgt → EMP
// Pistol). Greedy single-section evaluation would miss that and skip the chain.
function evaluateSgtChain(
  state: LoadoutState,
  sgtIdx: number,
  depIndices: number[],
  sections: OrderedSection[],
  unit: Unit,
  config: BalValConfig,
  opts: ApplyOpts,
): LoadoutState {
  const sgtSection = sections[sgtIdx];
  const instances = opts.isDoubled ? 2 : 1;
  let bestState = state;
  let bestEff = scoreLoadout(state, unit, config).efficiency;

  for (const sgtOpt of sgtSection.section.options || []) {
    const afterSgt = applyOption(state, sgtSection.pkgUid, sgtSection.section, sgtOpt, unit, config, {
      ...opts,
      applicationCount: instances,
    });
    if (!afterSgt) continue;

    let cur = afterSgt;
    for (const di of depIndices) {
      const ds = sections[di];
      // Dependent sections inherit sgt-only semantics (singleton per stacked
      // instance); honour any explicit affects info if present.
      const depCands = candidateCounts(di, sections, cur, unit, true, opts);
      const depK = depCands.length ? Math.max(...depCands) : instances;

      let chosenSub: LoadoutState | null = null;
      let chosenSubEff = scoreLoadout(cur, unit, config).efficiency;
      for (const depOpt of ds.section.options || []) {
        const next = applyOption(cur, ds.pkgUid, ds.section, depOpt, unit, config, {
          ...opts,
          applicationCount: depK,
        });
        if (!next) continue;
        const eff = scoreLoadout(next, unit, config).efficiency;
        if (eff > chosenSubEff) {
          chosenSubEff = eff;
          chosenSub = next;
        }
      }
      if (chosenSub) cur = chosenSub;
    }

    const finalEff = scoreLoadout(cur, unit, config).efficiency;
    if (finalEff > bestEff) {
      bestEff = finalEff;
      bestState = cur;
    }
  }
  return bestState;
}

// Greedy section-by-section optimizer. For each section sweeps both options AND
// application counts, picks the (option, k) that maximally improves efficiency
// over the current state. Reserves models for downstream sgt sections so chains
// like "all squad → razor flails + 1 sgt + sgt pistol → EMP" stay consistent,
// and evaluates sgt + dependent sections as a single compound choice so chains
// with neutral sgt-step but profitable downstream still get applied.
export function findBestLoadout(
  unit: Unit,
  army: any,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutState {
  let state = buildBaseLoadout(unit);
  let bestEff = scoreLoadout(state, unit, config).efficiency;

  const sections = collectSections(unit, army);
  const processed = new Set<number>();

  for (let i = 0; i < sections.length; i++) {
    if (processed.has(i)) continue;
    const isSgt = isSgtCreatingSection(i, sections);

    if (isSgt) {
      const deps = findDependentIndices(i, sections);
      [i, ...deps].forEach(idx => processed.add(idx));
      const next = evaluateSgtChain(state, i, deps, sections, unit, config, opts);
      const nextEff = scoreLoadout(next, unit, config).efficiency;
      if (nextEff > bestEff) {
        state = next;
        bestEff = nextEff;
      }
      continue;
    }

    const counts = candidateCounts(i, sections, state, unit, isSgt, opts);
    if (counts.length === 0) continue;

    let chosenState: LoadoutState | null = null;
    let chosenEff = bestEff;
    for (const option of sections[i].section.options || []) {
      for (const k of counts) {
        const candidate = applyOption(state, sections[i].pkgUid, sections[i].section, option, unit, config, {
          ...opts,
          applicationCount: k,
        });
        if (!candidate) continue;
        const eff = scoreLoadout(candidate, unit, config).efficiency;
        if (eff > chosenEff) {
          chosenEff = eff;
          chosenState = candidate;
        }
      }
    }
    if (chosenState) {
      state = chosenState;
      bestEff = chosenEff;
    }
  }
  return state;
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
  return {
    id,
    label,
    state,
    meleeOffense: score.meleeOffense,
    rangedOffense: score.rangedOffense,
    offense: score.offense,
    efficiency: score.efficiency,
    baseEfficiency: baseScore.efficiency,
    efficiencyDelta,
    offenseDelta: score.offense - baseScore.offense,
    costDelta: state.cost - baseCost,
    isBase,
    isBestCombo,
    applications: state.applications,
  };
}

// Application counts to surface in the per-option preview.
//   exactly N → [N]
//   up to N  → [1, 2, ..., N]   ← every step gets its own pill so users can
//                                 compare "swap 1 model" vs "swap 2 models"
//   any      → [pool max]       (per-model elective; single pill avoids
//                                 a 5+ pill explosion)
//   all      → [pool]
//   null     → [1]
function previewKValues(
  sectionIdx: number,
  sections: OrderedSection[],
  isSgt: boolean,
  base: LoadoutState,
  unit: Unit,
  opts: ApplyOpts,
): number[] {
  const cands = candidateCounts(sectionIdx, sections, base, unit, isSgt, opts);
  if (cands.length === 0) return [];
  const a = sections[sectionIdx].section.affects;
  if (a?.type === 'up to' && cands.length > 1) return cands;
  return [Math.max(...cands)];
}

// One loadout per option, applied to the BASE state at the maximum legal
// application count so users see the biggest swing each option offers (e.g.
// "all 3 models swap to Razor Flails" rather than "1 model swaps").
//
// Also enumerates 2-deep chain loadouts: when a downstream section depends on
// weapons that a prior section adds (so the downstream section can't apply to
// base alone), every (parent option × child option) pair is added so otherwise
// hidden upgrade trees become visible. Example: Gene-Warriors sec0 adds Barb
// Pistol + CCW, then sec1 "Replace one Barb Pistol" → Bone Gun / Arcane Rifle
// surface as chain pills.
export function enumerateOptionLoadouts(
  unit: Unit,
  army: any,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutOption[] {
  const base = buildBaseLoadout(unit);
  const baseScore = scoreLoadout(base, unit, config);
  const out: LoadoutOption[] = [
    makeOption('base', 'Default Loadout', base, unit, config, baseScore, base.cost, true, false),
  ];

  const sections = collectSections(unit, army);
  const standaloneApplicable = new Set<number>();

  // Pass 1: standalone option loadouts. For "up to N" sections we emit one
  // pill per k (e.g. Gene-Warriors sec0 "Replace up to two Dual CCWs" gets
  // two pills per option: ×1 and ×2). Other types get a single max-k pill.
  for (let i = 0; i < sections.length; i++) {
    const { pkgUid, section } = sections[i];
    const isSgt = isSgtCreatingSection(i, sections);
    const ks = previewKValues(i, sections, isSgt, base, unit, opts);
    if (ks.length === 0) continue;
    standaloneApplicable.add(i);
    const showK = ks.length > 1;

    for (const option of section.options || []) {
      for (const k of ks) {
        const next = applyOption(base, pkgUid, section, option, unit, config, {
          ...opts,
          applicationCount: k,
        });
        if (!next) continue;
        const id = `${section.id || section.label || pkgUid}_${option.id}${showK ? `_k${k}` : ''}`;
        const label = showK ? `${option.label} (×${k})` : option.label;
        out.push(makeOption(id, label, next, unit, config, baseScore, base.cost, false, false));
      }
    }
  }

  // Pass 2: 2-deep chains. Parent applied at max k (chains stay flat to avoid
  // pill explosion). Each downstream child that isn't standalone-applicable
  // contributes one pill per child option.
  for (const parentIdx of standaloneApplicable) {
    const parent = sections[parentIdx];
    const parentIsSgt = isSgtCreatingSection(parentIdx, sections);
    const parentKs = previewKValues(parentIdx, sections, parentIsSgt, base, unit, opts);
    const parentK = parentKs.length ? Math.max(...parentKs) : 0;
    if (parentK <= 0) continue;

    for (const parentOption of parent.section.options || []) {
      const after = applyOption(base, parent.pkgUid, parent.section, parentOption, unit, config, {
        ...opts,
        applicationCount: parentK,
      });
      if (!after) continue;

      for (let j = parentIdx + 1; j < sections.length; j++) {
        if (standaloneApplicable.has(j)) continue;
        const child = sections[j];
        const childIsSgt = isSgtCreatingSection(j, sections);
        const childKs = previewKValues(j, sections, childIsSgt, after, unit, opts);
        const childK = childKs.length ? Math.max(...childKs) : 0;
        if (childK <= 0) continue;

        for (const childOption of child.section.options || []) {
          const final = applyOption(after, child.pkgUid, child.section, childOption, unit, config, {
            ...opts,
            applicationCount: childK,
          });
          if (!final) continue;
          const id = `chain_${parentIdx}_${parentOption.id}__${j}_${childOption.id}`;
          const label = `${parentOption.label} → ${childOption.label}`;
          out.push(makeOption(id, label, final, unit, config, baseScore, base.cost, false, false));
        }
      }
    }
  }

  return out;
}

function applicationsSignature(apps: UpgradeApplication[]): string {
  return apps.map(a => `${a.sectionId}:${a.optionId}:${a.quantity}`).join('|');
}

// All single-option loadouts plus the greedy best-combo (deduplicated by full
// applications signature so chain loadouts that already match best-combo get
// flagged in place rather than duplicated).
export function getAllLoadouts(
  unit: Unit,
  army: any,
  config: BalValConfig,
  opts: ApplyOpts = {},
): LoadoutOption[] {
  const singles = enumerateOptionLoadouts(unit, army, config, opts);
  const best = findBestLoadout(unit, army, config, opts);

  if (best.applications.length === 0) {
    singles[0].isBestCombo = true;
    return singles;
  }

  const bestSig = applicationsSignature(best.applications);
  const matched = singles.find(s => applicationsSignature(s.applications) === bestSig);
  if (matched) {
    matched.isBestCombo = true;
    return singles;
  }

  const base = buildBaseLoadout(unit);
  const baseScore = scoreLoadout(base, unit, config);
  singles.push(
    makeOption(
      'best-combo',
      best.applications.map(a => a.optionLabel).join(' + '),
      best,
      unit,
      config,
      baseScore,
      base.cost,
      false,
      true,
    ),
  );
  return singles;
}
