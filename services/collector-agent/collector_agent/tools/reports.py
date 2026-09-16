# services/collector-agent/collector_agent/tools/reports.py
from __future__ import annotations

import re
from datetime import UTC, datetime

import httpx

RELIEFWEB_API = "https://api.reliefweb.int/v1/reports"
APP_NAME = "defenseosint-collector"  # ReliefWeb requires an app identifier, any string works
TIMEOUT = 15


async def search_reports(query: str, max_records: int = 10) -> list[dict]:
    """Search UN OCHA ReliefWeb for humanitarian/situation reports. Free, no key."""
    params = {
        "appname": APP_NAME,
        "query[value]": query,
        "query[operator]": "AND",
        "limit": max_records,
        "fields[include][]": ["title", "body-html", "url", "date.created", "source"],
        "sort[]": "date.created:desc",
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(RELIEFWEB_API, params=params)
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("data", []):
        fields = item.get("fields", {})
        url = fields.get("url", "")
        if not url:
            continue
        source_names = [s.get("name") for s in fields.get("source", []) if s.get("name")]
        results.append({
            "title": fields.get("title", ""),
            "content": _strip_html(fields.get("body-html", "") or "")[:4000],
            "source_url": url,
            "retrieved_at": datetime.now(UTC),
            "published_at": _parse_iso(fields.get("date", {}).get("created")),
            "query": query,
            "source_name": ", ".join(source_names) or "ReliefWeb",
        })
    return results


def _parse_iso(raw: str | None):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)