import { useState, useEffect, useRef } from "react";

// Bracketed scroll: sits compact inline when it fits, expands + scrolls when the row overflows
export function BracketedScrollText({ text }: { text: string }) {
  const selfRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [duration, setDuration] = useState(8);

  useEffect(() => {
    const self = selfRef.current;
    const measure = measureRef.current;
    if (!self || !measure) return;
    // The parent flex row — does its content overflow its clipped width?
    const row = self.parentElement;
    if (!row) return;
    const overflows = row.scrollWidth > row.clientWidth;
    setShouldScroll(overflows);
    if (overflows) setDuration(Math.max(4, measure.scrollWidth / 50));
  }, [text]);

  if (!shouldScroll) {
    return (
      // Compact inline — takes only as much space as needed
      <span ref={selfRef} className="md:ml-1 inline-flex items-center shrink-0 opacity-60 whitespace-nowrap">
        {/* Hidden measurer so we can calc duration if we later switch */}
        <span ref={measureRef} className="invisible absolute whitespace-nowrap pointer-events-none">{text}</span>
        <span>[{text}]</span>
      </span>
    );
  }

  return (
    // Scroll mode — fills remaining space, loops text
    <span ref={selfRef} className="md:ml-1 inline-flex items-center flex-1 min-w-0 overflow-hidden opacity-60">
      <span className="shrink-0">[</span>
      <span className="overflow-hidden flex-1 min-w-0 relative">
        <span ref={measureRef} className="invisible absolute whitespace-nowrap pointer-events-none">{text}</span>
        <span className="animate-marquee-loop" style={{ animationDuration: `${duration}s` }}>
          {text}&nbsp;&nbsp;&nbsp;{text}
        </span>
      </span>
      <span className="shrink-0">]</span>
    </span>
  );
}
