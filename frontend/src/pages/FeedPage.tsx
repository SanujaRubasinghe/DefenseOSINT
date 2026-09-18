import { ExternalLink, Layers, MapPin, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ConfidenceMeter,
  SourceBadge,
} from "../components/common/indicators";
import { Badge, Button, EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { cn, formatStamp } from "../lib/utils";
import { STATUS_TONE, feedItems, sourceTypes } from "../selectors/intel";
import { useInvestigation } from "../state/InvestigationContext";

const CONFIDENCE_BANDS = [
  { key: "all", label: "Any", test: () => true },
  { key: "high", label: "≥ 0.70", test: (v: number) => v >= 0.7 },
  { key: "mid", label: "0.45 – 0.70", test: (v: number) => v >= 0.45 && v < 0.7 },
  { key: "low", label: "< 0.45", test: (v: number) => v < 0.45 },
];

export default function FeedPage() {
  const { investigation } = useInvestigation();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<string>("all");
  const [band, setBand] = useState("all");
  const [query, setQuery] = useState("");

  const sourceFilter = params.get("source");
  const items = useMemo(() => feedItems(investigation), [investigation]);
  const types = useMemo(() => sourceTypes(investigation), [investigation]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = CONFIDENCE_BANDS.find((b) => b.key === band)!.test;
    return items.filter((item) => {
      if (type !== "all" && item.record.provenance.source_type !== type) return false;
      if (sourceFilter && item.record.provenance.source_name !== sourceFilter) return false;
      if (!test(item.record.relevance_score)) return false;
      if (q) {
        const hay = `${item.record.title ?? ""} ${item.record.content} ${item.entities.join(" ")}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, type, band, query, sourceFilter]);

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader
          title="Intelligence Feed"
          icon={<Layers className="h-3.5 w-3.5" />}
          meta={`${filtered.length} of ${items.length} records`}
          action={
            sourceFilter && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  params.delete("source");
                  setParams(params, { replace: true });
                }}
              >
                clear source: {sourceFilter}
              </Button>
            )
          }
        />

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by text or entity…"
            className="h-7 w-56 rounded-sm border border-line bg-base px-2 text-xs text-ink placeholder:text-dim focus:border-accent/60 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-1">
            <span className="metadata mr-1 uppercase">Type</span>
            {["all", ...types].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase transition-colors",
                  type === t
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-line text-dim hover:border-line-bright hover:text-muted"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="metadata mr-1 uppercase">Relevance</span>
            {CONFIDENCE_BANDS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBand(b.key)}
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-2xs transition-colors",
                  band === b.key
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-line text-dim hover:border-line-bright hover:text-muted"
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={items.length ? "No records match these filters" : "No intelligence collected"}
            hint={
              items.length
                ? "Relax the type or relevance filter."
                : "Task a collection from Overview to populate the feed."
            }
          />
        ) : (
          <ol className="divide-y divide-line">
            {filtered.map(({ record, status, entities, position }) => (
              <li key={record.evidence_id} className="px-3 py-2.5 transition-colors hover:bg-raised/40">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge type={record.provenance.source_type} />
                  <span className="metadata truncate">{record.provenance.source_name}</span>
                  <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                  <span className="metadata ml-auto shrink-0 tabular-nums">
                    {formatStamp(record.provenance.retrieved_at)}
                  </span>
                </div>

                <h3 className="mt-1 truncate text-sm text-ink">
                  {record.title || "Untitled record"}
                </h3>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
                  {record.content.slice(0, 260)}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <ConfidenceMeter value={record.relevance_score} />
                  {position && (
                    <span className="metadata inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {position}
                    </span>
                  )}
                  {entities.slice(0, 4).map((name) => (
                    <Badge key={name} tone="accent">
                      {name}
                    </Badge>
                  ))}
                  {entities.length > 4 && (
                    <span className="metadata">+{entities.length - 4}</span>
                  )}
                  {record.provenance.source_url && (
                    <a
                      href={record.provenance.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="metadata ml-auto inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      source
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
