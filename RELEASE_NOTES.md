# Release - v0.18.2 - Globe Mode Rendering Fix

## Summary

This patch release resolves a series of interconnected bugs that caused Deck.gl layers to go blank in Globe mode when a Mapbox API token was present, and fixes a crash triggered when toggling Globe mode off.

The root cause is a platform-level Mapbox limitation: **Mapbox Globe does not support `CustomLayerInterface`**, which is the mechanism `MapboxOverlay` uses to register with the Mapbox GL render pipeline. The fix routes Globe mode through the **MapLibre adapter**, which fully supports globe projection and Deck.gl interop, while preserving Mapbox (Standard style) for 2D and 3D Mercator views.

Both the Tactical Map and Orbital Map receive the same fix.

---

## What Changed

### Bug Fixes

- **Globe mode now uses MapLibre adapter** (`TacticalMap.tsx`, `OrbitalMap.tsx`)
  Both maps pre-load both adapters at startup and select between them at render time:
  - Globe mode → MapLibre adapter (CartoDB Dark Matter style, full Deck.gl globe support)
  - 2D/3D Mercator with token → Mapbox adapter (Mapbox Standard style)

- **Fixed incorrect projection API form** (`useMapCamera.ts`)
  `map.setProjection()` was passing the Mapbox-only string `"globe"` to a MapLibre instance. MapLibre requires the object form `{ type: "globe" }`. The hook now resolves the active adapter type from `globeMode` and applies the correct form.

- **Fixed toggle-off crash** (`TacticalMap.tsx`, `OrbitalMap.tsx`)
  A manual `map.remove()` call in the `globeMode` reset effect was racing with `react-map-gl`'s own internal cleanup, causing `Cannot read properties of undefined (reading 'destroy')`. The redundant call has been removed — react-map-gl fully owns GL context lifecycle management on unmount.

---

## Files Changed

| File                                          | Change                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| `frontend/src/components/map/TacticalMap.tsx` | Dynamic adapter selection; mapStyle switch in Globe mode |
| `frontend/src/components/map/OrbitalMap.tsx`  | Same fix mirrored to Orbital map                         |
| `frontend/src/hooks/useMapCamera.ts`          | Correct projection API form for MapLibre vs Mapbox       |

---

## Upgrade Instructions

```bash
git pull origin main
docker compose up -d --build frontend
```

No configuration changes, dependency changes, or database migrations required.
