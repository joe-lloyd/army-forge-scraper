import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ArmyBook, Unit } from "@opr-api/shared";

export default function ArmyDetail() {
  const { systemId, armyId } = useParams();
  const [army, setArmy] = useState<ArmyBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3000/armies/${armyId}?gameSystem=${systemId}`)
      .then((res) => res.json())
      .then((data) => {
        setArmy(data);
        // Automatically select first hero or unit if available
        if (data.units?.length > 0) {
          setSelectedUnit(data.units[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch army details:", err);
        setLoading(false);
      });
  }, [systemId, armyId]);

  if (loading) {
    return (
      <div
        className="container"
        style={{ textAlign: "center", padding: "10rem" }}
      >
        <div className="animate-fade-in">Loading army intel...</div>
      </div>
    );
  }

  if (!army) {
    return (
      <div
        className="container"
        style={{ textAlign: "center", padding: "10rem" }}
      >
        <h2>Army not found</h2>
        <button className="btn-pill active" onClick={() => navigate("/")}>
          Back Home
        </button>
      </div>
    );
  }

  const heroes = army.units.filter((u) =>
    u.rules.some((r) => r.name === "Hero"),
  );
  const standardUnits = army.units.filter(
    (u) => !u.rules.some((r) => r.name === "Hero"),
  );

  const renderUnitCard = (unit: Unit) => (
    <div
      key={unit.id}
      className={`glass-card unit-item ${selectedUnit?.id === unit.id ? "active" : ""}`}
      style={{
        flexDirection: "column",
        cursor: "pointer",
        border:
          selectedUnit?.id === unit.id ? "2px solid var(--accent-color)" : "",
        background:
          selectedUnit?.id === unit.id ? "rgba(56, 189, 248, 0.05)" : "",
      }}
      onClick={() => setSelectedUnit(unit)}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          marginBottom: "1rem",
        }}
      >
        <div className="unit-info">
          <h4 style={{ fontSize: "1.4rem" }}>{unit.name}</h4>
          <div className="unit-stats">
            Models: {unit.size} | Qua {unit.quality}+ | Def {unit.defense}+
          </div>
        </div>
        <div className="unit-cost">{unit.cost}pts</div>
      </div>

      <div style={{ marginBottom: "0.5rem" }}>
        {unit.rules.map((r) => (
          <span
            key={r.id}
            style={{
              fontSize: "0.7rem",
              background: "rgba(255,255,255,0.05)",
              padding: "0.15rem 0.4rem",
              borderRadius: "4px",
              marginRight: "0.4rem",
              color: "var(--text-muted)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="container"
      style={{ paddingBottom: "5rem", maxWidth: "1400px" }}
    >
      <button
        className="btn-pill"
        onClick={() => navigate(-1)}
        style={{ marginBottom: "2rem" }}
      >
        &larr; Back to List
      </button>

      <div
        className="glass-card"
        style={{ padding: "2rem 3rem", marginBottom: "2rem" }}
      >
        <div
          style={{
            borderLeft: "6px solid var(--accent-color)",
            paddingLeft: "2rem",
          }}
        >
          <h1
            style={{
              fontSize: "2.5rem",
              marginBottom: "0.5rem",
              textAlign: "left",
            }}
          >
            {army.name}
          </h1>
          <p
            className="army-generic"
            style={{ fontSize: "1.1rem", marginBottom: "0" }}
          >
            {army.genericName}
          </p>
        </div>
      </div>

      <div className="detail-layout">
        {/* Main Roster area */}
        <div className="roster-main">
          {heroes.length > 0 && (
            <>
              <h3 className="section-header" style={{ marginTop: 0 }}>
                Heroes
              </h3>
              <div
                className="unit-grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                }}
              >
                {heroes.map(renderUnitCard)}
              </div>
            </>
          )}

          {standardUnits.length > 0 && (
            <>
              <h3 className="section-header">Units</h3>
              <div
                className="unit-grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                }}
              >
                {standardUnits.map(renderUnitCard)}
              </div>
            </>
          )}
        </div>

        {/* Persistent Sidebar Area */}
        <div className="sidebar">
          {selectedUnit ? (
            <>
              <div className="sidebar-header">
                <h2
                  style={{ fontSize: "1.6rem", color: "var(--accent-color)" }}
                >
                  {selectedUnit.name}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                    fontSize: "0.9rem",
                  }}
                >
                  {selectedUnit.genericName || "Unit Armory"}
                </div>
              </div>

              <div className="sidebar-content">
                <div className="unit-detail-section">
                  <span className="unit-detail-label">Base Profile</span>
                  <div
                    className="glass-card"
                    style={{
                      padding: "1rem",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "0.5rem",
                      textAlign: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.65rem",
                        }}
                      >
                        SIZE
                      </div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                        {selectedUnit.size}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.65rem",
                        }}
                      >
                        QUALITY
                      </div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                        {selectedUnit.quality}+
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.65rem",
                        }}
                      >
                        DEFENSE
                      </div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                        {selectedUnit.defense}+
                      </div>
                    </div>
                  </div>
                </div>

                <div className="unit-detail-section">
                  <span className="unit-detail-label">Weapons</span>
                  <table className="weapon-table">
                    <thead>
                      <tr>
                        <th>WEAPON</th>
                        <th>RNG</th>
                        <th>A</th>
                        <th>SPECIAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUnit.weapons.map((w) => (
                        <tr key={w.id}>
                          <td style={{ fontWeight: 600 }}>
                            {w.name} {w.count > 1 ? `x${w.count}` : ""}
                          </td>
                          <td>{w.range > 0 ? `${w.range}"` : "M"}</td>
                          <td>{w.attacks}</td>
                          <td
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "0.7rem",
                            }}
                          >
                            {w.specialRules
                              .map((sr: any) => sr.label)
                              .join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="unit-detail-section">
                  <span className="unit-detail-label">Special Rules</span>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}
                  >
                    {selectedUnit.rules.map((r) => (
                      <div
                        key={r.id}
                        className="glass-card"
                        style={{
                          padding: "0.4rem 0.6rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        {r.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="unit-detail-section">
                  <span className="unit-detail-label">Upgrades</span>
                  {selectedUnit.upgrades.map((pkgUid) => {
                    const pkg = army.upgradePackages.find(
                      (p) => p.uid === pkgUid,
                    );
                    if (!pkg) return null;
                    return (
                      <div key={pkg.uid} style={{ marginBottom: "1.5rem" }}>
                        {pkg.sections.map((section) => (
                          <div key={section.id} className="upgrade-group">
                            <div
                              className="upgrade-group-label"
                              style={{ fontSize: "0.7rem" }}
                            >
                              {section.label}
                            </div>
                            {section.options.map((option) => (
                              <div
                                key={option.id}
                                className="upgrade-option"
                                style={{
                                  padding: "0.5rem",
                                  marginBottom: "0.35rem",
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      fontSize: "0.85rem",
                                    }}
                                  >
                                    {option.label}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.65rem",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {option.gains
                                      .map((g: any) => g.label || g.name)
                                      .join(", ")}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    color: "var(--accent-color)",
                                    fontWeight: 800,
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  +{option.cost}p
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--border-color)",
                  background: "rgba(56, 189, 248, 0.05)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}
                >
                  Base Points
                </span>
                <span
                  style={{
                    fontSize: "1.3rem",
                    fontWeight: 800,
                    color: "var(--accent-color)",
                  }}
                >
                  {selectedUnit.cost}pts
                </span>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                padding: "2rem",
                textAlign: "center",
              }}
            >
              Select a unit to view its armory and powers
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
