import { useEffect, useRef, useState } from "react";
import { ApiError, getHealth, getInvestigation, startInvestigation } from "./api/client";
import type { Investigation } from "./api/types";
import AgentTrace from "./components/AgentTrace";
import CriticFindings from "./components/CriticFindings";
import StatusPill from "./components/StatusPill";
import TaskTable from "./components/TaskTable";

const ACTIVE_STATUSES = new Set(["planning", "running"]);
const POLL_MS = 1500;

export default function App() {
  const [gatewayStatus, setGatewayStatus] = useState("checking...");
  const [objective, setObjective] = useState(
    "Investigate the ownership and infrastructure history of example.com"
  );
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getHealth()
      .then((d) => setGatewayStatus(d.status))
      .catch(() => setGatewayStatus("unreachable"));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function pollInvestigation(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const inv = await getInvestigation(id);
        setInvestigation(inv);
        setPollError(null);
        if (!ACTIVE_STATUSES.has(inv.status) && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        setPollError(err instanceof ApiError ? err.message : String(err));
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, POLL_MS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (objective.trim().length < 10) {
      setFormError("Objective must be at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { investigation_id } = await startInvestigation(objective.trim());
      const inv = await getInvestigation(investigation_id);
      setInvestigation(inv);
      pollInvestigation(investigation_id);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const failedTrace = investigation?.trace.filter((e) => !e.ok) ?? [];

  return (
    <main className="app">
      <header className="header">
        <h1>DefenseOSINT</h1>
        <p className="muted">Multi-agent orchestration — mock run viewer</p>
        <p>
          Gateway: <strong>{gatewayStatus}</strong>{" "}
          <span className="muted">
            (investigations submitted directly to planner-agent at localhost:8001 — gateway has no
            /investigations route yet)
          </span>
        </p>
      </header>

      <section className="card">
        <h2>Start investigation</h2>
        <form onSubmit={handleSubmit} className="objective-form">
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="Investigation objective (min 10 characters)"
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Starting..." : "Run"}
          </button>
        </form>
        {formError && <div className="error-banner">{formError}</div>}
      </section>

      {investigation && (
        <>
          <section className="card">
            <h2>Investigation {investigation.investigation_id}</h2>
            <div className="trace-row">
              <StatusPill value={investigation.status} />
              <span>iteration {investigation.iteration}</span>
              <span>{investigation.a2a_calls} a2a calls</span>
              <span>{investigation.evidence.length} evidence records</span>
            </div>
            {investigation.stopped_reason && (
              <div
                className={
                  investigation.status === "complete" ? "note-banner" : "error-banner"
                }
              >
                {investigation.stopped_reason}
              </div>
            )}
            {pollError && (
              <div className="error-banner">Polling failed: {pollError}</div>
            )}
          </section>

          {failedTrace.length > 0 && (
            <section className="card card-error">
              <h2>⚠ Agent errors ({failedTrace.length})</h2>
              <AgentTrace events={failedTrace} />
            </section>
          )}

          <section className="card">
            <h2>Tasks</h2>
            <TaskTable tasks={investigation.tasks} />
          </section>

          <section className="card">
            <h2>Critic assessment</h2>
            <CriticFindings assessments={investigation.assessments} />
          </section>

          {investigation.draft && (
            <section className="card">
              <h2>Draft — {investigation.draft.title}</h2>
              <p>{investigation.draft.executive_summary}</p>
              <p className="muted">
                overall confidence {(investigation.draft.overall_confidence * 100).toFixed(0)}% ·
                version {investigation.draft.version}
              </p>
            </section>
          )}

          <section className="card">
            <h2>Full trace</h2>
            <AgentTrace events={investigation.trace} />
          </section>
        </>
      )}
    </main>
  );
}
