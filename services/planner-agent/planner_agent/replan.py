from __future__ import annotations

from defenseosint_common.contracts import (
    CriticAssessment,
    InvestigationTask,
    Severity,
    TaskType,
)

from .models import Investigation, new_id

ACTIONABLE = {Severity.MAJOR, Severity.CRITICAL}
MAX_NEW_TASKS = 3


def replan(inv: Investigation, assessment: CriticAssessment) -> list[InvestigationTask]:
    seen_queries = {q.lower() for t in inv.tasks for q in t.task.queries}
    tasks: list[InvestigationTask] = []

    for finding in assessment.findings:
        if finding.severity not in ACTIONABLE:
            continue
        if len(tasks) >= MAX_NEW_TASKS:
            break

        # Prefer the Critic's own suggestions; fall back to the claim text.
        queries = [q for q in finding.suggested_queries if q.lower() not in seen_queries][:2]
        if not queries and finding.claim:
            queries = [finding.claim[:200]]
        if not queries:
            continue

        seen_queries.update(q.lower() for q in queries)

        tasks.append(
            InvestigationTask(
                investigation_id=inv.investigation_id,
                task_id=new_id("task"),
                type=TaskType.VERIFY,
                objective=f"Verify: {finding.description[:300]}",
                queries=queries,
                priority=1 if finding.severity == Severity.CRITICAL else 2,
                max_sources=10,
                expected_output="Independent corroborating or contradicting sources",
            )
        )

    return tasks
