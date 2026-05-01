import { useNavigate } from 'react-router-dom';
import type { ArmyBook, Unit } from '@opr-api/shared';
import { UnitCard } from './UnitCard';
import { UnitDetailSidebar } from './UnitDetailSidebar';
import { Button } from '../../../components/ui/Button';

interface ArmyDetailViewProps {
  army: ArmyBook;
  selectedUnit: Unit | null;
  onSelectUnit: (unit: Unit) => void;
}

export function ArmyDetailView({ army, selectedUnit, onSelectUnit }: ArmyDetailViewProps) {
  const navigate = useNavigate();

  const heroes = army.units.filter((u) => u.rules.some((r) => r.name === 'Hero'));
  const standardUnits = army.units.filter((u) => !u.rules.some((r) => r.name === 'Hero'));

  return (
    <div className="container mx-auto max-w-[1400px] px-4 pb-20">
      <Button onClick={() => navigate(-1)} variant="secondary" className="mb-8 mt-4 rounded-full">
        &larr; Back to List
      </Button>

      <div className="glass-card mb-8 p-8 md:px-12">
        <div className="border-l-4 border-sky-500 pl-6">
          <h1 className="mb-2 text-4xl font-extrabold text-white md:text-5xl">{army.name}</h1>
          <p className="text-xl text-sky-400/80">{army.genericName}</p>
        </div>
      </div>

      <div className="detail-layout">
        {/* Main Roster area */}
        <div className="roster-main">
          {heroes.length > 0 && (
            <div className="mb-8">
              <h3 className="section-header mt-0 text-2xl font-bold text-white">Heroes</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {heroes.map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelect={onSelectUnit}
                  />
                ))}
              </div>
            </div>
          )}

          {standardUnits.length > 0 && (
            <div>
              <h3 className="section-header text-2xl font-bold text-white">Units</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {standardUnits.map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelect={onSelectUnit}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Persistent Sidebar Area */}
        <UnitDetailSidebar selectedUnit={selectedUnit} army={army} />
      </div>
    </div>
  );
}
