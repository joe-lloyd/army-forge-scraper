import { useNavigate } from 'react-router-dom';
import { useArmyList, GAME_SYSTEMS } from '../hooks/useArmyList';
import { ArmyList } from './ArmyList';
import { ArmyListSkeleton } from './ArmyListSkeleton';
import { ArmyListEmpty } from './ArmyListEmpty';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

export default function ArmyListContainer() {
  const navigate = useNavigate();
  const {
    selectedSystem,
    setSelectedSystem,
    loading,
    search,
    setSearch,
    filteredArmies,
  } = useArmyList();

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="animate-fade-in text-4xl font-bold">Army Forge Explorer</h1>
        <p className="subtitle animate-fade-in text-gray-400">
          Official Army Books Data Browser
        </p>
        <div className="mt-4">
          <Button onClick={() => navigate('/compare')} variant="secondary">
            📊 Force Compare Tool
          </Button>
        </div>
      </header>

      <div className="system-selector animate-fade-in mb-8 flex flex-wrap justify-center gap-2">
        {GAME_SYSTEMS.map((sys) => (
          <Button
            key={sys.id}
            variant={selectedSystem === sys.id ? 'primary' : 'secondary'}
            onClick={() => setSelectedSystem(sys.id)}
            className="rounded-full"
          >
            {sys.name}
          </Button>
        ))}
      </div>

      <div className="animate-fade-in mb-12 flex justify-center">
        <Input
          type="text"
          placeholder="Search armies..."
          className="max-w-md bg-white/10 text-white placeholder:text-gray-400 border-white/20"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <ArmyListSkeleton />
      ) : filteredArmies.length === 0 ? (
        <ArmyListEmpty />
      ) : (
        <ArmyList armies={filteredArmies} />
      )}
    </div>
  );
}
