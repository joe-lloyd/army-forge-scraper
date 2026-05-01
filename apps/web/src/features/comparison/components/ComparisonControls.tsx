
interface ComparisonControlsProps {
  systems: string[];
  versions: string[];
  armiesA: { id: string; name: string; genericName?: string }[];
  latestArmies: { id: string; name: string; genericName?: string }[];
  selectedSystem: string;
  versionA: string;
  versionB: string;
  selectedArmyId: string;
  onUpdateParams: (updates: Record<string, string>) => void;
}

export function ComparisonControls({
  systems,
  versions,
  armiesA,
  latestArmies,
  selectedSystem,
  versionA,
  versionB,
  selectedArmyId,
  onUpdateParams,
}: ComparisonControlsProps) {
  return (
    <div className="glass-card p-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-2 block">
            Game System
          </label>
          <select
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
            value={selectedSystem}
            onChange={(e) =>
              onUpdateParams({
                system: e.target.value,
                vA: '',
                vB: '',
                army: '',
              })
            }
          >
            {systems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-2 block">
            Version A (Left)
          </label>
          <select
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
            value={versionA}
            onChange={(e) => onUpdateParams({ vA: e.target.value })}
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-2 block">
            Version B (Right)
          </label>
          <select
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
            value={versionB}
            onChange={(e) => onUpdateParams({ vB: e.target.value })}
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-2 block">
            Army
          </label>
          <select
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
            value={selectedArmyId}
            onChange={(e) => onUpdateParams({ army: e.target.value })}
          >
            <option value="">Select Army...</option>
            {armiesA.map((a: any) => {
              const latest = latestArmies.find((l) => l.id === a.id);
              let genericName = latest?.genericName || a.genericName;
              if (genericName) {
                const parts = genericName.includes('||') ? genericName.split('||') : genericName.split('/');
                genericName = [...new Set(parts.map((p: string) => p.trim()).filter(Boolean))]
                  .filter((p) => p !== a.name)
                  .join(' / ');
              }
              return (
                <option key={a.id} value={a.id}>
                  {a.name} {genericName ? `[${genericName}]` : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    </div>
  );
}
