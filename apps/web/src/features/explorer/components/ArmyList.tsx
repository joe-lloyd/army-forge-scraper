import { useNavigate } from 'react-router-dom';
import type { ArmySummary } from '../hooks/useArmyList';
import { Card } from '../../../components/ui/Card';

interface ArmyListProps {
  armies: ArmySummary[];
}

export function ArmyList({ armies }: ArmyListProps) {
  const navigate = useNavigate();

  return (
    <div className="army-grid">
      {armies.map((army) => (
        <Card
          key={`${army.systemId}-${army.uid}`}
          className="army-card animate-fade-in cursor-pointer bg-white/10 backdrop-blur-md"
          onClick={() => navigate(`/army/${army.systemId}/${army.uid}`)}
        >
          <Card.Content className="flex h-full flex-col p-4">
            <div className="army-name font-bold text-lg">{army.name}</div>
            {army.genericName && (
              <div className="army-generic text-sm text-gray-400">{army.genericName}</div>
            )}
            <div className="mt-auto flex items-center justify-between pt-4">
              <span className="text-xs text-gray-400">{army.unitsCount} units</span>
              <span className="text-xs font-semibold text-blue-400">VIEW DETAILS</span>
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
