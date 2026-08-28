"""planner-agent — investigation state, planning and A2A orchestration."""

import asyncio

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .loop import run_investigation
from .store import store

app = FastAPI(title="planner-agent")


class InvestigationRequest(BaseModel):
    objective: str = Field(min_length=10, max_length=1000)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "planner-agent"}


@app.post("/investigations", status_code=202)
async def create_investigation(req: InvestigationRequest):
    inv = await store.create(req.objective.strip())
    asyncio.create_task(run_investigation(inv.investigation_id))
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
    return {
        "investigation_id": inv.investigation_id,
        "status": inv.status,
        "iteration": inv.iteration,
        "stopped_reason": inv.stopped_reason,
        "trace": inv.trace,
    }
