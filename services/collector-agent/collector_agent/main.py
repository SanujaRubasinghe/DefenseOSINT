"""collector-agent — retrieves public sources with provenance.

PHASE 3 STUB. Member 2 replaces run_collection() with real retrieval.
The response shape is final — build against it.
"""

from datetime import datetime, timezone

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.config import Settings
from defenseosint_common.contracts import (
    EvidenceBundle,
    EvidenceRecord,
    InvestigationTask,
    Provenance,
)
from fastapi import FastAPI

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
    now = datetime.now(timezone.utc)
    query = task.queries[0] if task.queries else task.objective

    return EvidenceBundle(
        investigation_id=task.investigation_id,
        task_id=task.task_id,
        queries_executed=task.queries or [task.objective],
        records=[
            EvidenceRecord(
                evidence_id=f"{task.task_id}_ev1",
                title="Organization X expands regional operations",
                content=(
                    "Organization X announced an expansion of its regional "
                    "operations in March 2025, according to a statement published "
                    "on its official website. The statement named Jane Doe as "
                    "programme director."
                ),
                relevance_score=0.86,
                provenance=Provenance(
                    source_name="Example News",
                    source_type="news",
                    source_url="https://example-news.org/organization-x-expansion",
                    retrieved_at=now,
                    collector="web",
                    query=query,
                ),
            ),
            EvidenceRecord(
                evidence_id=f"{task.task_id}_ev2",
                title="Organization X — official about page",
                content=(
                    "Organization X is headquartered in Riga and was founded in "
                    "2012. Its published leadership page lists Jane Doe and "
                    "Mikael Berg."
                ),
                relevance_score=0.72,
                provenance=Provenance(
                    source_name="organization-x.example",
                    source_type="web",
                    source_url="https://organization-x.example/about",
                    retrieved_at=now,
                    collector="web",
                    query=query,
                ),
            ),
        ],
    )
