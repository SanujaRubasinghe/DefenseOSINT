from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from defenseosint_common.contracts import (
    CriticAssessment,
    EntityBundle,
    EvidenceRecord,
    IntelligenceDraft,
    InvestigationTask,
    TaskStatus,
)


def now() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class TraceEvent(BaseModel):
    """This shows in the UI as a one line trace event"""

    at: datetime = Field(default_factory=now)
    agent: str
    action: str
    detail: str = ""
    ok: bool = True
    duration_ms: int | None = None


class TaskRecord(BaseModel):
    task: InvestigationTask
    status: TaskStatus = TaskStatus.PENDING
    attempts: int = 0
    error: str | None = None
    evidence_count: int = 0


class InvestigationStatus:
    PLANNING = "planning"
    RUNNING = "running"
    COMPLETE = "complete"
    INSUFFICIENT = "insufficient"
    FAILED = "failed"


class Investigation(BaseModel):
    investigation_id: str = Field(default_factory=lambda: new_id("inv"))
    objective: str
    status: str = InvestigationStatus.PLANNING
    created_at: datetime = Field(default_factory=now)
    iteration: int = 0

    tasks: list[TaskRecord] = Field(default_factory=list)
    evidence: list[EvidenceRecord] = Field(default_factory=list)
    entities: EntityBundle | None = None
    draft: IntelligenceDraft | None = None
    assessments: list[CriticAssessment] = Field(default_factory=list)
    trace: list[TraceEvent] = Field(default_factory=list)

    a2a_calls: int = 0
    stopped_reason: str | None = None

    def log(
        self,
        agent: str,
        action: str,
        detail: str = "",
        ok: bool = True,
        duration_ms: int | None = None,
    ) -> None:
        self.trace.append(
            TraceEvent(agent=agent, action=action, detail=detail, ok=ok, duration_ms=duration_ms)
        )

    def pending(self, task_type: str | None = None) -> list[TaskRecord]:
        out = [t for t in self.tasks if t.status == TaskStatus.PENDING]
        if task_type:
            out = [t for t in out if t.task.type == task_type]
        return sorted(out, key=lambda t: t.task.priority)

    def evidence_ids(self) -> set[str]:
        return {e.evidence_id for e in self.evidence}

    def add_evidence(self, records: list[EvidenceRecord]) -> int:
        seen = self.evidence_ids()
        fresh = [r for r in records if r.evidence_id not in seen]
        self.evidence.extend(fresh)
        return len(fresh)
