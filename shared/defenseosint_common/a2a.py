"""Agent-to-agent messaging. Every cross-service call goes through here."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from pydantic import BaseModel, Field


class A2AMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    correlation_id: str  # the investigation_id — use it to trace a whole run
    sender: str
    recipient: str
    skill: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: dict[str, Any]


class A2AResponse(BaseModel):
    in_reply_to: str
    correlation_id: str
    sender: str
    ok: bool = True
    payload: dict[str, Any] | None = None
    error: str | None = None


class A2AClient:
    """Calls another agent's /a2a/<skill> endpoint.

    If the peer is down it returns ok=False instead of raising, so the Planner
    can re-plan rather than hang. Demonstrating that is worth marks.
    """

    def __init__(self, sender: str, timeout: float = 60.0) -> None:
        self.sender = sender
        self.timeout = timeout

    async def send(
        self,
        url: str,
        recipient: str,
        skill: str,
        payload: dict[str, Any],
        correlation_id: str,
        token: str | None = None,
    ) -> A2AResponse:
        msg = A2AMessage(
            correlation_id=correlation_id,
            sender=self.sender,
            recipient=recipient,
            skill=skill,
            payload=payload,
        )
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    f"{url.rstrip('/')}/a2a/{skill}",
                    json=msg.model_dump(mode="json"),
                    headers=headers,
                )
                r.raise_for_status()
                return A2AResponse.model_validate(r.json())
        except Exception as exc:  # noqa: BLE001
            return A2AResponse(
                in_reply_to=msg.message_id,
                correlation_id=correlation_id,
                sender=recipient,
                ok=False,
                error=f"{type(exc).__name__}: {exc}",
            )


def reply(msg: A2AMessage, sender: str, payload: BaseModel) -> A2AResponse:
    """Build a success response from a contract model."""
    return A2AResponse(
        in_reply_to=msg.message_id,
        correlation_id=msg.correlation_id,
        sender=sender,
        payload=payload.model_dump(mode="json"),
    )
