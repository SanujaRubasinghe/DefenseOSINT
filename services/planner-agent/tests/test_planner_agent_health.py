from fastapi.testclient import TestClient

from planner_agent.main import app


def test_health():
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "planner-agent"
