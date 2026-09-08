# """collector-agent — retrieves public sources with provenance."""

# from datetime import datetime, timezone

# from defenseosint_common.a2a import A2AMessage, reply
# from defenseosint_common.config import Settings
# from defenseosint_common.contracts import (
#     EvidenceBundle,
#     EvidenceRecord,
#     InvestigationTask,
#     Provenance,
# )
# from fastapi import FastAPI

# from collector_agent.tools.web import WebCollector


# settings = Settings("collector-agent")

# app = FastAPI(title="collector-agent")

# web_collector = WebCollector()


# @app.get("/health")
# async def health():
#     return {
#         "status": "ok",
#         "service": "collector-agent",
#     }


# @app.post("/a2a/collect")
# async def collect(msg: A2AMessage):
#     task = InvestigationTask.model_validate(msg.payload)

#     bundle = await run_collection(task)

#     return reply(
#         msg,
#         "collector-agent",
#         bundle,
#     )


# async def run_collection(task: InvestigationTask) -> EvidenceBundle:
#     """Collect evidence from the public web."""

#     # Use the first query provided by the Planner.
#     # If no query exists, use the investigation objective.
#     query = task.queries[0] if task.queries else task.objective

#     # Respect the source budget from InvestigationTask.
#     max_results = min(task.max_sources, 20)

#     search_results = await web_collector.search(
#         query=query,
#         max_results=max_results,
#     )

#     records: list[EvidenceRecord] = []

#     for index, result in enumerate(search_results, start=1):
#         url = result.get("url", "")

#         # Ignore results without a URL.
#         if not url:
#             continue

#         records.append(
#             EvidenceRecord(
#                 evidence_id=f"{task.task_id}_ev{index}",
#                 title=result.get("title", "Untitled"),
#                 content=result.get("snippet", ""),
#                 relevance_score=0.0,
#                 provenance=Provenance(
#                     source_name=result.get("source", "duckduckgo"),
#                     source_type="web",
#                     source_url=url,
#                     retrieved_at=datetime.now(timezone.utc),
#                     collector="web",
#                     query=query,
#                 ),
#             )
#         )

#     return EvidenceBundle(
#         investigation_id=task.investigation_id,
#         task_id=task.task_id,
#         records=records,
#         queries_executed=[query],
#     )







# services/collector-agent/collector_agent/main.py
import uuid

from fastapi import FastAPI
from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.contracts import (
    InvestigationTask, EvidenceBundle, EvidenceRecord, Provenance,
)

from .tools.web import search_and_fetch

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "collector-agent"}


@app.post("/a2a/collect")
async def collect(msg: A2AMessage):
    task = InvestigationTask.model_validate(msg.payload)
    bundle = await run_collection(task)
    return reply(msg, "collector-agent", bundle)


async def run_collection(task: InvestigationTask) -> EvidenceBundle:
    query = task.queries[0] if task.queries else task.objective

    raw_pages = await search_and_fetch(query, max_pages=min(task.max_sources, 8))

    records = [
        EvidenceRecord(
            evidence_id=str(uuid.uuid4()),
            title=page["title"] or None,
            content=page["content"],
            provenance=Provenance(
                source_name=page["title"] or page["source_url"],
                source_type="web",
                source_url=page["source_url"],
                retrieved_at=page["retrieved_at"],
                collector="collector-agent:web",
                query=query,
            ),
            relevance_score=0.5,  # first pass: flat score, refine later
        )
        for page in raw_pages
    ]

    return EvidenceBundle(
        investigation_id=task.investigation_id,
        task_id=task.task_id,
        records=records,
        queries_executed=[query],
    )