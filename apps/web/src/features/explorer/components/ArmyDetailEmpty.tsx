import { useNavigate } from 'react-router-dom';

export function ArmyDetailEmpty() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-32 text-center">
      <div className="glass-card inline-block p-12 max-w-md mx-auto">
        <h2 className="mb-3 text-2xl font-bold text-white">Army not found</h2>
        <p className="text-slate-400 mb-8 text-sm">
          This army book couldn't be loaded. It may have been removed or the ID is incorrect.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
