import { diffArrays } from 'diff';
import type { Unit, ArmyData } from '../types';
import RuleText, { RuleList } from './RuleText';
import { formatBases, getCostColor, getStatColor, getUpgradeDetails } from '../utils/diffHelpers';
import { UpgradeSectionTable } from './UpgradeSectionTable';

interface UnitDiffCardProps {
  uA: Unit;
  uB: Unit;
  dataA: ArmyData;
  dataB: ArmyData;
  rulesDict: Record<string, string>;
}

export function UnitDiffCard({ uA, uB, dataA, dataB, rulesDict }: UnitDiffCardProps) {
  const costDiff = uB.cost - uA.cost;
  const costText =
    costDiff === 0
      ? `${uB.cost}pts`
      : `${uA.cost} → ${uB.cost} (${costDiff > 0 ? '+' : ''}${costDiff})pts`;
  const costStyle =
    costDiff === 0
      ? {}
      : { color: getCostColor(uA.cost, uB.cost), fontWeight: 'bold' };

  const renderStatDiff = (valA: number, valB: number) => {
    if (valA === valB) return <span>{valB}+</span>;
    return (
      <span style={{ color: getStatColor(valA, valB), fontWeight: 'bold' }}>
        {valA}+ → {valB}+
      </span>
    );
  };

  const serializeW = (w: any) =>
    JSON.stringify({
      name: w.name,
      count: w.count || 1,
      range: w.range,
      attacks: w.attacks,
      specialRules: w.specialRules || [],
      isItem: false,
    });

  const serializeItem = (item: any) =>
    JSON.stringify({
      name: item.name,
      count: item.count || 1,
      specialRules: item.content || [],
      isItem: true,
    });

  const wA = [...uA.weapons.map(serializeW), ...(uA.items || []).map(serializeItem)];
  const wB = [...uB.weapons.map(serializeW), ...(uB.items || []).map(serializeItem)];
  const wDiffs = diffArrays(wA, wB);

  const fmtRule = (r: any) => {
    const name = r.name || r.label;
    return r.rating ? `${name}(${r.rating})` : name;
  };
  const rA = uA.rules.map(fmtRule);
  const rB = uB.rules.map(fmtRule);
  const rDiffs = diffArrays(rA, rB);

  const upgradeDetailsA = getUpgradeDetails(uA, dataA);
  const upgradeDetailsB = getUpgradeDetails(uB, dataB);

  const renderDiffRule = (ruleStr: string) => {
    const match = ruleStr.match(/^(.+?)(?:\((.+?)\))?$/);
    if (!match) return <span>{ruleStr}</span>;
    const name = match[1];
    const rating = match[2];
    return <RuleText rule={{ name, rating }} specialRulesDict={rulesDict} />;
  };

  return (
    <div className="glass-card overflow-hidden h-full p-2 relative border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 to-indigo-500"></div>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="m-0 text-xl font-bold text-white">
            {uA.name !== uB.name ? (
              <span className="text-red-400 line-through mr-2 opacity-70">{uA.name}</span>
            ) : null}
            {uB.name}{' '}
            {uB.genericName ? (
              <span className="text-sm text-slate-400 font-normal">[{uB.genericName}]</span>
            ) : (
              ''
            )}
          </h4>
          {(uA.size || uA.bases || uB.size || uB.bases) && (
            <div className="text-xs text-slate-500 mt-1 flex gap-3">
              {(uA.size || uB.size) && (
                <span>
                  Size:{' '}
                  {uA.size === uB.size ? (
                    uB.size
                  ) : (
                    <span className="text-sky-400 font-bold">
                      {uA.size || 0} &rarr; {uB.size || 0}
                    </span>
                  )}
                </span>
              )}
              {(uA.bases || uB.bases) && (
                <span>
                  Base:{' '}
                  {JSON.stringify(uA.bases) === JSON.stringify(uB.bases) ? (
                    formatBases(uB.bases)
                  ) : (
                    <span className="text-sky-400 font-bold">
                      {formatBases(uA.bases)} &rarr; {formatBases(uB.bases)}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="unit-cost text-white" style={costStyle}>
          {costText}
        </span>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="bg-white/5 px-3 py-1 rounded-lg">
          <span className="text-xs text-slate-400 uppercase tracking-wider block">Quality</span>
          <div className="font-bold text-lg text-white">{renderStatDiff(uA.quality, uB.quality)}</div>
        </div>
        <div className="bg-white/5 px-3 py-1 rounded-lg">
          <span className="text-xs text-slate-400 uppercase tracking-wider block">Defense</span>
          <div className="font-bold text-lg text-white">{renderStatDiff(uA.defense, uB.defense)}</div>
        </div>
      </div>

      {/* Equipment Changes */}
      <div className="mb-4">
        <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
          Equipment Changes
        </div>
        {wDiffs.map((part, partIdx) => {
          return part.value.map((wJson, itemIdx) => {
            const { name, count, range, attacks, specialRules, isItem } = JSON.parse(wJson);
            const countStr = count > 1 ? `${count}x ` : '';
            const key = `${partIdx}-${itemIdx}`;

            const detailsEl = isItem ? (
              specialRules?.length > 0 && <RuleList rules={specialRules} specialRulesDict={rulesDict} />
            ) : (
              <>
                {range ? `${range}"` : 'Melee'}, A{attacks}
                {specialRules?.length > 0 && ', '}
                <RuleList rules={specialRules} specialRulesDict={rulesDict} />
              </>
            );

            if (part.added) {
              return (
                <div
                  key={key}
                  className="text-sm mb-1 text-lime-400 bg-lime-400/10 px-1 py-0.5 rounded inline-block w-full"
                >
                  <span className="font-semibold">+ {countStr}{name}</span>{' '}
                  <span className="text-lime-400/80">({detailsEl})</span>
                </div>
              );
            }
            if (part.removed) {
              return (
                <div
                  key={key}
                  className="text-sm mb-1 text-red-500 bg-red-500/10 px-1 py-0.5 rounded inline-block w-full line-through decoration-red-500/50"
                >
                  <span className="font-semibold opacity-75">- {countStr}{name}</span>{' '}
                  <span className="opacity-60">({detailsEl})</span>
                </div>
              );
            }
            // Unchanged
            return (
              <div key={key} className="text-sm mb-1">
                <span className="font-medium">{countStr}{name}</span>
                <span className="text-slate-400"> ({detailsEl})</span>
              </div>
            );
          });
        })}
      </div>

      {/* Rules Changes */}
      <div className="mb-4">
        <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
          Rules Changes
        </div>
        <div className="text-sm leading-relaxed">
          {rDiffs.map((part, partIdx) => {
            return part.value.map((ruleName, itemIdx) => {
              const key = `${partIdx}-${itemIdx}`;
              const isLastPart = partIdx === rDiffs.length - 1;
              const isLastItemInPart = itemIdx === part.value.length - 1;
              const isLastOverall = isLastPart && isLastItemInPart;
              const suffix = isLastOverall ? '' : ', ';

              if (part.added) {
                return (
                  <span key={key} className="text-lime-400 font-bold">
                    + {renderDiffRule(ruleName)}
                    {suffix}
                  </span>
                );
              }
              if (part.removed) {
                return (
                  <span key={key} className="text-red-500 line-through opacity-80">
                    - {renderDiffRule(ruleName)}
                    {suffix}
                  </span>
                );
              }
              return (
                <span key={key} className="text-slate-400">
                  {renderDiffRule(ruleName)}
                  {suffix}
                </span>
              );
            });
          })}
        </div>
      </div>

      {/* Upgrade Details (With Comparison) */}
      {upgradeDetailsB.length > 0 && (
        <div>
          <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
            Upgrades (Vs Version B)
          </div>
          <div className="flex flex-col gap-3">
            {upgradeDetailsB.map((pkgB: any) => {
              const pkgA = upgradeDetailsA.find((p: any) => p?.uid === pkgB.uid);
              const isNewPkg = !pkgA;
              const usedSectionAIds = new Set<string>();

              return (
                <div
                  key={pkgB.uid}
                  className={`rounded-lg p-2 border ${
                    isNewPkg ? 'bg-lime-400/5 border-lime-400/50' : 'bg-white/5 border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-white/10">
                    <div className={`text-sm font-bold ${isNewPkg ? 'text-lime-400' : 'text-sky-400'}`}>
                      {pkgB.hint}
                    </div>
                    {isNewPkg && (
                      <span className="text-[10px] bg-lime-400 text-black font-bold px-1 rounded">
                        NEW
                      </span>
                    )}
                  </div>

                  {pkgB.sections.map((sectionB: any) => {
                    // Robust matching: 1. Try exact UID or ID match
                    let sectionA = pkgA?.sections.find(
                      (s: any) =>
                        (s.uid && sectionB.uid && s.uid === sectionB.uid) ||
                        (s.id && sectionB.id && s.id === sectionB.id)
                    );

                    const getSid = (s: any) => s.uid || s.id;

                    // 2. If no match or collision, try label match (skipping used IDs)
                    if (sectionA && usedSectionAIds.has(getSid(sectionA))) {
                      sectionA = undefined;
                    }

                    if (!sectionA && pkgA) {
                      sectionA = pkgA.sections.find(
                        (s: any) =>
                          s.label === sectionB.label && !usedSectionAIds.has(getSid(s))
                      );
                    }

                    if (sectionA) {
                      usedSectionAIds.add(getSid(sectionA));
                    }

                    return (
                      <UpgradeSectionTable
                        key={sectionB.id}
                        sectionB={sectionB}
                        sectionA={sectionA}
                        isDiffMode={true}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
