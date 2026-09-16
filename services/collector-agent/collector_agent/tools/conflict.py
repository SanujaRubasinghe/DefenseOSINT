# services/collector-agent/collector_agent/tools/conflict.py
from __future__ import annotations

import os
import re
import time
from datetime import UTC, datetime

import httpx

TOKEN_URL = "https://acleddata.com/oauth/token"
API_URL = "https://acleddata.com/api/acled/read"
TIMEOUT = 15

# ACLED filters on a structured country field, so it has to be given a country
# name — passing an investigation's free-text query returns nothing. Countries
# with ACLED coverage, longest first so "South Sudan" wins over "Sudan".
COUNTRIES = sorted(
    {
        "Afghanistan", "Albania", "Algeria", "Angola", "Argentina", "Armenia", "Australia",
        "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Benin", "Bolivia",
        "Bosnia and Herzegovina", "Brazil", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia",
        "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia",
        "Democratic Republic of Congo", "Republic of Congo", "Costa Rica", "Croatia", "Cuba",
        "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominican Republic", "Ecuador",
        "Egypt", "El Salvador", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Finland",
        "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala",
        "Guinea", "Guinea-Bissau", "Haiti", "Honduras", "Hungary", "India", "Indonesia",
        "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan",
        "Jordan", "Kazakhstan", "Kenya", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia",
        "Lebanon", "Lesotho", "Liberia", "Libya", "Lithuania", "Madagascar", "Malawi",
        "Malaysia", "Mali", "Mauritania", "Mexico", "Moldova", "Mongolia", "Montenegro",
        "Morocco", "Mozambique", "Myanmar", "Namibia", "Nepal", "Netherlands", "New Zealand",
        "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
        "Pakistan", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
        "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
        "Saudi Arabia", "Senegal", "Serbia", "Sierra Leone", "Singapore", "Slovakia",
        "Slovenia", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain",
        "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
        "Tanzania", "Thailand", "Togo", "Tunisia", "Turkey", "Turkmenistan", "Uganda",
        "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
        "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
    },
    key=len,
    reverse=True,
)


def find_country(text: str) -> str | None:
    """First ACLED-covered country named in `text`, or None."""
    lowered = text.lower()
    for country in COUNTRIES:
        if re.search(rf"\b{re.escape(country.lower())}\b", lowered):
            return country
    return None

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