"""Tests for the LLM-assisted retype pass (extract.py's "LLM-assisted type
correction" section).

`_apply_retypes` and `_parse_json_array` are pure/sync and tested directly.
`_suggest_retypes` / `clean_entities` talk to Ollama over httpx, so those are
tested with the network call monkeypatched — this suite never needs a real
model running.
"""

import pytest
from defenseosint_common.contracts import Entity, EntityBundle, Relationship
from entity_agent import extract as ex


def _entity(cid, name, type_, confidence=0.9, aliases=None, evidence_ids=None) -> Entity:
    return Entity(
        canonical_id=cid,
        name=name,
        type=type_,
        aliases=aliases or [],
        confidence=confidence,
        evidence_ids=evidence_ids or ["ev1"],
    )


# --- _parse_json_array -------------------------------------------------------


def test_parse_json_array_accepts_well_formed_output():
    raw = '[{"id":"a","correct":true},{"id":"b","correct":false,"correct_type":"ORG"}]'
    assert ex._parse_json_array(raw) == [
        {"id": "a", "correct": True},
        {"id": "b", "correct": False, "correct_type": "ORG"},
    ]


def test_parse_json_array_repairs_doubled_brace_seen_from_qwen_7b():
    # The exact malformed shape observed from a real qwen2.5:7b response:
    # a stray extra `}` between the first and second objects.
    raw = '[{"id":"a","correct":false,"correct_type":"NONE"}},{"id":"b","correct":true}]'
    parsed = ex._parse_json_array(raw)
    assert parsed == [
        {"id": "a", "correct": False, "correct_type": "NONE"},
        {"id": "b", "correct": True},
    ]


def test_parse_json_array_returns_none_on_garbage():
    assert ex._parse_json_array("not json at all") is None


def test_parse_json_array_returns_none_for_non_list_json():
    assert ex._parse_json_array('{"id":"a"}') is None


# --- _is_review_candidate -----------------------------------------------------


def test_review_candidate_flags_short_acronyms():
    assert ex._is_review_candidate(_entity("org_1", "PACAF", "ORG", confidence=0.97))
    assert ex._is_review_candidate(_entity("org_2", "RCyAF", "ORG", confidence=0.97))


def test_review_candidate_flags_low_confidence():
    assert ex._is_review_candidate(_entity("org_3", "Some Organisation", "ORG", confidence=0.6))


def test_review_candidate_skips_confident_non_acronyms():
    assert not ex._is_review_candidate(
        _entity("org_4", "Sri Lanka Air Force", "ORG", confidence=0.97)
    )


# --- _apply_retypes -----------------------------------------------------------


def test_apply_retypes_changes_type_and_recomputes_id():
    old_id = ex.canonical_id("PERSON", ex.normalize("RCyAF"))
    new_id = ex.canonical_id("ORG", ex.normalize("RCyAF"))
    bundle = EntityBundle(
        investigation_id="inv",
        entities=[_entity(old_id, "RCyAF", "PERSON")],
        relationships=[],
    )

    result = ex._apply_retypes(bundle, {old_id: "ORG"})

    assert len(result.entities) == 1
    assert result.entities[0].canonical_id == new_id
    assert result.entities[0].type == "ORG"
    assert result.entities[0].name == "RCyAF"


def test_apply_retypes_remaps_relationship_endpoints():
    old_id = ex.canonical_id("PERSON", ex.normalize("RCyAF"))
    new_id = ex.canonical_id("ORG", ex.normalize("RCyAF"))
    other_id = ex.canonical_id("LOCATION", ex.normalize("Colombo"))

    bundle = EntityBundle(
        investigation_id="inv",
        entities=[_entity(old_id, "RCyAF", "PERSON"), _entity(other_id, "Colombo", "LOCATION")],
        relationships=[
            Relationship(
                subject_id=old_id,
                predicate="headquartered_in",
                object_id=other_id,
                confidence=0.6,
                evidence_ids=["ev1"],
            )
        ],
    )

    result = ex._apply_retypes(bundle, {old_id: "ORG"})

    assert len(result.relationships) == 1
    assert result.relationships[0].subject_id == new_id
    assert result.relationships[0].object_id == other_id


def test_apply_retypes_merges_on_id_collision_instead_of_duplicating():
    # Two surface forms that normalise to the same name, one already ORG,
    # one wrongly PERSON — retyping the second must merge into the first
    # rather than produce two entities sharing a canonical_id.
    org_id = ex.canonical_id("ORG", ex.normalize("SLAF"))
    wrong_id = ex.canonical_id("PERSON", ex.normalize("SLAF"))

    bundle = EntityBundle(
        investigation_id="inv",
        entities=[
            _entity(org_id, "SLAF", "ORG", confidence=0.9, evidence_ids=["ev1"]),
            _entity(wrong_id, "SLAF", "PERSON", confidence=0.6, evidence_ids=["ev2"]),
        ],
        relationships=[],
    )

    result = ex._apply_retypes(bundle, {wrong_id: "ORG"})

    assert len(result.entities) == 1
    merged = result.entities[0]
    assert merged.canonical_id == org_id
    assert merged.confidence == 0.9  # kept the higher of the two
    assert set(merged.evidence_ids) == {"ev1", "ev2"}  # union preserved


def test_apply_retypes_is_noop_with_no_fixes():
    bundle = EntityBundle(
        investigation_id="inv",
        entities=[_entity("org_1", "SLAF", "ORG")],
        relationships=[],
    )
    result = ex._apply_retypes(bundle, {})
    assert result.entities[0].canonical_id == "org_1"


# --- clean_entities / _suggest_retypes (network mocked) -----------------------


@pytest.mark.asyncio
async def test_clean_entities_returns_unchanged_when_disabled(monkeypatch):
    monkeypatch.setattr(ex, "ENTITY_CLEANUP_ENABLED", False)
    bundle = EntityBundle(
        investigation_id="inv", entities=[_entity("org_1", "PACAF", "ORG")], relationships=[]
    )
    assert await ex.clean_entities(bundle) is bundle


@pytest.mark.asyncio
async def test_clean_entities_returns_unchanged_when_nothing_to_review(monkeypatch):
    monkeypatch.setattr(ex, "ENTITY_CLEANUP_ENABLED", True)
    bundle = EntityBundle(
        investigation_id="inv",
        entities=[_entity("org_1", "Sri Lanka Air Force", "ORG", confidence=0.97)],
        relationships=[],
    )
    assert await ex.clean_entities(bundle) is bundle


@pytest.mark.asyncio
async def test_clean_entities_degrades_on_network_failure(monkeypatch):
    monkeypatch.setattr(ex, "ENTITY_CLEANUP_ENABLED", True)

    class RaisingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            raise ConnectionError("ollama unreachable")

    monkeypatch.setattr(ex.httpx, "AsyncClient", lambda **kw: RaisingClient())

    bundle = EntityBundle(
        investigation_id="inv",
        entities=[_entity("per_1", "PACAF", "PERSON", confidence=0.82)],
        relationships=[],
    )

    result = await ex.clean_entities(bundle)

    assert result is bundle  # degraded to no-op, extraction still succeeds


@pytest.mark.asyncio
async def test_suggest_retypes_rejects_hallucinated_id(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            # "id" is not one of the real candidates — must be discarded.
            return {"response": '[{"id":"not-a-real-id","correct":false,"correct_type":"ORG"}]'}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            return FakeResponse()

    monkeypatch.setattr(ex.httpx, "AsyncClient", lambda **kw: FakeClient())

    candidates = [_entity("per_1", "PACAF", "PERSON", confidence=0.82)]
    fixes = await ex._suggest_retypes(candidates)

    assert fixes == {}


@pytest.mark.asyncio
async def test_suggest_retypes_rejects_invalid_type(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"response": '[{"id":"per_1","correct":false,"correct_type":"SPACESHIP"}]'}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            return FakeResponse()

    monkeypatch.setattr(ex.httpx, "AsyncClient", lambda **kw: FakeClient())

    candidates = [_entity("per_1", "PACAF", "PERSON", confidence=0.82)]
    fixes = await ex._suggest_retypes(candidates)

    assert fixes == {}


@pytest.mark.asyncio
async def test_suggest_retypes_accepts_valid_correction(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"response": '[{"id":"per_1","correct":false,"correct_type":"ORG"}]'}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            return FakeResponse()

    monkeypatch.setattr(ex.httpx, "AsyncClient", lambda **kw: FakeClient())

    candidates = [_entity("per_1", "PACAF", "PERSON", confidence=0.82)]
    fixes = await ex._suggest_retypes(candidates)

    assert fixes == {"per_1": "ORG"}
