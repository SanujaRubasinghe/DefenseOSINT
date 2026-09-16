# services/collector-agent/collector_agent/tools/aviation.py
from __future__ import annotations

from datetime import UTC, datetime

import httpx

OPENSKY_API = "https://opensky-network.org/api/states/all"
TIMEOUT = 15

# Sri Lanka + surrounding airspace / southern India bounding box
# (lamin, lomin, lamax, lomax) — widened from a tight Sri Lanka-only box
# since live traffic directly over the island can be sparse at any given
# moment.
DEFAULT_BBOX = (4.0, 77.0, 12.0, 84.0)


async def search_aircraft(bbox: tuple[float, float, float, float] | None = None) -> list[dict]:
    """Fetch live aircraft state vectors from OpenSky. Defaults to the Sri
    Lanka region if no bbox given. Free, anonymous access (rate-limited to
    ~1 request/10s). An empty result is a legitimate outcome — it just means
    no aircraft were in the area at the moment of the request."""
    bbox = bbox or DEFAULT_BBOX
    params = {"lamin": bbox[0], "lomin": bbox[1], "lamax": bbox[2], "lomax": bbox[3]}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(OPENSKY_API, params=params)
        data = resp.json()
    except Exception:
        return []

    results = []
    for state in (data.get("states") or [])[:20]:
        callsign = (state[1] or "").strip()
        results.append({
            "title": f"Aircraft {callsign or state[0]}",
            "content": f"Origin: {state[2]}, altitude: {state[7]}m, velocity: {state[9]}m/s",
            "source_url": "https://opensky-network.org",
            "retrieved_at": datetime.now(UTC),
            "published_at": None,
            "query": "Sri Lanka region airspace",
            "source_name": "OpenSky Network",
        })
    return results
