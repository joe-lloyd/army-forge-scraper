
interface CollapsibleSectionProps {
  title: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  headerClass?: string;
}

export function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
  headerClass = 'text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-500',
}: CollapsibleSectionProps) {
  return (
    <div className="mb-8 border-b border-white/5 pb-8 last:border-0 last:pb-0">
      <button
        onClick={onToggle}
        className="group mb-4 w-full flex items-center justify-between px-4 focus:outline-none"
      >
        <div className={headerClass}>{title}</div>
        <div
          className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-500 group-hover:text-sky-400"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </button>

      <div
        className={`transition-all duration-500 ${
          isOpen ? 'max-h-[50000px] opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
