import React, { useState, useEffect } from 'react';
import { Navigation, Cloud, Wifi, Eye, Globe } from 'lucide-react';

interface OrbitalCategoryPillsProps {
  filters: any;
  onFilterChange: (key: string, value: boolean) => void;
  trackCount: number;
}

const CATEGORIES = [
  { key: 'showSatGPS',          label: 'GPS',     statsKey: 'gps',          icon: Navigation, color: 'sky' },
  { key: 'showSatWeather',      label: 'WEATHER', statsKey: 'weather',      icon: Cloud,      color: 'amber' },
  { key: 'showSatComms',        label: 'COMMS',   statsKey: 'comms',        icon: Wifi,       color: 'emerald' },
  { key: 'showSatSurveillance', label: 'INTEL',   statsKey: 'surveillance', icon: Eye,        color: 'rose' },
  { key: 'showSatOther',        label: 'OTHER',   statsKey: 'other',        icon: Globe,      color: 'slate' },
] as const;

interface OrbitalStats {
  gps: number; weather: number; comms: number; surveillance: number; other: number; total: number;
}

export const OrbitalCategoryPills: React.FC<OrbitalCategoryPillsProps> = ({ filters, onFilterChange, trackCount }) => {
  const [stats, setStats] = useState<OrbitalStats | null>(null);

  useEffect(() => {
    fetch('/api/orbital/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col rounded border border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
      <div className="flex items-center justify-between bg-white/5 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400/70 uppercase">ORBITAL OBJECTS</span>
        <span className="text-sm font-mono font-bold tracking-wider text-purple-400">{trackCount.toLocaleString()}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = filters[cat.key] !== false;
          const count = stats ? stats[cat.statsKey] : null;

          let activeClasses = '';
          if (isActive) {
            switch (cat.color) {
              case 'sky':     activeClasses = 'bg-sky-400/20 text-sky-300 border border-sky-400/30 shadow-[0_0_6px_rgba(56,189,248,0.2)]'; break;
              case 'amber':   activeClasses = 'bg-amber-400/20 text-amber-300 border border-amber-400/30 shadow-[0_0_6px_rgba(251,191,36,0.2)]'; break;
              case 'emerald': activeClasses = 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shadow-[0_0_6px_rgba(52,211,153,0.2)]'; break;
              case 'rose':    activeClasses = 'bg-rose-400/20 text-rose-300 border border-rose-400/30 shadow-[0_0_6px_rgba(251,113,133,0.2)]'; break;
              case 'slate':   activeClasses = 'bg-slate-400/20 text-slate-300 border border-slate-400/30 shadow-[0_0_6px_rgba(148,163,184,0.2)]'; break;
              default:        activeClasses = 'bg-white/20 text-white border border-white/30';
            }
          }

          return (
            <button
              key={cat.key}
              onClick={() => onFilterChange(cat.key, !isActive)}
              className={`flex flex-1 min-w-[30%] items-center justify-center gap-1.5 px-2 py-1.5 rounded transition-all duration-300 ${
                isActive ? activeClasses : 'text-white/30 hover:text-white/60 border border-white/5 bg-white/5'
              }`}
            >
              <Icon size={10} strokeWidth={2.5} />
              <span className="text-[9px] font-black tracking-widest">{cat.label}</span>
              {count != null && (
                <span className="text-[8px] opacity-60 tabular-nums">({count.toLocaleString()})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
