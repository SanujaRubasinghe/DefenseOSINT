"""gateway — public entry point.

Validates incoming requests and forwards investigations to the planner. This
is the only service the frontend should talk to; agent-to-agent traffic among
planner/collector/entity/critic/analyst stays internal to the compose network.
"""

from __future__ import annotations

import httpx
from defenseosint_common.config import Settings
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

settings = Settings("gateway")
app = FastAPI(title="gateway")

# The frontend talks to the gateway, not the planner directly, so CORS has to
# live here now (planner's CORS middleware was a dev-only stopgap for before
# this route existed — see planner_agent/main.py).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# Mirrors planner_agent.main.InvestigationRequest. Validating the same shape
# here means a malformed request is rejected at the edge instead of costing a
# round trip to the planner.
class InvestigationRequest(BaseModel):
    objective: str = Field(min_length=10, max_length=1000)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "gateway"}


async def _forward(method: str, path: str, json: dict | None = None) -> dict:
    """Relay a request to the planner and unwrap its response.

    Kept as a single seam so tests can monkeypatch this instead of the HTTP
    transport underneath it — the same pattern the other services use for
    mocking their outbound calls (see collector-agent's tests).
    """
    url = f"{settings.planner_url.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, json=json)
    except httpx.RequestError as exc:
        raise HTTPException(502, f"planner-agent unreachable: {exc}") from exc

    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        raise HTTPException(resp.status_code, detail)

    return resp.json()


@app.post("/investigations", status_code=202)
async def create_investigation(req: InvestigationRequest):
    return await _forward("POST", "/investigations", json={"objective": req.objective})


@app.get("/investigations/{investigation_id}")
async def get_investigation(investigation_id: str):
    return await _forward("GET", f"/investigations/{investigation_id}")


@app.get("/investigations/{investigation_id}/trace")
async def get_trace(investigation_id: str):
    return await _forward("GET", f"/investigations/{investigation_id}/trace")
