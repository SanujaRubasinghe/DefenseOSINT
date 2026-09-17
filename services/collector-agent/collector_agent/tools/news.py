# services/collector-agent/collector_agent/tools/news.py
from __future__ import annotations

import asyncio
import calendar
from datetime import UTC, datetime

import feedparser
import httpx

# Reuters retired its public RSS endpoints, so feeds.reuters.com fails on every
# call. These four are verified reachable and key-free.
RSS_FEEDS = {
    "BBC World": "https://feeds.bbci.co.uk/news/world/rss.xml",
    "BBC Asia": "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "UN News": "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
}

TIMEOUT = 8  # seconds — don't let one slow feed block the whole request


async def search_news(query: str, max_records: int = 20) -> list[dict]:
    """Match a query against recent headlines from a few free world-news feeds.

    These are general feeds, not a search API: a hit only happens when the
    query terms appear in a current headline, so an empty result is normal for
    a specific OSINT query.
    """
    terms = [t for t in query.lower().split() if len(t) > 2]
    if not terms:
        return []

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        fetched = await asyncio.gather(
            *(client.get(url) for url in RSS_FEEDS.values()),
            return_exceptions=True,
        )

    results: list[dict] = []
    for (source_name, feed_url), resp in zip(RSS_FEEDS.items(), fetched, strict=True):
        if isinstance(resp, BaseException):
            continue
        # feedparser works on the bytes we already fetched — no second request.
        # Parsing a large feed is CPU-bound, so keep it off the event loop:
        # inline it blocks every other tool and concurrent collect task.
        feed = await asyncio.to_thread(feedparser.parse, resp.content)

        for entry in feed.entries:
            title = entry.get("title", "")
            summary = entry.get("summary", "")
            haystack = f"{title} {summary}".lower()
            if not any(term in haystack for term in terms):
                continue

            results.append({
                "title": title,
                "content": summary or title,
                "source_url": entry.get("link", ""),
                "retrieved_at": datetime.now(UTC),
                "published_at": _entry_published(entry),
                "query": query,
                "source_name": source_name,
            })

    return results[:max_records]


def _entry_published(entry) -> datetime | None:
    """feedparser hands back a UTC struct_time; calendar.timegm reads it as UTC
    (time.mktime would wrongly treat it as local time)."""
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    try:
        return datetime.fromtimestamp(calendar.timegm(parsed), tz=UTC)
    except Exception:
        return None
