# services/collector-agent/collector_agent/tools/satellite.py
from __future__ import annotations

from datetime import UTC, datetime

import httpx

CELESTRAK_API = "https://celestrak.org/NORAD/elements/gp.php"
TIMEOUT = 15


async def search_satellites(group: str = "military", max_results: int = 10) -> list[dict]:
    """Fetch orbital element data (TLE) for a satellite group from CelesTrak.
    Free, no key. Groups: 'military', 'gps-ops', 'weather', etc. This is orbital
    tracking data, not imagery — Sentinel-style imagery is out of scope."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(CELESTRAK_API, params={"GROUP": group, "FORMAT": "json"})
        data = resp.json()
    except Exception:
        return []

    results = []
    for sat in data[:max_results]:
        name = sat.get("OBJECT_NAME", "Unknown satellite")
        results.append({
            "title": name,
            "content": f"NORAD ID: {sat.get('NORAD_CAT_ID')}, epoch: {sat.get('EPOCH')}",
            "source_url": "https://celestrak.org",
            "retrieved_at": datetime.now(UTC),
            "published_at": None,
            "query": group,
            "source_name": "CelesTrak",
        })
    return results