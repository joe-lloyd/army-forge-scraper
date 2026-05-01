import { BracketedScrollText } from '@/components/ui/BracketedScrollText';

interface ComparisonHeaderProps {
  armyDataA: any;
  armyDataB: any;
  versionA: string;
  versionB: string;
}

export function ComparisonHeader({ armyDataA, armyDataB, versionA, versionB }: ComparisonHeaderProps) {
  const formatGenericName = (name: string, gn?: string) => {
    if (!gn) return '';
    const parts = gn.includes('||') ? gn.split('||') : gn.split('/');
    return [...new Set(parts.map((p: string) => p.trim()).filter(Boolean))]
      .filter((p) => p !== name)
      .join(' / ');
  };

  if (!armyDataA || !armyDataB) return null;

  return (
    <div className="sticky top-0 z-[60] w-full bg-slate-950/80 backdrop-blur-md border-b border-white/5">
      <div className="w-full md:max-w-[95vw] mx-auto px-2 md:px-4">
        <div className="grid grid-cols-3 gap-2 md:gap-6 py-3">
          <h3 className="text-center text-slate-400 font-semibold text-sm md:text-base leading-tight">
            <span className="flex flex-col md:flex-row items-center justify-center min-w-0 overflow-hidden">
              <span className="shrink-0 whitespace-nowrap">{armyDataA.name}</span>
              {formatGenericName(armyDataA.name, armyDataA.genericName) && (
                <BracketedScrollText text={formatGenericName(armyDataA.name, armyDataA.genericName)} />
              )}
            </span>
            <span className="text-xs opacity-50 block mt-0.5">{versionA}</span>
          </h3>
          <h3 className="text-center text-sky-400 font-bold tracking-widest text-sm md:text-base flex items-center justify-center">
            VS
          </h3>
          <h3 className="text-center text-slate-400 font-semibold text-sm md:text-base leading-tight">
            <span className="flex flex-col md:flex-row items-center justify-center min-w-0 overflow-hidden">
              <span className="shrink-0 whitespace-nowrap">{armyDataB.name}</span>
              {formatGenericName(armyDataB.name, armyDataB.genericName) && (
                <BracketedScrollText text={formatGenericName(armyDataB.name, armyDataB.genericName)} />
              )}
            </span>
            <span className="text-xs opacity-50 block mt-0.5">{versionB}</span>
          </h3>
        </div>
      </div>
    </div>
  );
}
