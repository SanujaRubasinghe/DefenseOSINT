import {
  Activity,
  Boxes,
  FileText,
  Gauge,
  Images,
  Layers,
  LogOut,
  Map,
  Network,
  Radar,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useAuth } from "../../state/AuthContext";
import { StatusIndicator } from "../common/indicators";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Count badge, when the section has real data behind it. */
  count?: number | null;
}

export const NAV_SECTIONS: { heading: string; items: Omit<NavItem, "count">[] }[] = [
  {
    heading: "Intelligence",
    items: [
      { to: "/", label: "Overview", icon: Gauge },
      { to: "/feed", label: "Intelligence Feed", icon: Layers },
      { to: "/collection", label: "Collection", icon: Radar },
    ],
  },
  {
    heading: "Analysis",
    items: [
      { to: "/entities", label: "Entity Intelligence", icon: Network },
      { to: "/geoint", label: "Geospatial", icon: Map },
      { to: "/media", label: "Media Analysis", icon: Images },
    ],
  },
  {
    heading: "Verification",
    items: [
      { to: "/evidence", label: "Evidence", icon: Boxes },
      { to: "/provenance", label: "Provenance", icon: ShieldCheck },
      { to: "/assessment", label: "Assessments", icon: ScrollText },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    heading: "System",
    items: [{ to: "/agents", label: "Agent Activity", icon: Activity }],
  },
];

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export default function Sidebar({ counts }: { counts: Record<string, number | null> }) {
  const { username, logout } = useAuth();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-base/80">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Radar className="h-4 w-4 text-accent" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-wide text-ink">DefenseOSINT</div>
          <div className="metadata">OSINT FUSION</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.heading} className="mb-4">
            <p className="px-2 pb-1.5 font-mono text-2xs uppercase tracking-[0.16em] text-dim">
              {section.heading}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const count = counts[item.to];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-muted hover:bg-raised hover:text-ink"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-accent" : "text-dim")}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count != null && count > 0 && (
                        <span className="metadata tabular-nums">{count}</span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-sm border border-line-bright bg-raised font-mono text-2xs text-accent">
            {username ? initials(username) : "—"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-ink">{username ?? "Analyst"}</div>
            <div className="metadata">CLEARANCE / OSINT</div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-sm p-1 text-dim transition-colors hover:bg-raised hover:text-critical"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <StatusIndicator status="operational" label="AUTHORIZED" />
        </div>
      </div>
    </aside>
  );
}
