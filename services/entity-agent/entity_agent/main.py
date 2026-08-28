"""entity-agent — NER, entity linking, relations.

PHASE 3 STUB. Member 3 replaces run_extraction().
"""

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.config import Settings
from defenseosint_common.contracts import (
    Entity,
    EntityBundle,
    EvidenceBundle,
    Relationship,
)
from fastapi import FastAPI

settings = Settings("entity-agent")
app = FastAPI(title="entity-agent")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "entity-agent"}


@app.post("/a2a/extract")
async def extract(msg: A2AMessage):
    bundle = EvidenceBundle.model_validate(msg.payload)
    result = await run_extraction(bundle)
    return reply(msg, "entity-agent", result)


async def run_extraction(bundle: EvidenceBundle) -> EntityBundle:
    ids = [r.evidence_id for r in bundle.records]
    return EntityBundle(
        investigation_id=bundle.investigation_id,
        entities=[
            Entity(
                canonical_id="org_organization_x",
                name="Organization X",
                type="ORG",
                aliases=["Org X"],
                confidence=0.91,
                evidence_ids=ids,
            ),
            Entity(
                canonical_id="per_jane_doe",
                name="Jane Doe",
                type="PERSON",
                confidence=0.78,
                evidence_ids=ids[:1],
            ),
            Entity(
                canonical_id="loc_riga",
                name="Riga",
                type="LOCATION",
                confidence=0.83,
                evidence_ids=ids[-1:],
            ),
        ],
        relationships=[
            Relationship(
                subject_id="per_jane_doe",
                predicate="works_for",
                object_id="org_organization_x",
                confidence=0.74,
                evidence_ids=ids[:1],
            ),
            Relationship(
                subject_id="org_organization_x",
                predicate="headquartered_in",
                object_id="loc_riga",
                confidence=0.80,
                evidence_ids=ids[-1:],
            ),
        ],
    )
