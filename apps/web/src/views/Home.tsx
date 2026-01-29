import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const GAME_SYSTEMS = [
  { id: 2, name: "Grimdark Future", slug: "grimdark-future" },
  { id: 3, name: "Firefight", slug: "grimdark-future-firefight" },
  { id: 4, name: "Age of Fantasy", slug: "age-of-fantasy" },
  { id: 5, name: "Skirmish", slug: "age-of-fantasy-skirmish" },
];

interface ArmySummary {
  uid: string;
  name: string;
  genericName?: string;
  unitsCount: number;
  enabledGameSystems: number[];
  systemId: number;
}

export default function Home() {
  const [selectedSystem, setSelectedSystem] = useState(2);
  const [armies, setArmies] = useState<ArmySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3000/armies?gameSystem=${selectedSystem}`)
      .then((res) => res.json())
      .then((data) => {
        setArmies(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch armies:", err);
        setLoading(false);
      });
  }, [selectedSystem]);

  const filteredArmies = armies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="container">
      <header>
        <h1 className="animate-fade-in">Army Forge Explorer</h1>
        <p className="subtitle animate-fade-in">
          Official Army Books Data Browser
        </p>
        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={() => navigate("/compare")}
            className="btn-pill"
            style={{ fontSize: "0.9rem" }}
          >
            📊 Force Compare Tool
          </button>
        </div>
      </header>

      <div className="system-selector animate-fade-in">
        {GAME_SYSTEMS.map((sys) => (
          <button
            key={sys.id}
            className={`btn-pill ${selectedSystem === sys.id ? "active" : ""}`}
            onClick={() => setSelectedSystem(sys.id)}
          >
            {sys.name}
          </button>
        ))}
      </div>

      <div
        style={{
          marginBottom: "3rem",
          display: "flex",
          justifyContent: "center",
        }}
        className="animate-fade-in"
      >
        <input
          type="text"
          placeholder="Search armies..."
          className="glass-card"
          style={{
            padding: "1rem 2rem",
            width: "100%",
            maxWidth: "500px",
            outline: "none",
            color: "white",
            fontSize: "1rem",
          }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem",
            color: "var(--text-muted)",
          }}
        >
          <div className="animate-fade-in">Scanning for armies...</div>
        </div>
      ) : (
        <div className="army-grid">
          {filteredArmies.map((army) => (
            <div
              key={`${army.systemId}-${army.uid}`}
              className="glass-card army-card animate-fade-in"
              onClick={() => navigate(`/army/${army.systemId}/${army.uid}`)}
            >
              <div className="army-name">{army.name}</div>
              {army.genericName && (
                <div className="army-generic">{army.genericName}</div>
              )}
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                >
                  {army.unitsCount} units
                </span>
                <span
                  style={{
                    color: "var(--accent-color)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  VIEW DETAILS
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
