import { useArmyDetail } from '../hooks/useArmyDetail';
import { ArmyDetailView } from './ArmyDetailView';
import { ArmyDetailSkeleton } from './ArmyDetailSkeleton';
import { ArmyDetailEmpty } from './ArmyDetailEmpty';

export default function ArmyDetailViewContainer() {
  const { army, loading, selectedUnit, setSelectedUnit } = useArmyDetail();

  if (loading) return <ArmyDetailSkeleton />;
  if (!army) return <ArmyDetailEmpty />;

  return (
    <ArmyDetailView
      army={army}
      selectedUnit={selectedUnit}
      onSelectUnit={setSelectedUnit}
    />
  );
}
