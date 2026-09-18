import { Bell, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useInvestigation } from "../../state/InvestigationContext";
import { StatusIndicator } from "../common/indicators";
import { Badge } from "../ui/primitives";
import { NAV_SECTIONS } from "./Sidebar";

function useUtcClock() {
  const [now, setNow] = useState(() => new Date().toISOString().slice(11, 19));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const LABELS = new Map(
  NAV_SECTIONS.flatMap((s) => s.items).map((i) => [i.to, i.label] as const)
);

export default function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const clock = useUtcClock();
  const { pathname } = useLocation();
  const { investigation, networkOnline, isLive } = useInvestigation();

  const crumb = LABELS.get(pathname) ?? "Overview";
  const faults = investigation?.trace.filter((e) => !e.ok).length ?? 0;

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-base/80 px-4 backdrop-blur">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
        <Link to="/" className="text-dim transition-colors hover:text-muted">
          SENTINEL
        </Link>
        <ChevronRight className="h-3 w-3 text-dim" />
        <span className="truncate text-ink">{crumb}</span>
        {investigation && (
          <>
            <ChevronRight className="h-3 w-3 text-dim" />
            <span className="metadata truncate">{investigation.investigation_id}</span>
          </>
        )}
      </nav>

      <button
        onClick={onOpenSearch}
        className="group ml-auto flex h-7 w-72 items-center gap-2 rounded-sm border border-line bg-base px-2.5 text-left transition-colors hover:border-line-bright"
      >
        <Search className="h-3.5 w-3.5 text-dim" />
        <span className="flex-1 text-xs text-dim">Search entities, evidence, sources…</span>
        <kbd className="rounded-sm border border-line bg-raised px-1 font-mono text-2xs text-dim">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-3">
        <button className="relative rounded-sm p-1.5 text-dim transition-colors hover:bg-raised hover:text-ink">
          <Bell className="h-4 w-4" />
          {faults > 0 && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-critical" />
          )}
        </button>

        <div className="flex items-center gap-2 border-l border-line pl-3">
          <StatusIndicator
            status={networkOnline ? (isLive ? "active" : "operational") : "critical"}
            label={networkOnline ? (isLive ? "COLLECTING" : "ONLINE") : "OFFLINE"}
            pulse={isLive}
          />
          <Badge tone="neutral" className="tabular-nums">
            {clock}Z
          </Badge>
        </div>
      </div>
    </header>
  );
}
