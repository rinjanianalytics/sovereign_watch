# Release - v0.12.1 - Security & Classification Patch

**Released:** 2026-03-01

---

## Summary

v0.12.1 is a targeted patch release addressing two issues carried over from v0.12.0 development: a hardening of backend API error handling to eliminate information disclosure, and a significant accuracy improvement to the ADS-B aviation poller's UAS/drone classification engine.

No new features, breaking changes, or database migrations are introduced. Operators can upgrade by rebuilding only the affected services.

---

## 🔧 What's Fixed

### 🛡️ API Security — Secure Error Handling (Medium)
- Internal stack traces and implementation details are no longer exposed in HTTP error responses from `analysis` and `system` routers.
- All error payloads now return structured, operator-safe messages — preventing inadvertent leakage of backend internals to external callers.
- **Files affected:** `backend/api/routers/analysis.py`, `backend/api/routers/system.py`

### ✈️ Drone Classification Accuracy (ADS-B Poller)
- Overhauled UAS detection logic in `classify_aircraft` to cross-reference ICAO category, type code, description field, squawk code, operator, callsign, and registration for high-confidence identification.
- Added dedicated string constants for `MILITARY_UAS`, `COMMERCIAL_UAS`, `CIVIL_UAS`, and `UNKNOWN_UAS` sub-classes, now emitted alongside `aircraft_class = "drone"` in the classification output.
- Comprehensive test fixtures added to `test_classification.py` to lock in drone detection behavior and prevent future regressions.
- **Files affected:** `backend/ingestion/aviation_poller/classification.py`, `backend/ingestion/aviation_poller/tests/test_classification.py`

---

## 🔧 Technical Details

| Area | Change |
| :--- | :--- |
| `analysis.py` | Replaced raw exception propagation with structured error responses |
| `system.py` | Same — unified safe error handling pattern |
| `classification.py` | New UAS constants + multi-field drone detection; granular `drone_class` emission |
| `test_classification.py` | Comprehensive drone fixture suite (Military / Commercial / Civil / Unknown UAS) |

**No breaking API or schema changes.** No new environment variables required.

---

## ⬆️ Upgrade Instructions

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart affected services
docker compose up -d --build api

# Verify services
docker compose ps
```

> _No database migrations required. Frontend rebuild is not needed for this patch._