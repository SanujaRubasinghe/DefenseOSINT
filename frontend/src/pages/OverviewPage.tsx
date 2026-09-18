import { Activity, Map, Radar, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import MetricCard from "../components/dashboard/MetricCard";
import { SourceBadge, StatusIndicator } from "../components/common/indicators";
import TacticalMap from "../components/maps/TacticalMap";
import { Button, EmptyState, Panel, PanelHeader, Skeleton } from "../components/ui/primitives";
import { extractContacts } from "../intel/parse";
import { formatClock } from "../lib/utils";
import { kpis, pipelineStages } from "../selectors/intel";
import { useInvestigation } from "../state/InvestigationContext";

export default function OverviewPage() {
  const { investigation, start, submitting, networkOnline, isLive } = useInvestigation();
  const navigate = useNavigate();
  const [objective, setObjective] = useState(
    "Sri Lanka Air Force aircraft fleet and satellite surveillance capability"
  );
  const [error, setError] = useState<string | null>(null);

  const cards = useMemo(() => kpis(investigation), [investigation]);
  const stages = useMemo(() => pipelineStages(investigation), [investigation]);
  const contacts = useMemo(
    () => extractContacts(investigation?.evidence ?? []),
    [investigation?.evidence]
  );
  const recent = useMemo(
    () => [...(investigation?.trace ?? [])].reverse().slice(0, 14),
    [investigation?.trace]
  );

  async function launch() {
    setError(null);
    if (objective.trim().length < 10) return setError("Objective must be at least 10 characters.");
    try {
      await start(objective.trim());
      navigate("/agents");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      {/* tasking */}
      <Panel>
        <PanelHeader
          title="New Collection"
          icon={<Radar className="h-3.5 w-3.5" />}
          meta={networkOnline ? "gateway online" : "gateway unreachable"}
        />
        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && launch()}
            placeholder="Collection objective"
            className="h-9 flex-1 rounded-sm border border-line bg-base px-3 text-sm text-ink placeholder:text-dim focus:border-accent/60 focus:outline-none"
          />
          <Button variant="default" size="md" onClick={launch} disabled={submitting || !networkOnline}>
            <Send className="h-3.5 w-3.5" />
            {submitting ? "TASKING…" : "BEGIN COLLECTION"}
          </Button>
        </div>
        {error && <p className="px-3 pb-3 text-xs text-critical">{error}</p>}
      </Panel>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((kpi) => (
          <MetricCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* pipeline */}
      <Panel>
        <PanelHeader title="Collection Pipeline" meta="data → collection → correlation → assessment" />
        <div className="flex flex-wrap items-stretch gap-px bg-line p-px">
          {stages.map((s) => (
            <div key={s.key} className="flex min-w-[9rem] flex-1 flex-col gap-1 bg-panel px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="metadata uppercase">{s.label}</span>
                <StatusIndicator
                  status={
                    s.state === "complete"
                      ? "operational"
                      : s.state === "fault"
                        ? "critical"
                        : s.state === "active"
                          ? "active"
                          : "idle"
                  }
                />
              </div>
              <span className="truncate text-xs text-ink">{s.detail}</span>
              <span className="metadata tabular-nums">
                {s.at ? formatClock(s.at) : "—"}
                {s.durationMs != null && ` · ${s.durationMs}ms`}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* GEOINT */}
        <Panel className="min-w-0">
          <PanelHeader
            title="Geospatial Intelligence"
            icon={<Map className="h-3.5 w-3.5" />}
            meta={`${contacts.length} positioned contacts`}
          />
          <div className="p-3">
            {contacts.length > 0 ? (
              <TacticalMap contacts={contacts} />
            ) : (
              <EmptyState
                icon={<Map className="h-6 w-6" />}
                title="No positioned contacts"
                hint="Aircraft and infrastructure records carry coordinates. Run a collection whose objective mentions aviation or infrastructure to populate this plot."
              />
            )}
          </div>
        </Panel>

        {/* activity */}
        <Panel className="flex min-w-0 flex-col">
          <PanelHeader
            title="Recent Intelligence Activity"
            icon={<Activity className="h-3.5 w-3.5" />}
            meta={isLive ? "live" : undefined}
          />
          <div className="max-h-[26rem] flex-1 overflow-y-auto">
            {investigation ? (
              <ol className="divide-y divide-line">
                {recent.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex items-start gap-2.5 px-3 py-2">
                    <StatusIndicator status={e.ok ? "operational" : "critical"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate font-mono text-2xs uppercase text-accent">
                          {e.agent.replace("-agent", "")}
                        </span>
                        <span className="truncate text-xs text-ink">{e.action}</span>
                        <span className="metadata ml-auto shrink-0 tabular-nums">
                          {formatClock(e.at)}
                        </span>
                      </div>
                      {e.detail && (
                        <p
                          className={`mt-0.5 truncate text-2xs ${e.ok ? "text-dim" : "text-critical"}`}
                        >
                          {e.ok ? e.detail : `FAULT · ${e.detail}`}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : submitting ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <EmptyState title="No activity" hint="Task a collection to populate the feed." />
            )}
          </div>
        </Panel>
      </div>

      {/* source mix */}
      {investigation && investigation.evidence.length > 0 && (
        <Panel>
          <PanelHeader title="Source Composition" meta={`${investigation.evidence.length} records`} />
          <div className="flex flex-wrap gap-2 p-3">
            {Object.entries(
              investigation.evidence.reduce<Record<string, number>>((acc, r) => {
                acc[r.provenance.source_type] = (acc[r.provenance.source_type] ?? 0) + 1;
                return acc;
              }, {})
            )
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <span key={type} className="flex items-center gap-1.5">
                  <SourceBadge type={type} />
                  <span className="metadata tabular-nums">{count}</span>
                </span>
              ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
