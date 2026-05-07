import { useEffect, useState } from 'react';

const STAGES = [
  'Parsing list JSON',
  'Resolving loadouts',
  'Running BalVal vs threat profiles',
  'Aggregating army stats',
  'Computing all-comers rating',
];

export function AnalyzerLoader() {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 1 ? i + 1 : i));
    }, 280);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="glass-card p-10 flex flex-col items-center gap-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-sky-500/20 blur-2xl animate-pulse" />
        <svg className="relative w-20 h-20 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
          <path
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-white mb-1">Crunching the numbers</h3>
        <p className="text-sm text-slate-400">All math runs locally — your list never leaves your browser.</p>
      </div>
      <ul className="w-full max-w-md space-y-2">
        {STAGES.map((s, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <li
              key={s}
              className={`flex items-center gap-3 text-sm transition-all ${
                done ? 'text-emerald-400' : active ? 'text-sky-300' : 'text-slate-600'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  done
                    ? 'bg-emerald-500/20 ring-1 ring-emerald-400/40'
                    : active
                      ? 'bg-sky-500/20 ring-1 ring-sky-400/40 animate-pulse'
                      : 'bg-slate-800 ring-1 ring-slate-700'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={active ? 'font-semibold' : ''}>{s}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
