"""spaCy-based NER, canonicalisation, evidence linking and relation extraction."""

from __future__ import annotations

import hashlib
import logging
import os
import re
from functools import lru_cache

import spacy
from defenseosint_common.contracts import Entity, EntityBundle, EvidenceBundle, Relationship
from spacy.tokens import Doc, Span, Token

logger = logging.getLogger(__name__)

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

# Aircraft state vectors, orbital elements and Shodan banners are key-value
# telemetry, not prose. NER over them yields field labels as entities — a run
# produced a PERSON called "Origin" from "Origin: India" across 11 records —
# and no genuine entity value, so these records are skipped entirely.
STRUCTURED_SOURCE_TYPES = frozenset({"aviation", "satellite", "infrastructure"})

# Corroboration floor. On a real 85-record run, 84% of extracted entities
# appeared in exactly one source and were overwhelmingly NER noise. Keep an
# entity only if more than one source names it, or if a single source discusses
# it repeatedly rather than in passing.
MIN_SOURCES = int(os.getenv("ENTITY_MIN_SOURCES", "2"))
MIN_MENTIONS_SINGLE_SOURCE = int(os.getenv("ENTITY_MIN_MENTIONS", "3"))
# ...but only once the bundle is big enough for that reasoning to hold. Across
# three documents a single-source entity is a third of the corpus and probably
# real; across eighty it is noise. Below this, nothing is filtered.
FLOOR_MIN_RECORDS = int(os.getenv("ENTITY_FLOOR_MIN_RECORDS", "10"))

# Relation extraction below needs the dependency parser (for sentence bounds
# and the parse tree) and proper lemmas (for trigger matching, e.g. "based" ->
# "base"), and lemmatisation itself needs the tagger + attribute_ruler to have
# assigned POS first — so nothing in the default pipeline is disabled here.
# Verified this doesn't change the NER output itself vs. disabling them.
@lru_cache(maxsize=1)
def _nlp():
    # Model load is the expensive part (seconds); cache it once per process
    # rather than once per request.
    nlp = spacy.load("en_core_web_sm")
    # Encyclopedic prose names an entity once and then refers to it with a
    # pronoun ("The SLAF was formed in 1951. It was founded with..."), which
    # left the subject of most relation-bearing sentences unresolvable. This
    # component links those pronouns back to their antecedent.
    try:
        import coreferee  # noqa: F401  (registers the pipeline factory)

        nlp.add_pipe("coreferee")
    except Exception:  # noqa: BLE001
        # Degrade to direct matching only rather than failing extraction.
        logger.warning("coreferee unavailable; pronoun subjects will not resolve")
    return nlp


_POSSESSIVE_RE = re.compile(r"['’]s\b")
_LEADING_ARTICLE_RE = re.compile(r"^(?:the|a|an)\s+")


def normalize(name: str) -> str:
    """Fold surface variation (case, articles, possessives, punctuation,
    whitespace) so the same entity written differently across documents maps to
    one canonical_id."""
    name = name.lower()
    # Possessives must go before punctuation stripping, or "Sri Lanka's"
    # becomes "sri lankas" and stops matching "Sri Lanka".
    name = _POSSESSIVE_RE.sub("", name)
    name = re.sub(r"[^\w\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    # A leading article is surface variation, not part of the name: "the Sri
    # Lanka Air Force" and "Sri Lanka Air Force" are one entity.
    return _LEADING_ARTICLE_RE.sub("", name).strip()


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
    "serve": ("works_for", {("PERSON", "ORG")}),
    "lead": ("leads", {("PERSON", "ORG")}),
    "head": ("leads", {("PERSON", "ORG")}),
    "command": ("leads", {("PERSON", "ORG")}),
    "found": ("founded", {("PERSON", "ORG"), ("ORG", "ORG")}),
    "establish": ("founded", {("PERSON", "ORG"), ("ORG", "ORG")}),
    "form": ("founded", {("PERSON", "ORG"), ("ORG", "ORG")}),
    "own": ("owns", {("PERSON", "ORG"), ("ORG", "ORG")}),
    "acquire": ("acquired", {("ORG", "ORG")}),
    "operate": ("operates", {("ORG", "ORG"), ("ORG", "LOCATION")}),
    "deploy": ("deployed_to", {("ORG", "LOCATION")}),
    "station": ("deployed_to", {("ORG", "LOCATION"), ("PERSON", "LOCATION")}),
    "base": ("headquartered_in", {("ORG", "LOCATION"), ("PERSON", "LOCATION")}),
    "headquarter": ("headquartered_in", {("ORG", "LOCATION")}),
    "locate": ("located_in", {("ORG", "LOCATION"), ("EVENT", "LOCATION")}),
    "meet": ("met_with", {("PERSON", "PERSON")}),
}

# Role nouns support the commonest construction in real reporting, which no
# verb trigger catches: "X is the Commander of Y" and the appositive "X,
# Commander of Y". These are genuine syntactic evidence — a role noun bound to
# an organisation by "of" — not bare co-occurrence.
LEADERSHIP_ROLES = frozenset({
    "chairman", "chief", "commander", "director", "founder", "head", "leader",
    "president", "ceo",
})
MEMBERSHIP_ROLES = frozenset({
    "employee", "member", "officer", "pilot", "representative", "spokesman",
    "spokesperson", "staff",
})

# Scraped pages carry navigation, infobox and table fragments whose parse trees
# are meaningless. A high share of non-word characters is a cheap signal that a
# "sentence" is really markup residue.
MARKUP_CHARS = set("|[]{}©®™…")

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
            root.dep_ == "pobj"
            # "agent" is the dependency spaCy gives "by" in a passive; that is
            # the doer, not the target, so it is handled separately below.
            and root.head.dep_ == "prep"
            and root.head.head.i == trigger.i
        )
        if is_direct_object or is_prepositional_object:
            found.append((span, cid, etype))
    return found


def _agent_entities(trigger: Token, ents: list[_RecognisedEntity]) -> list[_RecognisedEntity]:
    """Doer of a passive verb: the entity in "...was founded by X"."""
    found = []
    for span, cid, etype in ents:
        root = span.root
        if root.dep_ == "pobj" and root.head.dep_ == "agent" and root.head.head.i == trigger.i:
            found.append((span, cid, etype))
    return found


def _entity_by_token(ents: list[_RecognisedEntity]) -> dict[int, tuple[str, str]]:
    """Every token index covered by a recognised entity -> (id, type)."""
    index: dict[int, tuple[str, str]] = {}
    for span, cid, etype in ents:
        for token in span:
            index[token.i] = (cid, etype)
    return index


def _resolve_pronoun(doc: Doc, pronoun: Token) -> list[Token]:
    """Antecedent tokens for a pronoun, or [] if coref is unavailable."""
    chains = getattr(doc._, "coref_chains", None)
    if chains is None:
        return []
    try:
        return chains.resolve(pronoun) or []
    except Exception:  # noqa: BLE001
        return []


def _coref_entities(
    trigger: Token,
    deps: set[str],
    doc: Doc,
    by_token: dict[int, tuple[str, str]],
) -> list[tuple[str, str]]:
    """Entities reached through a pronoun occupying `deps` on the trigger.

    This is what turns "It was founded by X" into a usable subject — the
    pronoun is resolved to its antecedent, and the antecedent is matched
    against entities already recognised elsewhere in the document.
    """
    found: list[tuple[str, str]] = []
    for child in trigger.children:
        if child.dep_ not in deps or child.pos_ != "PRON":
            continue
        for referent in _resolve_pronoun(doc, child):
            hit = by_token.get(referent.i)
            if hit is not None:
                found.append(hit)
    return found


def _looks_like_markup(text: str) -> bool:
    if not text:
        return True
    markup = sum(1 for ch in text if ch in MARKUP_CHARS)
    letters = sum(1 for ch in text if ch.isalpha())
    return markup > 2 or letters < len(text) * 0.5


def _nominal_relations(
    sent: Span, ents: list[_RecognisedEntity]
) -> set[tuple[str, str, str]]:
    """Match "X is the Commander of Y" and "X, Commander of Y".

    The role noun binds a person to an organisation through "of"; the person is
    reached either through a copula ("is" -> attr) or through apposition.
    """
    triples: set[tuple[str, str, str]] = set()

    for token in sent:
        # Capitalised titles ("Commander of ...") are tagged PROPN, not NOUN,
        # so restricting to NOUN silently missed the whole pattern.
        if token.pos_ not in {"NOUN", "PROPN"}:
            continue
        lemma = token.lemma_.lower()
        if lemma in LEADERSHIP_ROLES:
            predicate = "leads"
        elif lemma in MEMBERSHIP_ROLES:
            predicate = "works_for"
        else:
            continue

        # Organisation attached to the role by "of".
        orgs = [
            (cid, etype)
            for span, cid, etype in ents
            if etype == "ORG"
            and span.root.dep_ == "pobj"
            and span.root.head.lower_ == "of"
            and span.root.head.head.i == token.i
        ]
        if not orgs:
            continue

        people: list[tuple[str, str]] = []
        for span, cid, etype in ents:
            if etype != "PERSON":
                continue
            root = span.root
            # "X, Commander of Y" — the role noun hangs off the person.
            is_appositive = token.dep_ == "appos" and token.head.i == root.i
            # "X is the Commander of Y" — role is the copula's complement and
            # the person is its subject.
            is_copular = (
                token.dep_ in {"attr", "acomp"}
                and root.head.i == token.head.i
                and root.dep_ in SUBJECT_DEPS
            )
            if is_appositive or is_copular:
                people.append((cid, etype))

        for person_id, _ in people:
            for org_id, _ in orgs:
                if person_id != org_id:
                    triples.add((person_id, predicate, org_id))

    return triples


def _relations_in_doc(doc: Doc, recognised: list[_RecognisedEntity]) -> set[tuple[str, str, str]]:
    triples: set[tuple[str, str, str, bool]] = set()
    by_token = _entity_by_token(recognised)

    for sent in doc.sents:
        ents_in_sent = [e for e in recognised if e[0].start >= sent.start and e[0].end <= sent.end]
        # A pronoun subject means the sentence can carry a relation while
        # naming only one entity, so the two-entity floor is applied after
        # coreference is taken into account rather than before.
        if _looks_like_markup(sent.text):
            continue

        for token in sent:
            trigger = RELATION_TRIGGERS.get(token.lemma_.lower())
            if trigger is None:
                continue
            # Without a POS check the lemma matches nouns too: "base" fires
            # inside the proper noun "SLAF Base Ratmalana", and "head" on "the
            # professional head of ...", neither of which is a verb relation.
            if token.pos_ not in {"VERB", "AUX"}:
                continue

            predicate, allowed_pairs = trigger

            direct_subjects = [(cid, t) for _, cid, t in _subject_entities(token, ents_in_sent)]
            direct_objects = [(cid, t) for _, cid, t in _object_entities(token, ents_in_sent)]
            coref_subjects = _coref_entities(token, SUBJECT_DEPS, doc, by_token)
            coref_objects = _coref_entities(token, OBJECT_DEPS, doc, by_token)

            # (id, type, needed_coref)
            subjects = [(cid, t, False) for cid, t in direct_subjects]
            subjects += [(cid, t, True) for cid, t in coref_subjects]
            objects = [(cid, t, False) for cid, t in direct_objects]
            objects += [(cid, t, True) for cid, t in coref_objects]

            for subj_id, subj_type, subj_coref in subjects:
                for obj_id, obj_type, obj_coref in objects:
                    if subj_id == obj_id:
                        continue
                    if (subj_type, obj_type) in allowed_pairs:
                        triples.add((subj_id, predicate, obj_id, subj_coref or obj_coref))

            # Passive with an explicit agent: in "Y was founded by X" the
            # grammatical subject is the target and the by-phrase is the doer,
            # so the triple runs the other way round.
            for _, agent_id, agent_type in _agent_entities(token, ents_in_sent):
                for target_id, target_type, target_coref in subjects:
                    if agent_id == target_id:
                        continue
                    if (agent_type, target_type) in allowed_pairs:
                        triples.add((agent_id, predicate, target_id, target_coref))

        if len(ents_in_sent) >= 2:
            triples |= {(s, p, o, False) for s, p, o in _nominal_relations(sent, ents_in_sent)}

    return triples


def _corroborated(state: dict, record_count: int) -> bool:
    """Whether an accumulated entity clears the corroboration floor."""
    if record_count < FLOOR_MIN_RECORDS:
        return True
    return (
        state["source_count"] >= MIN_SOURCES
        or state["mention_count"] >= MIN_MENTIONS_SINGLE_SOURCE
    )


def _relation_confidence(source_count: int, direct: bool = True) -> float:
    # Lower base than entity confidence: this is an unverified syntactic
    # pattern match, not a model judgement (contrast critic-agent's
    # LLM-verified contradiction check). A relation that only holds because a
    # pronoun was resolved rests on one more inference than one stated
    # outright, and is scored accordingly.
    base = 0.55 if direct else 0.45
    return round(min(base + 0.15 * (source_count - 1), 0.9), 2)


def extract_entities(bundle: EvidenceBundle) -> EntityBundle:
    """Run NER + relation extraction over every evidence record.

    Synchronous and CPU-bound — callers should run this off the event loop
    (see run_extraction in main.py).
    """
    nlp = _nlp()
    seen: dict[str, dict] = {}  # canonical_id -> accumulated entity state
    rel_seen: dict[tuple[str, str, str], dict] = {}  # (subj, predicate, obj) -> state

    prose = [
        record
        for record in bundle.records
        if record.provenance.source_type not in STRUCTURED_SOURCE_TYPES
    ]
    docs = nlp.pipe(record.content[:MAX_CHARS_PER_RECORD] for record in prose)

    for record, doc in zip(prose, docs, strict=True):
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

        for subj_id, predicate, obj_id, via_coref in _relations_in_doc(doc, recognised):
            key = (subj_id, predicate, obj_id)
            rel_state = rel_seen.setdefault(
                key, {"evidence_ids": set(), "source_count": 0, "direct": False}
            )
            if record.evidence_id not in rel_state["evidence_ids"]:
                rel_state["source_count"] += 1
            rel_state["evidence_ids"].add(record.evidence_id)
            # If any occurrence was stated outright, the relation no longer
            # rests on a coreference judgement.
            if not via_coref:
                rel_state["direct"] = True

    kept = {cid: state for cid, state in seen.items() if _corroborated(state, len(prose))}

    entities = sorted(
        (
            Entity(
                canonical_id=cid,
                name=state["name"],
                type=state["type"],
                aliases=sorted(state["aliases"]),
                confidence=_confidence(state["mention_count"], state["source_count"]),
                evidence_ids=sorted(state["evidence_ids"]),
            )
            for cid, state in kept.items()
        ),
        key=lambda e: (-e.confidence, e.name),
    )

    relationships = [
        Relationship(
            subject_id=subj_id,
            predicate=predicate,
            object_id=obj_id,
            confidence=_relation_confidence(state["source_count"], state["direct"]),
            evidence_ids=sorted(state["evidence_ids"]),
        )
        for (subj_id, predicate, obj_id), state in rel_seen.items()
        # A relationship whose endpoint was filtered out would dangle, pointing
        # at a canonical_id that is not in the bundle.
        if subj_id in kept and obj_id in kept
    ]

    return EntityBundle(
        investigation_id=bundle.investigation_id,
        entities=entities,
        relationships=relationships,
    )
