"""analyst-agent — evidence-grounded synthesis.

Input:  {"evidence": EvidenceBundle, "entities": EntityBundle,
         "version": int, "objective": str?, "assessment": CriticAssessment?}
Output: IntelligenceDraft
"""

import logging

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.contracts import (
    CriticAssessment,
    EntityBundle,
    EvidenceBundle,
)
from fastapi import FastAPI

from .config import settings
from .synthesize import synthesize

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("analyst-agent")

app = FastAPI(title="analyst-agent")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "analyst-agent",
        "model": settings.model,
        "llm_configured": bool(settings.openai_api_key),
    }


@app.post("/a2a/synthesize")
async def synthesize_endpoint(msg: A2AMessage):
    evidence = EvidenceBundle.model_validate(msg.payload["evidence"])

    entities = None
    if msg.payload.get("entities"):
        entities = EntityBundle.model_validate(msg.payload["entities"])

    assessment = None
    if msg.payload.get("assessment"):
        assessment = CriticAssessment.model_validate(msg.payload["assessment"])

    version = int(msg.payload.get("version", 1))
    objective = str(msg.payload.get("objective") or "Summarise the collected evidence.")

    draft = await synthesize(
        evidence=evidence,
        entities=entities,
        objective=objective,
        version=version,
        assessment=assessment,
    )

    log.info(
        "synthesised investigation=%s version=%s sections=%s confidence=%.2f",
        evidence.investigation_id,
        version,
        len(draft.sections),
        draft.overall_confidence,
    )
    return reply(msg, "analyst-agent", draft)
