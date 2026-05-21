import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GAME_SYSTEMS } from "../hooks/useArmyList";
import { UnitCard } from "./UnitCard";
import { UnitDetailSidebar } from "./UnitDetailSidebar";
import type { BalValConfig, BalValResult } from "../utils/types";

interface ArmyDetailViewProps {
  army: any;
  selectedUnit: any | null;
  onSelectUnit: (unit: any) => void;
  balValConfig: BalValConfig;
  setBalValConfig: (config: BalValConfig) => void;
  balValScores: Record<string, BalValResult> | null;
  doubledUnitIds: Set<string>;
  onToggleDoubleUnit: (id: string) => void;
}

export function ArmyDetailView({
  army,
  selectedUnit,
  onSelectUnit,
  balValConfig,
  setBalValConfig,
  balValScores,
  doubledUnitIds,
  onToggleDoubleUnit,
}: ArmyDetailViewProps) {
  const { systemId } = useParams<{ systemId: string }>();
  const navigate = useNavigate();
  const system = GAME_SYSTEMS.find((s) => s.id === Number(systemId));

  // Slider drafts: the live value the user is dragging. Committed to
  // balValConfig only on release (mouseup/touchend/keyup). Whole-army BalVal
  // recompute is expensive (Poisson CDF × every unit × every loadout), so we
  // avoid firing it on every intermediate frame.
  const [defenseDraft, setDefenseDraft] = useState(balValConfig.targetDefense);
  const [sizeDraft, setSizeDraft] = useState(balValConfig.targetSize);
  const [toughDraft, setToughDraft] = useState(balValConfig.targetToughness);
  // Keep drafts in sync when config changes from elsewhere (e.g. preset reset).
  useEffect(() => setDefenseDraft(balValConfig.targetDefense), [balValConfig.targetDefense]);
  useEffect(() => setSizeDraft(balValConfig.targetSize), [balValConfig.targetSize]);
  useEffect(() => setToughDraft(balValConfig.targetToughness), [balValConfig.targetToughness]);

  const commitDefense = (v: number) => {
    if (v !== balValConfig.targetDefense) setBalValConfig({ ...balValConfig, targetDefense: v });
  };
  const commitSize = (v: number) => {
    if (v !== balValConfig.targetSize) setBalValConfig({ ...balValConfig, targetSize: v });
  };
  const commitTough = (v: number) => {
    if (v !== balValConfig.targetToughness) setBalValConfig({ ...balValConfig, targetToughness: v });
  };

  const heroes =
    army.units?.filter((u: any) =>
      u.rules?.some((r: any) => r.name === "Hero"),
    ) ?? [];
  const standardUnits =
    army.units?.filter(
      (u: any) => !u.rules?.some((r: any) => r.name === "Hero"),
    ) ?? [];

  return (
    <div className="container mx-auto max-w-[1400px] px-4 pb-20">
      {/* Breadcrumb */}
      <nav className="mt-4 mb-6 flex items-center gap-2 text-sm text-slate-400">
        <button
          onClick={() => navigate("/")}
          className="hover:text-sky-400 transition-colors"
        >
          Home
        </button>
        <span className="text-slate-600">/</span>
        {system && (
          <>
            <button
              onClick={() => navigate(`/army/${systemId}`)}
              className="hover:text-sky-400 transition-colors"
            >
              {system.name}
            </button>
            <span className="text-slate-600">/</span>
          </>
        )}
        <span className="text-slate-200 font-medium truncate">{army.name}</span>
      </nav>

      {/* Army header card */}
      <div className="glass-card mb-6 p-6 md:px-8">
        <div className="border-l-4 border-sky-500 pl-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 mb-1">
            {system?.name ?? "Army Book"}
          </p>
          <h1 className="mb-1 text-3xl font-extrabold text-white md:text-4xl">
            {army.name}
          </h1>
          {army.genericName && (
            <p className="text-sm text-slate-400">{army.genericName}</p>
          )}
        </div>
      </div>

      {/* Global BalVal Assumptions (Sticky & Compact) */}
      <div className="sticky top-2 z-20 mb-6 rounded-xl border border-sky-500/30 bg-slate-900/95 backdrop-blur p-3 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="shrink-0 hidden lg:block">
            <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400">
              BalVal Assumptions
            </h3>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Target Defense */}
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
                <span>Defense</span>
                <span className="text-white font-bold">
                  {defenseDraft}+
                  {defenseDraft !== balValConfig.targetDefense && (
                    <span className="ml-1 text-amber-400" title="Release to apply">·</span>
                  )}
                </span>
              </label>
              <input
                type="range"
                min="2"
                max="6"
                step="1"
                value={defenseDraft}
                onChange={(e) => setDefenseDraft(Number(e.target.value))}
                onMouseUp={(e) => commitDefense(Number(e.currentTarget.value))}
                onTouchEnd={(e) => commitDefense(Number(e.currentTarget.value))}
                onKeyUp={(e) => commitDefense(Number(e.currentTarget.value))}
                className="w-full accent-sky-400 h-1.5"
              />
            </div>

            {/* Target Size */}
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
                <span>Size (Blast)</span>
                <span className="text-white font-bold">
                  {sizeDraft}
                  {sizeDraft !== balValConfig.targetSize && (
                    <span className="ml-1 text-amber-400" title="Release to apply">·</span>
                  )}
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={sizeDraft}
                onChange={(e) => setSizeDraft(Number(e.target.value))}
                onMouseUp={(e) => commitSize(Number(e.currentTarget.value))}
                onTouchEnd={(e) => commitSize(Number(e.currentTarget.value))}
                onKeyUp={(e) => commitSize(Number(e.currentTarget.value))}
                className="w-full accent-sky-400 h-1.5"
              />
            </div>

            {/* Target Toughness */}
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
                <span className="truncate">Tough (Deadly)</span>
                <span className="text-white font-bold pl-1">
                  {toughDraft === 1 ? "1" : `T(${toughDraft})`}
                  {toughDraft !== balValConfig.targetToughness && (
                    <span className="ml-1 text-amber-400" title="Release to apply">·</span>
                  )}
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="7"
                step="1"
                value={
                  [1, 3, 6, 9, 12, 15, 18, 21].indexOf(toughDraft) === -1
                    ? 0
                    : [1, 3, 6, 9, 12, 15, 18, 21].indexOf(toughDraft)
                }
                onChange={(e) => {
                  const values = [1, 3, 6, 9, 12, 15, 18, 21];
                  setToughDraft(values[Number(e.target.value)]);
                }}
                onMouseUp={(e) => {
                  const values = [1, 3, 6, 9, 12, 15, 18, 21];
                  commitTough(values[Number(e.currentTarget.value)]);
                }}
                onTouchEnd={(e) => {
                  const values = [1, 3, 6, 9, 12, 15, 18, 21];
                  commitTough(values[Number(e.currentTarget.value)]);
                }}
                onKeyUp={(e) => {
                  const values = [1, 3, 6, 9, 12, 15, 18, 21];
                  commitTough(values[Number(e.currentTarget.value)]);
                }}
                className="w-full accent-sky-400 h-1.5"
              />
            </div>
            {/* Most Effective Toggle */}
            <div>
              <label className="text-[10px] text-sky-400 mb-0.5 flex justify-between font-bold">
                <span>Optimizer</span>
              </label>
              <div className="flex items-center h-5 mt-1">
                <input
                  type="checkbox"
                  id="most-effective-toggle"
                  checked={balValConfig.mostEffective}
                  onChange={(e) =>
                    setBalValConfig({
                      ...balValConfig,
                      mostEffective: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-sky-600 bg-slate-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                />
                <label
                  htmlFor="most-effective-toggle"
                  className="ml-2 text-[10px] font-bold text-white select-none cursor-pointer uppercase tracking-tighter"
                >
                  Most Effective
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="detail-layout">
        {/* Roster */}
        <div>
          {heroes.length > 0 && (
            <div className="mb-8">
              <h3 className="section-header mt-0 text-xl font-bold text-white mb-4">
                Heroes
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:flex lg:flex-col lg:gap-3">
                {heroes.map((unit: any) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    army={army}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelect={onSelectUnit}
                    balValScore={
                      balValScores ? balValScores[unit.id] : undefined
                    }
                    balValConfig={balValConfig}
                    isDoubled={doubledUnitIds.has(unit.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {standardUnits.length > 0 && (
            <div className="mb-8">
              <h3 className="section-header mt-0 text-xl font-bold text-white mb-4">
                Units
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:flex lg:flex-col lg:gap-3">
                {standardUnits.map((unit: any) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    army={army}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelect={onSelectUnit}
                    balValScore={
                      balValScores ? balValScores[unit.id] : undefined
                    }
                    balValConfig={balValConfig}
                    isDoubled={doubledUnitIds.has(unit.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Hidden on Mobile */}
        <div className="hidden lg:block self-stretch">
          <UnitDetailSidebar
            selectedUnit={selectedUnit}
            army={army}
            balValScore={
              selectedUnit && balValScores
                ? balValScores[selectedUnit.id]
                : undefined
            }
            balValConfig={balValConfig}
            isDoubled={
              selectedUnit ? doubledUnitIds.has(selectedUnit.id) : false
            }
            onToggleDouble={() =>
              selectedUnit && onToggleDoubleUnit(selectedUnit.id)
            }
          />
        </div>
      </div>
    </div>
  );
}
