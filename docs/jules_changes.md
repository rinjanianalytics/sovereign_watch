# Jules Changes

## Security Fix: Tracks History Validation

### Issue
The `get_track_history` endpoint in `backend/api/routers/tracks.py` lacked input validation for `limit` and `hours` query parameters. This could allow excessive data retrieval, potentially leading to Denial of Service (DoS) or performance degradation.

### Solution
Implemented input validation to enforce maximum limits on `limit` and `hours`.

### Changes
1.  **Configuration:** Added `TRACK_HISTORY_MAX_LIMIT` (default: 1000) and `TRACK_HISTORY_MAX_HOURS` (default: 72) to `backend/api/core/config.py`. These are configurable via environment variables.
2.  **Implementation:** Updated `get_track_history` in `backend/api/routers/tracks.py` to:
    *   Check if `limit` exceeds `TRACK_HISTORY_MAX_LIMIT`.
    *   Check if `hours` exceeds `TRACK_HISTORY_MAX_HOURS`.
    *   Return `400 Bad Request` if limits are exceeded.
3.  **Testing:** Added `backend/api/tests/test_tracks_validation.py` to verify validation logic.

### Verification
Tests confirm that requests exceeding limits are rejected with `400 Bad Request`, while valid requests proceed (returning 503 if DB is not ready, or 200 otherwise).
