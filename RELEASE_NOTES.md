# Release - v0.22.0 - Radio Frequency Overhaul

## High-Level Summary

This release introduces a major architectural and visual overhaul of the **Radio Frequency (RF) Infrastructure** layer. Operators can now monitor multiple RF services simultaneously across an expanded 2,000 NM range. The update features a new **AOR Boundary Ring** for precise range visualization and a refined **Amber-Yellow UI theme** that standardizes RF controls across the HUD.

## Key Features

- **Multi-Service Ingestion**: Concurrent tracking for Amateur Radio (Ham), NOAA Weather Radio (NWR), and Public Safety (RadioReference) networks.
- **Tactical Range Ring**: A high-visibility, dashed amber ring on the map now represents the selected survey radius.
- **Condensed UI Layout**: RF service toggles are now unified into a single horizontal row with high-contrast glowing indicators.
- **Advanced Clustering**: RF map clusters now respect service types, ensuring distinct visual grouping even at global zoom levels.
- **Expanded Polling Range**: Survey boundaries extended from 500 NM up to 2,000 NM with backend performance optimizations.

## Technical Details

- **Backend**: Implemented `migrate_rf_plus.sql` for optimized spatial indexing of RF sites.
- **API**: Updated `/api/rf/sites` to accept multiple `services` parameters.
- **Frontend**: Refactored `useRFSites` hook for improved caching and debouncing during rapid radius changes.
- **Layers**: New `geodesicCircle` integration in `buildAOTLayers` for boundary rendering.

## Upgrade Instructions

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart containers
docker compose up -d --build
```
