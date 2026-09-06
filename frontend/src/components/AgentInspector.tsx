import type { TraceEvent } from "../api/types";
import { formatClock, type NodeRuntime } from "../agents/network";
import {
  EDGE_BY_ID,
  NODE_BY_ID,
  edgeForEvent,
  packetKindForEvent,
  type AgentId,
} from "../agents/topology";
import type { Selection } from "./AgentNetwork";
import AnimatedNumber from "./AnimatedNumber";

interface Props {
  selection: Selection;
  runtime: Map<AgentId, NodeRuntime>;
  playedEvents: TraceEvent[];
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspect-field">
      <span className="inspect-label">{label}</span>
      <span className="inspect-value">{value}</span>
    </div>
  );
}

export default function AgentInspector({ selection, runtime, playedEvents, onClose }: Props) {
  if (!selection) {
    return (
      <p className="empty-note">
        SELECT A NODE OR LINK — inspect agent state and what crossed the wire.
      </p>
    );
  }

  if (selection.type === "edge") {
    const edge = EDGE_BY_ID.get(selection.id);
    if (!edge) return null;
    const from = NODE_BY_ID.get(edge.from)!;
    const to = NODE_BY_ID.get(edge.to)!;
    const crossings = playedEvents.filter((e) => edgeForEvent(e) === edge.id);
    const byKind = new Map<string, number>();
    for (const e of crossings) {
      const k = packetKindForEvent(e);
      byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }
    const totalMs = crossings.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);

    return (
      <div className="inspect">
        <div className="inspect-head">
          <h3 className="inspect-title">
            {from.code} <span className="inspect-arrow">→</span> {to.code}
          </h3>
          <button type="button" className="link-button" onClick={onClose}>
            close
          </button>
        </div>
        <p className="inspect-sub">{edge.kind === "feedback" ? "REPLAN FEEDBACK" : "A2A DISPATCH"}</p>

        <div className="inspect-grid">
          <Field label="TRANSFERS" value={String(crossings.length)} />
          <Field label="TOTAL TIME" value={crossings.length ? `${totalMs}ms` : "—"} />
        </div>

        {byKind.size > 0 && (
          <div className="inspect-chips">
            {[...byKind].map(([kind, n]) => (
              <span key={kind} className={`chip fabric-chip-${kind}`}>
                {n} {kind}
              </span>
            ))}
          </div>
        )}

        {crossings.length === 0 && <p className="empty-note">NO TRAFFIC ON THIS LINK YET.</p>}
      </div>
    );
  }

  const node = NODE_BY_ID.get(selection.id)!;
  const rt = runtime.get(selection.id)!;
  const recent = rt.events.slice(-5).reverse();

  return (
    <div className="inspect">
      <div className="inspect-head">
        <h3 className="inspect-title">{node.code}</h3>
        <button type="button" className="link-button" onClick={onClose}>
          close
        </button>
      </div>
      <p className="inspect-sub">
        {node.label} · {node.role}
      </p>

      <div className="inspect-grid">
        <Field label="STATUS" value={rt.state.toUpperCase()} />
        <Field label="CALLS" value={String(rt.calls)} />
        <Field label="LAST" value={rt.lastAction ?? "—"} />
        <Field label="RUNTIME" value={rt.totalMs > 0 ? `${rt.totalMs}ms` : "—"} />
        {rt.metrics.map((m) => (
          <Field key={m.label} label={m.label} value={m.value} />
        ))}
      </div>

      {rt.confidence != null && (
        <div className="inspect-conf">
          <span className="inspect-label">CONFIDENCE</span>
          <span className="inspect-conf-value">
            <AnimatedNumber value={rt.confidence} />
          </span>
        </div>
      )}

      {rt.error && <div className="error-banner">{rt.error}</div>}

      {recent.length > 0 && (
        <>
          <p className="inspect-label inspect-section">RECENT ACTIVITY</p>
          <ul className="inspect-events">
            {recent.map((e, i) => (
              <li key={i} className={e.ok ? "" : "trace-error-text"}>
                <span className="stream-time">{formatClock(e.at)}</span> {e.action}
                {e.duration_ms != null && <span className="stream-time"> {e.duration_ms}ms</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
