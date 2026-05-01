import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DATA_API } from '@/config';
import type { ArmyData } from '../types';

interface ArmySummary {
  id: string;
  name: string;
  genericName?: string;
}

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
  const [armiesA, setArmiesA] = useState<ArmySummary[]>([]);
  const [armiesB, setArmiesB] = useState<ArmySummary[]>([]);
  const [latestArmies, setLatestArmies] = useState<ArmySummary[]>([]);
  const [armyDataA, setArmyDataA] = useState<ArmyData | null>(null);
  const [armyDataB, setArmyDataB] = useState<ArmyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to update params preserving others
  const updateParams = useCallback((updates: Record<string, string>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value) newParams.set(key, value);
        else newParams.delete(key);
      });
      return newParams;
    });
  }, [setSearchParams]);

  // Fetch Systems
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${DATA_API}/index.json`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch systems');
        return res.json();
      })
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
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch systems:', err);
        setError('Failed to load systems.');
      });
    return () => controller.abort();
  }, [selectedSystem, updateParams]);

  // Fetch Versions when System changes
  useEffect(() => {
    if (!selectedSystem) return;
    const controller = new AbortController();
    fetch(`${DATA_API}/${selectedSystem}/index.json`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch versions');
        return res.json();
      })
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
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch versions:', err);
        setError('Failed to load versions.');
      });
    return () => controller.abort();
  }, [selectedSystem, versionA, versionB, updateParams]);

  // Fetch Armies for A and B
  useEffect(() => {
    if (!selectedSystem || !versionA) return;
    const controller = new AbortController();
    fetch(`${DATA_API}/${selectedSystem}/${versionA}/index.json?t=${Date.now()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setArmiesA(data);
        if (data.length > 0 && !selectedArmyId) {
          updateParams({ army: data[0].id });
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch armies A:', err);
      });
    return () => controller.abort();
  }, [selectedSystem, versionA, selectedArmyId, updateParams]);

  useEffect(() => {
    if (!selectedSystem || !versionB) return;
    const controller = new AbortController();
    fetch(`${DATA_API}/${selectedSystem}/${versionB}/index.json?t=${Date.now()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setArmiesB(data))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch armies B:', err);
      });
    return () => controller.abort();
  }, [selectedSystem, versionB]);

  // Fetch Latest Armies for generic names
  const latestVersion = useMemo(() => versions[0], [versions]);
  useEffect(() => {
    if (!selectedSystem || !latestVersion) return;
    const controller = new AbortController();
    fetch(`${DATA_API}/${selectedSystem}/${latestVersion}/index.json?t=${Date.now()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setLatestArmies(data))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch latest armies:', err);
      });
    return () => controller.abort();
  }, [selectedSystem, latestVersion]);

  // Fetch Data when selections change
  useEffect(() => {
    if (!selectedSystem || !versionA || !selectedArmyId) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${DATA_API}/${selectedSystem}/${versionA}/${selectedArmyId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch army A data');
        return res.json();
      })
      .then((dataA) => {
        setArmyDataA(dataA);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch army data A:', err);
        setError('Failed to load army data.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [selectedSystem, versionA, selectedArmyId]);

  useEffect(() => {
    if (!selectedSystem || !versionB || !selectedArmyId || armiesB.length === 0) return;

    const controller = new AbortController();
    const exactMatch = armiesB.find((a) => a.id === selectedArmyId);
    let targetId = '';

    if (exactMatch) {
      targetId = selectedArmyId;
    } else {
      const namePrefix = selectedArmyId.split('(')[0].trim();
      const fuzzyMatch = armiesB.find((a) => a.name.startsWith(namePrefix));
      if (fuzzyMatch) targetId = fuzzyMatch.id;
    }

    if (targetId) {
      fetch(`${DATA_API}/${selectedSystem}/${versionB}/${targetId}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch army B data');
          return res.json();
        })
        .then((dataB) => setArmyDataB(dataB))
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.error('Failed to fetch army data B:', err);
        });
    } else {
      setArmyDataB(null);
    }

    return () => controller.abort();
  }, [selectedSystem, versionB, selectedArmyId, armiesB]);

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
    loading,
    error,
    updateParams,
  };
}
