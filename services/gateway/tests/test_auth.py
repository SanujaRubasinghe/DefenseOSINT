"""Tests for /auth/login and the get_current_user dependency that guards the
investigation routes.

Credentials and the signing secret are monkeypatched per test rather than
relying on whatever .env happens to be loaded, so these tests are
self-contained and deterministic regardless of environment.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from gateway import auth as auth_module
from gateway.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _known_credentials(monkeypatch):
    monkeypatch.setattr(auth_module.settings, "analyst_username", "analyst")
    monkeypatch.setattr(auth_module.settings, "analyst_password", "correct-horse-battery")
    monkeypatch.setattr(auth_module.settings, "jwt_secret", "test-secret-key-at-least-32-bytes-long")


def test_login_succeeds_with_correct_credentials():
    r = client.post(
        "/auth/login", json={"username": "analyst", "password": "correct-horse-battery"}
    )

    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["username"] == "analyst"
    assert body["access_token"]
    assert body["expires_in"] > 0


def test_login_rejects_wrong_password():
    r = client.post("/auth/login", json={"username": "analyst", "password": "wrong"})
    assert r.status_code == 401


def test_login_rejects_unknown_username():
    r = client.post(
        "/auth/login", json={"username": "someone-else", "password": "correct-horse-battery"}
    )
    assert r.status_code == 401


def test_protected_route_rejects_missing_token():
    r = client.get("/investigations/inv_x")
    assert r.status_code == 401


def test_protected_route_rejects_garbage_token():
    r = client.get("/investigations/inv_x", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_protected_route_accepts_valid_token(monkeypatch):
    token, _ = auth_module.create_access_token("analyst")

    async def fake_forward(method, path, json=None):
        return {"investigation_id": "inv_x", "status": "complete"}

    monkeypatch.setattr("gateway.main._forward", fake_forward)

    r = client.get("/investigations/inv_x", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200


def test_expired_token_is_rejected():
    expired = jwt.encode(
        {"sub": "analyst", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        "test-secret-key-at-least-32-bytes-long",
        algorithm="HS256",
    )

    r = client.get("/investigations/inv_x", headers={"Authorization": f"Bearer {expired}"})

    assert r.status_code == 401


def test_me_returns_the_authenticated_username():
    token, _ = auth_module.create_access_token("analyst")

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    assert r.json() == {"username": "analyst"}


def test_health_stays_unauthenticated():
    # Container/monitoring probes must not need a login.
    r = client.get("/health")
    assert r.status_code == 200
