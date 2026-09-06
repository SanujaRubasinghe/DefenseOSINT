import type { TraceEvent } from "../api/types";

// The real DefenseOSINT agent mesh. Every cross-service call is a
// planner -> worker A2A dispatch (planner_agent/dispatch.py); workers never
// call each other directly, so the honest topology is a hub with one feedback
// arc for the critic -> replan loop in planner_agent/loop.py. Stage numbers
// reflect the genuine execution order enforced by the planner.

export type AgentId =
  | "planner-agent"
  | "collector-agent"
  | "entity-agent"
  | "analyst-agent"
  | "critic-agent";

export interface AgentNode {
  id: AgentId;
  code: string;
  label: string;
  role: string;
  stage: string | null;
  x: number;
  y: number;
}

export interface AgentEdge {
  id: string;
  from: AgentId;
  to: AgentId;
  kind: "dispatch" | "feedback";
  /** Quadratic bezier control point. */
  cx: number;
  cy: number;
}

export const VIEW_W = 880;
export const VIEW_H = 336;
export const NODE_W = 116;
export const NODE_H = 54;

export const NODES: AgentNode[] = [
  {
    id: "planner-agent",
    code: "ORCH-01",
    label: "PLANNER",
    role: "ORCHESTRATION",
    stage: null,
    x: 420,
    y: 70,
  },
  {
    id: "collector-agent",
    code: "COLL-01",
    label: "COLLECTOR",
    role: "SOURCE RETRIEVAL",
    stage: "01",
    x: 120,
    y: 262,
  },
  {
    id: "entity-agent",
    code: "ENTY-01",
    label: "ENTITY",
    role: "NER / LINKING",
    stage: "02",
    x: 320,
    y: 262,
  },
  {
    id: "analyst-agent",
    code: "ANLY-01",
    label: "ANALYST",
    role: "SYNTHESIS",
    stage: "03",
    x: 520,
    y: 262,
  },
  {
    id: "critic-agent",
    code: "CRIT-01",
    label: "CRITIC",
    role: "VERIFICATION",
    stage: "04",
    x: 720,
    y: 262,
  },
];

export const EDGES: AgentEdge[] = [
  { id: "planner>collector", from: "planner-agent", to: "collector-agent", kind: "dispatch", cx: 240, cy: 130 },
  { id: "planner>entity", from: "planner-agent", to: "entity-agent", kind: "dispatch", cx: 350, cy: 160 },
  { id: "planner>analyst", from: "planner-agent", to: "analyst-agent", kind: "dispatch", cx: 490, cy: 160 },
  { id: "planner>critic", from: "planner-agent", to: "critic-agent", kind: "dispatch", cx: 600, cy: 130 },
  // Critic rejection sends the planner back around for another iteration.
  { id: "critic>planner", from: "critic-agent", to: "planner-agent", kind: "feedback", cx: 862, cy: 120 },
];

export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
export const EDGE_BY_ID = new Map(EDGES.map((e) => [e.id, e]));

export type PacketKind = "evidence" | "entity" | "document" | "assessment" | "control" | "alert";

/** Which edge (if any) a trace event moved information across. */
export function edgeForEvent(e: TraceEvent): string | null {
  switch (e.agent) {
    case "collector-agent":
      return "planner>collector";
    case "entity-agent":
      return "planner>entity";
    case "analyst-agent":
      return "planner>analyst";
    case "critic-agent":
      return "planner>critic";
    case "planner-agent":
      return e.action === "replanned" ? "critic>planner" : null;
    default:
      return null;
  }
}

export function packetKindForEvent(e: TraceEvent): PacketKind {
  if (!e.ok) return "alert";
  switch (e.agent) {
    case "collector-agent":
      return "evidence";
    case "entity-agent":
      return "entity";
    case "analyst-agent":
      return "document";
    case "critic-agent":
      return "assessment";
    default:
      return "control";
  }
}

export function isAgentId(value: string): value is AgentId {
  return NODE_BY_ID.has(value as AgentId);
}

/** Point along the edge's quadratic bezier at t in [0,1]. */
export function pointOnEdge(edge: AgentEdge, t: number): { x: number; y: number } {
  const from = NODE_BY_ID.get(edge.from)!;
  const to = NODE_BY_ID.get(edge.to)!;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * edge.cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * edge.cy + t * t * to.y,
  };
}

export function edgePath(edge: AgentEdge): string {
  const from = NODE_BY_ID.get(edge.from)!;
  const to = NODE_BY_ID.get(edge.to)!;
  return `M ${from.x} ${from.y} Q ${edge.cx} ${edge.cy} ${to.x} ${to.y}`;
}
