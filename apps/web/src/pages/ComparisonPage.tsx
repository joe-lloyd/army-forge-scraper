import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import DiffView from "../components/DiffView";

// Bracketed scroll: sits compact inline when it fits, expands + scrolls when the row overflows
function BracketedScrollText({ text }: { text: string }) {
  const selfRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [duration, setDuration] = useState(8);

  useEffect(() => {
    const self = selfRef.current;
    const measure = measureRef.current;
    if (!self || !measure) return;
    // The parent flex row — does its content overflow its clipped width?
    const row = self.parentElement;
    if (!row) return;
    const overflows = row.scrollWidth > row.clientWidth;
    setShouldScroll(overflows);
    if (overflows) setDuration(Math.max(4, measure.scrollWidth / 50));
  }, [text]);

  if (!shouldScroll) {
    return (
      // Compact inline — takes only as much space as needed
      <span ref={selfRef} className="md:ml-1 inline-flex items-center shrink-0 opacity-60 whitespace-nowrap">
        {/* Hidden measurer so we can calc duration if we later switch */}
        <span ref={measureRef} className="invisible absolute whitespace-nowrap pointer-events-none">{text}</span>
        <span>[{text}]</span>
      </span>
    );
  }

  return (
    // Scroll mode — fills remaining space, loops text
    <span ref={selfRef} className="md:ml-1 inline-flex items-center flex-1 min-w-0 overflow-hidden opacity-60">
      <span className="shrink-0">[</span>
      <span className="overflow-hidden flex-1 min-w-0 relative">
        <span ref={measureRef} className="invisible absolute whitespace-nowrap pointer-events-none">{text}</span>
        <span className="animate-marquee-loop" style={{ animationDuration: `${duration}s` }}>
          {text}&nbsp;&nbsp;&nbsp;{text}
        </span>
      </span>
      <span className="shrink-0">]</span>
    </span>
  );
}

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const DATA_API = `${API_URL}/data`;

export default function ComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derived state from URL
  const selectedSystem = searchParams.get("system") || "";
  const versionA = searchParams.get("vA") || "";
  const versionB = searchParams.get("vB") || "";
  const selectedArmyId = searchParams.get("army") || "";

  // Data state
  const [systems, setSystems] = useState<string[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [armiesA, setArmiesA] = useState<{ id: string; name: string, genericName?: string }[]>(
    [],
  );
  const [armiesB, setArmiesB] = useState<any[]>([]);
  const [latestArmies, setLatestArmies] = useState<{ id: string; name: string, genericName?: string }[]>([]);
  const [armyDataA, setArmyDataA] = useState<any>(null);
  const [armyDataB, setArmyDataB] = useState<any>(null);

  // Helper to update params preserving others
  const updateParams = (updates: Record<string, string>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value) newParams.set(key, value);
        else newParams.delete(key);
      });
      return newParams;
    });
  };

  // Fetch Systems
  useEffect(() => {
    fetch(`${DATA_API}/index.json`) // Static index
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) {
          console.error("Expected array for systems, got:", data);
          return;
        }
        setSystems(data);
        if (!selectedSystem) {
          if (data.includes("grimdark-future")) {
            updateParams({ system: "grimdark-future" });
          } else if (data.length > 0) {
            updateParams({ system: data[0] });
          }
        }
      })
      .catch((err) => console.error("Failed to fetch systems:", err));
  }, []);

  // Fetch Versions when System changes
  useEffect(() => {
    if (!selectedSystem) return;
    fetch(`${DATA_API}/${selectedSystem}/index.json`) // Static index
      .then((res) => res.json())
      .then((data) => {
        // Sort versions descending (semver-ish)
        // Ensure data is array (it should be from our script)
        const sorted = Array.isArray(data) ? data.sort().reverse() : [];
        setVersions(sorted);

        // Only set defaults if missing from URL
        if (!versionA || !versionB) {
          if (sorted.length >= 2) {
            updateParams({
              vA: versionA || sorted[1],
              vB: versionB || sorted[0],
            });
          } else if (sorted.length === 1) {
            updateParams({ vA: sorted[0], vB: sorted[0] });
          }
        }
      });
  }, [selectedSystem]);

  // Fetch Armies when Version A changes (Base list)
  useEffect(() => {
    if (!selectedSystem || !versionA) return;
    fetch(`${DATA_API}/${selectedSystem}/${versionA}/index.json?t=${Date.now()}`) // Static index
      .then((res) => res.json())
      .then((data) => {
        setArmiesA(data);
        if (data.length > 0 && !selectedArmyId) {
          updateParams({ army: data[0].id });
        }
      });
  }, [selectedSystem, versionA]);

  // Fetch Armies for B just to have them matched
  useEffect(() => {
    if (!selectedSystem || !versionB) return;
    fetch(`${DATA_API}/${selectedSystem}/${versionB}/index.json?t=${Date.now()}`) // Static index
      .then((res) => res.json())
      .then((data) => setArmiesB(data));
  }, [selectedSystem, versionB]);

  // Fetch Latest Armies for generic names
  useEffect(() => {
    if (!selectedSystem || versions.length === 0) return;
    const latestVersion = versions[0];
    fetch(`${DATA_API}/${selectedSystem}/${latestVersion}/index.json?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => setLatestArmies(data));
  }, [selectedSystem, versions]);

  // Fetch Data when selections change
  useEffect(() => {
    if (!selectedSystem || !versionA || !selectedArmyId) return;

    // Fetch A
    // Static path: /data/system/version/filename.json (no /armies segment)
    fetch(`${DATA_API}/${selectedSystem}/${versionA}/${selectedArmyId}`)
      .then((res) => res.json())
      .then((dataA) => {
        setArmyDataA(dataA);

        // Try to find matching army in B
        if (versionB && armiesB.length > 0) {
          // Try exact match
          const exactMatch = armiesB.find((a) => a.id === selectedArmyId);
          if (exactMatch) {
            fetch(`${DATA_API}/${selectedSystem}/${versionB}/${selectedArmyId}`)
              .then((res) => res.json())
              .then((dataB) => setArmyDataB(dataB));
          } else {
            // Fuzzy match
            const namePrefix = selectedArmyId
              ? selectedArmyId.split("(")[0].trim()
              : "";
            const fuzzyMatch = armiesB.find((a) =>
              a.name.startsWith(namePrefix),
            );
            if (fuzzyMatch) {
              fetch(
                `${DATA_API}/${selectedSystem}/${versionB}/${fuzzyMatch.id}`,
              )
                .then((res) => res.json())
                .then((dataB) => setArmyDataB(dataB));
            } else {
              setArmyDataB(null);
            }
          }
        }
      });
  }, [selectedSystem, versionA, versionB, selectedArmyId, armiesB]);

  const formatGenericName = (name: string, gn?: string) => {
    if (!gn) return "";
    const parts = gn.includes("||") ? gn.split("||") : gn.split("/");
    return [...new Set(parts.map((p: string) => p.trim()).filter(Boolean))]
      .filter((p) => p !== name)
      .join(" / ");
  };

  return (
    <div className="min-h-screen">
      {/* Sticky full-width army comparison header */}
      {armyDataA && armyDataB && (
        <div className="sticky top-0 z-[60] w-full bg-slate-950/80 backdrop-blur-md border-b border-white/5">
          <div className="w-full md:max-w-[95vw] mx-auto px-2 md:px-4">
            <div className="grid grid-cols-3 gap-2 md:gap-6 py-3">
              <h3 className="text-center text-slate-400 font-semibold text-sm md:text-base leading-tight">
                <span className="flex flex-col md:flex-row items-center justify-center min-w-0 overflow-hidden">
                  <span className="shrink-0 whitespace-nowrap">{armyDataA.name}</span>
                  {formatGenericName(armyDataA.name, armyDataA.genericName) && (
                    <BracketedScrollText text={formatGenericName(armyDataA.name, armyDataA.genericName)} />
                  )}
                </span>
                <span className="text-xs opacity-50 block mt-0.5">{versionA}</span>
              </h3>
              <h3 className="text-center text-sky-400 font-bold tracking-widest text-sm md:text-base flex items-center justify-center">
                VS
              </h3>
              <h3 className="text-center text-slate-400 font-semibold text-sm md:text-base leading-tight">
                <span className="flex flex-col md:flex-row items-center justify-center min-w-0 overflow-hidden">
                  <span className="shrink-0 whitespace-nowrap">{armyDataB.name}</span>
                  {formatGenericName(armyDataB.name, armyDataB.genericName) && (
                    <BracketedScrollText text={formatGenericName(armyDataB.name, armyDataB.genericName)} />
                  )}
                </span>
                <span className="text-xs opacity-50 block mt-0.5">{versionB}</span>
              </h3>
            </div>
          </div>
        </div>
      )}

      <div className="w-full md:max-w-[95vw] mx-auto p-2 md:p-4">
        <header className="mb-8 text-center pt-8">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-indigo-500">
            Army Forge Compare
          </h1>
          <p className="text-slate-400">
            Visualize changes between patch versions
          </p>
        </header>

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
                  updateParams({
                    system: e.target.value,
                    vA: "",
                    vB: "",
                    army: "",
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
                onChange={(e) => updateParams({ vA: e.target.value })}
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
                onChange={(e) => updateParams({ vB: e.target.value })}
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
                onChange={(e) => updateParams({ army: e.target.value })}
              >
                <option value="">Select Army...</option>
                {armiesA.map((a: any) => {
                  const latest = latestArmies.find(l => l.id === a.id);
                  let genericName = latest?.genericName || a.genericName;
                  if (genericName) {
                    const parts = genericName.includes("||") ? genericName.split("||") : genericName.split("/");
                    genericName = [...new Set(parts.map((p: string) => p.trim()).filter(Boolean))].filter(p => p !== a.name).join(" / ");
                  }
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name} {genericName ? `[${genericName}]` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {armyDataA && armyDataB && (
          <DiffView
            dataA={armyDataA}
            dataB={armyDataB}
            versions={{ a: versionA, b: versionB }}
            hideHeader
          />
        )}

        {armyDataA && !armyDataB && (
          <div className="glass-card p-8 text-center">
            <h3 className="text-xl text-slate-400">
              Army not found in Version B
            </h3>
          </div>
        )}
      </div>
    </div>
  );
}
