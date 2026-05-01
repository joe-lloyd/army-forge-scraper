import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { ArmyBook, Unit } from '@opr-api/shared';

export function useArmyDetail() {
  const { systemId, armyId } = useParams();
  const [army, setArmy] = useState<ArmyBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3000/armies/${armyId}?gameSystem=${systemId}`)
      .then((res) => res.json())
      .then((data) => {
        setArmy(data);
        if (data.units?.length > 0) {
          setSelectedUnit(data.units[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch army details:', err);
        setLoading(false);
      });
  }, [systemId, armyId]);

  return {
    army,
    loading,
    selectedUnit,
    setSelectedUnit,
  };
}
