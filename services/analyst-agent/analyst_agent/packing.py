from __future__ import annotations

from defenseosint_common.contracts import EntityBundle, EvidenceBundle, EvidenceRecord

from .config import settings


def _rank(records: list[EvidenceRecord]) -> list[EvidenceRecord]:
    return sorted(records, key=lambda r: r.relevance_score, reverse=True)


def pack_evidence(bundle: EvidenceBundle) -> tuple[str, set[str]]:
    blocks: list[str] = []
    included: set[str] = set()
    used = 0

    for record in _rank(bundle.records):
        content = record.content[: settings.max_chars_per_record]
        prov = record.provenance

        block = (
            f'<evidence id="{record.evidence_id}">\n'
            f"source: {prov.source_name} ({prov.source_type})\n"
            f"url: {prov.source_url or 'n/a'}\n"
            f"published: {prov.published_at.date() if prov.published_at else 'unknown'}\n"
            f"title: {record.title or 'untitled'}\n"
            f"content: {content}\n"
            f"</evidence>"
        )

        if used + len(block) > settings.max_evidence_chars:
            break

        blocks.append(block)
        included.add(record.evidence_id)
        used += len(block)
    return "\n\n".join(blocks), included


def pack_entities(bundle: EntityBundle | None) -> str:
    if bundle is None or not bundle.entities:
        return "(no entities extracted)"

    lines = [
        f"- {e.name} [{e.type}] confidence={e.confidence:.2f}"
        + (f"aliases: {', '.join(e.aliases)}" if e.aliases else "")
        for e in bundle.entities[:40]
    ]
    for rel in bundle.relationships[:30]:
        lines.append(f"- {rel.subject_id} --{rel.predicate}--> {rel.object_id}")
    return "\n".join(lines)


def source_count(bundle: EvidenceBundle, evidence_ids: list[str]) -> int:
    """how many distinct sources back a set of evidence ids"""
    by_id = {r.evidence_id: r for r in bundle.records}
    return len({by_id[eid].provenance.source_name for eid in evidence_ids if eid in by_id})
