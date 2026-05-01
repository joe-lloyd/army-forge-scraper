import type { Unit } from '@opr-api/shared';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';

interface UnitCardProps {
  unit: Unit;
  isSelected: boolean;
  onSelect: (unit: Unit) => void;
}

export function UnitCard({ unit, isSelected, onSelect }: UnitCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'border-sky-500 bg-sky-500/5'
          : 'bg-white/10 hover:border-sky-500/50 hover:bg-white/20'
      }`}
      onClick={() => onSelect(unit)}
    >
      <Card.Content className="flex flex-col p-4">
        <div className="mb-4 flex w-full justify-between">
          <div className="unit-info">
            <h4 className="text-xl font-bold">{unit.name}</h4>
            <div className="text-sm text-gray-400">
              Models: {unit.size} | Qua {unit.quality}+ | Def {unit.defense}+
            </div>
          </div>
          <div className="font-bold text-sky-400">{unit.cost}pts</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {unit.rules.map((r) => (
            <Badge key={r.id} variant="default" className="bg-white/5 text-gray-300">
              {r.label}
            </Badge>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}
