# services/collector-agent/collector_agent/tools/tavily_search.py
from __future__ import annotations

import os
from datetime import UTC, datetime

import httpx

TAVILY_API = "https://api.tavily.com/search"
TIMEOUT = 15


async def search_tavily(query: str, max_results: int = 8) -> list[dict]:
    """AI-native search via Tavily — cleaner results than raw DDG scraping.
    Requires TAVILY_API_KEY in .env (free tier: 1000 requests/month)."""
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return []

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(TAVILY_API, json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "include_answer": False,
            })
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("results", []):
        results.append({
            "title": item.get("title", ""),
            "content": item.get("content", "")[:4000],
            "source_url": item.get("url", ""),
            "retrieved_at": datetime.now(UTC),
            "published_at": None,
            "query": query,
            "source_name": "Tavily",
        })
    return results