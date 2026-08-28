from __future__ import annotations

import httpx

from .config import settings


class LLMError(RuntimeError):
    pass


async def complete(prompt: str, temperature: float = 0.2) -> str:
    payload = {
        "model": settings.planner_model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout) as client:
            r = await client.post(f"{settings.ollama_url}/api/generate", json=payload)
            r.raise_for_status()
            return r.json().get("response", "")
    except Exception as e:
        raise LLMError(f"{type(e).__name__}: {e}") from e
