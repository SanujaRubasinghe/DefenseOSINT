# services/collector-agent/collector_agent/tools/conflict.py
from __future__ import annotations

import os
import time
from datetime import UTC, datetime

import httpx

TOKEN_URL = "https://acleddata.com/oauth/token"
API_URL = "https://acleddata.com/api/acled/read"
TIMEOUT = 15

# Cache the token in memory so we don't log in on every single request —
# it's valid for 24 hours.
_token_cache = {"access_token": None, "expires_at": 0}


async def search_conflict_events(country: str, max_records: int = 20) -> list[dict]:
    """Search ACLED for reported political-violence/conflict events for a country.
    Requires ACLED_EMAIL + ACLED_PASSWORD in .env (ACLED uses OAuth, not a static
    API key). Filter by country name, not free text — ACLED is structured data."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        token = await _get_access_token(client)
        if not token:
            return []  # no credentials configured, or login failed — degrade, don't crash

        params = {"_format": "json", "country": country, "limit": max_records}
        try:
            resp = await client.get(
                API_URL, params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

    results = []
    for item in data.get("data", []):
        results.append({
            "title": f"{item.get('event_type', 'Event')} — {item.get('location', '')}",
            "content": item.get("notes", ""),
            "source_url": "https://acleddata.com",
            "retrieved_at": datetime.now(UTC),
            "published_at": _parse_date(item.get("event_date")),
            "query": country,
            "source_name": item.get("source", "ACLED"),
        })
    return results


async def _get_access_token(client: httpx.AsyncClient) -> str | None:
    now = time.time()
    if _token_cache["access_token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    username = os.getenv("ACLED_EMAIL")
    password = os.getenv("ACLED_PASSWORD")
    if not username or not password:
        return None

    try:
        resp = await client.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "username": username,
                "password": password,
                "grant_type": "password",
                "client_id": "acled",
                "scope": "authenticated",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None

    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 86400)
    return _token_cache["access_token"]


def _parse_date(raw: str | None):
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=UTC)
    except Exception:
        return None