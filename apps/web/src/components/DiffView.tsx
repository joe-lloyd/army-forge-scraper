import React from "react";

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

interface ArmyData {
  name: string;
  units: Unit[];
  upgradePackages: UpgradePackage[];
  rules?: any[];
}

interface DiffViewProps {
  dataA: ArmyData;
  dataB: ArmyData;
}

export default function DiffView({ dataA, dataB }: DiffViewProps) {
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
    const uniqueW = Array.from(new Set([...wA, ...wB]));

    // Rules Diff Logic
    const rA = uA.rules.map((r) => r.name || r.label);
    const rB = uB.rules.map((r) => r.name || r.label);
    const uniqueR = Array.from(new Set([...rA, ...rB]));

    // Upgrade Details (Using B as base, highlighting new)
    const upgradeDetailsB = getUpgradeDetails(uB, dataB);
    const upgradeUidsA = uA.upgrades || [];

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
          {uniqueW.map((wJson, idx) => {
            const { name, count, details } = JSON.parse(wJson);
            const inA = wA.includes(wJson);
            const inB = wB.includes(wJson);
            const countStr = count > 1 ? `${count}x ` : "";

            if (inA && inB)
              return (
                <div key={idx} className="text-sm mb-1">
                  <span className="text-slate-100 font-medium">
                    {countStr}
                    {name}
                  </span>
                  <span className="text-slate-400"> {details}</span>
                </div>
              );
            if (inB)
              return (
                <div
                  key={idx}
                  className="text-sm mb-1 text-lime-400 bg-lime-400/10 px-1 py-0.5 rounded inline-block w-full"
                >
                  <span className="font-semibold">
                    + {countStr}
                    {name}
                  </span>{" "}
                  <span className="text-lime-400/80">{details}</span>
                </div>
              );
            if (inA)
              return (
                <div
                  key={idx}
                  className="text-sm mb-1 text-red-500 bg-red-500/10 px-1 py-0.5 rounded inline-block w-full line-through decoration-red-500/50"
                >
                  <span className="font-semibold opacity-75">
                    - {countStr}
                    {name}
                  </span>{" "}
                  <span className="opacity-60">{details}</span>
                </div>
              );
            return null;
          })}
        </div>

        {/* Rules Changes */}
        <div className="mb-4">
          <div className="unit-detail-label mb-2 text-xs uppercase text-slate-500 font-semibold">
            Rules Changes
          </div>
          <div className="text-sm leading-relaxed">
            {uniqueR.map((r, idx) => {
              const inA = rA.includes(r);
              const inB = rB.includes(r);
              // Calculate trailing comma/space based on index if we wanted to be perfect,
              // but for now just replicating existing logic without the specific mr-2 margin
              // and using a standard space.
              const isLast = idx === uniqueR.length - 1;
              const suffix = isLast ? "" : ", ";

              if (inA && inB)
                return (
                  <span key={idx} className="text-slate-400">
                    {r}
                    {suffix}
                  </span>
                );
              if (inB)
                return (
                  <span key={idx} className="text-lime-400 font-bold">
                    + {r}
                    {suffix}
                  </span>
                );
              if (inA)
                return (
                  <span
                    key={idx}
                    className="text-red-500 line-through opacity-80"
                  >
                    - {r}
                    {suffix}
                  </span>
                );
              return null;
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

  return (
    <div className="animate-fade-in pb-16">
      <div className="grid grid-cols-3 gap-6 mb-4 px-4">
        <h3 className="text-center text-slate-400 font-semibold">
          {dataA.name}
        </h3>
        <h3 className="text-center text-sky-400 font-bold tracking-widest">
          COMPARISON
        </h3>
        <h3 className="text-center text-slate-400 font-semibold">
          {dataB.name}
        </h3>
      </div>

      {unitRows.map((row) => (
        <div key={row.id} className="grid grid-cols-3 gap-6 mb-8 items-stretch">
          <div>{renderUnitCard(row.uA, dataA, "Ver A")}</div>

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
              renderMergedCard(row.uA!, row.uB!, dataA, dataB)}
          </div>

          <div>{renderUnitCard(row.uB, dataB, "Ver B")}</div>
        </div>
      ))}
    </div>
  );
}
