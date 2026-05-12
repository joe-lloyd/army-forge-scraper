import { useCallback, useEffect, useState } from 'react';
import type { Tier5 } from '../utils/aggregate';

const STORAGE_KEY = 'analyzer:savedLists:v1';
const STORAGE_LIMIT = 50;

export type SavedListSource =
  | { kind: 'share'; shareId: string }
  | { kind: 'json'; raw: unknown };

/** Lightweight cached headline pulled from the last analysis run. */
export interface SavedListSnapshot {
  listName: string;
  totalPoints: number;
  overallTier: Tier5;
  outputTier: Tier5;
  durabilityTier: Tier5;
  coverageTier: Tier5;
  perProfile: { profileId: string; killPercent: number; tier: Tier5 }[];
}

export interface SavedList {
  id: string;
  savedAt: number;
  label: string;
  source: SavedListSource;
  snapshot: SavedListSnapshot;
}

function readStorage(): SavedList[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedList[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(lists: SavedList[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch (e) {
    // Quota exceeded — surface to caller via thrown error.
    throw new Error(`Couldn't save: ${(e as Error).message}`);
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseSavedListsApi {
  lists: SavedList[];
  add: (entry: Omit<SavedList, 'id' | 'savedAt'>) => SavedList;
  remove: (id: string) => void;
  clear: () => void;
  getById: (id: string) => SavedList | undefined;
  /** True if a share-ID-based save already exists for this share ID. */
  findByShareId: (shareId: string) => SavedList | undefined;
  reloadFromStorage: () => void;
}

export function useSavedLists(): UseSavedListsApi {
  const [lists, setLists] = useState<SavedList[]>(() => readStorage());

  // Sync across tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setLists(readStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback<UseSavedListsApi['add']>((entry) => {
    const newList: SavedList = {
      ...entry,
      id: generateId(),
      savedAt: Date.now(),
    };
    setLists((prev) => {
      // For share-ID sources, replace the existing entry to avoid duplicates.
      let next = prev;
      if (entry.source.kind === 'share') {
        const sid = entry.source.shareId;
        next = prev.filter(
          (l) => !(l.source.kind === 'share' && l.source.shareId === sid),
        );
      }
      const merged = [newList, ...next].slice(0, STORAGE_LIMIT);
      writeStorage(merged);
      return merged;
    });
    return newList;
  }, []);

  const remove = useCallback<UseSavedListsApi['remove']>((id) => {
    setLists((prev) => {
      const next = prev.filter((l) => l.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback<UseSavedListsApi['clear']>(() => {
    setLists([]);
    writeStorage([]);
  }, []);

  const getById = useCallback<UseSavedListsApi['getById']>(
    (id) => lists.find((l) => l.id === id),
    [lists],
  );

  const findByShareId = useCallback<UseSavedListsApi['findByShareId']>(
    (sid) =>
      lists.find((l) => l.source.kind === 'share' && l.source.shareId === sid),
    [lists],
  );

  const reloadFromStorage = useCallback<UseSavedListsApi['reloadFromStorage']>(() => {
    setLists(readStorage());
  }, []);

  return { lists, add, remove, clear, getById, findByShareId, reloadFromStorage };
}
