# Task: Maritime Poller Testing Improvement

## Date: 2026-03-04

## Description:
Implemented comprehensive unit tests for the `maritime_poller` component, specifically targeting the `utils.py` and `classification.py` modules. This addresses a testing gap where critical geographic calculations and vessel classification logic were previously untested.

## Changes:
- Created `backend/ingestion/maritime_poller/tests/` directory.
- Added `backend/ingestion/maritime_poller/tests/__init__.py`.
- Implemented `backend/ingestion/maritime_poller/tests/test_utils.py`:
    - Tests for `calculate_bbox` at the equator.
    - Tests for `calculate_bbox` at high latitudes (longitude scaling).
    - Tests for latitude clamping at the North and South Poles.
    - Tests for edge cases like zero radius and very large radius.
- Implemented `backend/ingestion/maritime_poller/tests/test_classification.py`:
    - Tests for vessel category mapping based on AIS ship types.
    - Tests for hazardous vessel identification logic.
    - Tests for MMSI-based station type and flag MID identification.
    - Verification of the return dictionary structure.

## Verification:
- All 50 new tests pass using `pytest`.
- Verified that tests correctly identify bugs by intentionally introducing errors in `utils.py`.
- Verified no regressions in existing aviation poller tests.
