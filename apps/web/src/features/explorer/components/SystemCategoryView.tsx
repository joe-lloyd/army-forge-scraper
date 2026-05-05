import { useNavigate } from 'react-router-dom';
import type { SystemArmy } from '../hooks/useSystemArmies';
import type { GAME_SYSTEMS } from '../hooks/useArmyList';

type GameSystem = (typeof GAME_SYSTEMS)[number];

interface SystemCategoryViewProps {
  system: GameSystem;
  armies: SystemArmy[];
  search: string;
  onSearch: (val: string) => void;
}

export function SystemCategoryView({ system, armies, search, onSearch }: SystemCategoryViewProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-sky-500/10 rounded-full blur-[120px] -z-10" />

      <div className="container mx-auto px-4 py-12">
        {/* Back breadcrumb */}
        <button
          onClick={() => navigate('/')}
          className="mb-8 inline-flex items-center gap-2 text-slate-400 hover:text-sky-400 transition-colors text-sm font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>

        {/* Header */}
        <header className="mb-8 animate-fade-in">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-2">Army Books</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-indigo-500 mb-3">
            {system.name}
          </h1>
          <p className="text-slate-400 text-lg">
            {armies.length} army book{armies.length !== 1 ? 's' : ''} available — click one to explore its units and upgrades.
          </p>
        </header>

        {/* Search — matches comparison controls style */}
        <div className="glass-card p-6 mb-8 animate-fade-in">
          <label className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-2 block">
            Search Army Books
          </label>
          <div className="relative max-w-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search armies…"
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
        </div>

        {/* Army grid */}
        {armies.length === 0 ? (
          <div className="glass-card p-12 text-center text-slate-400 italic">
            No armies match your search.
          </div>
        ) : (
          <ul className="army-grid animate-fade-in">
            {armies.map((army) => (
              <li key={army.uid}>
                <button
                  onClick={() => navigate(`/army/${system.id}/${army.uid}`)}
                  className="group w-full text-left glass-card p-5 hover:border-sky-500/50 hover:shadow-[0_0_24px_rgba(56,189,248,0.15)] transition-all duration-300 flex flex-col gap-2"
                >
                  {/* Army name */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-base font-bold text-white group-hover:text-sky-300 transition-colors leading-snug">
                      {army.name}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Generic name */}
                  {army.genericName && (
                    <span className="text-xs text-slate-400 leading-snug">
                      {army.genericName}
                    </span>
                  )}

                  {/* Footer */}
                  <div className="mt-auto pt-3 border-t border-slate-700/50 flex items-center justify-between">
                    <span className="text-xs text-sky-400 font-semibold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                      View Army →
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
