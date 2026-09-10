import AgentTrace from "../components/AgentTrace";
import Panel from "../components/Panel";
import StatusPill from "../components/StatusPill";
import TaskTable from "../components/TaskTable";
import { useInvestigation } from "../state/InvestigationContext";

export default function TaskingPage() {
  const { investigation, isLive } = useInvestigation();
  if (!investigation) return null;

  const failed = investigation.trace.filter((e) => !e.ok);

  return (
    <>
      <Panel index="02" title="INVESTIGATION STATUS" scanning={isLive}>
        <div className="trace-row">
          <StatusPill value={investigation.status} />
          <span className="mono-label">iteration {investigation.iteration}</span>
          <span className="mono-label">{investigation.a2a_calls} a2a calls</span>
          <span className="mono-label">{investigation.evidence.length} evidence records</span>
        </div>
        {investigation.stopped_reason && (
          <div className={investigation.status === "complete" ? "note-banner" : "error-banner"}>
            {investigation.stopped_reason}
          </div>
        )}
      </Panel>

      {failed.length > 0 && (
        <Panel index="02" title={`AGENT FAULTS (${failed.length})`} variant="error">
          <AgentTrace events={failed} />
        </Panel>
      )}

      <Panel index="02" title="TASKING QUEUE">
        <TaskTable tasks={investigation.tasks} />
      </Panel>
    </>
  );
}
