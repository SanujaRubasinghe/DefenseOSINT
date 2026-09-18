import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "../../lib/utils";
import type { Kpi } from "../../selectors/intel";

const TONE_STROKE: Record<string, string> = {
  accent: "#38bdf8",
  verified: "#4ade80",
  review: "#fbbf24",
  critical: "#f87171",
};

export default function MetricCard({ kpi }: { kpi: Kpi }) {
  const stroke = TONE_STROKE[kpi.tone ?? "accent"] ?? "#38bdf8";
  const data = kpi.series.map((v, i) => ({ i, v }));

  return (
    <div className="panel group relative overflow-hidden px-3 py-2.5 transition-colors hover:border-line-bright">
      <p className="metadata uppercase tracking-[0.12em]">{kpi.label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span
          className={cn(
            "font-mono text-2xl leading-none tabular-nums",
            kpi.tone === "verified" && "text-verified",
            kpi.tone === "review" && "text-review",
            kpi.tone === "critical" && "text-critical",
            (!kpi.tone || kpi.tone === "accent") && "text-ink"
          )}
        >
          {kpi.value}
        </span>
        {data.length > 1 && (
          <div className="h-8 w-20 opacity-70 transition-opacity group-hover:opacity-100">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${kpi.label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={stroke}
                  strokeWidth={1.2}
                  fill={`url(#spark-${kpi.label})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <p className="mt-1 truncate text-2xs text-dim">{kpi.hint}</p>
    </div>
  );
}
