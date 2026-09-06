import type { DraftSection, EvidenceRecord } from "../api/types";

function confidenceClass(c: number): string {
  if (c >= 0.7) return "pill-ok";
  if (c >= 0.45) return "pill-warn";
  return "pill-err";
}

export default function DraftSections({
  sections,
  evidenceById,
}: {
  sections: DraftSection[];
  evidenceById: Map<string, EvidenceRecord>;
}) {
  if (sections.length === 0) {
    return <p className="muted">No sections in this draft.</p>;
  }

  return (
    <div className="section-list">
      {sections.map((s, i) => (
        <article key={i} className="section-item">
          <div className="trace-row">
            <h3 className="section-heading">{s.heading}</h3>
            <span className={`pill ${confidenceClass(s.confidence)}`}>
              {(s.confidence * 100).toFixed(0)}% conf
            </span>
          </div>
          <p className="section-body">{s.body}</p>

          <div className="section-citations">
            {s.evidence_ids.length === 0 ? (
              <span className="chip chip-err">no citations</span>
            ) : (
              s.evidence_ids.map((id) => {
                const rec = evidenceById.get(id);
                return (
                  <span key={id} className="chip" title={rec?.content ?? "evidence not found"}>
                    {rec ? rec.title || rec.provenance.source_name : `${id} (missing)`}
                  </span>
                );
              })
            )}
          </div>

          {s.caveats.length > 0 && (
            <ul className="caveat-list">
              {s.caveats.map((c, j) => (
                <li key={j}>{c}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
