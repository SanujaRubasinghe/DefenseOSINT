"""Entry point for the evaluation harness.

Usage:  python evaluation/run_eval.py [ir|nlp|e2e|all]
Writes timestamped JSON into evaluation/results/.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

RESULTS = Path(__file__).parent / "results"


def run_ir() -> dict:
    # TODO (Member 2): load datasets/ir/*.jsonl, run the Collector,
    # compute Precision@K, Recall@K, MRR.
    return {"metric": "ir", "status": "not implemented"}


def run_nlp() -> dict:
    # TODO (Member 3): load datasets/nlp/*.jsonl, run the Entity Extractor,
    # compute Precision, Recall, F1 per entity type and relation.
    return {"metric": "nlp", "status": "not implemented"}


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
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = RESULTS / f"{which}-{stamp}.json"
    path.write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    print(f"\nwritten to {path}")
