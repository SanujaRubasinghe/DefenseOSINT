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


def extract_entity_name(text: str) -> str | None:
    """Longest run of 2-4 consecutive capitalised words in `text`, if any.

    Requiring the *whole* string to be a name (the previous behaviour) meant
    this practically never fired, because the planner writes descriptive
    queries like "Sri Lanka Air Force aircraft fleet" rather than bare proper
    nouns. Pulling the run out of the sentence is enough to look up — full NER
    is the Entity agent's job.
    """
    best: list[str] = []
    run: list[str] = []
    for raw in text.split():
        word = raw.strip(".,;:()[]\"'")
        if word[:1].isupper() and word.isalpha():
            run.append(word)
        else:
            if len(run) > len(best):
                best = run
            run = []
    if len(run) > len(best):
        best = run

    # A lone leading capital is just sentence case, not a name.
    if len(best) < 2:
        return None
    return " ".join(best[:4])


def looks_like_a_name(text: str) -> bool:
    """Kept for callers that only need the boolean."""
    return extract_entity_name(text) is not None
