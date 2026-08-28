# in-memory storage for now. swap with postgres later
from __future__ import annotations

import asyncio

from .models import Investigation


class InvestigationStore:
    def __init__(self) -> None:
        self._data: dict[str, Investigation] = {}
        self._lock = asyncio.Lock()

    async def create(self, objective: str) -> Investigation:
        inv = Investigation(objective=objective)
        async with self._lock:
            self._data[inv.investigation_id] = inv
        return inv

    async def get(self, investigation_id: str) -> Investigation | None:
        async with self._lock:
            return self._data.get(investigation_id)

    async def save(self, inv: Investigation) -> None:
        async with self._lock:
            self._data[inv.investigation_id] = inv

    async def list_ids(self) -> list[str]:
        async with self._lock:
            return list(self._data.keys())


store = InvestigationStore()
