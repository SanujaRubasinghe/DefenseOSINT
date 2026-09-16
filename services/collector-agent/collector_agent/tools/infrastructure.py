# services/collector-agent/collector_agent/tools/infrastructure.py
from __future__ import annotations

import os
from datetime import UTC, datetime


async def search_infrastructure(query: str, max_results: int = 10) -> list[dict]:
    """Search Shodan for internet-exposed devices/infrastructure related to the
    query (e.g. an organisation name, 'org:"Sri Lanka Air Force"'). Requires
    SHODAN_API_KEY in .env. Public banner-metadata only — no exploitation,
    scanning, or unauthorized access performed. Free tier has limited query
    credits, so an empty result here is a normal, expected outcome."""
    api_key = os.getenv("SHODAN_API_KEY")
    if not api_key:
        return []

    try:
        import shodan
        api = shodan.Shodan(api_key)
        raw = api.search(query)
    except Exception:
        return []

    results = []
    for match in raw.get("matches", [])[:max_results]:
        ip = match.get("ip_str", "")
        org = match.get("org") or "Unknown"
        port = match.get("port", "")
        vulns = list(match.get("vulns", {}).keys())
        location = match.get("location", {})

        content_lines = [
            f"Organization: {org}",
            f"Port: {port} ({match.get('transport', 'tcp')})",
            f"Product: {match.get('product', 'unknown')} {match.get('version', '')}",
            f"Location: {location.get('city', '')}, {location.get('country_name', '')}",
        ]
        if vulns:
            content_lines.append(f"Known CVEs: {', '.join(vulns[:10])}")
        content_lines.append((match.get("data", "") or "")[:500])

        results.append({
            "title": f"{org} — {ip}:{port}",
            "content": "\n".join(content_lines),
            "source_url": f"https://www.shodan.io/host/{ip}",
            "retrieved_at": datetime.now(UTC),
            "published_at": None,
            "query": query,
            "source_name": "Shodan",
        })
    return results
