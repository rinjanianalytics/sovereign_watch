import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, Copy, Check, Loader2, AlertTriangle, X } from 'lucide-react';
import { useAnalysis } from '../../hooks/useAnalysis';

const LOOKBACK_OPTIONS = [
  { label: '1 h', value: 1 },
  { label: '6 h', value: 6 },
  { label: '12 h', value: 12 },
  { label: '24 h', value: 24 },
  { label: '48 h', value: 48 },
  { label: '72 h', value: 72 },
];

interface AnalysisWidgetProps {
  uid: string;
  accentColor?: string; // e.g. 'text-air-accent' | 'text-sea-accent'
}

export const AnalysisWidget: React.FC<AnalysisWidgetProps> = ({
  uid,
  accentColor = 'text-air-accent',
}) => {
  const { text, isStreaming, error, generatedAt, run, reset } = useAnalysis();
  const [lookback, setLookback] = useState(24);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as tokens arrive
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  // Cancel stream on uid change
  useEffect(() => {
    return () => { reset(); };
  }, [uid, reset]);

  const handleRun = () => {
    run(uid, lookback);
  };

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  const accentBorder = accentColor.includes('sea')
    ? 'border-sea-accent/30'
    : 'border-air-accent/30';
  const accentBg = accentColor.includes('sea')
    ? 'bg-gradient-to-br from-sea-accent/10 to-sea-accent/5'
    : 'bg-gradient-to-br from-air-accent/10 to-air-accent/5';

  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className={`flex items-center justify-between px-3 py-2 border ${accentBorder} ${accentBg} rounded-sm backdrop-blur-md`}>
        <div className="flex items-center gap-2">
          <BrainCircuit size={13} className={accentColor} />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50">AI_ANALYST</span>
        </div>

        {/* Controls: lookback + run */}
        <div className="flex items-center gap-2">
          {/* Lookback selector */}
          <div className="relative flex items-center">
            <select
              value={lookback}
              onChange={e => setLookback(Number(e.target.value))}
              disabled={isStreaming}
              className="appearance-none bg-black/60 border border-white/10 rounded px-2 py-0.5 pr-5 text-[10px] text-white/60 font-mono focus:outline-none focus:border-white/30 disabled:opacity-40 cursor-pointer"
            >
              {LOOKBACK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 text-white/30 pointer-events-none" />
          </div>

          {isStreaming ? (
            <button
              onClick={reset}
              title="Cancel analysis"
              className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded text-[10px] text-white/40 hover:text-red-400 transition-colors"
            >
              <X size={10} />
            </button>
          ) : (
            <button
              onClick={handleRun}
              title="Run AI analysis"
              className={`flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] font-bold tracking-widest ${accentColor} hover:opacity-100 opacity-70 transition-all`}
            >
              RUN
            </button>
          )}
        </div>
      </div>

      {/* Output area — only shown once analysis has started */}
      {(text || isStreaming || error) && (
        <div className="flex flex-col border border-white/10 rounded-sm bg-black/60 backdrop-blur-md overflow-hidden">
          {/* Output header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              {isStreaming && (
                <Loader2 size={10} className={`${accentColor} animate-spin`} />
              )}
              <span className="text-[9px] font-mono text-white/30 tracking-widest">
                {isStreaming ? 'RECEIVING...' : generatedAt
                  ? `GENERATED ${generatedAt.toLocaleTimeString()}`
                  : 'ASSESSMENT'}
              </span>
            </div>
            {text && !isStreaming && (
              <button
                onClick={handleCopy}
                title="Copy assessment"
                className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white/70 transition-colors"
              >
                {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
              </button>
            )}
          </div>

          {/* Scrollable text body */}
          <div
            ref={scrollRef}
            className="max-h-64 overflow-y-auto p-3 custom-scrollbar"
          >
            {error ? (
              <div className="flex items-start gap-2 text-[10px] font-mono text-red-400/80">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : (
              <p className="text-[10px] font-mono text-white/70 leading-relaxed whitespace-pre-wrap">
                {text}
                {isStreaming && (
                  <span className={`inline-block w-1.5 h-3 ml-0.5 ${accentColor.replace('text-', 'bg-')} animate-pulse align-middle`} />
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
