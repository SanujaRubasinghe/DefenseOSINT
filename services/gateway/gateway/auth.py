"""gateway — login and token verification for the single predefined analyst
account.

This is not a multi-user system: there is one operator credential (see
GatewaySettings), issued as a short-lived signed JWT so the browser can hold
a bearer token instead of resending the password on every request.
"""

from __future__ import annotations

import hmac
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

_bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


def verify_credentials(username: str, password: str) -> bool:
    """Constant-time comparison so a failed login can't be timed character by
    character against the real credential."""
    return hmac.compare_digest(username, settings.analyst_username) and hmac.compare_digest(
        password, settings.analyst_password
    )


def create_access_token(username: str) -> tuple[str, int]:
    ttl = timedelta(minutes=settings.token_ttl_minutes)
    expires_at = datetime.now(UTC) + ttl
    token = jwt.encode(
        {"sub": username, "exp": expires_at},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return token, int(ttl.total_seconds())


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),  # noqa: B008
) -> str:
    """FastAPI dependency guarding every route that needs a signed-in analyst."""
    if creds is None:
        raise HTTPException(401, "authentication required", headers=_UNAUTHORIZED_HEADERS)
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "session expired", headers=_UNAUTHORIZED_HEADERS) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, "invalid token", headers=_UNAUTHORIZED_HEADERS) from exc
    return payload["sub"]
