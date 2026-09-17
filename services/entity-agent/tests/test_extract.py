from datetime import UTC, datetime

from defenseosint_common.contracts import EvidenceBundle, EvidenceRecord, Provenance
from entity_agent.extract import canonical_id, extract_entities, normalize


def _record(evidence_id: str, content: str) -> EvidenceRecord:
    return EvidenceRecord(
        evidence_id=evidence_id,
        title="test record",
        content=content,
        provenance=Provenance(
            source_name="test",
            source_type="web",
            source_url="https://example.com",
            retrieved_at=datetime.now(UTC),
            collector="test",
        ),
    )


def test_normalize_folds_case_punctuation_and_whitespace():
    assert normalize("Organization  X,") == normalize("organization x")


def test_canonical_id_is_deterministic_and_type_scoped():
    a = canonical_id("ORG", normalize("Organization X"))
    b = canonical_id("ORG", normalize("organization x."))
    assert a == b

    # Same normalised text but a different type must not collide.
    different_type = canonical_id("PERSON", normalize("Organization X"))
    assert different_type != a


def test_extract_entities_returns_valid_bundle_with_real_entities():
    # Names picked to be ones en_core_web_sm actually recognises reliably in
    # both sentence positions used below. Placeholder-style names like "Jane
    # Doe" or "Organization X" are exactly the kind of generic, non-real-world
    # strings the small model is weakest on (verified against this model) —
    # a real page's text won't have that problem, but a synthetic test fixture
    # can accidentally hit it, so this picks names that behave like normal text.
    bundle = EvidenceBundle(
        investigation_id="inv-1",
        task_id="merged",
        records=[
            _record("ev-1", "Jane Smith works for Acme Corporation, which is based in Riga."),
            _record("ev-2", "Acme Corporation announced a new office in Riga last year."),
        ],
        queries_executed=["acme corporation"],
    )

    result = extract_entities(bundle)

    assert result.investigation_id == "inv-1"
    assert result.entities, "expected at least one real entity, not an empty list"

    by_name = {e.name: e for e in result.entities}
    assert "Jane Smith" in by_name
    assert "Acme Corporation" in by_name

    org = by_name["Acme Corporation"]
    assert org.type == "ORG"
    # Mentioned in both records, so both evidence ids should be linked.
    assert set(org.evidence_ids) == {"ev-1", "ev-2"}
    assert 0.0 <= org.confidence <= 1.0

    person = by_name["Jane Smith"]
    assert person.type == "PERSON"
    assert person.evidence_ids == ["ev-1"]

    # Every entity must be traceable back to real evidence in the bundle.
    known_ids = {r.evidence_id for r in bundle.records}
    for entity in result.entities:
        assert set(entity.evidence_ids) <= known_ids

    # ev-1's sentence structure ("X works for Y, which is based in Z") should
    # yield both relations, including resolving the relative clause's implicit
    # subject ("which") back to "Acme Corporation" rather than dropping it.
    loc = by_name["Riga"]
    by_predicate = {r.predicate: r for r in result.relationships}
    assert by_predicate["works_for"].subject_id == person.canonical_id
    assert by_predicate["works_for"].object_id == org.canonical_id
    assert by_predicate["headquartered_in"].subject_id == org.canonical_id
    assert by_predicate["headquartered_in"].object_id == loc.canonical_id
    for relationship in result.relationships:
        assert relationship.evidence_ids, "a relation must cite the evidence it came from"
        assert 0.0 <= relationship.confidence <= 1.0


def test_extract_entities_does_not_infer_relations_from_mere_co_occurrence():
    # Jane Smith and Riga appear in the same sentence, but "visited" is not a
    # recognised trigger — co-occurrence alone must not produce a relation.
    bundle = EvidenceBundle(
        investigation_id="inv-2",
        task_id="merged",
        records=[_record("ev-1", "Jane Smith visited Riga for a conference.")],
        queries_executed=["jane smith riga"],
    )

    result = extract_entities(bundle)

    assert result.relationships == []
