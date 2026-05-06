import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DATA_API } from '@/config';
import { GAME_SYSTEMS } from './useArmyList';
import { DEFAULT_BALVAL_CONFIG } from '../utils/types';
import type { BalValConfig } from '../utils/types';
import { calculateArmyBalVal, findBestLoadout } from '../utils/balval';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ArmyBook = any;

export function useArmyDetail() {
  const { systemId, armyId } = useParams<{ systemId: string; armyId: string }>();
  const numericSystemId = Number(systemId);

  const system = GAME_SYSTEMS.find((s) => s.id === numericSystemId) ?? null;

  const [army, setArmy] = useState<ArmyBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [balValConfig, setBalValConfig] = useState<BalValConfig>(DEFAULT_BALVAL_CONFIG);
  const [doubledUnitIds, setDoubledUnitIds] = useState<Set<string>>(new Set());

  const toggleDoubleUnit = (unitId: string) => {
    setDoubledUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  useEffect(() => {
    if (!system || !armyId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${DATA_API}/${system.slug}/index.json`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch versions');
        return res.json() as Promise<string[]>;
      })
      .then((versions) => {
        const latest = versions[0];
        if (!latest) throw new Error('No versions found');
        return fetch(`${DATA_API}/${system.slug}/${latest}/index.json`, { signal: controller.signal })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to fetch army index');
            return res.json() as Promise<{ id: string; name: string }[]>;
          })
          .then((index) => {
            const entry = index.find((e) => e.id.includes(`(${armyId})`));
            if (!entry) throw new Error(`Army not found: ${armyId}`);
            return fetch(
              `${DATA_API}/${system.slug}/${latest}/${encodeURIComponent(entry.id)}`,
              { signal: controller.signal },
            ).then((res) => {
              if (!res.ok) throw new Error('Failed to fetch army data');
              return res.json();
            });
          });
      })
      .then((data) => {
        setArmy(data);
        if (data.units?.length > 0) setSelectedUnit(data.units[0]);
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

  const processedArmy = useMemo(() => {
    if (!army?.units) return army;

    const newUnits = army.units.map((unit: any) => {
      const isDoubled = doubledUnitIds.has(unit.id);
      let pUnit = { ...unit };

      if (isDoubled) {
        pUnit = {
          ...pUnit,
          size: pUnit.size * 2,
          cost: pUnit.cost * 2,
          weapons: pUnit.weapons?.map((w: any) => ({ ...w, count: w.count * 2 })),
        };
      }

      if (balValConfig.mostEffective) {
        const best = findBestLoadout(pUnit, army, balValConfig, { isDoubled });
        const optimized = best.applications.length > 0;
        pUnit = {
          ...pUnit,
          cost: best.cost,
          weapons: best.weapons,
          isOptimized: optimized,
          optimizedId: optimized ? 'best-combo' : 'base',
          optimizedLabel: optimized
            ? best.applications.map(a => a.optionLabel).join(' + ')
            : 'Default Loadout',
          optimizedApplications: best.applications,
          originalCost: unit.cost * (isDoubled ? 2 : 1),
        };
      }
      return pUnit;
    });

    return { ...army, units: newUnits };
  }, [army, doubledUnitIds, balValConfig]);

  const balValScores = useMemo(() => {
    if (!processedArmy?.units) return null;
    return calculateArmyBalVal(processedArmy.units, balValConfig);
  }, [processedArmy?.units, balValConfig]);

  const activeSelectedUnit = useMemo(() => {
    if (!selectedUnit || !processedArmy?.units) return selectedUnit;
    return processedArmy.units.find((u: any) => u.id === selectedUnit.id) || selectedUnit;
  }, [selectedUnit, processedArmy?.units]);

  return {
    army: processedArmy,
    loading,
    error,
    selectedUnit: activeSelectedUnit,
    setSelectedUnit,
    balValConfig,
    setBalValConfig,
    balValScores,
    doubledUnitIds,
    toggleDoubleUnit,
  };
}
