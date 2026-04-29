
interface RuleTextProps {
  rule: {
    name?: string;
    label?: string;
    rating?: string | number;
  };
}

export default function RuleText({ rule }: RuleTextProps) {
  const name =
    rule.name || (rule.label && rule.label.replace(/\(.*\)/, "")) || "Rule";

  if (rule.rating) {
    return (
      <span>
        {name}(<span className="font-bold">{rule.rating}</span>)
      </span>
    );
  }

  return <span>{rule.label || name}</span>;
}

export function RuleList({ rules }: { rules: any[] }) {
  if (!rules || rules.length === 0) return null;
  return (
    <>
      {rules.map((r, i) => (
        <span key={i}>
          <RuleText rule={r} />
          {i < rules.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}
