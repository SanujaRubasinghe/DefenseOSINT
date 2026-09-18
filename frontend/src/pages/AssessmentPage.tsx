import { Bot, ScrollText, UserCheck } from "lucide-react";
import { ConfidenceMeter } from "../components/common/indicators";
import { Badge, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { cn } from "../lib/utils";
import { useInvestigation } from "../state/InvestigationContext";

const SEVERITY_TONE = {
  minor: "neutral",
  major: "review",
  critical: "critical",
} as const;

export default function AssessmentPage() {
  const { investigation } = useInvestigation();
  const assessments = investigation?.assessments ?? [];
  const latest = assessments[assessments.length - 1];
  const draft = investigation?.draft;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Critic Assessment"
          icon={<ScrollText className="h-3.5 w-3.5" />}
          meta={`${assessments.length} iteration${assessments.length === 1 ? "" : "s"}`}
        />
        {!latest ? (
          <EmptyState
            title="No assessment on record"
            hint="The critic verifies the analyst's draft against collected evidence once synthesis completes."
          />
        ) : (
          <div className="space-y-4 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={latest.passed ? "verified" : "critical"}>
                {latest.passed ? "PASSED" : "FAILED"}
              </Badge>
              <span className="metadata">iteration {latest.iteration}</span>
              {latest.requires_recollection && <Badge tone="review">RECOLLECTION REQUESTED</Badge>}
            </div>

            <div className="flex items-center gap-3">
              <span className="metadata w-36 uppercase">Citation coverage</span>
              <ConfidenceMeter value={latest.citation_coverage} className="flex-1" />
            </div>

            {investigation?.stopped_reason && (
              <div
                className={cn(
                  "rounded-sm border px-3 py-2 font-mono text-2xs",
                  investigation.status === "complete"
                    ? "border-verified/40 bg-verified/10 text-verified"
                    : "border-review/40 bg-review/10 text-review"
                )}
              >
                {investigation.stopped_reason}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Machine findings kept visually distinct from analyst-authored text. */}
      {latest && latest.findings.length > 0 && (
        <Panel>
          <PanelHeader
            title="Automated Findings"
            icon={<Bot className="h-3.5 w-3.5" />}
            meta={`${latest.findings.length} raised by critic-agent`}
          />
          <ul className="divide-y divide-line">
            {latest.findings.map((f, i) => (
              <li key={i} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                  <Badge tone="neutral">{f.kind}</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink">{f.description}</p>
                {f.claim && (
                  <p className="mt-1 border-l-2 border-line-bright pl-2 font-mono text-2xs italic text-muted">
                    {f.claim}
                  </p>
                )}
                {f.suggested_queries.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {f.suggested_queries.map((q) => (
                      <Badge key={q} tone="accent">
                        {q}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {draft && (
        <Panel>
          <PanelHeader
            title="Analyst Assessment"
            icon={<UserCheck className="h-3.5 w-3.5" />}
            meta={`v${draft.version} · analyst-agent`}
          />
          <div className="space-y-4 p-3">
            <div>
              <p className="panel-title mb-1">Executive Assessment</p>
              <p className="text-sm leading-relaxed text-ink">{draft.executive_summary}</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="metadata w-36 uppercase">Overall confidence</span>
              <ConfidenceMeter value={draft.overall_confidence} className="flex-1" />
            </div>

            <div>
              <p className="panel-title mb-2">Key Findings</p>
              <ul className="space-y-3">
                {draft.sections.map((s, i) => (
                  <li key={i} className="rounded-sm border border-line bg-base p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-ink">{s.heading}</h3>
                      <ConfidenceMeter value={s.confidence} />
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                      {s.body}
                    </p>
                    {s.caveats.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {s.caveats.map((c, j) => (
                          <li key={j} className="font-mono text-2xs text-review">
                            · {c}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="metadata mt-2">
                      {s.evidence_ids.length} supporting evidence record
                      {s.evidence_ids.length === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
