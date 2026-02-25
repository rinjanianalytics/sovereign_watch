import React, { useState } from 'react';
import { Radio, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import type { JS8Station, JS8LogEntry, JS8StatusLine } from '../../types';

function snrColor(snr: number): string {
  if (snr >= -10) return 'text-emerald-400';
  if (snr >= -18) return 'text-yellow-400';
  return 'text-red-400';
}

function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatAge(tsUnix: number): string {
  const age = Math.floor(Date.now() / 1000) - tsUnix;
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h`;
}

interface JS8WidgetProps {
  stations: JS8Station[];
  logEntries: JS8LogEntry[];
  statusLine: JS8StatusLine;
  connected: boolean;
  js8Connected: boolean;
}

export const JS8Widget: React.FC<JS8WidgetProps> = ({
  stations,
  logEntries,
  statusLine,
  connected,
  js8Connected,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-black/30 border border-tactical-border rounded-sm backdrop-blur-md font-mono">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Radio size={13} className={connected ? 'text-indigo-400' : 'text-slate-600'} />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">
            JS8 / HF Radio
          </span>
          {stations.length > 0 && (
            <span className="text-[9px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded">
              {stations.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'
            }`}
          />
          {collapsed ? (
            <ChevronDown size={12} className="text-white/30" />
          ) : (
            <ChevronUp size={12} className="text-white/30" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-white/5">
          {/* Own station status */}
          <div className="px-3 py-2 flex items-center justify-between text-[10px] border-b border-white/5">
            <div className="flex items-center gap-3">
              <span className="text-white/30">CALL</span>
              <span className="text-indigo-300 font-bold">{statusLine.callsign}</span>
              <span className="text-white/30">GRID</span>
              <span className="text-slate-400">{statusLine.grid}</span>
            </div>
            <span className={`text-[9px] ${js8Connected ? 'text-cyan-400' : 'text-slate-600'}`}>
              {js8Connected ? 'JS8 LIVE' : 'NO RADIO'}
            </span>
          </div>

          {/* Heard stations list */}
          {stations.length > 0 ? (
            <div className="max-h-40 overflow-y-auto scrollbar-none">
              {stations.slice(0, 8).map((s) => (
                <div
                  key={s.callsign}
                  className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 border-b border-white/[0.03]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-indigo-300 font-bold text-[10px] shrink-0">
                      {s.callsign}
                    </span>
                    {s.grid && (
                      <div className="flex items-center gap-1 text-[9px] text-slate-600 min-w-0">
                        <MapPin size={8} className="shrink-0" />
                        <span>{s.grid}</span>
                        {s.distance_km != null && (
                          <span className="text-blue-500/80 shrink-0">
                            {s.distance_km}km {Math.round(s.bearing_deg ?? 0)}°
                            {bearingToCardinal(s.bearing_deg ?? 0)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-[10px] font-bold ${snrColor(s.snr)}`}>
                      {s.snr > 0 ? '+' : ''}{s.snr}
                    </span>
                    <span className="text-[9px] text-slate-700">{formatAge(s.ts_unix)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-center text-[10px] text-slate-700 italic">
              {connected ? 'Listening for heartbeats…' : 'Bridge offline'}
            </div>
          )}

          {/* Recent directed messages */}
          {logEntries.length > 0 && (
            <div className="border-t border-white/5 px-3 py-2 space-y-1">
              <div className="text-[9px] text-white/20 font-bold tracking-widest uppercase mb-1.5">
                Recent
              </div>
              {logEntries.slice(0, 3).map((entry) => (
                <div key={entry.id} className="text-[9px] text-slate-500 leading-snug">
                  <span className="text-indigo-400/80">{entry.from || '?'}</span>
                  {entry.to && <span className="text-slate-700"> ▶ {entry.to}</span>}
                  {entry.text && (
                    <span className="text-slate-400/70 ml-1">
                      {entry.text.slice(0, 40)}
                      {entry.text.length > 40 ? '…' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
