import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { GeoContact } from "../../intel/parse";

// CARTO's dark basemap — free, no API key, matches the workstation palette far
// closer than the default OSM tiles would (which are bright and break the
// dark theme). Attribution is required by their terms and shown below.
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const KIND_COLOR: Record<string, string> = {
  aviation: "#fbbf24",
  infrastructure: "#38bdf8",
  conflict: "#f87171",
};

function markerIcon(kind: string, heading: number | null): L.DivIcon {
  const color = KIND_COLOR[kind] ?? "#38bdf8";
  const glyph =
    heading != null
      ? `<svg width="20" height="20" viewBox="-8 -8 16 16" style="transform:rotate(${heading}deg)">
           <polygon points="0,-6 4.5,5 0,2.5 -4.5,5" fill="${color}" stroke="#07090b" stroke-width="1"/>
         </svg>`
      : `<svg width="16" height="16" viewBox="-6 -6 12 12">
           <rect x="-4" y="-4" width="8" height="8" fill="${color}" stroke="#07090b" stroke-width="1"/>
         </svg>`;
  return L.divIcon({
    html: glyph,
    className: "geomap-marker",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/** Recenters/refits whenever the contact set changes — a fresh collection run
 * should not leave the viewport pointed at the previous investigation. */
function FitBounds({ contacts }: { contacts: GeoContact[] }) {
  const map = useMap();
  useMemo(() => {
    if (contacts.length === 0) return;
    if (contacts.length === 1) {
      map.setView([contacts[0].lat, contacts[0].lon], 9);
      return;
    }
    const bounds = L.latLngBounds(contacts.map((c) => [c.lat, c.lon]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.map((c) => c.evidenceId).join(",")]);
  return null;
}

/** Flies to whichever contact was chosen from the register, so selecting a
 * row does something even when it's off-screen at the current zoom. */
function FlyToSelected({ contact }: { contact: GeoContact | null }) {
  const map = useMap();
  useMemo(() => {
    if (!contact) return;
    map.flyTo([contact.lat, contact.lon], Math.max(map.getZoom(), 10), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.evidenceId]);
  return null;
}

export default function GeoMap({
  contacts,
  selectedId,
  onSelect,
  className,
}: {
  contacts: GeoContact[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const center: [number, number] = contacts.length
    ? [contacts[0].lat, contacts[0].lon]
    : [7.8731, 80.7718]; // Sri Lanka, this project's default AOI

  return (
    <div className={className ?? "h-[26rem] w-full overflow-hidden rounded-sm border border-line"}>
      <MapContainer
        center={center}
        zoom={contacts.length ? 8 : 3}
        scrollWheelZoom
        className="h-full w-full bg-base"
        // Leaflet's default z-index stack can otherwise climb above drawers.
        style={{ zIndex: 0 }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" maxZoom={19} />
        <FitBounds contacts={contacts} />
        <FlyToSelected contact={contacts.find((c) => c.evidenceId === selectedId) ?? null} />

        {contacts.map((c) => (
          <Marker
            key={c.evidenceId}
            position={[c.lat, c.lon]}
            icon={markerIcon(c.kind, c.heading)}
            eventHandlers={{ click: () => onSelect?.(c.evidenceId) }}
          >
            <Popup className="geomap-popup">
              <div className="min-w-[12rem] font-mono text-xs">
                <p className="mb-1 text-[13px] font-semibold text-ink">{c.label}</p>
                <p className="mb-1 tabular-nums text-accent">
                  {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
                </p>
                {c.heading != null && <p className="text-dim">HDG {c.heading.toFixed(0)}°</p>}
                <p className="mt-1 whitespace-pre-wrap text-dim">{c.detail}</p>
                {c.sourceUrl && (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-accent hover:underline"
                  >
                    {c.sourceName}
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Selected contact gets a highlight ring drawn as a tiny circle path. */}
        {selectedId &&
          contacts
            .filter((c) => c.evidenceId === selectedId)
            .map((c) => (
              <Polyline
                key={`ring-${c.evidenceId}`}
                positions={circlePoints(c.lat, c.lon, 0.02)}
                pathOptions={{ color: "#38bdf8", weight: 1.5, opacity: 0.8 }}
              />
            ))}
      </MapContainer>
    </div>
  );
}

function circlePoints(lat: number, lon: number, radiusDeg: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push([lat + Math.sin(a) * radiusDeg, lon + Math.cos(a) * radiusDeg]);
  }
  return pts;
}
