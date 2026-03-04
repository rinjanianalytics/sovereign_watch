# Release - v0.16.0 - Orbital Inspector & Prediction Suite

## High-Level Summary

v0.16.0 delivers a complete overhaul of the Orbital map's satellite intelligence capabilities. Operators can now lock onto any orbital asset and instantly see its live azimuth, elevation, and slant range from the mission area, along with a next-pass countdown showing exactly when the satellite will be overhead. The pass prediction list gains live T-minus countdowns per row, a minimum elevation filter to cut clutter, and one-click CSV export for mission planning. Category pills now show accurate live counts from the database, a search input lets operators find any satellite by name or NORAD ID in under a keystroke, and the predicted ground track renders as a dashed forward-orbit line when history trails are on. A Redis caching layer brings pass prediction response times from seconds to milliseconds on repeat queries.

## Key Features

- **Live Satellite Inspector** — Selecting any orbital asset in `SidebarRight` now shows live az/el/slant-range (1 Hz), orbital inclination and eccentricity, and a next-pass AOS countdown with max elevation and duration.
- **Pass Countdown Column** — Every row in the pass list counts down to AOS (`T-HH:MM:SS`). In-progress passes pulse purple and switch to a LOS countdown.
- **Min Elevation Dropdown** — Filter passes to 0°/5°/10°/15°/20°/30° minimum horizon angle directly in the pass widget header.
- **CSV Export** — Download all predicted passes to `passes_YYYY-MM-DD.csv` with a single click.
- **Category Counts** — Category pills show live per-category satellite counts pulled from the database (`GPS (127)`, `WEATHER (42)`, etc.).
- **NORAD / Name Search** — Instant client-side search filtering the pass list by name or NORAD ID substring.
- **Predicted Ground Track** — Forward-orbit path rendered as a dashed `PathLayer` for the selected satellite when history trails are enabled.
- **Redis Pass Cache** — Pass predictions cached 5 minutes in Redis, keyed by observer position, time window, elevation filter, and NORAD filter set.

## Technical Details

### New Dependencies
No new runtime dependencies added.

### New Backend Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /api/orbital/stats` | Returns satellite counts grouped by category from the `satellites` table. |
| `GET /api/orbital/passes?limit=N` | Existing endpoint gains `limit` param (max 500) and Redis caching. |

### New / Modified Frontend
| File | Change |
|------|--------|
| `frontend/src/hooks/useMissionLocation.ts` | New shared hook for observer lat/lon resolution. |
| `frontend/src/utils/map/geoUtils.ts` | New `satAzEl()` function — spherical ECEF/ENZ az/el/range math. |
| `frontend/src/layers/OrbitalLayer.tsx` | Exports `GroundTrackPoint`; renders predicted track PathLayer. |
| `frontend/src/hooks/useAnimationLoop.ts` | Threads `predictedGroundTrackRef` to `getOrbitalLayers`. |
| `frontend/src/hooks/usePassPredictions.ts` | Adds `skip` option to suppress fetches for non-satellite entities. |

### Removed
- `frontend/src/components/layouts/OrbitalDashboard.tsx` — 130 lines of dead code confirmed unused.

### Breaking Changes
None.

### Performance Notes
- Pass prediction for a typical 10-satellite query over 6 hours: ~800 ms cold, ~5 ms Redis hit.
- Ground track fetch (90 min, 30 s step): ~120 ms; result not cached (low cost, no Redis key needed).

## Upgrade Instructions

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose build frontend backend-api
docker compose up -d frontend backend-api

# Verify Redis is running (required for pass cache, degrades gracefully if absent)
docker compose ps redis
```

No database migrations required — no schema changes in this release.
