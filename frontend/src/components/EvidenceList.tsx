import { useState } from "react";
import type { EvidenceRecord } from "../api/types";

const PREVIEW_LEN = 220;

function EvidenceItem({ record }: { record: EvidenceRecord }) {
  const [expanded, setExpanded] = useState(false);
  const long = record.content.length > PREVIEW_LEN;
  const shown = expanded || !long ? record.content : record.content.slice(0, PREVIEW_LEN) + "…";

  return (
    <li className="evidence-item">
      <div className="trace-row">
        <span className="evidence-title">{record.title || record.provenance.source_name}</span>
        <span className="pill pill-neutral">{record.provenance.source_type}</span>
        <span className="muted">relevance {(record.relevance_score * 100).toFixed(0)}%</span>
      </div>
      <div className="evidence-meta muted">
        <span>{record.evidence_id}</span>
        {" · "}
        <span>collector: {record.provenance.collector}</span>
        {record.provenance.query && (
          <>
            {" · "}
            <span>query: "{record.provenance.query}"</span>
          </>
        )}
        {" · "}
        <span>retrieved {new Date(record.provenance.retrieved_at).toLocaleString()}</span>
      </div>
      {record.provenance.source_url && (
        <div className="evidence-meta">
          <a href={record.provenance.source_url} target="_blank" rel="noreferrer">
            {record.provenance.source_url}
          </a>
        </div>
      )}
      <p className="evidence-content">{shown}</p>
      {long && (
        <button type="button" className="link-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "show less" : "show more"}
        </button>
      )}
    </li>
  );
}

export default function EvidenceList({ records }: { records: EvidenceRecord[] }) {
  if (records.length === 0) {
    return <p className="empty-note">NO EVIDENCE — collection has not returned records yet.</p>;
  }

  return (
    <ul className="evidence-list">
      {records.map((r) => (
        <EvidenceItem key={r.evidence_id} record={r} />
      ))}
    </ul>
  );
}
