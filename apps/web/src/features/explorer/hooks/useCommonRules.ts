import { useEffect, useState, useMemo } from 'react';
import { DATA_API } from '@/config';

// Shape of the rules payload scraped from `/api/rules/common/{id}`. We expose
// only what the UI needs — tooltips just want name → description.
interface CommonRule {
  id: string;
  name: string;
  description: string;
  coreType?: number;
}

interface CommonTrait {
  id: string;
  name: string;
  description: string;
}

export interface CommonRulesData {
  rules: CommonRule[];
  traits: CommonTrait[];
}

// Module-level cache keyed by game system slug — common rules don't change
// between army-book reloads so we read each system once per session.
const cache = new Map<string, Promise<CommonRulesData | null>>();

function fetchCommonRules(systemSlug: string): Promise<CommonRulesData | null> {
  const existing = cache.get(systemSlug);
  if (existing) return existing;
  const p = fetch(`${DATA_API}/${systemSlug}/common-rules.json`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<CommonRulesData>;
    })
    .catch(() => null);
  cache.set(systemSlug, p);
  return p;
}

export function useCommonRules(systemSlug: string | null | undefined) {
  const [data, setData] = useState<CommonRulesData | null>(null);

  useEffect(() => {
    if (!systemSlug) {
      setData(null);
      return;
    }
    let cancelled = false;
    fetchCommonRules(systemSlug).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [systemSlug]);

  // Build a name → description dict in the shape RuleText expects.
  // Traits are included too so hero-trait tooltips work in the same UI.
  const dict = useMemo<Record<string, string>>(() => {
    if (!data) return {};
    const out: Record<string, string> = {};
    for (const r of data.rules) if (r.name && r.description) out[r.name] = r.description;
    for (const t of data.traits) if (t.name && t.description && !out[t.name]) out[t.name] = t.description;
    return out;
  }, [data]);

  return { data, dict };
}
