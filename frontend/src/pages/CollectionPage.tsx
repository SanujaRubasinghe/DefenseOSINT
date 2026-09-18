import { Radar } from "lucide-react";
import { useMemo } from "react";
import { Badge, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { SourceBadge, StatusIndicator, type Status } from "../components/common/indicators";
import { cn } from "../lib/utils";
import { useInvestigation } from "../state/InvestigationContext";

const TASK_STATUS: Record<string, Status> = {
  pending: "idle",
  running: "active",
  complete: "operational",
  failed: "critical",
};

export default function CollectionPage() {
  const { investigation } = useInvestigation();
  const tasks = investigation?.tasks ?? [];

  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of investigation?.evidence ?? []) {
      const key = r.provenance.collector.replace("collector-agent:", "");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [investigation?.evidence]);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Collection Tasking"
          icon={<Radar className="h-3.5 w-3.5" />}
          meta={`${tasks.length} tasks · iteration ${investigation?.iteration ?? 0}`}
        />
        {tasks.length === 0 ? (
          <EmptyState
            title="No tasking"
            hint="The planner decomposes an objective into collection tasks. Start a collection from Overview."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead className="border-b border-line">
                <tr>
                  {["Type", "Objective", "Status", "Attempts", "Evidence", "Fault"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-[0.12em] text-dim"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tasks.map((t) => (
                  <tr
                    key={t.task.task_id}
                    className={cn("transition-colors hover:bg-raised/40", t.error && "bg-critical/5")}
                  >
                    <td className="px-3 py-1.5">
                      <Badge tone="accent">{t.task.type}</Badge>
                    </td>
                    <td className="max-w-[26rem] px-3 py-1.5 text-xs text-ink">{t.task.objective}</td>
                    <td className="px-3 py-1.5">
                      <StatusIndicator
                        status={TASK_STATUS[t.status] ?? "idle"}
                        label={t.status}
                        pulse={t.status === "running"}
                      />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted">
                      {t.attempts}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted">
                      {t.evidence_count}
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-1.5 font-mono text-2xs text-critical">
                      {t.error ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Collector Tools" meta={`${bySource.length} tools returned records`} />
        {bySource.length === 0 ? (
          <EmptyState title="No collection yet" />
        ) : (
          <ul className="divide-y divide-line">
            {bySource.map(([tool, count]) => {
              const max = bySource[0][1] || 1;
              return (
                <li key={tool} className="flex items-center gap-3 px-3 py-2">
                  <SourceBadge type={tool} />
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
                    <div className="h-full bg-accent" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="metadata tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
