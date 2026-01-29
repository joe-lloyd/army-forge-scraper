import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DiffView from "../components/DiffView";

const DATA_API = "http://localhost:3000/data";

export default function ComparisonPage() {
  const [systems, setSystems] = useState<string[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>("");

  const [versions, setVersions] = useState<string[]>([]);
  const [versionA, setVersionA] = useState<string>("");
  const [versionB, setVersionB] = useState<string>("");

  const [armiesA, setArmiesA] = useState<{ id: string; name: string }[]>([]);
  const [armiesB, setArmiesB] = useState<{ id: string; name: string }[]>([]);
  const [selectedArmyId, setSelectedArmyId] = useState<string>("");

  const [armyDataA, setArmyDataA] = useState<any>(null);
  const [armyDataB, setArmyDataB] = useState<any>(null);

  // Fetch Systems
  useEffect(() => {
    fetch(`${DATA_API}/systems`)
      .then((res) => res.json())
      .then((data) => {
        setSystems(data);
        if (data.includes("grimdark-future")) {
          setSelectedSystem("grimdark-future");
        } else if (data.length > 0) {
          setSelectedSystem(data[0]);
        }
      });
  }, []);

  // Fetch Versions when System changes
  useEffect(() => {
    if (!selectedSystem) return;
    fetch(`${DATA_API}/${selectedSystem}/versions`)
      .then((res) => res.json())
      .then((data) => {
        // Sort versions descending (semver-ish)
        const sorted = data.sort().reverse();
        setVersions(sorted);
        if (sorted.length >= 2) {
          setVersionA(sorted[1]); // Older
          setVersionB(sorted[0]); // Newer
        } else if (sorted.length === 1) {
          setVersionA(sorted[0]);
          setVersionB(sorted[0]);
        }
      });
  }, [selectedSystem]);

  // Fetch Armies when Version A changes (Base list)
  useEffect(() => {
    if (!selectedSystem || !versionA) return;
    fetch(`${DATA_API}/${selectedSystem}/${versionA}/armies`)
      .then((res) => res.json())
      .then((data) => {
        setArmiesA(data);
        if (data.length > 0 && !selectedArmyId) {
          // Default to first army if none selected
          setSelectedArmyId(data[0]);
          // Actually, we want ID. API returns {id, name}
          // Let's explicitly wait for user selection or pick first
          // setSelectedArmyId(data[0].name); // Use Name for matching or ID? Files might be named differently but name field in JSON is same.
          // The API list returns filenames as IDs.
        }
      });
  }, [selectedSystem, versionA]);

  // Fetch Armies for B just to have them matched
  useEffect(() => {
    if (!selectedSystem || !versionB) return;
    fetch(`${DATA_API}/${selectedSystem}/${versionB}/armies`)
      .then((res) => res.json())
      .then((data) => setArmiesB(data));
  }, [selectedSystem, versionB]);

  // Fetch Data when selections change
  useEffect(() => {
    if (!selectedSystem || !versionA || !selectedArmyId) return;

    // Find ID in Version A
    // The selector stores the filename (id) from Version A.
    // For Version B, we need to find the equivalent file.
    // Usually filenames are stable: "Army Name (UID).json"
    // But UID might stay same? UID is inside the file. Filename usually has UID.
    // Let's try to match by Name first or just use the same filename and see if it exists in B.

    // Fetch A
    fetch(`${DATA_API}/${selectedSystem}/${versionA}/armies/${selectedArmyId}`)
      .then((res) => res.json())
      .then((dataA) => {
        setArmyDataA(dataA);

        // Try to find matching army in B
        if (versionB && armiesB.length > 0) {
          // Try exact filename match first
          const exactMatch = armiesB.find((a) => a.id === selectedArmyId);
          if (exactMatch) {
            fetch(
              `${DATA_API}/${selectedSystem}/${versionB}/armies/${selectedArmyId}`,
            )
              .then((res) => res.json())
              .then((dataB) => setArmyDataB(dataB));
          } else {
            // Try match by Name inside the JSON? We don't have it yet.
            // Match by filename prefix? "Beastmen (..."
            const namePrefix = selectedArmyId
              ? selectedArmyId.split("(")[0].trim()
              : "";
            const fuzzyMatch = armiesB.find((a) =>
              a.name.startsWith(namePrefix),
            );
            if (fuzzyMatch) {
              fetch(
                `${DATA_API}/${selectedSystem}/${versionB}/armies/${fuzzyMatch.id}`,
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

  return (
    <div className="w-full max-w-[95vw] mx-auto p-4">
      <header className="mb-8 text-center pt-8">
        <Link
          to="/"
          className="text-slate-400 hover:text-white transition-colors mb-4 inline-block"
        >
          ← Back
        </Link>
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
              onChange={(e) => setSelectedSystem(e.target.value)}
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
              onChange={(e) => setVersionA(e.target.value)}
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
              onChange={(e) => setVersionB(e.target.value)}
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
              onChange={(e) => setSelectedArmyId(e.target.value)}
            >
              <option value="">Select Army...</option>
              {armiesA.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {armyDataA && armyDataB && (
        <DiffView dataA={armyDataA} dataB={armyDataB} />
      )}

      {armyDataA && !armyDataB && (
        <div className="glass-card p-8 text-center">
          <h3 className="text-xl text-slate-400">
            Army not found in Version B
          </h3>
        </div>
      )}
    </div>
  );
}
