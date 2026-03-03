# Release - v0.13.3 - Globe 3D Stabilization Patch

This patch focuses on stabilizing the 3D rendering pipeline for the Mapbox v3 Globe projection, addressing several graphical glitches related to layering, depth testing, and geographic scaling.

## Key Fixes

- **Geographic Satellite Scaling:** Orbital assets now correctly restrict their maximum footprint sizes based on altitude, preventing them from scaling into massive planet-sized pyramids when zooming out.
- **Depth Clipping & Z-Fighting:** All tactical layers (submarine cables, infrastructure, tracks) now apply aggressive Depth Biasing to ensure they remain cleanly draped on top of the 3D terrain mesh rather than clipping inside the Earth's crust when the camera is pitched.
- **Longitude Wrapping Control:** Eliminated visual stretch artifacts around the International Date Line by automatically disabling Deck.gl's longitude wrapping when viewing the spherical globe projection.

## Known Issues

- **Mapbox v3 Globe Parallax:** Due to architectural limitations in Mapbox GL JS v3, the engine does not support interwoven (shared WebGL context) custom layers while in `globe` projection. Deck.gl is forced to render on a separate canvas. When the camera is pitched, operators will notice a "parallax drift" effect where the tactical layers visually separate from the globe surface. For perfectly synchronized interleaved layers on a globe, operators should toggle to the MapLibre engine.

## Upgrade Instructions

To apply this patch, pull the latest code and rebuild the frontend container:

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart the frontend
docker compose up -d --build
```
