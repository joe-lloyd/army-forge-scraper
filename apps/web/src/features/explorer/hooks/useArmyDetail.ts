import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { ArmyBook, Unit } from '@opr-api/shared';
import { API_URL } from '@/config';

export function useArmyDetail() {
  const { systemId, armyId } = useParams();
  const [army, setArmy] = useState<ArmyBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/armies/${armyId}?gameSystem=${systemId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setArmy(data);
        if (data.units?.length > 0) {
          setSelectedUnit(data.units[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch army details:', err);
        setError('Failed to load army details. Please try again later.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [systemId, armyId]);

  return {
    army,
    loading,
    error,
    selectedUnit,
    setSelectedUnit,
  };
}
