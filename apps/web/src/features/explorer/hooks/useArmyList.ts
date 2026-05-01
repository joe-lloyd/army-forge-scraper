import { useState, useEffect } from 'react';

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
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3000/armies?gameSystem=${selectedSystem}`)
      .then((res) => res.json())
      .then((data) => {
        setArmies(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch armies:', err);
        setLoading(false);
      });
  }, [selectedSystem]);

  const filteredArmies = armies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return {
    selectedSystem,
    setSelectedSystem,
    loading,
    search,
    setSearch,
    filteredArmies,
  };
}
