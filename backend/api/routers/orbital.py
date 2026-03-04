"""
Orbital pass prediction endpoints.

GET /api/orbital/passes
    Returns upcoming satellite passes for an observer location.

GET /api/orbital/groundtrack/{norad_id}
    Returns the sub-satellite ground track for one orbit.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, Query, HTTPException
from sgp4.api import Satrec, jday

from utils.sgp4_utils import (
    teme_to_ecef,
    ecef_to_lla_vectorized,
    geodetic_to_ecef,
    ecef_to_topocentric,
)
import numpy as np

router = APIRouter(prefix="/api/orbital", tags=["orbital"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _jday_from_datetime(dt: datetime):
    """Return (jd, fr) tuple from a UTC datetime."""
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)


async def _load_satellites(pool, norad_ids: Optional[list[str]]) -> list[dict]:
    """Fetch TLE rows from the satellites table."""
    async with pool.acquire() as conn:
        if norad_ids:
            rows = await conn.fetch(
                "SELECT norad_id, name, category, tle_line1, tle_line2 "
                "FROM satellites WHERE norad_id = ANY($1::text[])",
                norad_ids,
            )
        else:
            rows = await conn.fetch(
                "SELECT norad_id, name, category, tle_line1, tle_line2 FROM satellites"
            )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/passes")
async def get_passes(
    request: Request,
    lat: float = Query(..., description="Observer latitude (degrees)"),
    lon: float = Query(..., description="Observer longitude (degrees)"),
    hours: int = Query(6, ge=1, le=48, description="Prediction window in hours"),
    min_elevation: float = Query(10.0, ge=0.0, le=90.0, description="Minimum AOS elevation (degrees)"),
    norad_ids: Optional[str] = Query(None, description="Comma-separated NORAD IDs to filter"),
):
    """
    Predict upcoming satellite passes for an observer location.

    Returns a list of passes sorted by AOS, each including a 10-second
    points[] array suitable for Doppler and polar-plot rendering.
    """
    pool = request.app.state.db.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    norad_filter = [n.strip() for n in norad_ids.split(",")] if norad_ids else None
    satellites = await _load_satellites(pool, norad_filter)

    if not satellites:
        return []

    obs_ecef = geodetic_to_ecef(lat, lon)
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours)
    step_seconds = 10

    passes = []

    for sat in satellites:
        try:
            satrec = Satrec.twoline2rv(sat["tle_line1"], sat["tle_line2"])
        except Exception:
            continue  # skip malformed TLEs

        # Walk the prediction window at step_seconds intervals
        current_pass_points: list[dict] = []
        in_pass = False
        tca_el = -999.0
        tca_point: Optional[dict] = None

        t = now
        while t <= end:
            jd, fr = _jday_from_datetime(t)
            e, r, _ = satrec.sgp4(jd, fr)
            if e != 0:
                t += timedelta(seconds=step_seconds)
                continue

            r_ecef = teme_to_ecef(np.array(r), jd, fr)
            az, el, rng = ecef_to_topocentric(obs_ecef, r_ecef, lat, lon)

            point = {
                "t": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "az": round(az, 2),
                "el": round(el, 2),
                "slant_range_km": round(rng, 3),
            }

            if el >= min_elevation:
                if not in_pass:
                    in_pass = True
                    current_pass_points = []
                    tca_el = el
                    tca_point = point
                else:
                    if el > tca_el:
                        tca_el = el
                        tca_point = point
                current_pass_points.append(point)
            else:
                if in_pass:
                    # Pass just ended — record it
                    in_pass = False
                    if current_pass_points:
                        aos_p = current_pass_points[0]
                        los_p = current_pass_points[-1]

                        # Compute duration
                        aos_dt = datetime.strptime(aos_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        los_dt = datetime.strptime(los_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        duration = int((los_dt - aos_dt).total_seconds())

                        passes.append({
                            "norad_id": sat["norad_id"],
                            "name": sat["name"] or sat["norad_id"],
                            "category": sat["category"],
                            "aos": aos_p["t"],
                            "tca": tca_point["t"] if tca_point else aos_p["t"],
                            "los": los_p["t"],
                            "max_elevation": round(tca_el, 2),
                            "aos_azimuth": aos_p["az"],
                            "los_azimuth": los_p["az"],
                            "duration_seconds": duration,
                            "points": current_pass_points,
                        })
                    current_pass_points = []
                    tca_el = -999.0
                    tca_point = None

            t += timedelta(seconds=step_seconds)

        # Handle pass still in progress at end of window
        if in_pass and current_pass_points:
            aos_p = current_pass_points[0]
            los_p = current_pass_points[-1]
            aos_dt = datetime.strptime(aos_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            los_dt = datetime.strptime(los_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            duration = int((los_dt - aos_dt).total_seconds())
            passes.append({
                "norad_id": sat["norad_id"],
                "name": sat["name"] or sat["norad_id"],
                "category": sat["category"],
                "aos": aos_p["t"],
                "tca": tca_point["t"] if tca_point else aos_p["t"],
                "los": los_p["t"],
                "max_elevation": round(tca_el, 2),
                "aos_azimuth": aos_p["az"],
                "los_azimuth": los_p["az"],
                "duration_seconds": duration,
                "points": current_pass_points,
            })

    passes.sort(key=lambda p: p["aos"])
    return passes


@router.get("/groundtrack/{norad_id}")
async def get_groundtrack(
    norad_id: str,
    request: Request,
    minutes: int = Query(90, ge=1, le=1440, description="Propagation window in minutes"),
    step_seconds: int = Query(30, ge=5, le=300, description="Time step in seconds"),
):
    """
    Return the sub-satellite ground track for one orbit (default 90 min).

    Response: array of {t, lat, lon, alt_km}.
    """
    pool = request.app.state.db.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    satellites = await _load_satellites(pool, [norad_id])
    if not satellites:
        raise HTTPException(status_code=404, detail=f"No TLE found for NORAD ID {norad_id}")

    sat = satellites[0]
    try:
        satrec = Satrec.twoline2rv(sat["tle_line1"], sat["tle_line2"])
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Malformed TLE: {exc}")

    now = datetime.now(timezone.utc)
    end = now + timedelta(minutes=minutes)

    points = []
    t = now
    while t <= end:
        jd, fr = _jday_from_datetime(t)
        e, r, _ = satrec.sgp4(jd, fr)
        if e == 0:
            r_ecef = teme_to_ecef(np.array(r), jd, fr)
            # ecef_to_lla_vectorized needs (N, 3)
            lat_arr, lon_arr, alt_arr = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))
            points.append({
                "t": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "lat": round(float(lat_arr[0]), 5),
                "lon": round(float(lon_arr[0]), 5),
                "alt_km": round(float(alt_arr[0]), 3),
            })
        t += timedelta(seconds=step_seconds)

    return points
