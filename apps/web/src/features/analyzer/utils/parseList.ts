import type { Unit, Weapon, Rule } from '@opr-api/shared';

type JsonRecord = Record<string, unknown>;

function isObject(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Unit annotated with list-import metadata (combined-pair / hero-attach). */
export interface ParsedUnit extends Unit {
  /** True when this unit is the result of merging a combined-unit pair. */
  isCombined: boolean;
  /** Hero attached to a non-hero squad — keeps own profile, contributes to army stats. */
  attachedToName?: string;
  /** Inverse — names of heroes attached to this unit (display only). */
  attachedHeroNames?: string[];
}

export interface ParsedList {
  name: string;
  pointsLimit?: number;
  pointsTotal: number;
  /** Canonical points reported by Army Forge top-level. Use for display when present. */
  listPoints?: number;
  gameSystemId?: number | string;
  units: ParsedUnit[];
  /** Number of distinct deployable squads (after combine, hero counted as own squad). */
  squadCount: number;
  heroCount: number;
  raw: unknown;
}

// ---- Rule / weapon normalization ----

function normalizeRule(r: unknown): Rule | null {
  if (!isObject(r)) return null;
  const name = str(r.name) ?? str(r.label);
  if (!name) return null;
  return {
    id: str(r.id) ?? str(r.key) ?? name,
    name,
    rating: r.rating != null ? num(r.rating) : undefined,
    label: str(r.label) ?? name,
  };
}

function normalizeWeapon(w: unknown, idx: number): Weapon | null {
  if (!isObject(w)) return null;
  if (w.attacks == null) return null;
  const specialRules = asArray(w.specialRules)
    .map(normalizeRule)
    .filter((r): r is Rule => r !== null);
  return {
    id: str(w.id) ?? `w-${idx}`,
    name: str(w.name) ?? str(w.label) ?? 'Weapon',
    count: num(w.count, 1),
    range: num(w.range, 0),
    attacks: num(w.attacks, 0),
    specialRules,
    label: str(w.label) ?? str(w.name) ?? 'Weapon',
  };
}

/** Pull rules from `gains[].content[]` (used by selectedUpgrades and items). */
function rulesFromGains(gains: unknown[]): Rule[] {
  const out: Rule[] = [];
  for (const g of gains) {
    if (!isObject(g)) continue;
    const content = asArray(g.content);
    for (const c of content) {
      const r = normalizeRule(c);
      if (r) out.push(r);
    }
    // Some gains are themselves rules (no nested content)
    if (g.type === 'ArmyBookRule') {
      const r = normalizeRule(g);
      if (r) out.push(r);
    }
  }
  return out;
}

function rulesFromItems(items: unknown[]): Rule[] {
  const out: Rule[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const content = asArray(item.content);
    for (const c of content) {
      const r = normalizeRule(c);
      if (r) out.push(r);
    }
  }
  return out;
}

function dedupeRules(rules: Rule[]): Rule[] {
  const map = new Map<string, Rule>();
  for (const r of rules) {
    const existing = map.get(r.name);
    if (!existing) {
      map.set(r.name, r);
      continue;
    }
    if ((r.rating ?? 0) > (existing.rating ?? 0)) map.set(r.name, r);
  }
  return [...map.values()];
}

// ---- Cost ----

/**
 * selectedUpgrades on a unit each carry an `option.costs[]` list — sum them.
 * Costs can be filtered by unitId (the source unit), but for our purposes the
 * upgrade was selected on this unit so we always count its own costs.
 */
function upgradeCostFor(rawUnit: JsonRecord): number {
  const su = asArray(rawUnit.selectedUpgrades);
  let total = 0;
  for (const entry of su) {
    if (!isObject(entry)) continue;
    const option = isObject(entry.option) ? entry.option : null;
    if (!option) continue;
    const costs = asArray(option.costs);
    for (const c of costs) {
      if (!isObject(c)) continue;
      total += num(c.cost, 0);
    }
  }
  return total;
}

// ---- Single-unit parse ----

interface RawUnitLite {
  raw: JsonRecord;
  selectionId?: string;
  internalId?: string;
  combined: boolean;
  joinToUnit?: string;
  isHero: boolean;
}

function looksLikeHero(rules: Rule[]): boolean {
  return rules.some((r) => r.name === 'Hero');
}

function parseSingleUnit(raw: JsonRecord, idx: number): { unit: ParsedUnit; meta: RawUnitLite } {
  const loadout = asArray(raw.loadout);
  const items = asArray(raw.items);
  const selectedUpgrades = asArray(raw.selectedUpgrades);

  const weaponsSrc = loadout.length ? loadout : asArray(raw.weapons);
  const weapons = weaponsSrc
    .map((w, i) => normalizeWeapon(w, i))
    .filter((w): w is Weapon => w !== null);

  const baseRules = asArray(raw.rules)
    .map(normalizeRule)
    .filter((r): r is Rule => r !== null);

  // Rules can also live in: loadout items (non-weapon entries with content[]),
  // selectedUpgrades[].option.gains[], items[].
  const upgradeGains = selectedUpgrades.flatMap((s) => {
    if (!isObject(s)) return [];
    const opt = isObject(s.option) ? s.option : null;
    return opt ? asArray(opt.gains) : [];
  });
  const upgradeRules = rulesFromGains(upgradeGains);

  const loadoutRules = (() => {
    const out: Rule[] = [];
    for (const item of loadout) {
      if (!isObject(item)) continue;
      if (item.attacks != null) continue; // weapon, skip
      const content = asArray(item.content);
      for (const c of content) {
        const r = normalizeRule(c);
        if (r) out.push(r);
      }
    }
    return out;
  })();

  const itemRules = rulesFromItems(items);
  const rules = dedupeRules([...baseRules, ...loadoutRules, ...upgradeRules, ...itemRules]);

  const cost = num(raw.cost, 0) + upgradeCostFor(raw);

  const selectionId = str(raw.selectionId);
  const internalId = str(raw.id);
  const joinToUnit = str(raw.joinToUnit) ?? undefined;
  const combined = raw.combined === true;

  const unit: ParsedUnit = {
    id: selectionId ?? internalId ?? `u-${idx}`,
    name: str(raw.customName)?.trim() || str(raw.name) || `Unit ${idx + 1}`,
    cost,
    quality: num(raw.quality, 4),
    defense: num(raw.defense, 4),
    size: num(raw.size, 1),
    weapons,
    rules,
    upgrades: [],
    genericName: str(raw.customName) ? str(raw.name) : undefined,
    isCombined: false,
    attachedToName: undefined,
    attachedHeroNames: undefined,
  };

  return {
    unit,
    meta: {
      raw,
      selectionId,
      internalId,
      combined,
      joinToUnit,
      isHero: looksLikeHero(rules),
    },
  };
}

// ---- Combine + hero-attach pass ----

interface MergeOutput {
  units: ParsedUnit[];
  squadCount: number;
  heroCount: number;
}

function mergeAndAttach(parsed: { unit: ParsedUnit; meta: RawUnitLite }[]): MergeOutput {
  const idToIdx = new Map<string, number>();
  parsed.forEach((p, i) => {
    if (p.meta.selectionId) idToIdx.set(p.meta.selectionId, i);
    if (p.meta.internalId) idToIdx.set(p.meta.internalId, i);
  });

  // Step 1 — combine pairs. Any unit with `combined: true` + `joinToUnit` is the
  // secondary half. We merge into the partner (the anchor with combined:true and
  // joinToUnit:null). After this pass, combined pairs become a single ParsedUnit.
  const consumed = new Set<number>();
  const combinedSecondary = new Set<number>(); // index of secondary halves to drop
  const combinedAnchorMap = new Map<number, number>(); // anchor idx → secondary idx

  parsed.forEach((p, i) => {
    if (p.meta.combined && p.meta.joinToUnit) {
      const j = idToIdx.get(p.meta.joinToUnit);
      if (j != null && j !== i && parsed[j]?.meta.combined) {
        combinedSecondary.add(i);
        combinedAnchorMap.set(j, i);
      }
    }
  });

  const merged: ParsedUnit[] = [];
  parsed.forEach((p, i) => {
    if (consumed.has(i)) return;
    if (combinedSecondary.has(i)) return; // handled by anchor
    if (combinedAnchorMap.has(i)) {
      const sIdx = combinedAnchorMap.get(i)!;
      const a = p.unit;
      const b = parsed[sIdx].unit;
      merged.push({
        ...a,
        cost: a.cost + b.cost,
        size: a.size + b.size,
        weapons: [...a.weapons, ...b.weapons],
        rules: dedupeRules([...a.rules, ...b.rules]),
        isCombined: true,
      });
      consumed.add(i);
      consumed.add(sIdx);
      return;
    }
    merged.push(p.unit);
    consumed.add(i);
  });

  // Step 2 — hero-attach annotations. Hero (combined:false + joinToUnit:X) keeps
  // its own ParsedUnit but we tag it with the host's name and tag the host with
  // the hero's name (display only — both still contribute to BalVal independently).
  const mergedById = new Map<string, ParsedUnit>();
  merged.forEach((u) => mergedById.set(u.id, u));

  parsed.forEach((p) => {
    if (p.meta.combined) return;
    if (!p.meta.joinToUnit) return;
    const heroId = p.meta.selectionId ?? p.meta.internalId;
    if (!heroId) return;
    const hero = mergedById.get(heroId);
    const host = mergedById.get(p.meta.joinToUnit);
    if (!hero || !host) return;
    hero.attachedToName = host.name;
    host.attachedHeroNames = [...(host.attachedHeroNames ?? []), hero.name];
  });

  let heroCount = 0;
  for (const u of merged) if (looksLikeHero(u.rules)) heroCount += 1;

  return {
    units: merged,
    squadCount: merged.length,
    heroCount,
  };
}

// ---- Public API ----

export function parseArmyForgeList(json: unknown): ParsedList {
  if (!isObject(json)) {
    throw new Error('List JSON empty or not an object.');
  }
  const nested = isObject(json.list) ? json.list : null;
  const unitsArr = Array.isArray(json.units)
    ? json.units
    : nested && Array.isArray(nested.units)
      ? nested.units
      : [];

  if (!unitsArr.length) {
    throw new Error('No units found. Expected `units` array on the list JSON.');
  }

  const parsed = unitsArr
    .map((raw, i) => (isObject(raw) ? parseSingleUnit(raw, i) : null))
    .filter((p): p is { unit: ParsedUnit; meta: RawUnitLite } => p !== null);

  const { units, squadCount, heroCount } = mergeAndAttach(parsed);

  const pointsTotal = units.reduce((s, u) => s + u.cost, 0);

  const listPoints = num(json.listPoints ?? nested?.listPoints, NaN);
  const pointsLimit = num(json.pointsLimit ?? json.points ?? nested?.pointsLimit, NaN);
  const gameSystemRaw = json.gameSystem ?? json.gameSystemId;

  return {
    name: str(json.name) ?? (nested ? str(nested.name) : undefined) ?? 'Imported List',
    pointsLimit: Number.isFinite(pointsLimit) ? pointsLimit : undefined,
    listPoints: Number.isFinite(listPoints) ? listPoints : undefined,
    pointsTotal,
    gameSystemId:
      typeof gameSystemRaw === 'string' || typeof gameSystemRaw === 'number'
        ? gameSystemRaw
        : undefined,
    units,
    squadCount,
    heroCount,
    raw: json,
  };
}

const SHARE_ID_RE = /^[a-zA-Z0-9_-]{6,40}$/;

export function extractShareId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (SHARE_ID_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get('id') || url.searchParams.get('listId');
    if (id && SHARE_ID_RE.test(id)) return id;
  } catch {
    /* not a URL */
  }
  return null;
}

export async function fetchListById(id: string): Promise<unknown> {
  const url = `https://army-forge.onepagerules.com/api/tts?id=${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Army Forge fetch failed (${res.status}). Try downloading the JSON instead.`);
  }
  return res.json();
}
