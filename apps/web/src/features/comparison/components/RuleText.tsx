
interface RuleTextProps {
  rule: {
    name?: string;
    label?: string;
    rating?: string | number;
  };
  specialRulesDict?: Record<string, string>;
}

export default function RuleText({ rule, specialRulesDict }: RuleTextProps) {
  const name =
    rule.name || (rule.label && rule.label.replace(/\(.*\)/, "")) || "Rule";

  const desc = specialRulesDict ? specialRulesDict[name] : null;

  const content = rule.rating ? (
    <span>
      {name}(<span className="font-bold">{rule.rating}</span>)
    </span>
  ) : (
    <span>{rule.label || name}</span>
  );

  if (desc) {
    return (
      <span className="relative group inline-block border-b border-dashed border-sky-400/50 cursor-help">
        {content}
        <div className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 max-w-[calc(100vw-2rem)] bg-slate-900 border border-sky-500/30 shadow-2xl rounded-lg p-3 text-xs text-slate-300 font-normal normal-case whitespace-normal backdrop-blur-sm">
          <div className="font-bold text-sky-400 mb-1 border-b border-sky-500/20 pb-1">{name}</div>
          <div className="leading-relaxed">{desc}</div>
        </div>
      </span>
    );
  }

  return content;
}

export function RuleList({ rules, specialRulesDict }: { rules: any[], specialRulesDict?: Record<string, string> }) {
  if (!rules || rules.length === 0) return null;
  return (
    <>
      {rules.map((r, i) => (
        <span key={i}>
          <RuleText rule={r} specialRulesDict={specialRulesDict} />
          {i < rules.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}
