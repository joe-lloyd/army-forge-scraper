import { useComparison } from '../hooks/useComparison';
import { ComparisonHeader } from './ComparisonHeader';
import { ComparisonControls } from './ComparisonControls';
import DiffView from './DiffView';

export function ComparisonFeatureContainer() {
  const {
    selectedSystem,
    versionA,
    versionB,
    selectedArmyId,
    systems,
    versions,
    armiesA,
    latestArmies,
    armyDataA,
    armyDataB,
    updateParams,
  } = useComparison();

  return (
    <div className="min-h-screen">
      <ComparisonHeader
        armyDataA={armyDataA}
        armyDataB={armyDataB}
        versionA={versionA}
        versionB={versionB}
      />

      <div className="mx-auto w-full p-2 md:max-w-[95vw] md:p-4">
        <header className="mb-8 pt-8 text-center">
          <h1 className="mb-2 bg-gradient-to-br from-sky-400 to-indigo-500 bg-clip-text text-4xl font-extrabold text-transparent md:text-5xl">
            Army Forge Compare
          </h1>
          <p className="text-slate-400">Visualize changes between patch versions</p>
        </header>

        <ComparisonControls
          systems={systems}
          versions={versions}
          armiesA={armiesA}
          latestArmies={latestArmies}
          selectedSystem={selectedSystem}
          versionA={versionA}
          versionB={versionB}
          selectedArmyId={selectedArmyId}
          onUpdateParams={updateParams}
        />

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
            <h3 className="text-xl text-slate-400">Army not found in Version B</h3>
          </div>
        )}
      </div>
    </div>
  );
}
