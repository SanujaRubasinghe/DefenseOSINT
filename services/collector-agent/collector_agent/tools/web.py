# services/collector-agent/collector_agent/tools/web.py
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS
from datasketch import MinHash, MinHashLSH

MAX_RESULTS = 20
MAX_PAGES = 8
TIMEOUT = 15
LSH_THRESHOLD = 0.7
NUM_PERM = 128


async def search_and_fetch(query: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """Search the web for `query`, fetch the top pages, dedupe near-identical
    content, and return plain dicts (no contract objects here — main.py maps
    these to EvidenceRecord)."""
    urls = _ddg_search(query, max_pages)
    pages = await _fetch_pages(urls, query)
    return _deduplicate(pages)


def _ddg_search(query: str, max_pages: int) -> list[str]:
    urls: list[str] = []
    try:
        with DDGS() as ddg:
            for r in ddg.text(query, max_results=MAX_RESULTS):
                urls.append(r["href"])
    except Exception:
        # Rule: degrade, never crash — an empty result list is a valid outcome
        pass
    return urls[:max_pages]


async def _fetch_pages(urls: list[str], query: str) -> list[dict]:
    async with httpx.AsyncClient(
        timeout=TIMEOUT, follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0"},
    ) as client:
        tasks = [_fetch_one(client, url, query) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]


async def _fetch_one(client: httpx.AsyncClient, url: str, query: str) -> dict | None:
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        title = soup.title.string.strip() if soup.title else ""
        body = " ".join(soup.get_text(" ", strip=True).split())[:4000]
        return {
            "title": title,
            "content": body,
            "source_url": str(resp.url),
            "retrieved_at": datetime.now(timezone.utc),
            "query": query,
        }
    except Exception:
        return None


def _deduplicate(pages: list[dict]) -> list[dict]:
    lsh = MinHashLSH(threshold=LSH_THRESHOLD, num_perm=NUM_PERM)
    seen_urls: set[str] = set()
    unique: list[dict] = []
    for i, p in enumerate(pages):
        if p["source_url"] in seen_urls:
            continue
        m = MinHash(num_perm=NUM_PERM)
        for word in p["content"].split():
            m.update(word.encode("utf-8"))
        try:
            if not lsh.query(m):
                lsh.insert(str(i), m)
                seen_urls.add(p["source_url"])
                unique.append(p)
        except Exception:
            unique.append(p)
    return unique