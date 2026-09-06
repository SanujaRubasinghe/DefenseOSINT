from __future__ import annotations

import json

from openai import AsyncOpenAI

from .config import settings


class LLMError(RuntimeError):
    pass


_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise LLMError("OPENAI_API_KEY is not set")
        _client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=settings.timeout)
    return _client


async def complete_json(system: str, user: str, temperature: float = 0.2) -> dict:
    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model=settings.model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
    except Exception as e:
        raise LLMError(f"{type(e).__name__}: {e}") from e

    content = resp.choices[0].message.content or ""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        raise LLMError(f"model returned unparsable JSON: {e}") from e

    if not isinstance(parsed, dict):
        raise LLMError(f"model returned non-object JSON: {type(parsed).__name__}")
    return parsed
