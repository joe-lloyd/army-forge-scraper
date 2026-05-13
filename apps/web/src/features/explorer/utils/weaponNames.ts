// Shared name-matching + target-parsing primitives for the OPR upgrade engine.
//
// This file is the single source of truth for how `section.targets[]` strings
// are interpreted across the app (explorer detail view AND analyzer). Army
// Forge's own production bundle does the equivalent in `forEachTarget()` +
// `compareEquipmentNames()` — both lowercase the strings, singularize them, and
// compare. We mirror that contract here.
//
// We don't pull in the `pluralize` npm package: OPR's weapon-name corpus only
// produces ~10 tricky plurals (Axes/Bashes/Hooves/Sentries plus regular
// s/es/ies), so a small explicit table is enough.
import type { Weapon } from '@opr-api/shared';

// Words whose plural→singular isn't a clean suffix strip — taken from a sweep
// of every weapon name and upgrade target in the GF data set.
const IRREGULARS: Record<string, string> = {
  axes: 'axe',
  hooves: 'hoof',
  knives: 'knife',
  wolves: 'wolf',
  leaves: 'leaf',
  lives: 'life',
};

// Singularize the last word of a multi-word name. OPR convention puts the noun
// last ("Custodian Axes" → "Custodian Axe", not "Custodian Axes" → "Custodian
// Ax"). Case is preserved by slicing the original input.
export function singularize(input: string): string {
  if (!input) return input;
  const parts = input.split(/\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    return [...parts.slice(0, -1), singularize(last)].join(' ');
  }
  const lower = input.toLowerCase();
  const irreg = IRREGULARS[lower];
  if (irreg) {
    // Preserve original capitalization on the first letter only — good enough
    // for tooltips / debugging since we always compare lowercased.
    return input[0] === input[0].toUpperCase()
      ? irreg[0].toUpperCase() + irreg.slice(1)
      : irreg;
  }
  // consonant + 'ies' → 'y'  (Sentries → Sentry)
  if (/[^aeiou]ies$/i.test(input)) return input.slice(0, -3) + 'y';
  // 'sses', 'shes', 'ches', 'xes', 'zes' → drop 'es'  (Bashes → Bash, Boxes →
  // Box). Note: 'Axes' is caught by the irregular table above, NOT this rule,
  // because we want 'Axe' not 'Ax'.
  if (/(sses|shes|ches|xes|zes)$/i.test(input)) return input.slice(0, -2);
  // plain plural 's'  (Pistols → Pistol, CCWs → CCW)
  if (/[^s]s$/i.test(input)) return input.slice(0, -1);
  return input;
}

// Name-equality used by Army Forge's upgrade engine. Both sides get lowercased,
// trimmed, and singularized before compare. Returns true if either name or
// label matches the target.
export function compareEquipmentNames(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return singularize(a.toLowerCase().trim()) === singularize(b.toLowerCase().trim());
}

export function compareEquipmentToTarget(w: Weapon, target: string): boolean {
  return (
    compareEquipmentNames(w.name, target) ||
    compareEquipmentNames(w.label, target)
  );
}

// One entry per target — the weapon name and the per-application count
// multiplier extracted from a leading "Nx " prefix (e.g. "2x CCW" → count 2).
export interface ParsedTarget {
  name: string;
  count: number;
}

// Mirrors Army Forge's `forEachTarget`. The "Nx " prefix is a per-target swap
// multiplier: "Replace Lord Gauss Pistol and 2x CCW" means each application
// removes one Lord Gauss Pistol AND two CCWs.
export function parseSectionTargets(section: { targets?: string[] } | null | undefined): ParsedTarget[] {
  const raw = section?.targets;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((t) => {
    const s = (t || '').trim();
    const m = /^(\d+)x\s+(.+)$/.exec(s);
    if (m) return { name: m[2].trim(), count: parseInt(m[1], 10) };
    return { name: s, count: 1 };
  });
}
