# currently written as a plain async function. after the system is stable switch to LangGraph
from __future__ import annotations

import asyncio

from defenseosint_common.contracts import EvidenceBundle, TaskStatus, TaskType

from . import dispatch
from .budget import Budget
from .decompose import decompose
from .models import Investigation, InvestigationStatus, TaskRecord
from .replan import replan
from .store import store


def _merge_bundle(inv: Investigation) -> EvidenceBundle:
    """One bundle holding everything collected so far, for the Analyst and Critic."""
    return EvidenceBundle(
        investigation_id=inv.investigation_id,
        task_id="merged",
        records=inv.evidence,
        queries_executed=[q for t in inv.tasks for q in t.task.queries],
    )


async def _run_collection(inv: Investigation) -> None:
    """Dispatch all pending collection tasks concurrently."""
    pending = [t for t in inv.pending() if t.task.type in (TaskType.COLLECT, TaskType.VERIFY)]
    if not pending:
        return

    for record in pending:
        record.status = TaskStatus.RUNNING
        record.attempts += 1

    results = await asyncio.gather(
        *(dispatch.collect(inv, r.task) for r in pending), return_exceptions=True
    )

    for record, result in zip(pending, results, strict=True):
        if isinstance(result, BaseException) or result is None:
            record.status = TaskStatus.FAILED
            record.error = str(result) if result else "peer unavailable"
            continue
        added = inv.add_evidence(result.records)
        record.evidence_count = added
        record.status = TaskStatus.COMPLETE

    inv.log("planner-agent", "collection_complete", f"{len(inv.evidence)} evidence records held")


async def run_investigation(investigation_id: str) -> None:
    """Entry point, run as a background task from the API."""
    inv = await store.get(investigation_id)
    if inv is None:
        return

    budget = Budget()
    inv.status = InvestigationStatus.RUNNING

    try:
        # plan
        tasks = await decompose(inv)
        inv.tasks = [TaskRecord(task=t) for t in tasks]
        inv.log("planner-agent", "plan_created", f"{len(inv.tasks)} tasks")
        await store.save(inv)

        # iterate
        while True:
            stop = budget.exceeded(inv)
            if stop:
                inv.stopped_reason = stop
                inv.status = InvestigationStatus.INSUFFICIENT
                inv.log("planner-agent", "stopped", stop, ok=False)
                break

            await _run_collection(inv)
            await store.save(inv)

            if not inv.evidence:
                inv.stopped_reason = "no evidence could be collected"
                inv.status = InvestigationStatus.INSUFFICIENT
                inv.log("planner-agent", "stopped", inv.stopped_reason, ok=False)
                break

            merged = _merge_bundle(inv)

            entities = await dispatch.extract(inv, merged)
            if entities is None:
                inv.stopped_reason = "entity extraction unavailable"
                inv.status = InvestigationStatus.FAILED
                break
            inv.entities = entities
            await store.save(inv)

            draft = await dispatch.synthesize(inv, merged, entities, version=inv.iteration + 1)
            if draft is None:
                inv.stopped_reason = "analyst unavailable"
                inv.status = InvestigationStatus.FAILED
                break
            inv.draft = draft
            await store.save(inv)

            assessment = await dispatch.assess(inv, draft, merged)
            if assessment is None:
                # Critic down: finish, but say the draft is unverified.
                inv.stopped_reason = "critic unavailable — draft not verified"
                inv.status = InvestigationStatus.COMPLETE
                inv.log("planner-agent", "finished_unverified", inv.stopped_reason, ok=False)
                break

            inv.assessments.append(assessment)
            await store.save(inv)

            if assessment.passed:
                inv.status = InvestigationStatus.COMPLETE
                inv.stopped_reason = "critic passed"
                inv.log(
                    "planner-agent",
                    "finished",
                    f"citation coverage {assessment.citation_coverage:.0%}",
                )
                break

            # re-plan
            new_tasks = replan(inv, assessment)
            if not new_tasks:
                inv.status = InvestigationStatus.INSUFFICIENT
                inv.stopped_reason = "critic failed but no actionable findings"
                inv.log("planner-agent", "stopped", inv.stopped_reason, ok=False)
                break

            inv.tasks.extend(TaskRecord(task=t) for t in new_tasks)
            inv.iteration += 1
            inv.log(
                "planner-agent",
                "replanned",
                f"{len(new_tasks)} targeted tasks, iteration {inv.iteration}",
            )

    except Exception as exc:  # noqa: BLE001
        inv.status = InvestigationStatus.FAILED
        inv.stopped_reason = f"{type(exc).__name__}: {exc}"
        inv.log("planner-agent", "error", inv.stopped_reason, ok=False)

    await store.save(inv)
