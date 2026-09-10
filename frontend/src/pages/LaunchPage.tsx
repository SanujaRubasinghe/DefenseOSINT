import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import AgentNetwork from "../components/AgentNetwork";
import { deriveNetwork } from "../agents/network";
import { NODES } from "../agents/topology";
import { useInvestigation } from "../state/InvestigationContext";

const EMPTY_ACTIVE = new Set<string>();

export default function LaunchPage() {
  const navigate = useNavigate();
  const { start, submitting, networkOnline } = useInvestigation();
  const [objective, setObjective] = useState(
    "Investigate the ownership and infrastructure history of example.com"
  );
  const [error, setError] = useState<string | null>(null);

  // The mesh at rest. Showing it here states what the system is before the
  // analyst has asked it anything.
  const idleRuntime = deriveNetwork(null, [], EMPTY_ACTIVE);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (objective.trim().length < 10) {
      setError("Objective must be at least 10 characters.");
      return;
    }
    try {
      const id = await start(objective.trim());
      navigate(`/investigation/${id}/fabric`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div className="launch">
      <section className="launch-intro">
        <p className="launch-eyebrow">MULTI-AGENT OPEN-SOURCE INTELLIGENCE</p>
        <h1 className="launch-title">
          Five specialised agents,
          <br />
          one investigation.
        </h1>
        <p className="launch-lede">
          A planner decomposes your objective, dispatches collection, entity resolution and
          synthesis across the mesh, then puts the draft in front of a critic before you see it.
          Every hop is recorded and replayable.
        </p>

        <form onSubmit={handleSubmit} className="launch-form">
          <label className="launch-label" htmlFor="objective">
            INVESTIGATION OBJECTIVE
          </label>
          <textarea
            id="objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="What do you need to find out?"
          />
          <button type="submit" disabled={submitting || !networkOnline}>
            {submitting ? "TRANSMITTING…" : "BEGIN INVESTIGATION"}
          </button>
          {!networkOnline && (
            <p className="launch-hint">Gateway unreachable — start the stack before tasking.</p>
          )}
          {error && <div className="error-banner">{error}</div>}
        </form>
      </section>

      <section className="launch-mesh">
        <div className="launch-mesh-head">
          <span className="fabric-side-title">AGENT MESH / AT REST</span>
          <span className="mono-label">{NODES.length} NODES</span>
        </div>
        <AgentNetwork
          runtime={idleRuntime}
          packets={[]}
          activeEdges={EMPTY_ACTIVE}
          selection={null}
          onSelect={() => {}}
        />
      </section>
    </div>
  );
}
