import { useNavigate } from 'react-router-dom';
import { useSystemArmies } from '../hooks/useSystemArmies';
import { SystemCategoryView } from './SystemCategoryView';
import { ArmyDetailSkeleton } from './ArmyDetailSkeleton';

export default function SystemCategoryContainer() {
  const { system, armies, loading, error, search, setSearch } = useSystemArmies();
  const navigate = useNavigate();

  if (loading) return <ArmyDetailSkeleton />;

  if (!system || error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-slate-400">
        <p>{error ?? 'Game system not found.'}</p>
        <button
          onClick={() => navigate('/')}
          className="text-sky-400 hover:underline text-sm"
        >
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <SystemCategoryView
      system={system}
      armies={armies}
      search={search}
      onSearch={setSearch}
    />
  );
}
