# services/collector-agent/collector_agent/main.py
"""collector-agent — retrieves public sources with provenance."""

import asyncio
import hashlib
import logging
import re
from datetime import UTC, datetime

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.config import Settings
from defenseosint_common.contracts import (
    EvidenceBundle,
    EvidenceRecord,
    InvestigationTask,
    Provenance,
)
from fastapi import FastAPI

from collector_agent.tools.aviation import search_aircraft
from collector_agent.tools.conflict import find_country, search_conflict_events
from collector_agent.tools.images import extract_entity_name, get_entity_image
from collector_agent.tools.infrastructure import search_infrastructure
from collector_agent.tools.news import search_news
from collector_agent.tools.reports import search_reports
from collector_agent.tools.satellite import search_satellites
from collector_agent.tools.tavily_search import search_tavily
from collector_agent.tools.web import search_and_fetch

settings = Settings("collector-agent")

app = FastAPI(title="collector-agent")
logger = logging.getLogger(__name__)

# OpenSky and CelesTrak are structured feeds that are not keyed on the query
# text — they return the same rows whatever the objective is. Running them on
# every task floods the bundle (they were 43% of records on an unrelated run),
# so they only run when the investigation is actually about their domain.
AVIATION_TERMS = frozenset({
    "aircraft", "airspace", "air force", "airforce", "airport", "aviation",
    "drone", "flight", "helicopter", "runway", "uav",
})
SATELLITE_TERMS = frozenset({
    "constellation", "norad", "orbit", "orbital", "satellite", "space", "tle",
})
# Tools that return general web pages, so the same URL can arrive twice.
TEXT_SEARCH_TAGS = frozenset({"web", "tavily"})
# CelesTrak group names, checked in order.
SATELLITE_GROUPS = (
    ("gps", "gps-ops"),
    ("navigation", "gps-ops"),
    ("weather", "weather"),
    ("military", "military"),
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "collector-agent"}


@app.post("/a2a/collect")
async def collect(msg: A2AMessage):
    task = InvestigationTask.model_validate(msg.payload)
    bundle = await run_collection(task)
    return reply(msg, "collector-agent", bundle)


async def run_collection(task: InvestigationTask) -> EvidenceBundle:
    """Collect evidence from web, news, humanitarian reports, conflict data,
    aviation, satellite, infrastructure, and (when the query looks like a
    named entity) an image lookup."""
    query = task.queries[0] if task.queries else task.objective
    max_pages = min(task.max_sources, 8)
    # Gate on the objective plus every query, not just the one we search with,
    # so a narrow sub-query cannot hide the investigation's actual domain.
    scope = " ".join([task.objective, *task.queries])

    # (source_type, collector_tag, coroutine)
    jobs: list[tuple[str, str, object]] = [
        ("web", "web", search_and_fetch(query, max_pages=max_pages)),
        ("news", "news", search_news(query)),
        ("report", "reports", search_reports(query)),
        ("web", "tavily", search_tavily(query)),
        ("infrastructure", "shodan", search_infrastructure(query)),
    ]
    # ACLED filters on a structured country field, so it is only worth calling
    # when the investigation actually names a country it covers.
    country = find_country(scope)
    if country:
        jobs.append(("conflict", "conflict", search_conflict_events(country)))
    if _mentions(scope, AVIATION_TERMS):
        jobs.append(("aviation", "opensky", search_aircraft()))
    if _mentions(scope, SATELLITE_TERMS):
        jobs.append(("satellite", "celestrak", search_satellites(_satellite_group(scope))))
    # Look up imagery for the proper noun inside the query, not the whole
    # sentence — planner queries are descriptive, so the name is embedded.
    entity_name = extract_entity_name(query) or extract_entity_name(task.objective)
    if entity_name:
        jobs.append(("image", "image", get_entity_image(entity_name)))

    # Every tool is an independent network call, so run them together. In
    # series the slowest task measured 26.8s against the planner's 60s A2A
    # timeout, which left too little headroom once the keyed APIs return data.
    results = await asyncio.gather(*(job[2] for job in jobs), return_exceptions=True)

    records: list[EvidenceRecord] = []
    # DDG-and-fetch and Tavily regularly return the same page with different
    # extractions, which the evidence_id hash cannot collapse because the text
    # differs. Keep one record per URL across the two, preferring whichever
    # pulled more text. Structured feeds are exempt: one CelesTrak or OpenSky
    # URL legitimately yields many distinct rows.
    text_search: dict[str, tuple[str, str, dict]] = {}

    for (source_type, collector_tag, _), result in zip(jobs, results, strict=True):
        if isinstance(result, BaseException):
            logger.warning("collector tool %s failed: %s", collector_tag, result)
            continue
        if collector_tag == "image":
            if result:
                records.append(_image_to_evidence_record(result))
            continue
        for page in result:
            url = page.get("source_url", "")
            if collector_tag in TEXT_SEARCH_TAGS and url:
                held = text_search.get(url)
                if held is None or len(page.get("content", "")) > len(held[2].get("content", "")):
                    text_search[url] = (source_type, collector_tag, page)
                continue
            _append(records, page, source_type, collector_tag)

    for source_type, collector_tag, page in text_search.values():
        _append(records, page, source_type, collector_tag)

    return EvidenceBundle(
        investigation_id=task.investigation_id,
        task_id=task.task_id,
        records=records,
        queries_executed=[query],
    )


def _mentions(text: str, terms: frozenset[str]) -> bool:
    """Whole-word match, tolerating a plural. Substring matching misfires badly
    here — plain `in` fires the satellite feed on "airspace" because it
    contains "space" — while a strict word boundary misses "satellites"."""
    lowered = text.lower()
    return any(re.search(rf"\b{re.escape(term)}s?\b", lowered) for term in terms)


def _satellite_group(scope: str) -> str:
    lowered = scope.lower()
    for keyword, group in SATELLITE_GROUPS:
        if keyword in lowered:
            return group
    return "military"


def _evidence_id(source_url: str, content: str) -> str:
    """Stable id for the same material.

    The planner dedups incoming evidence on evidence_id, so a random id per
    record meant five parallel collect tasks kept five copies of every shared
    page. Keying on the URL plus the head of the content collapses those while
    still separating rows that legitimately share a URL (one CelesTrak or
    OpenSky endpoint yields many distinct objects). retrieved_at is
    deliberately excluded — including it would defeat the whole point.
    """
    digest = hashlib.sha1(f"{source_url}\n{content[:500]}".encode()).hexdigest()
    return f"ev_{digest[:16]}"


def _append(
    records: list[EvidenceRecord], page: dict, source_type: str, collector_tag: str
) -> None:
    record = _to_evidence_record(page, source_type=source_type, collector_tag=collector_tag)
    if record is not None:
        records.append(record)


def _to_evidence_record(page: dict, source_type: str, collector_tag: str) -> EvidenceRecord | None:
    url = page.get("source_url", "")
    if not url:
        return None
    query = page.get("query", "")
    content = page.get("content", "")
    return EvidenceRecord(
        evidence_id=_evidence_id(url, content),
        title=page.get("title") or "Untitled",
        content=content,
        relevance_score=_relevance_score(query, content),
        provenance=Provenance(
            source_name=page.get("source_name") or page.get("title") or url,
            source_type=source_type,
            source_url=url,
            retrieved_at=page.get("retrieved_at") or datetime.now(UTC),
            published_at=page.get("published_at"),
            collector=f"collector-agent:{collector_tag}",
            query=query,
        ),
    )


def _image_to_evidence_record(image: dict) -> EvidenceRecord:
    # Interim: embed the image URL in content until the team adds a proper
    # image_url field to EvidenceRecord (see note in the PR description).
    content = f"{image['content']}\n\n[Image: {image['image_url']}]"
    source_url = image.get("source_url") or image["image_url"]
    return EvidenceRecord(
        evidence_id=_evidence_id(source_url, content),
        title=image["title"],
        content=content,
        relevance_score=1.0,
        provenance=Provenance(
            source_name=image.get("source_name", "Wikipedia"),
            source_type="image",
            source_url=source_url,
            retrieved_at=image.get("retrieved_at") or datetime.now(UTC),
            published_at=image.get("published_at"),
            collector="collector-agent:image",
            query=image.get("query", ""),
        ),
    )


def _relevance_score(query: str, content: str) -> float:
    if not content:
        return 0.0
    query_terms = set(re.findall(r"\w+", query.lower()))
    if not query_terms:
        return 0.0
    content_lower = content.lower()
    matched = sum(1 for term in query_terms if term in content_lower)
    return round(matched / len(query_terms), 2)
