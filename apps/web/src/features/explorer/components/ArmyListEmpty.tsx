
export function ArmyListEmpty() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '4rem',
        color: 'var(--text-muted)',
      }}
    >
      <div className="animate-fade-in">No armies found.</div>
    </div>
  );
}
