import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; analysis: ArmyAnalysis };

const MIN_LOADER_MS = 900;

export default function AnalyzerPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const runAnalysis = useCallback(async (json: unknown) => {
    const t0 = Date.now();
    const parsed = parseArmyForgeList(json);
    // yield to event loop so loader paints
    await new Promise((r) => setTimeout(r, 0));
    const analysis = analyzeList(parsed.name, parsed.units, {
      canonicalPoints: parsed.listPoints ?? parsed.pointsTotal,
      pointsLimit: parsed.pointsLimit,
      squadCount: parsed.squadCount,
      heroCount: parsed.heroCount,
    });
    const elapsed = Date.now() - t0;
    if (elapsed < MIN_LOADER_MS) await new Promise((r) => setTimeout(r, MIN_LOADER_MS - elapsed));
    setStatus({ kind: 'done', analysis });
  }, []);

  const handleSubmit = useCallback(
    async (input: { kind: 'json'; data: unknown } | { kind: 'share'; idOrUrl: string }) => {
      setStatus({ kind: 'loading' });
      try {
        if (input.kind === 'json') {
          await runAnalysis(input.data);
        } else {
          const id = extractShareId(input.idOrUrl);
          if (!id) throw new Error("Couldn't read a list ID from that input.");
          const json = await fetchListById(id);
          await runAnalysis(json);
        }
      } catch (e) {
        setStatus({ kind: 'error', message: (e as Error).message ?? String(e) });
      }
    },
    [runAnalysis],
  );

  const reset = () => setStatus({ kind: 'idle' });

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

      <header className="mb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-2">List Analyzer</h1>
        <p className="subtitle">
          Drop in your Army Forge list. We score it across five threat profiles and tell you where it shines and where it folds.
        </p>
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
          <div className="flex justify-end">
            <button
              onClick={reset}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700"
            >
              Analyze another list
            </button>
          </div>
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
