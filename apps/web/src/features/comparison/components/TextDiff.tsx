import { diffWords } from 'diff';

interface TextDiffProps {
  textA: string;
  textB: string;
}

export function TextDiff({ textA, textB }: TextDiffProps) {
  const diffs = diffWords(textA, textB);

  return (
    <span>
      {diffs.map((part, index) => {
        if (part.added) {
          return (
            <span key={index} className="bg-lime-400/20 font-bold text-lime-400">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={index} className="bg-red-500/20 text-red-500 line-through opacity-70">
              {part.value}
            </span>
          );
        }
        return (
          <span key={index} className="text-slate-300">
            {part.value}
          </span>
        );
      })}
    </span>
  );
}
