import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DATA_API } from '@/config';
import { GAME_SYSTEMS } from './useArmyList';
import { DEFAULT_BALVAL_CONFIG } from '../utils/types';
import type { BalValConfig, BalValResult } from '../utils/types';
import { calculateArmyBalVal } from '../utils/balval';

// We import the shared types but use the raw JSON shape from files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ArmyBook = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Unit = any;

export function useArmyDetail() {
  const { systemId, armyId } = useParams<{ systemId: string; armyId: string }>();
  const numericSystemId = Number(systemId);

  const system = GAME_SYSTEMS.find((s) => s.id === numericSystemId) ?? null;

  const [army, setArmy] = useState<ArmyBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  
  const [balValConfig, setBalValConfig] = useState<BalValConfig>(DEFAULT_BALVAL_CONFIG);

  useEffect(() => {
    if (!system || !armyId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Step 1: get version list to find latest
    fetch(`${DATA_API}/${system.slug}/index.json`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch versions');
        return res.json() as Promise<string[]>;
      })
      .then((versions) => {
        const latest = versions[0];
        if (!latest) throw new Error('No versions found');
        // Step 2: find the filename for this armyId from the version index
        return fetch(`${DATA_API}/${system.slug}/${latest}/index.json`, { signal: controller.signal })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to fetch army index');
            return res.json() as Promise<{ id: string; name: string }[]>;
          })
          .then((index) => {
            // Find the entry whose filename contains the armyId
            const entry = index.find((e) => e.id.includes(`(${armyId})`));
            if (!entry) throw new Error(`Army not found: ${armyId}`);
            // Step 3: fetch the actual army JSON file
            return fetch(
              `${DATA_API}/${system.slug}/${latest}/${encodeURIComponent(entry.id)}`,
              { signal: controller.signal }
            ).then((res) => {
              if (!res.ok) throw new Error('Failed to fetch army data');
              return res.json();
            });
          });
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
  }, [system?.slug, armyId]);

  const balValScores = useMemo(() => {
    if (!army?.units) return null;
    return calculateArmyBalVal(army.units, balValConfig);
  }, [army?.units, balValConfig]);

  return {
    army,
    loading,
    error,
    selectedUnit,
    setSelectedUnit,
    balValConfig,
    setBalValConfig,
    balValScores,
  };
}
