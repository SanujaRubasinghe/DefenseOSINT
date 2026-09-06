import type { NodeRuntime } from "../agents/network";
import {
  EDGES,
  EDGE_BY_ID,
  NODES,
  NODE_H,
  NODE_W,
  VIEW_H,
  VIEW_W,
  edgePath,
  pointOnEdge,
  type AgentId,
} from "../agents/topology";
import type { Packet } from "../hooks/useNetworkPlayback";

export type Selection =
  | { type: "node"; id: AgentId }
  | { type: "edge"; id: string }
  | null;

interface Props {
  runtime: Map<AgentId, NodeRuntime>;
  packets: Packet[];
  activeEdges: Set<string>;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const STATE_LABEL: Record<string, string> = {
  idle: "IDLE",
  queued: "QUEUED",
  active: "ACTIVE",
  completed: "COMPLETE",
  error: "FAULT",
};

const PACKET_R: Record<string, number> = {
  evidence: 3,
  entity: 3,
  document: 4,
  assessment: 3.2,
  control: 2.4,
  alert: 3.6,
};

export default function AgentNetwork({
  runtime,
  packets,
  activeEdges,
  selection,
  onSelect,
}: Props) {
  return (
    <div className="fabric-canvas">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="fabric-svg"
        role="img"
        aria-label="Agent network topology and live execution state"
      >
        <defs>
          <pattern id="fabric-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" className="fabric-grid-dot" />
          </pattern>
          <marker
            id="fabric-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" className="fabric-arrowhead" />
          </marker>
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill="url(#fabric-grid)" />

        {/* edges first so nodes paint over their endpoints */}
        <g>
          {EDGES.map((edge) => {
            const d = edgePath(edge);
            const isActive = activeEdges.has(edge.id);
            const isSelected = selection?.type === "edge" && selection.id === edge.id;
            return (
              <g key={edge.id}>
                <path
                  d={d}
                  className={[
                    "fabric-edge",
                    `fabric-edge-${edge.kind}`,
                    isActive ? "fabric-edge-active" : "",
                    isSelected ? "fabric-edge-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  markerEnd="url(#fabric-arrow)"
                />
                <path
                  d={d}
                  className="fabric-edge-hit"
                  onClick={() => onSelect({ type: "edge", id: edge.id })}
                >
                  <title>
                    {edge.from} → {edge.to}
                  </title>
                </path>
              </g>
            );
          })}
        </g>

        {/* packets in flight */}
        <g>
          {packets
            .filter((p) => p.t >= 0)
            .map((p) => {
              const edge = EDGE_BY_ID.get(p.edgeId);
              if (!edge) return null;
              const at = pointOnEdge(edge, p.dir === 1 ? p.t : 1 - p.t);
              return (
                <circle
                  key={p.id}
                  cx={at.x}
                  cy={at.y}
                  r={PACKET_R[p.kind] ?? 3}
                  className={`fabric-packet fabric-packet-${p.kind}`}
                />
              );
            })}
        </g>

        {/* nodes */}
        <g>
          {NODES.map((node) => {
            const rt = runtime.get(node.id)!;
            const isSelected = selection?.type === "node" && selection.id === node.id;
            const x = node.x - NODE_W / 2;
            const y = node.y - NODE_H / 2;
            const detail =
              rt.state === "active" || rt.state === "completed" || rt.state === "error"
                ? rt.lastMs != null
                  ? `${STATE_LABEL[rt.state]} · ${rt.lastMs}ms`
                  : STATE_LABEL[rt.state]
                : STATE_LABEL[rt.state];

            return (
              <g
                key={node.id}
                className={`fabric-node fabric-node-${rt.state} ${
                  isSelected ? "fabric-node-selected" : ""
                }`}
                tabIndex={0}
                role="button"
                aria-label={`${node.label} agent, ${STATE_LABEL[rt.state]}`}
                onClick={() => onSelect({ type: "node", id: node.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect({ type: "node", id: node.id });
                  }
                }}
              >
                {rt.state === "active" && (
                  <rect
                    x={x - 5}
                    y={y - 5}
                    width={NODE_W + 10}
                    height={NODE_H + 10}
                    rx="4"
                    className="fabric-node-halo"
                  />
                )}

                <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="3" className="fabric-node-box" />

                <text x={x} y={y - 9} className="fabric-node-code">
                  {node.stage && <tspan className="fabric-node-stage">{node.stage} </tspan>}
                  {node.code}
                </text>

                <text x={node.x} y={node.y - 1} textAnchor="middle" className="fabric-node-label">
                  {node.label}
                </text>
                <text x={node.x} y={node.y + 14} textAnchor="middle" className="fabric-node-role">
                  {node.role}
                </text>

                <circle cx={x + NODE_W - 10} cy={y + 10} r="3.2" className="fabric-node-dot" />

                <text x={node.x} y={y + NODE_H + 16} textAnchor="middle" className="fabric-node-state">
                  {detail}
                </text>
                {rt.confidence != null && (
                  <text
                    x={node.x}
                    y={y + NODE_H + 29}
                    textAnchor="middle"
                    className="fabric-node-conf"
                  >
                    CONF {rt.confidence.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
