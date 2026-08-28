from __future__ import annotations

import time

from .config import settings
from .models import Investigation


class Budget:
    def __init__(self) -> None:
        self.started = time.monotonic()

    def elapsed(self) -> float:
        return time.monotonic() - self.started

    def exceeded(self, inv: Investigation) -> str | None:
        """Return a human-readable reason to stop, or None to continue."""
        if inv.iteration >= settings.max_iterations:
            return f"reached the iteration limit ({settings.max_iterations})"
        if inv.a2a_calls >= settings.max_a2a_calls:
            return f"reached the agent-call limit ({settings.max_a2a_calls})"
        if self.elapsed() >= settings.max_seconds:
            return f"reached the time limit ({settings.max_seconds}s)"
        return None