import type { TraceEvent } from "../api/types";

// Every A2A hop (planner-agent -> collector/entity/analyst/critic) logs one
// TraceEvent per call, with ok=false when a peer errors out or is
// unreachable (see planner_agent/dispatch.py::_call). Surfacing that here is
// the point of this component: it's the fastest way to see which agent
// broke and why.
export default function AgentTrace({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">No trace events yet.</p>;
  }

  return (
    <ul className="trace-list">
      {[...events].reverse().map((e, i) => (
        <li key={i} className={`trace-item ${e.ok ? "" : "trace-item-error"}`}>
          <div className="trace-row">
            <span className="trace-agent">{e.agent}</span>
            <span className="trace-action">{e.action}</span>
            {e.duration_ms != null && <span className="trace-ms">{e.duration_ms}ms</span>}
            <span className="trace-time">{new Date(e.at).toLocaleTimeString()}</span>
          </div>
          {e.detail && (
            <div className={e.ok ? "trace-detail" : "trace-detail trace-error-text"}>
              {e.ok ? "" : "ERROR: "}
              {e.detail}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
