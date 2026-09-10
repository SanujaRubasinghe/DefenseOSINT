import CriticFindings from "../components/CriticFindings";
import Panel from "../components/Panel";
import { useInvestigation } from "../state/InvestigationContext";

export default function AssessmentPage() {
  const { investigation } = useInvestigation();
  if (!investigation) return null;

  return (
    <Panel
      index="04"
      title="CRITIC ASSESSMENT"
      meta={
        <span className="mono-label">
          {investigation.assessments.length} iteration
          {investigation.assessments.length === 1 ? "" : "s"} on record
        </span>
      }
    >
      <CriticFindings assessments={investigation.assessments} />
    </Panel>
  );
}
