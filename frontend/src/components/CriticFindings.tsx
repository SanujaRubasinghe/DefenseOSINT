import type { CriticAssessment } from "../api/types";
import StatusPill from "./StatusPill";

export default function CriticFindings({ assessments }: { assessments: CriticAssessment[] }) {
  if (assessments.length === 0) {
    return <p className="empty-note">NO ASSESSMENT ON RECORD — critic has not run yet.</p>;
  }
  const latest = assessments[assessments.length - 1];
  const coveragePct = Math.round(latest.citation_coverage * 100);

  return (
    <div>
      <div className="trace-row">
        <StatusPill value={latest.passed ? "passed" : "failed"} />
        <span className="mono-label">iteration {latest.iteration}</span>
      </div>

      <div className="meter-row">
        <span className="meter-label">citation coverage</span>
        <div className="meter-track">
          <div
            className={`meter-fill ${coveragePct >= 70 ? "meter-fill-ok" : "meter-fill-warn"}`}
            style={{ width: `${coveragePct}%` }}
          />
        </div>
        <span className="meter-value">{coveragePct}%</span>
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
