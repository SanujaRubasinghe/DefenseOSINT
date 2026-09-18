"""Tests for the /investigations proxy routes.

The planner is mocked at the `_forward` seam rather than the HTTP transport —
these tests are about the gateway's own logic (validation, status-code
passthrough, error mapping), not about httpx.
"""

import httpx
import pytest
from fastapi.testclient import TestClient
from gateway.main import app

client = TestClient(app)


def test_create_investigation_rejects_short_objective():
    # Validated by the gateway itself — this must not reach _forward at all.
    r = client.post("/investigations", json={"objective": "too short"})
    assert r.status_code == 422


def test_create_investigation_forwards_to_planner(monkeypatch):
    calls = []

    async def fake_forward(method, path, json=None):
        calls.append((method, path, json))
        return {"investigation_id": "inv_abc123", "status": "planning"}

    monkeypatch.setattr("gateway.main._forward", fake_forward)

    r = client.post("/investigations", json={"objective": "Investigate example.com ownership"})

    assert r.status_code == 202
    assert r.json() == {"investigation_id": "inv_abc123", "status": "planning"}
    assert calls == [
        ("POST", "/investigations", {"objective": "Investigate example.com ownership"})
    ]


def test_get_investigation_forwards_and_returns_body(monkeypatch):
    async def fake_forward(method, path, json=None):
        assert (method, path) == ("GET", "/investigations/inv_abc123")
        return {"investigation_id": "inv_abc123", "status": "complete"}

    monkeypatch.setattr("gateway.main._forward", fake_forward)

    r = client.get("/investigations/inv_abc123")

    assert r.status_code == 200
    assert r.json()["investigation_id"] == "inv_abc123"


def test_get_trace_forwards_and_returns_body(monkeypatch):
    async def fake_forward(method, path, json=None):
        assert (method, path) == ("GET", "/investigations/inv_abc123/trace")
        return {"investigation_id": "inv_abc123", "trace": []}

    monkeypatch.setattr("gateway.main._forward", fake_forward)

    r = client.get("/investigations/inv_abc123/trace")

    assert r.status_code == 200
    assert r.json() == {"investigation_id": "inv_abc123", "trace": []}


def test_get_investigation_propagates_404(monkeypatch):
    from fastapi import HTTPException

    async def fake_forward(method, path, json=None):
        raise HTTPException(404, "investigation not found")

    monkeypatch.setattr("gateway.main._forward", fake_forward)

    r = client.get("/investigations/does-not-exist")

    assert r.status_code == 404
    assert r.json()["detail"] == "investigation not found"


@pytest.mark.asyncio
async def test_forward_returns_502_when_planner_unreachable(monkeypatch):
    # This one exercises the real _forward body (not a fake) to check the
    # actual httpx error -> HTTPException(502) mapping.
    from gateway.main import _forward

    class RaisingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def request(self, method, url, json=None):
            raise httpx.ConnectError("connection refused")

    monkeypatch.setattr("gateway.main.httpx.AsyncClient", lambda *a, **kw: RaisingClient())

    with pytest.raises(Exception) as exc_info:
        await _forward("GET", "/investigations/inv_x")

    assert getattr(exc_info.value, "status_code", None) == 502
