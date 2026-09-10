import { useMemo } from "react";
import DraftSections from "../components/DraftSections";
import Panel from "../components/Panel";
import { useInvestigation } from "../state/InvestigationContext";

export default function BriefPage() {
  const { investigation } = useInvestigation();
  const evidenceById = useMemo(
    () => new Map(investigation?.evidence.map((e) => [e.evidence_id, e]) ?? []),
    [investigation?.evidence]
  );

  if (!investigation) return null;
  const draft = investigation.draft;

  if (!draft) {
    return (
      <Panel index="05" title="INTELLIGENCE BRIEF">
        <p className="empty-note">
          NO BRIEF — the analyst has not synthesised a draft for this run yet.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      index="05"
      title="INTELLIGENCE BRIEF"
      meta={<span className="mono-label">v{draft.version}</span>}
    >
      <article className="brief">
        <h3 className="brief-title">{draft.title}</h3>
        <p className="brief-summary">{draft.executive_summary}</p>
        <div className="meter-row meter-row-compact">
          <span className="meter-label">overall confidence</span>
          <div className="meter-track">
            <div
              className="meter-fill meter-fill-ok"
              style={{ width: `${draft.overall_confidence * 100}%` }}
            />
          </div>
          <span className="meter-value">{(draft.overall_confidence * 100).toFixed(0)}%</span>
        </div>
        <DraftSections sections={draft.sections} evidenceById={evidenceById} />
      </article>
    </Panel>
  );
}
