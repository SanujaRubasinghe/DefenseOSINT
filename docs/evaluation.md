# Evaluation

Build the datasets in the first weeks, not the last one.

| Dataset | Path | Target size | Metrics | Owner |
|---|---|---|---|---|
| IR relevance | `evaluation/datasets/ir/` | 30–50 queries with labelled relevant sources | Precision@K, Recall@K, MRR | Member 2 |
| NER + relations | `evaluation/datasets/nlp/` | 20–30 annotated documents | Precision, Recall, F1 | Member 3 |
| End-to-end | `evaluation/datasets/e2e/` | 5–8 investigation scenarios | evidence-support rate, contradiction detection, latency, agent turns | Member 1 |

Store examples as JSONL with a stable `id`. Run `python evaluation/run_eval.py`;
results land in `evaluation/results/` (git-ignored). Copy the numbers you keep
into this file with the date and commit hash — a metric without its commit is
not evidence.
