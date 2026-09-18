import { ArrowUpDown, Boxes, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SideDrawer, { Field } from "../components/common/SideDrawer";
import { ConfidenceMeter, SourceBadge } from "../components/common/indicators";
import { Badge, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { cn, formatStamp } from "../lib/utils";
import { STATUS_TONE, evidenceRows, type EvidenceRow } from "../selectors/intel";
import { useInvestigation } from "../state/InvestigationContext";

type SortKey = "date" | "confidence" | "status" | "type";

export default function EvidenceExplorerPage() {
  const { investigation } = useInvestigation();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<SortKey>("date");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => evidenceRows(investigation), [investigation]);
  const focusId = params.get("focus");
  const selected = rows.find((r) => r.record.evidence_id === focusId) ?? null;

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort) {
        case "confidence":
          return (a.record.relevance_score - b.record.relevance_score) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "type":
          return a.record.provenance.source_type.localeCompare(b.record.provenance.source_type) * dir;
        default:
          return (
            (new Date(a.record.provenance.retrieved_at).getTime() -
              new Date(b.record.provenance.retrieved_at).getTime()) *
            dir
          );
      }
    });
  }, [rows, sort, asc]);

  function toggleSort(key: SortKey) {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  }

  function open(row: EvidenceRow | null) {
    if (row) params.set("focus", row.record.evidence_id);
    else params.delete("focus");
    setParams(params, { replace: true });
  }

  const header = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-[0.12em] transition-colors",
          sort === key ? "text-accent" : "text-dim hover:text-muted"
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <>
      <Panel>
        <PanelHeader
          title="Evidence Explorer"
          icon={<Boxes className="h-3.5 w-3.5" />}
          meta={`${rows.length} items`}
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No evidence collected"
            hint="Evidence appears here once the collector returns records for an investigation."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] border-collapse text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-[0.12em] text-dim">
                    Evidence ID
                  </th>
                  {header("type", "Type")}
                  <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-[0.12em] text-dim">
                    Source
                  </th>
                  {header("date", "Collected")}
                  <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-[0.12em] text-dim">
                    Rel.
                  </th>
                  {header("confidence", "Relevance")}
                  {header("status", "Status")}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((row) => (
                  <tr
                    key={row.record.evidence_id}
                    onClick={() => open(row)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-raised/50",
                      row.status === "CONFLICTING" && "bg-critical/5",
                      focusId === row.record.evidence_id && "bg-accent/10"
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono text-2xs text-dim">
                      {row.record.evidence_id}
                    </td>
                    <td className="px-3 py-1.5">
                      <SourceBadge type={row.record.provenance.source_type} />
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-1.5 text-xs text-muted">
                      {row.record.provenance.source_name}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-2xs tabular-nums text-dim">
                      {formatStamp(row.record.provenance.retrieved_at)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge
                        tone={
                          row.reliability === "A"
                            ? "verified"
                            : row.reliability === "B"
                              ? "review"
                              : "neutral"
                        }
                      >
                        {row.reliability}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5">
                      <ConfidenceMeter value={row.record.relevance_score} />
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SideDrawer
        open={!!selected}
        onOpenChange={(v) => !v && open(null)}
        title={selected?.record.title || selected?.record.provenance.source_name || "Evidence"}
        subtitle={selected?.record.evidence_id}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>
              <SourceBadge type={selected.record.provenance.source_type} />
              <Badge tone="neutral">RELIABILITY {selected.reliability}</Badge>
            </div>

            <section>
              <p className="panel-title mb-2">Collection Metadata</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Source" value={selected.record.provenance.source_name} />
                <Field label="Collector" value={selected.record.provenance.collector} />
                <Field
                  label="Retrieved"
                  value={formatStamp(selected.record.provenance.retrieved_at)}
                />
                <Field
                  label="Published"
                  value={
                    selected.record.provenance.published_at
                      ? formatStamp(selected.record.provenance.published_at)
                      : "—"
                  }
                />
                <Field label="Query" value={selected.record.provenance.query ?? "—"} />
                <Field
                  label="Relevance"
                  value={selected.record.relevance_score.toFixed(2)}
                />
              </div>
              {selected.record.provenance.source_url && (
                <a
                  href={selected.record.provenance.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 break-all font-mono text-2xs text-accent hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {selected.record.provenance.source_url}
                </a>
              )}
            </section>

            <section>
              <p className="panel-title mb-2">Cited By</p>
              {selected.citedBy.length ? (
                <ul className="space-y-1">
                  {selected.citedBy.map((heading) => (
                    <li key={heading} className="text-xs text-ink">
                      · {heading}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-dim">
                  Not cited in the current draft — collected but unused by the analyst.
                </p>
              )}
            </section>

            <section>
              <p className="panel-title mb-2">Associated Entities</p>
              <div className="flex flex-wrap gap-1.5">
                {(investigation?.entities?.entities ?? [])
                  .filter((e) => e.evidence_ids.includes(selected.record.evidence_id))
                  .map((e) => (
                    <Badge key={e.canonical_id} tone="accent">
                      {e.name}
                    </Badge>
                  )) || null}
                {!(investigation?.entities?.entities ?? []).some((e) =>
                  e.evidence_ids.includes(selected.record.evidence_id)
                ) && <p className="text-xs text-dim">No entities resolved from this record.</p>}
              </div>
            </section>

            <section>
              <p className="panel-title mb-2">Content</p>
              <pre className="whitespace-pre-wrap break-words rounded-sm border border-line bg-base p-3 font-mono text-2xs leading-relaxed text-muted">
                {selected.record.content}
              </pre>
            </section>
          </div>
        )}
      </SideDrawer>
    </>
  );
}
