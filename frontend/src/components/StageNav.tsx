import { NavLink } from "react-router-dom";
import type { Investigation } from "../api/types";

type Readiness = "waiting" | "ready" | "attention";

interface Stage {
  slug: string;
  index: string;
  label: string;
  /** What has to exist before this stage holds anything. */
  readiness: (inv: Investigation | null) => Readiness;
  count?: (inv: Investigation | null) => number | null;
}

export const STAGES: Stage[] = [
  {
    slug: "fabric",
    index: "01",
    label: "FABRIC",
    readiness: () => "ready",
    count: (inv) => inv?.trace.length ?? null,
  },
  {
    slug: "tasking",
    index: "02",
    label: "TASKING",
    readiness: (inv) => {
      if (!inv?.tasks.length) return "waiting";
      return inv.tasks.some((t) => t.error) ? "attention" : "ready";
    },
    count: (inv) => inv?.tasks.length ?? null,
  },
  {
    slug: "evidence",
    index: "03",
    label: "EVIDENCE",
    readiness: (inv) => (inv?.evidence.length ? "ready" : "waiting"),
    count: (inv) => inv?.evidence.length ?? null,
  },
  {
    slug: "assessment",
    index: "04",
    label: "ASSESSMENT",
    readiness: (inv) => {
      const latest = inv?.assessments[inv.assessments.length - 1];
      if (!latest) return "waiting";
      return latest.passed ? "ready" : "attention";
    },
    count: (inv) => {
      const latest = inv?.assessments[inv.assessments.length - 1];
      return latest ? latest.findings.length : null;
    },
  },
  {
    slug: "brief",
    index: "05",
    label: "BRIEF",
    readiness: (inv) => (inv?.draft ? "ready" : "waiting"),
    count: (inv) => inv?.draft?.sections.length ?? null,
  },
  {
    slug: "trace",
    index: "06",
    label: "TRACE",
    readiness: (inv) => {
      if (!inv?.trace.length) return "waiting";
      return inv.trace.some((e) => !e.ok) ? "attention" : "ready";
    },
    count: (inv) => inv?.trace.filter((e) => !e.ok).length || null,
  },
];

export default function StageNav({ investigation }: { investigation: Investigation | null }) {
  return (
    <nav className="stage-nav" aria-label="Investigation stages">
      {STAGES.map((stage) => {
        const readiness = stage.readiness(investigation);
        const count = stage.count?.(investigation) ?? null;
        return (
          <NavLink
            key={stage.slug}
            to={stage.slug}
            className={({ isActive }) =>
              [
                "stage-link",
                `stage-${readiness}`,
                isActive ? "stage-link-active" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
          >
            <span className="stage-index">{stage.index}</span>
            <span className="stage-label">{stage.label}</span>
            {count != null && <span className="stage-count">{count}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}
