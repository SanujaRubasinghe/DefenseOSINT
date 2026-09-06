import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getHealth, getInvestigation, startInvestigation } from "./api/client";
import type { Investigation } from "./api/types";
import AgentTrace from "./components/AgentTrace";
import BootSequence from "./components/BootSequence";
import Clock from "./components/Clock";
import CriticFindings from "./components/CriticFindings";
import DraftSections from "./components/DraftSections";
import EvidenceList from "./components/EvidenceList";
import Panel from "./components/Panel";
import StatusPill from "./components/StatusPill";
import TaskTable from "./components/TaskTable";

const ACTIVE_STATUSES = new Set(["planning", "running"]);
const POLL_MS = 1500;

export default function App() {
  const [gatewayStatus, setGatewayStatus] = useState("checking...");
  const [gatewayChecked, setGatewayChecked] = useState(false);
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
      .catch(() => setGatewayStatus("unreachable"))
      .finally(() => setGatewayChecked(true));
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
  const evidenceById = useMemo(() => {
    return new Map(investigation?.evidence.map((e) => [e.evidence_id, e]) ?? []);
  }, [investigation?.evidence]);
  const isLive = investigation ? ACTIVE_STATUSES.has(investigation.status) : false;

  return (
    <>
      <BootSequence done={gatewayChecked} />

      <div className="console">
        <header className="console-header">
          <div className="console-header-left">
            <span className={`status-dot ${gatewayStatus === "ok" ? "status-dot-ok" : "status-dot-err"}`} />
            <span className="console-wordmark">DEFENSEOSINT</span>
            <span className="console-subtitle">// ORCHESTRATION CONSOLE</span>
          </div>
          <div className="console-header-right">
            <span className="console-gateway">
              GATEWAY:{" "}
              <strong className={gatewayStatus === "ok" ? "text-ok" : "text-err"}>
                {gatewayStatus.toUpperCase()}
              </strong>
            </span>
            <Clock />
          </div>
        </header>

        <p className="console-note">
          Investigations are submitted directly to planner-agent at localhost:8001 — gateway has
          no /investigations route yet.
        </p>

        <div className="console-layout">
          <div className="console-main">
            <Panel index="00" title="NEW TASKING">
              <form onSubmit={handleSubmit} className="objective-form">
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={3}
                  placeholder="Investigation objective (min 10 characters)"
                />
                <button type="submit" disabled={submitting}>
                  {submitting ? "TRANSMITTING…" : "RUN"}
                </button>
              </form>
              {formError && <div className="error-banner">{formError}</div>}
            </Panel>

            {investigation && (
              <>
                <Panel
                  index="01"
                  title="INVESTIGATION STATUS"
                  meta={<span className="mono-label">{investigation.investigation_id}</span>}
                  scanning={isLive}
                >
                  <div className="trace-row">
                    <StatusPill value={investigation.status} />
                    <span className="mono-label">iteration {investigation.iteration}</span>
                    <span className="mono-label">{investigation.a2a_calls} a2a calls</span>
                    <span className="mono-label">
                      {investigation.evidence.length} evidence records
                    </span>
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
                  {pollError && <div className="error-banner">UPLINK LOST: {pollError}</div>}
                </Panel>

                {failedTrace.length > 0 && (
                  <Panel index="02" title={`AGENT FAULTS (${failedTrace.length})`} variant="error">
                    <AgentTrace events={failedTrace} />
                  </Panel>
                )}

                <div className="console-row">
                  <Panel index="03" title="TASKING QUEUE">
                    <TaskTable tasks={investigation.tasks} />
                  </Panel>

                  <Panel index="04" title="CRITIC ASSESSMENT">
                    <CriticFindings assessments={investigation.assessments} />
                  </Panel>
                </div>

                {investigation.draft && (
                  <Panel
                    index="05"
                    title="INTELLIGENCE BRIEF"
                    meta={<span className="mono-label">v{investigation.draft.version}</span>}
                  >
                    <h3 className="brief-title">{investigation.draft.title}</h3>
                    <p>{investigation.draft.executive_summary}</p>
                    <div className="meter-row meter-row-compact">
                      <span className="meter-label">overall confidence</span>
                      <div className="meter-track">
                        <div
                          className="meter-fill meter-fill-ok"
                          style={{ width: `${investigation.draft.overall_confidence * 100}%` }}
                        />
                      </div>
                      <span className="meter-value">
                        {(investigation.draft.overall_confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <DraftSections
                      sections={investigation.draft.sections}
                      evidenceById={evidenceById}
                    />
                  </Panel>
                )}

                <Panel index="06" title={`EVIDENCE LOG (${investigation.evidence.length})`}>
                  <details open={investigation.evidence.length <= 5}>
                    <summary className="evidence-summary">
                      {investigation.evidence.length <= 5
                        ? "expanded"
                        : "collapsed — click to expand"}
                    </summary>
                    <EvidenceList records={investigation.evidence} />
                  </details>
                </Panel>
              </>
            )}
          </div>

          {investigation && (
            <aside className="console-rail">
              <Panel index="07" title="AGENT TRACE" scanning={isLive}>
                <AgentTrace events={investigation.trace} />
              </Panel>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
