import { useParams, useNavigate } from 'react-router-dom';
import { GAME_SYSTEMS } from '../hooks/useArmyList';
import { UnitCard } from './UnitCard';
import { UnitDetailSidebar } from './UnitDetailSidebar';
import type { BalValConfig, BalValResult } from '../utils/types';

interface ArmyDetailViewProps {
  army: any;
  selectedUnit: any | null;
  onSelectUnit: (unit: any) => void;
  balValConfig: BalValConfig;
  setBalValConfig: (config: BalValConfig) => void;
  balValScores: Record<string, BalValResult> | null;
  onBack: () => void;
}

export function ArmyDetailView({ army, selectedUnit, onSelectUnit, balValConfig, setBalValConfig, balValScores, onBack }: ArmyDetailViewProps) {
  const { systemId } = useParams<{ systemId: string }>();
  const navigate = useNavigate();
  const system = GAME_SYSTEMS.find((s) => s.id === Number(systemId));

  const heroes = army.units?.filter((u: any) => u.rules?.some((r: any) => r.name === 'Hero')) ?? [];
  const standardUnits = army.units?.filter((u: any) => !u.rules?.some((r: any) => r.name === 'Hero')) ?? [];

  return (
    <div className="container mx-auto max-w-[1400px] px-4 pb-20">
      {/* Breadcrumb */}
      <nav className="mt-4 mb-6 flex items-center gap-2 text-sm text-slate-400">
        <button onClick={() => navigate('/')} className="hover:text-sky-400 transition-colors">
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
            {system?.name ?? 'Army Book'}
          </p>
          <h1 className="mb-1 text-3xl font-extrabold text-white md:text-4xl">{army.name}</h1>
          {army.genericName && (
            <p className="text-sm text-slate-400">{army.genericName}</p>
          )}
        </div>
      </div>

      {/* Global BalVal Assumptions (Sticky & Compact) */}
      <div className="sticky top-2 z-20 mb-6 rounded-xl border border-sky-500/30 bg-slate-900/95 backdrop-blur p-3 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="shrink-0 hidden lg:block">
            <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400">BalVal Assumptions</h3>
          </div>
          
          <div className="flex-1 grid grid-cols-3 gap-3">
            {/* Target Defense */}
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
                <span>Defense</span>
                <span className="text-white font-bold">{balValConfig.targetDefense}+</span>
              </label>
              <input 
                type="range" min="2" max="6" step="1" 
                value={balValConfig.targetDefense}
                onChange={(e) => setBalValConfig({ ...balValConfig, targetDefense: Number(e.target.value) })}
                className="w-full accent-sky-400 h-1.5"
              />
            </div>

            {/* Target Size */}
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
                <span>Size (Blast)</span>
                <span className="text-white font-bold">{balValConfig.targetSize}</span>
              </label>
              <input 
                type="range" min="1" max="10" step="1" 
                value={balValConfig.targetSize}
                onChange={(e) => setBalValConfig({ ...balValConfig, targetSize: Number(e.target.value) })}
                className="w-full accent-sky-400 h-1.5"
              />
            </div>

            {/* Target Toughness */}
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 flex justify-between">
                <span className="truncate">Tough (Deadly)</span>
                <span className="text-white font-bold pl-1">{balValConfig.targetToughness === 1 ? '1' : `T(${balValConfig.targetToughness})`}</span>
              </label>
              <input 
                type="range" min="0" max="7" step="1" 
                value={[1, 3, 6, 9, 12, 15, 18, 21].indexOf(balValConfig.targetToughness) === -1 ? 0 : [1, 3, 6, 9, 12, 15, 18, 21].indexOf(balValConfig.targetToughness)}
                onChange={(e) => {
                  const values = [1, 3, 6, 9, 12, 15, 18, 21];
                  setBalValConfig({ ...balValConfig, targetToughness: values[Number(e.target.value)] })
                }}
                className="w-full accent-sky-400 h-1.5"
              />
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
              <h3 className="section-header mt-0 text-xl font-bold text-white mb-4">Heroes</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:flex lg:flex-col lg:gap-3">
                {heroes.map((unit: any) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    army={army}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelect={onSelectUnit}
                    balValScore={balValScores ? balValScores[unit.id] : undefined}
                    balValConfig={balValConfig}
                  />
                ))}
              </div>
            </div>
          )}

          {standardUnits.length > 0 && (
            <div className="mb-8">
              <h3 className="section-header mt-0 text-xl font-bold text-white mb-4">Units</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:flex lg:flex-col lg:gap-3">
                {standardUnits.map((unit: any) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    army={army}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelect={onSelectUnit}
                    balValScore={balValScores ? balValScores[unit.id] : undefined}
                    balValConfig={balValConfig}
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
            balValScore={selectedUnit && balValScores ? balValScores[selectedUnit.id] : undefined}
            balValConfig={balValConfig}
            setBalValConfig={setBalValConfig}
          />
        </div>
      </div>
    </div>
  );
}
