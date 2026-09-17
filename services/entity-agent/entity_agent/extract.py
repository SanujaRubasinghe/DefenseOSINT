"""spaCy-based NER, canonicalisation and evidence linking.

Relation extraction is not implemented here yet — see the handover guide,
"what comes next": entities first, relations are a follow-up PR.
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache

import spacy
from defenseosint_common.contracts import Entity, EntityBundle, EvidenceBundle

# spaCy's default model tags many more label types (DATE, MONEY, CARDINAL, ...)
# than the contract's `type` field is meant to hold. Anything not in this map
# is dropped rather than forced into one of our buckets.
LABEL_MAP = {
    "PERSON": "PERSON",
    "ORG": "ORG",
    "GPE": "LOCATION",
    "LOC": "LOCATION",
    "FAC": "LOCATION",
    "EVENT": "EVENT",
}

TYPE_PREFIX = {"PERSON": "per", "ORG": "org", "LOCATION": "loc", "EVENT": "evt"}

# A record's content can be a whole scraped page. NER over all of it is the
# point, but there's no value in feeding spaCy tens of thousands of characters
# per record — named entities of interest show up early, and this keeps
# per-request latency predictable regardless of page length.
MAX_CHARS_PER_RECORD = 5000

# NER depends on tok2vec but not on the tagger/parser/attribute_ruler/
# lemmatizer, so disabling them skips real work on every call.
DISABLED_PIPES = ["parser", "tagger", "attribute_ruler", "lemmatizer"]


@lru_cache(maxsize=1)
def _nlp():
    # Model load is the expensive part (seconds); cache it once per process
    # rather than once per request.
    return spacy.load("en_core_web_sm", disable=DISABLED_PIPES)


def normalize(name: str) -> str:
    """Fold surface variation (case, punctuation, whitespace) so the same
    entity written differently across documents maps to one canonical_id."""
    name = re.sub(r"[^\w\s]", "", name.lower())
    return re.sub(r"\s+", " ", name).strip()


def canonical_id(entity_type: str, normalized_name: str) -> str:
    """Deterministic id: same type + normalised name always hashes the same,
    which is what lets entities from different evidence records link up."""
    digest = hashlib.sha1(f"{entity_type}:{normalized_name}".encode()).hexdigest()[:12]
    return f"{TYPE_PREFIX[entity_type]}_{digest}"


def _confidence(mention_count: int, source_count: int) -> float:
    """Corroboration from independent sources is stronger signal than the same
    source repeating a name, so source_count drives most of the score."""
    return round(min(0.6 + 0.15 * (source_count - 1) + 0.02 * mention_count, 0.97), 2)


def extract_entities(bundle: EvidenceBundle) -> EntityBundle:
    """Run NER over every evidence record and merge mentions into entities.

    Synchronous and CPU-bound — callers should run this off the event loop
    (see run_extraction in main.py).
    """
    nlp = _nlp()
    seen: dict[str, dict] = {}  # canonical_id -> accumulated state

    docs = nlp.pipe(record.content[:MAX_CHARS_PER_RECORD] for record in bundle.records)

    for record, doc in zip(bundle.records, docs, strict=True):
        # Count an entity once per record even if it's mentioned many times on
        # the same page, so confidence reflects corroborating sources rather
        # than repetition within a single one.
        mentioned_this_record: set[str] = set()

        for ent in doc.ents:
            entity_type = LABEL_MAP.get(ent.label_)
            if entity_type is None:
                continue
            normalized = normalize(ent.text)
            if not normalized:
                continue

            cid = canonical_id(entity_type, normalized)
            state = seen.setdefault(
                cid,
                {
                    "name": ent.text.strip(),
                    "type": entity_type,
                    "aliases": set(),
                    "evidence_ids": set(),
                    "source_count": 0,
                    "mention_count": 0,
                },
            )
            surface = ent.text.strip()
            if surface != state["name"]:
                state["aliases"].add(surface)
            state["evidence_ids"].add(record.evidence_id)
            state["mention_count"] += 1
            mentioned_this_record.add(cid)

        for cid in mentioned_this_record:
            seen[cid]["source_count"] += 1

    entities = [
        Entity(
            canonical_id=cid,
            name=state["name"],
            type=state["type"],
            aliases=sorted(state["aliases"]),
            confidence=_confidence(state["mention_count"], state["source_count"]),
            evidence_ids=sorted(state["evidence_ids"]),
        )
        for cid, state in seen.items()
    ]

    return EntityBundle(
        investigation_id=bundle.investigation_id,
        entities=entities,
        relationships=[],
    )
