import { useNavigate } from "react-router-dom";
import { GAME_SYSTEMS } from "@/features/explorer";

const SYSTEM_ICONS: Record<number, string> = {
  2: "⚔️",
  3: "🔫",
  4: "🏰",
  5: "🗡️",
};

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="max-w-3xl w-full text-center space-y-8 animate-fade-in z-10">
        <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-indigo-500 drop-shadow-sm">
          Army Forge Compare
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Visualize unit and upgrade changes between patch versions with precision. Ensure your lists are up-to-date.
        </p>

        <div className="pt-8">
          <button
            onClick={() => navigate('/compare')}
            className="px-10 py-5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-lg rounded-2xl shadow-[0_0_40px_rgba(56,189,248,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(56,189,248,0.5)]"
          >
            Start Comparison Tool
          </button>
        </div>

        {/* System category links */}
        <div className="pt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
            Browse Army Books by Game System
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {GAME_SYSTEMS.map((sys) => (
              <button
                key={sys.id}
                onClick={() => navigate(`/army/${sys.id}`)}
                className="group glass-card p-4 flex flex-col items-center gap-2 hover:border-sky-500/40 hover:shadow-[0_0_20px_rgba(56,189,248,0.12)] transition-all duration-300"
              >
                <span className="text-2xl">{SYSTEM_ICONS[sys.id] ?? "🎲"}</span>
                <span className="text-xs font-semibold text-slate-300 group-hover:text-sky-300 transition-colors leading-tight text-center">
                  {sys.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-20 p-8 glass-card border border-white/5 rounded-3xl bg-slate-900/50 backdrop-blur-md">
          <h2 className="text-2xl font-bold text-slate-200 mb-3">We need your feedback!</h2>
          <p className="text-slate-400 mb-6 text-sm max-w-lg mx-auto">
            Notice a missing unit? Found a bug in the diff calculation? Let us know so we can improve the tool for the community.
          </p>
          <a
            href="https://github.com/joe-lloyd/army-forge-scraper/issues"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors font-semibold"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Open an Issue on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

