import React, { useState } from "react";
import { diffWords, diffArrays } from "diff";

interface Unit {
  id: string;
  name: string;
  cost: number;
  quality: number;
  defense: number;
  weapons: any[];
  rules: any[];
  upgrades: string[]; // List of package UIDs
}

interface UpgradePackage {
  uid: string;
  hint: string;
  sections: any[];
}

interface Spell {
  id: string;
  name: string;
  threshold: number;
  effect: string;
}

interface SpecialRule {
  id: string;
  name: string;
  description: string;
}

interface ArmyData {
  name: string;
  units: Unit[];
  upgradePackages: UpgradePackage[];
  rules?: any[];
  spells?: Spell[];
  specialRules?: SpecialRule[];
  background?: string;
}

interface DiffViewProps {
  dataA: ArmyData;
  dataB: ArmyData;
}

const CollapsibleSection = ({
  title,
  isOpen,
  onToggle,
  children,
  headerClass = "text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-500",
}: {
  title: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  headerClass?: string;
}) => {
  return (
    <div className="mb-8 border-b border-white/5 pb-8 last:border-0 last:pb-0">
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center group focus:outline-none mb-4 px-4"
      >
        <div className={headerClass}>{title}</div>
        <div
          className={`transition-transform duration-300 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-500 group-hover:text-sky-400"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </button>

      <div
        className={`transition-all duration-500 overflow-hidden ${
          isOpen ? "max-h-[50000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
};

const TextDiff = ({ textA, textB }: { textA: string; textB: string }) => {
  const diffs = diffWords(textA, textB);

  return (
    <span>
      {diffs.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="bg-lime-400/20 text-lime-400 font-bold"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="bg-red-500/20 text-red-500 line-through opacity-70"
            >
              {part.value}
            </span>
          );
        }
        return (
          <span key={index} className="text-slate-300">
            {part.value}
          </span>
        );
      })}
    </span>
  );
};

export default function DiffView({ dataA, dataB }: DiffViewProps) {
  // Collapsed state map. If a key is true, it is CLOSED.
  // Wait, better to be explicit about OPEN state?
  // The request says "special rules collapsed by default".
  // Let's store "collapsed" state, true = collapsed.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    "Special Rules": true,
  });

  const toggle = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Helpers for dynamic colors (still using style for dynamic values)
  const getCostColor = (valA: number, valB: number) => {
    if (valA === valB) return "var(--text-muted)";
    return valB < valA ? "#bef264" : "#ef4444";
  };

  const getStatColor = (valA: number, valB: number) => {
    if (valA === valB) return "var(--text-muted)";
    // Lower is better for Q/D
    return valB < valA ? "#bef264" : "#ef4444";
  };

  const getUpgradeDetails = (
    unit: Unit | null | undefined,
    data: ArmyData | null,
  ) => {
    if (!unit || !data || !unit.upgrades || !data.upgradePackages) return [];

    // Map unit's upgrade UIDs to actual package data
    return unit.upgrades
      .map((uid) => {
        const pkg = data.upgradePackages.find((p) => p.uid === uid);
        if (!pkg) return null;

        // Process sections and options to resolve costs for THIS unit
        const processedSections = pkg.sections.map((section: any) => ({
          ...section,
          options: section.options.map((opt: any) => {
            let finalCost = opt.cost;
            // Handle new structure where costs is an array of {cost, unitId}
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

  const renderUnitCard = (
    unit: Unit | null | undefined,
    data: ArmyData | null,
    version: string,
  ) => {
    if (!unit || !data)
      return (
        <div className="glass-card h-full p-6 opacity-50 flex items-center justify-center">
          <span className="italic text-slate-400">
            Not present in {version}
          </span>
        </div>
      );

    const upgradeDetails = getUpgradeDetails(unit, data);

    return (
      <div className="glass-card h-full p-6 relative overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h4 className="m-0 text-xl font-bold text-white">{unit.name}</h4>
          <span className="unit-cost font-bold text-sky-400">
            {unit.cost}pts
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-4">
          <div className="bg-white/5 px-3 py-1 rounded-lg">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">
              Quality
            </span>
            <div className="font-bold text-lg text-white">{unit.quality}+</div>
          </div>
          <div className="bg-white/5 px-3 py-1 rounded-lg">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">
              Defense
            </span>
            <div className="font-bold text-lg text-white">{unit.defense}+</div>
          </div>
        </div>

        {/* Equipment */}
        <div className="mb-4">
          <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
            Equipment
          </div>
          {unit.weapons.map((w, idx) => (
            <div key={idx} className="text-sm mb-1">
              <span className="text-slate-100 font-medium">
                {w.count > 1 ? `${w.count}x ` : ""}
                {w.name}
              </span>
              <span className="text-slate-400">
                {" "}
                ({w.range ? `${w.range}"` : "Melee"}, A{w.attacks}
                {w.specialRules?.length > 0
                  ? `, ${w.specialRules.map((r: any) => r.name).join(", ")}`
                  : ""}
                )
              </span>
            </div>
          ))}
        </div>

        {/* Rules */}
        <div className="mb-4">
          <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
            Rules
          </div>
          <div className="text-sm text-slate-400 leading-relaxed">
            {unit.rules.map((r) => r.name || r.label).join(", ")}
          </div>
        </div>

        {/* Upgrades Table */}
        {upgradeDetails.length > 0 && (
          <div>
            <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
              Upgrades
            </div>
            <div className="flex flex-col gap-3">
              {upgradeDetails.map((pkg: any) => (
                <div
                  key={pkg.uid}
                  className="bg-white/5 rounded-lg p-2 border border-white/5"
                >
                  <div className="text-sm text-sky-400 font-bold mb-1 pb-1 border-b border-white/10">
                    {pkg.hint}
                  </div>
                  {pkg.sections.map((section: any) => (
                    <div key={section.id} className="mb-2 last:mb-0">
                      <div className="text-xs text-slate-500 mb-1 italic">
                        {section.label}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {section.options.map((opt: any) => (
                          <div
                            key={opt.id}
                            className="text-xs bg-black/30 px-2 py-0.5 rounded border border-white/10 flex items-center"
                          >
                            <span className="text-slate-200">
                              {opt.label.split("(")[0].trim()}
                            </span>
                            {opt.finalCost !== undefined && (
                              <span className="text-slate-500 ml-1">
                                {opt.finalCost}pts
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMergedCard = (
    uA: Unit,
    uB: Unit,
    dataA: ArmyData,
    dataB: ArmyData,
    upgradeUidsA: string[],
  ) => {
    // Cost Diff
    const costDiff = uB.cost - uA.cost;
    const costText =
      costDiff === 0
        ? `${uB.cost}pts`
        : `${uA.cost} → ${uB.cost} (${costDiff > 0 ? "+" : ""}${costDiff})`;
    const costStyle =
      costDiff === 0
        ? {}
        : { color: getCostColor(uA.cost, uB.cost), fontWeight: "bold" };

    // Stat Diffs
    const renderStatDiff = (valA: number, valB: number) => {
      if (valA === valB) return <span>{valB}+</span>;
      return (
        <span style={{ color: getStatColor(valA, valB), fontWeight: "bold" }}>
          {valA}+ → {valB}+
        </span>
      );
    };

    // Weapons Diff Logic
    const formatWDetails = (w: any) =>
      `(${w.range ? w.range + '"' : "Melee"}, A${w.attacks}${w.specialRules?.length > 0 ? `, ${w.specialRules.map((r: any) => r.name).join(", ")}` : ""})`;

    const serializeW = (w: any) =>
      JSON.stringify({
        name: w.name,
        count: w.count || 1,
        details: formatWDetails(w),
      });

    const wA = uA.weapons.map(serializeW);
    const wB = uB.weapons.map(serializeW);
    const wDiffs = diffArrays(wA, wB);

    // Rules Diff Logic
    const rA = uA.rules.map((r) => r.name || r.label);
    const rB = uB.rules.map((r) => r.name || r.label);
    const rDiffs = diffArrays(rA, rB);

    // Upgrade Details (Using B as base, highlighting new)
    const upgradeDetailsB = getUpgradeDetails(uB, dataB);

    return (
      <div className="glass-card h-full p-6 relative border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.1)] overflow-hidden">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 to-indigo-500"></div>

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h4 className="m-0 text-xl font-bold text-white">{uB.name}</h4>
          <span className="unit-cost text-white" style={costStyle}>
            {costText}
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-4">
          <div className="bg-white/5 px-3 py-1 rounded-lg">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">
              Quality
            </span>
            <div className="font-bold text-lg text-white">
              {renderStatDiff(uA.quality, uB.quality)}
            </div>
          </div>
          <div className="bg-white/5 px-3 py-1 rounded-lg">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">
              Defense
            </span>
            <div className="font-bold text-lg text-white">
              {renderStatDiff(uA.defense, uB.defense)}
            </div>
          </div>
        </div>

        {/* Equipment Changes */}
        <div className="mb-4">
          <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
            Equipment Changes
          </div>
          {wDiffs.map((part, partIdx) => {
            return part.value.map((wJson, itemIdx) => {
              const { name, count, details } = JSON.parse(wJson);
              const countStr = count > 1 ? `${count}x ` : "";
              const key = `${partIdx}-${itemIdx}`;

              if (part.added) {
                return (
                  <div
                    key={key}
                    className="text-sm mb-1 text-lime-400 bg-lime-400/10 px-1 py-0.5 rounded inline-block w-full"
                  >
                    <span className="font-semibold">
                      + {countStr}
                      {name}
                    </span>{" "}
                    <span className="text-lime-400/80">{details}</span>
                  </div>
                );
              }
              if (part.removed) {
                return (
                  <div
                    key={key}
                    className="text-sm mb-1 text-red-500 bg-red-500/10 px-1 py-0.5 rounded inline-block w-full line-through decoration-red-500/50"
                  >
                    <span className="font-semibold opacity-75">
                      - {countStr}
                      {name}
                    </span>{" "}
                    <span className="opacity-60">{details}</span>
                  </div>
                );
              }
              // Unchanged
              return (
                <div key={key} className="text-sm mb-1">
                  <span className="text-slate-100 font-medium">
                    {countStr}
                    {name}
                  </span>
                  <span className="text-slate-400"> {details}</span>
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
                // We'll just separate with spaces/commas visually or just spans
                const suffix = " ";

                if (part.added) {
                  return (
                    <span key={key} className="text-lime-400 font-bold">
                      + {ruleName}
                      {suffix}
                    </span>
                  );
                }
                if (part.removed) {
                  return (
                    <span
                      key={key}
                      className="text-red-500 line-through opacity-80"
                    >
                      - {ruleName}
                      {suffix}
                    </span>
                  );
                }
                return (
                  <span key={key} className="text-slate-400">
                    {ruleName}
                    {suffix}
                  </span>
                );
              });
            })}
          </div>
        </div>

        {/* Upgrade Details (With New Badge) */}
        {upgradeDetailsB.length > 0 && (
          <div>
            <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
              Upgrades (Vs Version B)
            </div>
            <div className="flex flex-col gap-3">
              {upgradeDetailsB.map((pkg: any) => {
                const isNew = !upgradeUidsA.includes(pkg.uid);

                return (
                  <div
                    key={pkg.uid}
                    className={`rounded-lg p-2 border ${
                      isNew
                        ? "bg-lime-400/5 border-lime-400/50"
                        : "bg-white/5 border-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1 pb-1 border-b border-white/10">
                      <div
                        className={`text-sm font-bold ${
                          isNew ? "text-lime-400" : "text-sky-400"
                        }`}
                      >
                        {pkg.hint}
                      </div>
                      {isNew && (
                        <span className="text-[10px] bg-lime-400 text-black font-bold px-1 rounded">
                          NEW
                        </span>
                      )}
                    </div>

                    {pkg.sections.map((section: any) => (
                      <div key={section.id} className="mb-2 last:mb-0">
                        <div className="text-xs text-slate-500 mb-1 italic">
                          {section.label}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {section.options.map((opt: any) => (
                            <div
                              key={opt.id}
                              className="text-xs bg-black/30 px-2 py-0.5 rounded border border-white/10 flex items-center"
                            >
                              <span className="text-slate-200">
                                {opt.label.split("(")[0].trim()}
                              </span>
                              {opt.finalCost !== undefined && (
                                <span className="text-slate-500 ml-1">
                                  {opt.finalCost}pts
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

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

    if (!uA && uB) return { id, uA: null, uB, status: "NEW" };
    if (uA && !uB) return { id, uA, uB: null, status: "DELETED" };

    const changed = JSON.stringify(uA) !== JSON.stringify(uB);
    return { id, uA, uB, status: changed ? "CHANGED" : "SAME" };
  });

  unitRows.sort((a, b) => {
    const score = (s: string) => (s === "SAME" ? 0 : 1);
    return score(b.status) - score(a.status);
  });

  // --- New Army Wide Renderers ---

  const renderDescription = (text: string | undefined, version: string) => (
    <div className="glass-card p-6 h-full">
      <h4 className="text-xl font-bold text-white mb-2 underline decoration-sky-500/50 decoration-2 underline-offset-4">
        Description ({version})
      </h4>
      <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
        {text || "No description available."}
      </p>
    </div>
  );

  const renderDescriptionDiff = () => {
    const textA = dataA.background || "";
    const textB = dataB.background || "";
    const isSame = textA === textB;

    return (
      <div
        className={`glass-card p-6 h-full flex flex-col items-center justify-center text-center ${isSame ? "opacity-50" : "border-lime-400/30"}`}
      >
        <h4 className="text-xl font-bold text-white mb-2">
          Description Status
        </h4>
        {isSame ? (
          <div className="text-left text-sm whitespace-pre-wrap leading-relaxed opacity-50">
            {textA || "No description."}
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
            <div
              key={spell.id}
              className="bg-white/5 p-3 rounded-lg border border-white/5"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-200">{spell.name}</span>
                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                  {spell.threshold}+
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-snug">
                {spell.effect}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSpellsDiff = () => {
    const spellsA = dataA.spells || [];
    const spellsB = dataB.spells || [];

    // Simple diff by name match
    const namesA = spellsA.map((s) => s.name);
    const namesB = spellsB.map((s) => s.name);
    const allNames = Array.from(new Set([...namesA, ...namesB]));

    const renderDiffItem = (name: string) => {
      const sA = spellsA.find((s) => s.name === name);
      const sB = spellsB.find((s) => s.name === name);

      if (sA && !sB)
        return (
          <div
            key={name}
            className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 w-full text-left"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-red-500 line-through">
                {name}
              </span>
              {sA.threshold && (
                <span className="text-xs text-red-500 opacity-60">
                  {sA.threshold}+
                </span>
              )}
            </div>
            <p className="text-xs text-red-500/60 leading-snug line-through">
              {sA.effect}
            </p>
          </div>
        );
      if (!sA && sB)
        return (
          <div
            key={name}
            className="bg-lime-400/10 p-3 rounded-lg border border-lime-400/30 w-full text-left"
          >
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

      // Check for changes (threshold or effect)
      if (sA && sB) {
        const thresholdChanged = sA.threshold !== sB.threshold;
        const effectChanged = sA.effect !== sB.effect;

        if (thresholdChanged || effectChanged) {
          return (
            <div
              key={name}
              className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/30 w-full text-left"
            >
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
          <div
            key={name}
            className="p-3 rounded-lg border border-transparent w-full text-left opacity-30"
          >
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
      <div className="glass-card p-6 h-full border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
        <h4 className="text-xl font-bold text-white mb-4 text-center">
          Changes
        </h4>
        <div className="flex flex-col gap-3 items-center">
          {allNames.map(renderDiffItem)}
        </div>
      </div>
    );
  };

  const renderRefSection = (
    title: string,
    rules: SpecialRule[] | undefined,
    version: string,
  ) => (
    <div className="glass-card p-6 h-full">
      <h4 className="text-xl font-bold text-white mb-4 underline decoration-amber-500/50 decoration-2 underline-offset-4">
        {title} ({version})
      </h4>
      {!rules?.length ? (
        <span className="text-slate-500 italic">No rules.</span>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-white/5 p-3 rounded-lg border border-white/5"
            >
              <span className="font-bold text-slate-200 block mb-1">
                {rule.name}
              </span>
              <p className="text-xs text-slate-400 leading-snug">
                {rule.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderRefDiff = (
    title: string,
    rulesA: SpecialRule[] = [],
    rulesB: SpecialRule[] = [],
  ) => {
    const namesA = rulesA.map((r) => r.name);
    const namesB = rulesB.map((r) => r.name);
    const allNames = Array.from(new Set([...namesA, ...namesB]));

    const renderDiffItem = (name: string) => {
      const rA = rulesA.find((r) => r.name === name);
      const rB = rulesB.find((r) => r.name === name);

      if (rA && !rB)
        return (
          <div
            key={name}
            className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 w-full text-left"
          >
            <span className="font-bold text-red-500 line-through block mb-1">
              {name}
            </span>
            <p className="text-xs text-red-500/60 leading-snug line-through">
              {rA.description}
            </p>
          </div>
        );
      if (!rA && rB)
        return (
          <div
            key={name}
            className="bg-lime-400/10 p-3 rounded-lg border border-lime-400/30 w-full text-left"
          >
            <span className="font-bold text-lime-400 block mb-1">{name}</span>
            <p className="text-xs text-slate-300 leading-snug">
              {rB.description}
            </p>
          </div>
        );

      if (rA && rB) {
        if (rA.description !== rB.description) {
          return (
            <div
              key={name}
              className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/30 w-full text-left"
            >
              <span className="font-bold text-sky-400 block mb-1">{name}</span>
              <p className="text-xs leading-snug">
                <TextDiff textA={rA.description} textB={rB.description} />
              </p>
            </div>
          );
        }
        return (
          <div
            key={name}
            className="p-3 rounded-lg border border-transparent w-full text-left opacity-30"
          >
            <span className="font-bold text-slate-500 block mb-1">{name}</span>
            <p className="text-xs text-slate-500 leading-snug">
              {rB.description}
            </p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="glass-card p-6 h-full border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
        <h4 className="text-xl font-bold text-white mb-4 text-center">
          {title} Changes
        </h4>
        <div className="flex flex-col gap-3 items-center">
          {allNames.map(renderDiffItem)}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in pb-16">
      <div className="grid grid-cols-3 gap-6 mb-4 px-4 sticky top-0 bg-slate-950/80 backdrop-blur-md z-10 py-4 border-b border-white/5">
        <h3 className="text-center text-slate-400 font-semibold text-xl">
          {dataA.name}{" "}
          <span className="text-sm opacity-50 block">Version A</span>
        </h3>
        <h3 className="text-center text-sky-400 font-bold tracking-widest text-xl">
          VS
        </h3>
        <h3 className="text-center text-slate-400 font-semibold text-xl">
          {dataB.name}{" "}
          <span className="text-sm opacity-50 block">Version B</span>
        </h3>
      </div>

      {/* Army Wide Section */}
      <div className="space-y-4 mb-4">
        {/* Description */}
        <CollapsibleSection
          title="Description"
          isOpen={!collapsed["Description"]}
          onToggle={() => toggle("Description")}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
            <div className="hidden md:block">
              {renderDescription(dataA.background, "A")}
            </div>
            <div>{renderDescriptionDiff()}</div>
            <div className="hidden md:block">
              {renderDescription(dataB.background, "B")}
            </div>
          </div>
        </CollapsibleSection>

        {/* Spells */}
        <div className="my-8">
          <CollapsibleSection
            title="Spells"
            isOpen={!collapsed["Spells"]}
            onToggle={() => toggle("Spells")}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
              <div className="hidden md:block">
                {renderSpells(dataA.spells, "A")}
              </div>
              <div>{renderSpellsDiff()}</div>
              <div className="hidden md:block">
                {renderSpells(dataB.spells, "B")}
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Special Rules */}
        <div className="my-8">
          <CollapsibleSection
            title="Special Rules"
            isOpen={!collapsed["Special Rules"]}
            onToggle={() => toggle("Special Rules")}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
              <div className="hidden md:block">
                {renderRefSection("Special Rules", dataA.specialRules, "A")}
              </div>
              <div>
                {renderRefDiff(
                  "Special Rules",
                  dataA.specialRules,
                  dataB.specialRules,
                )}
              </div>
              <div className="hidden md:block">
                {renderRefSection("Special Rules", dataB.specialRules, "B")}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>

      <CollapsibleSection
        title="Unit Changes"
        isOpen={!collapsed["Unit Changes"]}
        onToggle={() => toggle("Unit Changes")}
      >
        <div className="px-4">
          {unitRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-stretch border-b border-white/5 pb-8 last:border-0"
            >
              <div className="hidden md:block">
                {renderUnitCard(row.uA, dataA, "Ver A")}
              </div>

              <div className="flex flex-col h-full">
                {row.status === "SAME" && (
                  <div className="glass-card h-full flex items-center justify-center text-slate-600 opacity-30 font-bold tracking-widest">
                    NO CHANGES
                  </div>
                )}
                {row.status === "NEW" && (
                  <div className="glass-card h-full flex items-center justify-center text-lime-400 font-bold border border-lime-400/50 bg-lime-400/5 tracking-wider">
                    NEW UNIT ADDED
                  </div>
                )}
                {row.status === "DELETED" && (
                  <div className="glass-card h-full flex items-center justify-center text-red-500 font-bold border border-red-500/50 bg-red-500/5 tracking-wider">
                    UNIT REMOVED
                  </div>
                )}
                {row.status === "CHANGED" &&
                  renderMergedCard(
                    row.uA!,
                    row.uB!,
                    dataA,
                    dataB,
                    row.uA?.upgrades || [],
                  )}
              </div>

              <div className="hidden md:block">
                {renderUnitCard(row.uB, dataB, "Ver B")}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
