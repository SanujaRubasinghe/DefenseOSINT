"""spaCy-based NER, canonicalisation, evidence linking and relation extraction."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from functools import lru_cache

import httpx
import spacy
from defenseosint_common.contracts import Entity, EntityBundle, EvidenceBundle, Relationship
from spacy.tokens import Doc, Span, Token

from .config import settings

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


# --- LLM-assisted type correction --------------------------------------------
#
# spaCy's small model reliably mistags short acronyms — verified on this
# project's own output: RCyAF and PACAF, both real air force acronyms, came
# back tagged PERSON. This pass asks a model to check a *bounded* set of
# entities the extractor is already unsure about, and only ever RETYPEs them.
#
# Scope was set by testing against real DefenseOSINT extractions, not
# guessed:
#   - qwen2.5:3b was tried first (already used elsewhere in this project) and
#     failed on exactly the cases that mattered: it dropped RCyAF and PACAF
#     instead of retyping them, across two different prompt phrasings, and
#     separately hallucinated a merge target id that did not exist in the
#     batch. qwen2.5:7b got 10/11 right on the same batch, including both
#     acronyms — hence the larger model here, and MERGE/DROP staying off the
#     table entirely rather than trusting either model with them: a wrong
#     type is recoverable (the entity is still visible under a different
#     label), a dropped entity or a merge into a hallucinated id is not.
#   - Only genuinely ambiguous entities are sent (short all-caps acronyms, or
#     ones below the confidence a second source would give them), capped at
#     ENTITY_CLEANUP_MAX_CANDIDATES — this bounds both latency (a real model
#     call, not free) and the model's opportunity to "fix" something that was
#     already right.
#   - Every result is validated against the actual request before being
#     applied: unknown ids, types outside the fixed vocabulary, and
#     unparsable output are all discarded silently. This pass can only make
#     the bundle better or leave it unchanged, never worse.

ENTITY_CLEANUP_ENABLED = os.getenv("ENTITY_CLEANUP_ENABLED", "true").lower() == "true"
ENTITY_CLEANUP_MODEL = os.getenv("ENTITY_CLEANUP_MODEL", "qwen2.5:7b")
# The planner gives the whole /a2a/extract call 180s specifically to make
# room for this pass (see EXTRACT_TIMEOUT in planner_agent/dispatch.py) —
# entity extraction returning None fails the entire investigation, not just a
# degraded field, so it's worth spending real time rather than racing a
# tight budget. This is kept a little below that ceiling so a slow model
# still fails fast enough for the "return bundle unchanged" fallback to reach
# the planner rather than the connection being cut first.
ENTITY_CLEANUP_TIMEOUT = float(os.getenv("ENTITY_CLEANUP_TIMEOUT", "150"))
# 20 is chosen for output quality, not latency: tested against qwen2.5:7b on
# this project's real 85-entity extraction, one giant batch made the model
# collapse to a single object instead of an array — the cap keeps every batch
# small enough to reliably get a complete, parseable response.
ENTITY_CLEANUP_MAX_CANDIDATES = int(os.getenv("ENTITY_CLEANUP_MAX_CANDIDATES", "20"))
ENTITY_CLEANUP_CONFIDENCE_THRESHOLD = float(os.getenv("ENTITY_CLEANUP_CONFIDENCE_THRESHOLD", "0.7"))

# All-caps acronyms (SLAF, PACAF) are the obvious case, but real military
# acronyms are often mixed-case by convention too (RCyAF = Royal Ceylon Air
# Force) — verified as a real miss when this only matched pure [A-Z]. A short
# alphabetic token with at least two capitals is acronym-shaped either way.
_SHORT_TOKEN_RE = re.compile(r"^[A-Za-z]{2,6}$")


def _looks_like_acronym(name: str) -> bool:
    name = name.strip()
    return bool(_SHORT_TOKEN_RE.match(name)) and sum(1 for c in name if c.isupper()) >= 2

_RETYPE_PROMPT = """Each line below is a named entity extracted by an automated NER system, with the type it was assigned. The types are PERSON, ORG (organisation), LOCATION, or EVENT.

For each entity, decide whether current_type is correct. If not, give the correct type from that same list. If the "entity" is not a real named thing at all (a filename, a webpage fragment, a menu caption, a generic word), still give your best-guess type rather than leaving it blank — do not invent an id, do not suggest merging it with anything.

Output ONLY a JSON array, one object per line below, using the exact ids given verbatim, in this form:
[{{"id":"<id from input>","correct":true}},{{"id":"<id from input>","correct":false,"correct_type":"ORG"}}]

Entities:
{lines}
"""


def _is_review_candidate(entity: Entity) -> bool:
    """Cheap prefilter for entities worth spending a model call on: short
    all-caps acronyms are exactly the class of token spaCy mistags most
    often, and low-confidence entities are the ones least corroborated by
    repetition across sources."""
    return _looks_like_acronym(entity.name) or (
        entity.confidence < ENTITY_CLEANUP_CONFIDENCE_THRESHOLD
    )


def _parse_json_array(raw: str) -> list | None:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Observed directly against qwen2.5:7b on this project's own data: an
        # extra closing brace between objects (`..."NONE"}},{"id":...` instead
        # of `..."NONE"},{"id":...`). Cheap to repair, not worth discarding an
        # otherwise-valid response over.
        repaired = re.sub(r"\}\}(\s*,)", r"}\1", raw)
        try:
            parsed = json.loads(repaired)
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, list) else None


async def _suggest_retypes(candidates: list[Entity]) -> dict[str, str]:
    """Ask the model which of `candidates` are mistyped. Returns
    {canonical_id: corrected_type} for entries that pass validation —
    everything else (hallucinated ids, invalid types, unparsable output) is
    dropped rather than raised, since this pass must never fail extraction."""
    known_ids = {e.canonical_id for e in candidates}
    lines = "\n".join(
        f'id={e.canonical_id} name="{e.name}" current_type={e.type}' for e in candidates
    )
    prompt = _RETYPE_PROMPT.format(lines=lines)

    try:
        async with httpx.AsyncClient(timeout=ENTITY_CLEANUP_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.ollama_url.rstrip('/')}/api/generate",
                json={
                    "model": ENTITY_CLEANUP_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0},
                },
            )
            resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("entity retype pass failed (%s): %s", ENTITY_CLEANUP_MODEL, exc)
        return {}

    parsed = _parse_json_array(resp.json().get("response", ""))
    if parsed is None:
        logger.warning("entity retype pass returned unparsable output")
        return {}

    fixes: dict[str, str] = {}
    for item in parsed:
        if not isinstance(item, dict) or item.get("correct") is not False:
            continue
        cid = item.get("id")
        new_type = item.get("correct_type")
        if cid not in known_ids or new_type not in TYPE_PREFIX:
            continue
        fixes[cid] = new_type
    return fixes


def _apply_retypes(bundle: EntityBundle, fixes: dict[str, str]) -> EntityBundle:
    """Rebuild the bundle with corrected types. Retyping changes an entity's
    canonical_id (it is a hash of type + name), so relationships that pointed
    at the old id are remapped, and the rare case of a retype landing on an
    id that already exists (e.g. two surface forms of the same acronym, one
    already correctly typed) is merged rather than left as a duplicate."""
    id_remap: dict[str, str] = {}
    merged: dict[str, Entity] = {}

    for entity in bundle.entities:
        new_type = fixes.get(entity.canonical_id)
        if new_type is None or new_type == entity.type:
            target_id, target_type = entity.canonical_id, entity.type
        else:
            target_id = canonical_id(new_type, normalize(entity.name))
            target_type = new_type
            id_remap[entity.canonical_id] = target_id

        existing = merged.get(target_id)
        if existing is None:
            merged[target_id] = Entity(
                canonical_id=target_id,
                name=entity.name,
                type=target_type,
                aliases=entity.aliases,
                confidence=entity.confidence,
                evidence_ids=entity.evidence_ids,
            )
        else:
            aliases = set(existing.aliases) | set(entity.aliases)
            if entity.name != existing.name:
                aliases.add(entity.name)
            merged[target_id] = Entity(
                canonical_id=target_id,
                name=existing.name,
                type=target_type,
                aliases=sorted(aliases),
                confidence=max(existing.confidence, entity.confidence),
                evidence_ids=sorted(set(existing.evidence_ids) | set(entity.evidence_ids)),
            )

    def remap(old_id: str) -> str:
        return id_remap.get(old_id, old_id)

    rel_map: dict[tuple[str, str, str], Relationship] = {}
    for r in bundle.relationships:
        subj_id, obj_id = remap(r.subject_id), remap(r.object_id)
        if subj_id not in merged or obj_id not in merged:
            continue
        key = (subj_id, r.predicate, obj_id)
        existing_rel = rel_map.get(key)
        if existing_rel is None:
            rel_map[key] = Relationship(
                subject_id=subj_id,
                predicate=r.predicate,
                object_id=obj_id,
                confidence=r.confidence,
                evidence_ids=r.evidence_ids,
            )
        else:
            rel_map[key] = Relationship(
                subject_id=subj_id,
                predicate=r.predicate,
                object_id=obj_id,
                confidence=max(existing_rel.confidence, r.confidence),
                evidence_ids=sorted(set(existing_rel.evidence_ids) | set(r.evidence_ids)),
            )

    return EntityBundle(
        investigation_id=bundle.investigation_id,
        entities=sorted(merged.values(), key=lambda e: (-e.confidence, e.name)),
        relationships=list(rel_map.values()),
    )


async def clean_entities(bundle: EntityBundle) -> EntityBundle:
    """Entry point used by run_extraction. Degrades to returning `bundle`
    unchanged if cleanup is disabled, there is nothing worth reviewing, or
    the model call fails for any reason."""
    if not ENTITY_CLEANUP_ENABLED or not bundle.entities:
        return bundle

    candidates = sorted(
        (e for e in bundle.entities if _is_review_candidate(e)), key=lambda e: e.confidence
    )[:ENTITY_CLEANUP_MAX_CANDIDATES]
    if not candidates:
        return bundle

    logger.info("reviewing %d entity type(s) with %s", len(candidates), ENTITY_CLEANUP_MODEL)
    fixes = await _suggest_retypes(candidates)
    if not fixes:
        return bundle

    logger.info("retyped %d entity(ies): %s", len(fixes), fixes)
    return _apply_retypes(bundle, fixes)
