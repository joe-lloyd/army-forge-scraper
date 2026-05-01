import type { ArmyData, Unit } from '../types';

export const formatBases = (bases?: Record<string, string>) => {
  if (!bases) return '';
  return Object.entries(bases)
    .map(([type, size]) => `${size}mm ${type}`)
    .join(' / ');
};

export const getCostColor = (valA: number, valB: number) => {
  if (valA === valB) return 'var(--text-muted)';
  return valB < valA ? '#bef264' : '#ef4444';
};

export const getStatColor = (valA: number, valB: number) => {
  if (valA === valB) return 'var(--text-muted)';
  return valB < valA ? '#bef264' : '#ef4444';
};

export const getUpgradeDetails = (unit: Unit | null | undefined, data: ArmyData | null) => {
  if (!unit || !data || !unit.upgrades || !data.upgradePackages) return [];

  return unit.upgrades
    .map((uid) => {
      const pkg = data.upgradePackages.find((p) => p.uid === uid);
      if (!pkg) return null;

      const processedSections = pkg.sections.map((section: any) => ({
        ...section,
        options: section.options.map((opt: any) => {
          let finalCost = opt.cost;
          if (opt.costs && Array.isArray(opt.costs)) {
            const match = opt.costs.find((c: any) => c.unitId === unit.id);
            if (match) finalCost = match.cost;
          }
          return { ...opt, finalCost };
        }),
      }));

      return { ...pkg, sections: processedSections };
    })
    .filter(Boolean);
};

export const createRulesDict = (dataA: ArmyData, dataB: ArmyData) => {
  return {
    ...Object.fromEntries((dataA.specialRules || []).map((r) => [r.name, r.description])),
    ...Object.fromEntries((dataB.specialRules || []).map((r) => [r.name, r.description])),
  };
};
