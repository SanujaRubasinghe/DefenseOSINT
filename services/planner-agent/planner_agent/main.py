"""planner-agent — investigation orchestration and A2A client."""

from defenseosint_common.contracts import InvestigationTask, TaskType
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .config import settings
from .decompose import decompose
from .models import TaskRecord
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
    tasks = await decompose(inv)
    inv.tasks = [TaskRecord(task=t) for t in tasks]
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
