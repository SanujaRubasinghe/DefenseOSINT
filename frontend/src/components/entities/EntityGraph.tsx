import { useMemo } from "react";
import type { Entity, Relationship } from "../../api/types";
import { cn } from "../../lib/utils";

const W = 760;
const H = 420;

const TYPE_FILL: Record<string, string> = {
  PERSON: "#38bdf8",
  ORG: "#fbbf24",
  LOCATION: "#4ade80",
  EVENT: "#8593a1",
};

/**
 * Deterministic layout rather than a force simulation: entities are grouped by
 * type into concentric arcs. A physics layout would drift between renders and
 * make the same investigation look different each visit, which is the wrong
 * property for an analytical view.
 */
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
  const layout = useMemo(() => {
    const byType = new Map<string, Entity[]>();
    for (const e of entities) {
      byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
    }
    const types = [...byType.keys()].sort();
    const positions = new Map<string, { x: number; y: number; e: Entity }>();

    types.forEach((type, ti) => {
      const list = byType.get(type)!;
      // One ring per type, radius stepped outward so groups stay legible.
      const radius = 70 + ti * 62;
      list.forEach((entity, i) => {
        const angle = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
        positions.set(entity.canonical_id, {
          x: W / 2 + Math.cos(angle) * radius * 1.45,
          y: H / 2 + Math.sin(angle) * radius * 0.82,
          e: entity,
        });
      });
    });
    return positions;
  }, [entities]);

  const edges = relationships.filter(
    (r) => layout.has(r.subject_id) && layout.has(r.object_id)
  );

  const connected = new Set<string>();
  if (focusId) {
    for (const r of edges) {
      if (r.subject_id === focusId) connected.add(r.object_id);
      if (r.object_id === focusId) connected.add(r.subject_id);
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[40rem]">
        <defs>
          <marker id="eg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 1 L7 4 L0 7 z" fill="#323b47" />
          </marker>
        </defs>

        {edges.map((r, i) => {
          const a = layout.get(r.subject_id)!;
          const b = layout.get(r.object_id)!;
          const active = focusId === r.subject_id || focusId === r.object_id;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 24;
          return (
            <g key={i} opacity={focusId && !active ? 0.15 : 1}>
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke={active ? "#38bdf8" : "#323b47"}
                strokeWidth={active ? 1.5 : 1}
                markerEnd="url(#eg-arrow)"
              />
              {active && (
                <text x={mx} y={my} textAnchor="middle" className="fill-accent font-mono text-[8px]">
                  {r.predicate.replace(/_/g, " ")}
                </text>
              )}
            </g>
          );
        })}

        {[...layout.values()].map(({ x, y, e }) => {
          const isFocus = e.canonical_id === focusId;
          const dimmed = focusId && !isFocus && !connected.has(e.canonical_id);
          const r = 4 + e.confidence * 4;
          return (
            <g
              key={e.canonical_id}
              className="cursor-pointer"
              opacity={dimmed ? 0.25 : 1}
              onClick={() => onFocus(e.canonical_id)}
              tabIndex={0}
              role="button"
              aria-label={`${e.name}, ${e.type}`}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onFocus(e.canonical_id);
                }
              }}
            >
              {isFocus && (
                <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
              )}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={TYPE_FILL[e.type] ?? "#8593a1"}
                stroke={isFocus ? "#e6ebf0" : "transparent"}
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y - r - 4}
                textAnchor="middle"
                className={cn("font-mono text-[8px]", isFocus ? "fill-ink" : "fill-muted")}
              >
                {e.name.length > 22 ? `${e.name.slice(0, 22)}…` : e.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
