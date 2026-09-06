import { useEffect, useRef } from "react";
import type { TraceEvent } from "../api/types";
import { formatClock } from "../agents/network";

const SHORT_NAME: Record<string, string> = {
  "planner-agent": "ORCH-01",
  "collector-agent": "COLL-01",
  "entity-agent": "ENTY-01",
  "analyst-agent": "ANLY-01",
  "critic-agent": "CRIT-01",
};

/**
 * The temporal half of the fabric: the same events the graph is animating,
 * in arrival order. Newest last, auto-scrolled, so the stream and the graph
 * stay in step with each other.
 */
export default function ActivityStream({ events }: { events: TraceEvent[] }) {
  const endRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  if (events.length === 0) {
    return <p className="empty-note">STREAM IDLE — no events dispatched.</p>;
  }

  return (
    <ol className="stream-list">
      {events.map((e, i) => (
        <li
          key={`${e.at}-${i}`}
          className={`stream-item ${e.ok ? "" : "stream-item-error"}`}
          ref={i === events.length - 1 ? endRef : undefined}
        >
          <span className="stream-time">{formatClock(e.at)}</span>
          <span className="stream-agent">{SHORT_NAME[e.agent] ?? e.agent}</span>
          <span className="stream-detail">
            {e.ok ? e.detail || e.action : `FAULT · ${e.detail}`}
          </span>
        </li>
      ))}
    </ol>
  );
}
