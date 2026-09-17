"""Entry point for the evaluation harness.

Usage:  python evaluation/run_eval.py [ir|nlp|e2e|all]
Writes timestamped JSON into evaluation/results/.
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
RESULTS = Path(__file__).parent / "results"


def run_ir() -> dict:
    # TODO (Member 2): load datasets/ir/*.jsonl, run the Collector,
    # compute Precision@K, Recall@K, MRR.
    return {"metric": "ir", "status": "not implemented"}


# --- NLP (entities + relations) --------------------------------------------
#
# Dataset format: evaluation/datasets/nlp/documents.jsonl, one JSON object per
# line: {"id": ..., "text": ..., "entities": [{"name", "type"}, ...],
# "relations": [{"subject", "predicate", "object"}, ...]}. "entities"/
# "relations" are the hand-labelled ground truth for that document.


def _load_jsonl(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return precision, recall, f1


def _match_entities(gold: list[dict], predicted, normalize) -> tuple[int, int, int, dict]:
    """Greedy match: each predicted entity claims at most one unmatched gold
    entity of the same type whose normalised name is among its name/aliases.
    Simple bipartite matching is enough at this dataset size — no need for
    the Hungarian algorithm.
    """
    gold_pool = [(g["type"], normalize(g["name"])) for g in gold]
    matched = [False] * len(gold_pool)
    by_type: dict[str, list[int]] = {}

    def bump(entity_type: str, slot: int) -> None:
        by_type.setdefault(entity_type, [0, 0, 0])[slot] += 1

    tp = fp = 0
    for entity in predicted:
        candidates = {normalize(entity.name)} | {normalize(a) for a in entity.aliases}
        match_index = next(
            (
                i
                for i, (g_type, g_name) in enumerate(gold_pool)
                if not matched[i] and g_type == entity.type and g_name in candidates
            ),
            None,
        )
        if match_index is None:
            fp += 1
            bump(entity.type, 1)
        else:
            matched[match_index] = True
            tp += 1
            bump(entity.type, 0)

    fn = 0
    for matched_flag, (g_type, _) in zip(matched, gold_pool, strict=True):
        if not matched_flag:
            fn += 1
            bump(g_type, 2)

    return tp, fp, fn, by_type


def _match_relations(gold: list[dict], predicted, name_by_id, normalize) -> tuple[int, int, int]:
    gold_pool = [
        (normalize(g["subject"]), g["predicate"], normalize(g["object"])) for g in gold
    ]
    matched = [False] * len(gold_pool)

    tp = fp = 0
    for rel in predicted:
        triple = (
            name_by_id.get(rel.subject_id, ""),
            rel.predicate,
            name_by_id.get(rel.object_id, ""),
        )
        match_index = next(
            (i for i, g in enumerate(gold_pool) if not matched[i] and g == triple), None
        )
        if match_index is None:
            fp += 1
        else:
            matched[match_index] = True
            tp += 1

    fn = matched.count(False)
    return tp, fp, fn


def _bundle_from_doc(doc: dict):
    from defenseosint_common.contracts import EvidenceBundle, EvidenceRecord, Provenance

    return EvidenceBundle(
        investigation_id="eval",
        task_id=doc["id"],
        records=[
            EvidenceRecord(
                evidence_id=doc["id"],
                content=doc["text"],
                provenance=Provenance(
                    source_name="eval-dataset",
                    source_type="web",
                    retrieved_at=datetime.now(UTC),
                    collector="eval",
                ),
            )
        ],
    )


def run_nlp() -> dict:
    dataset_path = ROOT / "evaluation" / "datasets" / "nlp" / "documents.jsonl"
    if not dataset_path.exists() or dataset_path.stat().st_size == 0:
        return {"metric": "nlp", "status": "no dataset found", "path": str(dataset_path)}

    for path in (ROOT / "shared", ROOT / "services" / "entity-agent"):
        if str(path) not in sys.path:
            sys.path.insert(0, str(path))
    from entity_agent.extract import extract_entities, normalize

    documents = _load_jsonl(dataset_path)

    entity_totals = [0, 0, 0]  # tp, fp, fn
    relation_totals = [0, 0, 0]
    entity_by_type: dict[str, list[int]] = {}

    for doc in documents:
        result = extract_entities(_bundle_from_doc(doc))

        tp, fp, fn, by_type = _match_entities(doc.get("entities", []), result.entities, normalize)
        entity_totals[0] += tp
        entity_totals[1] += fp
        entity_totals[2] += fn
        for entity_type, counts in by_type.items():
            acc = entity_by_type.setdefault(entity_type, [0, 0, 0])
            for i in range(3):
                acc[i] += counts[i]

        name_by_id = {e.canonical_id: normalize(e.name) for e in result.entities}
        r_tp, r_fp, r_fn = _match_relations(
            doc.get("relations", []), result.relationships, name_by_id, normalize
        )
        relation_totals[0] += r_tp
        relation_totals[1] += r_fp
        relation_totals[2] += r_fn

    entity_p, entity_r, entity_f1 = _prf(*entity_totals)
    relation_p, relation_r, relation_f1 = _prf(*relation_totals)

    return {
        "metric": "nlp",
        "documents": len(documents),
        "entities": {
            "precision": round(entity_p, 3),
            "recall": round(entity_r, 3),
            "f1": round(entity_f1, 3),
            "tp": entity_totals[0],
            "fp": entity_totals[1],
            "fn": entity_totals[2],
        },
        "entities_by_type": {
            entity_type: dict(zip(("precision", "recall", "f1"), (round(v, 3) for v in _prf(*c)), strict=True))
            for entity_type, c in entity_by_type.items()
        },
        "relations": {
            "precision": round(relation_p, 3),
            "recall": round(relation_r, 3),
            "f1": round(relation_f1, 3),
            "tp": relation_totals[0],
            "fp": relation_totals[1],
            "fn": relation_totals[2],
        },
    }


def run_e2e() -> dict:
    # TODO (Member 1): run full investigations, record latency, agent turns,
    # evidence-support rate.
    return {"metric": "e2e", "status": "not implemented"}


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    runners = {"ir": run_ir, "nlp": run_nlp, "e2e": run_e2e}
    selected = runners if which == "all" else {which: runners[which]}

    out = {name: fn() for name, fn in selected.items()}
    RESULTS.mkdir(exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    path = RESULTS / f"{which}-{stamp}.json"
    path.write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    print(f"\nwritten to {path}")
