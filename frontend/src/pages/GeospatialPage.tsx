import { Map, MapPin } from "lucide-react";
import { useMemo } from "react";
import TacticalMap from "../components/maps/TacticalMap";
import { SourceBadge } from "../components/common/indicators";
import { EmptyState, Panel, PanelHeader } from "../components/ui/primitives";
import { extractContacts } from "../intel/parse";
import { useInvestigation } from "../state/InvestigationContext";

export default function GeospatialPage() {
  const { investigation } = useInvestigation();
  const contacts = useMemo(
    () => extractContacts(investigation?.evidence ?? []),
    [investigation?.evidence]
  );

  const bounds = useMemo(() => {
    if (!contacts.length) return null;
    const lats = contacts.map((c) => c.lat);
    const lons = contacts.map((c) => c.lon);
    return {
      latMin: Math.min(...lats),
      latMax: Math.max(...lats),
      lonMin: Math.min(...lons),
      lonMax: Math.max(...lons),
    };
  }, [contacts]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
      <Panel className="min-w-0">
        <PanelHeader
          title="Contact Plot"
          icon={<Map className="h-3.5 w-3.5" />}
          meta={
            bounds
              ? `${bounds.latMin.toFixed(2)}–${bounds.latMax.toFixed(2)}N · ${bounds.lonMin.toFixed(2)}–${bounds.lonMax.toFixed(2)}E`
              : undefined
          }
        />
        <div className="p-3">
          {contacts.length ? (
            <TacticalMap contacts={contacts} />
          ) : (
            <EmptyState
              icon={<Map className="h-6 w-6" />}
              title="No positioned contacts"
              hint="Only aviation and infrastructure records carry coordinates. Task a collection whose objective mentions aircraft, airspace or infrastructure."
            />
          )}
        </div>
      </Panel>

      <Panel className="min-w-0">
        <PanelHeader title="Contact Register" meta={`${contacts.length} plotted`} />
        {contacts.length === 0 ? (
          <EmptyState title="Empty" />
        ) : (
          <ul className="max-h-[34rem] divide-y divide-line overflow-y-auto">
            {contacts.map((c) => (
              <li key={c.evidenceId} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <SourceBadge type={c.kind} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.label}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <MapPin className="h-3 w-3 shrink-0 text-dim" />
                  <span className="font-mono text-2xs tabular-nums text-accent">
                    {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
                  </span>
                  {c.heading != null && (
                    <span className="metadata tabular-nums">HDG {c.heading.toFixed(0)}°</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
