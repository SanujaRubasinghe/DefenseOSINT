import { Network, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Entity } from "../api/types";
import EntityGraph from "../components/entities/EntityGraph";
import SideDrawer, { Field } from "../components/common/SideDrawer";
import { ConfidenceMeter } from "../components/common/indicators";
import { Badge, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { cn } from "../lib/utils";
import { useInvestigation } from "../state/InvestigationContext";

const TYPE_TONE: Record<string, "accent" | "verified" | "review" | "neutral"> = {
  PERSON: "accent",
  ORG: "review",
  LOCATION: "verified",
  EVENT: "neutral",
};

export default function EntitiesPage() {
  const { investigation } = useInvestigation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const bundle = investigation?.entities ?? null;
  const entities = bundle?.entities ?? [];
  const focusId = params.get("focus");
  const selected = entities.find((e) => e.canonical_id === focusId) ?? null;

  const types = useMemo(() => [...new Set(entities.map((e) => e.type))].sort(), [entities]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities
      .filter((e) => (typeFilter === "all" || e.type === typeFilter) && (!q || e.name.toLowerCase().includes(q)))
      .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
  }, [entities, query, typeFilter]);

  function focus(entity: Entity | null) {
    if (entity) params.set("focus", entity.canonical_id);
    else params.delete("focus");
    setParams(params, { replace: true });
  }

  const relations = (bundle?.relationships ?? []).filter(
    (r) => !selected || r.subject_id === selected.canonical_id || r.object_id === selected.canonical_id
  );
  const nameById = new Map(entities.map((e) => [e.canonical_id, e.name]));

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
        <Panel className="flex min-w-0 flex-col">
          <PanelHeader
            title="Entity Register"
            icon={<Network className="h-3.5 w-3.5" />}
            meta={`${filtered.length}/${entities.length}`}
          />
          <div className="flex flex-col gap-2 border-b border-line p-2.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entities…"
                className="h-7 w-full rounded-sm border border-line bg-base pl-7 pr-2 text-xs text-ink placeholder:text-dim focus:border-accent/60 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {["all", ...types].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase transition-colors",
                    typeFilter === t
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-line text-dim hover:border-line-bright hover:text-muted"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[32rem] flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState
                title={entities.length ? "No matches" : "No entities resolved"}
                hint={
                  entities.length
                    ? undefined
                    : "The entity agent extracts these from collected evidence."
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((e) => (
                  <li key={e.canonical_id}>
                    <button
                      onClick={() => focus(e)}
                      className={cn(
                        "w-full px-3 py-2 text-left transition-colors hover:bg-raised/50",
                        focusId === e.canonical_id && "bg-accent/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={TYPE_TONE[e.type] ?? "neutral"}>{e.type}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{e.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <ConfidenceMeter value={e.confidence} />
                        <span className="metadata">{e.evidence_ids.length} ev</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="Relationship Graph"
            meta={`${bundle?.relationships.length ?? 0} links`}
          />
          <div className="p-3">
            {entities.length ? (
              <EntityGraph
                entities={filtered.slice(0, 40)}
                relationships={bundle?.relationships ?? []}
                focusId={focusId}
                onFocus={(id) => focus(entities.find((e) => e.canonical_id === id) ?? null)}
              />
            ) : (
              <EmptyState
                icon={<Network className="h-6 w-6" />}
                title="No graph"
                hint="Entities and their relationships appear here after extraction."
              />
            )}
          </div>
        </Panel>
      </div>

      <SideDrawer
        open={!!selected}
        onOpenChange={(v) => !v && focus(null)}
        title={selected?.name ?? "Entity"}
        subtitle={selected?.canonical_id}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TYPE_TONE[selected.type] ?? "neutral"}>{selected.type}</Badge>
              <ConfidenceMeter value={selected.confidence} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Evidence records" value={selected.evidence_ids.length} />
              <Field label="Aliases" value={selected.aliases.length || "—"} />
            </div>

            {selected.aliases.length > 0 && (
              <section>
                <p className="panel-title mb-2">Surface Forms</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.aliases.map((a) => (
                    <Badge key={a} tone="neutral">
                      {a}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            <section>
              <p className="panel-title mb-2">Relationships</p>
              {relations.length ? (
                <ul className="space-y-1.5">
                  {relations.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-ink">{nameById.get(r.subject_id) ?? r.subject_id}</span>
                      <Badge tone="accent">{r.predicate.replace(/_/g, " ")}</Badge>
                      <span className="text-ink">{nameById.get(r.object_id) ?? r.object_id}</span>
                      <span className="metadata ml-auto">{r.confidence.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-dim">No relationships extracted for this entity.</p>
              )}
            </section>

            <section>
              <p className="panel-title mb-2">Supporting Evidence</p>
              <ul className="space-y-1">
                {selected.evidence_ids.slice(0, 20).map((id) => {
                  const rec = investigation?.evidence.find((e) => e.evidence_id === id);
                  return (
                    <li key={id} className="truncate text-xs text-muted">
                      <span className="metadata mr-2">{id}</span>
                      {rec?.title ?? rec?.provenance.source_name ?? "—"}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </SideDrawer>
    </>
  );
}
