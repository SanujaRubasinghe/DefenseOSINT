# services/collector-agent/collector_agent/tools/news.py
from __future__ import annotations

from datetime import datetime, timezone

import httpx
import feedparser

RSS_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.reuters.com/reuters/worldNews",
]

TIMEOUT = 8  # seconds — don't let one slow feed block the whole request


async def search_news(query: str, days_back: int = 90, max_records: int = 20) -> list[dict]:
    q_terms = [t for t in query.lower().split() if t]
    results = []

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for feed_url in RSS_FEEDS:
            try:
                resp = await client.get(feed_url)
                feed = feedparser.parse(resp.content)  # parse from bytes, no network call here
            except Exception:
                continue

            for entry in feed.entries:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                content_lower = (title + " " + summary).lower()

                if any(term in content_lower for term in q_terms):
                    results.append({
                        "title": title,
                        "content": summary or title,
                        "source_url": entry.get("link", ""),
                        "retrieved_at": datetime.now(timezone.utc),
                        "published_at": None,
                        "query": query,
                        "source_name": feed_url,
                    })

    return results[:max_records]