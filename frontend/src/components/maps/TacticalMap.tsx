import { useMemo, useState } from "react";
import type { GeoContact } from "../../intel/parse";
import { cn } from "../../lib/utils";

const W = 720;
const H = 400;
const PAD = 36;
const MIN_SPAN = 0.6; // degrees — one contact must not zoom to infinity

function gridStep(span: number): number {
  return [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30].find((c) => span / c <= 6) ?? 30;
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Number(v.toFixed(4)));
  return out;
}

function fmt(v: number, axis: "lat" | "lon"): string {
  const hemi = axis === "lat" ? (v >= 0 ? "N" : "S") : v >= 0 ? "E" : "W";
  return `${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}°${hemi}`;
}

/**
 * Contacts on an auto-fitted equirectangular grid. Deliberately no basemap:
 * tiles would mean an external dependency and a network call, and for live
 * contacts a labelled graticule with exact readouts is more useful than a
 * picture of coastlines.
 */
export default function TacticalMap({ contacts }: { contacts: GeoContact[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const view = useMemo(() => {
    const lats = contacts.map((c) => c.lat);
    const lons = contacts.map((c) => c.lon);
    const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPAN);
    const lonSpan = Math.max(Math.max(...lons) - Math.min(...lons), MIN_SPAN);
    const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lonMid = (Math.min(...lons) + Math.max(...lons)) / 2;
    const latPad = latSpan * 0.18;
    const lonPad = lonSpan * 0.18;
    return {
      latMin: latMid - latSpan / 2 - latPad,
      latMax: latMid + latSpan / 2 + latPad,
      lonMin: lonMid - lonSpan / 2 - lonPad,
      lonMax: lonMid + lonSpan / 2 + lonPad,
    };
  }, [contacts]);

  if (contacts.length === 0) return null;

  const x = (lon: number) => PAD + ((lon - view.lonMin) / (view.lonMax - view.lonMin)) * (W - PAD * 2);
  const y = (lat: number) => PAD + ((view.latMax - lat) / (view.latMax - view.latMin)) * (H - PAD * 2);
  const active = contacts.find((c) => c.evidenceId === selected) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[34rem]"
          role="img"
          aria-label="Contact positions"
        >
          <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} className="tacmap-frame" />

          {ticks(view.lonMin, view.lonMax, gridStep(view.lonMax - view.lonMin)).map((lon) => (
            <g key={`lon${lon}`}>
              <line x1={x(lon)} y1={PAD} x2={x(lon)} y2={H - PAD} className="tacmap-grid" />
              <text x={x(lon)} y={H - PAD + 14} textAnchor="middle" className="tacmap-axis">
                {fmt(lon, "lon")}
              </text>
            </g>
          ))}
          {ticks(view.latMin, view.latMax, gridStep(view.latMax - view.latMin)).map((lat) => (
            <g key={`lat${lat}`}>
              <line x1={PAD} y1={y(lat)} x2={W - PAD} y2={y(lat)} className="tacmap-grid" />
              <text x={PAD - 6} y={y(lat) + 3} textAnchor="end" className="tacmap-axis">
                {fmt(lat, "lat")}
              </text>
            </g>
          ))}

          {contacts.map((c) => {
            const isActive = c.evidenceId === selected;
            const cx = x(c.lon);
            const cy = y(c.lat);
            return (
              <g
                key={c.evidenceId}
                className={cn("tacmap-contact", `tacmap-${c.kind}`, isActive && "tacmap-selected")}
                onClick={() => setSelected(isActive ? null : c.evidenceId)}
                tabIndex={0}
                role="button"
                aria-label={`${c.label} at ${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isActive ? null : c.evidenceId);
                  }
                }}
              >
                {isActive && <circle cx={cx} cy={cy} r="12" className="tacmap-halo" />}
                {c.heading != null ? (
                  // Aircraft carry a true track, so point the marker along it.
                  <polygon
                    points="0,-6 4.5,5 0,2.5 -4.5,5"
                    transform={`translate(${cx} ${cy}) rotate(${c.heading})`}
                    className="tacmap-marker"
                  />
                ) : (
                  <rect x={cx - 3.5} y={cy - 3.5} width="7" height="7" className="tacmap-marker" />
                )}
                <text x={cx + 9} y={cy + 3} className="tacmap-label">
                  {c.label.replace(/^Aircraft\s+/, "")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="min-h-[4.5rem] rounded-sm border border-line bg-base px-3 py-2">
        {active ? (
          <>
            <p className="m-0 font-mono text-xs tracking-wide text-ink">{active.label}</p>
            <p className="mb-1.5 mt-0.5 font-mono text-sm text-accent tabular-nums">
              {active.lat.toFixed(4)}, {active.lon.toFixed(4)}
            </p>
            <pre className="mb-1.5 whitespace-pre-wrap font-mono text-2xs leading-relaxed text-muted">
              {active.detail}
            </pre>
            {active.sourceUrl && (
              <a
                href={active.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-2xs text-accent hover:underline"
              >
                {active.sourceName}
              </a>
            )}
          </>
        ) : (
          <p className="font-mono text-2xs uppercase tracking-wider text-dim">
            {contacts.length} contact{contacts.length === 1 ? "" : "s"} plotted — select one for detail
          </p>
        )}
      </div>
    </div>
  );
}
