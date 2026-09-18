import type { EvidenceRecord } from "../api/types";

// EvidenceRecord carries no geometry or image field, so the collector encodes
// both as plain text in `content`. These parsers are the other half of that
// agreement — delete this file when the shared contract gains real fields.

const POSITION_RE = /^Position:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/m;
const IMAGE_RE = /\[Image:\s*(\S+?)\]/;
const HEADING_RE = /^Heading:\s*(-?\d+(?:\.\d+)?)/m;

export interface GeoContact {
  evidenceId: string;
  label: string;
  lat: number;
  lon: number;
  heading: number | null;
  kind: string;
  sourceName: string;
  sourceUrl: string | null;
  detail: string;
}

export interface ImageAsset {
  evidenceId: string;
  title: string;
  imageUrl: string;
  caption: string;
  sourceName: string;
  sourceUrl: string | null;
}

export function extractContacts(records: EvidenceRecord[]): GeoContact[] {
  const out: GeoContact[] = [];
  for (const record of records) {
    const match = record.content.match(POSITION_RE);
    if (!match) continue;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    // Reject impossible coordinates rather than letting them distort the
    // map's auto-fitted bounds.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    const headingMatch = record.content.match(HEADING_RE);
    out.push({
      evidenceId: record.evidence_id,
      label: record.title || record.provenance.source_name,
      lat,
      lon,
      heading: headingMatch ? Number(headingMatch[1]) : null,
      kind: record.provenance.source_type,
      sourceName: record.provenance.source_name,
      sourceUrl: record.provenance.source_url,
      detail: record.content,
    });
  }
  return out;
}

export function extractImages(records: EvidenceRecord[]): ImageAsset[] {
  const out: ImageAsset[] = [];
  for (const record of records) {
    const match = record.content.match(IMAGE_RE);
    if (!match) continue;
    out.push({
      evidenceId: record.evidence_id,
      title: record.title || record.provenance.source_name,
      imageUrl: match[1],
      caption: record.content.replace(IMAGE_RE, "").trim().slice(0, 200),
      sourceName: record.provenance.source_name,
      sourceUrl: record.provenance.source_url,
    });
  }
  return out;
}
