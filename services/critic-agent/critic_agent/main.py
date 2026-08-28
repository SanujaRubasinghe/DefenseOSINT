"""critic-agent — evidence and claim verification.

PHASE 3 STUB. Member 4 replaces run_assessment().
Input payload: {"draft": IntelligenceDraft, "evidence": EvidenceBundle}

Note the stub deliberately FAILS on iteration 0 and PASSES afterwards, so the
Planner's re-planning loop (Phase 5) can be developed and demonstrated before
the real Critic exists.
"""

from defenseosint_common.a2a import A2AMessage, reply
from defenseosint_common.config import Settings
from defenseosint_common.contracts import (
    CriticAssessment,
    EvidenceBundle,
    Finding,
    IntelligenceDraft,
    Severity,
)
from fastapi import FastAPI

settings = Settings("critic-agent")
app = FastAPI(title="critic-agent")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "critic-agent"}


@app.post("/a2a/assess")
async def assess(msg: A2AMessage):
    draft = IntelligenceDraft.model_validate(msg.payload["draft"])
    evidence = EvidenceBundle.model_validate(msg.payload["evidence"])
    iteration = int(msg.payload.get("iteration", 0))
    result = await run_assessment(draft, evidence, iteration)
    return reply(msg, "critic-agent", result)


async def run_assessment(
    draft: IntelligenceDraft, evidence: EvidenceBundle, iteration: int
) -> CriticAssessment:
    cited = {eid for s in draft.sections for eid in s.evidence_ids}
    total = len(draft.sections) or 1
    covered = sum(1 for s in draft.sections if s.evidence_ids)
    coverage = covered / total

    if iteration == 0:
        return CriticAssessment(
            investigation_id=draft.investigation_id,
            passed=False,
            citation_coverage=coverage,
            requires_recollection=True,
            iteration=iteration,
            findings=[
                Finding(
                    kind="unsupported_claim",
                    severity=Severity.MAJOR,
                    description=(
                        "The March 2025 expansion is supported by a single source. "
                        "Independent corroboration is required."
                    ),
                    claim="Organization X announced a regional expansion in March 2025.",
                    evidence_ids=sorted(cited)[:1],
                    suggested_queries=[
                        "Organization X expansion March 2025 corroboration",
                        "Organization X regional operations announcement",
                    ],
                )
            ],
        )

    return CriticAssessment(
        investigation_id=draft.investigation_id,
        passed=True,
        citation_coverage=coverage,
        requires_recollection=False,
        iteration=iteration,
        findings=[],
    )
