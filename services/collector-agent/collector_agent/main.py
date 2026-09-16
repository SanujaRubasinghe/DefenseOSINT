# services/collector-agent/collector_agent/main.py
"""collector-agent — retrieves public sources with provenance."""

import re
import uuid

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
from collector_agent.tools.conflict import search_conflict_events
from collector_agent.tools.images import get_entity_image, looks_like_a_name
from collector_agent.tools.infrastructure import search_infrastructure
from collector_agent.tools.news import search_news
from collector_agent.tools.reports import search_reports
from collector_agent.tools.satellite import search_satellites
from collector_agent.tools.tavily_search import search_tavily
from collector_agent.tools.web import search_and_fetch

settings = Settings("collector-agent")

app = FastAPI(title="collector-agent")


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

    web_pages = await search_and_fetch(query, max_pages=max_pages)
    news_pages = await search_news(query)
    report_pages = await search_reports(query)
    conflict_pages = await search_conflict_events(query)
    tavily_pages = await search_tavily(query)
    infra_pages = await search_infrastructure(query)
    aircraft_pages = await search_aircraft()
    satellite_pages = await search_satellites()

    records: list[EvidenceRecord] = []
    for page in web_pages:
        _append(records, page, "web", "web")
    for page in news_pages:
        _append(records, page, "news", "news")
    for page in report_pages:
        _append(records, page, "report", "reports")
    for page in conflict_pages:
        _append(records, page, "conflict", "conflict")
    for page in tavily_pages:
        _append(records, page, "web", "tavily")
    for page in infra_pages:
        _append(records, page, "infrastructure", "shodan")
    for page in aircraft_pages:
        _append(records, page, "aviation", "opensky")
    for page in satellite_pages:
        _append(records, page, "satellite", "celestrak")

    if looks_like_a_name(query):
        image = await get_entity_image(query)
        if image:
            records.append(_image_to_evidence_record(image))

    return EvidenceBundle(
        investigation_id=task.investigation_id,
        task_id=task.task_id,
        records=records,
        queries_executed=[query],
    )


def _append(records: list[EvidenceRecord], page: dict, source_type: str, collector_tag: str) -> None:
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
        evidence_id=str(uuid.uuid4()),
        title=page.get("title") or "Untitled",
        content=content,
        relevance_score=_relevance_score(query, content),
        provenance=Provenance(
            source_name=page.get("source_name") or page.get("title") or url,
            source_type=source_type,
            source_url=url,
            retrieved_at=page["retrieved_at"],
            published_at=page.get("published_at"),
            collector=f"collector-agent:{collector_tag}",
            query=query,
        ),
    )


def _image_to_evidence_record(image: dict) -> EvidenceRecord:
    # Interim: embed the image URL in content until the team adds a proper
    # image_url field to EvidenceRecord (see note in the PR description).
    content = f"{image['content']}\n\n[Image: {image['image_url']}]"
    return EvidenceRecord(
        evidence_id=str(uuid.uuid4()),
        title=image["title"],
        content=content,
        relevance_score=1.0,
        provenance=Provenance(
            source_name=image.get("source_name", "Wikipedia"),
            source_type="image",
            source_url=image.get("source_url") or image["image_url"],
            retrieved_at=image["retrieved_at"],
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