import { useCallback, useRef, useState } from 'react';

interface DropZoneProps {
  onSubmit: (input: { kind: 'json'; data: unknown } | { kind: 'share'; idOrUrl: string }) => void;
  disabled?: boolean;
}

export function DropZone({ onSubmit, disabled }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        onSubmit({ kind: 'json', data });
      } catch (e) {
        setError(`Couldn't parse JSON: ${(e as Error).message}`);
      }
    },
    [onSubmit],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onPasteSubmit = () => {
    setError(null);
    const trimmed = paste.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        onSubmit({ kind: 'json', data: JSON.parse(trimmed) });
      } catch (e) {
        setError(`Invalid JSON: ${(e as Error).message}`);
      }
      return;
    }
    onSubmit({ kind: 'share', idOrUrl: trimmed });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`glass-card p-10 cursor-pointer flex flex-col items-center justify-center gap-3 text-center transition-all ${
          dragOver ? 'border-sky-400 shadow-[0_0_40px_rgba(56,189,248,0.25)] scale-[1.01]' : 'border-slate-700/50'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="text-5xl">📥</div>
        <h2 className="text-xl font-bold text-white">Drop your Army Forge list JSON</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Export your list from Army Forge as JSON and drop it here, or click to browse.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <div className="flex-1 h-px bg-slate-700/50" />
        <span className="font-bold uppercase tracking-widest">or paste</span>
        <div className="flex-1 h-px bg-slate-700/50" />
      </div>

      <div className="glass-card p-4 flex flex-col gap-3">
        <label className="text-xs font-bold uppercase tracking-widest text-sky-400">
          Share URL, list ID, or raw JSON
        </label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="https://army-forge.onepagerules.com/share?id=abc123  •  abc123  •  {…}"
          className="w-full min-h-[80px] bg-slate-950/60 border border-slate-700/50 rounded-lg p-3 text-sm font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-y"
          disabled={disabled}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Share-link fetches go straight to Army Forge — analysis stays in your browser.
          </p>
          <button
            type="button"
            onClick={onPasteSubmit}
            disabled={disabled || !paste.trim()}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors"
          >
            Analyze
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
