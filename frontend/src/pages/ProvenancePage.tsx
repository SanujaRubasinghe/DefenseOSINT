import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { StatusIndicator, type Status } from "../components/common/indicators";
import { Badge, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { cn, formatStamp } from "../lib/utils";
import { pipelineStages } from "../selectors/intel";
import { useInvestigation } from "../state/InvestigationContext";

const STATE_STATUS: Record<string, Status> = {
  pending: "idle",
  active: "active",
  complete: "operational",
  fault: "critical",
};

export default function ProvenancePage() {
  const { investigation } = useInvestigation();
  const stages = useMemo(() => pipelineStages(investigation), [investigation]);
  const trace = investigation?.trace ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Panel>
        <PanelHeader
          title="Evidence Provenance"
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          meta="source → assessment"
        />
        {!investigation ? (
          <EmptyState
            title="No chain yet"
            hint="The provenance chain is built from the planner's own trace. Start a collection to populate it."
          />
        ) : (
          <ol className="p-3">
            {stages.map((s, i) => (
              <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                {/* connector */}
                {i < stages.length - 1 && (
                  <span
                    className={cn(
                      "absolute left-[7px] top-4 h-full w-px",
                      s.state === "complete" ? "bg-verified/40" : "bg-line"
                    )}
                  />
                )}
                <span className="relative z-10 mt-1">
                  <StatusIndicator
                    status={STATE_STATUS[s.state]}
                    pulse={s.state === "active"}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-2xs uppercase tracking-[0.12em] text-ink">
                      {s.label}
                    </span>
                    {s.agent && <Badge tone="neutral">{s.agent.replace("-agent", "")}</Badge>}
                    {s.durationMs != null && (
                      <span className="metadata tabular-nums">{s.durationMs}ms</span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      s.state === "fault" ? "text-critical" : "text-muted"
                    )}
                  >
                    {s.detail}
                  </p>
                  <p className="metadata mt-0.5 tabular-nums">
                    {s.at ? formatStamp(s.at) : "not reached"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel className="flex min-w-0 flex-col">
        <PanelHeader title="Raw Trace" meta={`${trace.length} events · unpaced`} />
        {trace.length === 0 ? (
          <EmptyState title="No telemetry" />
        ) : (
          <ol className="max-h-[36rem] divide-y divide-line overflow-y-auto">
            {[...trace].reverse().map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className={cn("px-3 py-1.5", !e.ok && "bg-critical/5")}
              >
                <div className="flex items-baseline gap-2">
                  <span className="metadata tabular-nums">{formatStamp(e.at).slice(11)}</span>
                  <span className="font-mono text-2xs uppercase text-accent">
                    {e.agent.replace("-agent", "")}
                  </span>
                  <span className="truncate text-xs text-ink">{e.action}</span>
                  {e.duration_ms != null && (
                    <span className="metadata ml-auto shrink-0 tabular-nums">{e.duration_ms}ms</span>
                  )}
                </div>
                {e.detail && (
                  <p className={cn("truncate text-2xs", e.ok ? "text-dim" : "text-critical")}>
                    {e.ok ? e.detail : `FAULT · ${e.detail}`}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
