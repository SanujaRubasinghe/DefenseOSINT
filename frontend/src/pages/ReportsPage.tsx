import { Download, FileText, Save } from "lucide-react";
import { useMemo } from "react";
import { ConfidenceMeter, SourceBadge } from "../components/common/indicators";
import { Badge, Button, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { formatStamp } from "../lib/utils";
import { evidenceRows } from "../selectors/intel";
import { useInvestigation } from "../state/InvestigationContext";

export default function ReportsPage() {
  const { investigation } = useInvestigation();
  const draft = investigation?.draft;
  const rows = useMemo(() => evidenceRows(investigation), [investigation]);
  const assessment = investigation?.assessments[investigation.assessments.length - 1];

  const cited = rows.filter((r) => r.citedBy.length > 0);
  const sources = new Set(investigation?.evidence.map((e) => e.provenance.source_name) ?? []);

  /** Export the report as Markdown built from the real draft. */
  function exportMarkdown() {
    if (!draft || !investigation) return;
    const lines = [
      `# ${draft.title}`,
      "",
      `**Run:** ${investigation.investigation_id}  `,
      `**Objective:** ${investigation.objective}  `,
      `**Version:** ${draft.version}  `,
      `**Overall confidence:** ${(draft.overall_confidence * 100).toFixed(0)}%`,
      "",
      "## Executive Summary",
      "",
      draft.executive_summary,
      "",
      "## Key Findings",
      "",
      ...draft.sections.flatMap((s) => [
        `### ${s.heading}`,
        "",
        s.body,
        "",
        ...(s.caveats.length ? [`> Caveats: ${s.caveats.join("; ")}`, ""] : []),
        `Evidence: ${s.evidence_ids.join(", ") || "none"}`,
        "",
      ]),
      "## Methodology",
      "",
      `Multi-agent collection across ${sources.size} sources, ${investigation.evidence.length} evidence records, ${investigation.a2a_calls} agent-to-agent calls over ${investigation.iteration + 1} iteration(s).`,
      "",
      "## Limitations",
      "",
      assessment
        ? `Citation coverage ${(assessment.citation_coverage * 100).toFixed(0)}%. Critic verdict: ${assessment.passed ? "passed" : "failed"}. ${assessment.findings.length} finding(s) raised.`
        : "No critic assessment was recorded for this run.",
      "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${investigation.investigation_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!draft) {
    return (
      <Panel>
        <PanelHeader title="Reports" icon={<FileText className="h-3.5 w-3.5" />} />
        <EmptyState
          title="No report"
          hint="A report is generated from the analyst's draft. Run a collection through to synthesis first."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Intelligence Report"
          icon={<FileText className="h-3.5 w-3.5" />}
          meta={`v${draft.version}`}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled title="Drafts are held by the planner">
                <Save className="h-3 w-3" />
                Save Draft
              </Button>
              <Button size="sm" variant="default" onClick={exportMarkdown}>
                <Download className="h-3 w-3" />
                Export
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 border-b border-line p-3 md:grid-cols-4">
          {[
            ["Run", investigation!.investigation_id],
            ["Status", investigation!.status.toUpperCase()],
            ["Sources", String(sources.size)],
            ["Evidence cited", `${cited.length}/${rows.length}`],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="metadata uppercase tracking-[0.12em]">{k}</p>
              <p className="mt-0.5 font-mono text-xs text-ink">{v}</p>
            </div>
          ))}
        </div>

        <article className="space-y-5 p-4">
          <header>
            <h1 className="text-lg font-semibold tracking-tight text-ink">{draft.title}</h1>
            <p className="metadata mt-1">{investigation!.objective}</p>
          </header>

          <section>
            <p className="panel-title mb-1.5">Executive Summary</p>
            <p className="text-sm leading-relaxed text-ink">{draft.executive_summary}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="metadata w-32 uppercase">Overall confidence</span>
              <ConfidenceMeter value={draft.overall_confidence} />
            </div>
          </section>

          <section>
            <p className="panel-title mb-2">Key Findings</p>
            <div className="space-y-3">
              {draft.sections.map((s, i) => (
                <div key={i} className="rounded-sm border border-line bg-base p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium text-ink">
                      <span className="metadata mr-2">{String(i + 1).padStart(2, "0")}</span>
                      {s.heading}
                    </h2>
                    <ConfidenceMeter value={s.confidence} />
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                    {s.body}
                  </p>
                  {s.caveats.map((c, j) => (
                    <p key={j} className="mt-1 font-mono text-2xs text-review">
                      · {c}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="panel-title mb-1.5">Methodology</p>
            <p className="text-xs leading-relaxed text-muted">
              Multi-agent collection across {sources.size} distinct sources yielding{" "}
              {investigation!.evidence.length} evidence records, via {investigation!.a2a_calls}{" "}
              agent-to-agent calls over {investigation!.iteration + 1} iteration
              {investigation!.iteration === 0 ? "" : "s"}. Entity resolution produced{" "}
              {investigation!.entities?.entities.length ?? 0} entities and{" "}
              {investigation!.entities?.relationships.length ?? 0} relationships.
            </p>
          </section>

          <section>
            <p className="panel-title mb-2">Supporting Evidence</p>
            {cited.length === 0 ? (
              <p className="text-xs text-dim">No evidence was cited in this draft.</p>
            ) : (
              <ul className="divide-y divide-line rounded-sm border border-line">
                {cited.slice(0, 25).map((row) => (
                  <li key={row.record.evidence_id} className="flex items-center gap-2 px-3 py-1.5">
                    <SourceBadge type={row.record.provenance.source_type} />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">
                      {row.record.title || row.record.provenance.source_name}
                    </span>
                    <Badge tone="neutral">{row.reliability}</Badge>
                    <span className="metadata hidden shrink-0 tabular-nums sm:inline">
                      {formatStamp(row.record.provenance.retrieved_at).slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="panel-title mb-1.5">Limitations</p>
            {assessment ? (
              <p className="text-xs leading-relaxed text-muted">
                Citation coverage {(assessment.citation_coverage * 100).toFixed(0)}%. Critic verdict:{" "}
                <span className={assessment.passed ? "text-verified" : "text-critical"}>
                  {assessment.passed ? "passed" : "failed"}
                </span>
                . {assessment.findings.length} finding
                {assessment.findings.length === 1 ? "" : "s"} raised against this draft.
                {investigation!.stopped_reason && ` Run halted: ${investigation!.stopped_reason}.`}
              </p>
            ) : (
              <p className="text-xs text-dim">
                This draft was not verified by the critic — treat findings as unassessed.
              </p>
            )}
          </section>
        </article>
      </Panel>
    </div>
  );
}
