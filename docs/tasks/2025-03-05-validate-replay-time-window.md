# Task: Validate time window duration in replay queries

## Status
- **Date**: 2025-03-05
- **Status**: Completed
- **Target**: Backend API (`backend/api/routers/tracks.py`)

## Problem
The track replay endpoint (`/api/tracks/replay`) allowed requesting a time window where the `end` time was before the `start` time. This resulted in a negative duration, which silently bypassed the maximum time window check (`TRACK_REPLAY_MAX_HOURS`) because a negative value is always less than the maximum.

## Solution
Implemented a validation check in `backend/api/routers/tracks.py` to ensure that the `end` time is strictly after the `start` time. If this condition is not met, the API returns a `400 Bad Request` with the detail "end must be after start".

```python
        # Validate time window
        duration_hours = (dt_end - dt_start).total_seconds() / 3600
        # BUG-006: A negative duration means dt_end < dt_start. Without this check
        # the value is always < MAX_HOURS so the window guard is silently bypassed.
        if dt_end <= dt_start:
            logger.warning(f"Replay request rejected: end ({dt_end}) is not after start ({dt_start})")
            raise HTTPException(status_code=400, detail="end must be after start")
```

## Verification
### Automated Tests
Added new test cases to `backend/api/tests/test_tracks_replay.py`:
- `test_replay_negative_duration`: Verifies that a request with `end < start` returns 400.
- `test_replay_zero_duration`: Verifies that a request with `end == start` returns 400.

### Manual Verification
Manual verification was performed by reviewing the code implementation and confirming it aligns with the requirements for `BUG-006`.
