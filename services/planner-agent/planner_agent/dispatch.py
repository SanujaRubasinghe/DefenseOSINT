from __future__ import annotations

import time

from defenseosint_common.a2a import A2AClient
from defenseosint_common.contracts import (
    CriticAssessment,
    EntityBundle,
    EvidenceBundle,
    IntelligenceDraft,
    InvestigationTask,
)

from .config import settings
from .models import Investigation

client = A2AClient(sender="planner-agent")


async def _call(
    inv: Investigation, url: str, recipient: str, skill: str, payload: dict
) -> dict | None:
    started = time.perf_counter()
    inv.a2a_calls += 1

    resp = await client.send(
        url=url,
        recipient=recipient,
        skill=skill,
        payload=payload,
        correlation_id=inv.investigation_id,
        token=settings.a2a_token or None,
    )
    ms = int((time.perf_counter() - started) * 1000)

    if not resp.ok:
        inv.log(recipient, skill, resp.error or "unknown error", ok=False, duration_ms=ms)
        return None

    inv.log(recipient, skill, "ok", duration_ms=ms)
    return resp.payload


async def collect(inv: Investigation, task: InvestigationTask) -> EvidenceBundle | None:
    payload = await _call(
        inv,
        settings.collector_url,
        "collector-agent",
        "collect",
        task.model_dump(mode="json"),
    )
    return EvidenceBundle.model_validate(payload) if payload else None


async def extract(inv: Investigation, bundle: EvidenceBundle) -> EntityBundle | None:
    payload = await _call(
        inv,
        settings.entity_url,
        "entity-agent",
        "extract",
        bundle.model_dump(mode="json"),
    )
    return EntityBundle.model_validate(payload) if payload else None


async def synthesize(
    inv: Investigation, evidence: EvidenceBundle, entities: EntityBundle, version: int
) -> IntelligenceDraft | None:
    payload = {
        "evidence": evidence.model_dump(mode="json"),
        "entities": entities.model_dump(mode="json"),
        "version": version,
        "objective": inv.objective,
    }
    # On a re-synthesis, tell the Analyst what the Critic objected to.
    if inv.assessments:
        payload["assessment"] = inv.assessments[-1].model_dump(mode="json")

    result = await _call(inv, settings.analyst_url, "analyst-agent", "synthesize", payload)
    return IntelligenceDraft.model_validate(result) if result else None


async def assess(
    inv: Investigation, draft: IntelligenceDraft, evidence: EvidenceBundle
) -> CriticAssessment | None:
    payload = await _call(
        inv,
        settings.critic_url,
        "critic-agent",
        "assess",
        {
            "draft": draft.model_dump(mode="json"),
            "evidence": evidence.model_dump(mode="json"),
            "iteration": inv.iteration,
        },
    )
    return CriticAssessment.model_validate(payload) if payload else None
