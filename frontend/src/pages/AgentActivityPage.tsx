import { Activity, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { deriveNetwork, type NodeRuntime } from "../agents/network";
import { NODES, type AgentId } from "../agents/topology";
import AgentNetwork, { type Selection } from "../components/AgentNetwork";
import SideDrawer, { Field } from "../components/common/SideDrawer";
import { StatusIndicator, type Status } from "../components/common/indicators";
import { Badge, Button, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { cn, formatClock } from "../lib/utils";
import { useInvestigation } from "../state/InvestigationContext";

const STATE_STATUS: Record<string, Status> = {
  idle: "idle",
  queued: "review",
  active: "active",
  completed: "operational",
  error: "critical",
};

export default function AgentActivityPage() {
  const { investigation, playback, isLive } = useInvestigation();
  const { playedEvents, packets, activeAgents, activeEdges, isReplaying, replay } = playback;
  const [selection, setSelection] = useState<Selection>(null);
  const [drawerId, setDrawerId] = useState<AgentId | null>(null);

  const runtime = useMemo(
    () => deriveNetwork(investigation, playedEvents, activeAgents),
    [investigation, playedEvents, activeAgents]
  );

  const drawerNode = drawerId ? NODES.find((n) => n.id === drawerId) : null;
  const drawerRuntime: NodeRuntime | null = drawerId ? runtime.get(drawerId) ?? null : null;

  return (
    <>
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Intelligence Fabric"
            icon={<Activity className="h-3.5 w-3.5" />}
            meta={
              investigation
                ? `${playedEvents.length}${isReplaying ? ` / ${investigation.trace.length}` : ""} events`
                : "no run"
            }
            action={
              investigation && investigation.trace.length > 0 ? (
                <Button size="sm" onClick={replay} disabled={isReplaying}>
                  <Play className="h-3 w-3" />
                  REPLAY
                </Button>
              ) : undefined
            }
          />
          <div className="p-3">
            {investigation ? (
              <>
                <div className="relative">
                  {isLive && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
                      <div className="h-px w-1/3 animate-sweep bg-gradient-to-r from-transparent via-accent to-transparent" />
                    </div>
                  )}
                  <AgentNetwork
                    runtime={runtime}
                    packets={packets}
                    activeEdges={activeEdges}
                    selection={selection}
                    onSelect={(next) => {
                      setSelection((cur) =>
                        cur && next && cur.type === next.type && cur.id === next.id ? null : next
                      );
                      if (next?.type === "node") setDrawerId(next.id);
                    }}
                  />
                </div>

                {/* execution path — stays legible when the graph scrolls off */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  {NODES.map((node, i) => {
                    const state = runtime.get(node.id)!.state;
                    return (
                      <span key={node.id} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-dim">→</span>}
                        <button
                          onClick={() => setDrawerId(node.id)}
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase transition-colors",
                            state === "active" && "border-accent/50 bg-accent/10 text-accent",
                            state === "completed" && "border-verified/40 text-verified",
                            state === "error" && "border-critical/50 text-critical",
                            state === "queued" && "border-review/40 text-review",
                            state === "idle" && "border-line text-dim"
                          )}
                        >
                          {node.label}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState
                icon={<Activity className="h-6 w-6" />}
                title="Mesh at rest"
                hint="Task a collection from Overview to watch the investigation move through the agents."
              />
            )}
          </div>
        </Panel>

        {/* agent cards */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {NODES.map((node) => {
            const rt = runtime.get(node.id)!;
            return (
              <button
                key={node.id}
                onClick={() => setDrawerId(node.id)}
                className="panel p-3 text-left transition-colors hover:border-line-bright"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {node.stage && <span className="metadata text-accent">{node.stage}</span>}
                    <span className="text-sm font-semibold text-ink">{node.label}</span>
                  </div>
                  <StatusIndicator
                    status={STATE_STATUS[rt.state]}
                    label={rt.state}
                    pulse={rt.state === "active"}
                  />
                </div>
                <p className="metadata mt-0.5 uppercase">{node.role}</p>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label="Calls" value={rt.calls} />
                  <Field label="Runtime" value={rt.totalMs ? `${rt.totalMs}ms` : "—"} />
                  <Field label="Last" value={rt.lastAction ?? "—"} />
                </div>

                {rt.metrics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rt.metrics.map((m) => (
                      <Badge key={m.label} tone="neutral">
                        {m.label} {m.value}
                      </Badge>
                    ))}
                  </div>
                )}
                {rt.error && (
                  <p className="mt-2 line-clamp-2 text-2xs text-critical">FAULT · {rt.error}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <SideDrawer
        open={!!drawerNode}
        onOpenChange={(v) => !v && setDrawerId(null)}
        title={drawerNode?.code ?? ""}
        subtitle={drawerNode ? `${drawerNode.label} · ${drawerNode.role}` : undefined}
      >
        {drawerRuntime && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusIndicator
                status={STATE_STATUS[drawerRuntime.state]}
                label={drawerRuntime.state}
                pulse={drawerRuntime.state === "active"}
              />
              {drawerRuntime.confidence != null && (
                <Badge tone="accent">CONF {drawerRuntime.confidence.toFixed(2)}</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Calls" value={drawerRuntime.calls} />
              <Field label="Total runtime" value={drawerRuntime.totalMs ? `${drawerRuntime.totalMs}ms` : "—"} />
              <Field label="Last action" value={drawerRuntime.lastAction ?? "—"} />
              <Field label="Last activity" value={drawerRuntime.lastAt ? formatClock(drawerRuntime.lastAt) : "—"} />
              {drawerRuntime.metrics.map((m) => (
                <Field key={m.label} label={m.label} value={m.value} />
              ))}
            </div>

            {drawerRuntime.error && (
              <div className="rounded-sm border border-critical/40 bg-critical/10 px-3 py-2 font-mono text-2xs text-critical">
                {drawerRuntime.error}
              </div>
            )}

            <section>
              <p className="panel-title mb-2">Recent Activity</p>
              {drawerRuntime.events.length ? (
                <ul className="divide-y divide-line">
                  {[...drawerRuntime.events].reverse().slice(0, 12).map((e, i) => (
                    <li key={i} className="flex items-baseline gap-2 py-1.5">
                      <span className="metadata tabular-nums">{formatClock(e.at)}</span>
                      <span className="text-xs text-ink">{e.action}</span>
                      {e.duration_ms != null && (
                        <span className="metadata ml-auto tabular-nums">{e.duration_ms}ms</span>
                      )}
                      {!e.ok && <span className="text-2xs text-critical">FAULT</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-dim">No activity recorded for this agent.</p>
              )}
            </section>
          </div>
        )}
      </SideDrawer>
    </>
  );
}
