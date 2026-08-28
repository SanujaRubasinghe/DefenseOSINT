from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

CONTRACT_VERSION = "0.2.0"


# --- building blocks -------------------------------------------------------
class Provenance(BaseModel):
    """Where a piece of information came from. Required on all evidence."""

    source_name: str
    source_type: str  # web | news | dns | github | legal | geo
    source_url: str | None = None
    retrieved_at: datetime
    published_at: datetime | None = None
    collector: str  # which tool produced it
    query: str | None = None


# --- 1. Planner -> any agent ----------------------------------------------
class TaskType(str, Enum):
    COLLECT = "collect"
    EXTRACT = "extract"
    VERIFY = "verify"
    SYNTHESIZE = "synthesize"

class TaskStatus(str, Enum):
    PENDING = "pending"


class InvestigationTask(BaseModel):
    investigation_id: str
    task_id: str
    type: TaskType
    objective: str
    queries: list[str] = Field(default_factory=list)
    entities_of_interest: list[str] = Field(default_factory=list)
    priority: int = 5
    max_sources: int = 20
    expected_output: str = ""


# --- 2. Collector -> Entity / Analyst / Critic -----------------------------
class EvidenceRecord(BaseModel):
    evidence_id: str
    title: str | None = None
    content: str
    provenance: Provenance
    relevance_score: float = 0.0


class EvidenceBundle(BaseModel):
    investigation_id: str
    task_id: str
    records: list[EvidenceRecord] = Field(default_factory=list)
    queries_executed: list[str] = Field(default_factory=list)


# --- 3. Entity Extractor -> Analyst / Critic -------------------------------
class Entity(BaseModel):
    canonical_id: str  # deterministic: hash(type + normalised name)
    name: str
    type: str  # PERSON | ORG | LOCATION | EVENT | ...
    aliases: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    evidence_ids: list[str] = Field(default_factory=list)


class Relationship(BaseModel):
    subject_id: str
    predicate: str
    object_id: str
    confidence: float = 0.0
    evidence_ids: list[str] = Field(default_factory=list)


class EntityBundle(BaseModel):
    investigation_id: str
    entities: list[Entity] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)


# --- 4. Analyst -> Critic / user -------------------------------------------
class DraftSection(BaseModel):
    heading: str
    body: str
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    caveats: list[str] = Field(default_factory=list)


class IntelligenceDraft(BaseModel):
    investigation_id: str
    title: str
    executive_summary: str
    sections: list[DraftSection] = Field(default_factory=list)
    overall_confidence: float = 0.0
    version: int = 1


# --- 5. Critic -> Planner --------------------------------------------------
class Severity(str, Enum):
    MINOR = "minor"
    MAJOR = "major"
    CRITICAL = "critical"


class Finding(BaseModel):
    kind: str  # unsupported_claim | missing_citation | contradiction | gap
    severity: Severity
    description: str
    claim: str | None = None
    suggested_queries: list[str] = Field(default_factory=list)


class CriticAssessment(BaseModel):
    investigation_id: str
    passed: bool
    citation_coverage: float = 0.0
    findings: list[Finding] = Field(default_factory=list)
    requires_recollection: bool = False
    iteration: int = 0
