import { Spinner } from '../../../components/ui/Spinner';

export function ArmyListSkeleton() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '4rem',
        color: 'var(--text-muted)',
      }}
    >
      <div className="animate-fade-in flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <span>Scanning for armies...</span>
      </div>
    </div>
  );
}
