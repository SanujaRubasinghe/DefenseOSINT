"""gateway — public entry point.

Authenticates the analyst, validates incoming requests, and forwards
investigations to the planner. This is the only service the frontend should
talk to; agent-to-agent traffic among planner/collector/entity/critic/analyst
stays internal to the compose network.
"""

from __future__ import annotations

import asyncio
import time

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import create_access_token, get_current_user, verify_credentials
from .config import settings

app = FastAPI(title="gateway")

# The frontend talks to the gateway, not the planner directly, so CORS has to
# live here now (planner's CORS middleware was a dev-only stopgap for before
# this route existed — see planner_agent/main.py).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# Mirrors planner_agent.main.InvestigationRequest. Validating the same shape
# here means a malformed request is rejected at the edge instead of costing a
# round trip to the planner.
class InvestigationRequest(BaseModel):
    objective: str = Field(min_length=10, max_length=1000)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str


class ServiceStatus(BaseModel):
    name: str
    online: bool
    latency_ms: int | None


class SystemStatus(BaseModel):
    services: list[ServiceStatus]
    all_online: bool


# Every agent in the mesh, keyed by the same names the planner's own trace
# uses (see planner_agent/models.py TraceEvent.agent) so the frontend's
# post-login init screen and its live agent-fabric view read consistently.
_AGENT_URLS = [
    ("planner-agent", settings.planner_url),
    ("collector-agent", settings.collector_url),
    ("entity-agent", settings.entity_url),
    ("critic-agent", settings.critic_url),
    ("analyst-agent", settings.analyst_url),
]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "gateway"}


@app.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    if not verify_credentials(req.username, req.password):
        raise HTTPException(401, "invalid username or password")
    token, expires_in = create_access_token(req.username)
    return LoginResponse(access_token=token, expires_in=expires_in, username=req.username)


@app.get("/auth/me")
async def me(user: str = Depends(get_current_user)):
    return {"username": user}


async def _ping(name: str, url: str) -> ServiceStatus:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/health")
        online = resp.status_code == 200
    except httpx.RequestError:
        online = False
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return ServiceStatus(name=name, online=online, latency_ms=elapsed_ms if online else None)


@app.get("/system/status", response_model=SystemStatus)
async def system_status(user: str = Depends(get_current_user)):
    """Real health of every agent, pinged concurrently.

    Used by the frontend's post-login initialization screen — every line it
    shows is a genuine round trip to that agent, not a scripted delay.
    """
    results = await asyncio.gather(*(_ping(name, url) for name, url in _AGENT_URLS))
    return SystemStatus(services=list(results), all_online=all(s.online for s in results))


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
async def create_investigation(req: InvestigationRequest, user: str = Depends(get_current_user)):
    return await _forward("POST", "/investigations", json={"objective": req.objective})


@app.get("/investigations/{investigation_id}")
async def get_investigation(investigation_id: str, user: str = Depends(get_current_user)):
    return await _forward("GET", f"/investigations/{investigation_id}")


@app.get("/investigations/{investigation_id}/trace")
async def get_trace(investigation_id: str, user: str = Depends(get_current_user)):
    return await _forward("GET", f"/investigations/{investigation_id}/trace")
