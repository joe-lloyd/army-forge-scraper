import { RuleList } from './RuleText';
import { getCostColor } from '../utils/diffHelpers';
import type { UpgradeSection, UpgradeOption } from '../types';

interface UpgradeSectionTableProps {
  sectionB: UpgradeSection;
  sectionA?: UpgradeSection;
  isDiffMode?: boolean;
}

type RowType = 'removed' | 'added' | 'changed' | 'unchanged' | 'standard';

export function UpgradeSectionTable({ sectionB, sectionA, isDiffMode = false }: UpgradeSectionTableProps) {
  const optsA = sectionA?.options || [];
  const optsB = sectionB.options || [];

  const availableOptsA = [...optsA];
  const mappedB = optsB.map((optB) => {
    if (!isDiffMode) return { opt: optB, type: 'standard' as RowType, optA: undefined };

    const getBase = (label: string) => (label || '').split('(')[0].trim().toLowerCase();
    const baseB = getBase(optB.label);

    // Step 1: ID/UID match — must ALSO share the same base label to avoid
    // positional ID collisions between versions (e.g. ID "1" meaning different
    // weapons in v1 vs v2).
    let matchIdx = availableOptsA.findIndex((a) => {
      const idMatch = (a.uid && optB.uid && a.uid == optB.uid) || (a.id && optB.id && a.id == optB.id);
      return idMatch && getBase(a.label) === baseB;
    });

    // Step 2: Exact label match (most reliable cross-version identifier)
    if (matchIdx === -1) {
      matchIdx = availableOptsA.findIndex((a) => a.label === optB.label);
    }

    // Step 3: Base label match — only use when base is long enough to be
    // meaningful (> 6 chars) to avoid false matches on short labels like "A3".
    if (matchIdx === -1 && baseB.length > 6) {
      matchIdx = availableOptsA.findIndex((a) => getBase(a.label) === baseB);
    }

    if (matchIdx !== -1) {
      const optA = availableOptsA[matchIdx];
      availableOptsA.splice(matchIdx, 1);
      const isCostChanged =
        optA.finalCost !== undefined &&
        optB.finalCost !== undefined &&
        optA.finalCost !== optB.finalCost;
      const isLabelChanged = optA.label !== optB.label;
      const isChanged = isCostChanged || isLabelChanged;

      return {
        opt: optB,
        type: (isChanged ? 'changed' : 'unchanged') as RowType,
        optA,
      };
    }
    return { opt: optB, type: 'added' as RowType, optA: undefined };
  });

  const removedOpts = isDiffMode ? availableOptsA : [];
  const allSectionOptions = [...(isDiffMode ? optsA : []), ...optsB];
  const hasWeapons = allSectionOptions.some((opt) =>
    (opt.gains || []).some((g: any) => g.attacks !== undefined || g.range !== undefined)
  );
  const hasSpecial = allSectionOptions.some((opt) =>
    (opt.gains || []).some((g: any) => g.specialRules && g.specialRules.length > 0)
  );

  const renderRow = (
    opt: UpgradeOption,
    type: RowType,
    outerIdx: number,
    optA?: UpgradeOption
  ) => {
    const weapons = (opt.gains || []).filter(
      (g) => g.attacks !== undefined || g.range !== undefined
    );

    let rowClass = 'border-b border-white/5 last:border-0 transition-colors';
    let textClass = 'text-slate-300';
    let costText: React.ReactNode = `${opt.finalCost}pts`;
    let labelText = opt.label.split('(')[0].trim();

    if (type === 'removed') {
      rowClass = 'bg-red-500/40 border-red-500/50';
      textClass = 'text-red-500 line-through';
      labelText = opt.label.split('(')[0].trim();
    } else if (type === 'added') {
      rowClass = 'bg-lime-400/40 border-lime-400/50';
      textClass = 'text-lime-400';
    } else if (type === 'changed') {
      rowClass = 'bg-black/30 border-white/10';
      const diff = (opt.finalCost ?? 0) - (optA?.finalCost ?? 0);
      const color = getCostColor(optA?.finalCost ?? 0, opt.finalCost ?? 0);
      costText = (
        <span style={{ color, fontWeight: 'bold' }}>
          {optA?.finalCost} → {opt.finalCost} ({diff > 0 ? '+' : ''}
          {diff})pts
        </span>
      );
      textClass = 'text-slate-200';
    } else if (type === 'unchanged') {
      rowClass = 'bg-black/30 border-white/10';
      textClass = 'text-slate-200';
    }

    const weaponRows = weapons.length > 0 ? weapons : [{ name: labelText, isDummy: true }];

    return weaponRows.map((w: any, idx: number) => (
      <tr key={`${opt.id || 'opt'}-${outerIdx}-${idx}`} className={`${rowClass} text-xs`}>
        <td className={`py-1 px-2 ${textClass} font-medium`}>
          {idx === 0 ? labelText : ''}
          {weapons.length > 1 && !w.isDummy && (
            <div className="pl-2 text-[10px] text-slate-400">- {w.name || w.label}</div>
          )}
          {weapons.length === 1 && !w.isDummy && w.name !== labelText && (
            <div className="pl-2 text-[10px] text-slate-400">- {w.name || w.label}</div>
          )}
        </td>
        {hasWeapons && (
          <>
            <td className={`py-1 text-center ${textClass}`}>
              {w.range ? `${w.range}"` : w.isDummy ? '-' : 'M'}
            </td>
            <td className={`py-1 text-center ${textClass}`}>
              {w.attacks || (w.isDummy ? '-' : '')}
            </td>
            {hasSpecial && (
              <td className={`py-1 text-[10px] ${textClass}`}>
                {w.specialRules?.length ? <RuleList rules={w.specialRules} /> : '-'}
              </td>
            )}
          </>
        )}
        {!hasWeapons && hasSpecial && (
          <td className={`py-1 text-[10px] ${textClass}`}>
            {w.specialRules?.length ? <RuleList rules={w.specialRules} /> : '-'}
          </td>
        )}
        <td className={`py-1 px-2 text-right ${textClass}`}>
          {idx === 0 ? costText : ''}
        </td>
      </tr>
    ));
  };

  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-xs italic text-slate-500">{sectionB.label}</div>
      <div className="w-full overflow-hidden rounded border border-white/10">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-white/5 text-[10px] font-semibold uppercase text-slate-500">
              <th className="px-2 py-1">Option / Weapon</th>
              {hasWeapons && (
                <>
                  <th className="w-12 py-1 text-center">Rng</th>
                  <th className="w-8 py-1 text-center">A</th>
                </>
              )}
              {hasSpecial && <th className="w-1/4 py-1">Special</th>}
              <th className="px-2 py-1 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {removedOpts.map((opt, i) => renderRow(opt, 'removed', i))}
            {mappedB.map((item, i) =>
              renderRow(item.opt, item.type, i + removedOpts.length, item.optA)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
