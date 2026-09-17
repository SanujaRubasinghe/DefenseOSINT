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
        # OpenSky state vector: 5=longitude, 6=latitude, 10=true_track.
        # These were previously dropped, which left the evidence unplottable.
        longitude, latitude, heading = state[5], state[6], state[10]

        lines = []
        if latitude is not None and longitude is not None:
            # "Position: <lat>, <lon>" is the agreed plain-text encoding the UI
            # parses; EvidenceRecord has no geometry field yet.
            lines.append(f"Position: {latitude:.4f}, {longitude:.4f}")
        if heading is not None:
            lines.append(f"Heading: {heading:.0f} deg")
        lines.append(f"Origin: {state[2]}")
        lines.append(f"Altitude: {state[7]}m")
        lines.append(f"Velocity: {state[9]}m/s")

        results.append({
            "title": f"Aircraft {callsign or state[0]}",
            "content": "\n".join(lines),
            "source_url": "https://opensky-network.org",
            "retrieved_at": datetime.now(UTC),
            "published_at": None,
            "query": "Sri Lanka region airspace",
            "source_name": "OpenSky Network",
        })
    return results
