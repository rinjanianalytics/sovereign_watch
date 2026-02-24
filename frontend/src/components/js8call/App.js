/**
 * Sovereign Watch – JS8Call Radio Terminal
 * =========================================
 *
 * A tactical radio QSO terminal interface for monitoring and operating JS8Call
 * via the FastAPI WebSocket bridge (server.py).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  HEADER: Station info, connection status, frequency                     │
 * ├───────────────────┬──────────────────────────────────────────────────────┤
 * │  HEARD STATIONS   │  MESSAGE LOG (scrolling terminal)                   │
 * │  sidebar (left)   │                                                     │
 * │  • Callsign       │  [HH:MM:SS] FROM → TO : message text               │
 * │  • SNR            │                                                     │
 * │  • Distance       │                                                     │
 * │  • Bearing        │                                                     │
 * │  • Last seen      │                                                     │
 * ├───────────────────┴──────────────────────────────────────────────────────┤
 * │  TRANSMIT PANEL: target callsign + message input + SEND button          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WebSocket message types handled:
 *   RX.DIRECTED  → append to message log
 *   RX.SPOT      → update heard stations sidebar
 *   TX.SENT      → append to message log (local echo)
 *   STATION.STATUS → update header status bar
 *   CONNECTED    → update connection state
 *   ERROR        → display in log as system message
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WS_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_JS8_WS_URL
    ? import.meta.env.VITE_JS8_WS_URL
    : 'ws://localhost:8080/ws/js8';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const MAX_LOG_ENTRIES = 500; // Bound memory usage for long-running sessions
const MAX_STATIONS = 100;    // Bound heard stations list

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function bearingToCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatAge(ts_unix) {
  if (!ts_unix) return '--';
  const age = Math.floor(Date.now() / 1000) - ts_unix;
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h`;
}

function snrColor(snr) {
  if (snr >= 0) return 'text-green-400';
  if (snr >= -10) return 'text-yellow-400';
  if (snr >= -20) return 'text-orange-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Individual station card in the Heard Stations sidebar */
function StationCard({ station, isNew }) {
  return (
    <div
      className={`
        border border-gray-700 rounded px-2 py-1.5 mb-1
        transition-all duration-300
        ${isNew ? 'border-green-500 bg-green-950' : 'bg-gray-900 hover:bg-gray-800'}
      `}
    >
      {/* Callsign row */}
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-green-300 text-sm tracking-wider">
          {station.callsign}
        </span>
        <span className={`font-mono text-xs font-semibold ${snrColor(station.snr)}`}>
          {station.snr > 0 ? '+' : ''}{station.snr} dB
        </span>
      </div>

      {/* Grid / Distance / Bearing row */}
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-gray-400 font-mono text-xs">{station.grid || '????'}</span>
        {station.distance_km != null && (
          <span className="text-blue-400 font-mono text-xs">
            {station.distance_km} km &nbsp;
            <span className="text-gray-500">
              {Math.round(station.bearing_deg)}°{bearingToCardinal(station.bearing_deg)}
            </span>
          </span>
        )}
      </div>

      {/* Last heard */}
      <div className="text-gray-600 text-xs font-mono mt-0.5">
        {station.last_heard} &nbsp;·&nbsp; {formatAge(station.ts_unix)} ago
      </div>
    </div>
  );
}

/** A single line in the message log */
function LogEntry({ entry }) {
  const isLocal = entry.from === 'LOCAL' || entry.type === 'TX.SENT';
  const isAllcall = (entry.to || '').toUpperCase().includes('@ALLCALL') ||
                    (entry.to || '').toUpperCase().includes('@CQ');
  const isSystem = entry.type === 'SYSTEM' || entry.type === 'CONNECTED' || entry.type === 'ERROR';

  if (isSystem) {
    return (
      <div className="flex items-start py-0.5 px-1 text-gray-500">
        <span className="font-mono text-xs text-gray-600 w-20 shrink-0 pt-0.5">
          {entry.timestamp}
        </span>
        <span className="font-mono text-xs text-gray-500 italic">
          ── {entry.text || entry.message} ──
        </span>
      </div>
    );
  }

  return (
    <div
      className={`
        flex items-start py-0.5 px-1 rounded
        ${isLocal ? 'bg-blue-950 border-l-2 border-blue-500' : ''}
        ${isAllcall && !isLocal ? 'bg-gray-800' : ''}
        ${!isLocal && !isAllcall && !isSystem ? 'bg-green-950 border-l-2 border-green-600' : ''}
        hover:brightness-110
      `}
    >
      {/* Timestamp */}
      <span className="font-mono text-xs text-gray-500 w-20 shrink-0 pt-0.5">
        {entry.timestamp}
      </span>

      {/* Route: FROM → TO */}
      <span className="font-mono text-xs w-36 shrink-0 pt-0.5">
        <span className={isLocal ? 'text-blue-300' : 'text-green-400'}>
          {entry.from || '?'}
        </span>
        <span className="text-gray-600"> → </span>
        <span className={isAllcall ? 'text-yellow-400' : 'text-cyan-400'}>
          {entry.to || '?'}
        </span>
      </span>

      {/* SNR badge */}
      {entry.snr != null && (
        <span className={`font-mono text-xs w-12 shrink-0 pt-0.5 ${snrColor(entry.snr)}`}>
          {entry.snr > 0 ? '+' : ''}{entry.snr}
        </span>
      )}

      {/* Message text */}
      <span className="font-mono text-xs text-gray-200 break-all">
        {entry.text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main RadioTerminal Component
// ---------------------------------------------------------------------------

export default function RadioTerminal() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [js8Connected, setJs8Connected] = useState(false);
  const [statusLine, setStatusLine] = useState({ callsign: '--', grid: '----', freq: '--' });

  // Message log: array of entry objects appended in chronological order
  const [logEntries, setLogEntries] = useState([]);

  // Heard stations: keyed by callsign for O(1) update, displayed as sorted array
  const [stations, setStations] = useState({});
  const [newCallsigns, setNewCallsigns] = useState(new Set());

  // Transmit form state
  const [txTarget, setTxTarget] = useState('@ALLCALL');
  const [txMessage, setTxMessage] = useState('');
  const [txPending, setTxPending] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef = useRef(null);            // WebSocket instance
  const reconnectTimer = useRef(null);   // setTimeout handle for reconnect
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const logBottomRef = useRef(null);     // Sentinel div for auto-scroll
  const logContainerRef = useRef(null);  // Scroll container

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Append a system/info message to the log */
  const appendSystem = useCallback((text) => {
    setLogEntries((prev) => {
      const entry = {
        id: Date.now() + Math.random(),
        type: 'SYSTEM',
        text,
        timestamp: new Date().toISOString().slice(11, 19) + 'Z',
      };
      const next = [...prev, entry];
      return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
    });
  }, []);

  /** Auto-scroll: called after logEntries state update settles */
  const scrollToBottom = useCallback(() => {
    if (!logContainerRef.current) return;
    const el = logContainerRef.current;
    // Only auto-scroll if user is within 120px of the bottom (not manually scrolled up)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logEntries, scrollToBottom]);

  // ── WebSocket management ───────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = RECONNECT_BASE_MS; // Reset backoff on successful connect
      appendSystem(`WebSocket connected to ${WS_URL}`);
    };

    ws.onclose = (evt) => {
      setConnected(false);
      setJs8Connected(false);
      appendSystem(`Connection closed (code ${evt.code}) – reconnecting in ${reconnectDelay.current / 1000}s…`);

      // Exponential backoff reconnect
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose; let onclose handle reconnect
      appendSystem('WebSocket error – will retry');
    };

    ws.onmessage = (evt) => {
      let payload;
      try {
        payload = JSON.parse(evt.data);
      } catch {
        appendSystem(`Unparseable message: ${evt.data.slice(0, 80)}`);
        return;
      }

      const type = payload.type || '';

      // ── Handle each message type ──────────────────────────────────────────

      if (type === 'CONNECTED') {
        setJs8Connected(payload.js8call_connected ?? false);
        appendSystem(payload.message || 'Bridge connected');
        return;
      }

      if (type === 'RX.DIRECTED' || type === 'TX.SENT') {
        setLogEntries((prev) => {
          const entry = {
            id: `${Date.now()}-${Math.random()}`,
            ...payload,
            text: payload.text || payload.message || '',
          };
          const next = [...prev, entry];
          return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
        });
        return;
      }

      if (type === 'RX.SPOT') {
        const callsign = payload.callsign;
        if (!callsign) return;

        setStations((prev) => {
          const updated = { ...prev, [callsign]: { ...payload } };
          // Evict oldest entries if we exceed MAX_STATIONS
          const keys = Object.keys(updated);
          if (keys.length > MAX_STATIONS) {
            const sorted = keys.sort(
              (a, b) => (updated[a].ts_unix || 0) - (updated[b].ts_unix || 0)
            );
            delete updated[sorted[0]];
          }
          return updated;
        });

        // Flash the card as "new" for 3 seconds
        setNewCallsigns((prev) => new Set([...prev, callsign]));
        setTimeout(() => {
          setNewCallsigns((prev) => {
            const next = new Set(prev);
            next.delete(callsign);
            return next;
          });
        }, 3000);
        return;
      }

      if (type === 'STATION.STATUS') {
        setStatusLine({
          callsign: payload.callsign || '--',
          grid: payload.grid || '----',
          freq: payload.freq ? `${(payload.freq / 1000).toFixed(3)} kHz` : '--',
        });
        return;
      }

      if (type === 'STATION_LIST') {
        // Response to GET_STATIONS command
        const map = {};
        (payload.stations || []).forEach((s) => { map[s.callsign] = s; });
        setStations(map);
        return;
      }

      if (type === 'ERROR') {
        appendSystem(`ERROR: ${payload.message}`);
        return;
      }
    };
  }, [appendSystem]);

  // Mount: connect; Unmount: clean up
  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Transmit handler ───────────────────────────────────────────────────────

  const handleSend = useCallback(
    (e) => {
      e.preventDefault();
      const msg = txMessage.trim();
      if (!msg || !connected || txPending) return;

      const cmd = { action: 'SEND', target: txTarget.trim() || '@ALLCALL', message: msg };
      wsRef.current?.send(JSON.stringify(cmd));

      setTxMessage('');
      setTxPending(true);
      // Clear pending state after a reasonable TX window (JS8Call Normal = ~15s)
      setTimeout(() => setTxPending(false), 16000);
    },
    [connected, txMessage, txTarget, txPending]
  );

  // ── Sorted station array (memoized to avoid re-sort on log updates) ────────

  const sortedStations = useMemo(() => {
    return Object.values(stations).sort(
      (a, b) => (b.ts_unix || 0) - (a.ts_unix || 0)
    );
  }, [stations]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 font-mono select-none overflow-hidden">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        {/* Left: branding */}
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-400 font-bold text-sm tracking-widest uppercase">
            Sovereign Watch
          </span>
          <span className="text-gray-600 text-xs">JS8Call Terminal</span>
        </div>

        {/* Center: station info */}
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-gray-500">CALL </span>
            <span className="text-green-300 font-bold">{statusLine.callsign}</span>
          </div>
          <div>
            <span className="text-gray-500">GRID </span>
            <span className="text-blue-300">{statusLine.grid}</span>
          </div>
          <div>
            <span className="text-gray-500">FREQ </span>
            <span className="text-yellow-300">{statusLine.freq}</span>
          </div>
        </div>

        {/* Right: connection indicators */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={connected ? 'text-green-400' : 'text-red-400'}>
              {connected ? 'BRIDGE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${js8Connected ? 'bg-cyan-400' : 'bg-gray-600'}`} />
            <span className={js8Connected ? 'text-cyan-400' : 'text-gray-500'}>
              {js8Connected ? 'JS8CALL' : 'NO RADIO'}
            </span>
          </div>
          <div className="text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">
            {sortedStations.length} heard
          </div>
        </div>
      </header>

      {/* ── MAIN BODY (sidebar + log) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR: Heard Stations */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-gray-700 bg-gray-950">
          <div className="px-3 py-2 border-b border-gray-800 bg-gray-900">
            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
              Heard Stations
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0">
            {sortedStations.length === 0 ? (
              <div className="text-gray-600 text-xs text-center mt-8 italic">
                No stations heard yet.
                <br />
                Waiting for RF…
              </div>
            ) : (
              sortedStations.map((s) => (
                <StationCard
                  key={s.callsign}
                  station={s}
                  isNew={newCallsigns.has(s.callsign)}
                />
              ))
            )}
          </div>
        </aside>

        {/* CENTER: Message Log */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Log header bar */}
          <div className="px-3 py-2 border-b border-gray-800 bg-gray-900 flex items-center justify-between shrink-0">
            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
              Message Log
            </span>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="border border-green-900 text-green-700 px-1 rounded">directed</span>
              <span className="border border-blue-900 text-blue-700 px-1 rounded">local TX</span>
              <span className="border border-gray-700 text-gray-600 px-1 rounded">broadcast</span>
            </div>
          </div>

          {/* Scrolling log */}
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto py-1 px-1"
            style={{ scrollBehavior: 'smooth' }}
          >
            {logEntries.length === 0 && (
              <div className="text-gray-700 text-xs text-center mt-16 italic">
                No messages yet. Listening for JS8Call traffic…
              </div>
            )}
            {logEntries.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
            {/* Sentinel for auto-scroll */}
            <div ref={logBottomRef} />
          </div>
        </main>
      </div>

      {/* ── TRANSMIT PANEL (locked to bottom) ── */}
      <footer className="shrink-0 border-t border-gray-700 bg-gray-900 px-4 py-3">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* Target callsign */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-xs">TO</span>
            <input
              type="text"
              value={txTarget}
              onChange={(e) => setTxTarget(e.target.value.toUpperCase())}
              placeholder="@ALLCALL"
              maxLength={20}
              className="
                bg-gray-800 border border-gray-600 rounded px-2 py-1.5
                font-mono text-xs text-cyan-300 w-28
                focus:outline-none focus:border-cyan-500
                uppercase tracking-wider
              "
              disabled={!connected}
            />
          </div>

          {/* Message input */}
          <input
            type="text"
            value={txMessage}
            onChange={(e) => setTxMessage(e.target.value.toUpperCase())}
            placeholder={connected ? 'TYPE MESSAGE AND PRESS ENTER OR SEND…' : 'NOT CONNECTED'}
            maxLength={160}
            className="
              flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5
              font-mono text-xs text-white
              focus:outline-none focus:border-green-500
              disabled:opacity-50 disabled:cursor-not-allowed
              uppercase
            "
            disabled={!connected || txPending}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Character counter */}
          <span className={`text-xs font-mono w-10 text-right ${txMessage.length > 140 ? 'text-red-400' : 'text-gray-600'}`}>
            {txMessage.length}/160
          </span>

          {/* Send button */}
          <button
            type="submit"
            disabled={!connected || !txMessage.trim() || txPending}
            className="
              px-4 py-1.5 rounded font-mono text-xs font-bold uppercase tracking-widest
              transition-all duration-150
              bg-green-700 text-green-100 hover:bg-green-600
              disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-green-500
            "
          >
            {txPending ? 'TX…' : 'SEND'}
          </button>
        </form>

        {/* Status bar */}
        <div className="flex items-center justify-between mt-1.5 text-xs text-gray-600">
          <span>
            {txPending
              ? '▶ Transmitting… JS8Call Normal (~15s)'
              : connected
              ? '● Ready to transmit'
              : '✕ Disconnected – reconnecting…'}
          </span>
          <span>
            {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
          </span>
        </div>
      </footer>
    </div>
  );
}
