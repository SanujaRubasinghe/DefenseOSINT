import type { Investigation, TraceEvent } from "../api/types";
import { NODES, type AgentId } from "./topology";

// Everything here is derived from data the backend actually returns (trace
// events, task records, evidence, entities, draft, assessments). Nothing is
// synthesised — if the planner never reports a number, the node does not
// display one.

export type NodeState = "idle" | "queued" | "active" | "completed" | "error";

export interface NodeMetric {
  label: string;
  value: string;
}

export interface NodeRuntime {
  state: NodeState;
  calls: number;
  lastMs: number | null;
  totalMs: number;
  lastAt: string | null;
  lastAction: string | null;
  error: string | null;
  metrics: NodeMetric[];
  /** Only set where the backend genuinely reports a confidence-like value. */
  confidence: number | null;
  events: TraceEvent[];
}

const ACTIVE_INVESTIGATION = new Set(["planning", "running"]);

function metricsFor(id: AgentId, inv: Investigation | null): NodeMetric[] {
  if (!inv) return [];

  switch (id) {
    case "planner-agent":
      return [
        { label: "TASKS", value: String(inv.tasks.length) },
        { label: "ITER", value: String(inv.iteration) },
        { label: "A2A", value: String(inv.a2a_calls) },
      ];
    case "collector-agent":
      return [
        { label: "RECORDS", value: String(inv.evidence.length) },
        {
          label: "TASKS",
          value: String(inv.tasks.filter((t) => t.task.type === "collect").length),
        },
      ];
    case "entity-agent":
      return [
        { label: "ENTITIES", value: String(inv.entities?.entities.length ?? 0) },
        { label: "LINKS", value: String(inv.entities?.relationships.length ?? 0) },
      ];
    case "analyst-agent":
      return inv.draft
        ? [
            { label: "SECTIONS", value: String(inv.draft.sections.length) },
            { label: "VER", value: String(inv.draft.version) },
          ]
        : [];
    case "critic-agent": {
      const latest = inv.assessments[inv.assessments.length - 1];
      return latest
        ? [
            { label: "FINDINGS", value: String(latest.findings.length) },
            { label: "VERDICT", value: latest.passed ? "PASS" : "FAIL" },
          ]
        : [];
    }
  }
}

function confidenceFor(id: AgentId, inv: Investigation | null): number | null {
  if (!inv) return null;
  if (id === "analyst-agent") return inv.draft?.overall_confidence ?? null;
  if (id === "critic-agent") {
    const latest = inv.assessments[inv.assessments.length - 1];
    return latest ? latest.citation_coverage : null;
  }
  return null;
}

export function deriveNetwork(
  inv: Investigation | null,
  playedEvents: TraceEvent[],
  activeAgents: Set<string>
): Map<AgentId, NodeRuntime> {
  const running = inv ? ACTIVE_INVESTIGATION.has(inv.status) : false;
  const out = new Map<AgentId, NodeRuntime>();

  for (const node of NODES) {
    const events = playedEvents.filter((e) => e.agent === node.id);
    const last = events[events.length - 1] ?? null;
    const failed = events.filter((e) => !e.ok);
    const durations = events.filter((e) => e.duration_ms != null);

    let state: NodeState;
    if (activeAgents.has(node.id)) {
      state = "active";
    } else if (failed.length > 0 && last && !last.ok) {
      state = "error";
    } else if (events.length > 0) {
      state = "completed";
    } else if (running) {
      state = "queued";
    } else {
      state = "idle";
    }

    out.set(node.id, {
      state,
      calls: events.length,
      lastMs: last?.duration_ms ?? null,
      totalMs: durations.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0),
      lastAt: last?.at ?? null,
      lastAction: last?.action ?? null,
      error: last && !last.ok ? last.detail : null,
      metrics: events.length > 0 ? metricsFor(node.id, inv) : [],
      confidence: events.length > 0 ? confidenceFor(node.id, inv) : null,
      events,
    });
  }

  return out;
}

export function countByState(runtime: Map<AgentId, NodeRuntime>, state: NodeState): number {
  let n = 0;
  for (const r of runtime.values()) if (r.state === state) n++;
  return n;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}
