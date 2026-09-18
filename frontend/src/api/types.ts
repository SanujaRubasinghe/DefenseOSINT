// Mirrors services/planner-agent/planner_agent/models.py and
// shared/defenseosint_common/contracts.py. Kept minimal — only the fields
// the UI reads.

export type TaskStatus = "pending" | "running" | "complete" | "failed";

export type InvestigationStatus =
  | "planning"
  | "running"
  | "complete"
  | "insufficient"
  | "failed";

export interface TraceEvent {
  at: string;
  agent: string;
  action: string;
  detail: string;
  ok: boolean;
  duration_ms: number | null;
}

export interface InvestigationTaskDTO {
  task_id: string;
  type: "collect" | "extract" | "verify" | "synthesize";
  objective: string;
  queries: string[];
  entities_of_interest: string[];
  priority: number;
}

export interface TaskRecord {
  task: InvestigationTaskDTO;
  status: TaskStatus;
  attempts: number;
  error: string | null;
  evidence_count: number;
}

/** Mirrors contracts.Entity — the agent returns aliases and evidence links too. */
export interface Entity {
  canonical_id: string;
  name: string;
  type: string;
  aliases: string[];
  confidence: number;
  evidence_ids: string[];
}

export interface Relationship {
  subject_id: string;
  predicate: string;
  object_id: string;
  confidence: number;
  evidence_ids: string[];
}

export interface EntityBundle {
  entities: Entity[];
  relationships: Relationship[];
}

export interface DraftSection {
  heading: string;
  body: string;
  evidence_ids: string[];
  confidence: number;
  caveats: string[];
}

export interface IntelligenceDraft {
  title: string;
  executive_summary: string;
  sections: DraftSection[];
  overall_confidence: number;
  version: number;
}

export interface Provenance {
  source_name: string;
  source_type: string;
  source_url: string | null;
  retrieved_at: string;
  published_at: string | null;
  collector: string;
  query: string | null;
}

export interface EvidenceRecord {
  evidence_id: string;
  title: string | null;
  content: string;
  provenance: Provenance;
  relevance_score: number;
}

export interface Finding {
  kind: string;
  severity: "minor" | "major" | "critical";
  description: string;
  claim: string | null;
  suggested_queries: string[];
}

export interface CriticAssessment {
  passed: boolean;
  citation_coverage: number;
  findings: Finding[];
  requires_recollection: boolean;
  iteration: number;
}

export interface Investigation {
  investigation_id: string;
  objective: string;
  status: InvestigationStatus;
  created_at: string;
  iteration: number;
  tasks: TaskRecord[];
  evidence: EvidenceRecord[];
  entities: EntityBundle | null;
  draft: IntelligenceDraft | null;
  assessments: CriticAssessment[];
  trace: TraceEvent[];
  a2a_calls: number;
  stopped_reason: string | null;
}
