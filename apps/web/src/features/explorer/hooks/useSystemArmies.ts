import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DATA_API } from '@/config';
import { GAME_SYSTEMS } from './useArmyList';

export interface SystemArmy {
  uid: string;
  filename: string;
  name: string;
  genericName?: string;
}

/** Extract UID from filename like "Alien Hives (w7qor7b2kuifcyvk).json" → "w7qor7b2kuifcyvk" */
function extractUid(filename: string): string {
  const match = filename.match(/\(([^)]+)\)\.json$/);
  return match ? match[1] : filename;
}

export function useSystemArmies() {
  const { systemId } = useParams<{ systemId: string }>();
  const numericSystemId = Number(systemId);

  const system = GAME_SYSTEMS.find((s) => s.id === numericSystemId) ?? null;

  const [armies, setArmies] = useState<SystemArmy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!system) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // Step 1: fetch version list for this system slug
    fetch(`${DATA_API}/${system.slug}/index.json`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch versions for ${system.slug}`);
        return res.json() as Promise<string[]>;
      })
      .then((versions) => {
        const latest = versions[0]; // newest first
        if (!latest) throw new Error('No versions found');
        // Step 2: fetch army index for the latest version
        return fetch(`${DATA_API}/${system.slug}/${latest}/index.json`, { signal: controller.signal })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to fetch army list');
            return res.json() as Promise<{ id: string; name: string; genericName?: string }[]>;
          });
      })
      .then((data) => {
        const mapped: SystemArmy[] = data.map((entry) => ({
          uid: extractUid(entry.id),
          filename: entry.id,
          name: entry.name,
          genericName: entry.genericName,
        }));
        setArmies(mapped);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch system armies:', err);
        setError('Failed to load armies. Please try again later.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [system?.slug]);

  const filteredArmies = armies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return {
    system,
    systemId: numericSystemId,
    armies: filteredArmies,
    loading,
    error,
    search,
    setSearch,
  };
}
