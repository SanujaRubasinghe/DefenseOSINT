# services/collector-agent/collector_agent/tools/images.py
from __future__ import annotations

from datetime import UTC, datetime

import httpx

WIKI_REST_SEARCH = "https://en.wikipedia.org/w/rest.php/v1/search/page"
WIKI_SUMMARY_API = "https://en.wikipedia.org/api/rest_v1/page/summary"
TIMEOUT = 10

# Wikimedia's crawler-detection blocks the legacy action=query API on some
# networks (403 "robot policy"). The modern REST search endpoint avoids this.
# A descriptive User-Agent identifying the app/contact is still required.
HEADERS = {
    "User-Agent": (
        "DefenseOSINT-CollectorAgent/1.0 "
        "(https://github.com/SanujaRubasinghe/DefenseOSINT; student project IT3041)"
    )
}


async def get_entity_image(name: str) -> dict | None:
    """Look up a Wikipedia page for `name` and return its thumbnail + summary,
    if one exists. Good for named people, orgs, or places in a query."""
    title = await _find_best_title(name)
    if not title:
        return None
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
            resp = await client.get(f"{WIKI_SUMMARY_API}/{title}")
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception:
        return None

    thumbnail = data.get("thumbnail", {}).get("source")
    if not thumbnail:
        return None

    return {
        "title": data.get("title", name),
        "content": data.get("extract", ""),
        "image_url": thumbnail,
        "source_url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
        "retrieved_at": datetime.now(UTC),
        "published_at": None,
        "query": name,
        "source_name": "Wikipedia",
    }


async def _find_best_title(name: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
            resp = await client.get(WIKI_REST_SEARCH, params={"q": name, "limit": 1})
        if resp.status_code != 200:
            return None
        hits = resp.json().get("pages", [])
        if hits:
            return hits[0]["key"]  # REST API gives the URL-ready key directly
    except Exception:
        pass
    return None


def looks_like_a_name(text: str) -> bool:
    """Cheap heuristic: 2-4 consecutive capitalised words, no digits — good enough
    to trigger an image lookup without full NER (that's the Entity agent's job)."""
    words = text.split()
    cap_words = [w for w in words if w[:1].isupper() and w.isalpha()]
    return 1 < len(cap_words) <= 4 and len(cap_words) == len(words)
