# using a 3B model may give malformed errors. If that's the case try using a larger model or switch to an API

from __future__ import annotations

import json
import re
from pathlib import Path

from defenseosint_common.contracts import InvestigationTask, TaskType

from .config import settings
from .llm import LLMError, complete
from .models import Investigation, new_id

PROMPT = (Path(__file__).parent / "prompt" / "decompose.txt").read_text(encoding="utf-8")


def _extract_json_array(text: str) -> list[dict]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise ValueError("no JSON array found in model response")

    data = json.loads(text[start : end + 1])
    if not isinstance(data, list):
        raise ValueError("model returned JSON but not an array")
    return data


def _to_tasks(raw: list[dict], inv: Investigation) -> list[InvestigationTask]:
    tasks: list[InvestigationTask] = []
    for item in raw[: settings.max_tasks_per_plan]:
        if not isinstance(item, dict) or not item.get("objective"):
            continue
        queries = [q for q in item.get("queries", []) if isinstance(q, str) and q.strip()]
        if not queries:
            queries = [item["objective"]]

        tasks.append(
            InvestigationTask(
                investigation_id=inv.investigation_id,
                task_id=new_id("task"),
                type=TaskType.COLLECT,
                objective=str(item["objective"])[:500],
                queries=queries[:3],
                entities_of_interest=[str(e) for e in item.get("entities_of_interest", []) if e][
                    :5
                ],
                priority=int(item.get("priority", 3)),
                max_sources=20,
                expected_output=str(item.get("expected_output", ""))[:300],
            )
        )
    return tasks


def fallback_plan(inv: Investigation) -> list[InvestigationTask]:
    """Deterministic plan used when the model fails twice."""
    angles = [
        ("Recent public reporting", inv.objective, 1),
        ("Background and official sources", f"{inv.objective} official statement", 2),
        ("Related organisations and people", f"{inv.objective} organisation people", 3),
    ]
    return [
        InvestigationTask(
            investigation_id=inv.investigation_id,
            task_id=new_id("task"),
            type=TaskType.COLLECT,
            objective=f"{label}: {inv.objective}",
            queries=[query],
            priority=priority,
            max_sources=20,
            expected_output="Evidence records with provenance",
        )
        for label, query, priority in angles
    ]


STRICTER = (
    "\n\nIMPORTANT: Your previous response could not be parsed. "
    "Output ONLY the JSON array, starting with [ and ending with ]. "
    "No prose, no markdown fences."
)


async def decompose(inv: Investigation) -> list[InvestigationTask]:
    prompt = PROMPT.format(objective=inv.objective, max_tasks=settings.max_tasks_per_plan)

    for attempt in (1, 2):
        try:
            text = await complete(prompt if attempt == 1 else prompt + STRICTER)
            tasks = _to_tasks(_extract_json_array(text), inv)
            if tasks:
                inv.log(
                    "planner-agent",
                    "decompose",
                    f"{len(tasks)} tasks from model (attempt {attempt})",
                )
                return tasks
            raise ValueError("model produced zero valid tasks")
        except (LLMError, ValueError, json.JSONDecodeError) as exc:
            inv.log("planner-agent", "decompose_retry", str(exc)[:200], ok=False)

    inv.log(
        "planner-agent",
        "decompose_fallback",
        "model failed twice, using deterministic plan",
        ok=False,
    )
    return fallback_plan(inv)
