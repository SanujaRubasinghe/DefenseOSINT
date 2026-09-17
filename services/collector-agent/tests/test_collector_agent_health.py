# services/collector-agent/tests/test_collector_agent_health.py
from datetime import UTC, datetime

import pytest
from collector_agent.main import _relevance_score, run_collection
from defenseosint_common.contracts import EvidenceBundle, InvestigationTask


@pytest.mark.asyncio
async def test_run_collection_returns_valid_bundle(monkeypatch):
    fake_page = {
        "title": "Test Article",
        "content": "Sri Lanka defense ministry announced new policy today.",
        "source_url": "https://example.com/article",
        "retrieved_at": datetime.now(UTC),
        "query": "Sri Lanka defense ministry",
    }

    async def fake_with_page(*args, **kwargs):
        return [fake_page]

    async def fake_empty(*args, **kwargs):
        return []

    async def fake_no_image(*args, **kwargs):
        return None

    # Mock EVERY external source main.py calls — no real network calls in tests.
    monkeypatch.setattr("collector_agent.main.search_and_fetch", fake_with_page)
    monkeypatch.setattr("collector_agent.main.search_news", fake_empty)
    monkeypatch.setattr("collector_agent.main.search_reports", fake_empty)
    monkeypatch.setattr("collector_agent.main.search_conflict_events", fake_empty)
    monkeypatch.setattr("collector_agent.main.search_tavily", fake_empty)
    monkeypatch.setattr("collector_agent.main.search_infrastructure", fake_empty)
    monkeypatch.setattr("collector_agent.main.search_aircraft", fake_empty)
    monkeypatch.setattr("collector_agent.main.search_satellites", fake_empty)
    monkeypatch.setattr("collector_agent.main.get_entity_image", fake_no_image)

    task = InvestigationTask(
        investigation_id="inv-test",
        task_id="task-test",
        type="collect",
        objective="test objective",
        queries=["Sri Lanka defense ministry"],
    )

    bundle = await run_collection(task)

    assert isinstance(bundle, EvidenceBundle)
    assert len(bundle.records) == 1
    record = bundle.records[0]
    assert record.provenance.source_url == "https://example.com/article"
    assert record.provenance.collector == "collector-agent:web"
    assert 0.0 <= record.relevance_score <= 1.0


def test_relevance_score_basic():
    assert _relevance_score("sri lanka defense", "Sri Lanka Defense Ministry news today") == 1.0
    partial = _relevance_score("sri lanka navy", "Sri Lanka Army news today")
    assert 0 < partial < 1.0
    assert _relevance_score("unrelated topic", "completely different content") == 0.0
