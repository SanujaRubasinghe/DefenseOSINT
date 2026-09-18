import type { EvidenceRecord, Investigation, TraceEvent } from "../api/types";

// SENTINEL's views are derived here rather than in components, and every value
// traces back to something an agent actually reported. Nothing on this screen
// is synthetic: if the backend does not produce it, it is not shown.

export type EvidenceStatus = "VERIFIED" | "UNVERIFIED" | "CONFLICTING" | "REVIEW REQUIRED";

export interface EvidenceRow {
  record: EvidenceRecord;
  status: EvidenceStatus;
  /** Corroboration grade: how many records share this source. */
  reliability: "A" | "B" | "C";
  citedBy: string[];
}

/**
 * Status comes from what the pipeline actually established:
 * cited by the analyst and passed by the critic is verified; named in a
 * contradiction finding is conflicting; uncited is simply unverified.
 */
export function evidenceRows(inv: Investigation | null): EvidenceRow[] {
  if (!inv) return [];

  const citedBy = new Map<string, string[]>();
  for (const section of inv.draft?.sections ?? []) {
    for (const id of section.evidence_ids) {
      citedBy.set(id, [...(citedBy.get(id) ?? []), section.heading]);
    }
  }

  const assessment = inv.assessments[inv.assessments.length - 1];
  const disputed = new Set<string>();
  for (const finding of assessment?.findings ?? []) {
    if (finding.kind.includes("contradiction") && finding.claim) {
      // The critic cites the claim text; match it back to the sections that
      // carried it, then to those sections' evidence.
      for (const section of inv.draft?.sections ?? []) {
        if (section.body.includes(finding.claim)) {
          section.evidence_ids.forEach((id) => disputed.add(id));
        }
      }
    }
  }

  const perSource = new Map<string, number>();
  for (const r of inv.evidence) {
    const key = r.provenance.source_name;
    perSource.set(key, (perSource.get(key) ?? 0) + 1);
  }

  return inv.evidence.map((record) => {
    const cited = citedBy.get(record.evidence_id) ?? [];
    let status: EvidenceStatus;
    if (disputed.has(record.evidence_id)) status = "CONFLICTING";
    else if (cited.length && assessment?.passed) status = "VERIFIED";
    else if (cited.length) status = "REVIEW REQUIRED";
    else status = "UNVERIFIED";

    const corroboration = perSource.get(record.provenance.source_name) ?? 1;
    const reliability = corroboration >= 4 ? "A" : corroboration >= 2 ? "B" : "C";

    return { record, status, reliability, citedBy: cited };
  });
}

export const STATUS_TONE: Record<EvidenceStatus, "verified" | "review" | "critical" | "neutral"> = {
  VERIFIED: "verified",
  "REVIEW REQUIRED": "review",
  CONFLICTING: "critical",
  UNVERIFIED: "neutral",
};

/* ------------------------------------------------------------------ KPIs */

export interface Kpi {
  label: string;
  value: string;
  hint: string;
  series: number[];
  tone?: "accent" | "verified" | "review" | "critical";
}

export function kpis(inv: Investigation | null): Kpi[] {
  const rows = evidenceRows(inv);
  const assessment = inv?.assessments[inv.assessments.length - 1];
  const sources = new Set(inv?.evidence.map((e) => e.provenance.source_name) ?? []);
  const verified = rows.filter((r) => r.status === "VERIFIED").length;

  return [
    {
      label: "Active Investigations",
      value: inv ? "1" : "0",
      hint: inv?.status.toUpperCase() ?? "NONE",
      series: cumulativeSeries(inv?.trace ?? []),
      tone: "accent",
    },
    {
      label: "Sources Monitored",
      value: String(sources.size),
      hint: `${collectorCount(inv)} collection tasks`,
      series: sourceSeries(inv),
    },
    {
      label: "New Intelligence",
      value: String(inv?.evidence.length ?? 0),
      hint: "evidence records held",
      series: sourceSeries(inv),
    },
    {
      label: "Entities Identified",
      value: String(inv?.entities?.entities.length ?? 0),
      hint: `${inv?.entities?.relationships.length ?? 0} relationships`,
      series: entitySeries(inv),
    },
    {
      label: "Evidence Verified",
      value: `${verified}/${rows.length}`,
      hint: "cited and critic-passed",
      series: [],
      tone: verified ? "verified" : "review",
    },
    {
      label: "Analyst Confidence",
      value: inv?.draft ? `${(inv.draft.overall_confidence * 100).toFixed(0)}%` : "—",
      hint: assessment
        ? `citation coverage ${(assessment.citation_coverage * 100).toFixed(0)}%`
        : "awaiting synthesis",
      series: [],
      tone: (inv?.draft?.overall_confidence ?? 0) >= 0.7 ? "verified" : "review",
    },
  ];
}

function collectorCount(inv: Investigation | null): number {
  return inv?.tasks.filter((t) => t.task.type === "collect").length ?? 0;
}

/** Events accumulated over the run — a real progress curve, not a random walk. */
function cumulativeSeries(trace: TraceEvent[]): number[] {
  return trace.map((_, i) => i + 1);
}

function sourceSeries(inv: Investigation | null): number[] {
  if (!inv) return [];
  let running = 0;
  return inv.tasks.map((t) => (running += t.evidence_count));
}

function entitySeries(inv: Investigation | null): number[] {
  const entities = inv?.entities?.entities ?? [];
  return entities.map((e) => Math.round(e.confidence * 100)).slice(0, 24);
}

/* ------------------------------------------------------- provenance flow */

export interface PipelineStage {
  key: string;
  label: string;
  agent: string | null;
  state: "pending" | "active" | "complete" | "fault";
  at: string | null;
  durationMs: number | null;
  detail: string;
}

/**
 * The spec's provenance chain mapped onto the trace the planner actually
 * emits. Each stage reports the real event that satisfied it.
 */
export function pipelineStages(inv: Investigation | null): PipelineStage[] {
  const trace = inv?.trace ?? [];
  const find = (agent: string, action?: string) =>
    trace.filter((e) => e.agent === agent && (!action || e.action === action));

  const stage = (
    key: string,
    label: string,
    agent: string | null,
    events: TraceEvent[],
    detail: string
  ): PipelineStage => {
    const last = events[events.length - 1] ?? null;
    return {
      key,
      label,
      agent,
      state: !last ? "pending" : last.ok ? "complete" : "fault",
      at: last?.at ?? null,
      durationMs: last?.duration_ms ?? null,
      detail: last?.detail || detail,
    };
  };

  return [
    stage("source", "SOURCE", null, find("planner-agent", "plan_created"), "awaiting tasking"),
    stage("collect", "COLLECTOR", "collector-agent", find("collector-agent"), "no collection yet"),
    stage(
      "normalise",
      "NORMALIZATION",
      "planner-agent",
      find("planner-agent", "collection_complete"),
      "not normalised"
    ),
    stage("entity", "ENTITY EXTRACTION", "entity-agent", find("entity-agent"), "not extracted"),
    stage("correlate", "CROSS-SOURCE CORRELATION", "analyst-agent", find("analyst-agent"), "not correlated"),
    stage("assess", "ANALYST ASSESSMENT", "critic-agent", find("critic-agent"), "not assessed"),
  ];
}

/* --------------------------------------------------------- feed + search */

export interface FeedItem {
  record: EvidenceRecord;
  status: EvidenceStatus;
  entities: string[];
  position: string | null;
}

const POSITION_RE = /^Position:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/m;

export function feedItems(inv: Investigation | null): FeedItem[] {
  const rows = evidenceRows(inv);
  const entities = inv?.entities?.entities ?? [];

  return rows
    .map(({ record, status }) => {
      const match = record.content.match(POSITION_RE);
      return {
        record,
        status,
        entities: entities
          .filter((e) => e.evidence_ids.includes(record.evidence_id))
          .map((e) => e.name),
        position: match ? `${Number(match[1]).toFixed(3)}, ${Number(match[2]).toFixed(3)}` : null,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.record.provenance.retrieved_at).getTime() -
        new Date(a.record.provenance.retrieved_at).getTime()
    );
}

export function sourceTypes(inv: Investigation | null): string[] {
  return [...new Set(inv?.evidence.map((e) => e.provenance.source_type) ?? [])].sort();
}
