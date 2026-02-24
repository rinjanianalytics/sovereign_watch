"""
Sovereign Watch – JS8Call FastAPI WebSocket Bridge
===================================================

Architecture Overview
---------------------
This server bridges two fundamentally different concurrency models:

  ┌─────────────────────────────────────────────────────────────────┐
  │  pyjs8call background thread(s)   │  asyncio / FastAPI event loop│
  │  ─────────────────────────────   │  ───────────────────────────  │
  │  • Synchronous callbacks          │  • WebSocket handlers        │
  │  • Blocks on socket I/O           │  • Non-blocking coroutines   │
  │  • Runs in OS thread pool         │  • Single-threaded           │
  └─────────────────────────────────────────────────────────────────┘
                              │
                  asyncio.run_coroutine_threadsafe()
                              │
                     asyncio.Queue (thread-safe)
                              │
                  Background asyncio task drains queue
                  and broadcasts to WebSocket clients

pyjs8call calls registered callback functions from its own internal threads.
We MUST NOT call any asyncio primitives (await, loop.call_soon, etc.) directly
from those callbacks – doing so causes "RuntimeError: This event loop is
already running" or silent deadlocks.

The safe bridge is asyncio.run_coroutine_threadsafe(coro, loop) which
schedules a coroutine onto a running event loop from a different thread.
"""

import asyncio
import json
import logging
import math
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# pyjs8call: Python client for the JS8Call TCP API
# https://pypi.org/project/pyjs8call/
try:
    import pyjs8call
    PYJS8CALL_AVAILABLE = True
except ImportError:
    PYJS8CALL_AVAILABLE = False
    logging.warning("pyjs8call not installed – running in stub mode")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("js8bridge")

# ---------------------------------------------------------------------------
# Configuration (read from environment; Dockerfile sets sensible defaults)
# ---------------------------------------------------------------------------
JS8CALL_HOST = os.getenv("JS8CALL_HOST", "127.0.0.1")
JS8CALL_PORT = int(os.getenv("JS8CALL_PORT", "2442"))
BRIDGE_PORT = int(os.getenv("BRIDGE_PORT", "8080"))
MY_GRID = os.getenv("MY_GRID", "CN85")  # Operator's Maidenhead locator

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

# The single pyjs8call client instance (initialized in lifespan)
js8_client: Optional[object] = None

# Reference to the running asyncio event loop.
# Captured in lifespan() after the loop is confirmed running.
# Used by sync callback functions to schedule coroutines thread-safely.
_event_loop: Optional[asyncio.AbstractEventLoop] = None

# Thread-safe asyncio queue for bridging sync callbacks → async consumers.
# maxsize=500 prevents unbounded memory growth under high RF traffic.
_message_queue: asyncio.Queue = None  # initialized in lifespan

# Active WebSocket connections.
# Accessed from the asyncio thread only – no lock needed.
_ws_clients: list[WebSocket] = []

# In-memory station registry keyed by callsign.
# Written from the background task (single asyncio thread) – no lock needed.
_station_registry: dict[str, dict] = {}


# ===========================================================================
# Maidenhead Grid Square Utilities
# ===========================================================================

def maidenhead_to_latlon(grid: str) -> tuple[float, float]:
    """
    Convert a Maidenhead locator (4 or 6-character) to (lat, lon) decimal degrees.

    Maidenhead encoding:
      Field:  A-R (longitude 0-17 × 20°, base -180°)
      Field:  A-R (latitude 0-17 × 10°, base -90°)
      Square: 0-9 (longitude × 2°)
      Square: 0-9 (latitude × 1°)
      Sub:    A-X (longitude × 5'/60)
      Sub:    A-X (latitude × 2.5'/60)
    """
    grid = grid.strip().upper()
    if len(grid) < 4:
        return 0.0, 0.0
    try:
        lon = (ord(grid[0]) - ord('A')) * 20 - 180
        lat = (ord(grid[1]) - ord('A')) * 10 - 90
        lon += int(grid[2]) * 2
        lat += int(grid[3]) * 1
        if len(grid) >= 6:
            lon += (ord(grid[4]) - ord('A')) * (5 / 60)
            lat += (ord(grid[5]) - ord('A')) * (2.5 / 60)
        else:
            # Center of the 2° × 1° square
            lon += 1.0
            lat += 0.5
        return lat, lon
    except (IndexError, ValueError, TypeError):
        return 0.0, 0.0


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres (Haversine formula)."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def initial_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Initial compass bearing (degrees, 0–360) from point 1 to point 2.
    Uses the forward azimuth formula.
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def grid_distance_bearing(remote_grid: str, my_grid: str = MY_GRID) -> dict:
    """Return distance (km + miles) and bearing from MY_GRID to remote_grid."""
    my_lat, my_lon = maidenhead_to_latlon(my_grid)
    r_lat, r_lon = maidenhead_to_latlon(remote_grid)
    km = haversine_distance_km(my_lat, my_lon, r_lat, r_lon)
    bearing = initial_bearing(my_lat, my_lon, r_lat, r_lon)
    return {
        "distance_km": round(km, 1),
        "distance_mi": round(km * 0.621371, 1),
        "bearing_deg": round(bearing, 1),
    }


# ===========================================================================
# Thread → Asyncio Bridge
# ===========================================================================

def _enqueue_from_thread(payload: dict) -> None:
    """
    Schedule a dict payload onto the asyncio queue from a non-asyncio thread.

    This is the ONLY safe way to pass data from pyjs8call's background threads
    into the asyncio event loop. Direct await calls from sync threads crash
    with RuntimeError. asyncio.run_coroutine_threadsafe() is thread-safe by
    design and uses the event loop's thread-safe call queue internally.
    """
    if _event_loop is None or _message_queue is None:
        return  # startup race – discard early messages
    asyncio.run_coroutine_threadsafe(
        _message_queue.put(payload),
        _event_loop,
    )


async def _queue_broadcaster() -> None:
    """
    Async background task: drain the message queue and broadcast to all
    connected WebSocket clients. Runs for the lifetime of the server.

    This task runs entirely in the asyncio event loop (single thread) so
    direct access to _ws_clients and _station_registry is safe without locks.
    """
    while True:
        payload = await _message_queue.get()
        event_type = payload.get("type", "")

        # Update in-memory station registry on spot/status events
        if event_type in ("RX.SPOT", "STATION.STATUS"):
            callsign = payload.get("callsign", "")
            if callsign:
                _station_registry[callsign] = payload

        # Broadcast to all connected WebSocket clients
        dead: list[WebSocket] = []
        for ws in _ws_clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            _ws_clients.remove(ws)

        _message_queue.task_done()


# ===========================================================================
# pyjs8call Callback Handlers
#
# These functions are called from pyjs8call's internal background threads.
# They MUST be synchronous and MUST NOT call asyncio APIs directly.
# All data is forwarded via _enqueue_from_thread().
# ===========================================================================

def on_rx_directed(message) -> None:
    """
    Callback for RX.DIRECTED events – messages addressed to a specific
    callsign (e.g., "W1AW DE KD9TFA SNR -10 HELLO WORLD").

    Called from pyjs8call background thread.
    """
    try:
        payload = {
            "type": "RX.DIRECTED",
            "from": getattr(message, "origin", str(message.get("from", ""))),
            "to": getattr(message, "destination", str(message.get("to", ""))),
            "text": getattr(message, "text", str(message.get("text", ""))),
            "snr": getattr(message, "snr", message.get("snr", 0)),
            "freq": getattr(message, "freq", message.get("freq", 0)),
            "timestamp": time.strftime("%H:%M:%SZ", time.gmtime()),
            "ts_unix": int(time.time()),
        }
        _enqueue_from_thread(payload)
    except Exception as exc:
        logger.warning("on_rx_directed error: %s", exc)


def on_rx_spot(message) -> None:
    """
    Callback for RX.SPOT events – beacon-style station spots heard on frequency.
    Used to populate the "Heard Stations" sidebar on the frontend.

    Called from pyjs8call background thread.
    """
    try:
        callsign = getattr(message, "origin", str(message.get("from", "")))
        grid = getattr(message, "grid", str(message.get("grid", "")))
        geo = grid_distance_bearing(grid) if grid else {}
        payload = {
            "type": "RX.SPOT",
            "callsign": callsign,
            "grid": grid,
            "snr": getattr(message, "snr", message.get("snr", 0)),
            "freq": getattr(message, "freq", message.get("freq", 0)),
            "timestamp": time.strftime("%H:%M:%SZ", time.gmtime()),
            "ts_unix": int(time.time()),
            **geo,
        }
        _enqueue_from_thread(payload)
    except Exception as exc:
        logger.warning("on_rx_spot error: %s", exc)


def on_station_status(message) -> None:
    """
    Callback for STATION.STATUS events – periodic heartbeats from the local
    JS8Call instance reporting its current frequency, mode, and status.

    Called from pyjs8call background thread.
    """
    try:
        payload = {
            "type": "STATION.STATUS",
            "callsign": getattr(message, "callsign", str(message.get("callsign", ""))),
            "grid": getattr(message, "grid", str(message.get("grid", MY_GRID))),
            "freq": getattr(message, "freq", message.get("freq", 0)),
            "status": getattr(message, "status", str(message.get("status", ""))),
            "timestamp": time.strftime("%H:%M:%SZ", time.gmtime()),
            "ts_unix": int(time.time()),
        }
        _enqueue_from_thread(payload)
    except Exception as exc:
        logger.warning("on_station_status error: %s", exc)


# ===========================================================================
# Application Lifespan (startup / shutdown)
# ===========================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager: replaces deprecated @app.on_event handlers.
    Runs startup code before the first request, cleanup on shutdown.
    """
    global js8_client, _event_loop, _message_queue

    # Capture the running event loop reference BEFORE spawning any threads.
    # This reference is passed to asyncio.run_coroutine_threadsafe() in the
    # callback handlers so they can safely schedule coroutines.
    _event_loop = asyncio.get_event_loop()

    # Initialize the inter-thread message queue
    _message_queue = asyncio.Queue(maxsize=500)

    # Start the background broadcast task
    broadcaster = asyncio.create_task(_queue_broadcaster())

    # Connect pyjs8call to the local JS8Call TCP API
    if PYJS8CALL_AVAILABLE:
        try:
            js8_client = pyjs8call.Client()
            js8_client.start(JS8CALL_HOST, JS8CALL_PORT)

            # Register event callbacks using pyjs8call's hook system.
            # Each hook type maps to a specific JS8Call TCP message type.
            # The library calls our handler in its own background thread.
            js8_client.callback.register_hook(
                pyjs8call.Client.RX_DIRECTED, on_rx_directed
            )
            js8_client.callback.register_hook(
                pyjs8call.Client.RX_SPOT, on_rx_spot
            )
            js8_client.callback.register_hook(
                pyjs8call.Client.STATION_STATUS, on_station_status
            )
            logger.info("pyjs8call connected to JS8Call at %s:%d", JS8CALL_HOST, JS8CALL_PORT)
        except Exception as exc:
            logger.error("Failed to connect to JS8Call: %s", exc)
            js8_client = None
    else:
        logger.warning("Running without pyjs8call – WebSocket will only echo commands")

    yield  # Server is running

    # --- Shutdown ---
    broadcaster.cancel()
    if js8_client is not None:
        try:
            js8_client.stop()
        except Exception:
            pass
    logger.info("Bridge server shutdown complete")


# ===========================================================================
# FastAPI Application
# ===========================================================================

app = FastAPI(
    title="Sovereign Watch – JS8Call Bridge",
    description="WebSocket + REST bridge between JS8Call TCP API and the radio terminal UI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===========================================================================
# WebSocket Endpoint  /ws/js8
# ===========================================================================

@app.websocket("/ws/js8")
async def ws_js8(websocket: WebSocket) -> None:
    """
    Bidirectional WebSocket endpoint for the React radio terminal UI.

    Inbound (frontend → server):
      {"action": "SEND", "target": "@ALLCALL", "message": "CQ CQ DE W1AW"}
      {"action": "SET_FREQ", "freq": 14074000}

    Outbound (server → frontend):
      {"type": "RX.DIRECTED", "from": "KD9TFA", "to": "W1AW", "text": "...", ...}
      {"type": "RX.SPOT",     "callsign": "VK2TDX", "snr": -12, ...}
      {"type": "STATION.STATUS", ...}
      {"type": "ERROR", "message": "..."}
    """
    await websocket.accept()
    _ws_clients.append(websocket)
    remote = websocket.client
    logger.info("WebSocket connected: %s", remote)

    # Send an initial "connected" handshake so the frontend knows the bridge is up
    await websocket.send_json({
        "type": "CONNECTED",
        "message": "JS8Call bridge active",
        "js8call_connected": js8_client is not None,
        "timestamp": time.strftime("%H:%M:%SZ", time.gmtime()),
    })

    try:
        # Receive loop – handle commands from the frontend
        while True:
            raw = await websocket.receive_text()

            try:
                cmd = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "ERROR",
                    "message": f"Invalid JSON: {raw[:100]}",
                })
                continue

            action = cmd.get("action", "").upper()

            # ------------------------------------------------------------------
            # Action: SEND – transmit a JS8Call directed message
            # Payload: {"action": "SEND", "target": "@ALLCALL", "message": "..."}
            # ------------------------------------------------------------------
            if action == "SEND":
                target = cmd.get("target", "@ALLCALL")
                text = cmd.get("message", "")
                if not text:
                    await websocket.send_json({"type": "ERROR", "message": "Empty message"})
                    continue

                if js8_client is not None:
                    try:
                        # pyjs8call's send_directed_message is synchronous;
                        # run it in a thread executor to avoid blocking the event loop.
                        await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: js8_client.send_directed_message(target, text),
                        )
                        # Echo the sent message back so the UI can display it in the log
                        _enqueue_from_thread({
                            "type": "TX.SENT",
                            "from": "LOCAL",
                            "to": target,
                            "text": text,
                            "timestamp": time.strftime("%H:%M:%SZ", time.gmtime()),
                            "ts_unix": int(time.time()),
                        })
                    except Exception as exc:
                        await websocket.send_json({
                            "type": "ERROR",
                            "message": f"Transmit failed: {exc}",
                        })
                else:
                    # Stub mode: echo the command back for UI development
                    await websocket.send_json({
                        "type": "TX.SENT",
                        "from": "LOCAL",
                        "to": target,
                        "text": text,
                        "timestamp": time.strftime("%H:%M:%SZ", time.gmtime()),
                        "ts_unix": int(time.time()),
                        "stub": True,
                    })

            # ------------------------------------------------------------------
            # Action: SET_FREQ – change JS8Call dial frequency
            # Payload: {"action": "SET_FREQ", "freq": 14074000}
            # ------------------------------------------------------------------
            elif action == "SET_FREQ":
                freq = int(cmd.get("freq", 14074000))
                if js8_client is not None:
                    try:
                        await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: js8_client.set_dial_frequency(freq),
                        )
                    except Exception as exc:
                        await websocket.send_json({
                            "type": "ERROR",
                            "message": f"SET_FREQ failed: {exc}",
                        })

            # ------------------------------------------------------------------
            # Action: GET_STATIONS – force a station list refresh
            # Payload: {"action": "GET_STATIONS"}
            # ------------------------------------------------------------------
            elif action == "GET_STATIONS":
                stations = _build_station_list()
                await websocket.send_json({"type": "STATION_LIST", "stations": stations})

            else:
                await websocket.send_json({
                    "type": "ERROR",
                    "message": f"Unknown action: {action}",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", remote)
    except Exception as exc:
        logger.warning("WebSocket error (%s): %s", remote, exc)
    finally:
        # Always remove from active clients list on disconnect
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


# ===========================================================================
# REST Endpoint  GET /api/stations
# ===========================================================================

def _build_station_list() -> list[dict]:
    """
    Build a sorted station list from the in-memory registry, enriched with
    live distance/bearing data computed from Maidenhead grid squares.
    """
    stations = []
    for callsign, data in _station_registry.items():
        grid = data.get("grid", "")
        geo = grid_distance_bearing(grid) if len(grid) >= 4 else {}
        # Compute staleness
        age_s = int(time.time()) - data.get("ts_unix", 0)
        stations.append({
            "callsign": callsign,
            "grid": grid,
            "snr": data.get("snr", 0),
            "freq": data.get("freq", 0),
            "last_heard": data.get("timestamp", ""),
            "age_seconds": age_s,
            **geo,
        })
    # Sort by most recently heard
    stations.sort(key=lambda s: s.get("age_seconds", 9999))
    return stations


@app.get("/api/stations", summary="List heard stations with distance/bearing")
async def get_stations() -> dict:
    """
    Returns all stations heard in the current session, enriched with:
    - distance_km / distance_mi from MY_GRID (set via MY_GRID env var)
    - bearing_deg (initial compass bearing, degrees true)

    Distance and bearing are calculated using the Haversine great-circle
    formula applied to the Maidenhead grid square centres.
    """
    stations = _build_station_list()

    # If pyjs8call has a live station list, merge it in
    if js8_client is not None:
        try:
            live = await asyncio.get_event_loop().run_in_executor(
                None, js8_client.get_station_list
            )
            live_callsigns = {s.get("call", "") for s in (live or [])}
            # Merge any callsigns from pyjs8call not in our registry
            for entry in (live or []):
                call = entry.get("call", "")
                if call and call not in _station_registry:
                    grid = entry.get("grid", "")
                    geo = grid_distance_bearing(grid) if len(grid) >= 4 else {}
                    stations.append({
                        "callsign": call,
                        "grid": grid,
                        "snr": entry.get("snr", 0),
                        "freq": entry.get("freq", 0),
                        "last_heard": "",
                        "age_seconds": 0,
                        **geo,
                    })
        except Exception as exc:
            logger.warning("get_station_list error: %s", exc)

    return {
        "count": len(stations),
        "my_grid": MY_GRID,
        "stations": stations,
    }


# ===========================================================================
# Health Check
# ===========================================================================

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "js8call_connected": js8_client is not None,
        "active_ws_clients": len(_ws_clients),
        "heard_stations": len(_station_registry),
        "bridge_port": BRIDGE_PORT,
        "js8call_address": f"{JS8CALL_HOST}:{JS8CALL_PORT}",
    }


# ===========================================================================
# Entry point
# ===========================================================================

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=BRIDGE_PORT,
        log_level="info",
        # reload=False in container – hot reload not useful in production
    )
