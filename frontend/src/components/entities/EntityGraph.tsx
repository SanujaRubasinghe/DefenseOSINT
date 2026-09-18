import { Building2, CalendarDays, MapPin, Users } from "lucide-react";
import { useMemo } from "react";
import type { Entity, Relationship } from "../../api/types";
import { cn } from "../../lib/utils";

const W = 760;
const H = 420;

const TYPE_ICON: Record<string, typeof Users> = {
  PERSON: Users,
  ORG: Building2,
  LOCATION: MapPin,
  EVENT: CalendarDays,
};

const TYPE_RING: Record<string, string> = {
  PERSON: "border-accent/50 text-accent",
  ORG: "border-review/50 text-review",
  LOCATION: "border-verified/50 text-verified",
  EVENT: "border-line-bright text-muted",
};

interface Positioned {
  x: number;
  y: number;
  e: Entity;
}

/**
 * Deterministic layout, not a force simulation: the same investigation must
 * look the same on every visit. Two modes:
 *
 *  - No focus: entities grouped into concentric rings by type — an overview
 *    of everything resolved.
 *  - A node focused: that entity moves to the centre and only its direct
 *    relationships radiate around it (a hub-and-spoke "connections" view),
 *    since a full-graph layout stops being readable past a handful of nodes.
 */
function computeLayout(
  entities: Entity[],
  relationships: Relationship[],
  focusId: string | null
): { positions: Map<string, Positioned>; isEgo: boolean } {
  const byId = new Map(entities.map((e) => [e.canonical_id, e]));
  const hub = focusId ? byId.get(focusId) : undefined;

  if (hub) {
    const neighborIds = new Set<string>();
    for (const r of relationships) {
      if (r.subject_id === hub.canonical_id && byId.has(r.object_id)) neighborIds.add(r.object_id);
      if (r.object_id === hub.canonical_id && byId.has(r.subject_id)) neighborIds.add(r.subject_id);
    }
    const neighbors = [...neighborIds].map((id) => byId.get(id)!);
    const positions = new Map<string, Positioned>();
    positions.set(hub.canonical_id, { x: W / 2, y: H / 2, e: hub });

    const radius = Math.min(W, H) * 0.37;
    neighbors.forEach((e, i) => {
      const angle = (i / Math.max(neighbors.length, 1)) * Math.PI * 2 - Math.PI / 2;
      positions.set(e.canonical_id, {
        x: W / 2 + Math.cos(angle) * radius,
        y: H / 2 + Math.sin(angle) * radius * 0.78,
        e,
      });
    });
    return { positions, isEgo: true };
  }

  const byType = new Map<string, Entity[]>();
  for (const e of entities) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  const types = [...byType.keys()].sort();
  const positions = new Map<string, Positioned>();

  types.forEach((type, ti) => {
    const list = byType.get(type)!;
    const radius = 70 + ti * 62;
    list.forEach((e, i) => {
      const angle = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
      positions.set(e.canonical_id, {
        x: W / 2 + Math.cos(angle) * radius * 1.45,
        y: H / 2 + Math.sin(angle) * radius * 0.82,
        e,
      });
    });
  });
  return { positions, isEgo: false };
}

export default function EntityGraph({
  entities,
  relationships,
  focusId,
  onFocus,
}: {
  entities: Entity[];
  relationships: Relationship[];
  focusId: string | null;
  onFocus: (id: string) => void;
}) {
  const { positions, isEgo } = useMemo(
    () => computeLayout(entities, relationships, focusId),
    [entities, relationships, focusId]
  );

  const edges = useMemo(
    () => relationships.filter((r) => positions.has(r.subject_id) && positions.has(r.object_id)),
    [relationships, positions]
  );

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center justify-between">
        <span className="metadata">
          {positions.size} NODE{positions.size === 1 ? "" : "S"} · {edges.length} RELATIONSHIP
          {edges.length === 1 ? "" : "S"}
        </span>
        {isEgo && (
          <button
            onClick={() => onFocus("")}
            className="metadata text-accent transition-colors hover:text-ink"
          >
            ◂ full graph
          </button>
        )}
      </div>

      <div
        className="relative min-w-[40rem] rounded-sm border border-line bg-base/40"
        style={{
          height: H,
          backgroundImage:
            "radial-gradient(rgba(133,147,161,0.14) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          {edges.map((r, i) => {
            const a = positions.get(r.subject_id)!;
            const b = positions.get(r.object_id)!;
            const active = focusId === r.subject_id || focusId === r.object_id;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={i} opacity={focusId && !active ? 0.2 : 1}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={active ? "#38bdf8" : "#323b47"}
                  strokeWidth={active ? 1.3 : 1}
                  strokeDasharray="4 4"
                />
                {active && (
                  <text
                    x={mx}
                    y={my - 6}
                    textAnchor="middle"
                    className="fill-accent font-mono text-[8px] uppercase tracking-wide"
                  >
                    {r.predicate.replace(/_/g, " ")}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {[...positions.values()].map(({ x, y, e }) => {
          const isFocus = e.canonical_id === focusId;
          const Icon = TYPE_ICON[e.type] ?? Users;
          return (
            <button
              key={e.canonical_id}
              onClick={() => onFocus(e.canonical_id)}
              className={cn(
                "absolute flex w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-sm border bg-panel px-2 py-2 text-center transition-colors",
                isFocus
                  ? "border-accent shadow-[0_0_0_1px_rgba(56,189,248,0.4),0_0_16px_-4px_rgba(56,189,248,0.5)]"
                  : "border-line hover:border-line-bright"
              )}
              style={{ left: x, top: y }}
              title={e.name}
            >
              <Icon className={cn("h-3.5 w-3.5", TYPE_RING[e.type]?.split(" ")[1] ?? "text-dim")} />
              <span className="w-full truncate text-2xs font-semibold text-ink">{e.name}</span>
              <span className="metadata">{e.type}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
