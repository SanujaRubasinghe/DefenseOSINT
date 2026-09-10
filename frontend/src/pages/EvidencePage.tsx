import EvidenceList from "../components/EvidenceList";
import Panel from "../components/Panel";
import { useInvestigation } from "../state/InvestigationContext";

export default function EvidencePage() {
  const { investigation } = useInvestigation();
  if (!investigation) return null;

  const sources = new Set(investigation.evidence.map((e) => e.provenance.source_name));

  return (
    <Panel
      index="03"
      title={`EVIDENCE LOG (${investigation.evidence.length})`}
      meta={<span className="mono-label">{sources.size} distinct sources</span>}
    >
      <EvidenceList records={investigation.evidence} />
    </Panel>
  );
}
