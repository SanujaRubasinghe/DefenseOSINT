import AgentTrace from "../components/AgentTrace";
import Panel from "../components/Panel";
import { useInvestigation } from "../state/InvestigationContext";

export default function TracePage() {
  const { investigation, isLive } = useInvestigation();
  if (!investigation) return null;

  const failed = investigation.trace.filter((e) => !e.ok);

  return (
    <>
      {failed.length > 0 && (
        <Panel index="06" title={`AGENT FAULTS (${failed.length})`} variant="error">
          <AgentTrace events={failed} />
        </Panel>
      )}

      <Panel
        index="06"
        title="RAW TRACE"
        meta={<span className="mono-label">{investigation.trace.length} events · unpaced</span>}
        scanning={isLive}
      >
        <AgentTrace events={investigation.trace} />
      </Panel>
    </>
  );
}
