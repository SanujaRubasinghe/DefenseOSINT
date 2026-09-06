const COLORS: Record<string, string> = {
  planning: "pill-active",
  running: "pill-active",
  pending: "pill-neutral",
  complete: "pill-ok",
  passed: "pill-ok",
  insufficient: "pill-warn",
  failed: "pill-err",
};

export default function StatusPill({ value }: { value: string }) {
  const cls = COLORS[value] ?? "pill-neutral";
  return <span className={`pill ${cls}`}>{value}</span>;
}
