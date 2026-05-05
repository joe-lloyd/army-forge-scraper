import { Spinner } from '../../../components/ui/Spinner';

export function ArmyDetailSkeleton() {
  return (
    <div className="container mx-auto px-4 py-32 text-center text-slate-400">
      <div className="animate-fade-in flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <span>Loading army intel...</span>
      </div>
    </div>
  );
}
