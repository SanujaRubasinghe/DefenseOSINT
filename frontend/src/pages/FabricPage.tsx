import IntelligenceFabric from "../components/IntelligenceFabric";
import Panel from "../components/Panel";
import { useInvestigation } from "../state/InvestigationContext";

export default function FabricPage() {
  const { investigation, isLive } = useInvestigation();

  return (
    <>
      <Panel
        index="01"
        title="INTELLIGENCE FABRIC"
        meta={<span className="mono-label">agent network · live execution</span>}
        scanning={isLive}
      >
        <IntelligenceFabric />
      </Panel>

      {investigation?.stopped_reason && (
        <div className={investigation.status === "complete" ? "note-banner" : "error-banner"}>
          {investigation.stopped_reason}
        </div>
      )}
    </>
  );
}
