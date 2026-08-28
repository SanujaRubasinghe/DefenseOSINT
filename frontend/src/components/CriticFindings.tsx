import type { CriticAssessment } from "../api/types";
import StatusPill from "./StatusPill";

export default function CriticFindings({ assessments }: { assessments: CriticAssessment[] }) {
  if (assessments.length === 0) {
    return <p className="muted">No critic assessments yet.</p>;
  }
  const latest = assessments[assessments.length - 1];

  return (
    <div>
      <div className="trace-row">
        <StatusPill value={latest.passed ? "passed" : "failed"} />
        <span>iteration {latest.iteration}</span>
        <span>citation coverage {(latest.citation_coverage * 100).toFixed(0)}%</span>
      </div>
      {latest.findings.length > 0 && (
        <ul className="finding-list">
          {latest.findings.map((f, i) => (
            <li key={i} className={`finding-item finding-${f.severity}`}>
              <strong>[{f.severity}]</strong> {f.kind}: {f.description}
              {f.claim && <div className="finding-claim">claim: "{f.claim}"</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
