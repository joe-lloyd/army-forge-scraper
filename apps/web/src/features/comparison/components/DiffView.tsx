import { useState } from 'react';
import type { ArmyData, Unit, Spell, SpecialRule } from '../types';
import { createRulesDict } from '../utils/diffHelpers';
import { CollapsibleSection } from './CollapsibleSection';
import { TextDiff } from './TextDiff';
import { UnitBaseCard } from './UnitBaseCard';
import { UnitDiffCard } from './UnitDiffCard';

interface DiffViewProps {
  dataA: ArmyData;
  dataB: ArmyData;
  versions?: { a: string; b: string };
  hideHeader?: boolean;
}

export default function DiffView({ dataA, dataB, versions, hideHeader }: DiffViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    'Special Rules': true,
  });

  const toggle = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const rulesDict = createRulesDict(dataA, dataB);

  // Logic to map and sort units
  const mapUnits = (units: Unit[]) => {
    const map = new Map<string, Unit>();
    units.forEach((u) => map.set(u.id, u));
    return map;
  };
  const unitsA = mapUnits(dataA.units);
  const unitsB = mapUnits(dataB.units);
  const allIds = new Set([...unitsA.keys(), ...unitsB.keys()]);

  const unitRows = Array.from(allIds).map((id) => {
    const uA = unitsA.get(id);
    let uB = unitsB.get(id);
    if (!uB && uA) uB = dataB.units.find((u) => u.name === uA.name);

    if (!uA && uB) return { id, uA: null, uB, status: 'NEW' };
    if (uA && !uB) return { id, uA, uB: null, status: 'DELETED' };

    const changed = JSON.stringify(uA) !== JSON.stringify(uB);
    return { id, uA, uB, status: changed ? 'CHANGED' : 'SAME' };
  });

  unitRows.sort((a, b) => {
    const score = (s: string) => (s === 'SAME' ? 0 : 1);
    return score(b.status) - score(a.status);
  });

  const formatArmyGenericName = (name: string, gn?: string) => {
    if (!gn) return '';
    const parts = gn
      .split('||')
      .map((p) => p.trim())
      .filter(Boolean);
    return [...new Set(parts)].filter((p) => p !== name).join(' / ');
  };

  const renderDescription = (text: string | undefined, version: string) => (
    <div className="glass-card p-6 h-full">
      <h4 className="text-xl font-bold text-white mb-2 underline decoration-sky-500/50 decoration-2 underline-offset-4">
        Description ({version})
      </h4>
      <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
        {text || 'No description available.'}
      </p>
    </div>
  );

  const renderDescriptionDiff = () => {
    const textA = dataA.background || '';
    const textB = dataB.background || '';
    const isSame = textA === textB;

    return (
      <div
        className={`glass-card p-4 md:p-6 h-full flex flex-col items-center justify-center text-center ${isSame ? 'opacity-50' : 'border-lime-400/30'}`}
      >
        <h4 className="text-xl font-bold text-white mb-2">Description Status</h4>
        {isSame ? (
          <div className="text-left text-sm whitespace-pre-wrap leading-relaxed opacity-50">
            {textA || 'No description.'}
          </div>
        ) : (
          <div className="text-left text-sm whitespace-pre-wrap leading-relaxed">
            <TextDiff textA={textA} textB={textB} />
          </div>
        )}
      </div>
    );
  };

  const renderSpells = (spells: Spell[] | undefined, version: string) => (
    <div className="glass-card p-6 h-full">
      <h4 className="text-xl font-bold text-white mb-4 underline decoration-purple-500/50 decoration-2 underline-offset-4">
        Spells ({version})
      </h4>
      {!spells?.length ? (
        <span className="text-slate-500 italic">No spells.</span>
      ) : (
        <div className="flex flex-col gap-3">
          {spells.map((spell) => (
            <div key={spell.id} className="bg-white/5 p-3 rounded-lg border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-200">{spell.name}</span>
                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                  {spell.threshold}+
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-snug">{spell.effect}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSpellsDiff = () => {
    const spellsA = dataA.spells || [];
    const spellsB = dataB.spells || [];

    const namesA = spellsA.map((s) => s.name);
    const namesB = spellsB.map((s) => s.name);
    const allNames = Array.from(new Set([...namesA, ...namesB]));

    const renderDiffItem = (name: string) => {
      const sA = spellsA.find((s) => s.name === name);
      const sB = spellsB.find((s) => s.name === name);

      if (sA && !sB)
        return (
          <div key={name} className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 w-full text-left">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-red-500 line-through">{name}</span>
              {sA.threshold && <span className="text-xs text-red-500 opacity-60">{sA.threshold}+</span>}
            </div>
            <p className="text-xs text-red-500/60 leading-snug line-through">{sA.effect}</p>
          </div>
        );

      if (!sA && sB)
        return (
          <div key={name} className="bg-lime-400/10 p-3 rounded-lg border border-lime-400/30 w-full text-left">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-lime-400">{name}</span>
              {sB.threshold && (
                <span className="text-xs bg-lime-400 text-black px-1.5 py-0.5 rounded font-bold">
                  {sB.threshold}+
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-snug">{sB.effect}</p>
          </div>
        );

      if (sA && sB) {
        const thresholdChanged = sA.threshold !== sB.threshold;
        const effectChanged = sA.effect !== sB.effect;

        if (thresholdChanged || effectChanged) {
          return (
            <div key={name} className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/30 w-full text-left">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sky-400">{name}</span>
                {thresholdChanged ? (
                  <span className="text-xs font-bold text-sky-400">
                    {sA.threshold}+ &rarr; {sB.threshold}+
                  </span>
                ) : (
                  <span className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30">
                    {sB.threshold}+
                  </span>
                )}
              </div>
              <p className="text-xs leading-snug">
                <TextDiff textA={sA.effect} textB={sB.effect} />
              </p>
            </div>
          );
        }
        return (
          <div key={name} className="p-3 rounded-lg border border-transparent w-full text-left opacity-30">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-slate-500">{name}</span>
              <span className="text-xs bg-slate-500/20 text-slate-500 px-2 py-0.5 rounded border border-slate-500/30">
                {sB.threshold}+
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-snug">{sB.effect}</p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="glass-card p-4 md:p-6 h-full border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
        <h4 className="text-xl font-bold text-white mb-4 text-center">Changes</h4>
        <div className="flex flex-col gap-3 items-center">{allNames.map(renderDiffItem)}</div>
      </div>
    );
  };

  const renderRefSection = (title: string, rules: SpecialRule[] | undefined, version: string) => (
    <div className="glass-card p-6 h-full">
      <h4 className="text-xl font-bold text-white mb-4 underline decoration-amber-500/50 decoration-2 underline-offset-4">
        {title} ({version})
      </h4>
      {!rules?.length ? (
        <span className="text-slate-500 italic">No rules.</span>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white/5 p-3 rounded-lg border border-white/5">
              <span className="font-bold text-slate-200 block mb-1">{rule.name}</span>
              <p className="text-xs text-slate-400 leading-snug">{rule.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderRefDiff = (title: string, rulesA: SpecialRule[] = [], rulesB: SpecialRule[] = []) => {
    const namesA = rulesA.map((r) => r.name);
    const namesB = rulesB.map((r) => r.name);
    const allNames = Array.from(new Set([...namesA, ...namesB]));

    const renderDiffItem = (name: string) => {
      const rA = rulesA.find((r) => r.name === name);
      const rB = rulesB.find((r) => r.name === name);

      if (rA && !rB)
        return (
          <div key={name} className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 w-full text-left">
            <span className="font-bold text-red-500 line-through block mb-1">{name}</span>
            <p className="text-xs text-red-500/60 leading-snug line-through">{rA.description}</p>
          </div>
        );

      if (!rA && rB)
        return (
          <div key={name} className="bg-lime-400/10 p-3 rounded-lg border border-lime-400/30 w-full text-left">
            <span className="font-bold text-lime-400 block mb-1">{name}</span>
            <p className="text-xs text-slate-300 leading-snug">{rB.description}</p>
          </div>
        );

      if (rA && rB) {
        if (rA.description !== rB.description) {
          return (
            <div key={name} className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/30 w-full text-left">
              <span className="font-bold text-sky-400 block mb-1">{name}</span>
              <p className="text-xs leading-snug">
                <TextDiff textA={rA.description} textB={rB.description} />
              </p>
            </div>
          );
        }
        return (
          <div key={name} className="p-3 rounded-lg border border-transparent w-full text-left opacity-30">
            <span className="font-bold text-slate-500 block mb-1">{name}</span>
            <p className="text-xs text-slate-500 leading-snug">{rB.description}</p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="glass-card p-4 md:p-6 h-full border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
        <h4 className="text-xl font-bold text-white mb-4 text-center">{title} Changes</h4>
        <div className="flex flex-col gap-3 items-center">{allNames.map(renderDiffItem)}</div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in pb-16">
      {!hideHeader && (
        <div className="w-screen relative left-1/2 -translate-x-1/2 grid grid-cols-3 gap-2 md:gap-6 mb-4 px-4 md:px-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-[60] py-4 border-b border-white/5">
          <h3 className="text-center text-slate-400 font-semibold text-base md:text-xl break-words">
            {dataA.name}{' '}
            {formatArmyGenericName(dataA.name, dataA.genericName) ? (
              <span className="opacity-70 text-sm">
                [{formatArmyGenericName(dataA.name, dataA.genericName)}]
              </span>
            ) : (
              ''
            )}
            <span className="text-sm opacity-50 block mt-1">{versions?.a || 'Version A'}</span>
          </h3>
          <h3 className="text-center text-sky-400 font-bold tracking-widest text-base md:text-xl flex items-center justify-center">
            VS
          </h3>
          <h3 className="text-center text-slate-400 font-semibold text-base md:text-xl break-words">
            {dataB.name}{' '}
            {formatArmyGenericName(dataB.name, dataB.genericName) ? (
              <span className="opacity-70 text-sm">
                [{formatArmyGenericName(dataB.name, dataB.genericName)}]
              </span>
            ) : (
              ''
            )}
            <span className="text-sm opacity-50 block mt-1">{versions?.b || 'Version B'}</span>
          </h3>
        </div>
      )}

      {/* Army Wide Section */}
      <div className="space-y-4 mb-4">
        {/* Description */}
        <CollapsibleSection
          title="Description"
          isOpen={!collapsed['Description']}
          onToggle={() => toggle('Description')}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 md:px-4">
            <div className="hidden md:block">{renderDescription(dataA.background, versions?.a || 'A')}</div>
            <div>{renderDescriptionDiff()}</div>
            <div className="hidden md:block">{renderDescription(dataB.background, versions?.b || 'B')}</div>
          </div>
        </CollapsibleSection>

        {/* Spells */}
        <div className="my-8">
          <CollapsibleSection
            title="Spells"
            isOpen={!collapsed['Spells']}
            onToggle={() => toggle('Spells')}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 md:px-4">
              <div className="hidden md:block">{renderSpells(dataA.spells, versions?.a || 'A')}</div>
              <div>{renderSpellsDiff()}</div>
              <div className="hidden md:block">{renderSpells(dataB.spells, versions?.b || 'B')}</div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Special Rules */}
        <div className="my-8">
          <CollapsibleSection
            title="Special Rules"
            isOpen={!collapsed['Special Rules']}
            onToggle={() => toggle('Special Rules')}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 md:px-4">
              <div className="hidden md:block">
                {renderRefSection('Special Rules', dataA.specialRules, versions?.a || 'A')}
              </div>
              <div>
                {renderRefDiff('Special Rules', dataA.specialRules, dataB.specialRules)}
              </div>
              <div className="hidden md:block">
                {renderRefSection('Special Rules', dataB.specialRules, versions?.b || 'B')}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>

      <CollapsibleSection
        title="Unit Changes"
        isOpen={!collapsed['Unit Changes']}
        onToggle={() => toggle('Unit Changes')}
      >
        <div className="px-2 md:px-4">
          {unitRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-stretch border-b border-white/5 pb-8 last:border-0"
            >
              <div className="hidden md:block">
                <UnitBaseCard unit={row.uA} data={dataA} version="Ver A" rulesDict={rulesDict} />
              </div>

              <div className="flex flex-col h-full">
                {row.status === 'SAME' && (
                  <UnitBaseCard unit={row.uB} data={dataB} version="Ver B" rulesDict={rulesDict} />
                )}
                {row.status === 'NEW' && (
                  <div className="h-full border-2 border-lime-400/50 bg-lime-400/5 shadow-[0_0_15px_rgba(163,230,53,0.1)] rounded-xl relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-lime-400 z-10 rounded-t-xl"></div>
                    <UnitBaseCard unit={row.uB} data={dataB} version="Ver B" rulesDict={rulesDict} />
                  </div>
                )}
                {row.status === 'DELETED' && (
                  <div className="h-full border-2 border-red-500/50 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)] rounded-xl relative grayscale opacity-75">
                    <div className="absolute top-0 left-0 w-full h-1 bg-red-500 z-10 rounded-t-xl"></div>
                    <UnitBaseCard unit={row.uA} data={dataA} version="Ver A" rulesDict={rulesDict} />
                  </div>
                )}
                {row.status === 'CHANGED' && (
                  <UnitDiffCard
                    uA={row.uA!}
                    uB={row.uB!}
                    dataA={dataA}
                    dataB={dataB}
                    rulesDict={rulesDict}
                  />
                )}
              </div>

              <div className="hidden md:block">
                <UnitBaseCard unit={row.uB} data={dataB} version="Ver B" rulesDict={rulesDict} />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
