Orbital Map Feature — Gap Analysis & Integration Report
Sovereign Watch v0.14 · 2026-03-04
1. Current State Assessment
The orbital feature is partially built. The frontend widget layer is complete and well-designed, but the data plumbing between the backend and the frontend is entirely absent. The three widgets — PassPredictorWidget, DopplerWidget, and PolarPlotWidget — are receiving either empty arrays or no props at all.

What exists:

OrbitalDashboard.tsx — layout shell, renders left sidebar + map
OrbitalSidebarLeft.tsx — assembles the three widgets
PassPredictorWidget.tsx — complete UI, hardwired with passes={[]}
DopplerWidget.tsx — complete UI with SVG chart and Doppler math, receives no passPoints
PolarPlotWidget.tsx — complete SVG polar render, receives no pass data
OrbitalCategoryPills.tsx — working category filter
OrbitalMap.tsx — the Deck.gl map adapter for orbital view
orbital_pulse/service.py — propagates ~14k satellites at 5s cadence via Kafka, already emits tle_line1/tle_line2 in each event
What is missing:

backend/api/routers/orbital.py — the file does not exist (the implementation task says it was created, but it was not)
No GET /api/orbital/passes endpoint registered in main.py
No satellites or tle_cache table in the database schema
No sgp4 or skyfield in backend/api/requirements.txt
No API fetch hook in the frontend — OrbitalSidebarLeft has passes={[]} hardcoded
No SatelliteInspector right panel — OrbitalDashboard only renders a left sidebar and map; the right panel layout was never wired in
Home location is hardcoded as { lat: 45.52, lon: -122.68 } with no connection to the mission area system
2. The Core Blocker: TLE Data Access
This is the most important architectural problem to solve.

The pipeline today:

Celestrak → orbital_pulse → Kafka (orbital_raw) → broadcast_service → WebSocket → Frontend
                                              ↘ Historian → TimescaleDB tracks table

The tracks table stores position data (lat/lon/alt/speed/heading) plus a meta JSONB blob. The TLE lines (tle_line1, tle_line2) are included in the Kafka message's detail.classification field, which means they do land in meta.classification.tle_line1 inside the tracks table.

However, there are two critical problems:

Problem A — 24-hour retention policy.
The tracks table has add_retention_policy('tracks', INTERVAL '24 hours'). TLE data churned through Kafka is retained only 24 hours. A pass prediction API needs to look up a satellite by NORAD ID and retrieve its TLE at any time, without requiring a recent position update to have just arrived. If the system was restarted or if a satellite hasn't been propagated recently, there is no TLE to fetch.

Problem B — No dedicated satellite index.
The tracks table is a time-series hypertable optimized for recent telemetry by entity_id. Querying it for a satellite's latest TLE would require:

SELECT meta->'classification'->>'tle_line1', meta->'classification'->>'tle_line2'
FROM tracks
WHERE entity_id = 'SAT-25544'
ORDER BY time DESC
LIMIT 1;

This works, but it's fragile against retention expiry and not indexed on meta.classification.

The fix — Add a satellites table:
A separate, non-expiring table to cache the most current TLE per NORAD ID is the right pattern. The Historian can be extended to upsert into it on every orbital Kafka message.

CREATE TABLE IF NOT EXISTS satellites (
    norad_id      INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT,
    tle_line1     TEXT NOT NULL,
    tle_line2     TEXT NOT NULL,
    inclination_deg DOUBLE PRECISION,
    eccentricity  DOUBLE PRECISION,
    period_min    DOUBLE PRECISION,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_satellites_category ON satellites (category);

The Historian's orbital_raw processing block should run an INSERT ... ON CONFLICT (norad_id) DO UPDATE for every satellite message so the TLE is always fresh and never expires.

3. Backend — What Needs to Be Built
3a. Add sgp4 to backend/api/requirements.txt
sgp4>=2.22

skyfield is heavier and not necessary since sgp4 alone is sufficient for pass prediction math when combined with standard trigonometry for az/el. The orbital_pulse poller already uses sgp4 and has the correct pattern.

3b. Create backend/api/routers/orbital.py
The route must:

Accept norad_id, lat, lon, min_elevation (default 10°), hours (default 24)
Query the satellites table for the TLE of the requested NORAD ID
Use sgp4.api.Satrec.twoline2rv to load the TLE
Step through time at 10s intervals over the requested window
At each step, compute the observer-to-satellite vector in ECI/ECEF, convert to az/el
Detect AOS (el rises above min_elevation), TCA (peak el), LOS (el drops below)
For each pass, compute slant range at each step (for Doppler widget)
Return a list of PassPrediction objects
The az/el computation from a ground observer requires:

Convert satellite TEME position → ECEF (using GMST rotation)
Compute observer ECEF from lat/lon
Get observer→satellite vector in ECEF
Rotate to topocentric SEZ or ENZ frame
Extract azimuth and elevation
Note: sgp4 library includes a sat.sgp4(jd, fr) per-satellite method that matches the vectorized version already used in orbital_pulse. The backend can use this single-sat version since it is only predicting one satellite at a time.

3c. Register the router in backend/api/main.py
from routers import system, tracks, analysis, repeaters, orbital
# ...
app.include_router(orbital.router)

3d. Extend the Historian for the satellites table
In services/historian.py, add an upsert branch for messages from the orbital_raw topic:

upsert_sat_sql = """
    INSERT INTO satellites (norad_id, name, category, tle_line1, tle_line2, inclination_deg, eccentricity, period_min, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (norad_id) DO UPDATE SET
        tle_line1 = EXCLUDED.tle_line1,
        tle_line2 = EXCLUDED.tle_line2,
        updated_at = NOW()
"""

4. Frontend — What Needs to Be Wired Up
4a. API hook: usePassPredictions
Create frontend/src/hooks/usePassPredictions.ts:

// Fetches /api/orbital/passes?norad_id=X&lat=Y&lon=Z&hours=24
// Returns { passes, isLoading, error, refetch }
// Refetches every 5 minutes

This hook should be called in OrbitalSidebarLeft with the selected satellite's NORAD ID and the home location. When no satellite is selected, it should fetch passes for all visible satellites (or skip entirely and show a prompt to select one).

4b. Wire PassPredictorWidget to real data
In OrbitalSidebarLeft.tsx, replace:

<PassPredictorWidget passes={[]} homeLocation={{ lat: 45.52, lon: -122.68 }} ... isLoading={false} />

with:

<PassPredictorWidget passes={passes} homeLocation={homeLocation} ... isLoading={isLoading} />

where passes comes from usePassPredictions and homeLocation comes from the mission area (already available via useMissionArea hook).

4c. Wire DopplerWidget and PolarPlotWidget
When a pass is selected (user clicks a row in PassPredictorWidget), the parent should fetch the full pass detail from the API, which includes the per-step slant_range_km, azimuth, and elevation arrays needed by these two widgets. This data is already in the planned PassPrediction response — it just needs the API endpoint to include points[] in the response body for the selected pass.

4d. Add a right panel with SatelliteInspector
The OrbitalDashboard.tsx currently only renders a left sidebar and the map — there is no right panel. The SatelliteInspector component planned in the research doc (SatelliteInspector.tsx) was never created. This panel should:

Show orbital parameters of the selected satellite (altitude, inclination, eccentricity, velocity)
Show current az/el from home location (can be computed client-side from the live WebSocket entity position)
Show next pass AOS/TCA/LOS countdown
4e. Home location — use mission area
Replace the hardcoded { lat: 45.52, lon: -122.68 } in OrbitalSidebarLeft with the mission area center from useMissionArea(), which is already used throughout the app. Fall back to the hardcoded Portland coordinates only if no mission area is set.

5. Implementation Sequence (Priority Order)
1. [DB]      Add `satellites` table to init.sql (and run migration)
2. [Backend] Add `sgp4` to backend/api/requirements.txt
3. [Backend] Extend Historian to upsert into `satellites` on orbital_raw messages
4. [Backend] Create backend/api/routers/orbital.py with GET /api/orbital/passes
5. [Backend] Register orbital router in main.py
6. [Frontend] Create usePassPredictions.ts hook
7. [Frontend] Wire PassPredictorWidget in OrbitalSidebarLeft to real API data
8. [Frontend] Wire DopplerWidget with pass step data (slant_range_km per step)
9. [Frontend] Wire PolarPlotWidget with az/el step data from selected pass
10. [Frontend] Create SatelliteInspector.tsx and add right panel to OrbitalDashboard
11. [Frontend] Replace hardcoded home location with useMissionArea()

Steps 1–5 are pure backend work that unblock everything else. Steps 6–9 can be parallelized once the API is live. Step 10 is independent of the data plumbing and can start anytime.

6. Additional Improvements Worth Making
Orbital-specific improvements
Improvement	Why	Effort
Ground track prediction lines	Show the satellite's future path on the map (±90 min) using SGP4. The research doc planned this but it was not built. Requires the backend to expose a GET /api/orbital/groundtrack/:norad endpoint returning a GeoJSON LineString. The frontend renders it as a Deck.gl PathLayer.	Medium
Terminator layer	The suncalc-based day/night line was researched but not confirmed as built. Check if it's in OrbitalMap.tsx.	Low
Satellite footprint circles per altitude	Currently footprints use a hardcoded radius. Compute the actual horizon circle from the satellite's altitude: footprint_radius_km = Earth_radius * arccos(Earth_radius / (Earth_radius + altitude_km))	Low
3D globe mode	OrbitalDashboard passes globeMode={orbitalViewMode === '3D'} but this toggle button is only in a comment. A 2D/3D toggle pill button needs to be surfaced in OrbitalSidebarLeft.	Low
NORAD ID search	The research doc identifies this as HIGH priority. Currently there is no way to search or jump to a satellite by NORAD ID or name. A small search input filtering the WebSocket entity map would suffice.	Low
Backend / data pipeline improvements
Improvement	Why	Effort
Space-Track.org authentication	Celestrak is publicly available but rate-limited. Space-Track (space-track.org) provides higher quality, authenticated TLE feeds with more historical data. The PLAN-research-integration.md proposed this. Add optional SPACETRACK_USER / SPACETRACK_PASS env vars to orbital_pulse.	Medium
SatNOGS observation cross-reference	Cross-reference predicted passes with SatNOGS observation records to flag satellites that were recently heard at status=good. Useful for confirming a satellite is actually active before scheduling antenna tracking.	High
Pass prediction caching in Redis	Pass predictions are expensive to compute (step through 24h at 10s intervals per satellite). Cache results in Redis with a 5-minute TTL keyed by norad_id:lat:lon:hours. This is especially important since many users may query the same popular satellites (ISS, Starlink, NOAA-19).	Medium
Batch pass prediction	Add GET /api/orbital/passes/all?lat=Y&lon=Z&hours=6 to fetch the next N passes across all satellites in a single request. This is what the PassPredictorWidget needs to show a "upcoming passes" list without requiring the user to first select a satellite.	Medium
Frontend UX improvements
Improvement	Why	Effort
Pass countdown timer	The PassPredictorWidget shows AOS as a static time string. A live countdown (T-12:34) makes it much more operationally useful. Implement with a useEffect interval that recalculates from the AOS ISO string.	Very Low
CSV export	The research doc planned a "download" button in the pass list. window.URL.createObjectURL(new Blob([csv])) from the passes array is trivial to add.	Very Low
Min elevation filter UI	The research doc mockup shows a MIN EL: [ 10° ▾ ] dropdown in the pass predictor sidebar. This controls the min_elevation query param but there's no UI for it yet.	Very Low
Satellite count per category	Show how many satellites are visible per category pill (GPS: 127, COMMS: 5,832, etc.) by counting entities from the WebSocket feed.	Low
SatelliteInspector az/el live update	Once a satellite is selected, compute its current azimuth and elevation from the home location every 5s using the live position from the WebSocket feed. This can be done entirely in the frontend with the same ECEF math used in the backend.	Medium
7. Summary — What to Build Next
The single most impactful next step is the backend pass prediction endpoint, because it unblocks all three widgets simultaneously. The widgets are already built and waiting.

The required work to get the first end-to-end pass prediction flowing:

Add satellites table to init.sql
Add sgp4 to backend/api/requirements.txt
Extend Historian to upsert TLEs into satellites
Create backend/api/routers/orbital.py with GET /api/orbital/passes
Register the router in main.py
Create usePassPredictions hook in the frontend
Wire it into OrbitalSidebarLeft
That sequence produces a fully functional Pass Predictor, and from there the DopplerWidget and PolarPlotWidget can be fed by including points[] in the pass response — no additional backend work required.

The exploration agent confirmed all findings. The report above is the complete analysis — here's a quick summary of the key takeaways:

Key Findings
The Core Problem
The backend pass prediction API was never built. Despite the implementation task doc claiming it was completed, backend/api/routers/orbital.py does not exist and is not registered in main.py. All three widgets — PassPredictorWidget, DopplerWidget, and PolarPlotWidget — are fully coded but waiting on this one file.

Critical Architecture Issue
The tracks table has a 24-hour retention policy. TLE data (stored in meta.classification.tle_line1/tle_line2) gets purged nightly. The pass prediction API needs TLEs to be available at any time, so a dedicated satellites table with no retention policy is required — updated via upsert by the Historian on every orbital_raw Kafka message.

What's Built & Working
All three predictive widgets (UI complete, receiving empty/null data)
orbital_pulse poller — propagates ~14k satellites at 5s cadence, already emits TLE lines
OrbitalDashboard + OrbitalSidebarLeft layout shell
OrbitalLayer Deck.gl rendering, TerminatorLayer day/night line
sgp4 available in orbital_pulse deps with coordinate math already written in utils.py
Quickest Path to a Working Dashboard
Add satellites table to init.sql (no retention, upsert on each orbital message)
Add sgp4 to backend/api/requirements.txt
Extend Historian to upsert TLE data into satellites
Create backend/api/routers/orbital.py — GET /api/orbital/passes + GET /api/orbital/groundtrack/:norad
Register router in main.py
Create usePassPredictions React hook
Wire it into OrbitalSidebarLeft (replace passes={[]})
Include points[] (az/el/slant_range per step) in pass response → feeds DopplerWidget and PolarPlotWidget automatically
Steps 1–5 are backend-only and unblock everything. The utils.py in orbital_pulse already has the TEME→ECEF→LLA math — the backend router can reuse that exact pattern for observer az/el computation.
