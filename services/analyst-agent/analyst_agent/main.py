"""analyst-agent — evidence-grounded synthesis.

PHASE 3 STUB. Member 1 replaces run_synthesis() later.
Input payload: {"evidence": EvidenceBundle, "entities": EntityBundle}
"""

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.config import Settings
from defenseosint_common.contracts import (
    DraftSection,
    EntityBundle,
    EvidenceBundle,
    IntelligenceDraft,
)
from fastapi import FastAPI

settings = Settings("analyst-agent")
app = FastAPI(title="analyst-agent")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "analyst-agent"}


@app.post("/a2a/synthesize")
async def synthesize(msg: A2AMessage):
    evidence = EvidenceBundle.model_validate(msg.payload["evidence"])
    entities = EntityBundle.model_validate(msg.payload["entities"])
    version = int(msg.payload.get("version", 1))
    draft = await run_synthesis(evidence, entities, version)
    return reply(msg, "analyst-agent", draft)


async def run_synthesis(
    evidence: EvidenceBundle, entities: EntityBundle, version: int = 1
) -> IntelligenceDraft:
    ids = [r.evidence_id for r in evidence.records]
    names = ", ".join(e.name for e in entities.entities[:3]) or "no entities"

    return IntelligenceDraft(
        investigation_id=evidence.investigation_id,
        title="Intelligence brief (stub)",
        executive_summary=(
            f"Based on {len(evidence.records)} sources, the principal entities "
            f"identified are {names}. This is stub output."
        ),
        version=version,
        overall_confidence=0.65,
        sections=[
            DraftSection(
                heading="Key findings",
                body="Organization X announced a regional expansion in March 2025.",
                evidence_ids=ids[:1],
                confidence=0.8,
                caveats=["Single-source claim; not yet corroborated."],
            ),
            DraftSection(
                heading="Organisational background",
                body="Organization X is headquartered in Riga and was founded in 2012.",
                evidence_ids=ids[-1:],
                confidence=0.7,
                caveats=[],
            ),
        ],
    )
