import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/config';

export interface ArmySummary {
  uid: string;
  name: string;
  genericName?: string;
  unitsCount: number;
  enabledGameSystems: number[];
  systemId: number;
}

export const GAME_SYSTEMS = [
  { id: 2, name: 'Grimdark Future', slug: 'grimdark-future' },
  { id: 3, name: 'Firefight', slug: 'grimdark-future-firefight' },
  { id: 4, name: 'Age of Fantasy', slug: 'age-of-fantasy' },
  { id: 5, name: 'Skirmish', slug: 'age-of-fantasy-skirmish' },
];

export function useArmyList() {
  const [selectedSystem, setSelectedSystem] = useState(2);
  const [armies, setArmies] = useState<ArmySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/armies?gameSystem=${selectedSystem}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setArmies(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch armies:', err);
        setError('Failed to load army list. Please try again later.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [selectedSystem]);

  const filteredArmies = armies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSetSearch = useCallback((val: string) => {
    setSearch(val);
  }, []);

  const handleSelectSystem = useCallback((id: number) => {
    setSelectedSystem(id);
  }, []);

  return {
    selectedSystem,
    selectSystem: handleSelectSystem,
    loading,
    error,
    search,
    setSearch: handleSetSearch,
    filteredArmies,
  };
}
