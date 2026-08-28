"""planner-agent — investigation orchestration and A2A client."""

from defenseosint_common.contracts import InvestigationTask, TaskType
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .config import settings
from .models import Investigation, TaskRecord, new_id
from .store import store

app = FastAPI(title="planner-agent")


class InvestigationRequest(BaseModel):
    objective: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "planner-agent"}


@app.post("/investigations")
async def create_investigation(req: InvestigationRequest):
    inv = await store.create(req.objective)
    inv.tasks = [TaskRecord(task=t) for t in _hardcoded_plan(inv)]
    inv.log("planner-agent", "plan_created", f"{len(inv.tasks)} tasks")
    await store.save(inv)
    return {"investigation_id": inv.investigation_id, "status": inv.status}


@app.get("/investigations/{investigation_id}")
async def get_investigation(investigation_id: str):
    inv = await store.get(investigation_id)
    if inv is None:
        raise HTTPException(404, "investigation not found")
    return inv


@app.get("/investigations/{investigation_id}/trace")
async def get_trace(investigation_id: str):
    inv = await store.get(investigation_id)
    if inv is None:
        raise HTTPException(404, "investigation not found")
    return {"investigation_id": inv.investigation_id, "trace": inv.trace}


def _hardcoded_plan(inv: Investigation) -> list[InvestigationTask]:
    """Phase 1 placeholder — replaced by the LLM in Phase 2."""
    return [
        InvestigationTask(
            investigation_id=inv.investigation_id,
            task_id=new_id("task"),
            type=TaskType.COLLECT,
            objective=f"Find recent public reporting on: {inv.objective}",
            queries=[inv.objective],
            priority=1,
            max_sources=settings_max(),
            expected_output="Evidence records with provenance",
        ),
        InvestigationTask(
            investigation_id=inv.investigation_id,
            task_id=new_id("task"),
            type=TaskType.COLLECT,
            objective=f"Find organisational and background sources on: {inv.objective}",
            queries=[f"{inv.objective} organisation background"],
            priority=2,
            max_sources=settings_max(),
            expected_output="Evidence records with provenance",
        ),
    ]


def settings_max() -> int:
    return 20 if settings.planner_model else 20