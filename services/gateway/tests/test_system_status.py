"""Tests for /system/status — the aggregated agent health check used by the
frontend's post-login initialization screen.

`_ping` is mocked at the module seam rather than httpx itself, same pattern
as `_forward` in test_investigations.py.
"""

import pytest
from fastapi.testclient import TestClient
from gateway.auth import get_current_user
from gateway.main import ServiceStatus, app

client = TestClient(app)


@pytest.fixture
def authed():
    app.dependency_overrides[get_current_user] = lambda: "test-analyst"
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_system_status_requires_auth():
    r = client.get("/system/status")
    assert r.status_code == 401


def test_system_status_reports_all_online(authed, monkeypatch):
    async def fake_ping(name, url):
        return ServiceStatus(name=name, online=True, latency_ms=12)

    monkeypatch.setattr("gateway.main._ping", fake_ping)

    r = client.get("/system/status")

    assert r.status_code == 200
    body = r.json()
    assert body["all_online"] is True
    assert len(body["services"]) == 5
    assert {s["name"] for s in body["services"]} == {
        "planner-agent",
        "collector-agent",
        "entity-agent",
        "critic-agent",
        "analyst-agent",
    }


def test_system_status_reports_partial_outage(authed, monkeypatch):
    async def fake_ping(name, url):
        down = name == "critic-agent"
        return ServiceStatus(name=name, online=not down, latency_ms=None if down else 5)

    monkeypatch.setattr("gateway.main._ping", fake_ping)

    r = client.get("/system/status")

    body = r.json()
    assert body["all_online"] is False
    critic = next(s for s in body["services"] if s["name"] == "critic-agent")
    assert critic["online"] is False
    assert critic["latency_ms"] is None
