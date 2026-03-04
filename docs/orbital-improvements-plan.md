# Orbital Map — Improvements Plan
Sovereign Watch v0.14 · 2026-03-04 · **Completed in v0.16.0**

## Architecture Context (Do Not Duplicate)

Before building anything, record what already exists so we don't add redundant controls.

| Feature | How it's handled | Where |
|---------|-----------------|-------|
| Globe / 2D / 3D projection toggle | Built into OrbitalMap HUD (bottom-center buttons) | `OrbitalMap.tsx` |
| Terminator (day/night line) | Global TopBar toggle (Moon icon) → `showTerminator` in `orbitalFilters` | `TopBar.tsx` + `App.tsx` |
| History trails / ground track visibility | Global TopBar toggle (History icon) → `showHistoryTails` passed to OrbitalMap | `TopBar.tsx` + `App.tsx` |
| Right inspector panel | `SidebarRight` is already rendered in orbital mode at the `App.tsx` level, same as tactical — **no separate `OrbitalDashboard` right panel is needed** | `App.tsx` lines 497-506 |
| `OrbitalDashboard.tsx` | **Deleted in v0.16.0** — was unused; App.tsx renders `OrbitalMap` + `OrbitalSidebarLeft` directly | removed |

---

## Implementation Status

### ✅ Group 1 — SidebarRight: Satellite Inspector Enhancements
*Completed in v0.16.0*

**✅ 1a. Orbital parameters** — `inclination_deg` and `eccentricity` added to the satellite identity header in `SidebarRight.tsx`.

**✅ 1b. Live az/el readout** — `SatelliteInspectorSection` sub-component computes observer→satellite azimuth, elevation, and slant range at 1 Hz using `satAzEl()` in `geoUtils.ts` (spherical ENZ ECEF math). Elevation ≥ 10° highlights green.

**✅ 1c. Next pass AOS/TCA/LOS countdown** — `SatelliteInspectorSection` calls `usePassPredictions` filtered by `norad_id` (with `skip` guard for non-satellite entities) and displays the soonest upcoming pass with live AOS countdown, max elevation, and duration.

---

### ✅ Group 2 — PassPredictorWidget UX
*Completed in v0.16.0*

**✅ 2a. Live countdown column** — Each pass row shows `T-HH:MM:SS` to AOS (or `T+` to LOS when in-progress). In-progress passes pulse purple and switch to LOS countdown.

**✅ 2b. Min elevation filter dropdown** — `MIN EL: [10° ▾]` dropdown (0/5/10/15/20/30°) in the pass list header wired to `usePassPredictions` `minElevation` option. State lives in `OrbitalSidebarLeft`.

**✅ 2c. CSV export button** — Download icon in pass list header serialises `passes[]` to `passes_YYYY-MM-DD.csv` via `Blob` + `createObjectURL`.

---

### ✅ Group 3 — OrbitalSidebarLeft: Search & Counts
*Completed in v0.16.0*

**✅ 3a. Satellite count per category pill** — New `GET /api/orbital/stats` backend endpoint returns `COUNT GROUP BY category` from the `satellites` table. `OrbitalCategoryPills` fetches on mount and renders `GPS (127)` style counts.

**✅ 3b. NORAD ID / name search** — Compact search input above the category pills filters the pass list client-side by name or NORAD ID substring. No additional API call.

---

### ✅ Group 4 — Predicted Ground Track PathLayer
*Completed in v0.16.0*

When a satellite is selected and history tails are on, `OrbitalMap` fetches `/api/orbital/groundtrack/{norad_id}?minutes=90` into a `predictedGroundTrackRef` and passes it through `useAnimationLoop` to `getOrbitalLayers`, which renders it as a dashed `PathLayer` (future orbit). Respects the global history trail toggle. The `GroundTrackPoint` type is exported from `OrbitalLayer.tsx`.

---

### ✅ Group 5 — Footprint Circles by Altitude
*Already complete before this plan — no changes required*

`OrbitalLayer.tsx` already computed footprint radius from altitude using the correct formula:
```
footprintKm = 2 * R_EARTH * arccos(R_EARTH / (R_EARTH + altKm))
```
Footprint label also displays the computed diameter.

---

### ✅ Group 6 — Backend: Pass Prediction Caching + Limit
*Completed in v0.16.0 (scope adjusted from original batch endpoint)*

- `GET /api/orbital/passes` gains a `limit` query param (max passes returned, sorted by AOS).
- Results cached in Redis for 5 minutes, keyed by `orbital:passes:{lat}:{lon}:{hours}:{el}:{norad_ids}:{limit}`. Falls back gracefully if Redis is unavailable.
- `useMissionLocation` hook extracted to share observer-location resolution between `OrbitalSidebarLeft` and `SidebarRight` (replaces duplicated `getMissionArea` + state pattern).
- `usePassPredictions` gains `skip` option to suppress fetches when not applicable (used by `SatelliteInspectorSection` for non-satellite entities).

---

## Cleanup (v0.16.0)

- **Deleted** `OrbitalDashboard.tsx` — confirmed unused (130 lines of dead code)
- **Removed** stale `Satellite` icon import from `OrbitalCategoryPills.tsx`
- **Normalised** `React.useState` / `React.useEffect` → destructured hooks in `SidebarRight.tsx`

---

## Out of Scope / Deferred

These items from the original analysis doc are deferred:

- Globe / 2D / 3D sidebar toggle — **already in OrbitalMap HUD**
- Terminator toggle — **already in TopBar**
- Ground track visibility — **already controlled by TopBar history trail toggle**
- Space-Track.org authentication — deferred, Celestrak sufficient for now
- SatNOGS cross-reference — deferred, separate research effort
- Batch "all upcoming passes" across all satellites in a single endpoint — deferred pending Redis performance testing
