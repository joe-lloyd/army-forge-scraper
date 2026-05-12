import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DropZone,
  AnalyzerLoader,
  ArmyStatsCard,
  UnitAnalysisCard,
  parseArmyForgeList,
  fetchListById,
  extractShareId,
  analyzeList,
  type ArmyAnalysis,
} from '@/features/analyzer';
import { useSavedLists, type SavedListSource } from '@/features/analyzer/hooks/useSavedLists';
import { snapshotFromAnalysis } from '@/features/analyzer/utils/snapshot';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; analysis: ArmyAnalysis; source: SavedListSource };

const MIN_LOADER_MS = 900;

export default function AnalyzerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const { lists, add, getById } = useSavedLists();
  const autoLoadedRef = useRef<string | null>(null);

  const runAnalysisFromJson = useCallback(
    async (json: unknown, source: SavedListSource) => {
      const t0 = Date.now();
      const parsed = parseArmyForgeList(json);
      await new Promise((r) => setTimeout(r, 0));
      const analysis = analyzeList(parsed.name, parsed.units, {
        canonicalPoints: parsed.listPoints ?? parsed.pointsTotal,
        pointsLimit: parsed.pointsLimit,
        squadCount: parsed.squadCount,
        heroCount: parsed.heroCount,
      });
      const elapsed = Date.now() - t0;
      if (elapsed < MIN_LOADER_MS) await new Promise((r) => setTimeout(r, MIN_LOADER_MS - elapsed));
      setStatus({ kind: 'done', analysis, source });
    },
    [],
  );

  const handleSubmit = useCallback(
    async (input: { kind: 'json'; data: unknown } | { kind: 'share'; idOrUrl: string }) => {
      setStatus({ kind: 'loading' });
      try {
        if (input.kind === 'json') {
          await runAnalysisFromJson(input.data, { kind: 'json', raw: input.data });
        } else {
          const id = extractShareId(input.idOrUrl);
          if (!id) throw new Error("Couldn't read a list ID from that input.");
          const json = await fetchListById(id);
          await runAnalysisFromJson(json, { kind: 'share', shareId: id });
        }
      } catch (e) {
        setStatus({ kind: 'error', message: (e as Error).message ?? String(e) });
      }
    },
    [runAnalysisFromJson],
  );

  // Auto-load when navigated from SavedListsPage with a savedListId in state.
  useEffect(() => {
    const stateId = (location.state as { savedListId?: string } | null)?.savedListId;
    if (!stateId) return;
    if (autoLoadedRef.current === stateId) return;
    const saved = getById(stateId);
    if (!saved) return;
    autoLoadedRef.current = stateId;
    setStatus({ kind: 'loading' });
    (async () => {
      try {
        if (saved.source.kind === 'share') {
          const json = await fetchListById(saved.source.shareId);
          await runAnalysisFromJson(json, saved.source);
        } else {
          await runAnalysisFromJson(saved.source.raw, saved.source);
        }
      } catch (e) {
        setStatus({ kind: 'error', message: (e as Error).message ?? String(e) });
      }
    })();
    // Clear the navigation state so a refresh doesn't re-trigger.
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, getById, runAnalysisFromJson, navigate]);

  const reset = () => setStatus({ kind: 'idle' });

  const handleSave = useCallback(() => {
    if (status.kind !== 'done') return;
    const defaultLabel = status.analysis.listName;
    const label = window.prompt('Label for this saved list:', defaultLabel);
    if (label === null) return;
    const trimmed = label.trim() || defaultLabel;
    try {
      add({
        label: trimmed,
        source: status.source,
        snapshot: snapshotFromAnalysis(status.analysis),
      });
      setSaveFlash(
        status.source.kind === 'share'
          ? `Saved "${trimmed}" — will re-fetch live from Army Forge on view.`
          : `Saved "${trimmed}" (static snapshot).`,
      );
      setTimeout(() => setSaveFlash(null), 4000);
    } catch (e) {
      setSaveFlash(`Save failed: ${(e as Error).message}`);
    }
  }, [add, status]);

  const sortedUnits = useMemo(() => {
    if (status.kind !== 'done') return [];
    return [...status.analysis.units].sort((a, b) => b.avgEfficiency - a.avgEfficiency);
  }, [status]);

  return (
    <div className="container mx-auto max-w-[1200px] px-4 pb-20 pt-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-400">
        <button onClick={() => navigate('/')} className="hover:text-sky-400 transition-colors">
          Home
        </button>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200 font-medium">List Analyzer</span>
      </nav>

      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-2">List Analyzer</h1>
          <p className="subtitle">
            Drop in your Army Forge list. We score it against four opponent armies and flag where
            it shines and where it folds.
          </p>
        </div>
        <button
          onClick={() => navigate('/analyzer/saved')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 shrink-0"
        >
          📋 Saved {lists.length > 0 && <span className="ml-1 text-sky-400">({lists.length})</span>}
        </button>
      </header>

      {status.kind === 'idle' && <DropZone onSubmit={handleSubmit} />}

      {status.kind === 'loading' && <AnalyzerLoader />}

      {status.kind === 'error' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">
            <p className="font-bold mb-1">Couldn't analyze that list</p>
            <p className="text-sm">{status.message}</p>
          </div>
          <button
            onClick={reset}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm rounded-lg"
          >
            Try again
          </button>
        </div>
      )}

      {status.kind === 'done' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-sm font-bold rounded-lg border border-emerald-400/40 transition-colors"
              >
                💾 Save list
              </button>
              {status.source.kind === 'share' && (
                <span className="text-[11px] text-slate-500 font-mono">
                  Share ID: {status.source.shareId} · re-fetches on re-view
                </span>
              )}
            </div>
            <button
              onClick={reset}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700"
            >
              Analyze another list
            </button>
          </div>
          {saveFlash && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
              {saveFlash}
            </div>
          )}
          <ArmyStatsCard analysis={status.analysis} />
          <div>
            <h2 className="section-header text-2xl font-bold text-white">Per-Unit Breakdown</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortedUnits.map((u) => (
                <UnitAnalysisCard key={u.unitId} unit={u} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
