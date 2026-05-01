import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DATA_API } from '@/config';

export function useComparison() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derived state from URL
  const selectedSystem = searchParams.get('system') || '';
  const versionA = searchParams.get('vA') || '';
  const versionB = searchParams.get('vB') || '';
  const selectedArmyId = searchParams.get('army') || '';

  // Data state
  const [systems, setSystems] = useState<string[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [armiesA, setArmiesA] = useState<{ id: string; name: string; genericName?: string }[]>([]);
  const [armiesB, setArmiesB] = useState<any[]>([]);
  const [latestArmies, setLatestArmies] = useState<{ id: string; name: string; genericName?: string }[]>([]);
  const [armyDataA, setArmyDataA] = useState<any>(null);
  const [armyDataB, setArmyDataB] = useState<any>(null);

  // Helper to update params preserving others
  const updateParams = (updates: Record<string, string>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value) newParams.set(key, value);
        else newParams.delete(key);
      });
      return newParams;
    });
  };

  // Fetch Systems
  useEffect(() => {
    fetch(`${DATA_API}/index.json`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setSystems(data);
        if (!selectedSystem) {
          if (data.includes('grimdark-future')) {
            updateParams({ system: 'grimdark-future' });
          } else if (data.length > 0) {
            updateParams({ system: data[0] });
          }
        }
      })
      .catch((err) => console.error('Failed to fetch systems:', err));
  }, []);

  // Fetch Versions when System changes
  useEffect(() => {
    if (!selectedSystem) return;
    fetch(`${DATA_API}/${selectedSystem}/index.json`)
      .then((res) => res.json())
      .then((data) => {
        const sorted = Array.isArray(data) ? data.sort().reverse() : [];
        setVersions(sorted);

        if (!versionA || !versionB) {
          if (sorted.length >= 2) {
            updateParams({
              vA: versionA || sorted[1],
              vB: versionB || sorted[0],
            });
          } else if (sorted.length === 1) {
            updateParams({ vA: sorted[0], vB: sorted[0] });
          }
        }
      });
  }, [selectedSystem]);

  // Fetch Armies when Version A changes
  useEffect(() => {
    if (!selectedSystem || !versionA) return;
    fetch(`${DATA_API}/${selectedSystem}/${versionA}/index.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        setArmiesA(data);
        if (data.length > 0 && !selectedArmyId) {
          updateParams({ army: data[0].id });
        }
      });
  }, [selectedSystem, versionA]);

  // Fetch Armies for B
  useEffect(() => {
    if (!selectedSystem || !versionB) return;
    fetch(`${DATA_API}/${selectedSystem}/${versionB}/index.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => setArmiesB(data));
  }, [selectedSystem, versionB]);

  // Fetch Latest Armies for generic names
  useEffect(() => {
    if (!selectedSystem || versions.length === 0) return;
    const latestVersion = versions[0];
    fetch(`${DATA_API}/${selectedSystem}/${latestVersion}/index.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => setLatestArmies(data));
  }, [selectedSystem, versions]);

  // Fetch Data when selections change
  useEffect(() => {
    if (!selectedSystem || !versionA || !selectedArmyId) return;

    fetch(`${DATA_API}/${selectedSystem}/${versionA}/${selectedArmyId}`)
      .then((res) => res.json())
      .then((dataA) => {
        setArmyDataA(dataA);

        if (versionB && armiesB.length > 0) {
          const exactMatch = armiesB.find((a) => a.id === selectedArmyId);
          if (exactMatch) {
            fetch(`${DATA_API}/${selectedSystem}/${versionB}/${selectedArmyId}`)
              .then((res) => res.json())
              .then((dataB) => setArmyDataB(dataB));
          } else {
            const namePrefix = selectedArmyId ? selectedArmyId.split('(')[0].trim() : '';
            const fuzzyMatch = armiesB.find((a) => a.name.startsWith(namePrefix));
            if (fuzzyMatch) {
              fetch(`${DATA_API}/${selectedSystem}/${versionB}/${fuzzyMatch.id}`)
                .then((res) => res.json())
                .then((dataB) => setArmyDataB(dataB));
            } else {
              setArmyDataB(null);
            }
          }
        }
      });
  }, [selectedSystem, versionA, versionB, selectedArmyId, armiesB]);

  return {
    selectedSystem,
    versionA,
    versionB,
    selectedArmyId,
    systems,
    versions,
    armiesA,
    latestArmies,
    armyDataA,
    armyDataB,
    updateParams,
  };
}
