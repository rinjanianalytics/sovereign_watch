# Release - v0.19.0 - Alerts Engine & Widget Integration

This release introduces the highly anticipated Alerts Widget alongside a comprehensive cross-domain alert detection engine. Operators now have immediate, structured access to critical tactical events directly from the central HUD TopBar. 

- **Alerts Widget**: A new dropdown widget integrated into the TopBar for viewing the latest tactical alerts directly under the "ALERTS" pill.
- **Cross-Domain Alert Detection**: The engine now actively monitors and triggers alerts for:
  - **Aviation**: Emergency squawks (7500/7600/7700) and distress statuses.
  - **Maritime**: AIS-SART distress, vessels aground or not under command, and high-interest targets (military, hazardous cargo).
  - **Orbital**: Approaching intel-category satellites with an AOS under 30 minutes.
- **Intelligent Deduplication**: The alert system tracks state per-entity, ensuring operators aren't overwhelmed with duplicate warnings while reliably re-alerting if an emergency clears and returns.
- **HUD Z-Indexing Fix**: Resolves an issue where dropdown menus could be obscured by sidebars due to stacking context overlaps, ensuring complete visibility of crucial HUD elements.
- **Refined Styling**: Cleaned up the alerts widget border glow for a sleeker presentation.

## Upgrade Instructions
To apply these changes:
1. `git pull origin main`
2. `docker compose build frontend`
3. `docker compose up -d frontend`
