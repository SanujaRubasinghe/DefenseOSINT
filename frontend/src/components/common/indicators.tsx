import { Globe, Newspaper, Plane, Radio, Satellite, ScrollText, Server, ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/primitives";

/* ------------------------------------------------------- ConfidenceBadge */

/** Confidence bands. The backend reports 0..1; these are the reading of it. */
export function confidenceTone(c: number): "verified" | "review" | "critical" {
  if (c >= 0.7) return "verified";
  if (c >= 0.45) return "review";
  return "critical";
}

export function ConfidenceBadge({ value, label = "CONF" }: { value: number; label?: string }) {
  return (
    <Badge tone={confidenceTone(value)}>
      {label} {value.toFixed(2)}
    </Badge>
  );
}

/** Inline bar for dense tables where a badge would be too heavy. */
export function ConfidenceMeter({ value, className }: { value: number; className?: string }) {
  const tone = confidenceTone(value);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-raised">
        <div
          className={cn(
            "h-full transition-[width] duration-300",
            tone === "verified" && "bg-verified",
            tone === "review" && "bg-review",
            tone === "critical" && "bg-critical"
          )}
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
      <span className="metadata tabular-nums">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

/* ------------------------------------------------------------ SourceBadge */

const SOURCE_ICONS: Record<string, ReactNode> = {
  web: <Globe className="h-3 w-3" />,
  news: <Newspaper className="h-3 w-3" />,
  report: <ScrollText className="h-3 w-3" />,
  aviation: <Plane className="h-3 w-3" />,
  satellite: <Satellite className="h-3 w-3" />,
  infrastructure: <Server className="h-3 w-3" />,
  conflict: <Radio className="h-3 w-3" />,
  image: <ImageIcon className="h-3 w-3" />,
};

export function sourceIcon(type: string): ReactNode {
  return SOURCE_ICONS[type] ?? <Globe className="h-3 w-3" />;
}

export function SourceBadge({ type }: { type: string }) {
  return (
    <Badge tone="neutral">
      {sourceIcon(type)}
      {type}
    </Badge>
  );
}

/* -------------------------------------------------------- StatusIndicator */

export type Status = "operational" | "active" | "idle" | "review" | "critical";

const STATUS_COLOR: Record<Status, string> = {
  operational: "bg-verified",
  active: "bg-accent",
  idle: "bg-dim",
  review: "bg-review",
  critical: "bg-critical",
};

export function StatusIndicator({
  status,
  label,
  pulse,
}: {
  status: Status;
  label?: string;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              STATUS_COLOR[status]
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", STATUS_COLOR[status])} />
      </span>
      {label && <span className="metadata uppercase">{label}</span>}
    </span>
  );
}
