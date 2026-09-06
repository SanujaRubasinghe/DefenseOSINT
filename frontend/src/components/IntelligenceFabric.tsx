import { useMemo, useState } from "react";
import type { Investigation } from "../api/types";
import { countByState, deriveNetwork, formatClock, pad2 } from "../agents/network";
import { NODES } from "../agents/topology";
import { useNetworkPlayback } from "../hooks/useNetworkPlayback";
import ActivityStream from "./ActivityStream";
import AgentInspector from "./AgentInspector";
import AgentNetwork, { type Selection } from "./AgentNetwork";

interface Props {
  investigation: Investigation | null;
  networkOnline: boolean;
}

export default function IntelligenceFabric({ investigation, networkOnline }: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const trace = investigation?.trace ?? [];
  const { playedEvents, packets, activeAgents, activeEdges, progress, isReplaying, replay } =
    useNetworkPlayback(trace);

  const runtime = useMemo(
    () => deriveNetwork(investigation, playedEvents, activeAgents),
    [investigation, playedEvents, activeAgents]
  );

  const activeCount = countByState(runtime, "active");
  const queuedCount = countByState(runtime, "queued");
  const lastEvent = playedEvents[playedEvents.length - 1] ?? null;

  return (
    <div className="fabric">
      <div className="fabric-telemetry">
        <span className="fabric-stat">
          <span className={`status-dot ${networkOnline ? "status-dot-ok" : "status-dot-err"}`} />
          NETWORK / {networkOnline ? "ONLINE" : "DEGRADED"}
        </span>
        <span className="fabric-stat">
          AGENTS <strong>{pad2(NODES.length)}</strong>
        </span>
        <span className="fabric-stat">
          ACTIVE{" "}
          <strong className={activeCount > 0 ? "text-amber" : ""}>
            {pad2(activeCount)} / {pad2(NODES.length)}
          </strong>
        </span>
        <span className="fabric-stat">
          QUEUED <strong>{pad2(queuedCount)}</strong>
        </span>
        <span className="fabric-stat">
          SOURCES <strong>{pad2(investigation?.evidence.length ?? 0)}</strong>
        </span>
        <span className="fabric-stat">
          EVENTS <strong>{playedEvents.length}</strong>
          {isReplaying && <span className="fabric-catchup"> / {trace.length}</span>}
        </span>
        {investigation && (
          <span className="fabric-stat">
            RUN <strong>{investigation.investigation_id}</strong>
          </span>
        )}
        {lastEvent && (
          <span className="fabric-stat">
            LAST <strong>{formatClock(lastEvent.at)}</strong>
          </span>
        )}
        {trace.length > 0 && (
          <button type="button" className="fabric-replay" onClick={replay} disabled={isReplaying}>
            ▶ REPLAY
          </button>
        )}
      </div>

      <div className="fabric-body">
        <AgentNetwork
          runtime={runtime}
          packets={packets}
          activeEdges={activeEdges}
          selection={selection}
          onSelect={(next) =>
            setSelection((cur) =>
              cur && next && cur.type === next.type && cur.id === next.id ? null : next
            )
          }
        />

        <div className="fabric-side">
          <div className="fabric-side-block">
            <p className="fabric-side-title">ACTIVITY STREAM</p>
            <ActivityStream events={playedEvents} />
          </div>
          <div className="fabric-side-block">
            <p className="fabric-side-title">INSPECTOR</p>
            <AgentInspector
              selection={selection}
              runtime={runtime}
              playedEvents={playedEvents}
              onClose={() => setSelection(null)}
            />
          </div>
        </div>
      </div>

      {/* Execution path stays legible when the graph is scrolled off on narrow
          viewports — it is the same state the graph shows, in one line. */}
      <div className="fabric-path">
        {NODES.map((node, i) => {
          const state = runtime.get(node.id)!.state;
          return (
            <span key={node.id} className="fabric-path-step">
              {i > 0 && <span className="fabric-path-arrow">→</span>}
              <button
                type="button"
                className={`fabric-path-node fabric-path-${state}`}
                onClick={() => setSelection({ type: "node", id: node.id })}
              >
                {node.label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
