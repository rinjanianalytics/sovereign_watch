#!/usr/bin/env bash
# =============================================================================
# Sovereign Watch – JS8Call Container Entrypoint
#
# Initialization sequence (ORDER IS CRITICAL – DO NOT REARRANGE):
#
#   1. D-Bus session bus      – must be first; PulseAudio and Qt5 both require
#                               DBUS_SESSION_BUS_ADDRESS to be set before they
#                               initialize their own D-Bus connections.
#
#   2. Xvfb virtual display   – must start before any X11 client (Qt, openbox).
#                               JS8Call's QApplication constructor calls
#                               XOpenDisplay(); if DISPLAY is not served yet,
#                               it aborts with a fatal "cannot connect to X
#                               server :99" error.
#
#   3. PulseAudio daemon      – must start after D-Bus (for module-dbus-protocol)
#                               but before pactl/pacat commands that configure
#                               and feed the virtual sink.
#
#   4. Sink configuration     – pactl module-null-sink creation happens here.
#                               This is idempotent; if the Dockerfile's
#                               default.pa already loaded it, pactl will return
#                               an error which we suppress.
#
#   5. KiwiSDR → PulseAudio pipeline
#   6. JS8Call GUI (background)
#   7. FastAPI bridge server (background)
#   8. tail -f /dev/null      – keeps the container PID-1 alive
#
# =============================================================================
set -euo pipefail

log() { echo "[entrypoint] $(date -u '+%H:%M:%S') $*"; }

# =============================================================================
# STEP 1 – D-Bus Session Bus
#
# WHY: D-Bus is an IPC mechanism required by:
#   • PulseAudio's module-dbus-protocol (used by pactl for session commands)
#   • Qt5 QDBusConnection::sessionBus() called at QApplication init
#   • JS8Call platform integration (org.freedesktop.portal.* services)
#
# dbus-launch starts a private session bus, forks to background, and prints
# two shell variable assignments to stdout. We eval those assignments so that
# DBUS_SESSION_BUS_ADDRESS and DBUS_SESSION_BUS_PID are exported into *this*
# shell and all child processes inherit them.
# =============================================================================
log "STEP 1: Starting D-Bus session bus..."

# Ensure the runtime directory exists (used by dbus socket)
mkdir -p "${XDG_RUNTIME_DIR:-/run/user/1000}"
chmod 700 "${XDG_RUNTIME_DIR:-/run/user/1000}"

eval "$(dbus-launch --sh-syntax --exit-with-session)"
export DBUS_SESSION_BUS_ADDRESS
log "D-Bus session bus: ${DBUS_SESSION_BUS_ADDRESS}"

# =============================================================================
# STEP 2 – Xvfb Virtual Framebuffer on Display :99
#
# WHY :99 specifically: avoids collision with any host display (:0) that might
# be bind-mounted into the container, and matches the ENV DISPLAY=:99 set in
# the Dockerfile.
#
# Flags:
#   -screen 0 1280x1024x24  – 24-bit color depth; Qt5's xcb plugin requires
#                              at least 24bpp for hardware-accelerated compositing
#   -ac                     – disable access control (allow any X client)
#   -nolisten tcp           – do not accept TCP X11 connections for security
#   +extension GLX          – enable GLX extension; some Qt5 widgets probe for
#                              OpenGL even when software rendering is used
# =============================================================================
log "STEP 2: Starting Xvfb on display :99..."
Xvfb :99 \
    -screen 0 1280x1024x24 \
    -ac \
    -nolisten tcp \
    +extension GLX \
    +extension RANDR \
    &
XVFB_PID=$!
log "Xvfb PID: ${XVFB_PID}"

# Wait for the display to become available
for i in $(seq 1 20); do
    if xdpyinfo -display :99 >/dev/null 2>&1; then
        log "Display :99 is ready after ${i} attempts"
        break
    fi
    sleep 0.3
done

export DISPLAY=:99

# Start a minimal window manager so Qt does not log WM-related warnings
openbox --display :99 &>/dev/null &
log "Openbox WM started"

# =============================================================================
# STEP 3 – PulseAudio User Daemon
#
# PULSEAUDIO ROUTING OVERVIEW:
#
#   ┌─────────────────┐   stdout   ┌──────────────────────────────────────────┐
#   │  kiwirecorder   │──S16LE──→│  pacat (playback to KIWI_RX sink)       │
#   │  --nc (raw PCM) │  12kHz    └──────────────────────────────────────────┘
#   └─────────────────┘                        │
#                                              ▼
#                               ┌─────────────────────────┐
#                               │  PulseAudio null-sink   │
#                               │  name: KIWI_RX          │
#                               └─────────────────────────┘
#                                              │  monitor source
#                                              ▼
#                               ┌─────────────────────────┐
#                               │  KIWI_RX.monitor        │←── JS8Call reads
#                               │  (virtual microphone)   │    this as its
#                               └─────────────────────────┘    audio input
#
# WHY --exit-idle-time=-1:
#   By default PulseAudio shuts down after 20 seconds of inactivity. In a
#   headless container with no other clients, this would kill the daemon before
#   JS8Call connects. -1 disables the idle timeout entirely.
#
# WHY --disallow-module-loading=0:
#   pactl commands below use load-module at runtime. This must be explicitly
#   permitted; some distro builds of PA lock down dynamic module loading.
# =============================================================================
log "STEP 3: Starting PulseAudio daemon..."

# Set PULSE_RUNTIME_PATH so the socket lands inside XDG_RUNTIME_DIR
export PULSE_RUNTIME_PATH="${XDG_RUNTIME_DIR:-/run/user/1000}/pulse"
mkdir -p "${PULSE_RUNTIME_PATH}"

pulseaudio \
    --start \
    --log-target=newfile:/tmp/pulseaudio.log \
    --exit-idle-time=-1 \
    --disallow-module-loading=0 \
    --daemon \
    --realtime=false \
    --high-priority=false

# Wait for PulseAudio to accept connections
for i in $(seq 1 30); do
    if pactl info >/dev/null 2>&1; then
        log "PulseAudio ready after ${i} attempts"
        break
    fi
    sleep 0.5
done

log "PulseAudio server info:"
pactl info 2>&1 | grep -E "(Server Name|Default Sink|Default Source)" | sed 's/^/  /'

# =============================================================================
# STEP 4 – Configure PulseAudio Null Sink (KIWI_RX virtual audio device)
#
# module-null-sink creates two objects:
#   • sink   "KIWI_RX"         – writable endpoint; pacat sends PCM here
#   • source "KIWI_RX.monitor" – readable mirror; JS8Call reads from here
#
# The || true suppresses the error if the module was already loaded via
# /etc/pulse/default.pa (our Dockerfile pre-loads it).
# =============================================================================
log "STEP 4: Configuring KIWI_RX null sink..."

pactl load-module module-null-sink \
    sink_name=KIWI_RX \
    sink_properties="device.description='KiwiSDR_Virtual_Sink'" \
    2>/dev/null || log "KIWI_RX sink already loaded (expected)"

# Set defaults so JS8Call auto-selects the correct devices
pactl set-default-sink KIWI_RX
pactl set-default-source KIWI_RX.monitor

log "Active PulseAudio sinks:"
pactl list sinks short 2>&1 | sed 's/^/  /'

log "Active PulseAudio sources:"
pactl list sources short 2>&1 | sed 's/^/  /'

# =============================================================================
# STEP 5 – KiwiSDR → PulseAudio Audio Pipeline
#
# PIPELINE EXPLANATION:
#
#   kiwirecorder.py \
#       --nc          : Raw PCM output mode; suppresses progress headers and
#                       color codes – only raw binary audio frames on stdout.
#                       Without --nc, stdout contains human-readable text mixed
#                       with binary data which corrupts the pacat input stream.
#       -s KIWI_HOST  : KiwiSDR WebSocket host (e.g. kiwisdr.example.com)
#       -p KIWI_PORT  : KiwiSDR HTTP port (default 8073)
#       -f KIWI_FREQ  : Tuning frequency in kHz (e.g. 14074 for 20m FT8/JS8)
#       -m KIWI_MODE  : Demodulation mode (usb for JS8Call)
#       --OV          : Suppress overload warnings on stdout
#
#   | pacat \
#       --playback    : Write PCM into a PulseAudio sink (not record from source)
#       --format=s16le: Signed 16-bit little-endian; matches kiwirecorder's
#                       native output format (KiwiSDR always outputs S16LE)
#       --rate=12000  : 12 kHz sample rate; KiwiSDR narrowband audio output
#                       is fixed at 12 kHz. JS8Call expects this rate.
#       --channels=1  : Mono audio; KiwiSDR outputs single-channel audio
#       --device=KIWI_RX : Target our virtual null sink created in STEP 4
#       --stream-name : Descriptive label visible in pavucontrol for debugging
#       --latency-msec=100 : Tolerate network jitter from the KiwiSDR stream
#
# The entire pipeline is backgrounded with & and its PID saved for health-checks.
# =============================================================================
log "STEP 5: Starting KiwiSDR → PulseAudio pipeline..."
log "  KiwiSDR target: ${KIWI_HOST}:${KIWI_PORT} @ ${KIWI_FREQ} kHz (${KIWI_MODE})"

python3 /opt/kiwiclient/kiwirecorder.py \
    --nc \
    -s "${KIWI_HOST}" \
    -p "${KIWI_PORT}" \
    -f "${KIWI_FREQ}" \
    -m "${KIWI_MODE:-usb}" \
    --OV \
    2>/tmp/kiwirecorder.log \
| pacat \
    --playback \
    --format=s16le \
    --rate=12000 \
    --channels=1 \
    --device=KIWI_RX \
    --stream-name="KiwiSDR-RX-Feed" \
    --latency-msec=100 \
    2>/tmp/pacat.log \
&
KIWI_PIPE_PID=$!
log "KiwiSDR pipeline PID: ${KIWI_PIPE_PID}"

# =============================================================================
# STEP 6 – Launch JS8Call (headless, background)
#
# JS8Call is started against the KIWI_RX.monitor source which appears to it
# as a standard system microphone. The -rig-name flag identifies the virtual
# rig to the hamlib backend.
#
# QT_QPA_PLATFORM=xcb forces the Qt xcb (X11) platform plugin even in cases
# where Qt might attempt to auto-select the wayland plugin.
#
# The TCP API server (port 2442) is always enabled in JS8Call's configuration;
# our FastAPI bridge (server.py) connects to it as a client.
# =============================================================================
log "STEP 6: Launching JS8Call..."
export QT_QPA_PLATFORM=xcb
export QT_LOGGING_RULES="*.debug=false"
export PULSE_PROP="media.role=phone"  # Hint to PulseAudio for priority routing

js8call \
    --rig-name="KiwiSDR-Virtual" \
    2>/tmp/js8call.log \
&
JS8CALL_PID=$!
log "JS8Call PID: ${JS8CALL_PID}"

# Give JS8Call time to start its TCP API server before the bridge connects
sleep 3

# =============================================================================
# STEP 7 – Start FastAPI WebSocket Bridge
#
# server.py connects to JS8Call's TCP API on port 2442 and exposes:
#   • /ws/js8        – WebSocket endpoint for the React frontend
#   • /api/stations  – REST endpoint returning heard stations list
# =============================================================================
log "STEP 7: Starting FastAPI bridge server on port 8080..."
python3 /app/server.py \
    2>/tmp/server.log \
&
SERVER_PID=$!
log "FastAPI bridge PID: ${SERVER_PID}"

# =============================================================================
# STEP 8 – Health monitor and container keep-alive
#
# tail -f /dev/null runs as a trivial foreground process that keeps PID-1
# alive. Without a foreground process Docker would consider the container
# exited and perform cleanup (killing all child processes).
# =============================================================================
log "STEP 8: All services started. Container is running."
log "  Xvfb:           PID ${XVFB_PID}        (display :99)"
log "  PulseAudio:     system daemon           (KIWI_RX sink)"
log "  KiwiSDR pipe:   PID ${KIWI_PIPE_PID}   (${KIWI_HOST}:${KIWI_PORT})"
log "  JS8Call:        PID ${JS8CALL_PID}      (TCP API :2442)"
log "  FastAPI bridge: PID ${SERVER_PID}       (:8080)"
log ""
log "Logs:"
log "  /tmp/pulseaudio.log   – PulseAudio daemon"
log "  /tmp/kiwirecorder.log – KiwiSDR stream client"
log "  /tmp/pacat.log        – PulseAudio sink feed"
log "  /tmp/js8call.log      – JS8Call application"
log "  /tmp/server.log       – FastAPI bridge"

# Trap signals for graceful shutdown
cleanup() {
    log "Caught shutdown signal – stopping services..."
    kill "${SERVER_PID}" 2>/dev/null || true
    kill "${JS8CALL_PID}" 2>/dev/null || true
    kill "${KIWI_PIPE_PID}" 2>/dev/null || true
    pulseaudio --kill 2>/dev/null || true
    kill "${XVFB_PID}" 2>/dev/null || true
    log "Shutdown complete."
    exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

tail -f /dev/null
