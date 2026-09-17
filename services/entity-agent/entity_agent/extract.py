"""spaCy-based NER, canonicalisation, evidence linking and relation extraction."""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache

import spacy
from defenseosint_common.contracts import Entity, EntityBundle, EvidenceBundle, Relationship
from spacy.tokens import Doc, Span, Token

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

# Relation extraction below needs the dependency parser (for sentence bounds
# and the parse tree) and proper lemmas (for trigger matching, e.g. "based" ->
# "base"), and lemmatisation itself needs the tagger + attribute_ruler to have
# assigned POS first — so nothing in the default pipeline is disabled here.
# Verified this doesn't change the NER output itself vs. disabling them.
@lru_cache(maxsize=1)
def _nlp():
    # Model load is the expensive part (seconds); cache it once per process
    # rather than once per request.
    return spacy.load("en_core_web_sm")


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


# --- relation extraction ----------------------------------------------------
#
# Shallow dependency-pattern matching, not a trained relation classifier: for
# each sentence, a trigger lemma's syntactic subject and object (direct, or
# via a preposition) are matched against known entities. This deliberately
# only fires on entity pairs joined by a recognised trigger — plain
# co-occurrence in a sentence is not evidence of a relationship on its own,
# and emitting one anyway would be exactly the kind of unsupported claim
# critic-agent is meant to catch.
#
# lemma -> (predicate, {(subject_type, object_type), ...})
RELATION_TRIGGERS: dict[str, tuple[str, set[tuple[str, str]]]] = {
    "work": ("works_for", {("PERSON", "ORG")}),
    "join": ("works_for", {("PERSON", "ORG")}),
    "lead": ("leads", {("PERSON", "ORG")}),
    "head": ("leads", {("PERSON", "ORG")}),
    "found": ("founded", {("PERSON", "ORG")}),
    "own": ("owns", {("PERSON", "ORG"), ("ORG", "ORG")}),
    "acquire": ("acquired", {("ORG", "ORG")}),
    "base": ("headquartered_in", {("ORG", "LOCATION"), ("PERSON", "LOCATION")}),
    "headquarter": ("headquartered_in", {("ORG", "LOCATION")}),
    "locate": ("located_in", {("ORG", "LOCATION"), ("EVENT", "LOCATION")}),
    "meet": ("met_with", {("PERSON", "PERSON")}),
}

SUBJECT_DEPS = {"nsubj", "nsubjpass"}
OBJECT_DEPS = {"dobj", "attr", "oprd", "acomp"}
# A relative clause's head is the noun it modifies, e.g. in "Acme, which is
# based in Riga", "based".head is "Acme" directly — this is what lets the
# relation resolve to "Acme" instead of the relative pronoun "which".
CLAUSE_DEPS = {"relcl", "acl"}

_RecognisedEntity = tuple[Span, str, str]  # (span, canonical_id, entity_type)


def _subject_entities(trigger: Token, ents: list[_RecognisedEntity]) -> list[_RecognisedEntity]:
    # Token identity (`is`) is unreliable on spaCy's Cython token wrappers —
    # compare by index instead.
    found = []
    for span, cid, etype in ents:
        root = span.root
        is_direct_subject = root.head.i == trigger.i and root.dep_ in SUBJECT_DEPS
        is_relative_clause_subject = trigger.dep_ in CLAUSE_DEPS and trigger.head.i == root.i
        if is_direct_subject or is_relative_clause_subject:
            found.append((span, cid, etype))
    return found


def _object_entities(trigger: Token, ents: list[_RecognisedEntity]) -> list[_RecognisedEntity]:
    found = []
    for span, cid, etype in ents:
        root = span.root
        is_direct_object = root.head.i == trigger.i and root.dep_ in OBJECT_DEPS
        is_prepositional_object = (
            root.dep_ == "pobj" and root.head.dep_ == "prep" and root.head.head.i == trigger.i
        )
        if is_direct_object or is_prepositional_object:
            found.append((span, cid, etype))
    return found


def _relations_in_doc(doc: Doc, recognised: list[_RecognisedEntity]) -> set[tuple[str, str, str]]:
    triples: set[tuple[str, str, str]] = set()
    for sent in doc.sents:
        ents_in_sent = [e for e in recognised if e[0].start >= sent.start and e[0].end <= sent.end]
        if len(ents_in_sent) < 2:
            continue
        for token in sent:
            trigger = RELATION_TRIGGERS.get(token.lemma_.lower())
            if trigger is None:
                continue
            predicate, allowed_pairs = trigger
            subjects = _subject_entities(token, ents_in_sent)
            objects = _object_entities(token, ents_in_sent)
            for _, subj_id, subj_type in subjects:
                for _, obj_id, obj_type in objects:
                    if subj_id == obj_id:
                        continue
                    if (subj_type, obj_type) in allowed_pairs:
                        triples.add((subj_id, predicate, obj_id))
    return triples


def _relation_confidence(source_count: int) -> float:
    # Lower base than entity confidence: this is an unverified syntactic
    # pattern match, not a model judgement (contrast critic-agent's
    # LLM-verified contradiction check).
    return round(min(0.55 + 0.15 * (source_count - 1), 0.9), 2)


def extract_entities(bundle: EvidenceBundle) -> EntityBundle:
    """Run NER + relation extraction over every evidence record.

    Synchronous and CPU-bound — callers should run this off the event loop
    (see run_extraction in main.py).
    """
    nlp = _nlp()
    seen: dict[str, dict] = {}  # canonical_id -> accumulated entity state
    rel_seen: dict[tuple[str, str, str], dict] = {}  # (subj, predicate, obj) -> state

    docs = nlp.pipe(record.content[:MAX_CHARS_PER_RECORD] for record in bundle.records)

    for record, doc in zip(bundle.records, docs, strict=True):
        # Count an entity once per record even if it's mentioned many times on
        # the same page, so confidence reflects corroborating sources rather
        # than repetition within a single one.
        mentioned_this_record: set[str] = set()
        recognised: list[_RecognisedEntity] = []

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
            recognised.append((ent, cid, entity_type))

        for cid in mentioned_this_record:
            seen[cid]["source_count"] += 1

        for subj_id, predicate, obj_id in _relations_in_doc(doc, recognised):
            key = (subj_id, predicate, obj_id)
            rel_state = rel_seen.setdefault(key, {"evidence_ids": set(), "source_count": 0})
            if record.evidence_id not in rel_state["evidence_ids"]:
                rel_state["source_count"] += 1
            rel_state["evidence_ids"].add(record.evidence_id)

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

    relationships = [
        Relationship(
            subject_id=subj_id,
            predicate=predicate,
            object_id=obj_id,
            confidence=_relation_confidence(state["source_count"]),
            evidence_ids=sorted(state["evidence_ids"]),
        )
        for (subj_id, predicate, obj_id), state in rel_seen.items()
    ]

    return EntityBundle(
        investigation_id=bundle.investigation_id,
        entities=entities,
        relationships=relationships,
    )
