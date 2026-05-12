import { useNavigate } from 'react-router-dom';
import { useSavedLists, type SavedList } from '@/features/analyzer/hooks/useSavedLists';
import { OPPONENT_PROFILES } from '@/features/analyzer';
import { TierBadge } from '@/features/analyzer/components/TierBadge';

export default function SavedListsPage() {
  const navigate = useNavigate();
  const { lists, remove } = useSavedLists();

  return (
    <div className="container mx-auto max-w-[1200px] px-4 pb-20 pt-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-400">
        <button onClick={() => navigate('/')} className="hover:text-sky-400 transition-colors">
          Home
        </button>
        <span className="text-slate-600">/</span>
        <button onClick={() => navigate('/analyzer')} className="hover:text-sky-400 transition-colors">
          List Analyzer
        </button>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200 font-medium">Saved Lists</span>
      </nav>

      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-2">Saved Lists</h1>
          <p className="subtitle">
            Stored locally in this browser. Share-link saves re-fetch from Army Forge for the
            latest version each time you view them.
          </p>
        </div>
        <button
          onClick={() => navigate('/analyzer')}
          className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm rounded-lg shrink-0"
        >
          + Analyze new list
        </button>
      </header>

      {lists.length === 0 ? (
        <EmptyState onNavigate={() => navigate('/analyzer')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {lists.map((list) => (
            <SavedListCard
              key={list.id}
              list={list}
              onView={() => navigate('/analyzer', { state: { savedListId: list.id } })}
              onRemove={() => {
                if (window.confirm(`Remove "${list.label}" from saved lists?`)) remove(list.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="glass-card p-10 text-center">
      <div className="text-5xl mb-3">📋</div>
      <h2 className="text-xl font-bold text-white mb-2">No saved lists yet</h2>
      <p className="text-sm text-slate-400 mb-5 max-w-md mx-auto">
        Analyze a list, then click <span className="font-mono text-sky-300">Save list</span> to
        keep it here for quick access.
      </p>
      <button
        onClick={onNavigate}
        className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm rounded-lg"
      >
        Go to analyzer
      </button>
    </div>
  );
}

function SavedListCard({
  list,
  onView,
  onRemove,
}: {
  list: SavedList;
  onView: () => void;
  onRemove: () => void;
}) {
  const { snapshot, source, savedAt, label } = list;
  return (
    <div className="glass-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white truncate">{label}</h3>
          {snapshot.listName !== label && (
            <p className="text-[11px] text-slate-500 truncate font-mono">{snapshot.listName}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-0.5">
            {snapshot.totalPoints} pts ·{' '}
            <span title={new Date(savedAt).toLocaleString()}>{relativeTime(savedAt)}</span>
            {source.kind === 'share' ? (
              <span className="ml-2 text-sky-400 font-mono text-[10px]">↻ live</span>
            ) : (
              <span className="ml-2 text-slate-500 font-mono text-[10px]">static</span>
            )}
          </p>
        </div>
        <TierBadge tier={snapshot.overallTier} size="md" />
      </div>

      <div className="grid grid-cols-4 gap-1">
        {snapshot.perProfile.map((p) => {
          const profile = OPPONENT_PROFILES.find((op) => op.id === p.profileId);
          return (
            <div
              key={p.profileId}
              className="rounded border border-slate-700/50 bg-slate-900/40 p-1.5 text-center"
              title={`${profile?.name}: ${Math.round(p.killPercent * 100)}% kill`}
            >
              <div className="text-[9px] text-slate-400 font-bold uppercase truncate">
                {profile?.short ?? p.profileId}
              </div>
              <div className="text-sm font-extrabold leading-tight mt-0.5">
                <span className={tierColor(p.tier)}>{p.tier}</span>
              </div>
              <div className="text-[9px] text-slate-500 font-mono">
                {Math.round(p.killPercent * 100)}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onView}
          className="flex-1 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-lg"
        >
          {source.kind === 'share' ? 'Re-fetch & view' : 'View'}
        </button>
        <button
          onClick={onRemove}
          className="px-3 py-2 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 font-semibold text-xs rounded-lg border border-slate-700"
          aria-label="Remove"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function tierColor(t: string): string {
  switch (t) {
    case 'S':
      return 'text-sky-300';
    case 'A':
      return 'text-emerald-300';
    case 'B':
      return 'text-slate-200';
    case 'C':
      return 'text-amber-300';
    default:
      return 'text-rose-300';
  }
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}
